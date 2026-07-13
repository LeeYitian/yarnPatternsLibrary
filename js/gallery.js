/* =====================================================================
   gallery.js — 畫廊卡片與篩選
   卡片建立（本機＋URL 融合）、一般網格／時間軸 render、
   搜尋×來源篩選、開啟檔案／連結。
   ===================================================================== */
// 卡片只建立一次（保留已畫好的封面），重排時重新搬移既有節點。
function ensureCards() {
  allItems().forEach((it) => {
    if (it._card) return;
    const card = document.createElement("div");
    card.className = "card " + (it.kind === "url" ? "url" : "local"); // 篩選 / 樣式靠這個 class
    card.dataset.name = (
      it.kind === "url"
        ? `${it.title} ${it._host || hostOf(it.url)} ${it.url}`
        : it.name
    ).toLowerCase();
    card.innerHTML = it.kind === "url" ? urlCardHTML(it) : localCardHTML(it);
    card.querySelector(".expand").onclick = (e) => {
      e.stopPropagation();
      openViewer(visibleIndexOf(it));
    };
    // 點 tag 區＝想看分類 → 開燈箱（完整 tag 在那）；點卡片其他處照舊開檔／開連結。
    // 用 e.target 判斷而非綁在 chips 上：chips 會被 refreshCardTags() 就地重建，監聽不能掛死在節點上。
    card.onclick = (e) => {
      if (mqTouch.matches) return;
      if (e.target.closest(".card-tags")) {
        openViewer(visibleIndexOf(it));
        return;
      }
      openItem(it);
    };
    if (it.kind === "url") {
      card.querySelector(".edit").onclick = (e) => {
        e.stopPropagation();
        openDialog("edit", it);
      };
      card.querySelector(".del").onclick = (e) => {
        e.stopPropagation();
        openConfirm(it);
      };
    } else {
      // 本機卡：唯一動作＝編輯標籤（動 files.md，非改檔案內容，§11.6.1／T24）
      card.querySelector(".tagedit").onclick = (e) => {
        e.stopPropagation();
        openFileTagDialog(it);
      };
    }
    attachLongPress(card, it);
    card.__item = it;
    it._card = card;
  });
}

function localCardHTML(it) {
  return (
    `<div class="thumb"><div class="spin"></div>` +
    `<span class="badge ${it.type}">${it.type === "pdf" ? "PDF" : it.ext.toUpperCase()}</span>` +
    `<div class="card-actions"><button class="tagedit" title="編輯標籤">${SVG_TAG}</button></div>` +
    `<button class="expand" title="放大預覽">${SVG_EXPAND}</button>` +
    `<div class="label"><span class="bar"></span><div class="txt">` +
    `<div class="name">${escapeHtml(prettyTitle(it.name))}</div>` +
    `${cardTagsHTML(it)}</div></div></div>`
  );
}
function urlCardHTML(it) {
  return (
    `<div class="thumb"><div class="spin"></div>` +
    `<span class="badge url">連結</span>` +
    `<div class="card-actions"><button class="edit" title="編輯">${SVG_EDIT}</button><button class="del" title="刪除">${SVG_DEL}</button></div>` +
    `<button class="expand" title="放大預覽">${SVG_EXPAND}</button>` +
    `<div class="label"><span class="bar url"></span><div class="txt">` +
    `<div class="name">${escapeHtml(displayName(it))}</div>` +
    `${cardTagsHTML(it)}</div></div></div>`
  );
}

// 點卡片其他地方 → 另開視窗：本機=新分頁開檔；URL=開連結（handoff §4）
function openItem(it) {
  openFile(it);
}

const byName = (a, b) =>
  sortKeyName(a).localeCompare(sortKeyName(b), "zh-Hant", { numeric: true });

function render() {
  ensureCards();
  grid.innerHTML = "";
  grid.classList.toggle("mode-timeline", sortMode === "time");
  grid.classList.toggle("mode-name", sortMode !== "time");
  if (sortMode === "time") renderTimeline();
  else renderFlat();
  applyFilter();
}

function renderFlat() {
  allItems()
    .slice()
    .sort(byName)
    .forEach((it, i) => {
      it._card.style.animationDelay = Math.min(i * 22, 600) + "ms";
      grid.appendChild(it._card);
    });
}

// 依時間（新→舊）分月；本機用 lastModified，URL 把 added 當天 00:00 轉時間戳，共用同一條軸（handoff §2）。
function renderTimeline() {
  const arr = allItems()
    .slice()
    .sort((a, b) => itemTs(b) - itemTs(a));
  let curKey = null,
    curGrid = null,
    i = 0;
  arr.forEach((it) => {
    const ts = itemTs(it);
    const d = ts ? new Date(ts) : null;
    const key = d ? `${d.getFullYear()}-${d.getMonth()}` : "?";
    if (key !== curKey) {
      curKey = key;
      const month = document.createElement("div");
      month.className = "tl-month";
      const head = document.createElement("div");
      head.className = "tl-head";
      head.innerHTML = `<span class="tl-label">${d ? `${d.getFullYear()} 年 ${d.getMonth() + 1} 月` : "無日期"}</span>`;
      curGrid = document.createElement("div");
      curGrid.className = "tl-grid";
      month.appendChild(head);
      month.appendChild(curGrid);
      grid.appendChild(month);
    }
    it._card.style.animationDelay = Math.min(i * 12, 480) + "ms";
    curGrid.appendChild(it._card);
    i++;
  });
}

async function openFile(it) {
  if (it.kind === "url") {
    // 只另開新分頁。window.open(...,"noopener") 規範上一定回傳 null，
    // 所以「不要」再用 if(!w) location.href=... 當退路，否則原分頁也會跟著導航。
    window.open(it.url, "_blank", "noopener");
    return;
  }
  try {
    let fh = it._entry; // 本次有掃描資料夾時直接用
    if (!fh) {
      // 純從快取載入時，沿相對路徑逐層重新取得（舊快取無 path → fallback 檔名＝頂層）
      if (!(await ensureRead(dirHandle))) {
        alert("請先選擇放編織圖的資料夾。");
        return;
      }
      const segs = (it.path || it.name).split("/");
      let dir = dirHandle;
      for (let i = 0; i < segs.length - 1; i++)
        dir = await dir.getDirectoryHandle(segs[i]);
      fh = await dir.getFileHandle(segs[segs.length - 1]);
      it._entry = fh;
    }
    const file = await fh.getFile();
    const url = URL.createObjectURL(file);
    const win = window.open(url, "_blank");
    if (!win) location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    alert("無法開啟檔案：" + (e && e.message ? e.message : e));
  }
}

// 篩選：搜尋 ∩ 來源 ∩ 所有選中 tag（AND 疊加，tag-spec §7.1）；只加 .hidden，不重建 DOM。
// 比對用 tagsOf(it)=union(自動, 手動)（§7.1）：帶相符手動 tag 的 URL 條目會留下（T26 推翻原 T13）。
function applyFilter() {
  const q = $("search").value.trim().toLowerCase();
  let shown = 0;
  const selected = [...selectedTags];
  for (const it of allItems()) {
    const matchSearch = !q || it._card.dataset.name.includes(q);
    const matchSource =
      sourceMode === "all" ||
      (sourceMode === "local" && it.kind !== "url") ||
      (sourceMode === "url" && it.kind === "url");
    let matchTags = true;
    if (selected.length) {
      const ks = new Set(tagsOf(it).map(tagKey));
      matchTags = selected.every((k) => ks.has(k));
    }
    const hit = matchSearch && matchSource && matchTags;
    it._card.classList.toggle("hidden", !hit);
    if (hit) shown++;
  }
  // 時間軸模式：把篩選後沒有任何可見卡片的月份整塊收起，避免留白
  if (sortMode === "time") {
    grid.querySelectorAll(".tl-month").forEach((m) => {
      m.classList.toggle(
        "hidden",
        !m.querySelector(".tl-grid > .card:not(.hidden)"),
      );
    });
  }
  const total = items.length + urls.length;
  if (total) {
    empty.classList.toggle("hidden", shown > 0);
    if (!shown)
      empty.textContent = (q || selected.length) ? "找不到符合的項目。" : "這個來源目前沒有項目。";
  }
  // 手機篩選遮罩的即時回饋（tag-spec §11.3）：「完成」鈕顯示剩餘項數；dock 篩選鈕有啟用篩選時亮起
  $("fbDone").textContent = `完成 · ${shown} 項`;
  $("filterBtn").classList.toggle("active", selected.length > 0 || q.length > 0);
}
