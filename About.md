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
└─ README.md
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
   → 幾十張卡片各開毛玻璃會造成嚴重重繪閃動。已把毛玻璃**只**留在:頂欄、按鈕、卡片底部標題列(`.label`)、首頁說明框。卡片本體、燈箱遮罩**不用**毛玻璃。若未來閃動,先查是不是又有大量元素開了 `backdrop-filter`。

---

## 5. 資料流／狀態

### IndexedDB(`indexedDB.open("weaving-lib", 2)`)

- store `thumbs`:封面圖。key = `` `${name}|${size}|${lastModified}|w${THUMB_W}` ``,value = JPEG `Blob`。
  - key 帶上 `w${THUMB_W}`,所以**改 `THUMB_W` 會自動讓舊封面失效重畫**。
- store `kv`:
  - `"items"`:清單 meta 陣列 `{name, ext, type, size, lastModified}`(不含 handle,因為要可序列化)。
  - `"dir"`:使用者選的 `FileSystemDirectoryHandle`(可被 structured-clone 存起來)。

### localStorage

- `"wlib-size"`:檢視大小索引(0／1／2)。

### 開啟流程(`init()`)

1. 讀 `kv.items`。**有** → 直接渲染卡片 + 從 `thumbs` 快取貼封面(**免選資料夾**)。**無** → 顯示首頁說明。
2. 同時讀 `kv.dir` 備用(給「重新整理」「開啟檔案」用)。

---

## 6. 功能總覽

| 功能         | 說明                                                                                                                      | 相關程式                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 選資料夾     | 首次用 `showDirectoryPicker` 選**裝著 PDF／圖片的那層資料夾**(不再自動鑽 `collection`)                                    | `getHandle()`、`start(true)`                               |
| 重新整理     | 沿用上次資料夾把手重新掃描,只補畫新／變動的封面                                                                           | `start(false)`                                             |
| 更換資料夾   | 強制跳出選擇視窗改選別的資料夾                                                                                            | `start(true)`                                              |
| 產生封面     | PDF 用 PDF.js 畫第 1 頁;圖片縮圖。並發 3,寫入 `thumbs` 快取                                                               | `generateThumbs()`、`renderPdfCover()`、`downscaleImage()` |
| 開啟檔案     | 點封面 → 用 file handle 取出該檔 → blob URL 開新分頁。快取載入時用 `dirHandle.getFileHandle(name)` 重新取得(會跳一次授權) | `openFile()`                                               |
| 放大預覽     | 卡片中央 hover 出現的放大鏡(Iconify lucide:search 內嵌 SVG)→ 開燈箱                                                       | `.expand`、`openViewer()`                                  |
| 燈箱／幻燈片 | 大圖瀏覽,**純手動**(◀ ▶ ／ ← → ／ Esc),**無自動播放**。只顯示標題。開啟時鎖背景捲動                                       | `openViewer／showSlide／step／closeViewer`                 |
| 搜尋         | 即時依檔名過濾                                                                                                            | `applyFilter()`                                            |
| 檢視大小     | 寬大／標準／緊湊,切換欄數**與裁切比例**(class `size-wide／std／compact`,改 `--min`／`--ar`／`--pos`)                      | `SIZES`、`applySize()`                                     |

---

## 7. 設計風格

- 自然冥想風配色:`--accent`(尤加利綠 `#5aa088`)、`--accent2`(藍 `#74a7c8`),柔和漸層背景。
- 支援淺色／深色(`prefers-color-scheme`)。
- 俐落畫廊:小圓角(卡片 9px)、緊密間隙、卡片底部毛玻璃標題列 + 主題色直條,類型標籤(PDF／JPG)在右上角實心填色。
- 燈箱遮罩:半透明深藍綠 `rgba(15,55,54,.9)`,**不用毛玻璃**(避免閃動)。

### 封面裁切比例(`--ar`)

- 寬大 = `16/9`(寬版裁切,`object-fit: cover` 不變形只顯示局部)。
- 標準／緊湊 = `3/4`(直式完整)。
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
- `.label` 用了毛玻璃:理論上大量卡片捲動時在弱 GPU 上**可能**閃動。若發生,fallback 是改回漸層(`linear-gradient(to top, rgba(13,46,42,...), transparent)`)。
- 只掃描所選資料夾的**頂層**檔案,不遞迴子資料夾。
- 支援副檔名:PDF + `png/jpg/jpeg/webp/gif/bmp`(見 `IMG_EXT`)。

---

## 10. 可能的後續工作(尚未做)

- 排序選項(檔名／修改時間／類型)。
- Masonry(瀑布流)版面。
- 把已產生的封面一鍵匯出成檔案。
- 子資料夾遞迴掃描／分類。
- 燈箱顯示「完整高解析」而非快取縮圖(需 hover 時重新高解析 render)。

---

## 11. 改動時的注意事項(給 AI agent)

- **不要**把 PDF.js 換成 ESM `import`(會破壞 `file://` 雙擊)。
- **不要**用 `fetch()` 讀本機檔案。
- **不要**在卡片本體或大量元素上加 `backdrop-filter`。
- **不要**重新寫死任何資料夾名稱(例如 `collection`);讀使用者選的 handle。
- 改封面解析度就改 `THUMB_W`(快取會自動失效重畫)。
- 全部邏輯都在 `index.html` 的 `<script>` 裡,沒有其他 JS 檔。
