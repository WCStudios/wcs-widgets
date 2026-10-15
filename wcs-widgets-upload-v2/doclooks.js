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

  function refit(){
    const H = window.WCSHub, wrap = document.getElementById("paperWrap"), sc = document.getElementById("scaler");
    if (H && H.fitPaper && wrap && sc) H.fitPaper(wrap, sc, doc);
  }

  // The builders replace #doc's children wholesale on every render; dress each new copy.
  let busy = false;
  const mo = new MutationObserver(() => {
    if (busy) return;
    busy = true;
    try { if (!doc.querySelector(":scope > .head")) dress(); paintLook(); refit(); }
    finally { mo.takeRecords(); busy = false; }
  });
  mo.observe(doc, { childList: true });

  window.DocLooks = { kind: KIND, look: () => look, opts: () => ({ ...opts }), meta: () => ({ ...meta }), rerender };
  loadSite();

  paintLook();
  if (doc.querySelector(":scope > .cover") && !doc.querySelector(":scope > .head")) { busy = true; try { dress(); } finally { mo.takeRecords(); busy = false; } }
  refit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
})();
