# URL 收藏功能 — UI Layout 接手指示

> 這份文件搭配 `index-url-mockup.html`(layout 原型)使用。原型只把**版面與各種狀態**排出來,
> 用假資料 + 展示用 JS;**沒有**任何真實資料流。本文件告訴接手的 AI agent:原型裡每個新元素是什麼、
> 對應 `url-spec.md` 哪一段、以及把它接成真功能時要動 `index.html` 的哪裡。
>
> 風格與限制一律遵守 `About.md`(§4 核心技術決策、§11 改動注意事項)與 `spec/design-style.md`(視覺、配色、字體、花飾)。

---

## 0. 這次只做「版面」,還沒做的部分

原型**故意不含**以下(等你後續接):

- markdown 的 parse / serialize(`url-spec.md` §4)
- `IndexedDB.kv.urls` cache 與災難復原(§7、§8.1)
- `links.md` / `thumbs/` 的讀寫(File System Access API)
- 縮圖三種上傳的「真正存檔」(原型只做 UI 與預覽示意)
- YouTube 自動縮圖的真實組網址(§5.2)
- onboarding wizard(另見 `onboarding-spec.md`,未做)

原型**已含**的版面與互動示意:頂欄新增鈕(含動畫)、dock 來源篩選、本機/URL 卡片融合顯示、
新增/編輯對話框(含三種上傳的 UI)、刪除二次確認、toast、時間軸相容。

---

## 1. 新增的 DOM 元素一覽

| 元素 | id / class | 角色 | 對應 url-spec | 接手要做的事 |
| ---- | ---------- | ---- | ------------- | ------------ |
| 新增網址鈕 | `#addUrlBtn` | URL 功能的**主要進入點**(頂欄,primary 綠調色、圖標+「新增網址」文字,保留呼吸光暈+金屬掃光動畫吸睛;非全寬,自身寬度) | §6.4 | onclick 開 `#urlDialog`(add 模式) |
| 來源篩選鈕 | `#sourceBtn` / `#sourceLbl` | dock 第三顆,循環 全部/本機/網址 | 需求新加(spec 未列) | 切 `sourceMode` → `applyFilter()`;狀態存 `localStorage["wlib-source"]` |
| URL 卡片 | `.card.url` | 與本機卡片融合在同一畫廊 | §4、§5、§6 | 縮圖來源見 §5;資料來自 `kv.urls` |
| 卡片操作鈕 | `.card-actions`(`.edit` / `.del`) | **只有 URL 卡片**有編輯/刪除 | §6.5 / §6.6 | edit 開 dialog(edit 模式);del 開 `#confirmDialog` |
| 新增/編輯對話框 | `#urlDialog` | 標題/網址/縮圖表單 | §6.4 / §6.5 | 見下方 §3 |
| 平台偵測標 | `#platform` / `#platformTxt` | 顯示偵測到的平台 | §5.2 | 依 URL 偵測 YouTube → 顯示自動縮圖提示 |
| 縮圖上傳區 | `#dropzone` / `#thumbPreview` | 檔案選擇 + 拖拉 + 貼上 | §5.3 | 見下方 §3.2 |
| 刪除確認 | `#confirmDialog` / `#confirmOk` | 二次確認 | §6.6 步驟 1 | 確認後走 §6.6 流程 |
| Toast | `#toast` / `toast()` | 非阻斷通知 | §11.1.2 / §11.3 / §7.2 | 重新整理回饋、災難復原通知都用它 |

---

## 2. 兩個正交維度:來源篩選 × 排序(最重要的觀念)

原型把「**來源篩選**」與既有的「**排序模式**」拆成兩個獨立狀態,可自由組合:

- `sortMode`:`"name"` | `"time"`(既有,About.md §6)
- `sourceMode`:`"all"` | `"local"` | `"url"`(新加)

接手時的關鍵:**篩選不重建 DOM,只加一層 `.hidden`**,跟 About.md §11「卡片只建一次」一致。

原型的 `applyFilter()` 已示範:搜尋字 + 來源**一起**判定(兩者 AND)。實際接 `index.html` 時:

1. 卡片在 `ensureCards()` 建立時加上來源 class:本機 `it._card.classList.add("local")`、URL 加 `"url"`。
2. 既有 `applyFilter()` 的 hit 判斷,從「只看搜尋字」改成「搜尋字 AND 來源」(原型已寫好可直接搬)。
3. 時間軸收月份的邏輯不變,但現在也會吃 source 篩選(原型已處理)。

⚠️ **時間軸混排的時間粒度**:本機檔案用 `lastModified`(毫秒),URL 用 `added: YYYY-MM-DD`(只有日)。
依「月」分組沒問題,但同月內兩者相對先後不精確。建議:把 URL 的 `added` 當天 00:00 轉成 timestamp 再丟進
既有 `renderTimeline()` 的排序,共用同一條時間軸。`renderTimeline()` 維持 About.md §11「先排序再線性掃描分月」。

---

## 3. 新增/編輯對話框接法

### 3.1 欄位與模式

- `#fUrl`(網址,主要欄位,排第一)、`#fTitle`(標題,**非必填**,排第二)、縮圖區。
- **標題留空 → 用網址的網域(host)當顯示名稱**(`displayName()` 已示範);序列化寫 markdown 時,
  標題空就讓 `[ ](url)` 的中括號內容退回網域,或乾脆只存 url、顯示時即時取 host。
- add 模式:欄位空白、無刪除鈕。edit 模式:預填現有資料、顯示 `#dlgDelete`。
- 原型用 `openDialog(mode, it)` 切換,真實版把 `it` 換成 `kv.urls` 的條目物件。

### 3.2 三種縮圖上傳(spec §5.3)

原型的 `#dropzone` 已綁好三種事件,接手時把「示意」換成真處理:

- **檔案選擇**:click → 開隱藏的 `<input type="file" accept="image/*">`。
- **拖拉**:`dragover` / `drop`(原型已有 `.dragover` highlight)。
- **貼上**:`paste` 事件讀 `clipboardData.items`(原型用 window paste 示意)。

三者拿到 `File`/`Blob` 後統一走 spec §5.3 的處理:canvas resize 最長邊 400px → WEBP q0.8 → 目標 <50KB
→ 存 `thumbs/{sha1(url).slice(0,12)}.webp`。

### 3.3 儲存流程(讀-改-寫,spec §6.4 / §6.7)

⚠️ **不要**用 cache 整份重生 markdown。每次 CRUD 都要:
讀磁碟 `links.md` → re-parse(順便更新 cache)→ 改記憶體中**單一條目** → 序列化寫回(temp + rename)→ 更新 `kv.urls` → 重繪。
這條路同時吃進 VS Code 對其他條目的外部修改(spec §6.7)。

edit / delete 找不到原條目時的處理見 spec §6.5 步驟 4、§6.6 步驟 2(跳通知 + 強制 refresh)。

---

## 4. URL 卡片 vs 本機卡片:差在哪

| | 本機檔案 `.card.local` | URL `.card.url` |
| --- | --- | --- |
| 縮圖 | PDF.js render / 圖片縮圖(IndexedDB `thumbs`) | youtube auto-thumb / `thumbs/xxx.webp` / fallback `favicon.png` |
| badge | PDF(綠)/ JPG 等(藍 `image`) | 固定「連結」(藍 `url`) |
| 編輯/刪除 | **無**(完全唯讀,spec Q4) | 有(`.card-actions`,hover 浮出) |
| label 第二行 | 檔案大小 | 來源網域(host) |
| 點卡片 | blob URL 開新分頁 | `window.open(url)` 開連結 |
| 進燈箱「開啟」 | `openFile()` 取 handle | 直接開 URL,不需 handle |

⚠️ 接 `openFile()` 時要**分流**:URL 條目沒有 file handle,直接 `window.open(it.url)`。

---

## 5. 縮圖來源優先序(spec §5.1,接手照做)

1. markdown `thumb:` 指定值(`youtube:xxx` 或 `thumbs/xxx.webp`)
2. URL 偵測到 YouTube → `https://img.youtube.com/vi/{id}/hqdefault.jpg`
3. fallback → repo 內 `favicon.png`

`thumbs/xxx.webp` 在 cache-first 開 app 時需要時才向 `dirHandle` 要授權(spec §6.1 步驟 2);
`youtube:` 與 `favicon.png` 不需授權可直接 `<img>`。

---

## 6. 樣式遵循的既有規範(別破壞)

- **毛玻璃(`backdrop-filter`)**只准在 header / `.btn` / `#search` / `.dock-btn` / `.expand`。
  新增的卡片、對話框、toast、燈箱**都不用**(About.md §4.4)。對話框遮罩沿用燈箱的 `color-mix` 深綠。
- 圓角一律 4px;字體三套襯線(別換 sans-serif);動效 ease-out 不彈跳,且 `prefers-reduced-motion` 要關掉。
- 新增鈕用 **primary 綠調色 + 圖標 +「新增網址」文字**(非全寬,自身寬度),保留「呼吸光暈(`addGlow`)+
  金屬掃光(`addSheen`)」動畫吸睛,呼應既有 primary 鈕的「拋光金屬」語言;`hover` 時動畫停止回歸一般互動,
  reduced-motion 下被全域規則停掉。**這是唯一一處視覺主張,其他地方保持安靜**——若覺得太強,先調 `addSheen` 頻率(目前 5s)或拿掉掃光只留光暈。
- URL 用藍色 `--accent2`、本機用綠色 `--accent`,是刻意的來源區隔,沿用既有 image badge 的藍。

---

## 7. 已拍板的互動決定(原型已照做)

1. **URL 進幻燈片/燈箱**(已定)。`visibleItems()` 不過濾來源,URL 縮圖也能放大;但燈箱「開啟」與點卡片都分流成開連結。
2. **卡片點擊分流**(已定):點**放大鏡**(`.expand`)→ 進燈箱;點**卡片其他地方**→ 另開視窗(本機=新分頁開檔、URL=開連結)。
   接 `index.html` 時沿用既有 `card.onclick = openFile`、`expand.onclick = openViewer` 的分工,URL 在 `openFile` 內分流成 `window.open(url)`。
3. **URL badge 固定顯示「連結」**(已定),不顯示平台名;網域(host)放在 label 第二行。
4. **標題非必填**(已定):欄位排在網址之後,留空就用網域當顯示名稱。

### 仍建議你順手決定

- **來源篩選鈕要不要記憶?** 原型沒存。建議跟 `wlib-size` / `wlib-sort` 一樣存 `localStorage["wlib-source"]`,開 app 沿用上次選擇。

---

## 8. 一句話總結資料模型(接手前對齊)

`links.md` 是 URL 條目的唯一真相;`kv.urls` 只是 read-side cache + 災難復原副本(spec §8.1)。
本機檔案完全沿用 About.md §5,與 URL **無耦合**——這次新加的東西都是「並行的第二條線」,不要把兩者綁在一起。
