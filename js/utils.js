/* =====================================================================
   utils.js — 通用小工具（純函式，不碰狀態）
   ===================================================================== */
const $ = id => document.getElementById(id);
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (_) { return u; } };
function addedToTs(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : 0;
}
const todayStr = () => { const d = new Date(); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
function prettyTitle(name) { return name.replace(/\.[^.]+$/, "").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim(); }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }
