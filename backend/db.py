"""Karobar — DB layer (multi-shop). SQLite default; DATABASE_URL set ho to Postgres.

Sab hisab deterministic: balances queries se compute hote hain.
Postgres path: psycopg2, `?` placeholders -> `%s`, INSERT -> RETURNING id (lastrowid).
Existing code ko kuch badalne ki zaroorat nahi — get_db() dono ke liye same API deta hai.
"""
import os
import re

DB_PATH = os.environ.get("KAROBAR_DB", os.path.join(os.path.dirname(__file__), "karobar.db"))
DATABASE_URL = os.environ.get("DATABASE_URL", "")

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
    passcode_hash TEXT DEFAULT NULL,   -- 4-digit app lock (NULL = off)
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    staff_id INTEGER DEFAULT NULL,                 -- NULL = owner login
    role TEXT NOT NULL DEFAULT 'owner',            -- owner | cashier | viewer
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
    credit_limit REAL NOT NULL DEFAULT 0,    -- 0 = no limit; udhaar ki had (Rs)
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
    mode TEXT DEFAULT '',
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

-- Sale Orders (customer ka advance order — stock tab kam hota hai jab bill bane)
CREATE TABLE IF NOT EXISTS sale_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    order_no TEXT NOT NULL,
    party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    party_name TEXT DEFAULT '',
    date TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | converted | cancelled
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shop_id, order_no)
);
CREATE INDEX IF NOT EXISTS idx_saleorders_shop ON sale_orders(shop_id);

CREATE TABLE IF NOT EXISTS sale_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES sale_orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL
);

-- Purchase Orders (supplier ko order — stock tab barhta hai jab kharid bill bane)
CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    order_no TEXT NOT NULL,
    party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    party_name TEXT DEFAULT '',
    date TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | converted | cancelled
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shop_id, order_no)
);
CREATE INDEX IF NOT EXISTS idx_purchaseorders_shop ON purchase_orders(shop_id);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL
);

-- Credit Note (sale wapsi: customer ne samaan wapas kiya — khata kam, stock barhta hai)
CREATE TABLE IF NOT EXISTS credit_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    note_no TEXT NOT NULL,
    party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    party_name TEXT DEFAULT '',
    bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
    date TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    reason TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shop_id, note_no)
);
CREATE INDEX IF NOT EXISTS idx_creditnotes_shop ON credit_notes(shop_id);

CREATE TABLE IF NOT EXISTS credit_note_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL
);

-- Debit Note (purchase wapsi: supplier ko samaan wapas — khata kam, stock ghatta hai)
CREATE TABLE IF NOT EXISTS debit_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    note_no TEXT NOT NULL,
    party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    party_name TEXT DEFAULT '',
    purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
    date TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    reason TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shop_id, note_no)
);
CREATE INDEX IF NOT EXISTS idx_debitnotes_shop ON debit_notes(shop_id);

CREATE TABLE IF NOT EXISTS debit_note_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL REFERENCES debit_notes(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL
);

-- Staff (owner ke neeche kaam karne wale: cashier = bill bana sakta hai, viewer = sirf dekh sakta hai)
CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier',          -- cashier | viewer
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shop_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_staff_shop ON staff(shop_id);

-- Proforma invoice (bill jaisa, "PROFORMA" label; convert-to-bill button)
CREATE TABLE IF NOT EXISTS proformas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    pf_no TEXT NOT NULL,
    party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    party_name TEXT DEFAULT '',
    date TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | converted
    bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shop_id, pf_no)
);
CREATE INDEX IF NOT EXISTS idx_proformas_shop ON proformas(shop_id);

-- Serial / IMEI tracking (optional per product; sale par select, wapsi par wapas stock me)
CREATE TABLE IF NOT EXISTS serials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    serial_no TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_stock',   -- in_stock | sold
    bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shop_id, product_id, serial_no)
);
CREATE INDEX IF NOT EXISTS idx_serials_product ON serials(product_id, status);

-- Cheques (post-dated; clear/bounce status)
CREATE TABLE IF NOT EXISTS cheques (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    cheque_no TEXT NOT NULL,
    party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    party_name TEXT DEFAULT '',
    amount REAL NOT NULL,
    due_date TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'receivable',   -- receivable (lena) | payable (dena)
    status TEXT NOT NULL DEFAULT 'pending',    -- pending | cleared | bounced
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cheques_shop ON cheques(shop_id, status, due_date);

-- Loan accounts + EMI schedule
CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    lender_name TEXT NOT NULL,
    principal REAL NOT NULL,
    annual_rate REAL NOT NULL DEFAULT 0,
    months INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    emi_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',   -- active | closed
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS loan_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    due_no INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    emi_amount REAL NOT NULL,
    principal_part REAL NOT NULL,
    interest_part REAL NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0,
    paid_date TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending'   -- pending | partial | paid
);
CREATE INDEX IF NOT EXISTS idx_loansched_loan ON loan_schedule(loan_id, due_no);

-- Service reminders (tareekh wali yaad-dahani, jaise AMC due)
CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date TEXT NOT NULL,
    party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    party_name TEXT DEFAULT '',
    note TEXT DEFAULT '',
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reminders_shop ON reminders(shop_id, due_date, done);

-- Recycle bin (deleted bills/products/parties yahan, restore ho sakte hain)
CREATE TABLE IF NOT EXISTS recycle_bin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,              -- bill | product | party
    ref_id INTEGER NOT NULL,         -- original id
    label TEXT NOT NULL DEFAULT '',
    data_json TEXT NOT NULL DEFAULT '{}',
    deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recycle_shop ON recycle_bin(shop_id, kind);

-- Custom fields / UDF (item, party, bill par user-defined extra khane)
CREATE TABLE IF NOT EXISTS custom_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    entity TEXT NOT NULL,              -- item | party | bill
    name TEXT NOT NULL,
    ftype TEXT NOT NULL DEFAULT 'text', -- text | number | date
    sort INTEGER NOT NULL DEFAULT 0,
    UNIQUE(shop_id, entity, name)
);
CREATE TABLE IF NOT EXISTS custom_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
    entity_id INTEGER NOT NULL,
    value TEXT DEFAULT '',
    UNIQUE(field_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_cval_lookup ON custom_values(field_id, entity_id);

-- Online store orders (public catalog se aane wale orders)
CREATE TABLE IF NOT EXISTS online_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    order_no TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT DEFAULT '',
    items_json TEXT NOT NULL DEFAULT '[]',
    total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new',   -- new | confirmed | billed | cancelled
    bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(shop_id, order_no)
);
CREATE INDEX IF NOT EXISTS idx_online_orders_shop ON online_orders(shop_id, status);

CREATE TABLE IF NOT EXISTS proforma_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pf_id INTEGER NOT NULL REFERENCES proformas(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL
);
"""


# ---------- Postgres support ----------

def _to_pg(ddl: str) -> str:
    """SQLite DDL -> Postgres DDL (sirf hamari schema ke patterns)."""
    ddl = ddl.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
    ddl = ddl.replace("datetime('now')", "now()::text")
    ddl = re.sub(r"\bREAL\b", "DOUBLE PRECISION", ddl)
    return ddl


class _PGRow(dict):
    """dict jaisa row jo [0] index bhi support kare (sqlite3.Row ki tarah)."""
    def __getitem__(self, k):
        if isinstance(k, int):
            return list(self.values())[k]
        return super().__getitem__(k)


class _PGCursor:
    def __init__(self, raw_conn):
        self._conn = raw_conn
        self._cur = raw_conn.cursor()
        self.lastrowid = None

    def execute(self, sql, params=()):
        import psycopg2
        q = sql.replace("?", "%s")
        head = q.lstrip()[:6].upper()
        if head == "INSERT" and "returning" not in q.lower():
            # lastrowid ke liye RETURNING id; sessions table me id column nahi
            try:
                self._cur.execute(q + " RETURNING id", params)
                row = self._cur.fetchone()
                self.lastrowid = row[0] if row else None
                return self
            except psycopg2.errors.UndefinedColumn:
                self._conn.rollback()
                self._cur = self._conn.cursor()
        self._cur.execute(q, params)
        self.lastrowid = None
        return self

    def executemany(self, sql, seq):
        q = sql.replace("?", "%s")
        self._cur.executemany(q, seq)
        return self

    def _wrap(self, row):
        if row is None:
            return None
        cols = [d[0] for d in self._cur.description]
        return _PGRow(zip(cols, row))

    def fetchone(self):
        return self._wrap(self._cur.fetchone())

    def fetchall(self):
        return [self._wrap(r) for r in self._cur.fetchall()]

    def __iter__(self):
        return iter(self.fetchall())

    def close(self):
        self._cur.close()


class _PGConn:
    """sqlite3.Connection jaisa wrapper (sirf wahi API jo app use karta hai)."""
    def __init__(self, raw):
        self._raw = raw

    def execute(self, sql, params=()):
        return _PGCursor(self._raw).execute(sql, params)

    def executemany(self, sql, seq):
        return _PGCursor(self._raw).executemany(sql, seq)

    def executescript(self, script):
        cur = self._raw.cursor()
        for stmt in script.split(";"):
            s = stmt.strip()
            if s:
                cur.execute(_to_pg(s))
        self._raw.commit()

    def cursor(self):
        return _PGCursor(self._raw)

    def commit(self):
        self._raw.commit()

    def rollback(self):
        self._raw.rollback()

    def close(self):
        self._raw.close()


def _get_pg():
    import psycopg2
    raw = psycopg2.connect(DATABASE_URL)
    return _PGConn(raw)


def get_db():
    if DATABASE_URL:
        return _get_pg()
    import sqlite3
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    conn = get_db()
    try:
        if DATABASE_URL:
            conn.executescript(SCHEMA)
            # products me naye columns (purani DB ke liye migration)
            for tbl, col, ddl in (("products", "barcode", "TEXT DEFAULT ''"),
                                  ("products", "expiry_date", "TEXT DEFAULT ''"),
                                  ("products", "category", "TEXT DEFAULT ''"),
                                  ("shops", "invoice_theme", "TEXT DEFAULT 'classic'"),
                                  ("sessions", "staff_id", "INTEGER DEFAULT NULL"),
                                  ("sessions", "role", "TEXT DEFAULT 'owner'"),
                                  ("parties", "credit_limit", "REAL DEFAULT 0"),
                                  ("shops", "passcode_hash", "TEXT DEFAULT NULL")):
                try:
                    conn.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} {_to_pg(ddl)}")
                    conn.commit()
                except Exception:
                    conn.rollback()  # column pehle se hai
            conn.commit()
        else:
            conn.executescript(SCHEMA)
            conn.commit()
            for tbl, col, ddl in (("products", "barcode", "TEXT DEFAULT ''"),
                                  ("products", "expiry_date", "TEXT DEFAULT ''"),
                                  ("products", "category", "TEXT DEFAULT ''"),
                                  ("shops", "invoice_theme", "TEXT DEFAULT 'classic'"),
                                  ("sessions", "staff_id", "INTEGER DEFAULT NULL"),
                                  ("sessions", "role", "TEXT DEFAULT 'owner'"),
                                  ("parties", "credit_limit", "REAL DEFAULT 0"),
                                  ("shops", "passcode_hash", "TEXT DEFAULT NULL")):
                try:
                    conn.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} {ddl}")
                except Exception:
                    pass  # column pehle se hai
            conn.commit()
    finally:
        conn.close()


def dicts(rows):
    return [dict(r) for r in rows]
