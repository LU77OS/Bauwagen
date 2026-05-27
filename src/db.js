const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'bauwagen.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS persons (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    paypal TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '📦',
    price REAL NOT NULL,
    category TEXT DEFAULT 'Sonstiges',
    stock INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL,
    person_name TEXT NOT NULL,
    month TEXT NOT NULL,
    total REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (person_id) REFERENCES persons(id)
  );

  CREATE TABLE IF NOT EXISTS booking_items (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price_at_time REAL NOT NULL,
    line_total REAL NOT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inventory_logs (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    expected INTEGER NOT NULL,
    actual INTEGER NOT NULL,
    diff INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const existingPassword = db.prepare("SELECT value FROM settings WHERE key = 'password'").get();
if (!existingPassword) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('password', '1234')").run();
}

const productCount = db.prepare('SELECT COUNT(*) as c FROM products').get();
if (productCount.c === 0) {
  const insert = db.prepare('INSERT INTO products (id, name, emoji, price, category, stock) VALUES (?, ?, ?, ?, ?, ?)');
  const demo = db.transaction(() => {
    insert.run('pr1', 'Kölsch', '🍺', 1.50, 'Bier', 24);
    insert.run('pr2', 'Pils', '🍻', 1.50, 'Bier', 24);
    insert.run('pr3', 'Cola', '🥤', 1.50, 'Softdrinks', 12);
    insert.run('pr4', 'Fanta', '🍊', 1.50, 'Softdrinks', 12);
    insert.run('pr5', 'Wasser', '💧', 1.00, 'Softdrinks', 24);
    insert.run('pr6', 'Chips', '🍿', 2.00, 'Snacks', 8);
  });
  demo();
}

module.exports = db;
