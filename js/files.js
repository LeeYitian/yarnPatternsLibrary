/* =====================================================================
   files.js — 本機檔案的手動 tag（tag-spec.md §6.1）
   files.md 是唯一真相；kv.files 只是 read-side cache + 復原副本，
   角色與 kv.urls 完全對稱。自動 tag 現算不落地（tags.js）；本檔只管
   手動 tag 的解析／序列化／檔案 IO／災難復原（CRUD 寫回於第二期 UI 接上）。
   哲學、原子寫、災難復原一律比照 urls.js（讀 readText／寫 writeText／備份 renameInDir）。
   ===================================================================== */

// ---- Markdown 解析／序列化（容錯 + 未知欄位原樣保留，比照 parseLinks §6.1）----
// 格式：`- 相對路徑` 為 flat list item（頂格），縮排的 `  - tags: #a #b` 是其欄位。
function parseFiles(text) {
  const out = []; let cur = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue;
    if (/^\s/.test(rawLine)) {                     // 縮排行 → 只當欄位；非欄位（雜訊）忽略
      const field = line.match(/^\s+-\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/);
      if (field && cur) {
        const key = field[1].toLowerCase(), val = field[2].trim();
        if (key === "tags") cur.tags = parseTagField(val);
        else cur._extra[field[1]] = val;           // 未知欄位保留原 key，寫回不丟
      }
      continue;
    }
    const item = line.match(/^-\s+(.+)$/);         // 頂格 `- path`
    if (item) {
      const path = item[1].trim();
      if (path) { cur = { path, tags: [], _extra: {} }; out.push(cur); }
      else cur = null;
      continue;
    }
    // 其餘行（# 標題、雜訊）忽略
  }
  return out;
}
function serializeFiles(entries) {
  let out = "# Yarn Library Files\n\n";
  for (const e of entries) {
    out += `- ${e.path}\n`;
    const tags = (e.tags || []).filter(Boolean);
    if (tags.length) out += `  - tags: ${tags.map(t => "#" + t).join(" ")}\n`;
    const extra = e._extra || {};
    for (const k of Object.keys(extra)) out += `  - ${k}: ${extra[k]}\n`;
    out += "\n";
  }
  return out;
}
// filesMap（path→tags[]）⇄ 可序列化 entries
const mapToFileEntries = map => [...map.entries()].map(([path, tags]) => ({ path, tags, _extra: {} }));

// ---- 快取（kv.files，T22：既有 kv store 加一個 key，比照 kv.urls）----
async function persistFiles(map) {
  try { await DB.set("kv", "files", [...map.entries()].map(([path, tags]) => ({ path, tags }))); }
  catch (e) { console.warn("[lib] 無法寫入 files 快取：", e); }
}
async function filesFromCache() {
  let cached = [];
  try { cached = (await DB.get("kv", "files")) || []; } catch (_) {}
  return new Map(cached.map(e => [e.path, e.tags || []]));
}

// ---- 載入 / 災難復原（比照 loadUrls／recoverUrls，§6.1）----
// 重新整理對 files.md「只讀不寫」：正常路徑純解析、不寫回；只有解析失敗／讀取錯誤的災難復原才寫。
async function loadFiles() {
  let raw = null;
  try { raw = await readText(dirHandle, "files.md"); }
  catch (e) {
    if (e && e.name === "NotFoundError") raw = null;    // 不存在＝正常（還沒加任何手動 tag）：用快取顯示、不建檔
    else { console.warn("[lib] 讀取 files.md 失敗：", e); return await recoverFiles(false); }
  }
  if (raw === null) return await filesFromCache();       // 不寫回（避免無故建立 files.md、違反只讀）
  let parsed;
  try { parsed = parseFiles(raw); }
  catch (e) { console.warn("[lib] 解析 files.md 失敗：", e); return await recoverFiles(true); }
  const map = new Map(parsed.map(e => [e.path, e.tags]));
  await persistFiles(map);
  return map;
}
async function recoverFiles(brokenExists) {
  const cachedMap = await filesFromCache();
  let backupName = null;
  if (brokenExists) {
    backupName = "files.md.broken-" + new Date().toISOString().replace(/[:.]/g, "-");
    try { await renameInDir(dirHandle, "files.md", backupName); }
    catch (e) { console.warn("[lib] 備份壞檔失敗：", e); backupName = null; }
  }
  if (cachedMap.size) {
    try { await writeText(dirHandle, "files.md", serializeFiles(mapToFileEntries(cachedMap))); }
    catch (e) { console.warn("[lib] 還原寫回 files.md 失敗：", e); }
  }
  if (brokenExists || cachedMap.size) {
    const detail = backupName
      ? `原檔已備份為 <b>${escapeHtml(backupName)}</b>，如有遺漏可用編輯器打開該檔手動恢復。`
      : "偵測到 files.md 遺失，已用上次成功讀取的快取重建。";
    toast(`<b>files.md</b> 無法正常讀取，已從快取自動還原。<br>${detail}`, true, [], 9000);
  }
  await persistFiles(cachedMap);
  return cachedMap;
}
