/* =====================================================================
   tags.js — 標籤系統（tag-spec.md）
   自動 tag＝檔案當前路徑的純函數（掃描結果現算、不落地，spec §3）；
   folder→tag 開關（wlib-foldertag 持久偏好，§4a）；卡片 chips 重算。
   ===================================================================== */
const FOLDERTAG_KEY = "wlib-foldertag";

// 偏好三態："on"／"off"／null（null＝尚未詢問，行為同 off；onboarding 詢問靠這個分辨）
const foldertagPref = () => { try { return localStorage.getItem(FOLDERTAG_KEY); } catch (_) { return null; } };
const foldertagOn = () => foldertagPref() === "on";

// 比對用正規化 key（§5）：小寫 + Unicode NFC。畫面顯示一律保留原樣。
const tagKey = s => s.normalize("NFC").toLowerCase();

// tag 欄位字串 → 陣列（links.md／files.md 共用，§5／§6）：空白分隔、strip 前導 #、去空、正規化 key 去重（保留原樣）。
function parseTagField(val) {
  const seen = new Set(), out = [];
  for (const raw of String(val || "").split(/\s+/)) {
    const t = raw.replace(/^#+/, "").trim();
    if (!t) continue;
    const k = tagKey(t);
    if (!seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out;
}

// path → 自動 tag：除檔名外每一層資料夾各成一個 tag（§4）；同一路徑重複的資料夾名去重（§3）。
// 關閉開關＝不 parse 路徑、立即無 tag（§4a）；URL 條目無自動 tag。
function autoTags(it) {
  if (it.kind === "url" || !foldertagOn()) return [];
  const segs = (it.path || it.name).split("/").slice(0, -1);
  const seen = new Set(), out = [];
  for (const s of segs) { const k = tagKey(s); if (!seen.has(k)) { seen.add(k); out.push(s); } }
  return out;
}

// 手動 tag（§6）：本機查 filesMap（key＝相對路徑，files.md 真相的顯示副本）、URL 讀條目的 tags（links.md）。
// 與自動 tag 無耦合：自動現算、手動落地（§3）。
function manualTags(it) {
  if (it.kind === "url") return it.tags || [];
  return filesMap.get(it.path || it.name) || [];
}
// 某項最終顯示的 tag ＝ union(自動, 手動)（§7.1）：正規化 key 去重、自動在前手動在後。
// 純為「有哪些 tag」的清單；顯示樣式（自動綠框／手動藍實心、手動優先）由 tagsOfDetailed 分類（§11.6.4，第二期 UI）。
function tagsOf(it) {
  const seen = new Set(), out = [];
  for (const t of autoTags(it))   { const k = tagKey(t); if (!seen.has(k)) { seen.add(k); out.push(t); } }
  for (const t of manualTags(it)) { const k = tagKey(t); if (!seen.has(k)) { seen.add(k); out.push(t); } }
  return out;
}
// 含來源分類的顯示清單（§7.3／§11.6.4）：回傳 [{name（原樣）, manual}]，自動在前手動在後、去重。
// 同 key 既自動又手動 → 手動優先（manual:true，顯示藍實心，T25）。
function tagsOfDetailed(it) {
  const manualKeys = new Set(manualTags(it).map(tagKey));
  const seen = new Set(), out = [];
  for (const t of autoTags(it)) {
    const k = tagKey(t); if (seen.has(k)) continue; seen.add(k);
    out.push({ name: t, manual: manualKeys.has(k) });
  }
  for (const t of manualTags(it)) {
    const k = tagKey(t); if (seen.has(k)) continue; seen.add(k);
    out.push({ name: t, manual: true });
  }
  return out;
}

// 「有子資料夾」判準（§4a／T17）：掃描結果存在 path 含資料夾層的檔案（空子資料夾不算）
const hasSubfolderFiles = () => items.some(it => (it.path || it.name).includes("/"));

// 卡片上的 tag（§11.4 分級顯示）：展開整排（full）與彙整一顆（brief）兩種 DOM 都渲染，
// CSS 依 .size-* 與 (hover:none) 顯示其一，切換檢視大小時不重建卡片。
function cardTagsHTML(it) {
  const tags = tagsOfDetailed(it);           // union(自動, 手動)；自動綠框、手動藍實心，一律純顯示不帶 ×（T26）
  if (!tags.length) return "";
  const chip = (t, extra = "") => `<span class="ctag${t.manual ? " manual" : ""}">#${escapeHtml(t.name)}${extra}</span>`;
  const full = tags.map(t => chip(t)).join("");
  const more = tags.length > 1 ? ` <span class="more">+${tags.length - 1}</span>` : "";
  return `<div class="card-tags full">${full}</div>` +
         `<div class="card-tags brief">${chip(tags[0], more)}</div>`;   // lead 取首顆（自動在前、手動在後）
}

// 開關切換／手動 tag 編輯後重算既有卡片的 chips（卡片 DOM 只建一次，見 gallery.js ensureCards）
function refreshCardTags() {
  for (const it of allItems()) {
    if (!it._card) continue;
    const txt = it._card.querySelector(".label .txt");
    txt.querySelectorAll(".card-tags").forEach(n => n.remove());
    txt.insertAdjacentHTML("beforeend", cardTagsHTML(it));
  }
}

// ---------- 篩選（§7）----------
// 已選 tag 的正規化 key。session-only、不持久化（T12，比照搜尋字）。
let selectedTags = new Set();

// 全庫 tag 統計：正規化 key → { display: 出現次數較多的原樣（平手取先掃到，T11）, count }
function tagStats() {
  const m = new Map();
  for (const it of allItems()) {                    // 含 URL：手動 tag 上線後 URL 也可能有 tag（§11.6.4）
    for (const d of tagsOfDetailed(it)) {
      const k = tagKey(d.name);
      let e = m.get(k);
      if (!e) { e = { count: 0, forms: new Map(), manual: false }; m.set(k, e); }
      e.count++;
      e.forms.set(d.name, (e.forms.get(d.name) || 0) + 1);
      if (d.manual) e.manual = true;                // 任一項為手動 → badge 手動優先（藍實心，§11.6.4）
    }
  }
  return [...m.entries()].map(([key, e]) => {
    let display, best = -1;
    for (const [form, c] of e.forms) if (c > best) { best = c; display = form; }
    return { key, display, count: e.count, manual: e.manual };
  }).sort((a, b) => b.count - a.count || a.display.localeCompare(b.display, "zh-Hant"));   // 次數多→少（§11.3）
}

// 篩選區 tag badge 重繪：items／開關變動後呼叫；同時清掉已不存在的選取
function renderFilterbar() {
  const stats = tagStats();
  const alive = new Set(stats.map(s => s.key));
  for (const k of [...selectedTags]) if (!alive.has(k)) selectedTags.delete(k);
  const wrap = $("fbTags");
  wrap.innerHTML = "";
  for (const s of stats) {
    const b = document.createElement("button");
    b.type = "button";
    const sel = selectedTags.has(s.key);
    b.className = "tag" + (s.manual ? " manual" : "") + (sel ? " sel" : "");   // 手動優先藍實心（§11.6.4）
    b.innerHTML = (sel ? SVG_CHECK : "") + `#${escapeHtml(s.display)}`;
    b.onclick = () => {
      selectedTags.has(s.key) ? selectedTags.delete(s.key) : selectedTags.add(s.key);
      renderFilterbar(); applyFilter();
    };
    wrap.appendChild(b);
  }
  $("filterbar").classList.toggle("no-tags", !stats.length);   // 無自動 tag → 整條只留搜尋欄（§11.3）
  const n = selectedTags.size;
  $("fbClear").textContent = `清除 ${n}`;
  $("fbClear").style.display = n ? "" : "none";                // 選中 ≥1 才顯示
}
$("fbClear").onclick = () => { selectedTags.clear(); renderFilterbar(); applyFilter(); };

// 寫入偏好＋立即生效（§11.2：切換即重算，無需重新整理）。
// wlib:foldertag 事件給 onboarding「資料夾標籤」步驟當推進掛鉤（onboarding-spec §9.6）。
function setFoldertag(on) {
  try { localStorage.setItem(FOLDERTAG_KEY, on ? "on" : "off"); } catch (_) {}
  applyFoldertag();
  document.dispatchEvent(new Event("wlib:foldertag"));
}
// 生效總入口：開關列 UI＋卡片 chips＋篩選區（關閉時 renderFilterbar 會順帶清空已選 tag，T12）
function applyFoldertag() {
  updateFoldertagUI();
  refreshCardTags();
  renderFilterbar();
  applyFilter();
}
