// Deep-ML Roaming Companion, Release 1 (v0.1.0). Runs in the page world so it can reach window.monaco.

(() => {
  'use strict';

  // Selectors confirmed on deep-ml.com (Oct 2026). Update here if the site renames them.
  const BTN = 'button[aria-label="Open study assistant"]';
  const DLG = '[role="dialog"][aria-label="Study assistant"]';

  const POP_W = 360;           // popover width
  const POP_H_MAX = 460;       // popover max height
  const BOT = 48;              // launcher size on Deep-ML
  const SNAP_PX = 90;          // snap to editor edge when dropped this close
  const HOTKEY = { alt: true, code: 'KeyK' }; // Alt+K (Option+K on Mac) opens / focuses

  const W = window;
  const root = document.documentElement;
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('dmlc-pos')); } catch { return null; } },
    set(p) { try { localStorage.setItem('dmlc-pos', JSON.stringify(p)); } catch {} },
  };

  // ---------- styles ----------
  const css = document.createElement('style');
  css.textContent = `
    ${BTN}{left:var(--dmlc-x)!important;top:var(--dmlc-y)!important;right:auto!important;bottom:auto!important;
      cursor:grab;touch-action:none;user-select:none}
    ${BTN}:active{cursor:grabbing}
    ${DLG}{left:var(--dmlc-px)!important;top:var(--dmlc-py)!important;right:auto!important;bottom:auto!important;
      width:${POP_W}px!important;height:var(--dmlc-ph)!important}
    #dmlc-bar{position:fixed;z-index:60;display:none;gap:6px;font:11px/1 ui-monospace,'JetBrains Mono',monospace}
    #dmlc-bar button{background:#fafafa;color:#18181b;border:2px solid #18181b;padding:5px 8px;cursor:pointer;box-shadow:2px 2px 0 #facc15}
    #dmlc-bar button.off{background:#27272a;color:#d4d4d8;box-shadow:none}
    .dmlc-line{background:rgba(251,146,60,.18)}
    .dmlc-gutter{background:#fb923c;width:3px!important;margin-left:3px}
  `;
  document.head.appendChild(css);

  // ---------- position ----------
  let pos = store.get() || { x: innerWidth - BOT - 24, y: innerHeight - BOT - 24 };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function apply() {
    pos.x = clamp(pos.x, 8, innerWidth - BOT - 8);
    pos.y = clamp(pos.y, 8, innerHeight - BOT - 8);
    const ph = Math.min(POP_H_MAX, innerHeight - 56);
    const left = pos.x - POP_W - 12;
    const px = left >= 8 ? left : Math.min(pos.x + BOT + 12, innerWidth - POP_W - 8);
    const py = clamp(pos.y + BOT / 2 - ph / 2, 44, innerHeight - ph - 8);
    root.style.setProperty('--dmlc-x', pos.x + 'px');
    root.style.setProperty('--dmlc-y', pos.y + 'px');
    root.style.setProperty('--dmlc-px', px + 'px');
    root.style.setProperty('--dmlc-py', py + 'px');
    root.style.setProperty('--dmlc-ph', ph + 'px');
    bar.style.left = px + 'px';
    bar.style.top = Math.max(4, py - 34) + 'px';
  }

  function snapToEditor() {
    const ed = document.querySelector('.monaco-editor');
    if (!ed) return;
    const r = ed.getBoundingClientRect();
    const inY = pos.y + BOT / 2 > r.top && pos.y + BOT / 2 < r.bottom;
    if (inY && Math.abs(pos.x + BOT - r.right) < SNAP_PX) pos.x = r.right - BOT - 8;
  }

  // ---------- drag (delegated, survives React re-mounts) ----------
  let drag = null;
  let suppressUntil = 0;

  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest(BTN);
    if (!b || e.button !== 0) return;
    drag = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
  }, true);

  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    pos = { x: drag.ox + dx, y: drag.oy + dy };
    apply();
  }, true);

  window.addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag.moved) {
      snapToEditor();
      apply();
      store.set(pos);
      suppressUntil = performance.now() + 300; // swallow the click that follows a drag
    }
    drag = null;
  }, true);

  window.addEventListener('click', (e) => {
    if (performance.now() < suppressUntil && e.target.closest(BTN)) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  addEventListener('resize', apply);

  // ---------- Monaco helpers ----------
  function editor() {
    const m = W.monaco;
    if (!m || !m.editor) return null;
    const eds = m.editor.getEditors ? m.editor.getEditors() : [];
    return eds.find((x) => x.hasTextFocus && x.hasTextFocus()) || eds[0] || null;
  }

  function codeContext() {
    const ed = editor();
    if (!ed) return null;
    const model = ed.getModel();
    const numbered = model.getLinesContent().map((l, i) => `${String(i + 1).padStart(2)}| ${l}`).join('\n');
    const cur = ed.getPosition();
    const sel = ed.getSelection();
    const selText = sel && !sel.isEmpty() ? model.getValueInRange(sel) : '';
    return { numbered, cursor: cur ? cur.lineNumber : null, selText, lang: model.getLanguageId() };
  }

  // Lines the answer mentions get marked in the editor; cleared on your next edit.
  let marks = null;
  function markLines(lines) {
    const ed = editor();
    if (!ed || !lines.length) return;
    const max = ed.getModel().getLineCount();
    const R = W.monaco.Range;
    const decos = lines.filter((n) => n >= 1 && n <= max).map((n) => ({
      range: new R(n, 1, n, 1),
      options: { isWholeLine: true, className: 'dmlc-line', linesDecorationsClassName: 'dmlc-gutter' },
    }));
    if (!decos.length) return;
    if (marks) marks.clear();
    marks = ed.createDecorationsCollection(decos);
    ed.revealLineInCenterIfOutsideViewport(decos[0].range.startLineNumber);
    const sub = ed.onDidChangeModelContent(() => { if (marks) marks.clear(); sub.dispose(); });
  }

  function lineRefs(text) {
    const out = new Set();
    const re = /\blines?\s+(\d{1,3})(?:\s*(?:-|–|to|and|&)\s*(\d{1,3}))?/gi;
    let m;
    while ((m = re.exec(text))) {
      const a = +m[1], b = m[2] ? +m[2] : a;
      for (let n = Math.min(a, b); n <= Math.max(a, b) && n - a < 20; n++) out.add(n);
    }
    return [...out];
  }

  // ---------- React-safe textarea fill ----------
  function setTextarea(ta, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, value);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    ta.setSelectionRange(value.length, value.length);
  }

  function attachCode() {
    const dlg = document.querySelector(DLG);
    const ta = dlg && dlg.querySelector('textarea');
    const ctx = codeContext();
    if (!ta || !ctx) return;
    let block = `My current ${ctx.lang} code (numbered as in my editor, cursor: ${ctx.cursor}):\n\`\`\`\n${ctx.numbered}\n\`\`\`\n`;
    if (ctx.selText) block += `Selected:\n\`\`\`\n${ctx.selText}\n\`\`\`\n`;
    block += 'When you point at code, say "line N".\n\n';
    setTextarea(ta, block + ta.value);
  }

  // ---------- floating mini bar above the popover ----------
  const bar = document.createElement('div');
  bar.id = 'dmlc-bar';
  bar.innerHTML = '<button type="button" data-a="attach">Attach code</button><button type="button" data-a="mark">Mark lines: on</button>';
  document.body.appendChild(bar);
  let autoMark = true;
  bar.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'attach') attachCode();
    if (a === 'mark') {
      autoMark = !autoMark;
      e.target.textContent = 'Mark lines: ' + (autoMark ? 'on' : 'off');
      e.target.classList.toggle('off', !autoMark);
      if (!autoMark && marks) marks.clear();
    }
  });

  // ---------- watch the dialog: show bar, mark lines when an answer settles ----------
  let lastText = '';
  let settle = null;
  let dlgObs = null;

  function onDialog(dlg) {
    bar.style.display = 'flex';
    lastText = dlg.innerText;
    dlgObs = new MutationObserver(() => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        const now = dlg.innerText;
        const fresh = now.startsWith(lastText) ? now.slice(lastText.length) : now.slice(-1500);
        lastText = now;
        // skip the echo of our own attached block
        const answer = fresh.replace(/My current[\s\S]*?say "line N"\./g, '');
        if (autoMark) markLines(lineRefs(answer));
      }, 900);
    });
    dlgObs.observe(dlg, { childList: true, subtree: true, characterData: true });
  }

  new MutationObserver(() => {
    const dlg = document.querySelector(DLG);
    if (dlg && !dlgObs) onDialog(dlg);
    if (!dlg && dlgObs) { dlgObs.disconnect(); dlgObs = null; bar.style.display = 'none'; }
  }).observe(document.body, { childList: true, subtree: true });

  // ---------- hotkey ----------
  addEventListener('keydown', (e) => {
    // e.code, so it also works on macOS where Option+K types a symbol
    if (!(e.altKey === HOTKEY.alt && e.code === HOTKEY.code)) return;
    e.preventDefault();
    const dlg = document.querySelector(DLG);
    if (dlg) dlg.querySelector('textarea')?.focus();
    else document.querySelector(BTN)?.click();
  }, true);

  window.__dmlc = { markLines, lineRefs, attachCode, getPos: () => ({ ...pos }) };
  apply();
})();
