/* Karobar PWA — full rewrite. Frontend only, backend does all accounting.
   Labels 100% English, currency Rs, no GST/tax fields. */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rs = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const todayISO = () => new Date().toISOString().slice(0, 10);
const waPhone = (p) => String(p || "").replace(/\D/g, "");
const MON_S = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/* BRAND COLOUR — poori app ka primary colour sirf ek jagah se: style.css :root me --blue.
   Azhar jab naya colour chune to sirf woh line badlegi; yeh function wahi parhta hai. */
function brandPrimary() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--blue").trim();
    return v || "#7c3aed";
  } catch (e) { return "#7c3aed"; }
}
function fmtD(iso) {
  if (!iso) return "";
  const m = String(iso).slice(0, 10).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${m[3]} ${MON_S[+m[2] - 1]}, ${m[1].slice(2)}`;
}

/* ---------- inline SVG line icons (Vyapar-style, no emoji) ---------- */
const _P = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/>',
  cheque: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>',
  dots: '<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  ledger: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  truck: '<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  bank: '<path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2l8 5H4z"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  cash: '<rect x="1" y="4" width="22" height="16" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/>',
  chart: '<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>',
  sliders: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  idcard: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 17c.6-1.7 1.7-2.5 3-2.5s2.4.8 3 2.5"/><path d="M14 9h5"/><path d="M14 13h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  x: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
  back: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
  store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v2a3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-3 3 3 3 0 0 1-3-3z"/><path d="M5 12v8h14v-8"/><path d="M9 20v-5h6v5"/>',
  funnel: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
  shareCurve: '<path d="M13 5l7 7-7 7"/><path d="M20 12H9a5 5 0 0 0-5 5V4"/>',
  dotsV: '<circle cx="12" cy="5" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.7" fill="currentColor" stroke="none"/>',
  chevR: '<path d="M9 18l6-6-6-6"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  chevU: '<path d="M18 15l-6-6-6 6"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16V7"/><path d="M18 12a1.5 1.5 0 0 0 0 3h-2a1.5 1.5 0 0 1 0-3z"/>',
  pct: '<path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  arrDL: '<path d="M7 7l10 10"/><path d="M17 8v9H8"/>',
  arrUR: '<path d="M7 17L17 7"/><path d="M8 7h9v9"/>',
  plusCirc: '<circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h4"/>',
  coins: '<ellipse cx="12" cy="6" rx="8" ry="3.5"/><path d="M4 6v6c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5V6"/><path d="M4 12v6c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-6"/>',
  cheque: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h6"/><path d="M6 15h4"/><path d="M16 10v5"/>',
  loan: '<circle cx="12" cy="12" r="10"/><path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  rupee: '<circle cx="12" cy="12" r="10"/><path d="M9 7h7"/><path d="M9 11h7"/><path d="M9 7c4 0 5 1.5 5 4s-1 4-5 4l6 4"/>',
  boxPlus: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M12 8v8"/><path d="M8 12h8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  pos: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 9h4"/><path d="M7 12.5h7"/>',
  receiptPlus: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M12 7v6"/><path d="M9 10h6"/>',
  clipboardPct: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 13h4"/><path d="M9 17h2"/><circle cx="16.5" cy="16.5" r="3.2" fill="#fff"/><path d="M18.3 14.7l-3.6 3.6"/><circle cx="15.4" cy="15.4" r=".6" fill="#2b3445" stroke="none"/><circle cx="17.6" cy="17.6" r=".6" fill="#2b3445" stroke="none"/>',
  circleArrow: '<circle cx="12" cy="12" r="10"/><path d="M10 8l4 4-4 4"/>',
};
function ic(name, size) {
  const s = size || 22;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${_P[name] || ""}</svg>`;
}

const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function niceDate(iso) {
  if (!iso) return "";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return String(iso);
  return DAYS_EN[d.getDay()] + ", " + d.getDate() + " " + MONTHS_EN[d.getMonth()] + " " + d.getFullYear();
}
const MODES = [["cash", "Cash"], ["bank", "Bank"], ["online", "Online (JazzCash/Easypaisa)"]];
function modeLabel(m) { const f = MODES.find((x) => x[0] === m); return f ? f[1] : (m || ""); }
const CAT_LABELS = {expense: "Expense", income: "Income", sale: "Sale", party: "Party", purchase: "Purchase", adjustment: "Adjustment"};
function catLabel(c) { return CAT_LABELS[c] || c || ""; }

let TOKEN = localStorage.getItem("karobar_token") || "";
let SHOP = null;
let authMode = "login";

async function api(path, method = "GET", body = null) {
  const res = await fetch("/api" + path, {
    method,
    headers: {"Content-Type": "application/json", "Authorization": "Bearer " + TOKEN},
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || ("Error " + res.status));
  return data;
}

function authHeaders() { return {"Authorization": "Bearer " + TOKEN}; }

/* ---------- auth ---------- */
function showAuthTab(mode) {
  authMode = mode;
  $("tab-login").classList.toggle("active", mode === "login");
  $("tab-signup").classList.toggle("active", mode === "signup");
  $("auth-login").style.display = mode === "login" ? "" : "none";
  $("auth-signup").style.display = mode === "signup" ? "" : "none";
  $("auth-err").textContent = "";
}

async function doAuth() {
  $("auth-err").textContent = "";
  try {
    let r;
    if (authMode === "login") {
      r = await fetch("/api/auth/login", {method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({phone: $("login-phone").value.trim(), password: $("login-pass").value})});
    } else {
      r = await fetch("/api/auth/signup", {method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name: $("su-shop").value.trim(), owner_name: $("su-owner").value.trim(),
          phone: $("su-phone").value.trim(), password: $("su-pass").value})});
    }
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || "Login failed");
    TOKEN = d.token;
    localStorage.setItem("karobar_token", TOKEN);
    await boot();
  } catch (e) { $("auth-err").textContent = e.message; }
}

async function logout() {
  try { await api("/auth/logout", "POST"); } catch (e) {}
  TOKEN = ""; localStorage.removeItem("karobar_token");
  sessionStorage.removeItem("karobar_unlocked");
  location.reload();
}

/* ---------- navigation ---------- */
const RENDER = {};
function go(view, arg) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $("" + view).classList.add("active");
  document.body.classList.toggle("nosavenav", view === "v-sale-new" || view === "v-add-items");
  document.querySelectorAll("#bottom-nav button").forEach((b) =>
    b.classList.toggle("active", b.dataset.v === view));
  if (RENDER[view]) RENDER[view](arg);
  window.scrollTo(0, 0);
}

function modal(html, cls) {
  const c = cls ? " " + cls : "";
  $("modal-root").innerHTML = `<div class="modal-bg${c}" onclick="if(event.target===this)closeModal()"><div class="modal${c}">${html}</div></div>`;
}
function closeModal() { $("modal-root").innerHTML = ""; }

/* ---------- top header (Vyapar mobile) ---------- */
function renderShopHeader() {
  const nm = (SHOP && SHOP.name ? SHOP.name : "KAROBAR").toUpperCase();
  $("shop-name").textContent = nm;
}
function headFilter() {
  const s = $("txn-search");
  if (s && $("v-home").classList.contains("active")) { s.focus(); window.scrollTo(0, 0); }
  else go("v-home");
}
function comingSoon(name) {
  modal(`<h3>${esc(name)}</h3><div class="empty">This feature is coming soon.<br>We are building it for you.</div><button class="btn primary block" onclick="closeModal()">OK</button>`);
}
function toast(msg) {
  modal(`<div class="empty" style="padding:18px">${esc(msg)}</div><button class="btn primary block" onclick="closeModal()">OK</button>`);
}

/* ================= HOME ================= */

function goReport(sub) { REP_SUB = sub; go("v-reports"); }
function quickBill() { SALE_TAB = "bills"; go("v-sale"); openDocForm("sale"); }
function quickPurchase() { go("v-kharid"); openDocForm("purchase"); }

/* ================= SALE (Bills | Estimates) ================= */
let SALE_TAB = "bills";
RENDER["v-sale"] = async () => {
  const v = $("v-sale");
  v.innerHTML = `
    <div class="tabs">
      <button class="${SALE_TAB === "bills" ? "active" : ""}" onclick="SALE_TAB='bills';RENDER['v-sale']()">Bills</button>
      <button class="${SALE_TAB === "estimates" ? "active" : ""}" onclick="SALE_TAB='estimates';RENDER['v-sale']()">Estimates</button>
      <button class="${SALE_TAB === "proforma" ? "active" : ""}" onclick="SALE_TAB='proforma';RENDER['v-sale']()">Proforma</button>
      <button class="${SALE_TAB === "orders" ? "active" : ""}" onclick="SALE_TAB='orders';RENDER['v-sale']()">Orders</button>
      <button class="${SALE_TAB === "returns" ? "active" : ""}" onclick="SALE_TAB='returns';RENDER['v-sale']()">Returns</button>
    </div>
    <div id="sale-list"><div class="card">Loading…</div></div>`;
  const box = $("sale-list");
  try {
    if (SALE_TAB === "bills") {
      const bills = await api("/bills");
      box.innerHTML = `<button class="fab" onclick="openDocForm('sale')">+</button>` +
        (bills.length ? bills.map((b) => `
          <div class="list-item" onclick="go('v-bill-detail', ${b.id})">
            <div><div class="t">${esc(b.bill_no)}${b.party_name ? " — " + esc(b.party_name) : ""}</div>
            <div class="s">${niceDate(b.date)}</div></div>
            <div style="text-align:right"><div class="t">${rs(b.total)}</div>
            ${b.baqaya > 0 ? `<span class="badge warn">Due ${rs(b.baqaya)}</span>` : `<span class="badge ok">Paid</span>`}</div>
          </div>`).join("")
        : `<div class="empty">No bills yet.<br>Tap + to create your first bill.</div>`);
    } else if (SALE_TAB === "estimates") {
      const ests = await api("/estimates");
      box.innerHTML = `<button class="fab" onclick="openDocForm('estimate')">+</button>` +
        (ests.length ? ests.map((e) => `
          <div class="list-item" onclick="go('v-est-detail', ${e.id})">
            <div><div class="t">${esc(e.est_no)}${e.party_name ? " — " + esc(e.party_name) : ""}</div>
            <div class="s">${niceDate(e.date)}</div></div>
            <div style="text-align:right"><div class="t">${rs(e.total)}</div>
            <span class="badge ${e.status === "open" ? "info" : "ok"}">${e.status === "open" ? "Open" : esc(e.status)}</span></div>
          </div>`).join("")
        : `<div class="empty">No estimates yet.<br>Tap + to create your first estimate.</div>`);
    } else if (SALE_TAB === "proforma") {
      const list = await api("/proformas");
      box.innerHTML = `<button class="fab" onclick="openDocForm('proforma')">+</button>` +
        (list.length ? list.map((p) => `
          <div class="list-item" onclick="go('v-pf-detail', ${p.id})">
            <div><div class="t">${esc(p.pf_no)}${p.party_name ? " — " + esc(p.party_name) : ""}</div>
            <div class="s">${niceDate(p.date)}</div></div>
            <div style="text-align:right"><div class="t">${rs(p.total)}</div>
            ${p.status === "pending" ? `<span class="badge warn">Pending</span>` : `<span class="badge ok">Billed</span>`}</div>
          </div>`).join("")
        : `<div class="empty">No proforma invoices yet.<br>Tap + to create one.</div>`);
    } else if (SALE_TAB === "orders") {
      const orders = await api("/sale-orders");
      const badge = (s) => s === "pending" ? `<span class="badge warn">Pending</span>` : s === "converted" ? `<span class="badge ok">Billed</span>` : `<span class="badge">Cancelled</span>`;
      box.innerHTML = `<button class="fab" onclick="openDocForm('sale-order')">+</button>` +
        (orders.length ? orders.map((o) => `
          <div class="list-item" onclick="go('v-so-detail', ${o.id})">
            <div><div class="t">${esc(o.order_no)}${o.party_name ? " — " + esc(o.party_name) : ""}</div>
            <div class="s">${niceDate(o.date)}</div></div>
            <div style="text-align:right"><div class="t">${rs(o.total)}</div>${badge(o.status)}</div>
          </div>`).join("")
        : `<div class="empty">No sale orders yet.<br>Tap + to create your first order.</div>`);
    } else {
      const notes = await api("/credit-notes");
      box.innerHTML = `<button class="fab" onclick="openDocForm('credit-note')">+</button>` +
        (notes.length ? notes.map((n) => `
          <div class="list-item" onclick="go('v-cn-detail', ${n.id})">
            <div><div class="t">${esc(n.note_no)}${n.party_name ? " — " + esc(n.party_name) : ""}</div>
            <div class="s">${niceDate(n.date)}${n.reason ? " · " + esc(n.reason) : ""}</div></div>
            <div style="text-align:right"><div class="t">${rs(n.total)}</div><span class="badge info">Credit</span></div>
          </div>`).join("")
        : `<div class="empty">No credit notes yet.<br>Tap + to record a sale return.</div>`);
    }
  } catch (e) { box.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

/* ---------- generic bill/purchase/estimate/order form ---------- */
/* mode: sale | purchase | estimate | sale-order | purchase-order */
let DOC = null;
async function openDocForm(mode) {
  const ptype = (mode === "purchase" || mode === "purchase-order" || mode === "debit-note") ? "supplier" : "customer";
  const titles = {sale: "New Bill", purchase: "Purchase Bill", estimate: "New Estimate",
                  "sale-order": "New Sale Order", "purchase-order": "New Purchase Order",
                  "credit-note": "Credit Note (Sale Return)", "debit-note": "Debit Note (Purchase Return)",
                  "proforma": "Proforma Invoice"};
  try {
    const [products, parties] = await Promise.all([api("/products"), api("/parties?type=" + ptype)]);
    DOC = {mode, party_id: null, party_name: "", items: [], discount: 0, paid: 0, paymode: "cash",
           products, parties, title: titles[mode] || "New", _billUdf: []};
    if (mode === "sale" || mode === "purchase") {
      DOC._billUdf = await udfFields("bill").catch(() => []);
    }
    renderDocForm();
  } catch (e) { modal(`<h3>Error</h3><div class="card err">${esc(e.message)}</div><button class="btn ghost block" onclick="closeModal()">Close</button>`); }
}
function docDefPrice(p) { return (DOC.mode === "purchase" || DOC.mode === "purchase-order" || DOC.mode === "debit-note") ? p.purchase_price : p.sale_price; }
function docPartyWord() { return (DOC.mode === "purchase" || DOC.mode === "purchase-order" || DOC.mode === "debit-note") ? "Supplier" : "Customer"; }
function docNoPay() { return ["estimate","sale-order","purchase-order","credit-note","debit-note","proforma"].includes(DOC.mode); }
function docLineTotal(it) {
  const p = DOC.products.find((x) => x.id === it.product_id);
  return (it.price ?? (p ? docDefPrice(p) : 0)) * it.qty;
}
function docSubtotal() { return DOC.items.reduce((s, it) => s + docLineTotal(it), 0); }

function renderDocForm() {
  const showSerialBtn = DOC.mode === "sale";
  const lines = DOC.items.map((it, i) => {
    const p = DOC.products.find((x) => x.id === it.product_id);
    const snCount = (it.serials || []).length;
    return `<div class="line">
      <div class="grow"><b>${esc(p ? p.name : "?")}</b><div class="s">stock ${p ? p.stock_qty : "?"}${snCount ? ` · <b style="color:var(--blue-dark)">${snCount} serial${snCount > 1 ? "s" : ""}</b>` : ""}</div></div>
      <input type="number" min="1" value="${it.qty}" onchange="docQty(${i}, this.value)" title="Qty">
      <input type="number" min="0" value="${it.price}" onchange="docPrice(${i}, this.value)" title="Price">
      ${showSerialBtn ? `<button class="icon-btn" onclick="openSerialPicker(${i})" title="Pick serial numbers" style="width:auto;padding:0 8px;font-size:12px">🔢</button>` : ""}
      <button class="icon-btn" onclick="docRemove(${i})"></button>
    </div>
    <div style="text-align:right;font-size:12px;color:#6b7280;margin-bottom:6px">${rs(docLineTotal(it))}</div>`;
  }).join("");
  const sub = docSubtotal();
  const total = Math.max(0, sub - (DOC.discount || 0));
  const baqaya = Math.max(0, total - (DOC.paid || 0));
  const isEst = docNoPay();
  modal(`
    <h3>${DOC.title}</h3>
    <label class="f">${docPartyWord()} (empty = walk-in)</label>
    <select id="df-party" onchange="docPartyChange(this.value)">
      <option value="">— Walk-in —</option>
      ${DOC.parties.map((p) => `<option value="${p.id}" ${DOC.party_id == p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
    </select>
    <div class="row" style="margin-top:8px">
      <input id="df-newparty" class="grow" placeholder="New ${docPartyWord().toLowerCase()} name">
      <button class="btn sm ghost" onclick="docAddParty()">+ Add</button>
    </div>
    ${docLimitWarnHTML()}
    <button class="add-items-btn" onclick="togglePicker()">+ Add Items</button>
    <div class="row" style="margin-top:8px">
      <input id="df-barcode" class="grow" placeholder="Scan / type barcode, press Enter" onkeydown="if(event.key==='Enter'){docScanBarcode();}">
      <button class="btn sm ghost" onclick="docScanBarcode()">Add</button>
      <button class="btn sm ghost" onclick="docCameraScan()" title="Camera scan">Camera</button>
    </div>
    <div class="err" id="df-barcode-err" style="font-size:12px"></div>
    <div id="df-picker" style="display:${DOC._pickerOpen ? "" : "none"}">
      <div class="row" style="margin-top:8px">
        <select id="df-product" class="grow">
          ${DOC.products.map((p) => `<option value="${p.id}">${esc(p.name)} — ${rs(docDefPrice(p))} (stock ${p.stock_qty})</option>`).join("")}
        </select>
      </div>
      <div class="row" style="margin-top:8px">
        <input id="df-qty" class="grow" type="number" min="1" value="1" placeholder="Qty">
        <button class="btn sm primary" onclick="docAddItem()">+ Add</button>
      </div>
    </div>
    <div class="doc-items">${lines}</div>
    ${DOC._billUdf && DOC._billUdf.length ? `<div class="card" style="margin-top:8px"><h4>Extra Fields</h4>` +
      DOC._billUdf.map((f) => udfInputHTML(f, "")).join("") + `</div>` : ""}
    <div class="sumcard">
      <div class="sumrow"><span class="lbl">Sub Total</span><span class="amt">${rs(sub)}</span></div>
      <div class="sumrow"><span class="lbl">Discount</span><input type="number" min="0" value="${DOC.discount}" onchange="DOC.discount=+this.value||0;renderDocForm()"></div>
      <div class="sumrow total"><span class="lbl">Total</span><span class="amt">${rs(total)}</span></div>
      ${isEst ? "" : `
      <div class="sumrow"><span class="lbl">Paid Amount</span>
        <div class="paid-wrap">
          <input type="number" min="0" max="${total}" value="${Math.min(DOC.paid || 0, total)}" onchange="docPaidInput(this.value, this)">
          <input type="range" class="paid-slider" min="0" max="${total}" step="1" value="${Math.min(DOC.paid || 0, total)}" oninput="docPaidInput(this.value, this)">
        </div>
      </div>
      <div class="sumrow"><span class="lbl">Due Amount</span><span class="amt" id="df-due" style="color:${baqaya > 0 ? "#dc2626" : "#16a34a"}">${rs(baqaya)}</span></div>
      <div class="sumrow"><span class="lbl">Payment Type</span>
        <select onchange="DOC.paymode=this.value">
          ${MODES.map((m) => `<option value="${m[0]}" ${DOC.paymode === m[0] ? "selected" : ""}>${m[1]}</option>`).join("")}
        </select>
      </div>`}
    </div>
    <div class="err" id="df-err"></div>
    <div class="btn-row">
      <button class="btn cancel" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="docSave(${total})">Save</button>
    </div>` , "doc");
}
function togglePicker() { DOC._pickerOpen = !DOC._pickerOpen; renderDocForm(); }
function docPaidInput(v, el) {
  DOC.paid = Math.max(0, +v || 0);
  const wrap = el.closest(".paid-wrap");
  const num = wrap.querySelector('input[type="number"]');
  const slider = wrap.querySelector('input[type="range"]');
  if (num && el !== num) num.value = DOC.paid;
  if (slider && el !== slider) slider.value = Math.min(DOC.paid, +slider.max || DOC.paid);
  const dueEl = document.getElementById("df-due");
  if (dueEl) {
    const total = Math.max(0, docSubtotal() - (DOC.discount || 0));
    const due = Math.max(0, total - DOC.paid);
    dueEl.textContent = rs(due);
    dueEl.style.color = due > 0 ? "#dc2626" : "#16a34a";
  }
}
function docPartyChange(v) {
  DOC.party_id = v ? +v : null;
  const p = DOC.parties.find((x) => x.id === DOC.party_id);
  DOC.party_name = p ? p.name : "";
  DOC._limitInfo = null;
  if (DOC.mode === "sale" && DOC.party_id) {
    api("/parties/" + DOC.party_id).then((pi) => {
      DOC._limitInfo = {balance: pi.balance || 0, credit_limit: pi.credit_limit || 0};
      renderDocForm();
    }).catch(() => {});
  } else {
    renderDocForm();
  }
}
function docLimitWarnHTML() {
  const li = DOC._limitInfo;
  if (DOC.mode !== "sale" || !li || !(li.credit_limit > 0)) return "";
  const due = Math.max(0, docSubtotal() - (DOC.discount || 0) - (DOC.paid || 0));
  const proj = li.balance + due;
  if (proj > li.credit_limit) {
    return `<div class="card" style="background:#fef2f2;border:1px solid #fecaca;padding:10px;margin-top:8px">
      <b style="color:#dc2626">⚠ Credit limit warning</b>
      <div style="font-size:12px;color:#991b1b">Balance ${rs(li.balance)} + this bill ${rs(due)} = ${rs(proj)} exceeds limit ${rs(li.credit_limit)}.</div></div>`;
  }
  return `<div style="font-size:12px;color:#6b7280;margin-top:6px">Balance ${rs(li.balance)} / Limit ${rs(li.credit_limit)}</div>`;
}
async function docAddParty() {
  const name = $("df-newparty").value.trim();
  if (!name) return;
  try {
    const p = await api("/parties", "POST", {name, type: DOC.mode === "purchase" ? "supplier" : "customer"});
    DOC.parties.push(p);
    DOC.party_id = p.id; DOC.party_name = p.name;
    renderDocForm();
  } catch (e) { $("df-err").textContent = e.message; }
}
function docAddItem() {
  const pid = +$("df-product").value, qty = +$("df-qty").value || 0;
  if (qty <= 0) return;
  const p = DOC.products.find((x) => x.id === pid);
  const ex = DOC.items.find((i) => i.product_id === pid);
  if (ex) ex.qty += qty;
  else DOC.items.push({product_id: pid, qty, price: p ? docDefPrice(p) : 0});
  renderDocForm();
}
function docQty(i, v) { DOC.items[i].qty = Math.max(1, +v || 1); renderDocForm(); }
function docPrice(i, v) { DOC.items[i].price = Math.max(0, +v || 0); renderDocForm(); }
function docRemove(i) { DOC.items.splice(i, 1); renderDocForm(); }

/* ---------- barcode scan (billing) ---------- */
function docAddProductById(pid, qty) {
  qty = Math.max(1, +qty || 1);
  const p = DOC.products.find((x) => x.id === pid);
  const ex = DOC.items.find((i) => i.product_id === pid);
  if (ex) ex.qty += qty;
  else DOC.items.push({product_id: pid, qty, price: p ? docDefPrice(p) : 0, serials: []});
  renderDocForm();
}

async function docScanBarcode() {
  const inp = $("df-barcode");
  const err = $("df-barcode-err");
  const code = (inp.value || "").trim();
  err.textContent = "";
  if (!code) return;
  try {
    const p = await api("/products/by-barcode?code=" + encodeURIComponent(code));
    if (!DOC.products.find((x) => x.id === p.id)) DOC.products.push(p);
    docAddProductById(p.id, 1);
    inp.value = "";
    inp.focus();
  } catch (e) { err.textContent = e.message; }
}

function docCameraScan() {
  modal(`
    <h3>Camera Scan</h3>
    <div id="cam-box" style="min-height:200px;background:#000;border-radius:10px;overflow:hidden"></div>
    <div class="err" id="cam-err"></div>
    <button class="btn ghost block" onclick="docCameraStop();renderDocForm()">Close</button>`);
  const err = $("cam-err");
  const fail = (m) => { err.textContent = m + " — type the barcode in the box instead."; };
  if (!window.Html5Qrcode) {
    const sc = document.createElement("script");
    sc.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
    sc.onload = () => docCameraStart(fail);
    sc.onerror = () => fail("Camera library could not load (offline?)");
    document.head.appendChild(sc);
  } else {
    docCameraStart(fail);
  }
}

async function docCameraStart(fail) {
  try {
    const qr = new Html5Qrcode("cam-box");
    window._qr = qr;
    await qr.start({facingMode: "environment"}, {fps: 10, qrbox: 220},
      (code) => {
        docCameraStop();
        const inp = $("df-barcode");
        if (inp) { inp.value = code; docScanBarcode(); }
        else toast("Scanned: " + code);
      }, () => {});
  } catch (e) { fail("Camera not available: " + e.message); }
}

function docCameraStop() {
  try { if (window._qr) { window._qr.stop().catch(() => {}); window._qr = null; } } catch (e) {}
}

/* ---------- serial picker (sale form) ---------- */
async function openSerialPicker(i) {
  const it = DOC.items[i];
  try {
    const list = await api(`/products/${it.product_id}/serials?status=in_stock`);
    if (!list.length) { toast("No serial numbers registered for this product"); return; }
    const cur = new Set(it.serials || []);
    modal(`
      <h3>Pick Serial Numbers</h3>
      <div style="color:#6b7280;font-size:12px;margin-bottom:8px">Ticked serials will be sold. Quantity = ticked count.</div>
      <div style="max-height:300px;overflow:auto">
      ${list.map((s) => `
        <label class="list-item" style="cursor:pointer">
          <input type="checkbox" data-sn="${esc(s.serial_no)}" ${cur.has(s.serial_no) ? "checked" : ""} style="width:20px;height:20px">
          <div class="t" style="font-family:monospace">${esc(s.serial_no)}</div>
        </label>`).join("")}
      </div>
      <div class="err" id="sp-err"></div>
      <button class="btn primary block" onclick="saveSerialPicker(${i})">Done</button>
      <button class="btn ghost block" onclick="renderDocForm()">Cancel</button>`);
  } catch (e) { toast(e.message); }
}

function saveSerialPicker(i) {
  const picked = [...document.querySelectorAll("[data-sn]:checked")].map((c) => c.dataset.sn);
  if (!picked.length) { $("sp-err").textContent = "Pick at least one serial, or Cancel"; return; }
  DOC.items[i].serials = picked;
  DOC.items[i].qty = picked.length;
  renderDocForm();
}

/* ---------- serial manager (product form) ---------- */
async function openSerialManager(pid) {
  const p = (window._products || []).find((x) => x.id === pid);
  if (!p) return;
  try {
    const list = await api(`/products/${pid}/serials`);
    const inStock = list.filter((s) => s.status === "in_stock");
    const sold = list.filter((s) => s.status === "sold");
    modal(`
      <h3>Serial Numbers — ${esc(p.name)}</h3>
      <label class="f">Add serials (one per line)</label>
      <textarea id="sm-add" rows="3" placeholder="IMEI001&#10;IMEI002"></textarea>
      <div class="err" id="sm-err"></div>
      <button class="btn primary block" onclick="saveSerials(${pid})">Add Serials</button>
      <h4 style="margin:12px 0 6px">In Stock (${inStock.length})</h4>
      <div style="max-height:180px;overflow:auto">
      ${inStock.length ? inStock.map((s) => `
        <div class="list-item"><div class="t" style="font-family:monospace">${esc(s.serial_no)}</div>
        <button class="btn sm ghost" style="color:#dc2626" onclick="delSerial(${s.id}, ${pid})">Delete</button></div>`).join("")
        : `<div class="empty">None in stock</div>`}
      </div>
      ${sold.length ? `<h4 style="margin:12px 0 6px">Sold (${sold.length})</h4>
      <div style="max-height:120px;overflow:auto">
      ${sold.map((s) => `<div class="list-item"><div class="t" style="font-family:monospace">${esc(s.serial_no)}</div><span class="badge">Sold</span></div>`).join("")}
      </div>` : ""}
      <button class="btn ghost block" onclick="openProductForm(${pid})">← Back to Product</button>`);
  } catch (e) { toast(e.message); }
}

async function saveSerials(pid) {
  const serials = $("sm-add").value.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  if (!serials.length) { $("sm-err").textContent = "Enter at least one serial"; return; }
  try {
    const r = await api(`/products/${pid}/serials`, "POST", {serials});
    toast(`Added ${r.added}${r.skipped ? `, ${r.skipped} duplicate skipped` : ""}`);
    openSerialManager(pid);
  } catch (e) { $("sm-err").textContent = e.message; }
}

async function delSerial(sid, pid) {
  if (!confirm("Delete this serial number?")) return;
  try { await api("/serials/" + sid, "DELETE"); openSerialManager(pid); }
  catch (e) { alert(e.message); }
}

async function docSave(total) {
  if (!DOC.items.length) { $("df-err").textContent = "Add an item first"; return; }
  const isEst = docNoPay();
  const body = {
    party_id: DOC.party_id, party_name: DOC.party_name,
    items: DOC.items.map((i) => ({product_id: i.product_id, qty: i.qty, price: i.price, serials: i.serials || []})),
    discount: DOC.discount || 0,
  };
  if (!isEst) { body.paid = Math.min(DOC.paid || 0, total); body.mode = DOC.paymode; }
  try {
    if (DOC.mode === "sale") {
      const b = await api("/bills", "POST", body);
      await udfSave("bill", b.id);
      closeModal(); go("v-bill-detail", b.id);
    } else if (DOC.mode === "purchase") {
      const p = await api("/purchases", "POST", body);
      await udfSave("bill", p.id);
      closeModal(); go("v-kharid-detail", p.id);
    } else if (DOC.mode === "sale-order") {
      const o = await api("/sale-orders", "POST", body);
      closeModal(); SALE_TAB = "orders"; go("v-so-detail", o.id);
    } else if (DOC.mode === "purchase-order") {
      const o = await api("/purchase-orders", "POST", body);
      closeModal(); KHARID_TAB = "orders"; go("v-po-detail", o.id);
    } else if (DOC.mode === "credit-note") {
      const n = await api("/credit-notes", "POST", body);
      closeModal(); SALE_TAB = "returns"; go("v-cn-detail", n.id);
    } else if (DOC.mode === "debit-note") {
      const n = await api("/debit-notes", "POST", body);
      closeModal(); KHARID_TAB = "returns"; go("v-dn-detail", n.id);
    } else if (DOC.mode === "proforma") {
      const p = await api("/proformas", "POST", body);
      closeModal(); SALE_TAB = "proforma"; go("v-pf-detail", p.id);
    } else {
      const e = await api("/estimates", "POST", body);
      closeModal(); go("v-est-detail", e.id);
    }
  } catch (e) { $("df-err").textContent = e.message; }
}

/* ---------- bill detail ---------- */
function docPaperHTML(shop, ref, date, partyName, items, subtotal, discount, total, paid, baqaya, mode, refLabel) {
  const rows = items.map((it) => `
    <tr><td>${esc(it.product_name)}<br><span style="color:#6b7280">${it.qty} × ${rs(it.price)}</span></td>
    <td class="num">${rs(it.total)}</td></tr>`).join("");
  return `
  <div class="bill-paper">
    <div class="center">
      <div class="shopname">${esc(shop.name)}</div>
      <div class="meta">${esc(shop.address || "")}${shop.phone ? " · " + esc(shop.phone) : ""}</div>
      ${shop.receipt_header ? `<div class="meta">${esc(shop.receipt_header)}</div>` : ""}
    </div>
    <div class="divider"></div>
    <div class="kv"><span>${refLabel || "Bill No"}</span><b>${esc(ref)}</b></div>
    <div class="kv"><span>Date</span><b>${niceDate(date)}</b></div>
    ${partyName ? `<div class="kv"><span>Customer</span><b>${esc(partyName)}</b></div>` : ""}
    ${mode ? `<div class="kv"><span>Method</span><b>${esc(modeLabel(mode))}</b></div>` : ""}
    <div class="divider"></div>
    <table class="tbl"><tr><th>Item</th><th class="num">Amount</th></tr>${rows}</table>
    <div class="divider"></div>
    <div class="kv"><span>Subtotal</span><span>${rs(subtotal)}</span></div>
    ${discount ? `<div class="kv"><span>Discount</span><span>− ${rs(discount)}</span></div>` : ""}
    <div class="kv"><span><b>Grand Total</b></span><b>${rs(total)}</b></div>
    ${paid !== null ? `<div class="kv"><span>Paid</span><span>${rs(paid)}</span></div>` : ""}
    ${baqaya !== null ? `<div class="kv"><span><b>Balance Due</b></span><b style="color:${baqaya > 0 ? "#dc2626" : "#16a34a"}">${rs(baqaya)}</b></div>` : ""}
  </div>`;
}

function docThemeModern(shop, ref, date, partyName, items, subtotal, discount, total, paid, baqaya, mode, refLabel) {
  const rows = items.map((it, i) => `
    <tr style="${i % 2 ? "background:#f3f8fb" : ""}"><td style="padding:8px 6px">${esc(it.product_name)}<br><span style="color:#6b7280;font-size:12px">${it.qty} × ${rs(it.price)}</span></td>
    <td class="num" style="padding:8px 6px">${rs(it.total)}</td></tr>`).join("");
  return `
  <div class="bill-paper">
    <div style="background:${brandPrimary()};color:#fff;border-radius:10px;padding:14px 16px;margin-bottom:10px">
      <div style="font-size:20px;font-weight:800">${esc(shop.name)}</div>
      <div style="font-size:12px;opacity:.92">${esc(shop.address || "")}${shop.phone ? " · " + esc(shop.phone) : ""}</div>
      ${shop.receipt_header ? `<div style="font-size:12px;opacity:.92">${esc(shop.receipt_header)}</div>` : ""}
    </div>
    <div class="kv"><span>${refLabel || "Bill No"}</span><b>${esc(ref)}</b></div>
    <div class="kv"><span>Date</span><b>${niceDate(date)}</b></div>
    ${partyName ? `<div class="kv"><span>Customer</span><b>${esc(partyName)}</b></div>` : ""}
    ${mode ? `<div class="kv"><span>Method</span><b>${esc(modeLabel(mode))}</b></div>` : ""}
    <div class="divider"></div>
    <table class="tbl" style="width:100%"><tr><th style="text-align:left;color:${brandPrimary()}">Item</th><th class="num" style="color:${brandPrimary()}">Amount</th></tr>${rows}</table>
    <div class="divider"></div>
    <div class="kv"><span>Subtotal</span><span>${rs(subtotal)}</span></div>
    ${discount ? `<div class="kv"><span>Discount</span><span>− ${rs(discount)}</span></div>` : ""}
    <div class="kv" style="font-size:17px"><span><b>Grand Total</b></span><b style="color:${brandPrimary()}">${rs(total)}</b></div>
    ${paid !== null ? `<div class="kv"><span>Paid</span><span>${rs(paid)}</span></div>` : ""}
    ${baqaya !== null ? `<div class="kv"><span><b>Balance Due</b></span><b style="color:${baqaya > 0 ? "#dc2626" : "#16a34a"}">${rs(baqaya)}</b></div>` : ""}
  </div>`;
}

function docThemeCompact(shop, ref, date, partyName, items, subtotal, discount, total, paid, baqaya, mode) {
  const rows = items.map((it) => `
    <tr><td style="padding:3px 0;font-size:12px">${esc(it.product_name)} ${it.qty}×${rs(it.price)}</td>
    <td class="num" style="padding:3px 0;font-size:12px">${rs(it.total)}</td></tr>`).join("");
  return `
  <div class="bill-paper" style="max-width:300px;font-size:12px">
    <div class="center" style="font-size:14px"><b>${esc(shop.name)}</b></div>
    <div class="center meta" style="font-size:11px">${esc(shop.address || "")}${shop.phone ? " · " + esc(shop.phone) : ""}</div>
    <div style="font-size:11px;margin:6px 0">${esc(ref)} · ${niceDate(date)}${partyName ? " · " + esc(partyName) : ""}</div>
    <div style="border-top:1px dashed #999;margin:6px 0"></div>
    <table style="width:100%;font-size:12px">${rows}</table>
    <div style="border-top:1px dashed #999;margin:6px 0"></div>
    <div class="kv" style="font-size:12px"><span>Sub</span><span>${rs(subtotal)}</span></div>
    ${discount ? `<div class="kv" style="font-size:12px"><span>Disc</span><span>− ${rs(discount)}</span></div>` : ""}
    <div class="kv" style="font-size:14px"><span><b>Total</b></span><b>${rs(total)}</b></div>
    ${paid !== null ? `<div class="kv" style="font-size:12px"><span>Paid</span><span>${rs(paid)}</span></div>` : ""}
    ${baqaya !== null && baqaya > 0 ? `<div class="kv" style="font-size:12px"><span><b>Due</b></span><b>${rs(baqaya)}</b></div>` : ""}
    ${shop.receipt_header ? `<div class="center meta" style="font-size:11px;margin-top:6px">${esc(shop.receipt_header)}</div>` : ""}
  </div>`;
}

function docTheme() {
  const t = (window.SHOP && SHOP.invoice_theme) || "classic";
  return (t === "modern" || t === "compact") ? t : "classic";
}

function docPaper(shop, ref, date, partyName, items, subtotal, discount, total, paid, baqaya, mode, refLabel) {
  const s = shop || {};
  const t = docTheme();
  if (t === "modern") return docThemeModern(s, ref, date, partyName, items, subtotal, discount, total, paid, baqaya, mode, refLabel);
  if (t === "compact") return docThemeCompact(s, ref, date, partyName, items, subtotal, discount, total, paid, baqaya, mode);
  return docPaperHTML(s, ref, date, partyName, items, subtotal, discount, total, paid, baqaya, mode, refLabel);
}

function waDocText(shop, ref, date, items, total, paid, baqaya, theme) {
  theme = theme || docTheme();
  if (theme === "compact") {
    // condensed: one line per item, no dividers
    let txt = `*${shop.name}* — ${ref} (${niceDate(date)})\n`;
    items.forEach((it) => { txt += `${it.product_name} x${it.qty} = Rs ${it.total}\n`; });
    txt += `Total: Rs ${total}`;
    if (baqaya !== null && baqaya > 0) txt += ` | Due: Rs ${baqaya}`;
    return txt;
  }
  let txt = `${shop.name}\nBill: ${ref} | ${niceDate(date)}\n----------------\n`;
  items.forEach((it) => { txt += `${it.product_name} x${it.qty} = Rs ${it.total}\n`; });
  txt += `----------------\nTotal: Rs ${total}\n`;
  if (paid !== null) txt += `Paid: Rs ${paid}\n`;
  if (baqaya !== null) txt += `Balance Due: Rs ${baqaya}\n`;
  if (theme === "modern") txt += `----------------\n`;
  if (shop.receipt_header) txt += `${shop.receipt_header}`;
  return txt;
}

RENDER["v-bill-detail"] = async (bill_id) => {
  const v = $("v-bill-detail");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const b = await api("/bills/" + bill_id);
    let serialCard = "";
    try {
      const sn = await api(`/bills/${bill_id}/serials`);
      if (sn.length) {
        serialCard = `<div class="card no-print"><h3>Sold Serial Numbers</h3>` +
          sn.map((x) => `<div class="kv"><span>${esc(x.product_name)}</span><b style="font-family:monospace">${esc(x.serial_no)}</b></div>`).join("") + `</div>`;
      }
    } catch (e) { /* serials table may not exist on old DBs until restart */ }
    v.innerHTML = docPaper(b.shop, b.bill_no, b.date, b.party_name, b.items, b.subtotal, b.discount, b.total, b.paid, b.baqaya, b.mode) + `
    <div class="no-print">
      ${b.credit_warning ? `<div class="card" style="background:#fef2f2;border:1px solid #fecaca"><b style="color:#dc2626">⚠ ${esc(b.credit_warning)}</b></div>` : ""}
      <div id="bill-udf"></div>
      ${serialCard}
      <button class="btn primary block" onclick="window.print()">Print</button>
      <button class="btn amber block" onclick="shareDocWhatsApp('bill')"> Send via WhatsApp</button>
      <button class="btn ghost block" style="color:#dc2626" onclick="deleteBillForever(${b.id})">Delete Bill</button>
      <button class="btn ghost block" onclick="go('v-sale')">← Sales List</button>
    </div>`;
    window._lastDoc = {kind: "bill", d: b};
    udfValues("bill", b.id).then((fs) => {
      const el = $("bill-udf");
      const filled = fs.filter((f) => f.value);
      if (el && filled.length) el.innerHTML = `<div class="card"><h3>Extra Fields</h3>` +
        filled.map((f) => `<div class="kv"><span>${esc(f.name)}</span><b>${esc(f.value)}</b></div>`).join("") + `</div>`;
    });
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function shareDocWhatsApp() {
  const w = window._lastDoc;
  if (!w) return;
  const b = w.d;
  const ref = w.kind === "est" ? b.est_no : b.bill_no;
  const txt = waDocText(b.shop, ref, b.date, b.items, b.total,
    w.kind === "est" ? null : b.paid, w.kind === "est" ? null : b.baqaya);
  window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

/* ---------- estimate detail ---------- */
RENDER["v-est-detail"] = async (est_id) => {
  const v = $("v-est-detail");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const e = await api("/estimates/" + est_id);
    v.innerHTML = docPaper(e.shop, e.est_no, e.date, e.party_name, e.items, e.subtotal, e.discount, e.total, null, null, null) + `
    <div class="no-print">
      <div class="kv" style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px"><span>Status</span><b>${e.status === "open" ? " Open" : esc(e.status)}</b></div>
      ${e.status === "open" ? `<button class="btn primary block" onclick="convertEstimate(${e.id})"> Convert to Bill</button>` : ""}
      <button class="btn amber block" onclick="shareDocWhatsApp('est')"> Send via WhatsApp</button>
      <button class="btn ghost block" onclick="SALE_TAB='estimates';go('v-sale')">← Estimates List</button>
    </div>`;
    window._lastDoc = {kind: "est", d: e};
  } catch (e2) { v.innerHTML = `<div class="card err">${esc(e2.message)}</div>`; }
};

async function convertEstimate(est_id) {
  if (!confirm("This estimate will become a final bill and stock will decrease. Continue?")) return;
  try {
    const b = await api("/estimates/" + est_id + "/convert", "POST");
    SALE_TAB = "bills";
    go("v-bill-detail", b.id);
  } catch (e) { alert(e.message); }
}

/* ---------- order detail (sale + purchase) ---------- */
function orderBadge(s) {
  return s === "pending" ? `<span class="badge warn">Pending</span>`
    : s === "converted" ? `<span class="badge ok">Billed</span>` : `<span class="badge">Cancelled</span>`;
}

RENDER["v-so-detail"] = async (oid) => {
  const v = $("v-so-detail");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const o = await api("/sale-orders/" + oid);
    v.innerHTML = docPaper(SHOP || {}, o.order_no, o.date, o.party_name, o.items, o.subtotal, o.discount, o.total, null, null, null, "Order No") + `
    <div class="no-print">
      <div class="kv" style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px"><span>Status</span><b>${orderBadge(o.status)}</b></div>
      ${o.status === "pending" ? `<button class="btn primary block" onclick="convertSaleOrder(${o.id})">Convert to Bill</button>
      <button class="btn ghost block" onclick="cancelSaleOrder(${o.id})" style="color:#dc2626">Cancel Order</button>` : ""}
      <button class="btn amber block" onclick="shareOrderWhatsApp('sale', ${o.id})">Send via WhatsApp</button>
      <button class="btn ghost block" onclick="SALE_TAB='orders';go('v-sale')">← Orders List</button>
    </div>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

async function convertSaleOrder(oid) {
  if (!confirm("This order will become a final bill and stock will decrease. Continue?")) return;
  try {
    const b = await api("/sale-orders/" + oid + "/convert", "POST");
    SALE_TAB = "bills";
    go("v-bill-detail", b.id);
  } catch (e) { alert(e.message); }
}

async function cancelSaleOrder(oid) {
  if (!confirm("Cancel this sale order?")) return;
  try {
    await api("/sale-orders/" + oid + "/cancel", "PUT");
    RENDER["v-so-detail"](oid);
  } catch (e) { alert(e.message); }
}

RENDER["v-po-detail"] = async (oid) => {
  const v = $("v-po-detail");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const o = await api("/purchase-orders/" + oid);
    v.innerHTML = docPaper(SHOP || {}, o.order_no, o.date, o.party_name, o.items, o.subtotal, o.discount, o.total, null, null, null, "Order No") + `
    <div class="no-print">
      <div class="kv" style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px"><span>Status</span><b>${orderBadge(o.status)}</b></div>
      ${o.status === "pending" ? `<button class="btn primary block" onclick="convertPurchaseOrder(${o.id})">Convert to Purchase Bill</button>
      <button class="btn ghost block" onclick="cancelPurchaseOrder(${o.id})" style="color:#dc2626">Cancel Order</button>` : ""}
      <button class="btn amber block" onclick="shareOrderWhatsApp('purchase', ${o.id})">Send via WhatsApp</button>
      <button class="btn ghost block" onclick="KHARID_TAB='orders';go('v-kharid')">← Orders List</button>
    </div>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

async function convertPurchaseOrder(oid) {
  if (!confirm("This order will become a purchase bill and stock will increase. Continue?")) return;
  try {
    await api("/purchase-orders/" + oid + "/convert", "POST");
    KHARID_TAB = "bills";
    go("v-kharid");
  } catch (e) { alert(e.message); }
}

async function cancelPurchaseOrder(oid) {
  if (!confirm("Cancel this purchase order?")) return;
  try {
    await api("/purchase-orders/" + oid + "/cancel", "PUT");
    RENDER["v-po-detail"](oid);
  } catch (e) { alert(e.message); }
}

async function shareOrderWhatsApp(kind, oid) {
  try {
    const o = await api(kind === "sale" ? "/sale-orders/" + oid : "/purchase-orders/" + oid);
    const s = (window.SHOP || {});
    let txt = `${s.name || ""}\n${kind === "sale" ? "Sale" : "Purchase"} Order: ${o.order_no} | ${niceDate(o.date)}\n----------------\n`;
    o.items.forEach((it) => { txt += `${it.product_name} x${it.qty} = Rs ${it.total}\n`; });
    txt += `----------------\nTotal: Rs ${o.total}\nStatus: ${o.status}`;
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
  } catch (e) { toast(e.message); }
}

/* ---------- credit/debit note detail ---------- */
RENDER["v-cn-detail"] = async (nid) => {
  const v = $("v-cn-detail");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const n = await api("/credit-notes/" + nid);
    v.innerHTML = docPaper(SHOP || {}, n.note_no, n.date, n.party_name, n.items, n.subtotal, n.discount, n.total, null, null, null, "Credit Note") + `
    <div class="no-print">
      ${n.reason ? `<div class="kv" style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px"><span>Reason</span><b>${esc(n.reason)}</b></div>` : ""}
      <button class="btn primary block" onclick="window.print()">Print</button>
      <button class="btn ghost block" onclick="SALE_TAB='returns';go('v-sale')">← Returns List</button>
    </div>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

RENDER["v-dn-detail"] = async (nid) => {
  const v = $("v-dn-detail");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const n = await api("/debit-notes/" + nid);
    v.innerHTML = docPaper(SHOP || {}, n.note_no, n.date, n.party_name, n.items, n.subtotal, n.discount, n.total, null, null, null, "Debit Note") + `
    <div class="no-print">
      ${n.reason ? `<div class="kv" style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px"><span>Reason</span><b>${esc(n.reason)}</b></div>` : ""}
      <button class="btn primary block" onclick="window.print()">Print</button>
      <button class="btn ghost block" onclick="KHARID_TAB='returns';go('v-kharid')">← Returns List</button>
    </div>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

/* ---------- proforma detail ---------- */
RENDER["v-pf-detail"] = async (pfid) => {
  const v = $("v-pf-detail");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const p = await api("/proformas/" + pfid);
    v.innerHTML = docPaper(SHOP || {}, p.pf_no, p.date, p.party_name, p.items, p.subtotal, p.discount, p.total, null, null, null, "Proforma Invoice") + `
    <div class="no-print">
      <div class="kv" style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px"><span>Status</span>
        <b>${p.status === "pending" ? `<span class="badge warn">Pending</span>` : `<span class="badge ok">Converted to Bill</span>`}</b></div>
      ${p.status === "pending" ? `<button class="btn primary block" onclick="convertProforma(${p.id})">Convert to Bill</button>` : ""}
      <button class="btn amber block" onclick="shareProforma(${p.id})">Send via WhatsApp</button>
      <button class="btn ghost block" onclick="SALE_TAB='proforma';go('v-sale')">← Proforma List</button>
    </div>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

async function convertProforma(pfid) {
  if (!confirm("This proforma will become a final bill and stock will decrease. Continue?")) return;
  try {
    const b = await api("/proformas/" + pfid + "/convert", "POST");
    SALE_TAB = "bills";
    go("v-bill-detail", b.id);
  } catch (e) { alert(e.message); }
}

async function shareProforma(pfid) {
  try {
    const p = await api("/proformas/" + pfid);
    const s = (window.SHOP || {});
    let txt = `${s.name || ""}\nPROFORMA INVOICE: ${p.pf_no} | ${niceDate(p.date)}\n----------------\n`;
    p.items.forEach((it) => { txt += `${it.product_name} x${it.qty} = Rs ${it.total}\n`; });
    txt += `----------------\nTotal: Rs ${p.total}\n(This is a proforma, not a final bill)`;
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
  } catch (e) { toast(e.message); }
}

/* ================= PURCHASES ================= */
let KHARID_TAB = "bills";
RENDER["v-kharid"] = async () => {
  const v = $("v-kharid");
  v.innerHTML = `
    <div class="tabs">
      <button class="${KHARID_TAB === "bills" ? "active" : ""}" onclick="KHARID_TAB='bills';RENDER['v-kharid']()">Bills</button>
      <button class="${KHARID_TAB === "orders" ? "active" : ""}" onclick="KHARID_TAB='orders';RENDER['v-kharid']()">Orders</button>
      <button class="${KHARID_TAB === "returns" ? "active" : ""}" onclick="KHARID_TAB='returns';RENDER['v-kharid']()">Returns</button>
    </div>
    <button class="btn ghost block" style="margin-bottom:12px" onclick="scanSupplierBill()">Scan Supplier Bill (Photo)</button>
    <div id="kharid-list"><div class="card">Loading…</div></div>`;
  const box = $("kharid-list");
  try {
    if (KHARID_TAB === "bills") {
    const list = await api("/purchases");
    box.innerHTML = `<button class="fab" onclick="openDocForm('purchase')">+</button>
      <div class="card"><h3>Purchase Bills</h3></div>` +
      (list.length ? list.map((p) => `
        <div class="list-item" onclick="go('v-kharid-detail', ${p.id})">
          <div><div class="t">${esc(p.bill_no)}${p.party_name ? " — " + esc(p.party_name) : ""}</div>
          <div class="s">${niceDate(p.date)}</div></div>
          <div style="text-align:right"><div class="t">${rs(p.total)}</div>
          ${p.baqaya > 0 ? `<span class="badge warn">Due ${rs(p.baqaya)}</span>` : `<span class="badge ok">Paid</span>`}</div>
        </div>`).join("")
      : `<div class="empty">No purchase bills yet.<br>Tap + to create your first purchase bill.</div>`);
    } else if (KHARID_TAB === "orders") {
      const orders = await api("/purchase-orders");
      const badge = (s) => s === "pending" ? `<span class="badge warn">Pending</span>` : s === "converted" ? `<span class="badge ok">Billed</span>` : `<span class="badge">Cancelled</span>`;
      box.innerHTML = `<button class="fab" onclick="openDocForm('purchase-order')">+</button>
      <div class="card"><h3>Purchase Orders</h3></div>` +
      (orders.length ? orders.map((o) => `
        <div class="list-item" onclick="go('v-po-detail', ${o.id})">
          <div><div class="t">${esc(o.order_no)}${o.party_name ? " — " + esc(o.party_name) : ""}</div>
          <div class="s">${niceDate(o.date)}</div></div>
          <div style="text-align:right"><div class="t">${rs(o.total)}</div>${badge(o.status)}</div>
        </div>`).join("")
      : `<div class="empty">No purchase orders yet.<br>Tap + to create your first order.</div>`);
    } else {
      const notes = await api("/debit-notes");
      box.innerHTML = `<button class="fab" onclick="openDocForm('debit-note')">+</button>
      <div class="card"><h3>Debit Notes (Purchase Returns)</h3></div>` +
      (notes.length ? notes.map((n) => `
        <div class="list-item" onclick="go('v-dn-detail', ${n.id})">
          <div><div class="t">${esc(n.note_no)}${n.party_name ? " — " + esc(n.party_name) : ""}</div>
          <div class="s">${niceDate(n.date)}${n.reason ? " · " + esc(n.reason) : ""}</div></div>
          <div style="text-align:right"><div class="t">${rs(n.total)}</div><span class="badge info">Debit</span></div>
        </div>`).join("")
      : `<div class="empty">No debit notes yet.<br>Tap + to record a purchase return.</div>`);
    }
  } catch (e) { box.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

RENDER["v-kharid-detail"] = async (pid) => {
  const v = $("v-kharid-detail");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const p = await api("/purchases/" + pid);
    const s = p.shop;
    const rows = p.items.map((it) => `
      <tr><td>${esc(it.product_name)}<br><span style="color:#6b7280">${it.qty} × ${rs(it.price)}</span></td>
      <td class="num">${rs(it.total)}</td></tr>`).join("");
    v.innerHTML = `
    <div class="bill-paper">
      <div class="center">
        <div class="shopname">${esc(s.name)}</div>
        <div class="meta">${esc(s.address || "")}${s.phone ? " · " + esc(s.phone) : ""}</div>
      </div>
      <div class="divider"></div>
      <div class="kv"><span>Purchase Bill No</span><b>${esc(p.bill_no)}</b></div>
      <div class="kv"><span>Date</span><b>${niceDate(p.date)}</b></div>
      ${p.party_name ? `<div class="kv"><span>Supplier</span><b>${esc(p.party_name)}</b></div>` : ""}
      ${p.mode ? `<div class="kv"><span>Method</span><b>${esc(modeLabel(p.mode))}</b></div>` : ""}
      <div class="divider"></div>
      <table class="tbl"><tr><th>Item</th><th class="num">Amount</th></tr>${rows}</table>
      <div class="divider"></div>
      <div class="kv"><span>Subtotal</span><span>${rs(p.subtotal)}</span></div>
      ${p.discount ? `<div class="kv"><span>Discount</span><span>− ${rs(p.discount)}</span></div>` : ""}
      <div class="kv"><span><b>Grand Total</b></span><b>${rs(p.total)}</b></div>
      <div class="kv"><span>Paid</span><span>${rs(p.paid)}</span></div>
      <div class="kv"><span><b>Balance Due</b></span><b style="color:${p.baqaya > 0 ? "#dc2626" : "#16a34a"}">${rs(p.baqaya)}</b></div>
    </div>
    <div class="no-print">
      <button class="btn primary block" onclick="window.print()">Print</button>
      <button class="btn ghost block" onclick="go('v-kharid')">← Purchases List</button>
    </div>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

/* ================= STOCK ================= */
RENDER["v-stock"] = async () => {
  const v = $("v-stock");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    window._products = await api("/products");
    v.innerHTML = `<button class="fab" onclick="openProductForm()">+</button>
      <div class="card"><input id="stock-q" placeholder=" Search products…" oninput="renderStockList(this.value)"></div>
      <div id="stock-list"></div>`;
    renderStockList("");
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function renderStockList(q) {
  q = (q || "").toLowerCase();
  const list = (window._products || []).filter((p) =>
    p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q) ||
    (p.barcode || "").toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q));
  $("stock-list").innerHTML = list.length ? list.map((p) => {
    const low = p.stock_qty <= p.low_stock_level;
    return `
    <div class="list-item">
      <div class="grow" onclick="openProductForm(${p.id})" style="cursor:pointer">
        <div class="t">${esc(p.name)}${p.category ? ` <span class="badge info">${esc(p.category)}</span>` : ""}</div>
        <div class="s">Purchase ${rs(p.purchase_price)} · Sale ${rs(p.sale_price)}${p.barcode ? " ·  " + esc(p.barcode) : ""}${p.expiry_date ? " · ⏳ " + esc(p.expiry_date) : ""}</div>
      </div>
      <div style="text-align:right">
        <div style="margin-bottom:6px">${low ? `<span class="badge warn">⚠ ${p.stock_qty}</span>` : `<span class="badge ok">${p.stock_qty} ${esc(p.unit || "")}</span>`}</div>
        <button class="btn sm ghost" onclick="openAdjustForm(${p.id})"> Adjust</button>
        <button class="btn sm ghost" onclick="go('v-label', ${p.id})" title="Print barcode label">Label</button>
      </div>
    </div>`;
  }).join("") : `<div class="empty">No products found</div>`;
}

function openProductForm(pid) {
  const p = pid ? (window._products || []).find((x) => x.id === pid) : null;
  modal(`
    <h3>${p ? "Edit Product" : "New Product"}</h3>
    <label class="f">Product Name *</label><input id="pf-name" value="${esc(p?.name || "")}">
    <div class="grid2">
      <div><label class="f">SKU / Code</label><input id="pf-sku" value="${esc(p?.sku || "")}"></div>
      <div><label class="f">Barcode</label><input id="pf-barcode" value="${esc(p?.barcode || "")}"></div>
      <div><label class="f">Category</label><input id="pf-cat" value="${esc(p?.category || "")}" placeholder="E.g. LED"></div>
      <div><label class="f">Expiry Date</label><input id="pf-exp" type="date" value="${esc(p?.expiry_date || "")}"></div>
      <div><label class="f">Purchase Price (Rs)</label><input id="pf-pp" type="number" min="0" value="${p?.purchase_price ?? 0}"></div>
      <div><label class="f">Sale Price (Rs)</label><input id="pf-sp" type="number" min="0" value="${p?.sale_price ?? 0}"></div>
      <div><label class="f">Stock Quantity</label><input id="pf-qty" type="number" value="${p?.stock_qty ?? 0}"></div>
      <div><label class="f">Low Stock Alert</label><input id="pf-low" type="number" min="0" value="${p?.low_stock_level ?? 5}"></div>
    </div>
    <label class="f">Unit</label><input id="pf-unit" value="${esc(p?.unit || "pcs")}">
    <div id="pf-udf"></div>
    <div class="err" id="pf-err"></div>
    <button class="btn primary block" onclick="saveProduct(${pid || 0})">Save</button>
    ${p ? `<button class="btn ghost block" onclick="openSerialManager(${pid})">Serial Numbers</button>` : ""}
    ${p ? `<button class="btn danger block" onclick="deleteProduct(${pid})">Delete</button>` : ""}
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
  udfValues("item", pid || 0).then((fs) => {
    const el = $("pf-udf");
    if (el && fs.length) el.innerHTML = `<h4 style="margin:10px 0 4px">Extra Fields</h4>` + fs.map((f) => udfInputHTML(f, f.value)).join("");
  });
}

async function saveProduct(pid) {
  const body = {
    name: $("pf-name").value.trim(),
    sku: $("pf-sku").value.trim() || null,
    barcode: $("pf-barcode").value.trim() || null,
    category: $("pf-cat").value.trim() || null,
    expiry_date: $("pf-exp").value || null,
    purchase_price: +$("pf-pp").value || 0,
    sale_price: +$("pf-sp").value || 0,
    stock_qty: +$("pf-qty").value || 0,
    low_stock_level: +$("pf-low").value || 0,
    unit: $("pf-unit").value.trim() || "pcs",
  };
  if (!body.name) { $("pf-err").textContent = "Name is required"; return; }
  try {
    let savedId = pid;
    if (pid) await api("/products/" + pid, "PUT", body);
    else {
      const r = await api("/products", "POST", body);
      savedId = r.id;
    }
    await udfSave("item", savedId);
    closeModal(); RENDER["v-items"]();
  } catch (e) { $("pf-err").textContent = e.message; }
}

async function deleteProduct(pid) {
  if (!confirm("Are you sure you want to delete?")) return;
  try { await api("/products/" + pid, "DELETE"); closeModal(); RENDER["v-items"](); }
  catch (e) { $("pf-err").textContent = e.message; }
}

function openAdjustForm(pid) {
  const p = (window._products || []).find((x) => x.id === pid);
  if (!p) return;
  modal(`
    <h3>Stock Adjust — ${esc(p.name)}</h3>
    <div class="card"><div class="kv"><span>Current Stock</span><b>${p.stock_qty} ${esc(p.unit || "")}</b></div></div>
    <label class="f">Quantity Change (+ add / − reduce)</label>
    <input id="ad-qty" type="number" placeholder="E.g. 10 or -5">
    <label class="f">Reason / Note</label>
    <input id="ad-note" placeholder="E.g. damaged / recount">
    <div class="err" id="ad-err"></div>
    <button class="btn primary block" onclick="saveAdjust(${pid})">Adjust</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}
async function saveAdjust(pid) {
  const qty = +$("ad-qty").value;
  if (!qty) { $("ad-err").textContent = "Enter a quantity (+ or −)"; return; }
  try {
    await api("/products/" + pid + "/adjust", "POST", {qty_change: qty, note: $("ad-note").value.trim()});
    closeModal(); RENDER["v-items"]();
  } catch (e) { $("ad-err").textContent = e.message; }
}

/* ---------- quick collection (from home) ---------- */
async function openQuickPayment() {
  try {
    const parties = await api("/parties?type=customer");
    window._qpParties = parties;
    modal(`
      <h3>Record Collection</h3>
      <label class="f">Customer</label>
      <select id="qp-party">${parties.map((p) => `<option value="${p.id}">${esc(p.name)} — due ${rs(p.balance)}</option>`).join("")}</select>
      <label class="f">Amount (Rs)</label><input id="qp-amt" type="number" min="1">
      <label class="f">Method</label>
      <select id="qp-mode">${MODES.map((m) => `<option value="${m[0]}">${m[1]}</option>`).join("")}</select>
      <label class="f">Note</label><input id="qp-note">
      <div class="err" id="qp-err"></div>
      <button class="btn primary block" onclick="saveQuickPayment()">Save</button>
      <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
  } catch (e) { alert(e.message); }
}
async function saveQuickPayment() {
  const amt = +$("qp-amt").value || 0;
  if (amt <= 0) { $("qp-err").textContent = "Enter an amount"; return; }
  try {
    await api(`/parties/${$("qp-party").value}/payments`, "POST",
      {amount: amt, direction: "lena", mode: $("qp-mode").value, note: $("qp-note").value.trim()});
    closeModal(); go("v-home");
  } catch (e) { $("qp-err").textContent = e.message; }
}

/* ================= CASH BOOK ================= */
let CASH_DATE = todayISO();
RENDER["v-cash"] = async () => {
  const v = $("v-cash");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const c = await api("/cash?date=" + CASH_DATE);
    v.innerHTML = `
      <div class="card"><div class="row">
        <label class="f grow" style="margin:0"> Date</label>
        <input type="date" id="cash-date" class="grow" value="${CASH_DATE}" onchange="CASH_DATE=this.value;RENDER['v-cash']()">
      </div>
      <div class="grid2" style="margin-top:10px">
        <div class="stat"><div class="lbl">Cash In</div><div class="val green">${rs(c.total_in)}</div></div>
        <div class="stat"><div class="lbl">Cash Out</div><div class="val red">${rs(c.total_out)}</div></div>
      </div>
      <div class="kv" style="margin-top:8px"><span><b>Net</b></span><b>${rs(c.net)}</b></div></div>
      <div class="row">
        <button class="btn primary grow" onclick="openCashForm('in')">+ Cash In</button>
        <button class="btn danger grow" onclick="openCashForm('out')">− Cash Out</button>
      </div>
      <div style="height:10px"></div>
      ${c.txns.length ? c.txns.map((t) => `
        <div class="list-item" style="cursor:default">
          <div><div class="t">${esc(t.note || catLabel(t.category))}</div><div class="s">${esc(catLabel(t.category))}</div></div>
          <div class="t" style="color:${t.kind === "in" ? "#16a34a" : "#dc2626"}">${t.kind === "in" ? "+" : "−"} ${rs(t.amount)}</div>
        </div>`).join("") : `<div class="empty">No cash transactions on this date</div>`}
      <button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function openCashForm(kind) {
  modal(`
    <h3>${kind === "in" ? "Cash In" : "Cash Out (Expense)"}</h3>
    <label class="f">Amount (Rs)</label><input id="cf-amt" type="number" min="1">
    <label class="f">Category</label>
    <input id="cf-cat" value="${kind === "out" ? "expense" : "income"}" placeholder="${kind === "out" ? "E.g. rent, electricity" : "E.g. income"}">
    <label class="f">Note</label><input id="cf-note" placeholder="Write details">
    <div class="err" id="cf-err"></div>
    <button class="btn primary block" onclick="saveCash('${kind}')">Save</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}
async function saveCash(kind) {
  const amt = +$("cf-amt").value || 0;
  if (amt <= 0) { $("cf-err").textContent = "Enter an amount"; return; }
  try {
    await api("/cash", "POST", {kind, amount: amt, category: $("cf-cat").value.trim(), note: $("cf-note").value.trim(), date: CASH_DATE});
    closeModal();
    const active = document.querySelector(".view.active");
    if (active && active.id === "v-cash") RENDER["v-cash"]();
    else if (active && RENDER[active.id]) RENDER[active.id]();
  } catch (e) { $("cf-err").textContent = e.message; }
}

/* ================= SCAN-TO-BILL (OCR fallback) ================= */
function scanSupplierBill() {
  modal(`
    <h3>Scan Supplier Bill</h3>
    <div class="card" style="background:#fffbeb;border:1px solid #fde68a">
      <b>Photo scanning is not available on this device.</b>
      <div style="font-size:13px;color:#92400e;margin-top:6px">Automatic text reading (OCR) needs extra software that isn't installed here. Please enter the bill manually — it takes less than a minute.</div>
    </div>
    <button class="btn primary block" onclick="closeModal();openDocForm('purchase')">Enter Bill Manually</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}

async function downloadBackup() {
  try {
    const r = await fetch("/api/backup/download", {headers: authHeaders()});
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Download failed");
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `karobar_backup_${new Date().toISOString().slice(0, 10)}.db`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { toast(e.message); }
}

async function restoreBackup() {
  const fi = $("bk-file");
  const errEl = $("bk-err");
  errEl.textContent = "";
  if (!fi.files.length) { errEl.textContent = "Choose a backup file first"; return; }
  if (!confirm("Restore will REPLACE all current data with the backup file. Continue?")) return;
  const fd = new FormData();
  fd.append("file", fi.files[0]);
  try {
    const r = await fetch("/api/backup/restore", {method: "POST", headers: authHeaders(), body: fd});
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || "Restore failed");
    $("bk-res").innerHTML = `<div class="card" style="background:#f0fdf4"><b style="color:#15803d">Backup restored. Reloading…</b></div>`;
    setTimeout(() => location.reload(), 1500);
  } catch (e) { errEl.textContent = e.message; }
}

/* ================= CHEQUES ================= */
let CHQ_FILTER = "";
RENDER["v-cheques"] = async () => {
  const v = $("v-cheques");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const list = await api("/cheques" + (CHQ_FILTER ? "?status=" + CHQ_FILTER : ""));
    const badge = (s) => s === "pending" ? `<span class="badge warn">Pending</span>`
      : s === "cleared" ? `<span class="badge ok">Cleared</span>` : `<span class="badge">Bounced</span>`;
    const today = new Date().toISOString().slice(0, 10);
    v.innerHTML = `
    <div class="tabs" style="margin-bottom:12px">
      ${[["", "All"], ["pending", "Pending"], ["cleared", "Cleared"], ["bounced", "Bounced"]].map(([k, l]) =>
        `<button class="${CHQ_FILTER === k ? "active" : ""}" onclick="CHQ_FILTER='${k}';RENDER['v-cheques']()">${l}</button>`).join("")}
    </div>
    ${list.length ? list.map((c) => `
      <div class="list-item" style="cursor:default">
        <div><div class="t">Cheque ${esc(c.cheque_no)}${c.party_name ? " — " + esc(c.party_name) : ""}</div>
        <div class="s">Due ${niceDate(c.due_date)} · ${c.kind === "receivable" ? "You'll Get" : "You'll Give"}${c.due_date < today && c.status === "pending" ? ' · <b style="color:#dc2626">Overdue</b>' : ""}</div></div>
        <div style="text-align:right"><div class="t">${rs(c.amount)}</div>${badge(c.status)}
        ${c.status === "pending" ? `<div style="margin-top:6px;display:flex;gap:4px;justify-content:flex-end">
          <button class="btn sm primary" onclick="setChequeStatus(${c.id},'cleared')">Clear</button>
          <button class="btn sm ghost" onclick="setChequeStatus(${c.id},'bounced')">Bounce</button>
        </div>` : ""}</div>
      </div>`).join("") : `<div class="empty">No cheques recorded.</div>`}
    <button class="fab" onclick="openChequeForm()">+</button>
    <button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function openChequeForm() {
  modal(`
    <h3>New Cheque</h3>
    <label class="f">Cheque Number *</label><input id="cq-no">
    <label class="f">Party Name</label><input id="cq-party">
    <label class="f">Amount (Rs) *</label><input id="cq-amt" type="number" min="1">
    <label class="f">Due Date</label><input id="cq-due" type="date" value="${todayISO()}">
    <label class="f">Type</label>
    <select id="cq-kind"><option value="receivable">Receivable — you'll get</option><option value="payable">Payable — you'll give</option></select>
    <label class="f">Note</label><input id="cq-note">
    <div class="err" id="cq-err"></div>
    <button class="btn primary block" onclick="saveCheque()">Save</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}

async function saveCheque() {
  try {
    await api("/cheques", "POST", {cheque_no: $("cq-no").value.trim(), party_name: $("cq-party").value.trim(),
      amount: +$("cq-amt").value || 0, due_date: $("cq-due").value, kind: $("cq-kind").value, note: $("cq-note").value.trim()});
    closeModal(); RENDER["v-cheques"]();
  } catch (e) { $("cq-err").textContent = e.message; }
}

async function setChequeStatus(id, status) {
  const msg = status === "cleared" ? "Mark this cheque as cleared? A cash entry will be recorded." : "Mark this cheque as bounced?";
  if (!confirm(msg)) return;
  try { await api(`/cheques/${id}?status=${status}`, "PUT"); RENDER["v-cheques"](); }
  catch (e) { alert(e.message); }
}

/* ================= LOANS ================= */
RENDER["v-loans"] = async () => {
  const v = $("v-loans");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const list = await api("/loans");
    v.innerHTML = `
    ${list.length ? list.map((l) => `
      <div class="list-item" onclick="go('v-loan-detail', ${l.id})">
        <div><div class="t">${esc(l.lender_name)}</div>
        <div class="s">Principal ${rs(l.principal)} · EMI ${rs(l.emi_amount)} × ${l.months}${l.annual_rate ? ` · ${l.annual_rate}%/yr` : ""}</div></div>
        <div style="text-align:right"><div class="t">${l.emis_paid}/${l.emis_total} paid</div>
        ${l.status === "active" ? `<span class="badge warn">Active</span>` : `<span class="badge ok">Closed</span>`}</div>
      </div>`).join("") : `<div class="empty">No loans yet.<br>Tap + to add a loan.</div>`}
    <button class="fab" onclick="openLoanForm()">+</button>
    <button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function openLoanForm() {
  modal(`
    <h3>New Loan</h3>
    <label class="f">Lender Name *</label><input id="ln-name" placeholder="E.g. Bank / person name">
    <label class="f">Principal Amount (Rs) *</label><input id="ln-prin" type="number" min="1">
    <label class="f">Annual Interest Rate % (0 = interest-free)</label><input id="ln-rate" type="number" min="0" value="0">
    <label class="f">Months *</label><input id="ln-months" type="number" min="1" value="12">
    <label class="f">Start Date</label><input id="ln-start" type="date" value="${todayISO()}">
    <label class="f">Note</label><input id="ln-note">
    <div class="err" id="ln-err"></div>
    <button class="btn primary block" onclick="saveLoan()">Create EMI Schedule</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}

async function saveLoan() {
  try {
    const l = await api("/loans", "POST", {lender_name: $("ln-name").value.trim(),
      principal: +$("ln-prin").value || 0, annual_rate: +$("ln-rate").value || 0,
      months: +$("ln-months").value || 0, start_date: $("ln-start").value, note: $("ln-note").value.trim()});
    closeModal(); go("v-loan-detail", l.id);
  } catch (e) { $("ln-err").textContent = e.message; }
}

RENDER["v-loan-detail"] = async (loan_id) => {
  const v = $("v-loan-detail");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const l = await api("/loans/" + loan_id);
    v.innerHTML = `
    <div class="card"><h3>${esc(l.lender_name)}</h3>
      <div class="kv"><span>Principal</span><b>${rs(l.principal)}</b></div>
      <div class="kv"><span>EMI</span><b>${rs(l.emi_amount)} × ${l.months}</b></div>
      <div class="kv"><span>Paid So Far</span><b style="color:#16a34a">${rs(l.paid_total)}</b></div>
      <div class="kv"><span>Remaining</span><b style="color:#dc2626">${rs(l.due_total)}</b></div>
      <div class="kv"><span>Status</span><b>${l.status === "active" ? "Active" : "Closed"}</b></div></div>
    <div class="card"><h3>EMI Schedule</h3>
      ${l.schedule.map((s) => `
        <div class="kv"><span>#${s.due_no} · ${niceDate(s.due_date)}<br>
          <span style="font-size:11px;color:#6b7280">Principal ${rs(s.principal_part)} + Interest ${rs(s.interest_part)}</span></span>
          <span style="text-align:right"><b>${rs(s.emi_amount)}</b><br>
          ${s.status === "paid" ? `<span class="badge ok">Paid</span>`
            : s.status === "partial" ? `<span class="badge warn">Partial ${rs(s.paid_amount)}</span>
              <br><button class="btn sm primary" style="margin-top:4px" onclick="payEmi(${l.id}, ${s.due_no}, ${s.emi_amount - s.paid_amount})">Pay Rest</button>`
            : `<button class="btn sm primary" style="margin-top:4px" onclick="payEmi(${l.id}, ${s.due_no}, ${s.emi_amount})">Pay</button>`}
          </span></div>`).join("")}
    </div>
    <button class="btn ghost block" onclick="go('v-loans')">← Loans</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

async function payEmi(loan_id, due_no, amount) {
  if (!confirm(`Pay EMI #${due_no} of Rs ${amount}? Cash-out will be recorded.`)) return;
  try { await api(`/loans/${loan_id}/pay`, "POST", {due_no, amount}); RENDER["v-loan-detail"](loan_id); }
  catch (e) { alert(e.message); }
}

/* ================= SERVICE REMINDERS ================= */
RENDER["v-svc-reminders"] = async () => {
  const v = $("v-svc-reminders");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const list = await api("/reminders?done=0");
    const today = new Date().toISOString().slice(0, 10);
    v.innerHTML = `
    ${list.length ? list.map((r) => `
      <div class="list-item" style="cursor:default">
        <div><div class="t">${esc(r.title)}${r.party_name ? " — " + esc(r.party_name) : ""}</div>
        <div class="s">Due ${niceDate(r.due_date)}${r.due_date < today ? ' · <b style="color:#dc2626">Overdue</b>' : ""}${r.note ? " · " + esc(r.note) : ""}</div></div>
        <div style="display:flex;gap:4px">
          <button class="btn sm primary" onclick="setReminderDone(${r.id},1)">Done</button>
          <button class="btn sm ghost" style="color:#dc2626" onclick="delReminder(${r.id})">✕</button>
        </div>
      </div>`).join("") : `<div class="empty">No pending reminders.<br>Tap + to add one (e.g. AMC due).</div>`}
    <button class="fab" onclick="openReminderForm()">+</button>
    <button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function openReminderForm() {
  modal(`
    <h3>New Reminder</h3>
    <label class="f">Title *</label><input id="rm-title" placeholder="E.g. AMC due — Ahmed Store">
    <label class="f">Due Date *</label><input id="rm-due" type="date" value="${todayISO()}">
    <label class="f">Customer (optional)</label><input id="rm-party" placeholder="Customer name">
    <label class="f">Note</label><input id="rm-note">
    <div class="err" id="rm-err"></div>
    <button class="btn primary block" onclick="saveReminder()">Save</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}

async function saveReminder() {
  try {
    await api("/reminders", "POST", {title: $("rm-title").value.trim(), due_date: $("rm-due").value,
      party_name: $("rm-party").value.trim(), note: $("rm-note").value.trim()});
    closeModal(); RENDER["v-svc-reminders"]();
  } catch (e) { $("rm-err").textContent = e.message; }
}

async function setReminderDone(id, done) {
  try { await api(`/reminders/${id}?done=${done}`, "PUT"); RENDER["v-svc-reminders"](); }
  catch (e) { alert(e.message); }
}

async function delReminder(id) {
  if (!confirm("Delete this reminder?")) return;
  try { await api("/reminders/" + id, "DELETE"); RENDER["v-svc-reminders"](); }
  catch (e) { alert(e.message); }
}

/* ================= RECYCLE BIN ================= */
RENDER["v-recycle"] = async () => {
  const v = $("v-recycle");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const list = await api("/recycle-bin");
    const kindLbl = {bill: "Bill", product: "Item", party: "Party"};
    v.innerHTML = `
    <div class="card"><h3>Recycle Bin</h3>
      <div style="color:#6b7280;font-size:12px;margin-bottom:8px">Deleted bills, items and parties stay here. Restore brings them back; Delete removes forever.</div></div>
    ${list.length ? list.map((r) => `
      <div class="list-item" style="cursor:default">
        <div><div class="t">${esc(r.label) || "(no name)"}</div>
        <div class="s">${kindLbl[r.kind] || r.kind} · deleted ${niceDate((r.deleted_at || "").slice(0, 10))}</div></div>
        <div style="display:flex;gap:4px">
          <button class="btn sm primary" onclick="restoreBin(${r.id})">Restore</button>
          <button class="btn sm ghost" style="color:#dc2626" onclick="purgeBin(${r.id})">Delete</button>
        </div>
      </div>`).join("") : `<div class="empty">Recycle bin is empty.</div>`}
    <button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

async function restoreBin(id) {
  try {
    const r = await api(`/recycle-bin/${id}/restore`, "POST");
    toast(r.skipped_serials && r.skipped_serials.length ? `Restored (serials skipped: ${r.skipped_serials.join(", ")})` : "Restored");
    RENDER["v-recycle"]();
  } catch (e) { alert(e.message); }
}

async function purgeBin(id) {
  if (!confirm("Delete forever? This cannot be undone.")) return;
  try { await api("/recycle-bin/" + id, "DELETE"); RENDER["v-recycle"](); }
  catch (e) { alert(e.message); }
}

async function deleteBillForever(bid) {
  if (!confirm("Delete this bill? It will go to the Recycle Bin (you can restore it).")) return;
  try { await api("/bills/" + bid, "DELETE"); go("v-sale"); }
  catch (e) { alert(e.message); }
}

async function deletePartyForever(pid) {
  if (!confirm("Delete this party? It will go to the Recycle Bin (you can restore it).")) return;
  try { await api("/parties/" + pid, "DELETE"); go("v-khata"); }
  catch (e) { alert(e.message); }
}

/* ================= CUSTOM FIELDS (UDF) ================= */
let _UDF_CACHE = {};
async function udfFields(entity) {
  if (!_UDF_CACHE[entity]) _UDF_CACHE[entity] = await api("/custom-fields?entity=" + entity).catch(() => []);
  return _UDF_CACHE[entity];
}
async function udfValues(entity, entity_id) {
  if (!entity_id) return udfFields(entity).then((fs) => fs.map((f) => ({...f, value: ""})));
  return api(`/custom-values?entity=${entity}&entity_id=${entity_id}`).catch(() => []);
}
function udfInputHTML(f, val) {
  const type = f.ftype === "number" ? "number" : f.ftype === "date" ? "date" : "text";
  return `<label class="f">${esc(f.name)}</label>
    <input data-udf="${f.id}" type="${type}" value="${esc(val || "")}">`;
}
function udfCollect() {
  const out = {};
  document.querySelectorAll("[data-udf]").forEach((i) => { out[i.dataset.udf] = i.value; });
  return out;
}
async function udfSave(entity, entity_id) {
  const vals = udfCollect();
  if (!Object.keys(vals).length) return;
  await api("/custom-values", "PUT", {entity, entity_id, values: vals}).catch(() => {});
}

RENDER["v-udf"] = async () => {
  const v = $("v-udf");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const fields = await api("/custom-fields");
    const byEnt = {item: [], party: [], bill: []};
    fields.forEach((f) => byEnt[f.entity] && byEnt[f.entity].push(f));
    const entLbl = {item: "Items", party: "Parties", bill: "Bills"};
    v.innerHTML = `
    <div class="card"><h3>Custom Fields</h3>
      <div style="color:#6b7280;font-size:12px;margin-bottom:8px">Add your own extra fields (text / number / date) on items, parties and bills.</div>
      ${["item", "party", "bill"].map((e) => `
        <h4 style="margin:12px 0 6px">${entLbl[e]}</h4>
        ${byEnt[e].length ? byEnt[e].map((f) => `
          <div class="list-item" style="cursor:default"><div><div class="t">${esc(f.name)}</div>
          <div class="s">${f.ftype}</div></div>
          <button class="btn sm ghost" style="color:#dc2626" onclick="delUdf(${f.id})">Delete</button></div>`).join("")
        : `<div style="color:#6b7280;font-size:13px">No custom fields</div>`}
      `).join("")}
    </div>
    <div class="card"><h3>Add Field</h3>
      <label class="f">For</label>
      <select id="udf-entity"><option value="item">Items</option><option value="party">Parties</option><option value="bill">Bills</option></select>
      <label class="f">Field Name *</label><input id="udf-name" placeholder="E.g. Warranty months">
      <label class="f">Type</label>
      <select id="udf-type"><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option></select>
      <div class="err" id="udf-err"></div>
      <button class="btn primary block" onclick="addUdf()">Add Field</button>
    </div>
    <button class="btn ghost block" onclick="go('v-settings')">← Settings</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

async function addUdf() {
  try {
    await api("/custom-fields", "POST", {entity: $("udf-entity").value, name: $("udf-name").value.trim(), ftype: $("udf-type").value});
    _UDF_CACHE = {};
    RENDER["v-udf"]();
  } catch (e) { $("udf-err").textContent = e.message; }
}

async function delUdf(id) {
  if (!confirm("Delete this custom field and all its values?")) return;
  try { await api("/custom-fields/" + id, "DELETE"); _UDF_CACHE = {}; RENDER["v-udf"](); }
  catch (e) { alert(e.message); }
}

/* ================= ONLINE ORDERS (in-app) ================= */
function copyStoreLink() {
  const url = `${location.origin}/store/${(window.SHOP || {}).id}`;
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("Store link copied")).catch(() => {});
  else toast(url);
}

let OO_FILTER = "";
RENDER["v-online-orders"] = async () => {
  const v = $("v-online-orders");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const list = await api("/online-orders" + (OO_FILTER ? "?status=" + OO_FILTER : ""));
    const badge = (s) => s === "new" ? `<span class="badge warn">New</span>`
      : s === "confirmed" ? `<span class="badge info">Confirmed</span>`
      : s === "billed" ? `<span class="badge ok">Billed</span>` : `<span class="badge">Cancelled</span>`;
    v.innerHTML = `
    <div class="card"><h3>Online Orders</h3>
      <div style="color:#6b7280;font-size:12px">Share your store link: <b style="font-size:11px">${esc(location.origin + "/store/" + ((window.SHOP || {}).id || ""))}</b></div>
      <button class="btn sm ghost" onclick="copyStoreLink()">Copy Store Link</button></div>
    <div class="tabs" style="margin-bottom:12px">
      ${[["", "All"], ["new", "New"], ["confirmed", "Confirmed"], ["billed", "Billed"], ["cancelled", "Cancelled"]].map(([k, l]) =>
        `<button class="${OO_FILTER === k ? "active" : ""}" onclick="OO_FILTER='${k}';RENDER['v-online-orders']()">${l}</button>`).join("")}
    </div>
    ${list.length ? list.map((o) => `
      <div class="card">
        <div class="kv"><span><b>${esc(o.order_no)}</b> — ${esc(o.customer_name)}<br>
          <span style="font-size:12px;color:#6b7280">${esc(o.phone)}${o.address ? " · " + esc(o.address) : ""}</span></span>
          <span style="text-align:right"><b>${rs(o.total)}</b><br>${badge(o.status)}</span></div>
        <div style="font-size:13px;color:#374151;margin:6px 0">
          ${o.items.map((it) => `${esc(it.product_name)} × ${it.qty} = ${rs(it.total)}`).join("<br>")}
        </div>
        ${o.status === "new" || o.status === "confirmed" ? `
        <div class="row">
          ${o.status === "new" ? `<button class="btn sm ghost" onclick="setOnlineOrder(${o.id},'confirmed')">Confirm</button>` : ""}
          <button class="btn sm primary" onclick="convertOnlineOrder(${o.id})">Convert to Bill</button>
          <button class="btn sm ghost" style="color:#dc2626" onclick="setOnlineOrder(${o.id},'cancelled')">Cancel</button>
        </div>` : ""}
      </div>`).join("") : `<div class="empty">No online orders yet.</div>`}
    <button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

async function setOnlineOrder(id, status) {
  if (status === "cancelled" && !confirm("Cancel this online order?")) return;
  try { await api(`/online-orders/${id}?status=${status}`, "PUT"); RENDER["v-online-orders"](); }
  catch (e) { alert(e.message); }
}

async function convertOnlineOrder(id) {
  if (!confirm("Convert this order to a bill? Stock will decrease.")) return;
  try {
    const b = await api(`/online-orders/${id}/convert`, "POST");
    SALE_TAB = "bills";
    go("v-bill-detail", b.id);
  } catch (e) { alert(e.message); }
}

/* ================= AUR (menu) ================= */
/* ================= DELIVERY CHALLANS ================= */
RENDER["v-challans"] = async () => {
  const v = $("v-challans");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const list = await api("/challans");
    v.innerHTML = `<button class="fab" onclick="openChallanForm()">+</button>` +
      (list.length ? list.map((c) => `
        <div class="list-item" onclick="go('v-challan-detail', ${c.id})">
          <div><div class="t"> ${esc(c.challan_no)}${c.party_name ? " — " + esc(c.party_name) : ""}</div>
          <div class="s">${esc(c.date)}${c.vehicle_no ? " · " + esc(c.vehicle_no) : ""}</div></div>
          <div style="text-align:right">${c.status === "billed"
            ? `<span class="badge ok">BILLED</span>` : `<span class="badge info">OPEN</span>`}</div>
        </div>`).join("")
      : `<div class="empty">No delivery challans yet.<br>Tap + to create one.</div>`) +
      `<button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

let CH = {party_id: null, party_name: "", items: [], vehicle_no: ""};
async function openChallanForm() {
  CH = {party_id: null, party_name: "", items: [], vehicle_no: ""};
  const [products, parties] = await Promise.all([api("/products"), api("/parties?type=customer")]);
  window._chProducts = products; window._chParties = parties;
  renderChallanForm();
}
function renderChallanForm() {
  const lines = CH.items.map((it, i) => {
    const p = window._chProducts.find((x) => x.id === it.product_id);
    return `<div class="kv"><span>${esc(p ? p.name : "?")} × ${it.qty} <span style="color:#6b7280">(stock ${p ? p.stock_qty : "?"})</span></span>
      <span><button class="btn sm danger" onclick="CH.items.splice(${i},1);renderChallanForm()"></button></span></div>`;
  }).join("");
  modal(`
    <h3>New Delivery Challan</h3>
    <div style="font-size:12px;color:#6b7280;margin-bottom:8px">Stock is reduced when the challan is created. No billing.</div>
    <label class="f">Customer</label>
    <select id="ch-party" onchange="CH.party_id=+this.value||null;CH.party_name=this.options[this.selectedIndex].text">
      <option value="">— Walk-in —</option>
      ${window._chParties.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}
    </select>
    <label class="f">Vehicle No (optional)</label><input id="ch-veh" value="${esc(CH.vehicle_no)}" placeholder="e.g. LXR-1234" oninput="CH.vehicle_no=this.value">
    <div class="divider"></div>
    <label class="f">Add items</label>
    <div class="row">
      <select id="ch-product" class="grow">
        ${window._chProducts.map((p) => `<option value="${p.id}">${esc(p.name)} (stock ${p.stock_qty})</option>`).join("")}
      </select>
    </div>
    <div class="row" style="margin-top:8px">
      <input id="ch-qty" class="grow" type="number" min="1" value="1" placeholder="Qty">
      <button class="btn sm primary" onclick="chAddItem()">+ Add</button>
    </div>
    <div class="divider"></div>
    ${lines || `<div style="color:#6b7280;font-size:13px">No items yet</div>`}
    <div class="err" id="ch-err"></div>
    <button class="btn primary block" onclick="chSave()">Create Challan</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`, "doc");
}
function chAddItem() {
  const pid = +$("ch-product").value, qty = +$("ch-qty").value || 0;
  if (qty <= 0) return;
  const ex = CH.items.find((i) => i.product_id === pid);
  if (ex) ex.qty += qty; else CH.items.push({product_id: pid, qty});
  renderChallanForm();
}
async function chSave() {
  if (!CH.items.length) { $("ch-err").textContent = "Add at least one item"; return; }
  try {
    const c = await api("/challans", "POST", {
      party_id: CH.party_id, party_name: CH.party_name === "— Walk-in —" ? "" : CH.party_name,
      vehicle_no: CH.vehicle_no, items: CH.items});
    closeModal(); go("v-challan-detail", c.id);
  } catch (e) { $("ch-err").textContent = e.message; }
}

RENDER["v-challan-detail"] = async (ch_id) => {
  const v = $("v-challan-detail");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const c = await api("/challans/" + ch_id);
    const s = SHOP || {};
    const rows = c.items.map((it) =>
      `<tr><td>${esc(it.product_name)}</td><td class="num">${it.qty}</td></tr>`).join("");
    v.innerHTML = `
    <div class="bill-paper">
      <div class="center">
        <div class="shopname">${esc(s.name || "Karobar")}</div>
        <div class="meta">DELIVERY CHALLAN</div>
      </div>
      <div class="divider"></div>
      <div class="kv"><span>Challan No</span><b>${esc(c.challan_no)}</b></div>
      <div class="kv"><span>Date</span><b>${esc(c.date)}</b></div>
      ${c.party_name ? `<div class="kv"><span>Customer</span><b>${esc(c.party_name)}</b></div>` : ""}
      ${c.vehicle_no ? `<div class="kv"><span>Vehicle</span><b>${esc(c.vehicle_no)}</b></div>` : ""}
      <div class="divider"></div>
      <table class="tbl"><tr><th>Item</th><th class="num">Qty</th></tr>${rows}</table>
      <div class="divider"></div>
      <div class="kv"><span>Status</span><b>${c.status === "billed" ? "BILLED" : "OPEN"}</b></div>
      <div style="margin-top:16px;display:flex;gap:40px">
        <div style="flex:1;border-top:1px solid #999;padding-top:4px;font-size:12px;color:#6b7280">Delivered by</div>
        <div style="flex:1;border-top:1px solid #999;padding-top:4px;font-size:12px;color:#6b7280">Received by</div>
      </div>
    </div>
    <div class="no-print">
      <button class="btn primary block" onclick="window.print()">Print</button>
      <button class="btn amber block" onclick="shareChallan(${c.id})"> Share on WhatsApp</button>
      ${c.status === "open" ? `<button class="btn outline block" onclick="convertChallan(${c.id})"> Convert to Bill</button>` : ""}
      <button class="btn ghost block" onclick="go('v-challans')">← Challans</button>
    </div>`;
    window._lastChallan = c;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};
function shareChallan() {
  const c = window._lastChallan; if (!c) return;
  const s = SHOP || {};
  let txt = `${s.name || "Karobar"}\nDELIVERY CHALLAN: ${c.challan_no} | ${c.date}\n----------------\n`;
  c.items.forEach((it) => { txt += `${it.product_name} x${it.qty}\n`; });
  if (c.vehicle_no) txt += `Vehicle: ${c.vehicle_no}\n`;
  window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}
async function convertChallan(ch_id) {
  if (!confirm("Convert this challan to a bill?")) return;
  try {
    const b = await api(`/challans/${ch_id}/convert`, "POST");
    go("v-bill-detail", b.id);
  } catch (e) { alert(e.message); }
}

/* ================= BANK ACCOUNTS ================= */
RENDER["v-banks"] = async () => {
  const v = $("v-banks");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const accs = await api("/bank-accounts");
    const total = accs.reduce((s, a) => s + a.balance, 0);
    v.innerHTML = `<button class="fab" onclick="openBankForm()">+</button>
      <div class="card"><div class="kv"><span><b>Total in Banks</b></span><b style="color:var(--primary-dark)">${rs(total)}</b></div></div>` +
      (accs.length ? accs.map((a) => `
        <div class="list-item" onclick="go('v-bank-detail', ${a.id})">
          <div><div class="t"> ${esc(a.name)}</div>
          <div class="s">${esc(a.bank_name)}${a.account_no ? " · " + esc(a.account_no) : ""}</div></div>
          <div class="t" style="color:${a.balance < 0 ? "var(--danger)" : "var(--primary-dark)"}">${rs(a.balance)}</div>
        </div>`).join("")
      : `<div class="empty">No bank accounts yet.<br>Tap + to add your first account.</div>`) +
      `<button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};
function openBankForm() {
  modal(`
    <h3>New Bank Account</h3>
    <label class="f">Account Nickname</label><input id="bk-name" placeholder="e.g. Meezan Current">
    <label class="f">Bank Name</label><input id="bk-bank" placeholder="e.g. Meezan Bank">
    <label class="f">Account No (optional)</label><input id="bk-no" placeholder="e.g. 0123-0101234567">
    <label class="f">Opening Balance (Rs)</label><input id="bk-bal" type="number" value="0">
    <div class="err" id="bk-err"></div>
    <button class="btn primary block" onclick="saveBank()">Save</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}
async function saveBank() {
  const name = $("bk-name").value.trim();
  if (!name) { $("bk-err").textContent = "Account name is required"; return; }
  try {
    await api("/bank-accounts", "POST", {name, bank_name: $("bk-bank").value.trim(),
      account_no: $("bk-no").value.trim(), opening_balance: +$("bk-bal").value || 0});
    closeModal(); RENDER["v-banks"]();
  } catch (e) { $("bk-err").textContent = e.message; }
}
RENDER["v-bank-detail"] = async (acc_id) => {
  const v = $("v-bank-detail");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const a = await api("/bank-accounts/" + acc_id);
    window._bank = a;
    const txns = a.txns.length ? a.txns.map((t) => `
      <div class="list-item" style="cursor:default">
        <div><div class="t">${esc(t.note || (t.kind === "in" ? "Deposit" : "Withdrawal"))}</div><div class="s">${esc(t.date)}</div></div>
        <div class="t" style="color:${t.kind === "in" ? "var(--success)" : "var(--danger)"}">${t.kind === "in" ? "+" : "−"} ${rs(t.amount)}</div>
      </div>`).join("") : `<div class="empty">No transactions yet</div>`;
    v.innerHTML = `
      <div class="card"><h3>${esc(a.name)}</h3>
        <div class="s" style="color:#6b7280">${esc(a.bank_name)}${a.account_no ? " · " + esc(a.account_no) : ""}</div>
        <div class="stat" style="margin-top:10px"><div class="lbl">Current Balance</div>
        <div class="val" style="color:${a.balance < 0 ? "var(--danger)" : "var(--primary-dark)"}">${rs(a.balance)}</div></div></div>
      <div class="row">
        <button class="btn primary grow" onclick="openBankTxn('in')">+ Deposit</button>
        <button class="btn danger grow" onclick="openBankTxn('out')">− Withdraw</button>
      </div>
      <div style="height:10px"></div>${txns}
      <button class="btn ghost block" onclick="go('v-banks')">← Bank Accounts</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};
function openBankTxn(kind) {
  modal(`
    <h3>${kind === "in" ? "Deposit to " : "Withdraw from "}${esc(window._bank.name)}</h3>
    <label class="f">Amount (Rs)</label><input id="bt-amt" type="number" min="1">
    <label class="f">Note</label><input id="bt-note" placeholder="Details">
    <div class="err" id="bt-err"></div>
    <button class="btn primary block" onclick="saveBankTxn('${kind}')">Save</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}
async function saveBankTxn(kind) {
  const amt = +$("bt-amt").value || 0;
  if (amt <= 0) { $("bt-err").textContent = "Enter an amount"; return; }
  try {
    await api(`/bank-accounts/${window._bank.id}/txns`, "POST",
      {kind, amount: amt, note: $("bt-note").value.trim()});
    closeModal(); RENDER["v-bank-detail"](window._bank.id);
  } catch (e) { $("bt-err").textContent = e.message; }
}

/* ================= PAYMENT REMINDERS ================= */
RENDER["v-reminders"] = async () => {
  const v = $("v-reminders");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const parties = await api("/parties?type=customer");
    const due = parties.filter((p) => p.balance > 0).sort((a, b) => b.balance - a.balance);
    const total = due.reduce((s, p) => s + p.balance, 0);
    window._remDue = due;
    v.innerHTML = `
      <div class="card"><div class="kv"><span><b>Total Receivable</b></span><b style="color:var(--danger)">${rs(total)}</b></div>
      <div class="s" style="color:#6b7280;font-size:12px">${due.length} customer(s) have unpaid balances</div></div>
      ${due.length ? `<button class="btn primary block" onclick="remindAll()" style="margin-bottom:12px"> Remind All on WhatsApp</button>` : ""}
      ` + (due.length ? due.map((p, i) => `
        <div class="list-item" style="cursor:default">
          <div><div class="t">${esc(p.name)}</div><div class="s">${esc(p.phone || "no number")}</div></div>
          <div style="text-align:right"><div class="t" style="color:var(--danger)">${rs(p.balance)}</div>
          <button class="btn sm primary" style="margin-top:4px" onclick="remindOne(${i})"> Remind</button></div>
        </div>`).join("")
      : `<div class="empty"> Nobody owes you anything!</div>`) +
      `<button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};
function remindText(p) {
  const s = SHOP || {};
  return `Assalam-o-Alaikum ${p.name}, this is ${s.name || "Karobar"}. Your outstanding balance is Rs ${Math.round(p.balance)}. Please pay at your earliest convenience. Thank you!`;
}
function remindOne(i) {
  const p = window._remDue[i];
  const url = "https://wa.me/" + (p.phone || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(remindText(p));
  window.open(p.phone ? url : "https://wa.me/?text=" + encodeURIComponent(remindText(p)), "_blank");
}
function remindAll() {
  const due = window._remDue || [];
  if (!due.length) return;
  if (!confirm(`Open WhatsApp for ${due.length} customers one by one?`)) return;
  due.forEach((p, i) => setTimeout(() => {
    const url = "https://wa.me/" + (p.phone || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(remindText(p));
    window.open(p.phone ? url : "https://wa.me/?text=" + encodeURIComponent(remindText(p)), "_blank");
  }, i * 1200));
}

/* ================= LEDGER ================= */
let KHATA_TYPE = "customer";
RENDER["v-khata"] = async () => {
  const v = $("v-khata");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const parties = await api("/parties?type=" + KHATA_TYPE);
    const total = parties.reduce((s, p) => s + (p.balance || 0), 0);
    v.innerHTML = `<button class="fab" onclick="openPartyForm()">+</button>
      <div class="tabs">
        <button class="${KHATA_TYPE === "customer" ? "active" : ""}" onclick="KHATA_TYPE='customer';RENDER['v-khata']()">Customers</button>
        <button class="${KHATA_TYPE === "supplier" ? "active" : ""}" onclick="KHATA_TYPE='supplier';RENDER['v-khata']()">Suppliers</button>
      </div>
      <div class="card"><div class="kv"><span><b>Total ${KHATA_TYPE === "customer" ? "Receivable" : "Payable"}</b></span><b style="color:${total > 0 ? "#dc2626" : "#16a34a"}">${rs(total)}</b></div></div>` +
      (parties.length ? parties.map((p) => `
        <div class="list-item" onclick="go('v-party', ${p.id})">
          <div><div class="t">${esc(p.name)}</div><div class="s">${esc(p.phone || "")}</div></div>
          <div style="text-align:right"><div class="t" style="color:${p.balance > 0 ? "#dc2626" : "#16a34a"}">${rs(p.balance)}</div></div>
        </div>`).join("")
      : `<div class="empty">No ${KHATA_TYPE === "customer" ? "customers" : "suppliers"} yet.<br>Tap + to add.</div>`) +
      `<button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function openPartyForm() {
  const isCust = KHATA_TYPE === "customer";
  modal(`
    <h3>New ${isCust ? "Customer" : "Supplier"}</h3>
    <label class="f">Name *</label><input id="pt-name">
    <label class="f">Mobile Number</label><input id="pt-phone" inputmode="tel">
    <label class="f">Address</label><input id="pt-addr">
    ${isCust ? `<label class="f">Credit Limit (Rs) — 0 = no limit</label><input id="pt-limit" type="number" min="0" value="0">` : ""}
    <div id="pt-udf"></div>
    <div class="err" id="pt-err"></div>
    <button class="btn primary block" onclick="saveParty()">Save</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
  udfValues("party", 0).then((fs) => {
    const el = $("pt-udf");
    if (el && fs.length) el.innerHTML = `<h4 style="margin:10px 0 4px">Extra Fields</h4>` + fs.map((f) => udfInputHTML(f, "")).join("");
  });
}
async function saveParty() {
  const name = $("pt-name").value.trim();
  if (!name) { $("pt-err").textContent = "Name is required"; return; }
  try {
    const r = await api("/parties", "POST", {name, phone: $("pt-phone").value.trim(), type: KHATA_TYPE,
      address: $("pt-addr").value.trim(), credit_limit: +($("pt-limit") ? $("pt-limit").value : 0) || 0});
    await udfSave("party", r.id);
    closeModal(); RENDER["v-khata"]();
  } catch (e) { $("pt-err").textContent = e.message; }
}

function openPartyEditForm() {
  const p = window._party;
  if (!p) return;
  const isCust = p.type === "customer";
  modal(`
    <h3>Edit ${isCust ? "Customer" : "Supplier"}</h3>
    <label class="f">Name *</label><input id="pe-name" value="${esc(p.name)}">
    <label class="f">Mobile Number</label><input id="pe-phone" value="${esc(p.phone || "")}" inputmode="tel">
    <label class="f">Address</label><input id="pe-addr" value="${esc(p.address || "")}">
    ${isCust ? `<label class="f">Credit Limit (Rs) — 0 = no limit</label><input id="pe-limit" type="number" min="0" value="${p.credit_limit || 0}">` : ""}
    <div id="pe-udf"></div>
    <div class="err" id="pe-err"></div>
    <button class="btn primary block" onclick="savePartyEdit(${p.id})">Save</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
  udfValues("party", p.id).then((fs) => {
    const el = $("pe-udf");
    if (el && fs.length) el.innerHTML = `<h4 style="margin:10px 0 4px">Extra Fields</h4>` + fs.map((f) => udfInputHTML(f, f.value)).join("");
  });
}
async function savePartyEdit(pid) {
  const name = $("pe-name").value.trim();
  if (!name) { $("pe-err").textContent = "Name is required"; return; }
  const body = {name, phone: $("pe-phone").value.trim(), address: $("pe-addr").value.trim()};
  if ($("pe-limit")) body.credit_limit = +$("pe-limit").value || 0;
  try {
    await api("/parties/" + pid, "PUT", body);
    await udfSave("party", pid);
    closeModal(); RENDER["v-party"](pid);
  } catch (e) { $("pe-err").textContent = e.message; }
}

RENDER["v-party"] = async (pid) => {
  const v = $("v-party");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const p = await api("/parties/" + pid);
    window._party = p;
    const isCust = p.type === "customer";
    const actLbl = isCust ? "Collection (receive)" : "Payment (pay)";
    const dir = isCust ? "lena" : "dena";
    const hist = p.history.length ? p.history.map((h) => h.kind === "bill"
      ? `<div class="kv"><span> ${esc(h.bill_no)} · ${niceDate(h.date)}</span><span class="num">${rs(h.total)}<br><span style="font-size:11px;color:${h.baqaya > 0 ? "#dc2626" : "#16a34a"}">due ${rs(h.baqaya)}</span></span></div>`
      : `<div class="kv"><span> ${actLbl} · ${niceDate(h.date)}${h.note ? "<br><span style='font-size:11px;color:#6b7280'>" + esc(h.note) + "</span>" : ""}</span><span class="num" style="color:#16a34a">− ${rs(h.amount)}</span></div>`
    ).join("") : `<div class="empty">No transactions</div>`;
    v.innerHTML = `
      <div class="card"><h3>${esc(p.name)}</h3>
        <div class="s" style="color:#6b7280">${esc(p.phone || "")}${p.address ? " · " + esc(p.address) : ""}</div>
        <div class="stat" style="margin-top:10px"><div class="lbl">${isCust ? "RECEIVABLE from Customer" : "PAYABLE to Supplier"}</div>
        <div class="val ${p.balance > 0 ? "red" : "green"}">${rs(p.balance)}</div></div>
        ${isCust && (p.credit_limit || 0) > 0 ? `
          <div class="kv" style="margin-top:8px"><span>Credit Limit</span><b>${rs(p.credit_limit)}</b></div>
          ${p.balance > p.credit_limit ? `<div class="card" style="background:#fef2f2;border:1px solid #fecaca;margin:8px 0 0;padding:10px">
            <b style="color:#dc2626">⚠ Credit limit exceeded!</b><div style="font-size:12px;color:#991b1b">Balance ${rs(p.balance)} is over the ${rs(p.credit_limit)} limit.</div></div>` : ""}
        ` : ""}
        <button class="btn sm ghost" style="margin-top:8px" onclick="openPartyEditForm()">✏ Edit</button>
        <button class="btn sm ghost" style="margin-top:8px;color:#dc2626" onclick="deletePartyForever(${p.id})">Delete</button></div>
      <button class="btn primary block" onclick="openPaymentForm('${dir}')">+ Record ${actLbl}</button>
      <div class="row" style="margin-top:8px">
        <button class="btn amber grow" onclick="waReminder()"> WhatsApp Reminder</button>
        <button class="btn ghost grow" onclick="waStatement()"> Send Statement</button>
      </div>
      <div class="card" style="margin-top:12px"><h3>Transaction History</h3>${hist}</div>
      <div id="party-udf"></div>
      <button class="btn ghost block" onclick="go('v-khata')">← Ledger</button>`;
    udfValues("party", p.id).then((fs) => {
      const el = $("party-udf");
      const filled = fs.filter((f) => f.value);
      if (el && filled.length) el.innerHTML = `<div class="card"><h3>Extra Fields</h3>` +
        filled.map((f) => `<div class="kv"><span>${esc(f.name)}</span><b>${esc(f.value)}</b></div>`).join("") + `</div>`;
    });
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function openPaymentForm(dir) {
  modal(`
    <h3>${dir === "lena" ? "Collection" : "Payment"} — ${esc(window._party.name)}</h3>
    <label class="f">Amount (Rs)</label><input id="pm-amt" type="number" min="1">
    <label class="f">Direction</label>
    <select id="pm-dir">
      <option value="lena" ${dir === "lena" ? "selected" : ""}>Receive (collection)</option>
      <option value="dena" ${dir === "dena" ? "selected" : ""}>Pay (payment)</option>
    </select>
    <label class="f">Method</label>
    <select id="pm-mode">${MODES.map((m) => `<option value="${m[0]}">${m[1]}</option>`).join("")}</select>
    <label class="f">Date</label><input id="pm-date" type="date" value="${todayISO()}">
    <label class="f">Note</label><input id="pm-note">
    <div class="err" id="pm-err"></div>
    <button class="btn primary block" onclick="savePayment()">Save</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}
async function savePayment() {
  const amt = +$("pm-amt").value || 0;
  if (amt <= 0) { $("pm-err").textContent = "Enter an amount"; return; }
  try {
    await api(`/parties/${window._party.id}/payments`, "POST",
      {amount: amt, direction: $("pm-dir").value, mode: $("pm-mode").value,
       note: $("pm-note").value.trim(), date: $("pm-date").value || undefined});
    closeModal(); RENDER["v-party"](window._party.id);
  } catch (e) { $("pm-err").textContent = e.message; }
}

function waReminder() {
  const p = window._party;
  if (!p) return;
  const txt = `Hello ${p.name}! Reminder from ${SHOP ? SHOP.name : "Karobar"}: your balance due is Rs ${Number(p.balance || 0).toLocaleString("en-PK", {maximumFractionDigits: 0})}. Thank you!`;
  const ph = waPhone(p.phone);
  window.open(ph ? `https://wa.me/${ph}?text=${encodeURIComponent(txt)}` : "https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

function waStatement() {
  const p = window._party;
  if (!p) return;
  const isCust = p.type === "customer";
  let txt = `${SHOP ? SHOP.name : "Karobar"}\nLedger Statement — ${p.name}\n----------------\n`;
  p.history.forEach((h) => {
    if (h.kind === "bill") txt += `Bill ${h.bill_no} | ${h.date} | Total Rs ${h.total} | Due Rs ${h.baqaya}\n`;
    else txt += `${h.direction === "lena" ? "Collection" : "Payment"} | ${h.date} | Rs ${h.amount}${h.note ? " (" + h.note + ")" : ""}\n`;
  });
  txt += `----------------\n${isCust ? "Receivable" : "Payable"}: Rs ${Number(p.balance || 0).toLocaleString("en-PK", {maximumFractionDigits: 0})}\nThank you!`;
  const ph = waPhone(p.phone);
  window.open(ph ? `https://wa.me/${ph}?text=${encodeURIComponent(txt)}` : "https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

/* ================= EXPENSES ================= */
let KHA_FROM = todayISO(), KHA_TO = todayISO();
RENDER["v-kharchay"] = async () => {
  const v = $("v-kharchay");
  v.innerHTML = `
    <div class="card"><h3>Expenses</h3>
      <div class="row">
        <div class="grow"><label class="f">From</label><input type="date" id="kha-from" value="${KHA_FROM}"></div>
        <div class="grow"><label class="f">To</label><input type="date" id="kha-to" value="${KHA_TO}"></div>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn sm ghost" onclick="setKhaRange(0)">Today</button>
        <button class="btn sm ghost" onclick="setKhaRange(7)">7 Days</button>
        <button class="btn sm ghost" onclick="setKhaRange(30)">30 Days</button>
        <button class="btn sm primary" onclick="loadKharchay()">Show</button>
      </div></div>
    <div id="kha-out"></div>
    <div class="row"><button class="btn danger grow" onclick="openCashForm('out')">+ New Expense</button></div>
    <div style="height:8px"></div>
    <button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
  loadKharchay();
};
function setKhaRange(days) {
  const t = new Date();
  KHA_TO = t.toISOString().slice(0, 10);
  KHA_FROM = new Date(t - days * 864e5).toISOString().slice(0, 10);
  RENDER["v-kharchay"]();
}
async function loadKharchay() {
  KHA_FROM = $("kha-from").value; KHA_TO = $("kha-to").value;
  const out = $("kha-out");
  out.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const r = await api(`/reports/expenses?from_date=${KHA_FROM}&to_date=${KHA_TO}`);
    out.innerHTML = `
      <div class="card"><h3>Expenses by Category</h3>
        ${(r.by_category || []).length ? `<table class="tbl"><tr><th>Category</th><th class="num">Count</th><th class="num">Total</th></tr>` +
          r.by_category.map((c) => `<tr><td>${esc(catLabel(c.category))}</td><td class="num">${c.n}</td><td class="num">${rs(c.total)}</td></tr>`).join("") + `</table>`
        : `<div style="color:#6b7280;font-size:13px">No expenses</div>`}
        <div class="divider"></div>
        <div class="kv"><span><b>Total Expenses</b></span><b class="val red">${rs(r.total)}</b></div></div>`;
  } catch (e) { out.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}

/* ================= REPORTS ================= */
let REP_SUB = "sale", REP_FROM = todayISO(), REP_TO = todayISO(), OUT_TYPE = "customer", DB_DATE = todayISO();
const REP_TABS = [["sale", "Sale"], ["profit", "Profit"], ["billprofit", "Bill Profit"], ["stock", "Stock"], ["itemledger", "Item Ledger"], ["outstanding", "Outstanding"], ["aging", "Aging"], ["cashflow", "Cash Flow"], ["daybook", "Day Book"], ["movement", "Fast/Slow"], ["balancesheet", "Balance Sheet"]];
RENDER["v-reports"] = async () => {
  const v = $("v-reports");
  v.innerHTML = `
    <div class="tabs" style="flex-wrap:wrap">
      ${REP_TABS.map((t) => `<button class="${REP_SUB === t[0] ? "active" : ""}" onclick="REP_SUB='${t[0]}';RENDER['v-reports']()">${t[1]}</button>`).join("")}
    </div>
    <div id="rep-out"></div>
    <button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
  loadReportSub();
};
function repRangeHTML() {
  return `<div class="card"><div class="row">
      <div class="grow"><label class="f">From</label><input type="date" id="rep-from" value="${REP_FROM}"></div>
      <div class="grow"><label class="f">To</label><input type="date" id="rep-to" value="${REP_TO}"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn sm ghost" onclick="setRepRange(0)">Today</button>
      <button class="btn sm ghost" onclick="setRepRange(7)">7 Days</button>
      <button class="btn sm ghost" onclick="setRepRange(30)">30 Days</button>
      <button class="btn sm primary" onclick="loadReportSub()">Show</button>
    </div></div>`;
}
function setRepRange(days) {
  const t = new Date();
  REP_TO = t.toISOString().slice(0, 10);
  REP_FROM = new Date(t - days * 864e5).toISOString().slice(0, 10);
  RENDER["v-reports"]();
}
async function loadReportSub() {
  const out = $("rep-out");
  if ($("rep-from")) { REP_FROM = $("rep-from").value; REP_TO = $("rep-to").value; }
  out.innerHTML = `<div class="card">Loading…</div>`;
  try {
    if (REP_SUB === "sale") {
      const s = await api(`/reports/sales?from_date=${REP_FROM}&to_date=${REP_TO}`);
      out.innerHTML = repRangeHTML() + `
        <div class="card"><h3>Sales Report</h3><button class="btn sm ghost" onclick="exportXlsx('sale')">⬇ Excel</button>
          <div class="kv"><span>Bills</span><b>${s.total.bills}</b></div>
          <div class="kv"><span>Total Sales</span><b>${rs(s.total.sale)}</b></div>
          <div class="kv"><span>Paid</span><b>${rs(s.total.wasool)}</b></div>
          <div class="kv"><span>Balance Due</span><b>${rs(s.total.baqaya)}</b></div></div>
        ${s.days.length > 1 ? `<div class="card"><h3>Daily Sales</h3><table class="tbl"><tr><th>Date</th><th class="num">Bills</th><th class="num">Sale</th></tr>` +
          s.days.map((d) => `<tr><td>${niceDate(d.date)}</td><td class="num">${d.bills}</td><td class="num">${rs(d.sale)}</td></tr>`).join("") + `</table></div>` : ""}`;
    } else if (REP_SUB === "profit") {
      const p = await api(`/reports/profit?from_date=${REP_FROM}&to_date=${REP_TO}`);
      out.innerHTML = repRangeHTML() + `
        <div class="card"><h3>Profit Report</h3><button class="btn sm ghost" onclick="exportXlsx('profit')">⬇ Excel</button>
          <div class="kv"><span>Revenue</span><b>${rs(p.revenue)}</b></div>
          <div class="kv"><span>Cost</span><b>${rs(p.cost)}</b></div>
          <div class="kv"><span>Discount</span><b>${rs(p.discount)}</b></div>
          <div class="kv"><span><b>Net Profit</b></span><b style="color:#16a34a">${rs(p.profit)}</b></div></div>
        <div class="card"><h3>Top Products</h3>
          ${p.top_products.length ? `<table class="tbl"><tr><th>Product</th><th class="num">Qty</th><th class="num">Sale</th><th class="num">Profit</th></tr>` +
            p.top_products.map((t) => `<tr><td>${esc(t.product_name)}</td><td class="num">${t.qty}</td><td class="num">${rs(t.revenue)}</td><td class="num">${rs(t.profit)}</td></tr>`).join("") + `</table>`
          : `<div style="color:#6b7280;font-size:13px">No sales</div>`}</div>`;
    } else if (REP_SUB === "stock") {
      const r = await api("/reports/stock");
      out.innerHTML = `
        <div class="card"><h3>Stock Report</h3><button class="btn sm ghost" onclick="exportXlsx('stock')">⬇ Excel</button>
          <div class="kv"><span>Stock Value (purchase price)</span><b>${rs(r.total_cost_value)}</b></div>
          <div class="kv"><span>Stock Value (sale price)</span><b>${rs(r.total_sale_value)}</b></div>
          <div class="kv"><span>Low Stock Items</span><b style="color:#dc2626">${r.low_count}</b></div></div>
        <div class="card"><h3>Items</h3><div style="overflow-x:auto"><table class="tbl">
          <tr><th>Product</th><th class="num">Stock</th><th class="num">Purchase</th><th class="num">Sale</th><th class="num">Value (cost)</th></tr>
          ${r.items.map((i) => `<tr${i.stock_qty <= i.low_stock_level ? ' style="background:#fef3c7"' : ""}><td>${esc(i.name)}${i.sku ? "<br><span style='font-size:11px;color:#6b7280'>" + esc(i.sku) + "</span>" : ""}</td><td class="num">${i.stock_qty}</td><td class="num">${rs(i.purchase_price)}</td><td class="num">${rs(i.sale_price)}</td><td class="num">${rs(i.stock_value_cost)}</td></tr>`).join("")}
        </table></div></div>`;
    } else if (REP_SUB === "itemledger") {
      if (!window._ilProducts) {
        try { window._ilProducts = await api("/products?limit=1000"); } catch (e) { window._ilProducts = []; }
      }
      const prods = window._ilProducts || [];
      out.innerHTML = `
        <div class="card"><h3>Item Ledger</h3>
          <label class="f">Item</label>
          <input id="il-item" list="il-list" placeholder="Item ka naam likho…" value="${esc(window._ilName || "")}">
          <datalist id="il-list">${prods.map((p) => `<option data-id="${p.id}" value="${esc(p.name)}">`).join("")}</datalist>
          <div class="row" style="margin-top:8px">
            <button class="btn sm primary" onclick="showItemLedger()">Show</button>
          </div></div>
        <div id="il-out"></div>`;
      if (window._ilPid) showItemLedger();
    } else if (REP_SUB === "outstanding") {
      const r = await api("/reports/outstanding?type=" + OUT_TYPE);
      out.innerHTML = `
        <div class="tabs">
          <button class="${OUT_TYPE === "customer" ? "active" : ""}" onclick="OUT_TYPE='customer';loadReportSub()">Customers</button>
          <button class="${OUT_TYPE === "supplier" ? "active" : ""}" onclick="OUT_TYPE='supplier';loadReportSub()">Supplier</button>
        </div>
        <div class="card"><div class="kv"><span><b>Total ${OUT_TYPE === "customer" ? "Receivable" : "Payable"}</b></span><b style="color:#dc2626">${rs(r.total)}</b></div>
        <button class="btn sm ghost" onclick="exportXlsx('outstanding')">⬇ Excel</button></div>
        ${(r.parties || []).length ? r.parties.map((p) => `
          <div class="list-item" onclick="KHATA_TYPE='${OUT_TYPE}';go('v-party', ${p.id})">
            <div><div class="t">${esc(p.name)}</div><div class="s">${esc(p.phone || "")}</div></div>
            <div class="t" style="color:#dc2626">${rs(p.balance)}</div>
          </div>`).join("") : `<div class="empty">No outstanding dues </div>`}`;
    } else if (REP_SUB === "daybook") {
      const r = await api("/reports/daybook?date=" + DB_DATE);
      out.innerHTML = `
        <div class="card"><div class="row">
          <label class="f grow" style="margin:0"> Date</label>
          <input type="date" class="grow" value="${DB_DATE}" onchange="DB_DATE=this.value;loadReportSub()">
        </div>
        <div class="kv" style="margin-top:8px"><span><b>Total Entries</b></span><b>${r.count}</b></div>
        <button class="btn sm ghost" onclick="exportXlsx('daybook')">⬇ Excel</button></div>
        ${(r.items || []).length ? r.items.map((i) => `
          <div class="list-item" style="cursor:default">
            <div><div class="t">${esc(i.ref || i.kind)}</div><div class="s">${esc(i.tafseel || "")}</div></div>
            <div class="t">${rs(i.amount)}</div>
          </div>`).join("") : `<div class="empty">No entries on this date</div>`}`;
    } else if (REP_SUB === "movement") {
      const m = await api("/reports/movement?days=30");
      out.innerHTML = `
        <div class="card"><h3>Fast Moving — Last 30 Days</h3>
          <button class="btn sm ghost" onclick="exportXlsx('movement')">⬇ Excel</button>
          ${m.fast.length ? `<table class="tbl"><tr><th>Product</th><th class="num">Qty Sold</th><th class="num">Revenue</th></tr>` +
            m.fast.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${x.qty_sold}</td><td class="num">${rs(x.revenue)}</td></tr>`).join("") + `</table>`
          : `<div style="color:#6b7280;font-size:13px">No sales in 30 days</div>`}</div>
        <div class="card"><h3>Slow Moving — In Stock, No Sales (30 Days)</h3>
          ${m.slow.length ? `<table class="tbl"><tr><th>Product</th><th class="num">Stock Left</th></tr>` +
            m.slow.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${x.stock_qty}</td></tr>`).join("") + `</table>`
          : `<div style="color:#6b7280;font-size:13px">Nothing slow-moving — all stocked items sold recently</div>`}</div>`;
    } else if (REP_SUB === "billprofit") {
      const r = await api(`/reports/bill-profit?from_date=${REP_FROM}&to_date=${REP_TO}`);
      out.innerHTML = repRangeHTML() + `
        <div class="card"><h3>Bill-wise Profit</h3>
          <div class="kv"><span>Total Sale</span><b>${rs(r.total_sale)}</b></div>
          <div class="kv"><span><b>Total Profit</b></span><b style="color:#16a34a">${rs(r.total_profit)}</b></div></div>
        ${r.bills.length ? `<div class="card"><table class="tbl"><tr><th>Bill</th><th>Date</th><th class="num">Sale</th><th class="num">Profit</th></tr>` +
          r.bills.map((x) => `<tr><td>${esc(x.bill_no)}<br><span style="font-size:11px;color:#6b7280">${esc(x.party || "")}</span></td><td>${niceDate(x.date)}</td><td class="num">${rs(x.total)}</td><td class="num" style="color:${x.profit >= 0 ? "#16a34a" : "#dc2626"}">${rs(x.profit)}</td></tr>`).join("") + `</table></div>`
        : `<div class="empty">No bills in this period</div>`}`;
    } else if (REP_SUB === "aging") {
      const a = await api("/reports/aging");
      const buck = (b, color) => ["0-30", "31-60", "61-90", "90+"].map((k) =>
        `<div class="kv"><span>${k} days</span><b style="color:${color}">${rs(b[k])}</b></div>`).join("");
      out.innerHTML = `
        <div class="card"><h3>Receivable Aging (You'll Get)</h3>${buck(a.receivable, "#b45309")}
          <div class="kv"><span><b>Total</b></span><b>${rs(a.receivable_total)}</b></div></div>
        <div class="card"><h3>Payable Aging (You'll Give)</h3>${buck(a.payable, "#dc2626")}
          <div class="kv"><span><b>Total</b></span><b>${rs(a.payable_total)}</b></div></div>`;
    } else if (REP_SUB === "cashflow") {
      const c = await api(`/reports/cash-flow?from_date=${REP_FROM}&to_date=${REP_TO}`);
      const rows = (list) => list.length ? list.map((x) =>
        `<div class="kv"><span>${esc(x.category)}</span><b>${rs(x.total)}</b></div>`).join("")
        : `<div style="color:#6b7280;font-size:13px">Nothing</div>`;
      out.innerHTML = repRangeHTML() + `
        <div class="card"><h3>Money In</h3>${rows(c.inflow)}
          <div class="kv"><span><b>Total In</b></span><b style="color:#16a34a">${rs(c.total_in)}</b></div></div>
        <div class="card"><h3>Money Out</h3>${rows(c.outflow)}
          <div class="kv"><span><b>Total Out</b></span><b style="color:#dc2626">${rs(c.total_out)}</b></div></div>
        <div class="card"><div class="kv"><span><b>Net Cash Flow</b></span><b style="color:${c.net >= 0 ? "#16a34a" : "#dc2626"}">${rs(c.net)}</b></div></div>`;
    } else if (REP_SUB === "balancesheet") {
      const b = await api("/reports/balance-sheet");
      const kv = (l, v) => `<div class="kv"><span>${l}</span><b>${rs(v)}</b></div>`;
      out.innerHTML = `
        <div class="card"><h3>Assets</h3>
          ${kv("Cash In-Hand", b.assets.cash_in_hand)}
          ${kv("Bank", b.assets.bank)}
          ${kv("Stock Value", b.assets.stock_value)}
          ${kv("Receivables (You'll Get)", b.assets.receivables)}
          <div class="kv"><span><b>Total Assets</b></span><b style="color:var(--blue-dark)">${rs(b.assets.total)}</b></div></div>
        <div class="card"><h3>Liabilities</h3>
          ${kv("Payables (You'll Give)", b.liabilities.payables)}
          <div class="kv"><span><b>Total Liabilities</b></span><b>${rs(b.liabilities.total)}</b></div></div>
        <div class="card"><h3>Equity</h3>
          <div class="kv"><span><b>Owner's Equity</b></span><b style="color:#16a34a">${rs(b.equity)}</b></div>
          <div style="color:#6b7280;font-size:12px">Assets = Liabilities + Equity</div></div>`;
    }
  } catch (e) { out.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}

async function exportXlsx(kind) {
  try {
    let url = `/api/reports/export?kind=${kind}`;
    if ($("rep-from")) url += `&from_date=${$("rep-from").value}&to_date=${$("rep-to").value}`;
    if (kind === "daybook" && window.DB_DATE) url += `&from_date=${DB_DATE}`;
    const r = await fetch(url, {headers: authHeaders()});
    if (!r.ok) throw new Error("Export failed");
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `karobar_${kind}_report.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { toast(e.message); }
}

async function showItemLedger() {
  const out = $("il-out");
  const name = ($("il-item").value || "").trim().toLowerCase();
  const prods = window._ilProducts || [];
  const p = prods.find((x) => (x.name || "").toLowerCase() === name)
         || prods.find((x) => (x.name || "").toLowerCase().includes(name));
  if (!p) { out.innerHTML = `<div class="card err">Item nahi mila — list me se chun kar likho.</div>`; return; }
  window._ilPid = p.id; window._ilName = p.name;
  out.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const r = await api(`/reports/item-ledger?product_id=${p.id}`);
    const tbl = (rows, cols) => rows.length
      ? `<div style="overflow-x:auto"><table class="tbl"><tr>${cols.map((c) => `<th${c.n ? ' class="num"' : ""}>${c.t}</th>`).join("")}</tr>` +
        rows.map((x) => `<tr>${cols.map((c) => `<td${c.n ? ' class="num"' : ""}>${c.f(x)}</td>`).join("")}</tr>`).join("") + `</table></div>`
      : `<div style="color:#6b7280;font-size:13px">Koi record nahi</div>`;
    const cols = [
      {t: "Date"}, {t: "Bill No", f: (x) => esc(x.bill_no)},
      {t: "Party", f: (x) => esc(x.party_name || "—")},
      {t: "Qty", n: 1, f: (x) => x.qty}, {t: "Price", n: 1, f: (x) => rs(x.price)},
    ].map((c) => ({...c, f: c.f || ((x) => esc(x.date))}));
    out.innerHTML = `
      <div class="card"><h3>${esc(r.product.name)}</h3>
        <button class="btn sm ghost" onclick="exportItemLedger(${p.id})">⬇ Excel</button>
        <div class="kv"><span>Maal aaya (total purchase)</span><b class="val green">${r.total_in}</b></div>
        <div class="kv"><span>Maal gaya (total sale)</span><b class="val red">${r.total_out}</b></div>
        <div class="kv"><span><b>Ab stock me hai</b></span><b>${r.in_stock} ${esc(r.product.unit || "")}</b></div></div>
      <div class="card"><h3>Kahan se aaya (Purchases)</h3>${tbl(r.purchases, cols)}</div>
      <div class="card"><h3>Kahan gaya (Sales)</h3>${tbl(r.sales, cols)}</div>`;
  } catch (e) { out.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}
async function exportItemLedger(pid) {
  try {
    const r = await fetch(`/api/reports/export?kind=itemledger&product_id=${pid}`, {headers: authHeaders()});
    if (!r.ok) throw new Error("Export failed");
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `karobar_item_ledger.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { toast(e.message); }
}

/* ================= SETTINGS ================= */
RENDER["v-settings"] = async () => {
  const v = $("v-settings");
  try {
    const s = await api("/auth/me");
    const th = s.invoice_theme || "classic";
    const thCard = (id, name, desc) => `
      <label style="display:block;border:2px solid ${th === id ? brandPrimary() : "#e5e7eb"};border-radius:10px;padding:10px 12px;margin:6px 0;cursor:pointer">
        <input type="radio" name="inv-theme" value="${id}" ${th === id ? "checked" : ""} style="margin-right:8px"><b>${name}</b>
        <div style="color:#6b7280;font-size:12px;margin-top:2px">${desc}</div>
      </label>`;
    v.innerHTML = `
      <div class="card"><h3>Shop Settings</h3>
        <label class="f">Shop Name</label><input id="st-name" value="${esc(s.name)}">
        <label class="f">Address</label><input id="st-addr" value="${esc(s.address || "")}">
        <label class="f">Phone</label><input id="st-phone" value="${esc(s.phone)}">
        <label class="f">Receipt Header Text</label><input id="st-head" value="${esc(s.receipt_header || "")}" placeholder="E.g. Thank you!">
        <label class="f">Bill Print Theme</label>
        ${thCard("classic", "Classic", "Simple clean bill — default")}
        ${thCard("modern", "Modern", "Colored header, Karobar style")}
        ${thCard("compact", "Compact", "Small dense bill — thermal printer friendly")}
        <div class="err" id="st-err"></div>
        <button class="btn primary block" onclick="saveSettings()">Save</button></div>
      <div class="card"><h3>Backup</h3>
        <div style="color:#6b7280;font-size:12px;margin-bottom:8px">Download a full copy of your data, or restore from a backup file. Restore will replace current data!</div>
        <button class="btn ghost block" onclick="downloadBackup()">⬇ Download Backup</button>
        <label class="f">Restore from backup file</label>
        <input type="file" id="bk-file" accept=".db">
        <div class="err" id="bk-err"></div>
        <button class="btn block" style="background:#dc2626;color:#fff" onclick="restoreBackup()">Restore Backup</button>
        <div id="bk-res"></div>
      </div>
      <div class="card"><h3>App Lock</h3>
        <div style="color:#6b7280;font-size:12px;margin-bottom:8px">4-digit passcode — app will ask for it every time it opens.</div>
        <div id="pc-status" style="margin-bottom:8px;font-size:13px"></div>
        <div class="row">
          <input id="pc-new" class="grow" type="password" inputmode="numeric" maxlength="8" placeholder="New 4-digit passcode">
          <button class="btn sm primary" onclick="setPasscode()">Set</button>
        </div>
        <div class="err" id="pc-err"></div>
        <button class="btn sm ghost" style="color:#dc2626" onclick="removePasscode()">Remove App Lock</button>
      </div>
      <div class="card"><h3>Custom Fields</h3>
        <div style="color:#6b7280;font-size:12px;margin-bottom:8px">Your own extra fields on items, parties and bills.</div>
        <button class="btn ghost block" onclick="go('v-udf')">Manage Custom Fields</button>
      </div>
      <button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
    renderPasscodeStatus(s);
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function renderPasscodeStatus(s) {
  const el = $("pc-status");
  if (el) el.innerHTML = s.passcode_set
    ? `<span class="badge ok">App lock is ON</span>`
    : `<span style="color:#6b7280">App lock is OFF</span>`;
}

async function setPasscode() {
  const pc = $("pc-new").value.trim();
  if (!/^\d{4,8}$/.test(pc)) { $("pc-err").textContent = "Enter 4-8 digits"; return; }
  try {
    await api("/settings/passcode", "PUT", {passcode: pc});
    $("pc-new").value = "";
    $("pc-err").textContent = "";
    sessionStorage.removeItem("karobar_unlocked");
    toast("App lock enabled");
    RENDER["v-settings"]();
  } catch (e) { $("pc-err").textContent = e.message; }
}

async function removePasscode() {
  if (!confirm("Remove the app lock?")) return;
  try {
    await api("/settings/passcode", "DELETE");
    sessionStorage.setItem("karobar_unlocked", "1");
    toast("App lock removed");
    RENDER["v-settings"]();
  } catch (e) { toast(e.message); }
}

/* ---------- app lock gate on boot ---------- */
function showPasscodeGate() {
  const ov = document.createElement("div");
  ov.id = "pc-gate";
  ov.style.cssText = "position:fixed;inset:0;background:#1f2937;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px";
  ov.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:320px;width:100%;text-align:center">
      <h3 style="margin:0 0 4px">Karobar</h3>
      <div style="color:#6b7280;font-size:13px;margin-bottom:16px">Enter passcode to open</div>
      <input id="pc-gate-inp" type="password" inputmode="numeric" maxlength="8"
        style="font-size:28px;text-align:center;letter-spacing:12px;width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:10px;margin-bottom:8px">
      <div class="err" id="pc-gate-err"></div>
      <button class="btn primary block" onclick="unlockApp()">Unlock</button>
      <button class="btn ghost block" onclick="logout()">Logout</button>
    </div>`;
  document.body.appendChild(ov);
  setTimeout(() => $("pc-gate-inp").focus(), 100);
  $("pc-gate-inp").addEventListener("keydown", (e) => { if (e.key === "Enter") unlockApp(); });
}

async function unlockApp() {
  const pc = $("pc-gate-inp").value.trim();
  try {
    await api("/auth/verify-passcode", "POST", {passcode: pc});
    sessionStorage.setItem("karobar_unlocked", "1");
    $("pc-gate").remove();
  } catch (e) { $("pc-gate-err").textContent = e.message; }
}
async function saveSettings() {
  try {
    const thEl = document.querySelector('input[name="inv-theme"]:checked');
    await api("/settings", "PUT", {name: $("st-name").value.trim(), address: $("st-addr").value.trim(),
      phone: $("st-phone").value.trim(), receipt_header: $("st-head").value.trim(),
      invoice_theme: thEl ? thEl.value : "classic"});
    SHOP = await api("/auth/me");
    renderShopHeader();
    $("st-err").textContent = "Saved";
    setTimeout(() => { $("st-err").textContent = ""; }, 2000);
  } catch (e) { $("st-err").textContent = e.message; }
}

/* ================= HOME (Vyapar mobile: Transaction Details / Party Details) ================= */
let HOME_TAB = "txn";
let TXN_Q = "";
let _debT = null;

function qlinkHTML(iconName, bg, label, fn) {
  return `<button class="qlink" onclick="${fn}"><span class="qic"><span class="bg" style="background:${bg}"></span><svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="#2b3445" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${_P[iconName] || ""}</svg></span><span>${label}</span></button>`;
}

const TXN_BADGE = {sale: ["sale", "Sale"], "payment-in": ["payin", "Payment-In"], "payment-out": ["payout", "Payment-Out"], purchase: ["purchase", "Purchase"]};

RENDER["v-home"] = async () => {
  const v = $("v-home");
  v.innerHTML = `
    <div class="seg">
      <button class="${HOME_TAB === "txn" ? "active" : ""}" onclick="HOME_TAB='txn';RENDER['v-home']()">Transaction Details</button>
      <button class="${HOME_TAB === "party" ? "active" : ""}" onclick="HOME_TAB='party';RENDER['v-home']()">Party Details</button>
    </div>
    <div id="home-body"><div class="card">Loading…</div></div>`;
  if (HOME_TAB === "txn") renderTxnHome(); else renderPartyHome();
};

async function renderTxnHome() {
  const box = $("home-body");
  box.innerHTML = `
    <div class="card"><h3>Quick Links</h3><div class="qlinks">
      ${qlinkHTML("receiptPlus", "#f0564a", "Add Txn", "newSale()")}
      ${qlinkHTML("clipboardPct", "#5aa9e6", "Sale Report", "goReport('sale')")}
      ${qlinkHTML("gear", "#5aa9e6", "Txn Settings", "go('v-settings')")}
      ${qlinkHTML("circleArrow", "#5aa9e6", "Show All", "showAllTxn()")}
    </div></div>
    <div class="srch"><span class="sicon">${ic("search", 22)}</span>
      <input id="txn-search" placeholder="Search for a transaction" value="${esc(TXN_Q)}" autocomplete="off">
      <button class="fbtn" onclick="toast('More filters coming soon')">${ic("funnel", 22)}</button>
    </div>
    <div id="txn-list"><div class="card">Loading…</div></div>
    <div style="height:70px"></div>
    <button class="fab-pill" onclick="newSale()">${ic("plus", 20)} Add New Sale</button>`;
  const si = $("txn-search");
  si.addEventListener("input", () => {
    clearTimeout(_debT);
    _debT = setTimeout(() => { TXN_Q = si.value.trim(); loadTxns(); }, 400);
  });
  loadTxns();
}

function showAllTxn() { TXN_Q = ""; RENDER["v-home"](); window.scrollTo(0, 0); }

function txnRef(t) {
  const num = parseInt(String(t.ref || "").replace(/[^0-9]/g, ""), 10);
  return "#" + (isNaN(num) ? t.ref : num);
}

async function loadTxns() {
  const box = $("txn-list");
  if (!box) return;
  try {
    const txns = await api("/transactions?q=" + encodeURIComponent(TXN_Q));
    if (!txns.length) { box.innerHTML = `<div class="empty">No transactions found.</div>`; return; }
    box.innerHTML = txns.map((t) => {
      const [bc, bl] = TXN_BADGE[t.kind] || ["sale", t.kind];
      const lab2 = (t.kind === "sale" || t.kind === "purchase") ? "Balance" : "Unused";
      return `<div class="txn" onclick="openTxn('${t.kind}', ${t.doc_id}, ${t.party_id || 0})">
        <div class="r1"><div class="pname">${esc(t.party_name)}</div>
        <div class="ref">${esc(txnRef(t))}<br>${fmtD(t.date)}</div></div>
        <span class="badge ${bc}">${bl}</span>
        <div class="r2"><div class="amt2">
          <div><div class="lab">Total</div><div class="val">${rs(t.total)}</div></div>
          <div><div class="lab">${lab2}</div><div class="val">${rs(t.balance)}</div></div>
        </div><div class="acts">
          <button onclick="event.stopPropagation();txnPrint('${t.kind}',${t.doc_id})" aria-label="Print">${ic("printer", 22)}</button>
          <button onclick="event.stopPropagation();txnShare('${t.kind}',${t.doc_id})" aria-label="Share">${ic("shareCurve", 22)}</button>
          <button onclick="event.stopPropagation();txnMore('${t.kind}',${t.doc_id},${t.party_id || 0})" aria-label="More">${ic("dotsV", 22)}</button>
        </div></div>
      </div>`;
    }).join("");
  } catch (e) { box.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}

function openTxn(kind, docId, partyId) {
  if (kind === "sale") go("v-bill-detail", docId);
  else if (kind === "purchase") go("v-kharid-detail", docId);
  else if (partyId) go("v-party", partyId);
}

function printWin(html) {
  const w = window.open("", "_blank");
  w.document.write("<html><head><title>Print</title></head><body style='font-family:sans-serif'>" + html + "<scr" + "ipt>window.onload=function(){window.print()}</scr" + "ipt></body></html>");
  w.document.close();
}

async function txnPrint(kind, id) {
  try {
    let d;
    if (kind === "sale") d = await api("/bills/" + id);
    else if (kind === "purchase") d = await api("/purchases/" + id);
    else return;
    const s = d.shop || SHOP || {};
    printWin(docPaper(s, d.bill_no, d.date, d.party_name, d.items || [], d.subtotal || 0, d.discount || 0, d.total || 0, d.paid == null ? null : d.paid, (d.total || 0) - (d.paid || 0), d.mode));
  } catch (e) { toast(e.message); }
}

async function txnShare(kind, id) {
  try {
    let txt;
    if (kind === "sale") {
      const b = await api("/bills/" + id);
      txt = waDocText(b.shop || {}, b.bill_no, b.date, b.items || [], b.total, b.paid, (b.total || 0) - (b.paid || 0));
    } else if (kind === "purchase") {
      const p = await api("/purchases/" + id);
      txt = `${((p.shop || {}).name) || ""}\nPurchase: ${p.bill_no} | ${fmtD(p.date)}\nTotal: Rs ${p.total}\nPaid: Rs ${p.paid}`;
    } else {
      const ts = await api("/transactions");
      const t = ts.find((x) => x.kind === kind && x.doc_id === id);
      txt = t ? `${t.kind === "payment-in" ? "Payment received" : "Payment paid"}: ${rs(t.total)} — ${t.party_name} (${fmtD(t.date)})` : "Payment";
    }
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
  } catch (e) { toast(e.message); }
}

function txnMore(kind, docId, partyId) {
  modal(`<h3>Options</h3>
    <button class="btn ghost block" onclick="closeModal();openTxn('${kind}',${docId},${partyId})">View Details</button>
    ${partyId ? `<button class="btn ghost block" onclick="closeModal();go('v-party',${partyId})">View Party</button>` : ""}
    <button class="btn primary block" onclick="closeModal()">Close</button>`);
}

async function renderPartyHome() {
  const box = $("home-body");
  box.innerHTML = `
    <div class="srch"><span class="sicon">${ic("search", 22)}</span>
      <input id="party-search" placeholder="Search for a party" autocomplete="off">
      <button class="fbtn" onclick="toast('More filters coming soon')">${ic("funnel", 22)}</button>
    </div>
    <div id="party-list"><div class="card">Loading…</div></div>`;
  const si = $("party-search");
  let pq = "";
  si.addEventListener("input", () => {
    clearTimeout(_debT);
    _debT = setTimeout(() => { pq = si.value.trim(); loadParties(pq); }, 400);
  });
  loadParties("");
}

async function loadParties(q) {
  const box = $("party-list");
  if (!box) return;
  try {
    const ps = await api("/parties");
    const ql = q.toLowerCase();
    const list = ps.filter((p) => !ql || p.name.toLowerCase().includes(ql) || (p.phone || "").includes(ql));
    box.innerHTML = list.length ? list.map((p) => `
      <div class="list-item" onclick="go('v-party', ${p.id})">
        <div><div class="t">${esc(p.name)}</div><div class="s">${p.type === "customer" ? "Customer" : "Supplier"}${p.phone ? " · " + esc(p.phone) : ""}</div></div>
        <div class="t" style="color:${(p.balance || 0) > 0 ? "#e63956" : "#1db954"}">${rs(p.balance || 0)}</div>
      </div>`).join("") : `<div class="empty">No parties found.</div>`;
  } catch (e) { box.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}

/* ================= DASHBOARD ================= */
function reportSVG() {
  return `<svg width="104" height="112" viewBox="0 0 110 120">
    <circle cx="58" cy="60" r="52" fill="#1a6fd4"/>
    <rect x="36" y="34" width="44" height="56" rx="4" fill="#fff"/>
    <rect x="42" y="42" width="20" height="6" rx="2" fill="${brandPrimary()}"/>
    <rect x="42" y="52" width="32" height="4" rx="2" fill="#c9d8ec"/>
    <rect x="42" y="60" width="32" height="4" rx="2" fill="#c9d8ec"/>
    <rect x="42" y="68" width="22" height="4" rx="2" fill="#c9d8ec"/>
    <circle cx="72" cy="80" r="9" fill="#f5b301"/><path d="M67 80h10" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="88" cy="28" r="11" fill="#fff"/><path d="M88 23v10M83 28h10" stroke="#1db954" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="94" cy="56" r="9" fill="#fff"/><path d="M90 56h8" stroke="#e63956" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}

function chartSVG(ms) {
  const W = 300, H = 96;
  const vals = ms.map((m) => m.sale || 0);
  const max = Math.max(...vals, 1);
  const n = vals.length;
  const pts = vals.map((val, i) => {
    const x = n === 1 ? W / 2 : 16 + (i * (W - 32)) / (n - 1);
    const y = H - 12 - ((val / max) * (H - 32));
    return [x.toFixed(1), y.toFixed(1)];
  });
  const line = pts.map((p) => p.join(",")).join(" ");
  const dots = pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="${brandPrimary()}" stroke="#fff" stroke-width="2"/>`).join("");
  const labels = ms.map((m, i) => `<text x="${pts[i][0]}" y="${H + 15}" font-size="13" fill="#8a93a6" text-anchor="middle">${m.label}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H + 22}" style="width:100%;margin-top:10px"><line x1="0" y1="${H - 10}" x2="${W}" y2="${H - 10}" stroke="#d5dbe5" stroke-dasharray="5,4"/><polyline points="${line}" fill="none" stroke="${brandPrimary()}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}

RENDER["v-dashboard"] = async () => {
  const v = $("v-dashboard");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const [d, ms] = await Promise.all([api("/reports/dashboard"), api("/reports/monthly-sales?months=3")]);
    const cur = ms[ms.length - 1] || {label: "", sale: 0, purchase: 0, expense: 0};
    const prev = ms[ms.length - 2] || {sale: 0};
    const pct = prev.sale > 0 ? Math.round(((cur.sale - prev.sale) / prev.sale) * 100) : 0;
    const up = pct >= 0;
    v.innerHTML = `
      <div class="banner"><div class="bt">
        <h3>Karobar Reports</h3>
        <p>View more than <b>50 reports</b> and gain full control of your business…</p>
        <button class="pillbtn" onclick="go('v-reports')">See Reports</button>
      </div>${reportSVG()}</div>
      <div class="getgive">
        <div class="gg"><div class="top"><span class="circ g">${ic("arrDL", 18)}</span>You'll Get</div><div class="amt">${rs(d.kul_lena)}</div></div>
        <div class="gg"><div class="top"><span class="circ r">${ic("arrUR", 18)}</span>You'll Give</div><div class="amt">${rs(d.kul_dena)}</div></div>
      </div>
      <div class="card ov"><h3>Your Sale Overview (${esc(cur.label)})</h3>
        <div class="big"><div class="lab">Total Sale</div><div class="amt">${rs(cur.sale)}</div>
        <div class="chg"><span class="down">${ic(up ? "arrUR" : "arrDL", 14)}</span>${Math.abs(pct)}% ${up ? "Growth" : "Decline"} This Month</div></div>
        ${chartSVG(ms)}
      </div>
      <div class="getgive">
        <div class="gg"><div class="top">Purchases (${esc(cur.label)})</div><div class="amt">${rs(cur.purchase)}</div></div>
        <div class="gg"><div class="top">Expenses (${esc(cur.label)})</div><div class="amt">${rs(cur.expense)}</div></div>
      </div>
      <div class="card"><h3>Cash &amp; Bank</h3>
        <div class="kv"><span>Bank Balance</span><b style="color:var(--blue-dark)">${rs(d.bank_total || 0)}</b></div>
        <div class="kv"><span>Cash in Hand</span><b style="color:${(d.cash_in_hand || 0) < 0 ? "#e63956" : "#1db954"}">${rs(d.cash_in_hand || 0)}</b></div>
      </div>
      <div id="dash-alerts"></div>`;
    loadDashAlerts();
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

async function loadDashAlerts() {
  const el = $("dash-alerts");
  if (!el) return;
  try {
    const [ex, svc] = await Promise.all([
      api("/reports/expiry?days=30").catch(() => null),
      api("/reminders/due").catch(() => null),
    ]);
    let html = "";
    if (ex && (ex.expired.length || ex.expiring.length)) {
      html += `<div class="card" style="border:1px solid #fecaca"><h3 style="color:#dc2626">Expiry Alerts</h3>
        ${ex.expired.map((p) => `<div class="kv"><span>${esc(p.name)} <span class="badge">Expired</span></span><b>${esc(p.expiry_date)}</b></div>`).join("")}
        ${ex.expiring.map((p) => `<div class="kv"><span>${esc(p.name)}</span><b style="color:#b45309">${esc(p.expiry_date)}</b></div>`).join("")}
      </div>`;
    }
    if (svc && svc.length) {
      html += `<div class="card" style="border:1px solid #fde68a"><h3 style="color:#b45309">Service Reminders Due</h3>
        ${svc.map((r) => `<div class="kv"><span>${esc(r.title)}${r.party_name ? " — " + esc(r.party_name) : ""}</span><b>${niceDate(r.due_date)}</b></div>`).join("")}
      </div>`;
    }
    el.innerHTML = html;
  } catch (e) { /* alerts optional */ }
}

/* ================= ITEMS ================= */
let ITEM_Q = "";
let ITEM_LOWONLY = false;

RENDER["v-items"] = async () => {
  const v = $("v-items");
  v.innerHTML = `
    <div class="card"><h3>Quick Links</h3><div class="qlinks">
      ${qlinkHTML("store", "#5aa9e6", "Online Store", "comingSoon('Online Store')")}
      ${qlinkHTML("box", "#5aa9e6", "Stock Summary", "goReport('stock')")}
      ${qlinkHTML("gear", "#5aa9e6", "Item Settings", "go('v-settings')")}
      ${qlinkHTML("circleArrow", "#5aa9e6", "Show All", "showAllItems()")}
    </div></div>
    <div style="display:flex;gap:0;margin-bottom:12px">
      <div class="srch" style="flex:1;margin-bottom:0"><span class="sicon">${ic("search", 22)}</span>
        <input id="item-search" placeholder="Search for an item or code" value="${esc(ITEM_Q)}" autocomplete="off">
        <button class="fbtn" onclick="toast('More filters coming soon')">${ic("funnel", 22)}</button>
      </div>
      <button class="mbox" onclick="ITEM_LOWONLY=!ITEM_LOWONLY;RENDER['v-items']()" style="${ITEM_LOWONLY ? "color:#e63956" : ""}" aria-label="Options">${ic("dotsV", 22)}</button>
    </div>
    <div id="item-list"><div class="card">Loading…</div></div>
    <div style="height:70px"></div>
    <button class="fab-pill" onclick="openProductForm()">${ic("box", 20)} Add New Item</button>`;
  const si = $("item-search");
  si.addEventListener("input", () => {
    clearTimeout(_debT);
    _debT = setTimeout(() => { ITEM_Q = si.value.trim(); loadItems(); }, 400);
  });
  loadItems();
};

function showAllItems() { ITEM_Q = ""; ITEM_LOWONLY = false; RENDER["v-items"](); }

async function loadItems() {
  const box = $("item-list");
  if (!box) return;
  try {
    const ps = await api("/products");
    window._items = ps;
    const ql = ITEM_Q.toLowerCase();
    const list = ps.filter((p) =>
      (!ql || p.name.toLowerCase().includes(ql) || (p.sku || "").toLowerCase().includes(ql)) &&
      (!ITEM_LOWONLY || (p.stock_qty || 0) <= (p.low_stock_level || 0)));
    box.innerHTML = list.length ? list.map((p) => `
      <div class="icard" onclick="openProductForm(${p.id})">
        <div class="r1"><div class="nm">${esc(p.name)}</div>
          ${p.sku ? `<span class="badge cat">${esc(p.sku)}</span>` : ""}
          <button class="share" onclick="event.stopPropagation();shareItem(${p.id})" aria-label="Share">${ic("shareCurve", 22)}</button>
        </div>
        <div class="r2">
          <div><div class="lab">Sale Price</div><div class="v">${rs(p.sale_price)}</div></div>
          <div><div class="lab">Purchase Price</div><div class="v">${rs(p.purchase_price)}</div></div>
          <div><div class="lab">In Stock</div><div class="v stockok">${Number(p.stock_qty || 0).toLocaleString("en-IN")}</div></div>
        </div>
      </div>`).join("") : `<div class="empty">No items found.</div>`;
  } catch (e) { box.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}

function shareItem(pid) {
  const p = (window._items || []).find((x) => x.id === pid);
  if (!p) return;
  window.open("https://wa.me/?text=" + encodeURIComponent(`${p.name}\nSale Price: ${rs(p.sale_price)}\nIn Stock: ${p.stock_qty}`), "_blank");
}

/* ================= MENU ================= */
let MENU_OPEN = null;

RENDER["v-menu"] = async () => {
  const v = $("v-menu");
  const sub = (label, fn, soon) => `
    <div class="mrow sub" onclick="${soon ? `comingSoon('${label}')` : fn}">
      <div class="t">${label}</div>${soon ? `<span class="soon">Coming Soon</span>` : ""}
      <span class="chev">${ic("chevR", 20)}</span></div>`;
  const mrowX = (iconName, label, inner) => `
    <div class="mrow" onclick="MENU_OPEN=MENU_OPEN==='${label}'?null:'${label}';RENDER['v-menu']()">
      <span class="mi">${ic(iconName, 24)}</span><div class="t">${label}</div>
      <span class="chev">${ic(inner ? "chevU" : "chevD", 22)}</span></div>
    ${inner || ""}`;
  const mrowGo = (iconName, label, fn, soon) => `
    <div class="mrow" onclick="${soon ? `comingSoon('${label}')` : fn}">
      <span class="mi">${ic(iconName, 24)}</span><div class="t">${label}</div>
      ${soon ? `<span class="soon">Coming Soon</span>` : ""}
      <span class="chev">${ic("chevR", 22)}</span></div>`;
  const saleSubs = `
    ${sub("Sale Invoice", "newSale()")}
    ${sub("Payment-In", "goCustomers()")}
    ${sub("Sale Return (Credit Note)", "SALE_TAB='returns';go('v-sale')")}
    ${sub("Estimate/Quotation", "goSaleEstimates()")}
    ${sub("Sale Order", "SALE_TAB='orders';go('v-sale')")}
    ${sub("Delivery Note", "go('v-challans')")}
    ${sub("Mobile POS", "", true)}`;
  const purSubs = `
    ${sub("Purchase Bill", "go('v-kharid');openDocForm('purchase')")}
    ${sub("Payment-Out", "goSuppliers()")}
    ${sub("Purchase Order", "KHARID_TAB='orders';go('v-kharid')")}
    ${sub("Purchase Return", "KHARID_TAB='returns';go('v-kharid')")}`;
  const storeSubs = `
    ${sub("Open My Store", "window.open('/store/' + (window.SHOP||{}).id, '_blank')")}
    ${sub("Online Orders", "go('v-online-orders')")}
    ${sub("Copy Store Link", "copyStoreLink()")}`;
  const isOwner = (window.SHOP || {}).role === "owner" || !(window.SHOP || {}).role;
  v.innerHTML = `
    <div class="card"><h3>My Business</h3>
      ${mrowX("coins", "Sale", MENU_OPEN === "Sale" ? saleSubs : "")}
      ${mrowX("cart", "Purchase", MENU_OPEN === "Purchase" ? purSubs : "")}
      ${mrowGo("wallet", "Expenses", "go('v-kharchay')")}
      ${mrowX("store", "My Online Store", MENU_OPEN === "My Online Store" ? storeSubs : "")}
      ${mrowGo("clipboard", "Reports", "go('v-reports')")}
      ${mrowGo("rupee", "Loyalty Points", "", true)}
    </div>
    <div class="card"><h3>Cash &amp; Bank</h3>
      ${mrowGo("bank", "Bank Accounts", "go('v-banks')")}
      ${mrowGo("wallet", "Cash In-Hand", "go('v-cash')")}
      ${mrowGo("cheque", "Cheques", "go('v-cheques')")}
      ${mrowGo("loan", "Loan Accounts", "go('v-loans')")}
    </div>
    <div class="card"><h3>More</h3>
      ${mrowGo("bell", "Payment Reminders", "go('v-reminders')")}
      ${mrowGo("clock", "Service Reminders", "go('v-svc-reminders')")}
      ${isOwner ? mrowGo("users", "Staff", "go('v-staff')") : ""}
      ${mrowGo("upload", "Bulk Import", "go('v-import')")}
      ${mrowGo("idcard", "Visiting Card", "go('v-card')")}
      ${mrowGo("trash", "Recycle Bin", "go('v-recycle')")}
      ${mrowGo("sliders", "Settings", "go('v-settings')")}
      ${mrowGo("logout", "Logout", "logout()")}
    </div>`;
};

function goSaleEstimates() { SALE_TAB = "estimates"; go("v-sale"); }
function goCustomers() { KHATA_TYPE = "customer"; go("v-khata"); }
function goSuppliers() { KHATA_TYPE = "supplier"; go("v-khata"); }

/* ================= VISITING CARD ================= */
RENDER["v-card"] = async () => {
  const v = $("v-card");
  const s = window.SHOP || {};
  const url = `${location.origin}/card/${s.id || ""}`;
  v.innerHTML = `
  <div class="card" style="overflow:hidden;padding:0">
    <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;padding:32px 20px;text-align:center">
      <h2 style="margin:0 0 4px">${esc(s.name || "")}</h2>
      <div style="opacity:.9;font-size:13px">${esc(s.receipt_header || "")}</div>
    </div>
    <div style="padding:16px 20px">
      <div class="kv"><span>Phone</span><b>${esc(s.phone || "—")}</b></div>
      <div class="kv"><span>Address</span><b>${esc([s.address, s.city].filter(Boolean).join(", ") || "—")}</b></div>
    </div>
  </div>
  <div class="card"><h3>Share Your Card</h3>
    <div style="color:#6b7280;font-size:12px;margin-bottom:8px">Anyone with this link can open your card — no login needed.</div>
    <div class="row"><input id="card-url" class="grow" readonly value="${esc(url)}" style="font-size:12px">
    <button class="btn sm primary" onclick="copyCardLink()">Copy</button></div>
    <button class="btn amber block" onclick="shareCardWhatsApp()">Share on WhatsApp</button>
    <button class="btn ghost block" onclick="window.open('${esc(url)}','_blank')">Open Card</button>
  </div>
  <button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
};

function copyCardLink() {
  const i = $("card-url");
  i.select();
  try { document.execCommand("copy"); } catch (e) {}
  if (navigator.clipboard) navigator.clipboard.writeText(i.value).catch(() => {});
  toast("Link copied");
}

function shareCardWhatsApp() {
  const s = window.SHOP || {};
  const url = `${location.origin}/card/${s.id || ""}`;
  const txt = `*${s.name || ""}* — Digital Visiting Card\n${url}`;
  window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

/* ================= BARCODE LABEL ================= */
RENDER["v-label"] = async (pid) => {
  const v = $("v-label");
  const p = (window._products || []).find((x) => x.id === pid);
  if (!p) { v.innerHTML = `<div class="card err">Product not found</div>`; return; }
  const code = p.barcode || p.sku || ("KAR-" + p.id);
  v.innerHTML = `
  <div class="card" style="text-align:center" id="label-print">
    <h3 style="margin-bottom:2px">${esc(p.name)}</h3>
    <div style="font-size:22px;font-weight:800;color:var(--blue-dark)">Rs ${p.sale_price}</div>
    <img src="/api/products/${p.id}/barcode.png?token=${TOKEN}" alt="barcode" style="max-width:100%;margin:10px 0" oncontextmenu="return false">
    <div style="font-family:monospace;letter-spacing:2px">${esc(code)}</div>
  </div>
  <div class="no-print">
    <label class="f">Copies</label>
    <input type="number" id="label-copies" min="1" value="12" style="max-width:100px">
    <button class="btn primary block" onclick="window.print()">Print Labels</button>
    <button class="btn ghost block" onclick="go('v-items')">← Items</button>
  </div>
  <style>@media print { body * { visibility: hidden; } #label-print, #label-print * { visibility: visible; } #label-print { position: absolute; top: 0; left: 0; width: 100%; } }</style>`;
};
RENDER["v-staff"] = async () => {
  const v = $("v-staff");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const list = await api("/staff");
    v.innerHTML = `
    <div class="card"><h3>Staff</h3>
      <div style="color:#6b7280;font-size:12px;margin-bottom:8px">Cashier can create bills. Viewer can only see. Only you (owner) can manage staff.</div>
      ${list.length ? list.map((s) => `
        <div class="list-item">
          <div><div class="t">${esc(s.name)}</div><div class="s">${esc(s.phone)} · ${s.role === "cashier" ? "Cashier" : "Viewer"} · ${s.active ? "Active" : "Disabled"}</div></div>
          <div style="display:flex;gap:6px">
            <button class="btn sm ghost" onclick="toggleStaff(${s.id}, ${s.active ? 0 : 1})">${s.active ? "Disable" : "Enable"}</button>
            <button class="btn sm ghost" style="color:#dc2626" onclick="delStaff(${s.id})">Remove</button>
          </div>
        </div>`).join("") : `<div class="empty">No staff yet.</div>`}
    </div>
    <div class="card"><h3>Add Staff</h3>
      <label class="f">Name</label><input id="sf-name" placeholder="Staff name">
      <label class="f">Mobile Number (login ID)</label><input id="sf-phone" inputmode="tel" placeholder="03xxxxxxxxx">
      <label class="f">Password</label><input id="sf-pass" type="password" placeholder="At least 4 characters">
      <label class="f">Role</label>
      <select id="sf-role"><option value="cashier">Cashier — can create bills</option><option value="viewer">Viewer — read only</option></select>
      <div class="err" id="sf-err"></div>
      <button class="btn primary block" onclick="addStaff()">Add Staff</button>
    </div>
    <button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

async function addStaff() {
  try {
    await api("/staff", "POST", {name: $("sf-name").value.trim(), phone: $("sf-phone").value.trim(),
      password: $("sf-pass").value, role: $("sf-role").value});
    RENDER["v-staff"]();
  } catch (e) { $("sf-err").textContent = e.message; }
}

async function toggleStaff(id, active) {
  try { await api("/staff/" + id, "PUT", {active}); RENDER["v-staff"](); }
  catch (e) { alert(e.message); }
}

async function delStaff(id) {
  if (!confirm("Remove this staff member? Their login will stop working.")) return;
  try { await api("/staff/" + id, "DELETE"); RENDER["v-staff"](); }
  catch (e) { alert(e.message); }
}

/* ================= BULK IMPORT (CSV) ================= */
RENDER["v-import"] = async () => {
  const v = $("v-import");
  v.innerHTML = `
  <div class="card"><h3>Bulk Import — Products</h3>
    <div style="color:#6b7280;font-size:12px;margin-bottom:8px">1. Download the template. 2. Fill rows in Excel. 3. Upload the CSV here.</div>
    <button class="btn ghost block" onclick="downloadTemplate('items')">⬇ Download Products Template</button>
    <label class="f">Upload filled CSV</label>
    <input type="file" id="imp-items-file" accept=".csv">
    <div class="err" id="imp-items-err"></div>
    <button class="btn primary block" onclick="uploadImport('items')">Upload Products</button>
    <div id="imp-items-res"></div>
  </div>
  <div class="card"><h3>Bulk Import — Parties</h3>
    <div style="color:#6b7280;font-size:12px;margin-bottom:8px">Customers &amp; suppliers. Column "type" must be customer or supplier.</div>
    <button class="btn ghost block" onclick="downloadTemplate('parties')">⬇ Download Parties Template</button>
    <label class="f">Upload filled CSV</label>
    <input type="file" id="imp-parties-file" accept=".csv">
    <div class="err" id="imp-parties-err"></div>
    <button class="btn primary block" onclick="uploadImport('parties')">Upload Parties</button>
    <div id="imp-parties-res"></div>
  </div>
  <button class="btn ghost block" onclick="go('v-menu')">← Back</button>`;
};

async function downloadTemplate(kind) {
  try {
    const r = await fetch(`/api/import/template?kind=${kind}`, {headers: authHeaders()});
    if (!r.ok) throw new Error("Download failed");
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `karobar_${kind}_template.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { toast(e.message); }
}

async function uploadImport(kind) {
  const fi = $(`imp-${kind}-file`);
  const errEl = $(`imp-${kind}-err`);
  const resEl = $(`imp-${kind}-res`);
  errEl.textContent = "";
  if (!fi.files.length) { errEl.textContent = "Choose a CSV file first"; return; }
  const fd = new FormData();
  fd.append("file", fi.files[0]);
  try {
    const r = await fetch(`/api/import/${kind}`, {method: "POST", headers: authHeaders(), body: fd});
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || "Upload failed");
    resEl.innerHTML = `<div class="card" style="background:#f0fdf4">
      <b style="color:#15803d">${d.added} added</b>${d.skipped ? `, <b style="color:#b45309">${d.skipped} skipped</b>` : ""}
      ${d.errors && d.errors.length ? `<div style="margin-top:6px;font-size:12px">` + d.errors.map((e) => `Row ${e.row}: ${esc(e.error)}`).join("<br>") + `</div>` : ""}
    </div>`;
  } catch (e) { errEl.textContent = e.message; }
}

/* ================= SALE INVOICE (Vyapar mobile) ================= */
let SALE = null;

async function newSale() {
  try {
    const [products, parties] = await Promise.all([api("/products"), api("/parties?type=customer")]);
    SALE = {mode: "credit", party_id: null, party_name: "", items: [], date: todayISO(), products, parties};
    go("v-sale-new");
  } catch (e) { toast(e.message); }
}

function saleTotal() { return (SALE.items || []).reduce((s, it) => s + it.qty * it.price, 0); }
function saleDelItem(i) { SALE.items.splice(i, 1); RENDER["v-sale-new"](); }
function saleCust(v) {
  SALE.party_name = v.trim();
  const p = (SALE.parties || []).find((x) => x.name.toLowerCase() === SALE.party_name.toLowerCase());
  SALE.party_id = p ? p.id : null;
}

RENDER["v-sale-new"] = async () => {
  const v = $("v-sale-new");
  if (!SALE) { newSale(); return; }
  v.classList.add("paddedsave");
  const total = saleTotal();
  const itemsHtml = SALE.items.length ? SALE.items.map((it, i) => `
    <div class="kv"><span>${esc(it.product_name)}<br><span style="color:#8a93a6;font-size:12px">${it.qty} × ${rs(it.price)}</span></span>
    <span style="display:flex;align-items:center;gap:8px"><b>${rs(it.qty * it.price)}</b><button onclick="saleDelItem(${i})" style="border:0;background:none;color:#e63956;font-size:16px;cursor:pointer">✕</button></span></div>`).join("")
    : `<div class="empty" style="padding:12px">No items added yet</div>`;
  v.innerHTML = `
    <div class="shead">
      <button class="back" onclick="go('v-home')">${ic("back", 24)}</button>
      <h2>Sale</h2>
      <div class="cc-toggle">
        <button class="${SALE.mode === "credit" ? "on" : ""}" onclick="SALE.mode='credit';RENDER['v-sale-new']()">Credit</button>
        <button class="${SALE.mode === "cash" ? "on" : ""}" onclick="SALE.mode='cash';RENDER['v-sale-new']()">Cash</button>
      </div>
      <button class="gear" onclick="go('v-settings')">${ic("gear", 24)}</button>
    </div>
    <div style="height:12px"></div>
    <div class="invrow">
      <div class="cell"><div class="lab">Invoice No.</div><div class="val">Auto</div></div>
      <div class="cell"><div class="lab">Date</div><input type="date" id="sale-date" value="${SALE.date}" onchange="SALE.date=this.value;RENDER['v-sale-new']()" style="border:0;background:none;font-size:16px;padding:2px 0;color:#2b3445"></div>
    </div>
    <div style="height:14px"></div>
    <input class="finput" id="sale-cust" list="sale-cust-list" placeholder="Customer *" value="${esc(SALE.party_name)}" onchange="saleCust(this.value)" autocomplete="off">
    <datalist id="sale-cust-list">${(SALE.parties || []).map((p) => `<option value="${esc(p.name)}">`).join("")}</datalist>
    <div style="height:12px"></div>
    ${itemsHtml}
    <div style="height:12px"></div>
    <button class="additems" onclick="go('v-add-items')"><span class="pcirc">${ic("plus", 16)}</span> Add Items <span class="opt">(Optional)</span></button>
    <div class="totalrow"><span>Total Amount</span><span class="rs">Rs ${Number(total).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
    <div class="savebar">
      <button class="sn" onclick="saveSale(true)">Save &amp; New</button>
      <button class="sv" onclick="saveSale(false)">Save</button>
      <button class="dots" onclick="toast('More options coming soon')">${ic("dotsV", 22)}</button>
    </div>`;
};

async function saveSale(andNew) {
  if (!SALE.items.length) { toast("Add an item first"); return; }
  const total = saleTotal();
  try {
    const items = [];
    for (const it of SALE.items) {
      let pid = it.product_id;
      if (!pid) {
        const np = await api("/products", "POST", {name: it.product_name, sku: "", purchase_price: it.price, sale_price: it.price, stock_qty: 0, low_stock_level: 0, unit: it.unit || "pcs", barcode: "", expiry_date: "", category: ""});
        pid = np.id;
      }
      items.push({product_id: pid, qty: it.qty, price: it.price});
    }
    const b = await api("/bills", "POST", {
      party_id: SALE.party_id, party_name: SALE.party_name,
      items, discount: 0,
      paid: SALE.mode === "cash" ? total : 0, mode: "cash", date: SALE.date,
    });
    if (andNew) newSale(); else go("v-bill-detail", b.id);
  } catch (e) { toast(e.message); }
}

/* ================= ADD ITEMS TO SALE ================= */
RENDER["v-add-items"] = async () => {
  const v = $("v-add-items");
  if (!SALE) { newSale(); return; }
  v.classList.add("paddedsave");
  v.innerHTML = `
    <div class="shead">
      <button class="back" onclick="go('v-sale-new')">${ic("back", 24)}</button>
      <h2 style="font-size:20px">Add Items to Sale</h2>
      <button class="gear" onclick="go('v-settings')">${ic("gear", 24)}</button>
    </div>
    <div style="height:18px"></div>
    <div class="flabel"><span>Item Name</span>
      <input class="finput" id="ai-name" list="ai-list" placeholder="e.g. Chocolate Cake" autocomplete="off">
      <datalist id="ai-list">${(SALE.products || []).map((p) => `<option value="${esc(p.name)}">`).join("")}</datalist>
    </div>
    <div class="row">
      <div class="flabel grow"><span class="dim">Quantity</span><input class="finput" id="ai-qty" type="number" min="0" step="any" placeholder="Quantity" inputmode="decimal"></div>
      <div class="flabel grow"><span class="dim">Unit</span>
        <select class="finput" id="ai-unit"><option>pcs</option><option>kg</option><option>mtr</option><option>box</option><option>ltr</option><option>ft</option></select></div>
    </div>
    <div class="flabel"><span class="dim">Rate (Price/Unit)</span><input class="finput" id="ai-rate" type="number" min="0" step="any" placeholder="Rate (Price/Unit)" inputmode="decimal"></div>
    <div class="savebar">
      <button class="sn" onclick="addItem(true)">Save &amp; New</button>
      <button class="sv red" onclick="addItem(false)">Save</button>
    </div>`;
  const nm = $("ai-name");
  nm.addEventListener("input", () => {
    const p = (SALE.products || []).find((x) => x.name.toLowerCase() === nm.value.trim().toLowerCase());
    if (p && !$("ai-rate").value) $("ai-rate").value = p.sale_price;
  });
  setTimeout(() => nm.focus(), 300);
};

function addItem(andNew) {
  const name = $("ai-name").value.trim();
  const qty = parseFloat($("ai-qty").value) || 0;
  const rate = parseFloat($("ai-rate").value) || 0;
  if (!name || qty <= 0) { toast("Enter item name and quantity"); return; }
  const p = (SALE.products || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  SALE.items.push({product_id: p ? p.id : null, product_name: name, qty, price: rate, unit: $("ai-unit").value});
  if (andNew) RENDER["v-add-items"](); else go("v-sale-new");
}

/* ================= BOOT ================= */
async function boot() {
  try {
    SHOP = await api("/auth/me");
  } catch (e) {
    $("auth-screen").style.display = "";
    $("app-screen").style.display = "none";
    return;
  }
  $("auth-screen").style.display = "none";
  $("app-screen").style.display = "";
  renderShopHeader();
  go("v-home");
  if (SHOP.passcode_set && !sessionStorage.getItem("karobar_unlocked")) {
    showPasscodeGate();
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/static/sw.js").catch(() => {}));
}
boot();
