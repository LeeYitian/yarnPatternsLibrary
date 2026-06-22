# Design Style — Yarn Patterns Library

> 全站視覺與設計規範的單一真相來源。整合自原本 `About.md` §7、§11 視覺條目，與已併入的舊 `FLOURISH.md` 花飾系統。
> **改視覺前先讀這份**。給接手的開發者 ／ AI agent。

---

## 0. 一句話總結

Academia ／ 古典學院風（圖書館 ／ 古籍手稿氛圍），綠 ／ 藍色調沿用，**只深色模式**。三套襯線字體、4px 圓角、`ease-out` 沉穩動效，裝飾花邊白色 SVG + 烤進的深色描邊。**禁用** `backdrop-filter` 與 CSS `filter`。

---

## 1. 硬限制（先讀，違反這幾條會破壞既有設計）

- **只支援 Chrome ／ Edge**（File System Access API 限定）。
- **只深色模式**：`:root` 直接寫深色值 + `color-scheme: dark`，已移除淺色模式與 `prefers-color-scheme`。**不要再加回**。
- **不要在任何元素上用 `backdrop-filter` 或 CSS `filter`**（卡片、對話框、燈箱、toast、spotlight 一律禁）。陰影走 `box-shadow` 或 SVG 內描邊。原因：弱 GPU 大量卡片捲動會閃動（`About.md` §4、§9）。
- **不要把襯線字體換成 sans-serif**。
- **不要加回**：封面拱頂圓弧 `--arch`、sepia 濾鏡、毛玻璃 `.label`、淺色模式、`prefers-color-scheme` 偵測。
- **裝飾花邊不要改成金 brass 色**：綠 `--accent` 是互動色（按鈕、邊框、focus 環、`.label` 直條），花邊保留白色。
- 大量卡片場景**不重建 DOM**：卡片只在 `ensureCards()` 建一次，視覺切換走節點搬移。

---

## 2. 配色

只深色模式。色階定義在 `:root`：

| 變數 | 值 | 角色 |
|---|---|---|
| `--bg1` `--bg2` `--bg3` | `#0a1614` ／ `#08120f` ／ `#0c1a15` | 夜色墨綠底色 |
| `--ink` | `#e7f0ec` | 主文字 |
| `--muted` | `#92a69f` | 次要文字 |
| `--line` | `rgba(150,185,172,.14)` | 邊框 ／ 分隔線 |
| `--accent` | `#6dbd9f` | 綠：**全站互動色**（按鈕、hover 邊框、focus 環、`.label` 直條、本機檔案 badge） |
| `--accent2` | `#84b6d6` | 藍：URL 收藏的視覺區隔（badge、`.label` 直條） |

**底圖**：`body` 用多層 `radial-gradient`（館內燈光光暈）+ `linear-gradient(165deg, --bg1 → --bg2 → --bg3)`，`background-attachment: fixed`（捲動時背景固定）。

**互動色 vs 區別色的角色分工**：綠 `--accent` 是全站「能點 ／ 互動」的視覺語言（仿學院風裡的黃銅）；藍 `--accent2` 純粹是 URL 區跟本機檔案區的來源標記，**不參與互動**（hover、focus 還是綠）。

---

## 3. 字體

三套襯線，全走 CSS 變數，中文一律 `Noto Serif TC` 接手。**不要換 sans-serif**。

| 變數 | 字體 fallback | 用途 |
|---|---|---|
| `--font-head` | Cormorant Garamond → Noto Serif TC → Microsoft JhengHei | 標題 `h1` ／ `h2` ／ 燈箱標題 ／ 對話框標題 |
| `--font-body` | Crimson Pro → Noto Serif TC → Microsoft JhengHei | 內文、搜尋框 |
| `--font-disp` | Cinzel → Noto Serif TC → Microsoft JhengHei | 標籤 ／ 顯示用，大寫 + 寬字距：`#status`、`.btn` 小標、類型 badge、dock 標籤、模式徽章 |

---

## 4. 排版

- **頁面左右留白用 `--gutter`**：桌面 `clamp(20px, 7vw, 112px)`、手機 `16px`。`header` 與 `main` 左右內距共用，內容往內縮、兩側空出來放 `.dock`。
- **圓角一律 `4px`**，不用膠囊 ／ 大圓角。
- 主要按鈕走綠調「拋光金屬」線性漸層 + 鐫刻字陰影（一明一暗 `text-shadow`）。

---

## 5. 氛圍覆蓋層

兩層全域裝飾，皆 `position: fixed`、`pointer-events: none`、`z-index: 40`：

- `body::before`：紙張紋理（SVG noise、`opacity .035`、`mix-blend-mode: overlay`）
- `body::after`：暈影（中央透明、邊緣壓暗）

**z-index 排序**：覆蓋層 z 40 → 燈箱 z 50（不受紋理 ／ 暈影影響） → onboarding 遮罩 z 60、鏤空 + 氣泡 z 61。

---

## 6. 動效

統一 `ease-out`、沉穩、不彈跳。時長分四級：

| 變數 | 值 | 用途 |
|---|---|---|
| `--t-fast` | `150ms` | hover、退場 |
| `--t-base` | `300ms` | 進場、步驟切換 |
| `--t-slow` | `500ms` | 較戲劇性的進場（如升版 toast） |
| `--t-drama` | `700ms` | 燈箱、整頁切換 |

- **`prefers-reduced-motion`** 全尊重，動畫關掉時直接切換、不過渡。
- **鍵盤 focus**：綠色雙層 `box-shadow` 環（`0 0 0 2px var(--bg1), 0 0 0 4px var(--accent)`）。

---

## 7. 元件規範

### 7.1 按鈕

- `.btn`：邊框 `1px solid var(--line)`、背景 `var(--card)`、Cinzel 大寫小標、4px 圓角。hover 綠邊框 + 綠字。
- `.btn.primary`：綠調拋光金屬漸層 + 鐫刻字陰影。**搭配 `--swash` 捲花**（左右對稱鏡像，§8）。只用在文字主按鈕（如「選擇資料夾」「開啟檔案」「我知道了」）。`icon`-only 鈕、dock 鈕、設定選單項目**不加** `--swash`。
- `.btn.icon`：icon-only，無 `--swash`。
- **`#addUrlBtn`（新增網址）**：頂欄唯一視覺主張——primary 綠 + icon + 文字 + 呼吸光暈（`@keyframes addGlow`，hover 停）。**刻意移除主按鈕白花押** `--swash`，避免與 icon 打架。

### 7.2 卡片（畫廊）

- `.card` 是「襯紙裱框」：4px 圓角、`padding: 7px` 把封面框住。
- 封面 `.thumb`：**方形（2px 圓角）、全彩**。hover 只做輕微放大。
- 對角花飾：`.card::before / ::after` 用 `--sprig`，只長**左上 + 右下**兩角（§8 稀疏原則）。
- 封面內襯線：`.thumb::after` `inset 0 0 0 1px rgba(255,255,255,.16)`（裱框襯紙的內緣）。
- 底部 `.label`：**線性漸層**（不再毛玻璃）+ 主題色直條（本機綠 ／ URL 藍）。
- 類型 badge（PDF ／ JPG ／ 連結）：右上角 Cinzel 鐫刻小標，本機綠 ／ URL 藍區分。

⚠️ **`.label` 已改線性漸層、不再毛玻璃**——為了避免大量卡片捲動時在弱 GPU 上閃動。**不要再把 `backdrop-filter` 加回 `.label`**。

### 7.3 燈箱

- 遮罩：深墨綠 `color-mix(in srgb, var(--bg1) 26%, rgba(8,14,11,.92))`。**不用毛玻璃**（避免閃動）。
- `.frame` 四角花飾：`--sprig`，56px、`opacity .96`（§8）。
- `.frame` 內襯線：`box-shadow: ..., inset 0 0 0 1px rgba(255,255,255,.14)`。
- 標題 `.cap .t`：Cormorant 襯線。
- 圖與標題間有 `.ornate-divider`（中央 ❧ 字符）。
- z-index：**`50`**。

### 7.4 對話框 ／ 確認框

涵蓋：onboarding A 模式對話框、URL 新增 ／ 編輯對話框、刪除確認框、更換資料夾確認框。

- 寬度：桌面約 `480px`、手機左右各留邊 `16px`。
- 圓角 `4px`、邊框 `1px solid var(--line)`、背景 `var(--card)`（深墨綠半透）。
- 遮罩沿用燈箱配色（深墨綠 `color-mix`）。
- 四角花飾用 `--sprig`，**只長對角兩處**（§8 稀疏原則）。
- 標題 Cormorant、內文 Crimson Pro。
- 主按鈕 `.btn.primary`（綠拋光 + `--swash`），次要鈕 `.btn`。
- ⚠️ **對話框、遮罩、卡片、toast 一律不用 `backdrop-filter`**。

### 7.5 Toast

- 非阻斷、底部滑入（升版 toast 例外：頂部中央下滑）。
- 警示用琥珀左框。
- 小字 Cinzel。
- **不用 `backdrop-filter`**。

### 7.6 時間軸版面

- `.grid.mode-timeline` 左側 `::before` 畫垂直線。
- 每個 `.tl-month` 用 `::before` 在線上點一個主題色圓點（外圈帶光暈）。
- 月份標題 `.tl-label` 用 Cormorant 襯線。
- 卡片放 `.tl-grid`（沿用 `--min` ／ `--ar` ／ `--pos` 變數，§9）。

### 7.7 頂欄

- `header position: sticky`，捲動方向控制 `.nav-hidden`（`translateY(-100%)`）收合。
- 標題 `h1` 用 Cormorant。
- 手機版 `flex-wrap` 成兩行（搜尋自己一行、幻燈片 + 設定一行）。

### 7.8 Dock（側邊浮動按鈕）

- `position: fixed` 靠右**垂直置中**（手機版同樣置中、按鈕縮小）。
- 4px 方塊「icon + Cinzel 小標籤」。
- 目前三顆：「檢視大小」「排序」「來源篩選」。

### 7.9 首頁說明（重點裝飾區）

- Cinzel overline「Bibliotheca Textilis」。
- 華麗分隔線（中央 ❧ 字符）。
- `.why` 卡片四角花飾（`::before / ::after` 畫角框）。
- 首段首字下沉（`.why p:first-of-type::first-letter`，綠色大寫）。

### 7.10 URL 收藏視覺

- URL 一律用**藍 `--accent2`**（badge「連結」、`.label` 直條）與本機綠 `--accent` 做來源區隔。
- 綠仍是全站互動色。
- 頂欄「新增網址」鈕：見 §7.1。
- `.card-actions`（編輯 ／ 刪除）hover 浮出。

### 7.11 Spotlight 氣泡（onboarding B 模式專用）

詳細互動規範見 `onboarding-spec.md` §3.1，視覺要點：

- 氣泡寬約 `320px`，4px 圓角、邊框 `1px solid var(--line)`、背景同對話框（§7.4）。
- 指向目標元件的 `8px` 三角形小箭頭，顏色同氣泡背景。
- 互動步驟周圍呼吸光暈：`box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent)`，配合 `@keyframes` 緩呼吸。
- 鏤空走大遮罩 + 反向 inset `box-shadow`，**不用 `clip-path`**。
- 模式徽章（「👀 看過就好」「🖱 換你試試」）：`var(--font-disp)`、`12px`、`letter-spacing: .15em`，底色 `color-mix(in srgb, var(--accent) 16%, transparent)`，圓角 `4px`。
- z-index：遮罩 60、鏤空 + 氣泡 61。

---

## 8. 花飾系統（Flourish）

> 整段自原 `FLOURISH.md` 收錄。配 `spec/flourish-preview.html`（Chrome 打開，含卡片在「淺底 ／ 深色 ／ 中綠」三種縮圖上的對照）對校視覺。

### 8.1 設計決策（先讀，避免「修壞」）

1. **白線 + 烤進 SVG 的深色描邊，用 `background-image`（不是 `mask`）**。每條線在 SVG 裡畫兩層：底層深色較粗（描邊 ／ 陰影）、上層白色細線。產生**自適應對比**：深色縮圖上白線跳出、淺色縮圖上深色描邊撐出輪廓。卡片可能很「花」（照片、密集織圖），單一半透明色會糊掉，所以**白 + 描邊**才可靠。
   - 為什麼不用 `mask` + `background-color`：那個做法可跟著 `--accent` 變色，但**上不了陰影**、在花縮圖上不穩。本版選擇可讀性，犧牲自動染色。
   - 為什麼不用 CSS `filter: drop-shadow`：陰影已用「描邊」烤進 SVG，**不需要即時 `filter`**，避免效能顧慮（§1）。
2. **顏色：花邊白色；按鈕花押同樣白線**（在綠按鈕上像銀飾鑲嵌）。綠 `--accent` 仍是全站互動色（卡片 `.label .bar`、hover 邊框、focus 環照舊），但**裝飾性花邊改白**是為了在花縮圖上的可讀性。**不要把花邊改成金 brass**。
3. **稀疏原則：角落長幾個就好**。卡片只長**左上 + 右下**兩角，不是四角全長。
4. **形狀語言**：參考古典框角（捲軸掃尾 + 角落小寶石菱形 + 內側四角閃星）。右下 ／ 右側用 `rotate(180deg)` 或 `scaleX(-1)` 鏡像。
5. **效能**：花邊只用 `background-image` ／ `box-shadow`，**絕不用 `backdrop-filter` 或 CSS `filter`**（§1）。

### 8.2 硬限制

- SVG data-URI 內用**單引號**屬性、外層 `url("...")` 用雙引號；顏色只用 `white` ／ `rgba(...)`，**不要出現 `#`**。
- 若搬到別的環境花邊不顯示，先把 SVG 內 `<` → `%3C`、`>` → `%3E` 編碼再試。
- 不改 JS；卡片仍只在 `ensureCards()` 建一次，花邊全靠 CSS 偽元素。
- 框角細節在**極小尺寸**會糊；compact 卡用較小尺寸即可，不必追求每根線都清楚。

### 8.3 套進 `index.html` 的程式碼

#### 8.3.1 `:root` 新增兩個變數

```css
/* 框角線條：捲軸 + 角寶石 + 內閃星；白線 + 深色描邊陰影 */
--sprig: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60' fill='none' stroke-linecap='round' stroke-linejoin='round'><g stroke='rgba(8,14,12,.55)' stroke-width='3.4'><path d='M31 10 C 21 9 13 10 11 16 C 10 19 12 21 14.5 20 C 17 19 16.5 16 14 16.5'/><path d='M10 31 C 9 21 10 13 16 11 C 19 10 21 12 20 14.5 C 19 17 16 16.5 16.5 14'/></g><path d='M11 5 C 11.6 9 12 9.4 16 11 C 12 12.6 11.6 13 11 17 C 10.4 13 10 12.6 6 11 C 10 9.4 10.4 9 11 5 Z' fill='white' stroke='rgba(8,14,12,.55)' stroke-width='2.6'/><path d='M33 28 C 33.5 31 34 31.5 37 32 C 34 32.5 33.5 33 33 36 C 32.5 33 32 32.5 29 32 C 32 31.5 32.5 31 33 28 Z' fill='white' stroke='rgba(8,14,12,.55)' stroke-width='2.4'/><g stroke='white' stroke-width='1.5'><path d='M31 10 C 21 9 13 10 11 16 C 10 19 12 21 14.5 20 C 17 19 16.5 16 14 16.5'/><path d='M10 31 C 9 21 10 13 16 11 C 19 10 21 12 20 14.5 C 19 17 16 16.5 16.5 14'/></g><path d='M11 5 C 11.6 9 12 9.4 16 11 C 12 12.6 11.6 13 11 17 C 10.4 13 10 12.6 6 11 C 10 9.4 10.4 9 11 5 Z' fill='white'/><path d='M33 28 C 33.5 31 34 31.5 37 32 C 34 32.5 33.5 33 33 36 C 32.5 33 32 32.5 29 32 C 32 31.5 32.5 31 33 28 Z' fill='white'/></svg>");
/* 按鈕捲花：捲軸 + 閃星終端；純白、無描邊（開口朝文字） */
--swash: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 16' fill='none' stroke-linecap='round' stroke-linejoin='round'><path d='M42 8 C 31 7 24 11 16 9 C 9 7.4 6 4 9.5 3 C 13 2 13 7 8 7.6' stroke='white' stroke-width='1.4'/><path d='M5 3.5 C 5.4 6.2 6 6.6 8.6 7.6 C 6 8.6 5.4 9 5 11.6 C 4.6 9 4 8.6 1.4 7.6 C 4 6.6 4.6 6.2 5 3.5 Z' fill='white'/></svg>");
```

#### 8.3.2 卡片：內襯線 + 對角框角（貼在 `.card:hover { ... }` 之後）

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

#### 8.3.3 主按鈕花押（貼在 `.btn.primary:hover { ... }` 之後）

```css
.btn.primary { position: relative; }
.btn.primary::before, .btn.primary::after {
  content: ""; width: 24px; height: 11px; display: inline-block; vertical-align: middle;
  background: var(--swash) center / contain no-repeat; opacity: .92;
}
.btn.primary::before { margin-right: 10px; }
.btn.primary::after  { margin-left: 10px; transform: scaleX(-1); }
```

> 只加在文字主按鈕（如「選擇資料夾」「開啟檔案」「我知道了」）。icon 鈕、dock 鈕、設定選單項目、`#addUrlBtn` **不要加**（§7.1 例外）。

#### 8.3.4 燈箱框內襯線（改一行）

`.stage .frame` 的 `box-shadow: var(--shadow-lg);` → 改成：

```css
box-shadow: var(--shadow-lg), inset 0 0 0 1px rgba(255,255,255,.14);
```

#### 8.3.5 燈箱四角（整段替換）

```css
.stage .frame::before, .stage .frame::after {
  content: ""; position: absolute; width: 56px; height: 56px; pointer-events: none; z-index: 3;
  background: var(--sprig) center / contain no-repeat; opacity: .96;
}
.stage .frame::before { top: 6px; left: 6px; }
.stage .frame::after  { bottom: 6px; right: 6px; transform: rotate(180deg); }
```

#### 8.3.6 燈箱華麗分隔線

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

### 8.4 視覺規格表

| 位置 | 選擇器 | 尺寸 | opacity（靜置 ／ hover） | 樣式 |
| --- | --- | --- | --- | --- |
| 卡片對角框角 | `.card::before / ::after` | 32px（compact 26px） | .82 ／ 1 | 白線 + 描邊（`--sprig`） |
| 卡片封面內襯線 | `.thumb::after` | inset 1px | 固定 | 白 16% |
| 燈箱四角框角 | `.stage .frame::before / ::after` | 56px | .96 ／ — | 白線 + 描邊（`--sprig`） |
| 燈箱框內襯線 | `.stage .frame` box-shadow | inset 1px | 固定 | 白 14% |
| 按鈕花押 | `.btn.primary::before / ::after` | 24×11px | .92 ／ — | 純白、無描邊（`--swash`） |
| 對話框四角 | `.dialog::before / ::after` | 40 ～ 48px | .9 ／ — | 白線 + 描邊（`--sprig`） |

擺放：框角朝中心生長；右下 ／ 右側用 `rotate(180deg)` 或 `scaleX(-1)` 鏡像。

### 8.5 可調旋鈕與變體

- **整體濃淡**：改各處 `opacity`。
- **想更輕**：卡片 `opacity` 調低；或靜置設低、hover 才 1。
- **描邊 ／ 陰影強度**：改 SVG 內深色 `rgba(8,14,12,.55)` 的 alpha（淺背景吃不開就調高）。
- **想換回「跟主題色變綠」**：把 `background: var(--sprig)...` 換回 `mask: var(--sprig)...; background-color: var(--accent);`，並把 SVG 的雙層白 ／ 深色改成單一黑色形狀——但會失去陰影與花縮圖可讀性。
- **加細節**：在 `--sprig` 同層多畫 `<path>`（白層 + 對應深色描邊層）即可。

### 8.6 套用步驟（給 AI agent）

1. 開 `flourish-preview.html` 確認目標視覺（特別看三種縮圖對照）。
2. 依 §8.3.1 ～ §8.3.6 套進 `index.html`（§8.3.4、§8.3.5 是「改既有」，其餘新增）。
3. 不動任何 JS、不動 `ensureCards()` 的 DOM。
4. 自我檢查 §8.7。

### 8.7 驗收條件

- [ ] 卡片左上、右下出現白色框角線條（捲軸 + 角寶石 + 閃星）；hover 變亮；其餘兩角留白。
- [ ] 白線在**淺底織圖**與**深色照片**縮圖上**都清楚可讀**（靠烤進 SVG 的深色描邊）。
- [ ] 卡片封面有一圈極淡白色內襯線。
- [ ] 「選擇資料夾」「開啟檔案」兩側出現純白捲花（無描邊），左右對稱鏡像。
- [ ] 燈箱四角是框角線條（非 L 形直角），框內有白襯線，圖與標題間有 ❧ 分隔線。
- [ ] 對話框 ／ 確認框對角兩處有白色框角。
- [ ] 大量卡片捲動不閃動（沒人偷加 `backdrop-filter` ／ `filter`）。
- [ ] 雙擊 `index.html`（`file://`）仍可正常開啟、選資料夾、產生封面。

---

## 9. 封面裁切比例（`--ar`）

- 寬大 = `16/9`（寬版裁切，`object-fit: cover` 不變形只顯示局部）。
- 標準 ／ 緊湊 = `1/1`（正方形裁切）。
- `--pos` 控制裁切焦點（預設 `center 32%`，偏上以對到封面主照片）。

---

## 10. 禁忌一覽（不要做的事）

- 不要回淺色模式 ／ `prefers-color-scheme`。
- 不要把襯線字體換成 sans-serif。
- 不要加回封面拱頂圓弧（`--arch`）或 sepia 濾鏡。
- 不要把毛玻璃 `backdrop-filter` 加回 `.label`、卡片本體、對話框、toast、燈箱。
- 不要在任何元素上用 CSS `filter`（陰影走 `box-shadow` 或 SVG 內描邊）。
- 不要把裝飾花邊改成金 brass 色（互動色才是綠 `--accent`，花邊保持白色）。
- 不要四角全長、不要把花邊 `opacity` 拉到刺眼——稀疏與克制是設計意圖。
- 不要在 `ensureCards()` 之外重建卡片 DOM。
- 不要把點陣 clipart 直接包進專案。
- 不要動 hover 邊框 ／ focus 環 ／ `.label` 綠直條的顏色——那是互動色語言。
