'use strict';
/* Synchronizacja z Synology przez Tailscale. Cały stan aplikacji to jeden dokument JSON;
   NAS trzyma numer wersji (rev), telefon pamięta ostatni znany rev i czy ma niewysłane zmiany. */
(function () {
  const CK = 'rotacje.sync';
  const BK = 'rotacje.syncBase';   // stan z NAS-a po ostatniej udanej synchronizacji (baza do łączenia zmian)
  let cfg = null, busy = false, again = false, timer = null, status = 'idle', msg = '', uiOn = false;
  const getBase = () => { try { return JSON.parse(localStorage.getItem(BK) || 'null') || undefined; } catch (e) { return undefined; } };
  const setBase = d => { try { localStorage.setItem(BK, JSON.stringify(d)); } catch (e) { } };
  /* łączenie trójstronne: zmiany lokalne i z NAS-a względem wspólnej bazy; konflikt w tym samym polu → wygrywa ten telefon */
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
  function merge3(b, l, r) {
    if (eq(l, r)) return l;
    if (b !== undefined && eq(l, b)) return r;
    if (b !== undefined && eq(r, b)) return l;
    if (Array.isArray(l) && Array.isArray(r) && [...l, ...r].every(x => isObj(x) && x.id)) {   // listy z id (scenariusze, rotacje)
      const bm = new Map((Array.isArray(b) ? b : []).map(x => [x.id, x])), lm = new Map(l.map(x => [x.id, x])), rm = new Map(r.map(x => [x.id, x]));
      const out = [];
      for (const id of new Set([...r.map(x => x.id), ...l.map(x => x.id)])) {
        const bx = bm.get(id), lx = lm.get(id), rx = rm.get(id);
        if (lx && rx) out.push(merge3(bx, lx, rx));
        else if (lx) { if (!(bx && eq(lx, bx))) out.push(lx); }      // usunięte na drugim telefonie
        else if (!(bx && eq(rx, bx))) out.push(rx);                    // usunięte na tym telefonie
      }
      return out;
    }
    if (isObj(l) && isObj(r)) {
      const bo = isObj(b) ? b : undefined, out = {};
      for (const k of new Set([...Object.keys(r), ...Object.keys(l)])) {
        const bk = bo ? bo[k] : undefined;
        if (!(k in l)) { if (!(bo && k in bo && eq(r[k], bk))) out[k] = r[k]; continue; }
        if (!(k in r)) { if (!(bo && k in bo && eq(l[k], bk))) out[k] = l[k]; continue; }
        out[k] = merge3(bk, l[k], r[k]);
      }
      return out;
    }
    return l;
  }
  try { cfg = JSON.parse(localStorage.getItem(CK) || 'null'); } catch (e) { cfg = null; }
  try { const f = localStorage.getItem('rotacje.syncUi'); uiOn = f === null ? !!cfg : f === '1'; } catch (e) { uiOn = !!cfg; }   // włącznik synchronizacji (tylko ten telefon)
  const keep = () => { try { if (cfg) localStorage.setItem(CK, JSON.stringify(cfg)); else localStorage.removeItem(CK); } catch (e) { } };
  const hm = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const when = t => { if (!t) return 'jeszcze nie'; const d = new Date(t), now = new Date(); return d.toDateString() === now.toDateString() ? 'dziś ' + hm(t) : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')} ${hm(t)}`; };
  const endpoint = () => cfg.url.replace(/\/+$/, '') + '/sync.php?t=' + encodeURIComponent(cfg.token);

  function parseLink(text) {
    text = String(text || '').trim();
    let u; try { u = new URL(text); } catch (e) { return null; }
    if (u.protocol !== 'https:') return null;
    const t = (u.hash.match(/[#&]t=([A-Za-z0-9_-]{16,})/) || u.search.match(/[?&]t=([A-Za-z0-9_-]{16,})/) || [])[1];
    return t ? { url: u.origin + u.pathname.replace(/\/(index\.html)?$/, ''), token: t } : null;
  }
  async function req(method, body) {
    const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 10000);
    try {
      const r = await fetch(endpoint(), { method, body, signal: ac.signal, cache: 'no-store', headers: body ? { 'Content-Type': 'text/plain' } : undefined });
      let j = null; try { j = await r.json(); } catch (e) { }
      if (r.status === 401) throw new Error('Zły token synchronizacji.');
      if (r.status === 409) return { conflict: true, ...j };
      if (!r.ok) throw new Error(`Serwer NAS odpowiedział błędem (${r.status}).`);
      return j || {};
    } catch (e) {
      if (e.name === 'AbortError' || e instanceof TypeError) throw new Error('Brak połączenia z NAS. Sprawdź internet i czy Tailscale jest włączony.');
      throw e;
    } finally { clearTimeout(to); }
  }
  function adopt(remote, rev) {
    S = normalize(remote); store(); cfg.rev = rev; cfg.dirty = false; keep(); setBase(JSON.parse(JSON.stringify(S)));
    UI.year = E.yearOf(T0, S.settings); render();
  }
  async function push(base) {
    const sent = JSON.parse(JSON.stringify(S));
    const r = await req('POST', JSON.stringify({ base, data: sent }));
    if (r.conflict) return r;
    cfg.rev = r.rev; cfg.dirty = !eq(sent, S); keep(); setBase(sent); return null;   // zmiana w trakcie wysyłania → zostaje do wysłania
  }
  function mergeIn(remote) {   // połącz moje niewysłane zmiany z wersją z NAS-a
    S = normalize(merge3(getBase(), JSON.parse(JSON.stringify(S)), JSON.parse(JSON.stringify(normalize(remote))))); S.updated = Date.now(); store();
    UI.year = E.yearOf(T0, S.settings); render();
  }
  async function run(manual, first) {
    if (!cfg || (!uiOn && !first)) return;
    if (busy) { again = true; return; }
    busy = true; status = 'busy'; paint();
    try {
      let pulled = false;
      const srv = await req('GET');
      const has = srv && srv.data && srv.rev > 0;
      if (!has) { if (await push(0)) throw new Error('Inny telefon zapisuje w tej chwili. Spróbuj ponownie.'); }
      else if (first) { adopt(srv.data, srv.rev); pulled = true; }
      else if (srv.rev === cfg.rev) { if (cfg.dirty && await push(cfg.rev)) throw new Error('Inny telefon zapisuje w tej chwili. Spróbuj ponownie.'); }
      else if (!cfg.dirty) { adopt(srv.data, srv.rev); pulled = true; }
      else {   // zmiany na obu telefonach: łączymy, nie nadpisujemy
        mergeIn(srv.data); pulled = true;
        let c = await push(srv.rev);
        if (c && c.data) { mergeIn(c.data); c = await push(c.rev); }
        if (c) throw new Error('Inny telefon zapisuje w tej chwili. Spróbuj ponownie.');
      }
      cfg.last = Date.now(); keep(); status = 'ok'; msg = '';
      if (pulled) toast('Zsynchronizowano: pobrano zmiany z NAS'); else if (manual) toast('Zsynchronizowano');
    } catch (e) {
      status = /połączenia/.test(e.message) ? 'off' : 'err'; msg = e.message;
      if (manual) toast(e.message);
    } finally { busy = false; paint(); if (again) { again = false; if (cfg && cfg.dirty) setTimeout(() => run(false), 200); } }
  }
  function paint() {
    const k = document.getElementById('planK'); if (k) k.textContent = 'Scenariusz' + badge();
    const st = document.getElementById('syncSt'); if (st) st.outerHTML = stLine();
  }
  function badge() {
    if (!cfg || !uiOn) return '';
    return { busy: ' · NAS…', ok: ' · NAS ' + (cfg.last ? hm(cfg.last) : ''), off: ' · NAS offline', err: ' · NAS błąd', idle: ' · NAS' }[status];
  }
  function stLine() {
    const dot = { ok: 'ok', err: 'err', off: '', busy: 'busy', idle: '' }[status];
    const txt = status === 'busy' ? 'Synchronizuję…' : msg || `Ostatnia synchronizacja: ${when(cfg && cfg.last)}${cfg && cfg.dirty ? ' · są niewysłane zmiany' : ''}`;
    return `<p class="sync-st" id="syncSt"><i class="${dot}"></i><span>${esc(txt)}</span></p>`;
  }
  function card() {
    const sw = `<label class="sw"><p>Synchronizacja z NAS<small>Synology + Tailscale. Łączy Androida i iPhone'a</small></p><input type="checkbox" class="toggle" data-act="syncUi" ${uiOn ? 'checked' : ''}></label>`;
    if (!uiOn) return `<div class="sec"><h3>Synchronizacja</h3><div class="group">${sw}</div></div>`;
    if (!cfg) return `<div class="sec"><h3>Synchronizacja</h3><div class="group">${sw}<button class="list-btn" data-act="syncConnect"><span>Połącz z NAS</span><small>link z tokenem</small></button></div></div>`;
    return `<div class="sec"><h3>Synchronizacja</h3><div class="group" style="padding-bottom:4px">${sw}${stLine()}
      <p class="note" style="margin:0 0 6px">${esc(cfg.url.replace(/^https:\/\//, ''))}. Synchronizuje się sama po otwarciu i po każdej zmianie.</p>
      <button class="list-btn" data-act="syncNow"><span>Synchronizuj teraz</span><small></small></button>
      <button class="list-btn" data-act="syncOff" style="color:var(--neg)"><span>Odłącz</span><small>dane w telefonie zostają</small></button></div></div>`;
  }
  function connectSheet() {
    const pre = location.protocol === 'https:' ? location.origin : '';
    let val = '';
    openSheet('Połącz z NAS', `<p class="note" style="margin:0 0 6px"><span>Wklej link z pliku INSTRUKCJA (z tokenem po</span> <b>#t=</b>).${IS_ANDROID ? ' <span>Tailscale musi być włączony.</span>' : ''}</p>
      <label class="field"><span>Link</span><input type="url" data-f="link" placeholder="${esc((pre || 'https://nas.ts.net:8443') + '/#t=…')}" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      <p class="note" id="connMsg"></p>
      <div class="btns"><button class="btn pri" data-act="go">Połącz</button></div>`, {
      go: async () => {
        const c = parseLink(val) || (pre && /^[A-Za-z0-9_-]{16,}$/.test(val.trim()) ? { url: pre, token: val.trim() } : null);
        if (!c) { document.getElementById('connMsg').textContent = 'To nie wygląda na link z tokenem. Powinien zaczynać się od https:// i zawierać #t='; return; }
        cfg = { url: c.url, token: c.token, rev: 0, dirty: false, last: 0 };
        document.getElementById('connMsg').textContent = 'Łączę…';
        await run(false, true);
        if (status === 'ok') { keep(); closeSheet(); render(); toast('Połączono z NAS i zsynchronizowano'); }
        else { const m = msg; cfg = null; keep(); document.getElementById('connMsg').textContent = m; }
      }
    }, el => { if (el.dataset.f === 'link') val = el.value; });
  }
  window.Sync = {
    on: () => !!cfg && uiOn, badge, card,
    changed() { if (!cfg || !uiOn) return; cfg.dirty = true; keep(); clearTimeout(timer); timer = setTimeout(() => run(false), 500); paint(); },
    act: {
      syncUi: el => { uiOn = el.checked; try { localStorage.setItem('rotacje.syncUi', uiOn ? '1' : '0'); } catch (e) { } render(); if (uiOn) run(false); },
      syncConnect: connectSheet,
      syncNow: () => run(true),
      syncOff: () => confirmSheet('Odłączyć od NAS?', 'Ten telefon przestanie się synchronizować. Dane w telefonie i na NAS-ie zostają.', 'Odłącz', () => { cfg = null; keep(); render(); toast('Odłączono od NAS. Dane w telefonie zostają.'); })
    }
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' || (cfg && cfg.dirty)) { clearTimeout(timer); run(false); } });
  addEventListener('pagehide', () => { if (cfg && cfg.dirty) { clearTimeout(timer); run(false); } });
  addEventListener('online', () => run(false));
  render();
  run(false);
})();
