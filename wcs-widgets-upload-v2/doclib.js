/* DocsOS library: every proposal, contract and deck you work on is kept, and
   the Open button brings any of them back, the way the invoice builder opens
   past invoices.

     <script src="doclib.js" data-kind="proposal" data-store="wcsProposalBuilder.v1"
             data-keys="wcsDocLook.proposal,wcsDocLook.proposal.opts,wcsDocLook.proposal.edits"
             data-title="#title"></script>

   The builders already keep the open document in localStorage (data-store, plus
   the look and page edits in data-keys). This file snapshots those keys into a
   library as you work, so nothing in the builders changes: "New" starts a fresh
   entry and leaves the last one in the library, and opening an entry puts its
   keys back and reloads. When the signing key is set (Send to sign), the library
   is also kept on the signing service, so it follows you to other computers.
   Documents that only exist in Notion are listed too and open in Notion. */
(function(){
  "use strict";
  const me = document.currentScript;
  const KIND = me.dataset.kind, STORE = me.dataset.store;
  const KEYS = [STORE, ...(me.dataset.keys || "").split(",").map(s => s.trim()).filter(Boolean)];
  const TITLE = me.dataset.title;
  const LIB = "wcsDocLib." + KIND, CUR = LIB + ".cur";
  const NOUN = { proposal: "proposal", contract: "contract", deck: "deck" }[KIND] || "document";
  const SIGN_URL = (() => { try { return localStorage.getItem("wcsSignUrl") || ""; } catch (e) { return ""; } })() || "https://wcs-sign.bennett-2b4.workers.dev";
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const lib = () => { try { return JSON.parse(get(LIB) || "{}") || {}; } catch (e) { return {}; } };
  const saveLib = L => put(LIB, JSON.stringify(L));
  const key = () => get("wcsSignKey.v1") || "";

  let cur = get(CUR);
  if (!cur) { cur = uid(); put(CUR, cur); }

  const snap = () => { const o = {}; KEYS.forEach(k => { const v = get(k); if (v != null) o[k] = v; }); return o; };
  const titleNow = () => {
    const n = TITLE && document.querySelector(TITLE);
    const t = n ? (n.value || n.textContent || "").trim() : "";
    return t || "Untitled " + NOUN;
  };

  /* ── Keep the library current ───────────────────────────────────────── */
  let last = "", pushT = 0;
  function tick(){
    const data = snap();
    if (!data[STORE]) return;                      // nothing saved yet (or just reset)
    const s = JSON.stringify(data);
    if (s === last) return;
    last = s;
    const L = lib(), now = new Date().toISOString();
    L[cur] = { id: cur, title: titleNow(), updated: now, data };
    // Keep the 60 most recent locally.
    const ids = Object.values(L).sort((a, b) => (b.updated || "").localeCompare(a.updated || "")).map(x => x.id);
    ids.slice(60).forEach(id => delete L[id]);
    saveLib(L);
    clearTimeout(pushT); pushT = setTimeout(() => push(L[cur]), 1500);
  }
  setInterval(tick, 2000);
  addEventListener("pagehide", tick);

  async function api(path, opt = {}){
    const k = key(); if (!k) throw new Error("no key");
    const r = await fetch(SIGN_URL + "/api/admin" + path, { method: opt.method || "GET",
      headers: { Authorization: "Bearer " + k, ...(opt.body ? { "Content-Type": "application/json" } : {}) },
      body: opt.body ? JSON.stringify(opt.body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "HTTP " + r.status);
    return j;
  }
  async function push(e){ if (!e || !key()) return; try { await api(`/docs/${KIND}/${e.id}`, { method: "PUT", body: { title: e.title, data: e.data } }); } catch (x) {} }

  // "New ..." starts a fresh entry; the one you were on stays in the library.
  const reset = document.getElementById("bReset");
  if (reset) reset.addEventListener("click", () => { tick(); cur = uid(); put(CUR, cur); last = ""; }, true);

  /* ── Open ───────────────────────────────────────────────────────────── */
  const css = document.createElement("style");
  css.textContent = `
.lbbd{position:fixed;inset:0;background:rgba(0,0,0,.34);z-index:60}
.lbbd[hidden],.lbp[hidden]{display:none}
.lbp{position:fixed;z-index:61;top:58px;left:clamp(12px,1.4vw,18px);width:min(580px,calc(100vw - 24px));max-height:min(72vh,600px);
 display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.26);overflow:hidden}
.lbh{display:flex;gap:8px;padding:10px;border-bottom:1px solid var(--line);background:var(--soft)}
.lbh input{flex:1;min-width:0;font-size:12.5px;padding:8px 10px}
.lbh button{flex:0 0 auto;width:32px;padding:0;color:var(--muted)}
.lbl2{flex:1;min-height:0;overflow:auto;padding:6px}
.lbg{font-size:9px;letter-spacing:.9px;text-transform:uppercase;color:var(--muted);font-weight:800;padding:10px 8px 5px}
.lbr{display:flex;align-items:center;gap:10px;width:100%;padding:9px;border:1px solid transparent;border-radius:8px;cursor:pointer;color:var(--text)}
.lbr:hover{background:var(--soft);border-color:var(--line)}
.lbr.on{border-color:var(--accent-line,rgba(232,98,44,.3));background:var(--soft)}
.lbr .lc{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.lbr .lc b{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbr .lc i{font-style:normal;font-size:10.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lbr .la{flex:0 0 auto;font-size:10px;color:var(--muted);text-align:right;white-space:nowrap}
.lbr .lx{flex:0 0 auto;border:0;background:none;color:var(--muted);padding:2px 6px;font-size:12px;visibility:hidden}
.lbr:hover .lx{visibility:visible}.lbr .lx:hover{color:var(--down)}
.lbr .lx.arm{visibility:visible;color:var(--down);font-size:10px;font-weight:700}
.lbtag{font-size:8.5px;letter-spacing:.5px;text-transform:uppercase;font-weight:800;padding:2px 6px;border-radius:8px;background:var(--soft);color:var(--muted);margin-left:6px}
.lbf{padding:9px 12px;border-top:1px solid var(--line);font-size:10px;color:var(--muted);line-height:1.45}
.lbempty{padding:22px 10px;text-align:center;color:var(--muted);font-size:11px}`;
  document.head.append(css);

  const btn = document.createElement("button");
  btn.id = "bOpen"; btn.textContent = "Open " + NOUN; btn.title = "Open a " + NOUN + " you worked on";
  if (reset) reset.insertAdjacentElement("afterend", btn);
  const bd = Object.assign(document.createElement("div"), { className: "lbbd", hidden: true });
  const pn = document.createElement("div"); pn.className = "lbp"; pn.hidden = true;
  pn.innerHTML = `<div class="lbh"><input id="lbQ" placeholder="Search by title or client" spellcheck="false"><button type="button" id="lbX" title="Close">✕</button></div>
    <div class="lbl2" id="lbList"></div><div class="lbf" id="lbFoot"></div>`;
  document.body.append(bd, pn);
  const $ = id => document.getElementById(id);

  let remote = [], notion = [], remoteState = "";
  const when = iso => { if (!iso) return ""; const d = new Date(iso), s = (Date.now() - d) / 1000;
    return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }); };

  function rows(){
    const q = $("lbQ").value.trim().toLowerCase(), L = lib();
    const mine = new Map(Object.values(L).map(e => [e.id, { ...e, where: "here" }]));
    remote.forEach(r => { const m = mine.get(r.id); if (!m || (r.updated || "") > (m.updated || "")) mine.set(r.id, { ...r, where: m ? "here" : "cloud" }); });
    const hit = s => !q || String(s || "").toLowerCase().includes(q);
    const docs = [...mine.values()].filter(e => hit(e.title)).sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
    const titles = new Set(docs.map(d => (d.title || "").trim().toLowerCase()));
    const onlyNotion = notion.filter(n => hit(n.name + " " + (n.client || n.company || n.party || "")) && !titles.has(String(n.name || "").trim().toLowerCase()));
    return { docs, onlyNotion };
  }
  function draw(){
    const { docs, onlyNotion } = rows();
    const row = e => `<div class="lbr${e.id === cur ? " on" : ""}" data-id="${esc(e.id)}"><span class="lc"><b>${esc(e.title)}${e.id === cur ? '<span class="lbtag">open now</span>' : ""}${e.where === "cloud" ? '<span class="lbtag">from another computer</span>' : ""}</b>` +
      `<i>Edited ${esc(when(e.updated))}</i></span><button type="button" class="lx" data-del="${esc(e.id)}" title="Remove from this list">✕</button></div>`;
    const nrow = n => `<div class="lbr" data-url="${esc(n.url)}"><span class="lc"><b>${esc(n.name)}</b><i>${esc(n.client || n.company || n.party || n.status || "")}</i></span><span class="la">Open in Notion ↗</span></div>`;
    $("lbList").innerHTML =
      (docs.length ? `<div class="lbg">Your ${NOUN}s · ${docs.length}</div>` + docs.map(row).join("") : "") +
      (onlyNotion.length ? `<div class="lbg">In Notion only · ${onlyNotion.length}</div>` + onlyNotion.map(nrow).join("") : "") ||
      `<div class="lbempty">${$("lbQ").value ? "Nothing matches that." : "Nothing yet. Everything you build here shows up in this list."}</div>`;
    $("lbFoot").textContent = remoteState;
  }
  function openPick(){
    tick();
    pn.hidden = bd.hidden = false; $("lbQ").value = ""; remoteState = key() ? "Checking your other computers…" : "Saved on this computer. Paste the signing key in Send to sign to see these on every computer.";
    draw(); setTimeout(() => { try { $("lbQ").focus(); } catch (e) {} }, 30);
    if (window.WCSHub && window.WCSHub.loadFeed) Promise.resolve(window.WCSHub.loadFeed()).then(F => {
      notion = (F && (F[KIND === "deck" ? "decks" : KIND === "contract" ? "contracts" : "proposals"])) || [];
      notion = notion.slice().sort((a, b) => String(b.edited || "").localeCompare(String(a.edited || ""))); draw();
    }).catch(() => {});
    if (key()) api(`/docs?kind=${KIND}`).then(j => { remote = j.docs || []; remoteState = "Synced with the signing service, so these follow you to any computer."; draw(); })
      .catch(() => { remoteState = "Couldn't reach the signing service; showing what's saved on this computer."; draw(); });
  }
  const closePick = () => { pn.hidden = bd.hidden = true; };
  btn.addEventListener("click", () => pn.hidden ? openPick() : closePick());
  bd.addEventListener("click", closePick);
  $("lbX").addEventListener("click", closePick);
  $("lbQ").addEventListener("input", draw);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !pn.hidden) closePick(); });

  const armed = {};
  $("lbList").addEventListener("click", async e => {
    const del = e.target.closest("[data-del]");
    if (del) {
      e.stopPropagation();
      const id = del.dataset.del;
      if (!armed[id] || Date.now() - armed[id] > 5000) { armed[id] = Date.now(); del.textContent = "Remove?"; del.classList.add("arm"); return; }
      const L = lib(); delete L[id]; saveLib(L); remote = remote.filter(r => r.id !== id);
      if (key()) api(`/docs/${KIND}/${id}`, { method: "DELETE" }).catch(() => {});
      draw(); return;
    }
    const r = e.target.closest(".lbr"); if (!r) return;
    if (r.dataset.url) { if (window.WCSHub) window.WCSHub.openUrl(r.dataset.url); else window.open(r.dataset.url, "_blank", "noopener"); return; }
    const id = r.dataset.id; if (id === cur) { closePick(); return; }
    tick();
    let ent = lib()[id];
    const rem = remote.find(x => x.id === id);
    if ((!ent || (rem && (rem.updated || "") > (ent.updated || ""))) && rem) {
      try { const j = await api(`/docs/${KIND}/${id}`); ent = { id, title: j.doc.title, updated: j.doc.updated, data: j.doc.data }; } catch (x) { remoteState = "Couldn't load that one. Try again."; draw(); return; }
    }
    if (!ent || !ent.data) return;
    KEYS.forEach(k => put(k, ent.data[k] != null ? ent.data[k] : null));
    put(CUR, id);
    const L = lib(); L[id] = { ...ent, updated: ent.updated }; saveLib(L);
    location.reload();
  });
})();
