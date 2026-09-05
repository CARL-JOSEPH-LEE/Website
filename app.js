(() => {
  "use strict";

  // ---------- tiny utils ----------
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const on = (el, type, fn, opt) => el && el.addEventListener(type, fn, opt);
  const lastPicks = new WeakMap();
  const pick = (arr) => {
    if (arr.length < 2) return arr[0];
    const previous = lastPicks.get(arr);
    let index = Math.floor(Math.random() * (arr.length - (previous === undefined ? 0 : 1)));
    if (previous !== undefined && index >= previous) index++;
    lastPicks.set(arr, index);
    return arr[index];
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);

  // Storage can become unavailable after initialization (privacy mode/quota).
  const storage = {
    getItem(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
    setItem(key, value) { try { window.localStorage.setItem(key, value); } catch {} },
  };

  // ---------- toast ----------
  const toastEl = $("#toast");
  let toastTimer = 0;
  const toast = (msg) => {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
  };

  // ---------- interaction data ----------
  const IDEAS = [
    { t: "夜市散步", s: "边走边聊，走累了就坐下来听歌。" },
    { t: "咖啡馆坐一会儿", s: "你点你喜欢的，我负责认真听你说话。" },
    { t: "书店 + 随手挑一本书", s: "翻到喜欢的句子就念给对方听。" },
    { t: "海边 / 公园走走", s: "不打卡，只放松，享受自然之美。" },
    { t: "小众展览 / 博物馆", s: "看不懂也没关系，吐槽也很可爱。" },
    { t: "一局围棋", s: "输了的请一杯奶茶。赢了的也请😄" },
    { t: "听歌交换：你一首我一首", s: "欣赏彼此欣赏的曲子。" },
  ];

  const OPENERS = [
    "我有个小问题：你更喜欢海边、书店还是夜市？",
    "周末想不想一起走走？我带路，你带心情。",
    "我想收一首你的私藏歌：你愿意分享吗？",
    "你今天心情是什么颜色？我想听你讲。",
    "如果我们去喝咖啡，你会点甜的还是苦的？",
  ];

  const FUN_Q = [
    { t: "如果我们现在就在同一座城市…", s: "你会选：咖啡 / 散步 / 书店？" },
    { t: "你最吃哪种“被喜欢”的方式？", s: "被夸 / 被记住细节 / 被照顾情绪？" },
    { t: "我想偷一个你的“幸福小习惯”", s: "比如：睡前歌单、散步路线、最爱的甜点？" },
    { t: "给你一个超能力按钮", s: "按下去能立刻拥有：好心情 / 好运气 / 好睡眠，你选哪一个？" },
    { t: "你觉得最理想的约会是怎样的？", s: "在家窝着 / 出门探索 / 或是其他？" },
    { t: "你更喜欢怎样的聊天方式？", s: "深度谈心 / 轻松闲聊 / 亦或是互相调侃？" },
    { t: "如果可以拥有一种超能力", s: "你希望是隐身 / 瞬间移动 / 还是读懂别人心思？" },
    { t: "你最难忘的一首歌是哪首？", s: "它背后有什么特别的故事吗？" },
  ];

  const FUN_C = [
    { t: "心动挑战：用一句话夸TA", s: "要求：不夸外貌，夸“气质/性格/细节”。" },
    { t: "心动挑战：发给TA一首歌", s: "备注一句：‘这首歌让我想到你某个瞬间。’" },
    { t: "心动挑战：问TA一个选择题", s: "‘奶茶 or 咖啡？夜景 or 书店？’" },
    { t: "心动挑战：制造一个小期待", s: "‘下次见面我带一个小礼物，但你得先猜是什么。’" },
    { t: "心动挑战：分享一个小秘密", s: "‘我有一个小秘密，只告诉你一个人。’" },
    { t: "心动挑战：发送一张照片", s: "‘这张照片让我想起了你。’" },
    { t: "心动挑战：一起听一首歌", s: "‘我们现在同时听这首歌，感受同步的心跳。’" },
    { t: "心动挑战：写一封简短信件", s: "‘不需要很长，只需要真诚。’" },
  ];

  // ---------- mood ----------
  const moodMsg = {
    sweet: "切到「甜 · 粉色」",
    cool:  "切到「酷 · 紫夜」",
    soft:  "切到「柔 · 蓝绿」",
  };

  const moodButtons = $$("[data-mood-btn]");
  const setMood = (value, announce = true) => {
    const m = Object.hasOwn(moodMsg, value) ? value : "sweet";
    document.documentElement.dataset.mood = m;
    document.body.dataset.mood = m;
    storage.setItem("mood", m);
    const btns = moodButtons;
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      b.setAttribute("aria-pressed", String(b.dataset.moodBtn === m));
    }
    if (announce) toast(moodMsg[m]);
  };

  // ---------- clipboard ----------
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      prompt("复制这段：", text);
      return false;
    }
  };

  // ---------- falling hearts: compositor animations, viewport-sized budget ----------
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

  const createHearts = () => {
    const layer = document.createElement("div");
    layer.className = "heartsLayer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
    let resizeTimer = 0;
    let pageActive = !document.hidden;

    const sync = () => {
      layer.classList.toggle("is-paused", !pageActive);
      if (!pageActive) return;

      const compact = !finePointerQuery.matches;
      const lowPower = navigator.connection?.saveData || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4);
      const density = Math.round(window.innerWidth * window.innerHeight / 13000);
      const count = clamp(Math.round(density * (lowPower ? 0.65 : 1)), compact ? 18 : 36, compact ? 40 : 100);
      while (layer.childElementCount > count) layer.lastElementChild.remove();
      const fragment = document.createDocumentFragment();
      for (let i = layer.childElementCount; i < count; i++) {
        const heart = document.createElement("span");
        heart.className = "heartDrop";
        heart.textContent = "❤️";
        heart.style.left = `${rand(-5, 105).toFixed(2)}vw`;
        heart.style.animationDuration = `${rand(9, 18).toFixed(2)}s`;
        heart.style.animationDelay = `${rand(-18, 0).toFixed(2)}s`;
        heart.style.setProperty("--scale", rand(0.7, 1.3).toFixed(2));
        fragment.appendChild(heart);
      }
      layer.appendChild(fragment);
    };

    on(window, "resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sync, 160);
    }, { passive: true });
    on(document, "visibilitychange", () => { pageActive = !document.hidden; sync(); });
    on(window, "pagehide", () => {
      pageActive = false;
      clearTimeout(resizeTimer);
      sync();
    });
    on(window, "pageshow", () => { pageActive = !document.hidden; sync(); });
    on(finePointerQuery, "change", sync);
    sync();
  };

  // ---------- music: lazy audio, one bounded visual loop, cancellable playback ----------
  const createMusic = () => {
    const bgMusic = $("#bgMusic");
    const toggleBtn = $("#musicToggle");
    const nextBtn = $("#nextTrack");
    const trackName = $("#trackName");
    const hint = $("#musicHint");
    const progress = $("#progress");
    const iconPlay = $("#iconPlay");
    const iconPause = $("#iconPause");
    const dock = $("#musicDock");
    const eqEl = $("#eq");
    if (!bgMusic || !toggleBtn || !dock) return;

    const TOTAL_TRACKS = 11;
    const savedIndex = Number.parseInt(storage.getItem("trackIndex"), 10);
    let idx = savedIndex >= 1 && savedIndex <= TOTAL_TRACKS ? savedIndex : 1;
    let sourceIndex = 0;
    let operation = 0;
    let wantsPlayback = false;
    let failed = false;
    let interrupted = false;
    let buffering = false;
    let pageActive = !document.hidden;

    // No src, metadata request, AudioContext or decoding until the user plays.
    bgMusic.preload = "none";
    bgMusic.volume = 0.9;

    const setHint = text => { if (hint && hint.textContent !== text) hint.textContent = text; };
    const setPlayingUI = playing => {
      document.body.classList.toggle("is-playing", playing);
      dock.classList.toggle("playing", playing);
      if (iconPlay) iconPlay.style.display = playing ? "none" : "block";
      if (iconPause) iconPause.style.display = playing ? "block" : "none";
      toggleBtn.setAttribute("aria-label", playing ? "暂停音乐" : "播放音乐");
      toggleBtn.setAttribute("aria-pressed", String(playing));
      toggleBtn.title = playing ? "暂停音乐" : "播放音乐";
    };

    let audioCtx = null;
    let analyser = null;
    let freq = null;
    let waveform = null;
    let bands = [];
    let srcNode = null;
    let analyserUnavailable = false;
    let pendingResumes = 0;
    const resumeAudio = () => {
      if (!audioCtx) return Promise.resolve();
      pendingResumes++;
      // Queue every resume so a preceding asynchronous suspend cannot win.
      return audioCtx.resume().finally(() => {
        pendingResumes--;
        syncAudioState();
      });
    };
    const setupAnalyser = () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      // file:// media can play natively but becomes silent when routed through
      // MediaElementAudioSource (opaque-origin CORS). HTTP previews get real EQ.
      if (!Ctx || window.location.protocol === "file:") return Promise.resolve();
      if (analyserUnavailable) return resumeAudio();
      if (!audioCtx) {
        try {
          audioCtx = new Ctx();
          on(audioCtx, "statechange", () => syncAudioState());
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 2048;
          analyser.minDecibels = -90;
          analyser.maxDecibels = -15;
          analyser.smoothingTimeConstant = 0.15;
          freq = new Uint8Array(analyser.frequencyBinCount);
          waveform = new Uint8Array(analyser.fftSize);
          const binHz = audioCtx.sampleRate / analyser.fftSize;
          // Logarithmic bands separate bass, voices and treble instead of
          // sampling one widely spaced bin per bar.
          const lowHz = 45, highHz = Math.min(16000, audioCtx.sampleRate / 2);
          bands = bars.map((_, i) => {
            const start = Math.max(1, Math.floor(lowHz * (highHz / lowHz) ** (i / bars.length) / binHz));
            const end = Math.min(freq.length, Math.max(start + 1, Math.ceil(lowHz * (highHz / lowHz) ** ((i + 1) / bars.length) / binHz)));
            return { start, end };
          });
          srcNode = audioCtx.createMediaElementSource(bgMusic);
          srcNode.connect(analyser);
          analyser.connect(audioCtx.destination);
        } catch {
          // If Web Audio is unavailable, the native player must still work.
          analyserUnavailable = true;
          analyser = null;
          freq = null;
          waveform = null;
          if (srcNode) {
            srcNode.disconnect();
            srcNode.connect(audioCtx.destination);
          } else {
            if (audioCtx) void audioCtx.close().catch(() => {});
            audioCtx = null;
          }
        }
      }
      // Always queue resume, including if a previous pause is still suspending.
      return resumeAudio();
    };

    const bars = eqEl ? $$("i", eqEl) : [];
    const REST_LEVEL = 0.055;
    const levels = new Float32Array(bars.length).fill(REST_LEVEL);
    const echoes = new Float32Array(bars.length).fill(REST_LEVEL);
    const peaks = new Float32Array(bars.length).fill(REST_LEVEL);
    const peakHolds = new Float32Array(bars.length);
    const previousBandEnergy = new Float32Array(bars.length);
    const previousBars = new Array(bars.length).fill("");
    let hasSpectrum = false;
    let vizRAF = 0;
    let vizTimer = 0;
    let frameClockSlow = false;
    let healthyFrames = 0;
    let lastClock = 0;
    let lastFrame = 0;
    let lastProgress = 0;
    let previousProgress = "";
    let previousEnergy = "";
    let previousKick = "";
    let lastBeat = 0;
    let bassAverage = 0;
    let rmsAverage = 0;
    let glowEnergy = 0;
    let kick = 0;
    let tiltX = 0;
    let tiltY = 0;
    let previousDockTransform = "";

    // One small, pixel-ratio-capped canvas replaces dozens of per-frame style
    // writes. Keep the HTML bars as a fallback if Canvas 2D is unavailable.
    let spectrumCanvas = null, spectrumContext = null, canvasUnavailable = false;
    let spectrumWidth = 0, spectrumHeight = 0, spectrumDpr = 0;
    let spectrumDirty = true;
    const columnOrder = bars.map((_, i) => i < bars.length / 2 ? bars.length - 2 - i * 2 : (i - bars.length / 2) * 2 + 1);
    const columnColors = columnOrder.map(band => `hsl(${315 - band / Math.max(1, bars.length - 1) * 135} 100% 65%)`);
    const particles = Array.from({ length: 16 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
    let particleIndex = 0;
    let lastSpectrumBeat = 0;
    let spectrumGradients = [];
    let floorGradient = null;

    const prepareSpectrum = () => {
      if (canvasUnavailable || !eqEl) return false;
      if (!spectrumCanvas) {
        spectrumCanvas = document.createElement("canvas");
        spectrumCanvas.className = "eqCanvas";
        spectrumCanvas.setAttribute("aria-hidden", "true");
        spectrumContext = spectrumCanvas.getContext("2d");
        if (!spectrumContext) { canvasUnavailable = true; return false; }
        eqEl.appendChild(spectrumCanvas);
        const bounds = eqEl.getBoundingClientRect();
        spectrumWidth = bounds.width; spectrumHeight = bounds.height;
        if (window.ResizeObserver) {
          new ResizeObserver(entries => {
            const box = entries[0].contentRect;
            spectrumWidth = box.width; spectrumHeight = box.height; spectrumDirty = true;
          }).observe(eqEl);
        } else {
          on(window, "resize", () => {
            const box = eqEl.getBoundingClientRect();
            spectrumWidth = box.width; spectrumHeight = box.height; spectrumDirty = true;
          }, { passive: true });
        }
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (spectrumDirty || spectrumDpr !== dpr) {
        spectrumDpr = dpr; spectrumDirty = false;
        spectrumCanvas.width = Math.max(1, Math.round(spectrumWidth * dpr));
        spectrumCanvas.height = Math.max(1, Math.round(spectrumHeight * dpr));
        spectrumContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        spectrumGradients = columnColors.map(color => {
          const gradient = spectrumContext.createLinearGradient(0, spectrumHeight, 0, 0);
          gradient.addColorStop(0, color); gradient.addColorStop(0.72, color); gradient.addColorStop(1, "#ffffff");
          return gradient;
        });
        floorGradient = spectrumContext.createLinearGradient(0, 0, spectrumWidth, 0);
        floorGradient.addColorStop(0, "#00e5ff"); floorGradient.addColorStop(0.5, "#ff36bb"); floorGradient.addColorStop(1, "#00e5ff");
      }
      eqEl.classList.add("is-canvas");
      return true;
    };

    const renderSpectrum = dt => {
      if (!prepareSpectrum()) {
        for (let i = 0; i < bars.length; i++) {
          const value = `scaleY(${levels[i].toFixed(3)})`;
          if (value !== previousBars[i]) { bars[i].style.transform = value; previousBars[i] = value; }
        }
        return;
      }
      const ctx = spectrumContext, w = spectrumWidth, h = spectrumHeight;
      const floor = h - 6, travel = floor - 2, step = w / bars.length;
      const barWidth = Math.max(1, step - (w < 150 ? 1 : 1.8));
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = floorGradient;
      ctx.globalAlpha = glowEnergy * 0.12;
      ctx.fillRect(0, h * 0.48, w, h * 0.52);

      // The expanding arcs are driven by detected onsets, never a timer.
      if (kick > 0.02) {
        ctx.strokeStyle = floorGradient;
        ctx.globalAlpha = kick * 0.65;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(w / 2, floor, w * (0.1 + (1 - kick) * 0.5), travel * (0.25 + (1 - kick) * 0.85), 0, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      if (lastBeat !== lastSpectrumBeat && kick > 0.1) {
        lastSpectrumBeat = lastBeat;
        for (const column of [5, 11, 16, 22]) {
          const band = columnOrder[Math.min(column, bars.length - 1)];
          if (levels[band] < 0.18) continue;
          const particle = particles[particleIndex++ % particles.length];
          particle.x = (column + 0.5) * step; particle.y = floor - levels[band] * travel;
          particle.vx = (column - bars.length / 2) * 0.0014; particle.vy = -0.035;
          particle.life = 1;
        }
      }
      for (let column = 0; column < bars.length; column++) {
        const band = columnOrder[column], x = column * step + (step - barWidth) / 2;
        const top = floor - levels[band] * travel;
        ctx.fillStyle = columnColors[column];
        ctx.globalAlpha = 0.17;
        ctx.fillRect(x, floor - echoes[band] * travel, barWidth, echoes[band] * travel);
        ctx.globalAlpha = 0.16 + kick * 0.1;
        ctx.fillRect(x - 1.4, top - 0.5, barWidth + 2.8, floor - top + 1);
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = spectrumGradients[column];
        ctx.fillRect(x, top, barWidth, Math.max(1, floor - top));
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = "#09091b";
        for (let y = floor - 3; y > top + 1; y -= 3.5) ctx.fillRect(x, y, barWidth, 0.7);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = "#e9fbff";
        ctx.fillRect(x, floor - peaks[band] * travel - 1.2, barWidth, 1.1);
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = columnColors[column];
        ctx.fillRect(x, floor + 2, barWidth, levels[band] * 4);
      }
      // A bright ridge connects the real band envelope, with a soft neon edge.
      ctx.beginPath();
      for (let column = 0; column < bars.length; column++) {
        const x = (column + 0.5) * step, y = floor - levels[columnOrder[column]] * travel;
        if (column) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = "#ffbaff"; ctx.lineWidth = 3; ctx.globalAlpha = 0.16; ctx.stroke();
      ctx.strokeStyle = "#edffff"; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.72; ctx.stroke();
      for (const particle of particles) {
        if (particle.life <= 0) continue;
        particle.life = Math.max(0, particle.life - dt / 340);
        particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += dt * 0.00006;
        ctx.globalAlpha = particle.life * 0.85; ctx.fillStyle = "#f3fdff";
        ctx.fillRect(particle.x, particle.y, 1.4, 1.4);
      }
      ctx.globalAlpha = 0.3 + kick * 0.45; ctx.fillStyle = floorGradient;
      ctx.fillRect(0, floor + 0.5, w, 0.8);
      ctx.globalAlpha = 1;
    };
    const renderDockTransform = () => {
      const bounce = motionQuery.matches ? 0 : kick;
      const transform = tiltX || tiltY || bounce
        ? `translateX(-50%) perspective(900px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) scale(${(1 + bounce * 0.012).toFixed(4)})`
        : "";
      if (transform === previousDockTransform) return;
      // A non-inherited transform keeps each beat out of the dock's descendants.
      dock.style.transform = transform;
      previousDockTransform = transform;
    };

    const updateProgress = () => {
      if (!progress || !pageActive) return;
      const duration = bgMusic.duration;
      const ratio = Number.isFinite(duration) && duration > 0 ? clamp(bgMusic.currentTime / duration, 0, 1) : 0;
      const value = `scaleX(${ratio.toFixed(5)})`;
      if (value !== previousProgress) {
        progress.style.transform = value;
        previousProgress = value;
      }
    };

    const stopViz = (resetSpectrum = false) => {
      cancelAnimationFrame(vizRAF);
      clearTimeout(vizTimer);
      vizRAF = 0;
      vizTimer = 0;
      frameClockSlow = false;
      healthyFrames = 0;
      lastClock = 0;
      lastFrame = 0;
      kick = 0;
      bassAverage = 0;
      rmsAverage = 0;
      glowEnergy = 0;
      dock.classList.remove("visual-active");
      if (eqEl) eqEl.dataset.state = hasSpectrum && !resetSpectrum ? "frozen" : "idle";
      if (previousEnergy !== "0") toggleBtn.style.setProperty("--energy", "0");
      if (previousKick !== "0") toggleBtn.style.setProperty("--kick", "0");
      renderDockTransform();
      previousEnergy = previousKick = "0";
      // A pause preserves the exact last rendered spectrum. Only a new track
      // or a failed source clears it, so there is no fabricated resting chart.
      if (hasSpectrum && !resetSpectrum) return;
      hasSpectrum = false;
      eqEl?.classList.remove("is-canvas");
      if (spectrumContext) spectrumContext.clearRect(0, 0, spectrumWidth, spectrumHeight);
      for (const particle of particles) particle.life = 0;
      lastSpectrumBeat = 0;
      for (let i = 0; i < bars.length; i++) {
        if (previousBars[i]) bars[i].style.removeProperty("transform");
        levels[i] = REST_LEVEL;
        echoes[i] = peaks[i] = REST_LEVEL;
        peakHolds[i] = 0;
        previousBandEnergy[i] = 0;
        previousBars[i] = "";
      }
    };

    // The local spectrum remains responsive in both motion modes; large-area
    // motion is disabled when reduced motion is requested.
    const canVisualize = () => pageActive && !bgMusic.paused && !bgMusic.ended && !buffering && audioCtx?.state === "running" && analyser && freq && bars.length;
    const scheduleViz = () => {
      // Some embedded previews report a visible page but throttle RAF to 1 Hz.
      // Race a bounded timer against RAF; both are cancelled on pause/hide.
      const tick = (time, fromTimer) => {
        cancelAnimationFrame(vizRAF);
        clearTimeout(vizTimer);
        vizRAF = vizTimer = 0;
        if (fromTimer) { frameClockSlow = true; healthyFrames = 0; }
        else {
          healthyFrames = lastClock && time - lastClock < 50 ? healthyFrames + 1 : 0;
          if (healthyFrames >= 4) frameClockSlow = false;
        }
        lastClock = time;
        draw(time);
      };
      vizRAF = requestAnimationFrame(time => tick(time, false));
      vizTimer = setTimeout(() => tick(performance.now(), true), frameClockSlow ? 34 : 120);
    };
    const draw = ts => {
      vizRAF = 0;
      if (!canVisualize()) { stopViz(); return; }
      scheduleViz();
      const elapsed = lastFrame ? ts - lastFrame : 16.67;
      const reducedMotion = motionQuery.matches;
      if (lastFrame && elapsed < (reducedMotion ? 32 : 16)) return;
      lastFrame = ts;
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(waveform);
      const dt = Math.min(elapsed, 64);
      let squareSum = 0;
      for (let i = 0; i < waveform.length; i++) {
        const sample = (waveform[i] - 128) / 128;
        squareSum += sample * sample;
      }
      const rms = Math.sqrt(squareSum / waveform.length);
      const signal = clamp(rms / 0.025, 0, 1);
      let flux = 0;
      let bass = 0;

      for (let i = 0; i < bars.length; i++) {
        const { start, end } = bands[i];
        let sum = 0, peak = 0;
        for (let bin = start; bin < end; bin++) { const value = freq[bin] / 255; sum += value; peak = Math.max(peak, value); }
        const value = (sum / (end - start) * 0.65 + peak * 0.35);
        const strength = Math.pow(clamp((value - 0.08) / 0.87, 0, 1), 1.9) * signal;
        const onset = Math.max(0, strength - previousBandEnergy[i]);
        flux += onset;
        if (i < 7) bass += strength / 7;
        previousBandEnergy[i] = strength;
        const punch = clamp(strength * (0.88 + kick * 0.18) + onset * 2.8, 0, 1);
        const target = REST_LEVEL + punch * (1 - REST_LEVEL);
        const speed = target > levels[i] ? (reducedMotion ? 14 : 8) : (reducedMotion ? 95 : 65);
        levels[i] += (target - levels[i]) * (1 - Math.exp(-dt / speed));
        echoes[i] = Math.max(levels[i], echoes[i] - dt / 720);
        if (levels[i] >= peaks[i]) { peaks[i] = levels[i]; peakHolds[i] = 110; }
        else if (peakHolds[i] > 0) peakHolds[i] -= dt;
        else peaks[i] = Math.max(levels[i], peaks[i] - dt / 460);
      }
      hasSpectrum = true;

      flux /= bars.length;
      const loudness = 1 - Math.exp(-rms * 3.5);
      glowEnergy += (loudness - glowEnergy) * (1 - Math.exp(-dt / 70));
      const energy = (glowEnergy * (reducedMotion ? 0.65 : 1)).toFixed(3);
      if (energy !== previousEnergy) {
        // Only the play button's glow consumes energy; keep updates local to it.
        toggleBtn.style.setProperty("--energy", energy);
        previousEnergy = energy;
      }
      bassAverage += (bass - bassAverage) * (1 - Math.exp(-dt / 450));
      rmsAverage += (rms - rmsAverage) * (1 - Math.exp(-dt / 550));
      if (rms > 0.02 && ts - lastBeat > 190 && (flux > 0.018 || (bass > 0.2 && bass > bassAverage * 1.08 && rms > rmsAverage * 1.025))) {
        kick = reducedMotion ? 0.45 : 1;
        lastBeat = ts;
      } else {
        kick *= Math.exp(-dt / 150);
      }
      if (kick < 0.005) kick = 0;
      const pulse = kick ? kick.toFixed(3) : "0";
      if (pulse !== previousKick) {
        toggleBtn.style.setProperty("--kick", pulse);
        previousKick = pulse;
      }
      renderSpectrum(dt);
      renderDockTransform();
      if (ts - lastProgress >= 100) {
        updateProgress();
        lastProgress = ts;
      }
    };

    const syncViz = () => {
      if (!canVisualize()) { stopViz(); return; }
      if (eqEl) eqEl.dataset.state = "active";
      dock.classList.add("visual-active");
      if (!vizRAF && !vizTimer) scheduleViz();
    };

    const syncAudioState = () => {
      if (!audioCtx) return;
      if (audioCtx.state === "running") { syncViz(); return; }
      stopViz();
      if (wantsPlayback && !bgMusic.paused && (audioCtx.state === "interrupted" || pendingResumes === 0)) {
        interrupted = true;
        wantsPlayback = false;
        operation++;
        bgMusic.pause();
        setPlayingUI(false);
        setHint("音乐：已中断，点 ▶ 继续");
      }
    };

    const failPlayback = () => {
      if (failed) return;
      failed = true;
      wantsPlayback = false;
      operation++;
      bgMusic.pause();
      if (audioCtx) void audioCtx.suspend().catch(() => {});
      setPlayingUI(false);
      stopViz(true);
      setHint("音乐：暂时无法播放，请重试");
      toast("这首音乐暂时无法播放，请重试或切换下一首");
    };

    const play = async () => {
      const request = ++operation;
      wantsPlayback = true;
      failed = false;
      interrupted = false;
      buffering = false;
      setHint("音乐：加载中…");
      setPlayingUI(true);
      if (sourceIndex !== idx || bgMusic.error) {
        sourceIndex = idx;
        bgMusic.src = `${idx}.mp3`;
      }
      try {
        // Start both in the user gesture; awaiting resume first can lose activation.
        const ready = setupAnalyser();
        const started = bgMusic.play();
        await Promise.all([ready, started]);
        if (request !== operation || !wantsPlayback) return;
        setHint("音乐：正在播放");
        syncViz();
      } catch {
        // load()/pause()/rapid next clicks may abort an obsolete play promise.
        if (request === operation && wantsPlayback) failPlayback();
      }
    };

    const pause = () => {
      wantsPlayback = false;
      interrupted = false;
      operation++;
      bgMusic.pause();
      setPlayingUI(false);
      stopViz();
      updateProgress();
      setHint("音乐：已暂停");
    };

    const setTrack = (index, autoplay = false) => {
      operation++;
      wantsPlayback = false;
      failed = false;
      interrupted = false;
      bgMusic.pause();
      stopViz(true);
      idx = ((index - 1) % TOTAL_TRACKS + TOTAL_TRACKS) % TOTAL_TRACKS + 1;
      storage.setItem("trackIndex", String(idx));
      if (trackName) trackName.textContent = `第 ${idx} 首`;
      if (progress) progress.style.transform = "scaleX(0)";
      previousProgress = "scaleX(0)";
      setPlayingUI(false);
      setHint("音乐：点 ▶ 开始");
      if (autoplay) void play();
    };

    on(toggleBtn, "click", () => { if (wantsPlayback || !bgMusic.paused) pause(); else void play(); });
    on(nextBtn, "click", () => { setTrack(idx + 1, true); toast("🎧 下一首"); });
    on(bgMusic, "play", () => {
      if (bgMusic.paused) return;
      wantsPlayback = true;
      setPlayingUI(true);
    });
    on(bgMusic, "playing", () => {
      if (bgMusic.paused) return;
      buffering = false;
      setHint("音乐：正在播放");
      syncViz();
    });
    on(bgMusic, "pause", () => {
      if (!bgMusic.paused) return;
      wantsPlayback = false;
      operation++;
      setPlayingUI(false);
      stopViz();
      updateProgress();
      if (audioCtx) void audioCtx.suspend().catch(() => {});
      if (!failed) setHint(interrupted ? "音乐：已中断，点 ▶ 继续" : "音乐：已暂停");
    });
    on(bgMusic, "waiting", () => {
      if (!wantsPlayback) return;
      buffering = true;
      setHint("音乐：缓冲中…");
      stopViz();
    });
    on(bgMusic, "loadedmetadata", updateProgress);
    on(bgMusic, "durationchange", updateProgress);
    on(bgMusic, "timeupdate", updateProgress);
    on(bgMusic, "seeked", updateProgress);
    on(bgMusic, "ended", () => setTrack(idx + 1, true));
    on(bgMusic, "error", failPlayback);

    // Tilt reads its bounds once on entry, then coalesces pointer writes per frame.
    let tiltRAF = 0;
    let bounds = null;
    let pointerX = 0;
    let pointerY = 0;
    const canTilt = () => pageActive && !motionQuery.matches;
    const resetTilt = () => {
      cancelAnimationFrame(tiltRAF);
      tiltRAF = 0;
      bounds = null;
      tiltX = tiltY = 0;
      renderDockTransform();
    };
    on(dock, "pointerenter", e => {
      if (canTilt() && e.pointerType !== "touch") bounds = dock.getBoundingClientRect();
    }, { passive: true });
    on(dock, "pointermove", e => {
      if (!canTilt() || e.pointerType === "touch") return;
      if (!bounds) bounds = dock.getBoundingClientRect();
      pointerX = e.clientX;
      pointerY = e.clientY;
      if (tiltRAF) return;
      tiltRAF = requestAnimationFrame(() => {
        tiltRAF = 0;
        if (!bounds || !canTilt()) return;
        const px = clamp((pointerX - bounds.left) / bounds.width - 0.5, -0.5, 0.5);
        const py = clamp((pointerY - bounds.top) / bounds.height - 0.5, -0.5, 0.5);
        tiltX = -py * 10;
        tiltY = px * 12;
        renderDockTransform();
      });
    }, { passive: true });
    on(dock, "pointerleave", resetTilt);
    on(dock, "pointercancel", resetTilt);
    on(window, "blur", resetTilt);
    on(window, "resize", resetTilt, { passive: true });
    on(finePointerQuery, "change", resetTilt);
    on(motionQuery, "change", () => { stopViz(); resetTilt(); syncViz(); });
    on(document, "visibilitychange", () => {
      pageActive = !document.hidden;
      resetTilt();
      updateProgress();
      syncViz();
    });
    on(window, "pagehide", () => { pageActive = false; resetTilt(); stopViz(); });
    on(window, "pageshow", () => { pageActive = !document.hidden; updateProgress(); syncViz(); });

    setTrack(idx);
  };

  // ---------- init ----------
  const init = () => {
    // Links are in HTML so they are visible and usable before JavaScript runs.

    const moodBtns = moodButtons;
    for (let i = 0; i < moodBtns.length; i++) {
      const b = moodBtns[i];
      on(b, "click", () => setMood(b.dataset.moodBtn));
    }
    setMood(storage.getItem("mood"), false);
    createHearts();

    on($("#ideaBtn"), "click", () => {
      const it = pick(IDEAS);
      const ideaTitle = $("#ideaTitle");
      const ideaSub = $("#ideaSub");
      if (ideaTitle) ideaTitle.textContent = it.t;
      if (ideaSub) ideaSub.textContent = it.s;
      toast("💡 灵感已刷新");
    });

    on($("#copyLineBtn"), "click", async () => {
      const line = pick(OPENERS);
      if (await copyText(line)) toast("已复制：去发给TA");
    });

    const funTitle = $("#funTitle");
    const funSub = $("#funSub");
    let funState = { t: funTitle?.textContent || "", s: funSub?.textContent || "" };

    const setFun = (it) => {
      funState = it;
      if (funTitle) funTitle.textContent = it.t;
      if (funSub) funSub.textContent = it.s;
    };

    on($("#funQBtn"), "click", () => {
      setFun(pick(FUN_Q));
      toast("🎲 抽到了一个问题");
    });
    on($("#funCBtn"), "click", () => {
      setFun(pick(FUN_C));
      toast("🪄 任务已发放");
    });

    on($("#funCopyBtn"), "click", async () => {
      if (!funState.t) { toast("先抽一个问题或挑战吧"); return; }
      if (await copyText(`${funState.t}\n${funState.s}`)) toast("已复制：去发给TA");
    });

    createMusic();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
