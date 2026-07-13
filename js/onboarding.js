/* =====================================================================
   Onboarding 教學（獨立 controller，疊在 cache-first app 之上，無資料耦合）
   spec：onboarding-spec.md / onboarding-handoff.md / design-style.md §7.11
   ===================================================================== */
const obMajorOf = v => { const m = /^v?(\d+)/.exec(v || ""); return m ? +m[1] : 0; };

let obOn = false, obIdx = 0, obAttempted = false;
let obSingle = false;                                   // 單步播放「資料夾標籤」模式（onboarding-spec §9.2／§9.4）
const obMq600 = matchMedia("(max-width: 600px)");       // spotlight 目標的桌面／手機分流（targetM）

// 條件畫面（onboarding-spec §9.1）：when:"sub"＝有子資料夾檔案才播、"flat"＝平資料夾才播
const obCondOk = sc => !sc.when || ((sc.when === "sub") === hasSubfolderFiles());
// spotlight 目標：手機（≤600px）且有 targetM 時改指手機目標（如 dock 篩選鈕）
const obTargetSel = sc => (sc.targetM && obMq600.matches) ? sc.targetM : sc.target;

// 把浮層方框貼到目標元件位置（含 padding）；resize 時整個 obRender() 重算
function obBoxTo(el, rect, pad) {
  el.style.top = (rect.top - pad) + "px";
  el.style.left = (rect.left - pad) + "px";
  el.style.width = (rect.width + pad * 2) + "px";
  el.style.height = (rect.height + pad * 2) + "px";
}
// 依目標與偏好方向擺氣泡，超界退而求其次、箭頭對準目標中心
function obPlaceBubble(rect, side) {
  const b = $("obBubble"), W = b.offsetWidth, H = b.offsetHeight, gap = 16, m = 10;
  let top, left, arr;
  const tryRight = () => rect.right + gap + W <= window.innerWidth - m;
  const tryLeft  = () => rect.left - gap - W >= m;
  const tryBottom = () => rect.bottom + gap + H <= window.innerHeight - m;
  if (side === "right" && tryRight())       { left = rect.right + gap; top = rect.top; arr = "left"; }
  else if (side === "left" && tryLeft())    { left = rect.left - gap - W; top = rect.top; arr = "right"; }
  else if (side === "bottom" && tryBottom()){ left = rect.left; top = rect.bottom + gap; arr = "up"; }
  else if (tryBottom())                     { left = rect.left; top = rect.bottom + gap; arr = "up"; }
  else if (tryLeft())                       { left = rect.left - gap - W; top = rect.top; arr = "right"; }
  else                                      { left = rect.left; top = rect.top - gap - H; arr = "down"; }
  left = Math.max(m, Math.min(left, window.innerWidth - W - m));
  top  = Math.max(m, Math.min(top,  window.innerHeight - H - m));
  b.style.left = left + "px"; b.style.top = top + "px";
  b.className = "show arr-" + arr;
  if (arr === "up" || arr === "down") {
    const cx = rect.left + rect.width / 2 - left;
    b.style.setProperty("--arr", Math.max(14, Math.min(cx - 7, W - 28)) + "px");
  } else {
    const cy = rect.top + rect.height / 2 - top;
    b.style.setProperty("--arr", Math.max(14, Math.min(cy - 7, H - 28)) + "px");
  }
}

function obDotsHTML(sc) {
  if (!sc.macro || obSingle) return "";   // 開場（封面）與單步播放不顯示步驟點（§9.4）
  return Array.from({ length: OB_TOTAL }, (_, k) => `<i class="${k === sc.macro - 1 ? "on" : ""}"></i>`).join("");
}
// 設定步驟控制：上一步禁用狀態、下一步顯示與文字（依該步推進方式）
function obSetFoot(prevBtn, nextBtn, sc) {
  prevBtn.style.display = obSingle ? "none" : "";   // 單步播放沒有「上一步」（§9.4）
  prevBtn.disabled = (obIdx === 0);
  if (sc.last) { nextBtn.textContent = "我知道了"; nextBtn.style.display = ""; }
  else if (sc.kind === "dialog" || sc.next) { nextBtn.textContent = "下一步"; nextBtn.style.display = ""; }
  else if (sc.advance === "save") { nextBtn.textContent = "下一步"; nextBtn.style.display = obAttempted ? "" : "none"; }
  else { nextBtn.style.display = "none"; }   // 純動作推進步驟（4-1 按鈕、4-2 貼網址）：不給下一步
}

// 維持新增網址對話框狀態與當前畫面一致
function obSyncDialog(sc) {
  const open = $("urlDialog").classList.contains("show");
  if (sc.dialog && !open) openDialog("add");
  else if (!sc.dialog && open) hideOverlay("urlDialog");
}
// 維持設定選單狀態與當前畫面一致（sc.menu＝該步選單保持展開並鎖住，onboarding-spec §9.7 F1-②；
// 「重新整理」「更換資料夾」的選單項 spotlight 也復用此機制，§9.6）；
// obMenuLock 讓 controls.js 的 closeSettings（外點／Esc／捲動收合）在鎖定期間不生效
function obSyncMenu(sc) {
  if (sc.menu) {
    $("settingsList").hidden = false;
    $("settingsBtn").setAttribute("aria-expanded", "true");
    obMenuLock = true;
  } else {
    obMenuLock = false;
    closeSettings();
  }
}

function obHideLayers() {
  ["obMask", "obSpot", "obHole", "obRing", "obBubble", "obPanel"].forEach(id => $(id).classList.remove("show"));
}

function obRender() {
  const sc = OB_SCREENS[obIdx];
  obHideLayers();
  obSyncDialog(sc);
  obSyncMenu(sc);

  if (sc.kind === "dialog") {
    $("obPanelBadge").textContent = sc.badge;
    $("obPanelBadge").style.display = sc.badge === OB_DO ? "" : "none";   // 看過就好步驟不顯示徽章
    $("obPanelTitle").textContent = sc.title;
    $("obPanelText").textContent = sc.body;
    $("obPanelDots").innerHTML = obDotsHTML(sc);
    obSetFoot($("obPanelPrev"), $("obPanelNext"), sc);
    $("obMask").className = "show dark";
    $("obPanel").classList.add("show");
    $("obPanel").querySelector(".panel-inner").scrollTop = 0;   // 每步從頂端（徽章／標題）開始看
    return;
  }

  // spot / ring：填氣泡
  $("obBubbleBadge").textContent = sc.badge;
  $("obBubbleBadge").style.display = sc.badge === OB_DO ? "" : "none";   // 看過就好步驟不顯示徽章
  $("obBubbleText").textContent = sc.text;
  if (sc.eg) {
    const eg = document.createElement("span");
    eg.className = "url-eg"; eg.textContent = sc.eg;
    $("obBubbleText").appendChild(document.createTextNode("\n"));
    $("obBubbleText").appendChild(eg);
  }
  $("obBubbleDots").innerHTML = obDotsHTML(sc);
  obSetFoot($("obBubblePrev"), $("obBubbleNext"), sc);
  // 次要鈕（如「先不開啟」，onboarding-spec §9.1-②）：有 alt 才顯示
  $("obBubbleAlt").style.display = sc.alt ? "" : "none";
  if (sc.alt) $("obBubbleAlt").textContent = sc.alt;

  // 等對話框／版面排好再量座標
  requestAnimationFrame(() => {
    if (!obOn || OB_SCREENS[obIdx] !== sc) return;
    const el = document.querySelector(obTargetSel(sc));
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (sc.kind === "spot") {
      $("obMask").className = "show clear";          // 透明：只擋點擊，壓暗交給 #obSpot
      obBoxTo($("obSpot"), rect, 8); $("obSpot").classList.add("show");
      if (sc.interactive) {                          // 互動步驟：透明點擊代理轉發給真實目標
        obBoxTo($("obHole"), rect, 0);
        $("obHole").onclick = () => { const t = document.querySelector(obTargetSel(sc)); if (t) t.click(); };
        $("obHole").classList.add("show");
      }
    } else {                                         // ring：對話框自帶遮罩壓暗＋擋背景，只圈高亮環
      obBoxTo($("obRing"), rect, 8); $("obRing").classList.add("show");
    }
    $("obBubble").classList.add("show");             // 先顯示再量尺寸，否則 offsetWidth=0 會算錯擺位／溢出
    obPlaceBubble(rect, sc.side);
  });
}

function obGo(d) {
  let n = obIdx + d;
  // 跳過與資料夾結構不符的條件畫面（sub／flat 兩形式只播其一，§9.1）
  while (n >= 0 && n < OB_SCREENS.length && !obCondOk(OB_SCREENS[n])) n += (d < 0 ? -1 : 1);
  if (n < 0) return;
  if (n >= OB_SCREENS.length) { obFinish(); return; }
  if (obSingle && OB_SCREENS[n].macro !== OB_TAG_MACRO) { obFinish(); return; }   // 單步播放：走出這一大步即結束
  obIdx = n; obAttempted = false; obRender();
}

function startOnboarding() {
  obOn = true; obSingle = false; obIdx = 0; obAttempted = false;
  document.body.classList.add("ob-active");
  bar.classList.remove("nav-hidden");                // 頂欄一定可見
  closeSettings();
  window.scrollTo(0, 0);
  obRender();
}
// 單獨播放「資料夾標籤」一步（既有使用者：重新整理掃出子資料夾且偏好未設定，onboarding-spec §9.2）。
// 版面：無步驟點、無上一步；✕＝關閉視同「先不開啟」（obFinish 對未設偏好寫 off，§9.4）。
function playFoldertagStep() {
  const idx = OB_SCREENS.findIndex(sc => sc.macro === OB_TAG_MACRO && obCondOk(sc));
  if (idx < 0) return;
  obOn = true; obSingle = true; obIdx = idx; obAttempted = false;
  document.body.classList.add("ob-active");
  bar.classList.remove("nav-hidden");
  closeSettings();
  window.scrollTo(0, 0);
  obRender();
}
function obFinish() {
  obOn = false;
  if (!obSingle) { try { localStorage.setItem(OB_SEEN_KEY, OB_VERSION); } catch (_) {} }   // 單步播放不動教學已看版本
  obSingle = false;
  // 跳過／看完而未做選擇 → 視同「先不開啟」寫 off，之後不再自動詢問（§9.4；tag-spec §4a）
  if (foldertagPref() === null) {
    try { localStorage.setItem(FOLDERTAG_KEY, "off"); } catch (_) {}
    applyFoldertag();
  }
  obMenuLock = false; closeSettings();
  obHideLayers();
  if ($("urlDialog").classList.contains("show")) hideOverlay("urlDialog");
  document.body.classList.remove("ob-active");
}
function maybeAutoOnboarding() {
  if (localStorage.getItem(OB_SEEN_KEY)) return;     // 已看過（任何版本）→ 首次不再自動跳
  startOnboarding();
}

// 步驟控制按鈕
$("obPanelPrev").onclick  = () => obGo(-1);
$("obPanelNext").onclick  = () => { OB_SCREENS[obIdx].last ? obFinish() : obGo(1); };
$("obBubblePrev").onclick = () => obGo(-1);
$("obBubbleNext").onclick = () => obGo(1);
$("obSkipPanel").onclick  = obFinish;
$("obSkipBubble").onclick = obFinish;

// 推進掛鉤（皆由 obOn + 當前步推進方式守門；非教學期間／其他步一律忽略）
document.addEventListener("wlib:dialogopen", () => { const sc = OB_SCREENS[obIdx]; if (obOn && sc && sc.advance === "dialogopen") obGo(1); });
$("fUrl").addEventListener("input", () => {
  const sc = OB_SCREENS[obIdx];
  if (obOn && sc && sc.advance === "urlinput") { const v = $("fUrl").value.trim(); if (v.includes("://") && detectPlatform(v)) obGo(1); }
});
document.addEventListener("wlib:urlsaveattempt", () => {     // 4-4：嘗試寫入（無論成敗）→ 露出「下一步」
  const sc = OB_SCREENS[obIdx];
  if (obOn && sc && sc.advance === "save") { obAttempted = true; $("obBubbleNext").style.display = ""; }
});
document.addEventListener("wlib:urladded", () => { const sc = OB_SCREENS[obIdx]; if (obOn && sc && sc.advance === "save") obGo(1); });
// 資料夾標籤步驟：按下開關（開或關都算做了決定）→ 推進（tag-spec §4a；setFoldertag 發出此事件）
document.addEventListener("wlib:foldertag", () => { const sc = OB_SCREENS[obIdx]; if (obOn && sc && sc.advance === "foldertag") obGo(1); });
// 「先不開啟」次要鈕：寫入 off（觸發 wlib:foldertag → 上面掛鉤推進）
$("obBubbleAlt").onclick = () => setFoldertag(false);

// 教學進行中：鎖死新增網址對話框（取消鈕／點遮罩不可關閉，spec 點 2）＋ Esc＝跳過教學（capture，不動原 handler）。
// 「儲存」鈕也一併攔截——只有走到「儲存」那一步（advance:"save"）才放行，
// 避免在貼網址／看縮圖步驟就提前寫入、對話框被關掉導致教學流程錯亂。
document.addEventListener("click", (e) => {
  if (!obOn) return;
  const sc = OB_SCREENS[obIdx];
  if (!sc || !sc.dialog || !e.target.closest) return;
  const blockSave = sc.advance !== "save" && e.target.closest("#dlgSave");
  if (e.target.id === "urlDialog" || e.target.closest("#dlgCancel") || blockSave) {
    e.stopImmediatePropagation(); e.preventDefault();
  }
}, true);
document.addEventListener("keydown", (e) => {
  if (!obOn || e.key !== "Escape") return;
  e.stopImmediatePropagation(); e.preventDefault(); obFinish();
}, true);

// resize：重算座標（spec §3.1）
window.addEventListener("resize", () => { if (obOn) obRender(); });

// 重看教學（設定選單）：一律從 Step 1，不重置 localStorage（spec §2.2／O11）
$("replayOnboarding").onclick = () => { startOnboarding(); };

// 升版「有更新！」toast：cache 直出時，已看版本主版號 < 當前 → 跳可點 toast，點下去從 Step 1 重播（spec O10）
function obMaybeUpgradeToast() {
  const seen = localStorage.getItem(OB_SEEN_KEY);
  if (!seen || obMajorOf(seen) >= OB_MAJOR) return;
  $("obUpgrade").classList.add("show");
}
$("obUpgradeBtn").onclick = () => { $("obUpgrade").classList.remove("show"); startOnboarding(); };
$("obUpgradeClose").onclick = () => { $("obUpgrade").classList.remove("show"); };
