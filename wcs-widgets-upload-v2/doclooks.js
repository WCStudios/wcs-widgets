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
    `<div class="lo-chks"><label><input type="checkbox" id="loAbout"> Why WCStudios page</label>` +
    `<label><input type="checkbox" id="loProcess"> Our process page</label></div>` +
    `<p class="lo-note" id="loNote">Loading photos and copy from wcstudios.pages.dev…</p>`);
  pick.append(lo);
  const $lo = id => lo.querySelector("#" + id);
  $lo("loAbout").checked = !!opts.about; $lo("loProcess").checked = !!opts.process;
  lo.addEventListener("change", () => {
    opts = { cover: $lo("loCover").value, about: $lo("loAbout").checked, process: $lo("loProcess").checked };
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(opts)); } catch (e) {}
    rerender();
  });
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
      `<div class="sk">Accepted and agreed</div>` +
      `<p class="sx">Signing below, both parties agree to the terms of this ${esc(KIND.toLowerCase())}.</p>` +
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

  function aboutModule(){
    const a = SITE.about;
    return el("section", "mod about",
      `<div class="mk">Why WCStudios</div><h2 class="mt">${esc(a.title)}</h2>` +
      `<div class="mcols"><p>${esc(a.p1)}</p><p>${esc(a.p2)}</p></div>` +
      (SITE.stats.length ? `<div class="stats">${SITE.stats.map(s => `<div><b>${esc(s.num)}</b><span>${esc(s.label)}</span></div>`).join("")}</div>` : "") +
      (SITE.quote ? `<figure class="quote"><blockquote>${esc(SITE.quote.text)}</blockquote><figcaption>${esc(SITE.quote.name)} · ${esc(SITE.quote.company)}</figcaption></figure>` : "") +
      (SITE.logos.length ? `<div class="trusted"><span>Trusted by</span>${SITE.logos.map(esc).join(" · ")}</div>` : ""));
  }

  function processModule(){
    return el("section", "mod process",
      `<div class="mk">How it runs</div><h2 class="mt">Our process</h2>` +
      (SITE.processSub ? `<p class="msub">${esc(SITE.processSub)}</p>` : "") +
      `<ol class="steps">${SITE.process.map((s, i) => `<li><i>${String(i + 1).padStart(2, "0")}</i><b>${esc(s.name)}</b><span>${esc(s.desc)}</span></li>`).join("")}</ol>`);
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
      fillOptions();
      if (opts.cover || opts.about || opts.process) rerender();
    } catch (e) {
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
  const later = () => { clearTimeout(pT); pT = setTimeout(() => { guard(paginate); fitDoc(wrap, scaler, doc); }, 300); };
  doc.addEventListener("input", later);
  doc.addEventListener("load", later, true);           // pictures that arrive after the layout

  function refit(){ guard(paginate); fitDoc(wrap, scaler, doc); }

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
