/* =====================================================================
   controls.js — 頂欄與側邊 dock 控制
   按鈕接線、搜尋、設定選單、捲動收合頂欄、預覽大小／排序／來源切換。
   ===================================================================== */
$("pickBtn").onclick = () => start(true);
$("refresh").onclick = () => { closeSettings(); start(false, true); };
$("rechoose").onclick = () => { closeSettings(); rechooseFolder(); };
$("search").oninput = () => applyFilter();   // 包一層：applyFilter 定義在較晚載入的 gallery.js，直接取值會 ReferenceError
$("sizeBtn").onclick = cycleSize;
$("slideBtn").onclick = () => openViewer(0);
$("addUrlBtn").onclick = () => openDialog("add");
$("sortBtn").onclick = () => {
  sortMode = sortMode === "time" ? "name" : "time";
  localStorage.setItem("wlib-sort", sortMode);
  updateSortBtn();
  render();
};
function updateSortBtn() {
  $("sortLbl").textContent = sortMode === "time" ? "修改時間" : "檔名";
  $("sortBtn").classList.toggle("active", sortMode === "time");
  $("sortBtn").title = sortMode === "time" ? "目前：依修改時間 ／ 點擊改依檔名" : "目前：依檔名 ／ 點擊改依修改時間";
}
updateSortBtn();

// 來源篩選：全部 ／ 本機 ／ 網址（與排序正交；只加 .hidden，不重建 DOM）
$("sourceBtn").onclick = () => {
  const i = (SOURCES.findIndex(s => s[1] === sourceMode) + 1) % SOURCES.length;
  sourceMode = SOURCES[i][1];
  localStorage.setItem("wlib-source", sourceMode);
  updateSourceBtn();
  applyFilter();
};
function updateSourceBtn() {
  const cur = SOURCES.find(s => s[1] === sourceMode) || SOURCES[0];
  $("sourceLbl").textContent = cur[0];
  $("sourceBtn").classList.toggle("active", sourceMode !== "all");
}
updateSourceBtn();

// folder→tag 開關（tag-spec §4a／§11.2）：列狀態依「有無子資料夾檔案」與偏好即時反映
function updateFoldertagUI() {
  const has = hasSubfolderFiles(), on = foldertagOn();
  const sw = $("foldertagSwitch");
  $("foldertagRow").classList.toggle("disabled", !has);
  sw.disabled = !has;
  sw.classList.toggle("on", on);
  sw.setAttribute("aria-checked", String(on));
  $("foldertagSub").textContent = has ? "子資料夾名自動變成可篩選的標籤" : "目前資料夾沒有子資料夾";
}
$("foldertagSwitch").onclick = () => setFoldertag(!foldertagOn());

// 設定下拉選單
function closeSettings() {
  $("settingsList").hidden = true;
  $("settingsBtn").setAttribute("aria-expanded", "false");
}
$("settingsBtn").onclick = (e) => {
  e.stopPropagation();
  const open = $("settingsList").hidden;
  $("settingsList").hidden = !open;
  $("settingsBtn").setAttribute("aria-expanded", String(open));
};
document.addEventListener("click", (e) => {
  if (!$("settingsList").hidden && !e.target.closest(".menu")) closeSettings();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSettings(); });

// 捲動時：往下滑收起 Header，往上滑一點或回到最頂端時再顯示
let lastScrollY = 0;
window.addEventListener("scroll", () => {
  if (document.body.classList.contains("ob-active")) return;   // 教學進行中鎖捲動：頂欄不收合
  const y = window.scrollY;
  if (y <= 4) {
    bar.classList.remove("nav-hidden");          // 最頂端一律顯示
  } else if (y > lastScrollY + 4) {
    bar.classList.add("nav-hidden");             // 往下滑：收起
    closeSettings();
  } else if (y < lastScrollY - 4) {
    bar.classList.remove("nav-hidden");          // 往上滑：顯示
  }
  lastScrollY = y;
}, { passive: true });

// 預覽大小（欄數 + 裁切比例）
// 手機（≤430px）不提供「寬大」：寬版卡片會爆框跑版。其它視窗大小維持完整三選項。
const mqPhone = matchMedia("(max-width: 430px)");
const sizesFor = () => mqPhone.matches ? SIZES.filter(([, cls]) => cls !== "size-wide") : SIZES;
// 以 class 名持久化（比索引穩：手機／桌機可選清單不同，索引會錯位）。沿用舊的數字索引設定做一次性遷移。
let sizeCls = localStorage.getItem("wlib-size-cls")
  || (SIZES[+(localStorage.getItem("wlib-size") ?? 0)] || SIZES[0])[1];
// 把儲存的偏好對應到「此視窗實際可用」的選項：手機上若偏好是寬大，顯示退回第一個可用（但不覆寫偏好，回桌機仍是寬大）。
const resolveSize = () => { const a = sizesFor(); return a.find(([, cls]) => cls === sizeCls) || a[0]; };
function applySize() {
  const [name, cls] = resolveSize();
  grid.classList.remove("size-wide","size-std","size-compact");
  grid.classList.add(cls);
  $("sizeLbl").textContent = name;
}
function cycleSize() {
  const a = sizesFor(), cur = resolveSize()[1];
  sizeCls = a[(a.findIndex(([, cls]) => cls === cur) + 1) % a.length][1];
  localStorage.setItem("wlib-size-cls", sizeCls);
  applySize();
}
mqPhone.addEventListener("change", applySize);   // 跨越手機斷點（轉螢幕／縮視窗）時自動修正顯示
applySize();
