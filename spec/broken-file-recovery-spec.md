# Spec：壞檔守門與快取資料夾戳記（links.md／files.md 災難復原）

> ✅ **狀態：已實作**（v1.8.2）。程式在 `js/urls.js`、`js/files.js`、`js/folder.js`、`js/main.js`；
> 本文件同時是「當初的實作計畫」與「行為真相 + 後續維護依據」。
>
> 前身脈絡：`About.md` §10 當初記錄的壞檔行為調查（詳版已整理進本檔 §1）。本次把該調查列的
> 「後續要做」落地：走 (a) 守門，並對「壞一行」誠實接受 (b)。

---

## 1. 背景：修正前的行為（與舊 spec 宣稱不符）

`links.md`／`files.md` 是資料的**唯一真相**，`kv.urls`／`kv.files` 只是顯示快取＋復原副本。
但 `parseLinks`／`parseFiles` 是**逐行、容錯、永不 throw** 的解析器，導致舊 spec 宣稱的
「`.broken` 自動備份」在**內容壞掉**時根本不會觸發：

- **壞一行／幾行**（其餘合格式）：壞行被靜默丟棄，其餘正常。無錯誤、無 toast、無 `.broken`。
  下一次任何 CRUD re-parse 磁碟只把成功 parse 的部分寫回 → 那幾行永久消失、無備份。
- **整份壞**（無一行合格式）：`parse` 回空陣列（非錯誤）→ 顯示 0 筆，且**空結果覆蓋 `kv` 快取**，
  連復原副本一起清空；壞檔留在磁碟到下次 CRUD 被覆寫為止。
- 真正會觸發的復原只有「檔案**遺失／讀不到**（NotFound／權限）→ 從 `kv` 快取還原」。

此外，「換資料夾」有一條路徑（`folderError` 的「選擇新資料夾」→ `start(true)`）**沒有清快取**，
`kv` 仍握著舊資料夾的資料，`recoverX` 會把**舊資料夾的收藏寫進新資料夾的真相檔**（跨資料夾污染，
正是 `folder-switch-spec` §1 point 2 要防的）。

---

## 2. 共識（不變式）

1. `files.md`／`links.md` 是資料唯一來源。
2. 災難復原**不得**把「錯誤的快取」寫回真相檔，造成使用者資料遺失或被污染。
3. 就算復原失敗或發生未考慮情況，導致真相檔被污染／遺失，**至少要保證留下上一份紀錄的 `.broken` 檔**。

---

## 3. 設計決策

| # | 決策 | 說明 |
|---|---|---|
| **D1** | 壞檔判定 | 只在「parse 出 **0 筆**、且 raw 含**無法辨識的有意義行**（`dropped > 0`）」時判為壞檔。純表頭／`#` 註解／空白＝合法的空收藏，**不觸發** `.broken`（否則 `serialize*` 一定寫的表頭會讓每個空檔每次載入都被誤改名）。 |
| **D2** | 壞一行 | 維持容錯、靜默丟棄、`console.warn`，**不承諾備份**。parser 無法區分「使用者刪了一行」與「打錯一行」，讀-改-寫循環下難以保住，誠實接受。 |
| **D3** | 快取戳記 | `kv.urls`／`kv.files` 各配一個戳記 key `kv.urlsDir`／`kv.filesDir`（存當前 `dirHandle`）。`recoverX` 寫回前用 `isSameEntry` 比對；**有戳記且不符＝外來 → 視同空快取，絕不寫回**。**缺戳記＝相容信任**（舊使用者，見 D5 遷移）。 |
| **D4** | 備份最高優先 | 偵測到壞檔 → **先**改名 `.broken`。**改名失敗就絕不 `writeText` 覆蓋原檔**：丟 `BrokenBackupError` 中止。載入路徑接住並提示手動備份；寫入路徑由既有 UI `try/catch` 中止本次儲存。 |
| **D5** | 儲存結構 | 不改 `kv.urls`／`kv.files` 的陣列形狀（避免動到 `init`/render 的讀取端），另加 `kv.urlsDir`／`kv.filesDir` 兩個 key。既有使用者於 `init` 用當時的 `kv.dir` 回填戳記（歷史上兩份快取必然寫於 `kv.dir`，回填必正確；只加 key、不動快取內容、不碰任何 md）。 |

---

## 4. 實作（Phase 對照）

- **Phase 1**：`parseLinks`／`parseFiles` 回傳 `{ entries, dropped }`；`dropped`＝非空、非 `#` 標題、
  卻既不成條目也不成欄位的行數。
- **Phase 2**：`loadUrls`／`loadFiles` 於 `entries.length===0 && dropped>0` 走 `recoverX(true)`。
- **Phase 3**：`recoverUrls`／`recoverFiles` 讀快取 + 戳記，`cacheFolderMatches()` 判外來（外來→視同空）；
  `brokenExists` 先改名 `.broken`，失敗丟 `BrokenBackupError`；只有「同資料夾、非空」快取才寫回真相檔
  （沿用 `if (cached.length)` 不變式）。
- **Phase 4**：`reparseForWrite`／`reparseFilesForWrite` 同樣套 D1 守門——CRUD 當下若磁碟整份壞，
  先 `.broken` + 同資料夾快取還原，再讓呼叫端在還原結果上套用本次編輯（否則寫回會把壞檔覆蓋成只剩剛編一筆）。
- **Phase 5**：`persistUrls`／`persistFiles` 寫快取時一併 `DB.set` 戳記；`cacheFolderMatches` 用 `isSameEntry`
  比對，例外或缺 `dirHandle` 保守視為外來。
- **Phase 6**：`folder.js` 抽出 `clearFolderCache()`（清 `thumbs`/`items`/`urls`/`files`/`urlsDir`/`filesDir`）；
  `rechooseFolder` 沿用；`folderError` 的「選擇新資料夾」改走 `rechooseFolder`（含清快取），堵住無清快取那條路。
- **Phase 7**：`main.js` `init()` 回填舊使用者戳記。
- **Phase 8**：文件收斂（本檔 + `About.md` §10／§6.1、`url-spec.md` §7、`tag-spec.md` §6.1、
  `folder-switch-spec.md` §7.4／F12、`onboarding-spec.md` §9.6），並把「links.md 壞掉」教學步以誠實版本寫回。

---

## 5. 戳記 × 清快取：為何兩者都要（互補）

戳記本身**無法**辨識資料夾——`kv.*` 是單一 per-origin key，靠 `isSameEntry` 比對存下來的 handle。
兩道防線覆蓋不同族群：

- **戳記**：保護「已蓋戳記」的快取於**所有**路徑（含未來新增的、忘記清快取的路徑）。
- **清快取（含 folderError 路徑修正）**：保護「尚未蓋戳記的舊快取」於唯一沒清的那條路徑，
  直到它於下次成功 `persist` 時被蓋上戳記為止。
- **遷移回填**（Phase 7）：讓舊使用者一開 app 就升級成「有戳記」，連 folderError 路徑也立即受保護。

### 換資料夾 A→B、B 的 md 壞掉（守門下的行為）
1. `rechooseFolder` step 1 `clearFolderCache()` → 快取已空。
2. `loadUrls` 讀 B 壞 md → `dropped>0` → `recoverUrls(true)`。
3. 快取空 → `cached=[]`；`brokenExists` 先把 B 的 md 改名 `.broken`（**原 bytes 完整保留**）；
   `cached.length` 為 0 → **不寫回**任何 md。B 的壞資料進 `.broken`、不會變空、CRUD 也碰不到它。

---

## 6. 未涵蓋 / 已接受的限制

- **壞一行**（D2）：仍會靜默丟棄、無 `.broken`。onboarding 與 `url-spec.md` 已誠實載明「手動改 md
  只改壞幾行可能被略過，改完請按重新整理確認」。
- 無資料夾內 `.bak`／匯出；復原仍全靠 `kv` 快取 + `.broken` 備份 + 使用者勤按重新整理。

---

## 7. 驗證

- **已自動驗證**（載入頁面 + console eval）：
  - `parseLinks`／`parseFiles` 的 `{entries, dropped}`：合法非空、**合法空（只有表頭）→ dropped 0 不誤判**、
    整份壞→dropped>0、壞一行→entries 保留、無效 URL 行→dropped>0；兩檔對稱。
  - `cacheFolderMatches`：無戳記→true、無 dirHandle→false、isSameEntry true/false/throw 分別 true/false/false。
  - `OB_SCREENS` 完整性：macro 1–8 連續、新步在 macro 2、`OB_TAG_MACRO=4`、無 console error。
- **需手動驗證**（需真實資料夾授權、原生 picker，無法自動化）：整份壞→`.broken` 生成且原 bytes 完整、
  CRUD 後不覆蓋 `.broken`；A→B 壞檔不外洩；A 拔碟→folderError→選 B（B 無 md）不再把 A 寫進 B；
  舊使用者回填後救援不退化；改名失敗→不覆蓋原檔＋提示手動備份。

---

## 8. 後續維護義務

- **任何新增的「與資料夾綁定的 `kv` key」**都要：(1) 補進 `clearFolderCache()`；(2) 若它是「真相檔的復原副本」，
  比照加戳記與 `cacheFolderMatches` 守門。
- 若改動 `parseLinks`／`parseFiles` 使其**會 throw**，`loadX`／`reparseXForWrite` 的守門要一併重評。
- `.broken` 敘述若再變動（例如壞一行也做備份），要回頭同步 onboarding「links.md 壞掉」步與各 spec。
