"""Karobar — SQLite schema (multi-shop). Sab hisab deterministic: balances queries se compute hote hain."""
import sqlite3
import os

DB_PATH = os.environ.get("KAROBAR_DB", os.path.join(os.path.dirname(__file__), "karobar.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS shops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    owner_name TEXT DEFAULT '',
    phone TEXT UNIQUE NOT NULL,
    email TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    address TEXT DEFAULT '',
    city TEXT DEFAULT '',
    receipt_header TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT DEFAULT '',
    purchase_price REAL NOT NULL DEFAULT 0,
    sale_price REAL NOT NULL DEFAULT 0,
    stock_qty REAL NOT NULL DEFAULT 0,
    low_stock_level REAL NOT NULL DEFAULT 5,
    unit TEXT DEFAULT 'naq',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);

CREATE TABLE IF NOT EXISTS parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    type TEXT NOT NULL DEFAULT 'customer',   -- customer | supplier
    address TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parties_shop ON parties(shop_id);

CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    bill_no TEXT NOT NULL,
    party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    party_name TEXT DEFAULT '',
    date TEXT NOT NULL,                        -- YYYY-MM-DD
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    paid REAL NOT NULL DEFAULT 0,
    mode TEXT DEFAULT 'cash',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shop_id, bill_no)
);
CREATE INDEX IF NOT EXISTS idx_bills_shop_date ON bills(shop_id, date);

CREATE TABLE IF NOT EXISTS bill_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    cost REAL NOT NULL DEFAULT 0,              -- purchase price at time of sale (profit ke liye)
    total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    party_id INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    direction TEXT NOT NULL,                   -- 'lena' (customer se wasool) | 'dena' (supplier ko ada)
    mode TEXT DEFAULT 'cash',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_shop ON payments(shop_id);

CREATE TABLE IF NOT EXISTS cash_txns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    kind TEXT NOT NULL,                        -- 'in' | 'out'
    amount REAL NOT NULL,
    category TEXT DEFAULT '',
    note TEXT DEFAULT '',
    ref TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cash_shop_date ON cash_txns(shop_id, date);
"""


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    conn = get_db()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def dicts(rows):
    return [dict(r) for r in rows]
