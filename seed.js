'use strict';
/* Демо-данные: node seed.js
   Создаёт пользователей, объявления, предложение обмена и чат. */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const bcrypt = require('bcryptjs');
const db = require('./db');
const MATCH = require('./public/js/match.js');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* Генерируем простую PNG-заглушку с диагональным градиентом */
function makePng(file, rgb) {
  const W = 800, H = 600;
  const rows = [];
  for (let y = 0; y < H; y++) {
    const line = Buffer.alloc(W * 3 + 1);
    line[0] = 0;
    for (let x = 0; x < W; x++) {
      const k = 0.55 + 0.45 * ((x / W) * 0.6 + (1 - y / H) * 0.4);
      line[1 + x * 3] = Math.min(255, rgb[0] * k);
      line[2 + x * 3] = Math.min(255, rgb[1] * k);
      line[3 + x * 3] = Math.min(255, rgb[2] * k);
    }
    rows.push(line);
  }
  const chunk = (type, data) => {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(Buffer.concat([t, data])) : crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(path.join(UPLOAD_DIR, file), png);
  return file;
}

let table = null;
function crc32(buf) {
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const users = [
  ['Ani Grigoryan', 'ani@demo.am', 'yerevan', 'hy', '+374 91 111111'],
  ['Davit Sargsyan', 'davit@demo.am', 'abovyan', 'ru', '+374 91 222222'],
  ['Mher Hakobyan', 'mher@demo.am', 'gyumri', 'en', '+374 91 333333'],
  ['Lilit Petrosyan', 'lilit@demo.am', 'vanadzor', 'ru', '+374 91 444444'],
];

const userIds = users.map(([name, email, city, lang, phone]) => {
  const exists = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (exists) return exists.id;
  return db.prepare('INSERT INTO users (name,email,phone,password_hash,city,lang) VALUES (?,?,?,?,?,?)')
    .run(name, email, phone, bcrypt.hashSync('demo1234', 10), city, lang).lastInsertRowid;
});

const listings = [
  { u: 0, kind: 'car', make: 'Toyota', model: 'Camry', year: 2018, mileage: 96000, body: 'sedan',
    transmission: 'automatic', fuel: 'petrol', engine: 2.5, drive: 'fwd', color: 'white', city: 'yerevan',
    price: 17500, pay_direction: 'in', pay_amount: 3000, wanted: ['apartment', 'house'],
    wishes: [{ kind: 'apartment', city: 'yerevan', area_min: 60, rooms_min: 2, pay_direction: 'in', pay_min: 5000, note: 'Կենտրոն կամ Արաբկիր' },
             { kind: 'house', city: 'abovyan', land_min: 3 }],
    wanted_text: 'Բնակարան Կենտրոնում կամ Արաբկիրում',
    desc: 'Одна хозяйка, все ТО у дилера, растаможена. Обменяю на квартиру с доплатой в мою сторону.',
    rgb: [70, 96, 150] },
  { u: 1, kind: 'realty', realty_type: 'apartment', area: 78, rooms: 3, floor: 4, floors: 9,
    condition: 'new_repair', city: 'yerevan', price: 95000, pay_direction: 'out', pay_amount: 4000,
    wishes: [{ kind: 'car', make: 'Mercedes-Benz', model: 'A-Class', year_min: 2020, mileage_max: 80000, pay_direction: 'out', pay_min: 4000, note: 'Только из Европы, без аварий' },
             { kind: 'car', make: 'Toyota', year_min: 2016, mileage_max: 120000 }],
    wanted: ['car', 'house'], address: 'Մաշտոցի պող. 15',
    wanted_text: 'Внедорожник от 2016 года или дом в Абовяне',
    desc: 'Новый ремонт, мебель остаётся. Тихий двор, рядом школа и метро.', rgb: [150, 110, 80] },
  { u: 2, kind: 'car', make: 'Mercedes-Benz', model: 'E-Class', year: 2014, mileage: 178000, body: 'sedan',
    transmission: 'automatic', fuel: 'diesel', engine: 2.1, drive: 'rwd', color: 'black', city: 'gyumri',
    price: 15000, pay_direction: 'none', pay_amount: 0, wanted: ['car'],
    wishes: [{ kind: 'car', body: 'suv', year_min: 2013, note: 'SUV only, swap value to value' }],
    wanted_text: 'Swap for an SUV of similar value',
    desc: 'Well kept, full service history, new tyres. Looking for an SUV swap.', rgb: [45, 52, 68] },
  { u: 3, kind: 'realty', realty_type: 'house', area: 210, land_area: 6, rooms: 5, floors: 2,
    condition: 'good', city: 'vanadzor', price: 78000, pay_direction: 'in', pay_amount: 8000,
    wishes: [{ kind: 'apartment', city: 'yerevan', rooms_min: 2, pay_direction: 'in', pay_min: 8000 }],
    wanted: ['apartment', 'car'], address: 'Տարոն-3',
    wanted_text: 'Квартира в Ереване + доплата', desc: 'Двухэтажный дом, свой сад, гараж на две машины.',
    rgb: [90, 130, 95] },
  { u: 0, kind: 'realty', realty_type: 'land', land_area: 12, city: 'masis', price: 22000,
    wishes: [{ kind: 'car', body: 'pickup' }, { kind: 'car', body: 'minivan', year_min: 2010 }],
    pay_direction: 'none', pay_amount: 0, wanted: ['car'], address: 'Երևան-Արտաշատ մայրուղի',
    wanted_text: 'Пикап или минивэн', desc: 'Ровный участок у трассы, все коммуникации рядом.',
    rgb: [140, 140, 100] },
  { u: 1, kind: 'car', make: 'Nissan', model: 'X-Trail', year: 2016, mileage: 132000, body: 'crossover',
    transmission: 'variator', fuel: 'petrol', engine: 2.0, drive: 'awd', color: 'silver', city: 'abovyan',
    price: 14000, pay_direction: 'out', pay_amount: 2000, wanted: ['apartment', 'commercial'],
    wishes: [{ kind: 'apartment', city: 'yerevan', area_min: 40, pay_direction: 'out', pay_min: 2000 },
             { kind: 'commercial', area_min: 30 }],
    wanted_text: 'Однокомнатная квартира или небольшое коммерческое помещение',
    desc: 'Полный привод, зимняя резина в комплекте.', rgb: [110, 115, 125] },
  { u: 2, kind: 'realty', realty_type: 'commercial', area: 46, floor: 1, floors: 5, condition: 'good',
    city: 'gyumri', price: 41000, pay_direction: 'none', pay_amount: 0, wanted: ['apartment', 'car'],
    wishes: [{ kind: 'apartment', city: 'yerevan' }],
    address: 'Ryzhkov str. 4', wanted_text: 'Apartment in Yerevan',
    desc: 'Street-facing shop space, separate entrance, currently rented.', rgb: [120, 85, 120] },
  { u: 3, kind: 'car', make: 'Lexus', model: 'RX', year: 2012, mileage: 205000, body: 'suv',
    transmission: 'automatic', fuel: 'petrol', engine: 3.5, drive: 'awd', color: 'grey', city: 'yerevan',
    price: 19000, pay_direction: 'in', pay_amount: 1500, wanted: ['land', 'house'],
    wishes: [{ kind: 'land', city: 'dilijan', land_min: 5, note: 'Возле леса, с коммуникациями' },
             { kind: 'apartment', city: 'yerevan', pay_direction: 'in', pay_min: 5000 }],
    wanted_text: 'Հողատարածք Երևանի մոտ', desc: 'Полностью обслужен, кожаный салон, панорама.',
    rgb: [80, 80, 88] },
];

const cols = `user_id,kind,title,description,city,price,currency,pay_direction,pay_amount,pay_currency,
  wanted_kinds,wanted_text,make,model,year,mileage,body,transmission,fuel,engine,drive,color,steering,
  realty_type,area,land_area,rooms,floor,floors,condition,address`.split(',').map((c) => c.trim());

const insert = db.prepare(`INSERT INTO listings (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
const insPhoto = db.prepare('INSERT INTO photos (listing_id, file, sort) VALUES (?,?,?)');

const created = [];
listings.forEach((l, idx) => {
  const title = l.kind === 'car'
    ? `${l.make} ${l.model} ${l.year}`
    : `${{ land: 'Հողատարածք / Участок', house: 'Дом / House', apartment: 'Квартира / Բնակարան', commercial: 'Коммерческая / Commercial' }[l.realty_type]}, ${l.area || l.land_area} ${l.area ? 'm²' : 'ар'}`;
  const id = insert.run(
    userIds[l.u], l.kind, title, l.desc, l.city, l.price, 'USD', l.pay_direction, l.pay_amount, 'USD',
    JSON.stringify([...new Set((l.wishes || []).map((w) => w.kind).filter((k) => k && k !== 'any'))]), l.wanted_text, l.make || null, l.model || null, l.year || null,
    l.mileage || null, l.body || null, l.transmission || null, l.fuel || null, l.engine || null,
    l.drive || null, l.color || null, l.kind === 'car' ? 'left' : null, l.realty_type || null,
    l.area || null, l.land_area || null, l.rooms || null, l.floor || null, l.floors || null,
    l.condition || null, l.address || null
  ).lastInsertRowid;
  created.push(id);
  const WCOLS = ['kind','make','model','year_min','year_max','mileage_max','transmission','fuel','body','city',
    'area_min','land_min','rooms_min','price_min','price_max','price_currency','pay_direction','pay_min','pay_currency','note','sort'];
  const insWish = db.prepare(`INSERT INTO wishes (listing_id, ${WCOLS.join(',')})
    VALUES (?, ${WCOLS.map(() => '?').join(',')})`);
  (l.wishes || []).forEach((w, wi) => insWish.run(id, ...WCOLS.map((c) => {
    if (c === 'sort') return wi;
    if (c === 'kind') return w.kind || 'any';
    if (c === 'pay_direction') return w.pay_direction || 'none';
    if (c === 'pay_min') return w.pay_min || 0;
    if (c === 'pay_currency') return w.pay_currency || 'USD';
    if (c === 'price_currency') return w.price_currency || 'USD';
    return w[c] === undefined ? null : w[c];
  })));
  for (let i = 0; i < 2; i++) {
    const file = makePng(`demo-${id}-${i}.png`, l.rgb.map((c) => Math.min(255, c + i * 26)));
    insPhoto.run(id, file, i);
  }
});

/* Одно принятое предложение с перепиской — чтобы чат было видно сразу */
const wishesOf = (id) => db.prepare('SELECT * FROM wishes WHERE listing_id=? ORDER BY sort').all(id);
const listingOf = (id) => db.prepare('SELECT * FROM listings WHERE id=?').get(id);
const matchOf = (targetId, offeredId, deal) => MATCH.matchListing(wishesOf(targetId), listingOf(offeredId), deal);

const deal1 = { pay_direction: 'out', pay_amount: 5000, pay_currency: 'USD' };
const m1 = matchOf(created[0], created[1], deal1);
const offerId = db.prepare(`INSERT INTO offers (listing_id, offered_listing_id, from_user_id, to_user_id,
  message, pay_direction, pay_amount, pay_currency, status, matched, wish_index)
  VALUES (?,?,?,?,?,?,?,?, 'accepted', ?, ?)`)
  .run(created[0], created[1], userIds[1], userIds[0],
    'Меняю квартиру на Camry, доплачу 5000$ сверху.', deal1.pay_direction, deal1.pay_amount,
    deal1.pay_currency, m1.ok ? 1 : 0, m1.index).lastInsertRowid;

const convId = db.prepare('INSERT INTO conversations (offer_id, user_a, user_b) VALUES (?,?,?)')
  .run(offerId, userIds[0], userIds[1]).lastInsertRowid;
const insMsg = db.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)');
insMsg.run(convId, userIds[0], 'Բարև Ձեզ, կարո՞ղ ենք վաղը հանդիպել։');
insMsg.run(convId, userIds[1], 'Здравствуйте! Да, завтра в 12 у нотариуса подойдёт?');

/* Ещё одно предложение — ждёт ответа */
const deal2 = { pay_direction: 'in', pay_amount: 8000, pay_currency: 'USD' };
const m2 = matchOf(created[0], created[3], deal2);
db.prepare(`INSERT INTO offers (listing_id, offered_listing_id, from_user_id, to_user_id, message,
  pay_direction, pay_amount, pay_currency, matched, wish_index) VALUES (?,?,?,?,?,?,?,?,?,?)`)
  .run(created[0], created[3], userIds[3], userIds[0],
    'Предлагаю дом в Ванадзоре, доплата с вас.', deal2.pay_direction, deal2.pay_amount,
    deal2.pay_currency, m2.ok ? 1 : 0, m2.index);

/* Сохранённые поиски: по ним приходят оповещения о новых объявлениях */
const alertCols = ['user_id', 'kind', 'make', 'model', 'year_min', 'year_max', 'mileage_max',
  'transmission', 'fuel', 'body', 'city', 'area_min', 'land_min', 'rooms_min',
  'price_min', 'price_max', 'price_currency'];
const insAlert = db.prepare(`INSERT INTO alerts (${alertCols.join(',')})
  VALUES (${alertCols.map(() => '?').join(',')})`);
const alerts = [
  { user_id: userIds[2], kind: 'apartment', city: 'yerevan', area_min: 60, rooms_min: 2, price_max: 120000 },
  { user_id: userIds[2], kind: 'car', make: 'Toyota', year_min: 2015, price_max: 25000 },
  { user_id: userIds[1], kind: 'land', city: 'dilijan' },
  { user_id: userIds[3], kind: 'car', make: 'Mercedes-Benz', year_min: 2012 },
];
const alertIds = alerts.map((a) =>
  insAlert.run(...alertCols.map((c) => (a[c] === undefined ? (c === 'price_currency' ? 'USD' : null) : a[c]))).lastInsertRowid);

/* Одно непрочитанное совпадение — чтобы страница поисков сразу была живой */
const MATCH_A = require('./public/js/match.js');
const insNotif = db.prepare('INSERT OR IGNORE INTO notifications (user_id, alert_id, listing_id) VALUES (?,?,?)');
alerts.forEach((a, i) => {
  const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(alertIds[i]);
  for (const l of db.prepare("SELECT * FROM listings WHERE status='active' AND user_id <> ?").all(a.user_id)) {
    if (MATCH_A.checkWish(row, l, { ignorePay: true }).ok) insNotif.run(a.user_id, row.id, l.id);
  }
});

console.log('Демо-данные готовы.');
console.log('Вход: ani@demo.am / davit@demo.am / mher@demo.am / lilit@demo.am — пароль demo1234');
