/* =====================================================================
   tagfield.js — chip 輸入元件（tag-spec.md §11.6.3）
   URL 彈窗與本機「編輯標籤」彈窗共用同一元件。
   commit（成一顆 chip）只在：Enter（擋 IME 組字中）／input 失焦（blur）；
   不用空白鍵（與中文選字衝突）；Backspace 空 input 時刪末顆；
   正規化 key（NFC+lowercase）去重（含該項既有自動 tag）；
   建議列＝全庫 tagStats() union，點一下加入、依 input 即時過濾。
   ===================================================================== */
function makeTagField(rootId) {
  const root = $(rootId);
  const chipsEl = root.querySelector(".wl-chips");
  const input = root.querySelector(".wl-tag-input");
  const suggestEl = root.querySelector(".wl-tag-suggest");
  let tags = [];              // 顯示原樣（保留使用者輸入的大小寫）
  let blocked = new Set();    // 不可新增的 key：該項既有自動 tag（§11.6.3）
  let composing = false;      // IME 組字中（compositionstart/end）

  const chipKeys = () => new Set(tags.map(tagKey));

  function renderChips() {
    chipsEl.querySelectorAll(".tag.manual").forEach(n => n.remove());
    for (const t of tags) {
      const chip = document.createElement("span");
      chip.className = "tag manual";
      chip.innerHTML = `#${escapeHtml(t)}<button type="button" class="x" tabindex="-1" aria-label="移除 ${escapeHtml(t)}">✕</button>`;
      chip.querySelector(".x").onclick = () => {
        const k = tagKey(t); tags = tags.filter(x => tagKey(x) !== k); renderChips(); input.focus();
      };
      chipsEl.insertBefore(chip, input);   // chips 排在 input 前
    }
    renderSuggest();
  }
  function renderSuggest() {
    const used = chipKeys();
    const q = input.value.trim().replace(/^#+/, "").toLowerCase();
    const list = (typeof tagStats === "function" ? tagStats() : [])
      .filter(s => !used.has(s.key) && !blocked.has(s.key))          // 已加入／既有自動 tag 不再建議
      .filter(s => !q || s.display.toLowerCase().includes(q))        // 依輸入即時過濾
      .slice(0, 12);
    suggestEl.innerHTML = "";
    for (const s of list) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "wl-sug"; b.textContent = `#${s.display}`;
      b.onmousedown = e => e.preventDefault();   // 別讓 input blur 搶在 click 前 commit
      b.onclick = () => { addRaw(s.display); input.focus(); };
      suggestEl.appendChild(b);
    }
    suggestEl.classList.toggle("empty", !list.length);
  }
  // 一串字（可含空白）→ 多顆 chip：strip 前導 #、trim、key 去重（含 blocked）
  function addRaw(raw) {
    const used = chipKeys();
    for (const part of String(raw).split(/\s+/)) {
      const t = part.replace(/^#+/, "").trim();
      if (!t) continue;
      const k = tagKey(t);
      if (used.has(k) || blocked.has(k)) continue;
      used.add(k); tags.push(t);
    }
    input.value = "";
    renderChips();
  }

  input.addEventListener("compositionstart", () => composing = true);
  input.addEventListener("compositionend", () => composing = false);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      if (composing || e.isComposing) return;   // IME 選字中：Enter 交給 IME，不 commit
      e.preventDefault(); addRaw(input.value);
    } else if (e.key === "Backspace" && !input.value && tags.length) {
      e.preventDefault(); tags.pop(); renderChips();
    }
  });
  input.addEventListener("input", renderSuggest);
  input.addEventListener("blur", () => { if (input.value.trim()) addRaw(input.value); });

  return {
    // 開彈窗時填入：現有手動 tag 為 chips、blockedKeys＝該項自動 tag 的 key
    set(arr, blockedKeys) {
      tags = (arr || []).slice();
      blocked = new Set(blockedKeys || []);
      input.value = ""; renderChips();
    },
    // 讀取（儲存前）：先 commit 尚未成 chip 的殘字，再回傳目前 tags
    get() { if (input.value.trim()) addRaw(input.value); return tags.slice(); },
    focus() { input.focus(); },
  };
}
