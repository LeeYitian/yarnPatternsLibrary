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

// ---------- 更新紀錄（urls.js 渲染進 #clList；點 footer 版號開啟）----------
// 由新到舊排列；detail 可省略。
const CHANGELOG = [
  { ver: "1.8.2", title: "壞檔復原與資料保護", detail: "links.md／files.md 整份壞掉會自動備份成 .broken 並用副本救回；換資料夾不再把舊收藏帶進新資料夾。" },
  { ver: "1.8.1", title: "盤點文件對齊功能、修正 bug", detail: "暫緩壞檔復原功能。" },
  { ver: "1.8.0", title: "手動標籤系統" },
  { ver: "1.7.0", title: "自動標籤系統", detail: "資料夾路徑自動轉成 tag，並新增 tag 開關與篩選區。" },
  { ver: "1.6.0", title: "子資料夾遞迴掃描", detail: "item 帶 path、快取 key 遷移，偵測「移動」時不再誤報刪除。" },
  { ver: "1.5.2", title: "架構重構（patch）", detail: "單一 index.html 拆成 css/style.css 與 14 個功能別 JS 檔。" },
  { ver: "1.5.1", title: "相容性與版面修正（patch）", detail: "File System API 警語、footer、手機 layout、社群圖標 SVG。" },
  { ver: "1.5.0", title: "觸控裝置操作改善" },
  { ver: "1.4.0", title: "Onboarding 教學與 PWA", detail: "引導教學（對話框加 spotlight）。" },
  { ver: "1.3.0", title: "更換資料夾流程" },
  { ver: "1.2.0", title: "URL 收藏功能" },
  { ver: "1.1.1", title: "SEO" },
  { ver: "1.1.0", title: "瀏覽與介面改善", detail: "時間軸排序、側邊浮動按鈕、頂欄與燈箱改版、加深配色、快取持久化修正。" },
  { ver: "1.0.0", title: "初始版本", detail: "選資料夾後，以 PDF 首頁與圖片做封面，畫廊瀏覽、IndexedDB 快取；純前端、零後端、免建置。" },
];

// ---------- SVG 圖示 ----------
const SVG_EXPAND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
const SVG_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`;
const SVG_DEL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;
const SVG_TB_FILE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const SVG_TB_EXT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
const SVG_CHECK   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;
// 「編輯標籤」用標籤 icon（非鉛筆，與 URL 卡「編輯＝改內容」區隔，tag-spec §11.6.1／T24）
const SVG_TAG     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none"/></svg>`;

// ---------- Onboarding 教學常數與文案（onboarding.js 使用） ----------
const OB_SEEN_KEY = "wlib-onboarding-seen";
const OB_VERSION = "v1";       // 內容大改版才升（v2…）；小修不動
const OB_MAJOR = 1;            // 升版 toast 比對用的主版號
const OB_SEE = "👀 看過就好", OB_DO = "🖱 換你試試";
// 手動 tag 純說明文案（tag-spec §9a／T27）：sub／flat 兩形式都播，放在開關 spotlight 之後、篩選區 spotlight 之前。
const OB_MANUAL_TAG_BODY =
`除了資料夾自動變成的標籤，
你也可以自己幫檔案或網址貼標籤，例如 #送禮、#未完成。

這些自己貼的標籤會存在資料夾的 files.md（檔案）和 links.md（網址）裡，屬於你、可以自己搬或編輯。`;
// 「畫面」對應 8 大步（macro）；多子步的大步（4／5／6＝資料夾標籤／新增網址／工具列）以 sub 計位。文案逐字照 onboarding-spec.md §4／§9、tag-spec.md §9a。
// when: "sub"＝有子資料夾檔案才播、"flat"＝平資料夾才播（onboarding-spec §9.1 兩形式；無 when＝一律播）。
// menu: true＝該步設定選單保持展開並鎖住；targetM＝手機（≤600px）改指的 spotlight 目標；alt＝氣泡的次要鈕文字。
const OB_SCREENS = [
  // 開場（封面）：無 macro → 不顯示步驟點、不顯示徽章
  { kind: "dialog", title: "歡迎來到編織圖圖書館！", body:
`第一次進來，先看看這個網站的功能和注意事項吧。` },
  { macro: 1, kind: "dialog", badge: OB_SEE, title: "檔案和網址兩種收藏", body:
`PDF ／ 圖片檔案：
→ 以資料夾裡實際有的檔案為準
→ 連同子資料夾裡的檔案都會讀，全部檔案的預覽圖都會一起顯示
→ 動了資料夾中的檔案（新增／改名／刪掉），要按「重新整理」才會跟著更新` },
  { macro: 1, kind: "dialog", badge: OB_SEE, title: "檔案和網址兩種收藏", body:
`🔗 網址：
→ 網頁會自動在你資料夾裡建一個 links.md 和 thumbs/ 資料夾，
  用來存放網址清單和預覽圖（檔名會是一串英數字）
→ 平時用網頁裡的按鈕新增／編輯／刪除網址資料即可
→ 想的話也可以用記事本等文字編輯軟體直接打開 links.md 來改（要注意內容格式）` },
  // ── Step 2：萬一 links.md 壞掉／不見（onboarding-spec §9.6；壞檔守門上線後寫回，broken-file-recovery-spec §Phase8）──
  { macro: 2, kind: "dialog", badge: OB_SEE, title: "萬一 links.md 壞掉或不見", body:
`你的網址收藏，網頁隨時留著一份副本。
萬一 links.md 整個讀不到、或格式壞到完全認不得，網頁會自動用副本救回，並把壞掉的原檔改名成 links.md.broken-{時間} 完整保留，你不會兩頭空。

小提醒：如果你自己用文字編輯器改 links.md，
只改壞其中一兩行的話，那幾行可能會被安靜略過；改完記得按「重新整理」確認東西都在。` },
  // ── Step 3：重新整理 ──
  { macro: 3, kind: "dialog", badge: OB_SEE, title: "重新整理", body:
`重新整理時會一口氣做兩件事：
1. 重新看一次資料夾裡有哪些 PDF ／ 圖片
2. 重新讀一次 links.md，把你改過的網址收藏內容讀進來

✅ 什麼時候要按：
- 動了資料夾中的檔案（新增／改名／刪掉）
- 改了 links.md 的內容
- 打開網頁後，懷疑畫面跟資料夾裡實際的東西不一樣

🛟 不會因為重新整理弄丟你的收藏。重新整理只讀取不寫入。` },
  { macro: 3, kind: "spot", badge: OB_SEE, target: "#refresh", side: "left", menu: true, next: true,
    text: "「重新整理」收在右上角的設定選單裡，就是這顆。" },
  // ── Step 4：資料夾標籤（onboarding-spec §9.1；依偵測結果二選一播放）──
  //   有子資料夾 → 互動：開場 dialog → 開關 spotlight（按開關或「先不開啟」推進）→ 手動 tag 純說明 → 篩選區 spotlight
  //   無子資料夾 → 純說明：開場 dialog → 手動 tag 純說明（手動 tag 與子資料夾無關，故兩形式都播，§9.1／T27）
  { macro: 4, when: "sub", kind: "dialog", badge: OB_DO, title: "資料夾也能當標籤", body:
`你的檔案有分資料夾放嗎？
網頁可以把「資料夾名稱」自動變成標籤，
讓你用標籤快速篩選（例如只看「圍巾」或「蕾絲」）。

來決定要不要開啟吧！` },
  { macro: 4, when: "sub", kind: "spot", badge: OB_DO, target: "#foldertagSwitch", side: "left",
    menu: true, interactive: true, advance: "foldertag", alt: "先不開啟",
    text: "按這顆開啟「資料夾標籤」。\n之後隨時能在右上角設定選單裡開／關。" },
  //   手動 tag 純說明（純說明 👀；開關 spotlight 之後、篩選區 spotlight 之前，§9.1 子流程 ③）
  { macro: 4, when: "sub", kind: "dialog", badge: OB_SEE, title: "也能自己貼標籤", body: OB_MANUAL_TAG_BODY },
  { macro: 4, when: "sub", kind: "spot", badge: OB_SEE, target: "#filterbar", targetM: "#filterBtn", side: "bottom", next: true,
    text: "用標籤篩選收藏，也有搜尋欄可以使用。" },
  //   無子資料夾 → 純說明（不給開／關、不播篩選區 spotlight；跳過＝預設關）：開場 dialog → 手動 tag 純說明
  { macro: 4, when: "flat", kind: "dialog", badge: OB_SEE, title: "資料夾也能當標籤", body:
`把檔案分到不同子資料夾裡，
網頁可以把資料夾名稱自動變成標籤，方便篩選。

你這個資料夾目前還沒有子資料夾；
之後有了，網頁會再問你要不要開啟。` },
  { macro: 4, when: "flat", kind: "dialog", badge: OB_SEE, title: "也能自己貼標籤", body: OB_MANUAL_TAG_BODY },
  // ── Step 5：試試新增網址（互動步驟）──
  { macro: 5, kind: "dialog", badge: OB_DO, title: "試試把一個網址收進來", body:
`網頁右上角的「新增網址」鈕可以
把網頁／影片連結收進你的資料夾。

來試試吧！` },
  { macro: 5, kind: "spot", badge: OB_DO, target: "#addUrlBtn", side: "bottom",
    interactive: true, advance: "dialogopen", text: "按這顆，跳出新增視窗。" },
  { macro: 5, kind: "ring", badge: OB_DO, target: "#fieldUrl", side: "right", dialog: true, advance: "urlinput",
    text: "貼上任一網址試試。\n不知道貼什麼？可以複製這個 YouTube 首頁：", eg: "https://www.youtube.com/" },
  { macro: 5, kind: "ring", badge: OB_DO, target: "#fieldThumb", side: "right", dialog: true, next: true,
    text: "YouTube 連結會自動產生縮圖。\n其他網站可以用檔案／拖拉／貼上自訂縮圖。\n這次不用真的上傳，看一下就好。" },
  { macro: 5, kind: "ring", badge: OB_DO, target: "#dlgSave", side: "left", dialog: true, advance: "save",
    text: "按下儲存，這筆網址就會真的寫進 links.md。" },
  // ── Step 6：其他常用按鈕（逐一 spotlight，純說明）──
  { macro: 6, kind: "spot", badge: OB_SEE, target: "#slideBtn", side: "bottom", next: true,
    text: "從第一張開始，全螢幕逐張看" },
  { macro: 6, kind: "spot", badge: OB_SEE, target: "#sizeBtn", side: "left", next: true,
    text: "卡片預覽可以切寬大 ／ 標準 ／ 緊湊" },
  { macro: 6, kind: "spot", badge: OB_SEE, target: "#sortBtn", side: "left", next: true,
    text: "依檔名 ↔ 依修改時間切換；切到時間排序會用月份分組成時間軸" },
  { macro: 6, kind: "spot", badge: OB_SEE, target: "#sourceBtn", side: "left", next: true,
    text: "全部 ／ 檔案 ／ 網址篩選檢視" },
  // ── Step 7／8 ──
  { macro: 7, kind: "dialog", badge: OB_SEE, title: "換資料夾 = 重新開始", body:
`這個網頁一次只能呈現一個主資料夾與其底下資料夾的內容。

選了新的主資料夾，網頁會：
把之前的封面「預覽圖」全清掉。從新資料夾重新讀取「預覽圖」和網址收藏

🛟 舊資料夾的內容不會跟著消失：
- 你的 PDF ／ 圖片本來就在那裡，不會被動
- 之前在網頁裡收藏的網址，都還在舊資料夾最外層的 links.md，縮圖存在舊資料夾的 thumbs/ 子資料夾
- 這兩個是網頁幫你建的，但它們屬於你
- 想把網址收藏帶到新資料夾？
  在檔案總管把這兩個搬過去就行` },
  { macro: 7, kind: "spot", badge: OB_SEE, target: "#rechoose", side: "left", menu: true, next: true,
    text: "「更換資料夾」也在設定選單裡，想換的時候按這顆。" },
  { macro: 8, kind: "dialog", badge: OB_SEE, title: "準備好了！", last: true, body:
`教學結束。
之後想再看一次，點右上角的設定齒輪 →「重看使用教學」就行。

開始整理你的編織資料夾吧！` },
];
const OB_TOTAL = 8;      // 大步總數（步驟指示器用）
const OB_TAG_MACRO = 4;  // 「資料夾標籤」那一大步（單步播放／既有使用者詢問用，onboarding-spec §9.2）
