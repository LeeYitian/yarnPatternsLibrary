# 觸控裝置（無 hover）卡片互動改版 — 實作規格

> 給 AI agent 直接實作用。視覺一律依照專案 `design-style.md`，不要另創新樣式語言。

---

## 0. 範圍與裝置判斷

**只影響沒有 hover 能力的裝置（手機、iPad，不論直放橫放）。桌面版（有滑鼠）完全不變。**

判斷方式：CSS media query，**不要用螢幕寬度判斷**（iPad 橫向會誤判成桌面）。

```css
@media (hover: hover) and (pointer: fine) {
  /* 桌面：維持現狀，不動 */
}
@media (hover: none), (pointer: coarse) {
  /* 觸控裝置：套用以下所有改動 */
}
```

JS 若需要邏輯判斷，用對應寫法：

```js
const isTouchDevice = window.matchMedia("(hover: none), (pointer: coarse)").matches;
```

---

## 1. 功能規格

### 1.1 移除卡片上原本 hover 才出現的按鈕

在 `(hover: none), (pointer: coarse)` 範圍內，隱藏：
- `.expand`（放大鏡）
- `.card-actions`（編輯／刪除，僅 URL 卡片）

桌面版這兩者維持原本 hover 顯示的行為，不要動。

### 1.2 點擊卡片 → 開燈箱

觸控裝置上，點擊卡片（`.card` 本體）一律呼叫現有的 `openViewer(idx)`，**不要**呼叫 `openItem(it)`／`openFile(it)`。

燈箱內既有的「開啟檔案」按鈕與行為不用新做，直接沿用現有邏輯。

> 桌面版 `card.onclick = () => openItem(it)` 維持不變。

### 1.3 長按卡片 → 螢幕下方跳出 full-width 工具列

- 觸發：`touchstart` 後計時（建議 500ms 左右），期間若偵測到明顯位移（捲動手勢）則取消，不要誤觸發。
- 一次只能有一張卡片處於「被長按選中」狀態。長按另一張卡片會切換選中對象並重新渲染工具列內容。
- 工具列內容依卡片類型而定：
  - **本機卡片（PDF／圖片）**：只有「開啟」一顆按鈕。
  - **URL 卡片**：「編輯」「刪除」（左側，貼近成一組）＋「開啟」（右側，獨立）。
- **「開啟」按鈕永遠在右側固定位置**，不論卡片類型——本機卡片只有一顆按鈕時，仍維持靠右，不要置中。
- 「開啟」按鈕點擊行為：本機卡片＝呼叫現有 `openFile(it)`（開檔案）；URL 卡片＝呼叫現有 `openFile(it)`（內部已處理 `window.open`，沿用即可）。按鈕文字統一寫「開啟」（不分檔案／網址），但**圖示**要區分：本機檔案用一般「開啟／檔案」圖示，URL 用外部連結圖示（↗ 風格），避免使用者點下去才發現是跳出到瀏覽器。
- 編輯／刪除按鈕行為：沿用現有 `openDialog("edit", it)` 與 `openConfirm(it)`。

### 1.4 工具列收起

- 點擊螢幕上任何地方（工具列按鈕本身除外）→ 工具列收起，取消選中狀態。
- 實作方式：工具列顯示時，鋪一層**全螢幕透明攔截層**（`position: fixed; inset: 0;` 透明背景），attach 點擊事件＝收起工具列。
- **z-index 順序務必正確**：攔截層要蓋住卡片網格，但工具列本身（含其按鈕）的 z-index 要更高，不能被攔截層擋掉點擊。

---

## 2. 視覺規格（依 `design-style.md`，工具列）

> 全部沿用既有 CSS 變數，不要新發明顏色或字體。

| 項目 | 規格 | 依據 |
|---|---|---|
| 容器定位 | `position: fixed; left/right/bottom: 0;`（full width），`z-index` 高於攔截層 | 同 `.dock` 的浮動定位邏輯延伸 |
| 背景色 | `var(--card-solid)`（`#141f1c`，不透明實色） | §7.4 對話框背景同邏輯；**禁止 `backdrop-filter`**（§1 硬限制） |
| 上邊框 | `1px solid var(--line)` | 沿用 `.dialog` / `.card` 邊框語言 |
| 陰影 | `var(--shadow-lg)`（往上投影） | 沿用既有 `--shadow-lg` 變數，不新增陰影值 |
| 圓角 | 僅上方兩角 `4px`（其餘維持 `0`，貼齊螢幕底邊） | §4「圓角一律 4px」 |
| 內距 | 上下 `12px`，左右 `var(--gutter)`（手機 `16px`） | 沿用 `--gutter` 變數，跟 header 對齊 |
| 進場／退場動效 | `transform: translateY(...)` 滑入滑出，`var(--t-base) ease-out`（300ms） | §6 動效時長表；不彈跳 |
| 按鈕（編輯／刪除／開啟） | 沿用 `.card-actions button` 樣式：`30~36px` 方形、`4px` 圓角、`1px solid rgba(255,255,255,.35)` 邊框、底色 `rgba(10,18,15,.6)` | §7.10 既有 `.card-actions` 規格，直接延用不重做 |
| 編輯按鈕 active/按下態 | `var(--accent)` 底＋邊框 | 沿用 `.card-actions .edit:hover` 同色，觸控裝置用 `:active` 取代 `:hover` |
| 刪除按鈕 active/按下態 | `#c0573f` 底＋邊框（既有警示紅） | 沿用 `.card-actions .del:hover` 同色 |
| 開啟按鈕 | 可給 `var(--accent)` 底色或邊框強調，作為工具列上視覺主動作 | 對應「開啟」是快速路徑、應最顯眼的決定 |
| 左右分組間距 | 編輯／刪除兩顆間距小（`6~8px`，看得出同組）；左組與右側開啟之間留白要明顯大於組內間距（建議 `≥40px`，依實機調整） | 本次討論結論：留白是分組能否成立的關鍵 |
| 字體 | 按鈕若帶文字標籤，用 `var(--font-disp)`（Cinzel／Noto Serif TC），大寫＋寬字距，同 `.btn` 小標規格 | §3 字體分工表 |
| 攔截層 | `position: fixed; inset: 0; background: transparent; z-index:`（介於卡片網格與工具列之間） | 純功能性，不需視覺樣式 |

### 不要做的事（沿用全站禁忌）

- 工具列、攔截層**不可用 `backdrop-filter` 或 CSS `filter`**。
- 不要把按鈕做成膠囊或大圓角，圓角一律 `4px`。
- 不要幫編輯／刪除以外的按鈕加警示色；只有刪除用紅。
- 不要動桌面版任何既有 hover 樣式或 `.expand` / `.card-actions` 的桌面行為。
