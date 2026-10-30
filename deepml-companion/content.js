// Deep-ML Roaming Companion v0.5.0. Runs in the page world so it can reach window.monaco.
// Click the bot and a compact box opens. Your code (or the lines you selected) goes along
// silently, Deep-ML's own assistant answers in the background, and the editor jumps to the
// line the answer points at.

(() => {
  'use strict';
  if (window.__dmlc) return; // never run twice in one page

  // Deep-ML selectors confirmed Oct 2026. Update here if the site renames them.
  const BTN = 'button[aria-label="Open study assistant"]';
  const DLG = '[role="dialog"][aria-label="Study assistant"]';
  const DLG_CLOSE = 'button[aria-label="Close"]';
  const DLG_SEND = 'button[aria-label="Send"]';
  const DLG_STOP = 'button[aria-label="Stop"]';
  const MSG_LIST = '.overflow-y-auto > .space-y-5';

  const CARD_W = 360;
  const BOT = 48;
  const SNAP_PX = 90;
  const MAX_CODE_LINES = 300;
  const ANSWER_TIMEOUT_MS = 90000;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  async function waitFor(fn, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = fn();
      if (v) return v;
      await sleep(80);
    }
    return null;
  }

  // ---------- keep Deep-ML's hidden chat open while it answers ----------
  // Deep-ML closes its chat on any click outside it, and closing cancels the answer.
  // While an answer is in progress, page-level outside-click listeners are skipped.
  let hold = false;
  const HOLD_TYPES = new Set(['pointerdown', 'mousedown', 'touchstart', 'focusin', 'focusout', 'click']);
  const origAdd = EventTarget.prototype.addEventListener;
  const origRemove = EventTarget.prototype.removeEventListener;
  const wrapped = new WeakMap();
  const holdable = (target, type) => (target === document || target === window) && HOLD_TYPES.has(type);
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (fn && holdable(this, type)) {
      let w = wrapped.get(fn);
      if (!w) {
        w = function (e) {
          if (hold && !(e.target && e.target.closest && e.target.closest(DLG))) return undefined;
          return typeof fn === 'function' ? fn.call(this, e) : fn.handleEvent(e);
        };
        wrapped.set(fn, w);
      }
      return origAdd.call(this, type, w, opts);
    }
    return origAdd.call(this, type, fn, opts);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    const w = fn && holdable(this, type) ? wrapped.get(fn) : null;
    return origRemove.call(this, type, w || fn, opts);
  };
  const on = (target, type, fn, opts) => origAdd.call(target, type, fn, opts); // ours are never held

  // ---------- page styles ----------
  const root = document.documentElement;
  root.classList.add('dmlc-compact');
  const css = document.createElement('style');
  css.textContent = `
    ${BTN}, #dmlc-bot{position:fixed!important;left:var(--dmc-x)!important;top:var(--dmc-y)!important;right:auto!important;bottom:auto!important;
      cursor:grab;touch-action:none;user-select:none}
    ${BTN}:active, #dmlc-bot:active{cursor:grabbing}
    #dmlc-bot{z-index:51!important}
    ${DLG}{left:var(--dmc-px)!important;top:var(--dmc-py)!important;right:auto!important;bottom:auto!important;
      width:${CARD_W}px!important;height:var(--dmc-ph)!important}
    html.dmlc-compact ${DLG}{opacity:0!important;pointer-events:none!important}
    ${DLG} > div > div:first-child{cursor:move;user-select:none}
    ${DLG} > div > div:first-child button{cursor:pointer}
    .dmlc-flash{background:rgba(250,204,21,.22)}
    .dmlc-flash-g{background:#facc15;width:3px!important;margin-left:3px}
  `;
  document.head.appendChild(css);

  // ---------- compact box (shadow DOM, so site CSS can't touch it) ----------
  const host = document.createElement('div');
  host.id = 'dmlc-ui';
  host.style.cssText = `position:fixed;z-index:61;display:none;width:${CARD_W}px`;
  const sr = host.attachShadow({ mode: 'open' });
  sr.innerHTML = `
<style>
  :host{all:initial}
  .panel{box-sizing:border-box;width:${CARD_W}px;display:flex;flex-direction:column;background:#18181b;color:#e4e4e7;
    border:2px solid #52525b;box-shadow:4px 4px 0 #000;font:13px/1.55 Inter,system-ui,sans-serif;overflow:hidden}
  .head{display:flex;align-items:center;gap:8px;padding:7px 8px 7px 12px;border-bottom:1px solid #3f3f46;cursor:move;user-select:none}
  .title{font:700 11px/1 ui-monospace,'JetBrains Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:#fafafa;white-space:nowrap}
  .ctx{font:11px/1 ui-monospace,'JetBrains Mono',monospace;color:#d4d4d8;border:1px solid #3f3f46;padding:3px 6px;background:#0f0f12;white-space:nowrap}
  .sp{flex:1}
  .icon{width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:transparent;border:0;color:#a1a1aa;cursor:pointer;padding:0}
  .icon:hover{color:#fafafa}
  .body{display:none;overflow:auto;min-height:0;flex:1 1 auto;padding:10px 12px}
  .body.on{display:block}
  .q{color:#a1a1aa;font-size:12px;margin:0 0 8px;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .wait{font:12px ui-monospace,'JetBrains Mono',monospace;color:#a1a1aa;margin:0 0 6px}
  .partial{white-space:pre-wrap;color:#d4d4d8}
  .ans p{margin:0 0 8px}
  .ans ul,.ans ol{margin:0 0 8px;padding-left:18px}
  .ans li{margin:0 0 4px}
  .ans code{font:12px ui-monospace,'JetBrains Mono',monospace;background:#27272a;padding:1px 4px}
  .ans pre{background:#09090b;border:1px solid #3f3f46;padding:8px;overflow:auto;margin:0 0 8px}
  .ans pre code{background:none;padding:0}
  .ans a{color:#facc15}
  .ans h1,.ans h2,.ans h3,.ans h4{font-size:13px;margin:8px 0 4px}
  .ans strong{color:#fafafa}
  .codewrap{position:relative}
  .codewrap pre{padding-top:30px}
  .copy{position:absolute;top:6px;right:6px;font:11px/1 ui-monospace,'JetBrains Mono',monospace;background:#27272a;color:#e4e4e7;
    border:1px solid #52525b;padding:4px 8px;cursor:pointer}
  .copy:hover{border-color:#a1a1aa}
  .note{font-size:11px;color:#8a8a93;margin:6px 0 0}
  .btn{font:700 12px/1 ui-monospace,'JetBrains Mono',monospace;background:#fafafa;color:#18181b;border:2px solid #18181b;
    box-shadow:2px 2px 0 #facc15;padding:7px 12px;cursor:pointer;margin-top:8px}
  .lnk{font:inherit;color:#facc15;background:none;border:0;padding:0;text-decoration:underline;text-underline-offset:2px;cursor:pointer}
  .err{color:#fca5a5;margin:0}
  .ask{padding:8px 10px 6px;border-top:1px solid #3f3f46}
  .body:not(.on) + .ask{border-top:0}
  textarea{box-sizing:border-box;display:block;width:100%;resize:none;background:#09090b;border:1px solid #3f3f46;color:#fafafa;
    font:13px/1.5 Inter,system-ui,sans-serif;padding:7px 9px;outline:none;max-height:120px}
  textarea:focus{border-color:#a1a1aa}
  textarea::placeholder{color:#8a8a93}
  .hint{font:10px/1.4 ui-monospace,'JetBrains Mono',monospace;color:#8a8a93;padding:0 10px 8px}
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
</style>
<div class="panel">
  <div class="head">
    <span class="title">Companion</span>
    <span class="ctx"></span>
    <span class="sp"></span>
    <button class="icon full" type="button" aria-label="Open the full Deep-ML chat" title="Open the full Deep-ML chat">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>
    </button>
    <button class="icon x" type="button" aria-label="Close" title="Close (Esc)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  </div>
  <div class="body" aria-live="polite"></div>
  <div class="ask">
    <label class="sr" for="q">Ask about your code</label>
    <textarea id="q" rows="2" placeholder="Ask about your code…"></textarea>
  </div>
  <div class="hint">Enter to ask · Shift+Enter new line · Esc to close</div>
</div>`;
  document.body.appendChild(host);

  const $ = (s) => sr.querySelector(s);
  const panel = $('.panel'), head = $('.head'), titleEl = $('.title'), ctxEl = $('.ctx');
  const body = $('.body'), ta = $('#q');

  // Deep-ML treats clicks, focus and keys outside its chat as "close". Keep ours to ourselves.
  ['pointerdown', 'mousedown', 'touchstart', 'focusin', 'focusout', 'keydown', 'keyup', 'keypress', 'click']
    .forEach((t) => on(host, t, (e) => e.stopPropagation()));

  // ---------- position ----------
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('dmlc-pos')); } catch { return null; } },
    set(p) { try { localStorage.setItem('dmlc-pos', JSON.stringify(p)); } catch { /* storage blocked */ } },
  };
  let pos = store.get() || { x: innerWidth - BOT - 24, y: innerHeight - BOT - 24 };
  let dlgPos = { x: 0, y: 0, h: 460 };

  function apply() {
    pos.x = clamp(pos.x, 8, innerWidth - BOT - 8);
    pos.y = clamp(pos.y, 8, innerHeight - BOT - 8);
    const left = pos.x - CARD_W - 12;
    const x = left >= 8 ? left : Math.min(pos.x + BOT + 12, innerWidth - CARD_W - 8);
    // compact box: opens downward from near the bot in the top half, upward in the bottom half
    host.style.left = x + 'px';
    if (pos.y + BOT / 2 > innerHeight / 2) {
      const bottom = innerHeight - (pos.y + BOT);
      host.style.top = 'auto';
      host.style.bottom = bottom + 'px';
      panel.style.maxHeight = (innerHeight - bottom - 8) + 'px';
    } else {
      host.style.bottom = 'auto';
      host.style.top = pos.y + 'px';
      panel.style.maxHeight = (innerHeight - pos.y - 8) + 'px';
    }
    // full Deep-ML chat (when you open it): centred on the bot
    const ph = Math.min(460, innerHeight - 56);
    const py = clamp(pos.y + BOT / 2 - ph / 2, 44, innerHeight - ph - 8);
    dlgPos = { x, y: py, h: ph };
    root.style.setProperty('--dmc-x', pos.x + 'px');
    root.style.setProperty('--dmc-y', pos.y + 'px');
    root.style.setProperty('--dmc-px', x + 'px');
    root.style.setProperty('--dmc-py', py + 'px');
    root.style.setProperty('--dmc-ph', ph + 'px');
  }

  function snapToEditor() {
    const ed = document.querySelector('.monaco-editor');
    if (!ed) return;
    const r = ed.getBoundingClientRect();
    const inY = pos.y + BOT / 2 > r.top && pos.y + BOT / 2 < r.bottom;
    if (inY && Math.abs(pos.x + BOT - r.right) < SNAP_PX) pos.x = r.right - BOT - 8;
  }

  // ---------- drag: the bot, the compact box header, the full chat header ----------
  function dragKind(e) {
    const t = e.target;
    if (t.closest && (t.closest(BTN) || t.closest('#dmlc-bot'))) return 'bot';
    if (t === host) {
      const path = e.composedPath();
      const hitButton = path.some((n) => n.tagName === 'BUTTON' || n.tagName === 'TEXTAREA');
      return !hitButton && path.includes(head) ? 'card' : null;
    }
    const dlg = t.closest && t.closest(DLG);
    if (!dlg || t.closest('button, a, input, textarea')) return null;
    const dlgHead = dlg.firstElementChild && dlg.firstElementChild.firstElementChild;
    return dlgHead && dlgHead.contains(t) ? 'dlg' : null;
  }

  let drag = null;
  let suppressUntil = 0;

  on(document, 'pointerdown', (e) => {
    if (e.button !== 0) return;
    const kind = dragKind(e);
    if (!kind) return;
    const o = kind === 'dlg' ? dlgPos : pos;
    drag = { kind, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, moved: false };
    if (kind !== 'bot') e.preventDefault();
  }, true);

  on(window, 'pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    const nx = clamp(drag.ox + dx, 8, innerWidth - CARD_W - 8);
    if (drag.kind !== 'dlg') pos = { x: drag.ox + dx, y: drag.oy + dy }; // box follows the bot
    else pos = { x: nx + CARD_W + 12, y: clamp(drag.oy + dy, 44, innerHeight - dlgPos.h - 8) + dlgPos.h / 2 - BOT / 2 };
    apply();
  }, true);

  on(window, 'pointerup', () => {
    if (!drag) return;
    if (drag.moved) {
      if (drag.kind === 'bot') snapToEditor();
      apply();
      store.set(pos);
      suppressUntil = performance.now() + 300;
    }
    drag = null;
  }, true);

  // ---------- the bot: Deep-ML's launcher, or our stand-in while its chat is mounted ----------
  let opening = false;
  let dlgMounted = false;
  let botLook = null;

  // Clicking Deep-ML's launcher opens our box instead of its chat.
  on(window, 'click', (e) => {
    if (!(e.target.closest && e.target.closest(BTN)) || opening) return;
    e.stopPropagation();
    e.preventDefault();
    if (performance.now() >= suppressUntil) toggleCard();
  }, true);

  const bot = document.createElement('button');
  bot.id = 'dmlc-bot';
  bot.type = 'button';
  bot.setAttribute('aria-label', 'Coding companion');
  bot.title = 'Click to ask, drag to move';
  bot.style.display = 'none';
  on(bot, 'click', () => {
    if (performance.now() < suppressUntil) return;
    if (!root.classList.contains('dmlc-compact')) closeDialog(); // full chat is showing
    else toggleCard();
  });
  document.body.appendChild(bot);

  function rememberBotLook() {
    const b = document.querySelector(BTN);
    if (b) botLook = { className: b.className, html: b.innerHTML };
  }

  function showBot(onOff) {
    if (onOff && botLook) {
      bot.className = botLook.className;
      bot.innerHTML = botLook.html;
      bot.style.display = '';
    } else {
      bot.style.display = 'none';
    }
  }

  // ---------- Deep-ML chat control ----------
  async function openDialog() {
    let dlg = document.querySelector(DLG);
    if (!dlg) {
      const b = document.querySelector(BTN);
      if (!b) throw new Error("Can't find Deep-ML's assistant on this page.");
      opening = true;
      try { b.click(); } finally { opening = false; }
      dlg = await waitFor(() => document.querySelector(DLG), 4000);
      if (!dlg) throw new Error("Deep-ML's assistant didn't open. Are you signed in?");
    }
    await waitFor(() => dlg.querySelector('textarea'), 3000);
    return dlg;
  }

  function closeDialog() {
    document.querySelector(DLG)?.querySelector(DLG_CLOSE)?.click();
  }

  async function openFullChat() {
    hideCard();
    root.classList.remove('dmlc-compact');
    try { await openDialog(); } catch (err) { root.classList.add('dmlc-compact'); }
  }

  function setNativeValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Sends one message through Deep-ML's chat (kept invisible) and resolves with the answer element.
  async function sendToDeepML(prompt, onPartial) {
    hold = true;
    try {
      let dlg = await openDialog();
      if (cardOpen()) ta.focus(); // Deep-ML focuses its own input on open
      await waitFor(() => !dlg.querySelector(DLG_STOP), 30000);
      const list0 = dlg.querySelector(MSG_LIST);
      const before = list0 ? list0.children.length : 0;
      setNativeValue(dlg.querySelector('textarea'), prompt);
      const send = await waitFor(() => {
        const s = dlg.querySelector(DLG_SEND);
        return s && !s.disabled ? s : null;
      }, 2000);
      if (!send) throw new Error("Couldn't press Send in Deep-ML's chat.");
      send.click();
      if (cardOpen()) ta.focus();

      const t0 = Date.now();
      let lastLen = -1, stableSince = 0;
      while (Date.now() - t0 < ANSWER_TIMEOUT_MS) {
        await sleep(350);
        dlg = document.querySelector(DLG);
        if (!dlg) throw new Error('Deep-ML closed its chat before answering. Ask again.');
        const list = dlg.querySelector(MSG_LIST);
        if (!list || list.children.length < before + 2) continue;
        const last = list.lastElementChild;
        const prose = last.querySelector('.prose') || last;
        const text = prose.innerText.trim();
        if (text) onPartial(text);
        if (dlg.querySelector(DLG_STOP) || !text) continue;
        if (text.length !== lastLen) { lastLen = text.length; stableSince = Date.now(); continue; }
        if (Date.now() - stableSince > 500) return prose;
      }
      throw new Error('No reply after 90 seconds. Open the full chat to check.');
    } finally {
      hold = false;
    }
  }

  // ---------- Monaco ----------
  function editor() {
    const m = window.monaco;
    if (!m || !m.editor || !m.editor.getEditors) return null;
    const eds = m.editor.getEditors();
    return eds.find((x) => x.hasTextFocus && x.hasTextFocus()) || eds[0] || null;
  }

  function lineRefs(text) {
    const out = [];
    const re = /\blines?\s+(\d{1,4})(?:\s*(?:-|–|to|and|&)\s*(\d{1,4}))?/gi;
    let m;
    while ((m = re.exec(text))) {
      const a = +m[1], b = m[2] ? +m[2] : a;
      for (let n = Math.min(a, b); n <= Math.max(a, b) && n - Math.min(a, b) < 20; n++) if (!out.includes(n)) out.push(n);
    }
    return out;
  }

  function editorContext(question) {
    const ed = editor();
    if (!ed) return null;
    const model = ed.getModel();
    const lines = model.getLinesContent();
    const sel = ed.getSelection();
    let selRange = null;
    if (sel && !sel.isEmpty()) {
      let end = sel.endLineNumber;
      if (sel.endColumn === 1 && end > sel.startLineNumber) end -= 1; // selection ending at column 1 of the next line
      selRange = [sel.startLineNumber, end];
    }
    const mentioned = lineRefs(question || '').filter((n) => n >= 1 && n <= lines.length);
    return { ed, model, lines, lang: model.getLanguageId(), selRange, mentioned };
  }

  function numbered(lines, a, b) {
    const w = String(b).length;
    return lines.slice(a - 1, b).map((l, i) => `${String(a + i).padStart(w)}| ${l}`).join('\n');
  }

  const REPLY_RULES =
    'Reply rules: answer only my question, in under 120 words unless I ask for more. Do not suggest other problems. ' +
    'When you refer to my code, write "line N" using these line numbers. ' +
    'End with one final line exactly: GOTO: N for the most relevant line of my code, or GOTO: none.';

  function compose(question, ctx) {
    if (!ctx) return `${question}\n\n${REPLY_RULES}`;
    const { lines, lang, selRange, mentioned } = ctx;
    const parts = [question, '', '---', 'Context from my editor (not part of my question):'];
    if (selRange) {
      parts.push(`I selected lines ${selRange[0]}-${selRange[1]}. My question is about these lines:`, '```', numbered(lines, selRange[0], selRange[1]), '```');
    }
    mentioned
      .filter((n) => !selRange || n < selRange[0] || n > selRange[1])
      .slice(0, 5)
      .forEach((n) => parts.push(`Line ${n} is: \`${lines[n - 1].trim()}\``));
    if (lines.length <= MAX_CODE_LINES) {
      parts.push(`My full ${lang} code, numbered as in my editor:`, '```', numbered(lines, 1, lines.length), '```');
    }
    parts.push(REPLY_RULES);
    return parts.join('\n');
  }

  let flash = null;
  function jumpTo(n) {
    const ed = editor();
    if (!ed) return;
    const model = ed.getModel();
    if (n < 1 || n > model.getLineCount()) return;
    ed.revealLineInCenter(n);
    ed.setPosition({ lineNumber: n, column: model.getLineFirstNonWhitespaceColumn(n) || 1 });
    if (flash) flash.clear();
    const R = window.monaco.Range;
    flash = ed.createDecorationsCollection([{
      range: new R(n, 1, n, 1),
      options: { isWholeLine: true, className: 'dmlc-flash', linesDecorationsClassName: 'dmlc-flash-g' },
    }]);
    const f = flash;
    setTimeout(() => f.clear(), 1800);
    if (cardOpen()) updateChip();
  }

  // ---------- answer clean-up: strip the GOTO line, make "line N" clickable ----------
  function cleanAnswer(prose) {
    const m = prose.innerText.match(/GOTO:\s*(\d+|none)/i);
    const gotoLine = m && /^\d+$/.test(m[1]) ? +m[1] : null;
    const node = prose.cloneNode(true);
    node.removeAttribute('class');
    node.className = 'ans';
    node.querySelectorAll('p, li').forEach((el) => { if (/^\s*GOTO:\s*(\d+|none)\.?\s*$/i.test(el.textContent)) el.remove(); });
    walkText(node, (t) => { if (/GOTO:/i.test(t.data)) t.data = t.data.replace(/GOTO:\s*(\d+|none)\.?/gi, '').trimEnd(); });
    // Deep-ML renders math with KaTeX, which outputs two copies; keep the visible one as plain text
    node.querySelectorAll('.katex').forEach((k) => {
      const shown = k.querySelector('.katex-html');
      k.replaceWith(document.createTextNode((shown || k).textContent));
    });
    node.querySelectorAll('button, svg, img, script, style').forEach((el) => el.remove());
    node.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
    linkLines(node);
    return { node, gotoLine };
  }

  function walkText(node, fn) {
    const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const all = [];
    while (tw.nextNode()) all.push(tw.currentNode);
    all.forEach(fn);
  }

  function linkLines(node) {
    walkText(node, (t) => {
      if (t.parentElement && t.parentElement.closest('pre')) return;
      const re = /\blines?\s+(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?/gi;
      if (!re.test(t.data)) return;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0, m;
      while ((m = re.exec(t.data))) {
        frag.append(t.data.slice(last, m.index));
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'lnk';
        b.dataset.line = m[1];
        b.textContent = m[0];
        frag.append(b);
        last = m.index + m[0].length;
      }
      frag.append(t.data.slice(last));
      t.replaceWith(frag);
    });
  }

  on(body, 'click', (e) => {
    const b = e.target.closest('.lnk');
    if (b) jumpTo(+b.dataset.line);
  });

  // ---------- box states ----------
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cardOpen = () => host.style.display !== 'none';

  function setTitle(t) { titleEl.textContent = t || 'Companion'; }

  function updateChip() {
    const ctx = editorContext('');
    if (!ctx) { ctxEl.textContent = 'No editor'; return; }
    ctxEl.textContent = ctx.selRange
      ? (ctx.selRange[0] === ctx.selRange[1] ? `Line ${ctx.selRange[0]} selected` : `Lines ${ctx.selRange[0]}-${ctx.selRange[1]} selected`)
      : `Code · ${ctx.lines.length} lines`;
  }

  function renderWaiting(label, partial) {
    body.className = 'body on';
    body.innerHTML = (label ? `<p class="q">${esc(label)}</p>` : '') +
      `<p class="wait">${partial ? 'Answering…' : 'Thinking…'}</p>` +
      (partial ? `<div class="partial">${esc(partial.replace(/GOTO:\s*(\d+|none)\.?/gi, '').trim())}</div>` : '');
  }

  function addCopyButtons(node) {
    node.querySelectorAll('pre').forEach((pre) => {
      const wrap = document.createElement('div');
      wrap.className = 'codewrap';
      pre.replaceWith(wrap);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'copy';
      b.textContent = 'Copy';
      on(b, 'click', async () => {
        try { await navigator.clipboard.writeText(pre.innerText.replace(/\n$/, '')); b.textContent = 'Copied'; }
        catch { b.textContent = 'Select and copy'; }
        setTimeout(() => { b.textContent = 'Copy'; }, 1500);
      });
      wrap.append(b, pre);
    });
  }

  function renderAnswer(label, node) {
    body.className = 'body on';
    body.innerHTML = label ? `<p class="q">${esc(label)}</p>` : '';
    addCopyButtons(node);
    body.append(node);
    body.scrollTop = 0;
  }

  function renderError(msg) {
    body.className = 'body on';
    body.innerHTML = `<p class="err">${esc(msg)}</p>`;
  }

  function showCard() {
    apply();
    updateChip();
    host.style.display = 'block';
    ta.focus();
  }
  function hideCard() { host.style.display = 'none'; }
  function toggleCard() { if (cardOpen()) hideCard(); else showCard(); }

  on($('.x'), 'click', hideCard);
  on($('.full'), 'click', openFullChat);
  on(ta, 'focus', updateChip);
  on(ta, 'input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 120) + 'px'; });
  on(ta, 'keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); hideCard(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const q = ta.value.trim();
      if (!q) return;
      ta.value = '';
      ta.style.height = 'auto';
      ask(q);
    }
  });

  // ---------- asking ----------
  let busy = false;
  const queue = [];

  // opts: { title, prompt (full prompt override), label (shown above the answer), noJump }
  async function ask(question, opts = {}) {
    if (busy) { queue.push([question, opts]); return; }
    busy = true;
    const ctx = editorContext(question);
    if (ctx && ctx.mentioned.length && !opts.noJump) jumpTo(ctx.mentioned[0]);
    const prompt = opts.prompt || compose(question, ctx);
    const label = opts.label !== undefined ? opts.label : question;
    setTitle(opts.title);
    if (!cardOpen()) showCard();
    renderWaiting(label, '');
    try {
      const prose = await sendToDeepML(prompt, (partial) => renderWaiting(label, partial));
      const { node, gotoLine } = cleanAnswer(prose);
      renderAnswer(label, node);
      if (gotoLine && !opts.noJump) jumpTo(gotoLine);
    } catch (err) {
      renderError(err.message || String(err));
    } finally {
      busy = false;
      const next = queue.shift();
      if (next) ask(next[0], next[1]);
    }
  }

  // ---------- watch the page ----------
  rememberBotLook();
  new MutationObserver(() => {
    if (!botLook) rememberBotLook();
    const dlg = document.querySelector(DLG);
    if (dlg && !dlgMounted) { dlgMounted = true; showBot(true); }
    if (!dlg && dlgMounted) { dlgMounted = false; showBot(false); root.classList.add('dmlc-compact'); }
  }).observe(document.body, { childList: true, subtree: true });

  on(window, 'resize', apply);

  // Alt+K (Option+K on Mac): open the box, or focus it if open
  on(window, 'keydown', (e) => {
    if (!(e.altKey && e.code === 'KeyK')) return;
    e.preventDefault();
    if (cardOpen()) ta.focus(); else showCard();
  }, true);

  function codeSnapshot() {
    const ctx = editorContext('');
    return ctx ? { lang: ctx.lang, lines: ctx.lines, numbered: numbered(ctx.lines, 1, ctx.lines.length) } : null;
  }

  window.__dmlc = {
    version: '0.5.0', ask, jumpTo, on, codeSnapshot, getPos: () => ({ ...pos }),
    // for review.js: drive the same box without going through Deep-ML's assistant
    showCard: () => { if (!cardOpen()) showCard(); },
    render: { title: setTitle, answer: renderAnswer, error: renderError },
  };
  apply();
})();
