/* =====================================================================
   viewer.js — 燈箱 / 幻燈片
   ===================================================================== */
// ---------- 燈箱 / 幻燈片 ----------
const viewer = $("viewer");
let vList = [], vIdx = 0;
// 依目前畫面上的實際排列順序（含時間軸分組）取可見項目
const visible = () => [...grid.querySelectorAll(".card:not(.hidden)")].map(c => c.__item);
const visibleIndexOf = it => visible().indexOf(it);

function openViewer(idx) {
  vList = visible(); if (!vList.length) return;
  vIdx = Math.max(0, idx); viewer.classList.add("show"); document.body.classList.add("no-scroll"); showSlide();
}
function showSlide() {
  const it = vList[vIdx]; if (!it) return;
  $("vImg").src = it._thumbUrl || "";
  $("vTitle").textContent = displayName(it);
  // 完整 tag 清單：標題下方置中（tag-spec §11.4；union 純顯示、自動綠框手動藍實心；無 tag 時空，CSS :empty 收起）
  $("vTags").innerHTML = tagsOfDetailed(it).map(t => `<span class="ctag${t.manual ? " manual" : ""}">#${escapeHtml(t.name)}</span>`).join("");
  $("vCount").textContent = `${vIdx + 1} / ${vList.length}`;
  $("vOpen").textContent = it.kind === "url" ? "開啟連結" : "開啟檔案";
  $("vOpen").onclick = () => openFile(it);
}
function step(d) { vIdx = (vIdx + d + vList.length) % vList.length; showSlide(); }
function closeViewer() { viewer.classList.remove("show"); document.body.classList.remove("no-scroll"); }

$("vPrev").onclick = () => step(-1);
$("vNext").onclick = () => step(1);
$("vClose").onclick = closeViewer;
viewer.onclick = (e) => { if (e.target === viewer) closeViewer(); };
$("vImg").onclick = () => { const it = vList[vIdx]; if (it) openFile(it); };
document.addEventListener("keydown", (e) => {
  if (!viewer.classList.contains("show")) return;
  if (e.key === "Escape") closeViewer();
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
});
