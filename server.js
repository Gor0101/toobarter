'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const db = require('./db');
const MATCH = require('./public/js/match.js');

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- секрет для JWT: из env, иначе генерируем один раз и храним в data/ ---
const SECRET_FILE = path.join(__dirname, 'data', '.jwt-secret');
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  if (fs.existsSync(SECRET_FILE)) SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  else {
    SECRET = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE, SECRET, { mode: 0o600 });
  }
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const CURRENCIES = ['USD', 'AMD', 'EUR', 'RUB'];
const KINDS = ['car', 'realty'];
const REALTY_TYPES = ['land', 'house', 'apartment', 'commercial'];
const DIRECTIONS = ['none', 'in', 'out'];

// монетизация: платное поднятие объявления в топ на N дней.
// Оплата подтверждается вручную из админки — своего платёжного шлюза нет.
const PROMOTE_PRICE = Math.max(0, Math.round(Number(process.env.PROMOTE_PRICE)) || 1000);
const PROMOTE_CURRENCY = CURRENCIES.includes(process.env.PROMOTE_CURRENCY) ? process.env.PROMOTE_CURRENCY : 'AMD';
const PROMOTE_DAYS = Math.max(1, Math.round(Number(process.env.PROMOTE_DAYS)) || 7);
const PAYMENT_INSTRUCTIONS = process.env.PAYMENT_INSTRUCTIONS || '';
const PAYMENT_METHODS = ['idram', 'telcell', 'card', 'cash', 'other'];

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
);
function isAdmin(user) { return !!user && ADMIN_EMAILS.has(String(user.email || '').toLowerCase()); }
function adminAuth(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });
  next();
}

function sign(user) {
  return jwt.sign({ uid: user.id }, SECRET, { expiresIn: '30d' });
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, name: u.name, phone: u.phone, city: u.city, lang: u.lang, email: u.email,
    created_at: u.created_at, is_admin: isAdmin(u),
  };
}

function readToken(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(h.slice(7), SECRET);
  } catch {
    return null;
  }
}

// прикрепляет req.user, если токен валиден (не обязательный)
function softAuth(req, _res, next) {
  const payload = readToken(req);
  if (payload) req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid) || null;
  next();
}

function auth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  if (req.user.banned) return res.status(403).json({ error: 'banned' });
  next();
}

app.use(softAuth);

const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const int = (v) => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};
const str = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : null);
const oneOf = (v, list, fallback = null) => (list.includes(v) ? v : fallback);

function wrap(fn) {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'server_error', detail: String(e.message || e) });
    }
  };
}

/* ------------------------------------------------------------------ */
/* загрузка фотографий                                                 */
/* ------------------------------------------------------------------ */

// расширение на диске берём из провалидированного mimetype, а не из
// originalname — иначе можно прислать mimetype: image/jpeg с filename: x.svg
// и получить исполняемый SVG, отданный /uploads как image/svg+xml
const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = MIME_EXT[file.mimetype] || '.jpg';
    cb(null, Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => cb(null, Object.prototype.hasOwnProperty.call(MIME_EXT, file.mimetype)),
});

/* ------------------------------------------------------------------ */
/* auth                                                                */
/* ------------------------------------------------------------------ */

app.post('/api/auth/register', wrap((req, res) => {
  const name = str(req.body.name, 80);
  const email = (str(req.body.email, 120) || '').toLowerCase();
  const password = String(req.body.password || '');
  const phone = str(req.body.phone, 40);
  const city = str(req.body.city, 60);
  const lang = oneOf(req.body.lang, ['hy', 'ru', 'en'], 'ru');

  if (!name || name.length < 2) return res.status(400).json({ error: 'bad_name' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'bad_email' });
  if (password.length < 6) return res.status(400).json({ error: 'weak_password' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'email_taken' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (name, email, phone, password_hash, city, lang) VALUES (?,?,?,?,?,?)')
    .run(name, email, phone, hash, city, lang);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ token: sign(user), user: publicUser(user) });
}));

app.post('/api/auth/login', wrap((req, res) => {
  const email = (str(req.body.email, 120) || '').toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'bad_credentials' });
  }
  if (user.banned) return res.status(403).json({ error: 'banned' });
  res.json({ token: sign(user), user: publicUser(user) });
}));

app.get('/api/me', auth, wrap((req, res) => res.json({ user: publicUser(req.user) })));

app.patch('/api/me', auth, wrap((req, res) => {
  const name = str(req.body.name, 80) || req.user.name;
  const phone = str(req.body.phone, 40);
  const city = str(req.body.city, 60);
  const lang = oneOf(req.body.lang, ['hy', 'ru', 'en'], req.user.lang);
  db.prepare('UPDATE users SET name=?, phone=?, city=?, lang=? WHERE id=?').run(name, phone, city, lang, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)) });
}));

app.post('/api/me/password', auth, wrap((req, res) => {
  const current = String(req.body.current || '');
  const next = String(req.body.next || '');
  if (!bcrypt.compareSync(current, req.user.password_hash)) return res.status(400).json({ error: 'bad_credentials' });
  if (next.length < 6) return res.status(400).json({ error: 'weak_password' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(next, 10), req.user.id);
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ */
/* объявления                                                          */
/* ------------------------------------------------------------------ */

const WISH_COLS = ['kind', 'make', 'model', 'year_min', 'year_max', 'mileage_max', 'transmission', 'fuel',
  'body', 'city', 'area_min', 'land_min', 'rooms_min', 'price_min', 'price_max', 'price_currency',
  'pay_direction', 'pay_min', 'pay_currency', 'note', 'sort'];

const WISH_KINDS = ['any', 'car', 'land', 'house', 'apartment', 'commercial'];

/* Разбор пожеланий из формы: приходят JSON-строкой */
function parseWishes(raw) {
  let arr = raw;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { arr = []; } }
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 8).map((w, i) => ({
    kind: oneOf(w.kind, WISH_KINDS, 'any'),
    make: str(w.make, 40),
    model: str(w.model, 60),
    year_min: int(w.year_min),
    year_max: int(w.year_max),
    mileage_max: int(w.mileage_max),
    transmission: str(w.transmission, 30),
    fuel: str(w.fuel, 30),
    body: str(w.body, 30),
    city: str(w.city, 60),
    area_min: num(w.area_min),
    land_min: num(w.land_min),
    rooms_min: int(w.rooms_min),
    price_min: int(w.price_min),
    price_max: int(w.price_max),
    price_currency: oneOf(w.price_currency, CURRENCIES, 'USD'),
    pay_direction: oneOf(w.pay_direction, DIRECTIONS, 'none'),
    pay_min: Math.max(0, int(w.pay_min) || 0),
    pay_currency: oneOf(w.pay_currency, CURRENCIES, 'USD'),
    note: str(w.note, 300),
    sort: i,
  }));
}

function saveWishes(listingId, wishes) {
  db.prepare('DELETE FROM wishes WHERE listing_id = ?').run(listingId);
  const ins = db.prepare(`INSERT INTO wishes (listing_id, ${WISH_COLS.join(',')})
    VALUES (?, ${WISH_COLS.map(() => '?').join(',')})`);
  for (const w of wishes) ins.run(listingId, ...WISH_COLS.map((c) => w[c]));
}

function getWishes(listingId) {
  return db.prepare('SELECT * FROM wishes WHERE listing_id = ? ORDER BY sort, id').all(listingId);
}

/* Категории, которые владелец готов рассматривать — для фильтров ленты */
function wantedKindsFromWishes(wishes) {
  const set = new Set();
  for (const w of wishes) if (w.kind && w.kind !== 'any') set.add(w.kind);
  return JSON.stringify([...set]);
}

function attachPhotos(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const ph = db
    .prepare(`SELECT listing_id, file FROM photos WHERE listing_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort, id`)
    .all(...ids);
  const map = new Map();
  for (const p of ph) {
    if (!map.has(p.listing_id)) map.set(p.listing_id, []);
    map.get(p.listing_id).push('/uploads/' + p.file);
  }
  const wishRows = db
    .prepare(`SELECT * FROM wishes WHERE listing_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort, id`)
    .all(...ids);
  const wmap = new Map();
  for (const w of wishRows) {
    if (!wmap.has(w.listing_id)) wmap.set(w.listing_id, []);
    wmap.get(w.listing_id).push(w);
  }
  for (const r of rows) {
    r.photos = map.get(r.id) || [];
    r.wishes = wmap.get(r.id) || [];
    r.wanted_kinds = JSON.parse(r.wanted_kinds || '[]');
  }
  return rows;
}

app.get('/api/listings', wrap((req, res) => {
  const q = req.query;
  const where = ["l.status = 'active'"];
  const args = [];

  if (KINDS.includes(q.kind)) { where.push('l.kind = ?'); args.push(q.kind); }
  if (REALTY_TYPES.includes(q.realty_type)) { where.push('l.realty_type = ?'); args.push(q.realty_type); }
  if (q.city) { where.push('l.city = ?'); args.push(q.city); }
  if (q.make) { where.push('l.make = ?'); args.push(q.make); }
  if (q.model) { where.push('l.model LIKE ?'); args.push('%' + q.model + '%'); }
  if (DIRECTIONS.includes(q.pay_direction)) { where.push('l.pay_direction = ?'); args.push(q.pay_direction); }
  if (q.user_id) { where.push('l.user_id = ?'); args.push(int(q.user_id)); }
  if (q.wanted) { where.push('l.wanted_kinds LIKE ?'); args.push('%"' + String(q.wanted).replace(/[^a-z]/g, '') + '"%'); }
  if (int(q.price_min) !== null) { where.push('l.price >= ?'); args.push(int(q.price_min)); }
  if (int(q.price_max) !== null) { where.push('l.price <= ?'); args.push(int(q.price_max)); }
  if (int(q.year_min) !== null) { where.push('l.year >= ?'); args.push(int(q.year_min)); }
  if (int(q.year_max) !== null) { where.push('l.year <= ?'); args.push(int(q.year_max)); }
  if (q.q) {
    where.push('(l.title LIKE ? OR l.description LIKE ? OR l.make LIKE ? OR l.model LIKE ? OR l.address LIKE ?)');
    const like = '%' + String(q.q).slice(0, 60) + '%';
    args.push(like, like, like, like, like);
  }

  const sortMap = {
    new: 'is_top DESC, l.created_at DESC, l.id DESC',
    old: 'is_top DESC, l.created_at ASC',
    price_asc: 'is_top DESC, l.price IS NULL, l.price ASC',
    price_desc: 'is_top DESC, l.price DESC',
    popular: 'is_top DESC, l.views DESC',
  };
  const order = sortMap[q.sort] || sortMap.new;
  const IS_TOP_SQL = "(l.top_until IS NOT NULL AND l.top_until > datetime('now')) AS is_top";

  const limit = Math.min(48, Math.max(1, int(q.limit) || 24));
  const page = Math.max(1, int(q.page) || 1);

  const sqlWhere = where.join(' AND ');

  /* Режим «что подойдёт под мой объект»: считаем совпадение по пожеланиям,
     поэтому выбираем всё, фильтруем в памяти и только потом режем на страницы. */
  const mineId = int(q.matches);
  if (mineId) {
    const mine = db.prepare('SELECT * FROM listings WHERE id = ?').get(mineId);
    if (!mine || !req.user || mine.user_id !== req.user.id) return res.status(400).json({ error: 'bad_matches' });
    const all = db
      .prepare(`SELECT l.*, u.name owner_name, ${IS_TOP_SQL} FROM listings l JOIN users u ON u.id = l.user_id
                WHERE ${sqlWhere} AND l.user_id <> ? ORDER BY ${order}`)
      .all(...args, req.user.id);
    attachPhotos(all);
    const fit = all.filter((r) => MATCH.matchListing(r.wishes, mine, { ignorePay: true }).ok && r.wishes.length);
    const start = (page - 1) * limit;
    return res.json({
      total: fit.length, page, pages: Math.max(1, Math.ceil(fit.length / limit)),
      items: fit.slice(start, start + limit), matches: mineId,
    });
  }

  const total = db.prepare(`SELECT COUNT(*) c FROM listings l WHERE ${sqlWhere}`).get(...args).c;
  const rows = db
    .prepare(`SELECT l.*, u.name owner_name, ${IS_TOP_SQL} FROM listings l JOIN users u ON u.id = l.user_id
              WHERE ${sqlWhere} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...args, limit, (page - 1) * limit);

  res.json({ total, page, pages: Math.max(1, Math.ceil(total / limit)), items: attachPhotos(rows) });
}));

app.get('/api/listings/:id', wrap((req, res) => {
  const row = db
    .prepare(`SELECT l.*, u.name owner_name, u.city owner_city, u.created_at owner_since,
                     (l.top_until IS NOT NULL AND l.top_until > datetime('now')) AS is_top
              FROM listings l JOIN users u ON u.id = l.user_id WHERE l.id = ?`)
    .get(int(req.params.id));
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.status !== 'active' && (!req.user || req.user.id !== row.user_id)) return res.status(404).json({ error: 'not_found' });

  // телефон владельца — только ему самому; остальным он не отдаётся API вовсе
  if (req.user && req.user.id === row.user_id) {
    row.owner_phone = db.prepare('SELECT phone FROM users WHERE id = ?').get(row.user_id).phone;
  }

  if (!req.user || req.user.id !== row.user_id) db.prepare('UPDATE listings SET views = views + 1 WHERE id = ?').run(row.id);
  attachPhotos([row]);

  let myOffer = null;
  if (req.user) {
    myOffer = db
      .prepare('SELECT * FROM offers WHERE listing_id = ? AND from_user_id = ? ORDER BY id DESC LIMIT 1')
      .get(row.id, req.user.id) || null;
  }
  const isFavorite = req.user
    ? !!db.prepare('SELECT 1 FROM favorites WHERE user_id=? AND listing_id=?').get(req.user.id, row.id)
    : false;

  res.json({ listing: row, myOffer, isFavorite, isOwner: !!req.user && req.user.id === row.user_id });
}));

function listingFields(body) {
  const kind = oneOf(body.kind, KINDS);
  if (!kind) throw Object.assign(new Error('bad_kind'), { status: 400 });

  const f = {
    kind,
    title: str(body.title, 120),
    description: str(body.description, 4000),
    city: str(body.city, 60),
    price: body.price !== undefined && body.price !== '' ? Math.max(0, int(body.price) || 0) : null,
    currency: oneOf(body.currency, CURRENCIES, 'USD'),
    pay_direction: oneOf(body.pay_direction, DIRECTIONS, 'none'),
    pay_amount: Math.max(0, int(body.pay_amount) || 0),
    pay_currency: oneOf(body.pay_currency, CURRENCIES, 'USD'),
    wanted_text: str(body.wanted_text, 500),
    make: null, model: null, year: null, mileage: null, body_type: null,
    transmission: null, fuel: null, engine: null, drive: null, color: null, steering: null,
    realty_type: null, area: null, land_area: null, rooms: null, floor: null, floors: null,
    condition: null, address: null,
  };

  let wanted = body.wanted_kinds;
  if (typeof wanted === 'string') { try { wanted = JSON.parse(wanted); } catch { wanted = []; } }
  f.wanted_kinds = JSON.stringify(
    (Array.isArray(wanted) ? wanted : []).filter((k) => ['car', 'land', 'house', 'apartment', 'commercial'].includes(k))
  );

  if (kind === 'car') {
    f.make = str(body.make, 40);
    f.model = str(body.model, 60);
    f.year = int(body.year);
    f.mileage = int(body.mileage);
    f.body_type = str(body.body, 30);
    f.transmission = str(body.transmission, 30);
    f.fuel = str(body.fuel, 30);
    f.engine = num(body.engine);
    f.drive = str(body.drive, 20);
    f.color = str(body.color, 30);
    f.steering = oneOf(body.steering, ['left', 'right'], 'left');
    if (!f.make || !f.model || !f.year) throw Object.assign(new Error('car_fields_required'), { status: 400 });
    if (!f.title) f.title = [f.make, f.model, f.year].filter(Boolean).join(' ');
  } else {
    f.realty_type = oneOf(body.realty_type, REALTY_TYPES);
    f.area = num(body.area);
    f.land_area = num(body.land_area);
    f.rooms = int(body.rooms);
    f.floor = int(body.floor);
    f.floors = int(body.floors);
    f.condition = str(body.condition, 40);
    f.address = str(body.address, 200);
    if (!f.realty_type) throw Object.assign(new Error('realty_type_required'), { status: 400 });
    if (!f.title) f.title = [f.realty_type, f.area ? f.area + ' m²' : null, f.city].filter(Boolean).join(' · ');
  }
  if (!f.title) throw Object.assign(new Error('title_required'), { status: 400 });
  return f;
}

const LISTING_COLS = `kind,title,description,city,price,currency,pay_direction,pay_amount,pay_currency,
  wanted_kinds,wanted_text,make,model,year,mileage,body,transmission,fuel,engine,drive,color,steering,
  realty_type,area,land_area,rooms,floor,floors,condition,address`;

function listingValues(f) {
  return [f.kind, f.title, f.description, f.city, f.price, f.currency, f.pay_direction, f.pay_amount,
    f.pay_currency, f.wanted_kinds, f.wanted_text, f.make, f.model, f.year, f.mileage, f.body_type,
    f.transmission, f.fuel, f.engine, f.drive, f.color, f.steering, f.realty_type, f.area, f.land_area,
    f.rooms, f.floor, f.floors, f.condition, f.address];
}

app.post('/api/listings', auth, upload.array('photos', 12), wrap((req, res) => {
  let f;
  try {
    f = listingFields(req.body);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  const wishes = parseWishes(req.body.wishes);
  f.wanted_kinds = wantedKindsFromWishes(wishes);

  const cols = LISTING_COLS.split(',').map((c) => c.trim());
  const info = db
    .prepare(`INSERT INTO listings (user_id, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})`)
    .run(req.user.id, ...listingValues(f));

  const id = info.lastInsertRowid;
  saveWishes(id, wishes);
  const ins = db.prepare('INSERT INTO photos (listing_id, file, sort) VALUES (?,?,?)');
  (req.files || []).forEach((file, i) => ins.run(id, file.filename, i));

  // тем, у кого сохранён подходящий поиск, уходит оповещение
  const notified = notifyAlerts(db.prepare('SELECT * FROM listings WHERE id = ?').get(id));
  res.json({ id, notified });
}));

app.patch('/api/listings/:id', auth, upload.array('photos', 12), wrap((req, res) => {
  const id = int(req.params.id);
  const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });

  let f;
  try {
    f = listingFields({ ...row, body: row.body, ...req.body });
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  if (req.body.wishes !== undefined) {
    const wishes = parseWishes(req.body.wishes);
    f.wanted_kinds = wantedKindsFromWishes(wishes);
    saveWishes(id, wishes);
  }

  const cols = LISTING_COLS.split(',').map((c) => c.trim());
  db.prepare(`UPDATE listings SET ${cols.map((c) => c + '=?').join(',')}, updated_at = datetime('now') WHERE id = ?`)
    .run(...listingValues(f), id);

  // удаление отмеченных фото
  let keep = req.body.keep_photos;
  if (typeof keep === 'string') { try { keep = JSON.parse(keep); } catch { keep = null; } }
  if (Array.isArray(keep)) {
    const files = keep.map((p) => String(p).replace('/uploads/', ''));
    const existing = db.prepare('SELECT * FROM photos WHERE listing_id = ?').all(id);
    const del = db.prepare('DELETE FROM photos WHERE id = ?');
    for (const p of existing) {
      if (!files.includes(p.file)) {
        del.run(p.id);
        fs.promises.unlink(path.join(UPLOAD_DIR, p.file)).catch(() => {});
      }
    }
  }
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort), -1) m FROM photos WHERE listing_id = ?').get(id).m;
  const kept = db.prepare('SELECT COUNT(*) c FROM photos WHERE listing_id = ?').get(id).c;
  const room = Math.max(0, 12 - kept);
  const files = (req.files || []).slice(0, room);
  (req.files || []).slice(room).forEach((file) => fs.promises.unlink(path.join(UPLOAD_DIR, file.filename)).catch(() => {}));
  const ins = db.prepare('INSERT INTO photos (listing_id, file, sort) VALUES (?,?,?)');
  files.forEach((file, i) => ins.run(id, file.filename, maxSort + 1 + i));

  res.json({ ok: true, id });
}));

app.post('/api/listings/:id/status', auth, wrap((req, res) => {
  const id = int(req.params.id);
  const status = oneOf(req.body.status, ['active', 'hidden', 'done']);
  const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (!status) return res.status(400).json({ error: 'bad_status' });
  db.prepare(`UPDATE listings SET status=?, updated_at=datetime('now') WHERE id=?`).run(status, id);
  if (status === 'active' && row.status !== 'active') {
    notifyAlerts(db.prepare('SELECT * FROM listings WHERE id = ?').get(id));
  }
  res.json({ ok: true });
}));

app.delete('/api/listings/:id', auth, wrap((req, res) => {
  const id = int(req.params.id);
  const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  for (const p of db.prepare('SELECT file FROM photos WHERE listing_id=?').all(id)) {
    fs.promises.unlink(path.join(UPLOAD_DIR, p.file)).catch(() => {});
  }
  db.prepare('DELETE FROM listings WHERE id = ?').run(id);
  res.json({ ok: true });
}));

app.get('/api/my/listings', auth, wrap((req, res) => {
  const rows = db
    .prepare(`SELECT *, (top_until IS NOT NULL AND top_until > datetime('now')) AS is_top
              FROM listings WHERE user_id = ? ORDER BY created_at DESC`)
    .all(req.user.id);
  attachPhotos(rows);
  const counts = db
    .prepare(`SELECT listing_id, COUNT(*) c FROM offers WHERE status='pending' GROUP BY listing_id`)
    .all();
  const map = new Map(counts.map((c) => [c.listing_id, c.c]));
  rows.forEach((r) => (r.pending_offers = map.get(r.id) || 0));
  res.json({ items: rows });
}));

/* --- избранное --- */
app.post('/api/listings/:id/favorite', auth, wrap((req, res) => {
  const id = int(req.params.id);
  const has = db.prepare('SELECT 1 FROM favorites WHERE user_id=? AND listing_id=?').get(req.user.id, id);
  if (has) db.prepare('DELETE FROM favorites WHERE user_id=? AND listing_id=?').run(req.user.id, id);
  else db.prepare('INSERT INTO favorites (user_id, listing_id) VALUES (?,?)').run(req.user.id, id);
  res.json({ isFavorite: !has });
}));

app.get('/api/my/favorites', auth, wrap((req, res) => {
  const rows = db
    .prepare(`SELECT l.*, u.name owner_name, (l.top_until IS NOT NULL AND l.top_until > datetime('now')) AS is_top
              FROM favorites f JOIN listings l ON l.id=f.listing_id
              JOIN users u ON u.id=l.user_id WHERE f.user_id=? ORDER BY f.created_at DESC`)
    .all(req.user.id);
  res.json({ items: attachPhotos(rows) });
}));

/* ------------------------------------------------------------------ */
/* предложения обмена                                                  */
/* ------------------------------------------------------------------ */

app.post('/api/offers', auth, wrap((req, res) => {
  const listingId = int(req.body.listing_id);
  const target = db.prepare("SELECT * FROM listings WHERE id=? AND status='active'").get(listingId);
  if (!target) return res.status(404).json({ error: 'listing_not_found' });
  if (target.user_id === req.user.id) return res.status(400).json({ error: 'own_listing' });

  const offeredId = int(req.body.offered_listing_id);
  if (!offeredId) return res.status(400).json({ error: 'offered_listing_required' });
  const offered = db.prepare('SELECT * FROM listings WHERE id = ?').get(offeredId);
  if (!offered || offered.user_id !== req.user.id) return res.status(400).json({ error: 'bad_offered_listing' });
  if (offered.status !== 'active') return res.status(400).json({ error: 'offered_listing_inactive' });
  const dup = db
    .prepare("SELECT 1 FROM offers WHERE listing_id=? AND from_user_id=? AND status IN ('pending','accepted')")
    .get(listingId, req.user.id);
  if (dup) return res.status(409).json({ error: 'offer_exists' });

  const deal = {
    pay_direction: oneOf(req.body.pay_direction, DIRECTIONS, 'none'),
    pay_amount: Math.max(0, int(req.body.pay_amount) || 0),
    pay_currency: oneOf(req.body.pay_currency, CURRENCIES, 'USD'),
  };
  const m = MATCH.matchListing(getWishes(target.id), offered, deal, target);

  const info = db
    .prepare(`INSERT INTO offers (listing_id, offered_listing_id, from_user_id, to_user_id, message,
              pay_direction, pay_amount, pay_currency, matched, wish_index) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(listingId, offered.id, req.user.id, target.user_id, str(req.body.message, 1000),
      deal.pay_direction, deal.pay_amount, deal.pay_currency, m.ok ? 1 : 0, m.free ? null : m.index);
  res.json({ id: info.lastInsertRowid, matched: m.ok });
}));

const OFFER_SELECT = `
  SELECT o.*,
         tl.title target_title, tl.kind target_kind, tl.price target_price, tl.currency target_currency,
         ol.title offered_title, ol.kind offered_kind, ol.price offered_price, ol.currency offered_currency,
         uf.name from_name, ut.name to_name,
         (SELECT file FROM photos WHERE listing_id = tl.id ORDER BY sort, id LIMIT 1) target_photo,
         (SELECT file FROM photos WHERE listing_id = ol.id ORDER BY sort, id LIMIT 1) offered_photo,
         (SELECT id FROM conversations WHERE offer_id = o.id) conversation_id
  FROM offers o
  JOIN listings tl ON tl.id = o.listing_id
  LEFT JOIN listings ol ON ol.id = o.offered_listing_id
  JOIN users uf ON uf.id = o.from_user_id
  JOIN users ut ON ut.id = o.to_user_id`;

function normalizeOffer(o) {
  if (o.target_photo) o.target_photo = '/uploads/' + o.target_photo;
  if (o.offered_photo) o.offered_photo = '/uploads/' + o.offered_photo;
  return o;
}

app.get('/api/offers', auth, wrap((req, res) => {
  const box = req.query.box === 'out' ? 'out' : 'in';
  const col = box === 'in' ? 'o.to_user_id' : 'o.from_user_id';
  const rows = db.prepare(`${OFFER_SELECT} WHERE ${col} = ? ORDER BY o.created_at DESC`).all(req.user.id);
  if (box === 'in') db.prepare('UPDATE offers SET seen=1 WHERE to_user_id=?').run(req.user.id);
  res.json({ items: rows.map(normalizeOffer) });
}));

app.post('/api/offers/:id/:action', auth, wrap((req, res) => {
  const id = int(req.params.id);
  const action = req.params.action;
  const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(id);
  if (!offer) return res.status(404).json({ error: 'not_found' });

  if (action === 'cancel') {
    if (offer.from_user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
    if (offer.status !== 'pending') return res.status(400).json({ error: 'not_pending' });
    db.prepare("UPDATE offers SET status='cancelled' WHERE id=?").run(id);
    return res.json({ ok: true });
  }

  if (offer.to_user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  if (offer.status !== 'pending') return res.status(400).json({ error: 'not_pending' });

  if (action === 'reject') {
    db.prepare("UPDATE offers SET status='rejected' WHERE id=?").run(id);
    return res.json({ ok: true });
  }
  if (action === 'accept') {
    const busy = db.prepare("SELECT 1 FROM listings WHERE id IN (?,?) AND status <> 'active'")
      .get(offer.listing_id, offer.offered_listing_id);
    if (busy) return res.status(409).json({ error: 'listing_no_longer_available' });
    // приняли одно предложение — оба объекта сделки выбывают из оборота:
    // помечаем их «в сделке» и отклоняем остальные предложения по ним,
    // иначе один и тот же автомобиль можно было отдать нескольким людям сразу
    const acceptTx = db.transaction(() => {
      db.prepare("UPDATE offers SET status='accepted' WHERE id=?").run(id);
      db.prepare("UPDATE listings SET status='done' WHERE id IN (?,?) AND status='active'")
        .run(offer.listing_id, offer.offered_listing_id);
      db.prepare(`UPDATE offers SET status='rejected'
                  WHERE id <> ? AND status='pending'
                    AND (listing_id IN (?,?) OR offered_listing_id IN (?,?))`)
        .run(id, offer.listing_id, offer.offered_listing_id, offer.listing_id, offer.offered_listing_id);
      return db.prepare('INSERT INTO conversations (offer_id, user_a, user_b) VALUES (?,?,?)')
        .run(id, offer.to_user_id, offer.from_user_id);
    });
    const info = acceptTx();
    return res.json({ ok: true, conversation_id: info.lastInsertRowid });
  }
  res.status(400).json({ error: 'bad_action' });
}));

/* ------------------------------------------------------------------ */
/* чат (доступен только после принятого предложения)                   */
/* ------------------------------------------------------------------ */

function getConversation(id, userId) {
  const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!c) return null;
  if (c.user_a !== userId && c.user_b !== userId) return null;
  return c;
}

app.get('/api/conversations', auth, wrap((req, res) => {
  const rows = db
    .prepare(`
      SELECT c.*, o.listing_id, l.title listing_title,
             (SELECT file FROM photos WHERE listing_id = l.id ORDER BY sort, id LIMIT 1) listing_photo,
             CASE WHEN c.user_a = @me THEN c.user_b ELSE c.user_a END peer_id,
             (SELECT name FROM users WHERE id = CASE WHEN c.user_a = @me THEN c.user_b ELSE c.user_a END) peer_name,
             (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) last_body,
             (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) last_at,
             (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id <> @me AND read_at IS NULL) unread
      FROM conversations c
      JOIN offers o ON o.id = c.offer_id
      JOIN listings l ON l.id = o.listing_id
      WHERE c.user_a = @me OR c.user_b = @me
      ORDER BY COALESCE(last_at, c.created_at) DESC`)
    .all({ me: req.user.id });
  rows.forEach((r) => { if (r.listing_photo) r.listing_photo = '/uploads/' + r.listing_photo; });
  res.json({ items: rows });
}));

app.get('/api/conversations/:id/messages', auth, wrap((req, res) => {
  const c = getConversation(int(req.params.id), req.user.id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const after = int(req.query.after) || 0;
  const rows = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id')
    .all(c.id, after);
  db.prepare("UPDATE messages SET read_at = datetime('now') WHERE conversation_id=? AND sender_id<>? AND read_at IS NULL")
    .run(c.id, req.user.id);
  const peerId = c.user_a === req.user.id ? c.user_b : c.user_a;
  const peer = publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(peerId));
  const offer = normalizeOffer(db.prepare(`${OFFER_SELECT} WHERE o.id = ?`).get(c.offer_id));
  res.json({ items: rows, peer, offer, me: req.user.id });
}));

app.post('/api/conversations/:id/messages', auth, wrap((req, res) => {
  const c = getConversation(int(req.params.id), req.user.id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const body = str(req.body.body, 2000);
  if (!body) return res.status(400).json({ error: 'empty_message' });
  const info = db
    .prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)')
    .run(c.id, req.user.id, body);
  res.json({ message: db.prepare('SELECT * FROM messages WHERE id=?').get(info.lastInsertRowid) });
}));

/* ------------------------------------------------------------------ */
/* сохранённые поиски и оповещения                                     */
/* ------------------------------------------------------------------ */

/* web-push необязателен: без него остаются оповещения внутри приложения */
let webpush = null;
try { webpush = require('web-push'); } catch { webpush = null; }

let VAPID = null;
if (webpush) {
  const vfile = path.join(__dirname, 'data', 'vapid.json');
  try {
    VAPID = fs.existsSync(vfile)
      ? JSON.parse(fs.readFileSync(vfile, 'utf8'))
      : (() => { const k = webpush.generateVAPIDKeys(); fs.writeFileSync(vfile, JSON.stringify(k)); return k; })();
    webpush.setVapidDetails(process.env.PUSH_CONTACT || 'mailto:admin@toobarter.local',
      VAPID.publicKey, VAPID.privateKey);
  } catch (e) {
    console.warn('push отключён:', e.message);
    webpush = null;
  }
}

const ALERT_KINDS = ['any', 'car', 'land', 'house', 'apartment', 'commercial'];
const ALERT_COLS = ['kind', 'make', 'model', 'year_min', 'year_max', 'mileage_max', 'transmission',
  'fuel', 'body', 'city', 'area_min', 'land_min', 'rooms_min', 'price_min', 'price_max', 'price_currency'];

function parseAlert(b) {
  return {
    kind: oneOf(b.kind, ALERT_KINDS, 'any'),
    make: str(b.make, 40) || null,
    model: str(b.model, 60) || null,
    year_min: int(b.year_min),
    year_max: int(b.year_max),
    mileage_max: int(b.mileage_max),
    transmission: str(b.transmission, 30) || null,
    fuel: str(b.fuel, 30) || null,
    body: str(b.body, 30) || null,
    city: str(b.city, 60) || null,
    area_min: num(b.area_min),
    land_min: num(b.land_min),
    rooms_min: int(b.rooms_min),
    price_min: int(b.price_min),
    price_max: int(b.price_max),
    price_currency: oneOf(b.price_currency, CURRENCIES, 'USD'),
  };
}

function sendPush(userId, listing) {
  if (!webpush) return;
  const subs = db.prepare('SELECT * FROM push_subs WHERE user_id = ?').all(userId);
  if (!subs.length) return;
  const payload = JSON.stringify({
    title: 'TooBarter',
    body: listing.title,
    url: '/#/l/' + listing.id,
    tag: 'listing-' + listing.id,
  });
  for (const sub of subs) {
    webpush
      .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
      .catch((err) => {
        // подписка протухла — убираем, чтобы не копить мусор
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          db.prepare('DELETE FROM push_subs WHERE id = ?').run(sub.id);
        }
      });
  }
}

/* Новое объявление опубликовано — ищем, кому оно подходит */
function notifyAlerts(listing) {
  if (!listing || listing.status !== 'active') return 0;
  const alerts = db.prepare('SELECT * FROM alerts WHERE active = 1 AND user_id <> ?').all(listing.user_id);
  const ins = db.prepare('INSERT OR IGNORE INTO notifications (user_id, alert_id, listing_id) VALUES (?,?,?)');
  const touched = new Set();
  for (const a of alerts) {
    if (!MATCH.checkWish(a, listing, { ignorePay: true }).ok) continue;
    if (ins.run(a.user_id, a.id, listing.id).changes) touched.add(a.user_id);
  }
  for (const uid of touched) sendPush(uid, listing);
  return touched.size;
}

/* Объявления, которые подходят под поиск прямо сейчас */
function alertMatches(alert, viewerId, limit) {
  const rows = db
    .prepare("SELECT * FROM listings WHERE status = 'active' AND user_id <> ? ORDER BY created_at DESC LIMIT 300")
    .all(viewerId);
  const hits = rows.filter((l) => MATCH.checkWish(alert, l, { ignorePay: true }).ok);
  return attachPhotos(hits.slice(0, limit || 12));
}

app.get('/api/alerts', auth, wrap((req, res) => {
  const items = db.prepare('SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  const counts = db
    .prepare('SELECT alert_id, COUNT(*) c FROM notifications WHERE user_id = ? AND seen = 0 GROUP BY alert_id')
    .all(req.user.id);
  const map = new Map(counts.map((c) => [c.alert_id, c.c]));
  for (const a of items) {
    a.unseen = map.get(a.id) || 0;
    a.matches = alertMatches(a, req.user.id, 60).length;
  }
  res.json({ items, pushEnabled: !!webpush });
}));

app.post('/api/alerts', auth, wrap((req, res) => {
  const a = parseAlert(req.body);
  const count = db.prepare('SELECT COUNT(*) c FROM alerts WHERE user_id = ?').get(req.user.id).c;
  if (count >= 20) return res.status(400).json({ error: 'too_many_alerts' });
  const info = db
    .prepare(`INSERT INTO alerts (user_id, ${ALERT_COLS.join(',')})
              VALUES (?, ${ALERT_COLS.map(() => '?').join(',')})`)
    .run(req.user.id, ...ALERT_COLS.map((c) => a[c]));
  const created = db.prepare('SELECT * FROM alerts WHERE id = ?').get(info.lastInsertRowid);
  res.json({ id: created.id, matches: alertMatches(created, req.user.id, 12) });
}));

app.patch('/api/alerts/:id', auth, wrap((req, res) => {
  const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(int(req.params.id));
  if (!row || row.user_id !== req.user.id) return res.status(404).json({ error: 'not_found' });
  if (req.body.active !== undefined) {
    db.prepare('UPDATE alerts SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, row.id);
  } else {
    const a = parseAlert({ ...row, ...req.body });
    db.prepare(`UPDATE alerts SET ${ALERT_COLS.map((c) => c + '=?').join(',')} WHERE id = ?`)
      .run(...ALERT_COLS.map((c) => a[c]), row.id);
  }
  res.json({ ok: true });
}));

app.delete('/api/alerts/:id', auth, wrap((req, res) => {
  const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(int(req.params.id));
  if (!row || row.user_id !== req.user.id) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM alerts WHERE id = ?').run(row.id);
  res.json({ ok: true });
}));

app.get('/api/alerts/:id/matches', auth, wrap((req, res) => {
  const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(int(req.params.id));
  if (!row || row.user_id !== req.user.id) return res.status(404).json({ error: 'not_found' });
  res.json({ items: alertMatches(row, req.user.id, 24) });
}));

app.get('/api/notifications', auth, wrap((req, res) => {
  const rows = db
    .prepare(`SELECT n.*, l.title, l.kind, l.realty_type, l.price, l.currency, l.city, l.status,
                     (SELECT file FROM photos WHERE listing_id = l.id ORDER BY sort, id LIMIT 1) photo
              FROM notifications n JOIN listings l ON l.id = n.listing_id
              WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT 60`)
    .all(req.user.id);
  for (const r of rows) if (r.photo) r.photo = '/uploads/' + r.photo;
  res.json({ items: rows });
}));

app.post('/api/notifications/read', auth, wrap((req, res) => {
  db.prepare('UPDATE notifications SET seen = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
}));

app.post('/api/notifications/:id/read', auth, wrap((req, res) => {
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(int(req.params.id));
  if (!row || row.user_id !== req.user.id) return res.status(404).json({ error: 'not_found' });
  db.prepare('UPDATE notifications SET seen = 1 WHERE id = ?').run(row.id);
  res.json({ ok: true });
}));

app.get('/api/push/key', wrap((_req, res) => {
  res.json({ key: VAPID ? VAPID.publicKey : null });
}));

app.post('/api/push/subscribe', auth, wrap((req, res) => {
  const sub = req.body || {};
  const keys = sub.keys || {};
  if (!sub.endpoint || !keys.p256dh || !keys.auth) return res.status(400).json({ error: 'bad_subscription' });
  db.prepare(`INSERT INTO push_subs (user_id, endpoint, p256dh, auth) VALUES (?,?,?,?)
              ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id`)
    .run(req.user.id, str(sub.endpoint, 500), str(keys.p256dh, 200), str(keys.auth, 100));
  res.json({ ok: true });
}));

app.post('/api/push/unsubscribe', auth, wrap((req, res) => {
  if (req.body && req.body.endpoint) db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(req.body.endpoint);
  else db.prepare('DELETE FROM push_subs WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ */
/* монетизация: платное поднятие объявления в топ                      */
/* ------------------------------------------------------------------ */

app.get('/api/promote/info', wrap((_req, res) => {
  res.json({ price: PROMOTE_PRICE, currency: PROMOTE_CURRENCY, days: PROMOTE_DAYS, instructions: PAYMENT_INSTRUCTIONS });
}));

app.post('/api/listings/:id/promote', auth, wrap((req, res) => {
  const id = int(req.params.id);
  const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  const pending = db.prepare("SELECT 1 FROM payments WHERE listing_id = ? AND status = 'pending'").get(id);
  if (pending) return res.status(409).json({ error: 'payment_pending' });

  const method = oneOf(req.body.method, PAYMENT_METHODS, 'other');
  const reference = str(req.body.reference, 200);
  const info = db
    .prepare(`INSERT INTO payments (user_id, listing_id, amount, currency, days, method, reference)
              VALUES (?,?,?,?,?,?,?)`)
    .run(req.user.id, id, PROMOTE_PRICE, PROMOTE_CURRENCY, PROMOTE_DAYS, method, reference);
  res.json({ id: info.lastInsertRowid, status: 'pending' });
}));

app.get('/api/my/payments', auth, wrap((req, res) => {
  const items = db
    .prepare(`SELECT p.*, l.title listing_title FROM payments p
              JOIN listings l ON l.id = p.listing_id WHERE p.user_id = ? ORDER BY p.created_at DESC`)
    .all(req.user.id);
  res.json({ items });
}));

/* ------------------------------------------------------------------ */
/* админ-панель                                                        */
/* ------------------------------------------------------------------ */

app.use('/api/admin', auth, adminAuth);

app.get('/api/admin/summary', wrap((_req, res) => {
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const listingsActive = db.prepare("SELECT COUNT(*) c FROM listings WHERE status = 'active'").get().c;
  const listingsTotal = db.prepare('SELECT COUNT(*) c FROM listings').get().c;
  const topActive = db
    .prepare("SELECT COUNT(*) c FROM listings WHERE top_until IS NOT NULL AND top_until > datetime('now')").get().c;
  const pendingPayments = db.prepare("SELECT COUNT(*) c FROM payments WHERE status = 'pending'").get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status = 'confirmed'").get().s;
  res.json({ users, listingsActive, listingsTotal, topActive, pendingPayments, revenue, currency: PROMOTE_CURRENCY });
}));

app.get('/api/admin/payments', wrap((req, res) => {
  const status = oneOf(req.query.status, ['pending', 'confirmed', 'rejected']);
  const where = status ? 'WHERE p.status = ?' : '';
  const args = status ? [status] : [];
  const items = db
    .prepare(`SELECT p.*, l.title listing_title, l.status listing_status, u.name user_name, u.email user_email
              FROM payments p JOIN listings l ON l.id = p.listing_id JOIN users u ON u.id = p.user_id
              ${where} ORDER BY p.created_at DESC LIMIT 200`)
    .all(...args);
  res.json({ items });
}));

app.post('/api/admin/payments/:id/confirm', wrap((req, res) => {
  const id = int(req.params.id);
  const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  if (p.status !== 'pending') return res.status(400).json({ error: 'not_pending' });

  const tx = db.transaction(() => {
    db.prepare("UPDATE payments SET status='confirmed', confirmed_by=?, resolved_at=datetime('now') WHERE id=?")
      .run(req.user.id, id);
    // если объявление уже в топе — дни добавляются к остатку, а не перезаписывают его
    db.prepare(`UPDATE listings SET top_until = datetime(
                  CASE WHEN top_until IS NOT NULL AND top_until > datetime('now') THEN top_until ELSE datetime('now') END,
                  '+' || ? || ' days') WHERE id = ?`)
      .run(p.days, p.listing_id);
  });
  tx();
  res.json({ ok: true });
}));

app.post('/api/admin/payments/:id/reject', wrap((req, res) => {
  const id = int(req.params.id);
  const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  if (p.status !== 'pending') return res.status(400).json({ error: 'not_pending' });
  const note = str(req.body.note, 300);
  db.prepare("UPDATE payments SET status='rejected', confirmed_by=?, admin_note=?, resolved_at=datetime('now') WHERE id=?")
    .run(req.user.id, note, id);
  res.json({ ok: true });
}));

app.get('/api/admin/listings', wrap((req, res) => {
  const status = oneOf(req.query.status, ['active', 'hidden', 'done']);
  const where = status ? 'WHERE l.status = ?' : '';
  const args = status ? [status] : [];
  const rows = db
    .prepare(`SELECT l.*, u.name owner_name, u.email owner_email,
                     (l.top_until IS NOT NULL AND l.top_until > datetime('now')) AS is_top
              FROM listings l JOIN users u ON u.id = l.user_id ${where}
              ORDER BY l.created_at DESC LIMIT 300`)
    .all(...args);
  res.json({ items: attachPhotos(rows) });
}));

app.post('/api/admin/listings/:id/status', wrap((req, res) => {
  const id = int(req.params.id);
  const status = oneOf(req.body.status, ['active', 'hidden', 'done']);
  if (!status) return res.status(400).json({ error: 'bad_status' });
  db.prepare("UPDATE listings SET status=?, updated_at=datetime('now') WHERE id=?").run(status, id);
  res.json({ ok: true });
}));

app.post('/api/admin/listings/:id/untop', wrap((req, res) => {
  db.prepare('UPDATE listings SET top_until = NULL WHERE id = ?').run(int(req.params.id));
  res.json({ ok: true });
}));

app.delete('/api/admin/listings/:id', wrap((req, res) => {
  const id = int(req.params.id);
  for (const p of db.prepare('SELECT file FROM photos WHERE listing_id=?').all(id)) {
    fs.promises.unlink(path.join(UPLOAD_DIR, p.file)).catch(() => {});
  }
  db.prepare('DELETE FROM listings WHERE id = ?').run(id);
  res.json({ ok: true });
}));

app.get('/api/admin/users', wrap((_req, res) => {
  const rows = db
    .prepare(`SELECT u.id, u.name, u.email, u.phone, u.city, u.banned, u.created_at,
                     (SELECT COUNT(*) FROM listings WHERE user_id = u.id) listings_count
              FROM users u ORDER BY u.created_at DESC LIMIT 300`)
    .all();
  res.json({ items: rows.map((u) => ({ ...u, is_admin: ADMIN_EMAILS.has(String(u.email).toLowerCase()) })) });
}));

app.post('/api/admin/users/:id/ban', wrap((req, res) => {
  const id = int(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'cannot_ban_self' });
  db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(req.body.banned ? 1 : 0, id);
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ */
/* счётчики для шапки                                                  */
/* ------------------------------------------------------------------ */

app.get('/api/summary', auth, wrap((req, res) => {
  const offers = db
    .prepare("SELECT COUNT(*) c FROM offers WHERE to_user_id=? AND status='pending' AND seen=0")
    .get(req.user.id).c;
  const pending = db
    .prepare("SELECT COUNT(*) c FROM offers WHERE to_user_id=? AND status='pending'")
    .get(req.user.id).c;
  const messages = db
    .prepare(`SELECT COUNT(*) c FROM messages m JOIN conversations c ON c.id = m.conversation_id
              WHERE (c.user_a=@me OR c.user_b=@me) AND m.sender_id<>@me AND m.read_at IS NULL`)
    .get({ me: req.user.id }).c;
  const matches = db
    .prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND seen = 0')
    .get(req.user.id).c;
  res.json({ newOffers: offers, pendingOffers: pending, unreadMessages: messages, newMatches: matches });
}));

/* ------------------------------------------------------------------ */

app.use('/api', (_req, res) => res.status(404).json({ error: 'unknown_endpoint' }));

// SPA: любой другой GET отдаёт index.html
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'file_too_large' });
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

app.listen(PORT, () => {
  console.log(`\n  TooBarter запущен\n`);
  console.log(`  На этом компьютере:  http://localhost:${PORT}`);
  try {
    const nets = require('os').networkInterfaces();
    const lan = [];
    for (const list of Object.values(nets)) {
      for (const net of list || []) {
        if (net.family === 'IPv4' && !net.internal) lan.push(net.address);
      }
    }
    for (const ip of lan) console.log(`  С телефона в той же сети:  http://${ip}:${PORT}`);
    if (lan.length) {
      console.log(`\n  Установка на домашний экран требует HTTPS.`);
      console.log(`  Быстрый способ получить его: npx localtunnel --port ${PORT}\n`);
    }
  } catch { /* не критично */ }
});
