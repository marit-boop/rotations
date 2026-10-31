'use strict';
const E = window.Engine;
const KEY = 'rotacje.v1';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const L = window.I18N || { lang: 'pl', T: x => x, decimal: ',', group: '\u00a0', LANGS: {} };
const grp = (v, dec) => { const neg = v < 0; let [i, f] = Math.abs(v).toFixed(dec).split('.'); i = i.replace(/\B(?=(\d{3})+(?!\d))/g, L.group); if (f && /^0+$/.test(f)) f = ''; return (neg ? '-' : '') + i + (f ? L.decimal + f : ''); };
const NF = { format: v => grp(v, 0) };
const NF1 = { format: v => grp(v, 1) };
const MON = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const MON_S = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const MON_G = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const WD = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];
const LABEL = { ON: 'Na statku', OFF: 'W domu', TRAVEL: 'Podróż', COURSE: 'Kurs' };
const IS_ANDROID = !!(window.Android && typeof window.Android.saveFile === 'function');
if (IS_ANDROID && window.Android.isNight) document.documentElement.dataset.theme = window.Android.isNight() ? 'dark' : 'light';

const fD = n => { const [y, m, d] = E.ymd(n); return `${E.pad(d)}.${E.pad(m)}.${y}`; };
const fDs = n => { const [, m, d] = E.ymd(n); return `${E.pad(d)}.${E.pad(m)}`; };
const fLong = n => { const [y, m, d] = E.ymd(n); return `${d} ${MON_G[m - 1]} ${y}`; };
const sgn = v => v > 0 ? '+' + NF.format(v) : v < 0 ? '−' + NF.format(-v) : '0';
const cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
const dni = n => Math.abs(n) === 1 ? 'dzień' : 'dni';
const SYM = { EUR: '€', USD: '$', GBP: '£', PLN: 'zł', PHP: '₱', INR: '₹', ZAR: 'R\u00a0', UAH: '₴' };
const PRE = ['USD', 'GBP', 'PHP', 'INR', 'ZAR'];
const withSym = (txt, c) => PRE.includes(c) ? SYM[c] + txt : txt + '\u00a0' + (SYM[c] || c);
/* v w walucie c (domyślnie waluta aktywnego scenariusza); przełącznik PLN przelicza po kursie z Ustawień */
function money(v, signed, c) {
  c = c || plan().cur; const s = S.settings, h = s.home, r = s.showHome && h && c !== h ? E.fxRate(s, c, h) : null;
  const x = r ? v * r : v, cc = r ? h : c;
  const body = withSym(NF.format(Math.abs(x)), cc);
  if (signed) return (x > 0.5 ? '+' : x < -0.5 ? '−' : '') + body;
  return (x < -0.5 ? '−' : '') + body;
}
const rateTxt = (v, c) => withSym(grp(+v || 0, 2), c);

/* ---------- state ---------- */
function rot(type, start, end, note = '', tb = 1, ta = 1) { return { id: uid(), type, start, end, tb, ta, note, hra: type === 'ON', rate: null, cur: null }; }
const PAST_2526 = [['2025-10-24', '2025-11-05'], ['2026-01-03', '2026-02-25'], ['2026-04-08', '2026-05-20'], ['2026-07-03', '2026-09-01']];
const pastRots = () => PAST_2526.map(([a, b]) => rot('ON', a, b));
function newPlanObj(name, extra = {}) { return { id: uid(), name, ...JSON.parse(JSON.stringify(E.DEFAULT_PAY)), rotations: [], overrides: {}, hraOff: {}, ...extra }; }
function sample() {   // pusta aplikacja: jeden pusty scenariusz
  const a = newPlanObj('Mój kontrakt');
  return { v: 5, updated: 0, settings: JSON.parse(JSON.stringify(E.DEFAULT_SETTINGS)), plans: [a], active: a.id };
}
function validState(o) { return o && Array.isArray(o.plans) && o.plans.length && o.plans.every(p => Array.isArray(p.rotations)); }
const numOr = (v, d) => { v = +v; return isFinite(v) ? v : d; };
function normPay(p, legacy) {   // ustawienia wynagrodzenia scenariusza
  const src = legacy || p, D = E.DEFAULT_PAY;
  const rates = Array.isArray(src.rates) && src.rates.length ? src.rates : [{ from: '', rate: src.rate }];
  const rs = rates.map((x, i) => ({ from: i && /^\d{4}-\d\d-\d\d$/.test(x.from || '') ? x.from : '', rate: Math.max(0, numOr(x.rate, 0)) }));
  const first = rs.filter(x => !x.from)[0] || { from: '', rate: 0 };
  return {
    type: src.type === 'day' ? 'day' : 'perm', cur: E.CURRENCIES.includes(src.cur) ? src.cur : 'EUR',
    rates: [first, ...rs.filter(x => x.from).sort((x, y) => x.from < y.from ? -1 : 1)],
    travelPct: Math.min(100, Math.max(0, numOr(src.travelPct, legacy ? (src.travelPaid === false ? 0 : 100) : D.travelPct))),
    travelBal: !!src.travelBal, hraPct: Math.min(200, Math.max(0, numOr(src.hraPct, legacy ? 38 : D.hraPct))),
    coursePct: Math.min(100, Math.max(0, numOr(src.coursePct, 0))), courseBal: ['on', 'off'].includes(src.courseBal) ? src.courseBal : 'none',
    balPay: src.balPay !== false
  };
}
function normalize(o) {
  const ver = o.v || 1, os = o.settings || {}, D = E.DEFAULT_SETTINGS;
  let fx = {}, home = E.HOME_CURRENCIES.includes(os.home) ? os.home : '', showHome = !!os.showHome;
  if (ver < 5) {   // do 2.1 kursy były zawsze „ile PLN za 1 jednostkę”
    const old = typeof os.fx === 'number' ? { EUR: os.fx } : (os.fx || {});
    for (const c of ['EUR', 'USD', 'GBP']) if (+old[c] > 0) fx[c + '>PLN'] = +old[c];
    if (!old.EUR) fx['EUR>PLN'] = 4.35;
    home = 'PLN'; showHome = !!os.showPLN;
  } else for (const k in os.fx || {}) if (/^[A-Z]{3}>[A-Z]{3}$/.test(k) && +os.fx[k] > 0) fx[k] = +os.fx[k];
  const settings = { ysM: Math.min(12, Math.max(1, numOr(os.ysM, D.ysM))), ysD: Math.min(31, Math.max(1, numOr(os.ysD, D.ysD))),
    tb: numOr(os.tb, D.tb), ta: numOr(os.ta, D.ta), home, fx, showHome };
  let legacy = null;   // do wersji 1.4 wynagrodzenie było wspólne dla wszystkich scenariuszy
  if (ver < 4) legacy = { ...os, rate: ver < 3 && os.rate === 185 ? 184.48 : numOr(os.rate, 184.48) };
  const st = { v: 5, settings, plans: o.plans.map(p => ({
    id: p.id || uid(), name: p.name || 'Scenariusz', ...normPay(p, legacy), overrides: p.overrides || {}, hraOff: p.hraOff || {},
    rotations: p.rotations.filter(r => r.start && r.end).map(r => ({ id: r.id || uid(), type: r.type === 'COURSE' ? 'COURSE' : 'ON',
      start: r.start, end: r.end, tb: +r.tb || 0, ta: +r.ta || 0, note: r.note || '', hra: r.type !== 'COURSE' && r.hra !== false,
      rate: +r.rate > 0 ? +r.rate : null, cur: E.CURRENCIES.includes(r.cur) ? r.cur : null })) })), active: o.active, updated: +o.updated || 0 };
  if (!st.plans.some(p => p.id === st.active)) st.active = st.plans[0].id;
  if (ver < 2) for (const p of st.plans) {   // 1.1: rok 2025/26 + start bieżącego kontraktu 08.10
    if (!p.rotations.some(r => r.end < '2026-10-08')) p.rotations.unshift(...pastRots());
    for (const r of p.rotations) if (r.type === 'ON' && (r.start === '2026-10-19' || r.start === '2026-10-24') && r.end.startsWith('2026-11')) r.start = '2026-10-08';
  }
  return st;
}
function load() {
  try { const j = localStorage.getItem(KEY); if (j) { const o = JSON.parse(j); if (validState(o)) return normalize(o); } } catch (e) { }
  return sample();
}
function store() { try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch (e) { toast('Nie udało się zapisać danych'); return false; } }
function save() { S.updated = Date.now(); if (store() && window.Sync) window.Sync.changed(); }

let S = load();
const T0 = E.todayN();
const UI = { tab: 'pulpit', year: E.yearOf(T0, S.settings), cal: E.ymd(T0).slice(0, 2), fin: 'mies' };
const plan = () => S.plans.find(p => p.id === S.active) || S.plans[0];
const sortRots = p => p.rotations.sort((x, y) => x.start < y.start ? -1 : x.start > y.start ? 1 : 0);

/* ---------- shell ---------- */
function render() {
  $('planName').textContent = plan().name;
  if (window.Sync) $('planK').textContent = 'Scenariusz' + window.Sync.badge();
  const yr = UI.year;
  $('yearLabel').textContent = `${yr}/${String(yr + 1).slice(2)}`;
  $('yearSwitch').style.visibility = (UI.tab === 'pulpit' || UI.tab === 'finanse') ? 'visible' : 'hidden';
  document.querySelectorAll('#tabs button').forEach(b => { if (b.dataset.tab === UI.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('view').innerHTML = VIEWS[UI.tab]();
}
function go(tab) { UI.tab = tab; render(); window.scrollTo(0, 0); }

/* ---------- Pulpit ---------- */
function heroHTML(P) {
  const t = T0, p = plan();
  if (!p.rotations.length) return `<div class="now" data-s="OFF"><div class="st">Brak grafiku</div><div class="big" style="font-size:34px">Dodaj pierwszą rotację</div><div class="sub">${p.rates[0].rate > 0 ? 'Wpisz daty zaokrętowania i zejścia w zakładce Grafik albo wygeneruj całą serię.' : 'Zacznij od typu kontraktu i dniówki, potem dodaj rotacje.'}</div><div class="next" style="gap:8px">${p.rates[0].rate > 0 ? '' : '<button class="btn" data-act="goSet" style="color:var(--ink)">Ustaw kontrakt</button>'}<button class="btn" data-act="goGrafik" style="color:var(--ink)">Otwórz grafik</button></div></div>`;
  const b = E.blockAt(P, t); const len = b.b - b.a + 1, day = t - b.a + 1, left = b.b - t;
  const pct = Math.min(100, Math.round(day / len * 100));
  let st, big, sub, nx = [];
  if (b.s === 'ON') {
    const home = E.nextStatus(P, b.b, 'OFF');
    st = 'Na statku'; big = `Dzień ${day}<small> z ${len}</small>`;
    sub = `Ostatni dzień na statku: ${fLong(b.b)}`;
    nx = [[left, left === 0 ? 'zejście dziś' : `${dni(left)} do zejścia`], [home ? fDs(home) : '–', 'pierwszy dzień w domu']];
  } else if (b.s === 'OFF') {
    const on = E.nextStatus(P, t, 'ON');
    st = 'W domu'; big = `Dzień ${day}<small> z ${len > 400 ? '–' : len}</small>`;
    if (len > 400) { big = 'W domu'; st = 'Brak kolejnej rotacji'; }
    sub = on ? `Następne zaokrętowanie: ${fLong(on)}` : 'Brak zaplanowanej rotacji';
    nx = [[left + 1 > 400 ? '–' : left + 1, 'dni do wyjazdu'], [on ? fDs(on) : '–', 'zaokrętowanie']];
  } else if (b.s === 'TRAVEL') {
    const on = E.nextStatus(P, t - 1, 'ON'); const nextIsOn = on !== null && on === b.b + 1;
    st = 'Podróż'; big = nextIsOn ? 'W drodze na statek' : 'W drodze do domu';
    sub = `Dni podróży: ${len}`;
    nx = [[left, `${dni(left)} podróży zostało`], [fDs(b.b + 1), nextIsOn ? 'zaokrętowanie' : 'w domu']];
  } else {
    st = 'Kurs'; big = `Dzień ${day}<small> z ${len}</small>`;
    sub = `Koniec kursu: ${fLong(b.b)}`;
    nx = [[left, `${dni(left)} do końca`], [fDs(b.b + 1), 'następny etap']];
  }
  return `<div class="now" data-s="${b.s}">
    <div class="st"><span>${st}</span><span>${WD[E.dow(t)]}, ${fLong(t).replace(/ \d{4}$/, '')}</span></div>
    <div class="big">${big}</div><div class="sub">${esc(sub)}</div>
    ${len <= 400 ? `<div class="prog"><i style="width:${pct}%"></i></div>` : ''}
    <div class="next">${nx.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div></div>`;
}
function stripHTML(P, a, b) {
  const L = b - a + 1, rs = E.runs(P, a, b), col = { ON: 'var(--on)', OFF: 'var(--off)', TRAVEL: 'var(--tr)', COURSE: 'var(--co)' };
  const rects = rs.map(r => `<rect x="${r.a - a}" y="0" width="${r.b - r.a + 1}" height="10" style="fill:${col[r.s]}"/>`).join('');
  let ticks = ''; let n = a;
  while (n <= b) { const [y, m, d] = E.ymd(n); if (d === 1) ticks += `<span style="left:${(n - a) / L * 100}%">${MON_S[m - 1]}</span>`; n++; }
  const today = T0 >= a && T0 <= b ? `<div class="today" style="left:calc(${(T0 - a + .5) / L * 100}% - 1px)"></div>` : '';
  return `<div class="strip"><svg viewBox="0 0 ${L} 10" preserveAspectRatio="none">${rects}</svg>${today}</div><div class="ticks">${ticks}</div>`;
}
function legendHTML() { return `<div class="legend">${E.STATUSES.map(s => `<span><i class="dot c-${s}"></i>${LABEL[s]}</span>`).join('')}</div>`; }

const VIEWS = {};
function payNote(p, t) {   // każde zdanie w osobnym <span>, żeby warstwa tłumaczeń mogła je podmienić
  const tp = `podróż ${NF.format(p.travelPct)}%`;
  const last = p.rates[p.rates.length - 1];
  const rates = p.rates.length > 1 ? `Dniówka od ${fD(E.dn(last.from))}: ${rateTxt(last.rate, p.cur)}` : `Dniówka ${rateTxt(p.rates[0].rate, p.cur)}`;
  const model = p.type === 'day' ? `Day rate: płatne dni na statku, ${tp}, bez wypłaty za balans.` : `Kontrakt stały (on/off): płatne dni na statku i w domu, ${tp}${p.balPay ? ', balans rozliczany na koniec roku' : ', bez rozliczenia balansu'}.`;
  const sp = x => `<span>${x}</span> `;
  return sp(model) + sp(`Balans = dni na statku − dni w domu${p.travelBal ? ' + podróż' : ''}${p.courseBal === 'on' ? ' + kurs' : p.courseBal === 'off' ? ' − kurs' : ''}.`)
    + sp(`${rates}${p.hraPct ? `, HRA ${NF1.format(p.hraPct)}%` : ''}.`)
    + (t && Object.keys(t.byCur).length > 1 ? sp('Kwoty w innych walutach przeliczone po kursach z Ustawień.') : '');
}
const showSettle = p => p.type !== 'day' && p.balPay;
VIEWS.pulpit = () => {
  const s = S.settings, p = plan(), P = E.prep(p, S.settings), [a, b] = E.yearRange(UI.year, s);
  const full = E.tally(P, a, b);
  const hasRot = p.rotations.some(r => E.dn(r.start) <= b && E.dn(r.end) >= a);
  if (!hasRot) return `${heroHTML(P)}<div class="strip-wrap"><div class="strip-h"><h3>Rok bilansowy</h3><span>${fD(a)} – ${fD(b)}</span></div></div>
    <div class="empty" style="background:var(--surface);border:1px solid var(--line);border-radius:18px">Brak rotacji w tym roku, więc nie ma czego liczyć. Wpisz kontrakty z tego okresu w zakładce Grafik.<div class="actions" style="justify-content:center;margin-top:12px"><button class="btn pri" data-act="goGrafik">Otwórz grafik</button></div></div>`;
  const state = T0 < a ? 'future' : T0 > b ? 'past' : 'now';
  const td = state === 'now' ? E.tally(P, a, T0) : state === 'past' ? full : E.empty(P);
  const leftLbl = state === 'now' ? 'Balans na dziś' : state === 'past' ? 'Rok zamknięty' : 'Rok jeszcze nie ruszył';
  const settleLbl = full.settle > 0 ? 'Do wypłaty na koniec roku' : full.settle < 0 ? 'Do oddania na koniec roku' : 'Rozliczenie na koniec roku';
  const row = (k, l) => `<tr><td><i class="dot c-${k}"></i>${l}</td><td class="fig">${NF.format(td[k])}</td><td class="fig">${NF.format(full[k])}</td></tr>`;
  const noRate = !p.rates.some(x => x.rate > 0) && !(p.type === 'day' && p.rotations.some(r => r.rate > 0));
  return `${heroHTML(P)}
  <div class="strip-wrap"><div class="strip-h"><h3>Rok bilansowy</h3><span>${fD(a)} – ${fD(b)}</span></div>${stripHTML(P, a, b)}${legendHTML()}</div>
  ${full.noFx.length ? `<div class="warn" style="margin-top:14px"><span>Brak kursu ${full.noFx.join(', ')} → ${p.cur}: te kwoty nie są wliczone.</span> <button class="btn" data-act="goSet" style="margin-left:6px;padding:6px 10px">Ustaw</button></div>` : ''}
  ${noRate ? `<div class="warn" style="margin-top:14px">Dniówka nie jest ustawiona, więc kwoty wychodzą 0. <button class="btn" data-act="goSet" style="margin-left:6px;padding:6px 10px">Ustaw</button></div>` : ''}
  <div class="bal">
    <div><div class="k">${leftLbl}</div><div class="v ${cls(td.bal)}">${sgn(td.bal)}</div><div class="m">${dni(td.bal)}</div></div>
    <div><div class="k">Na koniec roku</div><div class="v ${cls(full.bal)}">${sgn(full.bal)}</div><div class="m">${dni(full.bal)}</div></div>
    ${showSettle(p) ? `<div class="wide"><div class="k">${settleLbl}</div><div class="v ${cls(full.settle)}">${money(full.settle, true)}</div></div>`
      : `<div class="wide"><div class="k">${p.type === 'day' ? 'Zarobki za rok (day rate)' : 'Zarobki za rok'}</div><div class="v">${money(full.total)}</div></div>`}
  </div>
  <div class="sec"><table class="ledger"><thead><tr><th>Dni</th><th>${state === 'now' ? 'do dziś' : state === 'past' ? 'rok' : '–'}</th><th>cały rok</th></tr></thead><tbody>
    ${row('ON', 'Na statku')}${row('OFF', 'W domu')}${row('TRAVEL', 'Podróż')}${row('COURSE', 'Kurs')}
    <tr><td>Dni płatne</td><td class="fig">${NF1.format(td.paid)}</td><td class="fig">${NF1.format(full.paid)}</td></tr>
    <tr><td>Wypłaty w roku</td><td class="fig">${money(td.pay)}</td><td class="fig">${money(full.pay)}</td></tr>
    ${p.hraPct || full.hra ? `<tr><td>HRA <span class="note">(${NF.format(full.HRA)} ${dni(full.HRA)})</span></td><td class="fig">${money(td.hra)}</td><td class="fig">${money(full.hra)}</td></tr>` : ''}
    ${showSettle(p) ? `<tr><td>Rozliczenie balansu</td><td class="fig">–</td><td class="fig ${cls(full.settle)}">${money(full.settle, true)}</td></tr>` : ''}
    <tr class="tot"><td>Razem za rok</td><td></td><td class="fig">${money(full.total)}</td></tr>
  </tbody></table>
  <p class="note">${payNote(p, full)}</p></div>`;
};

/* ---------- Kalendarz ---------- */
VIEWS.kalendarz = () => {
  const P = E.prep(plan(), S.settings), [Y, M] = UI.cal;
  const first = Date.UTC(Y, M - 1, 1) / E.DAY, last = Date.UTC(Y, M, 1) / E.DAY - 1;
  const start = first - E.dow(first), end = last + (6 - E.dow(last));
  let cells = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'].map(d => `<div class="wd">${d}</div>`).join('');
  for (let n = start; n <= end; n++) {
    const st = E.statusOf(P, n), ov = P.ov[n] ? ' ov' : '', nh = st === 'ON' && E.hraIn(P, n) && P.hoff[n] ? ' nohra' : '', out = n < first || n > last ? ' out' : '', td = n === T0 ? ' today' : '';
    cells += `<button class="${st}${ov}${nh}${out}${td}" data-act="day" data-n="${n}" aria-label="${fLong(n)}, ${LABEL[st]}">${E.ymd(n)[2]}</button>`;
  }
  const t = E.tally(P, first, last), hraTxt = plan().hraPct ? ` <span>Dni z HRA:</span> <b>${t.HRA}</b>${t.ON > t.HRA ? ` <span>(bez HRA: ${t.ON - t.HRA}, przerywana ramka)</span>` : ''}.` : '';
  return `<div class="cal-h"><button class="ib" data-act="calPrev" aria-label="Poprzedni miesiąc">‹</button><h2>${MON[M - 1]} ${Y}</h2><button class="ib" data-act="calNext" aria-label="Następny miesiąc">›</button></div>
  <div class="cal">${cells}</div>
  <div class="cal-sum">${E.STATUSES.map(s => `<div><b style="color:var(--${{ ON: 'on', OFF: 'off', TRAVEL: 'tr', COURSE: 'co' }[s]})">${t[s]}</b><span>${LABEL[s]}</span></div>`).join('')}</div>
  <p class="note" style="margin-top:12px"><span>Balans miesiąca:</span> <b class="${cls(t.bal)}">${sgn(t.bal)} ${dni(t.bal)}</b>.${hraTxt} <span>Dotknij dnia, żeby ręcznie zmienić jego status, np. przedłużony kontrakt albo dodatkowy dzień podróży. Ręczne zmiany mają kropkę.</span></p>
  ${T0 < first || T0 > last ? `<div class="actions"><button class="btn" data-act="calToday">Wróć do dzisiaj</button></div>` : ''}`;
};
function daySheet(n) {
  const p = plan(), P = E.prep(p, S.settings), auto = E.autoStatus(P, n), cur = p.overrides[E.ds(n)] || null;
  const opts = [['', `Automatycznie`, auto], ...E.STATUSES.map(s => [s, LABEL[s], s])];
  const k = E.ds(n), inHra = p.hraPct > 0 && E.statusOf(P, n) === 'ON' && E.hraIn(P, n);
  const html = `<p class="note" style="margin:0 0 12px"><span>${WD[E.dow(n)]}.</span> <span>Z grafiku wynika:</span> <b>${LABEL[auto]}</b>.</p>` +
    opts.map(([v, l, s]) => `<button class="opt" data-act="setDay" data-v="${v}" aria-pressed="${(cur || '') === v}"><i class="dot c-${s}"></i>${l}${v === '' ? `<small>${LABEL[auto]}</small>` : ''}</button>`).join('') +
    (inHra ? `<label class="sw" style="border-top:1px solid var(--line);margin-top:6px"><p>HRA tego dnia<small>Wyłącz np. na stocznię albo tranzyt poza strefą</small></p><input type="checkbox" class="toggle" data-f="hra" ${p.hraOff[k] ? '' : 'checked'}></label>
    <button class="btn full" data-act="hraRange">Bez HRA w zakresie dat…</button>` : '');
  openSheet(fLong(n), html, {
    setDay: el => { if (el.dataset.v) p.overrides[k] = el.dataset.v; else delete p.overrides[k]; save(); closeSheet(); render(); },
    hraRange: () => hraRangeSheet(n)
  }, el => { if (el.dataset.f === 'hra') { if (el.checked) delete p.hraOff[k]; else p.hraOff[k] = true; save(); render(); } });
}
function hraRangeSheet(n) {
  const p = plan(); const g = { a: E.ds(n), b: E.ds(n + 13) };
  const body = () => `<p class="note" style="margin:0 0 6px">Np. stocznia, drydock albo tranzyt poza strefą. Dotyczy tylko dni na statku w rotacjach z HRA.</p>
    <div class="row2"><label class="field"><span>Od</span><input type="date" data-f="a" value="${g.a}"></label><label class="field"><span>Do</span><input type="date" data-f="b" value="${g.b}"></label></div>
    <div class="btns"><button class="btn" data-act="on">Przywróć HRA</button><button class="btn pri" data-act="off">Wyłącz HRA</button></div>`;
  const apply = off => { const a = E.dn(g.a), b = E.dn(g.b); if (!(b >= a)) return toast('Data „do” jest przed „od”'); let c = 0;
    for (let d = a; d <= b; d++) { const kk = E.ds(d); if (off) { if (!p.hraOff[kk]) c++; p.hraOff[kk] = true; } else if (p.hraOff[kk]) { delete p.hraOff[kk]; c++; } }
    save(); closeSheet(); render(); toast(off ? `Bez HRA: ${b - a + 1} dni` : `Przywrócono HRA: ${c} dni`); };
  openSheet('Okres bez HRA', body(), { off: () => apply(true), on: () => apply(false) }, el => { if (el.dataset.f) g[el.dataset.f] = el.value; });
}

/* ---------- Grafik ---------- */
VIEWS.grafik = () => {
  const p = plan(), s = S.settings; sortRots(p);
  let html = `<div class="actions"><button class="btn pri" data-act="addRot">Dodaj rotację</button><button class="btn" data-act="addCourse">Dodaj kurs</button><button class="btn" data-act="gen">Generuj serię</button></div>`;
  if (!p.rotations.length) html += `<div class="empty">Ten scenariusz nie ma jeszcze rotacji. Dodaj pierwszą albo wygeneruj serię, np. 6 tygodni na statku i 6 w domu.</div>`;
  let lastY = null;
  for (const r of p.rotations) {
    const a = E.dn(r.start), b = E.dn(r.end), y = E.yearOf(a, s);
    if (y !== lastY) { const [ya, yb] = E.yearRange(y, s); html += `<div class="yhead"><b>Rok ${y}/${String(y + 1).slice(2)}</b><span>${fDs(ya)} – ${fDs(yb)}</span></div>`; lastY = y; }
    const extra = r.type === 'ON' ? `Podróż: ${r.tb} przed, ${r.ta} po${p.hraPct ? (r.hra ? '. HRA' : '. Bez HRA') : ''}${p.type === 'day' && r.rate ? `. ${rateTxt(r.rate, r.cur || p.cur)}/dzień` : ''}` : 'Kurs / szkolenie';
    html += `<button class="rot ${r.type}${b < T0 ? ' past' : ''}" data-act="editRot" data-id="${r.id}"><span class="bar-c"></span>
      <span class="main"><span class="t">${r.type === 'ON' ? 'Na statku' + (r.note ? ' – ' + esc(r.note) : '') : esc(r.note || 'Kurs')}</span><span class="d" style="display:block">${fDs(a)} – ${fD(b)}</span><span class="x">${extra}</span></span>
      <span class="len">${b - a + 1}<small>dni</small></span></button>`;
  }
  const ho = Object.keys(p.hraOff).sort();
  if (ho.length) html += `<div class="sec"><h3>Dni bez HRA</h3><p class="note">${ho.length} ${dni(ho.length)}: ${hraSpans(ho)}</p><div class="actions" style="margin-top:8px"><button class="btn" data-act="clearHra">Przywróć HRA wszędzie</button></div></div>`;
  const ov = Object.keys(p.overrides).sort();
  if (ov.length) {
    html += `<div class="sec"><h3>Ręczne zmiany dni</h3><div class="group">${ov.map(k => `<button class="list-btn" data-act="ovDay" data-n="${E.dn(k)}"><span>${fD(E.dn(k))}</span><small>${LABEL[p.overrides[k]]}</small></button>`).join('')}</div>
    <div class="actions" style="margin-top:10px"><button class="btn dng" data-act="clearOv">Usuń wszystkie ręczne zmiany</button></div></div>`;
  }
  return html;
};
function hraSpans(keys) {
  const ns = keys.map(E.dn).sort((x, y) => x - y), out = []; let a = ns[0], b = ns[0];
  for (const n of ns.slice(1)) { if (n === b + 1) b = n; else { out.push([a, b]); a = b = n; } }
  out.push([a, b]); return out.map(([x, y]) => x === y ? fD(x) : `${fDs(x)}–${fD(y)}`).join(', ');
}
function lastOnEnd(p) { const ons = p.rotations.filter(r => r.type === 'ON').map(r => E.dn(r.end)); return ons.length ? Math.max(...ons) : null; }
function rotSheet(r0, isNew) {
  const p = plan(), s = S.settings;
  const r = { ...r0 };
  const body = () => {
    const a = r.start ? E.dn(r.start) : null, b = r.end ? E.dn(r.end) : null;
    const ok = a !== null && b !== null && b >= a;
    const ovl = ok ? E.overlaps(p, r) : [];
    return `<div class="seg" style="margin-bottom:4px"><button data-act="type" data-v="ON" aria-pressed="${r.type === 'ON'}">Rotacja na statku</button><button data-act="type" data-v="COURSE" aria-pressed="${r.type === 'COURSE'}">Kurs</button></div>
    <div class="row2"><label class="field"><span>${r.type === 'ON' ? 'Zaokrętowanie' : 'Pierwszy dzień'}</span><input type="date" data-f="start" value="${r.start}"></label>
    <label class="field"><span>${r.type === 'ON' ? 'Ostatni dzień na statku' : 'Ostatni dzień'}</span><input type="date" data-f="end" value="${r.end}"></label></div>
    ${r.type === 'ON' ? `<div class="row2"><div class="field"><span>Dni podróży przed</span>${stepper('tb', r.tb)}</div><div class="field"><span>Dni podróży po</span>${stepper('ta', r.ta)}</div></div>
    ${p.type === 'day' ? `<div class="row2"><label class="field"><span>Dniówka tego kontraktu</span><input type="number" inputmode="decimal" step="0.01" min="0" data-f="rate" value="${r.rate || ''}" placeholder="${grp(E.rateAt(E.prep(p, S.settings), a || T0), 2)} (scenariusz)"></label>
      <div class="field"><span>Waluta</span><div class="chips">${E.CURRENCIES.map(c => `<button data-act="rcur" data-v="${c}" aria-pressed="${(r.cur || p.cur) === c}">${c}</button>`).join('')}</div></div></div>
      <p class="note" style="margin:-2px 0 6px">Puste pole = dniówka scenariusza (${p.cur}). Podróż tej rotacji liczona tą samą stawką.</p>` : ''}
    ${p.hraPct ? `<label class="sw"><p>Dodatek HRA<small>${NF1.format(p.hraPct)}% dniówki za dni na statku. Pojedyncze dni wyłączysz w kalendarzu</small></p><input type="checkbox" class="toggle" data-f="hra" ${r.hra ? 'checked' : ''}></label>` : ''}` : ''}
    <label class="field"><span>Notatka (opcjonalnie)</span><input type="text" data-f="note" value="${esc(r.note)}" placeholder="${r.type === 'ON' ? 'np. statek, projekt' : 'np. nazwa kursu'}" maxlength="60"></label>
    <p class="note" id="rotInfo">${ok ? `<span>Długość:</span> <b>${b - a + 1} ${dni(b - a + 1)}</b>${r.type === 'ON' && (r.tb || r.ta) ? `, podróż ${fDs(a - r.tb)} i ${fDs(b + r.ta)}` : ''}` : 'Ostatni dzień nie może być przed pierwszym.'}</p>
    ${ovl.length ? `<div class="warn">Nachodzi na: ${ovl.map(o => `${fDs(E.dn(o.start))}–${fDs(E.dn(o.end))}`).join(', ')}. Dni wspólne liczą się raz.</div>` : ''}
    <div class="btns">${isNew ? '' : '<button class="btn dng" data-act="del">Usuń</button>'}<button class="btn pri" data-act="save" ${ok ? '' : 'disabled'}>${isNew ? 'Dodaj' : 'Zapisz'}</button></div>`;
  };
  const rer = () => { $('sheetBody').innerHTML = body(); };
  openSheet(isNew ? (r.type === 'ON' ? 'Nowa rotacja' : 'Nowy kurs') : (r.type === 'ON' ? 'Rotacja' : 'Kurs'), body(), {
    rcur: el => { r.cur = el.dataset.v === p.cur ? null : el.dataset.v; rer(); },
    type: el => { r.type = el.dataset.v; r.hra = r.type === 'ON'; if (r.type === 'COURSE') { r.tb = 0; r.ta = 0; } else if (!r.tb && !r.ta) { r.tb = s.tb; r.ta = s.ta; } rer(); },
    step: el => { const k = el.dataset.k; r[k] = Math.max(0, Math.min(5, (+r[k] || 0) + (+el.dataset.d))); rer(); },
    del: () => confirmSheet('Usunąć?', `${r.type === 'ON' ? 'Rotacja' : 'Kurs'} ${fDs(E.dn(r.start))} – ${fD(E.dn(r.end))} zniknie z grafiku.`, 'Usuń', () => {
      p.rotations = p.rotations.filter(x => x.id !== r.id); save(); render(); toast('Usunięto'); }),
    save: () => { if (isNew) p.rotations.push(r); else Object.assign(p.rotations.find(x => x.id === r.id), r); sortRots(p); save(); closeSheet(); render(); toast(isNew ? 'Dodano' : 'Zapisano'); }
  }, el => { const f = el.dataset.f; if (!f) return; if (f === 'hra') { r.hra = el.checked; return; }
    if (f === 'rate') { const v = parseFloat(String(el.value).replace(',', '.')); r.rate = v > 0 ? Math.round(v * 100) / 100 : null; return; }
    r[f] = el.value; if (f !== 'note') rer(); });
}
function stepper(k, v) { return `<div class="stepper"><button data-act="step" data-k="${k}" data-d="-1" aria-label="mniej">−</button><output>${v}</output><button data-act="step" data-k="${k}" data-d="1" aria-label="więcej">+</button></div>`; }
function genSheet() {
  const p = plan(), s = S.settings, le = lastOnEnd(p);
  const g = { start: E.ds(le !== null ? le + 1 + 42 : T0), on: 6, off: 6, count: 4, tb: s.tb, ta: s.ta };
  const chips = (k, arr) => `<div class="chips">${arr.map(w => `<button data-act="ch" data-k="${k}" data-v="${w}" aria-pressed="${g[k] === w}">${w} tyg.</button>`).join('')}</div>`;
  const body = () => {
    const list = g.start ? E.generate(g.start, g.on, g.off, g.count, g.tb, g.ta) : [];
    return `<label class="field"><span>Pierwszy dzień na statku</span><input type="date" data-f="start" value="${g.start}"></label>
    <div class="field"><span>Na statku</span>${chips('on', [2, 3, 4, 5, 6, 8])}</div>
    <div class="field"><span>W domu</span>${chips('off', [2, 3, 4, 5, 6, 8])}</div>
    <div class="row2"><div class="field"><span>Liczba rotacji</span>${stepper('count', g.count)}</div><div class="field"><span>Podróż przed / po</span>${stepper('tb', g.tb)}</div></div>
    <div class="prev">${list.map(r => `<div><span>${fDs(E.dn(r.start))} – ${fD(E.dn(r.end))}</span><span>${g.on * 7} dni</span></div>`).join('')}</div>
    <p class="note">Podróż ustawiona na ${g.tb} ${dni(g.tb)} przed i po każdej rotacji. Pojedyncze rotacje poprawisz potem ręcznie.</p>
    <div class="btns"><button class="btn pri" data-act="add" ${list.length ? '' : 'disabled'}>Dodaj ${list.length} ${list.length === 1 ? 'rotację' : list.length < 5 ? 'rotacje' : 'rotacji'}</button></div>`;
  };
  const rer = () => { $('sheetBody').innerHTML = body(); };
  openSheet('Generuj serię rotacji', body(), {
    ch: el => { g[el.dataset.k] = +el.dataset.v; rer(); },
    step: el => { const k = el.dataset.k, d = +el.dataset.d; if (k === 'count') g.count = Math.max(1, Math.min(20, g.count + d)); else { g.tb = g.ta = Math.max(0, Math.min(5, g.tb + d)); } rer(); },
    add: () => { const list = E.generate(g.start, g.on, g.off, g.count, g.tb, g.ta); list.forEach(r => p.rotations.push({ id: uid(), ...r, hra: true, rate: null, cur: null })); sortRots(p); save(); closeSheet(); render(); toast(`Dodano ${list.length}`); }
  }, el => { if (el.dataset.f === 'start') { g.start = el.value; rer(); } });
}

/* ---------- Finanse ---------- */
VIEWS.finanse = () => {
  const s = S.settings;
  const top = `<div class="fin-top"><div class="seg"><button data-act="fin" data-v="mies" aria-pressed="${UI.fin === 'mies'}">Miesiące</button><button data-act="fin" data-v="scn" aria-pressed="${UI.fin === 'scn'}">Scenariusze</button></div>
  ${s.home && s.home !== plan().cur ? `<div class="seg cur"><button data-act="cur" data-v="0" aria-pressed="${!s.showHome}">${plan().cur}</button><button data-act="cur" data-v="1" aria-pressed="${!!s.showHome}">${s.home}</button></div>` : ''}</div>`;
  return top + (UI.fin === 'mies' ? finMonths() : finScenarios());
};
function finMonths() {
  const [ya, yb] = E.yearRange(UI.year, S.settings);
  if (!plan().rotations.some(r => E.dn(r.start) <= yb && E.dn(r.end) >= ya)) return `<div class="empty">Brak rotacji w roku ${UI.year}/${String(UI.year + 1).slice(2)}. Dodaj kontrakty w zakładce Grafik.</div>`;
  const s = S.settings, P = E.prep(plan(), S.settings), rows = E.months(P, UI.year, s), [a, b] = E.yearRange(UI.year, s), t = E.tally(P, a, b);
  const tr = rows.map(r => `<tr${T0 >= r.a && T0 <= r.b ? ' style="background:var(--on-s)"' : ''}><td>${MON_S[r.M - 1]} ${String(r.Y).slice(2)}</td><td>${r.ON}</td><td>${r.OFF}</td><td>${r.TRAVEL}</td><td>${r.COURSE}</td><td>${money(r.pay + r.hra)}</td><td class="${cls(r.run)}">${sgn(r.run)}</td></tr>`).join('');
  return `<div class="sec" style="margin-top:16px"><table class="ledger" style="font-size:14px"><thead><tr><th>Mies.</th><th>Statek</th><th>Dom</th><th>Podr.</th><th>Kurs</th><th>Wypłata</th><th>Saldo</th></tr></thead>
  <tbody>${tr}<tr class="tot"><td>Rok</td><td>${t.ON}</td><td>${t.OFF}</td><td>${t.TRAVEL}</td><td>${t.COURSE}</td><td>${money(t.pay + t.hra)}</td><td class="${cls(t.bal)}">${sgn(t.bal)}</td></tr></tbody></table>
  <p class="note"><span>Wypłata = dni płatne × dniówka${plan().hraPct ? ' + HRA' : ''}.</span> <span>Saldo to balans dni narastająco od ${fDs(a)}.</span> ${payNote(plan(), t)}</p></div>
  <div class="bal"><div><div class="k">Wypłaty w roku</div><div class="v" style="font-size:28px">${money(t.pay + t.hra)}</div>${t.hra ? `<div class="m">w tym HRA ${money(t.hra)}</div>` : ''}</div>
  ${showSettle(plan()) ? `<div><div class="k">Rozliczenie balansu</div><div class="v ${cls(t.settle)}" style="font-size:28px">${money(t.settle, true)}</div></div>`
    : `<div><div class="k">Dni płatne</div><div class="v" style="font-size:28px">${NF1.format(t.paid)}</div><div class="m">${plan().type === 'day' ? 'day rate' : 'bez rozliczenia balansu'}</div></div>`}
  <div class="wide"><div class="k">Razem za rok bilansowy</div><div class="v">${money(t.total)}</div></div></div>
  <div class="actions" style="margin-top:14px"><button class="btn full" data-act="csv">Eksportuj tabelę do CSV (Excel)</button></div>`;
}
/* warunki kursu dla każdego scenariusza, który ma dni kursu w danym roku */
function courseTerms(res) {
  const withCourse = res.filter(({ t }) => t.COURSE > 0);
  if (!withCourse.length) return '';
  return `<div class="sec"><h3>Warunki kursu</h3><p class="note">Szybkie „co jeśli” do negocjacji. Zmiana od razu przelicza scenariusz.</p>
  ${withCourse.map(({ p, t }) => `<div class="group" style="margin-top:10px"><p class="note" style="margin:10px 0 0"><b>${esc(p.name)}</b> · <span>${t.COURSE} ${dni(t.COURSE)} kursu</span></p>
    <div class="field"><span>Dni kursu płatne</span><div class="chips">${[0, 50, 100].map(v => `<button data-act="cpct" data-id="${p.id}" data-v="${v}" aria-pressed="${+p.coursePct === v}">${v}%</button>`).join('')}</div></div>
    <div class="field"><span>Kurs w balansie</span><div class="seg"><button data-act="cbal" data-id="${p.id}" data-v="none" aria-pressed="${p.courseBal === 'none'}">Nie liczy się</button><button data-act="cbal" data-id="${p.id}" data-v="on" aria-pressed="${p.courseBal === 'on'}">Jak praca</button><button data-act="cbal" data-id="${p.id}" data-v="off" aria-pressed="${p.courseBal === 'off'}">Jak wolne</button></div></div></div>`).join('')}</div>`;
}
function finScenarios() {
  const s = S.settings, [a, b] = E.yearRange(UI.year, s), ap = plan();
  const res = S.plans.map(p => ({ p, t: E.tally(E.prep(p, S.settings), a, b) }));
  const inAct = (v, c) => { const r = E.fxRate(s, c, ap.cur); return r === null ? null : v * r; };
  const base = res.find(r => r.p.id === S.active).t.total;
  const cards = res.map(({ p, t }) => {
    const tv = inAct(t.total, p.cur), d = tv === null ? null : tv - base, act = p.id === S.active;
    return `<button class="scn${act ? ' act' : ''}" data-act="pick" data-id="${p.id}" style="width:100%;text-align:left">
      <h4>${esc(p.name)}<small>${p.type === 'day' ? 'day rate' : 'stały'} · ${p.cur}${act ? ' · aktywny' : ''}</small></h4>
      <div class="g"><div><b>${t.ON}</b>statek</div><div><b>${t.OFF}</b>dom</div><div><b>${t.TRAVEL}</b>podróż</div><div><b>${t.COURSE}</b>kurs</div></div>
      <div class="g" style="grid-template-columns:1fr 1.2fr 1.2fr;margin-top:8px"><div><b class="${cls(t.bal)}">${sgn(t.bal)}</b>balans (dni)</div>
        ${showSettle(p) ? `<div><b class="${cls(t.settle)}">${money(t.settle, true, p.cur)}</b>rozliczenie</div>` : `<div><b>${NF1.format(t.paid)}</b>dni płatne</div>`}
        ${p.hraPct ? `<div><b>${money(t.hra, false, p.cur)}</b>HRA (${t.HRA} dni)</div>` : '<div></div>'}</div>
      <div class="tot"><span>Razem za rok${act || d === null ? '' : `<br><span class="diff ${cls(d)}">${money(d, true, ap.cur)} vs aktywny</span>`}</span><b>${money(t.total, false, p.cur)}</b></div></button>`;
  }).join('');
  return `<div class="sec" style="margin-top:14px">${cards}</div>
  ${courseTerms(res)}
  <div class="actions"><button class="btn" data-act="dupPlan">Duplikuj aktywny scenariusz</button></div>`;
}

/* ---------- Ustawienia ---------- */
/* kursy potrzebne do przeliczeń: do waluty domowej albo (bez niej) między walutą rotacji a walutą scenariusza */
function fxPairs() {
  const s = S.settings, out = [], add = (a, b) => { if (a !== b && !out.some(x => x[0] === a && x[1] === b)) out.push([a, b]); };
  const used = new Set();
  for (const p of S.plans) { used.add(p.cur); if (p.type === 'day') for (const r of p.rotations) if (r.cur && r.rate) used.add(r.cur); }
  if (s.home) for (const c of used) add(c, s.home);
  else for (const p of S.plans) if (p.type === 'day') for (const r of p.rotations) if (r.cur && r.rate && r.cur !== p.cur) add(r.cur, p.cur);
  return out;
}
VIEWS.ustawienia = () => {
  const s = S.settings, p = plan(), perm = p.type !== 'day';
  const num = (k, l, step = '1') => `<label class="field"><span>${l}</span><input type="number" inputmode="decimal" step="${step}" data-set="${k}" value="${s[k]}"></label>`;
  const pnum = (k, l, step = '1') => `<label class="field"><span>${l}</span><input type="number" inputmode="decimal" step="${step}" min="0" data-pset="${k}" value="${p[k]}"></label>`;
  const ptog = (k, l, sub) => `<label class="sw"><p>${l}<small>${sub}</small></p><input type="checkbox" class="toggle" data-ptog="${k}" ${p[k] ? 'checked' : ''}></label>`;
  const rates = p.rates.map((x, i) => `<div class="rate-row">${i ? `<input type="date" data-ri="${i}" data-rf="from" value="${x.from}" aria-label="Od dnia">` : '<span class="rate-from">Od początku</span>'}
      <input type="number" inputmode="decimal" step="0.01" min="0" data-ri="${i}" data-rf="rate" value="${x.rate || ''}" placeholder="0,00" aria-label="Dniówka">
      ${i ? `<button class="ib" data-act="rateDel" data-i="${i}" aria-label="Usuń zmianę stawki">✕</button>` : '<span class="ib"></span>'}</div>`).join('');
  return `<div class="sec" style="margin-top:6px"><h3>Język / Language</h3><div class="group"><div class="field"><div class="chips">${Object.entries(L.LANGS).map(([k, v]) => `<button data-act="lang" data-v="${k}" aria-pressed="${L.lang === k}"><span translate="no">${v}</span></button>`).join('')}</div></div></div></div>
  <div class="sec"><h3>Kontrakt: ${esc(p.name)}</h3><p class="note">Te ustawienia dotyczą tylko tego scenariusza.</p><div class="group">
    <div class="field"><span>Typ kontraktu</span><div class="seg"><button data-act="ptype" data-v="perm" aria-pressed="${perm}">Stały (on/off)</button><button data-act="ptype" data-v="day" aria-pressed="${!perm}">Day rate</button></div></div>
    <p class="note" style="margin:-4px 0 10px">${perm ? 'Płatne dni na statku i w domu. Balans dni na koniec roku może być wypłacany albo potrącany.' : 'Płatne tylko dni na statku (i podróż w ustawionym %). Dni w domu niepłatne, bez wypłaty za balans. Każda rotacja może mieć własną dniówkę i walutę.'}</p>
    <div class="field"><span>Waluta</span><div class="chips">${E.CURRENCIES.map(c => `<button data-act="pcur" data-v="${c}" aria-pressed="${p.cur === c}">${c}</button>`).join('')}</div></div>
    <div class="field"><span>Dniówka (${p.cur})</span>${rates}<button class="btn" data-act="rateAdd" style="margin-top:8px">Zmiana stawki od daty</button></div>
    <p class="note" style="margin:-4px 0 12px">Np. podwyżka w trakcie roku: nowa stawka liczy się od wpisanego dnia.${perm && p.balPay ? ' Balans rozliczany jest stawką z ostatniego dnia roku.' : ''}</p>
    <div class="field"><span>Dzień podróży płatny</span><div class="chips">${[0, 50, 100].map(v => `<button data-act="tpct" data-v="${v}" aria-pressed="${+p.travelPct === v}">${v}%</button>`).join('')}
      <input type="number" inputmode="decimal" min="0" max="100" data-pset="travelPct" value="${p.travelPct}" class="pct-in" aria-label="Inny procent"></div></div>
    ${ptog('travelBal', 'Podróż w balansie', 'Dzień podróży liczony jak dzień pracy')}
    ${perm ? ptog('balPay', 'Wypłata balansu na koniec roku', 'Plus wypłacany, minus potrącany. Wyłącz, jeśli firma nie rozlicza balansu') : ''}
    <div class="row2">${pnum('hraPct', 'Dodatek HRA (% dniówki)')}${pnum('coursePct', 'Dni kursu płatne (%)', '5')}</div>
    <label class="field"><span>Kurs w balansie</span><select data-pset="courseBal"><option value="none" ${p.courseBal === 'none' ? 'selected' : ''}>Nie liczy się</option><option value="on" ${p.courseBal === 'on' ? 'selected' : ''}>Jak dzień pracy</option><option value="off" ${p.courseBal === 'off' ? 'selected' : ''}>Jak dzień wolny</option></select></label></div></div>
  <div class="sec"><h3>Rok bilansowy</h3><div class="group"><div class="row2">
    <label class="field"><span>Zaczyna się dnia</span><input type="number" min="1" max="31" data-set="ysD" value="${s.ysD}"></label>
    <label class="field"><span>Miesiąc</span><select data-set="ysM">${MON_G.map((m, i) => `<option value="${i + 1}" ${s.ysM === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div>
    <p class="note" style="margin:0 0 12px">Teraz: ${fD(E.yStart(UI.year, s))} – ${fD(E.yStart(UI.year + 1, s) - 1)}</p></div></div>
  <div class="sec"><h3>Nowe rotacje</h3><div class="group"><div class="row2">${num('tb', 'Dni podróży przed')}${num('ta', 'Dni podróży po')}</div></div></div>
  <div class="sec"><h3>Waluta domowa</h3><p class="note">Kwoty możesz zobaczyć w swojej walucie, np. tej, w której dostajesz przelew.</p><div class="group">
    <label class="field"><select data-home="1" aria-label="Waluta domowa"><option value="" ${!s.home ? 'selected' : ''}>Brak (nie przeliczaj)</option>${E.HOME_CURRENCIES.map(c => `<option value="${c}" ${s.home === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    ${fxPairs().length ? `<p class="note" style="margin:0 0 4px"><b>Kursy walut</b></p><p class="note" style="margin:0 0 6px">Wpisz kursy ręcznie, np. z dnia wypłaty albo z banku. Aplikacja działa offline i sama ich nie pobiera.</p><div class="row3">
      ${fxPairs().map(([a, b]) => `<label class="field"><span>1 ${a} = ${b}</span><input type="number" inputmode="decimal" step="0.0001" min="0" data-fxpair="${a}>${b}" value="${s.fx[a + '>' + b] || ''}" placeholder="?"></label>`).join('')}</div>`
      : `<p class="note" style="margin:0 0 12px">Nie trzeba żadnych kursów – wszystkie kwoty są w jednej walucie.</p>`}</div></div>
  <div class="sec"><h3>Scenariusze</h3><div class="group">${S.plans.map(x => `<button class="list-btn" data-act="planOpts" data-id="${x.id}"><span>${esc(x.name)}</span><small>${x.type === 'day' ? 'day rate' : 'stały'} · ${x.cur}${x.id === S.active ? ' · aktywny' : ''}</small></button>`).join('')}
    <button class="list-btn" data-act="newPlan"><span>Nowy scenariusz</span><small>+</small></button></div></div>
  ${window.Sync ? window.Sync.card() : ''}
  <div class="sec"><h3>Kopia danych</h3><p class="note">${window.Sync && window.Sync.on() ? 'Dane są w telefonie i na NAS-ie. Kopia pliku to dodatkowe zabezpieczenie.' : 'Dane są tylko w tym telefonie. Zrób kopię przed zmianą telefonu albo odinstalowaniem.'}</p><div class="group">
    <button class="list-btn" data-act="exp"><span>Zapisz kopię w telefonie</span><small>${IS_ANDROID ? 'Pobrane/Rotacje' : 'Pliki, mail'}</small></button>
    <button class="list-btn" data-act="share"><span>Wyślij kopię</span><small>mail, Dysk, WhatsApp</small></button>
    <button class="list-btn" data-act="imp"><span>Wczytaj kopię z pliku</span><small>.json</small></button>
    <button class="list-btn" data-act="csv"><span>Eksportuj prognozę do CSV</span><small>rok ${UI.year}/${String(UI.year + 1).slice(2)}</small></button></div></div>
  <div class="sec"><div class="group"><button class="list-btn" data-act="reset" style="color:var(--neg)"><span>Wyczyść wszystkie dane</span><small>zostaje pusty scenariusz</small></button></div>
  <p class="note" style="margin-top:14px">Rotacje 2.3. Działa offline.</p></div>`;
};

/* ---------- plans ---------- */
function planSheet() {
  openSheet('Scenariusz', S.plans.map(p => `<button class="opt" data-act="pick" data-id="${p.id}" aria-pressed="${p.id === S.active}">${esc(p.name)}<small>${p.rotations.length} poz.</small></button>`).join('') +
    `<div class="btns"><button class="btn" data-act="dup">Duplikuj</button><button class="btn" data-act="new">Nowy</button><button class="btn" data-act="opts">Edytuj</button></div>`, {
    pick: el => { S.active = el.dataset.id; save(); closeSheet(); render(); },
    dup: () => { closeSheet(); dupPlan(); }, new: () => { closeSheet(); newPlan(); }, opts: () => planOpts(S.active)
  });
}
function dupPlan() {
  const p = plan(), c = JSON.parse(JSON.stringify(p)); c.id = uid(); c.name = p.name + ' (kopia)'; c.rotations.forEach(r => r.id = uid());
  S.plans.push(c); S.active = c.id; save(); render(); toast('Utworzono kopię scenariusza');
}
function newPlan() {
  const cp = plan(), g = { name: '', type: cp.type, cur: cp.cur, rate: '' };
  const body = () => `<label class="field"><span>Nazwa</span><input type="text" data-f="name" value="${esc(g.name)}" placeholder="np. Noble day rate" maxlength="40"></label>
    <div class="field"><span>Typ kontraktu</span><div class="seg"><button data-act="t" data-v="perm" aria-pressed="${g.type === 'perm'}">Stały (on/off)</button><button data-act="t" data-v="day" aria-pressed="${g.type === 'day'}">Day rate</button></div></div>
    <div class="row2"><div class="field"><span>Waluta</span><div class="chips">${E.CURRENCIES.map(c => `<button data-act="c" data-v="${c}" aria-pressed="${g.cur === c}">${c}</button>`).join('')}</div></div>
    <label class="field"><span>Dniówka</span><input type="number" inputmode="decimal" step="0.01" min="0" data-f="rate" value="${g.rate}" placeholder="0,00"></label></div>
    <p class="note">Podróż, HRA, kurs i zmiany stawki ustawisz potem w Ustawieniach.</p>
    <div class="btns"><button class="btn" data-act="copy">Kopia aktywnego</button><button class="btn pri" data-act="make">Utwórz pusty</button></div>`;
  const rer = () => { $('sheetBody').innerHTML = body(); };
  openSheet('Nowy scenariusz', body(), {
    t: el => { g.type = el.dataset.v; rer(); }, c: el => { g.cur = el.dataset.v; rer(); },
    copy: () => { closeSheet(); dupPlan(); },
    make: () => { const c = newPlanObj(g.name.trim() || 'Nowy scenariusz', { type: g.type, cur: g.cur, rates: [{ from: '', rate: Math.max(0, parseFloat(String(g.rate).replace(',', '.')) || 0) }] });
      S.plans.push(c); S.active = c.id; save(); closeSheet(); go('grafik'); toast('Utworzono scenariusz'); }
  }, el => { if (el.dataset.f) g[el.dataset.f] = el.value; });
}
function planOpts(id) {
  const p = S.plans.find(x => x.id === id); let name = p.name;
  openSheet('Edytuj scenariusz', `<label class="field"><span>Nazwa</span><input type="text" data-f="name" value="${esc(p.name)}" maxlength="40"></label>
    <div class="btns">${S.plans.length > 1 ? '<button class="btn dng" data-act="del">Usuń</button>' : ''}<button class="btn" data-act="use">Ustaw jako aktywny</button><button class="btn pri" data-act="save">Zapisz</button></div>`, {
    save: () => { p.name = name.trim() || p.name; save(); closeSheet(); render(); },
    use: () => { p.name = name.trim() || p.name; S.active = p.id; save(); closeSheet(); render(); },
    del: () => confirmSheet('Usunąć scenariusz?', `„${p.name}” i wszystkie jego rotacje zostaną usunięte.`, 'Usuń', () => {
      S.plans = S.plans.filter(x => x.id !== p.id); if (S.active === p.id) S.active = S.plans[0].id; save(); render(); toast('Usunięto scenariusz'); })
  }, el => { if (el.dataset.f === 'name') name = el.value; });
}

/* ---------- backup ---------- */
const stamp = () => E.ds(E.todayN());
const backup = () => JSON.stringify({ app: 'rotacje', v: S.v, exported: stamp(), updated: S.updated, settings: S.settings, plans: S.plans, active: S.active }, null, 1);
function saveFile(name, mime, text) {
  if (IS_ANDROID) { const ok = window.Android.saveFile(name, mime, text); toast(ok ? `Zapisano: Pobrane/Rotacje/${name}` : 'Nie udało się zapisać pliku'); return; }
  try {   // iPhone: arkusz udostępniania (Zapisz w Plikach, mail, Dysk)
    const f = new File([text], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: name }).catch(() => { }); return; }
  } catch (e) { }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function shareText(text, title) {
  if (IS_ANDROID) return window.Android.share(text, title);
  if (navigator.share) navigator.share({ title, text }).catch(() => { }); else { navigator.clipboard && navigator.clipboard.writeText(text); toast('Skopiowano do schowka'); }
}
function csv() {
  const s = S.settings, p = plan(), P = E.prep(p, S.settings), rows = E.months(P, UI.year, s), c = p.cur, h = s.home, fx = h && h !== c ? E.fxRate(s, c, h) : null;
  const n = v => String(Math.round(v * 100) / 100).replace('.', ',');
  const hc = v => fx ? [n(v * fx)] : [];
  const lines = [['Miesiąc', 'Na statku', 'W domu', 'Podróż', 'Kurs', 'Dni płatne', `Wypłata ${c}`, 'Dni HRA', `HRA ${c}`, `Razem ${c}`, ...(fx ? [`Razem ${h}`] : []), 'Balans miesiąca', 'Balans narastająco'].join(';')];
  rows.forEach(r => lines.push([`${MON[r.M - 1]} ${r.Y}`, r.ON, r.OFF, r.TRAVEL, r.COURSE, n(r.paid), n(r.pay), r.HRA, n(r.hra), n(r.pay + r.hra), ...hc(r.pay + r.hra), r.bal, r.run].join(';')));
  const [a, b] = E.yearRange(UI.year, s), t = E.tally(P, a, b);
  lines.push(['RAZEM', t.ON, t.OFF, t.TRAVEL, t.COURSE, n(t.paid), n(t.pay), t.HRA, n(t.hra), n(t.pay + t.hra), ...hc(t.pay + t.hra), t.bal, t.bal].join(';'));
  if (showSettle(p)) lines.push(`Rozliczenie balansu ${c};${n(t.settle)}`);
  lines.push(`Razem za rok ${c};${n(t.total)}`, `Scenariusz;${p.name}`, `Typ;${p.type === 'day' ? 'day rate' : 'stały (on/off)'}`);
  saveFile(`rotacje-${UI.year}-${UI.year + 1}-${p.name.replace(/[^\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ-]+/g, '_')}.csv`, 'text/csv', '\ufeff' + lines.map(l => l.split(';').map(c => /\p{L}/u.test(c) && !/^-?[\d,]+$/.test(c) ? L.T(c) : c).join(';')).join('\r\n'));
}
$('fileIn').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    let o; try { o = JSON.parse(rd.result); } catch (err) { return toast('To nie jest plik kopii Rotacji'); }
    if (!validState(o)) return toast('W pliku brakuje scenariuszy');
    confirmSheet('Wczytać kopię?', `Plik z ${o.exported || 'nieznanej daty'}: ${o.plans.length} scenariusz(e). Obecne dane zostaną zastąpione.`, 'Wczytaj', () => {
      S = normalize(o); save(); UI.year = E.yearOf(T0, S.settings); render(); toast('Wczytano kopię'); });
  };
  rd.readAsText(f);
});

/* ---------- sheet / toast ---------- */
let SH = null;
function openSheet(title, html, acts = {}, onInput = null) {
  SH = { acts, onInput }; $('sheetTitle').textContent = title; $('sheetBody').innerHTML = html;
  $('sheet').hidden = false; $('scrim').hidden = false; $('sheetBody').scrollTop = 0;
}
function closeSheet() { SH = null; $('sheet').hidden = true; $('scrim').hidden = true; }
function confirmSheet(title, text, ok, cb) {
  openSheet(title, `<p style="margin:0 0 6px">${esc(text)}</p><div class="btns"><button class="btn" data-act="no">Anuluj</button><button class="btn pri" data-act="yes" style="${ok === 'Usuń' ? 'background:var(--neg);border-color:var(--neg)' : ''}">${ok}</button></div>`,
    { no: closeSheet, yes: () => { closeSheet(); cb(); } });
}
$('sheetBody').addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (t && SH && SH.acts[t.dataset.act] && !t.disabled) SH.acts[t.dataset.act](t); });
$('sheetBody').addEventListener('input', e => { if (SH && SH.onInput) SH.onInput(e.target); });
$('sheetBody').addEventListener('change', e => { if (SH && SH.onInput && e.target.type === 'date') SH.onInput(e.target); });
$('scrim').addEventListener('click', closeSheet); $('sheetClose').addEventListener('click', closeSheet);
let toastT;
function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }

/* ---------- actions ---------- */
const ACT = {
  goGrafik: () => go('grafik'), goSet: () => go('ustawienia'), lang: el => L.set && L.set(el.dataset.v),
  ptype: el => { plan().type = el.dataset.v; save(); render(); },
  pcur: el => { const p = plan(); if (p.cur === el.dataset.v) return; p.cur = el.dataset.v; save(); render(); toast(`Waluta scenariusza: ${p.cur}. Dniówka bez zmian – popraw kwotę, jeśli trzeba.`); },
  tpct: el => { plan().travelPct = +el.dataset.v; save(); render(); },
  rateAdd: () => { const p = plan(); p.rates.push({ from: E.ds(T0), rate: p.rates[p.rates.length - 1].rate }); save(); render(); },
  rateDel: el => { const p = plan(); p.rates.splice(+el.dataset.i, 1); save(); render(); },
  day: el => daySheet(+el.dataset.n), ovDay: el => daySheet(+el.dataset.n),
  calPrev: () => { let [y, m] = UI.cal; m--; if (m < 1) { m = 12; y--; } UI.cal = [y, m]; render(); },
  calNext: () => { let [y, m] = UI.cal; m++; if (m > 12) { m = 1; y++; } UI.cal = [y, m]; render(); },
  calToday: () => { UI.cal = E.ymd(T0).slice(0, 2); render(); },
  addRot: () => { const p = plan(), s = S.settings, le = lastOnEnd(p), a = le !== null ? le + 43 : T0; rotSheet({ id: uid(), type: 'ON', start: E.ds(a), end: E.ds(a + 41), tb: s.tb, ta: s.ta, note: '', hra: true, rate: null, cur: null }, true); },
  addCourse: () => rotSheet({ id: uid(), type: 'COURSE', start: E.ds(T0), end: E.ds(T0 + 13), tb: 0, ta: 0, note: '', hra: false, rate: null, cur: null }, true),
  gen: genSheet,
  editRot: el => rotSheet(plan().rotations.find(r => r.id === el.dataset.id), false),
  clearHra: () => confirmSheet('Przywrócić HRA?', 'Wszystkie dni na statku w rotacjach z HRA znowu będą liczone z dodatkiem.', 'Przywróć', () => { plan().hraOff = {}; save(); render(); }),
  clearOv: () => confirmSheet('Usunąć ręczne zmiany?', 'Wszystkie dni wrócą do statusu wynikającego z grafiku.', 'Usuń', () => { plan().overrides = {}; save(); render(); }),
  fin: el => { UI.fin = el.dataset.v; render(); },
  cur: el => { S.settings.showHome = el.dataset.v === '1'; save(); render(); },
  pick: el => { S.active = el.dataset.id; save(); render(); },
  cpct: el => { const p = S.plans.find(x => x.id === el.dataset.id) || plan(); p.coursePct = +el.dataset.v; save(); render(); },
  cbal: el => { const p = S.plans.find(x => x.id === el.dataset.id) || plan(); p.courseBal = el.dataset.v; save(); render(); },
  dupPlan, newPlan: () => newPlan(), planOpts: el => planOpts(el.dataset.id),
  exp: () => saveFile(`rotacje-kopia-${stamp()}.json`, 'application/json', backup()),
  share: () => shareText(backup(), 'Rotacje – kopia danych'),
  imp: () => $('fileIn').click(),
  csv,
  reset: () => confirmSheet('Wyczyścić wszystkie dane?', 'Wszystkie scenariusze, rotacje i ustawienia zostaną usunięte. Zrób najpierw kopię, jeśli ich potrzebujesz.', 'Usuń', () => { S = sample(); save(); UI.year = E.yearOf(T0, S.settings); go('pulpit'); toast('Wyczyszczono dane'); })
};
$('view').addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (!t) return; if (ACT[t.dataset.act]) ACT[t.dataset.act](t); else if (window.Sync && window.Sync.act[t.dataset.act]) window.Sync.act[t.dataset.act](t); });
const num = v => parseFloat(String(v).replace(',', '.'));
$('view').addEventListener('change', e => {
  const el = e.target, s = S.settings, p = plan();
  if (el.dataset.ptog) { p[el.dataset.ptog] = el.checked; save(); render(); return; }
  if (el.dataset.pset) {
    const k = el.dataset.pset;
    if (k === 'courseBal') p[k] = el.value;
    else { const v = num(el.value), lim = { travelPct: 100, hraPct: 200, coursePct: 100 }[k]; if (isNaN(v)) { el.value = p[k]; return; } p[k] = Math.min(lim, Math.max(0, Math.round(v * 10) / 10)); }
    save(); render(); return;
  }
  if (el.dataset.ri !== undefined) {
    const x = p.rates[+el.dataset.ri]; if (!x) return;
    if (el.dataset.rf === 'rate') { const v = num(el.value); x.rate = isNaN(v) ? 0 : Math.max(0, Math.round(v * 100) / 100); }
    else if (el.value) x.from = el.value;
    p.rates = [p.rates[0], ...p.rates.slice(1).sort((u, w) => u.from < w.from ? -1 : 1)];
    save(); render(); return;
  }
  if (el.dataset.fxpair) { const v = num(el.value), k = el.dataset.fxpair; if (v > 0) s.fx[k] = Math.round(v * 10000) / 10000; else delete s.fx[k]; save(); render(); return; }
  if (el.dataset.home) { s.home = el.value; if (!s.home) s.showHome = false; save(); render(); return; }
  const k = el.dataset.set; if (!k) return;
  let v = num(el.value);
  const lim = { ysD: [1, 31], ysM: [1, 12], tb: [0, 5], ta: [0, 5] }[k];
  if (isNaN(v)) { el.value = s[k]; return; }
  v = Math.round(Math.min(lim[1], Math.max(lim[0], v))); s[k] = v; el.value = v;
  save();
  if (k === 'ysD' || k === 'ysM') { UI.year = E.yearOf(T0, s); render(); }
});
$('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });
$('planBtn').addEventListener('click', planSheet);
$('yearSwitch').addEventListener('click', e => { const b = e.target.closest('[data-yr]'); if (b) { UI.year += +b.dataset.yr; render(); } });

window.handleBack = () => {
  if (SH) return closeSheet();
  if (UI.tab !== 'pulpit') return go('pulpit');
  if (IS_ANDROID) window.Android.exit();
};
render();
