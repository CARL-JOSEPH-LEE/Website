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
      layer.hidden = motionQuery.matches;
      layer.classList.toggle("is-paused", !pageActive);
      if (motionQuery.matches || !pageActive) return;

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
    on(motionQuery, "change", sync);
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
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.3;
          freq = new Uint8Array(analyser.frequencyBinCount);
          srcNode = audioCtx.createMediaElementSource(bgMusic);
          srcNode.connect(analyser);
          analyser.connect(audioCtx.destination);
        } catch {
          // If Web Audio is unavailable, the native player must still work.
          analyserUnavailable = true;
          analyser = null;
          freq = null;
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
    const restingLevels = bars.map(bar => Number.parseFloat(getComputedStyle(bar).getPropertyValue("--level")) || 0.2);
    const levels = Float32Array.from(restingLevels);
    const previousBars = new Array(bars.length).fill("");
    let vizRAF = 0;
    let lastFrame = 0;
    let lastProgress = 0;
    let previousProgress = "";
    let previousEnergy = "";
    let previousKick = "";
    let lastBeat = 0;
    let bassAverage = 0;
    let kick = 0;
    let tiltX = 0;
    let tiltY = 0;
    let previousDockTransform = "";
    const renderDockTransform = () => {
      const transform = tiltX || tiltY || kick
        ? `translateX(-50%) perspective(900px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) scale(${(1 + kick * 0.02).toFixed(4)})`
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

    const stopViz = () => {
      cancelAnimationFrame(vizRAF);
      vizRAF = 0;
      lastFrame = 0;
      kick = 0;
      bassAverage = 0;
      if (previousEnergy !== "0") toggleBtn.style.setProperty("--energy", "0");
      if (previousKick !== "0") toggleBtn.style.setProperty("--kick", "0");
      renderDockTransform();
      previousEnergy = previousKick = "0";
      for (let i = 0; i < bars.length; i++) {
        if (previousBars[i]) bars[i].style.removeProperty("transform");
        levels[i] = restingLevels[i];
        previousBars[i] = "";
      }
    };

    // Playback is user-initiated. Keep its local spectrum feedback available
    // with reduced motion, while disabling decorative motion and beat pulses.
    const canVisualize = () => pageActive && !bgMusic.paused && !bgMusic.ended && !buffering && audioCtx?.state === "running" && analyser && freq && bars.length;
    const draw = ts => {
      vizRAF = 0;
      if (!canVisualize()) { stopViz(); return; }
      vizRAF = requestAnimationFrame(draw);
      const elapsed = ts - lastFrame;
      const reducedMotion = motionQuery.matches;
      if (elapsed < (reducedMotion ? 66 : 32)) return; // About 15/30 spectrum updates/sec.
      lastFrame = ts;
      analyser.getByteFrequencyData(freq);
      const smoothing = 1 - Math.exp(-Math.min(elapsed, 100) / 160);

      let sum = 0;
      for (let i = 0; i < bars.length; i++) {
        const value = freq[Math.min(1 + i * 2, freq.length - 1)] / 255;
        sum += value;
        const target = reducedMotion ? 0.08 + value * 0.66 : 0.02 + value * 0.96;
        levels[i] = reducedMotion ? levels[i] + (target - levels[i]) * smoothing : target;
        const transform = `scaleY(${levels[i].toFixed(3)})`;
        if (transform !== previousBars[i]) {
          bars[i].style.transform = transform;
          previousBars[i] = transform;
        }
      }

      const energy = reducedMotion ? "0" : (sum / bars.length).toFixed(3);
      if (energy !== previousEnergy) {
        // Only the play button's glow consumes energy; keep updates local to it.
        toggleBtn.style.setProperty("--energy", energy);
        previousEnergy = energy;
      }
      let bass = 0;
      for (let i = 1; i <= 8; i++) bass += freq[i];
      bass /= 8 * 255;
      bassAverage += (bass - bassAverage) * 0.12;
      if (reducedMotion) {
        kick = 0;
      } else if (bass > 0.42 && bass > bassAverage * 1.12 && ts - lastBeat > 140) {
        kick = 1;
        lastBeat = ts;
      } else {
        kick *= Math.exp(-Math.min(elapsed, 100) / 110);
      }
      if (kick < 0.005) kick = 0;
      const pulse = kick ? kick.toFixed(3) : "0";
      if (pulse !== previousKick) {
        toggleBtn.style.setProperty("--kick", pulse);
        previousKick = pulse;
      }
      renderDockTransform();
      if (ts - lastProgress >= 100) {
        updateProgress();
        lastProgress = ts;
      }
    };

    const syncViz = () => {
      if (!canVisualize()) { stopViz(); return; }
      if (!vizRAF) vizRAF = requestAnimationFrame(draw);
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
      stopViz();
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
      stopViz();
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
    const canTilt = () => pageActive && finePointerQuery.matches && !motionQuery.matches;
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
