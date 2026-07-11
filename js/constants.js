/* =====================================================================
   constants.js — 常數集中管理
   設定值、UI 標籤、SVG 圖示、Onboarding 教學文案都放這裡統一維護。
   所有 js 檔皆為傳統 script（非 module），依 index.html 的載入順序
   共享同一個全域 scope；本檔不依賴其他檔，最先載入。
   ===================================================================== */
const pdfjsLib = globalThis.pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = "./lib/pdf.worker.min.js";

const IMG_EXT = new Set(["png","jpg","jpeg","webp","gif","bmp"]);
const THUMB_W = 520;        // 封面解析度：PDF 與圖片統一用這個寬度，手機／桌機共用一套快取（手機無「寬大」卡，不需更高解析度）

// 預覽大小選項（欄數 + 裁切比例；controls.js 使用）
const SIZES = [["寬大","size-wide"],["標準","size-std"],["緊湊","size-compact"]];
// 來源篩選選項：全部 ／ 本機 ／ 網址（controls.js 使用）
const SOURCES = [["全部","all"],["本機","local"],["網址","url"]];

// ---------- SVG 圖示 ----------
const SVG_EXPAND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
const SVG_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`;
const SVG_DEL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;
const SVG_TB_FILE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const SVG_TB_EXT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

// ---------- Onboarding 教學常數與文案（onboarding.js 使用） ----------
const OB_SEEN_KEY = "wlib-onboarding-seen";
const OB_VERSION = "v1";       // 內容大改版才升（v2…）；小修不動
const OB_MAJOR = 1;            // 升版 toast 比對用的主版號
const OB_SEE = "👀 看過就好", OB_DO = "🖱 換你試試";
// 13 個「畫面」對應 7 大步（macro）；多子步的大步（4／5）以 sub 計位。文案逐字照 onboarding-spec.md §4。
const OB_SCREENS = [
  // 開場（封面）：無 macro → 不顯示步驟點、不顯示徽章
  { kind: "dialog", title: "歡迎來到編織圖圖書館！", body:
`第一次進來，先看看這個網站的功能和注意事項吧。` },
  { macro: 1, kind: "dialog", badge: OB_SEE, title: "檔案和網址兩種收藏", body:
`PDF ／ 圖片檔案：
→ 以資料夾裡實際有的檔案為準
→ 只讀一層資料夾，不會讀子資料夾裡的檔案
→ 動了資料夾中的檔案（新增／改名／刪掉），要按「重新整理」才會跟著更新` },
  { macro: 1, kind: "dialog", badge: OB_SEE, title: "檔案和網址兩種收藏", body:
`🔗 網址：
→ 網頁會自動在你資料夾裡建一個 links.md 和 thumbs/ 資料夾，
  用來存放網址清單和預覽圖（檔名會是一串英數字）
→ 平時用網頁裡的按鈕新增／編輯／刪除網址資料即可
→ 想的話也可以用記事本等文字編輯軟體直接打開 links.md 來改（要注意內容格式）` },
  { macro: 2, kind: "dialog", badge: OB_SEE, title: "萬一 links.md 不小心壞掉", body:
`如果 links.md 因為任何原因壞掉
（例如手動編輯時格式不小心打錯），
網頁會自動從上次留下的副本救回網址收藏，
壞掉的原檔會改名成 links.md.broken-{當下時間}，
完整保留在資料夾裡。

你什麼都不用做。
如果發現有網址不見了，
可以打開 .broken 那個檔，把不見的撿回來。` },
  { macro: 3, kind: "dialog", badge: OB_SEE, title: "右上角的「重新整理」", body:
`這個按鈕會一口氣做兩件事：
1. 重新看一次資料夾裡有哪些 PDF ／ 圖片
2. 重新讀一次 links.md，把你改過的網址收藏內容讀進來

✅ 什麼時候要按：
- 動了資料夾中的檔案（新增／改名／刪掉）
- 改了 links.md 的內容
- 打開網頁後，懷疑畫面跟資料夾裡實際的東西不一樣

🛟 不會因為重新整理弄丟你的收藏。重新整理只讀取不寫入。` },
  // ── Step 4：試試新增網址（唯一互動步驟）──
  { macro: 4, kind: "dialog", badge: OB_DO, title: "試試把一個網址收進來", body:
`網頁右上角的「新增網址」鈕可以
把網頁／影片連結收進你的資料夾。

來試試吧！` },
  { macro: 4, kind: "spot", badge: OB_DO, target: "#addUrlBtn", side: "bottom",
    interactive: true, advance: "dialogopen", text: "按這顆，跳出新增視窗。" },
  { macro: 4, kind: "ring", badge: OB_DO, target: "#fieldUrl", side: "right", dialog: true, advance: "urlinput",
    text: "貼上任一網址試試。\n不知道貼什麼？可以複製這個 YouTube 首頁：", eg: "https://www.youtube.com/" },
  { macro: 4, kind: "ring", badge: OB_DO, target: "#fieldThumb", side: "right", dialog: true, next: true,
    text: "YouTube 連結會自動產生縮圖。\n其他網站可以用檔案／拖拉／貼上自訂縮圖。\n這次不用真的上傳，看一下就好。" },
  { macro: 4, kind: "ring", badge: OB_DO, target: "#dlgSave", side: "left", dialog: true, advance: "save",
    text: "按下儲存，這筆網址就會真的寫進 links.md。" },
  // ── Step 5：其他常用按鈕（逐一 spotlight，純說明）──
  { macro: 5, kind: "spot", badge: OB_SEE, target: "#slideBtn", side: "bottom", next: true,
    text: "從第一張開始，全螢幕逐張看" },
  { macro: 5, kind: "spot", badge: OB_SEE, target: "#settingsBtn", side: "bottom", next: true,
    text: "設定選單裡有「重新整理」和「更換資料夾」。" },
  { macro: 5, kind: "spot", badge: OB_SEE, target: "#sizeBtn", side: "left", next: true,
    text: "卡片預覽可以切寬大 ／ 標準 ／ 緊湊" },
  { macro: 5, kind: "spot", badge: OB_SEE, target: "#sortBtn", side: "left", next: true,
    text: "依檔名 ↔ 依修改時間切換；切到時間排序會用月份分組成時間軸" },
  { macro: 5, kind: "spot", badge: OB_SEE, target: "#sourceBtn", side: "left", next: true,
    text: "全部 ／ 檔案 ／ 網址篩選檢視" },
  // ── Step 6／7 ──
  { macro: 6, kind: "dialog", badge: OB_SEE, title: "換資料夾 = 重新開始", body:
`這個網頁一次只能呈現一個資料夾的內容。

選了新的資料夾，網頁會：
✓ 把之前的封面「預覽圖」全清掉
✓ 從新資料夾重新讀取 PDF ／ 圖片的「預覽圖」和網址收藏

🛟 舊資料夾的內容不會跟著消失：
- 你的 PDF ／ 圖片本來就在那裡，不會被動
- 之前在網頁裡收藏的網址，都還在舊資料夾最外層的 links.md，縮圖存在舊資料夾的 thumbs/ 子資料夾
- 這兩個是網頁幫你建的，但它們屬於你
- 想把網址收藏帶到新資料夾？
  在檔案總管把這兩個搬過去就行` },
  { macro: 7, kind: "dialog", badge: OB_SEE, title: "準備好了！", last: true, body:
`教學結束。
之後想再看一次，點右上角的設定齒輪 →「重看使用教學」就行。

開始整理你的編織資料夾吧！` },
];
const OB_TOTAL = 7;   // 大步總數（步驟指示器用）
