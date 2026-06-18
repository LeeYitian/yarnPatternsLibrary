# 花邊裝飾系統 Flourish System

> 給接手的開發者／AI agent。描述「畫廊卡片／燈箱／主按鈕」的裝飾花邊規格與**為什麼這樣做**。
> 視覺參考檔：`flourish-preview.html`（Chrome 打開，含卡片在「淺底／深色／中綠」三種縮圖上的對照）。
> 本文件是 `About.md` 的延伸；遇到衝突時，**以 `About.md` 的既有決策為準**。

---

## 0. 一句話總結

花邊是手繪 **SVG 框角線條（捲軸 + 角寶石 + 閃星）** 與 **捲花**，以 **CSS `background-image`** 貼在卡片對角、
燈箱四角、主按鈕文字兩側。線條烤成**白色 + 深色描邊陰影**，因此在任何（含很花的）縮圖上都讀得到。全部走偽元素，**不改任何 JS**。

---

## 1. 設計決策（先讀，避免被「修壞」）

1. **白線 + 烤進 SVG 的深色描邊，用 `background-image`（不是 `mask`）。**
   每條線在 SVG 裡畫兩層：底層深色較粗（描邊／陰影）、上層白色細線。產生**自適應對比**：深色縮圖上白線跳出、
   淺色縮圖上深色描邊撐出輪廓。卡片可能很「花」（照片、密集織圖），單一半透明色會糊掉，所以**白+描邊**才可靠。
   - **為什麼不用 `mask`+`background-color`**：那個做法可跟著 `--accent` 變色，但**上不了陰影**、在花縮圖上不穩。本版選擇可讀性，犧牲自動染色。
   - **為什麼不用 CSS `filter: drop-shadow`**：陰影已用「描邊」烤進 SVG，**不需要即時 `filter`**，避免 `About.md` §4 的效能顧慮。

2. **顏色：花邊白色；按鈕花押同樣白線（在黃銅綠按鈕上像銀飾鑲嵌）。**
   綠 `--accent` 仍是全站互動色（卡片 `.label .bar`、hover 邊框、focus 環照舊），但**裝飾性花邊改白**是為了在花縮圖上的可讀性。
   → **不要**把花邊改成金色 brass。

3. **稀疏原則：角落長幾個就好。** 卡片只長**左上 + 右下**兩角，不是四角全長。

4. **形狀語言**：參考古典框角（捲軸掃尾 + 角落小寶石菱形 + 內側四角閃星）。右下／右側用 `rotate(180deg)` 或 `scaleX(-1)` 鏡像。

5. **效能**：花邊只用 `background-image` / `box-shadow`，**絕不用 `backdrop-filter` 或 CSS `filter`**（見 `About.md` §4）。

---

## 2. 必守的硬限制

- **只支援 Chrome / Edge**（與專案一致）。
- SVG data-URI 內用**單引號**屬性、外層 `url("...")` 用雙引號；顏色只用 `white` / `rgba(...)`，**不要出現 `#`**。
- 若搬到別的環境花邊不顯示，先把 SVG 內 `<`→`%3C`、`>`→`%3E` 編碼再試。
- **不改 JS**；卡片仍只在 `ensureCards()` 建一次，花邊全靠 CSS 偽元素。
- 框角細節在**極小尺寸**會糊；compact 卡用較小尺寸即可，不必追求每根線都清楚。

---

## 3. 套進 `index.html` 的程式碼

### 3-1. `:root` 新增兩個變數

```css
/* 框角線條：捲軸 + 角寶石 + 內閃星；白線 + 深色描邊陰影 */
--sprig: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60' fill='none' stroke-linecap='round' stroke-linejoin='round'><g stroke='rgba(8,14,12,.55)' stroke-width='3.4'><path d='M31 10 C 21 9 13 10 11 16 C 10 19 12 21 14.5 20 C 17 19 16.5 16 14 16.5'/><path d='M10 31 C 9 21 10 13 16 11 C 19 10 21 12 20 14.5 C 19 17 16 16.5 16.5 14'/></g><path d='M11 5 C 11.6 9 12 9.4 16 11 C 12 12.6 11.6 13 11 17 C 10.4 13 10 12.6 6 11 C 10 9.4 10.4 9 11 5 Z' fill='white' stroke='rgba(8,14,12,.55)' stroke-width='2.6'/><path d='M33 28 C 33.5 31 34 31.5 37 32 C 34 32.5 33.5 33 33 36 C 32.5 33 32 32.5 29 32 C 32 31.5 32.5 31 33 28 Z' fill='white' stroke='rgba(8,14,12,.55)' stroke-width='2.4'/><g stroke='white' stroke-width='1.5'><path d='M31 10 C 21 9 13 10 11 16 C 10 19 12 21 14.5 20 C 17 19 16.5 16 14 16.5'/><path d='M10 31 C 9 21 10 13 16 11 C 19 10 21 12 20 14.5 C 19 17 16 16.5 16.5 14'/></g><path d='M11 5 C 11.6 9 12 9.4 16 11 C 12 12.6 11.6 13 11 17 C 10.4 13 10 12.6 6 11 C 10 9.4 10.4 9 11 5 Z' fill='white'/><path d='M33 28 C 33.5 31 34 31.5 37 32 C 34 32.5 33.5 33 33 36 C 32.5 33 32 32.5 29 32 C 32 31.5 32.5 31 33 28 Z' fill='white'/></svg>");
/* 按鈕捲花：捲軸 + 閃星終端；純白、無描邊（開口朝文字） */
--swash: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 16' fill='none' stroke-linecap='round' stroke-linejoin='round'><path d='M42 8 C 31 7 24 11 16 9 C 9 7.4 6 4 9.5 3 C 13 2 13 7 8 7.6' stroke='white' stroke-width='1.4'/><path d='M5 3.5 C 5.4 6.2 6 6.6 8.6 7.6 C 6 8.6 5.4 9 5 11.6 C 4.6 9 4 8.6 1.4 7.6 C 4 6.6 4.6 6.2 5 3.5 Z' fill='white'/></svg>");
```

### 3-2. 卡片：內襯線 + 對角框角（新增，貼在 `.card:hover { ... }` 之後）

```css
/* 封面內襯線：白色極淡（裱框襯紙的內緣，呼應白花邊） */
.thumb::after {
  content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 1; border-radius: 2px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.16);
}
/* 對角框角線條：只長左上 + 右下 */
.card::before, .card::after {
  content: ""; position: absolute; width: 32px; height: 32px; z-index: 3; pointer-events: none;
  background: var(--sprig) center / contain no-repeat;
  opacity: .82; transition: opacity var(--t-base) ease-out;
}
.card::before { top: 4px; left: 4px; }
.card::after  { bottom: 4px; right: 4px; transform: rotate(180deg); }
.card:hover::before, .card:hover::after { opacity: 1; }
.grid.size-compact .card::before, .grid.size-compact .card::after { width: 26px; height: 26px; }
```

### 3-3. 主按鈕花押（新增，貼在 `.btn.primary:hover { ... }` 之後）

```css
.btn.primary { position: relative; }
.btn.primary::before, .btn.primary::after {
  content: ""; width: 24px; height: 11px; display: inline-block; vertical-align: middle;
  background: var(--swash) center / contain no-repeat; opacity: .92;
}
.btn.primary::before { margin-right: 10px; }
.btn.primary::after  { margin-left: 10px; transform: scaleX(-1); }
```

> 只加在文字主按鈕（`選擇資料夾`、`開啟檔案`）。icon 鈕、dock 鈕、設定選單項目不要加。

### 3-4. 燈箱框內襯線（改一行）

`.stage .frame` 的 `box-shadow: var(--shadow-lg);` → 改成：

```css
box-shadow: var(--shadow-lg), inset 0 0 0 1px rgba(255,255,255,.14);
```

### 3-5. 燈箱四角：把 L 形角框換成框角線條（整段替換）

```css
.stage .frame::before, .stage .frame::after {
  content: ""; position: absolute; width: 56px; height: 56px; pointer-events: none; z-index: 3;
  background: var(--sprig) center / contain no-repeat; opacity: .96;
}
.stage .frame::before { top: 6px; left: 6px; }
.stage .frame::after  { bottom: 6px; right: 6px; transform: rotate(180deg); }
```

### 3-6. 燈箱華麗分隔線（HTML 加一行 + CSS 加一段）

HTML（`#viewer` 的 `.stage` 內，`.frame` 與 `.cap` 中間）：

```html
<div class="frame"><img id="vImg" alt=""></div>
<div class="ornate-divider" aria-hidden="true"></div>   <!-- ← 新增 -->
<div class="cap"><div class="t" id="vTitle"></div></div>
```

CSS：

```css
.stage .ornate-divider { width: 180px; margin: 4px auto 0; }
.stage .ornate-divider::before { background: transparent; padding: 0 10px; }
```

---

## 4. 視覺規格表

| 位置 | 選擇器 | 尺寸 | opacity（靜置 / hover） | 樣式 |
| --- | --- | --- | --- | --- |
| 卡片對角框角 | `.card::before/::after` | 32px（compact 26px） | .82 / 1 | 白線 + 描邊（`--sprig`） |
| 卡片封面內襯線 | `.thumb::after` | inset 1px | 固定 | 白 16% |
| 燈箱四角框角 | `.stage .frame::before/::after` | 56px | .96 / — | 白線 + 描邊（`--sprig`） |
| 燈箱框內襯線 | `.stage .frame` box-shadow | inset 1px | 固定 | 白 14% |
| 按鈕花押 | `.btn.primary::before/::after` | 24×11px | .92 / — | 純白、無描邊（`--swash`） |

擺放：框角朝中心生長；右下／右側用 `rotate(180deg)` 或 `scaleX(-1)` 鏡像。

---

## 5. 可調旋鈕與變體

- **整體濃淡**：改各處 `opacity`。
- **想更輕**：卡片 `opacity` 調低；或靜置設低、hover 才 1。
- **描邊／陰影強度**：改 SVG 內深色 `rgba(8,14,12,.55)` 的 alpha（淺背景吃不開就調高）。
- **想換回「跟主題色變綠」**：把 `background: var(--sprig)...` 換回 `mask: var(--sprig)...; background-color: var(--accent);`，並把 SVG 的雙層白/深色改成單一黑色形狀——但會失去陰影與花縮圖可讀性。
- **加細節**：在 `--sprig` 同層多畫 `<path>`（白層 + 對應深色描邊層）即可。

---

## 6. AI agent 套用步驟

1. 開 `flourish-preview.html` 確認目標視覺（特別看三種縮圖對照）。
2. 依 §3-1～§3-6 套進 `index.html`（§3-4、§3-5 是「改既有」，其餘新增）。
3. 不動任何 JS、不動 `ensureCards()` 的 DOM。
4. 自我檢查 §7。唯讀副本請套到真正的 repo。

---

## 7. 驗收條件（Definition of Done）

- [ ] 卡片左上、右下出現白色框角線條（捲軸 + 角寶石 + 閃星）；hover 變亮；其餘兩角留白。
- [ ] 白線在**淺底織圖**與**深色照片**縮圖上**都清楚可讀**（靠烤進 SVG 的深色描邊）。
- [ ] 卡片封面有一圈極淡白色內襯線。
- [ ] `選擇資料夾`、`開啟檔案` 兩側出現純白捲花（無描邊），左右對稱鏡像。
- [ ] 燈箱四角是框角線條（非 L 形直角），框內有白襯線，圖與標題間有 ❧ 分隔線。
- [ ] 大量卡片捲動不閃動（沒人偷加 `backdrop-filter` / `filter`）。
- [ ] 雙擊 `index.html`（`file://`）仍可正常開啟、選資料夾、產生封面。

---

## 8. 不要做的事（守門）

- 不要把花邊改成金色 brass、不要加回拱頂圓弧（`--arch`）或 sepia、不要換 sans-serif（見 `About.md` §7、§11）。
- 不要把點陣 clipart 直接包進專案。
- 不要在卡片本體或大量元素上加 `backdrop-filter` / CSS `filter`（陰影請走 SVG 內描邊，已示範於 `--sprig` / `--swash`）。
- 不要四角全長、不要把 opacity 拉到刺眼——稀疏與克制是設計意圖。
