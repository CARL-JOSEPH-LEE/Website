const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('../tools/serve.cjs');
const checks = [];
const check = (name, fn) => fn().then(() => { checks.push(name); console.log(`PASS ${name}`); });

function instrument() {
  window.__audioContexts = [];
  if (window.AudioContext) window.AudioContext = new Proxy(window.AudioContext, { construct(target, args) { const ctx = Reflect.construct(target, args); window.__audioContexts.push(ctx); return ctx; } });
  window.__analysisReads = 0;
  window.__spectrumDraws = 0;
  const clearCanvas = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    if (this.canvas.classList.contains('eqCanvas')) window.__spectrumDraws++;
    return clearCanvas.apply(this, args);
  };
  if (window.AnalyserNode) {
    const get = AnalyserNode.prototype.getByteFrequencyData;
    AnalyserNode.prototype.getByteFrequencyData = function (...args) { window.__analysisReads++; return get.apply(this, args); };
  }
  window.__activeFrames = new Set();
  const raf = window.requestAnimationFrame, cancel = window.cancelAnimationFrame;
  window.requestAnimationFrame = callback => {
    const id = raf(time => { window.__activeFrames.delete(id); callback(time); });
    window.__activeFrames.add(id);
    return id;
  };
  window.cancelAnimationFrame = id => { window.__activeFrames.delete(id); cancel(id); };
}

(async () => {
  const { server, origin } = await startServer();
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined, headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await context.addInitScript(instrument);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const audioRequests = [];
  page.on('request', r => { if (r.url().endsWith('.mp3')) audioRequests.push(r.url()); });
  const buttonClick = async id => { await page.locator(id).click({ force: true }); await page.mouse.move(0, 0); await page.waitForTimeout(40); };
  const playing = () => page.waitForFunction(() => { const a = document.querySelector('audio'); return !a.paused && a.currentTime > .1 && document.querySelector('#musicHint').textContent.includes('正在播放'); });
  try {
    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await check('Startup loads no audio, creates no AudioContext and schedules no idle RAF', async () => {
      assert.equal(audioRequests.length, 0);
      assert.deepEqual(await page.evaluate(() => [document.querySelector('audio').getAttribute('src'), window.__audioContexts.length, window.__activeFrames.size]), [null, 0, 0]);
      assert.equal(await page.locator('.linkCard').count(), 8);
      assert.equal(await page.locator('.heartsLayer').getAttribute('aria-hidden'), 'true');
      assert(await page.locator('#toast').evaluate(el => !el.classList.contains('show')));
      assert(await page.locator('.ico img').evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth > 0)));
    });
    await check('All themes update selection and survive reload', async () => {
      for (const mood of ['cool', 'soft', 'sweet']) {
        await page.locator(`[data-mood-btn="${mood}"]`).click();
        assert.equal(await page.locator('body').getAttribute('data-mood'), mood);
        assert.equal(await page.locator('[aria-pressed="true"][data-mood-btn]').getAttribute('data-mood-btn'), mood);
      }
      await page.locator('[data-mood-btn="cool"]').click();
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('body').getAttribute('data-mood'), 'cool');
      assert.equal(await page.locator('[aria-pressed="true"][data-mood-btn]').getAttribute('data-mood-btn'), 'cool');
    });
    await check('Ideas, questions, challenges and clipboard success/fallback', async () => {
      await buttonClick('#ideaBtn');
      assert((await page.locator('#ideaTitle').textContent()).length > 0);
      await buttonClick('#funCopyBtn');
      assert.equal(await page.locator('#toast').textContent(), '先抽一个问题或挑战吧');
      await buttonClick('#funQBtn');
      assert((await page.locator('#funTitle').textContent()).length > 0);
      await buttonClick('#funCBtn');
      assert((await page.locator('#funTitle').textContent()).startsWith('心动挑战'));
      await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copied = text; } } }); });
      await buttonClick('#funCopyBtn');
      assert((await page.evaluate(() => window.__copied)).includes('心动挑战'));
      await buttonClick('#copyLineBtn');
      assert((await page.evaluate(() => window.__copied)).length > 0);
      await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('Denied')); });
      let prompted = false;
      page.once('dialog', async dialog => { prompted = dialog.type() === 'prompt' && dialog.defaultValue().length > 0; await dialog.dismiss(); });
      await page.locator('#copyLineBtn').focus();
      await page.evaluate(() => document.querySelector('#toast').textContent = 'copy fallback sentinel');
      await buttonClick('#copyLineBtn');
      assert(prompted);
      assert.equal(await page.locator('#toast').textContent(), 'copy fallback sentinel');
    });
    await check('Play starts one audio graph and one visual loop; pause stops both', async () => {
      await buttonClick('#musicToggle');
      await playing();
      await page.waitForFunction(() => window.__analysisReads > 2);
      assert.equal(await page.evaluate(() => window.__audioContexts.length), 1);
      assert.equal(await page.evaluate(() => window.__activeFrames.size), 1);
      assert.equal(await page.locator('#musicToggle').getAttribute('aria-label'), '暂停音乐');
      const before = await page.evaluate(() => window.__analysisReads);
      await page.waitForTimeout(1100);
      const updates = await page.evaluate(() => window.__analysisReads) - before;
      assert(updates >= 25 && updates <= 70, `visual updates in 1.1 seconds: ${updates}`);
      console.log(`Spectrum cadence: ${updates} updates in 1.1 seconds`);
      assert.equal(await page.locator('html').getAttribute('style'), null);
      assert.notEqual(await page.locator('#progress').evaluate(el => el.style.transform), 'scaleX(0)');
      await page.evaluate(() => { document.querySelector('audio').currentTime = 30; });
      await page.waitForFunction(() => document.querySelector('#eq').classList.contains('is-canvas'));
      const initialImage = await page.locator('.eqCanvas').evaluate(el => el.toDataURL());
      await page.waitForFunction(previous => document.querySelector('.eqCanvas').toDataURL() !== previous, initialImage);
      const frozen = await page.evaluate(() => {
        const frame = { bars: [...document.querySelectorAll('#eq i')].map(el => el.style.transform), image: document.querySelector('.eqCanvas').toDataURL() };
        document.querySelector('#musicToggle').click();
        return frame;
      });
      await page.waitForFunction(() => window.__audioContexts[0].state === 'suspended');
      assert.equal(await page.evaluate(() => window.__activeFrames.size), 0);
      const pausedReads = await page.evaluate(() => window.__analysisReads);
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.__analysisReads), pausedReads);
      assert.equal(await page.locator('#eq').getAttribute('data-state'), 'frozen');
      assert.deepEqual(await page.locator('#eq i').evaluateAll(bars => bars.map(el => el.style.transform)), frozen.bars);
      assert.equal(await page.locator('.eqCanvas').evaluate(el => el.toDataURL()), frozen.image);
      assert.equal(await page.locator('#musicToggle').evaluate(el => getComputedStyle(el, '::before').animationPlayState), 'paused');
    });
    await check('Interrupted audio stops visual work and resumes with one click', async () => {
      await buttonClick('#musicToggle');
      await playing();
      await page.evaluate(() => window.__audioContexts[0].suspend());
      await page.waitForFunction(() => document.querySelector('#musicHint').textContent.includes('已中断'));
      assert.equal(await page.locator('audio').evaluate(a => a.paused), true);
      assert.equal(await page.locator('#musicToggle').getAttribute('aria-pressed'), 'false');
      assert.equal(await page.evaluate(() => window.__activeFrames.size), 0);
      await buttonClick('#musicToggle');
      await playing();
      await page.waitForFunction(() => window.__audioContexts[0].state === 'running' && window.__activeFrames.size === 1);
      await buttonClick('#musicToggle');
    });
    await check('Random actions never repeat the immediately preceding result', async () => {
      for (const [button, result] of [['#ideaBtn', '#ideaTitle'], ['#funQBtn', '#funTitle'], ['#funCBtn', '#funTitle']]) {
        let previous = '';
        for (let i = 0; i < 20; i++) {
          await buttonClick(button);
          const current = await page.locator(result).textContent();
          assert(current && current !== previous);
          previous = current;
        }
      }
    });
    await check('Reduced motion preserves requested falling hearts and spectrum, without dock tilt', async () => {
      await buttonClick('#musicToggle');
      await playing();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => window.__activeFrames.size), 1);
      assert.equal(await page.locator('.heartsLayer').evaluate(el => getComputedStyle(el).display), 'block');
      assert.equal(await page.locator('.heartDrop').first().evaluate(el => getComputedStyle(el).animationName), 'heartFall');
      const rect = await page.locator('#musicDock').boundingBox();
      await page.mouse.move(rect.x + 20, rect.y + 10);
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#musicDock').evaluate(el => el.style.transform), '');
      assert.equal(await page.locator('audio').evaluate(a => a.paused), false);
      const reducedReads = await page.evaluate(() => window.__analysisReads);
      await page.waitForTimeout(250);
      assert((await page.evaluate(() => window.__analysisReads)) > reducedReads);
      assert(await page.locator('#musicToggle').evaluate(el => Number(el.style.getPropertyValue('--energy')) <= .65));
      assert(await page.locator('#musicToggle').evaluate(el => Number(el.style.getPropertyValue('--kick')) <= .45));
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.mouse.move(0, 0);
      await page.waitForFunction(reads => window.__analysisReads > reads, reducedReads);
      await page.waitForFunction(() => !document.querySelector('.heartsLayer').hidden && document.querySelectorAll('.heartDrop').length > 0);
      assert.equal(await page.evaluate(() => window.__activeFrames.size), 1);
    });
    await check('Page hide/show suspends and restores visual work without stopping music', async () => {
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
      const reads = await page.evaluate(() => window.__analysisReads);
      assert.equal(await page.evaluate(() => window.__activeFrames.size), 0);
      assert.equal(await page.locator('.heartDrop').first().evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.__analysisReads), reads);
      assert.equal(await page.locator('audio').evaluate(a => a.paused), false);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      await page.waitForFunction(n => window.__analysisReads > n, reads);
      assert.equal(await page.evaluate(() => window.__activeFrames.size), 1);
    });
    await check('Rapid next/play/pause resolves to the final command with no false errors', async () => {
      await page.route('**/*.mp3', async route => { await new Promise(resolve => setTimeout(resolve, 160)); await route.continue().catch(() => {}); });
      await page.evaluate(() => { for (let i = 0; i < 3; i++) document.querySelector('#nextTrack').click(); });
      await playing();
      assert.equal(await page.locator('#trackName').textContent(), '第 4 首');
      assert((await page.locator('audio').evaluate(a => a.currentSrc)).endsWith('/4.mp3'));
      await page.evaluate(() => { const btn = document.querySelector('#musicToggle'); for (let i = 0; i < 9; i++) btn.click(); });
      await page.waitForTimeout(250);
      assert.equal(await page.locator('audio').evaluate(a => a.paused), true);
      assert.equal(await page.locator('#musicHint').textContent(), '音乐：已暂停');
      assert.equal(await page.evaluate(() => window.__activeFrames.size), 0);
      await buttonClick('#musicToggle');
      await playing();
      assert.equal(await page.evaluate(() => window.__audioContexts.length), 1);
      assert.equal(await page.evaluate(() => window.__audioContexts[0].state), 'running');
      await page.unroute('**/*.mp3');
    });
    await check('Missing music exits playing state and next track recovers', async () => {
      await page.route('**/5.mp3', route => route.fulfill({ status: 404, body: 'Not found' }));
      await buttonClick('#nextTrack');
      await page.waitForFunction(() => document.querySelector('#musicHint').textContent.includes('暂时无法播放'));
      assert.equal(await page.locator('#musicToggle').getAttribute('aria-pressed'), 'false');
      assert.equal(await page.evaluate(() => window.__activeFrames.size), 0);
      assert.equal(await page.locator('#eq').getAttribute('data-state'), 'idle');
      assert.equal(await page.locator('#eq').evaluate(el => el.classList.contains('is-canvas')), false);
      assert(await page.locator('#eq i').evaluateAll(bars => bars.every(el => !el.style.transform)));
      await buttonClick('#nextTrack');
      await playing();
      assert.equal(await page.locator('#trackName').textContent(), '第 6 首');
      await page.unroute('**/5.mp3');
    });
    await check('Track persistence, native ended event and 11-to-1 wraparound', async () => {
      await buttonClick('#musicToggle');
      await page.evaluate(() => localStorage.setItem('trackIndex', '11'));
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('#trackName').textContent(), '第 11 首');
      assert.equal(await page.locator('audio').getAttribute('src'), null);
      await buttonClick('#musicToggle');
      await playing();
      await page.evaluate(() => { const a = document.querySelector('audio'); a.currentTime = a.duration - .1; });
      await page.waitForFunction(() => document.querySelector('#trackName').textContent === '第 1 首');
      await playing();
      assert.equal(await page.evaluate(() => localStorage.getItem('trackIndex')), '1');
      await buttonClick('#musicToggle');
    });
    await check('Invalid and unavailable storage do not break interactions', async () => {
      await page.evaluate(() => { localStorage.setItem('mood', '__proto__'); localStorage.setItem('trackIndex', '-99'); });
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('body').getAttribute('data-mood'), 'sweet');
      assert.equal(await page.locator('#trackName').textContent(), '第 1 首');
      const blocked = await browser.newContext();
      await blocked.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
      });
      const p = await blocked.newPage();
      const localErrors = [];
      p.on('pageerror', e => localErrors.push(e.message));
      await p.goto(`${origin}/index.html`);
      await p.locator('[data-mood-btn="soft"]').click();
      await p.locator('#ideaBtn').click();
      assert.equal(await p.locator('body').getAttribute('data-mood'), 'soft');
      assert((await p.locator('#ideaTitle').textContent()).length > 0);
      assert.deepEqual(localErrors, []);
      await blocked.close();
    });
    await check('Links remain available without JavaScript', async () => {
      const noJS = await browser.newContext({ javaScriptEnabled: false });
      const p = await noJS.newPage();
      await p.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
      assert.equal(await p.locator('.linkCard').count(), 8);
      assert.equal(await p.locator('.ico img').count(), 8);
      assert((await p.locator('.linkCard').first().getAttribute('href')).includes('github.com'));
      await noJS.close();
    });
    await check('Native audio still works when Web Audio is unavailable', async () => {
      const native = await browser.newContext();
      await native.addInitScript(() => { window.AudioContext = undefined; window.webkitAudioContext = undefined; });
      const p = await native.newPage();
      await p.goto(`${origin}/index.html`);
      await p.locator('#musicToggle').click();
      await p.waitForFunction(() => !document.querySelector('audio').paused && document.querySelector('audio').currentTime > .1);
      await p.locator('#musicToggle').click({ force: true });
      assert.equal(await p.locator('audio').evaluate(a => a.paused), true);
      await native.close();
    });
    await check('Saved palette and selected pill are correct before app.js loads', async () => {
      const cold = await browser.newContext();
      await cold.addInitScript(() => localStorage.setItem('mood', 'soft'));
      const p = await cold.newPage();
      await p.route('**/app.js', route => route.abort());
      await p.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
      assert.equal(await p.locator('html').getAttribute('data-mood'), 'soft');
      assert.equal(await p.locator('body').evaluate(el => getComputedStyle(el).getPropertyValue('--a1').trim()), '#9ff3ff');
      assert.equal(await p.locator('[data-mood-btn="soft"]').evaluate(el => getComputedStyle(el).borderTopColor), 'rgba(255, 255, 255, 0.9)');
      assert.equal(await p.locator('[data-mood-btn="sweet"]').evaluate(el => getComputedStyle(el).borderTopColor), 'rgba(255, 255, 255, 0.2)');
      await cold.close();
    });
    await check('Mobile portrait/landscape retain all controls and untruncated track names', async () => {
      const mobile = await browser.newContext({ isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      const p = await mobile.newPage();
      for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
        await p.setViewportSize({ width, height });
        await p.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), width);
        assert(await p.locator('#trackName').evaluate(el => el.clientWidth >= el.scrollWidth));
        for (const id of ['#musicToggle', '#nextTrack']) {
          const rect = await p.locator(id).boundingBox();
          assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height);
        }
        await p.locator('#funCBtn').click();
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), width);
      }
      await mobile.close();
    });
    await check('Falling hearts remain animated with coarse input and reduced motion; cursor effects are removed', async () => {
      const hybrid = await browser.newContext({ viewport: { width: 1000, height: 750 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      await hybrid.addInitScript(instrument);
      const p = await hybrid.newPage();
      await p.goto(`${origin}/index.html`);
      assert.equal(await p.evaluate(() => matchMedia('(pointer: fine)').matches), false);
      await p.mouse.move(320, 250);
      await p.waitForFunction(() => document.querySelectorAll('.heartDrop').length > 0);
      const first = await p.locator('.heartDrop').first().evaluate(el => getComputedStyle(el).transform);
      await p.mouse.move(480, 310);
      await p.waitForFunction(previous => getComputedStyle(document.querySelector('.heartDrop')).transform !== previous, first);
      assert.equal(await p.locator('.heartsLayer').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
      await p.waitForTimeout(100);
      assert.equal(await p.evaluate(() => window.__activeFrames.size), 0);
      assert.equal(await p.locator('.cursorFx, .cursorGlow, .cursorSpark').count(), 0);
      await p.emulateMedia({ reducedMotion: 'no-preference' });
      const dock = await p.locator('#musicDock').boundingBox();
      await p.mouse.move(dock.x + 40, dock.y + 25);
      await p.waitForFunction(() => document.querySelector('#musicDock').style.transform.includes('rotateX'));
      await p.evaluate(() => window.dispatchEvent(new Event('blur')));
      assert.equal(await p.locator('#musicDock').evaluate(el => el.style.transform), '');
      await p.touchscreen.tap(300, 300);
      assert.equal(await p.locator('.cursorFx, .cursorGlow, .cursorSpark').count(), 0);
      await hybrid.close();
    });
    await check('Updated dates and separate interests are present', async () => {
      const labels = await page.locator('.chip').allTextContents();
      assert(labels.includes('围棋 / 桌游'));
      assert(labels.includes('日麻 / 德扑'));
      assert(!labels.includes('围棋 / 麻将'));
      assert((await page.locator('.footer').textContent()).includes('2024–2026'));
    });
    await check('Canvas fallback retains real spectrum and pause freeze', async () => {
      const fallback = await browser.newContext({ reducedMotion: 'reduce' });
      await fallback.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
      const p = await fallback.newPage();
      await p.goto(`${origin}/index.html`);
      await p.locator('#musicToggle').click();
      await p.waitForFunction(() => document.querySelector('#eq i').style.transform !== '');
      assert.equal(await p.locator('#eq').evaluate(el => el.classList.contains('is-canvas')), false);
      const frozen = await p.evaluate(() => {
        const frame = [...document.querySelectorAll('#eq i')].map(el => el.style.transform);
        document.querySelector('#musicToggle').click(); return frame;
      });
      await p.waitForTimeout(150);
      assert.deepEqual(await p.locator('#eq i').evaluateAll(bars => bars.map(el => el.style.transform)), frozen);
      await fallback.close();
    });
    await check('Throttled embedded RAF still animates; pause and hide stop its fallback clock', async () => {
      const embedded = await browser.newContext({ reducedMotion: 'reduce' });
      await embedded.addInitScript(() => {
        const nativeTimer = window.setTimeout.bind(window);
        const nativeClear = window.clearTimeout.bind(window);
        window.requestAnimationFrame = callback => nativeTimer(() => callback(performance.now()), 1000);
        window.cancelAnimationFrame = id => nativeClear(id);
        window.__drawCount = 0;
        const clear = CanvasRenderingContext2D.prototype.clearRect;
        CanvasRenderingContext2D.prototype.clearRect = function (...args) { window.__drawCount++; return clear.apply(this, args); };
      });
      const p = await embedded.newPage();
      await p.goto(`${origin}/index.html`);
      await p.locator('#musicToggle').click();
      await p.waitForFunction(() => window.__drawCount >= 3);
      const before = await p.evaluate(() => window.__drawCount);
      await p.waitForTimeout(700);
      assert(await p.evaluate(n => window.__drawCount - n >= 12, before));
      await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
      const hidden = await p.evaluate(() => window.__drawCount);
      await p.waitForTimeout(180);
      assert.equal(await p.evaluate(() => window.__drawCount), hidden);
      await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      await p.waitForFunction(n => window.__drawCount > n, hidden);
      await p.locator('#musicToggle').click();
      const paused = await p.evaluate(() => ({ count: window.__drawCount, image: document.querySelector('.eqCanvas').toDataURL() }));
      await p.waitForTimeout(250);
      assert.equal(await p.evaluate(() => window.__drawCount), paused.count);
      assert.equal(await p.locator('.eqCanvas').evaluate(el => el.toDataURL()), paused.image);
      await embedded.close();
    });
    await check('No unhandled script errors across the full interaction suite', async () => assert.deepEqual(errors, []));
    fs.mkdirSync(path.join(__dirname, '../test-results'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '../test-results/browser.json'), JSON.stringify({ checks, errors }, null, 2));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
