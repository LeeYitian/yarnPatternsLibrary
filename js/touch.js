/* =========================================================
   觸控裝置互動（touch-interaction-spec.md）
   ========================================================= */

let tbSelectedCard = null;

function tbHide() {
  if (tbSelectedCard) { tbSelectedCard.classList.remove("tb-selected"); tbSelectedCard = null; }
  $("touchToolbar").classList.remove("show");
  $("touchIntercept").classList.remove("show");
}

function tbShow(it) {
  if (tbSelectedCard) tbSelectedCard.classList.remove("tb-selected");
  tbSelectedCard = it._card;
  tbSelectedCard.classList.add("tb-selected");
  const isUrl = it.kind === "url";
  const leftEl  = $("touchToolbar").querySelector(".tb-left");
  const rightEl = $("touchToolbar").querySelector(".tb-right");
  // 完整 tag 清單：工具列本體上方一列（tag-spec §11.4；union 純顯示、自動綠框手動藍實心；無 tag 時空，CSS :empty 收起）
  $("touchToolbar").querySelector(".tb-tags").innerHTML =
    tagsOfDetailed(it).map(t => `<span class="ctag${t.manual ? " manual" : ""}">#${escapeHtml(t.name)}</span>`).join("");
  if (isUrl) {
    leftEl.innerHTML =
      `<button class="tb-edit" title="編輯">${SVG_EDIT}</button>` +
      `<button class="tb-del"  title="刪除">${SVG_DEL}</button>`;
    leftEl.querySelector(".tb-edit").onclick = (e) => { e.stopPropagation(); tbHide(); openDialog("edit", it); };
    leftEl.querySelector(".tb-del").onclick  = (e) => { e.stopPropagation(); tbHide(); openConfirm(it); };
  } else {
    leftEl.innerHTML = "";
  }
  rightEl.innerHTML = `<button class="tb-open">${isUrl ? SVG_TB_EXT : SVG_TB_FILE}開啟</button>`;
  rightEl.querySelector(".tb-open").onclick = (e) => { e.stopPropagation(); tbHide(); openFile(it); };
  $("touchToolbar").classList.add("show");
  $("touchIntercept").classList.add("show");
}

$("touchIntercept").onclick = () => tbHide();

function attachLongPress(card, it) {
  let timer = null, startX = 0, startY = 0, suppressClick = false;
  card.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    timer = setTimeout(() => { timer = null; suppressClick = true; tbShow(it); }, 500);
  }, { passive: true });
  card.addEventListener("touchmove", (e) => {
    if (!timer) return;
    if (Math.abs(e.touches[0].clientX - startX) > 8 || Math.abs(e.touches[0].clientY - startY) > 8) {
      clearTimeout(timer); timer = null;
    }
  }, { passive: true });
  const done = () => { if (timer) { clearTimeout(timer); timer = null; } };
  card.addEventListener("touchend",    done);
  card.addEventListener("touchcancel", done);
  card.addEventListener("contextmenu", (e) => { if (mqTouch.matches) e.preventDefault(); });
  card.addEventListener("click", () => {
    if (suppressClick) { suppressClick = false; return; }
    if (!mqTouch.matches) return;
    openViewer(visibleIndexOf(it));
  });
}
