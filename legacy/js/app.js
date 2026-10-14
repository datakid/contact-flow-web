(() => {
  const { t, setLang } = window.CFI18n;
  const S = window.CFSearch;
  const F = window.CFFormats;
  const VERSION = '2.2.0';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const clone = o => JSON.parse(JSON.stringify(o));
  const icon = (name, extra) => `<i class="ic${extra ? ' ' + extra : ''}" aria-hidden="true"><svg><use href="#${name}"/></svg></i>`;
  const CAN_TEL = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  let wide = false;
  const calcWide = () => window.innerWidth >= 820 && (settings.layout === 'wide' || (settings.layout === 'auto' && window.innerWidth >= 1000));
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('cf') : null;

  function load(key, def) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; } catch (e) { return def; }
  }

  let contacts = [];
  let historyLog = [];
  const settings = Object.assign({ theme: 'system', sort: 'name', layout: 'auto', exportOpts: null }, load('cf.settings', {}));

  const state = { query: '', filter: 'all', showFilters: false, selected: new Set(), limit: 150, results: null, visible: [], detailId: null };
  let index = [];
  let byId = new Map();

  function trimHistory() {
    const cut = Date.now() - 30 * 864e5;
    let budget = 600000;
    const keep = historyLog.filter((h, i) => { budget -= h.count; return h.ts > cut && i < 30 && (i === 0 || budget >= 0); });
    const gone = historyLog.filter(h => !keep.includes(h)).map(h => h.id);
    historyLog = keep;
    return gone;
  }

  function persist(puts, dels, entry, all) {
    const gone = trimHistory();
    CFStore.save(puts, dels, entry, gone, all).catch(() => toast('Storage is full'));
    if (channel) channel.postMessage(1);
  }

  async function loadData() {
    contacts = await CFStore.contacts();
    historyLog = (await CFStore.history()).sort((a, b) => b.ts - a.ts);
    const legacy = load('cf.contacts', null);
    if (legacy && !contacts.length) {
      contacts = legacy.map(normalize);
      historyLog = load('cf.history', []);
      await CFStore.save(contacts, [], null, [], true);
      for (const h of historyLog) await CFStore.save([], [], h, [], false);
    }
    if (legacy) { localStorage.removeItem('cf.contacts'); localStorage.removeItem('cf.history'); }
  }
  function saveSettings() { localStorage.setItem('cf.settings', JSON.stringify(settings)); }

  function normalize(c) {
    const uniq = arr => [...new Set((arr || []).map(x => String(x).trim()).filter(Boolean))];
    return {
      id: c.id || uid(),
      name: String(c.name || '').trim(),
      aliases: uniq(c.aliases),
      phones: uniq(c.phones),
      emails: uniq(c.emails),
      company: String(c.company || '').trim(),
      note: String(c.note || '').trim(),
      starred: !!c.starred,
      groups: uniq(c.groups),
      createdAt: c.createdAt || Date.now(),
      updatedAt: c.updatedAt || Date.now()
    };
  }

  function phoneKey(p) {
    let d = S.latinDigits(p).replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    return d.length >= 9 ? d.slice(-9) : d;
  }

  function scriptRank(e) {
    const ch = [...e.nameF.trim()][0];
    if (!ch) return 3;
    const isAr = S.ARABIC.test(ch);
    const isLat = /[a-z]/.test(ch) || S.CJK.test(ch);
    if (window.CFI18n.lang === 'ar') return isAr ? 0 : isLat ? 1 : 2;
    return isLat ? 0 : isAr ? 1 : 2;
  }

  let coll = new Intl.Collator(window.CFI18n.lang);
  const collD = new Intl.Collator();
  let indexSeq = 0;
  let fillPromise = null;
  let filledFor = null;
  const tick = () => new Promise(r => setTimeout(r));
  const filled = () => filledFor === index;

  function decorate(e) {
    const tr = e.nameF.trim();
    const ch = tr ? String.fromCodePoint(tr.codePointAt(0)) : '';
    e.sortKey = e.py ? e.py.full : tr;
    e.rank = scriptRank(e);
    if (!ch) e.letter = '#';
    else if (S.CJK.test(ch)) e.letter = e.py ? e.py.full[0].toUpperCase() : '#';
    else if (/[a-z]/.test(ch)) e.letter = ch.toUpperCase();
    else if (S.ARABIC.test(ch)) e.letter = ch;
    else e.letter = '#';
  }

  function cmpName(a, b) {
    return a.rank - b.rank || coll.compare(a.sortKey, b.sortKey) || collD.compare(a.c.name, b.c.name);
  }

  function setIndex(list) {
    index = list;
    byId = new Map(list.map(e => [e.c.id, e]));
    for (const id of [...state.selected]) if (!byId.has(id)) state.selected.delete(id);
    fillPromise = null;
    filledFor = null;
  }

  async function reindexFull(progress) {
    const seq = ++indexSeq;
    coll = new Intl.Collator(window.CFI18n.lang);
    if (!window.pinyinPro && contacts.some(c => S.CJK.test(c.name))) await CFLoad.pinyin().catch(() => {});
    const n = contacts.length;
    const out = new Array(n);
    for (let i = 0; i < n; i += 4000) {
      const m = Math.min(n, i + 4000);
      for (let j = i; j < m; j++) { const e = S.lite(contacts[j]); decorate(e); out[j] = e; }
      if (n > 8000) {
        if (progress) progress(m / n);
        await tick();
        if (seq !== indexSeq) return false;
      }
    }
    out.sort(cmpName);
    setIndex(out);
    return true;
  }

  function resort() {
    coll = new Intl.Collator(window.CFI18n.lang);
    index.forEach(decorate);
    index.sort(cmpName);
  }

  function ensureFilled() {
    if (fillPromise) return fillPromise;
    const list = index;
    fillPromise = (async () => {
      for (let i = 0; i < list.length; i += 3000) {
        const m = Math.min(list.length, i + 3000);
        for (let j = i; j < m; j++) S.fill(list[j]);
        if (list.length > 6000) await tick();
        if (list !== index) return;
      }
      filledFor = list;
    })();
    return fillPromise;
  }

  function applyDelta({ touched, gone }) {
    const wasFilled = filled();
    const drop = new Set(gone);
    touched.forEach(c => drop.add(c.id));
    if (drop.size) {
      index = index.filter(e => !drop.has(e.c.id));
      drop.forEach(id => byId.delete(id));
    }
    touched.forEach(c => {
      const e = S.fill(S.lite(c));
      decorate(e);
      let lo = 0, hi = index.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cmpName(index[mid], e) <= 0) lo = mid + 1; else hi = mid; }
      index.splice(lo, 0, e);
      byId.set(c.id, e);
    });
    if (wasFilled) filledFor = index;
    for (const id of [...state.selected]) if (!byId.has(id)) state.selected.delete(id);
  }

  function sorted(list) {
    if (settings.sort === 'recent') return list.slice().sort((a, b) => (b.c.updatedAt || 0) - (a.c.updatedAt || 0));
    return list;
  }

  function passesFilter(e) {
    const f = state.filter, c = e.c;
    if (f === 'all') return true;
    if (f === 'starred') return c.starred;
    if (f === 'nonum') return !c.phones.length;
    if (f === 'noname') return !c.name;
    if (f.startsWith('g:')) return c.groups.includes(f.slice(2));
    return true;
  }

  function computeVisible() {
    if (state.query.trim() && !filled()) ensureFilled().then(() => renderLibrary());
    if (state.query.trim() && filled()) {
      const res = S.search(state.query, index) || [];
      state.results = res.filter(r => passesFilter(r.e));
      state.visible = state.results.map(r => r.e);
    } else {
      state.results = null;
      state.visible = sorted(state.filter === 'all' ? index : index.filter(passesFilter));
    }
  }

  function scopeList() {
    if (state.selected.size) return sorted(index.filter(e => state.selected.has(e.c.id))).map(e => e.c);
    if (state.query.trim() || state.filter !== 'all') return state.visible.map(e => e.c);
    return sorted(index).map(e => e.c);
  }

  function allGroups() {
    const s = new Set();
    contacts.forEach(c => c.groups.forEach(g => s.add(g)));
    return [...s].sort();
  }

  function initials(name) {
    const n = (name || '').trim();
    if (!n) return '#';
    const first = [...n][0];
    if (S.CJK.test(first) || S.ARABIC.test(first)) return first;
    const toks = n.split(/\s+/).filter(Boolean);
    const a = [...toks[0]][0] || '';
    const b = toks.length > 1 ? [...toks[toks.length - 1]][0] : ([...toks[0]][1] || '');
    return (a + b).toUpperCase();
  }

  function avatarClass(c) {
    let h = 0;
    for (const ch of c.name || c.id) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return 'av' + (h % 6);
  }

  function avatarHTML(c, extra) {
    return `<span class="avatar ${avatarClass(c)} ${extra || ''}">${esc(initials(c.name))}</span>`;
  }

  function highlighted(text, ranges) {
    if (!ranges || !ranges.length) return esc(text);
    let out = '', last = 0;
    for (const [a, b] of ranges) { out += esc(text.slice(last, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>'; last = b; }
    return out + esc(text.slice(last));
  }

  function timeAgo(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return t('justNow');
    if (m < 60) return t('minAgo', m);
    if (m < 1440) return t('hAgo', Math.round(m / 60));
    return t('dAgo', Math.round(m / 1440));
  }

  function fmtDate(ts) {
    try { return new Intl.DateTimeFormat(window.CFI18n.lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts)); } catch (e) { return new Date(ts).toLocaleString(); }
  }

  function numberCount(list) { return list.reduce((n, c) => n + c.phones.length, 0); }

  function snap(c) {
    return Object.assign({}, c, { aliases: c.aliases.slice(), phones: c.phones.slice(), emails: c.emails.slice(), groups: c.groups.slice() });
  }

  function commit(action, cs, opts) {
    opts = opts || {};
    const now = Date.now();
    const before = [];
    const puts = [];
    const dels = [];
    (cs.adds || []).forEach(raw => {
      const c = normalize(Object.assign({}, raw, { createdAt: now, updatedAt: now }));
      before.push({ id: c.id, data: null });
      contacts.push(c);
      puts.push(c);
    });
    if ((cs.updates || []).length) {
      const pos = new Map();
      contacts.forEach((c, i) => pos.set(c.id, i));
      cs.updates.forEach(u => {
        const i = pos.get(u.id);
        if (i == null) return;
        before.push({ id: u.id, data: snap(contacts[i]) });
        contacts[i] = normalize(Object.assign({}, u.next, { id: u.id, createdAt: contacts[i].createdAt, updatedAt: now }));
        puts.push(contacts[i]);
      });
    }
    const del = new Set(cs.deletes || []);
    if (del.size) {
      contacts.forEach(c => { if (del.has(c.id)) { before.push({ id: c.id, data: snap(c) }); dels.push(c.id); } });
      contacts = contacts.filter(c => !del.has(c.id));
    }
    if (!before.length) return null;
    const entry = { id: uid(), ts: now, action, count: before.length, before, undone: false };
    historyLog.unshift(entry);
    persist(puts, dels, entry);
    refreshAll({ touched: puts, gone: dels });
    if (opts.toast !== false) toast(opts.message || `${t('act_' + action)} · ${t('nAffected', entry.count)}`, t('undo'), () => undo(entry.id));
    return entry;
  }

  function undo(entryId) {
    const entry = historyLog.find(h => h.id === entryId);
    if (!entry || entry.undone) return;
    const pos = new Map();
    contacts.forEach((c, i) => pos.set(c.id, i));
    const remove = new Set();
    const puts = [];
    entry.before.forEach(b => {
      if (b.data == null) remove.add(b.id);
      else if (pos.has(b.id)) { const c = snap(b.data); contacts[pos.get(b.id)] = c; puts.push(c); }
      else { const c = snap(b.data); contacts.push(c); puts.push(c); }
    });
    if (remove.size) contacts = contacts.filter(c => !remove.has(c.id));
    entry.undone = true;
    persist(puts, [...remove], entry);
    refreshAll({ touched: puts, gone: [...remove] });
    toast(t('undone'));
  }

  let toastTimer = null;
  function toast(msg, actionLabel, fn) {
    const old = $('.toast');
    if (old) old.remove();
    clearTimeout(toastTimer);
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span>${esc(msg)}</span>` + (actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : '');
    if (actionLabel) el.querySelector('button').onclick = () => { el.remove(); fn(); };
    document.body.append(el);
    toastTimer = setTimeout(() => el.remove(), actionLabel ? 6000 : 2600);
  }

  const stack = [];
  let afterPop = null;

  function openScreen(id, build) {
    const el = document.createElement('section');
    el.className = 'screen';
    el.id = id;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el._build = () => { build(el); };
    $('#screens').append(el);
    stack.push(el);
    el._build();
    document.body.style.overflow = 'hidden';
    history.pushState({ cf: stack.length }, '');
    return el;
  }

  function closeScreens(n, then) {
    n = Math.min(n || 1, stack.length);
    if (!n) { if (then) then(); return; }
    afterPop = then || null;
    history.go(-n);
  }

  window.addEventListener('popstate', ev => {
    const depth = (ev.state && ev.state.cf) || 0;
    while (stack.length > depth) stack.pop().remove();
    closeOverlays();
    if (!stack.length) document.body.style.overflow = '';
    const fn = afterPop;
    afterPop = null;
    if (fn) fn();
  });

  function headHTML(title, opts) {
    opts = opts || {};
    return `<header class="screen-head">
      <div><button class="icon-btn" data-act="close" aria-label="${esc(t('close'))}">${icon(opts.backIcon || 'fa-xmark')}</button></div>
      <h2>${esc(title || '')}</h2>
      <div class="end">${opts.end || ''}</div>
    </header>`;
  }

  function bindClose(el) {
    $$('[data-act="close"]', el).forEach(b => { b.onclick = () => closeScreens(1); });
  }

  function closeOverlays() { $('#overlays').innerHTML = ''; }

  function openSheet(build) {
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div><div class="sheet-body"></div></div>';
    const close = () => scrim.remove();
    scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
    $('#overlays').append(scrim);
    build($('.sheet-body', scrim), close);
    return close;
  }

  function openDialog(build) {
    const scrim = document.createElement('div');
    scrim.className = 'scrim dialog-scrim';
    scrim.innerHTML = '<div class="dialog" role="dialog" aria-modal="true"></div>';
    const close = () => scrim.remove();
    scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
    $('#overlays').append(scrim);
    build($('.dialog', scrim), close);
    const f = $('input, textarea', scrim);
    if (f) setTimeout(() => f.focus(), 50);
    return close;
  }

  function confirmDialog(title, body, okLabel, onOk, danger) {
    openDialog((d, close) => {
      d.innerHTML = `<h4>${esc(title)}</h4><p class="sub">${esc(body || '')}</p>
        <div class="actions"><button class="btn-text" data-x>${esc(t('cancel'))}</button>
        <button class="btn ${danger ? 'btn-accent' : 'btn-dark'}" data-ok>${esc(okLabel)}</button></div>`;
      $('[data-x]', d).onclick = close;
      $('[data-ok]', d).onclick = () => { close(); onOk(); };
    });
  }

  function popMenu(anchor, items) {
    closeOverlays();
    const scrim = document.createElement('div');
    scrim.style.cssText = 'position:fixed;inset:0;z-index:89';
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.innerHTML = items.map((it, i) => `<button data-i="${i}">${icon(it.icon)}<span>${esc(it.label)}</span></button>`).join('');
    const close = () => { scrim.remove(); };
    scrim.onclick = e => { if (e.target === scrim) close(); };
    scrim.append(menu);
    $('#overlays').append(scrim);
    const r = anchor.getBoundingClientRect();
    const w = 240;
    let left = window.CFI18n.lang === 'ar' ? r.left : r.right - w;
    left = Math.max(10, Math.min(left, window.innerWidth - w - 10));
    menu.style.cssText = `position:fixed;top:${r.bottom + 6}px;left:${left}px;width:${w}px`;
    $$('button', menu).forEach(b => { b.onclick = () => { close(); items[+b.dataset.i].fn(); }; });
  }

  function download(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  async function shareFile(name, data, mime) {
    const file = new File([data], name, { type: mime.split(';')[0] });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    download(name, data, mime);
    toast(t('shareUnsupported'));
  }

  async function copyText(s) {
    try { await navigator.clipboard.writeText(s); } catch (e) {
      const ta = document.createElement('textarea'); ta.value = s; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    toast(t('copied'));
  }

  function renderTop() {
    $('#brand-label').textContent = t('brand');
    const themeLabel = t('theme') + ': ' + t('theme' + settings.theme[0].toUpperCase() + settings.theme.slice(1));
    $('#top-actions').innerHTML = `
      <button class="icon-btn" id="add-contact-btn" aria-label="${esc(t('addContact'))}" title="${esc(t('addContact'))}">${icon('fa-plus')}</button>
      <button class="icon-btn" id="batch-btn" aria-label="${esc(t('batchEdit'))}" title="${esc(t('batchEdit'))}">${icon('fa-table-list')}</button>
      <button class="icon-btn" id="theme-btn" aria-label="${esc(themeLabel)}" title="${esc(themeLabel)}">${icon(THEME_ICON[settings.theme])}</button>
      <button class="icon-btn" id="settings-btn" aria-label="${esc(t('settings'))}" title="${esc(t('settings'))}">${icon('fa-sliders')}</button>`;
    $('#add-contact-btn').onclick = () => openEdit(null);
    $('#batch-btn').onclick = () => openBatch();
    $('#theme-btn').onclick = cycleTheme;
    $('#settings-btn').onclick = () => openSettings();
    $('#library-title').textContent = t('library');
    $('#search-label').textContent = t('searchPh');
    $('#search-input').placeholder = t('searchPh');
    document.title = t('brand') + ' — ' + t('library');
  }

  function renderStats() {
    $('#library-stats').innerHTML = `<strong>${esc(t('nContacts', contacts.length))}</strong><span class="sep">·</span><span>${esc(t('nNumbers', numberCount(contacts)))}</span>`;
  }

  function renderToolbar() {
    const tb = $('#library-toolbar');
    const searching = !!state.query.trim();
    const sel = state.selected.size;
    const filterOn = state.filter !== 'all';
    if (searching) {
      tb.innerHTML = `<div class="result-meta" style="flex:1"><span>${esc(t('nContacts', state.visible.length))}</span>
        <button class="text-btn accent" id="select-results">${icon('fa-check-double')} ${esc(sel ? t('deselect') : t('selectResults'))}</button></div>`;
    } else {
      tb.innerHTML = `
        <button class="chip ${settings.sort === 'name' ? 'on' : ''}" data-sort="name">${esc(t('sortName'))}</button>
        <button class="chip ${settings.sort === 'recent' ? 'on' : ''}" data-sort="recent">${esc(t('sortRecent'))}</button>
        <button class="chip ${filterOn || state.showFilters ? 'accent-on' : ''}" id="filter-toggle" aria-label="${esc(t('filters'))}">${icon('fa-filter')}${filterOn ? ' ' + esc(filterLabel(state.filter)) : ''}</button>
        <span class="spacer"></span>
        <button class="text-btn" id="select-results">${esc(sel ? t('deselect') : t('selectAll'))}</button>`;
      $$('[data-sort]', tb).forEach(b => { b.onclick = () => { settings.sort = b.dataset.sort; saveSettings(); renderLibrary(); }; });
      $('#filter-toggle').onclick = () => { state.showFilters = !state.showFilters; renderLibrary(); };
    }
    const sr = $('#select-results');
    if (sr) sr.onclick = () => {
      if (state.selected.size) state.selected.clear();
      else state.visible.forEach(e => state.selected.add(e.c.id));
      renderLibrary();
    };
    if (!contacts.length) tb.innerHTML = '';
  }

  function filterLabel(f) {
    if (f === 'starred') return t('starred');
    if (f === 'nonum') return t('noNumber');
    if (f === 'noname') return t('noName');
    if (f.startsWith('g:')) return f.slice(2);
    return t('all');
  }

  function renderFilters() {
    const row = $('#filter-row');
    const show = contacts.length && (state.showFilters || state.filter !== 'all') && !state.query.trim();
    row.hidden = !show;
    if (!show) return;
    const opts = ['all', 'starred', 'nonum', 'noname', ...allGroups().map(g => 'g:' + g)];
    row.innerHTML = opts.map(f => `<button class="chip ${state.filter === f ? 'on' : ''}" data-f="${esc(f)}">${f.startsWith('g:') ? icon('fa-user-group') + ' ' : f === 'starred' ? icon('fa-star') + ' ' : ''}${esc(filterLabel(f))}</button>`).join('');
    $$('[data-f]', row).forEach(b => { b.onclick = () => { state.filter = b.dataset.f; state.limit = 150; renderLibrary(); }; });
  }

  function rowHTML(e, r) {
    const c = e.c;
    const isSel = state.selected.has(c.id);
    const nameText = c.name || c.phones[0] || c.emails[0] || '—';
    const ranges = r && r.hits && c.name ? S.highlightRanges(c.name, r.hits) : null;
    let tag = '';
    if (r && ['close', 'sounds', 'pinyin'].includes(r.kind)) tag = `<span class="match-tag">${esc(t('kind_' + r.kind))}</span>`;
    const sub = [];
    const shown = c.name ? (c.phones[0] || c.emails[0] || '') : (c.phones[0] ? c.phones[1] || c.emails[0] || '' : '');
    if (shown) sub.push(`<span class="num">${esc(shown)}</span>`);
    if (tag) sub.push(tag);
    else if (c.company) sub.push(`<span class="dim">${esc(c.company)}</span>`);
    const aka = r && r.alias ? `<div class="aka-line">${esc(t('aka'))} <b>${esc(r.alias)}</b></div>` : '';
    return `<li class="contact-row ${isSel ? 'selected' : ''}${wide && state.detailId === c.id ? ' active' : ''}" data-id="${esc(c.id)}" tabindex="0">
      <button class="avatar ${avatarClass(c)}" data-sel aria-label="${esc(nameText)}" aria-pressed="${isSel}">${esc(initials(c.name))}${isSel ? '<span class="check">' + icon('fa-check') + '</span>' : ''}</button>
      <div class="contact-main">
        <div class="contact-name">${ranges ? highlighted(c.name, ranges) : esc(nameText)}${c.starred ? ' <span class="star-mark">' + icon('fa-star') + '</span>' : ''}</div>
        ${aka}
        <div class="contact-sub">${sub.join('')}</div>
      </div>
    </li>`;
  }

  const H_ROW = 70, H_AKA = 88, H_HEAD = 58;
  const vl = { items: [], offs: new Float64Array(1), heads: new Map(), mounted: new Map(), on: false, lo: -1, hi: -1, raf: 0 };
  const tplUl = document.createElement('ul');

  function buildItems() {
    const grouped = !state.results && settings.sort === 'name';
    const items = [];
    const heads = new Map();
    let last = null;
    for (let i = 0; i < state.visible.length; i++) {
      if (grouped && state.visible[i].letter !== last) { last = state.visible[i].letter; heads.set(last, items.length); items.push(-(i + 1)); }
      items.push(i);
    }
    const offs = new Float64Array(items.length + 1);
    let y = 0;
    for (let k = 0; k < items.length; k++) {
      offs[k] = y;
      const it = items[k];
      y += it < 0 ? H_HEAD : state.results && state.results[it].alias ? H_AKA : H_ROW;
    }
    offs[items.length] = y;
    vl.items = items;
    vl.offs = offs;
    vl.heads = heads;
  }

  function makeEl(k) {
    const it = vl.items[k];
    if (it < 0) { const l = state.visible[-it - 1].letter; tplUl.innerHTML = `<li class="letter-head" id="letter-${encodeURIComponent(l)}">${esc(l)}</li>`; }
    else tplUl.innerHTML = rowHTML(state.visible[it], state.results ? state.results[it] : null);
    const el = tplUl.firstElementChild;
    el.style.cssText = `transform:translateY(${vl.offs[k]}px);height:${vl.offs[k + 1] - vl.offs[k]}px`;
    return el;
  }

  function at(y) {
    let lo = 0, hi = vl.items.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (vl.offs[mid] <= y) lo = mid; else hi = mid - 1; }
    return lo;
  }

  function paintWindow(force) {
    if (!vl.on) return;
    const ul = $('#contact-list');
    const from = window.scrollY - (ul.getBoundingClientRect().top + window.scrollY) - 500;
    const lo = at(Math.max(0, from));
    const hi = at(Math.max(0, from + window.innerHeight + 1000));
    if (!force && lo === vl.lo && hi === vl.hi) return;
    vl.lo = lo;
    vl.hi = hi;
    vl.mounted.forEach((el, k) => {
      if (k < lo || k > hi) { el.remove(); vl.mounted.delete(k); }
      else if (force) { const n = makeEl(k); el.replaceWith(n); vl.mounted.set(k, n); }
    });
    let prev = null;
    for (let k = lo; k <= hi; k++) {
      let el = vl.mounted.get(k);
      if (!el) { el = makeEl(k); if (prev) prev.after(el); else ul.prepend(el); vl.mounted.set(k, el); }
      prev = el;
    }
  }

  function onScroll() {
    if (vl.raf) return;
    vl.raf = requestAnimationFrame(() => { vl.raf = 0; paintWindow(); });
  }

  function selectionChanged() {
    paintWindow(true);
    renderToolbar();
    renderBottom();
  }

  function renderList() {
    const ul = $('#contact-list');
    const rail = $('#az-rail');
    vl.on = false;
    vl.mounted.clear();
    vl.lo = vl.hi = -1;
    ul.classList.remove('virtual');
    ul.style.height = '';
    if (!contacts.length) {
      ul.innerHTML = `<li class="empty-state">
        <img class="empty-mark" src="images/icon-192.png" alt="">
        <div class="big">${esc(t('emptyTitle'))}</div>
        <p>${esc(t('emptyBody'))}</p>
        <button class="btn btn-dark btn-sm" id="empty-import">${icon('fa-arrow-down-long', 'fa-rotate-by')} ${esc(t('import'))}</button>
        <button class="btn btn-ghost btn-sm" id="empty-add">${icon('fa-plus')} ${esc(t('addContact'))}</button>
        <div style="margin-top:14px"><button class="text-btn accent" id="empty-sample">${esc(t('loadSample'))}</button></div>
      </li>`;
      $('#empty-import').onclick = openImport;
      $('#empty-add').onclick = () => openEdit(null);
      $('#empty-sample').onclick = loadSample;
      rail.innerHTML = '';
      return;
    }
    if (!state.visible.length) {
      ul.innerHTML = `<li class="empty-state"><div class="big">${esc(t('noResults'))}</div><p>${esc(t('noResultsBody'))}</p></li>`;
      rail.innerHTML = '';
      return;
    }
    buildItems();
    ul.replaceChildren();
    ul.classList.add('virtual');
    ul.style.height = vl.offs[vl.items.length] + 'px';
    vl.on = true;
    paintWindow(true);
    rail.innerHTML = vl.heads.size > 3 ? [...vl.heads.keys()].map(l => `<span data-l="${esc(l)}">${esc(l)}</span>`).join('') : '';
  }

  function jumpToLetter(l) {
    const k = vl.heads.get(l);
    if (k == null) return;
    window.scrollTo({ top: $('#contact-list').getBoundingClientRect().top + window.scrollY + vl.offs[k] - 100, behavior: 'auto' });
  }

  function renderBottom() {
    const b = $('#bottom-inner');
    const n = state.selected.size;
    if (n) {
      b.innerHTML = `<div class="selection-bar">
        <button class="icon-btn" id="sel-clear" aria-label="${esc(t('deselect'))}">${icon('fa-xmark')}</button>
        <span class="count">${esc(t('nSelected', n))}</span>
        <button class="icon-btn" id="sel-star" aria-label="${esc(t('star'))}" title="${esc(t('star'))}">${icon('fa-star')}</button>
        <button class="icon-btn" id="sel-group" aria-label="${esc(t('addToGroup'))}" title="${esc(t('addToGroup'))}">${icon('fa-user-group')}</button>
        <button class="icon-btn" id="sel-msg" aria-label="${esc(t('message'))}" title="${esc(t('message'))}">${icon('fa-comment-dots')}</button>
        <button class="icon-btn" id="sel-del" aria-label="${esc(t('delete'))}" title="${esc(t('delete'))}">${icon('fa-trash-can')}</button>
      </div>
      <button class="btn btn-accent" id="export-btn" style="flex:0 0 auto">${icon('fa-arrow-up-long', 'fa-rotate-by')} ${esc(t('exportSel', n))}</button>`;
      $('#sel-clear').onclick = () => { state.selected.clear(); renderLibrary(); };
      $('#sel-star').onclick = () => bulkStar([...state.selected]);
      $('#sel-group').onclick = () => groupDialog([...state.selected]);
      $('#sel-msg').onclick = () => openMessages([...state.selected]);
      $('#sel-del').onclick = () => confirmDelete([...state.selected], () => state.selected.clear());
    } else {
      b.innerHTML = `<button class="btn btn-dark" id="import-btn">${icon('fa-arrow-down-long', 'fa-rotate-by')} ${esc(t('import'))}</button>
        <button class="btn btn-accent" id="export-btn" ${contacts.length ? '' : 'disabled'}>${icon('fa-arrow-up-long', 'fa-rotate-by')} ${esc(t('export'))}</button>`;
      $('#import-btn').onclick = openImport;
    }
    $('#export-btn').onclick = () => openExport(scopeList());
  }

  function renderLibrary() {
    computeVisible();
    renderStats();
    renderToolbar();
    renderFilters();
    renderList();
    renderBottom();
    $('#search-clear').hidden = !state.query;
  }

  async function refreshAll(delta) {
    const small = delta && delta.touched.length + delta.gone.length <= 2000 && (window.pinyinPro || !delta.touched.some(c => S.CJK.test(c.name)));
    if (small) applyDelta(delta);
    else {
      $('#library-stats').textContent = t('indexing');
      if (!(await reindexFull())) return;
    }
    renderLibrary();
    if (wide) { const p = $('#detail-pane'); const keep = p.scrollTop; renderPane(); p.scrollTop = keep; }
    stack.forEach(el => { if (el._live) el._build(); });
  }

  function rerenderEverything() {
    renderTop();
    resort();
    renderLibrary();
    renderPane();
    stack.forEach(el => el._build());
  }

  function loadSample() {
    const now = Date.now();
    const adds = window.CFSample.map(([name, phones, company, emails, aliases, groups], i) => ({ name, phones, company, emails, aliases, groups, starred: i === 0 || i === 17 }));
    const entry = commit('import', { adds }, { toast: false });
    if (entry) {
      contacts.forEach((c, i) => { c.updatedAt = now - i * 3600e3; });
      persist(contacts.slice(), [], null, true);
      refreshAll();
    }
  }

  function bulkStar(ids) {
    const list = ids.map(id => byId.get(id)).filter(Boolean).map(e => e.c);
    const all = list.every(c => c.starred);
    commit('star', { updates: list.map(c => ({ id: c.id, next: Object.assign({}, c, { starred: !all }) })) });
  }

  function groupDialog(ids) {
    openDialog((d, close) => {
      const gs = allGroups();
      d.innerHTML = `<h4>${esc(t('addToGroup'))}</h4><p class="sub">${esc(t('nAffected', ids.length))}</p>
        <div class="form-group"><div class="field"><input id="group-input" list="group-list" placeholder="${esc(t('groupName'))}"></div>
        <datalist id="group-list">${gs.map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>
        <div class="token-row">${gs.map(g => `<button data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div>
        <div class="actions"><button class="btn-text" data-x>${esc(t('cancel'))}</button><button class="btn btn-dark" data-ok>${esc(t('apply'))}</button></div>`;
      const inp = $('#group-input', d);
      $$('[data-g]', d).forEach(b => { b.onclick = () => { inp.value = b.dataset.g; }; });
      $('[data-x]', d).onclick = close;
      const ok = () => {
        const g = inp.value.trim();
        if (!g) return;
        close();
        const updates = ids.map(id => byId.get(id)).filter(Boolean).map(e => e.c).filter(c => !c.groups.includes(g)).map(c => ({ id: c.id, next: Object.assign({}, c, { groups: c.groups.concat(g) }) }));
        commit('group', { updates });
      };
      $('[data-ok]', d).onclick = ok;
      inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
    });
  }

  function confirmDelete(ids, after) {
    confirmDialog(t('confirmDelete', ids.length), t('confirmDeleteBody'), t('delete'), () => {
      commit('delete', { deletes: ids }, { message: t('deleted', ids.length) });
      if (after) after();
      renderLibrary();
    }, true);
  }

  function applyLayout() {
    const w = calcWide();
    const changed = w !== wide;
    wide = w;
    document.documentElement.dataset.layout = w ? 'wide' : 'narrow';
    if (changed) {
      if (!w) state.detailId = null;
      renderPane();
      if (vl.on) paintWindow(true);
    }
  }

  function renderPane() {
    const p = $('#detail-pane');
    if (!wide) { p.innerHTML = ''; return; }
    if (!state.detailId || !byId.has(state.detailId)) {
      state.detailId = null;
      p.innerHTML = `<div class="pane-empty"><img src="images/icon-192.png" alt=""><p>${esc(t('pickContact'))}</p></div>`;
      return;
    }
    buildDetail(p, state.detailId);
  }

  function openDetail(id) {
    if (wide) {
      state.detailId = id;
      renderPane();
      $('#detail-pane').scrollTop = 0;
      paintWindow(true);
      return;
    }
    const el = openScreen('detail-screen', el => buildDetail(el, id));
    el._live = true;
  }

  function closeDetail() {
    if (wide) { state.detailId = null; renderPane(); paintWindow(true); } else closeScreens(1);
  }

  function revealIndex(i) {
    const key = k => (vl.items[k] < 0 ? -vl.items[k] - 1 : vl.items[k]);
    let lo = 0, hi = vl.items.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (key(mid) <= i) lo = mid; else hi = mid - 1; }
    const top = $('#contact-list').getBoundingClientRect().top + window.scrollY + vl.offs[lo];
    const bottom = top + vl.offs[lo + 1] - vl.offs[lo];
    if (top - 150 < window.scrollY) window.scrollTo(0, top - 150);
    else if (bottom > window.scrollY + window.innerHeight - 90) window.scrollTo(0, bottom - window.innerHeight + 90);
  }

  function buildDetail(el, id) {
      const e = byId.get(id);
      if (!e) { el.innerHTML = headHTML(''); bindClose(el); return; }
      const c = e.c;
      const ph = c.phones[0] || '';
      const intl = F.styleNumber(ph, 'intl').replace('+', '');
      el.innerHTML = `<div class="screen-inner">
        ${headHTML('', { end: `<button class="icon-btn" data-edit aria-label="${esc(t('edit'))}">${icon('fa-pen')}</button><button class="icon-btn" data-more aria-label="More">${icon('fa-ellipsis-vertical')}</button>` })}
        <div class="detail-hero">
          ${avatarHTML(c, 'lg')}
          <h1 class="detail-name">${esc(c.name || ph || '—')}${c.starred ? ' <span class="star-mark" style="font-size:20px">' + icon('fa-star') + '</span>' : ''}</h1>
          ${c.aliases.length ? `<div class="detail-aka">${esc(t('aka'))} ${c.aliases.map(esc).join(' · ')}</div>` : ''}
          ${c.company ? `<div class="detail-company">${esc(c.company)}</div>` : ''}
        </div>
        <div class="quick-actions">
          ${CAN_TEL ? `<button data-q="call" ${ph ? '' : 'disabled'}>${icon('fa-phone')}${esc(t('call'))}</button>
          <button data-q="sms" ${ph ? '' : 'disabled'}>${icon('fa-comment')}${esc(t('sms'))}</button>` : ''}
          <button data-q="wa" ${ph ? '' : 'disabled'}>${icon('fa-whatsapp')}${esc(t('whatsapp'))}</button>
          <button data-q="signal" ${ph ? '' : 'disabled'}>${icon('fa-shield-halved')}${esc(t('signal'))}</button>
        </div>
        ${c.phones.length ? `<div class="section-label">${esc(t('phones'))}</div><div class="card info-card">${c.phones.map((p, i) => `
          <div class="info-row"><div class="grow"><div class="v num">${esc(p)}</div></div>
            ${CAN_TEL ? `<a class="mini" href="tel:${esc(F.styleNumber(p, 'intl'))}" aria-label="${esc(t('call'))}">${icon('fa-phone')}</a>` : ''}
            <button class="mini" data-copy="${i}" aria-label="${esc(t('copyIntl'))}" title="${esc(t('copyIntl'))}">${icon('fa-copy')}</button></div>`).join('')}</div>` : ''}
        ${c.emails.length ? `<div class="section-label">${esc(t('emails'))}</div><div class="card info-card">${c.emails.map(m => `
          <div class="info-row"><div class="grow"><div class="v">${esc(m)}</div></div><a class="mini" href="mailto:${esc(m)}" aria-label="${esc(t('email'))}">${icon('fa-envelope')}</a></div>`).join('')}</div>` : ''}
        ${c.note || c.groups.length ? `<div class="section-label">${esc(t('note'))}</div><div class="card info-card">
          ${c.groups.length ? `<div class="info-row"><div class="grow"><div class="k">${esc(t('groups'))}</div><div>${c.groups.map(g => `<span class="tag">${esc(g)}</span>`).join('')}</div></div></div>` : ''}
          ${c.note ? `<div class="info-row"><div class="grow"><div class="v" style="white-space:pre-wrap;font-weight:500">${esc(c.note)}</div></div></div>` : ''}
        </div>` : ''}
        <div class="meta-line">${esc(t('added'))} ${esc(fmtDate(c.createdAt))}${c.updatedAt !== c.createdAt ? ' · ' + esc(t('updated')) + ' ' + esc(fmtDate(c.updatedAt)) : ''}</div>
      </div>`;
      bindClose(el);
      $('[data-edit]', el).onclick = () => openEdit(id);
      $('[data-more]', el).onclick = ev => popMenu(ev.currentTarget, [
        { icon: 'fa-star', label: c.starred ? t('unstar') : t('star'), fn: () => bulkStar([id]) },
        { icon: 'fa-user-group', label: t('addToGroup'), fn: () => groupDialog([id]) },
        { icon: 'fa-share-nodes', label: t('shareVcard'), fn: () => shareFile((c.name || 'contact').replace(/[\\/:*?"<>|]/g, '_') + '.vcf', F.vcardOf(c) + '\r\n', 'text/vcard') },
        { icon: 'fa-comment-dots', label: t('message'), fn: () => openMessages([id]) },
        { icon: 'fa-trash-can', label: t('delete'), fn: () => confirmDelete([id], closeDetail) }
      ]);
      $$('[data-copy]', el).forEach(b => { b.onclick = () => copyText(F.styleNumber(c.phones[+b.dataset.copy], 'intl')); });
      $$('[data-q]', el).forEach(b => {
        b.onclick = () => {
          const q = b.dataset.q;
          if (q === 'call') location.href = 'tel:' + F.styleNumber(ph, 'intl');
          if (q === 'sms') location.href = 'sms:' + F.styleNumber(ph, 'intl');
          if (q === 'wa') window.open('https://wa.me/' + intl, '_blank', 'noopener');
          if (q === 'signal') window.open('https://signal.me/#p/+' + intl, '_blank', 'noopener');
        };
      });
  }

  function openEdit(id) {
    const orig = id && byId.get(id) ? byId.get(id).c : null;
    const draft = orig ? clone(orig) : normalize({});
    if (!draft.phones.length) draft.phones = [''];
    openScreen('edit-screen', el => {
      const multi = (key, ph, type) => draft[key].map((v, i) => `<div class="multi-row"><div class="field"><input data-m="${key}" data-i="${i}" type="${type || 'text'}" value="${esc(v)}" placeholder="${esc(ph)}" ${key === 'phones' ? 'dir="ltr" inputmode="tel"' : ''}></div>
        <button class="icon-btn" data-rm="${key}" data-i="${i}" aria-label="${esc(t('delete'))}">${icon('fa-minus')}</button></div>`).join('');
      el.innerHTML = `<div class="screen-inner">
        ${headHTML(orig ? t('editContact') : t('newContact'), { end: `<button class="btn btn-dark btn-sm" data-save>${esc(t('save'))}</button>` })}
        <form id="edit-form" autocomplete="off" onsubmit="return false">
          <div class="form-group"><label for="edit-name">${esc(t('name'))}</label><div class="field"><input id="edit-name" value="${esc(draft.name)}"></div></div>
          <div class="form-group"><label>${esc(t('aliases'))}</label>${multi('aliases', t('alias'))}
            <button type="button" class="add-link" data-add="aliases">${icon('fa-plus')} ${esc(t('addAlias'))}</button><p class="hint">${esc(t('aliasHint'))}</p></div>
          <div class="form-group"><label>${esc(t('phones'))}</label>${multi('phones', '+1 415 555 0101')}
            <button type="button" class="add-link" data-add="phones">${icon('fa-plus')} ${esc(t('addPhone'))}</button></div>
          <div class="form-group"><label>${esc(t('emails'))}</label>${multi('emails', 'name@example.com', 'email')}
            <button type="button" class="add-link" data-add="emails">${icon('fa-plus')} ${esc(t('addEmail'))}</button></div>
          <div class="form-group"><label for="edit-company">${esc(t('company'))}</label><div class="field"><input id="edit-company" value="${esc(draft.company)}"></div></div>
          <div class="form-group"><label for="edit-groups">${esc(t('groups'))}</label><div class="field"><input id="edit-groups" value="${esc(draft.groups.join(', '))}" placeholder="${esc(t('groupsHint'))}"></div></div>
          <div class="form-group"><label for="edit-note">${esc(t('note'))}</label><textarea class="field-area" id="edit-note">${esc(draft.note)}</textarea></div>
          <label class="toggle-row"><span>${icon('fa-star')} ${esc(t('starred'))}</span><input type="checkbox" class="switch" id="edit-star" ${draft.starred ? 'checked' : ''}></label>
        </form>
      </div>`;
      bindClose(el);
      const sync = () => {
        draft.name = $('#edit-name', el).value;
        draft.company = $('#edit-company', el).value;
        draft.note = $('#edit-note', el).value;
        draft.groups = $('#edit-groups', el).value.split(/[,،]/).map(s => s.trim()).filter(Boolean);
        draft.starred = $('#edit-star', el).checked;
        $$('[data-m]', el).forEach(i => { draft[i.dataset.m][+i.dataset.i] = i.value; });
      };
      $$('[data-add]', el).forEach(b => { b.onclick = () => { sync(); draft[b.dataset.add].push(''); el._build(); const list = $$(`[data-m="${b.dataset.add}"]`, el); list[list.length - 1].focus(); }; });
      $$('[data-rm]', el).forEach(b => { b.onclick = () => { sync(); draft[b.dataset.rm].splice(+b.dataset.i, 1); el._build(); }; });
      $('[data-save]', el).onclick = () => {
        sync();
        const next = normalize(draft);
        if (!next.name && !next.phones.length && !next.emails.length) { toast(t('nameRequired')); return; }
        if (orig) commit('edit', { updates: [{ id: orig.id, next }] }, { message: t('saved') });
        else commit('add', { adds: [next] }, { message: t('saved') });
        closeScreens(1);
      };
    });
  }

  function mergeInto(a, b) {
    a.name = a.name || b.name;
    a.phones = [...new Set(a.phones.concat(b.phones))];
    a.emails = [...new Set(a.emails.concat(b.emails))];
    a.aliases = [...new Set(a.aliases.concat(b.aliases))];
    a.company = a.company || b.company;
    a.note = a.note || b.note;
    if (b.contact_id && !a.contact_id) a.contact_id = b.contact_id;
  }

  function cleanImported(list) {
    const out = [];
    const seen = new Map();
    for (const raw of list) {
      const c = {
        name: String(raw.name || '').trim(),
        aliases: [...new Set((raw.aliases || []).map(s => String(s).trim()).filter(Boolean))],
        phones: [],
        emails: [...new Set((raw.emails || []).map(s => String(s).trim()).filter(Boolean))],
        company: String(raw.company || '').trim(),
        note: String(raw.note || '').trim(),
        contact_id: raw.contact_id
      };
      const pk = new Set();
      (raw.phones || []).forEach(p => { p = String(p).trim(); const k = phoneKey(p); if (k && !pk.has(k)) { pk.add(k); c.phones.push(p); } });
      const hit = [...pk].map(k => seen.get(k)).find(Boolean);
      if (hit && (!c.name || !hit.name || S.fold(c.name) === S.fold(hit.name))) {
        mergeInto(hit, c);
        hit.phones.forEach(p => seen.set(phoneKey(p), hit));
        continue;
      }
      pk.forEach(k => seen.set(k, c));
      out.push(c);
    }
    return out;
  }

  function openImport() {
    openScreen('import-screen', el => {
      el.innerHTML = `<div class="screen-inner">
        ${headHTML('')}
        <h1 class="big-title">${esc(t('importTitle'))}</h1>
        <p class="sub">${esc(t('importSub'))}</p>
        <div class="drop-zone" id="drop-zone" style="margin-top:20px">
          ${icon('fa-file-import')}
          <button class="btn btn-dark btn-sm" id="choose-files">${esc(t('chooseFiles'))}</button>
          <p>${esc(t('dropHere'))}</p>
          <div class="fmt-badges"><span>.csv</span><span>.vcf</span><span>.xlsx</span><span>.numbers</span><span>.json</span><span>.txt</span></div>
        </div>
        <div class="section-label">${esc(t('pasteText'))}</div>
        <textarea class="field-area" id="paste-area" placeholder="${esc(t('pastePh'))}"></textarea>
        <div style="margin-top:10px"><button class="btn btn-ghost btn-sm" id="read-paste">${icon('fa-paste')} ${esc(t('readPasted'))}</button></div>
        <div class="card note-box" style="margin-top:24px">${icon('fa-lock')}<span>${esc(t('privacyBody'))}</span></div>
      </div>`;
      bindClose(el);
      const input = $('#file-input');
      $('#choose-files', el).onclick = () => { input.value = ''; input.click(); };
      input.onchange = () => { if (input.files.length) handleFiles([...input.files]); };
      const dz = $('#drop-zone', el);
      dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
      dz.ondragleave = () => dz.classList.remove('over');
      dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files.length) handleFiles([...e.dataTransfer.files]); };
      $('#read-paste', el).onclick = () => {
        const text = $('#paste-area', el).value;
        if (!text.trim()) return;
        try {
          const r = F.parseText(text);
          if (!r.contacts.length) { toast(t('nothingFound')); return; }
          openImportReview(r.contacts, { [r.kind]: r.contacts.length });
        } catch (e) { toast(t('nothingFound')); }
      };
    });
  }

  async function handleFiles(files) {
    let all = [];
    const kinds = {};
    toast(t('reading'));
    for (const f of files) {
      try {
        const r = await F.parseFile(f);
        all = all.concat(r.contacts);
        kinds[r.kind] = (kinds[r.kind] || 0) + r.contacts.length;
      } catch (e) {
        console.warn(e);
      }
    }
    const tst = $('.toast');
    if (tst) tst.remove();
    if (!all.length) { toast(t('nothingFound')); return; }
    openImportReview(all, kinds);
  }

  const KIND_LABEL = { csv: 'CSV', vcard: 'vCard', excel: 'Excel', numbers: 'Numbers', json: 'JSON', txt: 'TXT' };

  function planUpdate(items, policy) {
    const byCid = new Map(contacts.map(c => [c.id, c]));
    const phoneMap = new Map();
    const nameMap = new Map();
    contacts.forEach(c => {
      c.phones.forEach(p => { const k = phoneKey(p); if (!k) return; if (!phoneMap.has(k)) phoneMap.set(k, new Set()); phoneMap.get(k).add(c.id); });
      const nk = S.fold(c.name).trim();
      if (nk) { if (!nameMap.has(nk)) nameMap.set(nk, new Set()); nameMap.get(nk).add(c.id); }
    });
    const updates = new Map(), adds = [], conflicts = [];
    for (const it of items) {
      let target = null, by = null, ambiguous = false;
      if (it.contact_id && byCid.has(it.contact_id)) { target = it.contact_id; by = 'id'; }
      if (!target) {
        const ids = new Set();
        it.phones.forEach(p => { const s = phoneMap.get(phoneKey(p)); if (s) s.forEach(x => ids.add(x)); });
        if (ids.size === 1) { target = [...ids][0]; by = 'number'; }
        else if (ids.size > 1) ambiguous = true;
      }
      if (!target && !ambiguous) {
        const s = nameMap.get(S.fold(it.name).trim());
        if (s && s.size === 1) { target = [...s][0]; by = 'name'; }
        else if (s && s.size > 1) ambiguous = true;
      }
      if (ambiguous) { conflicts.push(it); continue; }
      if (!target) { adds.push(it); continue; }
      const base = updates.has(target) ? updates.get(target).next : byCid.get(target);
      const next = snap(base);
      if (policy === 'overwrite') {
        if (it.name) next.name = it.name;
        if (it.phones.length) next.phones = it.phones.slice();
        if (it.emails.length) next.emails = it.emails.slice();
        if (it.aliases.length) next.aliases = it.aliases.slice();
        if (it.company) next.company = it.company;
        if (it.note) next.note = it.note;
      } else if (policy === 'add') {
        const keys = new Set(next.phones.map(phoneKey));
        it.phones.forEach(p => { if (!keys.has(phoneKey(p))) { next.phones.push(p); keys.add(phoneKey(p)); } });
        next.emails = [...new Set(next.emails.concat(it.emails))];
        next.aliases = [...new Set(next.aliases.concat(it.aliases))];
        if (!next.company) next.company = it.company;
        if (!next.note) next.note = it.note;
      } else {
        if (!next.name) next.name = it.name;
        if (!next.phones.length) next.phones = it.phones.slice();
        if (!next.emails.length) next.emails = it.emails.slice();
        if (!next.aliases.length) next.aliases = it.aliases.slice();
        if (!next.company) next.company = it.company;
        if (!next.note) next.note = it.note;
      }
      const orig = byCid.get(target);
      if (diffFields(orig, next).length) updates.set(target, { id: target, next, by });
      else if (updates.has(target)) updates.set(target, { id: target, next, by });
    }
    return { updates: [...updates.values()], adds, conflicts };
  }

  function openImportReview(rawList, kinds) {
    const items = cleanImported(rawList);
    const libKeys = new Set();
    const libNames = new Set();
    contacts.forEach(c => { c.phones.forEach(p => libKeys.add(phoneKey(p))); libNames.add(S.fold(c.name).trim()); });
    const isExisting = c => (c.phones.length ? c.phones.some(p => libKeys.has(phoneKey(p))) : !!c.name && libNames.has(S.fold(c.name).trim()));
    const fresh = items.filter(c => !isExisting(c));
    const existing = items.filter(isExisting);
    const picked = new Set(fresh.map((_, i) => i));
    const hasIds = items.some(c => c.contact_id);
    let mode = hasIds && existing.length ? 'update' : 'add';
    let policy = 'fill';
    let showN = 200;

    openScreen('review-import-screen', el => {
      const pills = Object.keys(kinds).map(k => `<span class="pill">${esc(KIND_LABEL[k] || k)} · ${kinds[k]}</span>`).join('');
      let body = '', foot = '';
      const modeSeg = contacts.length ? `<div class="segmented" style="margin-top:20px">
        <button class="seg ${mode === 'add' ? 'on' : ''}" data-mode="add">${esc(t('modeAdd'))}</button>
        <button class="seg ${mode === 'update' ? 'on' : ''}" data-mode="update">${esc(t('modeUpdate'))}</button></div>` : '';
      if (mode === 'add') {
        body = `<div class="stat-cards">
            <div class="card stat-card"><div class="lbl">${esc(t('newLbl'))}</div><div class="val">${fresh.length}</div></div>
            <div class="card stat-card" style="--dot:var(--good)"><div class="lbl">${esc(t('existing'))}</div><div class="val">${existing.length}</div></div>
          </div>${pills}${modeSeg}
          ${fresh.length ? `<div class="section-label">${esc(t('newLbl'))}</div><ul class="contact-list">${fresh.slice(0, showN).map((c, i) => `
            <li class="contact-row" data-pick="${i}">${avatarHTML(c)}<div class="contact-main"><div class="contact-name">${esc(c.name || c.phones[0] || c.emails[0])}</div>
            <div class="contact-sub"><span class="num">${esc(c.name ? c.phones[0] || c.emails[0] || '' : c.phones[1] || '')}</span>${c.aliases.length ? `<span class="dim">${esc(t('aka'))} ${esc(c.aliases.join(', '))}</span>` : ''}</div></div>
            <span class="check-dot ${picked.has(i) ? '' : 'off'}">${icon('fa-check')}</span></li>`).join('')}</ul>
            ${fresh.length > showN ? `<button class="text-btn accent" data-more>${esc(t('andMore', fresh.length - showN))}</button>` : ''}` : ''}
          ${existing.length ? `<div class="section-label">${esc(t('existing'))}</div><p class="hint" style="margin-bottom:8px">${esc(t('existingHint'))}</p>
            <ul class="contact-list" style="opacity:.55">${existing.slice(0, 50).map(c => `<li class="contact-row">${avatarHTML(c)}<div class="contact-main"><div class="contact-name">${esc(c.name || c.phones[0])}</div><div class="contact-sub"><span class="num">${esc(c.phones[0] || '')}</span></div></div></li>`).join('')}</ul>` : ''}`;
        foot = `<button class="btn btn-dark" data-go ${picked.size ? '' : 'disabled'}>${icon('fa-check')} ${esc(t('addN', picked.size))}</button>`;
      } else {
        const plan = planUpdate(items, policy);
        el._plan = plan;
        body = `<div class="stat-cards">
            <div class="card stat-card"><div class="lbl">${esc(t('newLbl'))}</div><div class="val">${plan.adds.length}</div></div>
            <div class="card stat-card" style="--dot:var(--good)"><div class="lbl">${esc(t('updated'))}</div><div class="val">${plan.updates.length}</div></div>
            <div class="card stat-card" style="--dot:var(--faint)"><div class="lbl">${esc(t('conflicts'))}</div><div class="val">${plan.conflicts.length}</div></div>
          </div>${pills}${modeSeg}
          <div class="section-label">${esc(t('policy'))}</div>
          <div class="segmented">
            <button class="seg ${policy === 'fill' ? 'on' : ''}" data-pol="fill">${esc(t('policyFill'))}</button>
            <button class="seg ${policy === 'overwrite' ? 'on' : ''}" data-pol="overwrite">${esc(t('policyOverwrite'))}</button>
            <button class="seg ${policy === 'add' ? 'on' : ''}" data-pol="add">${esc(t('policyAdd'))}</button>
          </div>
          <p class="hint">${esc(t('matchedBy'))}: contact_id → ${esc(t('by_number'))} → ${esc(t('by_name'))}</p>
          ${plan.updates.length ? `<div class="section-label">${esc(t('updated'))}</div><ul class="contact-list">${plan.updates.slice(0, 100).map(u => `
            <li class="contact-row">${avatarHTML(u.next)}<div class="contact-main"><div class="contact-name">${esc(u.next.name || u.next.phones[0])}</div>
            <div class="contact-sub"><span class="match-tag">${esc(t('matchedBy'))} ${esc(t('by_' + u.by))}</span></div></div></li>`).join('')}</ul>` : ''}
          ${plan.conflicts.length ? `<div class="section-label">${esc(t('conflicts'))}</div><p class="hint" style="margin-bottom:8px">${esc(t('conflictHint'))}</p>
            <ul class="contact-list" style="opacity:.6">${plan.conflicts.slice(0, 50).map(c => `<li class="contact-row">${avatarHTML(c)}<div class="contact-main"><div class="contact-name">${esc(c.name || c.phones[0])}</div><div class="contact-sub"><span class="num">${esc(c.phones[0] || '')}</span></div></div></li>`).join('')}</ul>` : ''}`;
        const n = plan.updates.length + plan.adds.length;
        foot = `<button class="btn btn-dark" data-go ${n ? '' : 'disabled'}>${icon('fa-check')} ${esc(t('reviewN', n))}</button>`;
      }
      const total = mode === 'add' ? items.length : items.length;
      el.innerHTML = `<div class="screen-inner">
        ${headHTML(t('reviewImport'))}
        <div class="big-num">${total}</div>
        <div class="big-num-sub">${esc(t('nContacts', total))}</div>
        ${body}
      </div>
      <footer class="screen-foot"><div class="inner">${foot}</div></footer>`;
      bindClose(el);
      $$('[data-mode]', el).forEach(b => { b.onclick = () => { mode = b.dataset.mode; el._build(); }; });
      $$('[data-pol]', el).forEach(b => { b.onclick = () => { policy = b.dataset.pol; el._build(); }; });
      $$('[data-pick]', el).forEach(r => { r.onclick = () => { const i = +r.dataset.pick; picked.has(i) ? picked.delete(i) : picked.add(i); el._build(); }; });
      const more = $('[data-more]', el);
      if (more) more.onclick = () => { showN += 500; el._build(); };
      $('[data-go]', el).onclick = () => {
        if (mode === 'add') {
          const adds = fresh.filter((_, i) => picked.has(i)).map(c => { const x = Object.assign({}, c); delete x.contact_id; return x; });
          commit('import', { adds }, { message: t('imported', adds.length) });
          state.query = ''; $('#search-input').value = '';
          closeScreens(stack.length, () => renderLibrary());
        } else {
          const plan = el._plan;
          const cs = { adds: plan.adds.map(c => { const x = Object.assign({}, c); delete x.contact_id; return x; }), updates: plan.updates.map(u => ({ id: u.id, next: u.next })) };
          openReview(cs, 'sync');
        }
      };
    });
  }

  const DIFF_KEYS = ['name', 'aliases', 'phones', 'emails', 'company', 'note', 'groups', 'starred'];
  function diffFields(a, b) {
    const out = [];
    DIFF_KEYS.forEach(k => {
      const va = Array.isArray(a[k]) ? a[k].join(', ') : String(a[k] == null ? '' : a[k]);
      const vb = Array.isArray(b[k]) ? b[k].map(x => String(x).trim()).filter(Boolean).join(', ') : String(b[k] == null ? '' : b[k]).trim();
      if (k === 'starred') { if (!!a[k] !== !!b[k]) out.push([k, a[k] ? '★' : '—', b[k] ? '★' : '—']); return; }
      if (va.trim() !== vb) out.push([k, va, vb]);
    });
    return out;
  }
  const FIELD_LABEL = k => ({ name: t('name'), aliases: t('aliases'), phones: t('phones'), emails: t('emails'), company: t('company'), note: t('note'), groups: t('groups'), starred: t('starred') }[k]);

  function openReview(cs, action) {
    const adds = cs.adds || [], updates = cs.updates || [], deletes = cs.deletes || [];
    const total = adds.length + updates.length + deletes.length;
    let showN = 150;
    openScreen('review-screen', el => {
      const items = [];
      const nm = c => esc(c.name || c.phones[0]);
      adds.forEach(c => items.push(() => `<div class="diff-item"><div class="diff-head"><span class="diff-badge add">+</span>${nm(c)}</div>
        ${c.phones.length ? `<div class="diff-field"><span class="k">${esc(t('phones'))}</span><ins dir="ltr">${esc(c.phones.join(', '))}</ins></div>` : ''}</div>`));
      updates.forEach(u => items.push(() => {
        const o = byId.get(u.id).c;
        const d = diffFields(o, u.next);
        return `<div class="diff-item"><div class="diff-head"><span class="diff-badge upd">${icon('fa-pen')}</span>${esc(u.next.name || o.name || o.phones[0])}</div>
          ${d.map(([k, a, b]) => `<div class="diff-field"><span class="k">${esc(FIELD_LABEL(k))}</span><span>${a ? `<del>${esc(a)}</del><br>` : ''}<ins>${esc(b || '—')}</ins></span></div>`).join('')}</div>`;
      }));
      deletes.forEach(id => { const o = byId.get(id); if (o) items.push(() => `<div class="diff-item"><div class="diff-head"><span class="diff-badge del">${icon('fa-trash-can')}</span><del>${esc(o.c.name || o.c.phones[0])}</del></div></div>`); });
      el.innerHTML = `<div class="screen-inner">
        ${headHTML(t('review'))}
        <div class="big-num">${total}</div>
        <div class="big-num-sub">${esc(t('nContacts', total))}</div>
        <p class="sub">${esc(t('reviewSub'))}</p>
        <div class="stat-cards" style="margin-top:16px">
          ${adds.length ? `<div class="card stat-card" style="--dot:var(--good)"><div class="lbl">${esc(t('newLbl'))}</div><div class="val">${adds.length}</div></div>` : ''}
          ${updates.length ? `<div class="card stat-card"><div class="lbl">${esc(t('updated'))}</div><div class="val">${updates.length}</div></div>` : ''}
          ${deletes.length ? `<div class="card stat-card" style="--dot:var(--danger)"><div class="lbl">${esc(t('delete'))}</div><div class="val">${deletes.length}</div></div>` : ''}
        </div>
        <div class="card" style="padding:4px 18px;margin-top:18px">${items.slice(0, showN).map(f => f()).join('')}</div>
        ${items.length > showN ? `<button class="text-btn accent" data-more style="margin-top:8px">${esc(t('andMore', items.length - showN))}</button>` : ''}
      </div>
      <footer class="screen-foot"><div class="inner"><button class="btn btn-dark" data-go>${icon('fa-check')} ${esc(t('confirm'))}</button></div></footer>`;
      bindClose(el);
      const more = $('[data-more]', el);
      if (more) more.onclick = () => { showN += 500; el._build(); };
      $('[data-go]', el).onclick = () => {
        commit(action, cs);
        closeScreens(stack.length, () => renderLibrary());
      };
    });
  }

  const FORMATS = ['csv', 'vcard', 'excel', 'numbers', 'json', 'txt'];
  const FMT_EXT = { csv: 'csv', vcard: 'vcf', excel: 'xlsx', numbers: 'xlsx', json: 'json', txt: 'txt' };

  function openExport(list) {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const o = Object.assign({ format: 'csv', numberStyle: 'saved', everyNumber: true, header: true, emails: true, company: true, notes: false, aliases: true, contactId: false }, settings.exportOpts || {});
    let fileName = 'contacts-' + stamp;
    openScreen('export-screen', el => {
      const fmtCard = f => { const [n, s] = t('fmt_' + f); return `<button class="format-card ${o.format === f ? 'on' : ''}" data-fmt="${f}"><span class="file-glyph">.${FMT_EXT[f]}</span><b>${esc(n)}</b><small>${esc(s)}</small></button>`; };
      const tog = (k, label) => `<label class="toggle-row"><span>${esc(t(label))}</span><input type="checkbox" class="switch" data-opt="${k}" ${o[k] ? 'checked' : ''}></label>`;
      const sample = (list.find(c => c.phones[0]) || {}).phones;
      const sp = sample ? sample[0] : '+1 (415) 555-0101';
      el.innerHTML = `<div class="screen-inner">
        ${headHTML('')}
        <h1 class="big-title">${esc(t('exportTitle'))}</h1>
        <p class="stats"><strong>${esc(t('nContacts', list.length))}</strong><span class="sep">·</span><span>${esc(t('nNumbers', numberCount(list)))}</span></p>
        <div class="section-label">${esc(t('format'))}</div>
        <div class="format-grid">${FORMATS.map(fmtCard).join('')}</div>
        <div class="section-label">${esc(t('fileName'))}</div>
        <div class="field"><input id="export-name" value="${esc(fileName)}" dir="ltr"><span class="suffix">.${FMT_EXT[o.format]}</span></div>
        <div class="section-label">${esc(t('options'))}</div>
        <div class="segmented">
          <button class="seg ${o.numberStyle === 'saved' ? 'on' : ''}" data-ns="saved">${esc(t('asSaved'))}<small>${esc(sp.slice(0, 14))}</small></button>
          <button class="seg ${o.numberStyle === 'intl' ? 'on' : ''}" data-ns="intl">${esc(t('international'))}<small>${esc(F.styleNumber(sp, 'intl').slice(0, 13))}</small></button>
          <button class="seg ${o.numberStyle === 'digits' ? 'on' : ''}" data-ns="digits">${esc(t('digitsOnly'))}<small>${esc(F.styleNumber(sp, 'digits').slice(0, 12))}</small></button>
        </div>
        <div style="margin-top:8px">
          ${tog('everyNumber', 'everyNumber')}
          ${['csv', 'excel', 'numbers', 'txt'].includes(o.format) ? tog('header', 'headerRow') : ''}
          ${o.format !== 'txt' ? tog('emails', 'incEmails') + tog('company', 'incCompany') + tog('notes', 'incNotes') + tog('aliases', 'incAliases') + tog('contactId', 'incId') : ''}
        </div>
        <div class="section-label">${esc(t('preview'))}</div>
        <pre class="preview" id="export-preview"></pre>
      </div>
      <footer class="screen-foot"><div class="inner">
        <button class="btn btn-ghost narrow" data-share>${icon('fa-arrow-up-from-bracket')} ${esc(t('share'))}</button>
        <button class="btn btn-dark" data-save ${list.length ? '' : 'disabled'}>${icon('fa-download')} ${esc(t('saveFile'))}</button>
      </div></footer>`;
      bindClose(el);
      const pv = () => { try { $('#export-preview', el).textContent = F.preview(list, o) || '—'; } catch (e) { $('#export-preview', el).textContent = '—'; } };
      pv();
      const keep = () => { settings.exportOpts = Object.assign({}, o); saveSettings(); };
      $$('[data-fmt]', el).forEach(b => { b.onclick = () => { o.format = b.dataset.fmt; keep(); el._build(); }; });
      $$('[data-ns]', el).forEach(b => { b.onclick = () => { o.numberStyle = b.dataset.ns; keep(); el._build(); }; });
      $$('[data-opt]', el).forEach(i => { i.onchange = () => { o[i.dataset.opt] = i.checked; keep(); pv(); }; });
      $('#export-name', el).oninput = e => { fileName = e.target.value; };
      const build = async () => {
        const nm = (fileName.trim() || 'contacts').replace(/[\\/:*?"<>|]/g, '_') + '.' + FMT_EXT[o.format];
        if (list.length > 5000) toast(t('reading'));
        const r = await F.exportBlob(list, o);
        return { nm, r };
      };
      $('[data-save]', el).onclick = async () => { const { nm, r } = await build(); download(nm, r.blob, r.mime); toast(t('exported')); };
      $('[data-share]', el).onclick = async () => { const { nm, r } = await build(); shareFile(nm, r.blob, r.mime); };
    });
  }

  const firstTok = n => (n || '').trim().split(/\s+/)[0] || '';
  const lastTok = n => { const x = (n || '').trim().split(/\s+/); return x.length > 1 ? x[x.length - 1] : ''; };
  function fillTokens(tpl, c, n, keepSpace) {
    const out = String(tpl).replace(/\{(name|first|last|alias|company|n)\}/g, (m, k) =>
      k === 'name' ? c.name || '' : k === 'first' ? firstTok(c.name) : k === 'last' ? lastTok(c.name) : k === 'alias' ? (c.aliases && c.aliases[0]) || firstTok(c.name) : k === 'company' ? c.company || '' : String(n));
    return keepSpace ? out : out.replace(/\s+/g, ' ').trim();
  }
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const EDGE = /^[\s\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFE0F\u20E3\p{Extended_Pictographic}\p{Emoji_Modifier}]+|[\s\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFE0F\u20E3\p{Extended_Pictographic}\p{Emoji_Modifier}]+$/gu;
  const titleCase = s => s.toLocaleLowerCase().replace(/(^|[\s\-'’(])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase());
  const mapPhones = (r, fn) => Object.assign({}, r, { phones: r.phones.map(fn) });

  const OPS = [
    { sec: 'names', key: 'replace', icon: 'fa-magnifying-glass', view: p => (p.field === 'phone' ? 'phones' : p.field === 'company' ? 'company' : 'name'),
      params: [{ k: 'field', type: 'seg', def: 'name', opts: [['name', 'inNames'], ['phone', 'inNumbers'], ['company', 'inCompanies']] }, { k: 'find', type: 'text', label: 'find' }, { k: 'repl', type: 'text', label: 'replaceWith' }],
      ready: p => !!p.find,
      fn: (r, p) => { const re = new RegExp(reEsc(p.find), 'gi'); if (p.field === 'phone') return mapPhones(r, x => x.replace(re, p.repl || '')); if (p.field === 'company') return Object.assign({}, r, { company: r.company.replace(re, p.repl || '').trim() }); return Object.assign({}, r, { name: r.name.replace(re, p.repl || '').replace(/\s+/g, ' ').trim() }); } },
    { sec: 'names', key: 'affix', icon: 'fa-i-cursor', view: () => 'name', params: [{ k: 'pre', type: 'text', label: 'prefix' }, { k: 'suf', type: 'text', label: 'suffix' }], ready: p => !!(p.pre || p.suf),
      fn: (r, p) => { if (!r.name) return r; let n = r.name; if (p.pre && !n.startsWith(p.pre)) n = p.pre + n; if (p.suf && !n.endsWith(p.suf)) n = n + p.suf; return Object.assign({}, r, { name: n }); } },
    { sec: 'names', key: 'pattern', icon: 'fa-list-ol', view: () => 'name', params: [{ k: 'pat', type: 'text', label: 'pattern', def: '{name} {n}', tokens: ['{name}', '{first}', '{last}', '{alias}', '{company}', '{n}'] }, { k: 'start', type: 'number', label: 'startAt', def: 1 }], ready: p => !!p.pat,
      fn: (r, p, i) => Object.assign({}, r, { name: fillTokens(p.pat, r, (+p.start || 1) + i) }) },
    { sec: 'names', key: 'case', icon: 'fa-font', view: () => 'name', params: [{ k: 'mode', type: 'seg', def: 'title', opts: [['title', 'caseTitle'], ['upper', 'caseUpper'], ['lower', 'caseLower']] }], ready: () => true,
      fn: (r, p) => Object.assign({}, r, { name: p.mode === 'upper' ? r.name.toLocaleUpperCase() : p.mode === 'lower' ? r.name.toLocaleLowerCase() : titleCase(r.name) }) },
    { sec: 'names', key: 'swap', icon: 'fa-right-left', view: () => 'name', params: [], ready: () => true,
      fn: r => { const x = r.name.trim().split(/\s+/); if (x.length < 2) return r; const a = x[0]; x[0] = x[x.length - 1]; x[x.length - 1] = a; return Object.assign({}, r, { name: x.join(' ') }); } },
    { sec: 'names', key: 'clean', icon: 'fa-broom', view: () => 'name', params: [], ready: () => true,
      fn: r => Object.assign({}, r, { name: r.name.replace(EDGE, '').replace(/\s+/g, ' ').trim() }) },
    { sec: 'aliases', key: 'aliasAdd', icon: 'fa-user-tag', view: () => 'aliases', params: [{ k: 'val', type: 'text', label: 'alias', tokens: ['{first}', '{last}', '{name}', '{company}'] }], ready: p => !!p.val,
      fn: (r, p, i) => { const a = fillTokens(p.val, r, i + 1); if (!a || r.aliases.includes(a) || a === r.name) return r; return Object.assign({}, r, { aliases: r.aliases.concat(a) }); } },
    { sec: 'aliases', key: 'aliasKeep', icon: 'fa-bookmark', view: () => 'aliases', params: [], ready: () => true,
      fn: r => (!r.name || r.aliases.includes(r.name) ? r : Object.assign({}, r, { aliases: r.aliases.concat(r.name) })) },
    { sec: 'aliases', key: 'aliasSwap', icon: 'fa-arrows-rotate', view: () => 'aliases', params: [], ready: () => true,
      fn: r => { if (!r.aliases.length) return r; const al = r.aliases.slice(); const a = al[0]; al[0] = r.name; return Object.assign({}, r, { name: a, aliases: al.filter(Boolean) }); } },
    { sec: 'aliases', key: 'aliasClear', icon: 'fa-eraser', view: () => 'aliases', params: [], ready: () => true,
      fn: r => (r.aliases.length ? Object.assign({}, r, { aliases: [] }) : r) },
    { sec: 'numbers', key: 'cc', icon: 'fa-globe', view: () => 'phones', params: [{ k: 'cc', type: 'text', label: 'countryCode', def: '971', tel: true }, { k: 'trunk', type: 'toggle', label: 'trunk', def: true }], ready: p => /^\d{1,4}$/.test(String(p.cc).replace(/^\+/, '')),
      fn: (r, p) => { const cc = String(p.cc).replace(/^\+/, ''); return mapPhones(r, x => { const s = S.latinDigits(x).trim(); if (/^(\+|00)/.test(s) || F.digitCount(s) < 5) return x; let rest = s; if (p.trunk) rest = rest.replace(/^0+/, ''); return '+' + cc + ' ' + rest.trim(); }); } },
    { sec: 'numbers', key: 'rmcc', icon: 'fa-earth-americas', view: () => 'phones', params: [{ k: 'cc', type: 'text', label: 'countryCode', def: '971', tel: true }, { k: 'trunk', type: 'toggle', label: 'trunk', def: true, invertLabel: true }], ready: p => /^\d{1,4}$/.test(String(p.cc).replace(/^\+/, '')),
      fn: (r, p) => { const cc = String(p.cc).replace(/^\+/, ''); const re = new RegExp('^(?:\\+|00)\\s*' + cc + '[\\s\\-]*'); return mapPhones(r, x => { const s = S.latinDigits(x).trim(); const m = s.match(re); return m ? (p.trunk ? '0' : '') + s.slice(m[0].length) : x; }); } },
    { sec: 'numbers', key: 'prefix', icon: 'fa-code-branch', view: () => 'phones', params: [{ k: 'from', type: 'text', label: 'fromPrefix', tel: true }, { k: 'to', type: 'text', label: 'toPrefix', tel: true }], ready: p => !!p.from,
      fn: (r, p) => mapPhones(r, x => { const c = S.latinDigits(x).replace(/[\s\-().]/g, ''); const from = S.latinDigits(p.from).replace(/[\s\-().]/g, ''); return c.startsWith(from) ? S.latinDigits(p.to || '').replace(/[\s\-().]/g, '') + c.slice(from.length) : x; }) },
    { sec: 'numbers', key: 'format', icon: 'fa-hashtag', view: () => 'phones', params: [{ k: 'style', type: 'seg', def: 'intl', opts: [['intl', 'international'], ['digits', 'digitsOnly'], ['spaced', 'spaced']] }], ready: () => true,
      fn: (r, p) => mapPhones(r, x => { if (p.style !== 'spaced') return F.styleNumber(x, p.style); const c = F.styleNumber(x, 'intl'); const plus = c.startsWith('+') ? '+' : ''; return plus + c.replace('+', '').replace(/(\d{3})(?=\d{2,})/g, '$1 '); }) },
    { sec: 'numbers', key: 'dedupe', icon: 'fa-clone', view: () => 'phones', params: [], ready: () => true,
      fn: r => { const seen = new Set(); const ph = r.phones.filter(x => { const k = phoneKey(x); if (seen.has(k)) return false; seen.add(k); return true; }); return ph.length === r.phones.length ? r : Object.assign({}, r, { phones: ph }); } },
    { sec: 'details', key: 'company', icon: 'fa-building', view: () => 'company', params: [{ k: 'val', type: 'text', label: 'company' }, { k: 'onlyEmpty', type: 'toggle', label: 'onlyEmpty', def: true }], ready: () => true,
      fn: (r, p) => (p.onlyEmpty && r.company ? r : Object.assign({}, r, { company: (p.val || '').trim() })) },
    { sec: 'details', key: 'note', icon: 'fa-note-sticky', view: () => 'note', params: [{ k: 'val', type: 'text', label: 'noteText', tokens: ['{first}', '{name}', '{company}'] }], ready: p => !!p.val,
      fn: (r, p, i) => { const line = fillTokens(p.val, r, i + 1); return Object.assign({}, r, { note: r.note ? r.note + '\n' + line : line }); } }
  ];

  function viewOf(r, v) {
    if (v === 'phones') return r.phones.join(', ');
    if (v === 'aliases') return r.name + (r.aliases.length ? ' · ' + r.aliases.join(', ') : '');
    if (v === 'company') return r.company || '—';
    if (v === 'note') return r.note || '—';
    return r.name;
  }

  function openBatch() {
    const orig = new Map(contacts.map(c => [c.id, c]));
    let rows = sorted(index).map(e => ({ id: e.c.id, name: e.c.name, phones: e.c.phones.slice(), company: e.c.company, aliases: e.c.aliases.slice(), note: e.c.note }));
    const undoStack = [];
    const RH = 56;
    const changedIds = new Set();
    const isChanged = (r, f) => {
      const o = orig.get(r.id);
      if (f === 'name') return r.name !== o.name;
      if (f === 'phone') return r.phones.join('|') !== o.phones.join('|');
      if (f === 'company') return r.company !== o.company;
      if (f === 'alias') return r.aliases.join('|') !== o.aliases.join('|');
      if (f === 'note') return r.note !== o.note;
      return false;
    };
    const rowChanged = r => ['name', 'phone', 'company', 'alias', 'note'].some(f => isChanged(r, f));
    const recompute = () => { changedIds.clear(); rows.forEach(r => { if (rowChanged(r)) changedIds.add(r.id); }); };
    const changedCount = () => changedIds.size;
    let scr = null;
    let winA = -1, winB = -1;
    openScreen('batch-screen', el => {
      scr = el;
      const n = changedCount();
      el.innerHTML = `<div class="screen-inner" style="max-width:900px">
        ${headHTML(t('batchEdit'), { end: `<button class="icon-btn" data-undo aria-label="${esc(t('undo'))}" ${undoStack.length ? '' : 'disabled style="opacity:.35"'}>${icon('fa-rotate-left')}</button>` })}
        <div class="batch-meta"><span>${esc(t('nContacts', rows.length))}</span>${n ? `<span class="changed-pill">${esc(t('nChanged', n))}</span>` : `<span class="muted">${esc(t('batchSub'))}</span>`}</div>
        <div class="batch-table-wrap"><table class="batch-table">
          <thead><tr><th>#</th><th>${esc(t('name'))}</th><th>${esc(t('phone'))}</th><th>${esc(t('company'))}</th><th>${esc(t('alias'))}</th></tr></thead>
          <tbody id="batch-body"></tbody>
        </table></div>
      </div>
      <footer class="screen-foot"><div class="inner" style="max-width:856px">
        <button class="btn btn-ghost narrow" data-ops>${icon('fa-wand-magic-sparkles')} ${esc(t('operations'))}</button>
        <button class="btn btn-dark" data-save ${n ? '' : 'disabled'}>${icon('fa-check')} ${esc(n ? t('saveNChanges', n) : t('noChanges'))}</button>
      </div></footer>`;
      bindClose(el);
      winA = winB = -1;
      const tb = $('#batch-body', el);
      tb.oninput = onBodyInput;
      $('.batch-table-wrap', el).addEventListener('scroll', () => paintBody(), { passive: true });
      if (rows.length) paintBody(true);
      else tb.innerHTML = `<tr><td colspan="5" style="padding:30px;text-align:center;color:var(--muted)">${esc(t('emptyTitle'))}</td></tr>`;
      $('[data-undo]', el).onclick = () => { if (!undoStack.length) return; rows = undoStack.pop(); recompute(); refresh(); };
      $('[data-ops]', el).onclick = openOps;
      $('[data-save]', el).onclick = () => {
        const updates = rows.filter(rowChanged).map(r => ({ id: r.id, next: Object.assign({}, orig.get(r.id), { name: r.name.trim(), phones: r.phones.filter(Boolean), company: r.company, aliases: r.aliases, note: r.note }) }));
        if (updates.length) openReview({ updates }, 'batch');
      };
    });

    function rowHTMLb(r, i) {
      return `<tr data-i="${i}">
        <td class="idx">${i + 1}</td>
        <td class="${isChanged(r, 'name') ? 'changed' : ''}"><input data-f="name" value="${esc(r.name)}" aria-label="${esc(t('name'))} ${i + 1}"></td>
        <td class="num ${isChanged(r, 'phone') ? 'changed' : ''}"><input data-f="phone" value="${esc(r.phones[0] || '')}" inputmode="tel" aria-label="${esc(t('phone'))} ${i + 1}"></td>
        <td class="${isChanged(r, 'company') ? 'changed' : ''}"><input data-f="company" value="${esc(r.company)}" aria-label="${esc(t('company'))} ${i + 1}"></td>
        <td class="${isChanged(r, 'alias') ? 'changed' : ''}"><input data-f="alias" value="${esc(r.aliases.join('; '))}" aria-label="${esc(t('alias'))} ${i + 1}"></td>
      </tr>`;
    }

    function paintBody(force) {
      const wrap = $('.batch-table-wrap', scr);
      const tb = $('#batch-body', scr);
      if (!wrap || !tb || !rows.length) return;
      const a = Math.max(0, Math.floor(wrap.scrollTop / RH / 6) * 6 - 12);
      const b = Math.min(rows.length, a + Math.ceil((wrap.clientHeight || 600) / RH) + 30);
      if (!force && a === winA && b === winB) return;
      winA = a;
      winB = b;
      const sp = h => (h ? `<tr class="sp" style="height:${h}px"><td colspan="5"></td></tr>` : '');
      tb.innerHTML = sp(a * RH) + rows.slice(a, b).map((r, j) => rowHTMLb(r, a + j)).join('') + sp((rows.length - b) * RH);
    }

    function onBodyInput(e) {
      const inp = e.target;
      const r = rows[+inp.closest('tr').dataset.i];
      const f = inp.dataset.f, v = inp.value;
      if (f === 'name') r.name = v;
      if (f === 'company') r.company = v;
      if (f === 'alias') r.aliases = v.split(/[;,،]/).map(s => s.trim()).filter(Boolean);
      if (f === 'phone') { const rest = r.phones.slice(1); r.phones = v.trim() ? [v].concat(rest) : rest; }
      inp.parentElement.classList.toggle('changed', isChanged(r, f));
      if (rowChanged(r)) changedIds.add(r.id); else changedIds.delete(r.id);
      updateCounts();
    }

    function refresh() {
      const u = $('[data-undo]', scr);
      u.disabled = !undoStack.length;
      u.style.opacity = undoStack.length ? '' : '.35';
      updateCounts();
      paintBody(true);
    }

    function updateCounts() {
      const n = changedCount();
      const meta = $('.batch-meta', scr);
      meta.innerHTML = `<span>${esc(t('nContacts', rows.length))}</span>${n ? `<span class="changed-pill">${esc(t('nChanged', n))}</span>` : `<span class="muted">${esc(t('batchSub'))}</span>`}`;
      const sv = $('[data-save]', scr);
      sv.disabled = !n;
      sv.innerHTML = `${icon('fa-check')} ${esc(n ? t('saveNChanges', n) : t('noChanges'))}`;
    }

    function openOps() {
      openSheet((body, closeSheet) => {
        const secs = ['names', 'aliases', 'numbers', 'details'];
        body.innerHTML = `<h3>${esc(t('operations'))}</h3><p class="sub">${esc(t('opsSub'))}</p>` + secs.map(s => `<div class="section-label">${esc(t('sec_' + s))}</div>` +
          OPS.filter(o => o.sec === s).map(o => { const [a, b] = t('op_' + o.key); return `<button class="op-row" data-op="${o.key}"><span class="ico">${icon(o.icon)}</span><span><b>${esc(a)}</b><small>${esc(b)}</small></span></button>`; }).join('')).join('');
        $$('[data-op]', body).forEach(b => { b.onclick = () => openOpDialog(OPS.find(o => o.key === b.dataset.op), closeSheet); });
      });
    }

    function openOpDialog(op, closeSheet) {
      const p = {};
      op.params.forEach(x => { p[x.k] = x.def != null ? x.def : ''; });
      openDialog((d, close) => {
        const [title, desc] = t('op_' + op.key);
        const fields = op.params.map(x => {
          if (x.type === 'seg') return `<div class="form-group"><div class="segmented">${x.opts.map(([v, l]) => `<button class="seg ${p[x.k] === v ? 'on' : ''}" data-seg="${x.k}" data-v="${v}">${esc(t(l))}</button>`).join('')}</div></div>`;
          if (x.type === 'toggle') return `<label class="toggle-row"><span>${esc(t(x.label))}</span><input type="checkbox" class="switch" data-p="${x.k}" ${p[x.k] ? 'checked' : ''}></label>`;
          return `<div class="form-group"><label>${esc(t(x.label))}</label><div class="field"><input data-p="${x.k}" value="${esc(p[x.k])}" ${x.type === 'number' ? 'type="number"' : ''} ${x.tel ? 'dir="ltr" inputmode="tel"' : ''}></div>
            ${x.tokens ? `<div class="token-row">${x.tokens.map(tk => `<button data-tok="${x.k}" data-v="${tk}">${tk}</button>`).join('')}</div>` : ''}</div>`;
        }).join('');
        d.innerHTML = `<h4>${esc(title)}</h4><p class="sub">${esc(desc)}</p>${fields}<div id="op-preview"></div>
          <div class="actions"><button class="btn-text" data-x>${esc(t('cancel'))}</button><button class="btn btn-accent" data-ok></button></div>`;
        let tm = null;
        const sameRow = (a, b) => a.name === b.name && a.company === b.company && a.note === b.note && a.phones.join('|') === b.phones.join('|') && a.aliases.join('|') === b.aliases.join('|');
        const update = () => { clearTimeout(tm); tm = setTimeout(run, rows.length > 20000 ? 180 : 0); };
        const run = () => {
          let result = null, changed = [];
          if (op.ready(p)) {
            result = rows.map((r, i) => op.fn(r, p, i));
            changed = result.map((r, i) => [rows[i], r]).filter(([a, b]) => a !== b && !sameRow(a, b));
          }
          const v = op.view(p);
          $('#op-preview', d).innerHTML = result ? `<div class="preview-box">${changed.length ? `<div class="will">${esc(t('willChange', changed.length))}</div>` +
            changed.slice(0, 4).map(([a, b]) => `<div class="before">${esc(viewOf(a, v))}</div><div class="after">${esc(viewOf(b, v))}</div>`).join('') +
            (changed.length > 4 ? `<div class="more">${esc(t('andMore', changed.length - 4))}</div>` : '') : `<div class="more">${esc(t('nothingToChange'))}</div>`}</div>` : '';
          const ok = $('[data-ok]', d);
          ok.textContent = t('applyToN', changed.length);
          ok.disabled = !changed.length;
          ok.onclick = () => { undoStack.push(rows); rows = result; close(); closeSheet(); recompute(); refresh(); };
        };
        $$('[data-p]', d).forEach(i => { i.oninput = i.onchange = () => { p[i.dataset.p] = i.type === 'checkbox' ? i.checked : i.value; update(); }; });
        $$('[data-seg]', d).forEach(b => { b.onclick = () => { p[b.dataset.seg] = b.dataset.v; $$(`[data-seg="${b.dataset.seg}"]`, d).forEach(x => x.classList.toggle('on', x === b)); update(); }; });
        $$('[data-tok]', d).forEach(b => { b.onclick = () => { const inp = $(`[data-p="${b.dataset.tok}"]`, d); inp.value += (inp.value && !inp.value.endsWith(' ') ? ' ' : '') + b.dataset.v; p[b.dataset.tok] = inp.value; update(); inp.focus(); }; });
        $('[data-x]', d).onclick = close;
        run();
      });
    }
  }

  function findDuplicates() {
    const parent = new Map(contacts.map(c => [c.id, c.id]));
    const why = new Map();
    const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const union = (a, b, reason) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); why.set(a, why.get(a) || reason); why.set(b, why.get(b) || reason); };
    const pk = new Map(), nk = new Map();
    contacts.forEach(c => {
      c.phones.forEach(p => { const k = phoneKey(p); if (k.length < 5) return; if (pk.has(k)) union(pk.get(k), c.id, 'number'); else pk.set(k, c.id); });
      const n = S.fold(c.name).replace(/\s+/g, ' ').trim();
      if (n) { if (nk.has(n)) union(nk.get(n), c.id, 'name'); else nk.set(n, c.id); }
    });
    const groups = new Map();
    contacts.forEach(c => { const r = find(c.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); });
    return [...groups.values()].filter(g => g.length > 1).map(g => ({
      members: g,
      reason: g.some(c => why.get(c.id) === 'number') ? 'number' : 'name',
      keep: g.slice().sort((a, b) => (b.phones.length + b.emails.length + (b.company ? 1 : 0) + (b.note ? 1 : 0) + b.name.length / 100) - (a.phones.length + a.emails.length + (a.company ? 1 : 0) + (a.note ? 1 : 0) + a.name.length / 100))[0].id,
      on: true
    }));
  }

  function openDuplicates() {
    const groups = findDuplicates();
    openScreen('duplicates-screen', el => {
      const active = groups.filter(g => g.on).length;
      el.innerHTML = `<div class="screen-inner">
        ${headHTML('')}
        <h1 class="big-title">${esc(t('duplicates'))}</h1>
        <p class="sub">${esc(t('dupSub'))}</p>
        <div style="margin-top:18px">${groups.length ? groups.slice(0, 300).map((g, gi) => `<div class="card dup-group" style="${g.on ? '' : 'opacity:.5'}">
          <div class="why"><span>${esc(g.reason === 'number' ? t('sharedNumber') : t('sameName'))}</span>
            <input type="checkbox" class="switch" data-on="${gi}" ${g.on ? 'checked' : ''} aria-label="${esc(t('mergeN', 1))}" style="transform:scale(.8)"></div>
          ${g.members.map(c => `<div class="dup-member" data-g="${gi}" data-k="${esc(c.id)}"><span class="radio ${g.keep === c.id ? 'on' : ''}"></span>${avatarHTML(c)}
            <div class="contact-main"><div class="contact-name">${esc(c.name || '—')}</div><div class="contact-sub"><span class="num">${esc(c.phones.join(', '))}</span>${c.company ? `<span class="dim">${esc(c.company)}</span>` : ''}</div></div>
            ${g.keep === c.id ? `<span class="match-tag">${esc(t('keep'))}</span>` : ''}</div>`).join('')}
        </div>`).join('') + (groups.length > 300 ? `<p class="hint">${esc(t('andMore', groups.length - 300))}</p>` : '') : `<div class="empty-state"><div class="big">${esc(t('noDuplicates'))}</div></div>`}</div>
      </div>
      ${groups.length ? `<footer class="screen-foot"><div class="inner"><button class="btn btn-dark" data-go ${active ? '' : 'disabled'}>${icon('fa-code-merge')} ${esc(t('mergeN', active))}</button></div></footer>` : ''}`;
      bindClose(el);
      $$('[data-k]', el).forEach(r => { r.onclick = () => { groups[+r.dataset.g].keep = r.dataset.k; el._build(); }; });
      $$('[data-on]', el).forEach(i => { i.onchange = () => { groups[+i.dataset.on].on = i.checked; el._build(); }; });
      const go = $('[data-go]', el);
      if (go) go.onclick = () => {
        const updates = [], deletes = [];
        groups.filter(g => g.on).forEach(g => {
          const keep = clone(g.members.find(c => c.id === g.keep));
          g.members.filter(c => c.id !== g.keep).forEach(o => {
            const keys = new Set(keep.phones.map(phoneKey));
            o.phones.forEach(p => { if (!keys.has(phoneKey(p))) { keep.phones.push(p); keys.add(phoneKey(p)); } });
            keep.emails = [...new Set(keep.emails.concat(o.emails))];
            const al = new Set(keep.aliases.concat(o.aliases));
            if (o.name && S.fold(o.name).trim() !== S.fold(keep.name).trim()) al.add(o.name);
            al.delete(keep.name);
            keep.aliases = [...al];
            keep.company = keep.company || o.company;
            keep.note = [keep.note, o.note].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('\n');
            keep.groups = [...new Set(keep.groups.concat(o.groups))];
            keep.starred = keep.starred || o.starred;
            deletes.push(o.id);
          });
          updates.push({ id: keep.id, next: keep });
        });
        openReview({ updates, deletes }, 'merge');
      };
    });
  }

  function loadQueue() { return load('cf.queue', null); }
  function saveQueue(q) { try { if (q) localStorage.setItem('cf.queue', JSON.stringify(q)); else localStorage.removeItem('cf.queue'); } catch (e) { toast('Storage is full'); } }

  function msgLink(channel, phone, msg) {
    const intl = F.styleNumber(phone, 'intl');
    const digits = intl.replace('+', '');
    if (channel === 'whatsapp') return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(msg);
    if (channel === 'signal') return 'https://signal.me/#p/+' + digits;
    return 'sms:' + intl + '?body=' + encodeURIComponent(msg);
  }

  function openMessages(ids) {
    let draft = { template: '', channel: CAN_TEL ? 'sms' : 'whatsapp' };
    const existing = loadQueue();
    let q = ids && ids.length ? null : existing;
    const recips = () => (ids || []).map(id => byId.get(id)).filter(e => e && e.c.phones.length).map(e => e.c);
    openScreen('messages-screen', el => {
      if (q) {
        const list = q.ids.map(id => byId.get(id)).filter(Boolean).map(e => e.c);
        const done = q.index >= list.length;
        const c = list[q.index];
        const msg = c ? fillTokens(q.template, c, q.index + 1, true) : '';
        el.innerHTML = `<div class="screen-inner">
          ${headHTML(t('messages'))}
          <div class="progress"><span style="width:${list.length ? Math.round(Math.min(q.index, list.length) / list.length * 100) : 100}%"></span></div>
          <p class="sub" style="text-align:center">${esc(t('queueOf', Math.min(q.index + 1, list.length), list.length))}</p>
          ${done ? `<div class="card queue-card"><div class="who">${esc(t('finished'))}</div><p class="sub">${esc(t('nContacts', list.length))}</p>
            <button class="btn btn-dark btn-sm" data-reset>${esc(t('resetQueue'))}</button></div>` :
            `<div class="card queue-card">${avatarHTML(c, 'lg')}<div class="who" style="margin-top:12px">${esc(c.name || c.phones[0])}</div>
              <div class="num">${esc(c.phones[0])}</div><div class="msg">${esc(msg)}</div>
              <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                <button class="btn btn-ghost btn-sm" data-skip>${esc(t('skip'))}</button>
                <button class="btn btn-accent btn-sm" data-open>${icon(q.channel === 'whatsapp' ? 'fa-comment' : 'fa-paper-plane')} ${esc(t('openApp'))} · ${esc(t(q.channel))}</button>
              </div></div>`}
          <div style="text-align:center;margin-top:16px"><button class="text-btn accent" data-reset>${esc(t('resetQueue'))}</button></div>
        </div>`;
        bindClose(el);
        $$('[data-reset]', el).forEach(b => { b.onclick = () => { saveQueue(null); q = null; if (!recips().length) closeScreens(1); else el._build(); }; });
        const sk = $('[data-skip]', el);
        if (sk) sk.onclick = () => { q.index++; saveQueue(q); el._build(); };
        const op = $('[data-open]', el);
        if (op) op.onclick = () => {
          if (q.channel === 'signal') copyText(msg);
          const link = msgLink(q.channel, c.phones[0], msg);
          if (link.startsWith('http')) window.open(link, '_blank', 'noopener'); else location.href = link;
          q.index++; saveQueue(q); setTimeout(() => el._build(), 300);
        };
        return;
      }
      const list = recips();
      el.innerHTML = `<div class="screen-inner">
        ${headHTML('')}
        <h1 class="big-title">${esc(t('messages'))}</h1>
        <p class="sub">${esc(t('msgSub'))}</p>
        ${existing && existing.index < existing.ids.length ? `<button class="btn btn-ghost btn-sm" data-resume style="margin-top:10px">${icon('fa-play')} ${esc(t('resumeQueue'))} · ${esc(t('queueOf', existing.index + 1, existing.ids.length))}</button>` : ''}
        <div class="section-label">${esc(t('recipients'))} · ${list.length}</div>
        ${list.length ? `<div>${list.slice(0, 30).map(c => `<span class="tag">${esc(c.name || c.phones[0])}</span>`).join('')}${list.length > 30 ? `<span class="tag">+${list.length - 30}</span>` : ''}</div>` : `<p class="hint">${esc(t('noRecipients'))}</p>`}
        <div class="section-label">${esc(t('template'))}</div>
        <textarea class="field-area" id="msg-template" placeholder="${esc(t('templatePh'))}">${esc(draft.template)}</textarea>
        <div class="token-row">${['{first}', '{last}', '{name}', '{alias}', '{company}'].map(tk => `<button data-tok="${tk}">${tk}</button>`).join('')}</div>
        ${list[0] ? `<div class="section-label">${esc(t('preview'))}</div><div class="card" style="padding:14px 16px;white-space:pre-wrap" id="msg-preview"></div>` : ''}
        <div class="section-label">${esc(t('channel'))}</div>
        <div class="segmented">${['sms', 'whatsapp', 'signal'].filter(ch => CAN_TEL || ch !== 'sms').map(ch => `<button class="seg ${draft.channel === ch ? 'on' : ''}" data-ch="${ch}">${esc(t(ch))}</button>`).join('')}</div>
        ${list.length > 1 && CAN_TEL ? `<div class="section-label">${esc(t('groupSms'))}</div><div class="warn">${icon('fa-triangle-exclamation')} ${esc(t('groupSmsWarn'))}</div>
          <button class="btn btn-ghost btn-sm" data-group style="margin-top:10px">${icon('fa-users')} ${esc(t('groupSms'))}</button>` : ''}
      </div>
      <footer class="screen-foot"><div class="inner"><button class="btn btn-dark" data-start ${list.length ? '' : 'disabled'}>${icon('fa-play')} ${esc(t('startQueue'))}</button></div></footer>`;
      bindClose(el);
      const ta = $('#msg-template', el);
      const pv = () => { const p = $('#msg-preview', el); if (p) p.textContent = fillTokens(draft.template || '…', list[0], 1, true); };
      pv();
      ta.oninput = () => { draft.template = ta.value; pv(); };
      $$('[data-tok]', el).forEach(b => { b.onclick = () => { const s = ta.selectionStart || ta.value.length; ta.value = ta.value.slice(0, s) + b.dataset.tok + ta.value.slice(s); draft.template = ta.value; pv(); ta.focus(); }; });
      $$('[data-ch]', el).forEach(b => { b.onclick = () => { draft.template = ta.value; draft.channel = b.dataset.ch; el._build(); }; });
      const rs = $('[data-resume]', el);
      if (rs) rs.onclick = () => { q = existing; el._build(); };
      const gb = $('[data-group]', el);
      if (gb) gb.onclick = () => { location.href = 'sms:' + list.map(c => F.styleNumber(c.phones[0], 'intl')).join(',') + '?body=' + encodeURIComponent(draft.template.replace(/\{[a-z]+\}/g, '').trim()); };
      $('[data-start]', el).onclick = () => {
        draft.template = ta.value;
        if (!draft.template.trim()) { ta.focus(); return; }
        q = { ids: list.map(c => c.id), template: draft.template, channel: draft.channel, index: 0 };
        saveQueue(q);
        el._build();
      };
    });
  }

  const THEME_ICON = { system: 'fa-circle-half-stroke', light: 'fa-sun', dark: 'fa-moon' };

  function cycleTheme() {
    const order = ['system', 'light', 'dark'];
    settings.theme = order[(order.indexOf(settings.theme) + 1) % 3];
    saveSettings();
    const root = document.documentElement;
    root.classList.add('theme-fade');
    applyTheme();
    renderTop();
    setTimeout(() => root.classList.remove('theme-fade'), 350);
  }

  function applyTheme() {
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    metas.forEach((m, i) => { if (i) m.remove(); else m.removeAttribute('media'); });
    if (metas[0]) metas[0].content = dark ? '#141210' : '#F6F1E8';
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  const LICENSES = [
    ['Contact Flow', 'MIT License'],
    ['Manrope', 'SIL Open Font License 1.1 — © 2019 The Manrope Project Authors'],
    ['Instrument Serif', 'SIL Open Font License 1.1 — © 2022 The Instrument Serif Project Authors'],
    ['IBM Plex Sans Arabic', 'SIL Open Font License 1.1 — © IBM Corp.'],
    ['Font Awesome Free', 'Icons CC BY 4.0, code MIT'],
    ['SheetJS Community Edition', 'Apache License 2.0'],
    ['pinyin-pro', 'MIT License']
  ];

  function openSettings() {
    const el = openScreen('settings-screen', el => {
      const q = loadQueue();
      el.innerHTML = `<div class="screen-inner">
        ${headHTML('')}
        <h1 class="big-title">${esc(t('settings'))}</h1>
        <div class="section-label">${esc(t('theme'))}</div>
        <div class="segmented">${['system', 'light', 'dark'].map(th => `<button class="seg ${settings.theme === th ? 'on' : ''}" data-theme="${th}">${esc(t('theme' + th[0].toUpperCase() + th.slice(1)))}</button>`).join('')}</div>
        <div class="section-label">${esc(t('language'))}</div>
        <div class="segmented"><button class="seg ${window.CFI18n.lang === 'en' ? 'on' : ''}" data-lang="en">English</button><button class="seg ${window.CFI18n.lang === 'ar' ? 'on' : ''}" data-lang="ar">العربية</button></div>
        <div class="section-label">${esc(t('layout'))}</div>
        <div class="segmented">${['auto', 'narrow', 'wide'].map(l => `<button class="seg ${settings.layout === l ? 'on' : ''}" data-layout="${l}">${esc(t('layout_' + l))}</button>`).join('')}</div>
        <div class="section-label">${esc(t('tools'))}</div>
        <div class="card settings-list">
          <button class="settings-row" data-go="history">${icon('fa-clock-rotate-left', 'lead')}<span class="grow">${esc(t('history'))}</span><span class="trail">${historyLog.filter(h => !h.undone).length}</span></button>
          <button class="settings-row" data-go="dups">${icon('fa-code-merge', 'lead')}<span class="grow">${esc(t('findDuplicates'))}</span></button>
          <button class="settings-row" data-go="batch">${icon('fa-table-list', 'lead')}<span class="grow">${esc(t('batchEdit'))}</span></button>
          ${q ? `<button class="settings-row" data-go="queue">${icon('fa-comment-dots', 'lead')}<span class="grow">${esc(t('messageQueue'))}</span><span class="trail">${esc(t('queueOf', Math.min(q.index + 1, q.ids.length), q.ids.length))}</span></button>` : ''}
          <button class="settings-row" data-go="import">${icon('fa-file-import', 'lead')}<span class="grow">${esc(t('import'))}</span></button>
          <button class="settings-row danger" data-go="clear" ${contacts.length ? '' : 'disabled style="opacity:.4"'}>${icon('fa-trash-can', 'lead')}<span class="grow">${esc(t('clearLibrary'))}</span></button>
        </div>
        <div class="section-label">${esc(t('about'))}</div>
        <div class="card app-about"><img src="images/icon-192.png" alt=""><div><b>${esc(t('brand'))}</b><span class="sub">${esc(t('version'))} ${VERSION} · Web</span><div class="sub" style="font-style:italic">${esc(t('tagline'))}</div></div></div>
        <div class="card note-box" style="margin-top:10px">${icon('fa-mobile-screen')}<span>${esc(t('webNote'))}</span></div>
        <div class="card note-box" style="margin-top:10px">${icon('fa-lock')}<span><b>${esc(t('privacy'))}</b><br>${esc(t('privacyBody'))}</span></div>
        <div class="section-label">${esc(t('whatsNew'))}</div>
        <div class="card changelog" style="padding:4px 18px 16px">${window.CFI18n.changelog().map(([h, items]) => `<h5>${esc(h)}</h5><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}</div>
        <div class="section-label">${esc(t('licenses'))}</div>
        <div class="card settings-list">${LICENSES.map(([n, l]) => `<div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:2px"><span>${esc(n)}</span><span class="trail">${esc(l)}</span></div>`).join('')}</div>
      </div>`;
      bindClose(el);
      $$('[data-theme]', el).forEach(b => { b.onclick = () => { settings.theme = b.dataset.theme; saveSettings(); applyTheme(); renderTop(); el._build(); }; });
      $$('[data-layout]', el).forEach(b => { b.onclick = () => { settings.layout = b.dataset.layout; saveSettings(); applyLayout(); el._build(); }; });
      $$('[data-lang]', el).forEach(b => { b.onclick = () => { setLang(b.dataset.lang); rerenderEverything(); }; });
      $$('[data-go]', el).forEach(b => {
        b.onclick = () => {
          const g = b.dataset.go;
          if (g === 'history') openHistory();
          if (g === 'dups') openDuplicates();
          if (g === 'batch') openBatch();
          if (g === 'queue') openMessages(null);
          if (g === 'import') openImport();
          if (g === 'clear') confirmDialog(t('clearConfirm'), t('confirmDeleteBody'), t('delete'), () => { commit('clear', { deletes: contacts.map(c => c.id) }); }, true);
        };
      });
    });
    el._live = true;
  }

  const ACT_ICON = { add: 'fa-user-plus', edit: 'fa-pen', delete: 'fa-trash-can', import: 'fa-file-import', sync: 'fa-arrows-rotate', batch: 'fa-table-list', merge: 'fa-code-merge', star: 'fa-star', group: 'fa-user-group', clear: 'fa-trash-can' };

  function openHistory() {
    const el = openScreen('history-screen', el => {
      el.innerHTML = `<div class="screen-inner">
        ${headHTML('')}
        <h1 class="big-title">${esc(t('history'))}</h1>
        <p class="sub">${esc(t('historySub'))}</p>
        <div style="margin-top:14px">${historyLog.length ? historyLog.map(h => `<div class="history-item ${h.undone ? 'undone' : ''}">
          <span class="ico">${icon(ACT_ICON[h.action] || 'fa-circle')}</span>
          <div class="grow"><b>${esc(t('act_' + h.action))}</b><small>${esc(t('nAffected', h.count))} · ${esc(timeAgo(h.ts))}${h.undone ? ' · ' + esc(t('undoneLbl')) : ''}</small></div>
          ${h.before.some(b => b.data) ? `<button class="icon-btn" data-bk="${h.id}" aria-label="${esc(t('backup'))}" title="${esc(t('backup'))}">${icon('fa-file-arrow-down')}</button>` : ''}
          ${h.undone ? '' : `<button class="btn btn-ghost btn-sm" data-undo="${h.id}">${icon('fa-rotate-left')} ${esc(t('undo'))}</button>`}
        </div>`).join('') : `<div class="empty-state"><div class="big">${esc(t('noHistory'))}</div></div>`}</div>
      </div>`;
      bindClose(el);
      $$('[data-undo]', el).forEach(b => { b.onclick = () => undo(b.dataset.undo); });
      $$('[data-bk]', el).forEach(b => {
        b.onclick = () => {
          const h = historyLog.find(x => x.id === b.dataset.bk);
          const vcf = h.before.filter(x => x.data).map(x => F.vcardOf(x.data)).join('\r\n') + '\r\n';
          const d = new Date(h.ts);
          shareFile(`backup-${h.action}-${d.toISOString().slice(0, 16).replace(/[-:T]/g, '')}.vcf`, vcf, 'text/vcard');
        };
      });
    });
    el._live = true;
  }

  function bindLibrary() {
    const input = $('#search-input');
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const v = input.value;
        await ensureFilled();
        if (v !== input.value) return;
        state.query = v;
        renderLibrary();
      }, index.length > 20000 ? 140 : 70);
    });
    $('#search-clear').onclick = e => { e.preventDefault(); input.value = ''; state.query = ''; renderLibrary(); input.focus(); };
    $('#contact-list').addEventListener('click', e => {
      const row = e.target.closest('.contact-row[data-id]');
      if (!row) return;
      const id = row.dataset.id;
      if (e.target.closest('[data-sel]') || state.selected.size) {
        state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
        selectionChanged();
        return;
      }
      openDetail(id);
    });
    let pressTimer = null;
    $('#contact-list').addEventListener('pointerdown', e => {
      const row = e.target.closest('.contact-row[data-id]');
      if (!row) return;
      pressTimer = setTimeout(() => { state.selected.add(row.dataset.id); selectionChanged(); pressTimer = 'fired'; }, 520);
    });
    const cancelPress = () => { if (pressTimer && pressTimer !== 'fired') clearTimeout(pressTimer); };
    ['pointerup', 'pointerleave', 'pointercancel', 'scroll'].forEach(ev => $('#contact-list').addEventListener(ev, cancelPress, true));
    $('#contact-list').addEventListener('click', e => { if (pressTimer === 'fired') { e.stopImmediatePropagation(); pressTimer = null; } }, true);
    $('#az-rail').addEventListener('click', e => { const s = e.target.closest('[data-l]'); if (s) jumpToLetter(s.dataset.l); });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { applyLayout(); onScroll(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if ($('#overlays').children.length) { $('#overlays').lastElementChild.remove(); return; }
        if (stack.length) { closeScreens(1); return; }
        if (wide && state.detailId) { closeDetail(); return; }
        if (state.selected.size) { state.selected.clear(); renderLibrary(); }
      }
      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement.classList.contains('contact-row')) { e.preventDefault(); document.activeElement.click(); return; }
      const ae = document.activeElement;
      const typing = ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && ae.id !== 'search-input');
      if (wide && !stack.length && !typing && state.visible.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const cur = state.detailId ? state.visible.findIndex(x => x.c.id === state.detailId) : -1;
        const next = Math.max(0, Math.min(state.visible.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
        openDetail(state.visible[next].c.id);
        revealIndex(next);
        return;
      }
      if (e.key === '/' && !stack.length && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); input.focus(); }
    });
    if (channel) channel.onmessage = async () => { await loadData(); await reindexFull(); renderLibrary(); };
  }

  async function init() {
    history.replaceState({ cf: 0 }, '');
    setLang(window.CFI18n.lang);
    applyTheme();
    applyLayout();
    renderTop();
    bindLibrary();
    $('#library-stats').textContent = t('indexing');
    try { await loadData(); } catch (e) { console.warn(e); toast('Storage unavailable'); }
    await reindexFull(p => { $('#library-stats').textContent = t('indexing') + ' ' + Math.round(p * 100) + '%'; });
    renderLibrary();
    ensureFilled();
    const params = new URLSearchParams(location.search);
    if (params.has('sample') && !contacts.length) loadSample();
    if (params.get('lang')) { setLang(params.get('lang')); rerenderEverything(); }
    const opener = { batch: openBatch, export: () => openExport(scopeList()), dups: openDuplicates, settings: openSettings, import: openImport }[params.get('open')];
    if (opener) opener();
    if (params.get('q')) { $('#search-input').value = params.get('q'); state.query = params.get('q'); renderLibrary(); }
    window.CF = { get contacts() { return contacts; }, openImportReview, openExport, openBatch, openDuplicates, openSettings, openHistory, openMessages, openDetail, loadSample, search: q => S.search(q, index) };
  }

  init();
})();
