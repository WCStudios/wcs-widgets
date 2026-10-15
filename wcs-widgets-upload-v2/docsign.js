/* DocsOS signing, the builder side. Adds "Send to sign" to the bar of the
   contract and proposal builders. The panel holds your saved signature, who is
   signing, and every envelope already sent for this document.

   Sending freezes the document exactly as the preview shows it: the builder's
   own styles and the logo are packed into one HTML file, editing marks come
   out, your signature goes on, and the client's signature area stays marked
   for the signing service (wcs-sign) to fill. The service fingerprints that
   file, emails the client a private link from your Gmail, and when they sign,
   seals the PDF, saves it to the Notion record and emails it to you both.

   Loaded after doclooks.js:  <script src="docsign.js"></script>            */
(function () {
  "use strict";
  const L = window.DocLooks;
  const doc = document.getElementById("doc");
  const bar = document.querySelector(".bar .barl");
  if (!L || !doc || !bar) return;

  const SIGN_URL = (() => { try { return localStorage.getItem("wcsSignUrl") || ""; } catch (e) { return ""; } })()
    || "https://wcs-sign.bennett-2b4.workers.dev";
  const KEY_LS = "wcsSignKey.v1", SIG_LS = "wcsSenderSig.v1";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const get = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const field = (id) => { const n = document.getElementById(id); return n ? n.value.trim() : ""; };
  const toast = (t) => (window.WCSHub && window.WCSHub.toast ? window.WCSHub.toast(t) : alert(t));

  /* ── Bar button and panel ───────────────────────────────────────────── */
  const btn = document.createElement("button");
  btn.id = "bSign"; btn.type = "button"; btn.textContent = "Send to sign";
  const anchor = document.getElementById("bPrint");
  if (anchor && anchor.parentNode === bar) anchor.after(btn); else bar.append(btn);

  const pop = document.createElement("div");
  pop.className = "signpop"; pop.hidden = true;
  pop.innerHTML = `
    <div class="sp-h"><b>Send to sign</b><span id="spState"></span><button type="button" class="sp-x" id="spClose" aria-label="Close">&#10005;</button></div>
    <div class="sp-body">
      <section id="spSetup" hidden>
        <p class="sp-note">Paste the signing key once. It's saved in this browser only. It's in Notion, Tokens &amp; Credentials, under WCStudios Signing.</p>
        <label class="sp-f">Signing key<input id="spKey" type="password" autocomplete="off" spellcheck="false"></label>
        <button type="button" id="spKeySave">Save key</button>
      </section>

      <section id="spMain" hidden>
        <div class="sp-row" id="spGmail"></div>

        <div class="sp-lbl">Your signature</div>
        <div id="spMine"></div>

        <div class="sp-lbl">Who signs</div>
        <div class="sp-two">
          <label class="sp-f">Name<input id="spName" autocomplete="off"></label>
          <label class="sp-f">Email<input id="spEmail" type="email" autocomplete="off"></label>
        </div>
        <label class="sp-f">Note in the email <span>(optional)</span><textarea id="spNote" rows="2" placeholder="Anything you'd say above the link"></textarea></label>
        <button type="button" class="primary sp-go" id="spSend">Sign and send</button>
        <p class="sp-note" id="spSendNote"></p>

        <div class="sp-lbl" id="spHistL" hidden>Sent for this document</div>
        <ul class="sp-hist" id="spHist"></ul>
        <button type="button" class="sp-link" id="spForget">Use a different signing key</button>
      </section>
    </div>`;
  document.body.append(pop);
  const $ = (id) => pop.querySelector("#" + id);

  const show = (on) => { pop.hidden = !on; btn.classList.toggle("on", on); if (on) open(); };
  btn.addEventListener("click", (e) => { e.stopPropagation(); show(pop.hidden); });
  $("spClose").onclick = () => show(false);
  document.addEventListener("pointerdown", (e) => { if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) show(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) show(false); });

  /* ── Service calls ──────────────────────────────────────────────────── */
  async function api(path, opts = {}) {
    const r = await fetch(SIGN_URL + "/api/admin" + path, {
      method: opts.method || "GET",
      headers: { Authorization: "Bearer " + get(KEY_LS), ...(opts.body ? { "Content-Type": "application/json" } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const j = await r.json().catch(() => ({ ok: false, error: `The signing service didn't answer (${r.status}).` }));
    if (r.status === 401) { put(KEY_LS, null); throw new Error(j.error || "Signing key is wrong."); }
    if (!r.ok || !j.ok) throw new Error(j.error || "Something went wrong.");
    return j;
  }

  let status = null;
  async function open() {
    $("spSetup").hidden = !!get(KEY_LS); $("spMain").hidden = !get(KEY_LS);
    if (!get(KEY_LS)) { $("spState").textContent = ""; setTimeout(() => $("spKey").focus(), 30); return; }
    prefill();
    $("spState").textContent = "Checking…";
    try {
      status = await api("/status");
      $("spState").textContent = "";
      paintGmail();
      const s = await api("/signature");
      if (s.signature) put(SIG_LS, JSON.stringify({ png: s.signature.png, name: s.signature.name }));
      paintMine(s.signature);
      history();
    } catch (e) {
      $("spState").textContent = "";
      if (!get(KEY_LS)) return open();
      $("spGmail").innerHTML = `<span class="sp-bad">${esc(e.message)}</span>`;
    }
  }

  $("spKeySave").onclick = () => { const k = $("spKey").value.trim(); if (k.length < 16) return toast("That doesn't look like the signing key."); put(KEY_LS, k); $("spKey").value = ""; open(); };
  $("spForget").onclick = () => { put(KEY_LS, null); open(); };

  function paintGmail() {
    if (status.gmail) { $("spGmail").innerHTML = `<span class="sp-ok">Gmail connected</span> Emails go out from ${esc(status.sender.email)}.`; return; }
    $("spGmail").innerHTML = `<span class="sp-bad">Gmail not connected</span> <button type="button" id="spConnect">Connect Gmail</button>`;
    $("spConnect").onclick = async () => {
      try { const j = await api("/google-link", { method: "POST" }); window.open(j.url, "_blank", "noopener"); toast("Approve in the new tab, then reopen this panel."); }
      catch (e) { toast(e.message); }
    };
  }

  function prefill() {
    const m = L.meta();
    if (!$("spName").value) $("spName").value = m.person || "";
    if (!$("spEmail").value) {
      let email = field("rEmail");
      try { if (!email && typeof F !== "undefined" && F && F.clients) {           // eslint-disable-line no-undef
        const c = F.clients.find((x) => x.name === (m.org || field("company")));  // eslint-disable-line no-undef
        email = c && c.email ? String(c.email).split(",")[0].trim() : "";
      } } catch (e) {}
      $("spEmail").value = email;
    }
  }

  /* ── Your signature ─────────────────────────────────────────────────── */
  let mine = null;
  function paintMine(sig) {
    mine = sig;
    if (sig) {
      $("spMine").innerHTML = `<div class="sp-sig"><img alt="Your signature" src="${esc(sig.png)}"><button type="button" class="sp-link" id="spRedraw">Redraw</button></div>`;
      $("spRedraw").onclick = () => paintPad();
    } else paintPad();
    L.rerender();   // the preview's signature page picks it up
  }
  function paintPad() {
    $("spMine").innerHTML = `<div class="sp-pad"><canvas id="spCanvas"></canvas><span>Sign here once. It's saved for every document.</span></div>
      <div class="sp-padbar"><button type="button" class="sp-link" id="spClear">Clear</button><button type="button" id="spSave">Save signature</button></div>`;
    const cv = $("spCanvas"), ctx = cv.getContext("2d"), d = window.devicePixelRatio || 1;
    const r = cv.getBoundingClientRect(); cv.width = r.width * d; cv.height = r.height * d; ctx.scale(d, d);
    ctx.lineCap = ctx.lineJoin = "round"; ctx.strokeStyle = "#111"; ctx.lineWidth = 2.4;
    let last = null, ink = [];
    const pt = (e) => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); last = pt(e); ink.push(last); };
    cv.onpointermove = (e) => { if (!last) return; const p = pt(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; ink.push(p); };
    cv.onpointerup = cv.onpointerleave = () => { last = null; };
    $("spClear").onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); ink = []; };
    $("spSave").onclick = async () => {
      if (ink.length < 12) return toast("Draw your signature first.");
      const xs = ink.map((p) => p.x), ys = ink.map((p) => p.y), pad = 6;
      const x0 = Math.max(0, Math.min(...xs) - pad), y0 = Math.max(0, Math.min(...ys) - pad);
      const w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
      const out = document.createElement("canvas"); out.width = w * d; out.height = h * d;
      out.getContext("2d").drawImage(cv, x0 * d, y0 * d, w * d, h * d, 0, 0, w * d, h * d);
      try {
        const j = await api("/signature", { method: "PUT", body: { png: out.toDataURL("image/png"), name: (status && status.sender.name) || "Bennett Witta" } });
        put(SIG_LS, JSON.stringify({ png: j.signature.png, name: j.signature.name }));
        paintMine(j.signature); toast("Signature saved");
      } catch (e) { toast(e.message); }
    };
  }

  /* ── Freeze the document ────────────────────────────────────────────── */
  const humanNow = () => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date()).replace(/, (\d+:)/, " at $1");

  async function dataUri(url) {
    const b = await (await fetch(url)).blob();
    return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
  }

  async function freeze(title) {
    const clone = doc.cloneNode(true);
    clone.querySelectorAll(".grip, .edithint, .sig-done.preview").forEach((n) => n.remove());
    clone.querySelectorAll("mark").forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
    clone.querySelectorAll("*").forEach((n) => {
      [...n.attributes].forEach((a) => {
        if (/^(contenteditable|draggable|spellcheck|data-(path|ed|tok|mv|edited))$/i.test(a.name) || /^on/i.test(a.name)) n.removeAttribute(a.name);
      });
      n.classList.remove("editing", "movable", "dragging", "dropto");
      if (n.tagName === "A") n.removeAttribute("target");
    });
    clone.style.removeProperty("transform");

    const area = clone.querySelector('.sigblock[data-party="sender"] .sig-area');
    if (!area || !clone.innerHTML.includes("<!--SIG:client-->")) throw new Error("The signature page is missing. Pick a look and try again.");
    const who = mine.name || "Bennett Witta";
    area.innerHTML = `<div class="sig-done"><img class="sig-img" alt="Signature of ${esc(who)}" src="${mine.png}">` +
      `<div class="sig-name">${esc(who)}</div><div class="sig-meta">Signed electronically by ${esc(who)}, ${esc(humanNow())}</div></div>`;

    for (const img of clone.querySelectorAll("img")) {
      const src = img.getAttribute("src") || "";
      if (src && !/^(data:|https?:)/i.test(src)) img.setAttribute("src", await dataUri(new URL(src, location.href).href));
    }
    const sheets = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href)
      .filter((h) => h.startsWith(location.origin) && /\/(builder|doclooks)\.css/.test(h));
    const css = await Promise.all(sheets.map((h) => fetch(h).then((r) => r.text())));
    const fonts = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href).filter((h) => h.startsWith("https://fonts.googleapis.com/"));
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
      fonts.map((h) => `<link rel="stylesheet" href="${esc(h)}">`).join("") +
      css.map((t) => `<style>${t}</style>`).join("") +
      `<style>html,body{height:auto!important;overflow:visible!important;display:block!important;background:#fff!important;margin:0!important}` +
      `.doc{box-shadow:none!important;margin:0 auto!important}` +
      `.doc .pgap{left:0!important;right:0!important;background:#e9e9e6!important}.doc .pgap::before,.doc .pgap::after{left:0!important;right:0!important}</style></head><body>${clone.outerHTML}</body></html>`;
  }

  /* ── Send ───────────────────────────────────────────────────────────── */
  const titleNow = () => field("rTitle") || field("title") || L.meta().title;

  $("spSend").onclick = async () => {
    const name = $("spName").value.trim(), email = $("spEmail").value.trim(), title = titleNow();
    if (!mine) return toast("Save your signature first.");
    if (name.length < 2) return toast("Who is signing? Add their name.");
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return toast("Add the signer's email.");
    if (!title) return toast("The document needs a title.");
    if (doc.querySelector("mark.empty") && !armed("send")) {
      $("spSendNote").innerHTML = `<span class="sp-bad">Some blanks are still empty.</span> Press Sign and send again to send it anyway.`;
      return;
    }
    const go = $("spSend"); go.disabled = true; go.textContent = "Sending…"; $("spSendNote").textContent = "";
    try {
      const html = await freeze(title);
      const j = await api("/envelopes", { method: "POST", body: {
        kind: L.kind, title, look: L.look(), docHtml: html, senderSigned: true,
        signer: { name, email }, message: $("spNote").value.trim(),
      } });
      $("spSendNote").innerHTML = j.emailed
        ? `Sent to ${esc(email)}. ${linkHtml(j.link)}`
        : `Saved, but the email didn't go out (${esc(j.emailError || "Gmail")}). Send them this link yourself: ${linkHtml(j.link)}`;
      $("spNote").value = "";
      toast(j.emailed ? "Sent for signature" : "Link ready to share");
      history();
    } catch (e) { $("spSendNote").innerHTML = `<span class="sp-bad">${esc(e.message)}</span>`; }
    go.disabled = false; go.textContent = "Sign and send";
  };

  function linkHtml(link) { return `<button type="button" class="sp-link" data-copy="${esc(link)}">Copy link</button>`; }
  pop.addEventListener("click", async (e) => {
    const c = e.target.closest("[data-copy]");
    if (c) { toast(await copyText(c.dataset.copy) ? "Link copied" : "Couldn't copy. Open the link and copy it from the address bar."); return; }
    const a = e.target.closest("[data-act]"); if (!a) return;
    const id = a.dataset.id, act = a.dataset.act;
    try {
      if (act === "pdf") {
        const r = await fetch(`${SIGN_URL}/api/admin/envelopes/${id}/pdf`, { headers: { Authorization: "Bearer " + get(KEY_LS) } });
        if (!r.ok) throw new Error("The signed PDF isn't ready yet.");
        const u = URL.createObjectURL(await r.blob()); const k = document.createElement("a");
        k.href = u; k.download = `${titleNow() || "Signed"} (signed).pdf`; k.click(); setTimeout(() => URL.revokeObjectURL(u), 4000);
        return;
      }
      if (act === "void" && !armed("void" + id)) { a.textContent = "Press again to withdraw"; return; }
      await api(`/envelopes/${id}/${act}`, { method: "POST", body: act === "void" ? { reason: "Replaced with an updated version." } : {} });
      toast(act === "void" ? "Withdrawn" : "Sent again"); history();
    } catch (x) { toast(x.message); }
  });

  // Notion's embed frame blocks confirm() and prompt(), so a risky press asks for a second press
  // within a few seconds, and copying falls back to a hidden field.
  const arms = {};
  function armed(k){ const now = Date.now(); if (arms[k] && now - arms[k] < 6000) { delete arms[k]; return true; } arms[k] = now; return false; }
  async function copyText(t){
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
    const ta = document.createElement("textarea"); ta.value = t; ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    ta.remove(); return ok;
  }

  async function history() {
    const title = titleNow(); if (!title) return;
    try {
      const j = await api("/envelopes?title=" + encodeURIComponent(title));
      $("spHistL").hidden = !j.envelopes.length;
      $("spHist").innerHTML = j.envelopes.map((e) => {
        const st = e.status === "signed" ? ["signed", "Signed"] : e.status === "void" ? ["void", "Withdrawn"] : e.first_viewed_at ? ["open", "Opened"] : ["sent", "Sent"];
        const when = new Date(e.signed_at || e.created_at).toLocaleDateString([], { month: "short", day: "numeric" });
        const acts = e.status === "signed"
          ? `<button type="button" class="sp-link" data-act="pdf" data-id="${e.id}">PDF</button><button type="button" class="sp-link" data-act="resend" data-id="${e.id}">Email copy</button>`
          : e.status === "sent"
            ? `${linkHtml(e.link)}<button type="button" class="sp-link" data-act="resend" data-id="${e.id}">Resend</button><button type="button" class="sp-link" data-act="void" data-id="${e.id}">Withdraw</button>`
            : "";
        return `<li><span class="sp-st ${st[0]}">${st[1]}</span><div><b>${esc(e.signer_name)}</b><span>${esc(e.signer_email)} · ${when} · ${e.id}</span><div class="sp-acts">${acts}</div></div></li>`;
      }).join("");
    } catch (e) { /* the panel still works without history */ }
  }
})();
