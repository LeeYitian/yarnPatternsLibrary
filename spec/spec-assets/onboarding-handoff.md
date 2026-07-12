# Onboarding 交接（精簡版）

> 給接手把 **完整 7 步教學互動** 做進 `index.html` 的 AI agent。
> 真相來源：`onboarding-spec.md`（流程／文案）、`design-style.md`（視覺）、`url-spec.md`（新增網址流程）。本文件只補「怎麼落地 + 已知盲點」，**不取代 spec**。

## 這份 mockup 涵蓋什麼

`onboarding-mockup.html` 是 **Step 4「試試新增網址」** 的視覺／UX 參考，獨立檔、**不改 index.html**。

- 做了：5 段子流程（① 開場對話框 → ② spotlight 新增網址鈕 → ③ spotlight 網址欄 → ④ spotlight 縮圖區 → ⑤ spotlight 儲存鈕），可用氣泡「上一步／下一步」切換看各狀態。預設停在 ③（你指定的「對話框已開＋spotlight」狀態）。
- 背景 app 是臨摹（頂欄、addUrlBtn、dock 三顆、卡片、新增網址對話框），沿用 index.html 同一套 token。
- **刻意沒做**：真實觸發、focus trap、寫入 `links.md`、其餘 6 步、版本管理、toast、設定選單「重看使用教學」。切換純視覺。

## 架構（怎麼疊上去）

Onboarding 是**獨立 controller，疊在 cache-first app 之上**，與 app 資料流無耦合——它只讀 DOM 座標、控制自己的圖層，不碰 `kv.*` / `links.md`。

兩種步驟形式（`onboarding-spec.md` §3.1）：
- **A 全螢幕對話框**（心智模型步驟 1/2/3/6/7）：`#obVeil` 全屏遮罩 + 置中卡片。
- **B spotlight wizard**（功能巡禮步驟 4/5）：圈出真實 UI 元件 + 氣泡。

mockup 裡 controller 的核心函式可直接沿用：`boxTo()`（把浮層貼到目標 `getBoundingClientRect()`）、`placeBubble()`（依方向擺氣泡、超界退底部、箭頭對中）、`render()`（依當前步切換圖層）。`resize` 時整個 `render()` 重算座標。

## 關鍵決策（落地時最容易踩的點）

1. **鏤空＝大遮罩 + 反向 `box-shadow`，不用 `clip-path`／`filter`**（design-style §7.11、§1）。看 `#obSpot`：一個透明方框，`box-shadow: 0 0 0 9999px var(--ob-mask)` 當遮罩、外圈再加一層 accent 呼吸光暈。
2. **對話框內子元件（③④⑤）不鏤空、改「高亮環 `#obRing`」**：對話框完整可讀（focus trap 範圍涵蓋整個對話框），只把目標欄位圈起來。這跟 spec「focus trap 擴到氣泡＋整個對話框」一致。
3. **z 分層**：遮罩 60 / 對話框 61 / 高亮環 62 / 氣泡 63（spec 標稱 60／61，這裡細分以保證氣泡永遠在最上）。務必算在燈箱 z50、紋理覆蓋層 z40 之上。
4. **模式徽章必標**：步驟 4「🖱 換你試試」，其餘「👀 看過就好」。互動步驟 spotlight 要有呼吸光暈（`@keyframes obPulse`／`obRing`）。
5. **`prefers-reduced-motion` 全關動畫**（已含 media query，spec §6）。
6. **禁 `backdrop-filter`／`filter`**：遮罩、氣泡、對話框一律不用（弱 GPU 閃動，design-style §1）。
7. **版本／觸發（mockup 未做）**：`localStorage` key `wlib-onboarding-seen`，值為版本字串；首次成功選資料夾、渲染一開始就觸發；跳過＝完成都標記已看過。大升版才跳可點的「有更新！」toast（**全形驚嘆號**），點下去從 Step 1 重播。重看一律從 Step 1，不支援從某步開始。（spec §2、§3.2、O3／O6／O10／O11）

## 待辦（接手要補的互動）

- [ ] **Step 4 真實化**：addUrlBtn 真的能點開對話框；網址欄偵測 `://` + 平台辨識完成才推進；儲存真的寫一筆進 `links.md`（走 `url-spec.md` §6.4 讀-改-寫）才推進。focus trap：② 限「氣泡＋鈕」，③④⑤ 擴到「氣泡＋對話框」。
- [ ] **其餘 6 步**：1 兩種資料同步、2 links.md 壞掉、3 重新整理雙重職責、5 工具列巡禮（搜尋／幻燈片／dock 三顆，逐一 spotlight）、6 換資料夾、7 結尾（按鈕改「我知道了」）。文案逐字照 `onboarding-spec.md` §4。
- [ ] **設定選單加「重看使用教學」**：index.html 目前沒有（mockup 裡標了「·待接手」）。點了直接從 Step 1 跳，不重置 localStorage。（spec §2.2）
- [ ] **版本管理 + 升版 toast**（見上「關鍵決策 7」）。
- [ ] **自動觸發時機**：首次選資料夾、渲染一開始就同步進教學（不等渲染跑完，O1）。後續開 app／換資料夾／已標記版本 ≥ 當前 → 不跳。
- [ ] **無障礙底線**：鍵盤可走上一步／下一步／Esc 跳過、focus 可見、`aria` 標記步驟。
- [ ] **resize／捲動**：重算目標座標（mockup 已示範 resize；真實版頂欄會 sticky 收合，spotlight 目標移動時要跟）。

## ⚠️ spec 同步義務（別忘）

`onboarding-spec.md` §7.3：`url-spec.md`／`folder-switch-spec.md`／`design-style.md` 一改，要回頭 review §4 對應步驟文案。目前 index.html 已把 URL 功能、dock 第三顆「來源篩選」做進去，跟新版 spec 的 UI 現況對得上；唯「重看使用教學」選單項仍待補。
