window.CFLoad = (() => {
  const cache = {};
  const load = url => cache[url] || (cache[url] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = res;
    s.onerror = () => { delete cache[url]; rej(new Error('load ' + url)); };
    document.head.append(s);
  }));
  return {
    xlsx: () => (window.XLSX ? Promise.resolve() : load('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js')),
    pinyin: () => (window.pinyinPro ? Promise.resolve() : load('https://cdn.jsdelivr.net/npm/pinyin-pro@3.26.0/dist/index.js'))
  };
})();

window.CFStore = (() => {
  let db = null;
  const open = () => (db ? Promise.resolve(db) : new Promise((res, rej) => {
    const r = indexedDB.open('contact-flow', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('contacts', { keyPath: 'id' });
      r.result.createObjectStore('history', { keyPath: 'id' });
    };
    r.onsuccess = () => { db = r.result; res(db); };
    r.onerror = () => rej(r.error);
  }));
  const done = tx => new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = tx.onabort = () => rej(tx.error);
  });
  const all = async name => {
    const d = await open();
    return new Promise((res, rej) => {
      const r = d.transaction(name).objectStore(name).getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  };
  let queue = Promise.resolve();
  function save(puts, dels, entry, gone, replace) {
    const job = queue.then(async () => {
      const d = await open();
      const tx = d.transaction(['contacts', 'history'], 'readwrite');
      const cs = tx.objectStore('contacts');
      const hs = tx.objectStore('history');
      if (replace) cs.clear();
      for (const c of puts) cs.put(c);
      for (const id of dels) cs.delete(id);
      if (entry) hs.put(entry);
      for (const id of gone || []) hs.delete(id);
      return done(tx);
    });
    queue = job.catch(() => {});
    return job;
  }
  return { contacts: () => all('contacts'), history: () => all('history'), save };
})();
