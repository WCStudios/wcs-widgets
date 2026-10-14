/* DocsOS looks: Studio, Midnight, Editorial and Classic for contracts and
   proposals. Loaded after the builder's own script with
     <script src="doclooks.js" data-kind="Proposal"></script>
   Every time the builder repaints #doc, this lifts the title and facts into a
   header, tags the section heads, and sets one lk-* class; doclooks.css does
   the rest. It never touches the builder's state, its render(), or what gets
   sent to Notion: only the preview and Save PDF change. Editing still works
   because the builders find their targets with closest() on #doc, and nothing
   leaves #doc. */
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
  pick.addEventListener("click", e => {
    const b = e.target.closest("button[data-look]"); if (!b) return;
    look = b.dataset.look;
    try { localStorage.setItem(KEY, look); } catch (err) {}
    paintLook(); refit();
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
    tail.append(el("section", "sigs",
      `<div class="sk">Accepted and agreed</div><div class="sgrid">` +
      `<div><div class="ln"></div><b>WCStudios</b><span>Bennett Witta</span><div class="ln d"></div><span>Date</span></div>` +
      `<div><div class="ln"></div><b>${esc(org && !/^(company|client)$/i.test(org) ? org : "Client")}</b>` +
      `<span>${esc(person && !/^client contact$/i.test(person) ? person : "Name and title")}</span><div class="ln d"></div><span>Date</span></div></div>`));
    tail.append(el("footer", "dfoot", `<span><b>WCStudios</b> · A video &amp; post production company · Eden Prairie, MN</span><span>bennett@wcstudios.co</span>`));
    pg.append(tail);
    return true;
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

  paintLook();
  if (doc.querySelector(":scope > .cover") && !doc.querySelector(":scope > .head")) { busy = true; try { dress(); } finally { mo.takeRecords(); busy = false; } }
  refit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
})();
