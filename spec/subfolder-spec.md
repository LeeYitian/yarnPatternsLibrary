# Spec：子資料夾遞迴掃描

> 狀態：方向已定(draft)。本文件只記錄**已定案**的需求與決策；未定項在對話中討論收斂後才回填。
> 與 `About.md`（現況）、`tag-spec.md`（標籤系統／分類）、`url-spec.md`（URL 收藏）同一風格。

---

## 1. 目的

目前 app 只掃「所選資料夾最外層」的檔案（`About.md` §9）。使用者若把編織圖分門別類放進子資料夾（`圍巾/`、`帽子/`、`2024/`），這些檔案不會出現在畫廊。本文件負責安全地遞迴掃描。

分類**不做資料夾分組、不做逐層鑽入**，改由「資料夾路徑 → 自動 tag」承接（見 `tag-spec.md`）。本文件只管「掃進來 + 幫每個檔案帶出相對路徑」，分類 ／ 篩選交給 tag 系統。

---

## 2. 現況與硬限制

> 程式已從單檔 `index.html` 模組化成 `js/*.js`＋`css/style.css`。以下引用皆指模組後位置。

1. **只掃頂層**：`start()` 用 `for await (const entry of handle.values())`，`entry.kind !== "file"` 直接 `continue`（`js/folder.js`）。
2. **item 以「檔名」為唯一 key**：
   - 差異統計 `new Set(items.map(it => it.name))`（`js/folder.js`）。
   - 封面快取 key `` const thumbKey = it => `${it.name}|${it.size}|${it.lastModified}|w${THUMB_W}` ``（`js/state.js`）。
   - 命名衝突：`圍巾/pattern.pdf` 與 `帽子/pattern.pdf` 同名，會在差異統計與封面快取上互相蓋掉（貼錯封面、diff 算錯）。
3. **openFile 快取重載走頂層 handle**：`dirHandle.getFileHandle(it.name)`（`js/gallery.js`），只找得到頂層檔案。
4. **快取清單 `kv.items` 只存 `{name, ext, type, size, lastModified}`**（不含 path；寫在 `js/folder.js` `persistItems()`、讀在 `js/main.js` `init()`）。

---

## 3. 已定方向

- **掃描**：遞迴所有子孫資料夾，攤平成單一畫廊（不分區塊、不鑽入）。
- **分類**：每個檔案的相對資料夾路徑轉成自動 tag（`圍巾/蕾絲/scarf.pdf` → `圍巾`、`蕾絲`），細節見 `tag-spec.md`。
- 否決「依資料夾分組」「逐層鑽入」「一層 opt-in」：分類已由 tag 承接，版面不需再表現階層。

---

## 4. 必解工程項

1. **遞迴走訪**：`start()` 頂層迴圈改遞迴——遇 `entry.kind === "directory"` 就進去，遇 file 照舊判副檔名。
2. **帶出相對路徑**：每個 item 新增 `path` 欄位＝從所選根到該檔的相對路徑（例 `圍巾/蕾絲/scarf.pdf`）。**頂層檔案的 `path` 剛好等於檔名**（不加 `./`、不加前導 `/`）。
3. **key 全面改成含路徑**（解 §2.2 命名衝突）：item 唯一 key、差異統計 Set、封面快取 key 皆改用 `path`。
4. **openFile 巢狀重載**：沿 `path` 逐段 `getDirectoryHandle(seg)`、最後 `getFileHandle(fileName)`。
5. **`kv.items` 相容**：新增 `path` 欄位；載入舊快取（無 path）時 fallback `path = name`。
6. **錯誤處理**：遞迴進每個子資料夾用獨立 try/catch，單一子資料夾讀取失敗則略過該分支、繼續掃其他分支；**只有連根資料夾都讀不到**才走 `folderError()`。現有「任一步出錯即整場中止」的語意與錯誤文案一併改寫。
7. **遞迴終點**：靠天然 base case（資料夾無子資料夾即停）；**不設**人工深度 ／ 數量上限。

---

## 5. 上線相容（migration）

網頁已上線，既有使用者瀏覽器裡的 `kv.items`、`thumbs` 封面快取皆為舊格式（無 `path`）。導入 `path` 的相容要求：

1. **一律用 `it.path || it.name`** 取代裸 `it.name`（thumbKey、差異統計 Set、openFile 三處）。舊快取無 `path` → fallback 成 `name`（等同頂層）。
2. **openFile 必須 fallback**：直接 `getFileHandle(undefined)` 會丟 `TypeError`；有 fallback 才不會「無法開啟檔案」。
3. **頂層 `path` 等於檔名**（§4.2）使舊封面快取 key 與新 key 對頂層檔案完全相同 → **快取命中、封面不重畫**；只有子資料夾的新檔第一次產生封面。
4. **不需 IndexedDB 升版**：`thumbs`／`kv` store 結構未變，只是 value 物件多一欄位。沿用 `About.md` §5「避免動版本」原則。
5. cache-first 的 `init()` 仍吃舊 `kv.items`（頂層清單），**子資料夾要按一次「重新整理」才掃出來**——需主動告知（§6）。

---

## 6. 上線後主動告知

多層資料夾與 tag 要「按一次重新整理」才生效（§5.5），上線後以**一次性 toast** 提示既有使用者重新整理以啟用多層資料夾與 tag，toast 附一顆直接觸發重新整理的按鈕。（觸發條件、去重旗標、文案細節待對話定案。）

---

## 6a. 掃描進度回饋

掃描階段**不做 loading 遮罩 ／ 阻斷畫面**（會擋住操作、也看不到進度）。沿用現有機制：`#status` 顯示階段文字，封面階段顯示計數「產生封面… x/N」，讓使用者靠**封面漸進長出**感受進度。

---

## 7. 與現有軸線的交互

攤平、不分組，故：排序（檔名 ↔ 時間軸）、來源篩選（全部 ／ 本機 ／ 網址）、搜尋行為不變，只是現在也涵蓋子資料夾的檔案。tag 篩選見 `tag-spec.md`。

---

## 8. 排除清單

遞迴時**必須跳過**：

1. **app 自己管理的檔案 ／ 資料夾**：`thumbs/`、`links.md`、`links.md.broken-*`、未來的 `files.md`——否則會把自身縮圖等當成內容掃進畫廊。
2. **`.` 開頭的隱藏 ／ 系統資料夾**（`.git`、`.obsidian` 等）——避免掃進版控 ／ 工具目錄。

---

## 9. 已決定事項一覽

| #   | 議題          | 決定                                                                                            |
| --- | ------------- | ----------------------------------------------------------------------------------------------- |
| S1  | 掃描範圍      | 攤平全遞迴（掃所有子孫檔案，攤成單一畫廊）                                                      |
| S2  | 結構如何呈現  | 不分組、不鑽入；資料夾路徑改由 tag 承接（`tag-spec.md`）                                        |
| S3  | item 唯一 key | `name` → 相對路徑 `path`（順帶解命名衝突）                                                      |
| S4  | 頂層 path     | 剛好等於檔名（使舊封面快取命中、不重畫）                                                        |
| S5  | openFile      | 沿 `path` 逐段 `getDirectoryHandle` → `getFileHandle`；無 path 時 fallback 檔名                 |
| S6  | 舊快取相容    | `it.path \|\| it.name`；`kv.items` 無 path → 視為頂層；不需 IndexedDB 升版                      |
| S7  | 排除清單      | `thumbs/`、`links.md`、`links.md.broken-*`、`files.md`；`.` 開頭隱藏 ／ 系統資料夾（`.git` 等） |
| S8  | 上線告知      | 一次性 toast 提示既有使用者重新整理以啟用多層＋tag                                              |
| S9  | 錯誤處理      | per-子資料夾 try/catch 略過失敗分支、繼續掃；僅根資料夾讀不到才 `folderError()`；錯誤文案改寫   |
| S10 | 遞迴終點      | 天然 base case（無子資料夾即停）；不設人工深度 ／ 數量上限                                      |
| S11 | 掃描回饋      | 不做 loading 遮罩；沿用 `#status` 文字 + 漸進封面（掃久也能看封面長出）                         |

---

## 9a. 教學文案（onboarding；實作時才逐字移入 `js/constants.js`）

> 對應 `onboarding-spec.md` §9.3 的 Step 1a 文案修改；本處為草稿真相。語氣 ／ 格式沿用 `constants.js` 既有 `OB_SCREENS`。

**Step 1a「檔案和網址兩種收藏」的「檔案」段**——把原本「只讀一層、不讀子資料夾」改為支援多層：

- 徽章：👀 看過就好

```
PDF ／ 圖片檔案：
→ 以資料夾裡實際有的檔案為準
→ 連同子資料夾裡的檔案都會讀，全部檔案的預覽圖都會一起顯示
→ 動了資料夾中的檔案（新增／改名／刪掉），要按「重新整理」才會跟著更新
```

（僅第 2 行由「→ 只讀一層資料夾，不會讀子資料夾裡的檔案」改成上述；其餘不動。）

---

## 10. 與其他 spec 的關係

- **`tag-spec.md`**：本文件帶出的 `path`，是 tag 系統「資料夾→tag」的輸入。兩份一起設計。
- **`About.md` §9**：「只掃頂層、不遞迴」限制，實作後移除 ／ 改寫。
- **`onboarding-spec.md` §4 Step 1a**：教學「只讀一層資料夾，不會讀子資料夾」上線後必須同步改（onboarding §7.3 維護義務）。
