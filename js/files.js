/* =====================================================================
   files.js — 本機檔案的手動 tag（tag-spec.md §6.1）
   files.md 是唯一真相；kv.files 只是 read-side cache + 復原副本，
   角色與 kv.urls 完全對稱。自動 tag 現算不落地（tags.js）；本檔只管
   手動 tag 的解析／序列化／檔案 IO／災難復原（CRUD 寫回於第二期 UI 接上）。
   哲學、原子寫、災難復原一律比照 urls.js（讀 readText／寫 writeText／備份 renameInDir）。
   ===================================================================== */

// ---- Markdown 解析／序列化（容錯 + 未知欄位原樣保留，比照 parseLinks §6.1）----
// 格式：`- 相對路徑` 為 flat list item（頂格），縮排的 `  - tags: #a #b` 是其欄位。
// 回傳 { entries, dropped }：dropped＝無法辨識的行數，供壞檔守門判定「整份壞」（broken-file-recovery-spec §D1，比照 parseLinks）。
function parseFiles(text) {
  const out = []; let cur = null; let dropped = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue;
    if (line.trim().startsWith("#")) continue;     // Markdown 標題／註解：合法忽略，不算壞行
    if (/^\s/.test(rawLine)) {                     // 縮排行 → 只當欄位
      const field = line.match(/^\s+-\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/);
      if (field && cur) {
        const key = field[1].toLowerCase(), val = field[2].trim();
        if (key === "tags") cur.tags = parseTagField(val);
        else cur._extra[field[1]] = val;           // 未知欄位保留原 key，寫回不丟
      } else dropped++;                            // 縮排雜訊 / 無主欄位 → 無法辨識
      continue;
    }
    const item = line.match(/^-\s+(.+)$/);         // 頂格 `- path`
    if (item) {
      const path = item[1].trim();
      if (path) { cur = { path, tags: [], _extra: {} }; out.push(cur); }
      else { cur = null; dropped++; }
      continue;
    }
    dropped++;   // 非空、非標題，卻無法辨識的行（壞檔判定用；壞一行仍容錯靜默丟棄，§D2）
  }
  return { entries: out, dropped };
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
  try {
    await DB.set("kv", "files", [...map.entries()].map(([path, tags]) => ({ path, tags })));
    await DB.set("kv", "filesDir", dirHandle || null);    // 資料夾戳記，與快取同進同退（比照 kv.urlsDir）
  }
  catch (e) { console.warn("[lib] 無法寫入 files 快取：", e); }
}

// ---- 載入 / 災難復原（比照 loadUrls／recoverUrls，§6.1；壞檔守門見 broken-file-recovery-spec）----
// 重新整理對 files.md「只讀不寫」：正常路徑純解析、不寫回；只有整份壞掉／讀取錯誤的災難復原才寫。
async function loadFiles() {
  let raw = null;
  try { raw = await readText(dirHandle, "files.md"); }
  catch (e) {
    if (e && e.name === "NotFoundError") raw = null;    // 不存在 → 走與 loadUrls 相同的復原路徑（見下）
    else { console.warn("[lib] 讀取 files.md 失敗：", e); return await recoverFiles(false); }
  }
  // files.md 不存在＝比照 loadUrls 的 NotFound：recoverFiles(false) 在快取空時不建檔（維持「沒用過手動 tag 就不建檔」），
  // 快取非空時才把 files.md 還原回來——否則外部刪掉 files.md 後，下一次 saveFileTags 讀到空磁碟會靜默丟掉其他檔案的手動 tag。
  if (raw === null) return await recoverFiles(false);
  const { entries, dropped } = parseFiles(raw);           // parser 容錯永不 throw；「整份壞」靠 dropped 判定
  if (entries.length === 0 && dropped > 0) {
    try { return await recoverFiles(true); }
    catch (e) {
      if (e instanceof BrokenBackupError) {
        toast(`<b>files.md</b> 內容異常，且<b>自動備份失敗</b>，為避免蓋掉原始檔案，網頁沒有改動它。<br>請先用檔案總管手動複製一份 <b>files.md</b> 再處理。`, true, [], 12000);
        return new Map();
      }
      throw e;
    }
  }
  const map = new Map(entries.map(e => [e.path, e.tags]));
  await persistFiles(map);
  return map;
}
async function recoverFiles(brokenExists) {
  let cachedArr = [];
  try { cachedArr = (await DB.get("kv", "files")) || []; } catch (_) {}
  let stamp = null;
  try { stamp = await DB.get("kv", "filesDir"); } catch (_) {}
  // 外來快取（戳記屬於別資料夾）→ 視同空：不把別資料夾的手動 tag 寫進當前 files.md（tag-spec §6.1 / folder-switch-spec §1）
  const cachedMap = (await cacheFolderMatches(stamp)) ? new Map(cachedArr.map(e => [e.path, e.tags || []])) : new Map();

  let backupName = null;
  if (brokenExists) {
    // §D4：壞檔一律「先安全備份」，備份失敗＝寧可不動原檔也不無備份覆蓋 → 丟 BrokenBackupError 中止（比照 recoverUrls）。
    backupName = "files.md.broken-" + new Date().toISOString().replace(/[:.]/g, "-");
    try { await renameInDir(dirHandle, "files.md", backupName); }
    catch (e) {
      console.warn("[lib] 備份壞檔失敗，中止自動還原以免覆蓋無備份原檔：", e);
      throw new BrokenBackupError("files.md 內容異常且自動備份失敗，為保住原始檔案已中止；請先手動複製一份 files.md。");
    }
  }
  if (cachedMap.size) {
    try { await writeText(dirHandle, "files.md", serializeFiles(mapToFileEntries(cachedMap))); }
    catch (e) { console.warn("[lib] 還原寫回 files.md 失敗：", e); }
  }
  if (brokenExists || cachedMap.size) {
    const restored = cachedMap.size ? "已從快取自動還原。" : "目前沒有可用的同資料夾快取可還原。";
    const detail = backupName
      ? `原檔已備份為 <b>${escapeHtml(backupName)}</b>，如有遺漏可用編輯器打開該檔手動恢復。`
      : "偵測到 files.md 遺失，已用上次成功讀取的快取重建。";
    toast(`<b>files.md</b> 無法正常讀取，${restored}<br>${detail}`, true, [], 9000);
  }
  await persistFiles(cachedMap);
  return cachedMap;
}

// ---- CRUD（讀-改-寫原子寫回，比照 urls.js reparseForWrite，§6.1）----
// 讀磁碟 files.md → re-parse；整份壞掉 → 先 .broken 備份 + 同資料夾快取還原再套用本次編輯（broken-file-recovery-spec §Phase4）。
async function reparseFilesForWrite() {
  let raw = "";
  try { raw = await readText(dirHandle, "files.md"); }
  catch (e) { if (!(e && e.name === "NotFoundError")) throw e; }
  const { entries, dropped } = parseFiles(raw);
  if (entries.length === 0 && dropped > 0) return { entries: mapToFileEntries(await recoverFiles(true)), recovered: true };
  return { entries };
}

// 儲存某本機檔的手動 tag（§6.1）：讀-改-寫 files.md、更新 kv.files。
// 空條目清除規則：正在編輯的檔案必存在（非孤兒）→ 清空即移除該條目；其他孤兒條目原樣保留（reparse 不動它們）。
async function saveFileTags(it, newTags) {
  if (!dirHandle) { toast("請先選擇一個資料夾。", true); return false; }
  if (!await ensureWrite(dirHandle)) { toast("需要資料夾的寫入權限才能儲存。", true); return false; }
  const path = it.path || it.name;
  const clean = [], seen = new Set();
  for (const t of newTags || []) { const k = tagKey(t); if (!seen.has(k)) { seen.add(k); clean.push(t); } }
  const { entries } = await reparseFilesForWrite();
  const idx = entries.findIndex(e => e.path === path);
  if (idx >= 0) {
    if (clean.length) entries[idx].tags = clean;
    else entries.splice(idx, 1);              // 清空且對得到現有檔案 → 移除條目
  } else if (clean.length) {
    entries.push({ path, tags: clean, _extra: {} });
  }
  await writeText(dirHandle, "files.md", serializeFiles(entries));
  filesMap = new Map(entries.map(e => [e.path, e.tags || []]));   // 含孤兒條目（顯示時對不到 item 自然不出現）
  await persistFiles(filesMap);
  return true;
}

// ---- 「編輯標籤」對話框（本機檔案，§11.6.2）----
const fileTagField = makeTagField("fileTags");
let fileTagTarget = null;
function openFileTagDialog(it) {
  fileTagTarget = it;
  $("ftName").textContent = prettyTitle(it.name);
  fileTagField.set(manualTags(it), autoTags(it).map(tagKey));   // 既有手動 tag 為 chips；自動 tag 的 key 擋重複新增
  showOverlay("fileTagDialog");
  setTimeout(() => fileTagField.focus(), 50);
}
$("fileTagCancel").onclick = () => hideOverlay("fileTagDialog");
$("fileTagSave").onclick = async () => {
  const it = fileTagTarget; if (!it) return;
  const btn = $("fileTagSave"); btn.disabled = true; const prev = btn.textContent; btn.textContent = "儲存中…";
  try {
    const before = manualTags(it).slice();
    const next = fileTagField.get();
    if (await saveFileTags(it, next)) {
      hideOverlay("fileTagDialog");
      refreshCardTags(); renderFilterbar(); applyFilter();   // 比照 applyFoldertag：卡片 chips＋篩選區重繪
      // T25：移除的手動 tag 若同時仍是自動 tag → chip 退回綠框（refreshCardTags 已處理），並提示
      const nextKeys = new Set(next.map(tagKey));
      const stillAuto = before.filter(t => !nextKeys.has(tagKey(t)) && autoTags(it).some(a => tagKey(a) === tagKey(t)));
      toast(stillAuto.length
        ? `已移除手動標籤，「#${escapeHtml(stillAuto[0])}」仍由資料夾自動產生。`
        : "已更新標籤。");
    }
  } catch (e) { console.warn("[lib] 儲存 files.md 標籤失敗：", e); toast("儲存失敗：" + (e && e.message ? e.message : e), true); }
  finally { btn.disabled = false; btn.textContent = prev; }
};
