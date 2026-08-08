'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'barter.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT    NOT NULL,
  city          TEXT,
  lang          TEXT    NOT NULL DEFAULT 'ru',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT    NOT NULL CHECK (kind IN ('car','realty')),
  title          TEXT    NOT NULL,
  description    TEXT,
  city           TEXT,
  price          INTEGER,
  currency       TEXT    NOT NULL DEFAULT 'USD',

  -- доплата: none | in (мне доплачивают) | out (я доплачиваю)
  pay_direction  TEXT    NOT NULL DEFAULT 'none' CHECK (pay_direction IN ('none','in','out')),
  pay_amount     INTEGER NOT NULL DEFAULT 0,
  pay_currency   TEXT    NOT NULL DEFAULT 'USD',

  wanted_kinds   TEXT    NOT NULL DEFAULT '[]',
  wanted_text    TEXT,

  -- автомобиль
  make           TEXT,
  model          TEXT,
  year           INTEGER,
  mileage        INTEGER,
  body           TEXT,
  transmission   TEXT,
  fuel           TEXT,
  engine         REAL,
  drive          TEXT,
  color          TEXT,
  steering       TEXT,

  -- недвижимость
  realty_type    TEXT,
  area           REAL,
  land_area      REAL,
  rooms          INTEGER,
  floor          INTEGER,
  floors         INTEGER,
  condition      TEXT,
  address        TEXT,

  status         TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','done')),
  views          INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_listings_feed ON listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_user ON listings (user_id);

CREATE TABLE IF NOT EXISTS photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  file       TEXT    NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_photos_listing ON photos (listing_id, sort);

CREATE TABLE IF NOT EXISTS offers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id        INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  offered_listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  from_user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message           TEXT,
  pay_direction     TEXT NOT NULL DEFAULT 'none' CHECK (pay_direction IN ('none','in','out')),
  pay_amount        INTEGER NOT NULL DEFAULT 0,
  pay_currency      TEXT NOT NULL DEFAULT 'USD',
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  seen              INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_offers_to ON offers (to_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_from ON offers (from_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id   INTEGER NOT NULL UNIQUE REFERENCES offers(id) ON DELETE CASCADE,
  user_a     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  read_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id, id);

CREATE TABLE IF NOT EXISTS wishes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id    INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'any',
  make          TEXT,
  model         TEXT,
  year_min      INTEGER,
  year_max      INTEGER,
  mileage_max   INTEGER,
  transmission  TEXT,
  fuel          TEXT,
  body          TEXT,
  city          TEXT,
  area_min      REAL,
  land_min      REAL,
  rooms_min     INTEGER,
  price_min     INTEGER,
  price_max     INTEGER,
  price_currency TEXT DEFAULT 'USD',
  pay_direction TEXT NOT NULL DEFAULT 'none' CHECK (pay_direction IN ('none','in','out')),
  pay_min       INTEGER NOT NULL DEFAULT 0,
  pay_currency  TEXT NOT NULL DEFAULT 'USD',
  note          TEXT,
  sort          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_wishes_listing ON wishes (listing_id, sort);

-- сохранённые поиски: «дай знать, когда появится такое»
CREATE TABLE IF NOT EXISTS alerts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT    NOT NULL DEFAULT 'any',
  make           TEXT,
  model          TEXT,
  year_min       INTEGER,
  year_max       INTEGER,
  mileage_max    INTEGER,
  transmission   TEXT,
  fuel           TEXT,
  body           TEXT,
  city           TEXT,
  area_min       REAL,
  land_min       REAL,
  rooms_min      INTEGER,
  price_min      INTEGER,
  price_max      INTEGER,
  price_currency TEXT    NOT NULL DEFAULT 'USD',
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts (user_id, active);

-- совпадения по сохранённым поискам
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id   INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  seen       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_once ON notifications (user_id, alert_id, listing_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id, seen, created_at DESC);

-- подписки браузера на push-уведомления
CREATE TABLE IF NOT EXISTS push_subs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT    NOT NULL UNIQUE,
  p256dh     TEXT    NOT NULL,
  auth       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subs (user_id);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, listing_id)
);

-- заявки на платное поднятие объявления в топ; подтверждаются вручную админом,
-- т.к. прямой интеграции с платёжным шлюзом (Idram/Telcell/ArCa) пока нет
CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id   INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL,
  currency     TEXT    NOT NULL DEFAULT 'AMD',
  days         INTEGER NOT NULL DEFAULT 7,
  method       TEXT,
  reference    TEXT,
  receipt_file TEXT,
  status       TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  admin_note   TEXT,
  confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  resolved_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id, created_at DESC);
`);

/* Мягкие миграции для баз, созданных прошлой версией */
function addColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('offers', 'matched', 'INTEGER NOT NULL DEFAULT 0');
addColumn('offers', 'wish_index', 'INTEGER');
addColumn('listings', 'top_until', 'TEXT');
addColumn('users', 'banned', 'INTEGER NOT NULL DEFAULT 0');
addColumn('payments', 'receipt_file', 'TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_listings_top ON listings (top_until)');

module.exports = db;
