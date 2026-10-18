"""Karobar — Phase 1 Mobile MVP API (FastAPI + SQLite, multi-shop)."""
import csv
import io
import os
from datetime import date
from typing import Optional

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from auth import hash_password, new_token, verify_password
from db import dicts, get_db, init_db

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

app = FastAPI(title="Karobar API")


@app.middleware("http")
async def rbac(request, call_next):
    """Staff roles: viewer = read-only; cashier = no settings/staff mgmt, no deletes.
    Public: /api/auth/*, /api/store/* (online store)."""
    p = request.url.path
    if (request.method not in ("GET", "HEAD", "OPTIONS")
            and p.startswith("/api/")
            and not p.startswith("/api/auth/")
            and not p.startswith("/api/store/")):
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            conn = get_db()
            try:
                row = conn.execute("SELECT role FROM sessions WHERE token=?", (auth[7:],)).fetchone()
            finally:
                conn.close()
            role = (row["role"] if row else "") or "owner"
            if role == "viewer":
                return JSONResponse({"detail": "Viewers cannot make changes"}, status_code=403)
            if role == "cashier" and (p == "/api/settings" or p.startswith("/api/staff")
                                      or request.method == "DELETE"):
                return JSONResponse({"detail": "Cashiers cannot do this"}, status_code=403)
    return await call_next(request)

# display labels for cash categories (DB stores short codes)
CAT_LABELS = {"expense": "Expense", "income": "Income", "sale": "Sale",
              "party": "Party", "purchase": "Purchase", "adjustment": "Adjustment"}


# ---------- helpers ----------

def today() -> str:
    return date.today().isoformat()


def _shop_from_token(token: str) -> Optional[int]:
    conn = get_db()
    try:
        row = conn.execute("SELECT shop_id FROM sessions WHERE token=?", (token,)).fetchone()
        return row["shop_id"] if row else None
    finally:
        conn.close()


def shop_of(authorization: Optional[str] = Header(default=None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Login required")
    shop_id = _shop_from_token(authorization[7:])
    if not shop_id:
        raise HTTPException(401, "Session expired, please log in again")
    return shop_id


def actor_of(authorization: Optional[str] = Header(default=None)) -> dict:
    """Kaun login hai: owner ya staff (cashier/viewer)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Login required")
    token = authorization[7:]
    conn = get_db()
    try:
        row = conn.execute("SELECT shop_id, staff_id, role FROM sessions WHERE token=?", (token,)).fetchone()
        if not row:
            raise HTTPException(401, "Session expired, please log in again")
        return {"shop_id": row["shop_id"], "staff_id": row["staff_id"], "role": row["role"] or "owner"}
    finally:
        conn.close()


def require_owner(actor: dict = Depends(actor_of)) -> dict:
    if actor["role"] != "owner":
        raise HTTPException(403, "Only the shop owner can do this")
    return actor


def party_balance(conn, shop_id: int, party_id: int, ptype: str) -> float:
    """Deterministic balance. customer: + means RECEIVABLE from customer. supplier: + means PAYABLE to supplier.
    Credit notes (sale wapsi) khata kam karte hain; debit notes (purchase wapsi) bhi."""
    if ptype == "customer":
        billed = conn.execute(
            "SELECT COALESCE(SUM(total - paid), 0) FROM bills WHERE shop_id=? AND party_id=?",
            (shop_id, party_id)).fetchone()[0]
        credited = conn.execute(
            "SELECT COALESCE(SUM(total), 0) FROM credit_notes WHERE shop_id=? AND party_id=?",
            (shop_id, party_id)).fetchone()[0]
        got = conn.execute(
            "SELECT COALESCE(SUM(amount),0) FROM payments WHERE shop_id=? AND party_id=? AND direction='lena'",
            (shop_id, party_id)).fetchone()[0]
        return round(billed - credited - got, 2)
    else:
        billed = conn.execute(
            "SELECT COALESCE(SUM(total - paid), 0) FROM purchases WHERE shop_id=? AND party_id=?",
            (shop_id, party_id)).fetchone()[0]
        debited = conn.execute(
            "SELECT COALESCE(SUM(total), 0) FROM debit_notes WHERE shop_id=? AND party_id=?",
            (shop_id, party_id)).fetchone()[0]
        paid_out = conn.execute(
            "SELECT COALESCE(SUM(amount),0) FROM payments WHERE shop_id=? AND party_id=? AND direction='dena'",
            (shop_id, party_id)).fetchone()[0]
        return round(billed - debited - paid_out, 2)


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
    credit_limit: float = 0  # 0 = no limit


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
    serials: list[str] = []  # optional: chosen serial/IMEI numbers (len must equal qty)


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
    invoice_theme: str = "classic"  # classic | modern | compact


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
        if row and verify_password(b.password, row["password_hash"]):
            token = new_token()
            conn.execute("INSERT INTO sessions(token, shop_id, staff_id, role) VALUES (?,?,NULL,'owner')",
                         (token, row["id"]))
            conn.commit()
            return {"token": token, "shop_id": row["id"], "role": "owner"}
        # staff login (same form; phone unique per shop)
        s = conn.execute("SELECT id, shop_id, password_hash, role, active FROM staff WHERE phone=?",
                         (b.phone,)).fetchone()
        if s and s["active"] and verify_password(b.password, s["password_hash"]):
            token = new_token()
            conn.execute("INSERT INTO sessions(token, shop_id, staff_id, role) VALUES (?,?,?,?)",
                         (token, s["shop_id"], s["id"], s["role"]))
            conn.commit()
            return {"token": token, "shop_id": s["shop_id"], "role": s["role"]}
        raise HTTPException(401, "Number or password is incorrect")
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
def me(actor: dict = Depends(actor_of)):
    shop_id = actor["shop_id"]
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, name, owner_name, phone, email, address, city, receipt_header, invoice_theme FROM shops WHERE id=?",
            (shop_id,)).fetchone()
        d = dict(row)
        d.setdefault("invoice_theme", "classic")
        d["role"] = actor["role"]
        d["staff_name"] = ""
        if actor["staff_id"]:
            s = conn.execute("SELECT name FROM staff WHERE id=?", (actor["staff_id"],)).fetchone()
            if s:
                d["staff_name"] = s["name"]
        ph = conn.execute("SELECT passcode_hash FROM shops WHERE id=?", (shop_id,)).fetchone()
        d["passcode_set"] = bool(ph and ph["passcode_hash"])
        return d
    finally:
        conn.close()


# ---------- staff (owner ke neeche) ----------

class StaffIn(BaseModel):
    name: str = Field(min_length=2)
    phone: str = Field(min_length=10)
    password: str = Field(min_length=4)
    role: str = "cashier"  # cashier | viewer


class StaffUpdate(BaseModel):
    name: str = ""
    role: str = ""
    active: Optional[int] = None


@app.post("/api/staff")
def add_staff(b: StaffIn, actor: dict = Depends(require_owner)):
    if b.role not in ("cashier", "viewer"):
        raise HTTPException(400, "Role must be cashier or viewer")
    conn = get_db()
    try:
        exists = conn.execute("SELECT id FROM staff WHERE shop_id=? AND phone=?",
                              (actor["shop_id"], b.phone,)).fetchone()
        if exists:
            raise HTTPException(400, "This number is already registered as staff")
        cur = conn.execute(
            "INSERT INTO staff(shop_id,name,phone,password_hash,role) VALUES (?,?,?,?,?)",
            (actor["shop_id"], b.name, b.phone, hash_password(b.password), b.role))
        conn.commit()
        row = conn.execute("SELECT id, name, phone, role, active FROM staff WHERE id=?",
                           (cur.lastrowid,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.get("/api/staff")
def list_staff(actor: dict = Depends(require_owner)):
    conn = get_db()
    try:
        return dicts(conn.execute(
            "SELECT id, name, phone, role, active FROM staff WHERE shop_id=? ORDER BY name",
            (actor["shop_id"],)).fetchall())
    finally:
        conn.close()


@app.put("/api/staff/{sid}")
def update_staff(sid: int, b: StaffUpdate, actor: dict = Depends(require_owner)):
    conn = get_db()
    try:
        s = conn.execute("SELECT id FROM staff WHERE id=? AND shop_id=?", (sid, actor["shop_id"])).fetchone()
        if not s:
            raise HTTPException(404, "Staff not found")
        data = b.model_dump(exclude_unset=True)
        allowed = {}
        if data.get("name", "").strip():
            allowed["name"] = data["name"].strip()
        if data.get("role") in ("cashier", "viewer"):
            allowed["role"] = data["role"]
        if data.get("active") in (0, 1):
            allowed["active"] = data["active"]
        if allowed:
            conn.execute(f"UPDATE staff SET {', '.join(f'{k}=?' for k in allowed)} WHERE id=?",
                         tuple(allowed.values()) + (sid,))
            conn.commit()
        row = conn.execute("SELECT id, name, phone, role, active FROM staff WHERE id=?", (sid,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@app.delete("/api/staff/{sid}")
def delete_staff(sid: int, actor: dict = Depends(require_owner)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM sessions WHERE staff_id=?", (sid,))
        conn.execute("DELETE FROM staff WHERE id=? AND shop_id=?", (sid, actor["shop_id"]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.put("/api/settings")
def update_settings(b: SettingsIn, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        # sirf bheje gaye fields update hon (frontend hamesha sab bhejta hai,
        # lekin API ko partial update bhi sahi handle karna chahiye)
        data = b.model_dump(exclude_unset=True)
        if "invoice_theme" in data and data["invoice_theme"] not in ("classic", "modern", "compact"):
            data["invoice_theme"] = "classic"
        allowed = {"name", "address", "phone", "receipt_header", "invoice_theme"}
        sets = [f"{k}=?" for k in data if k in allowed]
        if sets:
            conn.execute(f"UPDATE shops SET {', '.join(sets)} WHERE id=?",
                         tuple(data[k] for k in data if k in allowed) + (shop_id,))
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
        pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?", (pid, shop_id)).fetchone()
        if not pr:
            raise HTTPException(404, "Product not found")
        _to_bin(conn, shop_id, "product", pid, pr["name"], dict(pr))
        conn.execute("DELETE FROM serials WHERE product_id=? AND shop_id=?", (pid, shop_id))
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
            lines.append((pr, it.qty, price, lt, [x.strip() for x in (it.serials or []) if x.strip()]))
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
        for pr, qty, price, lt, _serials in lines:
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
            lines.append((pr, it.qty, price, lt, [x.strip() for x in (it.serials or []) if x.strip()]))
        subtotal = round(subtotal, 2)
        discount = round(min(b.discount, subtotal), 2)
        total = round(subtotal - discount, 2)
        est_no = next_est_no(conn, shop_id)
        cur = conn.execute(
            """INSERT INTO estimates(shop_id,est_no,party_id,party_name,date,subtotal,discount,total)
               VALUES (?,?,?,?,?,?,?,?)""",
            (shop_id, est_no, b.party_id, pname, d, subtotal, discount, total))
        est_id = cur.lastrowid
        for pr, qty, price, lt, _serials in lines:
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


# ---------- orders (sale + purchase) ----------

class OrderItemIn(BaseModel):
    product_id: int
    qty: float = Field(gt=0)
    price: Optional[float] = None
    serials: list[str] = []  # credit note (wapsi) par wapas aane wale serials


class OrderIn(BaseModel):
    party_id: Optional[int] = None
    party_name: str = ""
    date: str = ""
    items: list[OrderItemIn] = Field(min_length=1)
    discount: float = 0


def next_sale_order_no(conn, shop_id: int) -> str:
    n = conn.execute("SELECT COUNT(*) FROM sale_orders WHERE shop_id=?", (shop_id,)).fetchone()[0]
    return f"SO-{n + 1:05d}"


def next_purchase_order_no(conn, shop_id: int) -> str:
    n = conn.execute("SELECT COUNT(*) FROM purchase_orders WHERE shop_id=?", (shop_id,)).fetchone()[0]
    return f"PO-{n + 1:05d}"


def get_sale_order(conn, shop_id: int, oid: int):
    o = conn.execute("SELECT * FROM sale_orders WHERE id=? AND shop_id=?", (oid, shop_id)).fetchone()
    if not o:
        raise HTTPException(404, "Sale order not found")
    d = dict(o)
    d["items"] = dicts(conn.execute("SELECT * FROM sale_order_items WHERE order_id=?", (oid,)).fetchall())
    return d


def get_purchase_order(conn, shop_id: int, oid: int):
    o = conn.execute("SELECT * FROM purchase_orders WHERE id=? AND shop_id=?", (oid, shop_id)).fetchone()
    if not o:
        raise HTTPException(404, "Purchase order not found")
    d = dict(o)
    d["items"] = dicts(conn.execute("SELECT * FROM purchase_order_items WHERE order_id=?", (oid,)).fetchall())
    return d


def _order_party(conn, shop_id: int, b: OrderIn) -> str:
    pname = b.party_name
    if b.party_id:
        p = conn.execute("SELECT id, name FROM parties WHERE id=? AND shop_id=?",
                         (b.party_id, shop_id)).fetchone()
        if not p:
            raise HTTPException(404, "Party not found")
        pname = p["name"]
    return pname


def _order_lines(conn, shop_id: int, b: OrderIn, price_field: str):
    subtotal = 0.0
    lines = []
    for it in b.items:
        pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                          (it.product_id, shop_id)).fetchone()
        if not pr:
            raise HTTPException(404, f"Product #{it.product_id} not found")
        price = it.price if it.price is not None else pr[price_field]
        lt = round(price * it.qty, 2)
        subtotal += lt
        lines.append((pr, it.qty, price, lt, [x.strip() for x in (it.serials or []) if x.strip()]))
    subtotal = round(subtotal, 2)
    discount = round(min(b.discount, subtotal), 2)
    return subtotal, discount, round(subtotal - discount, 2), lines


def _sell_serials(conn, shop_id: int, product_id: int, serials: list, qty: float, bill_id: int):
    """Sale par serials validate karo aur 'sold' mark karo (deterministic)."""
    serials = [str(x).strip() for x in (serials or []) if str(x).strip()]
    if not serials:
        return
    if int(qty) != qty or len(serials) != int(qty):
        raise HTTPException(400, "Serial count must equal the quantity")
    for sn in serials:
        r = conn.execute("SELECT id, status FROM serials WHERE shop_id=? AND product_id=? AND serial_no=?",
                         (shop_id, product_id, sn)).fetchone()
        if not r:
            raise HTTPException(400, f"Serial '{sn}' is not registered for this product")
        if r["status"] != "in_stock":
            raise HTTPException(400, f"Serial '{sn}' is already sold")
    for sn in serials:
        conn.execute("UPDATE serials SET status='sold', bill_id=? WHERE shop_id=? AND product_id=? AND serial_no=?",
                     (bill_id, shop_id, product_id, sn))


def _return_serials(conn, shop_id: int, product_id: int, serials: list, qty: float):
    """Credit note (sale wapsi) par serials wapas 'in_stock' karo."""
    serials = [str(x).strip() for x in (serials or []) if str(x).strip()]
    if not serials:
        return
    if int(qty) != qty or len(serials) != int(qty):
        raise HTTPException(400, "Serial count must equal the quantity")
    for sn in serials:
        r = conn.execute("SELECT id, status FROM serials WHERE shop_id=? AND product_id=? AND serial_no=?",
                         (shop_id, product_id, sn)).fetchone()
        if not r:
            raise HTTPException(400, f"Serial '{sn}' is not registered for this product")
        if r["status"] != "sold":
            raise HTTPException(400, f"Serial '{sn}' is not marked as sold")
    for sn in serials:
        conn.execute("UPDATE serials SET status='in_stock', bill_id=NULL WHERE shop_id=? AND product_id=? AND serial_no=?",
                     (shop_id, product_id, sn))


@app.post("/api/sale-orders")
def create_sale_order(b: OrderIn, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        pname = _order_party(conn, shop_id, b)
        d = b.date or today()
        subtotal, discount, total, lines = _order_lines(conn, shop_id, b, "sale_price")
        cur = conn.execute(
            """INSERT INTO sale_orders(shop_id,order_no,party_id,party_name,date,subtotal,discount,total)
               VALUES (?,?,?,?,?,?,?,?)""",
            (shop_id, next_sale_order_no(conn, shop_id), b.party_id, pname, d, subtotal, discount, total))
        oid = cur.lastrowid
        for pr, qty, price, lt, _serials in lines:
            conn.execute(
                "INSERT INTO sale_order_items(order_id,product_id,product_name,qty,price,total) VALUES (?,?,?,?,?,?)",
                (oid, pr["id"], pr["name"], qty, price, lt))
        conn.commit()
        return get_sale_order(conn, shop_id, oid)
    finally:
        conn.close()


@app.get("/api/sale-orders")
def list_sale_orders(shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return dicts(conn.execute(
            "SELECT * FROM sale_orders WHERE shop_id=? ORDER BY date DESC, id DESC LIMIT 200", (shop_id,)).fetchall())
    finally:
        conn.close()


@app.get("/api/sale-orders/{oid}")
def sale_order_detail(oid: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return get_sale_order(conn, shop_id, oid)
    finally:
        conn.close()


@app.post("/api/sale-orders/{oid}/convert")
def convert_sale_order(oid: int, shop_id: int = Depends(shop_of)):
    """Sale order -> final bill (stock decreases)."""
    conn = get_db()
    try:
        o = conn.execute("SELECT * FROM sale_orders WHERE id=? AND shop_id=?", (oid, shop_id)).fetchone()
        if not o:
            raise HTTPException(404, "Sale order not found")
        if o["status"] != "pending":
            raise HTTPException(400, "Only pending orders can be converted")
        items = conn.execute("SELECT * FROM sale_order_items WHERE order_id=?", (oid,)).fetchall()
        for it in items:
            pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                              (it["product_id"], shop_id)).fetchone()
            if pr and pr["stock_qty"] < it["qty"]:
                raise HTTPException(400, f"'{pr['name']}' — not enough stock (available: {pr['stock_qty']})")
        bill_no = next_bill_no(conn, shop_id)
        cur = conn.execute(
            """INSERT INTO bills(shop_id,bill_no,party_id,party_name,date,subtotal,discount,total,paid,mode)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (shop_id, bill_no, o["party_id"], o["party_name"], today(),
             o["subtotal"], o["discount"], o["total"], 0, "cash"))
        bill_id = cur.lastrowid
        for it in items:
            pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                              (it["product_id"], shop_id)).fetchone()
            cost = pr["purchase_price"] if pr else 0
            conn.execute(
                "INSERT INTO bill_items(bill_id,product_id,product_name,qty,price,cost,total) VALUES (?,?,?,?,?,?,?)",
                (bill_id, it["product_id"], it["product_name"], it["qty"], it["price"], cost, it["total"]))
            if pr:
                conn.execute("UPDATE products SET stock_qty = stock_qty - ? WHERE id=?", (it["qty"], pr["id"]))
        conn.execute("UPDATE sale_orders SET status='converted' WHERE id=?", (oid,))
        conn.commit()
        return get_bill(conn, shop_id, bill_id)
    finally:
        conn.close()


@app.put("/api/sale-orders/{oid}/cancel")
def cancel_sale_order(oid: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        o = conn.execute("SELECT * FROM sale_orders WHERE id=? AND shop_id=?", (oid, shop_id)).fetchone()
        if not o:
            raise HTTPException(404, "Sale order not found")
        if o["status"] != "pending":
            raise HTTPException(400, "Only pending orders can be cancelled")
        conn.execute("UPDATE sale_orders SET status='cancelled' WHERE id=?", (oid,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.post("/api/purchase-orders")
def create_purchase_order(b: OrderIn, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        pname = _order_party(conn, shop_id, b)
        d = b.date or today()
        subtotal, discount, total, lines = _order_lines(conn, shop_id, b, "purchase_price")
        cur = conn.execute(
            """INSERT INTO purchase_orders(shop_id,order_no,party_id,party_name,date,subtotal,discount,total)
               VALUES (?,?,?,?,?,?,?,?)""",
            (shop_id, next_purchase_order_no(conn, shop_id), b.party_id, pname, d, subtotal, discount, total))
        oid = cur.lastrowid
        for pr, qty, price, lt, _serials in lines:
            conn.execute(
                "INSERT INTO purchase_order_items(order_id,product_id,product_name,qty,price,total) VALUES (?,?,?,?,?,?)",
                (oid, pr["id"], pr["name"], qty, price, lt))
        conn.commit()
        return get_purchase_order(conn, shop_id, oid)
    finally:
        conn.close()


@app.get("/api/purchase-orders")
def list_purchase_orders(shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return dicts(conn.execute(
            "SELECT * FROM purchase_orders WHERE shop_id=? ORDER BY date DESC, id DESC LIMIT 200", (shop_id,)).fetchall())
    finally:
        conn.close()


@app.get("/api/purchase-orders/{oid}")
def purchase_order_detail(oid: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return get_purchase_order(conn, shop_id, oid)
    finally:
        conn.close()


@app.post("/api/purchase-orders/{oid}/convert")
def convert_purchase_order(oid: int, shop_id: int = Depends(shop_of)):
    """Purchase order -> purchase bill (stock increases)."""
    conn = get_db()
    try:
        o = conn.execute("SELECT * FROM purchase_orders WHERE id=? AND shop_id=?", (oid, shop_id)).fetchone()
        if not o:
            raise HTTPException(404, "Purchase order not found")
        if o["status"] != "pending":
            raise HTTPException(400, "Only pending orders can be converted")
        items = conn.execute("SELECT * FROM purchase_order_items WHERE order_id=?", (oid,)).fetchall()
        bill_no = next_purchase_no(conn, shop_id)
        cur = conn.execute(
            """INSERT INTO purchases(shop_id,bill_no,party_id,party_name,date,subtotal,discount,total,paid,mode)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (shop_id, bill_no, o["party_id"], o["party_name"], today(),
             o["subtotal"], o["discount"], o["total"], 0, "cash"))
        pur_id = cur.lastrowid
        for it in items:
            pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                              (it["product_id"], shop_id)).fetchone()
            conn.execute(
                "INSERT INTO purchase_items(purchase_id,product_id,product_name,qty,price,total) VALUES (?,?,?,?,?,?)",
                (pur_id, it["product_id"], it["product_name"], it["qty"], it["price"], it["total"]))
            if pr:
                conn.execute("UPDATE products SET stock_qty = stock_qty + ?, purchase_price = ? WHERE id=?",
                             (it["qty"], it["price"], pr["id"]))
        conn.execute("UPDATE purchase_orders SET status='converted' WHERE id=?", (oid,))
        conn.commit()
        return get_purchase(conn, shop_id, pur_id)
    finally:
        conn.close()


@app.put("/api/purchase-orders/{oid}/cancel")
def cancel_purchase_order(oid: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        o = conn.execute("SELECT * FROM purchase_orders WHERE id=? AND shop_id=?", (oid, shop_id)).fetchone()
        if not o:
            raise HTTPException(404, "Purchase order not found")
        if o["status"] != "pending":
            raise HTTPException(400, "Only pending orders can be cancelled")
        conn.execute("UPDATE purchase_orders SET status='cancelled' WHERE id=?", (oid,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- credit / debit notes ----------

class NoteIn(BaseModel):
    party_id: Optional[int] = None
    party_name: str = ""
    date: str = ""
    items: list[OrderItemIn] = Field(min_length=1)
    discount: float = 0
    reason: str = ""
    bill_id: Optional[int] = None  # optional link: credit->bill, debit->purchase


def next_credit_note_no(conn, shop_id: int) -> str:
    n = conn.execute("SELECT COUNT(*) FROM credit_notes WHERE shop_id=?", (shop_id,)).fetchone()[0]
    return f"CN-{n + 1:05d}"


def next_debit_note_no(conn, shop_id: int) -> str:
    n = conn.execute("SELECT COUNT(*) FROM debit_notes WHERE shop_id=?", (shop_id,)).fetchone()[0]
    return f"DN-{n + 1:05d}"


def get_credit_note(conn, shop_id: int, nid: int):
    n = conn.execute("SELECT * FROM credit_notes WHERE id=? AND shop_id=?", (nid, shop_id)).fetchone()
    if not n:
        raise HTTPException(404, "Credit note not found")
    d = dict(n)
    d["items"] = dicts(conn.execute("SELECT * FROM credit_note_items WHERE note_id=?", (nid,)).fetchall())
    return d


def get_debit_note(conn, shop_id: int, nid: int):
    n = conn.execute("SELECT * FROM debit_notes WHERE id=? AND shop_id=?", (nid, shop_id)).fetchone()
    if not n:
        raise HTTPException(404, "Debit note not found")
    d = dict(n)
    d["items"] = dicts(conn.execute("SELECT * FROM debit_note_items WHERE note_id=?", (nid,)).fetchall())
    return d


@app.post("/api/credit-notes")
def create_credit_note(b: NoteIn, shop_id: int = Depends(shop_of)):
    """Credit note (sale wapsi): customer ka khata kam hota hai, stock wapas barhta hai."""
    conn = get_db()
    try:
        pname = _order_party(conn, shop_id, b)
        d = b.date or today()
        subtotal, discount, total, lines = _order_lines(conn, shop_id, b, "sale_price")
        cur = conn.execute(
            """INSERT INTO credit_notes(shop_id,note_no,party_id,party_name,bill_id,date,subtotal,discount,total,reason)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (shop_id, next_credit_note_no(conn, shop_id), b.party_id, pname, b.bill_id, d,
             subtotal, discount, total, b.reason))
        nid = cur.lastrowid
        for pr, qty, price, lt, _serials in lines:
            conn.execute(
                "INSERT INTO credit_note_items(note_id,product_id,product_name,qty,price,total) VALUES (?,?,?,?,?,?)",
                (nid, pr["id"], pr["name"], qty, price, lt))
            conn.execute("UPDATE products SET stock_qty = stock_qty + ? WHERE id=?", (qty, pr["id"]))
            _return_serials(conn, shop_id, pr["id"], _serials, qty)
        conn.commit()
        return get_credit_note(conn, shop_id, nid)
    finally:
        conn.close()


@app.get("/api/credit-notes")
def list_credit_notes(shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return dicts(conn.execute(
            "SELECT * FROM credit_notes WHERE shop_id=? ORDER BY date DESC, id DESC LIMIT 200", (shop_id,)).fetchall())
    finally:
        conn.close()


@app.get("/api/credit-notes/{nid}")
def credit_note_detail(nid: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return get_credit_note(conn, shop_id, nid)
    finally:
        conn.close()


@app.post("/api/debit-notes")
def create_debit_note(b: NoteIn, shop_id: int = Depends(shop_of)):
    """Debit note (purchase wapsi): supplier ka khata kam hota hai, stock wapas ghatta hai."""
    conn = get_db()
    try:
        pname = _order_party(conn, shop_id, b)
        d = b.date or today()
        subtotal, discount, total, lines = _order_lines(conn, shop_id, b, "purchase_price")
        # stock check: wapas kiya samaan stock me hona chahiye
        for pr, qty, price, lt, _serials in lines:
            if pr["stock_qty"] < qty:
                raise HTTPException(400, f"'{pr['name']}' — not enough stock to return (available: {pr['stock_qty']})")
        cur = conn.execute(
            """INSERT INTO debit_notes(shop_id,note_no,party_id,party_name,purchase_id,date,subtotal,discount,total,reason)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (shop_id, next_debit_note_no(conn, shop_id), b.party_id, pname, b.bill_id, d,
             subtotal, discount, total, b.reason))
        nid = cur.lastrowid
        for pr, qty, price, lt, _serials in lines:
            conn.execute(
                "INSERT INTO debit_note_items(note_id,product_id,product_name,qty,price,total) VALUES (?,?,?,?,?,?)",
                (nid, pr["id"], pr["name"], qty, price, lt))
            conn.execute("UPDATE products SET stock_qty = stock_qty - ? WHERE id=?", (qty, pr["id"]))
        conn.commit()
        return get_debit_note(conn, shop_id, nid)
    finally:
        conn.close()


@app.get("/api/debit-notes")
def list_debit_notes(shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return dicts(conn.execute(
            "SELECT * FROM debit_notes WHERE shop_id=? ORDER BY date DESC, id DESC LIMIT 200", (shop_id,)).fetchall())
    finally:
        conn.close()


@app.get("/api/debit-notes/{nid}")
def debit_note_detail(nid: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return get_debit_note(conn, shop_id, nid)
    finally:
        conn.close()


# ---------- proforma invoice ----------

def next_pf_no(conn, shop_id: int) -> str:
    n = conn.execute("SELECT COUNT(*) FROM proformas WHERE shop_id=?", (shop_id,)).fetchone()[0]
    return f"PF-{n + 1:05d}"


def get_proforma(conn, shop_id: int, pf_id: int):
    p = conn.execute("SELECT * FROM proformas WHERE id=? AND shop_id=?", (pf_id, shop_id)).fetchone()
    if not p:
        raise HTTPException(404, "Proforma not found")
    d = dict(p)
    d["items"] = dicts(conn.execute("SELECT * FROM proforma_items WHERE pf_id=?", (pf_id,)).fetchall())
    return d


@app.post("/api/proformas")
def create_proforma(b: OrderIn, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        pname = _order_party(conn, shop_id, b)
        d = b.date or today()
        subtotal, discount, total, lines = _order_lines(conn, shop_id, b, "sale_price")
        cur = conn.execute(
            """INSERT INTO proformas(shop_id,pf_no,party_id,party_name,date,subtotal,discount,total)
               VALUES (?,?,?,?,?,?,?,?)""",
            (shop_id, next_pf_no(conn, shop_id), b.party_id, pname, d, subtotal, discount, total))
        pf_id = cur.lastrowid
        for pr, qty, price, lt, _serials in lines:
            conn.execute(
                "INSERT INTO proforma_items(pf_id,product_id,product_name,qty,price,total) VALUES (?,?,?,?,?,?)",
                (pf_id, pr["id"], pr["name"], qty, price, lt))
        conn.commit()
        return get_proforma(conn, shop_id, pf_id)
    finally:
        conn.close()


@app.get("/api/proformas")
def list_proformas(shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return dicts(conn.execute(
            "SELECT * FROM proformas WHERE shop_id=? ORDER BY date DESC, id DESC LIMIT 200", (shop_id,)).fetchall())
    finally:
        conn.close()


@app.get("/api/proformas/{pf_id}")
def proforma_detail(pf_id: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return get_proforma(conn, shop_id, pf_id)
    finally:
        conn.close()


@app.post("/api/proformas/{pf_id}/convert")
def convert_proforma(pf_id: int, shop_id: int = Depends(shop_of)):
    """Convert a proforma to a final bill (stock decreases, bill is created)."""
    conn = get_db()
    try:
        p = conn.execute("SELECT * FROM proformas WHERE id=? AND shop_id=?", (pf_id, shop_id)).fetchone()
        if not p:
            raise HTTPException(404, "Proforma not found")
        if p["status"] != "pending":
            raise HTTPException(400, "This proforma has already been converted to a bill")
        items = conn.execute("SELECT * FROM proforma_items WHERE pf_id=?", (pf_id,)).fetchall()
        for it in items:
            pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                              (it["product_id"], shop_id)).fetchone()
            if pr and pr["stock_qty"] < it["qty"]:
                raise HTTPException(400, f"'{pr['name']}' — not enough stock (available: {pr['stock_qty']})")
        bill_no = next_bill_no(conn, shop_id)
        cur = conn.execute(
            """INSERT INTO bills(shop_id,bill_no,party_id,party_name,date,subtotal,discount,total,paid,mode)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (shop_id, bill_no, p["party_id"], p["party_name"], today(),
             p["subtotal"], p["discount"], p["total"], 0, "cash"))
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
        conn.execute("UPDATE proformas SET status='converted', bill_id=? WHERE id=?", (bill_id, pf_id))
        conn.commit()
        return get_bill(conn, shop_id, bill_id)
    finally:
        conn.close()


# ---------- serial / IMEI tracking ----------

class SerialBulkIn(BaseModel):
    serials: list[str] = Field(min_length=1)


@app.post("/api/products/{pid}/serials")
def add_serials(pid: int, b: SerialBulkIn, shop_id: int = Depends(shop_of)):
    """Ek product ke liye serial/IMEI numbers bulk me register karo (skip duplicates)."""
    conn = get_db()
    try:
        pr = conn.execute("SELECT id FROM products WHERE id=? AND shop_id=?", (pid, shop_id)).fetchone()
        if not pr:
            raise HTTPException(404, "Product not found")
        added, skipped = 0, 0
        for raw in b.serials:
            sn = str(raw).strip()
            if not sn:
                continue
            try:
                conn.execute("INSERT INTO serials(shop_id,product_id,serial_no) VALUES (?,?,?)",
                             (shop_id, pid, sn))
                added += 1
            except Exception:
                skipped += 1  # duplicate
        conn.commit()
        return {"added": added, "skipped": skipped}
    finally:
        conn.close()


@app.get("/api/products/{pid}/serials")
def list_serials(pid: int, status: str = "", shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        q = "SELECT id, serial_no, status, bill_id FROM serials WHERE shop_id=? AND product_id=?"
        args: list = [shop_id, pid]
        if status in ("in_stock", "sold"):
            q += " AND status=?"
            args.append(status)
        q += " ORDER BY serial_no LIMIT 500"
        return dicts(conn.execute(q, tuple(args)).fetchall())
    finally:
        conn.close()


@app.delete("/api/serials/{sid}")
def delete_serial(sid: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        r = conn.execute("SELECT id, status FROM serials WHERE id=? AND shop_id=?", (sid, shop_id)).fetchone()
        if not r:
            raise HTTPException(404, "Serial not found")
        if r["status"] != "in_stock":
            raise HTTPException(400, "Sold serials cannot be deleted")
        conn.execute("DELETE FROM serials WHERE id=?", (sid,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.get("/api/bills/{bid}/serials")
def bill_serials(bid: int, shop_id: int = Depends(shop_of)):
    """Bill me beche gaye serials (print/detail ke liye)."""
    conn = get_db()
    try:
        return dicts(conn.execute(
            """SELECT s.serial_no, p.name AS product_name FROM serials s
               JOIN products p ON p.id = s.product_id
               WHERE s.shop_id=? AND s.bill_id=? ORDER BY p.name, s.serial_no""",
            (shop_id, bid)).fetchall())
    finally:
        conn.close()


# ---------- bulk import (CSV) ----------

ITEM_CSV_COLS = ["name", "sale_price", "purchase_price", "stock_qty", "sku", "barcode", "category", "unit", "low_stock_level"]
PARTY_CSV_COLS = ["name", "type", "phone", "address", "credit_limit"]


@app.get("/api/import/template")
def import_template(kind: str = "items", shop_id: int = Depends(shop_of)):
    cols = PARTY_CSV_COLS if kind == "parties" else ITEM_CSV_COLS
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    if kind == "parties":
        w.writerow(["Ahmed Store", "customer", "03001234567", "Main Bazar", "50000"])
    else:
        w.writerow(["LED Bulb 12W", "180", "120", "50", "LED-12W", "1234567890123", "LED", "pcs", "5"])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=karobar_{kind}_template.csv"})


def _num(v, default=0.0):
    try:
        return float(str(v).strip() or default)
    except (ValueError, TypeError):
        return default


@app.post("/api/import/items")
async def import_items(file: UploadFile = File(...), shop_id: int = Depends(shop_of)):
    """CSV se products bulk import. Returns {added, skipped, errors}."""
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "File must be UTF-8 CSV")
    rows = list(csv.DictReader(io.StringIO(text)))[:2000]
    conn = get_db()
    added, skipped, errors = 0, 0, []
    try:
        for i, r in enumerate(rows, start=2):
            name = (r.get("name") or "").strip()
            if not name:
                skipped += 1
                errors.append({"row": i, "error": "name is required"})
                continue
            try:
                conn.execute(
                    """INSERT INTO products(shop_id,name,sku,barcode,category,purchase_price,sale_price,
                                           stock_qty,low_stock_level,unit)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (shop_id, name, (r.get("sku") or "").strip() or None,
                     (r.get("barcode") or "").strip(), (r.get("category") or "").strip(),
                     _num(r.get("purchase_price")), _num(r.get("sale_price")), _num(r.get("stock_qty")),
                     _num(r.get("low_stock_level"), 5), (r.get("unit") or "pcs").strip() or "pcs"))
                added += 1
            except Exception as e:
                skipped += 1
                errors.append({"row": i, "error": str(e)[:120]})
        conn.commit()
        return {"added": added, "skipped": skipped, "errors": errors[:50]}
    finally:
        conn.close()


@app.post("/api/import/parties")
async def import_parties(file: UploadFile = File(...), shop_id: int = Depends(shop_of)):
    """CSV se parties (customers/suppliers) bulk import."""
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "File must be UTF-8 CSV")
    rows = list(csv.DictReader(io.StringIO(text)))[:2000]
    conn = get_db()
    added, skipped, errors = 0, 0, []
    try:
        for i, r in enumerate(rows, start=2):
            name = (r.get("name") or "").strip()
            ptype = (r.get("type") or "customer").strip().lower()
            if not name:
                skipped += 1
                errors.append({"row": i, "error": "name is required"})
                continue
            if ptype not in ("customer", "supplier"):
                skipped += 1
                errors.append({"row": i, "error": "type must be customer or supplier"})
                continue
            try:
                conn.execute(
                    "INSERT INTO parties(shop_id,name,type,phone,address,credit_limit) VALUES (?,?,?,?,?,?)",
                    (shop_id, name, ptype, (r.get("phone") or "").strip(),
                     (r.get("address") or "").strip(), _num(r.get("credit_limit"))))
                added += 1
            except Exception as e:
                skipped += 1
                errors.append({"row": i, "error": str(e)[:120]})
        conn.commit()
        return {"added": added, "skipped": skipped, "errors": errors[:50]}
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
            "INSERT INTO parties(shop_id,name,phone,type,address,credit_limit) VALUES (?,?,?,?,?,?)",
            (shop_id, b.name, b.phone, b.type, b.address, b.credit_limit or 0))
        conn.commit()
        row = conn.execute("SELECT * FROM parties WHERE id=?", (cur.lastrowid,)).fetchone()
        d = dict(row)
        d["balance"] = 0
        return d
    finally:
        conn.close()


class PartyUpdate(BaseModel):
    name: str = ""
    phone: str = ""
    address: str = ""
    credit_limit: Optional[float] = None


@app.put("/api/parties/{pid}")
def update_party(pid: int, b: PartyUpdate, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        p = conn.execute("SELECT id FROM parties WHERE id=? AND shop_id=?", (pid, shop_id)).fetchone()
        if not p:
            raise HTTPException(404, "Party not found")
        data = b.model_dump(exclude_unset=True)
        allowed = {}
        if data.get("name", "").strip():
            allowed["name"] = data["name"].strip()
        if "phone" in data:
            allowed["phone"] = data["phone"] or ""
        if "address" in data:
            allowed["address"] = data["address"] or ""
        if data.get("credit_limit") is not None:
            allowed["credit_limit"] = max(0, data["credit_limit"])
        if allowed:
            conn.execute(f"UPDATE parties SET {', '.join(f'{k}=?' for k in allowed)} WHERE id=?",
                         tuple(allowed.values()) + (pid,))
            conn.commit()
        row = conn.execute("SELECT * FROM parties WHERE id=?", (pid,)).fetchone()
        d = dict(row)
        d["balance"] = party_balance(conn, shop_id, pid, row["type"])
        return d
    finally:
        conn.close()


@app.delete("/api/parties/{pid}")
def delete_party(pid: int, shop_id: int = Depends(shop_of)):
    """Party delete → recycle bin. Related docs ka party link hata diya jata hai (docs mehfooz)."""
    conn = get_db()
    try:
        p = conn.execute("SELECT * FROM parties WHERE id=? AND shop_id=?", (pid, shop_id)).fetchone()
        if not p:
            raise HTTPException(404, "Party not found")
        _to_bin(conn, shop_id, "party", pid, p["name"], dict(p))
        for tbl in ("bills", "purchases", "estimates", "sale_orders", "purchase_orders",
                    "proformas", "credit_notes", "debit_notes", "cheques", "reminders"):
            try:
                conn.execute(f"UPDATE {tbl} SET party_id=NULL WHERE party_id=? AND shop_id=?", (pid, shop_id))
            except Exception:
                pass
        conn.execute("DELETE FROM payments WHERE party_id=? AND shop_id=?", (pid, shop_id))
        conn.execute("DELETE FROM parties WHERE id=? AND shop_id=?", (pid, shop_id))
        conn.commit()
        return {"ok": True}
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
            lines.append((pr, it.qty, price, lt, [x.strip() for x in (it.serials or []) if x.strip()]))
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
        for pr, qty, price, lt, _serials in lines:
            conn.execute(
                "INSERT INTO bill_items(bill_id,product_id,product_name,qty,price,cost,total) VALUES (?,?,?,?,?,?,?)",
                (bill_id, pr["id"], pr["name"], qty, price, pr["purchase_price"], lt))
            conn.execute("UPDATE products SET stock_qty = stock_qty - ? WHERE id=?", (qty, pr["id"]))
            _sell_serials(conn, shop_id, pr["id"], _serials, qty, bill_id)
        if paid > 0:
            conn.execute(
                "INSERT INTO cash_txns(shop_id,date,kind,amount,category,note,ref) VALUES (?,?,?,?,?,?,?)",
                (shop_id, d, "in", paid, "sale", f"Bill {bill_no}" + (f" — {pname}" if pname else ""),
                 f"bill:{bill_id}"))
        conn.commit()
        bill = get_bill(conn, shop_id, bill_id)
        # credit limit warning (customer ki had cross ho to warning, block nahi)
        bill["credit_warning"] = ""
        if b.party_id:
            prow = conn.execute("SELECT credit_limit FROM parties WHERE id=? AND shop_id=? AND type='customer'",
                                (b.party_id, shop_id)).fetchone()
            if prow and (prow["credit_limit"] or 0) > 0:
                new_bal = party_balance(conn, shop_id, b.party_id, "customer")
                if new_bal > prow["credit_limit"]:
                    bill["credit_warning"] = (
                        f"Credit limit exceeded: balance Rs {new_bal:,.0f} > limit Rs {prow['credit_limit']:,.0f}")
        return bill
    finally:
        conn.close()


@app.delete("/api/bills/{bid}")
def delete_bill(bid: int, shop_id: int = Depends(shop_of)):
    """Bill delete → recycle bin. Stock wapas, serials wapas, cash entry hatao."""
    conn = get_db()
    try:
        b = conn.execute("SELECT * FROM bills WHERE id=? AND shop_id=?", (bid, shop_id)).fetchone()
        if not b:
            raise HTTPException(404, "Bill not found")
        items = dicts(conn.execute("SELECT * FROM bill_items WHERE bill_id=?", (bid,)).fetchall())
        serials_by_item = {}
        for it in items:
            sns = [r["serial_no"] for r in conn.execute(
                "SELECT serial_no FROM serials WHERE bill_id=? AND product_id=?",
                (bid, it["product_id"])).fetchall()]
            if sns:
                serials_by_item[it["id"]] = sns
        data = dict(b)
        data["items"] = [{**it, "serials": serials_by_item.get(it["id"], [])} for it in items]
        _to_bin(conn, shop_id, "bill", bid, f"{b['bill_no']}" + (f" — {b['party_name']}" if b["party_name"] else ""),
                data)
        for it in items:
            conn.execute("UPDATE products SET stock_qty = stock_qty + ? WHERE id=?",
                         (it["qty"], it["product_id"]))
        conn.execute("UPDATE serials SET status='in_stock', bill_id=NULL WHERE bill_id=? AND shop_id=?",
                     (bid, shop_id))
        conn.execute("DELETE FROM cash_txns WHERE ref=? AND shop_id=?", (f"bill:{bid}", shop_id))
        conn.execute("DELETE FROM bill_items WHERE bill_id=?", (bid,))
        conn.execute("DELETE FROM bills WHERE id=?", (bid,))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


def get_bill(conn, shop_id: int, bill_id: int):
    bill = conn.execute("SELECT * FROM bills WHERE id=? AND shop_id=?", (bill_id, shop_id)).fetchone()
    if not bill:
        raise HTTPException(404, "Bill not found")
    d = dict(bill)
    d["items"] = dicts(conn.execute("SELECT * FROM bill_items WHERE bill_id=?", (bill_id,)).fetchall())
    d["baqaya"] = round(d["total"] - d["paid"], 2)
    shop = conn.execute("SELECT name, address, phone, receipt_header, invoice_theme FROM shops WHERE id=?",
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


# ---------- combined transactions (HOME screen) ----------
@app.get("/api/transactions")
def transactions(q: str = "", shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        like = f"%{q}%"
        out = []
        for b in conn.execute(
            """SELECT id, bill_no AS ref, party_id, party_name, date, total,
                      (total - paid) AS balance, paid, created_at
               FROM bills WHERE shop_id=? AND (party_name LIKE ? OR bill_no LIKE ?)""",
            (shop_id, like, like)).fetchall():
            d = dict(b)
            out.append({"key": f"sale-{d['id']}", "kind": "sale", "ref": d["ref"],
                        "party_id": d["party_id"], "party_name": d["party_name"] or "Walk-in",
                        "date": d["date"], "total": d["total"], "balance": max(0.0, d["balance"] or 0),
                        "paid": d["paid"], "doc_id": d["id"], "created_at": d["created_at"]})
        for p in conn.execute(
            """SELECT id, bill_no AS ref, party_id, party_name, date, total,
                      (total - paid) AS balance, paid, created_at
               FROM purchases WHERE shop_id=? AND (party_name LIKE ? OR bill_no LIKE ?)""",
            (shop_id, like, like)).fetchall():
            d = dict(p)
            out.append({"key": f"pur-{d['id']}", "kind": "purchase", "ref": d["ref"],
                        "party_id": d["party_id"], "party_name": d["party_name"] or "—",
                        "date": d["date"], "total": d["total"], "balance": max(0.0, d["balance"] or 0),
                        "paid": d["paid"], "doc_id": d["id"], "created_at": d["created_at"]})
        for p in conn.execute(
            """SELECT p.id, p.party_id, pt.name AS party_name, p.date, p.amount AS total,
                      p.direction, p.mode, p.note, p.created_at
               FROM payments p JOIN parties pt ON pt.id = p.party_id
               WHERE p.shop_id=? AND (pt.name LIKE ? OR p.note LIKE ?)""",
            (shop_id, like, like)).fetchall():
            d = dict(p)
            kind = "payment-in" if d["direction"] == "lena" else "payment-out"
            out.append({"key": f"pay-{d['id']}", "kind": kind, "ref": f"PAY-{d['id']}",
                        "party_id": d["party_id"], "party_name": d["party_name"],
                        "date": d["date"], "total": d["total"], "balance": 0,
                        "paid": d["total"], "doc_id": d["id"], "created_at": d["created_at"],
                        "mode": d["mode"], "note": d["note"]})
        out.sort(key=lambda x: (x["date"] or "", x["created_at"] or ""), reverse=True)
        return out[:300]
    finally:
        conn.close()


# ---------- fast/slow moving items ----------

@app.get("/api/reports/movement")
def movement(days: int = 30, shop_id: int = Depends(shop_of)):
    """Fast moving (zyada bikne wale) aur slow moving (kam/na bikne wale, stock me pare) items."""
    from datetime import date as _date, timedelta as _td
    since = (_date.today() - _td(days=days)).isoformat()
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT p.id, p.name, p.stock_qty, p.unit,
                      COALESCE(SUM(bi.qty), 0) AS qty_sold,
                      COALESCE(SUM(bi.total), 0) AS revenue
               FROM products p
               LEFT JOIN bill_items bi ON bi.product_id = p.id
                 AND bi.bill_id IN (SELECT id FROM bills WHERE shop_id = ? AND date >= ?)
               WHERE p.shop_id = ?
               GROUP BY p.id
               ORDER BY qty_sold DESC""",
            (shop_id, since, shop_id)).fetchall()
        items = [dict(r) for r in rows]
        fast = [x for x in items if x["qty_sold"] > 0][:20]
        slow = [x for x in items if x["qty_sold"] == 0 and x["stock_qty"] > 0][:20]
        return {"days": days, "fast": fast, "slow": slow}
    finally:
        conn.close()


# ---------- balance sheet ----------

@app.get("/api/reports/balance-sheet")
def balance_sheet(shop_id: int = Depends(shop_of)):
    """Simple balance sheet: Assets = Liabilities + Equity (deterministic)."""
    conn = get_db()
    try:
        cash_in = conn.execute("SELECT COALESCE(SUM(amount),0) FROM cash_txns WHERE shop_id=? AND kind='in'",
                               (shop_id,)).fetchone()[0]
        cash_out = conn.execute("SELECT COALESCE(SUM(amount),0) FROM cash_txns WHERE shop_id=? AND kind='out'",
                                (shop_id,)).fetchone()[0]
        cash_in_hand = round(cash_in - cash_out, 2)
        bank_total = 0.0
        for br in conn.execute("SELECT id, opening_balance FROM bank_accounts WHERE shop_id=?", (shop_id,)).fetchall():
            inn = conn.execute("SELECT COALESCE(SUM(amount),0) FROM bank_txns WHERE account_id=? AND kind='in'",
                               (br["id"],)).fetchone()[0]
            out = conn.execute("SELECT COALESCE(SUM(amount),0) FROM bank_txns WHERE account_id=? AND kind='out'",
                               (br["id"],)).fetchone()[0]
            bank_total += br["opening_balance"] + inn - out
        bank_total = round(bank_total, 2)
        stock_value = round(conn.execute(
            "SELECT COALESCE(SUM(stock_qty * purchase_price),0) FROM products WHERE shop_id=?",
            (shop_id,)).fetchone()[0], 2)
        receivables, payables = 0.0, 0.0
        for pt in conn.execute("SELECT id, type FROM parties WHERE shop_id=?", (shop_id,)).fetchall():
            bal = party_balance(conn, shop_id, pt["id"], pt["type"])
            if pt["type"] == "customer":
                receivables += max(0, bal)
            else:
                payables += max(0, bal)
        receivables, payables = round(receivables, 2), round(payables, 2)
        assets = round(cash_in_hand + bank_total + stock_value + receivables, 2)
        liabilities = payables
        equity = round(assets - liabilities, 2)
        return {
            "assets": {"cash_in_hand": cash_in_hand, "bank": bank_total,
                       "stock_value": stock_value, "receivables": receivables, "total": assets},
            "liabilities": {"payables": payables, "total": liabilities},
            "equity": equity,
        }
    finally:
        conn.close()


# ---------- Excel export (openpyxl) ----------

def _xlsx_response(wb, filename: str):
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(content=buf.getvalue(),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename={filename}"})


def _xlsx_sheet(wb, title: str, headers: list, rows: list):
    from openpyxl.styles import Font
    ws = wb.create_sheet(title[:31])
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in rows:
        ws.append(r)
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = max(12, min(38, max(
            (len(str(c.value)) for c in col if c.value is not None), default=12) + 2))
    return ws


@app.get("/api/reports/export")
def export_report(kind: str = "sale", from_date: str = "", to_date: str = "",
                  shop_id: int = Depends(shop_of)):
    """Kisi bhi report ka Excel (.xlsx) download."""
    from openpyxl import Workbook
    conn = get_db()
    try:
        wb = Workbook()
        wb.remove(wb.active)
        fd, td = from_date or "2000-01-01", to_date or "2999-12-31"
        if kind == "sale":
            rows = conn.execute(
                "SELECT bill_no, date, party_name, subtotal, discount, total, paid, (total-paid) AS baqaya "
                "FROM bills WHERE shop_id=? AND date BETWEEN ? AND ? ORDER BY date, id",
                (shop_id, fd, td)).fetchall()
            _xlsx_sheet(wb, "Sales", ["Bill No", "Date", "Customer", "Subtotal", "Discount", "Total", "Paid", "Due"],
                        [[r["bill_no"], r["date"], r["party_name"], r["subtotal"], r["discount"],
                          r["total"], r["paid"], r["baqaya"]] for r in rows])
        elif kind == "stock":
            rows = conn.execute(
                "SELECT name, sku, barcode, category, stock_qty, unit, purchase_price, sale_price, "
                "(stock_qty*purchase_price) AS stock_value FROM products WHERE shop_id=? ORDER BY name",
                (shop_id,)).fetchall()
            _xlsx_sheet(wb, "Stock", ["Product", "SKU", "Barcode", "Category", "Qty", "Unit",
                                      "Purchase Price", "Sale Price", "Stock Value"],
                        [[r["name"], r["sku"], r["barcode"], r["category"], r["stock_qty"], r["unit"],
                          r["purchase_price"], r["sale_price"], r["stock_value"]] for r in rows])
        elif kind == "outstanding":
            data = []
            for pt in conn.execute("SELECT id, name, type, phone FROM parties WHERE shop_id=? ORDER BY name",
                                   (shop_id,)).fetchall():
                bal = party_balance(conn, shop_id, pt["id"], pt["type"])
                if bal > 0:
                    data.append([pt["name"], pt["type"], pt["phone"], bal])
            _xlsx_sheet(wb, "Outstanding", ["Party", "Type", "Phone", "Balance"], data)
        elif kind == "daybook":
            d = from_date or today()
            rows = conn.execute(
                "SELECT date, kind, amount, category, note FROM cash_txns WHERE shop_id=? AND date=? ORDER BY id",
                (shop_id, d)).fetchall()
            _xlsx_sheet(wb, "Day Book " + d, ["Date", "In/Out", "Amount", "Category", "Note"],
                        [[r["date"], r["kind"], r["amount"], r["category"], r["note"]] for r in rows])
        elif kind == "movement":
            m = movement(30, shop_id)
            _xlsx_sheet(wb, "Fast Moving (30d)", ["Product", "Qty Sold", "Revenue", "Stock Left"],
                        [[x["name"], x["qty_sold"], x["revenue"], x["stock_qty"]] for x in m["fast"]])
            _xlsx_sheet(wb, "Slow Moving (30d)", ["Product", "Qty Sold", "Stock Left"],
                        [[x["name"], x["qty_sold"], x["stock_qty"]] for x in m["slow"]])
        elif kind == "profit":
            rows = conn.execute(
                """SELECT b.bill_no, b.date, bi.product_name, bi.qty, bi.price, bi.total, bi.cost,
                          (bi.total - bi.cost*bi.qty) AS profit
                   FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
                   WHERE b.shop_id=? AND b.date BETWEEN ? AND ? ORDER BY b.date, b.id""",
                (shop_id, fd, td)).fetchall()
            _xlsx_sheet(wb, "Profit", ["Bill", "Date", "Product", "Qty", "Price", "Total", "Cost", "Profit"],
                        [[r["bill_no"], r["date"], r["product_name"], r["qty"], r["price"],
                          r["total"], r["cost"], r["profit"]] for r in rows])
        else:
            raise HTTPException(400, "Unknown report kind")
        return _xlsx_response(wb, f"karobar_{kind}_report.xlsx")
    finally:
        conn.close()


# ---------- digital visiting card (public, no login) ----------

def _wa_number(phone: str) -> str:
    d = "".join(c for c in (phone or "") if c.isdigit())
    if d.startswith("0"):
        d = "92" + d[1:]
    return d


@app.get("/api/public/shop-card/{shop_id}")
def public_shop_card(shop_id: int):
    """Public visiting-card data (bina login)."""
    conn = get_db()
    try:
        r = conn.execute("SELECT id, name, phone, address, city, receipt_header FROM shops WHERE id=?",
                         (shop_id,)).fetchone()
        if not r:
            raise HTTPException(404, "Shop not found")
        d = dict(r)
        d["whatsapp"] = _wa_number(d["phone"])
        return d
    finally:
        conn.close()


@app.get("/card/{shop_id}", response_class=Response)
def shop_card_page(shop_id: int):
    """Shareable digital visiting card page (no login needed)."""
    conn = get_db()
    try:
        r = conn.execute("SELECT name, phone, address, city, receipt_header FROM shops WHERE id=?",
                         (shop_id,)).fetchone()
        if not r:
            raise HTTPException(404, "Shop not found")
        s = dict(r)
        wa = _wa_number(s["phone"])
        addr = ", ".join(x for x in [s["address"], s["city"]] if x)
        phone_svg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
        pin_svg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
        wa_svg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M17.5 14.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.1 4.49.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35M12.04 2C6.56 2 2.1 6.45 2.1 11.93c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22c5.48 0 9.93-4.45 9.93-9.93 0-2.65-1.03-5.14-2.9-7.01A9.86 9.86 0 0 0 12.04 2"/></svg>'
        html = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{s['name']} — Visiting Card</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}body{{font-family:system-ui,-apple-system,sans-serif;background:#f3f4f6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}}
.card{{background:#fff;border-radius:20px;max-width:380px;width:100%;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.12)}}
.top{{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;padding:36px 24px;text-align:center}}
.top h1{{font-size:24px;margin-bottom:4px}}.top p{{opacity:.9;font-size:14px}}
.body{{padding:24px}}.row{{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f0f0f0;font-size:15px}}
.row:last-child{{border:0}}.ico{{width:38px;height:38px;border-radius:50%;background:#ede9fe;display:flex;align-items:center;justify-content:center;flex-shrink:0}}
a.btn{{display:flex;align-items:center;justify-content:center;gap:8px;background:#25d366;color:#fff;font-weight:700;padding:14px;border-radius:12px;text-decoration:none;margin-top:16px}}
a.call{{display:block;text-align:center;background:#7c3aed;color:#fff;font-weight:700;padding:14px;border-radius:12px;text-decoration:none;margin-top:10px}}
.foot{{text-align:center;color:#9ca3af;font-size:12px;padding:0 24px 20px}}
</style></head><body><div class="card">
<div class="top"><h1>{s['name']}</h1><p>{s['receipt_header'] or 'Welcome!'}</p></div>
<div class="body">
<div class="row"><div class="ico">{phone_svg}</div><div>{s['phone'] or '—'}</div></div>
<div class="row"><div class="ico">{pin_svg}</div><div>{addr or '—'}</div></div>
<a class="btn" href="https://wa.me/{wa}">{wa_svg} Chat on WhatsApp</a>
<a class="call" href="tel:+{wa}">Call Now</a>
</div><div class="foot">Digital visiting card · powered by Karobar</div>
</div></body></html>"""
        return Response(content=html, media_type="text/html")
    finally:
        conn.close()


# ---------- barcode (label print + scan) ----------

@app.get("/api/products/{pid}/barcode.png")
def barcode_image(pid: int, token: str = "", authorization: Optional[str] = Header(default=None)):
    """Product ke barcode ki PNG image (Code128) — label print ke liye.
    <img> tags Bearer header nahi bhejte, is liye ?token= bhi chalta hai."""
    shop_id = None
    if authorization and authorization.startswith("Bearer "):
        shop_id = _shop_from_token(authorization[7:])
    if not shop_id and token:
        shop_id = _shop_from_token(token)
    if not shop_id:
        raise HTTPException(401, "Login required")
    conn = get_db()
    try:
        pr = conn.execute("SELECT barcode, sku, name FROM products WHERE id=? AND shop_id=?",
                          (pid, shop_id)).fetchone()
        if not pr:
            raise HTTPException(404, "Product not found")
        code = (pr["barcode"] or "").strip() or (pr["sku"] or "").strip() or f"KAR-{pid}"
        import barcode as barcode_lib
        from barcode.writer import ImageWriter
        writer = ImageWriter()
        writer.set_options({"module_width": 0.25, "module_height": 12, "font_size": 10,
                            "text_distance": 2, "quiet_zone": 4})
        bc = barcode_lib.get("code128", code, writer=writer)
        buf = io.BytesIO()
        bc.write(buf)
        buf.seek(0)
        return Response(content=buf.getvalue(), media_type="image/png")
    finally:
        conn.close()


@app.get("/api/products/by-barcode")
def product_by_barcode(code: str, shop_id: int = Depends(shop_of)):
    """Billing me scan/type kiya barcode → product dhoondo."""
    conn = get_db()
    try:
        code = code.strip()
        pr = conn.execute(
            "SELECT * FROM products WHERE shop_id=? AND (barcode=? OR sku=?)",
            (shop_id, code, code)).fetchone()
        if not pr:
            raise HTTPException(404, "No product found for this barcode")
        return dict(pr)
    finally:
        conn.close()


# ---------- expiry alerts ----------

@app.get("/api/reports/expiry")
def expiry_alerts(days: int = 30, shop_id: int = Depends(shop_of)):
    """Expiry qareeb (days) ya guzar chuki items — dashboard alert ke liye."""
    from datetime import date as _date, timedelta as _td
    t = _date.today().isoformat()
    soon = (_date.today() + _td(days=days)).isoformat()
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT id, name, sku, expiry_date, stock_qty, unit FROM products
               WHERE shop_id=? AND expiry_date IS NOT NULL AND expiry_date != '' AND expiry_date <= ?
               ORDER BY expiry_date""",
            (shop_id, soon)).fetchall()
        expired, expiring = [], []
        for r in rows:
            d = dict(r)
            (expired if d["expiry_date"] < t else expiring).append(d)
        return {"days": days, "expired": expired, "expiring": expiring}
    finally:
        conn.close()


# ---------- backup (one-click DB download + restore) ----------

@app.get("/api/backup/download")
def backup_download(actor: dict = Depends(require_owner)):
    """Poori SQLite DB file download karo (owner only)."""
    from db import DB_PATH, DATABASE_URL
    if DATABASE_URL:
        raise HTTPException(400, "Backup download is only available for SQLite databases")
    if not os.path.exists(DB_PATH):
        raise HTTPException(404, "Database file not found")
    return FileResponse(DB_PATH, filename=f"karobar_backup_{today()}.db",
                        media_type="application/octet-stream")


@app.post("/api/backup/restore")
async def backup_restore(file: UploadFile = File(...), actor: dict = Depends(require_owner)):
    """Backup file se DB restore karo (owner only). Purani DB overwrite ho jayegi!"""
    from db import DB_PATH, DATABASE_URL
    if DATABASE_URL:
        raise HTTPException(400, "Backup restore is only available for SQLite databases")
    raw = await file.read()
    if len(raw) < 100 or not raw.startswith(b"SQLite format 3\x00"):
        raise HTTPException(400, "This is not a valid Karobar backup file")
    if len(raw) > 500 * 1024 * 1024:
        raise HTTPException(400, "Backup file too large (max 500MB)")
    tmp = DB_PATH + ".restore_tmp"
    with open(tmp, "wb") as f:
        f.write(raw)
    # validate: khol kar dekho ke tables hain
    try:
        import sqlite3 as _sq
        c = _sq.connect(tmp)
        try:
            tables = {r[0] for r in c.execute(
                "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        finally:
            c.close()
        for need in ("shops", "products", "bills", "parties"):
            if need not in tables:
                raise ValueError(f"missing table: {need}")
    except Exception as e:
        os.remove(tmp)
        raise HTTPException(400, f"Invalid backup file: {e}")
    os.replace(tmp, DB_PATH)
    return {"ok": True, "restored_bytes": len(raw)}


# ---------- cash flow report ----------

@app.get("/api/reports/cash-flow")
def cash_flow(from_date: str = "", to_date: str = "", shop_id: int = Depends(shop_of)):
    """Paisa kahan se aaya, kahan gaya — category-wise (period select)."""
    fd, td = from_date or "2000-01-01", to_date or "2999-12-31"
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT kind, category, COALESCE(SUM(amount),0) AS total FROM cash_txns
               WHERE shop_id=? AND date BETWEEN ? AND ? GROUP BY kind, category ORDER BY kind, total DESC""",
            (shop_id, fd, td)).fetchall()
        inflow, outflow = [], []
        for r in rows:
            (inflow if r["kind"] == "in" else outflow).append(
                {"category": r["category"] or "other", "total": round(r["total"], 2)})
        tin = round(sum(x["total"] for x in inflow), 2)
        tout = round(sum(x["total"] for x in outflow), 2)
        return {"from": fd, "to": td, "inflow": inflow, "outflow": outflow,
                "total_in": tin, "total_out": tout, "net": round(tin - tout, 2)}
    finally:
        conn.close()


# ---------- aging report ----------

@app.get("/api/reports/aging")
def aging(shop_id: int = Depends(shop_of)):
    """Udhaar ki umar: 0-30 / 31-60 / 61-90 / 90+ din (receivable + payable)."""
    from datetime import date as _date
    t = _date.today()
    conn = get_db()
    try:
        def buckets(rows, amt_key):
            b = {"0-30": 0.0, "31-60": 0.0, "61-90": 0.0, "90+": 0.0}
            for r in rows:
                age = (t - _date.fromisoformat(r["date"][:10])).days if r["date"] else 0
                amt = r[amt_key]
                if amt <= 0:
                    continue
                if age <= 30:
                    b["0-30"] += amt
                elif age <= 60:
                    b["31-60"] += amt
                elif age <= 90:
                    b["61-90"] += amt
                else:
                    b["90+"] += amt
            return {k: round(v, 2) for k, v in b.items()}
        rec_rows = conn.execute(
            "SELECT date, (total - paid) AS due FROM bills WHERE shop_id=? AND party_id IS NOT NULL",
            (shop_id,)).fetchall()
        pay_rows = conn.execute(
            "SELECT date, (total - paid) AS due FROM purchases WHERE shop_id=? AND party_id IS NOT NULL",
            (shop_id,)).fetchall()
        rb, pb = buckets(rec_rows, "due"), buckets(pay_rows, "due")
        return {"receivable": rb, "payable": pb,
                "receivable_total": round(sum(rb.values()), 2),
                "payable_total": round(sum(pb.values()), 2)}
    finally:
        conn.close()


# ---------- bill-wise profit ----------

@app.get("/api/reports/bill-profit")
def bill_profit(from_date: str = "", to_date: str = "", shop_id: int = Depends(shop_of)):
    """Har bill par alag munafa (sale − cost)."""
    fd, td = from_date or "2000-01-01", to_date or "2999-12-31"
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT b.id, b.bill_no, b.date, b.party_name, b.total,
                      COALESCE(SUM(bi.qty * bi.cost),0) AS cost
               FROM bills b LEFT JOIN bill_items bi ON bi.bill_id=b.id
               WHERE b.shop_id=? AND b.date BETWEEN ? AND ?
               GROUP BY b.id ORDER BY b.date DESC, b.id DESC LIMIT 500""",
            (shop_id, fd, td)).fetchall()
        data = [{"bill_no": r["bill_no"], "date": r["date"], "party": r["party_name"],
                 "total": r["total"], "cost": round(r["cost"], 2),
                 "profit": round(r["total"] - r["cost"], 2)} for r in rows]
        return {"bills": data,
                "total_sale": round(sum(x["total"] for x in data), 2),
                "total_profit": round(sum(x["profit"] for x in data), 2)}
    finally:
        conn.close()


# ---------- cheque management ----------

class ChequeIn(BaseModel):
    cheque_no: str = Field(min_length=1)
    party_id: Optional[int] = None
    party_name: str = ""
    amount: float = Field(gt=0)
    due_date: str = ""
    kind: str = "receivable"  # receivable | payable
    note: str = ""


@app.post("/api/cheques")
def add_cheque(b: ChequeIn, shop_id: int = Depends(shop_of)):
    if b.kind not in ("receivable", "payable"):
        raise HTTPException(400, "kind must be receivable or payable")
    conn = get_db()
    try:
        pname = b.party_name
        if b.party_id:
            p = conn.execute("SELECT name FROM parties WHERE id=? AND shop_id=?",
                             (b.party_id, shop_id)).fetchone()
            if p:
                pname = p["name"]
        cur = conn.execute(
            """INSERT INTO cheques(shop_id,cheque_no,party_id,party_name,amount,due_date,kind,note)
               VALUES (?,?,?,?,?,?,?,?)""",
            (shop_id, b.cheque_no.strip(), b.party_id, pname, b.amount,
             b.due_date or today(), b.kind, b.note))
        conn.commit()
        return dict(conn.execute("SELECT * FROM cheques WHERE id=?", (cur.lastrowid,)).fetchone())
    finally:
        conn.close()


@app.get("/api/cheques")
def list_cheques(status: str = "", shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        q = "SELECT * FROM cheques WHERE shop_id=?"
        args: list = [shop_id]
        if status in ("pending", "cleared", "bounced"):
            q += " AND status=?"
            args.append(status)
        q += " ORDER BY due_date, id DESC"
        return dicts(conn.execute(q, tuple(args)).fetchall())
    finally:
        conn.close()


@app.put("/api/cheques/{cid}")
def cheque_status(cid: int, status: str, shop_id: int = Depends(shop_of)):
    """Cheque clear ya bounce mark karo. Clear par cash me entry banti hai."""
    if status not in ("pending", "cleared", "bounced"):
        raise HTTPException(400, "Invalid status")
    conn = get_db()
    try:
        c = conn.execute("SELECT * FROM cheques WHERE id=? AND shop_id=?", (cid, shop_id)).fetchone()
        if not c:
            raise HTTPException(404, "Cheque not found")
        if c["status"] == status:
            return dict(c)
        conn.execute("UPDATE cheques SET status=? WHERE id=?", (status, cid))
        if status == "cleared" and c["status"] == "pending":
            # cash me asal entry: receivable clear = cash in, payable clear = cash out
            kind = "in" if c["kind"] == "receivable" else "out"
            conn.execute(
                "INSERT INTO cash_txns(shop_id,date,kind,amount,category,note,ref) VALUES (?,?,?,?,?,?,?)",
                (shop_id, today(), kind, c["amount"], "cheque",
                 f"Cheque {c['cheque_no']} cleared" + (f" — {c['party_name']}" if c["party_name"] else ""),
                 f"cheque:{cid}"))
        conn.commit()
        return dict(conn.execute("SELECT * FROM cheques WHERE id=?", (cid,)).fetchone())
    finally:
        conn.close()


@app.delete("/api/cheques/{cid}")
def delete_cheque(cid: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM cheques WHERE id=? AND shop_id=? AND status='pending'", (cid, shop_id))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- loan accounts + EMI ----------

def _emi_amount(principal: float, annual_rate: float, months: int) -> float:
    if months <= 0:
        raise HTTPException(400, "Months must be positive")
    if annual_rate <= 0:
        return round(principal / months, 2)
    r = annual_rate / 12 / 100
    emi = principal * r * (1 + r) ** months / ((1 + r) ** months - 1)
    return round(emi, 2)


def _add_months(iso: str, n: int) -> str:
    y, m, d = int(iso[0:4]), int(iso[5:7]), int(iso[8:10])
    m += n
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    import calendar as _cal
    d = min(d, _cal.monthrange(y, m)[1])
    return f"{y:04d}-{m:02d}-{d:02d}"


class LoanIn(BaseModel):
    lender_name: str = Field(min_length=2)
    principal: float = Field(gt=0)
    annual_rate: float = 0
    months: int = Field(gt=0, le=360)
    start_date: str = ""
    note: str = ""


@app.post("/api/loans")
def add_loan(b: LoanIn, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        emi = _emi_amount(b.principal, b.annual_rate, b.months)
        start = b.start_date or today()
        cur = conn.execute(
            """INSERT INTO loans(shop_id,lender_name,principal,annual_rate,months,start_date,emi_amount,note)
               VALUES (?,?,?,?,?,?,?,?)""",
            (shop_id, b.lender_name.strip(), b.principal, b.annual_rate, b.months, start, emi, b.note))
        loan_id = cur.lastrowid
        bal = b.principal
        r = b.annual_rate / 12 / 100
        for i in range(1, b.months + 1):
            interest = round(bal * r, 2) if r > 0 else 0.0
            princ = round(emi - interest, 2)
            if i == b.months:
                princ = round(bal, 2)  # aakhri qist me rounding adjust
            bal = round(bal - princ, 2)
            conn.execute(
                """INSERT INTO loan_schedule(loan_id,due_no,due_date,emi_amount,principal_part,interest_part)
                   VALUES (?,?,?,?,?,?)""",
                (loan_id, i, _add_months(start, i), emi, princ, interest))
        conn.commit()
        return loan_detail_data(conn, shop_id, loan_id)
    finally:
        conn.close()


def loan_detail_data(conn, shop_id: int, loan_id: int):
    l = conn.execute("SELECT * FROM loans WHERE id=? AND shop_id=?", (loan_id, shop_id)).fetchone()
    if not l:
        raise HTTPException(404, "Loan not found")
    d = dict(l)
    d["schedule"] = dicts(conn.execute(
        "SELECT * FROM loan_schedule WHERE loan_id=? ORDER BY due_no", (loan_id,)).fetchall())
    d["paid_total"] = round(sum(s["paid_amount"] for s in d["schedule"]), 2)
    d["due_total"] = round(sum(s["emi_amount"] for s in d["schedule"] if s["status"] != "paid"), 2)
    return d


@app.get("/api/loans")
def list_loans(shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        out = []
        for l in conn.execute("SELECT * FROM loans WHERE shop_id=? ORDER BY id DESC", (shop_id,)).fetchall():
            d = dict(l)
            s = conn.execute("SELECT COALESCE(SUM(paid_amount),0) AS p, COUNT(*) AS n, "
                             "SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS pd "
                             "FROM loan_schedule WHERE loan_id=?", (l["id"],)).fetchone()
            d["paid_total"] = round(s["p"], 2)
            d["emis_paid"] = s["pd"]
            d["emis_total"] = s["n"]
            out.append(d)
        return out
    finally:
        conn.close()


@app.get("/api/loans/{loan_id}")
def loan_detail(loan_id: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return loan_detail_data(conn, shop_id, loan_id)
    finally:
        conn.close()


class LoanPayIn(BaseModel):
    due_no: int = Field(gt=0)
    amount: float = Field(gt=0)


@app.post("/api/loans/{loan_id}/pay")
def pay_emi(loan_id: int, b: LoanPayIn, shop_id: int = Depends(shop_of)):
    """EMI pay karo (full ya partial). Cash-out entry banti hai."""
    conn = get_db()
    try:
        l = conn.execute("SELECT * FROM loans WHERE id=? AND shop_id=?", (loan_id, shop_id)).fetchone()
        if not l:
            raise HTTPException(404, "Loan not found")
        if l["status"] != "active":
            raise HTTPException(400, "Loan is closed")
        s = conn.execute("SELECT * FROM loan_schedule WHERE loan_id=? AND due_no=?",
                         (loan_id, b.due_no)).fetchone()
        if not s:
            raise HTTPException(404, "EMI not found")
        if s["status"] == "paid":
            raise HTTPException(400, "This EMI is already paid")
        new_paid = round(s["paid_amount"] + b.amount, 2)
        if new_paid > s["emi_amount"] + 0.01:
            raise HTTPException(400, f"Amount exceeds EMI of Rs {s['emi_amount']}")
        status = "paid" if new_paid >= s["emi_amount"] - 0.01 else "partial"
        conn.execute("UPDATE loan_schedule SET paid_amount=?, paid_date=?, status=? WHERE id=?",
                     (new_paid, today(), status, s["id"]))
        conn.execute(
            "INSERT INTO cash_txns(shop_id,date,kind,amount,category,note,ref) VALUES (?,?,?,?,?,?,?)",
            (shop_id, today(), "out", b.amount, "loan",
             f"EMI #{b.due_no} — {l['lender_name']}", f"loan:{loan_id}:{b.due_no}"))
        # saari qistein paid to loan closed
        left = conn.execute("SELECT COUNT(*) FROM loan_schedule WHERE loan_id=? AND status!='paid'",
                            (loan_id,)).fetchone()[0]
        if left == 0:
            conn.execute("UPDATE loans SET status='closed' WHERE id=?", (loan_id,))
        conn.commit()
        return loan_detail_data(conn, shop_id, loan_id)
    finally:
        conn.close()


# ---------- service reminders ----------

class ReminderIn(BaseModel):
    title: str = Field(min_length=2)
    due_date: str = ""
    party_id: Optional[int] = None
    party_name: str = ""
    note: str = ""


@app.post("/api/reminders")
def add_reminder(b: ReminderIn, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        pname = b.party_name
        if b.party_id:
            p = conn.execute("SELECT name FROM parties WHERE id=? AND shop_id=?",
                             (b.party_id, shop_id)).fetchone()
            if p:
                pname = p["name"]
        cur = conn.execute(
            "INSERT INTO reminders(shop_id,title,due_date,party_id,party_name,note) VALUES (?,?,?,?,?,?)",
            (shop_id, b.title.strip(), b.due_date or today(), b.party_id, pname, b.note))
        conn.commit()
        return dict(conn.execute("SELECT * FROM reminders WHERE id=?", (cur.lastrowid,)).fetchone())
    finally:
        conn.close()


@app.get("/api/reminders")
def list_reminders(done: str = "", shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        q = "SELECT * FROM reminders WHERE shop_id=?"
        args: list = [shop_id]
        if done in ("0", "1"):
            q += " AND done=?"
            args.append(int(done))
        q += " ORDER BY due_date, id DESC"
        return dicts(conn.execute(q, tuple(args)).fetchall())
    finally:
        conn.close()


@app.get("/api/reminders/due")
def reminders_due(shop_id: int = Depends(shop_of)):
    """Dashboard alert: overdue ya agle 7 din me due (not done)."""
    from datetime import date as _date, timedelta as _td
    soon = (_date.today() + _td(days=7)).isoformat()
    conn = get_db()
    try:
        return dicts(conn.execute(
            "SELECT * FROM reminders WHERE shop_id=? AND done=0 AND due_date <= ? ORDER BY due_date",
            (shop_id, soon)).fetchall())
    finally:
        conn.close()


@app.put("/api/reminders/{rid}")
def update_reminder(rid: int, done: Optional[int] = None, title: str = "",
                    shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        r = conn.execute("SELECT id FROM reminders WHERE id=? AND shop_id=?", (rid, shop_id)).fetchone()
        if not r:
            raise HTTPException(404, "Reminder not found")
        if done in (0, 1):
            conn.execute("UPDATE reminders SET done=? WHERE id=?", (done, rid))
        if title.strip():
            conn.execute("UPDATE reminders SET title=? WHERE id=?", (title.strip(), rid))
        conn.commit()
        return dict(conn.execute("SELECT * FROM reminders WHERE id=?", (rid,)).fetchone())
    finally:
        conn.close()


@app.delete("/api/reminders/{rid}")
def delete_reminder(rid: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM reminders WHERE id=? AND shop_id=?", (rid, shop_id))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


# ---------- recycle bin ----------

def _to_bin(conn, shop_id: int, kind: str, ref_id: int, label: str, data: dict):
    import json as _json
    conn.execute(
        "INSERT INTO recycle_bin(shop_id,kind,ref_id,label,data_json) VALUES (?,?,?,?,?)",
        (shop_id, kind, ref_id, label, _json.dumps(data, default=str)))


@app.get("/api/recycle-bin")
def list_recycle_bin(shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        return dicts(conn.execute(
            "SELECT id, kind, ref_id, label, deleted_at FROM recycle_bin WHERE shop_id=? ORDER BY id DESC LIMIT 200",
            (shop_id,)).fetchall())
    finally:
        conn.close()


@app.delete("/api/recycle-bin/{bid}", dependencies=[Depends(require_owner)])
def purge_recycle_bin(bid: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM recycle_bin WHERE id=? AND shop_id=?", (bid, shop_id))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


def _insert_with_id(conn, table: str, data: dict, id_col: str = "id") -> int:
    """Restore: original id wapas lao agar khaali hai, warna nayi id."""
    import json as _json  # noqa
    data = dict(data)
    orig = data.pop(id_col, None)
    cols = [c for c in data.keys() if c != id_col]
    if orig is not None:
        exists = conn.execute(f"SELECT 1 FROM {table} WHERE {id_col}=?", (orig,)).fetchone()
        if not exists:
            cols = [id_col] + cols
            data[id_col] = orig
    cur = conn.execute(f"INSERT INTO {table}({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                       tuple(data[c] for c in cols))
    return cur.lastrowid


@app.post("/api/recycle-bin/{bid}/restore", dependencies=[Depends(require_owner)])
def restore_recycle_bin(bid: int, shop_id: int = Depends(shop_of)):
    import json as _json
    conn = get_db()
    try:
        r = conn.execute("SELECT * FROM recycle_bin WHERE id=? AND shop_id=?", (bid, shop_id)).fetchone()
        if not r:
            raise HTTPException(404, "Item not found in recycle bin")
        data = _json.loads(r["data_json"])
        kind = r["kind"]
        skipped_serials = []
        if kind == "product":
            _insert_with_id(conn, "products", data)
        elif kind == "party":
            _insert_with_id(conn, "parties", data)
        elif kind == "bill":
            items = data.pop("items", [])
            # bill_no collision se bacho (delete ke baad nayi bill ban gayi ho to)
            clash = conn.execute("SELECT 1 FROM bills WHERE shop_id=? AND bill_no=?",
                                 (shop_id, data.get("bill_no"))).fetchone()
            if clash:
                data["bill_no"] = next_bill_no(conn, shop_id)
            new_bill_id = _insert_with_id(conn, "bills", data)
            for it in items:
                it = dict(it)
                it.pop("id", None)
                it["bill_id"] = new_bill_id
                conn.execute(
                    "INSERT INTO bill_items(bill_id,product_id,product_name,qty,price,cost,total) VALUES (?,?,?,?,?,?,?)",
                    (it["bill_id"], it["product_id"], it["product_name"], it["qty"],
                     it["price"], it["cost"], it["total"]))
                conn.execute("UPDATE products SET stock_qty = stock_qty - ? WHERE id=?",
                             (it["qty"], it["product_id"]))
                for sn in it.get("serials", []):
                    srow = conn.execute(
                        "SELECT id FROM serials WHERE shop_id=? AND product_id=? AND serial_no=? AND status='in_stock'",
                        (shop_id, it["product_id"], sn)).fetchone()
                    if srow:
                        conn.execute("UPDATE serials SET status='sold', bill_id=? WHERE id=?",
                                     (new_bill_id, srow["id"]))
                    else:
                        skipped_serials.append(sn)
            if data.get("paid", 0) > 0:
                conn.execute(
                    "INSERT INTO cash_txns(shop_id,date,kind,amount,category,note,ref) VALUES (?,?,?,?,?,?,?)",
                    (shop_id, data.get("date"), "in", data["paid"], "sale",
                     f"Bill {data.get('bill_no')} (restored)" + (f" — {data.get('party_name')}" if data.get("party_name") else ""),
                     f"bill:{new_bill_id}"))
        else:
            raise HTTPException(400, "Unknown recycle kind")
        conn.execute("DELETE FROM recycle_bin WHERE id=?", (bid,))
        conn.commit()
        return {"ok": True, "skipped_serials": skipped_serials}
    finally:
        conn.close()


# ---------- app lock (4-digit passcode) ----------

class PasscodeIn(BaseModel):
    passcode: str = Field(min_length=4, max_length=8)


@app.put("/api/settings/passcode")
def set_passcode(b: PasscodeIn, actor: dict = Depends(require_owner)):
    if not b.passcode.isdigit():
        raise HTTPException(400, "Passcode must be digits only")
    conn = get_db()
    try:
        conn.execute("UPDATE shops SET passcode_hash=? WHERE id=?",
                     (hash_password(b.passcode), actor["shop_id"]))
        conn.commit()
        return {"ok": True, "passcode_set": True}
    finally:
        conn.close()


@app.delete("/api/settings/passcode")
def remove_passcode(actor: dict = Depends(require_owner)):
    conn = get_db()
    try:
        conn.execute("UPDATE shops SET passcode_hash=NULL WHERE id=?", (actor["shop_id"],))
        conn.commit()
        return {"ok": True, "passcode_set": False}
    finally:
        conn.close()


@app.post("/api/auth/verify-passcode")
def verify_passcode(b: PasscodeIn, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        row = conn.execute("SELECT passcode_hash FROM shops WHERE id=?", (shop_id,)).fetchone()
        if not row or not row["passcode_hash"]:
            return {"ok": True}  # lock off hai
        if verify_password(b.passcode, row["passcode_hash"]):
            return {"ok": True}
        raise HTTPException(401, "Wrong passcode")
    finally:
        conn.close()


# ---------- custom fields (UDF) ----------

class CustomFieldIn(BaseModel):
    entity: str  # item | party | bill
    name: str = Field(min_length=1, max_length=40)
    ftype: str = "text"  # text | number | date


@app.get("/api/custom-fields")
def list_custom_fields(entity: str = "", shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        q = "SELECT * FROM custom_fields WHERE shop_id=?"
        args: list = [shop_id]
        if entity in ("item", "party", "bill"):
            q += " AND entity=?"
            args.append(entity)
        q += " ORDER BY entity, sort, id"
        return dicts(conn.execute(q, tuple(args)).fetchall())
    finally:
        conn.close()


@app.post("/api/custom-fields")
def add_custom_field(b: CustomFieldIn, actor: dict = Depends(require_owner)):
    if b.entity not in ("item", "party", "bill"):
        raise HTTPException(400, "entity must be item, party or bill")
    if b.ftype not in ("text", "number", "date"):
        raise HTTPException(400, "ftype must be text, number or date")
    conn = get_db()
    try:
        try:
            cur = conn.execute(
                "INSERT INTO custom_fields(shop_id,entity,name,ftype) VALUES (?,?,?,?)",
                (actor["shop_id"], b.entity, b.name.strip(), b.ftype))
            conn.commit()
        except Exception:
            raise HTTPException(400, "A field with this name already exists")
        return dict(conn.execute("SELECT * FROM custom_fields WHERE id=?", (cur.lastrowid,)).fetchone())
    finally:
        conn.close()


@app.delete("/api/custom-fields/{fid}")
def delete_custom_field(fid: int, actor: dict = Depends(require_owner)):
    conn = get_db()
    try:
        conn.execute("DELETE FROM custom_values WHERE field_id=?", (fid,))
        conn.execute("DELETE FROM custom_fields WHERE id=? AND shop_id=?", (fid, actor["shop_id"]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


class CustomValuesIn(BaseModel):
    entity: str
    entity_id: int
    values: dict = {}  # {field_id: value}


@app.put("/api/custom-values")
def save_custom_values(b: CustomValuesIn, shop_id: int = Depends(shop_of)):
    if b.entity not in ("item", "party", "bill"):
        raise HTTPException(400, "entity must be item, party or bill")
    conn = get_db()
    try:
        fields = {r["id"]: r for r in conn.execute(
            "SELECT * FROM custom_fields WHERE shop_id=? AND entity=?", (shop_id, b.entity)).fetchall()}
        for fid_raw, val in (b.values or {}).items():
            try:
                fid = int(fid_raw)
            except (ValueError, TypeError):
                continue
            if fid not in fields:
                continue
            v = str(val or "").strip()[:500]
            if v:
                conn.execute(
                    "INSERT INTO custom_values(field_id,entity_id,value) VALUES (?,?,?) "
                    "ON CONFLICT(field_id,entity_id) DO UPDATE SET value=excluded.value",
                    (fid, b.entity_id, v))
            else:
                conn.execute("DELETE FROM custom_values WHERE field_id=? AND entity_id=?", (fid, b.entity_id))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.get("/api/custom-values")
def get_custom_values(entity: str, entity_id: int, shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT f.id, f.name, f.ftype, COALESCE(v.value,'') AS value
               FROM custom_fields f LEFT JOIN custom_values v
                 ON v.field_id=f.id AND v.entity_id=?
               WHERE f.shop_id=? AND f.entity=? ORDER BY f.sort, f.id""",
            (entity_id, shop_id, entity)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ---------- online store (public catalog + orders) ----------

def next_online_order_no(conn, shop_id: int) -> str:
    n = conn.execute("SELECT COUNT(*) FROM online_orders WHERE shop_id=?", (shop_id,)).fetchone()[0]
    return f"ON-{n + 1:05d}"


@app.get("/api/public/store/{shop_id}/products")
def public_store_products(shop_id: int):
    """Public catalog (bina login) — sirf naam, price, stock."""
    conn = get_db()
    try:
        shop = conn.execute("SELECT id, name, phone, address, city FROM shops WHERE id=?",
                            (shop_id,)).fetchone()
        if not shop:
            raise HTTPException(404, "Store not found")
        products = dicts(conn.execute(
            "SELECT id, name, sale_price, unit, stock_qty FROM products "
            "WHERE shop_id=? AND stock_qty > 0 ORDER BY name LIMIT 200", (shop_id,)).fetchall())
        return {"shop": dict(shop), "products": products}
    finally:
        conn.close()


class OnlineOrderIn(BaseModel):
    customer_name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=10, max_length=20)
    address: str = ""
    items: list = Field(min_length=1)  # [{product_id, qty}]


@app.post("/api/public/store/{shop_id}/orders")
def public_store_order(shop_id: int, b: OnlineOrderIn):
    """Public order form → Karobar ke andar 'Online Orders' me aata hai."""
    conn = get_db()
    try:
        shop = conn.execute("SELECT id FROM shops WHERE id=?", (shop_id,)).fetchone()
        if not shop:
            raise HTTPException(404, "Store not found")
        lines, total = [], 0.0
        for it in b.items[:50]:
            try:
                pid, qty = int(it.get("product_id")), float(it.get("qty", 0))
            except (ValueError, TypeError, AttributeError):
                continue
            if qty <= 0:
                continue
            pr = conn.execute("SELECT id, name, sale_price, stock_qty FROM products WHERE id=? AND shop_id=?",
                              (pid, shop_id)).fetchone()
            if not pr or pr["stock_qty"] < qty:
                raise HTTPException(400, f"'{pr['name'] if pr else pid}' is out of stock")
            lt = round(pr["sale_price"] * qty, 2)
            total += lt
            lines.append({"product_id": pr["id"], "product_name": pr["name"],
                          "qty": qty, "price": pr["sale_price"], "total": lt})
        if not lines:
            raise HTTPException(400, "No valid items in order")
        import json as _json
        cur = conn.execute(
            """INSERT INTO online_orders(shop_id,order_no,customer_name,phone,address,items_json,total)
               VALUES (?,?,?,?,?,?,?)""",
            (shop_id, next_online_order_no(conn, shop_id), b.customer_name.strip(),
             b.phone.strip(), b.address.strip()[:200], _json.dumps(lines), round(total, 2)))
        conn.commit()
        row = conn.execute("SELECT order_no, total FROM online_orders WHERE id=?", (cur.lastrowid,)).fetchone()
        return {"ok": True, "order_no": row["order_no"], "total": row["total"]}
    finally:
        conn.close()


@app.get("/api/online-orders")
def list_online_orders(status: str = "", shop_id: int = Depends(shop_of)):
    conn = get_db()
    try:
        q = "SELECT * FROM online_orders WHERE shop_id=?"
        args: list = [shop_id]
        if status in ("new", "confirmed", "billed", "cancelled"):
            q += " AND status=?"
            args.append(status)
        q += " ORDER BY id DESC LIMIT 200"
        rows = dicts(conn.execute(q, tuple(args)).fetchall())
        import json as _json
        for r in rows:
            r["items"] = _json.loads(r["items_json"] or "[]")
        return rows
    finally:
        conn.close()


@app.put("/api/online-orders/{oid}")
def online_order_status(oid: int, status: str, shop_id: int = Depends(shop_of)):
    """Status: confirmed / cancelled. billed sirf convert se banta hai."""
    if status not in ("confirmed", "cancelled"):
        raise HTTPException(400, "Invalid status")
    conn = get_db()
    try:
        o = conn.execute("SELECT * FROM online_orders WHERE id=? AND shop_id=?", (oid, shop_id)).fetchone()
        if not o:
            raise HTTPException(404, "Order not found")
        if o["status"] not in ("new", "confirmed"):
            raise HTTPException(400, "Only new/confirmed orders can change")
        conn.execute("UPDATE online_orders SET status=? WHERE id=?", (status, oid))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@app.post("/api/online-orders/{oid}/convert")
def online_order_convert(oid: int, shop_id: int = Depends(shop_of)):
    """Online order → asal bill (stock ghatta hai)."""
    import json as _json
    conn = get_db()
    try:
        o = conn.execute("SELECT * FROM online_orders WHERE id=? AND shop_id=?", (oid, shop_id)).fetchone()
        if not o:
            raise HTTPException(404, "Order not found")
        if o["status"] == "billed":
            raise HTTPException(400, "Already converted to bill")
        if o["status"] == "cancelled":
            raise HTTPException(400, "Cancelled order cannot be billed")
        items = _json.loads(o["items_json"] or "[]")
        # stock check
        for it in items:
            pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                              (it["product_id"], shop_id)).fetchone()
            if not pr or pr["stock_qty"] < it["qty"]:
                raise HTTPException(400, f"'{it['product_name']}' — not enough stock")
        bill_no = next_bill_no(conn, shop_id)
        cur = conn.execute(
            """INSERT INTO bills(shop_id,bill_no,party_id,party_name,date,subtotal,discount,total,paid,mode)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (shop_id, bill_no, None, o["customer_name"], today(), o["total"], 0, o["total"], 0, "cash"))
        bill_id = cur.lastrowid
        for it in items:
            pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                              (it["product_id"], shop_id)).fetchone()
            conn.execute(
                "INSERT INTO bill_items(bill_id,product_id,product_name,qty,price,cost,total) VALUES (?,?,?,?,?,?,?)",
                (bill_id, it["product_id"], it["product_name"], it["qty"], it["price"],
                 pr["purchase_price"], it["total"]))
            conn.execute("UPDATE products SET stock_qty = stock_qty - ? WHERE id=?", (it["qty"], pr["id"]))
        conn.execute("UPDATE online_orders SET status='billed', bill_id=? WHERE id=?", (bill_id, oid))
        conn.commit()
        return get_bill(conn, shop_id, bill_id)
    finally:
        conn.close()


@app.get("/store/{shop_id}", response_class=Response)
def store_page(shop_id: int):
    """Public online store — catalog + order form (bina login)."""
    conn = get_db()
    try:
        shop = conn.execute("SELECT name, phone, address, city FROM shops WHERE id=?", (shop_id,)).fetchone()
        if not shop:
            raise HTTPException(404, "Store not found")
        s = dict(shop)
        addr = ", ".join(x for x in [s["address"], s["city"]] if x)
        prods = conn.execute(
            "SELECT id, name, sale_price, unit FROM products WHERE shop_id=? AND stock_qty > 0 ORDER BY name LIMIT 200",
            (shop_id,)).fetchall()
        cards = "".join(
            f"""<div class="p" data-pid="{p['id']}" data-price="{p['sale_price']}" data-name="{p['name']}">
              <div class="pn">{p['name']}</div>
              <div class="pp">Rs {p['sale_price']:.0f} <span>/{p['unit'] or 'pcs'}</span></div>
              <div class="pq"><button onclick="chQty({p['id']},-1)">−</button><b id="q-{p['id']}">0</b><button onclick="chQty({p['id']},1)">+</button></div>
            </div>""" for p in prods)
        html = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{s['name']} — Online Store</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}body{{font-family:system-ui,-apple-system,sans-serif;background:#f3f4f6;color:#111}}
.head{{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;padding:28px 20px;text-align:center}}
.head h1{{font-size:22px}}.head p{{opacity:.9;font-size:13px;margin-top:4px}}
.wrap{{max-width:560px;margin:0 auto;padding:16px}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:10px}}
.p{{background:#fff;border-radius:12px;padding:12px}}.pn{{font-weight:700;font-size:14px;min-height:38px}}
.pp{{color:#6d28d9;font-weight:800;margin:6px 0}}.pp span{{color:#9ca3af;font-weight:400;font-size:12px}}
.pq{{display:flex;align-items:center;gap:10px}}.pq button{{width:32px;height:32px;border-radius:50%;border:1px solid #ddd;background:#f9fafb;font-size:18px}}
.pq b{{min-width:20px;text-align:center}}
.card{{background:#fff;border-radius:12px;padding:16px;margin-top:14px}}.card h3{{margin-bottom:10px}}
label{{display:block;font-size:12px;color:#6b7280;margin:8px 0 2px}}input,textarea{{width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px}}
#orderbtn{{width:100%;background:#7c3aed;color:#fff;border:0;padding:14px;border-radius:10px;font-size:16px;font-weight:700;margin-top:12px}}
#total{{font-size:18px;font-weight:800;color:#6d28d9;text-align:right;margin-top:8px}}
.err{{color:#dc2626;font-size:13px;margin-top:6px}}.ok{{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-top:14px;text-align:center}}
.foot{{text-align:center;color:#9ca3af;font-size:12px;padding:20px}}
</style></head><body>
<div class="head"><h1>{s['name']}</h1><p>{addr} · {s['phone'] or ''}</p></div>
<div class="wrap">
<div class="grid">{cards or '<div class="card">No products available right now.</div>'}</div>
<div class="card"><h3>Your Order</h3><div id="total">Total: Rs 0</div>
<label>Your Name *</label><input id="c-name" placeholder="Full name">
<label>Mobile Number *</label><input id="c-phone" inputmode="tel" placeholder="03xxxxxxxxx">
<label>Address</label><textarea id="c-addr" rows="2" placeholder="Delivery address"></textarea>
<div class="err" id="o-err"></div>
<button id="orderbtn" onclick="placeOrder()">Place Order</button></div>
<div id="done"></div>
<div class="foot">Powered by Karobar</div></div>
<script>
const SHOP={shop_id};
function chQty(pid,d){{const el=document.getElementById('q-'+pid);el.textContent=Math.max(0,+el.textContent+d);upd();}}
function upd(){{let t=0;document.querySelectorAll('.p').forEach(p=>{{const q=+document.getElementById('q-'+p.dataset.pid).textContent;t+=q*(+p.dataset.price);}});document.getElementById('total').textContent='Total: Rs '+t;}}
async function placeOrder(){{
const items=[];document.querySelectorAll('.p').forEach(p=>{{const q=+document.getElementById('q-'+p.dataset.pid).textContent;if(q>0)items.push({{product_id:+p.dataset.pid,qty:q}});}});
const err=document.getElementById('o-err');err.textContent='';
const name=document.getElementById('c-name').value.trim(),phone=document.getElementById('c-phone').value.trim();
if(!items.length){{err.textContent='Add at least one item.';return;}}
if(name.length<2){{err.textContent='Enter your name.';return;}}
if(phone.replace(/\\D/g,'').length<10){{err.textContent='Enter a valid mobile number.';return;}}
try{{const r=await fetch(`/api/public/store/${{SHOP}}/orders`,{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{customer_name:name,phone,address:document.getElementById('c-addr').value,items}})}});
const d=await r.json();if(!r.ok)throw new Error(d.detail||'Order failed');
document.getElementById('done').innerHTML=`<div class="ok"><h3>Order placed!</h3><div>Order No: <b>${{d.order_no}}</b></div><div>Total: <b>Rs ${{d.total}}</b></div><div style="font-size:13px;color:#6b7280;margin-top:6px">The shop will call you to confirm.</div></div>`;
document.querySelectorAll('.p b').forEach(b=>b.textContent='0');upd();window.scrollTo(0,document.body.scrollHeight);
}}catch(e){{err.textContent=e.message;}}
}}
</script></body></html>"""
        return Response(content=html, media_type="text/html")
    finally:
        conn.close()


# ---------- monthly sales/purchases/expenses (DASHBOARD chart) ----------
@app.get("/api/reports/monthly-sales")
def monthly_sales(months: int = 4, shop_id: int = Depends(shop_of)):
    from datetime import date as _date
    conn = get_db()
    try:
        t = _date.today()
        out = []
        y, m = t.year, t.month
        for _ in range(max(1, min(months, 12))):
            prefix = f"{y}-{m:02d}"
            sale = conn.execute("SELECT COALESCE(SUM(total),0) FROM bills WHERE shop_id=? AND substr(date,1,7)=?",
                                (shop_id, prefix)).fetchone()[0]
            pur = conn.execute("SELECT COALESCE(SUM(total),0) FROM purchases WHERE shop_id=? AND substr(date,1,7)=?",
                               (shop_id, prefix)).fetchone()[0]
            exp = conn.execute("SELECT COALESCE(SUM(amount),0) FROM cash_txns WHERE shop_id=? AND kind='out' AND substr(date,1,7)=?",
                               (shop_id, prefix)).fetchone()[0]
            out.append({"month": prefix, "label": MONTHS_SHORT[m - 1], "sale": sale, "purchase": pur, "expense": exp})
            m -= 1
            if m == 0:
                m, y = 12, y - 1
        out.reverse()
        return out
    finally:
        conn.close()


MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


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
