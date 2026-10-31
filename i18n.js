'use strict';
/* Tłumaczenia interfejsu. Aplikacja generuje teksty po polsku; ta warstwa podmienia je w DOM
   (słownik dokładnych tekstów + wzorce z wartościami). Język zapamiętywany na danym telefonie. */
(function () {
  const LK = 'rotacje.lang';
  const LANGS = { pl: 'Polski', en: 'English', nl: 'Nederlands', fil: 'Filipino' };
  let lang = 'pl';
  try {
    const saved = localStorage.getItem(LK);
    if (saved && LANGS[saved]) lang = saved;
    else if (localStorage.getItem('rotacje.v1')) lang = 'pl';          // dotychczasowy użytkownik: bez zmian
    else { const n = (navigator.language || 'en').toLowerCase(); lang = n.startsWith('pl') ? 'pl' : n.startsWith('nl') ? 'nl' : /^(fil|tl)/.test(n) ? 'fil' : 'en'; }
  } catch (e) { }

  const D = window.I18N_DATA || { dict: {}, pat: [], tok: {} };
  const dict = (D.dict[lang]) || {};
  const pats = (D.pat || []).map(([re, outs]) => [new RegExp('^' + re + '$'), outs[lang]]).filter(x => x[1]);
  const tok = (D.tok[lang]) || {};
  const tokRe = Object.keys(tok).length ? new RegExp('(^|[^\\p{L}])(' + Object.keys(tok).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=$|[^\\p{L}])', 'gu') : null;
  const tokens = s => tokRe ? s.replace(tokRe, (m, pre, w) => pre + tok[w]) : s;
  const missing = new Set();

  function T(text) {
    if (lang === 'pl' || text == null) return text;
    const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0], key = text.trim();
    if (!key || !/\p{L}/u.test(key)) return text;
    let out = dict[key];
    if (out === undefined) {
      for (const [re, o] of pats) {
        const m = key.match(re);
        if (m) { out = o.replace(/\$(\d)/g, (_, i) => tokens(m[+i] || '')); break; }
      }
    }
    if (out === undefined) { const t2 = tokens(key); if (t2 !== key) out = t2; else { missing.add(key); return text; } }
    return lead + out + trail;
  }
  const done = new WeakMap();
  function trNode(n) {
    if (n.nodeType === 3) {
      if (done.get(n) === n.data) return;
      const p = n.parentNode; if (p && (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE')) return;
      const out = T(n.data); if (out !== n.data) n.data = out; done.set(n, n.data);
    } else if (n.nodeType === 1) {
      for (const a of ['placeholder', 'aria-label', 'title']) { const v = n.getAttribute(a); if (v) { const o = T(v); if (o !== v) n.setAttribute(a, o); } }
      for (const c of n.childNodes) trNode(c);
    }
  }
  window.I18N = {
    lang, LANGS, T, missing,
    set(l) { if (!LANGS[l] || l === lang) return; try { localStorage.setItem(LK, l); } catch (e) { } location.reload(); },
    decimal: lang === 'pl' || lang === 'nl' ? ',' : '.', group: lang === 'pl' ? ' ' : lang === 'nl' ? '.' : ','
  };
  document.documentElement.lang = lang === 'fil' ? 'fil' : lang;
  if (lang === 'pl') return;
  document.title = T(document.title);
  const run = () => trNode(document.body);
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'characterData') trNode(m.target);
      else if (m.type === 'attributes') trNode(m.target);
      else for (const n of m.addedNodes) trNode(n);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title'] });
  if (document.body) run(); else addEventListener('DOMContentLoaded', run);
})();
