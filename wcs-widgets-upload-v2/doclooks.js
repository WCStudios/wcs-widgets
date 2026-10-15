/* DocsOS looks: Studio, Midnight, Editorial and Classic for contracts and
   proposals. Loaded after the builder's own script with
     <script src="doclooks.js" data-kind="Proposal"></script>
   Every time the builder repaints #doc, this lifts the title and facts into a
   header, tags the section heads, and sets one lk-* class; doclooks.css does
   the rest. It never touches the builder's state, its render(), or what gets
   sent to Notion: only the preview and Save PDF change. Editing still works
   because the builders find their targets with closest() on #doc, and nothing
   leaves #doc.

   Proposals can also carry a cover photo, a "Why WCStudios" page and an
   "Our process" page. Those come live from the website's content.js, so what
   WebsiteOS publishes is what clients read here. Every look ends on a
   signature page that docsign.js fills in when the document is sent. */
(function(){
  "use strict";
  const me = document.currentScript;
  const KIND = (me && me.dataset.kind) || "Document";
  const KEY = "wcsDocLook." + KIND.toLowerCase();
  const LOGO = "doc-logo.png";                 // the invoice's band logo, baked onto black
  const LOOKS = [
    { id: "studio",    name: "Studio",    note: "Matches the invoice" },
    { id: "midnight",  name: "Midnight",  note: "Matches the decks: a full dark cover page" },
    { id: "editorial", name: "Editorial", note: "Serif and numbered sections, for bigger pitches" },
    { id: "classic",   name: "Classic",   note: "Formal, numbered clauses and signature lines" },
  ];
  const doc = document.getElementById("doc");
  const form = document.querySelector(".split > .form");
  if (!doc || !form) return;

  let look = "studio";
  try { const v = localStorage.getItem(KEY); if (LOOKS.some(l => l.id === v)) look = v; } catch (e) {}

  const SITE_URL = "https://wcstudios.pages.dev/";
  const OPTS_KEY = KEY + ".opts";
  const DEFAULTS = KIND === "Proposal" ? { cover: "", about: true, process: true } : { cover: "", about: false, process: false };
  let opts = { ...DEFAULTS };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(OPTS_KEY) || "{}")); } catch (e) {}
  let SITE = null;
  let meta = { org: "", person: "", title: "" };

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const PICTO = /\p{Extended_Pictographic}/u;
  const ONLY_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u;

  /* ── Picker ─────────────────────────────────────────────────────────── */
  const pick = el("div", "pick lookpick",
    `<label>Look</label><div class="looks">${LOOKS.map(l =>
      `<button type="button" data-look="${l.id}" title="${esc(l.note)}" aria-pressed="false">` +
      `<i class="th th-${l.id}"><s></s><s></s><s></s></i><span>${l.name}</span></button>`).join("")}</div>`);
  form.insertBefore(pick, form.firstChild);
  const lo = el("div", "lookopts",
    `<label class="lo-row"><span>Cover photo</span><select id="loCover"><option value="">None</option></select></label>` +
    `<label class="lo-sw"><input type="checkbox" id="loAbout"> Include this page</label>` +
    `<label class="lo-sw"><input type="checkbox" id="loProcess"> Include this page</label>` +
    `<p class="lo-note" id="loNote"></p>`);
  const $lo = id => document.getElementById(id) || lo.querySelector("#" + id);
  $lo("loAbout").checked = !!opts.about; $lo("loProcess").checked = !!opts.process;
  ["loCover", "loAbout", "loProcess"].forEach(id => $lo(id).addEventListener("change", () => {
    opts = { cover: $lo("loCover").value, about: $lo("loAbout").checked, process: $lo("loProcess").checked };
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(opts)); } catch (e) {}
    rerender();
  }));

  /* Text you change on the pages this script draws, for this document only. */
  const LKEY = KEY + ".edits";
  let ED = {};
  try { ED = JSON.parse(localStorage.getItem(LKEY) || "{}") || {}; } catch (e) {}
  const saveED = () => { try { localStorage.setItem(LKEY, JSON.stringify(ED)); } catch (e) {} };
  const tx = (k, d) => (ED[k] != null && ED[k] !== "") ? ED[k] : d;
  const DEFS = {};
  const T = k => esc(tx(k, DEFS[k] || ""));
  { const r = document.getElementById("bReset"); if (r) r.addEventListener("click", () => { ED = {}; saveED(); }); }
  pick.addEventListener("click", e => {
    const b = e.target.closest("button[data-look]"); if (!b) return;
    look = b.dataset.look;
    try { localStorage.setItem(KEY, look); } catch (err) {}
    paintLook(); refit();
    if (SITE && (opts.about || opts.process)) rerender();   // where the extra pages sit depends on the look
  });

  /* ── Dress whatever the builder just rendered ───────────────────────── */
  function dress(){
    const cover = doc.querySelector(":scope > .cover"), pg = doc.querySelector(":scope > .pg");
    if (!cover || !pg) return false;             // error and loading states pass through as they are

    const h1 = pg.querySelector(":scope > h1.t"), props = pg.querySelector(":scope > .props");
    const pv = {};
    if (props) { const k = [...props.children]; for (let i = 0; i + 1 < k.length; i += 2) pv[k[i].textContent.trim().toLowerCase()] = k[i + 1].textContent.trim(); }
    const org = pv.company || pv.party || "";
    const person = pv.client || "";
    meta = { org: /^(company|client)$/i.test(org) ? "" : org, person: /^client contact$/i.test(person) ? "" : person,
             title: h1 ? h1.textContent.trim() : "" };

    // Header: logo + wordmark + tagline on the left, document type on the right, then the title block.
    const brand = el("div", "brandbox");
    const img = new Image(); img.className = "lg"; img.alt = "WCStudios"; img.src = LOGO; img.onload = refit;
    brand.append(img);
    const wm = cover.querySelector(".wm"), tag = cover.querySelector(".tag");
    if (wm) brand.append(wm);
    if (tag) brand.append(tag);
    cover.append(brand, el("div", "kd", `<div class="kw">${esc(KIND)}</div>` + (org ? `<div class="kn">Prepared for ${esc(org)}</div>` : "")));
    const hero = el("div", "hero"); hero.dataset.kind = KIND;
    const tl = h1 ? h1.textContent.trim().length : 0;
    if (tl > 52) hero.dataset.len = "xl"; else if (tl > 30) hero.dataset.len = "l";
    if (h1) hero.append(h1);
    if (props) hero.append(props);
    const head = el("header", "head"); head.append(cover, hero);
    if (opts.cover) { head.classList.add("has-photo"); head.style.setProperty("--photo", `url("${opts.cover}")`); }
    doc.insertBefore(head, pg);

    // Section heads: top-level headings (proposals), and the heading inside each orange callout
    // (contract templates). Only the heading is styled: some of those callouts carry body text too.
    pg.querySelectorAll(":scope > h2, :scope > h3, :scope > h4").forEach(h => h.classList.add("sec"));
    pg.querySelectorAll(":scope > .callout.bg-orange_background").forEach(c => {
      const h = c.querySelector(":scope > .cb > h2, :scope > .cb > h3, :scope > .cb > h4");
      if (h) { c.classList.add("seccall"); h.classList.add("sec"); }
    });

    // A heading's leading emoji, when it is part of the text rather than its own span. Only
    // where the heading is not editable, so an edit can never lose the emoji from Notion.
    const LEAD = /^(\s*)((?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200d|\ufe0f)+)\s*/u;
    pg.querySelectorAll(".sec").forEach(sec => {
      const w = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
      let t; while ((t = w.nextNode()) && !t.nodeValue.trim()) {}
      if (!t || t.parentElement.closest("[data-ed],[data-path],[contenteditable]")) return;
      const m = t.nodeValue.match(LEAD); if (!m || !PICTO.test(m[2])) return;
      const span = el("span", "emo"); span.textContent = m[0];
      t.parentNode.insertBefore(span, t); t.nodeValue = t.nodeValue.slice(m[0].length);
    });

    // Emoji-only spans in headings come off in every look; the Notion page keeps them.
    pg.querySelectorAll(".sec span, .sec strong").forEach(s => {
      const t = s.textContent;
      if (!s.children.length && PICTO.test(t) && ONLY_EMOJI.test(t)) s.classList.add("emo");
    });

    // The two blue callouts that open a contract are the parties: set them side by side.
    const blues = [];
    for (const c of pg.children) { if (c.matches(".callout.bg-blue_background")) blues.push(c); else break; }
    if (blues.length >= 2) { const row = el("div", "parties"); pg.insertBefore(row, blues[0]); blues.forEach(b => row.append(b)); }

    // Why WCStudios and Our process, from the website, between the opening section and the rest.
    if (SITE && (opts.about || opts.process)) {
      const mods = el("div", "mods");
      if (opts.about) mods.append(aboutModule());
      if (opts.process) mods.append(processModule());
      // Midnight opens on them, right after its dark cover, the way a deck would. The white
      // looks read the overview first and let the pages flow.
      const heads = [...pg.children].filter(c => c.classList.contains("sec") || c.classList.contains("seccall") || c.classList.contains("parties"));
      const at = look === "midnight" ? pg.firstElementChild : heads.find((c, i) => i > 0 && !c.classList.contains("parties"));
      pg.insertBefore(mods, at || null);
    }

    // Paper only: a short table prints whole instead of splitting its total onto the next page.
    pg.querySelectorAll("table").forEach(t => { if (t.offsetHeight && t.offsetHeight < 576) t.classList.add("keep"); });

    // Signature lines (Classic shows them) and a footer line, printed together with the last
    // short block so the footer never ends up alone on a page.
    const tail = el("div", "tail");
    const last = pg.lastElementChild;
    if (last && last.offsetHeight && last.offsetHeight < 200) {
      const prev = last.previousElementSibling;           // its heading goes with it
      if (prev && prev.classList.contains("sec")) tail.append(prev);
      tail.append(last);
    }
    tail.append(signaturePage());
    tail.append(el("footer", "dfoot", `<span><b>WCStudios</b> · A video &amp; post production company · Eden Prairie, MN</span><span>bennett@wcstudios.co</span>`));
    pg.append(tail);
    return true;
  }

  /* ── Signature page ───────────────────────────────────────────────────
     The client's area is marked with <!--SIG:client--> ... <!--/SIG:client-->:
     the signing service replaces exactly that region when the client signs.
     The sender's area shows your saved signature once docsign.js has it. */
  function signaturePage(){
    let mine = null;
    try { mine = JSON.parse(localStorage.getItem("wcsSenderSig.v1") || "null"); } catch (e) {}
    const who = meta.person || "Client", org = meta.org;
    const sender = mine && mine.png
      ? `<div class="sig-done preview"><img class="sig-img" alt="" src="${esc(mine.png)}"></div>`
      : `<span class="sig-wait">Your signature</span>`;
    return el("section", "sigs",
      `<div class="sk" data-lk="sig.sk">${T("sig.sk")}</div>` +
      `<p class="sx" data-lk="sig.sx">${T("sig.sx")}</p>` +
      `<div class="sgrid">` +
        `<div class="sigblock" data-party="sender"><div class="sig-area">${sender}</div>` +
          `<div class="sig-who"><b>${esc((mine && mine.name) || "Bennett Witta")}</b><span>WCStudios</span></div></div>` +
        `<div class="sigblock" data-party="client"><div class="sig-area"><!--SIG:client--><span class="sig-wait">Client signature</span><!--/SIG:client--></div>` +
          `<div class="sig-who"><b>${esc(who)}</b><span>${esc(org)}</span></div></div>` +
      `</div>`);
  }

  /* ── Site content ─────────────────────────────────────────────────────── */
  const plain = h => { const d = document.createElement("div"); d.innerHTML = String(h || "").replace(/<br\s*\/?>/gi, " "); return d.textContent.replace(/\s+/g, " ").trim(); };
  const sentence = t => t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()) : t;
  // Real client quotes only: the site still carries two placeholders.
  const REAL_QUOTES = ["Minnesota Wild", "Walser Automotive", "USHL"];

  function shapeSite(c){
    const cp = c.copy || {}, g = k => plain(cp[k]);
    const covers = (c.projects || []).filter(p => p.status === "Live" && p.cover)
      .map(p => ({ name: (p.card && p.card.title) || p.name, src: SITE_URL + p.cover }));
    const bts = (c.images || []).filter(i => /\.(webp|jpe?g|png)$/i.test(i.src || ""))
      .map((i, k) => ({ name: (i.alt && i.alt.trim()) || "Behind the scenes " + (k + 1), src: SITE_URL + i.src }));
    const quote = (c.reviews || []).find(r => r.show !== false && REAL_QUOTES.includes(r.company) && r.quote);
    return {
      about: { title: sentence(g("about.title")), p1: g("about.p1"), p2: g("about.p2") },
      stats: [1, 2, 3].map(n => ({ num: g(`stats.${n}.num`).toUpperCase(), label: g(`stats.${n}.label`) })).filter(s => s.num),
      process: [1, 2, 3, 4].map(n => ({ name: g(`process.${n}.name`), desc: g(`process.${n}.desc`) })).filter(s => s.name),
      processSub: g("process.sub"),
      logos: (c.logos || []).map(l => l.name || l.alt).filter(Boolean),
      quote: quote ? { text: plain(quote.quote), name: quote.name, company: quote.company } : null,
      covers, bts,
    };
  }

  function buildDefs(){
    DEFS["sig.sk"] = "Accepted and agreed";
    DEFS["sig.sx"] = `Signing below, both parties agree to the terms of this ${KIND.toLowerCase()}.`;
    if (!SITE) return;
    const a = SITE.about;
    Object.assign(DEFS, { "about.mk": "Why WCStudios", "about.title": a.title, "about.p1": a.p1, "about.p2": a.p2 });
    SITE.stats.forEach((x, i) => { DEFS[`stat.${i}.n`] = x.num; DEFS[`stat.${i}.l`] = x.label; });
    if (SITE.quote) { DEFS["quote.text"] = SITE.quote.text; DEFS["quote.who"] = `${SITE.quote.name} · ${SITE.quote.company}`; }
    if (SITE.logos.length) DEFS["trusted"] = SITE.logos.join(" · ");
    Object.assign(DEFS, { "proc.mk": "How it runs", "proc.title": "Our process" });
    if (SITE.processSub) DEFS["proc.sub"] = SITE.processSub;
    SITE.process.forEach((x, i) => { DEFS[`step.${i}.name`] = x.name; DEFS[`step.${i}.desc`] = x.desc; });
  }
  buildDefs();

  function aboutModule(){
    return el("section", "mod about",
      `<div class="mk" data-lk="about.mk">${T("about.mk")}</div><h2 class="mt" data-lk="about.title">${T("about.title")}</h2>` +
      `<div class="mcols"><p data-lk="about.p1">${T("about.p1")}</p><p data-lk="about.p2">${T("about.p2")}</p></div>` +
      (SITE.stats.length ? `<div class="stats">${SITE.stats.map((x, i) => `<div><b data-lk="stat.${i}.n">${T(`stat.${i}.n`)}</b><span data-lk="stat.${i}.l">${T(`stat.${i}.l`)}</span></div>`).join("")}</div>` : "") +
      (SITE.quote ? `<figure class="quote"><blockquote data-lk="quote.text">${T("quote.text")}</blockquote><figcaption data-lk="quote.who">${T("quote.who")}</figcaption></figure>` : "") +
      (SITE.logos.length ? `<div class="trusted"><span>Trusted by</span><i class="tl" data-lk="trusted">${T("trusted")}</i></div>` : ""));
  }

  function processModule(){
    return el("section", "mod process",
      `<div class="mk" data-lk="proc.mk">${T("proc.mk")}</div><h2 class="mt" data-lk="proc.title">${T("proc.title")}</h2>` +
      (DEFS["proc.sub"] || ED["proc.sub"] ? `<p class="msub" data-lk="proc.sub">${T("proc.sub")}</p>` : "") +
      `<ol class="steps">${SITE.process.map((x, i) => `<li><i>${String(i + 1).padStart(2, "0")}</i><b data-lk="step.${i}.name">${T(`step.${i}.name`)}</b><span data-lk="step.${i}.desc">${T(`step.${i}.desc`)}</span></li>`).join("")}</ol>`);
  }

  function fillOptions(){
    const sel = $lo("loCover");
    const grp = (label, list) => list.length ? `<optgroup label="${esc(label)}">${list.map(x => `<option value="${esc(x.src)}">${esc(x.name)}</option>`).join("")}</optgroup>` : "";
    // Behind-the-scenes first: several project covers carry their own title art.
    sel.innerHTML = `<option value="">None</option>` + grp("Behind the scenes", SITE.bts) + grp("Project covers", SITE.covers);
    sel.value = [...sel.options].some(o => o.value === opts.cover) ? opts.cover : "";
    if (sel.value !== opts.cover) opts.cover = sel.value;
    $lo("loNote").textContent = "Copy and photos come from the website, so WebsiteOS edits show up here.";
  }

  /* The builders keep render() private, but both redraw on an input event from a
     field whose listener does nothing else: #company (proposals), #rStatus (contracts). */
  function rerender(){
    const t = document.getElementById(KIND === "Proposal" ? "company" : "rStatus");
    if (t) { t.dispatchEvent(new Event("input", { bubbles: true })); return; }
    paintLook(); refit();
  }

  async function loadSite(){
    try {
      const r = await fetch(SITE_URL + "content.js", { cache: "no-store" });
      const t = await r.text();
      SITE = shapeSite(JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)));
      buildDefs();
      fillOptions();
      if (opts.cover || opts.about || opts.process) rerender(); else refit();   // the switched-off pages get their layers
    } catch (e) {
      console.warn("doclooks: site content", e);
      $lo("loNote").textContent = "Couldn't reach the website for photos and copy. The rest of the look still works.";
      lo.querySelectorAll("select,input").forEach(x => x.disabled = true);
    }
  }

  function paintLook(){
    LOOKS.forEach(l => doc.classList.toggle("lk-" + l.id, l.id === look));
    pick.querySelectorAll("button[data-look]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.look === look)));
  }

  /* ── Pages ─────────────────────────────────────────────────────────────
     The preview is laid out as Letter sheets with a gap between them, the
     same breaks the PDF gets. Between two sheets sits a .pgbrk spacer: on
     screen it fills out the page and leaves the gap, in print it is a forced
     page break plus the top margin of the next page. So what you see on page
     3 here is page 3 of the PDF, for Save PDF and for the signed copy alike.
     Nothing here touches the builder's state; spacers live only in #doc. */
  const PH = 1056, G = 26, TOPM = 58, BOTM = 62;      // 11in sheet, gap, ~.6in margins on continued pages
  const CONTENT = PH - TOPM - BOTM;
  const pageTop = k => k * (PH + G), pageEnd = k => pageTop(k) + PH;
  const ZKEY = "wcsDocZoom.v1";
  let zoom = { mode: "page", pct: 1 };
  try { Object.assign(zoom, JSON.parse(localStorage.getItem(ZKEY) || "{}")); } catch (e) {}
  let pages = 1, scale = 1;
  const SKIP = n => n.classList && (n.classList.contains("pgbrk") || n.classList.contains("pgov"));
  const prevEl = n => { let s = n.previousElementSibling; while (s && SKIP(s)) s = s.previousElementSibling; return s; };
  const nextEl = n => { let s = n.nextElementSibling; while (s && SKIP(s)) s = s.nextElementSibling; return s; };
  const PAGEV = /^(page|always|left|right|recto|verso)$/;
  // A forced break before an element counts if it, or an ancestor it opens, asks for one; after, likewise for closing.
  function forced(a, prop, first){
    for (let n = a; n && n !== doc; n = n.parentElement){
      if (PAGEV.test(getComputedStyle(n)[prop])) return true;
      if (first ? prevEl(n) : nextEl(n)) break;
    }
    return false;
  }
  const NOSPLIT = "img,svg,canvas,figure,video,tr,.head,.sigs,.parties,.cols,.stats,.mcols,.steps>li,.sgrid,.dfoot";
  function atomsOf(node, out){
    for (const c of node.children){
      if (SKIP(c) || !c.getClientRects().length) continue;     // hidden by the look
      const r = c.getBoundingClientRect();
      const h = r.height / scale;
      // Full dark pages are one sheet each; split them only if they run past it.
      const lim = parseFloat(getComputedStyle(c).minHeight) >= PH - 4 ? PH + 4 : CONTENT;
      if (c.matches(".pg,.mods") || (h > lim && c.children.length && !c.matches(NOSPLIT))) {
        if (c.tagName === "TABLE") { for (const row of c.rows) out.push(row); }
        else atomsOf(c, out);
      } else out.push(c);
    }
    return out;
  }
  function clearPages(){
    doc.querySelectorAll(".pgbrk").forEach(n => n.remove());
    doc.querySelectorAll(":scope > .pgov").forEach(n => n.remove());
    doc.style.minHeight = "";
  }
  function paginate(){
    clearPages();
    pages = 1;
    if (!doc.querySelector(":scope > .pg") || !doc.offsetWidth) return;
    scale = doc.getBoundingClientRect().width / doc.offsetWidth || 1;
    const Y = n => (n.getBoundingClientRect().top - doc.getBoundingClientRect().top) / scale;
    const B = n => (n.getBoundingClientRect().bottom - doc.getBoundingClientRect().top) / scale;
    const pageOf = y => Math.floor(Math.max(0, y - 1) / (PH + G));
    const breakBefore = (a, prev) => {
      // Break as high up as the atom opens: before the section it starts, not inside its padding,
      // so a break-after on the element before lands on the same break and never doubles up.
      let host = a;
      while (host.parentElement && host.parentElement !== doc && !prevEl(host)) host = host.parentElement;
      const row = host.tagName === "TR";
      const sp = document.createElement(row ? "tr" : "div");
      sp.className = "pgbrk"; sp.setAttribute("aria-hidden", "true");
      sp.innerHTML = row ? `<td colspan="99"><i class="pf"></i><i class="pt"></i></td>` : `<i class="pf"></i><i class="pt"></i>`;
      host.parentNode.insertBefore(sp, host);
      const y0 = Y(sp), k = pageOf(prev ? B(prev) : y0) + 1;
      const bleed = parseFloat(getComputedStyle(a).minHeight) >= PH - 4;   // full dark pages start at the very top
      sp.querySelector(".pf").style.height = Math.max(0, pageTop(k) - y0) + "px";
      sp.querySelector(".pt").style.height = (bleed ? 0 : TOPM) + "px";
    };
    const atoms = atomsOf(doc, []);
    let first = 0;                                     // index of the first atom on the current sheet
    for (let i = 1; i < atoms.length; i++){
      const a = atoms[i];
      const y = Y(a), b = B(a);
      if (b - y < 1 && !a.children.length) continue;
      const k = Math.floor((y + 1) / (PH + G));
      const hard = i > first && (forced(a, "breakBefore", true) || forced(atoms[i - 1], "breakAfter", false));
      const over = i > first && b > pageEnd(k) - BOTM;
      if (!hard && !over) continue;
      let at = i;
      // Keep a section heading with what follows it.
      if (!hard && i - 1 > first && getComputedStyle(atoms[i - 1]).breakAfter === "avoid") at = i - 1;
      breakBefore(atoms[at], atoms[at - 1]);
      first = at; i = at;
    }
    const last = atoms[atoms.length - 1];
    const end = Math.max(last ? B(last) : 0, Y(doc.querySelector(":scope > .pg")) + 10);
    pages = Math.max(1, Math.floor((end - 1) / (PH + G)) + 1);
    doc.style.minHeight = (pages * PH + (pages - 1) * G) + "px";
    const ov = el("div", "pgov"); ov.setAttribute("aria-hidden", "true");
    for (let j = 0; j < pages - 1; j++){
      const g = el("div", "pgap"); g.style.top = pageEnd(j) + "px"; g.style.height = G + "px"; ov.append(g);
    }
    doc.append(ov);
  }

  /* Zoom: fit a whole page (default), fit the width, or a set size. Replaces the
     hub's width-only fit for these two builders; the deck builder keeps its own. */
  const wrap = document.getElementById("paperWrap"), scaler = document.getElementById("scaler");
  const pill = el("div", "zpill",
    `<button type="button" data-z="page" title="Fit the whole page">Fit page</button>` +
    `<button type="button" data-z="width" title="Fit the width">Fit width</button><i class="zs"></i>` +
    `<button type="button" data-z="-" title="Zoom out">−</button><b id="zPct">100%</b><button type="button" data-z="+" title="Zoom in">+</button><i class="zs"></i>` +
    `<button type="button" data-z="up" title="Previous page">‹</button><span id="zPg">Page 1 of 1</span><button type="button" data-z="dn" title="Next page">›</button>`);
  if (wrap) wrap.append(pill);
  const STEPS = [.4, .5, .6, .7, .8, .9, 1, 1.1, 1.25, 1.5];
  let cur = 1;
  function fitDoc(w, sc, inner){
    if (!w || !sc || !inner) return;
    const W = inner.offsetWidth, Hh = inner.offsetHeight;
    const availW = Math.max(120, w.clientWidth - 40), availH = Math.max(160, w.clientHeight - 108);
    const fw = Math.min(1, availW / W);
    // Fit page: a whole sheet in view, unless the preview is so short (phone, stacked layout) that it would be unreadable.
    const fp = availH / PH < .4 ? fw : Math.min(fw, availH / PH);
    const s = zoom.mode === "page" ? fp : zoom.mode === "width" ? fw : Math.max(.3, Math.min(1.5, +zoom.pct || 1));
    cur = s;
    sc.style.transform = `scale(${s})`; sc.style.flexShrink = "0";
    sc.style.width = W + "px"; sc.style.height = (Hh * s) + "px";
    const m = -(W * (1 - s)) / 2 + "px";              // the box takes W*s of layout, so it centers and scrolls right
    sc.style.marginLeft = m; sc.style.marginRight = m;
    sc.style.alignSelf = W * s > availW ? "flex-start" : "center";
    paintPill();
  }
  function curPage(){
    if (!wrap || !scaler) return 1;
    const top = scaler.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
    const y = (wrap.clientHeight * .35 - top) / cur;
    return Math.min(pages, Math.max(1, Math.floor(y / (PH + G)) + 1));
  }
  function paintPill(){
    pill.querySelector("#zPct").textContent = Math.round(cur * 100) + "%";
    pill.querySelector("#zPg").textContent = `Page ${curPage()} of ${pages}`;
    pill.querySelectorAll("[data-z=page],[data-z=width]").forEach(b => b.classList.toggle("on", b.dataset.z === zoom.mode));
  }
  function goPage(n){
    n = Math.min(pages, Math.max(1, n));
    const top = scaler.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop;
    wrap.scrollTo({ top: top + pageTop(n - 1) * cur - 12, behavior: "smooth" });
  }
  pill.addEventListener("click", e => {
    const b = e.target.closest("button[data-z]"); if (!b) return;
    const z = b.dataset.z;
    if (z === "up" || z === "dn") return goPage(curPage() + (z === "dn" ? 1 : -1));
    const keep = curPage();
    if (z === "page" || z === "width") zoom = { mode: z, pct: cur };
    else {
      const i = STEPS.findIndex(x => x > cur + .001);
      const next = z === "+" ? (i < 0 ? STEPS[STEPS.length - 1] : STEPS[i]) : ([...STEPS].reverse().find(x => x < cur - .001) || STEPS[0]);
      zoom = { mode: "pct", pct: next };
    }
    try { localStorage.setItem(ZKEY, JSON.stringify(zoom)); } catch (err) {}
    fitDoc(wrap, scaler, doc);
    if (zoom.mode === "page") goPage(keep);
  });
  if (wrap) wrap.addEventListener("scroll", () => { pill.querySelector("#zPg").textContent = `Page ${curPage()} of ${pages}`; }, { passive: true });
  if (window.WCSHub) window.WCSHub.fitPaper = fitDoc;   // the builders call H.fitPaper on render and resize

  let pT = 0;
  const later = () => { clearTimeout(pT); pT = setTimeout(() => { guard(paginate); fitDoc(wrap, scaler, doc); try { paintLayers(); } catch (e) {} }, 300); };
  doc.addEventListener("input", later);
  doc.addEventListener("load", later, true);           // pictures that arrive after the layout

  /* ── Layers ────────────────────────────────────────────────────────────
     The panel on the left follows the document: Cover, then each section in
     the order it prints, the Why WCStudios and Our process pages where they
     sit, and the signatures last. One layer is open at a time. Opening one
     scrolls the preview to it; clicking anything on the page opens its layer.
     The builder's own groups are reused (moved, not rebuilt), so their inputs
     and the code that reads them are unchanged. */
  const H$ = () => window.WCSHub;
  const OPEN_KEY = KEY + ".layer";
  const GROUPS = KIND === "Proposal"
    ? [[/^cover$/, "who"], [/overview/i, "overview"], [/scope/i, "scope"], [/plan/i, "plan"], [/breakdown|investment|pricing|budget/i, "items"], [/payment/i, "terms"]]
    : [[/^cover$/, "record"]];
  // Proposal headings carry their own key, so a renamed heading keeps its layer.
  const ED_GROUP = { "fx:h.overview": "overview", "fx:h.scope": "scope", "fx:h.plan": "plan", "fx:h.items": "items", "fx:h.terms": "terms" };
  const AFTER = KIND === "Proposal" ? {} : { cover: ["term"] };            // builder groups that ride along after a layer
  const HIDE = KIND === "Proposal" ? [] : ["blanks"];                      // replaced by per-section blanks
  // A field in the panel for each thing you can click on the page.
  const FIELD = { title: "#title", company: "#company", contact: "#contact", overview: "#overview", scope: "#scope", deliv: "#deliv", pre: "#pre", prod: "#prod", post: "#post" };
  const PROP_FIELD = KIND === "Proposal" ? { company: "#company", client: "#contact", date: "#date" }
    : { party: "#rParty", status: "#rStatus", term: "#pStart", monthly: "#pMonthly", type: "#tPick" };

  const box = el("div", "layers");
  const afterPicks = [...form.children].filter(c => c.classList.contains("pick")).pop();
  form.insertBefore(box, afterPicks ? afterPicks.nextSibling : form.firstChild);
  box.append(el("div", "layhd", `<span>Pages</span><b id="layN"></b>`));
  const list = el("div", "laylist"); box.append(list);
  let layerSig = "", entries = [], openKey = null;
  try { openKey = localStorage.getItem(OPEN_KEY); } catch (e) {}
  const byEl = new WeakMap();

  const LEADX = /^[\s‍️\p{Extended_Pictographic}\p{Emoji_Modifier}]+/u;
  const titleOf = n => {
    const h = n.matches(".seccall") ? n.querySelector(".sec") || n : n;
    const c = h.cloneNode(true); c.querySelectorAll(".emo,.grip").forEach(x => x.remove());
    return c.textContent.replace(LEADX, "").replace(/\s+/g, " ").trim().slice(0, 48) || "Section";
  };
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function outline(){
    const out = [], at = {};
    const push = (key, title, anchor, kind) => {
      if (at[key]) { at[key].els.push(anchor); return at[key]; }
      const e = { key, title, anchor, kind, els: [anchor], toks: [], off: false };
      at[key] = e; out.push(e); return e;
    };
    const take = (e, n) => {
      byEl.set(n, e.key);
      const marks = n.matches("mark[data-tok]") ? [n] : [...n.querySelectorAll("mark[data-tok]")];
      marks.forEach(m => { if (!e.toks.includes(m.dataset.tok)) e.toks.push(m.dataset.tok); });
    };
    const head = doc.querySelector(":scope > .head");
    let cur = head ? push("cover", "Cover", head, "cover") : null;
    if (head) take(cur, head);
    const pg = doc.querySelector(":scope > .pg");
    const visit = c => {
      if (c.classList.contains("pgbrk") || c.classList.contains("dfoot")) return;
      if (c.matches(".mods,.tail")) { [...c.children].forEach(visit); return; }
      if (c.matches(".mod.about")) cur = push("about", "Why WCStudios", c, "about");
      else if (c.matches(".mod.process")) cur = push("process", "Our process", c, "process");
      else if (c.matches(".sigs")) cur = push("sign", "Acceptance & signatures", c, "sign");
      else if (c.matches(".parties")) cur = push("parties", "Parties", c, "sec");
      else if (c.matches(".sec,.seccall")) {
        const t = titleOf(c);
        const hed = c.matches("[data-ed]") ? c.dataset.ed : (c.querySelector(".sec[data-ed]") || {}).dataset?.ed;
        const accept = KIND === "Proposal" && (hed === "fx:h.accept" || (!hed && /accept|agreed|sign/i.test(t)));
        cur = accept ? push("sign", "Acceptance & signatures", c, "sign") : push(hed && ED_GROUP[hed] ? "g:" + ED_GROUP[hed] : "s:" + slug(t), t, c, "sec");
        if (hed && ED_GROUP[hed]) cur.group = ED_GROUP[hed];
      }
      if (cur) take(cur, c);
    };
    if (pg) [...pg.children].forEach(visit);
    // Pages that are switched off still get a layer, where they would sit, so they can be switched on.
    if (SITE) {
      const firstSec = out.findIndex(e => e.kind === "sec");
      const slot = look === "midnight" || firstSec < 0 ? (head ? 1 : 0) : firstSec + 1;
      const ins = [];
      if (!at.about) ins.push({ key: "about", title: "Why WCStudios", kind: "about", els: [], toks: [], off: true });
      if (!at.process) ins.push({ key: "process", title: "Our process", kind: "process", els: [], toks: [], off: true });
      if (ins.length) {
        // keep about before process whichever is on
        let i = Math.min(slot, out.length);
        if (at.about && !at.process) i = out.indexOf(at.about) + 1;
        if (!at.about && at.process) { out.splice(out.indexOf(at.process), 0, ins.shift()); i = out.indexOf(at.process) + 1; }
        out.splice(i, 0, ...ins);
      }
    }
    // Blanks that live nowhere visible (only in the title, say) get a layer of their own.
    if (KIND !== "Proposal") {
      const seen = new Set(out.flatMap(e => e.toks));
      const rest = [...document.querySelectorAll("#blanks input[data-tok]")].map(i => i.dataset.tok).filter(t => !seen.has(t));
      if (rest.length) out.push({ key: "other", title: "Other blanks", kind: "sec", els: [], toks: rest, off: false });
    }
    return out;
  }

  const groupFor = e => { if (e.group) return form.querySelector(`.grp[data-g="${e.group}"]`); const hit = GROUPS.find(([re]) => re.test(e.kind === "cover" ? "cover" : e.title)); return hit ? form.querySelector(`.grp[data-g="${hit[1]}"]`) : null; };
  const origTok = tok => [...document.querySelectorAll("#blanks input[data-tok]")].find(i => i.dataset.tok === tok);

  function shell(g, e){
    g.classList.add("layer"); g.dataset.layer = e.key;
    const lbl = g.querySelector(":scope > .lbl");
    lbl.removeAttribute("data-toggle"); lbl.onclick = null;
    if (!lbl.querySelector(".pgno")) lbl.insertBefore(el("span", "pgno"), lbl.firstChild);
    let lt = lbl.querySelector(".lt");
    if (!lt) {                                       // the builder's label text becomes the layer title
      lt = el("span", "lt");
      const txt = [...lbl.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
      lt.textContent = txt.map(n => n.textContent.trim()).join(" ");
      txt.forEach(n => n.remove());
      lbl.insertBefore(lt, lbl.querySelector(".pgno").nextSibling);
    }
    if (!lbl.querySelector(".sum")) lbl.insertBefore(el("span", "sum"), lbl.querySelector(".chev"));
    return g;
  }
  function newLayer(e){
    const g = el("div", "grp closed", `<div class="lbl"><span class="pgno"></span><span class="lt"></span><span class="sum"></span><span class="chev">›</span></div><div class="gb"></div>`);
    const gb = g.querySelector(".gb");
    if (e.kind === "sec") {
      if (e.toks.length) e.toks.forEach(tok => {
        const f = el("div", "f", `<label></label><input data-proxy="">`);
        f.querySelector("label").textContent = tok; const i = f.querySelector("input"); i.dataset.proxy = tok; i.placeholder = tok;
        i.addEventListener("input", () => { const o = origTok(tok); if (o) { o.value = i.value; o.dispatchEvent(new Event("input", { bubbles: true })); } });
        gb.append(f);
      });
      else gb.append(el("p", "note", "Nothing to fill in here. Click any text on the page to rewrite it."));
    } else if (e.kind === "about" || e.kind === "process") {
      const sw = $lo(e.kind === "about" ? "loAbout" : "loProcess").closest("label");
      gb.append(sw, el("div", "lkfields"));
      const bar = el("div", "lkbar", `<button type="button" class="sp-link" data-reset="${e.kind}">Use the website copy</button>`);
      gb.append(bar, el("p", "note lknote", "Copy comes from the website, so WebsiteOS edits show up here. Anything you change applies to this document only."));
    } else if (e.kind === "sign") {
      gb.append(el("div", "lkfields"));
      gb.append(el("div", "lksig", ""));
    }
    return shell(g, e);
  }

  // Text fields for the pages doclooks draws (Why WCStudios, Our process, signatures).
  const LK_LABEL = k => ({ "about.mk": "Small label", "about.title": "Headline", "about.p1": "Paragraph 1", "about.p2": "Paragraph 2",
    "quote.text": "Quote", "quote.who": "Quote by", "trusted": "Trusted by", "proc.mk": "Small label", "proc.title": "Headline",
    "proc.sub": "Intro", "sig.sk": "Heading", "sig.sx": "Line above the signatures" })[k] ||
    (/^stat\.(\d)\.n$/.test(k) ? `Stat ${+k.split(".")[1] + 1}` : /^stat\.(\d)\.l$/.test(k) ? `Stat ${+k.split(".")[1] + 1} label` :
     /^step\.(\d)\.name$/.test(k) ? `Step ${+k.split(".")[1] + 1}` : /^step\.(\d)\.desc$/.test(k) ? `Step ${+k.split(".")[1] + 1} text` : k);
  function lkFields(g, keys){
    const w = g.querySelector(".lkfields"); if (!w) return;
    const have = [...w.querySelectorAll("[data-lkf]")].map(i => i.dataset.lkf).join("|");
    if (have !== keys.join("|")) {
      w.innerHTML = keys.map(k => {
        const long = /\.(p1|p2|sub|desc|text)$|^sig\.sx$|^trusted$/.test(k);
        return `<div class="f"><label>${esc(LK_LABEL(k))}</label>${long ? `<textarea rows="3" data-lkf="${k}"></textarea>` : `<input data-lkf="${k}">`}</div>`;
      }).join("");
      w.querySelectorAll("[data-lkf]").forEach(i => i.addEventListener("input", () => {
        const k = i.dataset.lkf, v = i.value.trim();
        if (!v || v === DEFS[k]) delete ED[k]; else ED[k] = v;
        saveED(); clearTimeout(lkT); lkT = setTimeout(rerender, 250);
      }));
    }
    w.querySelectorAll("[data-lkf]").forEach(i => { if (document.activeElement !== i) { i.value = tx(i.dataset.lkf, DEFS[i.dataset.lkf] || ""); i.placeholder = DEFS[i.dataset.lkf] || ""; } });
  }
  let lkT = 0;

  function syncLayers(){
    if (!doc.querySelector(":scope > .head")) return;
    const es = outline();
    const sig = es.map(e => e.key + (e.off ? "-" : "+") + e.toks.join(",")).join("|");
    if (sig !== layerSig) {
      layerSig = sig;
      const keep = new Map([...list.children].map(g => [g.dataset.layer, g]));
      [...list.children].forEach(g => { if (g.dataset.g) form.append(g); });
      list.innerHTML = "";
      HIDE.forEach(id => { const g = form.querySelector(`.grp[data-g="${id}"]`); if (g) g.classList.add("layer-hidden"); });
      for (const e of es) {
        let g = groupFor(e);
        if (g) shell(g, e);
        else {
          g = keep.get(e.key);
          const same = g && !g.dataset.g && g.dataset.toks === e.toks.join(",");
          if (!same) g = newLayer(e);
          g.dataset.toks = e.toks.join(",");
        }
        list.append(g);
        if (e.kind === "cover") {
          const row = $lo("loCover").closest("label");
          const gb = g.querySelector(".gb"); if (row.parentElement !== gb) gb.insertBefore(row, gb.firstChild);
        }
        (AFTER[e.key] || []).forEach(id => { const x = form.querySelector(`.grp[data-g="${id}"]`); if (x) { shell(x, { key: id }); x.dataset.layer = "x:" + id; list.append(x); } });
      }
      // Builder groups nothing in the document points at stay usable, at the end.
      form.querySelectorAll(":scope > .grp").forEach(g => { if (!g.classList.contains("layer-hidden")) { shell(g, { key: "x:" + g.dataset.g }); list.append(g); } });
      entries = es;
      list.querySelectorAll(".grp").forEach(g => g.classList.toggle("closed", g.dataset.layer !== openKey));
    }
    entries = es;
    paintLayers();
  }

  function paintLayers(){
    const top0 = doc.getBoundingClientRect().top, s = doc.getBoundingClientRect().width / doc.offsetWidth || 1;
    let n = 0;
    for (const e of entries) {
      const g = list.querySelector(`.grp[data-layer="${CSS.escape(e.key)}"]`); if (!g) continue;
      const lbl = g.querySelector(":scope > .lbl");
      const a = e.els.find(x => x && x.isConnected && x.getClientRects().length);
      const pno = a ? Math.floor(((a.getBoundingClientRect().top - top0) / s + 1) / (PH + G)) + 1 : 0;
      if (pno) n = Math.max(n, pno);
      lbl.querySelector(".pgno").textContent = e.off ? "off" : pno ? String(pno) : "";
      g.classList.toggle("off", !!e.off);
      lbl.querySelector(".lt").textContent = e.title;
      const sum = lbl.querySelector(".sum");
      if (!g.dataset.g) {
        if (e.kind === "sec" && e.toks.length) {
          const filled = e.toks.filter(t => { const o = origTok(t); return o && o.value.trim() && o.value.trim() !== t; }).length;
          sum.textContent = `${filled} of ${e.toks.length} filled`;
        } else if (e.kind === "about" || e.kind === "process") sum.textContent = e.off ? "" : Object.keys(ED).some(k => (e.kind === "about" ? /^(about|stat|quote|trusted)/ : /^(proc|step)/).test(k)) ? "edited" : "from website";
        else if (e.kind === "sign") sum.textContent = meta.person || "";
      }
      g.querySelectorAll("input[data-proxy]").forEach(i => { if (document.activeElement !== i) { const o = origTok(i.dataset.proxy); if (o) i.value = o.value; } });
      if (e.kind === "about") lkFields(g, Object.keys(DEFS).filter(k => /^(about|stat|quote|trusted)/.test(k)));
      if (e.kind === "process") lkFields(g, Object.keys(DEFS).filter(k => /^(proc|step)/.test(k)));
      if (e.kind === "sign") {
        lkFields(g, ["sig.sk", "sig.sx"]);
        const mine = (() => { try { return JSON.parse(localStorage.getItem("wcsSenderSig.v1") || "null"); } catch (x) { return null; } })();
        const w = g.querySelector(".lksig");
        if (w) w.innerHTML = `<p class="note">${esc(meta.person || "The client")} signs on their own copy. ${mine && mine.png ? "Your signature is saved and shows on the page." : "Draw your signature once in Send to sign and it shows on the page."}</p>` +
          (document.getElementById("bSign") ? `<button type="button" class="sp-link" data-open-sign>Open Send to sign</button>` : "");
      }
    }
    const ln = box.querySelector("#layN"); if (ln) ln.textContent = pages + (pages === 1 ? " page" : " pages");
  }

  function openLayer(g, open, how = {}){
    if (!g) return;
    if (open) list.querySelectorAll(".grp:not(.closed)").forEach(o => { if (o !== g) o.classList.add("closed"); });
    g.classList.toggle("closed", !open);
    openKey = open ? g.dataset.layer : null;
    try { openKey ? localStorage.setItem(OPEN_KEY, openKey) : localStorage.removeItem(OPEN_KEY); } catch (e) {}
    if (open && how.panel !== false) {
      const top = g.offsetTop - form.offsetTop - 8;
      if (top < form.scrollTop || top > form.scrollTop + form.clientHeight - 80) form.scrollTo({ top, behavior: "smooth" });
    }
    if (open && how.view) {
      const e = entries.find(x => x.key === g.dataset.layer), a = e && e.els.find(x => x && x.isConnected);
      if (a && wrap) {
        const y = (a.getBoundingClientRect().top - doc.getBoundingClientRect().top) / (doc.getBoundingClientRect().width / doc.offsetWidth || 1);
        const top = scaler.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop + y * cur - 18;
        wrap.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        a.classList.add("lk-flash"); setTimeout(() => a.classList.remove("lk-flash"), 1200);
      }
    }
  }
  list.addEventListener("click", e => {
    const lbl = e.target.closest(".grp > .lbl");
    if (lbl && list.contains(lbl)) { const g = lbl.parentElement; openLayer(g, g.classList.contains("closed"), { view: true }); return; }
    const r = e.target.closest("[data-reset]");
    if (r) { Object.keys(ED).forEach(k => { if ((r.dataset.reset === "about" ? /^(about|stat|quote|trusted)/ : /^(proc|step)/).test(k)) delete ED[k]; }); saveED(); rerender(); return; }
    if (e.target.closest("[data-open-sign]")) { const b = document.getElementById("bSign"); if (b) b.click(); }
  });
  // Opening a layer from outside (the builder's own "connect" nudges etc.) still keeps one open.
  const flash = n => { if (!n) return; n.classList.add("lk-flash"); setTimeout(() => n.classList.remove("lk-flash"), 1200); };

  // Click on the page: open the layer that holds it, and point at the field that feeds it.
  doc.addEventListener("click", e => {
    const t = e.target; if (!(t instanceof Element) || t.closest(".pgov")) return;
    let n = t, key = null;
    while (n && n !== doc && !(key = byEl.get(n))) n = n.parentElement;
    if (!key) return;
    const g = list.querySelector(`.grp[data-layer="${CSS.escape(key)}"]`); if (!g) return;
    if (g.classList.contains("closed")) openLayer(g, true, { panel: true });
    let f = null;
    const ed = t.closest("[data-ed]"), mk = t.closest("mark[data-tok]"), lk = t.closest("[data-lk]");
    if (mk) f = g.querySelector(`input[data-proxy="${CSS.escape(mk.dataset.tok)}"]`);
    else if (lk) f = g.querySelector(`[data-lkf="${CSS.escape(lk.dataset.lk)}"]`);
    else if (ed) { const [k, i] = ed.dataset.ed.split(":"); f = k === "item" ? document.querySelector(`#items .item[data-k="${i}"]`) : FIELD[k] ? document.querySelector(FIELD[k]) : null; }
    else {
      const prop = t.closest(".props > *");
      if (prop) { const lab = (prop.tagName === "B" ? prop.previousElementSibling : prop); const id = PROP_FIELD[(lab && lab.textContent || "").trim().toLowerCase()]; if (id) f = document.querySelector(id); }
    }
    if (f) { const lay = f.closest(".grp.layer"); if (lay && lay.classList.contains("closed")) openLayer(lay, true); flash(f.closest(".f,.item") || f); }
  });

  // Page text doclooks draws (Why WCStudios, Our process, signature page) edits in place too.
  doc.addEventListener("click", e => {
    const t = e.target instanceof Element && e.target.closest("[data-lk]"); const H = H$();
    if (!t || !H || t.isContentEditable) return;
    const k = t.dataset.lk;
    H.editIn(t, x => {
      // textContent, not innerText: several looks set headings in capitals with CSS.
      const c = x.cloneNode(true); c.querySelectorAll("br").forEach(b => b.replaceWith("\n"));
      c.querySelectorAll("div,p").forEach(d => d.prepend("\n"));
      const v = c.textContent.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (!v || v === DEFS[k]) delete ED[k]; else ED[k] = v;
      saveED(); rerender();
    }, { multiline: /\.(p1|p2|sub|desc|text)$|^sig\.sx$/.test(k) });
  });
  // Contracts: the title and party in the header write back to the record.
  if (KIND !== "Proposal") doc.addEventListener("click", e => {
    const H = H$(); if (!H || !(e.target instanceof Element)) return;
    const h1 = e.target.closest(".hero h1.t"), pb = e.target.closest(".props > b");
    const id = h1 ? "rTitle" : pb && /^party$/i.test((pb.previousElementSibling || {}).textContent || "") ? "rParty" : null;
    const inp = id && document.getElementById(id), t = h1 || pb;
    if (!inp || t.isContentEditable) return;
    H.editIn(t, x => { inp.value = H.plainOf(x).trim(); inp.dispatchEvent(new Event("input", { bubbles: true })); }, { select: !h1 });
  });

  function refit(){ guard(paginate); fitDoc(wrap, scaler, doc); try { syncLayers(); } catch (e) { console.warn("layers", e); } }

  // The builders replace #doc's children wholesale on every render; dress each new copy.
  // The page overlay coming and going is ours, not a render.
  let busy = false;
  const ours = r => [...r.addedNodes, ...r.removedNodes].every(n => n.nodeType === 1 && (n.classList.contains("pgov") || n.classList.contains("pgbrk")));
  function guard(fn){ const was = busy; busy = true; try { fn(); } finally { mo.takeRecords(); busy = was; } }
  const mo = new MutationObserver(recs => {
    if (busy || recs.every(ours)) return;
    guard(() => { if (!doc.querySelector(":scope > .head")) dress(); paintLook(); refit(); setTimeout(refit, 450); });
  });
  mo.observe(doc, { childList: true });

  window.DocLooks = { kind: KIND, look: () => look, opts: () => ({ ...opts }), meta: () => ({ ...meta }), rerender };
  loadSite();

  paintLook();
  if (doc.querySelector(":scope > .cover") && !doc.querySelector(":scope > .head")) { busy = true; try { dress(); } finally { mo.takeRecords(); busy = false; } }
  refit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
  window.DocLooks.pages = () => pages;
})();
