/* WCStudios deck renderer, shared by the player (deck.html) and the deck
   builder (deck-builder.html) so what you build is exactly what presents.
   Input is the node shape the invoice worker produces from a Notion page. */
(function(){
/* ── rich text ─────────────────────────────── */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
function rt(arr){
  return (arr || []).map(r => {
    let h = esc(r.x).replace(/\n/g, "<br>");
    if (r.c) h = `<code>${h}</code>`;
    if (r.b) h = `<strong>${h}</strong>`;
    if (r.i) h = `<em>${h}</em>`;
    if (r.u) h = `<u>${h}</u>`;
    if (r.s) h = `<s>${h}</s>`;
    if (r.k && !/_background$/.test(r.k)) h = `<span class="c-${r.k}">${h}</span>`;
    if (r.h && /^https?:/.test(r.h)) h = `<a href="${esc(r.h)}" target="_blank" rel="noopener">${h}</a>`;
    return h;
  }).join("");
}
const txt = n => (n.r || []).map(r => r.x).join("");

function videoEmbed(u){
  if (!u) return null;
  let m;
  if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-f0-9]+))?/))) return `https://player.vimeo.com/video/${m[1]}${m[2] ? "?h=" + m[2] + "&" : "?"}title=0&byline=0&portrait=0&dnt=1`;
  if ((m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/))) return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&modestbranding=1`;
  if (/frame\.io|wistia|loom\.com\/share/.test(u)) return u;
  return null;
}

/* ── slide model ───────────────────────────── */
function chunks(nodes){
  const out = []; let cur = [];
  nodes.forEach(n => { if (n.t === "divider") { out.push(cur); cur = []; } else cur.push(n); });
  out.push(cur);
  return out.map((c, i) => ({ ix: i, nodes: c })).filter(c => c.nodes.length);
}
const LAYOUTS = ["cover","text","split","full","stats","quote","table","video","gallery"];
function hintOf(N){
  // An image caption "layout: split" pins the layout (the deck builder writes these).
  for (const n of N) {
    const m = n.t === "image" && (n.cap || []).map(r => r.x).join("").match(/^\s*layout:\s*(\w+)/i);
    if (m && LAYOUTS.includes(m[1].toLowerCase())) return m[1].toLowerCase();
  }
  return null;
}
function classify(s, first){
  const N = s.nodes, has = t => N.filter(n => n.t === t);
  const hint = hintOf(N);
  if (hint) return hint;
  const imgs = has("image"), vids = N.filter(n => n.t === "video" || ((n.t === "embed" || n.t === "bookmark") && videoEmbed(n.u)));
  const callouts = has("callout"), quotes = has("quote"), tables = has("table"), cols = has("columns");
  const lists = N.filter(n => /list_item|to_do/.test(n.t));
  const paras = has("paragraph").filter(p => txt(p).trim());
  const words = N.reduce((a, n) => a + txt(n).length, 0);
  if (has("heading_1").length) return "cover";
  if (first && !N.some(n => /heading/.test(n.t))) return "cover";
  if (quotes.length) return "quote";
  if (tables.length) return "table";
  if (callouts.length >= 2) return "stats";
  if (vids.length && !imgs.length) return "video";
  if (imgs.length >= 2 && !lists.length && words < 120) return "gallery";
  if (imgs.length && !lists.length && !cols.length && paras.length <= 1 && words < 200) return "full";
  if (imgs.length) return "split";
  return "text";
}

function listHTML(nodes){
  let html = "", i = 0;
  while (i < nodes.length) {
    const t = nodes[i].t;
    if (!/list_item|to_do/.test(t)) { i++; continue; }
    const kind = t === "numbered_list_item" ? "ol" : "ul";
    let items = "";
    while (i < nodes.length && nodes[i].t === t) {
      const n = nodes[i++];
      const sub = (n.ch || []).filter(c => /list_item/.test(c.t));
      items += `<li class="${n.t === "to_do" ? "chk" : ""}"><span>${rt(n.r)}${sub.length ? listHTML(sub) : ""}</span></li>`;
    }
    html += `<${kind} class="lst">${items}</${kind}>`;
  }
  return html;
}
/* Body content in reading order, for text-ish layouts. */
function bodyHTML(nodes, opts = {}){
  let h = "", i = 0, dl = 2;
  const d = () => ` rise d${Math.min(4, dl++)}`;
  while (i < nodes.length) {
    const n = nodes[i];
    if (/list_item|to_do/.test(n.t)) {
      const run = []; while (i < nodes.length && nodes[i].t === n.t) run.push(nodes[i++]);
      h += `<div class="${d()}">${listHTML(run)}</div>`; continue;
    }
    i++;
    switch (n.t) {
      case "heading_3": if (opts.skipEye !== n) h += `<div class="h3s${d()}">${rt(n.r)}</div>`; break;
      case "heading_2": if (opts.skipTitle !== n) h += `<div class="h2${d()}">${rt(n.r)}</div>`; break;
      case "paragraph": if (txt(n).trim()) h += `<p class="p${d()}">${rt(n.r)}</p>`; break;
      case "callout": h += `<p class="p${d()}">${n.ic ? n.ic + " " : ""}${rt(n.r)}</p>`; break;
      case "toggle": h += `<p class="p${d()}"><strong>${rt(n.r)}</strong></p>` + bodyHTML(n.ch || []); break;
      case "columns": {
        const cs = n.ch || [];
        h += `<div class="cols${d()}" style="grid-template-columns:repeat(${cs.length},1fr)">` +
          cs.map(c => `<div>${(c.ch||[]).map(x => x.t === "image" ? `<img data-src="${esc(x.u)}" alt="">` : "").join("")}${bodyHTML((c.ch||[]).filter(x => x.t !== "image"))}</div>`).join("") + `</div>`;
        break;
      }
    }
  }
  return h;
}

function header(N){
  const eye = N.find(n => n.t === "heading_3");
  const title = N.find(n => n.t === "heading_2") || N.find(n => n.t === "heading_1");
  // An h3 only reads as an eyebrow when it comes before the title.
  const isEye = eye && title && N.indexOf(eye) < N.indexOf(title);
  return { eye: isEye ? eye : null, title };
}

function render(s, i, total, deck){
  const N = s.nodes, L = s.layout, el = document.createElement("section");
  el.className = "slide " + L;
  const img = N.find(n => n.t === "image");
  const { eye, title } = header(N);
  const eyeH = eye ? `<div class="eye rise">${rt(eye.r)}</div>` : "";
  const rest = N.filter(n => n !== eye && n !== title && n.t !== "image");
  const meta = esc(deck.client ? "Prepared for " + deck.client : deck.title || "");
  let body = "", bg = null;
  switch (L) {
    case "cover": {
      bg = img ? img.u : (i === 0 ? deck.cover : null);
      const h1 = N.find(n => n.t === "heading_1");
      const t = h1 ? rt(h1.r) : esc(deck.title || "");
      const sub = rest.filter(n => n !== h1);
      const eyeC = eye ? eyeH : (deck.client ? `<div class="eye rise">Prepared for ${esc(deck.client)}</div>` : "");
      body = `<div class="pad">${eyeC}<div class="h1 rise d2">${t}</div>${bodyHTML(sub)}</div>`;
      break;
    }
    case "full":
      bg = img.u;
      body = `<div class="pad">${eyeH}${title ? `<div class="h2 rise d2">${rt(title.r)}</div>` : ""}${bodyHTML(rest)}</div>`;
      break;
    case "split": {
      const flip = i % 2 === 0;
      if (flip) el.classList.add("flip");
      body = `<div class="pic" data-bg="${esc(img.u)}"></div><div class="txt">${eyeH}${title ? `<div class="h2 rise d2">${rt(title.r)}</div>` : ""}${bodyHTML(rest)}</div>`;
      break;
    }
    case "stats": {
      const cs = N.filter(n => n.t === "callout");
      const cards = cs.map((c, k) => {
        const r = c.r || [];
        let big = "", lab = r;
        if (r[0] && r[0].b) { big = esc(r[0].x.trim()); lab = r.slice(1); }
        return `<div class="stat rise d${Math.min(4, k + 2)}">${c.ic && !big ? `<div class="ic">${c.ic}</div>` : ""}${big ? `<div class="big">${big}</div>` : ""}<div class="lab">${rt(lab).replace(/^\s*(<br>)*/, "")}</div></div>`;
      }).join("");
      const other = rest.filter(n => n.t !== "callout");
      body = `<div class="pad">${eyeH}${title ? `<div class="h2 rise">${rt(title.r)}</div>` : ""}${bodyHTML(other)}<div class="grid" style="grid-template-columns:repeat(${Math.min(cs.length, 4)},1fr)">${cards}</div></div>`;
      break;
    }
    case "quote": {
      const q = N.find(n => n.t === "quote");
      const after = N[N.indexOf(q) + 1];
      const who = after && after.t === "paragraph" ? after : null;
      if (img) { bg = img.u; }
      body = `<div class="pad"><div class="qm rise">&ldquo;</div><div class="qt rise d2">${rt(q.r)}</div>${who ? `<div class="who rise d3">${rt(who.r)}</div>` : ""}</div>`;
      if (img) el.classList.add("qbg");
      break;
    }
    case "table": {
      const t = N.find(n => n.t === "table");
      const rows = t.rows || [];
      const head = t.hdr && rows.length ? rows[0] : null;
      const bodyRows = head ? rows.slice(1) : rows;
      const tbl = `<table class="rise d3">${head ? `<tr>${head.map(c => `<th>${rt(c)}</th>`).join("")}</tr>` : ""}${bodyRows.map(r => `<tr>${r.map(c => `<td>${rt(c)}</td>`).join("")}</tr>`).join("")}</table>`;
      body = `<div class="pad">${eyeH}${title ? `<div class="h2 rise d2">${rt(title.r)}</div>` : ""}${bodyHTML(rest.filter(n => n.t !== "table"))}${tbl}</div>`;
      break;
    }
    case "video": {
      const v = N.find(n => n.t === "video" || ((n.t === "embed" || n.t === "bookmark") && videoEmbed(n.u)));
      const src = videoEmbed(v.u);
      const inner = src ? `<iframe data-src="${esc(src)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`
                        : `<video controls playsinline data-src="${esc(v.u)}" style="width:100%;height:100%;background:#000"></video>`;
      body = `<div class="pad">${eyeH}${title ? `<div class="h2 rise d2">${rt(title.r)}</div>` : ""}${bodyHTML(rest.filter(n => n !== v))}<div class="frame rise d3">${inner}</div></div>`;
      break;
    }
    case "gallery": {
      const ims = N.filter(n => n.t === "image");
      const cols = ims.length <= 2 ? ims.length : ims.length === 4 ? 2 : 3;
      body = `<div class="pad">${eyeH}${title ? `<div class="h2 rise d2">${rt(title.r)}</div>` : ""}<div class="gg rise d3" style="grid-template-columns:repeat(${cols},1fr)">${ims.map(x => `<div data-bg="${esc(x.u)}"></div>`).join("")}</div></div>`;
      break;
    }
    default:
      body = `<div class="pad">${eyeH}${title ? `<div class="h2 rise d2">${rt(title.r)}</div>` : ""}${bodyHTML(rest)}</div>`;
  }
  const onimg = bg && L !== "split";
  if (L === "quote" && img) {
    el.innerHTML = `<div class="qpic" data-bg="${esc(img.u)}"></div>` + body;
  } else {
    el.innerHTML = (bg ? `<div class="bgimg" data-bg="${esc(bg)}"></div><div class="scrim"></div>` : "") + body;
  }
  if (onimg && L !== "quote") el.classList.add("onimg");
  if ((L === "cover" || L === "full") && !bg) el.classList.add("noimg");
  el.insertAdjacentHTML("beforeend", `<div class="mark"><b>WCS</b>TUDIOS</div>${i > 0 ? `<div class="meta">${meta}</div>` : ""}<div class="num">${i + 1} / ${total}</div>`);
  return el;
}


window.WCSDeck = { chunks, classify, render, bodyHTML, rt, txt, esc, videoEmbed, LAYOUTS };
})();
