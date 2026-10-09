"""Karobar — Phase 1 Mobile MVP API (FastAPI + SQLite, multi-shop)."""
import os
from datetime import date
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from auth import hash_password, new_token, verify_password
from db import dicts, get_db, init_db

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

app = FastAPI(title="Karobar API")

# display labels for cash categories (DB stores short codes)
CAT_LABELS = {"expense": "Expense", "income": "Income", "sale": "Sale",
              "party": "Party", "purchase": "Purchase", "adjustment": "Adjustment"}


# ---------- helpers ----------

def today() -> str:
    return date.today().isoformat()


def shop_of(authorization: Optional[str] = Header(default=None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Login required")
    token = authorization[7:]
    conn = get_db()
    try:
        row = conn.execute("SELECT shop_id FROM sessions WHERE token=?", (token,)).fetchone()
        if not row:
            raise HTTPException(401, "Session expired, please log in again")
        return row["shop_id"]
    finally:
        conn.close()


def party_balance(conn, shop_id: int, party_id: int, ptype: str) -> float:
    """Deterministic balance. customer: + means RECEIVABLE from customer. supplier: + means PAYABLE to supplier."""
    if ptype == "customer":
        billed = conn.execute(
            "SELECT COALESCE(SUM(total - paid), 0) FROM bills WHERE shop_id=? AND party_id=?",
            (shop_id, party_id)).fetchone()[0]
        got = conn.execute(
            "SELECT COALESCE(SUM(amount),0) FROM payments WHERE shop_id=? AND party_id=? AND direction='lena'",
            (shop_id, party_id)).fetchone()[0]
        return round(billed - got, 2)
    else:
        billed = conn.execute(
            "SELECT COALESCE(SUM(total - paid), 0) FROM purchases WHERE shop_id=? AND party_id=?",
            (shop_id, party_id)).fetchone()[0]
        paid_out = conn.execute(
            "SELECT COALESCE(SUM(amount),0) FROM payments WHERE shop_id=? AND party_id=? AND direction='dena'",
            (shop_id, party_id)).fetchone()[0]
        return round(billed - paid_out, 2)


def next_bill_no(conn, shop_id: int) -> str:
    n = conn.execute("SELECT COUNT(*) FROM bills WHERE shop_id=?", (shop_id,)).fetchone()[0]
    return f"KAR-{n + 1:05d}"


# ---------- models ----------

class Signup(BaseModel):
    name: str = Field(min_length=2)
    owner_name: str = ""
    phone: str = Field(min_length=10)
    password: str = Field(min_length=4)


class Login(BaseModel):
    phone: str
    password: str


class ProductIn(BaseModel):
    name: str
    sku: str = ""
    purchase_price: float = 0
    sale_price: float = 0
    stock_qty: float = 0
    low_stock_level: float = 5
    unit: str = "pcs"
    barcode: str = ""
    expiry_date: str = ""
    category: str = ""


class StockAdjustIn(BaseModel):
    qty_change: float  # + stock me izafa, - kami
    note: str = ""


class PartyIn(BaseModel):
    name: str
    phone: str = ""
    type: str = "customer"
    address: str = ""


class PaymentIn(BaseModel):
    amount: float = Field(gt=0)
    direction: str  # lena | dena
    mode: str = "cash"
    note: str = ""
    date: Optional[str] = None


class BillItemIn(BaseModel):
    product_id: int
    qty: float = Field(gt=0)
    price: Optional[float] = None  # None = product ka sale_price


class BillIn(BaseModel):
    party_id: Optional[int] = None
    party_name: str = ""
    items: list[BillItemIn] = Field(min_length=1)
    discount: float = 0
    paid: float = 0
    mode: str = "cash"
    date: Optional[str] = None


class PurchaseItemIn(BaseModel):
    product_id: int
    qty: float = Field(gt=0)
    price: Optional[float] = None  # None = product ka purchase_price


class PurchaseIn(BaseModel):
    party_id: Optional[int] = None
    party_name: str = ""
    items: list[PurchaseItemIn] = Field(min_length=1)
    discount: float = 0
    paid: float = 0
    mode: str = "cash"
    date: Optional[str] = None


class EstimateItemIn(BaseModel):
    product_id: int
    qty: float = Field(gt=0)
    price: Optional[float] = None  # None = product ka sale_price


class EstimateIn(BaseModel):
    party_id: Optional[int] = None
    party_name: str = ""
    items: list[EstimateItemIn] = Field(min_length=1)
    discount: float = 0
    date: Optional[str] = None


class ChallanItemIn(BaseModel):
    product_id: int
    qty: float = Field(gt=0)


class ChallanIn(BaseModel):
    party_id: Optional[int] = None
    party_name: str = ""
    items: list[ChallanItemIn] = Field(min_length=1)
    vehicle_no: str = ""
    date: Optional[str] = None


class BankAccountIn(BaseModel):
    name: str
    bank_name: str = ""
    account_no: str = ""
    opening_balance: float = 0


class BankTxnIn(BaseModel):
    kind: str  # in | out
    amount: float = Field(gt=0)
    note: str = ""
    date: Optional[str] = None


class CashIn(BaseModel):
    kind: str  # in | out
    amount: float = Field(gt=0)
    category: str = ""
    note: str = ""
    date: Optional[str] = None


class SettingsIn(BaseModel):
    name: str = ""
    address: str = ""
    phone: str = ""
    receipt_header: str = ""


# ---------- auth ----------

@app.post("/api/auth/signup")
def signup(b: Signup):
    conn = get_db()
    try:
        exists = conn.execute("SELECT id FROM shops WHERE phone=?", (b.phone,)).fetchone()
        if exists:
            raise HTTPException(400, "An account already exists with this number")
        cur = conn.execute(
            "INSERT INTO shops(name, owner_name, phone, password_hash) VALUES (?,?,?,?)",
            (b.name, b.owner_name, b.phone, hash_password(b.password)))
        shop_id = cur.lastrowid
        token = new_token()
        conn.execute("INSERT INTO sessions(token, shop_id) VALUES (?,?)", (token, shop_id))
        conn.commit()
        return {"token": token, "shop_id": shop_id}
    finally:
        conn.close()


@app.post("/api/auth/login")
def login(b: Login):
    conn = get_db()
    try:
        row = conn.execute("SELECT id, password_hash FROM shops WHERE phone=?", (b.phone,)).fetchone()
        if not row or not verify_password(b.password, row["password_hash"]):
            raise HTTPException(401, "Number or password is incorrect")
        token = new_token()
        conn.execute("INSERT INTO sessions(token, shop_id) VALUES (?,?)", (token, row["id"]))
        conn.commit()
        return {"token": token, "shop_id": row["id"]}
    finally:
        conn.close()


@app.post("/api/auth/logout")
def logout(shop_id: int = Depends(shop_of), authorization: str = Header(default="")):
    conn = get_db()
    try:
        conn.execute("DELETE FROM sessions WHERE token=?", (authorization[7:],))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.get("/api/auth/me")
def me(shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, name, owner_name, phone, email, address, city, receipt_header FROM shops WHERE id=?",
            (shop_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.put("/api/settings")
def update_settings(b: SettingsIn, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        conn.execute(
            "UPDATE shops SET name=?, address=?, phone=?, receipt_header=? WHERE id=?",
            (b.name, b.address, b.phone, b.receipt_header, shop_id))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- products ----------

@app.get("/api/products")
def list_products(q: str = "", shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        if q:
            rows = conn.execute(
                "SELECT * FROM products WHERE shop_id=? AND (name LIKE ? OR sku LIKE ?) ORDER BY name",
                (shop_id, f"%{q}%", f"%{q}%")).fetchall()
        else:
            rows = conn.execute("SELECT * FROM products WHERE shop_id=? ORDER BY name", (shop_id,)).fetchall()
        return dicts(rows)
    finally:
        conn.close()


@app.post("/api/products")
def add_product(b: ProductIn, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO products(shop_id,name,sku,purchase_price,sale_price,stock_qty,low_stock_level,unit,
                                    barcode,expiry_date,category)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (shop_id, b.name, b.sku, b.purchase_price, b.sale_price, b.stock_qty, b.low_stock_level, b.unit,
             b.barcode, b.expiry_date, b.category))
        conn.commit()
        row = conn.execute("SELECT * FROM products WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.put("/api/products/{pid}")
def update_product(pid: int, b: ProductIn, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        conn.execute(
            """UPDATE products SET name=?,sku=?,purchase_price=?,sale_price=?,stock_qty=?,low_stock_level=?,unit=?,
                                  barcode=?,expiry_date=?,category=?
               WHERE id=? AND shop_id=?""",
            (b.name, b.sku, b.purchase_price, b.sale_price, b.stock_qty, b.low_stock_level, b.unit,
             b.barcode, b.expiry_date, b.category, pid, shop_id))
        conn.commit()
        row = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?", (pid, shop_id)).fetchone()
        if not row:
            raise HTTPException(404, "Product not found")
        return dict(row)
    finally:
        conn.close()


@app.delete("/api/products/{pid}")
def delete_product(pid: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        used = conn.execute("SELECT COUNT(*) FROM bill_items bi JOIN bills b ON b.id=bi.bill_id "
                            "WHERE b.shop_id=? AND bi.product_id=?", (shop_id, pid)).fetchone()[0]
        if used:
            raise HTTPException(400, "Bills already exist for this product, cannot delete")
        conn.execute("DELETE FROM products WHERE id=? AND shop_id=?", (pid, shop_id))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.post("/api/products/{pid}/adjust")
def adjust_stock(pid: int, b: StockAdjustIn, shop_id: int = Depends(shop_of)):
    """Stock adjustment: theft/damage/count difference. qty_change + or -."""
    conn = get_db()
    try:
        pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?", (pid, shop_id)).fetchone()
        if not pr:
            raise HTTPException(404, "Product not found")
        new_qty = round(pr["stock_qty"] + b.qty_change, 2)
        if new_qty < 0:
            raise HTTPException(400, "Stock cannot go below 0")
        conn.execute("UPDATE products SET stock_qty=? WHERE id=?", (new_qty, pid))
        conn.execute(
            "INSERT INTO cash_txns(shop_id,date,kind,amount,category,note,ref) VALUES (?,?,'out',0,'adjustment',?,?)",
            (shop_id, today(), f"Stock adjust: {pr['name']} {pr['stock_qty']} → {new_qty}. {b.note}".strip(),
             f"adjust:{pid}"))
        conn.commit()
        return {"ok": True, "stock_qty": new_qty}
    finally:
        conn.close()


# ---------- purchases ----------

def next_purchase_no(conn, shop_id: int) -> str:
    n = conn.execute("SELECT COUNT(*) FROM purchases WHERE shop_id=?", (shop_id,)).fetchone()[0]
    return f"PUR-{n + 1:05d}"


def get_purchase(conn, shop_id: int, pur_id: int):
    pur = conn.execute("SELECT * FROM purchases WHERE id=? AND shop_id=?", (pur_id, shop_id)).fetchone()
    if not pur:
        raise HTTPException(404, "Purchase bill not found")
    d = dict(pur)
    d["items"] = dicts(conn.execute("SELECT * FROM purchase_items WHERE purchase_id=?", (pur_id,)).fetchall())
    d["baqaya"] = round(d["total"] - d["paid"], 2)
    return d


@app.post("/api/purchases")
def create_purchase(b: PurchaseIn, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        pname = b.party_name
        if b.party_id:
            p = conn.execute("SELECT id, name FROM parties WHERE id=? AND shop_id=?",
                             (b.party_id, shop_id)).fetchone()
            if not p:
                raise HTTPException(404, "Party not found")
            pname = p["name"]
        d = b.date or today()
        subtotal = 0.0
        lines = []
        for it in b.items:
            pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                              (it.product_id, shop_id)).fetchone()
            if not pr:
                raise HTTPException(404, f"Product #{it.product_id} not found")
            price = it.price if it.price is not None else pr["purchase_price"]
            lt = round(price * it.qty, 2)
            subtotal += lt
            lines.append((pr, it.qty, price, lt))
        subtotal = round(subtotal, 2)
        discount = round(min(b.discount, subtotal), 2)
        total = round(subtotal - discount, 2)
        paid = round(min(b.paid, total), 2)
        bill_no = next_purchase_no(conn, shop_id)
        cur = conn.execute(
            """INSERT INTO purchases(shop_id,bill_no,party_id,party_name,date,subtotal,discount,total,paid,mode)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (shop_id, bill_no, b.party_id, pname, d, subtotal, discount, total, paid, b.mode))
        pur_id = cur.lastrowid
        for pr, qty, price, lt in lines:
            conn.execute(
                "INSERT INTO purchase_items(purchase_id,product_id,product_name,qty,price,total) VALUES (?,?,?,?,?,?)",
                (pur_id, pr["id"], pr["name"], qty, price, lt))
            # purchase increases stock; also updates to latest purchase rate
            conn.execute("UPDATE products SET stock_qty = stock_qty + ?, purchase_price = ? WHERE id=?",
                         (qty, price, pr["id"]))
        if paid > 0:
            conn.execute(
                "INSERT INTO cash_txns(shop_id,date,kind,amount,category,note,ref) VALUES (?,?,?,?,?,?,?)",
                (shop_id, d, "out", paid, "purchase", f"Purchase {bill_no}" + (f" — {pname}" if pname else ""),
                 f"purchase:{pur_id}"))
        conn.commit()
        return get_purchase(conn, shop_id, pur_id)
    finally:
        conn.close()


@app.get("/api/purchases")
def list_purchases(shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM purchases WHERE shop_id=? ORDER BY date DESC, id DESC LIMIT 200",
                            (shop_id,)).fetchall()
        out = []
        for r in rows:
            dd = dict(r)
            dd["baqaya"] = round(dd["total"] - dd["paid"], 2)
            out.append(dd)
        return out
    finally:
        conn.close()


@app.get("/api/purchases/{pur_id}")
def purchase_detail(pur_id: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return get_purchase(conn, shop_id, pur_id)
    finally:
        conn.close()


# ---------- estimates (andaza / quotation) ----------

def next_est_no(conn, shop_id: int) -> str:
    n = conn.execute("SELECT COUNT(*) FROM estimates WHERE shop_id=?", (shop_id,)).fetchone()[0]
    return f"EST-{n + 1:05d}"


def get_estimate(conn, shop_id: int, est_id: int):
    e = conn.execute("SELECT * FROM estimates WHERE id=? AND shop_id=?", (est_id, shop_id)).fetchone()
    if not e:
        raise HTTPException(404, "Estimate not found")
    d = dict(e)
    d["items"] = dicts(conn.execute("SELECT * FROM estimate_items WHERE estimate_id=?", (est_id,)).fetchall())
    return d


@app.post("/api/estimates")
def create_estimate(b: EstimateIn, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        pname = b.party_name
        if b.party_id:
            p = conn.execute("SELECT id, name FROM parties WHERE id=? AND shop_id=?",
                             (b.party_id, shop_id)).fetchone()
            if not p:
                raise HTTPException(404, "Party not found")
            pname = p["name"]
        d = b.date or today()
        subtotal = 0.0
        lines = []
        for it in b.items:
            pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                              (it.product_id, shop_id)).fetchone()
            if not pr:
                raise HTTPException(404, f"Product #{it.product_id} not found")
            price = it.price if it.price is not None else pr["sale_price"]
            lt = round(price * it.qty, 2)
            subtotal += lt
            lines.append((pr, it.qty, price, lt))
        subtotal = round(subtotal, 2)
        discount = round(min(b.discount, subtotal), 2)
        total = round(subtotal - discount, 2)
        est_no = next_est_no(conn, shop_id)
        cur = conn.execute(
            """INSERT INTO estimates(shop_id,est_no,party_id,party_name,date,subtotal,discount,total)
               VALUES (?,?,?,?,?,?,?,?)""",
            (shop_id, est_no, b.party_id, pname, d, subtotal, discount, total))
        est_id = cur.lastrowid
        for pr, qty, price, lt in lines:
            conn.execute(
                "INSERT INTO estimate_items(estimate_id,product_id,product_name,qty,price,total) VALUES (?,?,?,?,?,?)",
                (est_id, pr["id"], pr["name"], qty, price, lt))
        conn.commit()
        return get_estimate(conn, shop_id, est_id)
    finally:
        conn.close()


@app.get("/api/estimates")
def list_estimates(shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM estimates WHERE shop_id=? ORDER BY date DESC, id DESC LIMIT 200",
                            (shop_id,)).fetchall()
        return dicts(rows)
    finally:
        conn.close()


@app.get("/api/estimates/{est_id}")
def estimate_detail(est_id: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return get_estimate(conn, shop_id, est_id)
    finally:
        conn.close()


@app.post("/api/estimates/{est_id}/convert")
def convert_estimate(est_id: int, shop_id: int = Depends(shop_of)):
    """Convert an estimate to a final bill (stock decreases, bill is created)."""
    conn = get_db()
    try:
        e = conn.execute("SELECT * FROM estimates WHERE id=? AND shop_id=?", (est_id, shop_id)).fetchone()
        if not e:
            raise HTTPException(404, "Estimate not found")
        if e["status"] != "open":
            raise HTTPException(400, "This estimate has already been converted to a bill")
        items = conn.execute("SELECT * FROM estimate_items WHERE estimate_id=?", (est_id,)).fetchall()
        # stock check
        for it in items:
            pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                              (it["product_id"], shop_id)).fetchone()
            if pr and pr["stock_qty"] < it["qty"]:
                raise HTTPException(400, f"'{pr['name']}' — not enough stock (available: {pr['stock_qty']})")
        bill_no = next_bill_no(conn, shop_id)
        cur = conn.execute(
            """INSERT INTO bills(shop_id,bill_no,party_id,party_name,date,subtotal,discount,total,paid,mode)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (shop_id, bill_no, e["party_id"], e["party_name"], today(),
             e["subtotal"], e["discount"], e["total"], 0, "cash"))
        bill_id = cur.lastrowid
        for it in items:
            pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                              (it["product_id"], shop_id)).fetchone()
            cost = pr["purchase_price"] if pr else 0
            conn.execute(
                "INSERT INTO bill_items(bill_id,product_id,product_name,qty,price,cost,total) VALUES (?,?,?,?,?,?,?)",
                (bill_id, it["product_id"], it["product_name"], it["qty"], it["price"], cost, it["total"]))
            if pr:
                conn.execute("UPDATE products SET stock_qty = stock_qty - ? WHERE id=?",
                             (it["qty"], pr["id"]))
        conn.execute("UPDATE estimates SET status='converted' WHERE id=?", (est_id,))
        conn.commit()
        return get_bill(conn, shop_id, bill_id)
    finally:
        conn.close()


# ---------- delivery challans ----------

def next_challan_no(conn, shop_id: int) -> str:
    n = conn.execute("SELECT COUNT(*) FROM challans WHERE shop_id=?", (shop_id,)).fetchone()[0]
    return f"CH-{n + 1:05d}"


def get_challan(conn, shop_id: int, ch_id: int):
    c = conn.execute("SELECT * FROM challans WHERE id=? AND shop_id=?", (ch_id, shop_id)).fetchone()
    if not c:
        raise HTTPException(404, "Challan not found")
    d = dict(c)
    d["items"] = dicts(conn.execute("SELECT * FROM challan_items WHERE challan_id=?", (ch_id,)).fetchall())
    return d


@app.post("/api/challans")
def create_challan(b: ChallanIn, shop_id: int = Depends(shop_of)):
    """Delivery challan: stock decreases, no billing."""
    conn = get_db()
    try:
        pname = b.party_name
        if b.party_id:
            p = conn.execute("SELECT id, name FROM parties WHERE id=? AND shop_id=?",
                             (b.party_id, shop_id)).fetchone()
            if not p:
                raise HTTPException(404, "Party not found")
            pname = p["name"]
        d = b.date or today()
        lines = []
        for it in b.items:
            pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                              (it.product_id, shop_id)).fetchone()
            if not pr:
                raise HTTPException(404, f"Product #{it.product_id} not found")
            if pr["stock_qty"] < it.qty:
                raise HTTPException(400, f"'{pr['name']}' — not enough stock (available: {pr['stock_qty']})")
            lines.append((pr, it.qty))
        ch_no = next_challan_no(conn, shop_id)
        cur = conn.execute(
            """INSERT INTO challans(shop_id,challan_no,party_id,party_name,date,vehicle_no)
               VALUES (?,?,?,?,?,?)""",
            (shop_id, ch_no, b.party_id, pname, d, b.vehicle_no))
        ch_id = cur.lastrowid
        for pr, qty in lines:
            conn.execute(
                "INSERT INTO challan_items(challan_id,product_id,product_name,qty) VALUES (?,?,?,?)",
                (ch_id, pr["id"], pr["name"], qty))
            conn.execute("UPDATE products SET stock_qty = stock_qty - ? WHERE id=?", (qty, pr["id"]))
        conn.commit()
        return get_challan(conn, shop_id, ch_id)
    finally:
        conn.close()


@app.get("/api/challans")
def list_challans(shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM challans WHERE shop_id=? ORDER BY date DESC, id DESC LIMIT 200",
                            (shop_id,)).fetchall()
        return dicts(rows)
    finally:
        conn.close()


@app.get("/api/challans/{ch_id}")
def challan_detail(ch_id: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return get_challan(conn, shop_id, ch_id)
    finally:
        conn.close()


@app.post("/api/challans/{ch_id}/convert")
def convert_challan(ch_id: int, shop_id: int = Depends(shop_of)):
    """Convert a challan to a bill (stock already decreased at challan time)."""
    conn = get_db()
    try:
        c = conn.execute("SELECT * FROM challans WHERE id=? AND shop_id=?", (ch_id, shop_id)).fetchone()
        if not c:
            raise HTTPException(404, "Challan not found")
        if c["status"] != "open":
            raise HTTPException(400, "This challan has already been billed")
        items = conn.execute("SELECT * FROM challan_items WHERE challan_id=?", (ch_id,)).fetchall()
        bill_no = next_bill_no(conn, shop_id)
        subtotal = 0.0
        lines = []
        for it in items:
            pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                              (it["product_id"], shop_id)).fetchone()
            price = pr["sale_price"] if pr else 0
            cost = pr["purchase_price"] if pr else 0
            lt = round(price * it["qty"], 2)
            subtotal += lt
            lines.append((it, price, cost, lt))
        subtotal = round(subtotal, 2)
        cur = conn.execute(
            """INSERT INTO bills(shop_id,bill_no,party_id,party_name,date,subtotal,discount,total,paid,mode)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (shop_id, bill_no, c["party_id"], c["party_name"], today(),
             subtotal, 0, subtotal, 0, "cash"))
        bill_id = cur.lastrowid
        for it, price, cost, lt in lines:
            conn.execute(
                "INSERT INTO bill_items(bill_id,product_id,product_name,qty,price,cost,total) VALUES (?,?,?,?,?,?,?)",
                (bill_id, it["product_id"], it["product_name"], it["qty"], price, cost, lt))
        conn.execute("UPDATE challans SET status='billed' WHERE id=?", (ch_id,))
        conn.commit()
        return get_bill(conn, shop_id, bill_id)
    finally:
        conn.close()


# ---------- bank accounts ----------

def bank_balance(conn, shop_id: int, acc_id: int) -> float:
    acc = conn.execute("SELECT opening_balance FROM bank_accounts WHERE id=? AND shop_id=?",
                       (acc_id, shop_id)).fetchone()
    if not acc:
        raise HTTPException(404, "Bank account not found")
    inn = conn.execute("SELECT COALESCE(SUM(amount),0) FROM bank_txns WHERE account_id=? AND kind='in'",
                       (acc_id,)).fetchone()[0]
    out = conn.execute("SELECT COALESCE(SUM(amount),0) FROM bank_txns WHERE account_id=? AND kind='out'",
                       (acc_id,)).fetchone()[0]
    return round(acc["opening_balance"] + inn - out, 2)


@app.post("/api/bank-accounts")
def add_bank_account(b: BankAccountIn, shop_id: int = Depends(shop_of)):
    if not b.name.strip():
        raise HTTPException(400, "Account name is required")
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO bank_accounts(shop_id,name,bank_name,account_no,opening_balance) VALUES (?,?,?,?,?)",
            (shop_id, b.name.strip(), b.bank_name.strip(), b.account_no.strip(), b.opening_balance))
        conn.commit()
        acc_id = cur.lastrowid
        d = dict(conn.execute("SELECT * FROM bank_accounts WHERE id=?", (acc_id,)).fetchone())
        d["balance"] = bank_balance(conn, shop_id, acc_id)
        return d
    finally:
        conn.close()


@app.get("/api/bank-accounts")
def list_bank_accounts(shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM bank_accounts WHERE shop_id=? ORDER BY id", (shop_id,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["balance"] = bank_balance(conn, shop_id, r["id"])
            out.append(d)
        return out
    finally:
        conn.close()


@app.get("/api/bank-accounts/{acc_id}")
def bank_account_detail(acc_id: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        acc = conn.execute("SELECT * FROM bank_accounts WHERE id=? AND shop_id=?",
                           (acc_id, shop_id)).fetchone()
        if not acc:
            raise HTTPException(404, "Bank account not found")
        d = dict(acc)
        d["balance"] = bank_balance(conn, shop_id, acc_id)
        d["txns"] = dicts(conn.execute(
            "SELECT * FROM bank_txns WHERE account_id=? ORDER BY date DESC, id DESC LIMIT 200", (acc_id,)).fetchall())
        return d
    finally:
        conn.close()


@app.post("/api/bank-accounts/{acc_id}/txns")
def add_bank_txn(acc_id: int, b: BankTxnIn, shop_id: int = Depends(shop_of)):
    if b.kind not in ("in", "out"):
        raise HTTPException(400, "kind must be 'in' or 'out'")
    conn = get_db()
    try:
        bank_balance(conn, shop_id, acc_id)  # validates account exists
        conn.execute(
            "INSERT INTO bank_txns(shop_id,account_id,date,kind,amount,note) VALUES (?,?,?,?,?,?)",
            (shop_id, acc_id, b.date or today(), b.kind, b.amount, b.note.strip()))
        conn.commit()
        return {"balance": bank_balance(conn, shop_id, acc_id)}
    finally:
        conn.close()


@app.delete("/api/bank-accounts/{acc_id}")
def delete_bank_account(acc_id: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM bank_txns WHERE account_id=?", (acc_id,))
        cur = conn.execute("DELETE FROM bank_accounts WHERE id=? AND shop_id=?", (acc_id, shop_id))
        conn.commit()
        if not cur.rowcount:
            raise HTTPException(404, "Bank account not found")
        return {"ok": True}
    finally:
        conn.close()


# ---------- parties ----------

@app.get("/api/parties")
def list_parties(type: str = "", shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        if type in ("customer", "supplier"):
            rows = conn.execute("SELECT * FROM parties WHERE shop_id=? AND type=? ORDER BY name",
                                (shop_id, type)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM parties WHERE shop_id=? ORDER BY name", (shop_id,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["balance"] = party_balance(conn, shop_id, r["id"], r["type"])
            out.append(d)
        return out
    finally:
        conn.close()


@app.post("/api/parties")
def add_party(b: PartyIn, shop_id: int = Depends(shop_of)):
    if b.type not in ("customer", "supplier"):
        raise HTTPException(400, "type must be customer or supplier")
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO parties(shop_id,name,phone,type,address) VALUES (?,?,?,?,?)",
            (shop_id, b.name, b.phone, b.type, b.address))
        conn.commit()
        row = conn.execute("SELECT * FROM parties WHERE id=?", (cur.lastrowid,)).fetchone()
        d = dict(row)
        d["balance"] = 0
        return d
    finally:
        conn.close()


@app.get("/api/parties/{pid}")
def party_detail(pid: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        p = conn.execute("SELECT * FROM parties WHERE id=? AND shop_id=?", (pid, shop_id)).fetchone()
        if not p:
            raise HTTPException(404, "Party not found")
        d = dict(p)
        d["balance"] = party_balance(conn, shop_id, pid, p["type"])
        bills = conn.execute(
            "SELECT id, bill_no, date, total, paid, (total-paid) AS baqaya FROM bills "
            "WHERE shop_id=? AND party_id=? ORDER BY date DESC, id DESC", (shop_id, pid)).fetchall()
        pays = conn.execute(
            "SELECT id, date, amount, direction, mode, note FROM payments "
            "WHERE shop_id=? AND party_id=? ORDER BY date DESC, id DESC", (shop_id, pid)).fetchall()
        hist = ([{"kind": "bill", **dict(r)} for r in bills] +
                [{"kind": "payment", **dict(r)} for r in pays])
        hist.sort(key=lambda x: (x["date"], x.get("id", 0)), reverse=True)
        d["history"] = hist
        return d
    finally:
        conn.close()


@app.post("/api/parties/{pid}/payments")
def add_payment(pid: int, b: PaymentIn, shop_id: int = Depends(shop_of)):
    if b.direction not in ("lena", "dena"):
        raise HTTPException(400, "direction must be 'lena' or 'dena'")
    conn = get_db()
    try:
        p = conn.execute("SELECT * FROM parties WHERE id=? AND shop_id=?", (pid, shop_id)).fetchone()
        if not p:
            raise HTTPException(404, "Party not found")
        if p["type"] == "customer" and b.direction != "lena":
            raise HTTPException(400, "For customers, direction can only be 'lena'")
        if p["type"] == "supplier" and b.direction != "dena":
            raise HTTPException(400, "For suppliers, direction can only be 'dena'")
        d = b.date or today()
        conn.execute(
            "INSERT INTO payments(shop_id,party_id,date,amount,direction,mode,note) VALUES (?,?,?,?,?,?,?)",
            (shop_id, pid, d, b.amount, b.direction, b.mode, b.note))
        # also record in cash book
        kind = "in" if b.direction == "lena" else "out"
        conn.execute(
            "INSERT INTO cash_txns(shop_id,date,kind,amount,category,note,ref) VALUES (?,?,?,?,?,?,?)",
            (shop_id, d, kind, b.amount, "party", f"{p['name']} — {'received' if kind=='in' else 'paid'}",
             f"party:{pid}"))
        conn.commit()
        return {"ok": True, "balance": party_balance(conn, shop_id, pid, p["type"])}
    finally:
        conn.close()


# ---------- bills ----------

@app.post("/api/bills")
def create_bill(b: BillIn, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        pname = b.party_name
        if b.party_id:
            p = conn.execute("SELECT id, name FROM parties WHERE id=? AND shop_id=?",
                             (b.party_id, shop_id)).fetchone()
            if not p:
                raise HTTPException(404, "Party not found")
            pname = p["name"]
        d = b.date or today()
        subtotal, cost_total = 0.0, 0.0
        lines = []
        for it in b.items:
            pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                              (it.product_id, shop_id)).fetchone()
            if not pr:
                raise HTTPException(404, f"Product #{it.product_id} not found")
            if pr["stock_qty"] < it.qty:
                raise HTTPException(400, f"'{pr['name']}' — not enough stock (available: {pr['stock_qty']})")
            price = it.price if it.price is not None else pr["sale_price"]
            lt = round(price * it.qty, 2)
            subtotal += lt
            cost_total += round(pr["purchase_price"] * it.qty, 2)
            lines.append((pr, it.qty, price, lt))
        subtotal = round(subtotal, 2)
        discount = round(min(b.discount, subtotal), 2)
        total = round(subtotal - discount, 2)
        paid = round(min(b.paid, total), 2)
        bill_no = next_bill_no(conn, shop_id)
        cur = conn.execute(
            """INSERT INTO bills(shop_id,bill_no,party_id,party_name,date,subtotal,discount,total,paid,mode)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (shop_id, bill_no, b.party_id, pname, d, subtotal, discount, total, paid, b.mode))
        bill_id = cur.lastrowid
        for pr, qty, price, lt in lines:
            conn.execute(
                "INSERT INTO bill_items(bill_id,product_id,product_name,qty,price,cost,total) VALUES (?,?,?,?,?,?,?)",
                (bill_id, pr["id"], pr["name"], qty, price, pr["purchase_price"], lt))
            conn.execute("UPDATE products SET stock_qty = stock_qty - ? WHERE id=?", (qty, pr["id"]))
        if paid > 0:
            conn.execute(
                "INSERT INTO cash_txns(shop_id,date,kind,amount,category,note,ref) VALUES (?,?,?,?,?,?,?)",
                (shop_id, d, "in", paid, "sale", f"Bill {bill_no}" + (f" — {pname}" if pname else ""),
                 f"bill:{bill_id}"))
        conn.commit()
        return get_bill(conn, shop_id, bill_id)
    finally:
        conn.close()


def get_bill(conn, shop_id: int, bill_id: int):
    bill = conn.execute("SELECT * FROM bills WHERE id=? AND shop_id=?", (bill_id, shop_id)).fetchone()
    if not bill:
        raise HTTPException(404, "Bill not found")
    d = dict(bill)
    d["items"] = dicts(conn.execute("SELECT * FROM bill_items WHERE bill_id=?", (bill_id,)).fetchall())
    d["baqaya"] = round(d["total"] - d["paid"], 2)
    shop = conn.execute("SELECT name, address, phone, receipt_header FROM shops WHERE id=?",
                        (shop_id,)).fetchone()
    d["shop"] = dict(shop)
    return d


@app.get("/api/bills")
def list_bills(date: str = "", shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        if date:
            rows = conn.execute("SELECT * FROM bills WHERE shop_id=? AND date=? ORDER BY id DESC",
                                (shop_id, date)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM bills WHERE shop_id=? ORDER BY date DESC, id DESC LIMIT 200",
                                (shop_id,)).fetchall()
        out = []
        for r in rows:
            dd = dict(r)
            dd["baqaya"] = round(dd["total"] - dd["paid"], 2)
            out.append(dd)
        return out
    finally:
        conn.close()


@app.get("/api/bills/{bill_id}")
def bill_detail(bill_id: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return get_bill(conn, shop_id, bill_id)
    finally:
        conn.close()


# ---------- cash book ----------

@app.get("/api/cash")
def cash_book(date: str = "", shop_id: int = Depends(shop_of)):
    d = date or today()
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM cash_txns WHERE shop_id=? AND date=? ORDER BY id DESC",
                            (shop_id, d)).fetchall()
        inn = conn.execute("SELECT COALESCE(SUM(amount),0) FROM cash_txns WHERE shop_id=? AND date=? AND kind='in'",
                           (shop_id, d)).fetchone()[0]
        out = conn.execute("SELECT COALESCE(SUM(amount),0) FROM cash_txns WHERE shop_id=? AND date=? AND kind='out'",
                           (shop_id, d)).fetchone()[0]
        return {"date": d, "txns": dicts(rows), "total_in": round(inn, 2),
                "total_out": round(out, 2), "net": round(inn - out, 2)}
    finally:
        conn.close()


@app.post("/api/cash")
def add_cash(b: CashIn, shop_id: int = Depends(shop_of)):
    if b.kind not in ("in", "out"):
        raise HTTPException(400, "kind must be 'in' or 'out'")
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO cash_txns(shop_id,date,kind,amount,category,note) VALUES (?,?,?,?,?,?)",
            (shop_id, b.date or today(), b.kind, b.amount, b.category or ("expense" if b.kind == "out" else "income"),
             b.note))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- reports ----------

@app.get("/api/reports/dashboard")
def dashboard(shop_id: int = Depends(shop_of)):
    t = today()
    conn = get_db()
    try:
        sale = conn.execute("SELECT COALESCE(SUM(total),0) FROM bills WHERE shop_id=? AND date=?",
                            (shop_id, t)).fetchone()[0]
        kharid = conn.execute("SELECT COALESCE(SUM(total),0) FROM purchases WHERE shop_id=? AND date=?",
                              (shop_id, t)).fetchone()[0]
        expense = conn.execute(
            "SELECT COALESCE(SUM(amount),0) FROM cash_txns WHERE shop_id=? AND date=? AND kind='out' AND category='expense'",
            (shop_id, t)).fetchone()[0]
        lena = conn.execute(
            """SELECT COALESCE(SUM(b.total - b.paid),0) - COALESCE(
                 (SELECT SUM(amount) FROM payments p JOIN parties pt ON pt.id=p.party_id
                  WHERE p.shop_id=? AND pt.type='customer' AND p.direction='lena'), 0)
               FROM bills b JOIN parties pt ON pt.id=b.party_id
               WHERE b.shop_id=? AND pt.type='customer'""",
            (shop_id, shop_id)).fetchone()[0]
        dena = conn.execute(
            """SELECT COALESCE(SUM(pu.total - pu.paid),0) - COALESCE(
                 (SELECT SUM(amount) FROM payments p JOIN parties pt ON pt.id=p.party_id
                  WHERE p.shop_id=? AND pt.type='supplier' AND p.direction='dena'), 0)
               FROM purchases pu JOIN parties pt ON pt.id=pu.party_id
               WHERE pu.shop_id=? AND pt.type='supplier'""",
            (shop_id, shop_id)).fetchone()[0]
        low = conn.execute(
            "SELECT id, name, stock_qty, low_stock_level, unit FROM products "
            "WHERE shop_id=? AND stock_qty <= low_stock_level ORDER BY stock_qty",
            (shop_id,)).fetchall()
        n_products = conn.execute("SELECT COUNT(*) FROM products WHERE shop_id=?", (shop_id,)).fetchone()[0]
        n_parties = conn.execute("SELECT COUNT(*) FROM parties WHERE shop_id=?", (shop_id,)).fetchone()[0]
        bank_rows = conn.execute("SELECT id, opening_balance FROM bank_accounts WHERE shop_id=?", (shop_id,)).fetchall()
        bank_total = 0.0
        for br in bank_rows:
            inn = conn.execute("SELECT COALESCE(SUM(amount),0) FROM bank_txns WHERE account_id=? AND kind='in'", (br["id"],)).fetchone()[0]
            out = conn.execute("SELECT COALESCE(SUM(amount),0) FROM bank_txns WHERE account_id=? AND kind='out'", (br["id"],)).fetchone()[0]
            bank_total += br["opening_balance"] + inn - out
        cash_in = conn.execute("SELECT COALESCE(SUM(amount),0) FROM cash_txns WHERE shop_id=? AND kind='in'", (shop_id,)).fetchone()[0]
        cash_out = conn.execute("SELECT COALESCE(SUM(amount),0) FROM cash_txns WHERE shop_id=? AND kind='out'", (shop_id,)).fetchone()[0]
        cash_in_hand = cash_in - cash_out
        recent = conn.execute(
            """SELECT 'bill' AS kind, bill_no AS ref, date, total AS amount, party_name AS name FROM bills WHERE shop_id=?
               UNION ALL
               SELECT 'purchase' AS kind, bill_no AS ref, date, total AS amount, party_name AS name FROM purchases WHERE shop_id=?
               ORDER BY date DESC, ref DESC LIMIT 8""",
            (shop_id, shop_id)).fetchall()
        return {
            "aaj_ki_sale": round(sale, 2), "aaj_ki_kharid": round(kharid, 2),
            "aaj_ka_kharcha": round(expense, 2),
            "kul_lena": round(lena, 2), "kul_dena": round(dena, 2),
            "bank_total": round(bank_total, 2), "cash_in_hand": round(cash_in_hand, 2),
            "low_stock": dicts(low), "products": n_products, "parties": n_parties,
            "recent": dicts(recent),
        }
    finally:
        conn.close()


@app.get("/api/reports/sales")
def sales_report(from_date: str, to_date: str = "", shop_id: int = Depends(shop_of)):
    to_date = to_date or today()
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT date, COUNT(*) AS bills, COALESCE(SUM(total),0) AS sale,
                      COALESCE(SUM(paid),0) AS wasool, COALESCE(SUM(total-paid),0) AS baqaya
               FROM bills WHERE shop_id=? AND date BETWEEN ? AND ? GROUP BY date ORDER BY date""",
            (shop_id, from_date, to_date)).fetchall()
        tot = conn.execute(
            "SELECT COUNT(*), COALESCE(SUM(total),0), COALESCE(SUM(paid),0) FROM bills "
            "WHERE shop_id=? AND date BETWEEN ? AND ?", (shop_id, from_date, to_date)).fetchone()
        return {"days": dicts(rows), "total": {"bills": tot[0], "sale": round(tot[1], 2),
                                               "wasool": round(tot[2], 2),
                                               "baqaya": round(tot[1] - tot[2], 2)}}
    finally:
        conn.close()


@app.get("/api/reports/profit")
def profit_report(from_date: str, to_date: str = "", shop_id: int = Depends(shop_of)):
    to_date = to_date or today()
    conn = get_db()
    try:
        r = conn.execute(
            """SELECT COALESCE(SUM(bi.total),0) AS revenue, COALESCE(SUM(bi.cost*bi.qty),0) AS cost
               FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
               WHERE b.shop_id=? AND b.date BETWEEN ? AND ?""",
            (shop_id, from_date, to_date)).fetchone()
        rev, cost = round(r[0], 2), round(r[1], 2)
        disc = conn.execute("SELECT COALESCE(SUM(discount),0) FROM bills WHERE shop_id=? AND date BETWEEN ? AND ?",
                            (shop_id, from_date, to_date)).fetchone()[0]
        top = conn.execute(
            """SELECT bi.product_name, SUM(bi.qty) AS qty, SUM(bi.total) AS revenue,
                      SUM(bi.total - bi.cost*bi.qty) AS profit
               FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
               WHERE b.shop_id=? AND b.date BETWEEN ? AND ?
               GROUP BY bi.product_name ORDER BY revenue DESC LIMIT 10""",
            (shop_id, from_date, to_date)).fetchall()
        return {"revenue": rev, "cost": cost, "discount": round(disc, 2),
                "profit": round(rev - cost - disc, 2), "top_products": dicts(top)}
    finally:
        conn.close()


@app.get("/api/reports/stock")
def stock_report(shop_id: int = Depends(shop_of)):
    """Stock report: per-product stock, purchase value, sale value."""
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT id, name, sku, barcode, category, stock_qty, low_stock_level, unit,
                      purchase_price, sale_price,
                      ROUND(stock_qty * purchase_price, 2) AS stock_value_cost,
                      ROUND(stock_qty * sale_price, 2) AS stock_value_sale
               FROM products WHERE shop_id=? ORDER BY name""", (shop_id,)).fetchall()
        tot_cost = conn.execute(
            "SELECT COALESCE(SUM(stock_qty * purchase_price),0) FROM products WHERE shop_id=?",
            (shop_id,)).fetchone()[0]
        tot_sale = conn.execute(
            "SELECT COALESCE(SUM(stock_qty * sale_price),0) FROM products WHERE shop_id=?",
            (shop_id,)).fetchone()[0]
        low_n = conn.execute(
            "SELECT COUNT(*) FROM products WHERE shop_id=? AND stock_qty <= low_stock_level",
            (shop_id,)).fetchone()[0]
        return {"items": dicts(rows), "total_cost_value": round(tot_cost, 2),
                "total_sale_value": round(tot_sale, 2), "low_count": low_n}
    finally:
        conn.close()


@app.get("/api/reports/outstanding")
def outstanding_report(type: str = "customer", shop_id: int = Depends(shop_of)):
    """Outstanding report: who owes / is owed, highest first."""
    if type not in ("customer", "supplier"):
        raise HTTPException(400, "type must be customer or supplier")
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM parties WHERE shop_id=? AND type=? ORDER BY name",
                            (shop_id, type)).fetchall()
        out = []
        total = 0.0
        for r in rows:
            bal = party_balance(conn, shop_id, r["id"], r["type"])
            if bal > 0:
                d = dict(r)
                d["balance"] = bal
                out.append(d)
                total += bal
        out.sort(key=lambda x: x["balance"], reverse=True)
        return {"type": type, "parties": out, "total": round(total, 2)}
    finally:
        conn.close()


@app.get("/api/reports/expenses")
def expenses_report(from_date: str, to_date: str = "", shop_id: int = Depends(shop_of)):
    """Expenses report: category-wise expenses."""
    to_date = to_date or today()
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT category, COUNT(*) AS n, COALESCE(SUM(amount),0) AS total
               FROM cash_txns WHERE shop_id=? AND kind='out' AND category != 'adjustment'
               AND date BETWEEN ? AND ?
               GROUP BY category ORDER BY total DESC""",
            (shop_id, from_date, to_date)).fetchall()
        tot = conn.execute(
            "SELECT COALESCE(SUM(amount),0) FROM cash_txns WHERE shop_id=? AND kind='out' AND category != 'adjustment' AND date BETWEEN ? AND ?",
            (shop_id, from_date, to_date)).fetchone()[0]
        return {"by_category": dicts(rows), "total": round(tot, 2)}
    finally:
        conn.close()


@app.get("/api/reports/daybook")
def daybook(date: str = "", shop_id: int = Depends(shop_of)):
    """Day Book: all of the day\u2019s transactions in one place."""
    d = date or today()
    conn = get_db()
    try:
        items = []
        for r in conn.execute(
                "SELECT bill_no AS ref, party_name AS name, total AS amount, paid FROM bills WHERE shop_id=? AND date=?",
                (shop_id, d)).fetchall():
            items.append({"kind": "sale", "ref": r["ref"], "tafseel": f"Bill {r['ref']}" + (f" — {r['name']}" if r["name"] else ""),
                          "amount": r["amount"], "date": d})
        for r in conn.execute(
                "SELECT bill_no AS ref, party_name AS name, total AS amount FROM purchases WHERE shop_id=? AND date=?",
                (shop_id, d)).fetchall():
            items.append({"kind": "purchase", "ref": r["ref"], "tafseel": f"Purchase {r['ref']}" + (f" — {r['name']}" if r["name"] else ""),
                          "amount": r["amount"], "date": d})
        for r in conn.execute(
                """SELECT p.amount, p.direction, p.note, pt.name FROM payments p
                   JOIN parties pt ON pt.id=p.party_id WHERE p.shop_id=? AND p.date=?""",
                (shop_id, d)).fetchall():
            items.append({"kind": "payment", "ref": "", "tafseel":
                          f"{'Collection' if r['direction'] == 'lena' else 'Payment'} — {r['name']}" + (f" ({r['note']})" if r["note"] else ""),
                          "amount": r["amount"], "date": d})
        for r in conn.execute(
                "SELECT kind, category, note, amount FROM cash_txns WHERE shop_id=? AND date=? AND ref NOT LIKE 'bill:%' AND ref NOT LIKE 'purchase:%' AND ref NOT LIKE 'party:%' AND ref NOT LIKE 'adjust:%'",
                (shop_id, d)).fetchall():
            items.append({"kind": "cash_" + r["kind"], "ref": "",
                          "tafseel": f"{'Cash In' if r['kind'] == 'in' else 'Expense'} — {r['note'] or CAT_LABELS.get(r['category'], r['category'])}",
                          "amount": r["amount"], "date": d})
        return {"date": d, "items": items, "count": len(items)}
    finally:
        conn.close()


# ---------- frontend (PWA) ----------

@app.get("/")
def index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.on_event("startup")
def startup():
    init_db()
    # Render jaisi fresh deploy par demo seed (sirf tab jab koi shop na ho).
    # Subprocess me chalao taake seed ka connection app process me leak na ho
    # (leaked write-lock baad me har DB write ko hang kar deta hai).
    try:
        conn = get_db()
        n = conn.execute("SELECT COUNT(*) FROM shops").fetchone()[0]
        conn.close()
        if n == 0:
            import subprocess, sys, os as _os
            here = _os.path.dirname(__file__)
            subprocess.run([sys.executable, _os.path.join(here, "seed.py")],
                           check=True, timeout=180, cwd=here,
                           capture_output=True, text=True)
            print("auto-seed done")
    except Exception as e:
        print("auto-seed skip:", e)
