# Spec：URL 收藏功能

> 本文件是下一輪開發的需求說明書。給接手的開發者／AI agent 看的;和 About.md 同一風格。
> About.md 描述「現在已經做了什麼」,url-spec.md 描述「接下來要做什麼」。

---

## 1. 目的

在現有的本機檔案瀏覽器基礎上,加入「網頁／影音連結」資料庫。URL metadata 以 **Markdown 格式儲存在使用者選的資料夾根目錄**(`links.md`),作為 URL 條目的**唯一真相來源**(single source of truth)。

本機檔案(PDF / 圖片)**不進 markdown**,維持 About.md 既有「掃資料夾直出」的設計。

---

## 2. 範圍

### 此次涵蓋

1. URL 條目的新增、顯示、編輯、刪除、點擊開啟(此處「URL」一律指網頁 / 影音的 `https://...`)
2. 縮圖:使用者手動上傳(檔案選擇、拖拉、剪貼簿三種方式) + YouTube 自動推算
3. Markdown 格式儲存與解析
4. **Cache-first 架構**:開 app 從 IndexedDB cache 直出,使用者按「重新整理」才重讀 markdown + 掃資料夾
5. Markdown 損毀時的**自動還原**流程(從 IndexedDB cache 重建)
6. **UI/UX 提示**:在介面上提醒使用者「資料夾有變動就按重新整理」

### 此次「不」做

1. **標籤系統**(URL 跟本機檔案皆不做。Markdown 解析器保留「不認識欄位原樣保留」彈性,讓未來 tag 系統能在 links.md 加 `- tags:` 欄位而不破壞舊資料。列入 About.md §10 todo)
2. **本機檔案進 markdown**(這次明確不做;本機檔案沿用 About.md §5 設計,完全唯讀)
3. **URL 分組 / 分類 UI**(Markdown 純粹是 flat list,不做 `##` 分組)
4. og:image 自動抓取(架構上跟 file:// 互斥)
5. Bilibili / TikTok 自動縮圖(CORS 問題,使用者手動上傳)
6. 主動修復 markdown(壞了自動還原,見 §7)
7. 本機檔案的自訂縮圖覆寫(PDF / 圖片現有的自動縮圖照舊)
8. **資料夾內備份檔**(rolling `.bak` 等)——不做
9. **匯出 `links.md` 按鈕**——不做
10. **URL 區重置功能**——不做(若使用者真要清空 URL,用 VS Code 手動刪 links.md 內條目)

---

## 3. 檔案結構

```
使用者選的資料夾/
├─ links.md                ← URL 條目的 metadata(唯一真相)
├─ thumbs/                 ← 使用者上傳的 URL 縮圖
│  ├─ a3f8c9d2bc11.webp
│  └─ ...
└─ (使用者原本的 PDF / 圖片)
```

- `links.md` 不存在 → 第一次新增 URL 時自動建立;若 cache 內已有 URL 條目,refresh 時會自動寫回(見 §6.3)
- `thumbs/` 不存在 → 第一次需要存 URL 縮圖時自動建立
- URL 縮圖檔名 = `sha1(url).slice(0, 12) + ".webp"`
- 寫入流程(原子操作,防止寫到一半被中斷):
  1. 寫新內容到 `links.md.tmp`
  2. rename `links.md.tmp` → `links.md`
- **沒有自動備份**。災難復原靠 `IndexedDB.kv.urls` cache(見 §7)

⚠️ 本機檔案的縮圖(PDF 第一頁 render、圖片縮圖)**仍然只存在 IndexedDB**(沿用 About.md §5 設計),不寫到 `thumbs/` 資料夾。原因見 §5.4。

---

## 4. Markdown 格式

```markdown
# Yarn Library URLs

- [Lace Knitting Basics](https://www.youtube.com/watch?v=abc12345678)
  - thumb: youtube:abc12345678
  - added: 2026-06-17

- [Sock Heel Walkthrough](https://www.bilibili.com/video/BV1xx411c7mD)
  - thumb: thumbs/a3f8c9d2bc11.webp
  - added: 2026-06-17

- [Spring Cardigan](https://someblog.com/spring-cardigan)
  - added: 2026-06-18
```

### 4.1 結構說明

| Markdown 元素 | 角色 | 必填 |
|---|---|---|
| `# 標題` | 文件標題(顯示用,可省略) | 否 |
| `- [Title](url)` | 一筆 URL 條目;`url` 含 `://` | **是** |
| `- thumb: ...` | 縮圖來源(見 §5) | 否 |
| `- added: YYYY-MM-DD` | 加入日期 | 否 |

**順序**:Markdown 內條目順序 = 加入順序(append 到尾巴)。畫面顯示時可由使用者用現有的排序選項重排,但不會寫回 markdown。

### 4.2 解析容錯

- 縮排寬容(2 / 4 空白 / tab 都接受)
- 區段順序、空行不影響
- 找不到的欄位 → 用預設值,不報錯
- 找不到 `[](url)` 或 `url` 不含 `://` → skip 該行 + console warning
- **不認識的欄位 → 保留原樣,再寫回時不丟**(給未來新欄位留路,例如未來 tag 系統的 `- tags: #a #b`)

---

## 5. 縮圖規則

### 5.1 URL 條目的縮圖來源優先序

1. Markdown 的 `thumb:` 欄位指定值
2. 從 URL 偵測到的已知平台(目前只有 YouTube),組縮圖網址
3. **fallback**:repo 內既有的 `favicon.png`

### 5.2 已知平台自動組縮圖(第一版只做 YouTube)

| 平台 | URL 偵測 pattern | 縮圖規則 | 第一版 |
|---|---|---|---|
| YouTube | `youtube.com/watch?v=` / `youtu.be/` / `youtube.com/embed/` | `https://img.youtube.com/vi/{id}/hqdefault.jpg` | ✅ 做 |
| Bilibili | `bilibili.com/video/BV...` | 需 oEmbed API,CORS 通常被擋 | ❌ |
| TikTok | `tiktok.com/@{user}/video/{id}` | oEmbed 同上 | ❌ |

⚠️ Bilibili / TikTok 不做自動縮圖——使用者貼上後若不手動上傳就顯示 `favicon.png`。

### 5.3 使用者上傳 URL 縮圖

**三種輸入方式都要支援**:

1. **檔案選擇**:對話框內按鈕,開系統檔案選擇器
2. **拖拉**:把圖片檔拖到對話框 → `drop` 事件處理
3. **剪貼簿貼上**:Ctrl+V → `navigator.clipboard.read()` 讀剪貼簿,接受 image 類型

接受格式:JPEG / PNG / WEBP / GIF

處理:
- 用 canvas resize 到**最長邊 400px**
- 轉 WEBP,quality 0.8
- 目標大小:< 50KB
- 儲存:`thumbs/{sha1(url).slice(0,12)}.webp`

### 5.4 本機檔案的縮圖(沿用 About.md §5)

維持現狀,完全不動:
- PDF 第一頁靠 PDF.js render
- 圖片靠 canvas downscale
- 結果存 IndexedDB 的 `thumbs` store,**不寫到資料夾的 `thumbs/`**

理由:
- 數量多(每個 PDF / 圖片都要),寫到 `thumbs/` 會把資料夾搞得很亂
- 都能隨時重生(成本可控),所以「磁碟存」沒額外價值
- 跟 URL 上傳的縮圖區隔開,語意更清楚:`thumbs/` 是「使用者選擇要存的圖」,IndexedDB 是「app 自動生成的快取」

---

## 6. 資料流

> 設計原則:**沿用既有的 cache-first 架構**。開 app 從 IndexedDB cache 直出,不碰資料夾;任何掃描 / 寫入只在使用者明確操作時觸發。
>
> 本機檔案的部分完全沿用 About.md §5(讀 `kv.items` 直出 / refresh 時掃資料夾),URL 的部分是這次新加的、獨立並行。兩者沒有耦合。

### 6.1 開啟 app(cache-first,不掃資料夾)

```
1. 讀 IndexedDB.kv.items → 本機檔案陣列(About.md 既有機制)
   讀 IndexedDB.kv.urls  → URL 條目陣列
2. 合併渲染:
   - 本機檔案縮圖從 IndexedDB.thumbs 取
   - URL 縮圖:youtube:xxx 直接 <img>;thumbs/xxx.webp 需要時才向 dirHandle 要授權
3. 讀 IndexedDB.kv.dir 備用(給「重新整理」、「新增 URL」、「開啟檔案」用)
4. 兩個 cache 都空 → 顯示首頁說明,等使用者選資料夾(走 §6.2)
```

**這一步不需要資料夾權限,所以不會跳授權框。** 跟 About.md §5 的設計一致。

### 6.2 首次設定(沒有 IndexedDB cache)

```
1. 使用者點「選資料夾」→ showDirectoryPicker → 取得 dirHandle
2. 掃資料夾本機檔案 → 寫 kv.items(About.md 既有流程)
3. 讀 dirHandle 內的 links.md
   - 存在 + parse 成功 → 寫 kv.urls
   - 存在 + parse 失敗 → 走 §7 災難復原(此時 cache 空,等同 URL 區為空)
   - 不存在 → URL 區為空,等使用者新增
4. 渲染
```

### 6.3 使用者按「重新整理」

```
1. 取既有 dirHandle,嘗試讀資料夾
   - dirHandle 失效 / 授權被撤回 → 跳一次授權請求,使用者拒絕 → 中止流程
   - 資料夾整個讀不到(例如外接硬碟拔了、資料夾被刪 / 改名 / 移動)
       → 顯示「找不到資料夾,請確認資料夾是否仍可存取」
       → **完全不動 links.md 跟 cache**
       → 中止流程
2. 掃資料夾本機檔案(About.md 既有的「重新整理」掃描流程,只補畫新 / 變動的封面)→ 更新 kv.items
3. 讀 links.md
   - 存在 + parse 成功 → 更新 kv.urls
   - 存在 + parse 失敗 → 走 §7 災難復原(自動從 kv.urls cache 還原)
   - 不存在 → 視為解析失敗同路徑處理(自動從 cache 還原寫回 links.md;cache 空時什麼都不做)
4. 重新渲染
```

⚠️ 步驟 1 的「整個資料夾不見」處理:此時 dirHandle 會失效或讀不到任何檔案。必須提早攔截,顯示明確錯誤,完全不動 markdown / cache,等使用者解決外部問題後再按一次。

⚠️ 步驟 3 的「links.md 不存在 = 視同解析失敗」設計:
- 正常情境(第一次用、從未新增 URL)cache 也是空,所以還原沒動作,等同 URL 區為空
- 異常情境(使用者用檔案總管砍了 links.md)cache 還有資料 → 自動寫回,等於「用 cache 救回 markdown」
- 這個語意統一了「不存在」跟「壞掉」兩種狀況,少一條分支邏輯

### 6.4 使用者新增 URL

```
1. 使用者貼 URL → 偵測平台
2. YouTube → 預覽 auto-thumb;其他 → 預覽 favicon
3. 使用者填:標題(必填)、自訂縮圖(可選,三種上傳方式)
4. 若有上傳縮圖:壓縮 → 寫入 thumbs/{hash}.webp(需要 dirHandle,可能跳授權)
5. 讀 links.md 文字內容並 re-parse(順便更新 cache)
   - 不存在 → 從空 markdown 開始
   - 解析失敗 → 觸發 §7 災難復原,完成後重試本流程
6. 在記憶體中把新條目 append 到尾巴
7. 序列化整份 markdown → 寫回 links.md(temp + rename)
8. 更新 kv.urls cache(用第 6 步合併後的結果)
9. 更新畫面
```

⚠️ 步驟 5~7 是「**讀-改-寫**」模式,確保不會把外部編輯(VS Code 對其他條目的修改)覆寫掉。實作上每次 CRUD 都會走這條,等同自帶迷你 refresh。

### 6.5 使用者編輯 URL 條目

可編輯欄位:標題、URL、縮圖

```
1. 點卡片的「編輯」按鈕 → 開對話框,預填現有資料(來自 cache,可能與磁碟略有差異)
2. 改變 URL:偵測平台、舊縮圖檔(若是 thumbs/xxx.webp)hash 失效
   - 保留舊縮圖檔不刪(避免誤刪),下次手動清理時處理
3. 改變縮圖:同 §6.4 步驟 4
4. 讀 links.md 文字內容並 re-parse(順便更新 cache)
   - 解析失敗 → 觸發 §7 災難復原,完成後重試本流程
   - **找不到原 URL 對應的條目**(被 VS Code 改了 URL 字串 / 刪掉)
     → 跳通知「此條目已被外部修改或刪除,請確認後重做」
     → 取消本次編輯,強制重新整理顯示
     → 中止流程
5. 在記憶體中替換對應條目的整個區塊(只動這一條)
6. 序列化整份 markdown → 寫回 links.md(temp + rename)+ 更新 cache
```

⚠️ **「同一條 URL 兩邊同時改」的殘留風險**:如果 VS Code 也剛好在改同一條,使用者的 app 端編輯會以 cache 預填的舊資料為基準,VS Code 對同條的修改會被覆寫。發生機率很低(同條 race),不主動偵測。

⚠️ **本機檔案完全唯讀**:卡片上不出現編輯 / 刪除按鈕。要改檔案請去檔案總管,改完按重新整理同步。

### 6.6 使用者刪除 URL 條目

```
1. 點「刪除」→ 二次確認
2. 讀 links.md 文字內容並 re-parse(順便更新 cache)
   - 解析失敗 → 觸發 §7 災難復原,完成後重試本流程
   - **找不到原 URL 對應的條目**(已被外部刪除)
     → 不報錯,跳通知「此條目已被外部刪除,顯示已同步」
     → 強制重新整理 → 中止流程(後續步驟不需執行)
3. 在記憶體中移除對應條目區塊
4. 序列化整份 markdown → 寫回 links.md(temp + rename)
5. dirHandle.removeEntry 掉 thumbs/{hash}.webp(若該條目有用 thumbs/xxx.webp)
6. 更新 cache + 畫面
```

(本機檔案沒有刪除按鈕,同 §6.5)

### 6.7 同步策略

- **`links.md` 是 URL 條目的唯一真相;`IndexedDB.kv.urls` 是 read-side cache**
- **寫入路徑(讀-改-寫模式)**:每次 CRUD 先讀磁碟 markdown、re-parse 更新 cache、改記憶體中的單一條目、寫回。**不會**用 cache 整個重生 markdown
  - 副作用(有意為之):每次 CRUD 都會順便 re-parse,等同自帶迷你 refresh,cache 自然保持新鮮
- **讀入路徑**:refresh 時 markdown → cache 整個覆蓋
- 不做 file watch(瀏覽器辦不到)
- 使用者中途用 VS Code 改了 `links.md`:
  - 對「其他條目」的修改:在使用者下次 CRUD 時自動保留(讀-改-寫機制不會覆寫到不相干的條目)
  - 要在 UI 上看到 VS Code 的變動:仍需按「重新整理」刷新顯示
- **cache 順便提供災難復原**:即使 markdown 壞掉,IndexedDB 裡仍有上次成功 parse 的 URL 條目,自動還原機制可從這裡撈回(見 §7)

⚠️ **殘留的邊角案例**:

1. **同一條 URL 兩邊同時編輯**(罕見):
   - app 內編輯對話框預填的是 cache 的舊版本,使用者改完存 → 寫回時以 app 端為準,VS Code 對同條的修改被覆寫
   - 不主動偵測;靠 UI 教學提醒使用者外部編輯後刷新顯示

2. **CRUD 目標在磁碟上找不到**(VS Code 改了 URL 字串 / 刪了該條):
   - 編輯:跳通知 + 取消 + 強制 refresh(§6.5 步驟 4)
   - 刪除:跳通知 + 視為已刪除 + 強制 refresh(§6.6 步驟 2)

本機檔案部分沿用 About.md §5 設計,與 URL 條目無耦合。

---

## 7. 錯誤與重置機制

> ✅ **已實作,行為真相見 `broken-file-recovery-spec.md`**。本節原以「parse 失敗會 throw → 走 `.broken`」為前提;實際上 `parseLinks` 逐行容錯、**永不 throw**。因此本節所有「解析失敗／損毀」一律指「**整份壞掉**」＝**磁碟有內容、卻 0 筆可解析**(`entries` 為空且 `dropped > 0`)這一種;**只壞一兩行不在此列**(容錯靜默略過、不備份、無 toast,§D2)。備份(改名 `.broken`)失敗則中止不覆蓋原檔(§D4);外來(別資料夾)快取靠 `kv.urlsDir` 戳記擋掉、不寫回(§D3)。

### 7.1 Markdown 整份損毀 / 不存在

- **本機檔案區照常顯示**——它們不依賴 markdown(直接掃資料夾就有)
- **URL 區走自動還原**(見 §7.2),不彈對話框讓使用者選
- **只壞一兩行不觸發還原**:該行容錯靜默略過、其餘正常顯示(手動改完 md 請按重新整理確認東西都在,§D2)

### 7.2 自動還原流程

當 `links.md` **整份壞掉**(有內容卻 0 筆可解析)或**不存在但同資料夾 cache 非空**時,**自動執行**,不阻斷使用者:

```
1. 若 links.md 存在(整份壞):改名為 links.md.broken-{timestamp}
   改名失敗 → 中止,不覆蓋原檔,提示使用者手動複製一份(§D4)
   若 links.md 不存在:跳過這步
2. 從 IndexedDB.kv.urls 拿上次成功 parse 的條目(先用 kv.urlsDir 戳記確認是「同資料夾」,§D3)
   - 同資料夾且非空 → 用這份重建 links.md(temp + rename),渲染
   - 空 / 外來 → 不寫回,URL 區為空(壞檔已留 .broken;外來快取不污染新資料夾)
3. thumbs/ 內的縮圖檔保留(因為對應的 URL 條目從 cache 救回來了,sha1 仍對得上)
4. 跳一個**非阻斷的通知**(toast / banner):
   「`links.md` 無法正常讀取,已從快取自動還原。原檔備份於 `links.md.broken-{timestamp}`,如有遺漏可手動恢復。」
   (無可用同資料夾快取時改述「目前沒有可用的快取可還原」)
```

⚠️ **已知 corner case**:使用者在 VS Code 改 markdown 時新增了 URL,那批新 URL **不在 cache 裡會永久失去**。只能救「上次 app 看到的那一份」。`.broken-` 備份檔保留,使用者可手動翻找。

### 7.3 預防

**沒有資料夾內備份**(不做 .bak)。災難復原全靠 §7.2 的 IndexedDB cache。

代價:
- per-origin 限制仍在(換瀏覽器、清快取就沒 cache)
- VS Code 改 markdown 期間新增的 URL 不在 cache 內,壞掉時救不回來
- 真要更保險,使用者可自行用任何工具把 `links.md` 備份到別處(app 不參與)

這個取捨已和使用者確認接受。需要在 UI 上提示使用者重新整理的重要性(見 §11)。

---

## 8. 架構決策

### 8.1 IndexedDB 角色

**新增**:
- `kv.urls`:`links.md` parse 後的 URL 條目陣列。給 cache-first 開 app 用 + 災難復原副本

**保留(About.md 既有,不動)**:
- `kv.items`:本機檔案 scan 結果的快取
- `kv.dir`:dirHandle 序列化儲存
- `thumbs` store:本機檔案封面快取

**`kv.urls` 的職責邊界**(重要):
- 是 **read-side cache**:純粹「上次 markdown parse 的結果存起來」,給開 app 快速渲染用
- 是 **災難復原副本**(順便):markdown 真的壞掉時,從這裡撈回 URL 條目(見 §7.2)
- **不是 source of truth**:所有 CRUD 都走「讀磁碟 markdown → 改記憶體 → 寫回 markdown → 更新 cache」(§6.7 讀-改-寫模式)。**沒有**「先寫 cache,稍後寫 markdown」的路徑
- 因此 cache 在每次 CRUD 後都會自然刷新(順便吃進 VS Code 對其他條目的外部修改)
- **per-origin 限制仍在**:換瀏覽器、清快取 → cache 沒了,但 markdown 還在資料夾,下次開 app 重新 parse 即可

### 8.2 不拆 JS 出 HTML

**這次不拆**,理由:

1. About.md §4.1 hard rule:ES module `import` 會破 file://
2. 改用多個 classic `<script src>` 可行但要管 load order 跟 global namespace,反而更複雜
3. 本次新增 JS 估約 300-450 行(URL CRUD、三種縮圖上傳、parse / serialize、自動還原),全檔加總應仍 < 1700 行,可讀性還行

**未來真要拆**,建議用 classic script 方式(不破 file://):

```html
<script src="lib/markdown.js"></script>   <!-- 暴露 window.MD -->
<script src="lib/thumbs.js"></script>     <!-- 暴露 window.Thumbs -->
<script src="lib/urls.js"></script>       <!-- 暴露 window.URLs -->
<script src="app.js"></script>            <!-- 主邏輯 -->
```

訊號:單檔 > 2000 行、或常常自己改到打結 → 那時再拆。

---

## 9. 已決定事項一覽

| # | 議題 | 決定 |
|---|---|---|
| Q1 | 標籤這次做不做 | 不做(URL 跟本機檔案皆不做)。Markdown 解析器保留「不認識欄位原樣保留」彈性,未來 tag 在 links.md 加 `- tags:` 欄位可平滑擴充。列入 About.md §10 todo |
| Q2 | 檔名 / 資料夾名 | `links.md`(URL 條目)、`thumbs/`(URL 縮圖,不隱藏) |
| Q3 | URL 條目要不要分組 | **不做**。flat list |
| Q4 | 編輯 / 刪除 | URL 條目兩者都做;**本機檔案完全唯讀**,卡片不出現編輯 / 刪除按鈕 |
| Q5 | 縮圖上傳 UI | 三種都做:檔案選擇、拖拉、剪貼簿貼上 |
| Q6 | markdown 損毀的 UX | **整份壞掉**(0 筆可解析)才自動從 IndexedDB **同資料夾** cache 還原 + 跳非阻斷通知 + 保留 `.broken-` 備份(見 §7.2、`broken-file-recovery-spec.md`);備份失敗則中止不覆蓋原檔。**只壞一兩行**容錯略過、不備份。不彈對話框讓使用者選 |
| Q7 | 不認識網域要不要抓 favicon | 不抓第三方服務,直接用 repo 內的 `favicon.png` 當預設 |
| Q8 | 本機檔案要不要進 markdown | **不要**。本機檔案沿用 About.md §5 既有的「掃資料夾直出 + `kv.items` 快取」設計,與 URL 完全解耦 |
| Q9 | 何時掃描資料夾 | **只在使用者按「重新整理」或首次設定時**觸發,不在開 app 時自動掃。保留 cache-first 開 app 速度 |
| Q10 | IndexedDB 角色 | `kv.urls` 是 read-side cache + 災難復原副本;`links.md` 永遠是 source of truth |
| Q11 | 備份策略 | **不做任何資料夾內備份**(沒有 .bak、沒有匯出按鈕)。災難復原全靠 `kv.urls` cache + UI 提示使用者勤按重新整理 |

---

## 10. 開工前最後的確認項

(無)所有議題已決定,參見 §9。

---

## 11. UI / UX 提示

因為**不做任何資料夾內備份**,使用者教育就變很重要。介面上需要設計以下提示:

### 11.1 重新整理按鈕的 UI 提示

「重新整理」這個按鈕在這個 app 裡同時承擔兩件事:**重掃資料夾的本機檔案** + **重讀 `links.md`**。對使用者來說這個雙重職責不直觀,要在多個層次給提示。

#### 11.1.1 Hover tooltip(在按鈕旁,簡短)

```
重新整理:同步資料夾變動 + 重讀 links.md。
在檔案總管 / VS Code 改了東西就按這個。
```

#### 11.1.2「重新整理」動作的即時回饋(每次按)

按下重新整理後,即使沒有任何變化也要給回饋,讓使用者建立「按了 = 有檢查」的信任感。完成後跳一個非阻斷 toast:

```
已重新整理:本機檔案 X 筆、URL Y 筆
(如有變化:新增 N、移除 M)
```

#### 11.1.3 完整的使用教學(onboarding wizard)

詳見 **./onboarding-spec.md**。

簡述:
- 第一次成功選資料夾、首次渲染完成後自動跳一次
- 多步驟對話框,以「資料夾 = 真相」、「重新整理的雙重職責」、「外部編輯 markdown 的處理」、「災難復原」等為核心
- 設定齒輪選單提供「重看使用教學」入口
- 詳細的內容、版本管理、視覺與互動規格寫在 ./onboarding-spec.md

⚠️ 當本 spec 的核心設計變動(refresh 行為、cache 同步方向、災難復原行為等)時,**./onboarding-spec.md §4 的步驟內容也要同步更新**,避免教學跟實際行為不符。

### 11.2 「找不到資料夾」的處理(§6.3 步驟 1)

- 顯示明確錯誤:「資料夾無法存取,可能已被移除、改名,或所在磁碟未連接」
- 提供兩個按鈕:「再試一次」(重跑流程)、「選擇新資料夾」(走 §6.2 首次設定)
- **此時完全不動 markdown 跟 cache**,讓使用者解決外部問題後回來

### 11.3 災難復原的通知(§7.2)

當 `links.md` 自動還原完成:
- 跳**非阻斷的 toast / banner**(不擋使用者繼續操作)
- 文案:「`links.md` 無法正常讀取,已從快取自動還原。原檔備份於 `links.md.broken-{timestamp}`,如有遺漏可手動恢復」(整份壞掉才觸發;只壞一兩行不會跳,見 §7 說明與 `broken-file-recovery-spec.md`)
- 通知可點開展開詳細說明(解釋什麼是 broken 備份、要怎麼手動恢復)
