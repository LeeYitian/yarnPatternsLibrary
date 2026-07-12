# Yarn Patterns Library

一個**純前端、零後端、免建置**的本機編織圖瀏覽器。使用者選一個資料夾,網頁就把裡面每個 PDF 的第一頁與圖片做成封面,排成可瀏覽的畫廊;點封面開啟原始檔案。

> 本文件給接手的開發者／AI agent。除了「功能」,也記錄了**關鍵技術決策與限制(以及為什麼)**,避免重複我們已經踩過的坑。

---

## 1. 它是什麼／不是什麼

- **是**:一個讓「每個使用者瀏覽自己電腦本機資料夾」的工具。檔案完全不上傳,封面在使用者自己的瀏覽器產生並快取。
- **不是**:一個分享「我的收藏」給別人看的網站。訪客打開只會看到空白首頁,要他自己選資料夾;網頁**無法**列出伺服器上的檔案。

---

## 2. 檔案結構

```
yarn-patterns-library/
├─ index.html          ← 頁面骨架(HTML)與 CSS／JS 的載入清單
├─ css/
│  └─ style.css        ← 全部樣式
├─ js/                 ← 依功能拆分的傳統 script(載入順序=依賴順序,見 §11)
│  ├─ constants.js     ← 常數集中管理(設定值、UI 標籤、SVG 圖示、onboarding 教學文案)
│  ├─ db.js            ← 迷你 IndexedDB 包裝
│  ├─ utils.js         ← 純函式小工具
│  ├─ state.js         ← 共用狀態與衍生 helpers
│  ├─ controls.js      ← 頂欄與側邊 dock 控制
│  ├─ gallery.js       ← 卡片建立／render／篩選／開啟檔案
│  ├─ thumbs.js        ← 封面產生與快取
│  ├─ viewer.js        ← 燈箱／幻燈片
│  ├─ urls.js          ← URL 收藏(links.md IO、CRUD、對話框、toast)
│  ├─ folder.js        ← 資料夾選擇／掃描／更換
│  ├─ onboarding.js    ← 教學 controller(文案在 constants.js)
│  ├─ touch.js         ← 觸控長按工具列
│  └─ main.js          ← 啟動入口 init()(必須最後載入)
├─ favicon.png         ← 網站圖示 & 首頁／標題 logo
├─ manifest.json       ← PWA manifest
├─ og-image-*.png      ← 社群分享預覽圖(1200x630、1200x1200)
├─ lib/
│  ├─ pdf.min.js        ← PDF.js 主程式（pdfjs-dist 3.11.174，UMD 版）
│  └─ pdf.worker.min.js ← PDF.js worker
├─ spec/                ← 規格文件和設計參考文件
└─ About.md
```

- **沒有** build step、沒有 `node_modules`、沒有後端。
- 全部是靜態檔案:直接雙擊 `index.html` 或部署即可。JS 全走一般 `<script src>` + `./` 相對路徑,`file://` 也載得到。
- 早期掃描用的 `collection/` 子資料夾**已不再寫死**——程式讀使用者選的任何資料夾(見 §6)。

---

## 3. 執行方式

- **本機**:雙擊 `index.html`(`file://`)。
- **部署**:丟到任何靜態主機(已驗證 Vercel 可用)。只要 HTTPS 即可。
- **瀏覽器需求**:**只支援 Chrome／Edge**(需要 File System Access API)。Firefox／Safari 不支援,首頁會顯示提示。

---

## 4. 核心技術決策(重要,先讀這段)

這個 App 之所以長這樣,是被「直接用 `file://` 打開」這個需求逼出來的。以下限制務必理解:

1. **`file://` 會擋掉 ES module `import`**(CORS,origin = `null`)。
   → 所以 PDF.js 用 **UMD 版**、以**一般 `<script src>`**(classic script)載入,靠 `globalThis.pdfjsLib`。**不要**改回 `import ... from "*.mjs"`,否則本機雙擊會壞。

2. **`file://` 會擋掉 `fetch()`／XHR 讀本機檔案**。
   → 不能用 `fetch` 抓 PDF。要拿到 PDF 的 bytes 來算封面,**唯一**的路是 **File System Access API**(`showDirectoryPicker` → `handle.getFile()`)。這就是為什麼一定要使用者「選一次資料夾」。

3. **瀏覽器不給真實絕對路徑**(拿不到 `C:\...\xxx.pdf`)。
   → 「開啟檔案」不能用字串路徑,而是用 file handle 取出檔案、`URL.createObjectURL` 開新分頁。

4. **效能:`backdrop-filter`(毛玻璃)不能濫用**。
   → 幾十張卡片各開毛玻璃會造成嚴重重繪閃動。已把毛玻璃**只**留在:頂欄(`header`)、按鈕／搜尋框(`.btn`／`#search`)、側邊浮動按鈕(`.dock-btn`)、放大鏡鈕(`.expand`)。卡片本體、卡片標題列(`.label`,改走漸層)、首頁說明框(`.why`)、燈箱遮罩**都不用**毛玻璃。若未來閃動,先查是不是又有大量元素開了 `backdrop-filter`。

---

## 5. 資料流／狀態

### IndexedDB(`indexedDB.open("weaving-lib")`,DB name `weaving-lib`)

- **不指定版本開啟**(沿用瀏覽器現有版本),若缺 `thumbs`／`kv` store 才升一版補建。
  - 為什麼:早期寫死 `open("weaving-lib", 2)`,若使用者瀏覽器裡的資料庫版本已較新,`open` 會直接失敗 → 所有讀寫被吞掉 → **每次重新整理都要重選資料夾**。改成不指定版本即可避免這個雷。
- store `thumbs`:預覽圖快取(store 無 keyPath,key 由程式明碼帶入)。裝兩種:
  - **本機封面**:key = `thumbKey(it)` = `` `${it.path || it.name}|${it.size}|${it.lastModified}|w${THUMB_W}` ``(見 `js/state.js`),value = JPEG `Blob`。key 帶 `w${THUMB_W}`,所以**改 `THUMB_W` 會自動讓舊封面失效重畫**。頂層檔案 `path` = 檔名,故舊快取(無 `path` 時代)的封面 key 不變、既有使用者封面不重畫。
  - **URL 縮圖顯示快取**:key = `urlThumbCacheKey(path)`(形如 `urlthumb:<thumbs/…>`,見 `js/urls.js`),value = WEBP `Blob`。用途見 §6.1(cache-first 開 app 無授權也能顯示)。
- store `kv`:
  - `"items"`:清單 meta 陣列 `{name, path, ext, type, size, lastModified}`(不含 handle,因為要可序列化)。`path` = 從所選根到該檔的相對路徑(如 `圍巾/蕾絲/scarf.pdf`;頂層檔案 `path` = 檔名)。載入舊快取(無 `path`)時各使用處以 `it.path || it.name` fallback,視為頂層。
    - **掃描完就先 `persistItems()` 寫入一次**(在畫封面之前),`size`／`lastModified` 在掃描時用 `getFile()` 取得。這樣即使封面還沒畫完就重新整理,下次也能直接載入、免重選資料夾。
  - `"dir"`:使用者選的 `FileSystemDirectoryHandle`(可被 structured-clone 存起來)。
  - `"urls"`:**URL 收藏條目陣列**的 read-side cache + 災難復原副本。真相在資料夾根目錄的 `links.md`(見下方「URL 收藏」)。本機檔案與 URL 兩條線並行、無耦合。

### localStorage

- `"wlib-size-cls"`:檢視大小的 class 字串(`size-wide`／`size-std`／`size-compact`);目前實際採用的鍵(見 `js/controls.js`)。
- `"wlib-size"`:**舊鍵**,檢視大小索引(0／1／2);只在 `wlib-size-cls` 不存在時當 fallback 讀。
- `"wlib-sort"`:排序模式,`"name"`(依檔名)或 `"time"`(依修改時間,時間軸版面)。
- `"wlib-source"`:來源篩選,`"all"`／`"local"`／`"url"`(全部／本機／網址);與排序正交。
- `"wlib-onboarding-seen"`:onboarding 教學已看過的**版本字串**(`OB_SEEN_KEY`,見 `js/onboarding.js`、`spec/onboarding-spec.md` §3.2)。有值→首次不自動跳;值 < 當前版本→升版 toast。
- `"wlib-foldertag"`:資料夾名稱轉標籤的開關(`"on"`／`"off"`;**未設=尚未詢問**,行為同 off)。設定選單 toggle 切換,即時生效(`js/tags.js`、`spec/tag-spec.md` §4a)。

### 規劃中的結構變更(未實作)

> 以下是標籤功能帶進來的結構調整,**目前尚未實作**;真相見 `spec/tag-spec.md`。實作後把對應項併回上面。(子資料夾遞迴的 `path` 欄位與 `thumbKey` 遷移**已實作**,見上方 IndexedDB 段落;`thumbs`／`kv` store 結構未變,不需 IndexedDB 升版。)

- **一次性旗標 `wlib-subfolder-toast`**:記錄上線告知 toast 是否已顯示(`wlib-foldertag` 開關**已實作**,見上方 localStorage 段落)。
- **`files.md`**(資料夾根目錄的檔案,**非 IndexedDB**):手動 tag 的持久真相檔,沿用 `links.md` 模式;延後啟用。

### 開啟流程(`init()`)

1. 讀 `kv.items`(本機檔案)與 `kv.urls`(URL 收藏)。**任一非空** → `render()` 融合渲染兩種卡片 + 從 `thumbs` 快取貼本機封面、URL 縮圖直出(**免選資料夾、不掃資料夾**)。**兩者都空** → 顯示首頁說明。
2. 同時讀 `kv.dir` 備用(給「重新整理」「新增 URL」「開啟檔案」用)。

### 渲染(`render()` / `ensureCards()`)

- 卡片 DOM **只建立一次**(`ensureCards()`,存在 `it._card`、`card.__item` 互指),切換排序／大小時只是**搬移既有節點**,不重建,所以已畫好的封面不會掉。
- 本機檔案(`items`)與 URL(`urls`)透過 `allItems()` **融合成同一份**一起 render／排序／篩選;卡片用 `.card.local`／`.card.url` class 區分來源。
- `render()` 依 `sortMode` 切換 `#grid` 的 `mode-name`(一般網格)或 `mode-timeline`(時間軸),再呼叫 `renderFlat()` 或 `renderTimeline()`。

---

## 6. 功能總覽

| 功能         | 說明                                                                                                                                                                                                                        | 相關程式                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 選資料夾     | 首次用 `showDirectoryPicker` 選**裝著 PDF／圖片的那層資料夾**(不再自動鑽 `collection`)。掃描**遞迴所有子孫資料夾攤平**成單一畫廊,每個檔案帶相對路徑 `path`;排除與容錯見 §9                                                   | `getHandle()`、`start(true)`、`scanDir()`                  |
| 重新整理     | 沿用上次資料夾把手重新掃描,只補畫新／變動的封面。**在頂欄右側「設定」齒輪下拉選單內**                                                                                                                                       | `start(false)`、`#settingsBtn`                             |
| 更換資料夾   | 強制跳出選擇視窗改選別的資料夾。**同在「設定」下拉選單內**                                                                                                                                                                  | `start(true)`、`#settingsBtn`                              |
| 產生封面     | PDF 用 PDF.js 畫第 1 頁;圖片縮圖。並發 3,寫入 `thumbs` 快取                                                                                                                                                                 | `generateThumbs()`、`renderPdfCover()`、`downscaleImage()` |
| 開啟檔案     | 點封面 → 用 file handle 取出該檔 → blob URL 開新分頁。快取載入時沿 `path` 逐段 `getDirectoryHandle` → `getFileHandle` 重新取得(會跳一次授權;無 `path` 的舊快取 fallback 檔名)                                                | `openFile()`                                               |
| 放大預覽     | 卡片中央 hover 出現的放大鏡(Iconify lucide:search 內嵌 SVG)→ 開燈箱                                                                                                                                                         | `.expand`、`openViewer()`                                  |
| 燈箱／幻燈片 | 大圖瀏覽(`max 94vw／80vh`),**純手動**(◀ ▶ ／ ← → ／ Esc),**無自動播放**。只顯示標題;單擊圖片=開啟原始檔。開啟時鎖背景捲動。**無縮放／拖曳**(曾做過滾輪縮放+拖曳,實測不實用已移除)。`vList` 依畫面實際排列(含時間軸順序)取得 | `openViewer／showSlide／step／closeViewer`                 |
| 搜尋         | 即時依檔名過濾。時間軸模式下,**整月都被濾掉的月份區塊會收起**不留白                                                                                                                                                         | `applyFilter()`                                            |
| 幻燈片入口   | 頂欄的 icon 按鈕(Iconify 風格內嵌 SVG)→ `openViewer(0)` 從第一張開始                                                                                                                                                        | `#slideBtn`                                                |
| 檢視大小     | 寬大／標準／緊湊,切換欄數**與裁切比例**(class `size-wide／std／compact`,改 `--min`／`--ar`／`--pos`)。**按鈕在側邊浮動列 `.dock`**                                                                                          | `SIZES`、`applySize()`、`#sizeBtn`                         |
| 排序         | 檔名 ↔ 時間切換。**按鈕在側邊浮動列 `.dock`**;選時間 → 切到時間軸版面                                                                                                                                                       | `sortMode`、`#sortBtn`、`render()`                         |
| 時間軸版面   | `sortMode==="time"` 時左側一條垂直軸線,依 `lastModified` **以月分組(新→舊)**,空月自動跳過。月份圓點在軸線上                                                                                                                 | `renderTimeline()`、`.grid.mode-timeline`、`.tl-month`     |
| 頂欄收合     | 往下捲收起頂欄、往上捲或回頂端再顯示(`transform: translateY`)                                                                                                                                                               | `header.nav-hidden` + `scroll` 監聽                        |
| 來源篩選     | dock 第三顆,循環 全部／本機／網址;與排序正交,只加 `.hidden` 不重建 DOM。狀態存 `localStorage["wlib-source"]`                                                                                                                | `sourceMode`、`#sourceBtn`、`applyFilter()`               |
| 新增/編輯網址 | 頂欄綠色「新增網址」鈕或卡片編輯鈕開對話框;偵測 YouTube、三種縮圖上傳(檔案／拖拉／貼上)                                                                                                                                     | `openDialog()`、`saveNewUrl()`、`saveEditUrl()`           |
| 刪除網址     | 卡片刪除鈕 → 二次確認 → 從 `links.md` 移除並刪對應 `thumbs/` 縮圖                                                                                                                                                            | `openConfirm()`、`doDeleteUrl()`                          |

### 6.1 URL 收藏(`links.md`)

在本機檔案瀏覽器之外,並行加了一條「網頁／影音連結」資料庫,**與本機檔案完全解耦**:

- **唯一真相**是使用者資料夾根目錄的 `links.md`(Markdown flat list);`IndexedDB.kv.urls` 只是 read-side cache + 災難復原副本。
- **縮圖**:`thumb:` 欄位指定 → 偵測 YouTube 自動組 `img.youtube.com` → fallback `favicon.png`。使用者上傳的縮圖壓成最長邊 400px 的 WEBP,存資料夾的 `thumbs/{sha1(url).slice(0,12)}.webp`(持久真相)。
  - **同時也存一份進 IndexedDB `thumbs` store**(key `urlthumb:<path>`)當顯示快取。原因:cache-first 開 app 時沒有使用者手勢,無法向 `dirHandle` 要授權去讀磁碟的 `thumbs/`,只靠磁碟會在重整後退成 favicon。`thumbs/` 仍是持久真相,IndexedDB 只是免授權的顯示快取(角色等同本機封面快取)。`paintUrlThumb()` 先吃 IndexedDB,沒有才(在有授權時)讀磁碟並順手補快取。
- **cache-first**:開 app 從 `kv.urls` 直出不掃資料夾;按「重新整理」才重讀 `links.md` + 重掃本機檔案,完成跳 toast 回饋。
- **CRUD 走讀-改-寫**:每次都先讀磁碟 `links.md`、re-parse、改記憶體中單一條目、原子寫回(temp + `move`)、更新 cache;順便吃進外部(VS Code)對其他條目的修改。
- **災難復原**:`links.md` 壞掉／遺失時自動從 `kv.urls` 重建,原檔備份成 `links.md.broken-{timestamp}`,跳非阻斷 toast。
- **燈箱／幻燈片相容**:URL 卡片也能進燈箱放大;但**點擊分流**——點放大鏡進燈箱,點卡片其他地方／燈箱「開啟連結」一律 `window.open(url)`(本機則是 blob URL 開新分頁,見 `openFile()` 內分流)。
- **找不到資料夾**:「重新整理」時若資料夾讀不到(外接硬碟拔了／被刪改名),跳 toast(「再試一次」「選擇新資料夾」兩個動作),**完全不動 `links.md` 與 cache**。
- 解析器**保留不認識的欄位原樣**,未來 tag 系統可在 `links.md` 加 `- tags:` 而不破壞舊資料。
- **本機檔案仍完全唯讀**:卡片不出現編輯／刪除鈕(只有 URL 卡片有);要改本機檔案請去檔案總管再按重新整理。
- 完整需求與決策見 `spec/url-spec.md`、版面對應見 `spec/url-ui-handoff.md`。**onboarding wizard(`spec/onboarding-spec.md`)已實作**(獨立 controller,疊在 cache-first app 之上,無資料耦合);設定齒輪選單已放回「重看使用教學」入口(`#replayOnboarding`)。

---

## 7. 設計風格

整段已搬到 [`spec/design-style.md`](spec/design-style.md)（含配色、字體、氛圍覆蓋層、動效、元件規範、花飾系統、封面裁切比例 `--ar` 等）。改視覺前先讀那份。

---

## 8. 部署(Vercel)注意事項

- 選資料夾在 HTTPS 下正常(secure context)。
- **不需要**也**不建議**把編織圖檔案一起部署上去:
  - 開啟檔案已改用 file handle,不依賴伺服器上的檔案。
  - 每位訪客選自己本機資料夾,封面存在各自瀏覽器的 IndexedDB,互不可見、不上傳。
- 仍只支援 Chrome／Edge。

---

## 9. 已知限制／邊角案例

- **僅 Chromium 系**(Chrome／Edge)。其他瀏覽器顯示不支援提示。
- IndexedDB 是 **per-origin**:把 `index.html` 搬到不同路徑／網域,快取會重來(需重選資料夾)。
- 純快取載入後第一次「開啟檔案」會跳一次資料夾讀取授權(因為要重新拿 handle)。
- `.label` **已改用線性漸層(不再毛玻璃)**,正是為了避免大量卡片捲動時在弱 GPU 上閃動。**不要**為了視覺再把毛玻璃加回 `.label`。
- 遞迴掃描會**跳過**:根層 app 管理的 `thumbs/`、`links.md`、`links.md.broken-*`、`files.md`;任何深度的 `.` 開頭資料夾(`.git` 等)。單一子資料夾讀取失敗只略過該分支(console 警告),不中止整場掃描;只有根資料夾讀不到才報錯。見 `spec/subfolder-spec.md` §8／§4.6。
- 支援副檔名:PDF + `png/jpg/jpeg/webp/gif/bmp`(見 `IMG_EXT`)。

---

## 10. 可能的後續工作(尚未做)

- 排序選項:檔名、修改時間**已做**(見 §6);還缺「依類型」。
- 時間軸排序目前只用 `lastModified`(File System Access API **拿不到建立時間**,只有修改時間)。
- Masonry(瀑布流)版面。
- 把已產生的封面一鍵匯出成檔案。
- 子資料夾遞迴掃描**已實作**(攤平全遞迴、item 帶相對路徑 `path`,見 `spec/subfolder-spec.md`);「資料夾路徑轉自動 tag」與 tag 篩選尚未實作,見下方標籤系統項。
- 燈箱顯示「完整高解析」而非快取縮圖(需 hover 時重新高解析 render)。
- **標籤(tag)系統**:URL 條目跟本機檔案(PDF／圖片)都能下 hashtag,可按 tag 篩選。
  - `links.md` 解析器(見 `spec/url-spec.md` §4)**已實作**「不認識的欄位保留原樣」,所以未來加 `- tags: #a #b` 欄位不會破壞現有資料——後端解析這層已就緒。
  - UI 還沒做:需要新增／編輯對話框的 tag 輸入框、列表頁的 tag 篩選列。
  - 本機檔案目前完全靠掃資料夾,沒進 markdown;要做 tag 的話這個架構要先擴。
  - **規格方向已定**、尚未實作,見 `spec/tag-spec.md`:自動 tag(資料夾路徑,live 衍生不落地)本回合先做;手動 tag(存 `files.md` sidecar)與本機卡片編輯入口延後。

> **已完成(不再列後續工作)**:URL onboarding 教學精靈——`spec/onboarding-spec.md` 規格已落地(controller 在 `js/onboarding.js`、教學文案在 `js/constants.js`;完整 7 步、混合對話框 + spotlight),設定選單「重看使用教學」入口已補回。

---

## 11. 改動時的注意事項(給 AI agent)

- **不要**把 PDF.js 換成 ESM `import`(會破壞 `file://` 雙擊)。
- **不要**用 `fetch()` 讀本機檔案。
- **不要**在卡片本體或大量元素上加 `backdrop-filter`。
- **不要**重新寫死任何資料夾名稱(例如 `collection`);讀使用者選的 handle。
- 改封面解析度就改 `THUMB_W`(快取會自動失效重畫)。
- 邏輯已依功能拆到 `js/` 底下的多個檔案(見 §2),全部是**傳統 script(非 ES module)**,依 `index.html` 的載入順序共享同一個全域 scope。**不要**改成 `type="module"`(會破壞 `file://` 雙擊),**不要**亂調載入順序:`constants.js` 最先、`main.js`(呼叫 `init()`)最後。
- 各檔案的**頂層程式碼**若要引用「較晚載入的檔案」定義的函式,必須包在 callback 裡延後取值(例:`$("search").oninput = () => applyFilter()`),**不能**直接把函式名當值賦值——載入當下就會 ReferenceError(函式 hoisting 只在同一個 script 檔內有效)。
- **卡片只在 `ensureCards()` 建一次**;切換排序／大小請走 `render()` 搬節點,**不要**整批重建 DOM(會弄丟已畫好的封面與 blob URL)。
- 時間軸的月份分組靠**先排序、再線性掃描**(相同月份連續才分到同一塊),所以 `renderTimeline()` 一定要先 sort 再分組。
- File System Access API **只有 `lastModified`**(沒有建立時間),時間排序／時間軸都以它為準。
- **URL 收藏:`links.md` 是唯一真相,`kv.urls` 只是 cache**。CRUD 一律走「讀磁碟 → re-parse → 改記憶體單一條目 → 原子寫回 → 更新 cache」(`reparseForWrite()`),**不要**改成「先寫 cache 稍後寫檔」或用 cache 整份重生 markdown,否則會覆寫掉 VS Code 對其他條目的外部修改。本機檔案與 URL **無耦合**,別把兩者綁在一起。
- **視覺／設計風格改動先讀 [`spec/design-style.md`](spec/design-style.md)**(尤其 §1 硬限制與 §10 禁忌一覽)。**不要**重新加回刻意移除的東西(淺色模式、拱頂圓弧 `--arch`、sepia、毛玻璃 `.label`、sans-serif),**不要**在任何元素加 `backdrop-filter` ／ CSS `filter`(同 §4 理由)。
