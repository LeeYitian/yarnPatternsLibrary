/* =====================================================================
   folder.js — 資料夾選擇／掃描／更換
   start()（掃描＋載入＋重畫的主流程）、找不到資料夾的復原、
   更換資料夾確認流程（folder-switch-spec.md）。
   ===================================================================== */
async function ensureRead(h) {
  if (!h) return false;
  if (await h.queryPermission({ mode: "read" }) === "granted") return true;
  return await h.requestPermission({ mode: "read" }) === "granted";
}

async function getHandle(forcePick) {
  if (!forcePick && await ensureRead(dirHandle)) return dirHandle;
  return await window.showDirectoryPicker({ id: "weaving-folder", mode: "read" });
}

async function start(forcePick, feedback) {
  let handle;
  try { handle = await getHandle(forcePick); } catch (e) { return; }

  // 舊狀態快照：供「重新整理」差異統計與移動偵測（spec §11.1.2、subfolder-spec §5.6）。
  // key 用 path（無 path 的舊快取 fallback 檔名）：子資料夾後不同資料夾可能有同名檔（subfolder-spec §2.2）。
  const oldItems = items.map(it => ({ path: it.path || it.name, name: it.name, size: it.size, lastModified: it.lastModified }));
  const oldUrl = new Set(urls.map(it => it.url));

  status.textContent = "讀取資料夾…";

  // 掃本機檔案：遞迴所有子孫資料夾、攤平（subfolder-spec §4）。
  // 「根」資料夾讀不到（外接硬碟拔了／被刪改名）→ 完全不動 md／cache，跳錯誤（spec §6.3、§11.2）；
  // 單一「子」資料夾讀不到 → scanDir 內各自 try/catch 略過該分支，繼續掃其他分支（subfolder-spec §4.6）。
  let found;
  try {
    found = [];
    await scanDir(handle, "", found, true);
  } catch (e) {
    console.warn("[lib] 無法讀取資料夾：", e);
    status.textContent = "";
    folderError();
    return;
  }

  // 確定讀得到資料夾，才更新把手與快取
  dirHandle = handle;
  try { await DB.set("kv", "dir", handle); } catch (e) { console.warn("[lib] 無法儲存資料夾把手：", e); }

  found.sort((a, b) => a.path.localeCompare(b.path, "zh-Hant", { numeric: true }));
  // 先抓每個檔案的 size/lastModified（只讀 metadata，不讀內容，很快），
  // 才能在畫封面前就把完整清單寫進快取，且讓 thumbKey 對得上快取。
  items = await Promise.all(found.map(async f => {
    let size, lastModified;
    try { const file = await f.entry.getFile(); size = file.size; lastModified = file.lastModified; } catch (_) {}
    return { kind: "local", name: f.entry.name, path: f.path, ext: f.ext, type: f.type, size, lastModified, _entry: f.entry };
  }));

  // 立刻存清單：即使封面還沒畫完就重新整理／關頁，下次也能直接載入，免重選資料夾。
  await persistItems();

  // 移動偵測（subfolder-spec §5.6）：消失／新出現的 path 配對成「移動」，
  // 並把舊 key 的封面搬到新 key——generateThumbs 直接命中快取，移動的檔案封面不重畫。
  const oldPaths = new Set(oldItems.map(it => it.path));
  const newPaths = new Set(items.map(it => it.path));
  const removedItems = oldItems.filter(it => !newPaths.has(it.path));
  const addedItems = items.filter(it => !oldPaths.has(it.path));
  const moved = pairMoves(removedItems, addedItems);
  for (const m of moved) {
    try { const blob = await DB.get("thumbs", thumbKey(m.from)); if (blob) await DB.set("thumbs", thumbKey(m.to), blob); }
    catch (_) {}
  }

  // 讀 links.md → parse → urls（含災難復原，spec §6.3 步驟3、§7）
  status.textContent = "讀取 links.md…";
  urls = await loadUrls();

  showLibrary(); render();
  // O1：首次成功選資料夾、渲染一開始就同步進教學（不等封面跑完；只有 forcePick=首次親自選才觸發）
  if (forcePick) maybeAutoOnboarding();
  await generateThumbs();
  paintAllUrlThumbs();
  status.textContent = "";

  if (feedback) {
    // 移動的檔案從新增／移除數字中扣除，另計「移動 N」（不誤報成刪除）
    const movedL = moved.length;
    const addedL = addedItems.length - movedL;
    const removedL = removedItems.length - movedL;
    const addedU = urls.filter(it => !oldUrl.has(it.url)).length;
    const removedU = [...oldUrl].filter(u => !urls.some(it => it.url === u)).length;
    const changed = addedL + removedL + addedU + removedU + movedL;
    let msg = `已重新整理：本機檔案 <b>${items.length}</b> 筆、URL <b>${urls.length}</b> 筆`;
    if (changed) {
      const parts = [];
      if (addedL + addedU + removedL + removedU) parts.push(`新增 ${addedL + addedU}、移除 ${removedL + removedU}`);
      if (movedL) parts.push(`移動 ${movedL}`);
      msg += `<br>（${parts.join("、")}）`;
    }
    toast(msg);
  }
}

// 移動偵測（subfolder-spec §5.6）：消失與新出現的項目用「檔名+size+lastModified」簽章一對一配對。
// 移動檔案（含搬進子資料夾）不會改這三者，配得起來即視為移動；改名或內容有變的檔案配不上，照舊算新增+移除。
// 同簽章多筆時貪婪配對，數字守恆，最壞只影響 toast 文字。
function pairMoves(removedItems, addedItems) {
  const sig = it => `${it.name}|${it.size}|${it.lastModified}`;
  const bySig = new Map();
  removedItems.forEach(it => { const k = sig(it); if (!bySig.has(k)) bySig.set(k, []); bySig.get(k).push(it); });
  const moved = [];
  for (const to of addedItems) {
    const q = bySig.get(sig(to));
    if (q && q.length) moved.push({ from: q.shift(), to });
  }
  return moved;
}

// 遞迴走訪（subfolder-spec §4／§8）：
// - path＝從所選根到該檔的相對路徑（頂層檔案剛好等於檔名，讓舊封面快取 key 命中、不重畫）。
// - 排除：根層的 thumbs/、links.md、links.md.broken-*、files.md（app 自己管理，只排根層）；
//   「.」開頭的隱藏／系統資料夾（.git 等）任何深度都跳過。
// - 容錯：每個子資料夾獨立 try/catch，讀不到就略過該分支；只有根讀不到才由呼叫端 folderError()。
// - 終點：天然 base case（無子資料夾即停），不設人工深度／數量上限。
async function scanDir(dir, prefix, found, isRoot) {
  for await (const entry of dir.values()) {
    if (entry.kind === "directory") {
      if (entry.name.startsWith(".")) continue;
      if (isRoot && entry.name === "thumbs") continue;
      try { await scanDir(entry, prefix + entry.name + "/", found, false); }
      catch (e) { console.warn(`[lib] 無法讀取子資料夾「${prefix + entry.name}」，略過該分支：`, e); }
      continue;
    }
    if (entry.kind !== "file") continue;
    if (isRoot && (entry.name === "links.md" || entry.name === "files.md" || entry.name.startsWith("links.md.broken-"))) continue;
    const dot = entry.name.lastIndexOf("."); if (dot < 0) continue;
    const ext = entry.name.slice(dot + 1).toLowerCase();
    if (ext === "pdf") found.push({ entry, ext, type: "pdf", path: prefix + entry.name });
    else if (IMG_EXT.has(ext)) found.push({ entry, ext, type: "image", path: prefix + entry.name });
  }
}

// 找不到資料夾：非阻斷通知 + 兩個動作；完全不動 md／cache（spec §11.2）
function folderError() {
  toast("找不到資料夾，可能已被移除、改名，或所在磁碟未連接。<b>現有顯示與快取已保留。</b>", true,
    [["再試一次", () => start(false)], ["選擇新資料夾", () => start(true)]], 12000);
}

// ---------- 更換資料夾（spec：folder-switch-spec.md） ----------
// 流程：picker → isSameEntry → confirm → 清 IndexedDB → 換 handle → 委派 start() 掃描／載入／重畫。
// 注意：first pick 不走這裡（走 #pickBtn → start(true)），這條只給頂欄設定選單的「更換資料夾」。
async function rechooseFolder() {
  // ① 先開 picker（spec §4.2：讓使用者看到資料夾名稱才確認）
  let newHandle;
  try { newHandle = await window.showDirectoryPicker({ id: "weaving-folder", mode: "read" }); }
  catch (e) { return; }                              // §7.1 取消 → 不動任何狀態、不跳 toast

  // ② isSameEntry：選到同一個資料夾 → 不 confirm、不清快取，走「重新整理」路徑（§7.2）
  try {
    if (dirHandle && await dirHandle.isSameEntry(newHandle)) { start(false, true); return; }
  } catch (e) { console.warn("[lib] isSameEntry 比對失敗，視為不同資料夾：", e); }

  // ③ Confirm（§5）。取消 → 完全不動，舊狀態 intact（§7.3 F6，因為 step 1 還沒跑）
  if (!await confirmSwitch(newHandle.name)) return;

  // ④⑤⑥ confirm 之後依 §6.1 的順序執行
  const oldHandle = dirHandle;
  status.textContent = "切換資料夾…";
  try {
    // step 1：清 IndexedDB（thumbs 全清、kv/items、kv/urls；kv/dir 先不動，§6.1 / §6.2）
    await DB.clear("thumbs");
    await DB.del("kv", "items");
    await DB.del("kv", "urls");
    // step 2：換 dirHandle（記憶體 + kv/dir）
    dirHandle = newHandle;
    await DB.set("kv", "dir", newHandle);
  } catch (e) {
    console.warn("[lib] 切換資料夾清快取／換把手失敗：", e);
    dirHandle = oldHandle;                            // §7.3 還原記憶體 handle，下次 init() 以舊 kv/dir 為準
    status.textContent = "";
    toast("切換失敗，請重整頁面或重試。", true);
    return;
  }
  // step 3~5：掃新資料夾 + 寫 items + loadUrls + 重畫。委派既有 start(false)（§8：不改 start 內部）。
  //  - getHandle(false) 會回傳剛換上的 dirHandle（= newHandle）
  //  - kv/urls cache 已在 step 1 清空，loadUrls→recoverUrls 不會把舊 URL 污染進新資料夾（§6.1 step 4）
  await start(false);
}

// Confirm dialog（promise 化；resolve(true)=換過去、resolve(false)=取消／關閉）
let switchResolve = null;
function confirmSwitch(folderName) {
  $("switchName").textContent = folderName || "(未命名資料夾)";
  showOverlay("switchDialog");
  return new Promise(resolve => { switchResolve = resolve; });
}
function closeSwitch(result) {
  hideOverlay("switchDialog");
  const r = switchResolve; switchResolve = null;
  if (r) r(result);
}
$("switchCancel").onclick = () => closeSwitch(false);
$("switchOk").onclick = () => closeSwitch(true);
// 點遮罩或按 Esc 關閉 = 取消（resolve(false)）；不綁 Enter 到「換過去」（spec §9 F7）
$("switchDialog").addEventListener("click", e => { if (e.target.id === "switchDialog") closeSwitch(false); });

async function persistItems() {
  const meta = items.map(({ name, path, ext, type, size, lastModified }) => ({ name, path, ext, type, size, lastModified }));
  try { await DB.set("kv", "items", meta); }
  catch (e) {
    console.warn("[lib] 無法寫入清單到 IndexedDB：", e);
    status.textContent = "⚠ 無法寫入快取，重新整理後可能需要重選資料夾";
  }
}
