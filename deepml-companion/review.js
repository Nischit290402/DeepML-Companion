// Deep-ML Roaming Companion v0.4.0: interview-style review after your code passes.
// Watches Run / Submit. When every test passes, it asks Deep-ML's assistant to review the
// solution like an interviewer would and pops the answer up next to the bot. Once per code version.

(() => {
  'use strict';
  const api = window.__dmlc;
  if (!api || api.review) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reviewedKey = () => 'dmlc-reviewed:' + location.pathname;

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return String(h);
  }

  // The results panel sits under the "Test Cases" heading and reads "TEST RESULTS 1/1 ... Passed" after a run.
  let panel = null;
  function findPanel() {
    if (panel && panel.isConnected) return panel;
    // the heading reads "Test Cases(1)": text plus a count badge
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

  function reviewPrompt(snap) {
    return [
      'I just ran my solution and all tests passed. Review it the way an ML interviewer would after a coding round, so I can learn.',
      'Use exactly this format, under 150 words in total:',
      '**Verdict:** one line.',
      '**Complexity:** time and space, one line.',
      '**Improve:** 2 or 3 bullets on what an interviewer would push on (readability, naming, edge cases, numerical stability, vectorization). Point at code as "line N".',
      '**Follow-up:** one question an interviewer might ask next.',
      "Don't rewrite my whole solution and don't suggest another problem. End with one final line exactly: GOTO: none.",
      '',
      `My ${snap.lang} code, numbered as in my editor:`,
      '```',
      snap.numbered,
      '```',
    ].join('\n');
  }

  function onPass() {
    const snap = api.codeSnapshot();
    if (!snap || !snap.lines.join('').trim()) return;
    const h = hash(snap.numbered);
    try {
      if (sessionStorage.getItem(reviewedKey()) === h) return; // already reviewed this exact code
      sessionStorage.setItem(reviewedKey(), h);
    } catch { /* storage blocked: review anyway */ }
    api.ask('Interview review', {
      title: 'Interview review',
      label: 'All tests passed. How an interviewer might read your solution:',
      prompt: reviewPrompt(snap),
      noJump: true,
    });
  }

  api.on(document, 'click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b && /^(Run|Submit)$/.test(b.textContent.trim())) watchRun();
  }, true);

  api.review = { version: '0.4.0', onPass, readResults };
})();
