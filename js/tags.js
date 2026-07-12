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

// path → 自動 tag：除檔名外每一層資料夾各成一個 tag（§4）；同一路徑重複的資料夾名去重（§3）。
// 關閉開關＝不 parse 路徑、立即無 tag（§4a）；URL 條目無自動 tag。
function autoTags(it) {
  if (it.kind === "url" || !foldertagOn()) return [];
  const segs = (it.path || it.name).split("/").slice(0, -1);
  const seen = new Set(), out = [];
  for (const s of segs) { const k = tagKey(s); if (!seen.has(k)) { seen.add(k); out.push(s); } }
  return out;
}

// 「有子資料夾」判準（§4a／T17）：掃描結果存在 path 含資料夾層的檔案（空子資料夾不算）
const hasSubfolderFiles = () => items.some(it => (it.path || it.name).includes("/"));

// 卡片上的 tag（§11.4 分級顯示）：展開整排（full）與彙整一顆（brief）兩種 DOM 都渲染，
// CSS 依 .size-* 與 (hover:none) 顯示其一，切換檢視大小時不重建卡片。
function cardTagsHTML(it) {
  const tags = autoTags(it);
  if (!tags.length) return "";
  const full = tags.map(t => `<span class="ctag">#${escapeHtml(t)}</span>`).join("");
  const more = tags.length > 1 ? ` <span class="more">+${tags.length - 1}</span>` : "";
  return `<div class="card-tags full">${full}</div>` +
         `<div class="card-tags brief"><span class="ctag">#${escapeHtml(tags[0])}${more}</span></div>`;
}

// 開關切換後重算既有卡片的 chips（卡片 DOM 只建一次，見 gallery.js ensureCards）
function refreshCardTags() {
  for (const it of items) {
    if (!it._card) continue;
    const txt = it._card.querySelector(".label .txt");
    txt.querySelectorAll(".card-tags").forEach(n => n.remove());
    txt.insertAdjacentHTML("beforeend", cardTagsHTML(it));
  }
}

// 寫入偏好＋立即生效（§11.2：切換即重算，無需重新整理）。
// wlib:foldertag 事件給 onboarding「資料夾標籤」步驟當推進掛鉤（onboarding-spec §9.6）。
function setFoldertag(on) {
  try { localStorage.setItem(FOLDERTAG_KEY, on ? "on" : "off"); } catch (_) {}
  applyFoldertag();
  document.dispatchEvent(new Event("wlib:foldertag"));
}
// 生效總入口：開關列 UI＋卡片 chips（篩選區於後續 commit 接上）
function applyFoldertag() {
  updateFoldertagUI();
  refreshCardTags();
}
