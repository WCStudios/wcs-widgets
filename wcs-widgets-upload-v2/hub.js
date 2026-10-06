/* Shared helpers for the Contracts & Decks widgets: the sealed feed, the
   worker connection (same localStorage slot the invoice widgets use), and
   a Notion-style document renderer for the builder previews. */
(function(){
const LSK = "wcsContractsKey.v1", CONN = "wcsWorkerConn.v1";
const RAW = "https://raw.githubusercontent.com/wcstudios/wcs-widgets/main/wcs-widgets-upload-v2/contracts-live.json";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const b64 = s => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const d0 = s => { const [y,m,d] = String(s).slice(0,10).split("-").map(Number); return new Date(y, m - 1, d); };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const fmt = s => s ? (d => MO[d.getMonth()] + " " + d.getDate())(d0(s)) : "";
const fmtY = s => s ? (d => MO[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear())(d0(s)) : "";
const fmtLong = s => s ? (d => MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear())(d0(s)) : "";
const money = n => n == null || n === "" || isNaN(n) ? "—" : "$" + Math.round(Number(n)).toLocaleString("en-US");
const addMonths = (s, m) => { const d = d0(s); d.setMonth(d.getMonth() + Number(m)); d.setDate(d.getDate() - 1); return iso(d); };
let KEY = null;
function rawKey(){
  const h = location.hash.slice(1);
  if (h) { try { localStorage.setItem(LSK, h); } catch(e){} return h; }
  try { return localStorage.getItem(LSK) || ""; } catch(e){ return ""; }
}
async function getKey(){
  if (KEY) return KEY;
  const r = rawKey(); if (!r) return null;
  try { return KEY = await crypto.subtle.importKey("raw", b64(r), "AES-GCM", false, ["decrypt"]); } catch(e){ return null; }
}
async function loadFeed(){
  if (!(await getKey())) return null;
  const out = [];
  for (const u of ["contracts-live.json?t=" + Date.now(), RAW + "?t=" + Date.now()]) {
    try {
      const r = await fetch(u, { cache: "no-store" }); if (!r.ok) continue;
      const env = await r.json(); const bytes = b64(env.data);
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, KEY, bytes.slice(12));
      out.push(JSON.parse(new TextDecoder().decode(pt)));
    } catch(e){}
  }
  out.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  return out[0] || null;
}
function conn(){ try { return JSON.parse(localStorage.getItem(CONN) || "{}"); } catch(e){ return {}; } }
function setConn(url, key){ try { localStorage.setItem(CONN, JSON.stringify({ url, key })); return true; } catch(e){ return false; } }
async function post(action, payload){
  const c = conn();
  if (!c.url || !c.key) throw new Error("noconn");
  await fetch(c.url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ key: c.key, action, payload }) });
}
/* Poll the feed until `test(feed)` returns something truthy. */
function watch(test, onHit, onGiveUp, ms = 150000){
  const t0 = Date.now();
  const tick = setInterval(async () => {
    const f = await loadFeed(); const hit = f && test(f);
    if (hit) { clearInterval(tick); onHit(hit, f); }
    else if (Date.now() - t0 > ms) { clearInterval(tick); onGiveUp && onGiveUp(); }
  }, 10000);
  return () => clearInterval(tick);
}
function toast(t){ let el = document.getElementById("toast"); if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); } el.textContent = t; el.classList.add("on"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), 1900); }
function openUrl(url){
  if (!url) return;
  if (/notion\.(so|com)/.test(url)) { try { window.top.location.href = url; } catch(e){} setTimeout(() => { try { window.open(url, "_blank", "noopener"); } catch(e){} }, 600); }
  else window.open(url, "_blank", "noopener");
}
/* "**bold** *italic* [text](url)" -> runs */
function parseRT(str){
  const out = [], re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
  let i = 0, m; str = String(str ?? "");
  while ((m = re.exec(str))) {
    if (m.index > i) out.push({ x: str.slice(i, m.index) });
    if (m[1]) out.push({ x: m[1], b: 1 }); else if (m[2]) out.push({ x: m[2], i: 1 }); else out.push({ x: m[3], h: m[4] });
    i = re.lastIndex;
  }
  if (i < str.length) out.push({ x: str.slice(i) });
  return out.filter(r => r.x);
}
const P = (str, extra = {}) => ({ t: "paragraph", r: parseRT(str), ...extra });
const lines = s => String(s ?? "").split("\n").map(x => x.trim()).filter(Boolean);
const paras = s => String(s ?? "").split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);

/* ── Token fill on runs: same algorithm as the worker's fillRT. Marks each
   filled token (and each still-empty one) so the preview can highlight it. */
const TOKEN = /\[([^\[\]\n]{1,60})\]/g;
function fillRuns(runs, values){
  if (!values) return runs;
  const full = runs.map(r => r.x).join("");
  if (!TOKEN.test(full)) return runs;
  TOKEN.lastIndex = 0;
  let chars = []; runs.forEach((r, i) => { for (const ch of r.x) chars.push({ ch, o: i, m: 0 }); });
  const ms = [...full.matchAll(TOKEN)];
  // indices above are UTF-16; rebuild chars by UTF-16 units to stay aligned
  chars = []; runs.forEach((r, i) => { for (let k = 0; k < r.x.length; k++) chars.push({ ch: r.x[k], o: i, m: 0 }); });
  for (const m of ms.reverse()) {
    const s = m.index, e = s + m[0].length, o = chars[s].o, key = m[1].trim(), v = values[key];
    const rep = v ? [...v].map(ch => ({ ch, o, m: 1 })) : m[0].split("").map(ch => ({ ch, o, m: 2 }));
    chars = [...chars.slice(0, s), ...rep, ...chars.slice(e)];
  }
  const out = [];
  for (const c of chars) { const L = out[out.length - 1]; if (L && L.o === c.o && L.m === c.m) L.x += c.ch; else out.push({ o: c.o, m: c.m, x: c.ch }); }
  return out.map(seg => ({ ...runs[seg.o], x: seg.x, mark: seg.m }));
}
function rtHTML(runs, values){
  return fillRuns(runs || [], values).map(r => {
    let h = esc(r.x).replace(/\n/g, "<br>");
    if (r.c) h = `<code>${h}</code>`;
    if (r.b) h = `<strong>${h}</strong>`;
    if (r.i) h = `<em>${h}</em>`;
    if (r.u) h = `<u>${h}</u>`;
    if (r.s) h = `<s>${h}</s>`;
    if (r.k) h = /_background$/.test(r.k) ? `<span class="bg-${r.k}">${h}</span>` : `<span class="c-${r.k}">${h}</span>`;
    if (r.h) h = `<a href="${esc(r.h)}" target="_blank" rel="noopener">${h}</a>`;
    if (r.mark === 1) h = `<mark>${h}</mark>`; else if (r.mark === 2) h = `<mark class="empty">${h}</mark>`;
    return h;
  }).join("");
}
/* Notion-ish document from nodes. */
function docHTML(nodes, values){
  let h = "", i = 0;
  const R = n => rtHTML(n.r, values);
  while (i < (nodes || []).length) {
    const n = nodes[i];
    if (n.t === "bulleted_list_item" || n.t === "numbered_list_item") {
      const tag = n.t === "numbered_list_item" ? "ol" : "ul"; let items = "";
      while (i < nodes.length && nodes[i].t === n.t) { const x = nodes[i++]; items += `<li>${R(x)}${x.ch ? docHTML(x.ch, values) : ""}</li>`; }
      h += `<${tag}>${items}</${tag}>`; continue;
    }
    i++;
    const kids = n.ch && n.ch.length ? docHTML(n.ch, values) : "";
    switch (n.t) {
      case "heading_1": h += `<h2>${R(n)}</h2>${kids}`; break;
      case "heading_2": h += `<h3>${R(n)}</h3>${kids}`; break;
      case "heading_3": h += `<h4>${R(n)}</h4>${kids}`; break;
      case "paragraph": h += `<p>${R(n)}</p>${kids ? `<div style="padding-left:18px">${kids}</div>` : ""}`; break;
      case "quote": h += `<blockquote>${R(n)}${kids}</blockquote>`; break;
      case "callout": h += `<div class="callout bg-${esc(n.k || "default")}">${n.ic ? `<div class="ic">${n.ic}</div>` : ""}<div class="cb"><p>${R(n)}</p>${kids}</div></div>`; break;
      case "toggle": h += `<details ${n.open === false ? "" : "open"}><summary>${R(n)}</summary><div class="kids">${kids}</div></details>`; break;
      case "to_do": h += `<div class="todo"><span class="box">${n.chk ? "✓" : ""}</span><span>${R(n)}</span></div>`; break;
      case "divider": h += `<hr>`; break;
      case "image": h += n.u && !/^enc:/.test(n.u) ? `<img src="${esc(n.u)}" alt="">` : ""; break;
      case "embed": case "bookmark": case "video": h += `<div class="embed">${/zite|fillout/.test(n.u || "") ? "Signature form" : "Embed"} · ${esc((n.u || "").replace(/^https?:\/\//, "").slice(0, 60))}</div>`; break;
      case "table": {
        const rows = n.rows || [];
        h += `<table>${rows.map((r, k) => `<tr class="${k === 0 && n.hdr ? "hdr" : (r.cls || "")}">${r.map((c, ci) => `<td class="${ci > 0 && n.num ? "num" : ""}">${rtHTML(c, values)}</td>`).join("")}</tr>`).join("")}</table>`;
        break;
      }
      case "columns": h += `<div class="cols">${(n.ch || []).map(c => `<div>${docHTML(c.ch || [], values)}</div>`).join("")}</div>`; break;
    }
  }
  return h;
}
/* Fit a fixed-width paper into its scroll area. */
function fitPaper(wrap, scaler, inner){
  const W = inner.offsetWidth, avail = wrap.clientWidth - 40;
  const s = Math.min(1, avail / W);
  scaler.style.transform = `scale(${s})`;
  scaler.style.width = W + "px";
  scaler.style.height = (inner.offsetHeight * s) + "px";
}
/* Collapsible groups, same behaviour as the invoice builder. */
function wireGroups(root = document){
  root.querySelectorAll(".grp>.lbl[data-toggle]").forEach(l => l.onclick = () => l.parentElement.classList.toggle("closed"));
}
window.WCSHub = { esc, b64, MO, d0, iso, today, fmt, fmtY, fmtLong, money, addMonths, getKey, loadFeed, conn, setConn, post, watch, toast, openUrl, parseRT, P, lines, paras, fillRuns, rtHTML, docHTML, fitPaper, wireGroups, TOKEN };
})();
