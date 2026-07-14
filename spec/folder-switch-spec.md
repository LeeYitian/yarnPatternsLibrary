# Spec：更換資料夾流程

> 本文件是「使用者按下『更換資料夾』之後，app 該如何處理舊狀態、確認新資料夾、清快取」的需求說明書。
> 與 `onboarding-spec.md`（事前教育）、`url-spec.md`（URL 收藏行為）平行。
> 本文件處理的是「事中的互動」：使用者實際點下按鈕到完成切換的這段過程。

---

## 1. 目的

確保使用者切換資料夾時：

1. **不會把兩個資料夾的內容混在一起**（舊資料夾的封面快取殘留在 IndexedDB，新資料夾掃出來時混雜顯示）
2. **不會把舊資料夾的 URL 收藏「外洩」到新資料夾**（current code `recoverUrls(false)` 在新資料夾無 `links.md` 時會把 `kv/urls` cache 寫回 → 寫進新資料夾根目錄）
3. **不會誤刪使用者的資料**（舊資料夾的 `links.md`、`thumbs/`、PDF / 圖片都不動）
4. **不會在使用者誤觸時直接清空狀態**（要有 confirm 機會反悔；confirm 文案會明確告知「會清掉快取」，使用者確認後即視為接受清掉的結果）
5. **不會用「剛清空的 IndexedDB cache」覆蓋掉新資料夾本來就有的 `links.md`**（若新資料夾本身有 `links.md` 和 `thumbs/`，必須直接使用、不可覆寫）

---

## 2. 範圍

### 此次涵蓋

1. 「更換資料夾」按鈕的觸發流程（picker → isSameEntry → confirm → 切換）
2. Confirm dialog 的設計與文案
3. **IndexedDB 清快取 + 換 handle 的執行順序**（this is the critical bit；錯誤順序會造成資料污染或半殘狀態）
4. 邊界情境：picker 取消、選到同一個資料夾、IndexedDB 寫入失敗、新資料夾權限只給 read 不給 write

### 此次「不」做

1. **多資料夾並行支援**（per `onboarding-spec.md` §6 O8 已決定 v1 不支援）
2. **自動偵測使用者搬移資料夾**（沒有後台 watch；使用者要自己按重新整理或更換資料夾）
3. **舊資料夾的 `links.md` / `thumbs/` 自動搬移**（spec §4 的 confirm dialog 只提醒使用者，不代勞）
4. **「最近使用過的資料夾」歷史清單**（不做）

---

## 3. 觸發時機

唯一入口：頂欄右側設定齒輪選單裡的「更換資料夾」按鈕（`index.html` 既有的 `#rechoose`）。

⚠️ **首次選擇資料夾不走這條流程**：第一次的「選擇資料夾」按鈕（intro 畫面的 `#pickBtn`）走原本的初始化流程，因為沒有舊狀態要清。

⚠️ **「找不到資料夾」的錯誤復原也復用這條流程**：`folderError()` toast 的「選擇新資料夾」動作改為委派 `rechooseFolder()`（原本直接 `start(true)`、**不清快取**，會讓舊資料夾的 `kv` 快取污染新資料夾）。「再試一次」仍是同資料夾重掃（`start(false)`，不清快取）。見 `broken-file-recovery-spec.md` §Phase6。

---

## 4. 流程

### 4.1 完整步驟（happy path）

```
[使用者點「更換資料夾」]
        ↓
[① 開啟 picker]
        ↓ (取得 newHandle)
[② isSameEntry(newHandle, oldDirHandle)?]
        ↓ 是 → 走「重新整理」路徑（等同按下 #refresh），不清快取、不跳 confirm
        ↓ 否
[③ 跳 Confirm Dialog（見 §5）]
        ↓ 使用者取消 → 完全不動，結束（舊狀態 intact）
        ↓ 使用者確認（= 同意清掉快取）
[④ 清 IndexedDB（見 §6 順序）]
        ↓
[⑤ 切換 dirHandle、掃新資料夾、寫入新狀態]
        ↓
[⑥ 跑 loadUrls() → render() → generateThumbs() → paintAllUrlThumbs()]
        ↓
[完成]
```

### 4.2 為什麼 picker 在 confirm 之前

- 沒看到資料夾名稱就讓使用者「確認切換」，使用者根本不知道在確認什麼。
- 萬一 picker 選錯，使用者可以在 confirm dialog 看到資料夾名稱、按取消，舊狀態不受影響。
- 代價：使用者要做兩個動作（pick → 再 confirm），多一步。但相較於「資料被清光才後悔」這個代價可忽略。

---

## 5. Confirm Dialog 設計

### 5.1 觸發

- isSameEntry 確認**不同**資料夾後立刻跳出
- 沿用 `index.html` 既有的 `.overlay` + `.dialog` 樣式（與新增 / 編輯 URL dialog 同款）

### 5.2 內容

標題：「換到這個資料夾？」

內文（建議文案，可微調）：

```
你選了:
📁 {新資料夾名稱}

換的只是 app 顯示哪個資料夾的內容,
你電腦裡的檔案完全不會被動到。
app 之後會從新資料夾重新讀取要顯示什麼。

🛟 舊資料夾裡的東西都還在,沒有跟著消失:
- 之前在 app 內收藏的 URL 都還在
  舊資料夾根目錄的 `links.md`
- URL 縮圖在舊資料夾的 `thumbs/` 子資料夾
- 想把 URL 收藏帶到新資料夾?
  在檔案總管把 `links.md` 和 `thumbs/` 搬過去即可

🔄 如果新資料夾本來就有 `links.md` 和 `thumbs/`
   (比如之前也用 app 整理過、或剛剛從別的地方搬過去),
   app 會直接讀進來,不會覆蓋。
```

⚠️ Confirm dialog **不顯示檔案計數**。理由：
- 計數對「要不要切換」的決策幫助不大（使用者選資料夾時已經知道大概有什麼）。
- 為了顯示要多一個預讀步驟（掃本機檔案 + parse `links.md`），增加流程複雜度。
- 切換完成後使用者立刻會看到完整畫廊，計數會出現在頂欄 `#count`，補資訊不晚。

按鈕：

- 「取消」（次要，沿用 `.btn` 既有樣式）
- 「換過去」（primary，**綠色 accent**；沿用 `.btn.primary` 既有黃銅綠拋光樣式，不另開 destructive 紅）
  - 為什麼不用紅色：destructive 紅在這個 app 的 design system 裡保留給「刪除 URL」這種**不可逆且影響使用者既有檔案**的動作（`.ghost-danger`）。「換資料夾」對使用者的既有檔案是 read-only（什麼都不刪），只清 IndexedDB 內部快取，傷害可逆（重畫封面即可恢復），不應該升級到紅色警告等級。

### 5.3 視覺

- 沿用 `.dialog` 既有花邊四角飾
- 不用 `backdrop-filter`（按 `About.md` §4 hard rule）

---

## 6. 清 IndexedDB + 換 dirHandle 的執行順序

⚠️ **這節是本 spec 的核心**。順序錯了會出問題：

| 錯誤順序 | 後果 |
|---|---|
| 先換 `dirHandle` → 後清 `kv/urls` | `loadUrls()` 中間執行的話會用新 dirHandle 配舊 `kv/urls` cache，`recoverUrls(false)` 把舊 URL 寫進新資料夾的 `links.md` |
| 不清 `kv/files` | 換到沒有 `files.md` 的新資料夾時，`loadFiles()` fallback 讀舊 `kv/files`，記憶體 `filesMap` 帶著舊資料夾的手動 tag（同名相對路徑的新檔會誤顯示舊 tag；若新資料夾有壞 `files.md` 更會 `recoverFiles` 把舊 tag 寫進新資料夾）。與 `kv/urls` 同一風險（§1 point 2） |
| 不清 `thumbs/` IndexedDB store | 新舊資料夾的封面快取混雜，若新舊資料夾恰巧有同名同 size 同 mtime 的檔案，新檔會用到舊縮圖 |

### 6.1 正確順序

confirm 之後的執行順序：

```
1. 清 IndexedDB:
   - thumbs store 全清（包含本機檔案縮圖 + URL 縮圖兩種 key）
   - kv store 的 "items" key 清掉
   - kv store 的 "urls" key 清掉
   - kv store 的 "files" key 清掉（本機檔案手動 tag 快取,tag-spec §6.1;與 "urls" 同理,見 §6.5）
   - kv store 的 "urlsDir" / "filesDir" key 清掉（kv.urls／kv.files 的資料夾戳記,broken-file-recovery-spec §D3;由 clearFolderCache 一併清）
   - kv store 的 "dir" key 「先不動」（馬上會被新 handle 覆蓋,中間出錯也只是停在舊 handle）

2. 換 dirHandle:
   - dirHandle = newHandle（記憶體變數）
   - DB.set("kv", "dir", newHandle)

3. 掃新資料夾本機檔案 + 寫 items:
   - 用新 dirHandle 跑 entry 列舉（沿用既有 start() scan 邏輯）
   - items = found.map(...)
   - persistItems()

4. 讀新 URL 清單 + 新手動 tag:
   - urls = await loadUrls()
   - filesMap = await loadFiles()
   - 此時 kv/urls、kv/files cache 都是空的,recoverUrls(false)／loadFiles() fallback 都不會污染

5. UI 更新:
   - showLibrary() / render()
   - generateThumbs()
   - paintAllUrlThumbs()
```

### 6.2 為什麼 `kv/dir` 不在 step 1 清掉

- 若 step 1 把 `kv/dir` 也清掉，但 step 2 寫入新 handle 失敗（例如 IndexedDB 寫入錯誤），就會變成「app 不知道自己接哪個資料夾」的狀態，下次 init() 直接退回 intro 畫面，使用者體驗很差。
- 留著舊 `kv/dir` 直到新 handle 寫入成功，可以當作 atomic-ish 的 fallback。

### 6.3 為什麼整個 `thumbs` store 一次清掉

- `thumbs` store 同時放本機檔案縮圖（key 是 `name|size|lastModified|w600`）和 URL 縮圖（key 是 `urlthumb:thumbs/xxx.webp`）。
- 兩種 key 沒有共同前綴可以一次篩掉某一類，要嘛逐筆遍歷濾掉，要嘛一次清光。
- 一次清光簡單、不會漏，且換資料夾本來就要重新生成所有封面快取，沒有保留價值。

### 6.4 不該清的東西

⚠️ 換資料夾時**絕對不要**清以下：

- `localStorage` 的 `wlib-sort`、`wlib-source`、`wlib-onboarding-seen` —— 這些是使用者偏好，跨資料夾應該保留
- 舊資料夾裡的任何檔案（包含 `links.md` 和 `thumbs/`）—— app 從不刪除使用者的檔案

### 6.5 實作備註

`DB.clear`（`js/db.js`）已存在。清快取集中在 `js/folder.js` 的 `clearFolderCache()`，`rechooseFolder` 與 `folderError`「選擇新資料夾」共用：

```js
async function clearFolderCache() {
  await DB.clear("thumbs");
  await DB.del("kv", "items");
  await DB.del("kv", "urls");
  await DB.del("kv", "files");
  await DB.del("kv", "urlsDir");    // kv.urls 的資料夾戳記
  await DB.del("kv", "filesDir");   // kv.files 的資料夾戳記
}
```

⚠️ 任何新增「與資料夾綁定的 `kv` key」都要補進 `clearFolderCache()`（broken-file-recovery-spec §8）。

---

## 7. 邊界情境

### 7.1 Picker 取消

- 使用者開了 picker 後按 Esc 或叉叉 → `showDirectoryPicker()` throw → 流程結束，舊狀態完全不動。
- 不跳任何 toast。

### 7.2 選到同一個資料夾

- `await oldHandle.isSameEntry(newHandle) === true`
- 不跳 confirm dialog
- 直接走「重新整理」路徑（等同按 `#refresh`），讓使用者得到「app 重新掃了一遍」的回饋。
- 這個分支要在 IndexedDB 清快取之前就 short-circuit 掉。

### 7.3 IndexedDB 清快取中途失敗

- 已經清了一部分，卻在 `clear("thumbs")` 或某個 `del("kv", ...)` throw。
- 對策：把 step 1 ~ step 3 包進 try / catch，任一步失敗就跳 toast「切換失敗，請重整頁面或重試」，並嘗試把 `dirHandle` 還原成舊的（記憶體中還握著 `oldHandle`）。
- 此時 IndexedDB 可能處於不完全清空的中間狀態，但下次 init() 會以 `kv/dir`（仍是舊 handle）為準，使用者重整後最多看到一些孤兒 thumb cache，不會崩潰。

### 7.4 新資料夾本身已有 `links.md` 和 `thumbs/`

**場景**：使用者選的新資料夾已經有 app 之前建立的 `links.md` 和 `thumbs/` 子資料夾。常見原因：

- 這個資料夾以前也被這個 app 整理過（使用者切回去）
- 使用者照 §5.2 dialog 的提示，把舊資料夾的 `links.md` 和 `thumbs/` 搬進新資料夾

**預期行為**：尊重新資料夾的既有 `links.md` 和 `thumbs/`，把它們當作真相讀進來，不覆寫、不刪除。

**流程**（沿用 §6.1，這裡只是釐清在這個場景的行為）：

1. §6.1 step 1 清 IndexedDB（**只清 IndexedDB cache，不動磁碟上的任何檔案**）
2. §6.1 step 4 `loadUrls()` 讀新資料夾的 `links.md`
   - 解析成功 → 新資料夾的 URL 寫進 `kv/urls` cache 顯示出來
   - **整份壞掉**（有內容卻 0 筆可解析）→ 走 `recoverUrls(true)`，原 `links.md` 改名成 `links.md.broken-{時間}` 完整保留；因為 step 1 已清空 cache（且戳記不符也視同空），**不會有任何資料寫回**，只留 `.broken`；備份失敗則中止不覆蓋原檔。**只壞一兩行**則容錯略過（broken-file-recovery-spec §D1／§D4）
3. `paintAllUrlThumbs()` 從新資料夾的 `thumbs/` 讀縮圖檔，補進 IndexedDB cache

**🔒 不變式（implementer 必讀）**：

- **空的 `kv/urls` cache（或戳記不符的外來 cache）不可寫回 `links.md`**。`recoverUrls`（`js/urls.js`）以 `if (cached.length)` + `cacheFolderMatches()` 資料夾戳記比對雙重守住；改 `recoverUrls` 時務必保留（broken-file-recovery-spec §D3）。
- **`thumbs/` 子資料夾不可被 app 刪除或清空**。換資料夾流程只動 IndexedDB，磁碟檔案完全不碰。
- 新資料夾若有「舊版 app 留下的 thumb 檔但新 `links.md` 沒引用到」的孤兒檔案，app 不主動清理（這是使用者的檔案，留給使用者自己處理）。

### 7.5 新資料夾權限只給 read 不給 write

- picker 預設拿到的 read 權限足以完成切換（掃檔案、讀 `links.md`、render）
- 切換完成後 URL 正常顯示
- 使用者第一次嘗試新增 / 編輯 / 刪除 URL 時才會發現權限不夠 → 跳 toast 既有提示「需要資料夾的寫入權限才能...」
- ⚠️ 不在 confirm dialog 階段就要求 write 權限，因為使用者也許只是想瀏覽舊圖庫、不打算改 URL

---

## 8. 與其他 spec 的關係

| 文件 | 關係 |
|---|---|
| `onboarding-spec.md` §4 Step 4 | 教使用者「換資料夾 = 重新開始」的心智模型。本 spec 是這個心智模型的實作細節。內容不可矛盾，文案以 onboarding-spec.md 為基準對齊。 |
| `onboarding-spec.md` §6 O8 | 「v1 不支援多資料夾」的已決定事項。本 spec 是這個決定的執行細節。 |
| `url-spec.md` §6.3 / §7 | `loadUrls()` / `recoverUrls()` 既有流程。本 spec 不改這兩個函式內部邏輯，只規範「呼叫它們之前要先把 `kv/urls` cache 清空」。 |
| `About.md` §5 / §11 | 既有的 `start()` 流程、`folderError()` toast。本 spec 在 `start()` 之上加了 confirm dialog 與清快取步驟，不改 `start()` 內部行為。 |

⚠️ **同步維護義務**：

- 若改 `url-spec.md` 的 `recoverUrls` 行為（例如改成不寫回 cache），本 spec §6.1 step 1 清 `kv/urls` 的必要性要重新評估
- 若改 `onboarding-spec.md` Step 4 文案，本 spec §5.2 的 confirm dialog 文案要對齊

---

## 9. 已決定事項一覽

| # | 議題 | 決定 |
|---|---|---|
| F1 | Picker 時機 | confirm 之前（讓使用者看到資料夾名才確認） |
| F2 | isSameEntry 分支 | 選到同一個資料夾不跳 confirm，直接走「重新整理」路徑 |
| F3 | 清 IndexedDB 範圍 | `thumbs` 全清、`kv/items` + `kv/urls` + `kv/files` 清、`kv/dir` 留到新 handle 寫入成功才覆蓋 |
| F4 | 不清的東西 | `localStorage` 偏好不動、舊資料夾任何檔案不動 |
| F5 | Confirm dialog 樣式 | 沿用既有 `.overlay` + `.dialog`，無 `backdrop-filter` |
| F6 | 取消 confirm 後的狀態 | 舊狀態 intact（因為 step 1 還沒執行） |
| F7 | Enter 鍵綁定 | v1 不綁 Enter 到「換過去」（destructive 動作要明確點擊） |
| F8 | 多資料夾並行 | v1 不支援（沿用 `onboarding-spec.md` O8） |
| F9 | 「換過去」按鈕配色 | 綠色 accent（沿用 `.btn.primary` 既有樣式）；不用 destructive 紅，理由見 §5.2 |
| F10 | Confirm dialog 檔案計數 | **不顯示**。理由見 §5.2 |
| F11 | 不做事前試掃 | confirm 前不預掃新資料夾；使用者確認 dialog 文案後即視為接受清快取。confirm 後直接清 → 掃 → 寫入 |
| F12 | 新資料夾既有 `links.md` / `thumbs/` 的處理 | 直接讀進來、不覆寫、不刪除。**空／外來 `kv/urls` cache 絕對不可寫回 `links.md`**（由 `recoverUrls` 的 `if (cached.length)` + 資料夾戳記 `cacheFolderMatches` 守住）。新資料夾若有整份壞掉的 `links.md` 會備份成 `.broken` 不被覆蓋。詳見 §7.4、`broken-file-recovery-spec.md` |

---

## 10. 開工前最後的確認項

(無)所有議題已決定，參見 §9。
