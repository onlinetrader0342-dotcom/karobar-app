#!/bin/bash
# Karobar smoke test: bash ~/workspace/karobar-app/test-smoke.sh
# Server pehle se chalna chahiye (bash ~/workspace/karobar-app/run.sh)
BASE="${BASE:-http://localhost:8777}"
PASS=0; FAIL=0
chk() { # chk "naam" "expected" "actual"
  local e="${2,,}" a="${3,,}"
  if [ "$e" == "$a" ]; then PASS=$((PASS+1)); echo "PASS: $1";
  else FAIL=$((FAIL+1)); echo "FAIL: $1 (expected '$2', got '$3')"; fi
}

T=$(curl -s -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"phone":"03219807144","password":"demo1234"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
A="Authorization: Bearer $T"
chk "login returns a token" "nonempty" "$([ -n "$T" ] && echo nonempty || echo empty)"

D=$(curl -s $BASE/api/reports/dashboard -H "$A")
chk "dashboard has aaj_ki_sale" "true" "$(echo "$D" | python3 -c "import sys,json;print('aaj_ki_sale' in json.load(sys.stdin))")"

S1=$(curl -s "$BASE/api/products?q=OST-12W" -H "$A" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['stock_qty'])")
B=$(curl -s -X POST $BASE/api/bills -H "$A" -H "Content-Type: application/json" \
  -d '{"items":[{"product_id":1,"qty":2}],"discount":10,"paid":350}')
chk "bill total = 2*180-10 = 350" "350.0" "$(echo "$B" | python3 -c "import sys,json;print(json.load(sys.stdin)['total'])")"
chk "bill baqaya = 0 (fully paid)" "0.0" "$(echo "$B" | python3 -c "import sys,json;print(json.load(sys.stdin)['baqaya'])")"
BID=$(echo "$B" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
S2=$(curl -s "$BASE/api/products?q=OST-12W" -H "$A" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['stock_qty'])")
chk "stock decreased by 2" "$(python3 -c "print($S1-2)")" "$S2"

ERR=$(curl -s -X POST $BASE/api/bills -H "$A" -H "Content-Type: application/json" \
  -d '{"items":[{"product_id":1,"qty":99999}]}' | python3 -c "import sys,json;print('detail' in json.load(sys.stdin))")
chk "bill exceeding stock is blocked" "True" "$ERR"

P=$(curl -s -X POST $BASE/api/parties/1/payments -H "$A" -H "Content-Type: application/json" \
  -d '{"amount":100,"direction":"lena","mode":"cash","note":"smoke test"}')
chk "payment ok" "true" "$(echo "$P" | python3 -c "import sys,json;print(json.load(sys.stdin)['ok'])")"

C=$(curl -s "$BASE/api/cash?date=$(date +%F)" -H "$A")
chk "cash book has txns" "true" "$(echo "$C" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['txns'])>0)")"

R=$(curl -s "$BASE/api/reports/profit?from_date=$(date +%F)&to_date=$(date +%F)" -H "$A")
chk "profit report has profit" "true" "$(echo "$R" | python3 -c "import sys,json;print('profit' in json.load(sys.stdin))")"

M=$(curl -s $BASE/api/auth/me -H "$A" | python3 -c "import sys,json;print(json.load(sys.stdin)['name'])")
chk "settings/me returns shop name" "Imran Electric Store" "$M"

for p in "/" "/static/style.css" "/static/app.js" "/static/manifest.json" "/static/sw.js"; do
  chk "static $p 200" "200" "$(curl -s -o /dev/null -w '%{http_code}' $BASE$p)"
done

# multi-shop isolation: naya shop khali hota hai
T2=$(curl -s -X POST $BASE/api/auth/signup -H "Content-Type: application/json" \
  -d '{"name":"SmokeDukan","phone":"03990001122","password":"x1234"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
if [ -n "$T2" ]; then
  N=$(curl -s $BASE/api/products -H "Authorization: Bearer $T2" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
  chk "naye shop ka data khali (isolation)" "0" "$N"
else
  echo "SKIP: isolation (pehle se maujood number)"
fi

# safai: smoke test ka bill + payment wapas
~/workspace/karobar-app/.venv/bin/python - "$BID" <<'EOF'
import sqlite3, sys
bid = int(sys.argv[1])
conn = sqlite3.connect('/home/hatch/workspace/karobar-app/backend/karobar.db')
conn.execute("PRAGMA foreign_keys=ON"); c = conn.cursor()
for r in c.execute("SELECT product_id, qty FROM bill_items WHERE bill_id=?", (bid,)):
    c.execute("UPDATE products SET stock_qty = stock_qty + ? WHERE id=?", (r[1], r[0]))
c.execute("DELETE FROM cash_txns WHERE ref=?", (f"bill:{bid}",))
c.execute("DELETE FROM bill_items WHERE bill_id=?", (bid,))
c.execute("DELETE FROM bills WHERE id=?", (bid,))
c.execute("DELETE FROM payments WHERE note='smoke test'")
c.execute("DELETE FROM cash_txns WHERE note LIKE '%smoke test%'")
c.execute("DELETE FROM shops WHERE phone IN ('03990001122')")
conn.commit(); conn.close()
print("safai ho gayi")
EOF

echo "---- natija: $PASS pass, $FAIL fail ----"
[ "$FAIL" -eq 0 ]
