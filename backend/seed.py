"""Demo shop seed: Imran Electric Store + products + parties + sample bills."""
import sys
from datetime import date, timedelta

sys.path.insert(0, __import__("os").path.dirname(__file__))
from auth import hash_password
from db import get_db, init_db

init_db()
conn = get_db()
cur = conn.cursor()

# demo shop (pehle se ho to skip)
row = cur.execute("SELECT id FROM shops WHERE phone=?", ("03219807144",)).fetchone()
if row:
    shop_id = row["id"]
    print("demo shop pehle se hai, id:", shop_id)
else:
    cur.execute(
        """INSERT INTO shops(name, owner_name, phone, password_hash, address, city, receipt_header)
           VALUES (?,?,?,?,?,?,?)""",
        ("Imran Electric Store", "Azhar Rashid", "03219807144", hash_password("demo1234"),
         "CNG Adda, Wagon Stand, Mandian, Abbottabad", "Abbottabad",
         "Shukriya! Dobara tashreef laein"))
    shop_id = cur.lastrowid
    print("demo shop ban gaya, id:", shop_id)

# products
products = [
    ("Ostric LED Bulb 12W", "OST-12W", 120, 180, 100, 10),
    ("Ostric LED Bulb 18W", "OST-18W", 250, 375, 60, 10),
    ("Ostric LED Bulb 30W", "OST-30W", 500, 750, 40, 5),
    ("OSAKA LED Bulb 12W", "OSK-12W", 110, 165, 80, 10),
    ("Extension Lead 5m", "EXT-5M", 300, 450, 25, 5),
    ("Multi Plug", "MPL-01", 150, 220, 8, 10),   # low stock demo
    ("2-Pin Shoe", "SHOE-2P", 40, 65, 10, 10),    # low stock demo
    ("Wire 1.5mm (coil)", "WIR-15", 2200, 2600, 12, 3),
]
pids = {}
for name, sku, pp, sp, qty, low in products:
    r = cur.execute("SELECT id FROM products WHERE shop_id=? AND sku=?", (shop_id, sku)).fetchone()
    if r:
        pids[name] = r["id"]
    else:
        c = cur.execute(
            "INSERT INTO products(shop_id,name,sku,purchase_price,sale_price,stock_qty,low_stock_level) VALUES (?,?,?,?,?,?,?)",
            (shop_id, name, sku, pp, sp, qty, low))
        pids[name] = c.lastrowid

# parties
parties = [("Atif", "03001234567", "customer"), ("Capital Contactor", "03111234567", "customer"),
           ("Shahid (Ostric Supplier)", "03452195053", "supplier")]
party_ids = {}
for name, phone, t in parties:
    r = cur.execute("SELECT id FROM parties WHERE shop_id=? AND name=?", (shop_id, name)).fetchone()
    if r:
        party_ids[name] = r["id"]
    else:
        c = cur.execute("INSERT INTO parties(shop_id,name,phone,type) VALUES (?,?,?,?)",
                        (shop_id, name, phone, t))
        party_ids[name] = c.lastrowid


def make_bill(bdate, party_name, lines, discount=0, paid=0):
    """lines: [(product_name, qty)]"""
    subtotal = cost = 0
    items = []
    for pname, qty in lines:
        pr = cur.execute("SELECT * FROM products WHERE id=?", (pids[pname],)).fetchone()
        lt = round(pr["sale_price"] * qty, 2)
        subtotal += lt
        cost += round(pr["purchase_price"] * qty, 2)
        items.append((pr, qty, pr["sale_price"], lt))
    subtotal = round(subtotal, 2)
    total = round(subtotal - min(discount, subtotal), 2)
    paid = round(min(paid, total), 2)
    n = cur.execute("SELECT COUNT(*) FROM bills WHERE shop_id=?", (shop_id,)).fetchone()[0]
    bill_no = f"KAR-{n+1:05d}"
    pid = party_ids.get(party_name)
    c = cur.execute(
        "INSERT INTO bills(shop_id,bill_no,party_id,party_name,date,subtotal,discount,total,paid,mode) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (shop_id, bill_no, pid, party_name or "Walk-in", bdate, subtotal, discount, total, paid, "cash"))
    bid = c.lastrowid
    for pr, qty, price, lt in items:
        cur.execute("INSERT INTO bill_items(bill_id,product_id,product_name,qty,price,cost,total) VALUES (?,?,?,?,?,?,?)",
                    (bid, pr["id"], pr["name"], qty, price, pr["purchase_price"], lt))
        cur.execute("UPDATE products SET stock_qty = stock_qty - ? WHERE id=?", (qty, pr["id"]))
    if paid:
        cur.execute("INSERT INTO cash_txns(shop_id,date,kind,amount,category,note,ref) VALUES (?,?,?,?,?,?,?)",
                    (shop_id, bdate, "in", paid, "sale", f"Bill {bill_no}" + (f" — {party_name}" if party_name else ""), f"bill:{bid}"))
    return bid


# sample history (agar bills nahi hain)
if cur.execute("SELECT COUNT(*) FROM bills WHERE shop_id=?", (shop_id,)).fetchone()[0] == 0:
    t = date.today()
    make_bill((t - timedelta(days=2)).isoformat(), "Atif", [("Ostric LED Bulb 12W", 10)], paid=1800)
    make_bill((t - timedelta(days=1)).isoformat(), "Capital Contactor",
              [("Ostric LED Bulb 30W", 4), ("Extension Lead 5m", 2)], discount=100, paid=2000)
    make_bill((t - timedelta(days=1)).isoformat(), "", [("OSAKA LED Bulb 12W", 6)], paid=990)
    make_bill(t.isoformat(), "Atif", [("Ostric LED Bulb 18W", 2), ("Multi Plug", 1)], paid=0)
    make_bill(t.isoformat(), "", [("2-Pin Shoe", 5)], paid=325)
    # payment: Atif se wasooli
    cur.execute("INSERT INTO payments(shop_id,party_id,date,amount,direction,mode,note) VALUES (?,?,?,?,?,?,?)",
                (shop_id, party_ids["Atif"], t.isoformat(), 1000, "lena", "cash", "Pehli wasooli"))
    cur.execute("INSERT INTO cash_txns(shop_id,date,kind,amount,category,note,ref) VALUES (?,?,?,?,?,?,?)",
                (shop_id, t.isoformat(), "in", 1000, "party", "Atif — wasooli", f"party:{party_ids['Atif']}"))
    # aaj ka kharcha
    cur.execute("INSERT INTO cash_txns(shop_id,date,kind,amount,category,note) VALUES (?,?,?,?,?,?)",
                (shop_id, t.isoformat(), "out", 500, "kharcha", "Dukan ka kharcha (chai + safai)"))
    print("sample bills/payments ban gaye")

conn.commit()
conn.close()
print("seed mukammal")
