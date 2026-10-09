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


# ---------- helpers ----------

def today() -> str:
    return date.today().isoformat()


def shop_of(authorization: Optional[str] = Header(default=None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Login zaroori hai")
    token = authorization[7:]
    conn = get_db()
    try:
        row = conn.execute("SELECT shop_id FROM sessions WHERE token=?", (token,)).fetchone()
        if not row:
            raise HTTPException(401, "Session khatam ho gaya, dobara login karein")
        return row["shop_id"]
    finally:
        conn.close()


def party_balance(conn, shop_id: int, party_id: int, ptype: str) -> float:
    """Deterministic balance. customer: + matlab gahak se LENA hai. supplier: + matlab supplier ko DENA hai."""
    billed = conn.execute(
        "SELECT COALESCE(SUM(total - paid), 0) FROM bills WHERE shop_id=? AND party_id=?",
        (shop_id, party_id)).fetchone()[0]
    if ptype == "customer":
        got = conn.execute(
            "SELECT COALESCE(SUM(amount),0) FROM payments WHERE shop_id=? AND party_id=? AND direction='lena'",
            (shop_id, party_id)).fetchone()[0]
        return round(billed - got, 2)
    else:
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
    unit: str = "naq"


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
            raise HTTPException(400, "Is number se pehle se account hai")
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
            raise HTTPException(401, "Number ya password ghalat hai")
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
            """INSERT INTO products(shop_id,name,sku,purchase_price,sale_price,stock_qty,low_stock_level,unit)
               VALUES (?,?,?,?,?,?,?,?)""",
            (shop_id, b.name, b.sku, b.purchase_price, b.sale_price, b.stock_qty, b.low_stock_level, b.unit))
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
            """UPDATE products SET name=?,sku=?,purchase_price=?,sale_price=?,stock_qty=?,low_stock_level=?,unit=?
               WHERE id=? AND shop_id=?""",
            (b.name, b.sku, b.purchase_price, b.sale_price, b.stock_qty, b.low_stock_level, b.unit, pid, shop_id))
        conn.commit()
        row = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?", (pid, shop_id)).fetchone()
        if not row:
            raise HTTPException(404, "Product nahi mila")
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
            raise HTTPException(400, "Is product ke bill ban chuke hain, delete nahi ho sakta")
        conn.execute("DELETE FROM products WHERE id=? AND shop_id=?", (pid, shop_id))
        conn.commit()
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
        raise HTTPException(400, "type customer ya supplier ho")
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
            raise HTTPException(404, "Party nahi mili")
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
        raise HTTPException(400, "direction lena ya dena ho")
    conn = get_db()
    try:
        p = conn.execute("SELECT * FROM parties WHERE id=? AND shop_id=?", (pid, shop_id)).fetchone()
        if not p:
            raise HTTPException(404, "Party nahi mili")
        if p["type"] == "customer" and b.direction != "lena":
            raise HTTPException(400, "Customer se sirf 'lena' ho sakta hai")
        if p["type"] == "supplier" and b.direction != "dena":
            raise HTTPException(400, "Supplier ko sirf 'dena' ho sakta hai")
        d = b.date or today()
        conn.execute(
            "INSERT INTO payments(shop_id,party_id,date,amount,direction,mode,note) VALUES (?,?,?,?,?,?,?)",
            (shop_id, pid, d, b.amount, b.direction, b.mode, b.note))
        # cash book me bhi darj
        kind = "in" if b.direction == "lena" else "out"
        conn.execute(
            "INSERT INTO cash_txns(shop_id,date,kind,amount,category,note,ref) VALUES (?,?,?,?,?,?,?)",
            (shop_id, d, kind, b.amount, "party", f"{p['name']} — {'wasooli' if kind=='in' else 'adaigi'}",
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
                raise HTTPException(404, "Party nahi mili")
            pname = p["name"]
        d = b.date or today()
        subtotal, cost_total = 0.0, 0.0
        lines = []
        for it in b.items:
            pr = conn.execute("SELECT * FROM products WHERE id=? AND shop_id=?",
                              (it.product_id, shop_id)).fetchone()
            if not pr:
                raise HTTPException(404, f"Product #{it.product_id} nahi mila")
            if pr["stock_qty"] < it.qty:
                raise HTTPException(400, f"'{pr['name']}' ka stock kam hai (mojood: {pr['stock_qty']})")
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
        raise HTTPException(404, "Bill nahi mila")
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
        raise HTTPException(400, "kind in ya out ho")
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO cash_txns(shop_id,date,kind,amount,category,note) VALUES (?,?,?,?,?,?)",
            (shop_id, b.date or today(), b.kind, b.amount, b.category or ("kharcha" if b.kind == "out" else "aamad"),
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
        expense = conn.execute(
            "SELECT COALESCE(SUM(amount),0) FROM cash_txns WHERE shop_id=? AND date=? AND kind='out' AND category='kharcha'",
            (shop_id, t)).fetchone()[0]
        lena = conn.execute(
            """SELECT COALESCE(SUM(b.total - b.paid),0) - COALESCE(
                 (SELECT SUM(amount) FROM payments p JOIN parties pt ON pt.id=p.party_id
                  WHERE p.shop_id=? AND pt.type='customer' AND p.direction='lena'), 0)
               FROM bills b JOIN parties pt ON pt.id=b.party_id
               WHERE b.shop_id=? AND pt.type='customer'""",
            (shop_id, shop_id)).fetchone()[0]
        dena = conn.execute(
            """SELECT COALESCE(SUM(b.total - b.paid),0) - COALESCE(
                 (SELECT SUM(amount) FROM payments p JOIN parties pt ON pt.id=p.party_id
                  WHERE p.shop_id=? AND pt.type='supplier' AND p.direction='dena'), 0)
               FROM bills b JOIN parties pt ON pt.id=b.party_id
               WHERE b.shop_id=? AND pt.type='supplier'""",
            (shop_id, shop_id)).fetchone()[0]
        low = conn.execute(
            "SELECT id, name, stock_qty, low_stock_level, unit FROM products "
            "WHERE shop_id=? AND stock_qty <= low_stock_level ORDER BY stock_qty",
            (shop_id,)).fetchall()
        n_products = conn.execute("SELECT COUNT(*) FROM products WHERE shop_id=?", (shop_id,)).fetchone()[0]
        n_parties = conn.execute("SELECT COUNT(*) FROM parties WHERE shop_id=?", (shop_id,)).fetchone()[0]
        return {
            "aaj_ki_sale": round(sale, 2), "aaj_ka_kharcha": round(expense, 2),
            "kul_lena": round(lena, 2), "kul_dena": round(dena, 2),
            "low_stock": dicts(low), "products": n_products, "parties": n_parties,
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


# ---------- frontend (PWA) ----------

@app.get("/")
def index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.on_event("startup")
def startup():
    init_db()
    # Render jaisi fresh deploy par demo seed (sirf tab jab koi shop na ho)
    try:
        conn = get_db()
        n = conn.execute("SELECT COUNT(*) FROM shops").fetchone()[0]
        conn.close()
        if n == 0:
            import seed  # noqa: F401  (module-level code demo data dalta hai)
    except Exception as e:
        print("auto-seed skip:", e)
