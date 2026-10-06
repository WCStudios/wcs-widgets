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
   filled token (and each still-empty one) so the preview can highlight it,
   and remembers which token a mark came from so it can be edited in place. */
const TOKEN = /\[([^\[\]\n]{1,60})\]/g;
function fillRuns(runs, values){
  if (!values) return runs;
  const full = runs.map(r => r.x).join("");
  TOKEN.lastIndex = 0;
  if (!TOKEN.test(full)) return runs;
  TOKEN.lastIndex = 0;
  let chars = []; runs.forEach((r, i) => { for (let k = 0; k < r.x.length; k++) chars.push({ ch: r.x[k], o: i, m: 0, t: "" }); });
  for (const m of [...full.matchAll(TOKEN)].reverse()) {
    const s = m.index, e = s + m[0].length, o = chars[s].o, key = m[1].trim(), v = values[key];
    const rep = (v ? [...v] : m[0].split("")).map(ch => ({ ch, o, m: v ? 1 : 2, t: key }));
    chars = [...chars.slice(0, s), ...rep, ...chars.slice(e)];
  }
  const out = [];
  for (const c of chars) { const L = out[out.length - 1]; if (L && L.o === c.o && L.m === c.m && L.t === c.t) L.x += c.ch; else out.push({ o: c.o, m: c.m, t: c.t, x: c.ch }); }
  return out.map(seg => ({ ...runs[seg.o], x: seg.x, mark: seg.m, tok: seg.t }));
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
    if (r.mark) h = `<mark class="${r.mark === 2 ? "empty" : ""}" data-tok="${esc(r.tok)}">${h}</mark>`;
    return h;
  }).join("");
}
/* Notion-ish document from nodes. opts.paths tags every text block with its
   tree path (for click-to-edit); opts.overrides swaps in edited runs. Nodes
   may carry ed (edit key) / mv (move key) / edc + mvr for table cells/rows. */
function docHTML(nodes, values, opts = {}, prefix = ""){
  let h = "", i = 0;
  const path = k => prefix === "" ? String(k) : prefix + "." + k;
  const attrs = (n, p) => {
    let a = "";
    if (opts.paths && p != null) a += ` data-path="${p}"`;
    if (n.ed) a += ` data-ed="${esc(n.ed)}"`;
    if (opts.overrides && p != null && opts.overrides[p]) a += ` data-edited="1"`;
    return a;
  };
  const R = (n, p) => (opts.overrides && p != null && opts.overrides[p]) ? rtHTML(opts.overrides[p]) : rtHTML(n.r, values);
  while (i < (nodes || []).length) {
    const n = nodes[i];
    if (n.t === "bulleted_list_item" || n.t === "numbered_list_item") {
      const tag = n.t === "numbered_list_item" ? "ol" : "ul"; let items = "";
      while (i < nodes.length && nodes[i].t === n.t) {
        const x = nodes[i], p = path(i); i++;
        items += `<li${x.mv ? ` data-mv="${esc(x.mv)}"` : ""}><span class="ln"${attrs(x, p)}>${R(x, p)}</span>${x.ch ? docHTML(x.ch, values, opts, p) : ""}</li>`;
      }
      h += `<${tag}>${items}</${tag}>`; continue;
    }
    const p = path(i); i++;
    const kids = n.ch && n.ch.length ? docHTML(n.ch, values, opts, p) : "";
    switch (n.t) {
      case "heading_1": h += `<h2${attrs(n, p)}>${R(n, p)}</h2>${kids}`; break;
      case "heading_2": h += `<h3${attrs(n, p)}>${R(n, p)}</h3>${kids}`; break;
      case "heading_3": h += `<h4${attrs(n, p)}>${R(n, p)}</h4>${kids}`; break;
      case "paragraph": h += `<p${attrs(n, p)}>${R(n, p)}</p>${kids ? `<div style="padding-left:18px">${kids}</div>` : ""}`; break;
      case "quote": h += `<blockquote><span${attrs(n, p)}>${R(n, p)}</span>${kids}</blockquote>`; break;
      case "callout": h += `<div class="callout bg-${esc(n.k || "default")}">${n.ic ? `<div class="ic">${n.ic}</div>` : ""}<div class="cb"><p${attrs(n, p)}>${R(n, p)}</p>${kids}</div></div>`; break;
      case "toggle": h += `<details ${n.open === false ? "" : "open"}><summary><span${attrs(n, p)}>${R(n, p)}</span></summary><div class="kids">${kids}</div></details>`; break;
      case "to_do": h += `<div class="todo"><span class="box">${n.chk ? "✓" : ""}</span><span${attrs(n, p)}>${R(n, p)}</span></div>`; break;
      case "divider": h += `<hr>`; break;
      case "image": h += n.u && !/^enc:/.test(n.u) ? `<img src="${esc(n.u)}" alt="">` : ""; break;
      case "embed": case "bookmark": case "video": h += `<div class="embed">${/zite|fillout/.test(n.u || "") ? "Signature form" : "Embed"} · ${esc((n.u || "").replace(/^https?:\/\//, "").slice(0, 60))}</div>`; break;
      case "table": {
        const rows = n.rows || [];
        h += `<table>${rows.map((r, k) => `<tr class="${k === 0 && n.hdr ? "hdr" : ((n.cls && n.cls[k]) || "")}"${n.mvr && n.mvr[k] ? ` data-mv="${esc(n.mvr[k])}"` : ""}>${r.map((c, ci) => {
          const ed = n.edc && n.edc[k] && n.edc[k][ci];
          return `<td class="${ci > 0 && n.num ? "num" : ""}"${ed ? ` data-ed="${esc(ed)}"` : ""}>${rtHTML(c, values)}</td>`;
        }).join("")}</tr>`).join("")}</table>`;
        break;
      }
      case "columns": h += `<div class="cols">${(n.ch || []).map((c, ci) => `<div>${docHTML(c.ch || [], values, opts, p + "." + ci)}</div>`).join("")}</div>`; break;
    }
  }
  return h;
}

/* ── Click-to-edit plumbing ── */
/* DOM of an edited element -> runs (bold/italic/underline/links survive). */
function domRuns(el){
  const out = [];
  (function walk(node, f){
    if (node.nodeType === 3) { if (node.nodeValue) out.push({ x: node.nodeValue, ...f }); return; }
    if (node.nodeType !== 1) return;
    const t = node.tagName, g = { ...f };
    if (t === "BR") { out.push({ x: "\n", ...f }); return; }
    if (t === "B" || t === "STRONG") g.b = 1;
    if (t === "I" || t === "EM") g.i = 1;
    if (t === "U") g.u = 1;
    if (t === "A" && node.getAttribute("href")) g.h = node.getAttribute("href");
    if (node.classList && [...node.classList].some(c => /^c-/.test(c))) g.k = [...node.classList].find(c => /^c-/.test(c)).slice(2);
    if ((t === "DIV" || t === "P") && out.length && out[out.length - 1].x.slice(-1) !== "\n") out.push({ x: "\n", ...f });
    node.childNodes.forEach(c => walk(c, g));
  })(el, {});
  const merged = [];
  for (const r of out) { const L = merged[merged.length - 1]; if (L && L.b === r.b && L.i === r.i && L.u === r.u && L.h === r.h && L.k === r.k) L.x += r.x; else merged.push({ ...r }); }
  merged.forEach(r => Object.keys(r).forEach(k => r[k] === undefined && delete r[k]));
  if (merged.length) merged[merged.length - 1].x = merged[merged.length - 1].x.replace(/\n+$/, "");
  return merged.filter(r => r.x);
}
/* runs -> the **bold** *italic* [link](url) shorthand the side panel uses. */
function runsToMd(runs){
  return (runs || []).map(r => { let x = r.x; if (r.h) x = `[${x}](${r.h})`; if (r.b) x = `**${x}**`; if (r.i) x = `*${x}*`; return x; }).join("");
}
const plainOf = el => (el.innerText || "").replace(/ /g, " ").replace(/\n+$/, "");
/* Make el editable now; commit(el) on blur. Enter commits unless multiline. */
function editIn(el, commit, { multiline = false, select = false } = {}){
  if (el.isContentEditable) return;
  el.contentEditable = "true"; el.spellcheck = true; el.classList.add("editing");
  el.focus();
  if (select) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  const key = e => {
    if (e.key === "Escape") { el.blur(); }
    if (e.key === "Enter" && !multiline && !e.shiftKey) { e.preventDefault(); el.blur(); }
    e.stopPropagation();
  };
  const paste = e => { e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain")); };
  el.addEventListener("keydown", key); el.addEventListener("paste", paste);
  el.addEventListener("blur", function done(){
    el.removeEventListener("keydown", key); el.removeEventListener("paste", paste); el.removeEventListener("blur", done);
    el.contentEditable = "false"; el.classList.remove("editing");
    commit(el);
  });
}
/* Drag to reorder: items carry data-mv="group:index". A grip appears on
   hover; dropping on another item of the same group calls onMove. */
function sortable(root, onMove){
  root.querySelectorAll("[data-mv]").forEach(it => {
    if (it.querySelector(":scope > .grip")) return;
    const g = document.createElement("span");
    g.className = "grip"; g.draggable = true; g.title = "Drag to move"; g.textContent = "⠇";
    it.classList.add("movable");
    const host = it.tagName === "TR" ? it.firstElementChild : it;
    host.style.position = "relative"; host.insertBefore(g, host.firstChild);
    g.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", it.dataset.mv); e.dataTransfer.effectAllowed = "move"; it.classList.add("dragging"); });
    g.addEventListener("dragend", () => it.classList.remove("dragging"));
    it.addEventListener("dragover", e => { const src = root.querySelector(".dragging"); if (!src || src === it || src.dataset.mv.split(":")[0] !== it.dataset.mv.split(":")[0]) return; e.preventDefault(); it.classList.add("dropto"); });
    it.addEventListener("dragleave", () => it.classList.remove("dropto"));
    it.addEventListener("drop", e => {
      e.preventDefault(); it.classList.remove("dropto");
      const from = e.dataTransfer.getData("text/plain"), [g1, a] = from.split(":"), [g2, b] = it.dataset.mv.split(":");
      if (g1 === g2 && a !== b) onMove(g1, +a, +b);
    });
  });
}
const moveIn = (arr, a, b) => { const [x] = arr.splice(a, 1); arr.splice(b, 0, x); return arr; };
/* Small floating input (window.prompt is blocked inside Notion embeds). */
function ask(anchor, label, value, onOk){
  document.querySelectorAll(".askpop").forEach(x => x.remove());
  const pop = document.createElement("div"); pop.className = "askpop";
  pop.innerHTML = `<div class="flab">${esc(label)}</div><input value="${esc(value || "")}"><div class="r2" style="margin-top:8px"><button class="primary" data-ok>Apply</button><button data-no>Cancel</button></div>`;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(innerWidth - 300, r.left + r.width / 2 - 140)) + "px";
  pop.style.top = Math.max(8, Math.min(innerHeight - 120, r.top + 12)) + "px";
  const inp = pop.querySelector("input"); inp.focus(); inp.select();
  const ok = () => { onOk(inp.value.trim()); pop.remove(); };
  pop.querySelector("[data-ok]").onclick = ok; pop.querySelector("[data-no]").onclick = () => pop.remove();
  inp.onkeydown = e => { if (e.key === "Enter") ok(); if (e.key === "Escape") pop.remove(); };
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
window.WCSHub = { domRuns, runsToMd, plainOf, editIn, sortable, moveIn, ask, esc, b64, MO, d0, iso, today, fmt, fmtY, fmtLong, money, addMonths, getKey, loadFeed, conn, setConn, post, watch, toast, openUrl, parseRT, P, lines, paras, fillRuns, rtHTML, docHTML, fitPaper, wireGroups, TOKEN };
})();
