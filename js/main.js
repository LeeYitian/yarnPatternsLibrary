/* =====================================================================
   main.js — 啟動入口
   init()（cache-first 開 app）與首頁 intro 進場。
   必須最後載入：init() 會用到其他檔案定義的函式與狀態。
   ===================================================================== */
async function init() {
  if (!window.indexedDB || !window.showDirectoryPicker) {
    // 不支援 File System API（iOS 全部、較舊 Android Chrome）：
    // 第一屏直接以警語取代「往下捲動」，不顯示說明／選資料夾流程（反正用不了）。
    showIntro();
    $("scrollCue").classList.add("hidden");
    introReveal.classList.add("hidden");
    $("heroWarn").classList.remove("hidden");
    return;
  }
  let meta = null, cachedUrls = null;
  try { meta = await DB.get("kv", "items"); } catch (e) { console.warn("[lib] 讀取快取清單失敗：", e); }
  try { cachedUrls = await DB.get("kv", "urls"); } catch (e) { console.warn("[lib] 讀取 URL 快取失敗：", e); }
  try { dirHandle = await DB.get("kv", "dir"); } catch (e) { console.warn("[lib] 讀取資料夾把手失敗：", e); }
  items = (meta && meta.length) ? meta.map(m => ({ ...m, kind: "local" })) : [];
  urls = Array.isArray(cachedUrls) ? cachedUrls.map(hydrateUrl) : [];
  if (items.length || urls.length) { showLibrary(); render(); fillThumbsFromCache(); }
  else showIntro();
  obMaybeUpgradeToast();   // 後續開 app（cache 直出）：教學大升版才跳可點 toast
}

// 首頁進場：第一屏只見 icon+標題，捲到說明區才讓它浮現
const introReveal = $("introReveal");
const introObserver = ("IntersectionObserver" in window)
  ? new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { introReveal.classList.add("in"); introObserver.unobserve(e.target); } });
    }, { threshold: 0.16 })
  : null;
// 點擊「往下捲動」提示：平滑捲到說明區
$("scrollCue").onclick = () => introReveal.scrollIntoView({ behavior: "smooth", block: "start" });

function showIntro() {
  intro.classList.remove("hidden"); bar.classList.add("hidden"); grid.classList.add("hidden"); dock.hidden = true;
  $("filterbar").classList.add("hidden");
  if (introObserver) introObserver.observe(introReveal);
  else introReveal.classList.add("in");   // 不支援 IO 時直接顯示，避免說明被永久藏住
}
function showLibrary() {
  intro.classList.add("hidden"); bar.classList.remove("hidden"); dock.hidden = false;
  updateFoldertagUI();   // 開關列狀態跟著掃描結果走（平資料夾＝disabled，tag-spec §11.2）
  $("filterbar").classList.remove("hidden");
  renderFilterbar();     // tag badge 跟著掃描結果重繪（次數排序，§11.3）
  syncFilterbarTop();    // header 顯示後才量得到高度
  const total = items.length + urls.length;
  $("count").textContent = `（${total} 件）`;
  empty.classList.toggle("hidden", total > 0);
  if (!total) empty.textContent = "資料夾裡沒有 PDF／圖片，也還沒有收藏網址。";
  grid.classList.toggle("hidden", total === 0);
}

// 啟動：必須放在 introReveal／introObserver／showIntro 等定義「之後」再呼叫。
// 否則不支援 File System API 的瀏覽器（iOS Safari／Chrome、Android Chrome）會在 init()
// 同步走進 showIntro()，此時 introObserver 仍在 TDZ → ReferenceError，導致 .why 不顯示。
init();
