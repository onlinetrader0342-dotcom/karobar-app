/* Karobar PWA — full rewrite. Sirf frontend, sab hisab backend karta hai.
   Labels 100% Roman Urdu, currency Rs, koi GST/tax field nahi. */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rs = (n) => "Rs " + Number(n || 0).toLocaleString("en-PK", {maximumFractionDigits: 0});
const todayISO = () => new Date().toISOString().slice(0, 10);
const waPhone = (p) => String(p || "").replace(/\D/g, "");

const DAYS_UR = ["Itwaar", "Peer", "Mangal", "Budh", "Jumeiraat", "Jumma", "Hafta"];
const MONTHS_UR = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function niceDate(iso) {
  if (!iso) return "";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return String(iso);
  return DAYS_UR[d.getDay()] + ", " + d.getDate() + " " + MONTHS_UR[d.getMonth()] + " " + d.getFullYear();
}
const MODES = [["cash", "Cash"], ["bank", "Bank"], ["online", "Online (JazzCash/Easypaisa)"]];
function modeLabel(m) { const f = MODES.find((x) => x[0] === m); return f ? f[1] : (m || ""); }

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
    if (!r.ok) throw new Error(d.detail || "Login nakaam");
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

function modal(html) {
  $("modal-root").innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;
}
function closeModal() { $("modal-root").innerHTML = ""; }

/* ================= HOME ================= */
RENDER["v-home"] = async () => {
  const v = $("v-home");
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const d = await api("/reports/dashboard");
    const low = d.low_stock.length
      ? d.low_stock.map((p) => `<div class="kv"><span>⚠️ ${esc(p.name)}</span><span class="num">${p.stock_qty} ${esc(p.unit || "")}</span></div>`).join("")
      : `<div style="color:#6b7280;font-size:13px">Sab stock theek hai 👍</div>`;
    const recent = (d.recent || []).length
      ? d.recent.map((r) => `<div class="kv"><span>${r.kind === "bill" ? "🧾" : "🛒"} ${esc(r.ref)}${r.name ? " · " + esc(r.name) : ""}</span><span class="num">${rs(r.amount)}</span></div>`).join("")
      : `<div style="color:#6b7280;font-size:13px">Aaj koi len-den nahi</div>`;
    v.innerHTML = `
      <div class="card" style="background:var(--teal);color:#fff">
        <div style="font-size:13px;opacity:.9">📅 ${niceDate(todayISO())}</div>
        <div style="font-size:20px;font-weight:800;margin-top:4px">${esc(SHOP ? SHOP.name : "Karobar")}</div>
      </div>
      <div class="grid2">
        <div class="stat"><div class="lbl">Aaj ki Sale</div><div class="val teal">${rs(d.aaj_ki_sale)}</div></div>
        <div class="stat"><div class="lbl">Aaj ki Kharid</div><div class="val">${rs(d.aaj_ki_kharid)}</div></div>
        <div class="stat"><div class="lbl">Gahakon se Lena hai</div><div class="val green">${rs(d.kul_lena)}</div></div>
        <div class="stat"><div class="lbl">Supplier ko Dena hai</div><div class="val red">${rs(d.kul_dena)}</div></div>
      </div>
      <div style="height:12px"></div>
      <div class="quick-row">
        <button class="quick" onclick="quickBill()"><span class="ic">🧾</span>+ Naya Bill</button>
        <button class="quick" onclick="quickPurchase()"><span class="ic">🛒</span>+ Kharid Bill</button>
        <button class="quick" onclick="openQuickPayment()"><span class="ic">💰</span>Wasooli</button>
        <button class="quick" onclick="openCashForm('out')"><span class="ic">💸</span>Kharcha</button>
      </div>
      <div class="card"><h3>⚠️ Low Stock</h3>${low}</div>
      <div class="card"><h3>🕘 Aaj ki Activity</h3>${recent}</div>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function quickBill() { SALE_TAB = "bills"; go("v-sale"); openDocForm("sale"); }
function quickPurchase() { go("v-kharid"); openDocForm("purchase"); }

/* ================= SALE (Bills | Andazay) ================= */
let SALE_TAB = "bills";
RENDER["v-sale"] = async () => {
  const v = $("v-sale");
  v.innerHTML = `
    <div class="tabs">
      <button class="${SALE_TAB === "bills" ? "active" : ""}" onclick="SALE_TAB='bills';RENDER['v-sale']()">🧾 Bills</button>
      <button class="${SALE_TAB === "estimates" ? "active" : ""}" onclick="SALE_TAB='estimates';RENDER['v-sale']()">📝 Andazay</button>
    </div>
    <div id="sale-list"><div class="card">Load ho raha hai…</div></div>`;
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
            ${b.baqaya > 0 ? `<span class="badge warn">Baqaya ${rs(b.baqaya)}</span>` : `<span class="badge ok">Wasool</span>`}</div>
          </div>`).join("")
        : `<div class="empty">Abhi koi bill nahi.<br>+ dabakar pehla bill banao.</div>`);
    } else {
      const ests = await api("/estimates");
      box.innerHTML = `<button class="fab" onclick="openDocForm('estimate')">+</button>` +
        (ests.length ? ests.map((e) => `
          <div class="list-item" onclick="go('v-est-detail', ${e.id})">
            <div><div class="t">${esc(e.est_no)}${e.party_name ? " — " + esc(e.party_name) : ""}</div>
            <div class="s">${niceDate(e.date)}</div></div>
            <div style="text-align:right"><div class="t">${rs(e.total)}</div>
            <span class="badge ${e.status === "open" ? "info" : "ok"}">${e.status === "open" ? "Khula" : esc(e.status)}</span></div>
          </div>`).join("")
        : `<div class="empty">Abhi koi andaza nahi.<br>+ dabakar pehla andaza banao.</div>`);
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
           products, parties, title: mode === "sale" ? "🧾 Naya Bill" : mode === "purchase" ? "🛒 Kharid Bill" : "📝 Naya Andaza"};
    renderDocForm();
  } catch (e) { modal(`<h3>Error</h3><div class="card err">${esc(e.message)}</div><button class="btn ghost block" onclick="closeModal()">Band Karo</button>`); }
}
function docDefPrice(p) { return DOC.mode === "purchase" ? p.purchase_price : p.sale_price; }
function docPartyWord() { return DOC.mode === "purchase" ? "Supplier" : "Gahak"; }
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
      <input type="number" min="1" value="${it.qty}" onchange="docQty(${i}, this.value)" title="Miqdar">
      <input type="number" min="0" value="${it.price}" onchange="docPrice(${i}, this.value)" title="Qeemat">
      <button class="icon-btn" onclick="docRemove(${i})">✕</button>
    </div>
    <div style="text-align:right;font-size:12px;color:#6b7280;margin-bottom:6px">${rs(docLineTotal(it))}</div>`;
  }).join("");
  const sub = docSubtotal();
  const total = Math.max(0, sub - (DOC.discount || 0));
  const baqaya = Math.max(0, total - (DOC.paid || 0));
  const isEst = DOC.mode === "estimate";
  modal(`
    <h3>${DOC.title}</h3>
    <label class="f">${docPartyWord()} (khali = walk-in)</label>
    <select id="df-party" onchange="docPartyChange(this.value)">
      <option value="">— Walk-in —</option>
      ${DOC.parties.map((p) => `<option value="${p.id}" ${DOC.party_id == p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
    </select>
    <div class="row" style="margin-top:8px">
      <input id="df-newparty" class="grow" placeholder="Naye ${docPartyWord().toLowerCase()} ka naam">
      <button class="btn sm ghost" onclick="docAddParty()">+ Jorain</button>
    </div>
    <div class="divider"></div>
    <label class="f">Product jorain</label>
    <div class="row">
      <select id="df-product" class="grow">
        ${DOC.products.map((p) => `<option value="${p.id}">${esc(p.name)} — ${rs(docDefPrice(p))} (stock ${p.stock_qty})</option>`).join("")}
      </select>
    </div>
    <div class="row" style="margin-top:8px">
      <input id="df-qty" class="grow" type="number" min="1" value="1" placeholder="Miqdar">
      <button class="btn sm primary" onclick="docAddItem()">+ Jorain</button>
    </div>
    <div class="divider"></div>
    ${lines || `<div style="color:#6b7280;font-size:13px">Abhi koi item nahi</div>`}
    <div class="divider"></div>
    <div class="kv"><span>Subtotal</span><b>${rs(sub)}</b></div>
    <div class="row"><label class="f grow">Discount (Rs)</label>
      <input type="number" min="0" value="${DOC.discount}" style="width:120px" onchange="DOC.discount=+this.value||0;renderDocForm()"></div>
    <div class="kv"><span><b>Kul Total</b></span><b>${rs(total)}</b></div>
    ${isEst ? "" : `
    <div class="row"><label class="f grow">Wasool shuda (Rs)</label>
      <input type="number" min="0" value="${DOC.paid}" style="width:120px" onchange="DOC.paid=+this.value||0;renderDocForm()"></div>
    <div class="kv"><span>Baqaya</span><b style="color:${baqaya > 0 ? "#dc2626" : "#16a34a"}">${rs(baqaya)}</b></div>
    <div class="row"><label class="f grow">Zariya</label>
      <select id="df-mode" style="width:170px" onchange="DOC.paymode=this.value">
        ${MODES.map((m) => `<option value="${m[0]}" ${DOC.paymode === m[0] ? "selected" : ""}>${m[1]}</option>`).join("")}
      </select></div>`}
    <div class="err" id="df-err"></div>
    <button class="btn primary block" onclick="docSave(${total})">Save Karo</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
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
  if (!DOC.items.length) { $("df-err").textContent = "Pehle koi item jorain"; return; }
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
    <div class="kv"><span>Tareekh</span><b>${niceDate(date)}</b></div>
    ${partyName ? `<div class="kv"><span>Gahak</span><b>${esc(partyName)}</b></div>` : ""}
    ${mode ? `<div class="kv"><span>Zariya</span><b>${esc(modeLabel(mode))}</b></div>` : ""}
    <div class="divider"></div>
    <table class="tbl"><tr><th>Item</th><th class="num">Raqam</th></tr>${rows}</table>
    <div class="divider"></div>
    <div class="kv"><span>Subtotal</span><span>${rs(subtotal)}</span></div>
    ${discount ? `<div class="kv"><span>Discount</span><span>− ${rs(discount)}</span></div>` : ""}
    <div class="kv"><span><b>Kul Total</b></span><b>${rs(total)}</b></div>
    ${paid !== null ? `<div class="kv"><span>Wasool shuda</span><span>${rs(paid)}</span></div>` : ""}
    ${baqaya !== null ? `<div class="kv"><span><b>Baqaya</b></span><b style="color:${baqaya > 0 ? "#dc2626" : "#16a34a"}">${rs(baqaya)}</b></div>` : ""}
  </div>`;
}

function waDocText(shop, ref, date, items, total, paid, baqaya) {
  let txt = `${shop.name}\nBill: ${ref} | ${niceDate(date)}\n----------------\n`;
  items.forEach((it) => { txt += `${it.product_name} x${it.qty} = Rs ${it.total}\n`; });
  txt += `----------------\nKul: Rs ${total}\n`;
  if (paid !== null) txt += `Wasool: Rs ${paid}\n`;
  if (baqaya !== null) txt += `Baqaya: Rs ${baqaya}\n`;
  if (shop.receipt_header) txt += `${shop.receipt_header}`;
  return txt;
}

RENDER["v-bill-detail"] = async (bill_id) => {
  const v = $("v-bill-detail");
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const b = await api("/bills/" + bill_id);
    v.innerHTML = docPaperHTML(b.shop, b.bill_no, b.date, b.party_name, b.items, b.subtotal, b.discount, b.total, b.paid, b.baqaya, b.mode) + `
    <div class="no-print">
      <button class="btn primary block" onclick="window.print()">🖨️ Print Karo</button>
      <button class="btn amber block" onclick="shareDocWhatsApp('bill')">📲 WhatsApp par Bhejo</button>
      <button class="btn ghost block" onclick="go('v-sale')">← Sale ki List</button>
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
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const e = await api("/estimates/" + est_id);
    v.innerHTML = docPaperHTML(e.shop, e.est_no, e.date, e.party_name, e.items, e.subtotal, e.discount, e.total, null, null, null) + `
    <div class="no-print">
      <div class="kv" style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px"><span>Status</span><b>${e.status === "open" ? "📝 Khula hai" : esc(e.status)}</b></div>
      ${e.status === "open" ? `<button class="btn primary block" onclick="convertEstimate(${e.id})">✅ Bill me Badlo</button>` : ""}
      <button class="btn amber block" onclick="shareDocWhatsApp('est')">📲 WhatsApp par Bhejo</button>
      <button class="btn ghost block" onclick="SALE_TAB='estimates';go('v-sale')">← Andazon ki List</button>
    </div>`;
    window._lastDoc = {kind: "est", d: e};
  } catch (e2) { v.innerHTML = `<div class="card err">${esc(e2.message)}</div>`; }
};

async function convertEstimate(est_id) {
  if (!confirm("Andaza pakka bill ban jaye ga, stock bhi kam hoga. Aage barhain?")) return;
  try {
    const b = await api("/estimates/" + est_id + "/convert", "POST");
    SALE_TAB = "bills";
    go("v-bill-detail", b.id);
  } catch (e) { alert(e.message); }
}

/* ================= KHARID ================= */
RENDER["v-kharid"] = async () => {
  const v = $("v-kharid");
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const list = await api("/purchases");
    v.innerHTML = `<button class="fab" onclick="openDocForm('purchase')">+</button>
      <div class="card"><h3>🛒 Kharid Bills</h3></div>` +
      (list.length ? list.map((p) => `
        <div class="list-item" onclick="go('v-kharid-detail', ${p.id})">
          <div><div class="t">${esc(p.bill_no)}${p.party_name ? " — " + esc(p.party_name) : ""}</div>
          <div class="s">${niceDate(p.date)}</div></div>
          <div style="text-align:right"><div class="t">${rs(p.total)}</div>
          ${p.baqaya > 0 ? `<span class="badge warn">Baqaya ${rs(p.baqaya)}</span>` : `<span class="badge ok">Ada</span>`}</div>
        </div>`).join("")
      : `<div class="empty">Abhi koi kharid bill nahi.<br>+ dabakar pehla kharid bill banao.</div>`);
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

RENDER["v-kharid-detail"] = async (pid) => {
  const v = $("v-kharid-detail");
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
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
      <div class="kv"><span>Kharid Bill No</span><b>${esc(p.bill_no)}</b></div>
      <div class="kv"><span>Tareekh</span><b>${niceDate(p.date)}</b></div>
      ${p.party_name ? `<div class="kv"><span>Supplier</span><b>${esc(p.party_name)}</b></div>` : ""}
      ${p.mode ? `<div class="kv"><span>Zariya</span><b>${esc(modeLabel(p.mode))}</b></div>` : ""}
      <div class="divider"></div>
      <table class="tbl"><tr><th>Item</th><th class="num">Raqam</th></tr>${rows}</table>
      <div class="divider"></div>
      <div class="kv"><span>Subtotal</span><span>${rs(p.subtotal)}</span></div>
      ${p.discount ? `<div class="kv"><span>Discount</span><span>− ${rs(p.discount)}</span></div>` : ""}
      <div class="kv"><span><b>Kul Total</b></span><b>${rs(p.total)}</b></div>
      <div class="kv"><span>Ada shuda</span><span>${rs(p.paid)}</span></div>
      <div class="kv"><span><b>Baqaya</b></span><b style="color:${p.baqaya > 0 ? "#dc2626" : "#16a34a"}">${rs(p.baqaya)}</b></div>
    </div>
    <div class="no-print">
      <button class="btn primary block" onclick="window.print()">🖨️ Print Karo</button>
      <button class="btn ghost block" onclick="go('v-kharid')">← Kharid ki List</button>
    </div>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

/* ================= STOCK ================= */
RENDER["v-stock"] = async () => {
  const v = $("v-stock");
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    window._products = await api("/products");
    v.innerHTML = `<button class="fab" onclick="openProductForm()">+</button>
      <div class="card"><input id="stock-q" placeholder="🔍 Product talash karo…" oninput="renderStockList(this.value)"></div>
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
        <div class="s">Kharid ${rs(p.purchase_price)} · Farokht ${rs(p.sale_price)}${p.barcode ? " · 🔖 " + esc(p.barcode) : ""}${p.expiry_date ? " · ⏳ " + esc(p.expiry_date) : ""}</div>
      </div>
      <div style="text-align:right">
        <div style="margin-bottom:6px">${low ? `<span class="badge warn">⚠️ ${p.stock_qty}</span>` : `<span class="badge ok">${p.stock_qty} ${esc(p.unit || "")}</span>`}</div>
        <button class="btn sm ghost" onclick="openAdjustForm(${p.id})">⚖️ Adjust</button>
      </div>
    </div>`;
  }).join("") : `<div class="empty">Koi product nahi mila</div>`;
}

function openProductForm(pid) {
  const p = pid ? (window._products || []).find((x) => x.id === pid) : null;
  modal(`
    <h3>${p ? "✏️ Product Edit Karo" : "➕ Naya Product"}</h3>
    <label class="f">Product ka Naam *</label><input id="pf-name" value="${esc(p?.name || "")}">
    <div class="grid2">
      <div><label class="f">SKU / Code</label><input id="pf-sku" value="${esc(p?.sku || "")}"></div>
      <div><label class="f">Barcode</label><input id="pf-barcode" value="${esc(p?.barcode || "")}"></div>
      <div><label class="f">Category</label><input id="pf-cat" value="${esc(p?.category || "")}" placeholder="Masalan: LED"></div>
      <div><label class="f">Expiry Date</label><input id="pf-exp" type="date" value="${esc(p?.expiry_date || "")}"></div>
      <div><label class="f">Kharid Qeemat (Rs)</label><input id="pf-pp" type="number" min="0" value="${p?.purchase_price ?? 0}"></div>
      <div><label class="f">Farokht Qeemat (Rs)</label><input id="pf-sp" type="number" min="0" value="${p?.sale_price ?? 0}"></div>
      <div><label class="f">Stock Miqdar</label><input id="pf-qty" type="number" value="${p?.stock_qty ?? 0}"></div>
      <div><label class="f">Low-stock Alert</label><input id="pf-low" type="number" min="0" value="${p?.low_stock_level ?? 5}"></div>
    </div>
    <label class="f">Unit</label><input id="pf-unit" value="${esc(p?.unit || "naq")}">
    <div class="err" id="pf-err"></div>
    <button class="btn primary block" onclick="saveProduct(${pid || 0})">Save Karo</button>
    ${p ? `<button class="btn danger block" onclick="deleteProduct(${pid})">Delete Karo</button>` : ""}
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
    unit: $("pf-unit").value.trim() || "naq",
  };
  if (!body.name) { $("pf-err").textContent = "Naam zaroori hai"; return; }
  try {
    if (pid) await api("/products/" + pid, "PUT", body);
    else await api("/products", "POST", body);
    closeModal(); RENDER["v-stock"]();
  } catch (e) { $("pf-err").textContent = e.message; }
}

async function deleteProduct(pid) {
  if (!confirm("Kya waqai delete karna hai?")) return;
  try { await api("/products/" + pid, "DELETE"); closeModal(); RENDER["v-stock"](); }
  catch (e) { $("pf-err").textContent = e.message; }
}

function openAdjustForm(pid) {
  const p = (window._products || []).find((x) => x.id === pid);
  if (!p) return;
  modal(`
    <h3>⚖️ Stock Adjust — ${esc(p.name)}</h3>
    <div class="card"><div class="kv"><span>Maujooda Stock</span><b>${p.stock_qty} ${esc(p.unit || "")}</b></div></div>
    <label class="f">Miqdar me Tabdeeli (+ jorna / − kam karna)</label>
    <input id="ad-qty" type="number" placeholder="Masalan: 10 ya -5">
    <label class="f">Wajah / Note</label>
    <input id="ad-note" placeholder="Masalan: toot gaya / recount">
    <div class="err" id="ad-err"></div>
    <button class="btn primary block" onclick="saveAdjust(${pid})">Adjust Karo</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}
async function saveAdjust(pid) {
  const qty = +$("ad-qty").value;
  if (!qty) { $("ad-err").textContent = "Miqdar likho (+ ya −)"; return; }
  try {
    await api("/products/" + pid + "/adjust", "POST", {qty_change: qty, note: $("ad-note").value.trim()});
    closeModal(); RENDER["v-stock"]();
  } catch (e) { $("ad-err").textContent = e.message; }
}

/* ---------- quick wasooli (home se) ---------- */
async function openQuickPayment() {
  try {
    const parties = await api("/parties?type=customer");
    window._qpParties = parties;
    modal(`
      <h3>💰 Wasooli Darj Karo</h3>
      <label class="f">Gahak</label>
      <select id="qp-party">${parties.map((p) => `<option value="${p.id}">${esc(p.name)} — baqaya ${rs(p.balance)}</option>`).join("")}</select>
      <label class="f">Raqam (Rs)</label><input id="qp-amt" type="number" min="1">
      <label class="f">Zariya</label>
      <select id="qp-mode">${MODES.map((m) => `<option value="${m[0]}">${m[1]}</option>`).join("")}</select>
      <label class="f">Note</label><input id="qp-note">
      <div class="err" id="qp-err"></div>
      <button class="btn primary block" onclick="saveQuickPayment()">Save Karo</button>
      <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
  } catch (e) { alert(e.message); }
}
async function saveQuickPayment() {
  const amt = +$("qp-amt").value || 0;
  if (amt <= 0) { $("qp-err").textContent = "Raqam likho"; return; }
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
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const c = await api("/cash?date=" + CASH_DATE);
    v.innerHTML = `
      <div class="card"><div class="row">
        <label class="f grow" style="margin:0">📅 Tareekh</label>
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
          <div><div class="t">${esc(t.note || t.category)}</div><div class="s">${esc(t.category)}</div></div>
          <div class="t" style="color:${t.kind === "in" ? "#16a34a" : "#dc2626"}">${t.kind === "in" ? "+" : "−"} ${rs(t.amount)}</div>
        </div>`).join("") : `<div class="empty">Is tareekh ko koi cash len-den nahi</div>`}
      <button class="btn ghost block" onclick="go('v-more')">← Wapas</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function openCashForm(kind) {
  modal(`
    <h3>${kind === "in" ? "💰 Cash In" : "💸 Cash Out (Kharcha)"}</h3>
    <label class="f">Raqam (Rs)</label><input id="cf-amt" type="number" min="1">
    <label class="f">Category</label>
    <input id="cf-cat" value="${kind === "out" ? "kharcha" : "aamad"}" placeholder="${kind === "out" ? "Masalan: kiraya, bijli" : "Masalan: aamad"}">
    <label class="f">Note</label><input id="cf-note" placeholder="Tafseel likho">
    <div class="err" id="cf-err"></div>
    <button class="btn primary block" onclick="saveCash('${kind}')">Save Karo</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}
async function saveCash(kind) {
  const amt = +$("cf-amt").value || 0;
  if (amt <= 0) { $("cf-err").textContent = "Raqam likho"; return; }
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
    <div class="menu-item" onclick="go('v-khata')"><span class="ic">📒</span><div class="t">Khata (Gahak / Supplier)</div></div>
    <div class="menu-item" onclick="go('v-cash')"><span class="ic">💵</span><div class="t">Cash Book</div></div>
    <div class="menu-item" onclick="go('v-kharchay')"><span class="ic">💸</span><div class="t">Kharchay</div></div>
    <div class="menu-item" onclick="go('v-reports')"><span class="ic">📊</span><div class="t">Reports</div></div>
    <div class="menu-item" onclick="go('v-settings')"><span class="ic">⚙️</span><div class="t">Settings</div></div>
    <div class="menu-item" onclick="logout()"><span class="ic">🚪</span><div class="t">Logout</div></div>
    <div style="text-align:center;color:#9ca3af;font-size:12px;margin-top:20px">Karobar v2.0</div>`;
};

/* ================= KHATA ================= */
let KHATA_TYPE = "customer";
RENDER["v-khata"] = async () => {
  const v = $("v-khata");
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const parties = await api("/parties?type=" + KHATA_TYPE);
    const total = parties.reduce((s, p) => s + (p.balance || 0), 0);
    v.innerHTML = `<button class="fab" onclick="openPartyForm()">+</button>
      <div class="tabs">
        <button class="${KHATA_TYPE === "customer" ? "active" : ""}" onclick="KHATA_TYPE='customer';RENDER['v-khata']()">👥 Gahak</button>
        <button class="${KHATA_TYPE === "supplier" ? "active" : ""}" onclick="KHATA_TYPE='supplier';RENDER['v-khata']()">🏭 Supplier</button>
      </div>
      <div class="card"><div class="kv"><span><b>Kul ${KHATA_TYPE === "customer" ? "Lena hai" : "Dena hai"}</b></span><b style="color:${total > 0 ? "#dc2626" : "#16a34a"}">${rs(total)}</b></div></div>` +
      (parties.length ? parties.map((p) => `
        <div class="list-item" onclick="go('v-party', ${p.id})">
          <div><div class="t">${esc(p.name)}</div><div class="s">${esc(p.phone || "")}</div></div>
          <div style="text-align:right"><div class="t" style="color:${p.balance > 0 ? "#dc2626" : "#16a34a"}">${rs(p.balance)}</div></div>
        </div>`).join("")
      : `<div class="empty">Koi ${KHATA_TYPE === "customer" ? "gahak" : "supplier"} nahi.<br>+ dabakar jorain.</div>`) +
      `<button class="btn ghost block" onclick="go('v-more')">← Wapas</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function openPartyForm() {
  modal(`
    <h3>➕ Naya ${KHATA_TYPE === "customer" ? "Gahak" : "Supplier"}</h3>
    <label class="f">Naam *</label><input id="pt-name">
    <label class="f">Mobile Number</label><input id="pt-phone" inputmode="tel">
    <label class="f">Pata</label><input id="pt-addr">
    <div class="err" id="pt-err"></div>
    <button class="btn primary block" onclick="saveParty()">Save Karo</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}
async function saveParty() {
  const name = $("pt-name").value.trim();
  if (!name) { $("pt-err").textContent = "Naam zaroori hai"; return; }
  try {
    await api("/parties", "POST", {name, phone: $("pt-phone").value.trim(), type: KHATA_TYPE, address: $("pt-addr").value.trim()});
    closeModal(); RENDER["v-khata"]();
  } catch (e) { $("pt-err").textContent = e.message; }
}

RENDER["v-party"] = async (pid) => {
  const v = $("v-party");
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const p = await api("/parties/" + pid);
    window._party = p;
    const isCust = p.type === "customer";
    const actLbl = isCust ? "Wasooli (lena)" : "Adaigi (dena)";
    const dir = isCust ? "lena" : "dena";
    const hist = p.history.length ? p.history.map((h) => h.kind === "bill"
      ? `<div class="kv"><span>🧾 ${esc(h.bill_no)} · ${niceDate(h.date)}</span><span class="num">${rs(h.total)}<br><span style="font-size:11px;color:${h.baqaya > 0 ? "#dc2626" : "#16a34a"}">baqaya ${rs(h.baqaya)}</span></span></div>`
      : `<div class="kv"><span>💰 ${actLbl} · ${niceDate(h.date)}${h.note ? "<br><span style='font-size:11px;color:#6b7280'>" + esc(h.note) + "</span>" : ""}</span><span class="num" style="color:#16a34a">− ${rs(h.amount)}</span></div>`
    ).join("") : `<div class="empty">Koi len-den nahi</div>`;
    v.innerHTML = `
      <div class="card"><h3>${esc(p.name)}</h3>
        <div class="s" style="color:#6b7280">${esc(p.phone || "")}${p.address ? " · " + esc(p.address) : ""}</div>
        <div class="stat" style="margin-top:10px"><div class="lbl">${isCust ? "Gahak se LENA hai" : "Supplier ko DENA hai"}</div>
        <div class="val ${p.balance > 0 ? "red" : "green"}">${rs(p.balance)}</div></div></div>
      <button class="btn primary block" onclick="openPaymentForm('${dir}')">+ ${actLbl} Darj Karo</button>
      <div class="row" style="margin-top:8px">
        <button class="btn amber grow" onclick="waReminder()">📲 WhatsApp Reminder</button>
        <button class="btn ghost grow" onclick="waStatement()">📄 Statement Bhejo</button>
      </div>
      <div class="card" style="margin-top:12px"><h3>Len-den ki History</h3>${hist}</div>
      <button class="btn ghost block" onclick="go('v-khata')">← Khata</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function openPaymentForm(dir) {
  modal(`
    <h3>💰 ${dir === "lena" ? "Wasooli" : "Adaigi"} — ${esc(window._party.name)}</h3>
    <label class="f">Raqam (Rs)</label><input id="pm-amt" type="number" min="1">
    <label class="f">Direction</label>
    <select id="pm-dir">
      <option value="lena" ${dir === "lena" ? "selected" : ""}>Lena (wasooli)</option>
      <option value="dena" ${dir === "dena" ? "selected" : ""}>Dena (adaigi)</option>
    </select>
    <label class="f">Zariya</label>
    <select id="pm-mode">${MODES.map((m) => `<option value="${m[0]}">${m[1]}</option>`).join("")}</select>
    <label class="f">Tareekh</label><input id="pm-date" type="date" value="${todayISO()}">
    <label class="f">Note</label><input id="pm-note">
    <div class="err" id="pm-err"></div>
    <button class="btn primary block" onclick="savePayment()">Save Karo</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}
async function savePayment() {
  const amt = +$("pm-amt").value || 0;
  if (amt <= 0) { $("pm-err").textContent = "Raqam likho"; return; }
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
  const txt = `Assalam-o-Alaikum ${p.name}! ${SHOP ? SHOP.name : "Karobar"} se yaad-dahani: apka baqaya Rs ${Number(p.balance || 0).toLocaleString("en-PK", {maximumFractionDigits: 0})} hai. Shukriya!`;
  const ph = waPhone(p.phone);
  window.open(ph ? `https://wa.me/${ph}?text=${encodeURIComponent(txt)}` : "https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

function waStatement() {
  const p = window._party;
  if (!p) return;
  const isCust = p.type === "customer";
  let txt = `${SHOP ? SHOP.name : "Karobar"}\nKhata Statement — ${p.name}\n----------------\n`;
  p.history.forEach((h) => {
    if (h.kind === "bill") txt += `Bill ${h.bill_no} | ${h.date} | Kul Rs ${h.total} | Baqaya Rs ${h.baqaya}\n`;
    else txt += `${h.direction === "lena" ? "Wasooli" : "Adaigi"} | ${h.date} | Rs ${h.amount}${h.note ? " (" + h.note + ")" : ""}\n`;
  });
  txt += `----------------\n${isCust ? "Lena hai" : "Dena hai"}: Rs ${Number(p.balance || 0).toLocaleString("en-PK", {maximumFractionDigits: 0})}\nShukriya!`;
  const ph = waPhone(p.phone);
  window.open(ph ? `https://wa.me/${ph}?text=${encodeURIComponent(txt)}` : "https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

/* ================= KHARCHAY ================= */
let KHA_FROM = todayISO(), KHA_TO = todayISO();
RENDER["v-kharchay"] = async () => {
  const v = $("v-kharchay");
  v.innerHTML = `
    <div class="card"><h3>💸 Kharchay</h3>
      <div class="row">
        <div class="grow"><label class="f">Se</label><input type="date" id="kha-from" value="${KHA_FROM}"></div>
        <div class="grow"><label class="f">Tak</label><input type="date" id="kha-to" value="${KHA_TO}"></div>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn sm ghost" onclick="setKhaRange(0)">Aaj</button>
        <button class="btn sm ghost" onclick="setKhaRange(7)">7 Din</button>
        <button class="btn sm ghost" onclick="setKhaRange(30)">30 Din</button>
        <button class="btn sm primary" onclick="loadKharchay()">Dikhao</button>
      </div></div>
    <div id="kha-out"></div>
    <div class="row"><button class="btn danger grow" onclick="openCashForm('out')">+ Naya Kharcha</button></div>
    <div style="height:8px"></div>
    <button class="btn ghost block" onclick="go('v-more')">← Wapas</button>`;
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
  out.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const r = await api(`/reports/expenses?from_date=${KHA_FROM}&to_date=${KHA_TO}`);
    out.innerHTML = `
      <div class="card"><h3>📂 Category-wise Kharcha</h3>
        ${(r.by_category || []).length ? `<table class="tbl"><tr><th>Category</th><th class="num">Adad</th><th class="num">Kul</th></tr>` +
          r.by_category.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${c.n}</td><td class="num">${rs(c.total)}</td></tr>`).join("") + `</table>`
        : `<div style="color:#6b7280;font-size:13px">Koi kharcha nahi</div>`}
        <div class="divider"></div>
        <div class="kv"><span><b>Kul Kharcha</b></span><b class="val red">${rs(r.total)}</b></div></div>`;
  } catch (e) { out.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}

/* ================= REPORTS ================= */
let REP_SUB = "sale", REP_FROM = todayISO(), REP_TO = todayISO(), OUT_TYPE = "customer", DB_DATE = todayISO();
const REP_TABS = [["sale", "🧾 Sale"], ["profit", "💹 Profit"], ["stock", "📦 Stock"], ["udhaar", "📒 Udhaar"], ["daybook", "📖 Day Book"]];
RENDER["v-reports"] = async () => {
  const v = $("v-reports");
  v.innerHTML = `
    <div class="tabs" style="flex-wrap:wrap">
      ${REP_TABS.map((t) => `<button class="${REP_SUB === t[0] ? "active" : ""}" onclick="REP_SUB='${t[0]}';RENDER['v-reports']()">${t[1]}</button>`).join("")}
    </div>
    <div id="rep-out"></div>
    <button class="btn ghost block" onclick="go('v-more')">← Wapas</button>`;
  loadReportSub();
};
function repRangeHTML() {
  return `<div class="card"><div class="row">
      <div class="grow"><label class="f">Se</label><input type="date" id="rep-from" value="${REP_FROM}"></div>
      <div class="grow"><label class="f">Tak</label><input type="date" id="rep-to" value="${REP_TO}"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn sm ghost" onclick="setRepRange(0)">Aaj</button>
      <button class="btn sm ghost" onclick="setRepRange(7)">7 Din</button>
      <button class="btn sm ghost" onclick="setRepRange(30)">30 Din</button>
      <button class="btn sm primary" onclick="loadReportSub()">Dikhao</button>
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
  out.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    if (REP_SUB === "sale") {
      const s = await api(`/reports/sales?from_date=${REP_FROM}&to_date=${REP_TO}`);
      out.innerHTML = repRangeHTML() + `
        <div class="card"><h3>🧾 Sale Report</h3>
          <div class="kv"><span>Bills</span><b>${s.total.bills}</b></div>
          <div class="kv"><span>Kul Sale</span><b>${rs(s.total.sale)}</b></div>
          <div class="kv"><span>Wasool shuda</span><b>${rs(s.total.wasool)}</b></div>
          <div class="kv"><span>Baqaya</span><b>${rs(s.total.baqaya)}</b></div></div>
        ${s.days.length > 1 ? `<div class="card"><h3>📅 Rozana Sale</h3><table class="tbl"><tr><th>Tareekh</th><th class="num">Bills</th><th class="num">Sale</th></tr>` +
          s.days.map((d) => `<tr><td>${niceDate(d.date)}</td><td class="num">${d.bills}</td><td class="num">${rs(d.sale)}</td></tr>`).join("") + `</table></div>` : ""}`;
    } else if (REP_SUB === "profit") {
      const p = await api(`/reports/profit?from_date=${REP_FROM}&to_date=${REP_TO}`);
      out.innerHTML = repRangeHTML() + `
        <div class="card"><h3>💹 Profit Report</h3>
          <div class="kv"><span>Revenue</span><b>${rs(p.revenue)}</b></div>
          <div class="kv"><span>Laagat (cost)</span><b>${rs(p.cost)}</b></div>
          <div class="kv"><span>Discount</span><b>${rs(p.discount)}</b></div>
          <div class="kv"><span><b>Khaalis Munafa</b></span><b style="color:#16a34a">${rs(p.profit)}</b></div></div>
        <div class="card"><h3>🏆 Top Products</h3>
          ${p.top_products.length ? `<table class="tbl"><tr><th>Product</th><th class="num">Miqdar</th><th class="num">Sale</th><th class="num">Munafa</th></tr>` +
            p.top_products.map((t) => `<tr><td>${esc(t.product_name)}</td><td class="num">${t.qty}</td><td class="num">${rs(t.revenue)}</td><td class="num">${rs(t.profit)}</td></tr>`).join("") + `</table>`
          : `<div style="color:#6b7280;font-size:13px">Koi sale nahi</div>`}</div>`;
    } else if (REP_SUB === "stock") {
      const r = await api("/reports/stock");
      out.innerHTML = `
        <div class="card"><h3>📦 Stock Report</h3>
          <div class="kv"><span>Stock Value (kharid qeemat)</span><b>${rs(r.total_cost_value)}</b></div>
          <div class="kv"><span>Stock Value (farokht qeemat)</span><b>${rs(r.total_sale_value)}</b></div>
          <div class="kv"><span>Low Stock Items</span><b style="color:#dc2626">${r.low_count}</b></div></div>
        <div class="card"><h3>Items</h3><div style="overflow-x:auto"><table class="tbl">
          <tr><th>Product</th><th class="num">Stock</th><th class="num">Kharid</th><th class="num">Farokht</th><th class="num">Value (cost)</th></tr>
          ${r.items.map((i) => `<tr${i.stock_qty <= i.low_stock_level ? ' style="background:#fef3c7"' : ""}><td>${esc(i.name)}${i.sku ? "<br><span style='font-size:11px;color:#6b7280'>" + esc(i.sku) + "</span>" : ""}</td><td class="num">${i.stock_qty}</td><td class="num">${rs(i.purchase_price)}</td><td class="num">${rs(i.sale_price)}</td><td class="num">${rs(i.stock_value_cost)}</td></tr>`).join("")}
        </table></div></div>`;
    } else if (REP_SUB === "udhaar") {
      const r = await api("/reports/outstanding?type=" + OUT_TYPE);
      out.innerHTML = `
        <div class="tabs">
          <button class="${OUT_TYPE === "customer" ? "active" : ""}" onclick="OUT_TYPE='customer';loadReportSub()">Gahak</button>
          <button class="${OUT_TYPE === "supplier" ? "active" : ""}" onclick="OUT_TYPE='supplier';loadReportSub()">Supplier</button>
        </div>
        <div class="card"><div class="kv"><span><b>Kul ${OUT_TYPE === "customer" ? "Lena hai" : "Dena hai"}</b></span><b style="color:#dc2626">${rs(r.total)}</b></div></div>
        ${(r.parties || []).length ? r.parties.map((p) => `
          <div class="list-item" onclick="KHATA_TYPE='${OUT_TYPE}';go('v-party', ${p.id})">
            <div><div class="t">${esc(p.name)}</div><div class="s">${esc(p.phone || "")}</div></div>
            <div class="t" style="color:#dc2626">${rs(p.balance)}</div>
          </div>`).join("") : `<div class="empty">Koi udhaar nahi 👍</div>`}`;
    } else if (REP_SUB === "daybook") {
      const r = await api("/reports/daybook?date=" + DB_DATE);
      out.innerHTML = `
        <div class="card"><div class="row">
          <label class="f grow" style="margin:0">📅 Tareekh</label>
          <input type="date" class="grow" value="${DB_DATE}" onchange="DB_DATE=this.value;loadReportSub()">
        </div>
        <div class="kv" style="margin-top:8px"><span><b>Kul Entries</b></span><b>${r.count}</b></div></div>
        ${(r.items || []).length ? r.items.map((i) => `
          <div class="list-item" style="cursor:default">
            <div><div class="t">${esc(i.ref || i.kind)}</div><div class="s">${esc(i.tafseel || "")}</div></div>
            <div class="t">${rs(i.amount)}</div>
          </div>`).join("") : `<div class="empty">Is din koi entry nahi</div>`}`;
    }
  } catch (e) { out.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}

/* ================= SETTINGS ================= */
RENDER["v-settings"] = async () => {
  const v = $("v-settings");
  try {
    const s = await api("/auth/me");
    v.innerHTML = `
      <div class="card"><h3>⚙️ Dukan ki Settings</h3>
        <label class="f">Dukan ka Naam</label><input id="st-name" value="${esc(s.name)}">
        <label class="f">Pata</label><input id="st-addr" value="${esc(s.address || "")}">
        <label class="f">Phone</label><input id="st-phone" value="${esc(s.phone)}">
        <label class="f">Receipt par Header Text</label><input id="st-head" value="${esc(s.receipt_header || "")}" placeholder="Masalan: Shukriya!">
        <div class="err" id="st-err"></div>
        <button class="btn primary block" onclick="saveSettings()">Save Karo</button></div>
      <button class="btn ghost block" onclick="go('v-more')">← Wapas</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};
async function saveSettings() {
  try {
    await api("/settings", "PUT", {name: $("st-name").value.trim(), address: $("st-addr").value.trim(),
      phone: $("st-phone").value.trim(), receipt_header: $("st-head").value.trim()});
    SHOP = await api("/auth/me");
    $("shop-name").textContent = SHOP.name;
    $("st-err").textContent = "✅ Save ho gaya";
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
  $("shop-name").textContent = SHOP.name;
  go("v-home");
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/static/sw.js").catch(() => {}));
}
boot();
