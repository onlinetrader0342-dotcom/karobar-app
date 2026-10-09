/* Karobar PWA — Phase 1 MVP. Sab labels Roman Urdu, currency Rs. */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rs = (n) => "Rs " + Number(n || 0).toLocaleString("en-PK", {maximumFractionDigits: 0});
const todayISO = () => new Date().toISOString().slice(0, 10);

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

/* ---------- home / dashboard ---------- */
RENDER["v-home"] = async () => {
  const v = $("v-home");
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const d = await api("/reports/dashboard");
    const low = d.low_stock.length
      ? d.low_stock.map((p) => `<div class="kv"><span>⚠️ ${esc(p.name)}</span><span class="num">${p.stock_qty} ${esc(p.unit || "")}</span></div>`).join("")
      : `<div style="color:#6b7280;font-size:13px">Sab stock theek hai 👍</div>`;
    v.innerHTML = `
      <div class="card"><h3>Aaj ka khulasa (${todayISO()})</h3>
        <div class="grid2">
          <div class="stat"><div class="lbl">Aaj ki Sale</div><div class="val teal">${rs(d.aaj_ki_sale)}</div></div>
          <div class="stat"><div class="lbl">Aaj ka Kharcha</div><div class="val red">${rs(d.aaj_ka_kharcha)}</div></div>
          <div class="stat"><div class="lbl">Gahakon se Lena</div><div class="val green">${rs(d.kul_lena)}</div></div>
          <div class="stat"><div class="lbl">Supplier ko Dena</div><div class="val red">${rs(d.kul_dena)}</div></div>
        </div></div>
      <div class="card"><h3>⏰ Low Stock Warning</h3>${low}</div>
      <button class="btn primary block" onclick="openBillForm()">+ Naya Bill Banao</button>
      <div class="card" style="margin-top:12px"><div class="kv"><span>Products</span><b>${d.products}</b></div>
        <div class="kv"><span>Parties (Khata)</span><b>${d.parties}</b></div></div>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

/* ---------- bills ---------- */
RENDER["v-bills"] = async () => {
  const v = $("v-bills");
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const bills = await api("/bills");
    v.innerHTML = `<button class="fab" onclick="openBillForm()">+</button>` +
      (bills.length ? bills.map((b) => `
        <div class="list-item" onclick="go('v-bill-detail', ${b.id})">
          <div><div class="t">${esc(b.bill_no)} ${b.party_name ? "— " + esc(b.party_name) : ""}</div>
          <div class="s">${esc(b.date)} · ${b.items_count ?? ""}</div></div>
          <div style="text-align:right"><div class="t">${rs(b.total)}</div>
          ${b.baqaya > 0 ? `<span class="badge warn">Baqaya ${rs(b.baqaya)}</span>` : `<span class="badge ok">Wasool</span>`}</div>
        </div>`).join("")
      : `<div class="empty">Abhi koi bill nahi bana.<br>Neeche + dabakar pehla bill banao.</div>`);
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

let BILL = {party_id: null, party_name: "", items: [], discount: 0, paid: 0};

async function openBillForm() {
  BILL = {party_id: null, party_name: "", items: [], discount: 0, paid: 0};
  const [products, parties] = await Promise.all([api("/products"), api("/parties?type=customer")]);
  window._billProducts = products;
  window._billParties = parties;
  renderBillForm();
}

function renderBillForm() {
  const lines = BILL.items.map((it, i) => {
    const p = window._billProducts.find((x) => x.id === it.product_id);
    return `<div class="kv"><span>${esc(p ? p.name : "?")} × ${it.qty}</span>
      <span>${rs((p ? (it.price ?? p.sale_price) : 0) * it.qty)}
      <button class="btn sm danger" onclick="billRemoveItem(${i})">✕</button></span></div>`;
  }).join("");
  const sub = BILL.items.reduce((s, it) => {
    const p = window._billProducts.find((x) => x.id === it.product_id);
    return s + (p ? (it.price ?? p.sale_price) : 0) * it.qty;
  }, 0);
  const total = Math.max(0, sub - (BILL.discount || 0));
  modal(`
    <h3>🧾 Naya Bill</h3>
    <label class="f">Gahak (khali = walk-in)</label>
    <select id="bf-party" onchange="billPartyChange(this.value)">
      <option value="">— Walk-in Gahak —</option>
      ${window._billParties.map((p) => `<option value="${p.id}" ${BILL.party_id == p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
    </select>
    <div class="row" style="margin-top:8px">
      <input id="bf-newparty" class="grow" placeholder="Naya gahak ka naam">
      <button class="btn sm ghost" onclick="billAddParty()">+ Jorain</button>
    </div>
    <div class="divider"></div>
    <label class="f">Product jorain</label>
    <div class="row">
      <select id="bf-product" class="grow">
        ${window._billProducts.map((p) => `<option value="${p.id}">${esc(p.name)} — ${rs(p.sale_price)} (stock ${p.stock_qty})</option>`).join("")}
      </select>
    </div>
    <div class="row" style="margin-top:8px">
      <input id="bf-qty" class="grow" type="number" min="1" value="1" placeholder="Miqdar">
      <button class="btn sm primary" onclick="billAddItem()">+ Jorain</button>
    </div>
    <div class="divider"></div>
    ${lines || `<div style="color:#6b7280;font-size:13px">Abhi koi item nahi</div>`}
    <div class="divider"></div>
    <div class="kv"><span>Subtotal</span><b>${rs(sub)}</b></div>
    <div class="row"><label class="f grow">Discount (Rs)</label>
      <input id="bf-disc" type="number" min="0" value="${BILL.discount}" style="width:120px" onchange="BILL.discount=+this.value||0;renderBillForm()"></div>
    <div class="kv"><span><b>Kul Total</b></span><b>${rs(total)}</b></div>
    <div class="row"><label class="f grow">Wasool shuda (Rs)</label>
      <input id="bf-paid" type="number" min="0" value="${BILL.paid}" style="width:120px" onchange="BILL.paid=+this.value||0"></div>
    <div class="err" id="bf-err"></div>
    <button class="btn primary block" onclick="billSave(${total})">Bill Save Karo</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}

function billPartyChange(v) {
  BILL.party_id = v ? +v : null;
  const p = window._billParties.find((x) => x.id === BILL.party_id);
  BILL.party_name = p ? p.name : "";
}
async function billAddParty() {
  const name = $("bf-newparty").value.trim();
  if (!name) return;
  try {
    const p = await api("/parties", "POST", {name, type: "customer"});
    window._billParties.push(p);
    BILL.party_id = p.id; BILL.party_name = p.name;
    renderBillForm();
  } catch (e) { $("bf-err").textContent = e.message; }
}
function billAddItem() {
  const pid = +$("bf-product").value, qty = +$("bf-qty").value || 0;
  if (qty <= 0) return;
  const ex = BILL.items.find((i) => i.product_id === pid);
  if (ex) ex.qty += qty; else BILL.items.push({product_id: pid, qty});
  renderBillForm();
}
function billRemoveItem(i) { BILL.items.splice(i, 1); renderBillForm(); }

async function billSave(total) {
  if (!BILL.items.length) { $("bf-err").textContent = "Pehle koi item jorain"; return; }
  try {
    const b = await api("/bills", "POST", {
      party_id: BILL.party_id, party_name: BILL.party_name,
      items: BILL.items.map((i) => ({product_id: i.product_id, qty: i.qty})),
      discount: BILL.discount || 0, paid: Math.min(BILL.paid || 0, total),
    });
    closeModal();
    go("v-bill-detail", b.id);
  } catch (e) { $("bf-err").textContent = e.message; }
}

RENDER["v-bill-detail"] = async (bill_id) => {
  const v = $("v-bill-detail");
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const b = await api("/bills/" + bill_id);
    const s = b.shop;
    const rows = b.items.map((it) => `
      <tr><td>${esc(it.product_name)}<br><span style="color:#6b7280">${it.qty} × ${rs(it.price)}</span></td>
      <td class="num">${rs(it.total)}</td></tr>`).join("");
    v.innerHTML = `
    <div class="bill-paper">
      <div class="center">
        <div class="shopname">${esc(s.name)}</div>
        <div class="meta">${esc(s.address || "")}${s.phone ? " · " + esc(s.phone) : ""}</div>
        ${s.receipt_header ? `<div class="meta">${esc(s.receipt_header)}</div>` : ""}
      </div>
      <div class="divider"></div>
      <div class="kv"><span>Bill No</span><b>${esc(b.bill_no)}</b></div>
      <div class="kv"><span>Tareekh</span><b>${esc(b.date)}</b></div>
      ${b.party_name ? `<div class="kv"><span>Gahak</span><b>${esc(b.party_name)}</b></div>` : ""}
      <div class="divider"></div>
      <table class="tbl"><tr><th>Item</th><th class="num">Raqam</th></tr>${rows}</table>
      <div class="divider"></div>
      <div class="kv"><span>Subtotal</span><span>${rs(b.subtotal)}</span></div>
      ${b.discount ? `<div class="kv"><span>Discount</span><span>− ${rs(b.discount)}</span></div>` : ""}
      <div class="kv"><span><b>Kul Total</b></span><b>${rs(b.total)}</b></div>
      <div class="kv"><span>Wasool shuda</span><span>${rs(b.paid)}</span></div>
      <div class="kv"><span><b>Baqaya</b></span><b style="color:${b.baqaya > 0 ? "#dc2626" : "#16a34a"}">${rs(b.baqaya)}</b></div>
    </div>
    <div class="no-print">
      <button class="btn primary block" onclick="window.print()">🖨️ Print Karo</button>
      <button class="btn amber block" onclick="shareBillWhatsApp(${b.id})">📲 WhatsApp par Bhejo</button>
      <button class="btn ghost block" onclick="go('v-bills')">← Bills ki List</button>
    </div>`;
    window._lastBill = b;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function shareBillWhatsApp(bill_id) {
  const b = window._lastBill;
  if (!b) return;
  const s = b.shop;
  let txt = `${s.name}\nBill: ${b.bill_no} | ${b.date}\n----------------\n`;
  b.items.forEach((it) => { txt += `${it.product_name} x${it.qty} = Rs ${it.total}\n`; });
  txt += `----------------\nKul: Rs ${b.total}\nWasool: Rs ${b.paid}\nBaqaya: Rs ${b.baqaya}`;
  if (s.receipt_header) txt += `\n${s.receipt_header}`;
  window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
}

/* ---------- stock ---------- */
RENDER["v-stock"] = async () => {
  const v = $("v-stock");
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const products = await api("/products");
    window._products = products;
    v.innerHTML = `<button class="fab" onclick="openProductForm()">+</button>
      <div class="card"><input id="stock-q" placeholder="🔍 Product talash karo…" oninput="renderStockList(this.value)"></div>
      <div id="stock-list"></div>`;
    renderStockList("");
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function renderStockList(q) {
  const list = (window._products || []).filter((p) =>
    p.name.toLowerCase().includes(q.toLowerCase()) || (p.sku || "").toLowerCase().includes(q.toLowerCase()));
  $("stock-list").innerHTML = list.length ? list.map((p) => `
    <div class="list-item" onclick="openProductForm(${p.id})">
      <div><div class="t">${esc(p.name)}</div>
        <div class="s">Kharid ${rs(p.purchase_price)} · Farokht ${rs(p.sale_price)}</div></div>
      <div style="text-align:right">
        ${p.stock_qty <= p.low_stock_level ? `<span class="badge warn">Low: ${p.stock_qty}</span>` : `<span class="badge ok">${p.stock_qty} ${esc(p.unit || "")}</span>`}
      </div></div>`).join("")
    : `<div class="empty">Koi product nahi mila</div>`;
}

function openProductForm(pid) {
  const p = pid ? window._products.find((x) => x.id === pid) : null;
  modal(`
    <h3>${p ? "✏️ Product Edit Karo" : "➕ Naya Product"}</h3>
    <label class="f">Product ka Naam</label><input id="pf-name" value="${esc(p?.name || "")}">
    <label class="f">SKU / Code (optional)</label><input id="pf-sku" value="${esc(p?.sku || "")}">
    <div class="grid2">
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
    name: $("pf-name").value.trim(), sku: $("pf-sku").value.trim(),
    purchase_price: +$("pf-pp").value || 0,
    sale_price: +$("pf-sp").value || 0, stock_qty: +$("pf-qty").value || 0,
    low_stock_level: +$("pf-low").value || 0, unit: $("pf-unit").value.trim() || "naq",
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

/* ---------- khata (parties) ---------- */
let KHATA_TYPE = "customer";
RENDER["v-khata"] = async () => {
  const v = $("v-khata");
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const parties = await api("/parties?type=" + KHATA_TYPE);
    v.innerHTML = `<button class="fab" onclick="openPartyForm()">+</button>
      <div class="tabs">
        <button class="${KHATA_TYPE === "customer" ? "active" : ""}" onclick="KHATA_TYPE='customer';RENDER['v-khata']()">Gahak</button>
        <button class="${KHATA_TYPE === "supplier" ? "active" : ""}" onclick="KHATA_TYPE='supplier';RENDER['v-khata']()">Supplier</button>
      </div>` +
      (parties.length ? parties.map((p) => `
        <div class="list-item" onclick="go('v-party', ${p.id})">
          <div><div class="t">${esc(p.name)}</div><div class="s">${esc(p.phone || "")}</div></div>
          <div style="text-align:right"><div class="t" style="color:${p.balance > 0 ? "#dc2626" : "#16a34a"}">${rs(p.balance)}</div>
          <div class="s">${KHATA_TYPE === "customer" ? "lena hai" : "dena hai"}</div></div>
        </div>`).join("")
      : `<div class="empty">Koi ${KHATA_TYPE === "customer" ? "gahak" : "supplier"} nahi.<br>+ dabakar jorain.</div>`);
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function openPartyForm() {
  modal(`
    <h3>➕ Naya ${KHATA_TYPE === "customer" ? "Gahak" : "Supplier"}</h3>
    <label class="f">Naam</label><input id="pt-name">
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
    const dir = p.type === "customer" ? "lena" : "dena";
    const dirLbl = p.type === "customer" ? "Wasooli (lena)" : "Adaigi (dena)";
    const hist = p.history.length ? p.history.map((h) => h.kind === "bill"
      ? `<div class="kv"><span>🧾 ${esc(h.bill_no)} · ${esc(h.date)}</span><span class="num">${rs(h.total)}<br><span style="font-size:11px;color:${h.baqaya > 0 ? "#dc2626" : "#16a34a"}">baqaya ${rs(h.baqaya)}</span></span></div>`
      : `<div class="kv"><span>💰 ${dirLbl} · ${esc(h.date)}${h.note ? "<br><span style='font-size:11px;color:#6b7280'>" + esc(h.note) + "</span>" : ""}</span><span class="num" style="color:#16a34a">− ${rs(h.amount)}</span></div>`
    ).join("") : `<div class="empty">Koi len-den nahi</div>`;
    v.innerHTML = `
      <div class="card"><h3>${esc(p.name)}</h3>
        <div class="s" style="color:#6b7280">${esc(p.phone || "")} ${esc(p.address || "")}</div>
        <div class="stat" style="margin-top:10px"><div class="lbl">${p.type === "customer" ? "Gahak se LENA hai" : "Supplier ko DENA hai"}</div>
        <div class="val ${p.balance > 0 ? "red" : "green"}">${rs(p.balance)}</div></div></div>
      <button class="btn primary block" onclick="openPaymentForm('${dir}')">+ ${dirLbl} Darj Karo</button>
      <div class="card" style="margin-top:12px"><h3>Len-den ki History</h3>${hist}</div>
      <button class="btn ghost block" onclick="go('v-khata')">← Khata</button>`;
  } catch (e) { v.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
};

function openPaymentForm(dir) {
  modal(`
    <h3>💰 ${dir === "lena" ? "Wasooli" : "Adaigi"} — ${esc(window._party.name)}</h3>
    <label class="f">Raqam (Rs)</label><input id="pm-amt" type="number" min="1">
    <label class="f">Zariya</label>
    <select id="pm-mode"><option value="cash">Cash</option><option value="bank">Bank</option><option value="online">Online (JazzCash/Easypaisa)</option></select>
    <label class="f">Note</label><input id="pm-note">
    <div class="err" id="pm-err"></div>
    <button class="btn primary block" onclick="savePayment('${dir}')">Save Karo</button>
    <button class="btn ghost block" onclick="closeModal()">Cancel</button>`);
}
async function savePayment(dir) {
  const amt = +$("pm-amt").value || 0;
  if (amt <= 0) { $("pm-err").textContent = "Raqam likho"; return; }
  try {
    await api(`/parties/${window._party.id}/payments`, "POST",
      {amount: amt, direction: dir, mode: $("pm-mode").value, note: $("pm-note").value.trim()});
    closeModal(); RENDER["v-party"](window._party.id);
  } catch (e) { $("pm-err").textContent = e.message; }
}

/* ---------- aur (more menu) ---------- */
RENDER["v-more"] = async () => {
  $("v-more").innerHTML = `
    <div class="menu-item" onclick="go('v-cash')"><span class="ic">💵</span><div class="t">Cash Book</div></div>
    <div class="menu-item" onclick="go('v-reports')"><span class="ic">📊</span><div class="t">Reports</div></div>
    <div class="menu-item" onclick="go('v-settings')"><span class="ic">⚙️</span><div class="t">Settings</div></div>
    <div class="menu-item" onclick="logout()"><span class="ic">🚪</span><div class="t">Logout</div></div>
    <div style="text-align:center;color:#9ca3af;font-size:12px;margin-top:20px">Karobar v1.0 (MVP)</div>`;
};

/* ---------- cash book ---------- */
let CASH_DATE = todayISO();
RENDER["v-cash"] = async () => {
  const v = $("v-cash");
  v.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const c = await api("/cash?date=" + CASH_DATE);
    v.innerHTML = `
      <div class="card"><div class="row">
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
    <input id="cf-cat" value="${kind === "out" ? "kharcha" : "aamad"}" placeholder="${kind === "out" ? "kharcha" : "aamad"}">
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
    closeModal(); RENDER["v-cash"]();
  } catch (e) { $("cf-err").textContent = e.message; }
}

/* ---------- reports ---------- */
let REP_FROM = todayISO(), REP_TO = todayISO();
RENDER["v-reports"] = async () => {
  const v = $("v-reports");
  v.innerHTML = `
    <div class="card"><h3>📊 Reports</h3>
      <div class="row">
        <div class="grow"><label class="f">Se</label><input type="date" id="rep-from" value="${REP_FROM}"></div>
        <div class="grow"><label class="f">Tak</label><input type="date" id="rep-to" value="${REP_TO}"></div>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn sm ghost" onclick="setRepRange(0)">Aaj</button>
        <button class="btn sm ghost" onclick="setRepRange(7)">7 Din</button>
        <button class="btn sm ghost" onclick="setRepRange(30)">30 Din</button>
        <button class="btn sm primary" onclick="loadReports()">Dikhao</button>
      </div></div>
    <div id="rep-out"></div>
    <button class="btn ghost block" onclick="go('v-more')">← Wapas</button>`;
  loadReports();
};
function setRepRange(days) {
  const t = new Date();
  REP_TO = t.toISOString().slice(0, 10);
  REP_FROM = new Date(t - days * 864e5).toISOString().slice(0, 10);
  RENDER["v-reports"]();
}
async function loadReports() {
  REP_FROM = $("rep-from").value; REP_TO = $("rep-to").value;
  const out = $("rep-out");
  out.innerHTML = `<div class="card">Load ho raha hai…</div>`;
  try {
    const [s, p] = await Promise.all([
      api(`/reports/sales?from_date=${REP_FROM}&to_date=${REP_TO}`),
      api(`/reports/profit?from_date=${REP_FROM}&to_date=${REP_TO}`),
    ]);
    out.innerHTML = `
      <div class="card"><h3>🧾 Sale Report</h3>
        <div class="kv"><span>Bills</span><b>${s.total.bills}</b></div>
        <div class="kv"><span>Kul Sale</span><b>${rs(s.total.sale)}</b></div>
        <div class="kv"><span>Wasool shuda</span><b>${rs(s.total.wasool)}</b></div>
        <div class="kv"><span>Baqaya</span><b>${rs(s.total.baqaya)}</b></div></div>
      <div class="card"><h3>💹 Profit Report</h3>
        <div class="kv"><span>Revenue</span><b>${rs(p.revenue)}</b></div>
        <div class="kv"><span>Laagat (cost)</span><b>${rs(p.cost)}</b></div>
        <div class="kv"><span>Discount</span><b>${rs(p.discount)}</b></div>
        <div class="kv"><span><b>Khaalis Munafa</b></span><b style="color:#16a34a">${rs(p.profit)}</b></div></div>
      <div class="card"><h3>🏆 Top Products</h3>
        ${p.top_products.length ? `<table class="tbl"><tr><th>Product</th><th class="num">Miqdar</th><th class="num">Sale</th><th class="num">Munafa</th></tr>` +
          p.top_products.map((t) => `<tr><td>${esc(t.product_name)}</td><td class="num">${t.qty}</td><td class="num">${rs(t.revenue)}</td><td class="num">${rs(t.profit)}</td></tr>`).join("") + `</table>`
        : `<div style="color:#6b7280;font-size:13px">Koi sale nahi</div>`}</div>
      ${s.days.length > 1 ? `<div class="card"><h3>📅 Rozana Sale</h3><table class="tbl"><tr><th>Tareekh</th><th class="num">Bills</th><th class="num">Sale</th></tr>` +
        s.days.map((d) => `<tr><td>${esc(d.date)}</td><td class="num">${d.bills}</td><td class="num">${rs(d.sale)}</td></tr>`).join("") + `</table></div>` : ""}`;
  } catch (e) { out.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}

/* ---------- settings ---------- */
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

/* ---------- boot ---------- */
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
