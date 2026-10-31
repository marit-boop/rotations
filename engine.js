'use strict';
/* Silnik obliczeń: statusy dni, balans on/off, wypłaty. Bez zależności od DOM.
   Każdy scenariusz ma własny model wynagrodzenia:
   - 'perm' (stały): płatne dni na statku i w domu (on/off), balans rozliczany na koniec roku (opcjonalnie),
   - 'day'  (day rate): płatne tylko dni na statku (+ podróż w %), bez rozliczenia balansu;
     każda rotacja może mieć własną dniówkę i walutę. */
const DAY = 864e5;
const pad = n => String(n).padStart(2, '0');
const dn = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY; };
const ds = n => new Date(n * DAY).toISOString().slice(0, 10);
const ymd = n => { const d = new Date(n * DAY); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };
const dow = n => (new Date(n * DAY).getUTCDay() + 6) % 7; // 0 = poniedziałek
const todayN = () => { const t = new Date(); return Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) / DAY; };

const STATUSES = ['ON', 'OFF', 'TRAVEL', 'COURSE'];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'NOK', 'DKK'];                       // waluty kontraktu
const HOME_CURRENCIES = ['PLN', 'PHP', 'EUR', 'USD', 'GBP', 'NOK', 'DKK', 'SEK', 'CHF', 'RON', 'UAH', 'INR', 'ZAR'];

const DEFAULT_SETTINGS = {
  ysM: 10, ysD: 24,                               // początek roku bilansowego
  tb: 1, ta: 1,                                   // domyślne dni podróży przed / po rotacji
  home: '',            // waluta domowa ('' = nie przeliczaj)
  fx: {},              // kursy wpisane ręcznie: { 'EUR>PLN': 4.39, 'USD>EUR': 0.92 }
  showHome: false
};
const DEFAULT_PAY = {
  type: 'perm',          // 'perm' | 'day'
  cur: 'EUR',
  rates: [{ from: '', rate: 0 }],   // dniówka; kolejne pozycje = zmiana od daty
  travelPct: 100,        // podróż płatna w % dniówki
  travelBal: false,      // podróż liczona do balansu jako praca
  hraPct: 0,             // dodatek HRA w % dniówki (dni na statku w strefie)
  coursePct: 0,          // kurs płatny w %
  courseBal: 'none',     // 'none' | 'on' | 'off'
  balPay: true           // tylko 'perm': wypłata / zwrot balansu na koniec roku
};

const yStart = (y, s) => Date.UTC(y, s.ysM - 1, s.ysD) / DAY;
const yearRange = (y, s) => [yStart(y, s), yStart(y + 1, s) - 1];
const yearOf = (n, s) => { const y = ymd(n)[0]; return n >= yStart(y, s) ? y : y - 1; };
/* kurs from→to: bezpośredni, odwrotny albo przez walutę domową; null = brak kursu */
function fxRate(s, from, to) {
  if (from === to) return 1;
  const fx = (s && s.fx) || {}, d = +fx[from + '>' + to], i = +fx[to + '>' + from];
  if (d > 0) return d;
  if (i > 0) return 1 / i;
  const h = s && s.home;
  if (h && from !== h && to !== h) { const a = fxRate(s, from, h), b = fxRate(s, to, h); if (a && b) return a / b; }
  return null;
}

function prep(plan, s) {
  const on = [], co = [], tr = [], hra = [], rots = [];
  for (const r of plan.rotations || []) {
    if (!r.start || !r.end) continue;
    const a = dn(r.start), b = dn(r.end);
    if (b < a) continue;
    if (r.type === 'COURSE') { co.push([a, b]); continue; }
    const i = rots.push(r) - 1;
    on.push([a, b, i]);
    if (r.hra !== false) hra.push([a, b]);
    const tb = Math.max(0, +r.tb || 0), ta = Math.max(0, +r.ta || 0);
    if (tb) tr.push([a - tb, a - 1, i]);
    if (ta) tr.push([b + 1, b + ta, i]);
  }
  const ov = {};
  for (const k in plan.overrides || {}) ov[dn(k)] = plan.overrides[k];
  const hoff = {};
  for (const k in plan.hraOff || {}) hoff[dn(k)] = true;
  const pay = { ...DEFAULT_PAY, ...plan };
  const rates = (pay.rates && pay.rates.length ? pay.rates : DEFAULT_PAY.rates)
    .map(x => ({ n: x.from ? dn(x.from) : -Infinity, rate: +x.rate || 0 })).sort((x, y) => x.n - y.n);
  return { on, co, tr, ov, hra, hoff, rots, pay, rates, s: s || {} };
}
const inAny = (arr, n) => { for (const [a, b] of arr) if (n >= a && n <= b) return true; return false; };
const findIn = (arr, n) => { for (const x of arr) if (n >= x[0] && n <= x[1]) return x[2]; return -1; };
function autoStatus(P, n) {
  if (inAny(P.on, n)) return 'ON';
  if (inAny(P.tr, n)) return 'TRAVEL';
  if (inAny(P.co, n)) return 'COURSE';
  return 'OFF';
}
const statusOf = (P, n) => P.ov[n] || autoStatus(P, n);
const hraIn = (P, n) => inAny(P.hra, n);                       // dzień w rotacji z HRA
const hraDay = (P, n) => statusOf(P, n) === 'ON' && hraIn(P, n) && !P.hoff[n];
function rateAt(P, n) { let v = P.rates[0].rate; for (const x of P.rates) if (x.n <= n) v = x.rate; return v; }
/* dniówka i waluta danego dnia: day rate – rotacja może mieć własne, stały – zawsze stawka scenariusza */
function dayRate(P, n, st) {
  if (P.pay.type === 'day') {
    const i = st === 'ON' ? findIn(P.on, n) : st === 'TRAVEL' ? findIn(P.tr, n) : -1;
    const r = i >= 0 ? P.rots[i] : null;
    if (r && +r.rate > 0) return [+r.rate, r.cur || P.pay.cur];
  }
  return [rateAt(P, n), P.pay.cur];
}


function empty(P) { return derive(P, { ON: 0, OFF: 0, TRAVEL: 0, COURSE: 0, HRA: 0 }, { pay: 0, hra: 0, byCur: {}, noFx: [] }, null); }
function derive(P, c, m, endN) {
  const y = P.pay, perm = y.type !== 'day', tp = (+y.travelPct || 0) / 100, cp = (+y.coursePct || 0) / 100;
  const bal = c.ON - c.OFF + (y.travelBal ? c.TRAVEL : 0)
    + (y.courseBal === 'on' ? c.COURSE : y.courseBal === 'off' ? -c.COURSE : 0);
  const paid = c.ON + (perm ? c.OFF : 0) + c.TRAVEL * tp + c.COURSE * cp;
  const settle = perm && y.balPay && endN !== null ? bal * rateAt(P, endN) : 0;
  return { ...c, days: c.ON + c.OFF + c.TRAVEL + c.COURSE, bal, paid, pay: m.pay, hra: m.hra, byCur: m.byCur,
    settle, total: m.pay + m.hra + settle, perm, cur: y.cur, noFx: m.noFx };
}
function tally(P, a, b) {
  const y = P.pay, perm = y.type !== 'day', tp = (+y.travelPct || 0) / 100, cp = (+y.coursePct || 0) / 100, hp = (+y.hraPct || 0) / 100;
  const c = { ON: 0, OFF: 0, TRAVEL: 0, COURSE: 0, HRA: 0 }, m = { pay: 0, hra: 0, byCur: {}, noFx: [] };
  for (let n = a; n <= b; n++) {
    const st = statusOf(P, n); c[st]++;
    const f = st === 'ON' ? 1 : st === 'OFF' ? (perm ? 1 : 0) : st === 'TRAVEL' ? tp : cp;
    const isHra = st === 'ON' && hraIn(P, n) && !P.hoff[n];
    if (isHra) c.HRA++;
    if (!f && !(isHra && hp)) continue;
    const [rate, cur] = dayRate(P, n, st);
    const p = rate * f, h = isHra ? rate * hp : 0;
    m.byCur[cur] = (m.byCur[cur] || 0) + p + h;
    const r = fxRate(P.s, cur, y.cur);
    if (r === null) { if (!m.noFx.includes(cur)) m.noFx.push(cur); continue; }   // brak kursu: kwota nie wliczona
    m.pay += p * r; m.hra += h * r;
  }
  return derive(P, c, m, b);
}
function months(P, y, s) {
  const [a, b] = yearRange(y, s); const rows = []; let n = a, run = 0;
  while (n <= b) {
    const [Y, M] = ymd(n);
    const e = Math.min(b, Date.UTC(Y, M, 1) / DAY - 1);
    const t = tally(P, n, e); run += t.bal;
    rows.push({ Y, M, a: n, b: e, ...t, run });
    n = e + 1;
  }
  return rows;
}
function runs(P, a, b) {
  const out = []; let cur = null;
  for (let n = a; n <= b; n++) {
    const st = statusOf(P, n);
    if (cur && cur.s === st) cur.b = n; else { cur = { s: st, a: n, b: n }; out.push(cur); }
  }
  return out;
}
function blockAt(P, n) {
  const st = statusOf(P, n); let a = n, b = n;
  while (a > n - 500 && statusOf(P, a - 1) === st) a--;
  while (b < n + 500 && statusOf(P, b + 1) === st) b++;
  return { s: st, a, b };
}
function nextStatus(P, n, st, limit = 600) {
  for (let k = n + 1; k < n + limit; k++) if (statusOf(P, k) === st) return k;
  return null;
}
function overlaps(plan, rot) {
  const a = dn(rot.start), b = dn(rot.end);
  return (plan.rotations || []).filter(r => r.id !== rot.id && r.type === rot.type && dn(r.start) <= b && dn(r.end) >= a);
}
function generate(startStr, weeksOn, weeksOff, count, tb, ta) {
  const out = []; let a = dn(startStr);
  for (let i = 0; i < count; i++) {
    out.push({ type: 'ON', start: ds(a), end: ds(a + weeksOn * 7 - 1), tb, ta, note: '' });
    a += (weeksOn + weeksOff) * 7;
  }
  return out;
}

const Engine = { DAY, pad, dn, ds, ymd, dow, todayN, STATUSES, CURRENCIES, HOME_CURRENCIES, DEFAULT_SETTINGS, DEFAULT_PAY, yStart, yearRange, yearOf, fxRate,
  prep, autoStatus, statusOf, hraIn, hraDay, rateAt, dayRate, empty, derive, tally, months, runs, blockAt, nextStatus, overlaps, generate };
if (typeof module !== 'undefined') module.exports = Engine; else window.Engine = Engine;
