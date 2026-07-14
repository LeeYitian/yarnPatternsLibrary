/* =====================================================================
   URL 收藏：Markdown 解析／序列化、平台偵測、檔案 IO、災難復原、CRUD
   （links.md 是唯一真相；kv.urls 只是 read-side cache + 復原副本。spec §4–§8）
   ===================================================================== */

const stripUrl = u => ({ url: u.url, title: u.title || "", thumb: u.thumb || "", added: u.added || "", tags: u.tags || [], _extra: u._extra || {} });
// 把快取／parse 後的 URL 純資料補上衍生欄位（kind、網域）
const hydrateUrl = u => ({ kind: "url", url: u.url, title: u.title || "", thumb: u.thumb || "", added: u.added || "", tags: u.tags || [], _extra: u._extra || {}, _host: hostOf(u.url) });

// ---- Markdown（容錯 + 未知欄位原樣保留，spec §4.2） ----
// 回傳 { entries, dropped }：dropped＝「非空、非 # 標題，卻既不成條目也不成欄位」的行數，
// 供壞檔守門判定「有內容卻 0 筆能解析＝整份壞」（broken-file-recovery-spec §D1）。
function parseLinks(text) {
  const out = []; let cur = null; let dropped = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue;
    if (line.trim().startsWith("#")) continue;      // Markdown 標題／註解：合法忽略，不算壞行
    const link = line.match(/^\s*-\s*\[([^\]]*)\]\(\s*([^)]+?)\s*\)\s*$/);
    if (link) {
      const url = link[2].trim();
      if (!url.includes("://")) { console.warn("[lib] 略過無效 URL 行：", rawLine); cur = null; dropped++; continue; }
      cur = { url, title: link[1].trim(), thumb: "", added: "", tags: [], _extra: {} };
      out.push(cur); continue;
    }
    const field = line.match(/^\s+-\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (field && cur) {
      const key = field[1].toLowerCase(), val = field[2].trim();
      if (key === "thumb") cur.thumb = val;
      else if (key === "added") cur.added = val;
      else if (key === "tags") cur.tags = parseTagField(val);   // 手動 tag 升為一級欄位（§6.2）
      else cur._extra[field[1]] = val;      // 未知欄位：保留原 key，再寫回時不丟（未來 tag 系統可平滑擴充）
      continue;
    }
    dropped++;   // 非空、非標題，卻無法辨識的行（壞檔判定用；壞一行仍容錯靜默丟棄，§D2）
  }
  return { entries: out, dropped };
}
function serializeLinks(entries) {
  let out = "# Yarn Library URLs\n\n";
  for (const e of entries) {
    out += `- [${(e.title || "").trim()}](${e.url})\n`;
    if (e.thumb) out += `  - thumb: ${e.thumb}\n`;
    if (e.added) out += `  - added: ${e.added}\n`;
    if (e.tags && e.tags.length) out += `  - tags: ${e.tags.map(t => "#" + t).join(" ")}\n`;   // added 之後、_extra 之前（§6.2）
    const extra = e._extra || {};
    for (const k of Object.keys(extra)) out += `  - ${k}: ${extra[k]}\n`;
    out += "\n";
  }
  return out;
}

// ---- 平台偵測（第一版只做 YouTube，spec §5.2） ----
function parseYouTubeId(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");
    if (h === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (h === "youtube.com" || h === "m.youtube.com" || h.endsWith(".youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(embed|shorts)\/([^/]+)/);
      if (m) return m[2];
    }
  } catch (_) {}
  return null;
}
const youtubeThumbUrl = id => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
function detectPlatform(url) {
  const id = parseYouTubeId(url);
  if (id) return { platform: "youtube", id, label: "YouTube · 自動使用影片縮圖" };
  if (/^https?:\/\//i.test(url)) return { platform: "web", label: "一般連結 · 可手動上傳縮圖" };
  return null;
}

// ---- 縮圖來源優先序（spec §5.1）：thumb 欄位 → YouTube → fallback favicon ----
function resolveUrlThumb(it) {
  const t = (it.thumb || "").trim();
  if (t.startsWith("youtube:")) return { direct: youtubeThumbUrl(t.slice(8)) };
  if (t.startsWith("thumbs/"))  return { file: t };
  const id = parseYouTubeId(it.url);
  if (id) return { direct: youtubeThumbUrl(id) };
  return { direct: "favicon.png", fallback: true };
}
function paintAllUrlThumbs() { for (const it of urls) paintUrlThumb(it); }
async function paintUrlThumb(it) {
  if (!it._card) return;
  const src = resolveUrlThumb(it);
  if (src.direct) { setCardImage(it, src.direct, src.fallback); return; }
  // thumbs/xxx.webp：先吃 IndexedDB 顯示快取（cache-first 開 app 不需資料夾授權即可顯示）。
  const cacheKey = urlThumbCacheKey(src.file);
  let cached = null; try { cached = await DB.get("thumbs", cacheKey); } catch (_) {}
  if (cached) { setCardImage(it, URL.createObjectURL(cached), false); return; }
  // 快取沒有才向 dirHandle 要授權讀磁碟（需使用者手勢，自動載入時可能拿不到 → 退 favicon）；
  // 讀到就順手補進快取，下次免授權。
  try {
    if (!dirHandle || !(await ensureRead(dirHandle))) throw new Error("無授權");
    const dh = await dirHandle.getDirectoryHandle("thumbs");
    const fh = await dh.getFileHandle(src.file.replace(/^thumbs\//, ""));
    const blob = await fh.getFile();
    try { await DB.set("thumbs", cacheKey, blob); } catch (_) {}
    setCardImage(it, URL.createObjectURL(blob), false);
  } catch (e) {
    setCardImage(it, "favicon.png", true);
  }
}
function setCardImage(it, src, fallback) {
  it._thumbUrl = src;
  const t = it._card && it._card.querySelector(".thumb"); if (!t) return;
  t.classList.toggle("is-fallback", !!fallback);
  const existing = t.querySelector("img");
  if (existing) { existing.src = src; t.querySelector(".spin")?.remove(); return; }
  const img = new Image();
  img.onload = () => { t.querySelector(".spin")?.remove(); t.querySelector(".ph")?.remove();
    if (!t.querySelector("img")) t.insertBefore(img, t.querySelector(".badge")); };
  img.onerror = () => { if (!fallback) setCardImage(it, "favicon.png", true);
    else { t.querySelector(".spin")?.remove(); placeholder(it, "連結"); } };
  img.src = src;
}

// ---- 上傳縮圖處理：最長邊 400px → WEBP q0.8（spec §5.3） ----
async function processThumbBlob(blob) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h); bmp.close();
  return await new Promise(r => canvas.toBlob(r, "image/webp", 0.8));
}
async function sha1hex(str) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const thumbPathFor = async url => "thumbs/" + (await sha1hex(url)).slice(0, 12) + ".webp";
const urlThumbCacheKey = path => "urlthumb:" + path;
// 壓縮上傳縮圖 → 寫進資料夾 thumbs/（持久真相）+ 存進 IndexedDB（顯示快取，
// 讓 cache-first 開 app 不必資料夾授權就能顯示，否則重整後會退成 favicon）。回傳 thumb 路徑。
async function saveUploadedThumb(url, blob) {
  const path = await thumbPathFor(url);
  const webp = await processThumbBlob(blob);
  await writeThumbFile(dirHandle, path, webp);
  try { await DB.set("thumbs", urlThumbCacheKey(path), webp); } catch (e) { console.warn("[lib] 縮圖寫入快取失敗（忽略）：", e); }
  return path;
}

// ---- 檔案 IO（原子寫：temp + rename；spec §3） ----
async function ensureWrite(h) {
  if (!h) return false;
  if (await h.queryPermission({ mode: "readwrite" }) === "granted") return true;
  return await h.requestPermission({ mode: "readwrite" }) === "granted";
}
async function readText(dir, name) {
  const fh = await dir.getFileHandle(name);     // 不存在會丟 NotFoundError
  return await (await fh.getFile()).text();
}
async function writeText(dir, name, text) {
  if (!await ensureWrite(dir)) throw new Error("沒有資料夾的寫入權限");
  const tmpName = name + ".tmp";
  const tmp = await dir.getFileHandle(tmpName, { create: true });
  const w = await tmp.createWritable(); await w.write(text); await w.close();
  if (typeof tmp.move === "function") {
    try { await tmp.move(name); return; } catch (e) { console.warn("[lib] move 失敗，改直接覆寫：", e); }
  }
  const fh = await dir.getFileHandle(name, { create: true });
  const w2 = await fh.createWritable(); await w2.write(text); await w2.close();
  try { await dir.removeEntry(tmpName); } catch (_) {}
}
async function renameInDir(dir, from, to) {
  const fh = await dir.getFileHandle(from);
  if (typeof fh.move === "function") { await fh.move(to); return; }
  const text = await (await fh.getFile()).text();
  const nf = await dir.getFileHandle(to, { create: true });
  const w = await nf.createWritable(); await w.write(text); await w.close();
  await dir.removeEntry(from);
}
async function writeThumbFile(dir, path, blob) {
  if (!await ensureWrite(dir)) throw new Error("沒有資料夾的寫入權限");
  const dh = await dir.getDirectoryHandle("thumbs", { create: true });
  const fh = await dh.getFileHandle(path.replace(/^thumbs\//, ""), { create: true });
  const w = await fh.createWritable(); await w.write(blob); await w.close();
}
async function removeThumbFile(dir, path) {
  try { const dh = await dir.getDirectoryHandle("thumbs"); await dh.removeEntry(path.replace(/^thumbs\//, "")); }
  catch (e) { console.warn("[lib] 刪除縮圖檔失敗（忽略）：", e); }
}

// ---- 壞檔備份失敗的哨兵錯誤：無法安全備份就中止，絕不無備份覆蓋原檔（共識 1.3 / broken-file-recovery-spec §D4）----
class BrokenBackupError extends Error { constructor(m) { super(m); this.name = "BrokenBackupError"; } }

// 快取資料夾戳記比對：true＝這份快取可信任屬於當前資料夾（含「無戳記」的舊快取＝相容信任，見 main.js 回填）；
// false＝有戳記且確定非同一資料夾（外來）→ recover 時視同空快取，不寫回真相檔（folder-switch-spec §1 / broken-file-recovery-spec §D3）。
async function cacheFolderMatches(stampHandle) {
  if (!stampHandle) return true;
  if (!dirHandle) return false;
  try { return await stampHandle.isSameEntry(dirHandle); }
  catch (e) { console.warn("[lib] 快取資料夾戳記比對失敗，保守視為外來：", e); return false; }
}

// ---- 載入 / 災難復原（spec §6.3 步驟3、§7.2；壞檔守門見 broken-file-recovery-spec）----
async function persistUrls(arr) {
  try {
    await DB.set("kv", "urls", arr.map(stripUrl));
    await DB.set("kv", "urlsDir", dirHandle || null);    // 資料夾戳記，與快取同進同退
  }
  catch (e) { console.warn("[lib] 無法寫入 URL 快取：", e); }
}
async function loadUrls() {
  let raw = null;
  try { raw = await readText(dirHandle, "links.md"); }
  catch (e) {
    if (e && e.name === "NotFoundError") raw = null;     // 不存在 → 走遺失復原（recoverUrls(false)）
    else { console.warn("[lib] 讀取 links.md 失敗：", e); return await recoverUrls(false); }
  }
  if (raw === null) return await recoverUrls(false);
  const { entries, dropped } = parseLinks(raw);            // parser 容錯永不 throw；「整份壞」靠 dropped 判定
  // 有內容卻 0 筆能解析＝整份壞 → 走 .broken 備份 + 同資料夾快取還原（§D1）。備份失敗則中止、原檔留著。
  if (entries.length === 0 && dropped > 0) {
    try { return await recoverUrls(true); }
    catch (e) {
      if (e instanceof BrokenBackupError) {
        toast(`<b>links.md</b> 內容異常，且<b>自動備份失敗</b>，為避免蓋掉原始檔案，網頁沒有改動它。<br>請先用檔案總管手動複製一份 <b>links.md</b> 再處理。`, true, [], 12000);
        return [];
      }
      throw e;
    }
  }
  const arr = entries.map(hydrateUrl);
  await persistUrls(arr);
  return arr;
}
async function recoverUrls(brokenExists) {
  let cachedRaw = [];
  try { cachedRaw = (await DB.get("kv", "urls")) || []; } catch (_) {}
  let stamp = null;
  try { stamp = await DB.get("kv", "urlsDir"); } catch (_) {}
  // 外來快取（戳記屬於別的資料夾）→ 視同空：絕不把別資料夾的收藏寫進當前 links.md（folder-switch-spec §1）
  const cached = (await cacheFolderMatches(stamp)) ? cachedRaw.map(hydrateUrl) : [];

  let backupName = null;
  if (brokenExists) {
    // §D4：壞檔一律「先安全備份」。備份失敗＝寧可不動原檔，也不無備份覆蓋 → 丟 BrokenBackupError 中止。
    backupName = "links.md.broken-" + new Date().toISOString().replace(/[:.]/g, "-");
    try { await renameInDir(dirHandle, "links.md", backupName); }
    catch (e) {
      console.warn("[lib] 備份壞檔失敗，中止自動還原以免覆蓋無備份原檔：", e);
      throw new BrokenBackupError("links.md 內容異常且自動備份失敗，為保住原始檔案已中止；請先手動複製一份 links.md。");
    }
  }
  // 只把「同資料夾、非空」的快取寫回真相檔（空／外來快取都不寫，沿用 if(cached.length) 不變式）
  if (cached.length) {
    try { await writeText(dirHandle, "links.md", serializeLinks(cached.map(stripUrl))); }
    catch (e) { console.warn("[lib] 還原寫回 links.md 失敗：", e); }
  }
  if (brokenExists || cached.length) {
    const restored = cached.length ? "已從快取自動還原。" : "目前沒有可用的同資料夾快取可還原。";
    const detail = backupName
      ? `原檔已備份為 <b>${escapeHtml(backupName)}</b>，如有遺漏可用編輯器打開該檔手動恢復。`
      : "偵測到 links.md 遺失，已用上次成功讀取的快取重建。";
    toast(`<b>links.md</b> 無法正常讀取，${restored}<br>${detail}`, true, [], 9000);
  }
  await persistUrls(cached);
  return cached;
}

// 讀磁碟 links.md → re-parse（順便吃進外部對其他條目的修改）。回傳可序列化的 entries。
// CRUD 當下若磁碟已整份壞掉 → 先 .broken 備份 + 同資料夾快取還原，再讓呼叫端在還原結果上套用本次編輯，
// 否則這次寫回會把壞檔覆蓋成只剩剛編那筆、無備份（broken-file-recovery-spec §Phase4）。
async function reparseForWrite() {
  let raw = "";
  try { raw = await readText(dirHandle, "links.md"); }
  catch (e) { if (!(e && e.name === "NotFoundError")) throw e; }    // 不存在＝空 raw，走全新建檔
  const { entries, dropped } = parseLinks(raw);
  if (entries.length === 0 && dropped > 0) return { entries: (await recoverUrls(true)).map(stripUrl), recovered: true };
  return { entries };
}

// ---- CRUD（讀-改-寫，spec §6.4 / §6.5 / §6.6） ----
async function saveNewUrl({ url, title, thumbBlob, tags }) {
  if (!dirHandle) { toast("請先選擇一個資料夾再收藏網址。", true); return false; }
  if (!await ensureWrite(dirHandle)) { toast("需要資料夾的寫入權限才能儲存。", true); return false; }
  let thumbField = "";
  if (thumbBlob) { thumbField = await saveUploadedThumb(url, thumbBlob); }
  else { const id = parseYouTubeId(url); if (id) thumbField = "youtube:" + id; }
  const { entries } = await reparseForWrite();
  entries.push({ url, title: title || "", thumb: thumbField, added: todayStr(), tags: Array.isArray(tags) ? tags : [], _extra: {} });
  await writeText(dirHandle, "links.md", serializeLinks(entries));
  urls = entries.map(hydrateUrl);
  await persistUrls(urls);
  showLibrary(); render(); paintAllUrlThumbs();
  return true;
}
async function saveEditUrl(orig, { url, title, thumbBlob, tags }) {
  if (!await ensureWrite(dirHandle)) { toast("需要資料夾的寫入權限才能儲存。", true); return false; }
  let thumbField = orig.thumb || "";
  if (thumbBlob) { thumbField = await saveUploadedThumb(url, thumbBlob); }
  else if (url !== orig.url && (!thumbField || thumbField.startsWith("youtube:"))) {
    const id = parseYouTubeId(url); thumbField = id ? "youtube:" + id : "";    // 改 URL 後重算自動縮圖；上傳檔則保留舊檔不刪（spec §6.5 步驟2）
  }
  const { entries } = await reparseForWrite();
  const idx = entries.findIndex(e => e.url === orig.url);
  if (idx < 0) {                                  // 被外部改了 URL 字串 / 刪了該條（spec §6.5 步驟4）
    toast("此條目已被外部修改或刪除，請確認後重做。已為你重新整理顯示。", true);
    await start(false); return false;
  }
  entries[idx] = { url, title: title || "", thumb: thumbField, added: entries[idx].added || orig.added || todayStr(), tags: Array.isArray(tags) ? tags : (entries[idx].tags || []), _extra: entries[idx]._extra || {} };   // 手動 tag 來自對話框 chip 輸入（§6.2）
  await writeText(dirHandle, "links.md", serializeLinks(entries));
  urls = entries.map(hydrateUrl);
  await persistUrls(urls);
  render(); paintAllUrlThumbs();
  refreshCardTags(); renderFilterbar();   // tag 可能變動 → 重畫該卡 chips 與篩選區（§11.6.4）
  return true;
}
async function doDeleteUrl(orig) {
  if (!await ensureWrite(dirHandle)) { toast("需要資料夾的寫入權限才能刪除。", true); return; }
  const { entries } = await reparseForWrite();
  const idx = entries.findIndex(e => e.url === orig.url);
  if (idx < 0) {                                  // 已被外部刪除（spec §6.6 步驟2）
    toast("此條目已被外部刪除，顯示已同步。"); await start(false); return;
  }
  const removed = entries.splice(idx, 1)[0];
  await writeText(dirHandle, "links.md", serializeLinks(entries));
  if (removed.thumb && removed.thumb.startsWith("thumbs/")) {
    await removeThumbFile(dirHandle, removed.thumb);
    try { await DB.del("thumbs", urlThumbCacheKey(removed.thumb)); } catch (_) {}
  }
  urls = entries.map(hydrateUrl);
  await persistUrls(urls);
  showLibrary(); render(); paintAllUrlThumbs();
  toast(`已刪除「${escapeHtml(displayName(hydrateUrl(removed)))}」，顯示已同步。`);
}

// ---- 新增／編輯對話框 ----
const urlTagField = makeTagField("urlTags");
let dlgMode = "add", editTarget = null, stagedThumbBlob = null;
function openDialog(mode, it) {
  dlgMode = mode; editTarget = it || null; stagedThumbBlob = null;
  $("dlgTitle").textContent = mode === "edit" ? "編輯網址" : "新增網址";
  $("dlgDelete").style.display = mode === "edit" ? "" : "none";
  $("fUrl").value = it ? it.url : "";
  $("fTitle").value = it ? (it.title || "") : "";
  $("thumbPreview").innerHTML = (it && it._thumbUrl) ? `<img src="${it._thumbUrl}" alt="">` : `<span class="ph">縮圖<br>預覽</span>`;
  urlTagField.set(it ? (it.tags || []) : [], []);   // URL 無自動 tag → blocked 空（§11.6.2）
  updatePlatformPill($("fUrl").value);
  showOverlay("urlDialog");
  setTimeout(() => $("fUrl").focus(), 50);
  document.dispatchEvent(new Event("wlib:dialogopen"));   // onboarding Step 4-1 推進掛鉤
}
function updatePlatformPill(url) {
  const info = detectPlatform((url || "").trim());
  $("platformTxt").textContent = info ? info.label : "貼上後自動偵測平台與縮圖";
}
$("fUrl").addEventListener("input", () => updatePlatformPill($("fUrl").value));
$("dlgCancel").onclick = () => hideOverlay("urlDialog");
$("dlgDelete").onclick = () => { if (editTarget) { hideOverlay("urlDialog"); openConfirm(editTarget); } };
$("dlgSave").onclick = async () => {
  const url = $("fUrl").value.trim(), title = $("fTitle").value.trim(), tags = urlTagField.get();
  if (!/^https?:\/\/.+/i.test(url)) { toast("請輸入有效的網址（需以 http(s):// 開頭）。", true); $("fUrl").focus(); return; }
  document.dispatchEvent(new Event("wlib:urlsaveattempt"));   // onboarding Step 4-4：有效網址、確實嘗試寫入 → 露出「下一步」
  const btn = $("dlgSave"); btn.disabled = true; const prev = btn.textContent; btn.textContent = "儲存中…";
  try {
    const ok = (dlgMode === "edit" && editTarget)
      ? await saveEditUrl(editTarget, { url, title, thumbBlob: stagedThumbBlob, tags })
      : await saveNewUrl({ url, title, thumbBlob: stagedThumbBlob, tags });
    if (ok) {
      if (dlgMode !== "edit") document.dispatchEvent(new Event("wlib:urladded"));   // onboarding Step 4-4：寫入成功自動推進
      hideOverlay("urlDialog"); toast(dlgMode === "edit" ? "已更新這筆收藏。" : "已新增收藏。");
    }
  } catch (e) { console.warn("[lib] 儲存 URL 失敗：", e); toast("儲存失敗：" + (e && e.message ? e.message : e), true); }
  finally { btn.disabled = false; btn.textContent = prev; }
};

// 三種縮圖上傳：檔案選擇 / 拖拉 / 貼上（spec §5.3）
const dz = $("dropzone"), fileInput = $("thumbFile");
dz.addEventListener("click", () => fileInput.click());
dz.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
fileInput.addEventListener("change", () => { const f = fileInput.files[0]; if (f) acceptThumb(f); fileInput.value = ""; });
dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("dragover"); });
dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
dz.addEventListener("drop", e => {
  e.preventDefault(); dz.classList.remove("dragover");
  const f = [...(e.dataTransfer && e.dataTransfer.files || [])].find(x => x.type.startsWith("image/"));
  if (f) acceptThumb(f); else toast("拖進來的不是圖片檔。", true);
});
window.addEventListener("paste", e => {
  if (!$("urlDialog").classList.contains("show")) return;
  const item = [...(e.clipboardData && e.clipboardData.items || [])].find(i => i.type.startsWith("image/"));
  if (item) { const f = item.getAsFile(); if (f) acceptThumb(f); }
});
function acceptThumb(file) {
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) { toast("只接受 JPEG／PNG／WEBP／GIF。", true); return; }
  stagedThumbBlob = file;
  $("thumbPreview").innerHTML = `<img src="${URL.createObjectURL(file)}" alt="">`;
  $("platformTxt").textContent = "已套用自訂縮圖（儲存時壓縮）";
}

// 刪除二次確認
let pendingDelTarget = null;
function openConfirm(it) { pendingDelTarget = it; $("confirmName").textContent = displayName(it); showOverlay("confirmDialog"); }
$("confirmCancel").onclick = () => hideOverlay("confirmDialog");
$("confirmOk").onclick = async () => {
  const it = pendingDelTarget; hideOverlay("confirmDialog"); if (!it) return;
  try { await doDeleteUrl(it); } catch (e) { console.warn("[lib] 刪除失敗：", e); toast("刪除失敗：" + (e && e.message ? e.message : e), true); }
};

// overlay 開關（與燈箱共用 no-scroll）
function showOverlay(id) { $(id).classList.add("show"); document.body.classList.add("no-scroll"); }
function hideOverlay(id) {
  $(id).classList.remove("show");
  if (!document.querySelector(".overlay.show") && !viewer.classList.contains("show")) document.body.classList.remove("no-scroll");
}
// 清除所有資料
$("clearDataBtn").onclick = () => { closeSettings(); showOverlay("clearDataDialog"); };
$("clearDataCancel").onclick = () => hideOverlay("clearDataDialog");
$("clearDataOk").onclick = async () => {
  hideOverlay("clearDataDialog");
  await DB.close();                                   // 先關掉本頁自己的連線，否則會被自己擋住（onblocked）
  const req = indexedDB.deleteDatabase("weaving-lib");
  req.onsuccess = () => location.reload();
  req.onerror = () => toast("清除失敗，請重新整理後再試。", true);
  req.onblocked = () => { toast("請關閉其他開著本頁的分頁後再試。", true); };
};

// 更新紀錄（點 footer 版號開啟；role=button 需支援鍵盤 Enter／Space）
// 版本歷程資料在 constants.js 的 CHANGELOG，這裡渲染成清單。
// footer 版號直接吃 CHANGELOG 最新一筆，不再手動維護。
$("versionBadge").textContent = `v${CHANGELOG[0].ver}`;
$("clList").innerHTML = CHANGELOG.map(c =>
  `<li class="cl-item"><span class="cl-ver">${escapeHtml(c.ver)}</span><div class="cl-text"><div class="cl-title">${escapeHtml(c.title)}</div>${c.detail ? `<div class="cl-detail">${escapeHtml(c.detail)}</div>` : ""}</div></li>`
).join("");
$("versionBadge").onclick = () => showOverlay("changelogDialog");
$("versionBadge").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showOverlay("changelogDialog"); } });
$("changelogClose").onclick = () => hideOverlay("changelogDialog");

["urlDialog", "confirmDialog", "clearDataDialog", "fileTagDialog", "changelogDialog"].forEach(id => $(id).addEventListener("click", e => { if (e.target.id === id) hideOverlay(id); }));
document.addEventListener("keydown", e => { if (e.key !== "Escape") return; const o = document.querySelector(".overlay.show"); if (!o) return; if (o.id === "switchDialog") closeSwitch(false); else hideOverlay(o.id); });

// 非阻斷 toast（重新整理回饋 / 災難復原 / 找不到資料夾，spec §11）
let toastTimer;
function toast(html, warn, actions, duration) {
  $("toastBody").innerHTML = html;
  const wrap = $("toastActions"); wrap.innerHTML = "";
  (actions || []).forEach(([label, fn]) => { const b = document.createElement("button"); b.textContent = label; b.onclick = () => { hideToast(); fn(); }; wrap.appendChild(b); });
  $("toast").classList.toggle("warn", !!warn);
  $("toast").classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, duration || 4500);
}
function hideToast() { $("toast").classList.remove("show"); }
$("toastClose").onclick = hideToast;
