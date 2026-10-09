/* Karobar PWA — full rewrite. Frontend only, backend does all accounting.
   Labels 100% English, currency Rs, no GST/tax fields. */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rs = (n) => "Rs " + Number(n || 0).toLocaleString("en-PK", {maximumFractionDigits: 0});
const todayISO = () => new Date().toISOString().slice(0, 10);
const waPhone = (p) => String(p || "").replace(/\D/g, "");

/* ---------- inline SVG line icons (Vyapar-style, no emoji) ---------- */
const _P = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/>',
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
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  x: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
  back: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
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
  location.reload();
}

/* ---------- navigation ---------- */
const RENDER = {};
function go(view, arg) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $("" + view).classList.add("active");
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

/* ---------- side drawer (hamburger) ---------- */
const DRAWER_ITEMS = [
  ["v-home", "home", "Home"],
  ["v-sale", "receipt", "Sale"],
  ["v-kharid", "cart", "Purchases"],
  ["v-stock", "box", "Stock"],
  ["v-khata", "ledger", "Ledger"],
  ["v-challans", "truck", "Delivery Challans"],
  ["v-banks", "bank", "Bank Accounts"],
  ["v-reminders", "bell", "Payment Reminders"],
  ["v-cash", "cash", "Cash Book"],
  ["v-kharchay", "chart", "Expenses"],
  ["v-reports", "chart", "Reports"],
  ["v-settings", "sliders", "Settings"],
];
function buildDrawer() {
  $("drawer-menu").innerHTML = DRAWER_ITEMS.map(([v, icn, t]) =>
    `<div class="menu-item" onclick="closeDrawer();go('${v}')"><span class="ic">${ic(icn)}</span><div class="t">${t}</div></div>`).join("") +
    `<div class="menu-item" onclick="logout()"><span class="ic">${ic("logout")}</span><div class="t">Logout</div></div>`;
}
function openDrawer() { $("drawer").classList.add("open"); $("drawer-bg").classList.add("open"); }
function closeDrawer() { $("drawer").classList.remove("open"); $("drawer-bg").classList.remove("open"); }

/* ================= HOME ================= */
RENDER["v-home"] = async () => {
  const v = $("v-home");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const d = await api("/reports/dashboard");
    const low = d.low_stock.length
      ? d.low_stock.map((p) => `<div class="kv"><span>⚠ ${esc(p.name)}</span><span class="num">${p.stock_qty} ${esc(p.unit || "")}</span></div>`).join("")
      : `<div style="color:#6b7280;font-size:13px">All stock is fine</div>`;
    const recent = (d.recent || []).length
      ? d.recent.map((r) => `<div class="kv"><span>${r.kind === "bill" ? "" : ""} ${esc(r.ref)}${r.name ? " · " + esc(r.name) : ""}</span><span class="num">${rs(r.amount)}</span></div>`).join("")
      : `<div style="color:#6b7280;font-size:13px">No transactions today</div>`;
    v.innerHTML = `
      <div class="quick-actions">
        <button class="btn danger-fill" onclick="quickBill()">+ Add Sale</button>
        <button class="btn blue" onclick="quickPurchase()">+ Add Purchase</button>
      </div>
      <div class="grid2">
        <div class="stat"><span class="arrow" style="color:var(--success)">▼</span><div class="lbl">Total Receivable</div><div class="val green">${rs(d.kul_lena)}</div><div class="lbl">From customers</div></div>
        <div class="stat"><span class="arrow" style="color:var(--danger)">▲</span><div class="lbl">Total Payable</div><div class="val red">${rs(d.kul_dena)}</div><div class="lbl">To suppliers</div></div>
        <div class="stat"><div class="lbl">Today's Sales</div><div class="val primary">${rs(d.aaj_ki_sale)}</div><div class="lbl"> ${niceDate(todayISO())}</div></div>
        <div class="stat"><div class="lbl">Today's Purchases</div><div class="val">${rs(d.aaj_ki_kharid)}</div><div class="lbl">${esc(SHOP ? SHOP.name : "Karobar")}</div></div>
      </div>
      <div style="height:12px"></div>
      <div class="card"><h3>Low Stock</h3>${low}</div>
      <div class="card"><h3>Today's Activity</h3>${recent}</div>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function quickBill() { SALE_TAB = "bills"; go("v-sale"); openDocForm("sale"); }
function quickPurchase() { go("v-kharid"); openDocForm("purchase"); }

/* ================= SALE (Bills | Estimates) ================= */
let SALE_TAB = "bills";
RENDER["v-sale"] = async () => {
  const v = $("v-sale");
  v.innerHTML = `
    <div class="tabs">
      <button class="${SALE_TAB === "bills" ? "active" : ""}" onclick="SALE_TAB='bills';RENDER['v-sale']()"> Bills</button>
      <button class="${SALE_TAB === "estimates" ? "active" : ""}" onclick="SALE_TAB='estimates';RENDER['v-sale']()"> Estimates</button>
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
    } else {
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
    }
  } catch (e) { box.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

/* ---------- generic bill/purchase/estimate form ---------- */
/* mode: sale | purchase | estimate */
let DOC = null;
async function openDocForm(mode) {
  const ptype = mode === "purchase" ? "supplier" : "customer";
  try {
    const [products, parties] = await Promise.all([api("/products"), api("/parties?type=" + ptype)]);
    DOC = {mode, party_id: null, party_name: "", items: [], discount: 0, paid: 0, paymode: "cash",
           products, parties, title: mode === "sale" ? "New Bill" : mode === "purchase" ? "Purchase Bill" : "New Estimate"};
    renderDocForm();
  } catch (e) { modal(`<h3>Error</h3><div class="card err">${esc(e.message)}</div><button class="btn ghost block" onclick="closeModal()">Close</button>`); }
}
function docDefPrice(p) { return DOC.mode === "purchase" ? p.purchase_price : p.sale_price; }
function docPartyWord() { return DOC.mode === "purchase" ? "Supplier" : "Customer"; }
function docLineTotal(it) {
  const p = DOC.products.find((x) => x.id === it.product_id);
  return (it.price ?? (p ? docDefPrice(p) : 0)) * it.qty;
}
function docSubtotal() { return DOC.items.reduce((s, it) => s + docLineTotal(it), 0); }

function renderDocForm() {
  const lines = DOC.items.map((it, i) => {
    const p = DOC.products.find((x) => x.id === it.product_id);
    return `<div class="line">
      <div class="grow"><b>${esc(p ? p.name : "?")}</b><div class="s">stock ${p ? p.stock_qty : "?"}</div></div>
      <input type="number" min="1" value="${it.qty}" onchange="docQty(${i}, this.value)" title="Qty">
      <input type="number" min="0" value="${it.price}" onchange="docPrice(${i}, this.value)" title="Price">
      <button class="icon-btn" onclick="docRemove(${i})"></button>
    </div>
    <div style="text-align:right;font-size:12px;color:#6b7280;margin-bottom:6px">${rs(docLineTotal(it))}</div>`;
  }).join("");
  const sub = docSubtotal();
  const total = Math.max(0, sub - (DOC.discount || 0));
  const baqaya = Math.max(0, total - (DOC.paid || 0));
  const isEst = DOC.mode === "estimate";
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
    <button class="add-items-btn" onclick="togglePicker()">+ Add Items</button>
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

async function docSave(total) {
  if (!DOC.items.length) { $("df-err").textContent = "Add an item first"; return; }
  const isEst = DOC.mode === "estimate";
  const body = {
    party_id: DOC.party_id, party_name: DOC.party_name,
    items: DOC.items.map((i) => ({product_id: i.product_id, qty: i.qty, price: i.price})),
    discount: DOC.discount || 0,
  };
  if (!isEst) { body.paid = Math.min(DOC.paid || 0, total); body.mode = DOC.paymode; }
  try {
    if (DOC.mode === "sale") {
      const b = await api("/bills", "POST", body);
      closeModal(); go("v-bill-detail", b.id);
    } else if (DOC.mode === "purchase") {
      const p = await api("/purchases", "POST", body);
      closeModal(); go("v-kharid-detail", p.id);
    } else {
      const e = await api("/estimates", "POST", body);
      closeModal(); go("v-est-detail", e.id);
    }
  } catch (e) { $("df-err").textContent = e.message; }
}

/* ---------- bill detail ---------- */
function docPaperHTML(shop, ref, date, partyName, items, subtotal, discount, total, paid, baqaya, mode) {
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
    <div class="kv"><span>Bill No</span><b>${esc(ref)}</b></div>
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

function waDocText(shop, ref, date, items, total, paid, baqaya) {
  let txt = `${shop.name}\nBill: ${ref} | ${niceDate(date)}\n----------------\n`;
  items.forEach((it) => { txt += `${it.product_name} x${it.qty} = Rs ${it.total}\n`; });
  txt += `----------------\nTotal: Rs ${total}\n`;
  if (paid !== null) txt += `Paid: Rs ${paid}\n`;
  if (baqaya !== null) txt += `Balance Due: Rs ${baqaya}\n`;
  if (shop.receipt_header) txt += `${shop.receipt_header}`;
  return txt;
}

RENDER["v-bill-detail"] = async (bill_id) => {
  const v = $("v-bill-detail");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const b = await api("/bills/" + bill_id);
    v.innerHTML = docPaperHTML(b.shop, b.bill_no, b.date, b.party_name, b.items, b.subtotal, b.discount, b.total, b.paid, b.baqaya, b.mode) + `
    <div class="no-print">
      <button class="btn primary block" onclick="window.print()"> Print</button>
      <button class="btn amber block" onclick="shareDocWhatsApp('bill')"> Send via WhatsApp</button>
      <button class="btn ghost block" onclick="go('v-sale')">← Sales List</button>
    </div>`;
    window._lastDoc = {kind: "bill", d: b};
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
    v.innerHTML = docPaperHTML(e.shop, e.est_no, e.date, e.party_name, e.items, e.subtotal, e.discount, e.total, null, null, null) + `
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

/* ================= PURCHASES ================= */
RENDER["v-kharid"] = async () => {
  const v = $("v-kharid");
  v.innerHTML = `<div class="card">Loading…</div>`;
  try {
    const list = await api("/purchases");
    v.innerHTML = `<button class="fab" onclick="openDocForm('purchase')">+</button>
      <div class="card"><h3>Purchase Bills</h3></div>` +
      (list.length ? list.map((p) => `
        <div class="list-item" onclick="go('v-kharid-detail', ${p.id})">
          <div><div class="t">${esc(p.bill_no)}${p.party_name ? " — " + esc(p.party_name) : ""}</div>
          <div class="s">${niceDate(p.date)}</div></div>
          <div style="text-align:right"><div class="t">${rs(p.total)}</div>
          ${p.baqaya > 0 ? `<span class="badge warn">Due ${rs(p.baqaya)}</span>` : `<span class="badge ok">Paid</span>`}</div>
        </div>`).join("")
      : `<div class="empty">No purchase bills yet.<br>Tap + to create your first purchase bill.</div>`);
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
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
      <button class="btn primary block" onclick="window.print()"> Print</button>
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
    <div class="err" id="pf-err"></div>
    <button class="btn primary block" onclick="saveProduct(${pid || 0})">Save</button>
    ${p ? `<button class="btn danger block" onclick="deleteProduct(${pid})">Delete</button>` : ""}
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
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
    if (pid) await api("/products/" + pid, "PUT", body);
    else await api("/products", "POST", body);
    closeModal(); RENDER["v-stock"]();
  } catch (e) { $("pf-err").textContent = e.message; }
}

async function deleteProduct(pid) {
  if (!confirm("Are you sure you want to delete?")) return;
  try { await api("/products/" + pid, "DELETE"); closeModal(); RENDER["v-stock"](); }
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
    closeModal(); RENDER["v-stock"]();
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
      <button class="btn ghost block" onclick="go('v-more')">← Back</button>`;
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

/* ================= AUR (menu) ================= */
RENDER["v-more"] = async () => {
  $("v-more").innerHTML = `
    <div class="menu-item" onclick="go('v-khata')"><span class="ic">${ic("ledger")}</span><div class="t">Ledger (Customers / Suppliers)</div></div>
    <div class="menu-item" onclick="go('v-challans')"><span class="ic">${ic("truck")}</span><div class="t">Delivery Challans</div></div>
    <div class="menu-item" onclick="go('v-banks')"><span class="ic">${ic("bank")}</span><div class="t">Bank Accounts</div></div>
    <div class="menu-item" onclick="go('v-reminders')"><span class="ic">${ic("bell")}</span><div class="t">Payment Reminders</div></div>
    <div class="menu-item" onclick="go('v-cash')"><span class="ic">${ic("cash")}</span><div class="t">Cash Book</div></div>
    <div class="menu-item" onclick="go('v-kharchay')"><span class="ic">${ic("chart")}</span><div class="t">Expenses</div></div>
    <div class="menu-item" onclick="go('v-reports')"><span class="ic">${ic("chart")}</span><div class="t">Reports</div></div>
    <div class="menu-item" onclick="go('v-settings')"><span class="ic">${ic("sliders")}</span><div class="t">Settings</div></div>
    <div class="menu-item" onclick="logout()"><span class="ic">${ic("logout")}</span><div class="t">Logout</div></div>
    <div style="text-align:center;color:#9ca3af;font-size:12px;margin-top:20px">Karobar v2.0</div>`;
};

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
      `<button class="btn ghost block" onclick="go('v-more')">← Back</button>`;
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
      <button class="btn primary block" onclick="window.print()"> Print</button>
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
      `<button class="btn ghost block" onclick="go('v-more')">← Back</button>`;
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
      `<button class="btn ghost block" onclick="go('v-more')">← Back</button>`;
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
        <button class="${KHATA_TYPE === "customer" ? "active" : ""}" onclick="KHATA_TYPE='customer';RENDER['v-khata']()"> Customers</button>
        <button class="${KHATA_TYPE === "supplier" ? "active" : ""}" onclick="KHATA_TYPE='supplier';RENDER['v-khata']()"> Suppliers</button>
      </div>
      <div class="card"><div class="kv"><span><b>Total ${KHATA_TYPE === "customer" ? "Receivable" : "Payable"}</b></span><b style="color:${total > 0 ? "#dc2626" : "#16a34a"}">${rs(total)}</b></div></div>` +
      (parties.length ? parties.map((p) => `
        <div class="list-item" onclick="go('v-party', ${p.id})">
          <div><div class="t">${esc(p.name)}</div><div class="s">${esc(p.phone || "")}</div></div>
          <div style="text-align:right"><div class="t" style="color:${p.balance > 0 ? "#dc2626" : "#16a34a"}">${rs(p.balance)}</div></div>
        </div>`).join("")
      : `<div class="empty">No ${KHATA_TYPE === "customer" ? "customers" : "suppliers"} yet.<br>Tap + to add.</div>`) +
      `<button class="btn ghost block" onclick="go('v-more')">← Back</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function openPartyForm() {
  modal(`
    <h3>New ${KHATA_TYPE === "customer" ? "Customer" : "Supplier"}</h3>
    <label class="f">Name *</label><input id="pt-name">
    <label class="f">Mobile Number</label><input id="pt-phone" inputmode="tel">
    <label class="f">Address</label><input id="pt-addr">
    <div class="err" id="pt-err"></div>
    <button class="btn primary block" onclick="saveParty()">Save</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}
async function saveParty() {
  const name = $("pt-name").value.trim();
  if (!name) { $("pt-err").textContent = "Name is required"; return; }
  try {
    await api("/parties", "POST", {name, phone: $("pt-phone").value.trim(), type: KHATA_TYPE, address: $("pt-addr").value.trim()});
    closeModal(); RENDER["v-khata"]();
  } catch (e) { $("pt-err").textContent = e.message; }
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
        <div class="val ${p.balance > 0 ? "red" : "green"}">${rs(p.balance)}</div></div></div>
      <button class="btn primary block" onclick="openPaymentForm('${dir}')">+ Record ${actLbl}</button>
      <div class="row" style="margin-top:8px">
        <button class="btn amber grow" onclick="waReminder()"> WhatsApp Reminder</button>
        <button class="btn ghost grow" onclick="waStatement()"> Send Statement</button>
      </div>
      <div class="card" style="margin-top:12px"><h3>Transaction History</h3>${hist}</div>
      <button class="btn ghost block" onclick="go('v-khata')">← Ledger</button>`;
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
    <button class="btn ghost block" onclick="go('v-more')">← Back</button>`;
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
const REP_TABS = [["sale", " Sale"], ["profit", " Profit"], ["stock", " Stock"], ["outstanding", " Outstanding"], ["daybook", " Day Book"]];
RENDER["v-reports"] = async () => {
  const v = $("v-reports");
  v.innerHTML = `
    <div class="tabs" style="flex-wrap:wrap">
      ${REP_TABS.map((t) => `<button class="${REP_SUB === t[0] ? "active" : ""}" onclick="REP_SUB='${t[0]}';RENDER['v-reports']()">${t[1]}</button>`).join("")}
    </div>
    <div id="rep-out"></div>
    <button class="btn ghost block" onclick="go('v-more')">← Back</button>`;
  loadReportSub();
};
function repRangeHTML() {
  return `<div class="card"><div class="row">
      <div class="grow"><label class="f">From</label><input type="date" id="rep-from" value="${REP_FROM}"></div>
      <div class="grow"><label class="f">To</label><input type="date" id="rep-to" value="${REP_TO}"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn sm ghost" onclick="setRepRange(0)">Aaj</button>
      <button class="btn sm ghost" onclick="setRepRange(7)">7 Din</button>
      <button class="btn sm ghost" onclick="setRepRange(30)">30 Din</button>
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
        <div class="card"><h3>Sales Report</h3>
          <div class="kv"><span>Bills</span><b>${s.total.bills}</b></div>
          <div class="kv"><span>Total Sales</span><b>${rs(s.total.sale)}</b></div>
          <div class="kv"><span>Paid</span><b>${rs(s.total.wasool)}</b></div>
          <div class="kv"><span>Balance Due</span><b>${rs(s.total.baqaya)}</b></div></div>
        ${s.days.length > 1 ? `<div class="card"><h3>Daily Sales</h3><table class="tbl"><tr><th>Date</th><th class="num">Bills</th><th class="num">Sale</th></tr>` +
          s.days.map((d) => `<tr><td>${niceDate(d.date)}</td><td class="num">${d.bills}</td><td class="num">${rs(d.sale)}</td></tr>`).join("") + `</table></div>` : ""}`;
    } else if (REP_SUB === "profit") {
      const p = await api(`/reports/profit?from_date=${REP_FROM}&to_date=${REP_TO}`);
      out.innerHTML = repRangeHTML() + `
        <div class="card"><h3>Profit Report</h3>
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
        <div class="card"><h3>Stock Report</h3>
          <div class="kv"><span>Stock Value (purchase price)</span><b>${rs(r.total_cost_value)}</b></div>
          <div class="kv"><span>Stock Value (sale price)</span><b>${rs(r.total_sale_value)}</b></div>
          <div class="kv"><span>Low Stock Items</span><b style="color:#dc2626">${r.low_count}</b></div></div>
        <div class="card"><h3>Items</h3><div style="overflow-x:auto"><table class="tbl">
          <tr><th>Product</th><th class="num">Stock</th><th class="num">Purchase</th><th class="num">Sale</th><th class="num">Value (cost)</th></tr>
          ${r.items.map((i) => `<tr${i.stock_qty <= i.low_stock_level ? ' style="background:#fef3c7"' : ""}><td>${esc(i.name)}${i.sku ? "<br><span style='font-size:11px;color:#6b7280'>" + esc(i.sku) + "</span>" : ""}</td><td class="num">${i.stock_qty}</td><td class="num">${rs(i.purchase_price)}</td><td class="num">${rs(i.sale_price)}</td><td class="num">${rs(i.stock_value_cost)}</td></tr>`).join("")}
        </table></div></div>`;
    } else if (REP_SUB === "outstanding") {
      const r = await api("/reports/outstanding?type=" + OUT_TYPE);
      out.innerHTML = `
        <div class="tabs">
          <button class="${OUT_TYPE === "customer" ? "active" : ""}" onclick="OUT_TYPE='customer';loadReportSub()">Customers</button>
          <button class="${OUT_TYPE === "supplier" ? "active" : ""}" onclick="OUT_TYPE='supplier';loadReportSub()">Supplier</button>
        </div>
        <div class="card"><div class="kv"><span><b>Total ${OUT_TYPE === "customer" ? "Receivable" : "Payable"}</b></span><b style="color:#dc2626">${rs(r.total)}</b></div></div>
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
        <div class="kv" style="margin-top:8px"><span><b>Total Entries</b></span><b>${r.count}</b></div></div>
        ${(r.items || []).length ? r.items.map((i) => `
          <div class="list-item" style="cursor:default">
            <div><div class="t">${esc(i.ref || i.kind)}</div><div class="s">${esc(i.tafseel || "")}</div></div>
            <div class="t">${rs(i.amount)}</div>
          </div>`).join("") : `<div class="empty">No entries on this date</div>`}`;
    }
  } catch (e) { out.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}

/* ================= SETTINGS ================= */
RENDER["v-settings"] = async () => {
  const v = $("v-settings");
  try {
    const s = await api("/auth/me");
    v.innerHTML = `
      <div class="card"><h3>Shop Settings</h3>
        <label class="f">Shop Name</label><input id="st-name" value="${esc(s.name)}">
        <label class="f">Address</label><input id="st-addr" value="${esc(s.address || "")}">
        <label class="f">Phone</label><input id="st-phone" value="${esc(s.phone)}">
        <label class="f">Receipt Header Text</label><input id="st-head" value="${esc(s.receipt_header || "")}" placeholder="E.g. Thank you!">
        <div class="err" id="st-err"></div>
        <button class="btn primary block" onclick="saveSettings()">Save</button></div>
      <button class="btn ghost block" onclick="go('v-more')">← Back</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};
async function saveSettings() {
  try {
    await api("/settings", "PUT", {name: $("st-name").value.trim(), address: $("st-addr").value.trim(),
      phone: $("st-phone").value.trim(), receipt_header: $("st-head").value.trim()});
    SHOP = await api("/auth/me");
    $("drawer-shop").textContent = SHOP.name;
    $("st-err").textContent = "Saved";
    setTimeout(() => { $("st-err").textContent = ""; }, 2000);
  } catch (e) { $("st-err").textContent = e.message; }
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
  $("drawer-shop").textContent = SHOP.name;
  buildDrawer();
  go("v-home");
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/static/sw.js").catch(() => {}));
}
boot();
