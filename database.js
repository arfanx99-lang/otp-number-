const path = require("node:path");
const fs = require("node:fs");
const Database = require("better-sqlite3");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const DATABASE_FILE = path.join(DATA_DIR, "sms-bot.sqlite");
const db = new Database(DATABASE_FILE);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create necessary tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    balance REAL DEFAULT 0.0,
    is_banned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    service TEXT NOT NULL,
    cost REAL DEFAULT 0.0,
    sms_code TEXT,
    status TEXT DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bot_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

function getDbSetting(key, fallback = null) {
  return db.prepare("SELECT value FROM bot_settings WHERE key = ?").get(key)?.value ?? fallback;
}

function setDbSetting(key, value) {
  db.prepare("INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)").run(key, String(value));
}

module.exports = {
  db,
  getDbSetting,
  setDbSetting,
};
