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
├─ index.html          ← 整個 App(HTML + CSS + JS 全部在這一個檔)
├─ favicon.png         ← 網站圖示 & 首頁／標題 logo
├─ lib/
│  ├─ pdf.min.js        ← PDF.js 主程式（pdfjs-dist 3.11.174，UMD 版）
│  └─ pdf.worker.min.js ← PDF.js worker
├─ spec/                ← 規格文件和設計參考文件
└─ About.md
```

- **沒有** build step、沒有 `node_modules`、沒有後端、沒有 manifest 檔。
- `index.html` 是單一檔案,直接雙擊或部署即可。
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
- store `thumbs`:封面圖。key = `` `${name}|${size}|${lastModified}|w${THUMB_W}` ``,value = JPEG `Blob`。
  - key 帶上 `w${THUMB_W}`,所以**改 `THUMB_W` 會自動讓舊封面失效重畫**。
- store `kv`:
  - `"items"`:清單 meta 陣列 `{name, ext, type, size, lastModified}`(不含 handle,因為要可序列化)。
    - **掃描完就先 `persistItems()` 寫入一次**(在畫封面之前),`size`／`lastModified` 在掃描時用 `getFile()` 取得。這樣即使封面還沒畫完就重新整理,下次也能直接載入、免重選資料夾。
  - `"dir"`:使用者選的 `FileSystemDirectoryHandle`(可被 structured-clone 存起來)。
  - `"urls"`:**URL 收藏條目陣列**的 read-side cache + 災難復原副本。真相在資料夾根目錄的 `links.md`(見下方「URL 收藏」)。本機檔案與 URL 兩條線並行、無耦合。

### localStorage

- `"wlib-size"`:檢視大小索引(0／1／2)。
- `"wlib-sort"`:排序模式,`"name"`(依檔名)或 `"time"`(依修改時間,時間軸版面)。
- `"wlib-source"`:來源篩選,`"all"`／`"local"`／`"url"`(全部／本機／網址);與排序正交。

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
| 選資料夾     | 首次用 `showDirectoryPicker` 選**裝著 PDF／圖片的那層資料夾**(不再自動鑽 `collection`)                                                                                                                                      | `getHandle()`、`start(true)`                               |
| 重新整理     | 沿用上次資料夾把手重新掃描,只補畫新／變動的封面。**在頂欄右側「設定」齒輪下拉選單內**                                                                                                                                       | `start(false)`、`#settingsBtn`                             |
| 更換資料夾   | 強制跳出選擇視窗改選別的資料夾。**同在「設定」下拉選單內**                                                                                                                                                                  | `start(true)`、`#settingsBtn`                              |
| 產生封面     | PDF 用 PDF.js 畫第 1 頁;圖片縮圖。並發 3,寫入 `thumbs` 快取                                                                                                                                                                 | `generateThumbs()`、`renderPdfCover()`、`downscaleImage()` |
| 開啟檔案     | 點封面 → 用 file handle 取出該檔 → blob URL 開新分頁。快取載入時用 `dirHandle.getFileHandle(name)` 重新取得(會跳一次授權)                                                                                                   | `openFile()`                                               |
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
- 完整需求與決策見 `spec/url-spec.md`、版面對應見 `spec/url-ui-handoff.md`。**onboarding wizard(`spec/onboarding-spec.md`)尚未做**,故設定選單暫不放「使用教學」入口。

---

## 7. 設計風格

整體採 **Academia／古典學院風**(圖書館／古籍手稿氛圍),但**色調沿用原本的綠／藍**——綠色 `--accent` 扮演學院風裡「黃銅」的角色(全站互動色語言)。**只保留深色模式**。

- **配色(深色 only)**:`:root` 直接寫深色值並加 `color-scheme: dark`,**已移除淺色模式與 `prefers-color-scheme`**。主色 `--accent` `#6dbd9f`(綠)、`--accent2` `#84b6d6`(藍);底色為夜色墨綠 `--bg1/2/3`。背景為多層 radial「館內燈光」光暈 + 線性漸層,`background-attachment: fixed`(捲動時背景固定)。
- **字體(三套襯線,皆用 CSS 變數)**:`--font-head` 標題 = Cormorant Garamond、`--font-body` 內文 = Crimson Pro、`--font-disp` 標籤／顯示 = Cinzel(大寫、寬字距);三者都把 **Noto Serif TC** 排在後面接手中文(拉丁字才用前者)。**不要改回 sans-serif**。
- **氛圍覆蓋層**:`body::before` 紙張紋理(SVG noise,opacity .035,`mix-blend: overlay`)、`body::after` 暈影(中央透明、邊緣壓暗);兩者 `position: fixed`、`pointer-events: none`、`z-index: 40`——**在燈箱(z 50)之下**,所以燈箱不受紋理/暈影影響。
- **圓角一律 4px(不用膠囊／大圓角)**;主要按鈕走綠調「拋光金屬」線性漸層 + 鐫刻字陰影(一明一暗 `text-shadow`)。動效統一 `ease-out`、沉穩時長(`--t-fast/base/slow/drama` = 150/300/500/700ms,**不彈跳**),並附 `prefers-reduced-motion` 關閉動畫;鍵盤 focus 用綠色雙層 `box-shadow` 環。
- **頁面左右留白用 `--gutter`**(`clamp(20px,7vw,112px)`,手機 16px),同時套在 `header` 與 `main` 的左右內距,內容往內縮、兩側空出來放浮動按鈕列 `.dock`。
- **首頁說明(重點裝飾區)**:Cinzel overline「Bibliotheca Textilis」、華麗分隔線(中央 ❧ 字符)、`.why` 卡片四角花飾(`::before/::after` 畫角框)、首段首字下沉(`.why p:first-of-type::first-letter`,綠色大寫)。
- **畫廊卡片**:`.card` 是「襯紙裱框」——4px 圓角、`padding: 7px` 把封面框住。封面 `.thumb` 為**方形(2px 圓角)、全彩**(早期試過的拱頂圓弧 `--arch` 與 sepia 濾鏡**已依需求移除**),hover 只做輕微放大。底部 `.label` 用**線性漸層**(不再毛玻璃)+ 主題色直條;類型標籤(PDF／JPG)在右上角,Cinzel 鐫刻小標。
- **側邊浮動按鈕 `.dock`**:`position: fixed` 靠右**垂直置中**(手機版同樣置中,只縮小按鈕),4px 方塊「icon + Cinzel 小標籤」;目前放「檢視大小」「排序」「來源篩選」三顆。
- **頂欄 `header`**:`position: sticky`,捲動方向控制 `.nav-hidden`(`translateY(-100%)`)收合;標題 `h1` 用 Cormorant 襯線。手機版 `flex-wrap` 成兩行(搜尋自己一行、幻燈片+設定一行)。
- **時間軸版面**:`.grid.mode-timeline` 左側 `::before` 畫垂直線,每個 `.tl-month` 用 `::before` 在線上點一個主題色圓點(外圈帶光暈),月份標題 `.tl-label` 用 Cormorant 襯線,卡片放 `.tl-grid`(沿用 `--min`/`--ar`/`--pos` 變數)。
- **燈箱**:遮罩用深墨綠 `color-mix(in srgb, var(--bg1) 26%, rgba(8,14,11,.92))`,**不用毛玻璃**(避免閃動);`.frame` 加四角花飾外框,標題 `.cap .t` 用 Cormorant 襯線。
- **URL 收藏視覺**:URL 一律用**藍 `--accent2`**(badge「連結」、`.label` 直條)與本機綠 `--accent` 做來源區隔(沿用既有 image badge 的藍);綠仍是全站互動色。頂欄「新增網址」鈕是**唯一視覺主張**——primary 綠 + icon + 文字 + 呼吸光暈(`addGlow`,hover 停),刻意移除主按鈕白花押避免與 icon 打架。對話框/確認框沿用燈箱深綠遮罩 + `--sprig` 四角花飾(**不用毛玻璃**);`.card-actions`(編輯／刪除)hover 浮出;`.toast` 非阻斷、底部滑入,警示用琥珀左框。**對話框、卡片、toast 一律不用 `backdrop-filter`**(同 §4)。

### 封面裁切比例(`--ar`)

- 寬大 = `16/9`(寬版裁切,`object-fit: cover` 不變形只顯示局部)。
- 標準／緊湊 = `1/1`(正方形裁切)。
- `--pos` 控制裁切焦點(預設 `center 32%`,偏上以對到封面主照片)。

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
- 只掃描所選資料夾的**頂層**檔案,不遞迴子資料夾。
- 支援副檔名:PDF + `png/jpg/jpeg/webp/gif/bmp`(見 `IMG_EXT`)。

---

## 10. 可能的後續工作(尚未做)

- 排序選項:檔名、修改時間**已做**(見 §6);還缺「依類型」。
- 時間軸排序目前只用 `lastModified`(File System Access API **拿不到建立時間**,只有修改時間)。
- Masonry(瀑布流)版面。
- 把已產生的封面一鍵匯出成檔案。
- 子資料夾遞迴掃描／分類。
- 燈箱顯示「完整高解析」而非快取縮圖(需 hover 時重新高解析 render)。
- **標籤(tag)系統**:URL 條目跟本機檔案(PDF／圖片)都能下 hashtag,可按 tag 篩選。
  - `links.md` 解析器(見 `spec/url-spec.md` §4)**已實作**「不認識的欄位保留原樣」,所以未來加 `- tags: #a #b` 欄位不會破壞現有資料——後端解析這層已就緒。
  - UI 還沒做:需要新增／編輯對話框的 tag 輸入框、列表頁的 tag 篩選列。
  - 本機檔案目前完全靠掃資料夾,沒進 markdown;要做 tag 的話這個架構要先擴。
- **URL onboarding 教學精靈**:`spec/onboarding-spec.md` 已寫好規格但**尚未實作**;做了之後再把設定選單的「使用教學」入口補回(目前刻意不放空殼按鈕)。

---

## 11. 改動時的注意事項(給 AI agent)

- **不要**把 PDF.js 換成 ESM `import`(會破壞 `file://` 雙擊)。
- **不要**用 `fetch()` 讀本機檔案。
- **不要**在卡片本體或大量元素上加 `backdrop-filter`。
- **不要**重新寫死任何資料夾名稱(例如 `collection`);讀使用者選的 handle。
- 改封面解析度就改 `THUMB_W`(快取會自動失效重畫)。
- 全部邏輯都在 `index.html` 的 `<script>` 裡,沒有其他 JS 檔。
- **卡片只在 `ensureCards()` 建一次**;切換排序／大小請走 `render()` 搬節點,**不要**整批重建 DOM(會弄丟已畫好的封面與 blob URL)。
- 時間軸的月份分組靠**先排序、再線性掃描**(相同月份連續才分到同一塊),所以 `renderTimeline()` 一定要先 sort 再分組。
- File System Access API **只有 `lastModified`**(沒有建立時間),時間排序／時間軸都以它為準。
- **URL 收藏:`links.md` 是唯一真相,`kv.urls` 只是 cache**。CRUD 一律走「讀磁碟 → re-parse → 改記憶體單一條目 → 原子寫回 → 更新 cache」(`reparseForWrite()`),**不要**改成「先寫 cache 稍後寫檔」或用 cache 整份重生 markdown,否則會覆寫掉 VS Code 對其他條目的外部修改。本機檔案與 URL **無耦合**,別把兩者綁在一起。
- 設計風格是 **Academia／古典學院風 + 綠色調 + 只深色**(見 §7)。**不要**重新加回淺色模式、封面拱頂圓弧(`--arch`)或 sepia 濾鏡,也**不要**把襯線字體換成 sans-serif——這些都是刻意移除／指定的。
- **花邊裝飾(卡片對角／燈箱四角／主按鈕)有獨立規格:見 `spec/FLOURISH.md`(改花邊前務必先讀)。** 重點守則:① 裝飾性花邊用**白色 SVG**(卡片／燈箱會壓在使用者照片上,靠「烤進 SVG 的深色描邊」維持可讀;按鈕背景可控,用**純白無描邊**)。② 綠 `--accent` 仍是**互動色**——別把花邊改成金 brass,也別動 hover 邊框／focus 環/`.label` 綠直條。③ 陰影一律走 **SVG 內描邊**,**不要**用 CSS `filter`／`backdrop-filter`(同 §4 理由)。④ 只長**對角兩處**、保持稀疏。⑤ 花邊全是 CSS 偽元素 + `background-image`,**不改 JS**、不動 `ensureCards()`。
