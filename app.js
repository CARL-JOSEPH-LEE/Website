(() => {
  "use strict";
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const on = (el, type, fn, opt) => el && el.addEventListener(type, fn, opt);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const storage = (() => {
    try {
      const s = window.localStorage;
      const k = "__dj_test__";
      s.setItem(k, "1");
      s.removeItem(k);
      return s;
    } catch {
      return { 
        getItem: () => null, 
        setItem: () => {}, 
        removeItem: () => {} 
      };
    }
  })();
  const toastEl = $("#toast");
  let toastTimer = null;
  const toast = (msg) => {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
  };
  window.addEventListener("error", (e) => {
    console.error(e.error || e.message);
    toast("脚本出错：打开控制台看看报错");
  });
  const LINKS = [
    { title: "GitHub", desc: "@CARL-JOSEPH-LEE", href: "https://github.com/CARL-JOSEPH-LEE", icon: "github.jpg", badge: "GH" },
    { title: "Twitter", desc: "@CarlJosephLee1", href: "https://twitter.com/CarlJosephLee1", icon: "Twitter.jpg", badge: "X" },
    { title: "洛谷", desc: "算法 / 刷题", href: "https://www.luogu.com.cn/user/1230548", icon: "lg.jpg", badge: "LG" },
    { title: "YouTube", desc: "@carljosephlee9537", href: "https://youtube.com/@carljosephlee9537", icon: "youtube.jpg", badge: "YT" },
    { title: "牛客", desc: "竞赛 / 训练", href: "https://ac.nowcoder.com/acm/contest/profile/473495180", icon: "nowcoder.png", badge: "NK" },
    { title: "osu", desc: "硬核音游", href: "https://osu.ppy.sh/users/32702900/fruits", icon: "osu.png", badge: "OS" },
    { title: "雀魂", desc: "日麻/二次元", href: "https://ikeda.sapk.ch/player/19922191/24", icon: "quehun.png", badge: "QH" },
    { title: "打字狗", desc: "盲打/竞速", href: "https://dazigo.vip/personal-page/results?id=1721167720648589313", icon: "dazigo.png", badge: "DZ" },
  ];
  const renderLinks = () => {
    const grid = $("#linksGrid");
    if (!grid) return;
    grid.innerHTML = "";
    LINKS.forEach((l) => {
      const a = document.createElement("a");
      a.className = "linkCard";
      a.href = l.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      const ico = document.createElement("div");
      ico.className = "ico";
      if (l.icon) ico.style.backgroundImage = `url('${l.icon}')`;
      else {
        const fallback = document.createElement("span");
        fallback.textContent = (l.badge || (l.title || "LINK").slice(0, 2)).toUpperCase();
        ico.appendChild(fallback);
      }
      const meta = document.createElement("div");
      meta.className = "linkMeta";
      meta.innerHTML = `<p class="t">${l.title}</p><p class="d">${l.desc}</p>`;
      a.append(ico, meta);
      grid.appendChild(a);
    });
  };

  const moodMsg = { 
    sweet: "切到「甜 · 粉色」", 
    cool: "切到「酷 · 紫夜」", 
    soft: "切到「柔 · 蓝绿」" 
  };


  const setMood = (m) => {
    document.body.dataset.mood = m;
    storage.setItem("mood", m);
    $$("[data-mood-btn]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.moodBtn === m)));
    fx?.readPalette?.();
    toast(moodMsg[m] || "切换主题");
  };


  const fxCanvas = $("#fxCanvas");
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  const fx = (() => {
    if (!fxCanvas || prefersReducedMotion) return null;
    const ctx = fxCanvas.getContext("2d", { alpha: true });
    if (!ctx) return null;

    let W = 0, H = 0, DPR = 1;
    let palette = ["#ff9ac9", "#ff6fb1", "#ffd3f0"];

    const hexToRgb = (hex) => {
      const h = hex.replace("#", "").trim();
      if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 255, g: 255, b: 255 };
      return { 
        r: parseInt(h.slice(0, 2), 16), 
        g: parseInt(h.slice(2, 4), 16), 
        b: parseInt(h.slice(4, 6), 16) 
      };
    };

    const readPalette = () => {
      const s = getComputedStyle(document.body);
      const a1 = s.getPropertyValue("--a1").trim() || "#ff9ac9";
      const a2 = s.getPropertyValue("--a2").trim() || "#ff6fb1";
      const a3 = s.getPropertyValue("--a3").trim() || "#ffd3f0";
      palette = [a1, a2, a3];
    };

    const resize = () => {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth;
      H = window.innerHeight;
      fxCanvas.width = Math.floor(W * DPR);
      fxCanvas.height = Math.floor(H * DPR);
      fxCanvas.style.width = W + "px";
      fxCanvas.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };

    on(window, "resize", resize, { passive: true });
    resize();
    const P = [];
    const MAX = 300;
    const add = (p) => {
      P.push(p);
      if (P.length > MAX) P.splice(0, P.length - MAX);
    };

    let beatEnergy = 0;

    

    const heartPath = (c) => {
      c.beginPath();
      c.moveTo(0, -0.2);
      c.bezierCurveTo(0.9, -0.95, 1.95, 0.1, 0, 1.25);
      c.bezierCurveTo(-1.95, 0.1, -0.9, -0.95, 0, -0.2);
      c.closePath();
    };


    const drawHeart = (p) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.scale(p.size, p.size);
      ctx.globalAlpha = p.a;
      ctx.shadowColor = p.c;
      ctx.fillStyle = p.c;
      heartPath(ctx);
      ctx.fill();

      ctx.globalAlpha = p.a * 0.35;
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.scale(0.55, 0.55);
      heartPath(ctx);
      ctx.fill();

      ctx.restore();
    };


    const spawnHeart = (x, y, power = 1, vx = 0, vy = 0) => {
      const c = pick(palette);
      add({
        kind: "heart",
        x,
        y,
        vx: vx + rand(-26, 26) * power,
        vy: vy + rand(-52, -16) * power,
        g: rand(70, 150),
        r: rand(-1.2, 1.2),
        vr: rand(-3.2, 3.2),
        size: rand(3.8, 8.6) * power,
        t: 0,
        life: rand(0.85, 1.4),
        a: 1,
        c,
      });
    };

    const burst = (x, y, n = 16) => {
      for (let i = 0; i < n; i++) {
        spawnHeart(x + rand(-7, 7), y + rand(-7, 7), rand(0.9, 1.35));
      }
    };

    let down = false;
    let last = null;
    let lastMoveT = 0;

    on(window, "pointerdown", (e) => {
      down = true;
      last = { x: e.clientX, y: e.clientY };
      lastMoveT = performance.now();
      try { e.target?.setPointerCapture?.(e.pointerId); } catch {}
    }, { passive: true });

    const up = () => { down = false; last = null; };

    on(window, "pointerup", up, { passive: true });
    on(window, "pointercancel", up, { passive: true });
    on(window, "blur", up, { passive: true });

    on(window, "pointermove", (e) => {
      if (!down || !last) return;
      const x = e.clientX, y = e.clientY;
      const now = performance.now();
      const dtm = Math.max(1, now - lastMoveT);
      lastMoveT = now;

      const dx = x - last.x;
      const dy = y - last.y;
      const speed = Math.min(2.0, Math.hypot(dx, dy) / (10 + dtm * 0.25));

      const steps = Math.max(2, Math.floor(Math.hypot(dx, dy) / 9));
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const px = last.x + dx * t;
        const py = last.y + dy * t;
      }
      last = { x, y };
    }, { passive: true });

    let ambientAcc = 0;
    let lastBeatAt = 0;

    const setBeatEnergy = (v) => { };

    let lastT = performance.now();
    let isVisible = true;

    document.addEventListener('visibilitychange', () => {
      isVisible = !document.hidden;
    });

    const tick = (t) => {
      if (!isVisible) {
        requestAnimationFrame(tick);
        return;
      }
      
      const dt = Math.min(0.033, (t - lastT) / 1000);
      lastT = t;

      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(0, 0, W, H);

      ambientAcc += dt;
      const rate = document.body.classList.contains("is-playing") ? 20 : 10;
      while (ambientAcc > 1 / rate) {
        ambientAcc -= 1 / rate;
        add({
          kind: "heart",
          x: rand(0, W),
          y: rand(-50, -12),
          vx: rand(-12, 12),
          vy: rand(30, 78),
          g: rand(10, 28),
          r: rand(-0.7, 0.7),
          vr: rand(-1.2, 1.2),
          size: rand(8, 10),
          t: 0,
          life: rand(5.2, 10),
          a: rand(0.1, 0.2),
          aBase: rand(0.1, 0.2),
          c: pick(palette),
        });
      }

      ctx.globalCompositeOperation = "lighter";
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.t += dt;
        const u = p.t / p.life;
        if (u >= 1) { P.splice(i, 1); continue; }

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.g) p.vy += p.g * dt;
        if (p.vr) p.r += p.vr * dt;

        p.a = (p.aBase != null ? p.aBase : p.a) * (1 - u);
        p.a = clamp(p.a, 0, 1);

        if (p.kind === "heart") drawHeart(p);
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
    return { readPalette, burst, setBeatEnergy };
  })();

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      prompt("复制这段：", text);
      return false;
    }
  };

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
    const barEl = dock?.querySelector?.(".bar");

    if (!bgMusic || !toggleBtn || !dock) return;

    const TOTAL_TRACKS = 11;

    const readIndex = () => {
      const raw = storage.getItem("trackIndex");
      const n = parseInt(raw || "", 10);
      return Number.isFinite(n) && n >= 1 && n <= TOTAL_TRACKS ? n : 1;
    };

    let idx = readIndex();

    bgMusic.preload = "metadata";
    bgMusic.crossOrigin = "anonymous";

    const setIcons = (playing) => {
      if (!iconPlay || !iconPause) return;
      iconPlay.style.display = playing ? "none" : "block";
      iconPause.style.display = playing ? "block" : "none";
    };

    const setPlayingUI = (playing) => {
      document.body.classList.toggle("is-playing", playing);
      dock.classList.toggle("playing", playing);
    };

    const setKick = (v) => dock.style.setProperty("--kick", String(v));

    let audioCtx = null;
    let analyser = null;
    let freq = null;
    let srcNode = null;
    let vizRAF = null;

    const setupAnalyser = async () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (audioCtx && analyser && freq) return;

      audioCtx = new Ctx();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      freq = new Uint8Array(analyser.frequencyBinCount);

      if (!srcNode) {
        srcNode = audioCtx.createMediaElementSource(bgMusic);
        srcNode.connect(analyser);
        analyser.connect(audioCtx.destination);
      }

      if (audioCtx.state === "suspended") {
        try { await audioCtx.resume(); } catch {}
      }
    };

    const stopViz = () => {
      if (vizRAF) cancelAnimationFrame(vizRAF);
      vizRAF = null;
      document.documentElement.style.setProperty("--energy", "0");
      fx?.setBeatEnergy?.(0);
      setKick(0);
    };

    const startViz = () => {
      if (!analyser || !freq || !eqEl || vizRAF) return;

      let lastBeat = 0;
      let lastUpdate = 0;

      const loop = (timestamp) => {
        if (timestamp - lastUpdate < 33) {
          vizRAF = requestAnimationFrame(loop);
          return;
        }
        lastUpdate = timestamp;

        if (bgMusic.paused || !analyser) { vizRAF = null; stopViz(); return; }

        analyser.getByteFrequencyData(freq);

        const b = (i) => freq[Math.min(freq.length - 1, i)] / 255;
        const v0 = b(1), v1 = b(3), v2 = b(5), v3 = b(7), v4 = b(9);
        const v5 = b(11), v6 = b(13), v7 = b(15), v8 = b(17), v9 = b(19);
        const v10 = b(21), v11 = b(23), v12 = b(25), v13 = b(27), v14 = b(29);
        const v15 = b(31), v16 = b(33), v17 = b(35), v18 = b(37), v19 = b(39);
        const v20 = b(41), v21 = b(43), v22 = b(45), v23 = b(47);
        const v24 = b(49), v25 = b(51), v26 = b(53), v27 = b(55), v28 = b(57);
        const v29 = b(59), v30 = b(61), v31 = b(63);

        eqEl.style.setProperty("--b0", `${Math.round(2 + v0 * 96)}%`);
        eqEl.style.setProperty("--b1", `${Math.round(2 + v1 * 96)}%`);
        eqEl.style.setProperty("--b2", `${Math.round(2 + v2 * 96)}%`);
        eqEl.style.setProperty("--b3", `${Math.round(2 + v3 * 96)}%`);
        eqEl.style.setProperty("--b4", `${Math.round(2 + v4 * 96)}%`);
        eqEl.style.setProperty("--b5", `${Math.round(2 + v5 * 96)}%`);
        eqEl.style.setProperty("--b6", `${Math.round(2 + v6 * 96)}%`);
        eqEl.style.setProperty("--b7", `${Math.round(2 + v7 * 96)}%`);
        eqEl.style.setProperty("--b8", `${Math.round(2 + v8 * 96)}%`);
        eqEl.style.setProperty("--b9", `${Math.round(2 + v9 * 96)}%`);
        eqEl.style.setProperty("--b10", `${Math.round(2 + v10 * 96)}%`);
        eqEl.style.setProperty("--b11", `${Math.round(2 + v11 * 96)}%`);
        eqEl.style.setProperty("--b12", `${Math.round(2 + v12 * 96)}%`);
        eqEl.style.setProperty("--b13", `${Math.round(2 + v13 * 96)}%`);
        eqEl.style.setProperty("--b14", `${Math.round(2 + v14 * 96)}%`);
        eqEl.style.setProperty("--b15", `${Math.round(2 + v15 * 96)}%`);
        eqEl.style.setProperty("--b16", `${Math.round(2 + v16 * 96)}%`);
        eqEl.style.setProperty("--b17", `${Math.round(2 + v17 * 96)}%`);
        eqEl.style.setProperty("--b18", `${Math.round(2 + v18 * 96)}%`);
        eqEl.style.setProperty("--b19", `${Math.round(2 + v19 * 96)}%`);
        eqEl.style.setProperty("--b20", `${Math.round(2 + v20 * 96)}%`);
        eqEl.style.setProperty("--b21", `${Math.round(2 + v21 * 96)}%`);
        eqEl.style.setProperty("--b22", `${Math.round(2 + v22 * 96)}%`);
        eqEl.style.setProperty("--b23", `${Math.round(2 + v23 * 96)}%`);
        eqEl.style.setProperty("--b24", `${Math.round(2 + v24 * 96)}%`);
        eqEl.style.setProperty("--b25", `${Math.round(2 + v25 * 96)}%`);
        eqEl.style.setProperty("--b26", `${Math.round(2 + v26 * 96)}%`);
        eqEl.style.setProperty("--b27", `${Math.round(2 + v27 * 96)}%`);
        eqEl.style.setProperty("--b28", `${Math.round(2 + v28 * 96)}%`);
        eqEl.style.setProperty("--b29", `${Math.round(2 + v29 * 96)}%`);
        eqEl.style.setProperty("--b30", `${Math.round(2 + v30 * 96)}%`);
        eqEl.style.setProperty("--b31", `${Math.round(2 + v31 * 96)}%`);

        const energy = (v0 + v1 + v2 + v3 + v4 + v5 + v6 + v7 + v8 + v9 + 
                      v10 + v11 + v12 + v13 + v14 + v15 + v16 + v17 + v18 + v19 +
                      v20 + v21 + v22 + v23 + v24 + v25 + v26 + v27 + v28 + v29 +
                      v30 + v31) / 32;
        
        document.documentElement.style.setProperty("--energy", energy.toFixed(3));
        fx?.setBeatEnergy?.(energy);

        const now = performance.now();
        if (energy > 0.45 && now - lastBeat > 80) {
          lastBeat = now;
          setKick(1);
          dock.classList.add("beat");
          setTimeout(() => { setKick(0); dock.classList.remove("beat"); }, 60);
        }

        vizRAF = requestAnimationFrame(loop);
      };

      vizRAF = requestAnimationFrame(loop);
    };

    let progRAF = 0;
    const updateProgress = () => {
      if (!progress) return;
      if (!bgMusic.duration || !isFinite(bgMusic.duration) || bgMusic.duration <= 0) return;
      const pct = clamp(bgMusic.currentTime / bgMusic.duration, 0, 1);
      progress.style.width = (pct * 100).toFixed(2) + "%";
    };

    const startProgressRAF = () => {
      cancelAnimationFrame(progRAF);
      const loop = () => {
        if (!bgMusic.paused) {
          updateProgress();
          progRAF = requestAnimationFrame(loop);
        }
      };
      progRAF = requestAnimationFrame(loop);
    };

    const stopProgressRAF = () => cancelAnimationFrame(progRAF);

    const setTrack = (i, autoplay = false) => {
      const ii = parseInt(String(i), 10);
      const safeI = Number.isFinite(ii) ? ii : 1;

      idx = ((safeI - 1 + TOTAL_TRACKS) % TOTAL_TRACKS) + 1;
      storage.setItem("trackIndex", String(idx));

      bgMusic.src = `${idx}.mp3`;
      bgMusic.load();

      if (trackName) trackName.textContent = `第 ${idx} 首`;
      if (hint) hint.textContent = autoplay ? "音乐：加载中…" : "音乐：点 ▶ 开始";

      if (!autoplay) {
        bgMusic.pause();
        setIcons(false);
        setPlayingUI(false);
        stopViz();
        stopProgressRAF();
        if (progress) progress.style.width = "0%";
      } else {
        play();
      }
    };

    const play = async () => {
      try {
        if (!bgMusic.src) setTrack(idx, false);
        await setupAnalyser();

        if (hint) hint.textContent = "音乐：加载中…";
        bgMusic.volume = 0.9;

        await bgMusic.play();

        setIcons(true);
        setPlayingUI(true);
        if (hint) hint.textContent = "音乐：正在播放";
        startViz();
        startProgressRAF();

        fx?.burst?.(window.innerWidth * 0.5, window.innerHeight * 0.78, 20);
      } catch (err) {
        console.error(err);
        setIcons(false);
        setPlayingUI(false);
        stopViz();
        stopProgressRAF();
        const name = err?.name || "PlayError";
        toast(`播放失败（${name}）：检查是否存在 ${idx}.mp3`);
        if (hint) hint.textContent = "音乐：播放失败（检查 mp3 文件）";
      }
    };

    on(toggleBtn, "click", () => {
      if (bgMusic.paused) play();
      else {
        bgMusic.pause();
        setIcons(false);
        setPlayingUI(false);
        stopViz();
        stopProgressRAF();
        if (hint) hint.textContent = "音乐：已暂停";
      }
    });

    on(nextBtn, "click", () => {
      setTrack(idx + 1, true);
      toast("🎧 下一首");
    });

    on(bgMusic, "waiting", () => hint && (hint.textContent = "音乐：缓冲中…"));
    on(bgMusic, "canplay", () => !bgMusic.paused && hint && (hint.textContent = "音乐：正在播放"));
    on(bgMusic, "loadedmetadata", () => updateProgress());
    on(bgMusic, "timeupdate", () => updateProgress());

    on(bgMusic, "ended", () => setTrack(idx + 1, true));

    on(bgMusic, "error", () => {
      const code = bgMusic.error?.code;
      toast(`音频加载失败（code=${code ?? "?"}）：请确认 ${idx}.mp3 在同目录`);
      if (hint) hint.textContent = "音乐：加载失败（找不到 mp3？）";
      setIcons(false);
      setPlayingUI(false);
      stopViz();
      stopProgressRAF();
    });

    on(barEl, "click", (e) => {
      if (!bgMusic.duration || !isFinite(bgMusic.duration)) return;
      const r = barEl.getBoundingClientRect();
      const pct = clamp((e.clientX - r.left) / r.width, 0, 1);
      bgMusic.currentTime = pct * bgMusic.duration;
      updateProgress();
      fx?.burst?.(e.clientX, r.top, 12);
    });

    on(dock, "pointermove", (e) => {
      const r = dock.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      dock.style.setProperty("--tiltX", `${(-py * 10).toFixed(2)}deg`);
      dock.style.setProperty("--tiltY", `${(px * 12).toFixed(2)}deg`);
    });

    const resetTilt = () => {
      dock.style.setProperty("--tiltX", "0deg");
      dock.style.setProperty("--tiltY", "0deg");
    };
    on(dock, "pointerleave", resetTilt);
    on(window, "blur", resetTilt);

    setTrack(idx, false);
  };

  const init = () => {
    renderLinks();

    $$("[data-mood-btn]").forEach((b) => on(b, "click", () => setMood(b.dataset.moodBtn)));
    setMood(storage.getItem("mood") || "sweet");

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
      await copyText(line);
      toast("已复制：去发给TA");
    });

    const funTitle = $("#funTitle");
    const funSub = $("#funSub");
    let funState = { t: funTitle?.textContent || "", s: funSub?.textContent || "" };

    const setFun = (it) => {
      funState = it;
      if (funTitle) funTitle.textContent = it.t;
      if (funSub) funSub.textContent = it.s;
    };

    on($("#funQBtn"), "click", () => { setFun(pick(FUN_Q)); toast("🎲 抽到了一个问题");});
    on($("#funCBtn"), "click", () => { setFun(pick(FUN_C)); toast("🪄 任务已发放");});

    on($("#funCopyBtn"), "click", async () => {
      await copyText(`${funState.t}\n${funState.s}`);
      toast("已复制：去发给TA");
    });

    createMusic();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();