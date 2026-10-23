const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { build } = require('../tools/build.cjs');
const { startServer } = require('../tools/serve.cjs');
const checks = [];
const check = (name, fn) => fn().then(() => { checks.push(name); console.log(`PASS ${name}`); });

function instrument({ slowRAF = false } = {}) {
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
  const nativeTimer = window.setTimeout.bind(window), nativeClear = window.clearTimeout.bind(window);
  window.__visualTimerSchedules = { normal: 0, fallback: 0 };
  window.__activeVisualTimers = new Set();
  window.setTimeout = (callback, delay, ...args) => {
    if (delay !== 150 && delay !== 34) return nativeTimer(callback, delay, ...args);
    window.__visualTimerSchedules[delay === 150 ? 'normal' : 'fallback']++;
    const id = nativeTimer(() => { window.__activeVisualTimers.delete(id); callback(...args); }, delay);
    window.__activeVisualTimers.add(id);
    return id;
  };
  window.clearTimeout = id => { window.__activeVisualTimers.delete(id); nativeClear(id); };
  window.__slowRAF = slowRAF;
  window.__activeFrames = new Set();
  const pendingFrames = new Map();
  const raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
  let frameId = 0;
  window.requestAnimationFrame = callback => {
    const id = ++frameId, delayed = window.__slowRAF;
    const tick = time => { pendingFrames.delete(id); window.__activeFrames.delete(id); callback(time); };
    const nativeId = delayed ? nativeTimer(() => tick(performance.now()), 1000) : raf(tick);
    pendingFrames.set(id, { nativeId, delayed });
    window.__activeFrames.add(id);
    return id;
  };
  window.cancelAnimationFrame = id => {
    const pending = pendingFrames.get(id);
    if (pending) { if (pending.delayed) nativeClear(pending.nativeId); else cancel(pending.nativeId); }
    pendingFrames.delete(id);
    window.__activeFrames.delete(id);
  };
}

(async () => {
  // Exercise the exact minified, hashed assets shipped to Netlify.
  const root = path.join(__dirname, '../test-results/browser-build');
  await build(root);
  const { server, origin } = await startServer({ root, production: true });
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined, headless: true, args: ['--mute-audio'] });
  const policyViolations = [];
  const errors = [];
  const newContext = async options => {
    const ctx = await browser.newContext(options);
    ctx.on('page', p => p.on('pageerror', error => errors.push({ url: p.url(), message: error.message })));
    await ctx.exposeBinding('__recordPolicyViolation', ({ page: source }, violation) => policyViolations.push({ url: source.url(), ...violation }));
    await ctx.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
      void window.__recordPolicyViolation({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
    }));
    return ctx;
  };
  const context = await newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await context.addInitScript(instrument);
  const page = await context.newPage();
  const audioRequests = [];
  page.on('request', r => { if (r.url().endsWith('.mp3')) audioRequests.push(r.url()); });
  const buttonClick = async id => { await page.locator(id).click({ force: true }); await page.mouse.move(0, 0); await page.waitForTimeout(40); };
  const playing = () => page.waitForFunction(() => { const a = document.querySelector('audio'); return !a.paused && a.currentTime > .1 && document.querySelector('#musicHint').textContent.includes('正在播放'); });
  try {
    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await check('Startup loads no audio, creates no AudioContext and schedules no idle RAF', async () => {
      assert.equal(audioRequests.length, 0);
      assert.deepEqual(await page.evaluate(() => [document.querySelector('audio').getAttribute('src'), window.__audioContexts.length, window.__activeFrames.size]), [null, 0, 0]);
      assert.equal(await page.locator('.linkCard').count(), 9);
      assert.equal(await page.locator('.heartsLayer').getAttribute('aria-hidden'), 'true');
      assert.equal(await page.locator('#seekTrack').isDisabled(), true);
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
      await page.evaluate(() => {
        navigator.clipboard.writeText = () => Promise.reject(new Error('Denied'));
        document.execCommand = () => false;
      });
      let prompted = false;
      page.once('dialog', async dialog => { prompted = dialog.type() === 'prompt' && dialog.defaultValue().length > 0; await dialog.dismiss(); });
      await page.locator('#copyLineBtn').focus();
      await page.evaluate(() => document.querySelector('#toast').textContent = 'copy fallback sentinel');
      await buttonClick('#copyLineBtn');
      assert(prompted);
      assert.equal(await page.locator('#toast').textContent(), 'copy fallback sentinel');
    });
    await check('Legacy clipboard copying survives missing or denied Clipboard API and preserves the page', async () => {
      const legacyCopy = await newContext({ viewport: { width: 390, height: 700 } });
      await legacyCopy.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
        document.execCommand = command => {
          const input = document.activeElement;
          window.__legacyCopied = command === 'copy' && input instanceof HTMLTextAreaElement
            ? { value: input.value, readonly: input.readOnly, selected: input.selectionEnd - input.selectionStart }
            : null;
          return !!window.__legacyCopied;
        };
      });
      const p = await legacyCopy.newPage();
      const localErrors = [];
      p.on('pageerror', error => localErrors.push(error.message));
      await p.goto(`${origin}/index.html`);
      await p.locator('#funCBtn').click();
      const before = await p.evaluate(() => {
        const button = document.querySelector('#funCopyBtn');
        button.focus();
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('#funTitle'));
        const selection = window.getSelection();
        selection.removeAllRanges(); selection.addRange(range);
        const state = { selected: selection.toString(), scrollY: window.scrollY };
        button.click();
        return state;
      });
      await p.waitForFunction(() => !!window.__legacyCopied);
      const copied = await p.evaluate(() => window.__legacyCopied);
      assert(copied.value.includes('心动挑战') && copied.value.includes('\n'));
      assert.equal(copied.readonly, true);
      assert.equal(copied.selected, copied.value.length);
      assert.equal(await p.evaluate(() => document.activeElement.id), 'funCopyBtn');
      assert.equal(await p.evaluate(() => window.getSelection().toString()), before.selected);
      assert.equal(await p.evaluate(() => window.scrollY), before.scrollY);
      assert.equal(await p.locator('textarea').count(), 0);
      await p.evaluate(() => {
        window.__legacyCopied = null;
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) } });
      });
      await p.locator('#copyLineBtn').click();
      await p.waitForFunction(() => !!window.__legacyCopied);
      assert((await p.evaluate(() => window.__legacyCopied.value)).length > 0);
      assert.equal(await p.locator('#toast').textContent(), '已复制：去发给TA');
      assert.equal(await p.locator('textarea').count(), 0);
      assert.deepEqual(localErrors, []);
      await legacyCopy.close();
    });
    await check('Play starts one audio graph and one visual loop; pause stops both', async () => {
      await buttonClick('#musicToggle');
      await playing();
      await page.waitForFunction(() => window.__analysisReads > 2);
      assert.equal(await page.evaluate(() => window.__audioContexts.length), 1);
      assert.equal(await page.evaluate(() => window.__activeFrames.size), 1);
      assert.equal(await page.locator('#musicToggle').getAttribute('aria-label'), '暂停音乐');
      assert.deepEqual(await page.evaluate(() => {
        const metadata = navigator.mediaSession.metadata;
        return [metadata.title, metadata.artist];
      }), ['ENDLESS DREAM (エンドレス　ドリーマー)', 'shiki']);
      const before = await page.evaluate(() => ({ reads: window.__analysisReads, timers: { ...window.__visualTimerSchedules } }));
      await page.waitForTimeout(1100);
      const after = await page.evaluate(() => ({ reads: window.__analysisReads, timers: { ...window.__visualTimerSchedules } }));
      const updates = after.reads - before.reads;
      const timerSchedules = after.timers.normal + after.timers.fallback - before.timers.normal - before.timers.fallback;
      assert(updates >= 25 && updates <= 70, `visual updates in 1.1 seconds: ${updates}`);
      assert(timerSchedules <= 12 && timerSchedules < updates / 2, `watchdog schedules for ${updates} visual updates: ${timerSchedules}`);
      assert.equal(after.timers.fallback, before.timers.fallback, 'normal RAF should not need fallback draws');
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
      assert.equal(await page.evaluate(() => window.__activeVisualTimers.size), 0);
      const pausedReads = await page.evaluate(() => window.__analysisReads);
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.__analysisReads), pausedReads);
      assert.equal(await page.locator('#eq').getAttribute('data-state'), 'frozen');
      assert.deepEqual(await page.locator('#eq i').evaluateAll(bars => bars.map(el => el.style.transform)), frozen.bars);
      assert.equal(await page.locator('.eqCanvas').evaluate(el => el.toDataURL()), frozen.image);
      assert.equal(await page.locator('#musicToggle').evaluate(el => getComputedStyle(el, '::before').animationPlayState), 'paused');
    });
    await check('Music, spectrum, falling hearts and player glow keep animating throughout scrolling', async () => {
      const scrolling = await newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      await scrolling.addInitScript(instrument);
      const p = await scrolling.newPage();
      await p.goto(`${origin}/index.html`);
      await p.locator('#musicToggle').click();
      await p.waitForFunction(() => window.__analysisReads > 2 && !document.querySelector('audio').paused);
      await p.mouse.move(180, 400);
      await p.mouse.wheel(0, 120);
      await p.waitForFunction(() => window.scrollY > 0);
      const before = await p.evaluate(() => ({ reads: window.__analysisReads, position: document.querySelector('audio').currentTime, y: window.scrollY, heart: getComputedStyle(document.querySelector('.heartDrop')).transform, orbit: getComputedStyle(document.querySelector('#musicToggle'), '::before').transform }));
      for (let i = 0; i < 4; i++) {
        await p.mouse.wheel(0, 100);
        await p.waitForTimeout(75);
      }
      const during = await p.evaluate(() => ({ reads: window.__analysisReads, position: document.querySelector('audio').currentTime, paused: document.querySelector('audio').paused, y: window.scrollY, frames: window.__activeFrames.size, clocks: window.__activeVisualTimers.size, hearts: getComputedStyle(document.querySelector('.heartDrop')).animationPlayState, heart: getComputedStyle(document.querySelector('.heartDrop')).transform, orbit: getComputedStyle(document.querySelector('#musicToggle'), '::before').transform, orbitState: getComputedStyle(document.querySelector('#musicToggle'), '::before').animationPlayState, state: document.querySelector('#eq').dataset.state }));
      assert(during.y > before.y, 'the wheel must actually scroll the document');
      assert(during.reads > before.reads + 2, 'the real spectrum must continue sampling during scrolling');
      assert.equal(during.paused, false);
      assert(during.position > before.position + .15, 'music must keep advancing while effects animate');
      assert.deepEqual([during.frames, during.clocks, during.hearts, during.orbitState, during.state], [1, 1, 'running', 'running', 'active']);
      assert.notEqual(during.heart, before.heart, 'falling hearts must visibly move while scrolling');
      assert.notEqual(during.orbit, before.orbit, 'the play-button halo must keep rotating while scrolling');
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      await p.locator('#musicToggle').click();
      assert.deepEqual(await p.evaluate(() => [window.__activeFrames.size, window.__activeVisualTimers.size]), [0, 0]);
      await scrolling.close();
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
      // A queued error from a superseded resource has no current MediaError.
      assert.equal(await page.locator('audio').evaluate(audio => audio.error), null);
      const beforeStaleError = await page.locator('audio').evaluate(audio => {
        const position = audio.currentTime;
        audio.dispatchEvent(new Event('error'));
        return position;
      });
      await page.waitForFunction(position => !document.querySelector('audio').paused && document.querySelector('audio').currentTime > position + .1, beforeStaleError);
      assert.equal(await page.locator('#musicToggle').getAttribute('aria-pressed'), 'true');
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
      await page.mouse.move(rect.x + 50, rect.y + rect.height / 2);
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
      assert.equal(await page.evaluate(() => window.__activeVisualTimers.size), 0);
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
      assert.equal(await page.locator('#trackName').textContent(), "AIR");
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
      assert.equal(await page.locator('#trackName').textContent(), "Dead of Night");
      await page.unroute('**/5.mp3');
    });
    await check('Track persistence, native ended event and 11-to-1 wraparound', async () => {
      await buttonClick('#musicToggle');
      await page.evaluate(() => localStorage.setItem('trackIndex', '11'));
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('#trackName').textContent(), "水の戯れ（ラヴェル） (水之嬉戏（拉威尔作曲）)");
      assert.equal(await page.locator('audio').getAttribute('src'), null);
      await buttonClick('#musicToggle');
      await playing();
      await page.evaluate(() => { const a = document.querySelector('audio'); a.currentTime = a.duration - .1; });
      await page.waitForFunction(() => document.querySelector('#trackName').textContent === "ENDLESS DREAM (エンドレス　ドリーマー)");
      await playing();
      assert.equal(await page.evaluate(() => localStorage.getItem('trackIndex')), '1');
      await buttonClick('#musicToggle');
    });
    await check('Playlist opens without audio downloads and keeps keyboard focus in native and fallback dialogs', async () => {
      for (const fallbackDialog of [false, true]) {
        const playlist = await newContext({ reducedMotion: 'reduce' });
        await playlist.addInitScript(instrument);
        if (fallbackDialog) await playlist.addInitScript(() => { HTMLDialogElement.prototype.showModal = undefined; });
        const p = await playlist.newPage();
        const requests = [];
        p.on('request', request => { if (request.url().endsWith('.mp3')) requests.push(request.url()); });
        await p.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
        await p.locator('#trackName').press('Enter');
        await p.locator('#playlistDialog').waitFor({ state: 'visible' });
        assert.equal(await p.locator('#trackName').getAttribute('aria-expanded'), 'true');
        assert.equal(await p.locator('.playlistTrack').count(), 11);
        assert.equal(await p.locator('.playlistTrack[aria-current="true"]').count(), 1);
        assert.deepEqual(await p.evaluate(() => [document.querySelector('audio').getAttribute('src'), window.__audioContexts.length]), [null, 0]);
        assert.equal(requests.length, 0);
        assert(await p.evaluate(() => document.querySelector('#playlistDialog').contains(document.activeElement)));
        for (const key of ['Tab', 'Shift+Tab']) {
          for (let i = 0; i < 18; i++) {
            await p.keyboard.press(key);
            assert(await p.evaluate(() => document.querySelector('#playlistDialog').contains(document.activeElement)), `${fallbackDialog ? 'fallback' : 'native'} dialog leaked focus on ${key}`);
          }
        }
        await p.keyboard.press('Escape');
        await p.locator('#playlistDialog').waitFor({ state: 'hidden' });
        assert.equal(await p.evaluate(() => document.activeElement.id), 'trackName');
        assert.equal(await p.locator('#trackName').getAttribute('aria-expanded'), 'false');
        if (!fallbackDialog) {
          await p.locator('#trackName').press('Enter');
          await p.locator('.playlistTrack').nth(2).click();
          await p.waitForFunction(() => document.querySelector('#trackName').textContent === "1998" && !document.querySelector('audio').paused && document.querySelector('audio').currentTime > .1);
          assert.equal(await p.locator('#playlistDialog').isVisible(), false);
          assert.equal(await p.evaluate(() => document.activeElement.id), 'trackName');
          await p.locator('audio').evaluate(audio => { audio.currentTime = 30; });
          await p.locator('#trackName').press('Enter');
          await p.locator('.playlistTrack[aria-current="true"]').click();
          assert(await p.locator('audio').evaluate(audio => !audio.paused && audio.currentTime >= 29.5), 'selecting the current track must preserve playback position');
        }
        await playlist.close();
      }
    });
    await check('Seek works with native keyboard and touch input while paused without starting another track', async () => {
      // Chromium touch emulation verifies input wiring; it is not a claim of real-device coverage.
      const touch = await newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      const p = await touch.newPage();
      await p.goto(`${origin}/index.html`);
      await p.locator('#musicToggle').tap();
      await p.waitForFunction(() => !document.querySelector('audio').paused && Number.isFinite(document.querySelector('audio').duration) && !document.querySelector('#seekTrack').disabled);
      await p.locator('#musicToggle').tap();
      const seek = p.locator('#seekTrack');
      await seek.press('Home');
      await p.waitForFunction(() => document.querySelector('audio').currentTime < .1);
      await seek.press('ArrowRight');
      await p.waitForFunction(() => { const audio = document.querySelector('audio'); return Math.abs(audio.currentTime - audio.duration / 1000) < .2 && audio.currentTime > 0; });
      assert((await seek.getAttribute('aria-valuetext'))?.length > 0);
      await seek.press('End');
      await p.waitForFunction(() => { const audio = document.querySelector('audio'); return audio.currentTime >= audio.duration - .2; });
      assert.equal(await p.locator('audio').evaluate(audio => audio.paused), true);
      assert.equal(await p.locator('#trackName').textContent(), "ENDLESS DREAM (エンドレス　ドリーマー)");
      const bounds = await seek.boundingBox();
      await p.touchscreen.tap(bounds.x + bounds.width * .7, bounds.y + bounds.height / 2);
      await p.waitForFunction(() => { const audio = document.querySelector('audio'); return audio.currentTime / audio.duration > .6 && audio.currentTime / audio.duration < .8; });
      assert.equal(await p.locator('audio').evaluate(audio => audio.paused), true);
      assert.equal(await p.locator('#trackName').textContent(), "ENDLESS DREAM (エンドレス　ドリーマー)");
      await touch.close();
    });
    await check('Volume, mute and decoration preferences persist without interrupting music or the spectrum', async () => {
      const preferences = await newContext({ reducedMotion: 'reduce' });
      await preferences.addInitScript(instrument);
      const p = await preferences.newPage();
      await p.goto(`${origin}/index.html`);
      await p.locator('#musicToggle').click();
      await p.waitForFunction(() => !document.querySelector('audio').paused && window.__analysisReads > 2);
      await p.locator('#trackName').click();
      await p.locator('#musicVolume').press('Home');
      for (let i = 0; i < 37; i++) await p.locator('#musicVolume').press('ArrowRight');
      assert(await p.locator('audio').evaluate(audio => Math.abs(audio.volume - .37) < .001 && !audio.muted));
      await p.locator('#muteMusic').click();
      assert.equal(await p.locator('#muteMusic').getAttribute('aria-pressed'), 'true');
      assert.equal(await p.locator('audio').evaluate(audio => audio.muted), true);
      await p.locator('#effectsToggle').uncheck();
      assert.equal(await p.locator('html').getAttribute('data-effects'), 'off');
      const before = await p.evaluate(() => ({ time: document.querySelector('audio').currentTime, reads: window.__analysisReads }));
      await p.waitForFunction(previous => !document.querySelector('audio').paused && document.querySelector('audio').currentTime > previous.time && window.__analysisReads > previous.reads, before);
      assert(await p.locator('.heartsLayer').evaluate(layer => getComputedStyle(layer).display === 'none' || [...layer.children].every(heart => getComputedStyle(heart).animationPlayState === 'paused')));
      assert.deepEqual(await p.evaluate(() => [localStorage.getItem('musicVolume'), localStorage.getItem('musicMuted'), localStorage.getItem('effects')]), ['0.37', 'true', 'off']);
      await p.reload({ waitUntil: 'networkidle' });
      assert.deepEqual(await p.locator('audio').evaluate(audio => [audio.getAttribute('src'), audio.volume, audio.muted]), [null, .37, true]);
      assert.equal(await p.locator('html').getAttribute('data-effects'), 'off');
      await p.locator('#trackName').click();
      assert.equal(await p.locator('#effectsToggle').isChecked(), false);
      assert.equal(await p.locator('#musicVolume').inputValue(), '0.37');
      await p.locator('#muteMusic').click();
      assert(await p.locator('audio').evaluate(audio => !audio.muted && audio.volume === .37));
      await preferences.close();
    });
    await check('Read-only device volume never overwrites the adjustable volume preference', async () => {
      const deviceVolume = await newContext();
      await deviceVolume.addInitScript(() => {
        if (!/^https?:$/.test(location.protocol)) return;
        localStorage.setItem('musicVolume', '0.37');
        Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
          configurable: true, get() { return 1; }, set() {},
        });
      });
      const p = await deviceVolume.newPage();
      await p.goto(`${origin}/index.html`);
      await p.locator('#trackName').click();
      assert.equal(await p.locator('#musicVolume').isDisabled(), true);
      await p.locator('#muteMusic').click();
      assert.deepEqual(await p.evaluate(() => [localStorage.getItem('musicVolume'), localStorage.getItem('musicMuted')]), ['0.37', 'true']);
      assert.equal(await p.locator('audio').evaluate(audio => audio.muted), true);
      await p.locator('#muteMusic').click();
      assert.equal(await p.evaluate(() => localStorage.getItem('musicVolume')), '0.37');
      await deviceVolume.close();
    });
    await check('Invalid and unavailable storage do not break interactions', async () => {
      await page.evaluate(() => {
        localStorage.setItem('mood', '__proto__');
        localStorage.setItem('trackIndex', '-99');
        localStorage.setItem('musicVolume', 'NaN');
        localStorage.setItem('musicMuted', '__proto__');
        localStorage.setItem('effects', 'unexpected');
      });
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('body').getAttribute('data-mood'), 'sweet');
      assert.equal(await page.locator('#trackName').textContent(), "ENDLESS DREAM (エンドレス　ドリーマー)");
      assert.deepEqual(await page.locator('audio').evaluate(audio => [audio.volume, audio.muted]), [.9, false]);
      assert.equal(await page.locator('html').getAttribute('data-effects'), 'on');
      const blocked = await newContext();
      await blocked.addInitScript(() => {
        if (!/^https?:$/.test(location.protocol)) return;
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
      const noJS = await newContext({ javaScriptEnabled: false });
      const p = await noJS.newPage();
      await p.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
      assert.equal(await p.locator('.linkCard').count(), 9);
      assert.equal(await p.locator('.ico img').count(), 9);
      assert((await p.locator('.linkCard').first().getAttribute('href')).includes('github.com'));
      await noJS.close();
    });
    await check('Native audio still works when Web Audio is unavailable', async () => {
      const native = await newContext();
      await native.addInitScript(() => { window.AudioContext = undefined; window.webkitAudioContext = undefined; });
      const p = await native.newPage();
      await p.goto(`${origin}/index.html`);
      await p.locator('#musicToggle').click();
      await p.waitForFunction(() => !document.querySelector('audio').paused && document.querySelector('audio').currentTime > .1);
      await p.locator('#musicToggle').click({ force: true });
      assert.equal(await p.locator('audio').evaluate(a => a.paused), true);
      await native.close();
    });
    await check('Legacy MediaQueryList and missing Object.hasOwn keep controls and music usable', async () => {
      const legacy = await newContext({ reducedMotion: 'no-preference' });
      await legacy.addInitScript(() => {
        Object.hasOwn = undefined;
        const matchMedia = window.matchMedia.bind(window);
        window.matchMedia = query => {
          const media = matchMedia(query);
          return {
            get matches() { return media.matches; },
            media: media.media,
            addListener(callback) { media.addEventListener('change', callback); },
          };
        };
      });
      const p = await legacy.newPage();
      const localErrors = [];
      p.on('pageerror', error => localErrors.push(error.message));
      await p.goto(`${origin}/index.html`);
      await p.locator('[data-mood-btn="soft"]').click();
      await p.locator('#ideaBtn').click();
      assert.equal(await p.locator('body').getAttribute('data-mood'), 'soft');
      assert((await p.locator('#ideaTitle').textContent()).length > 0);
      assert(await p.locator('.heartDrop').count() > 0);
      await p.locator('#musicToggle').click();
      await p.waitForFunction(() => !document.querySelector('audio').paused && document.querySelector('audio').currentTime > .1);
      const dock = await p.locator('#musicDock').boundingBox();
      await p.mouse.move(dock.x + 50, dock.y + dock.height / 2);
      await p.waitForFunction(() => document.querySelector('#musicDock').style.transform.includes('rotateX'));
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.waitForFunction(() => document.querySelector('#musicDock').style.transform === '');
      await p.locator('#musicToggle').click({ force: true });
      assert.equal(await p.locator('audio').evaluate(audio => audio.paused), true);
      assert.deepEqual(localErrors, []);
      await legacy.close();
    });
    await check('Saved palette and selected pill are correct before app.js loads', async () => {
      const cold = await newContext();
      await cold.addInitScript(() => {
        // New pages also initialize at about:blank, which has no storage origin.
        if (/^https?:$/.test(location.protocol)) localStorage.setItem('mood', 'soft');
      });
      const p = await cold.newPage();
      await p.route(/\/app(?:\.[a-f0-9]{12})?\.js$/, route => route.abort());
      await p.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
      assert.equal(await p.locator('html').getAttribute('data-mood'), 'soft');
      assert.equal(await p.locator('body').evaluate(el => getComputedStyle(el).getPropertyValue('--a1').trim()), '#9ff3ff');
      assert.equal(await p.locator('[data-mood-btn="soft"]').evaluate(el => getComputedStyle(el).borderTopColor), 'rgba(255, 255, 255, 0.9)');
      assert.equal(await p.locator('[data-mood-btn="sweet"]').evaluate(el => getComputedStyle(el).borderTopColor), 'rgba(255, 255, 255, 0.2)');
      await cold.close();
    });
    await check('Mobile portrait/landscape retain controls, visible spectrum and complete playlist titles', async () => {
      const mobile = await newContext({ isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      const p = await mobile.newPage();
      for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
        await p.setViewportSize({ width, height });
        await p.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), width);
        const title = await p.locator('#trackName').textContent();
        assert((await p.locator('#trackName').getAttribute('aria-label')).includes(title));
        assert((await p.locator('#trackName').getAttribute('title')).includes(title));
        assert(await p.locator('#eq').evaluate(el => el.getBoundingClientRect().width >= 64));
        const progress = await p.locator('.bar').boundingBox();
        const playControl = await p.locator('#musicToggle').boundingBox();
        assert(progress.x + progress.width <= playControl.x);
        for (const id of ['#musicToggle', '#nextTrack']) {
          const rect = await p.locator(id).boundingBox();
          assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height);
        }
        await p.locator('#trackName').click();
        assert(await p.locator('.playlistTrack').evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth && !/第\s*\d+\s*首/.test(button.textContent))));
        assert(await p.locator('#playlistDialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth));
        await p.keyboard.press('Escape');
        await p.locator('#funCBtn').click();
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), width);
      }
      await mobile.close();
    });
    await check('Falling hearts remain animated with coarse input and reduced motion; cursor effects are removed', async () => {
      const hybrid = await newContext({ viewport: { width: 1000, height: 750 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
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
      await p.waitForTimeout(100);
      assert.equal(await p.locator('#musicDock').evaluate(el => el.style.transform), '', 'coarse-input devices keep the wide dock out of 3D composition');
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
      const fallback = await newContext({ reducedMotion: 'reduce' });
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
    await check('Throttled RAF recovers to the low-frequency watchdog; pause and hide clear both clocks', async () => {
      const embedded = await newContext({ reducedMotion: 'reduce' });
      await embedded.addInitScript(instrument, { slowRAF: true });
      const p = await embedded.newPage();
      await p.goto(`${origin}/index.html`);
      await p.locator('#musicToggle').click();
      await p.waitForFunction(() => window.__spectrumDraws >= 3);
      const before = await p.evaluate(() => window.__spectrumDraws);
      await p.waitForTimeout(700);
      assert(await p.evaluate(n => window.__spectrumDraws - n >= 12, before));
      assert.equal(await p.evaluate(() => window.__activeFrames.size), 1, 'fallback must preserve the pending real RAF');
      await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
      const hidden = await p.evaluate(() => window.__spectrumDraws);
      assert.deepEqual(await p.evaluate(() => [window.__activeFrames.size, window.__activeVisualTimers.size]), [0, 0]);
      await p.waitForTimeout(180);
      assert.equal(await p.evaluate(() => window.__spectrumDraws), hidden);
      await p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      await p.waitForFunction(n => window.__spectrumDraws > n, hidden);
      const recoveryStart = await p.evaluate(() => { window.__slowRAF = false; return window.__visualTimerSchedules.normal; });
      await p.waitForFunction(n => window.__visualTimerSchedules.normal >= n + 2, recoveryStart);
      const recovered = await p.evaluate(() => ({ ...window.__visualTimerSchedules }));
      await p.waitForTimeout(500);
      const stable = await p.evaluate(() => ({ ...window.__visualTimerSchedules }));
      assert.equal(stable.fallback, recovered.fallback, 'fast fallback timer must stop after real RAF recovers');
      assert(stable.normal - recovered.normal >= 2 && stable.normal - recovered.normal <= 5, 'recovered watchdog should return to low-frequency checks');
      assert.equal(await p.evaluate(() => window.__activeFrames.size), 1);
      await p.locator('#musicToggle').click();
      const paused = await p.evaluate(() => ({ count: window.__spectrumDraws, image: document.querySelector('.eqCanvas').toDataURL() }));
      assert.deepEqual(await p.evaluate(() => [window.__activeFrames.size, window.__activeVisualTimers.size]), [0, 0]);
      await p.waitForTimeout(250);
      assert.equal(await p.evaluate(() => window.__spectrumDraws), paused.count);
      assert.equal(await p.locator('.eqCanvas').evaluate(el => el.toDataURL()), paused.image);
      await embedded.close();
    });
    await check('Normal interactions produce no CSP violations and unauthorized inline scripts are blocked', async () => {
      assert.deepEqual(policyViolations, []);
      const isolated = await browser.newContext();
      const p = await isolated.newPage();
      await p.goto(`${origin}/index.html`);
      await p.evaluate(() => {
        window.__blockedScripts = [];
        document.addEventListener('securitypolicyviolation', event => window.__blockedScripts.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI }));
        const script = document.createElement('script');
        script.textContent = 'window.__unauthorizedScriptRan = true;';
        document.head.appendChild(script);
      });
      await p.waitForFunction(() => window.__blockedScripts.some(event => event.directive === 'script-src-elem' && event.blockedURI === 'inline'));
      assert.equal(await p.evaluate(() => window.__unauthorizedScriptRan), undefined);
      await isolated.close();
    });
    await check('No unhandled script errors across the full interaction suite', async () => assert.deepEqual(errors, []));
    fs.mkdirSync(path.join(__dirname, '../test-results'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '../test-results/browser.json'), JSON.stringify({ checks, errors }, null, 2));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
