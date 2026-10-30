// Deep-ML Roaming Companion v0.5.0: interview version after your code passes.
// Watches Run / Submit. When every test passes, Chrome's on-device Gemini Nano rewrites your
// solution the way you'd want it in an interview and the box shows only that code.
// No API key, nothing leaves your laptop. Deep-ML's own assistant refuses to write full code,
// so it isn't used here.

(() => {
  'use strict';
  const api = window.__dmlc;
  if (!api || api.review) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reviewedKey = () => 'dmlc-reviewed:' + location.pathname;
  const TITLE = 'Interview version';

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return String(h);
  }

  // ---------- detect a passing run ----------
  // The results panel sits under the "Test Cases(1)" heading and reads "TEST RESULTS 5/5" after a run.
  let panel = null;
  function findPanel() {
    if (panel && panel.isConnected) return panel;
    const heading = [...document.querySelectorAll('span, div, p, h2, h3, button')]
      .find((e) => e.textContent.length < 40 && /^\s*Test Cases/.test(e.textContent));
    let el = heading;
    for (let i = 0; el && i < 10; i++, el = el.parentElement) {
      if (/test results|run your code/i.test(el.textContent)) { panel = el; return el; }
    }
    return null;
  }

  function readResults() {
    const p = findPanel();
    if (!p) return null;
    const text = p.textContent;
    const m = text.match(/test results\s*(\d+)\s*\/\s*(\d+)/i);
    return { text, passed: m ? +m[1] : null, total: m ? +m[2] : null, accepted: /\baccepted\b/i.test(text) };
  }

  let watching = false;
  async function watchRun() {
    if (watching) return;
    watching = true;
    try {
      const before = (readResults() || {}).text || '';
      const t0 = Date.now();
      let changed = false, last = null;
      while (Date.now() - t0 < 45000) {
        await sleep(500);
        const r = readResults();
        const text = r ? r.text : '';
        if (text !== before) changed = true;
        if (!changed && Date.now() - t0 < 6000) continue; // results not in yet
        if (!r || (r.total === null && !r.accepted)) continue;
        if (text !== last) { last = text; continue; } // wait until the panel stops changing
        if ((r.total > 0 && r.passed === r.total) || r.accepted) onPass();
        return;
      }
    } finally {
      watching = false;
    }
  }

  // ---------- Gemini Nano (Chrome's built-in Prompt API) ----------
  const LANG = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
  const SYSTEM = 'You rewrite working coding-interview solutions. You output only code, never prose.';

  async function availability() {
    const LM = window.LanguageModel;
    if (!LM) return 'unavailable';
    try { return await LM.availability(LANG); } catch { return LM.availability(); }
  }

  async function createSession(onProgress) {
    const opts = {
      ...LANG,
      initialPrompts: [{ role: 'system', content: SYSTEM }],
      monitor(m) { m.addEventListener('downloadprogress', (e) => onProgress(e.loaded)); },
    };
    try { return await window.LanguageModel.create(opts); } catch (err) {
      if (err && err.name === 'NotAllowedError') throw err;
      delete opts.expectedInputs; // older option set
      delete opts.expectedOutputs;
      return window.LanguageModel.create(opts);
    }
  }

  function rewritePrompt(snap) {
    return [
      `This ${snap.lang} solution passes all tests. Rewrite it the way a strong candidate would in an ML coding interview:`,
      'correct, idiomatic, efficient (vectorized NumPy where it fits), clear names, no dead code, not over-engineered.',
      'Keep the same function name, signature and behaviour, including edge cases. You may drop template docstrings and placeholder comments.',
      `Output only the code, in one \`\`\`${snap.lang} block.`,
      '',
      '```' + snap.lang,
      snap.lines.join('\n'),
      '```',
    ].join('\n');
  }

  function extractCode(text) {
    const m = text.match(/```[\w+-]*\n([\s\S]*?)(```|$)/);
    return (m ? m[1] : text.replace(/```[\w+-]*/g, '')).replace(/\s+$/, '');
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function show(node, label) {
    api.render.title(TITLE);
    api.showCard();
    api.render.answer(label || '', node);
  }

  function codeNode(code, done) {
    const wrap = el('div', 'ans');
    const pre = el('pre');
    pre.append(el('code', null, code || ' '));
    wrap.append(pre);
    if (done) wrap.append(el('p', 'note', 'Written on your laptop by Gemini Nano. Paste it in and Run before trusting it.'));
    return wrap;
  }

  async function generate(snap) {
    const status = el('p', 'wait', 'Writing the interview version…');
    show(status);
    let session;
    try {
      session = await createSession((loaded) => { status.textContent = `Downloading the on-device model… ${Math.round(loaded * 100)}%`; });
    } catch (err) {
      api.render.error(`Gemini Nano didn't start: ${err.message || err}`);
      return;
    }
    let out = '';
    let lastPaint = 0;
    try {
      for await (const chunk of session.promptStreaming(rewritePrompt(snap))) {
        out = chunk.startsWith(out) && out ? chunk : out + chunk; // handles both delta and cumulative streams
        if (Date.now() - lastPaint > 150) { show(codeNode(extractCode(out), false)); lastPaint = Date.now(); }
      }
      show(codeNode(extractCode(out), true));
    } catch (err) {
      api.render.error(`Gemini Nano stopped: ${err.message || err}`);
    } finally {
      session.destroy();
    }
  }

  function offerDownload(snap) {
    const box = el('div', 'ans');
    box.append(el('p', null, "Tests passed. The interview version comes from Chrome's built-in Gemini Nano, which runs on your laptop with no API key. It needs a one-time model download first."));
    const btn = el('button', 'btn', 'Download model');
    btn.type = 'button';
    api.on(btn, 'click', () => generate(snap)); // Chrome only starts the download from a click
    box.append(btn);
    show(box);
  }

  async function onPass() {
    const snap = api.codeSnapshot();
    if (!snap || !snap.lines.join('').trim()) return;
    const h = hash(snap.lines.join('\n'));
    try {
      if (sessionStorage.getItem(reviewedKey()) === h) return; // already did this exact code
      sessionStorage.setItem(reviewedKey(), h);
    } catch { /* storage blocked: carry on */ }

    const a = await availability();
    if (a === 'available') return generate(snap);
    if (a === 'downloadable' || a === 'downloading') return offerDownload(snap);
    show(el('p', 'err', "This Chrome can't run the on-device model, so there's no interview version here."));
  }

  api.on(document, 'click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b && /^(Run|Submit)$/.test(b.textContent.trim())) watchRun();
  }, true);

  api.review = { version: '0.5.0', onPass, readResults, availability };
})();
