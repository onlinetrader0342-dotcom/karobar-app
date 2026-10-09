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

-- Kharid (purchase bills, supplier se samaan)
CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    bill_no TEXT NOT NULL,
    party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    party_name TEXT DEFAULT '',
    date TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    paid REAL NOT NULL DEFAULT 0,
    mode TEXT DEFAULT 'cash',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shop_id, bill_no)
);
CREATE INDEX IF NOT EXISTS idx_purchases_shop_date ON purchases(shop_id, date);

CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL
);

-- Andaza / Quotation (customer ko rate ka andaza, pakka bill nahi)
CREATE TABLE IF NOT EXISTS estimates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    est_no TEXT NOT NULL,
    party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    party_name TEXT DEFAULT '',
    date TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shop_id, est_no)
);
CREATE INDEX IF NOT EXISTS idx_estimates_shop ON estimates(shop_id);

CREATE TABLE IF NOT EXISTS estimate_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estimate_id INTEGER NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL
);

-- Delivery Challan (samaan bhejne ki raseed — pakka bill nahi, stock kam hota hai)
CREATE TABLE IF NOT EXISTS challans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    challan_no TEXT NOT NULL,
    party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    party_name TEXT DEFAULT '',
    date TEXT NOT NULL,
    vehicle_no TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',   -- open | billed
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shop_id, challan_no)
);
CREATE INDEX IF NOT EXISTS idx_challans_shop ON challans(shop_id);

CREATE TABLE IF NOT EXISTS challan_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challan_id INTEGER NOT NULL REFERENCES challans(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    qty REAL NOT NULL
);

-- Bank Accounts (dukaan ke bank khaate)
CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                 -- e.g. "Meezan Current"
    bank_name TEXT DEFAULT '',
    account_no TEXT DEFAULT '',
    opening_balance REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bankacc_shop ON bank_accounts(shop_id);

CREATE TABLE IF NOT EXISTS bank_txns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    kind TEXT NOT NULL,                 -- 'in' | 'out'
    amount REAL NOT NULL,
    note TEXT DEFAULT '',
    ref TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_banktxn_acc ON bank_txns(account_id);
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
        # products me naye columns (purani DB ke liye migration)
        for col, ddl in (("barcode", "TEXT DEFAULT ''"),
                         ("expiry_date", "TEXT DEFAULT ''"),
                         ("category", "TEXT DEFAULT ''")):
            try:
                conn.execute(f"ALTER TABLE products ADD COLUMN {col} {ddl}")
            except Exception:
                pass  # column pehle se hai
        conn.commit()
    finally:
        conn.close()


def dicts(rows):
    return [dict(r) for r in rows]
