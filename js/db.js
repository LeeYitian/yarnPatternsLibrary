/* =====================================================================
   db.js — 迷你 IndexedDB 包裝
   thumbs（封面快取）與 kv（清單／資料夾把手／URL 快取）兩個 store。
   ===================================================================== */
// ---------- 迷你 IndexedDB ----------
const DB = (() => {
  let p;
  const STORES = ["thumbs", "kv"];
  const ensureStores = db => STORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); });
  const hasStores = db => STORES.every(s => db.objectStoreNames.contains(s));
  // 不指定版本開啟：沿用瀏覽器現有版本，避免「舊資料庫版本較新 → open 直接失敗 → 每次都要重選資料夾」。
  // 若現有資料庫缺少需要的 store，再升一版補建。
  const open = () => (p ||= new Promise((res, rej) => {
    const r = indexedDB.open("weaving-lib");
    r.onupgradeneeded = () => ensureStores(r.result);
    r.onblocked = () => console.warn("[lib] IndexedDB 被其他分頁鎖住，請關閉其他開著本頁的分頁。");
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const db = r.result;
      if (hasStores(db)) return res(db);
      const v = db.version + 1; db.close();                 // 缺 store：升版補建
      const r2 = indexedDB.open("weaving-lib", v);
      r2.onupgradeneeded = () => ensureStores(r2.result);
      r2.onerror = () => rej(r2.error);
      r2.onsuccess = () => res(r2.result);
    };
  }));
  const tx = async (store, mode, fn) => { const db = await open();
    return new Promise((res, rej) => { const t = db.transaction(store, mode); const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error); }); };
  return { get: (s, k) => tx(s, "readonly", o => o.get(k)), set: (s, k, v) => tx(s, "readwrite", o => o.put(v, k)), del: (s, k) => tx(s, "readwrite", o => o.delete(k)), clear: (s) => tx(s, "readwrite", o => o.clear()) };
})();
