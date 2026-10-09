window.CFFormats = (() => {
  const S = window.CFSearch;

  const HEADERS = {
    id: ['contact_id', 'contact id', 'contactid', 'id', 'uid'],
    name: ['name', 'full name', 'fullname', 'display name', 'contact', 'contact name', 'الاسم', 'اسم', 'الاسم الكامل', '姓名', '名字', '名称', '联系人', 'nombre', 'nombre completo', 'nom', 'nom complet', 'nome'],
    first: ['first name', 'given name', 'firstname', 'first', 'givenname', 'الاسم الاول', '名', 'nombre de pila', 'prenom'],
    last: ['last name', 'family name', 'surname', 'lastname', 'last', 'familyname', 'اسم العائله', 'العائله', '姓', 'apellido', 'apellidos', 'nom de famille'],
    phone: ['phone', 'phone number', 'phones', 'mobile', 'mobile phone', 'mobile number', 'cell', 'cell phone', 'tel', 'telephone', 'number', 'numbers', 'msisdn', 'whatsapp', 'رقم', 'الرقم', 'الهاتف', 'هاتف', 'الجوال', 'جوال', 'رقم الهاتف', 'رقم الجوال', 'موبايل', '电话', '手机', '号码', '手机号', '电话号码', 'telefono', 'movil', 'celular', 'telephone portable', 'portable', 'numero'],
    email: ['email', 'e-mail', 'emails', 'mail', 'e-mail address', 'email address', 'البريد', 'البريد الالكتروني', 'ايميل', '邮箱', '电子邮件', '邮件', 'correo', 'correo electronico', 'courriel', 'adresse e-mail'],
    company: ['company', 'organization', 'organisation', 'org', 'business', 'employer', 'الشركه', 'شركه', 'جهه العمل', '公司', '单位', 'empresa', 'entreprise', 'societe'],
    note: ['note', 'notes', 'comment', 'comments', 'remark', 'ملاحظه', 'ملاحظات', '备注', 'nota', 'notas', 'remarque', 'remarques'],
    alias: ['alias', 'aliases', 'nickname', 'nicknames', 'aka', 'also known as', 'اسم بديل', 'اسماء بديله', 'لقب', 'كنيه', 'الكنيه', '别名', '昵称', 'apodo', 'alias', 'surnom']
  };

  const PHONE_RE = /\+?\(?\d[\d\s\-().\u00a0]{4,}\d/g;

  function digitCount(s) { return (S.latinDigits(s).match(/\d/g) || []).length; }
  function isPhoneLike(s) { s = S.latinDigits(String(s || '')).trim(); return /^[+(]?[\d\s\-().\u00a0/]+$/.test(s) && digitCount(s) >= 5; }
  function isEmailLike(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim()); }

  function cleanHeader(h) {
    return S.fold(String(h || '')).replace(/\s*-\s*(value|valor|valeur)$/, '').replace(/[0-9#:*]+/g, ' ').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function headerKind(h) {
    const c = cleanHeader(h);
    if (!c) return null;
    if (/(type|label|etiquette|tipo)$/.test(c)) return 'skip';
    for (const k of Object.keys(HEADERS)) if (HEADERS[k].includes(c)) return k;
    if (/(phone|mobile|tel|cell|رقم|هاتف|جوال|电话|手机|号码|telefono|movil)/.test(c)) return 'phone';
    if (/(mail|بريد|邮)/.test(c)) return 'email';
    if (/(company|organi[sz]ation|شرك|公司)/.test(c)) return 'company';
    if (/(nick|alias|别名|昵称)/.test(c)) return 'alias';
    if (/(name|الاسم|姓名|nombre|\bnom\b)/.test(c)) return 'name';
    return null;
  }

  function parseCSV(text) {
    text = String(text).replace(/^\ufeff/, '');
    const first = text.slice(0, 20000).split(/\r?\n/).slice(0, 5).join('\n');
    const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
    let inQ = false;
    for (const ch of first) { if (ch === '"') inQ = !inQ; else if (!inQ && ch in counts) counts[ch]++; }
    const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }

  function splitMulti(v, re) {
    return String(v == null ? '' : v).split(re).map(x => x.trim()).filter(Boolean);
  }

  function rowsToContacts(rows) {
    rows = rows.map(r => r.map(c => (c == null ? '' : String(c))));
    if (!rows.length) return [];
    const head = rows[0];
    let kinds = head.map(headerKind);
    let hasHeader = kinds.filter(k => k && k !== 'skip').length >= 1 && !head.some(isPhoneLike);
    let body = hasHeader ? rows.slice(1) : rows;
    if (!hasHeader) {
      const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
      kinds = [];
      const sample = rows.slice(0, 50);
      let nameSet = false;
      for (let c = 0; c < width; c++) {
        const vals = sample.map(r => r[c] || '').filter(v => v.trim());
        const ph = vals.filter(isPhoneLike).length, em = vals.filter(isEmailLike).length;
        if (!vals.length) kinds.push(null);
        else if (ph / vals.length > 0.6) kinds.push('phone');
        else if (em / vals.length > 0.6) kinds.push('email');
        else if (!nameSet) { kinds.push('name'); nameSet = true; }
        else kinds.push('company');
      }
    }
    const out = [];
    for (const r of body) {
      const c = { name: '', aliases: [], phones: [], emails: [], company: '', note: '' };
      let first = '', last = '';
      r.forEach((v, i) => {
        v = v.trim();
        if (!v) return;
        switch (kinds[i]) {
          case 'id': c.contact_id = v; break;
          case 'name': c.name = c.name ? c.name + ' ' + v : v; break;
          case 'first': first = v; break;
          case 'last': last = v; break;
          case 'phone': splitMulti(v, /[;|\n,]| \/ | ::: /).forEach(p => { if (digitCount(p) >= 3) c.phones.push(p); }); break;
          case 'email': splitMulti(v, /[;|\n, ]| ::: /).forEach(e => c.emails.push(e)); break;
          case 'company': c.company = c.company ? c.company + ' ' + v : v; break;
          case 'note': c.note = c.note ? c.note + '\n' + v : v; break;
          case 'alias': splitMulti(v, /[;|,،\n]/).forEach(a => c.aliases.push(a)); break;
        }
      });
      if (!c.name) c.name = [first, last].filter(Boolean).join(' ');
      if (!c.name && !c.phones.length && !c.emails.length) continue;
      out.push(c);
    }
    return out;
  }

  function decodeQP(str, charset) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      if (str[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(str.substr(i + 1, 2))) { bytes.push(parseInt(str.substr(i + 1, 2), 16)); i += 2; }
      else bytes.push(str.charCodeAt(i) & 0xff);
    }
    try { return new TextDecoder(charset || 'utf-8').decode(new Uint8Array(bytes)); } catch (e) { return new TextDecoder('utf-8').decode(new Uint8Array(bytes)); }
  }

  function unescapeV(s) {
    return s.replace(/\\n/gi, '\n').replace(/\\([,;:\\])/g, '$1');
  }

  function splitV(s, sep) {
    const out = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\' && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; }
      else if (s[i] === sep) { out.push(cur); cur = ''; }
      else cur += s[i];
    }
    out.push(cur);
    return out.map(unescapeV);
  }

  function parseVCard(text) {
    text = String(text).replace(/^\ufeff/, '').replace(/=\r?\n/g, (m, off, all) => {
      const lineStart = all.lastIndexOf('\n', off) + 1;
      return /QUOTED-PRINTABLE/i.test(all.slice(lineStart, off)) ? '' : m;
    }).replace(/\r?\n[ \t]/g, '');
    const out = [];
    let cur = null, n = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (/^BEGIN:VCARD/i.test(line)) { cur = { name: '', aliases: [], phones: [], emails: [], company: '', note: '' }; n = null; continue; }
      if (/^END:VCARD/i.test(line)) {
        if (cur) {
          if (!cur.name && n) cur.name = [n[3], n[1], n[2], n[0], n[4]].map(x => (x || '').trim()).filter(Boolean).join(' ');
          if (cur.name || cur.phones.length || cur.emails.length) out.push(cur);
        }
        cur = null; continue;
      }
      if (!cur) continue;
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const left = line.slice(0, colon);
      let value = line.slice(colon + 1);
      const parts = left.split(';');
      const prop = parts[0].replace(/^.*\./, '').toUpperCase();
      const params = parts.slice(1).join(';').toUpperCase();
      if (/QUOTED-PRINTABLE/.test(params)) {
        const cs = (params.match(/CHARSET=([^;]+)/) || [])[1];
        value = decodeQP(value, cs);
      }
      switch (prop) {
        case 'FN': cur.name = unescapeV(value).trim(); break;
        case 'N': n = splitV(value, ';'); break;
        case 'TEL': { const v = unescapeV(value).replace(/^tel:/i, '').trim(); if (v) cur.phones.push(v); break; }
        case 'EMAIL': { const v = unescapeV(value).trim(); if (v) cur.emails.push(v); break; }
        case 'ORG': cur.company = splitV(value, ';').filter(Boolean).join(' · ').trim(); break;
        case 'NOTE': cur.note = unescapeV(value).trim(); break;
        case 'NICKNAME': splitV(value, ',').map(x => x.trim()).filter(Boolean).forEach(a => cur.aliases.push(a)); break;
        case 'X-CONTACT-ID': cur.contact_id = value.trim(); break;
      }
    }
    return out;
  }

  function asList(v, key) {
    if (v == null || v === '') return [];
    if (Array.isArray(v)) return v.map(x => (typeof x === 'object' && x ? (x[key] || x.value || x.number || x.address || x.name || '') : x)).map(String).map(s => s.trim()).filter(Boolean);
    return splitMulti(v, /[;|\n]/);
  }

  function parseJSON(text) {
    let data = JSON.parse(String(text).replace(/^\ufeff/, ''));
    if (!Array.isArray(data)) data = data.contacts || data.data || data.items || [data];
    return data.filter(o => o && typeof o === 'object').map(o => {
      const lower = {};
      Object.keys(o).forEach(k => { lower[k.toLowerCase()] = o[k]; });
      const g = (...ks) => { for (const k of ks) if (lower[k] != null && lower[k] !== '') return lower[k]; return null; };
      let name = g('name', 'fullname', 'full_name', 'displayname', 'display_name');
      if (name && typeof name === 'object') name = [name.first, name.last].filter(Boolean).join(' ');
      if (!name) name = [g('first', 'firstname', 'first_name', 'givenname'), g('last', 'lastname', 'last_name', 'familyname')].filter(Boolean).join(' ');
      const c = {
        name: String(name || '').trim(),
        aliases: asList(g('aliases', 'alias', 'nicknames', 'nickname'), 'name'),
        phones: asList(g('phones', 'phone', 'numbers', 'number', 'tel', 'mobile', 'phonenumbers'), 'number'),
        emails: asList(g('emails', 'email', 'mail'), 'address'),
        company: String(g('company', 'organization', 'organisation', 'org') || '').trim(),
        note: String(g('note', 'notes') || '').trim()
      };
      const id = g('contact_id', 'contactid');
      if (id) c.contact_id = String(id);
      return c;
    }).filter(c => c.name || c.phones.length || c.emails.length);
  }

  function parseTXT(text) {
    const out = [];
    for (const line of String(text).replace(/^\ufeff/, '').split(/\r?\n/)) {
      const l = S.latinDigits(line).trim();
      if (!l) continue;
      const phones = (l.match(PHONE_RE) || []).map(p => p.trim()).filter(p => digitCount(p) >= 5);
      const emails = l.match(/[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+/g) || [];
      if (!phones.length && !emails.length) continue;
      let rest = l;
      phones.concat(emails).forEach(p => { rest = rest.replace(p, ' '); });
      const name = rest.replace(/[,;:\t|<>\-–—]+/g, ' ').replace(/\s+/g, ' ').trim();
      out.push({ name, aliases: [], phones, emails, company: '', note: '' });
    }
    return out;
  }

  function detectText(text) {
    const t = String(text).replace(/^\ufeff/, '').trim();
    if (/^BEGIN:VCARD/im.test(t)) return 'vcard';
    if (/^[\[{]/.test(t)) { try { JSON.parse(t); return 'json'; } catch (e) {} }
    const firstLine = t.slice(0, 20000).split(/\r?\n/)[0] || '';
    if (/[,;\t]/.test(firstLine)) {
      const rows = parseCSV(t);
      if (rows.length && rows[0].length > 1 && (rows[0].some(h => { const k = headerKind(h); return k && k !== 'skip'; }) || rows.slice(0, 10).every(r => r.length === rows[0].length))) return 'csv';
    }
    return 'txt';
  }

  function parseText(text, kind) {
    kind = kind || detectText(text);
    if (kind === 'vcard') return { kind, contacts: parseVCard(text) };
    if (kind === 'json') return { kind, contacts: parseJSON(text) };
    if (kind === 'csv') return { kind, contacts: rowsToContacts(parseCSV(text)) };
    return { kind: 'txt', contacts: parseTXT(text) };
  }

  async function parseFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['xlsx', 'xls', 'xlsm', 'ods', 'numbers'].includes(ext)) {
      await window.CFLoad.xlsx();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      let all = [];
      for (const sn of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: '' });
        all = all.concat(rowsToContacts(rows));
      }
      return { kind: ext === 'numbers' ? 'numbers' : 'excel', contacts: all };
    }
    const text = await file.text();
    if (ext === 'vcf' || ext === 'vcard') return { kind: 'vcard', contacts: parseVCard(text) };
    if (ext === 'json') return { kind: 'json', contacts: parseJSON(text) };
    if (ext === 'csv' || ext === 'tsv') return { kind: 'csv', contacts: rowsToContacts(parseCSV(text)) };
    return parseText(text);
  }

  function styleNumber(p, style) {
    const l = S.latinDigits(p);
    if (style === 'intl') return l.replace(/^\s*00/, '+').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
    if (style === 'digits') return l.replace(/\D/g, '');
    return p;
  }

  function columns(list, o) {
    const most = k => list.reduce((m, c) => Math.max(m, (c[k] || []).length), 1);
    const maxPhones = o.everyNumber ? most('phones') : 1;
    const maxEmails = o.emails ? (o.everyNumber ? most('emails') : 1) : 0;
    const cols = [];
    if (o.contactId) cols.push(['contact_id', c => c.id]);
    cols.push(['Name', c => c.name || '']);
    if (o.aliases) cols.push(['Alias', c => (c.aliases || []).join('; ')]);
    for (let i = 0; i < maxPhones; i++) cols.push([maxPhones > 1 ? 'Phone ' + (i + 1) : 'Phone', c => styleNumber((c.phones || [])[i] || '', o.numberStyle)]);
    for (let i = 0; i < maxEmails; i++) cols.push([maxEmails > 1 ? 'Email ' + (i + 1) : 'Email', c => (c.emails || [])[i] || '']);
    if (o.company) cols.push(['Company', c => c.company || '']);
    if (o.notes) cols.push(['Note', c => c.note || '']);
    return cols;
  }

  function toRows(list, o) {
    const cols = columns(list, o);
    const rows = list.map(c => cols.map(([, f]) => f(c)));
    if (o.header) rows.unshift(cols.map(([h]) => h));
    return rows;
  }

  function csvCell(v) {
    v = String(v == null ? '' : v);
    return /[",\n\r;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function escV(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }

  function vcardOf(c, o) {
    o = o || { numberStyle: 'saved', everyNumber: true, emails: true, company: true, notes: true, aliases: true, contactId: false };
    const parts = String(c.name || '').trim().split(/\s+/);
    const given = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
    const family = parts.length > 1 ? parts[parts.length - 1] : '';
    const L = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + escV(c.name), 'N:' + escV(family) + ';' + escV(given) + ';;;'];
    if (o.aliases && (c.aliases || []).length) L.push('NICKNAME:' + c.aliases.map(a => String(a).replace(/,/g, '\\,')).join(','));
    (o.everyNumber ? c.phones || [] : (c.phones || []).slice(0, 1)).forEach(p => L.push('TEL;TYPE=CELL:' + styleNumber(p, o.numberStyle)));
    if (o.emails) (o.everyNumber ? c.emails || [] : (c.emails || []).slice(0, 1)).forEach(e => L.push('EMAIL;TYPE=INTERNET:' + e));
    if (o.company && c.company) L.push('ORG:' + escV(c.company));
    if (o.notes && c.note) L.push('NOTE:' + escV(c.note));
    if (o.contactId) L.push('X-CONTACT-ID:' + c.id);
    L.push('END:VCARD');
    return L.join('\r\n');
  }

  function exportData(list, o) {
    if (o.format === 'csv') return { mime: 'text/csv;charset=utf-8', ext: 'csv', data: '\ufeff' + toRows(list, o).map(r => r.map(csvCell).join(',')).join('\r\n') };
    if (o.format === 'vcard') return { mime: 'text/vcard;charset=utf-8', ext: 'vcf', data: list.map(c => vcardOf(c, o)).join('\r\n') + '\r\n' };
    if (o.format === 'json') {
      const arr = list.map(c => {
        const x = {};
        if (o.contactId) x.contact_id = c.id;
        x.name = c.name || '';
        if (o.aliases) x.aliases = c.aliases || [];
        x.phones = (o.everyNumber ? c.phones || [] : (c.phones || []).slice(0, 1)).map(p => styleNumber(p, o.numberStyle));
        if (o.emails) x.emails = o.everyNumber ? c.emails || [] : (c.emails || []).slice(0, 1);
        if (o.company) x.company = c.company || '';
        if (o.notes) x.note = c.note || '';
        return x;
      });
      return { mime: 'application/json', ext: 'json', data: JSON.stringify(arr, null, 2) };
    }
    if (o.format === 'txt') {
      const lines = [];
      list.forEach(c => (o.everyNumber ? c.phones || [] : (c.phones || []).slice(0, 1)).forEach(p => lines.push(o.header ? (c.name ? c.name + '\t' : '') + styleNumber(p, o.numberStyle) : styleNumber(p, o.numberStyle))));
      return { mime: 'text/plain;charset=utf-8', ext: 'txt', data: lines.join('\r\n') };
    }
    if (o.format === 'excel' || o.format === 'numbers') {
      const ws = XLSX.utils.aoa_to_sheet(toRows(list, o));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
      const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      return { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx', data: new Uint8Array(data) };
    }
    throw new Error('Unknown format');
  }

  async function exportBlob(list, o) {
    const tick = () => new Promise(r => setTimeout(r));
    const mk = (parts, mime) => ({ mime, blob: new Blob(parts, { type: mime }) });
    if (o.format === 'excel' || o.format === 'numbers') await window.CFLoad.xlsx();
    if ((o.format !== 'csv' && o.format !== 'vcard') || list.length < 5000) {
      const r = exportData(list, o);
      return mk([r.data], r.mime);
    }
    const parts = [];
    if (o.format === 'csv') {
      const cols = columns(list, o);
      let first = true;
      if (o.header) { parts.push('\ufeff' + cols.map(([h]) => csvCell(h)).join(',')); first = false; } else parts.push('\ufeff');
      for (let i = 0; i < list.length; i += 4000) {
        const lines = list.slice(i, i + 4000).map(c => cols.map(([, f]) => csvCell(f(c))).join(','));
        parts.push((first ? '' : '\r\n') + lines.join('\r\n'));
        first = false;
        await tick();
      }
      return mk(parts, 'text/csv;charset=utf-8');
    }
    for (let i = 0; i < list.length; i += 4000) {
      parts.push(list.slice(i, i + 4000).map(c => vcardOf(c, o)).join('\r\n') + '\r\n');
      await tick();
    }
    return mk(parts, 'text/vcard;charset=utf-8');
  }

  function preview(list, o) {
    const sample = list.slice(0, 4);
    if (o.format === 'excel' || o.format === 'numbers') return toRows(sample, o).map(r => r.join('  │  ')).join('\n');
    const r = exportData(sample, Object.assign({}, o, { format: o.format }));
    return String(r.data).replace(/^\ufeff/, '').split(/\r?\n/).slice(0, 14).join('\n');
  }

  return { parseFile, parseText, detectText, parseCSV, parseVCard, parseJSON, parseTXT, rowsToContacts, exportData, exportBlob, preview, vcardOf, styleNumber, isPhoneLike, digitCount };
})();
