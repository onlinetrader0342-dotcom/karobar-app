# Karobar — Dukan ka Hisab Kitab (Phase 1 MVP)

Vyapar jaisa billing/inventory/khata app, Pakistani dukaandaaron ke liye.
**100% Roman Urdu UI · PKR (Rs) · Koi GST/tax field nahi · Apni branding** (Vyapar ka naam/logo/design copy nahi).

## Chalana

```bash
bash ~/workspace/karobar-app/run.sh
# phir phone/PC browser me kholo: http://<server-ip>:8777
```

Demo login: **03219807144** / **demo1234** (Imran Electric Store, sample data ke sath)

## Structure

```
karobar-app/
├── .venv/            # Python venv (fastapi + uvicorn)
├── backend/
│   ├── app.py        # FastAPI API (auth, products, parties, bills, cash, reports, settings)
│   ├── db.py         # SQLite schema — multi-shop (har dukan ka apna data)
│   ├── auth.py       # PBKDF2 password hashing + bearer tokens
│   ├── seed.py       # Demo data (dobara chalane se duplicate nahi banta)
│   └── karobar.db    # SQLite database
├── frontend/
│   ├── index.html    # Mobile-first PWA shell
│   ├── app.js        # Poori app logic (Roman Urdu)
│   ├── style.css     # Apna teal/amber theme
│   ├── manifest.json # Installable PWA
│   ├── sw.js         # Service worker (offline shell, API hamesha fresh)
│   └── icon.svg      # Apna logo (bolt-in-circle)
└── run.sh
```

## Features (Phase 1)

1. **Dashboard** — aaj ki sale, aaj ka kharcha, gahakon se lena, supplier ko dena, low-stock warning
2. **Billing** — naya bill (gahak select/naya, items, discount, wasooli), bill list, print-friendly bill, **WhatsApp par bill bhejo** button
3. **Stock** — product add/edit/delete, kharid/farokht qeemat, stock miqdar, low-stock alert level, search
4. **Khata** — gahak/supplier list with live balance, payment darj (lena/dena), poori len-den history
5. **Cash Book** — tareekh-wise cash in/out + kharcha darj karna
6. **Reports** — sale report (rozana breakdown), profit report (revenue − laagat − discount), top products
7. **Settings** — dukan ka naam, pata, phone, receipt header text

## Hisab ke usool (deterministic)

- Bill bante waqt stock auto-kam hota hai; stock se zyada miqdar par bill **block** hota hai
- Party balance = (bills ka baqaya) − (wasool shuda payments) — query se compute, kahin save nahi
- Profit = revenue − cost (bill ke waqt wali kharid qeemat) − discount
- Har payment cash book me bhi auto-darj hoti hai

## Test

`bash ~/workspace/karobar-app/test-smoke.sh` — 16 checks (auth, bill math, stock, balances, payments, cash, reports, security, multi-shop isolation). Sab pass. (Server pehle se chalna chahiye.)

## Baqi (Phase 2/3)

- WhatsApp auto payment reminders, staff logins (multi-user per shop)
- Online store, AI features (Munshi/Chhotu integration)
- Desktop version (isi codebase se), Render par deploy
