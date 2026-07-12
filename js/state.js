/* =====================================================================
   state.js — 共用狀態與衍生 helpers
   DOM 參照、items／urls／dirHandle 等全域狀態，
   以及跨功能共用的排序鍵／顯示名稱等衍生函式。
   ===================================================================== */
const grid = $("grid"), intro = $("intro"), bar = $("bar"), empty = $("empty"), status = $("status"), dock = $("dock");
let items = [];               // 本機檔案（About.md §5，唯讀）
let urls = [];                // URL 條目（links.md，這次新增；與本機檔案並行、無耦合）
let dirHandle = null;
let sortMode = localStorage.getItem("wlib-sort") === "time" ? "time" : "name";   // "name"=檔名, "time"=時間
let sourceMode = ["all","local","url"].includes(localStorage.getItem("wlib-source")) ? localStorage.getItem("wlib-source") : "all";
const mqTouch = window.matchMedia("(hover: none), (pointer: coarse)");

// 封面快取 key 用相對路徑（子資料夾後不同資料夾可能有同名檔）；舊快取無 path → fallback 檔名，
// 頂層 path＝檔名，故既有使用者的舊封面快取 key 不變、不重畫（subfolder-spec §5）。
const thumbKey = it => `${it.path || it.name}|${it.size}|${it.lastModified}|w${THUMB_W}`;

// 本機檔案 + URL 融合在同一畫廊（render / 篩選 / 燈箱共用這份）
const allItems = () => [...items, ...urls];
// 顯示名稱：本機=檔名美化；URL=標題（留空就退回網域）
const displayName = it => it.kind === "url" ? (it.title || it._host || hostOf(it.url)) : prettyTitle(it.name);
// 統一排序鍵：檔名用顯示名、時間 URL 把 added 當天 00:00 轉時間戳（與本機 lastModified 共軸，handoff §2）
const sortKeyName = it => displayName(it);
const itemTs = it => it.kind === "url" ? addedToTs(it.added) : (it.lastModified || 0);
