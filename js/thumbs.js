/* =====================================================================
   thumbs.js — 封面（縮圖）產生與快取
   PDF 首頁轉圖、圖片縮放、IndexedDB 快取讀寫、卡片上圖。
   ===================================================================== */
async function fillThumbsFromCache() {
  for (const it of items) {
    let blob = null; try { blob = await DB.get("thumbs", thumbKey(it)); } catch (_) {}
    if (blob) paint(it, blob); else placeholder(it, "封面待產生");
  }
  paintAllUrlThumbs();
}

async function generateThumbs() {
  let done = 0; status.textContent = `產生封面… 0/${items.length}`;
  const queue = [...items];
  const worker = async () => {
    while (queue.length) {
      const it = queue.shift();
      try { await makeThumb(it); } catch (e) { placeholder(it, "⚠ 無法產生封面"); }
      done++; status.textContent = `產生封面… ${done}/${items.length}`;
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  status.textContent = "";
}

async function makeThumb(it) {
  const file = await it._entry.getFile();
  it.size = file.size; it.lastModified = file.lastModified;
  const key = thumbKey(it);
  let blob = null; try { blob = await DB.get("thumbs", key); } catch (_) {}
  if (!blob) {
    blob = it.type === "image" ? await downscaleImage(file) : await renderPdfCover(file);
    if (blob) { try { await DB.set("thumbs", key, blob); } catch (_) {} }
  }
  if (blob) paint(it, blob); else placeholder(it, it.type === "pdf" ? "PDF" : "圖片");
}

function paint(it, blob) {
  const url = URL.createObjectURL(blob); it._thumbUrl = url;
  const img = new Image();
  img.onload = () => { const t = it._card.querySelector(".thumb");
    t.querySelector(".spin")?.remove(); t.querySelector(".ph")?.remove();
    if (!t.querySelector("img")) t.insertBefore(img, t.querySelector(".badge")); };
  img.src = url;
}
function placeholder(it, text) {
  const t = it._card.querySelector(".thumb"); t.querySelector(".spin")?.remove();
  if (!t.querySelector("img") && !t.querySelector(".ph")) t.insertAdjacentHTML("afterbegin", `<div class="ph">${text}</div>`);
}

async function renderPdfCover(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data, disableAutoFetch: true, disableStream: true }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: THUMB_W / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
  } finally { await doc.destroy(); }
}
async function downscaleImage(file) {
  const bmp = await createImageBitmap(file).catch(() => null); if (!bmp) return file;
  const scale = Math.min(1, THUMB_W / bmp.width);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h); bmp.close();
  return await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.88));
}
