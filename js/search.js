window.CFSearch = (() => {
  const DIAC = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
  const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
  const ARABIC = /[\u0600-\u06FF]/;
  const AR_LAT = {
    'ا': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r',
    'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': '', 'غ': 'gh', 'ف': 'f',
    'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ء': '', 'پ': 'p',
    'چ': 'ch', 'گ': 'g', 'ک': 'k', 'ی': 'y'
  };

  function latinDigits(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x660))
      .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x6F0));
  }

  function fold(s) {
    return latinDigits(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(DIAC, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/đ/g, 'd')
      .replace(/[’`´]/g, "'");
  }

  function foldMap(s) {
    let text = '';
    const start = [];
    const end = [];
    let idx = 0;
    for (const ch of String(s)) {
      const f = fold(ch);
      for (let k = 0; k < f.length; k++) { start.push(idx); end.push(idx + ch.length); }
      text += f;
      idx += ch.length;
    }
    return { text, start, end };
  }

  function tokens(s) {
    return String(s).split(/[\s,.\-_'()\/&·]+/).filter(Boolean);
  }

  function translit(s) {
    return [...s].map(c => (c in AR_LAT ? AR_LAT[c] : c)).join('');
  }

  function skeleton(s) {
    s = s.replace(/[^a-z]/g, '');
    s = s.replace(/ph/g, 'f').replace(/kh/g, 'k').replace(/gh/g, 'g').replace(/sh/g, 's').replace(/ch/g, 's')
      .replace(/th/g, 't').replace(/dh/g, 'd').replace(/ck/g, 'k').replace(/q/g, 'k').replace(/c/g, 'k')
      .replace(/x/g, 'ks').replace(/v/g, 'f').replace(/z/g, 's');
    s = s.replace(/h$/, '').replace(/[aeiouyw]/g, '').replace(/(.)\1+/g, '$1');
    return s;
  }

  function osa(a, b, max) {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let prev2 = null;
    let prev = Array.from({ length: lb + 1 }, (_, j) => j);
    for (let i = 1; i <= la; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= lb; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[lb];
  }

  function pinyinOf(s) {
    if (!s || !CJK.test(s) || !window.pinyinPro) return null;
    try {
      const arr = window.pinyinPro.pinyin(s, { toneType: 'none', type: 'array', nonZh: 'removed' })
        .map(x => fold(x).replace(/[^a-z]/g, '')).filter(Boolean);
      if (!arr.length) return null;
      return { full: arr.join(''), init: arr.map(x => x[0]).join(''), syl: arr };
    } catch (e) {
      return null;
    }
  }

  function skelOf(tok) {
    return skeleton(ARABIC.test(tok) ? translit(tok) : tok);
  }

  function lite(c) {
    const name = c.name || '';
    return { c, nameF: fold(name), py: pinyinOf(name), full: false };
  }

  function fill(e) {
    if (e.full) return e;
    const c = e.c;
    const nameT = tokens(e.nameF);
    const aliasF = (c.aliases || []).map(fold);
    const aliasT = aliasF.map(tokens);
    const skels = new Set();
    [...nameT, ...aliasT.flat()].forEach(tok => { const s = skelOf(tok); if (s.length >= 2) skels.add(s); });
    if (ARABIC.test(e.nameF) && nameT.length > 1) { const s = skeleton(translit(nameT.join(''))); if (s.length >= 2) skels.add(s); }
    e.nameT = nameT;
    e.aliasF = aliasF;
    e.aliasT = aliasT;
    e.skels = [...skels];
    e.phonesD = (c.phones || []).map(p => latinDigits(p).replace(/\D/g, ''));
    e.other = fold([c.company, ...(c.emails || []), c.note].filter(Boolean).join(' '));
    e.full = true;
    return e;
  }

  function buildIndex(contacts) {
    return contacts.map(c => fill(lite(c)));
  }

  const fuzzMemo = new Map();
  const skelMemo = new Map();

  function matchToken(qt, e, fuzzy) {
    let best = { score: 0 };
    const up = (score, kind, extra) => { if (score > best.score) best = Object.assign({ score, kind }, extra || {}); };
    if (/^\+?\d{2,}$/.test(qt)) {
      const d = qt.replace(/\D/g, '');
      if (e.phonesD.some(p => p.includes(d))) up(85, 'number');
    }
    for (const tok of e.nameT) {
      if (tok.startsWith(qt)) up(100, 'name', { hit: qt });
      else if (qt.length >= 2 && tok.includes(qt)) up(90, 'name', { hit: qt });
    }
    e.aliasT.forEach((toks, i) => {
      for (const tok of toks) {
        if (tok.startsWith(qt)) up(88, 'alias', { alias: e.c.aliases[i] });
        else if (qt.length >= 2 && tok.includes(qt)) up(84, 'alias', { alias: e.c.aliases[i] });
      }
    });
    if (e.py && /^[a-z]+$/.test(qt)) {
      if (e.py.full.startsWith(qt)) up(82, 'pinyin');
      else if (qt.length >= 2 && e.py.init.startsWith(qt)) up(80, 'pinyin');
      else if (qt.length >= 3 && e.py.full.includes(qt)) up(76, 'pinyin');
    }
    if (qt.length >= 2 && e.other.includes(qt)) up(60, 'other');
    if (fuzzy && best.score < 55 && qt.length >= 4 && !/^\d+$/.test(qt)) {
      const lim = qt.length >= 8 ? 2 : 1;
      let memo = fuzzMemo.get(qt);
      if (!memo) { memo = new Map(); fuzzMemo.set(qt, memo); }
      const test = tok => {
        let v = memo.get(tok);
        if (v === undefined) {
          v = osa(qt, tok, lim) <= lim || (qt.length >= 5 && tok.length > qt.length && osa(qt, tok.slice(0, qt.length), lim) <= lim);
          memo.set(tok, v);
        }
        return v;
      };
      for (const tok of e.nameT) if (test(tok)) { up(55, 'close', { hit: tok }); break; }
      if (best.score < 55) e.aliasT.forEach((toks, i) => { if (toks.some(test)) up(54, 'close', { alias: e.c.aliases[i] }); });
    }
    if (fuzzy && best.score < 50 && /^[a-z]+$/.test(qt)) {
      const sk = skeleton(qt);
      if (sk.length >= 3) {
        for (const s of e.skels) {
          if (s === sk) up(50, 'sounds');
          else if (s.length >= 3 && s.startsWith(sk)) up(48, 'sounds');
          else if (sk.length >= 4 && s.length >= 3) {
            let sm = skelMemo.get(sk);
            if (!sm) { sm = new Map(); skelMemo.set(sk, sm); }
            let v = sm.get(s);
            if (v === undefined) { v = osa(sk, s, 1) <= 1; sm.set(s, v); }
            if (v) up(45, 'sounds');
          }
        }
      }
    }
    return best;
  }

  function run(query, index, fuzzy) {
    const big = index.length > 20000;
    fuzzMemo.clear();
    skelMemo.clear();
    const qf = fold(query).trim().replace(/\s+/g, ' ');
    if (!qf) return null;
    const compact = qf.replace(/[\s\-().]/g, '');
    const isNum = /^\+?\d{3,}$/.test(compact);
    const qd = compact.replace(/\D/g, '');
    const qd2 = qd.replace(/^0+/, '');
    const qTokens = tokens(qf);
    const out = [];
    for (const e of index) {
      let r = null;
      if (isNum) {
        if (e.phonesD.some(p => p.includes(qd) || (qd2.length >= 5 && qd2 !== qd && p.includes(qd2)))) r = { score: 95, kind: 'number', digits: qd };
      } else if (e.nameF.includes(qf)) {
        r = { score: e.nameF.startsWith(qf) ? 130 : 120, kind: 'name', hits: [qf] };
      } else if (qTokens.length) {
        let min = Infinity, kind = null, alias = null;
        const hits = [];
        for (const qt of qTokens) {
          const m = matchToken(qt, e, fuzzy);
          if (!m.score) { min = 0; break; }
          if (m.score < min) { min = m.score; kind = m.kind; }
          if (m.hit) hits.push(m.hit);
          if (m.alias) alias = m.alias;
        }
        if (min > 0 && min !== Infinity) r = { score: min, kind, hits, alias };
      }
      if (r) out.push(Object.assign({ e }, r));
    }
    out.sort((a, b) => b.score - a.score || (big ? (a.e.nameF < b.e.nameF ? -1 : a.e.nameF > b.e.nameF ? 1 : 0) : a.e.nameF.localeCompare(b.e.nameF)));
    return out;
  }

  function search(query, index) {
    const big = index.length > 20000;
    const r = run(query, index, !big);
    if (big && r && r.length < 40) return run(query, index, true);
    return r;
  }

  function highlightRanges(text, hits) {
    if (!hits || !hits.length || !text) return [];
    const m = foldMap(text);
    const ranges = [];
    for (const h of hits) {
      if (!h) continue;
      let from = 0, i;
      while ((i = m.text.indexOf(h, from)) !== -1) {
        ranges.push([m.start[i], m.end[i + h.length - 1]]);
        from = i + h.length;
      }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push(r.slice());
    }
    return merged;
  }

  return { lite, fill, fold, latinDigits, tokens, translit, skeleton, osa, pinyinOf, buildIndex, search, highlightRanges, CJK, ARABIC };
})();
