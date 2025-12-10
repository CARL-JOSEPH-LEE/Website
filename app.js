(() => {
  "use strict";

  // ---------- tiny utils ----------
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const on = (el, type, fn, opt) => el && el.addEventListener(type, fn, opt);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);

  const storage = (() => {
    try {
      const s = window.localStorage;
      const k = "__dj_test__";
      s.setItem(k, "1");
      s.removeItem(k);
      return s;
    } catch {
      return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    }
  })();

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

  window.addEventListener("error", (e) => {
    console.error(e.error || e.message);
    toast("脚本出错：打开控制台看看报错");
  });

  // ---------- data ----------
  const LINKS = [
    { title: "GitHub",  desc: "@CARL-JOSEPH-LEE", href: "https://github.com/CARL-JOSEPH-LEE", icon: "github.jpg",  badge: "GH" },
    { title: "Twitter", desc: "@CarlJosephLee1",  href: "https://twitter.com/CarlJosephLee1",  icon: "Twitter.jpg", badge: "X"  },
    { title: "洛谷",    desc: "算法 / 刷题",       href: "https://www.luogu.com.cn/user/1230548", icon: "lg.jpg", badge: "LG" },
    { title: "YouTube", desc: "@carljosephlee9537",href: "https://youtube.com/@carljosephlee9537", icon: "youtube.jpg", badge: "YT" },
    { title: "牛客",    desc: "竞赛 / 训练",       href: "https://ac.nowcoder.com/acm/contest/profile/473495180", icon: "nowcoder.png", badge: "NK" },
    { title: "osu",     desc: "硬核音游",          href: "https://osu.ppy.sh/users/32702900/fruits", icon: "osu.png", badge: "OS" },
    { title: "雀魂",    desc: "日麻/二次元",       href: "https://ikeda.sapk.ch/player/19922191/24", icon: "quehun.png", badge: "QH" },
    { title: "打字狗",  desc: "盲打/竞速",          href: "https://dazigo.vip/personal-page/results?id=1721167720648589313", icon: "dazigo.png", badge: "DZ" },
  ];

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

  // ---------- links render ----------
  const renderLinks = () => {
    const grid = $("#linksGrid");
    if (!grid) return;
    const frag = document.createDocumentFragment();

    for (let i = 0; i < LINKS.length; i++) {
      const l = LINKS[i];
      const a = document.createElement("a");
      a.className = "linkCard";
      a.href = l.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";

      const ico = document.createElement("div");
      ico.className = "ico";
      if (l.icon) {
        ico.style.backgroundImage = `url('${l.icon}')`;
      } else {
        const fallback = document.createElement("span");
        fallback.textContent = (l.badge || (l.title || "LINK").slice(0, 2)).toUpperCase();
        ico.appendChild(fallback);
      }

      const meta = document.createElement("div");
      meta.className = "linkMeta";
      meta.innerHTML = `<p class="t">${l.title}</p><p class="d">${l.desc}</p>`;

      a.append(ico, meta);
      frag.appendChild(a);
    }

    grid.innerHTML = "";
    grid.appendChild(frag);
  };

  // ---------- mood ----------
  const moodMsg = {
    sweet: "切到「甜 · 粉色」",
    cool:  "切到「酷 · 紫夜」",
    soft:  "切到「柔 · 蓝绿」",
  };

  const setMood = (m) => {
    document.body.dataset.mood = m;
    storage.setItem("mood", m);
    const btns = $$("[data-mood-btn]");
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      b.setAttribute("aria-pressed", String(b.dataset.moodBtn === m));
    }
    toast(moodMsg[m] || "切换主题");
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

  // ---------- falling hearts (lightweight) ----------
const createHearts = () => {
  // 尊重系统“减少动画”设置
  const prefersReducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (prefersReducedMotion) return;

  // 避免重复创建
  if (document.querySelector(".heartsLayer")) return;

  const layer = document.createElement("div");
  layer.className = "heartsLayer";
  document.body.appendChild(layer);

  const COUNT = 100; // 20~30 足够丰富；想更稳一点可以改成 18

  for (let i = 0; i < COUNT; i++) {
    const h = document.createElement("span");
    h.className = "heartDrop";
    h.textContent = "❤️"; // 如果想自己画，可以改成自定义符号/字符

    const left = rand(-5, 105);        // vw，偶尔超一点保证边缘有心
    const duration = rand(9, 18);      // s，下落时间
    const delay = rand(-18, 0);        // 负 delay：初始就有心在半空中
    const scale = rand(0.7, 1.3);      // 大小略有差异
    const opacity = rand(0.4, 0.9);

    h.style.left = left.toFixed(2) + "vw";
    h.style.animationDuration = duration.toFixed(2) + "s";
    h.style.animationDelay = delay.toFixed(2) + "s";
    h.style.setProperty("--scale", scale.toFixed(2));
    h.style.opacity = opacity.toFixed(2);

    layer.appendChild(h);
  }
};


  // ---------- music (EQ batch update) ----------
  const createMusic = () => {
    const bgMusic   = $("#bgMusic");
    const toggleBtn = $("#musicToggle");
    const nextBtn   = $("#nextTrack");
    const trackName = $("#trackName");
    const hint      = $("#musicHint");
    const progress  = $("#progress");
    const iconPlay  = $("#iconPlay");
    const iconPause = $("#iconPause");
    const dock      = $("#musicDock");
    const eqEl      = $("#eq");

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

    const setupAnalyser = async () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;

      if (audioCtx && analyser && freq) {
        if (audioCtx.state === "suspended") {
          try { await audioCtx.resume(); } catch {}
        }
        return;
      }

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

    // progress RAF
    let progRAF = 0;
    const updateProgress = () => {
      if (!progress) return;
      const d = bgMusic.duration;
      if (!d || !isFinite(d) || d <= 0) return;
      const pct = clamp(bgMusic.currentTime / d, 0, 1);
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

    // EQ RAF (batch write)
    let vizRAF = 0;
    const stopViz = () => {
      if (vizRAF) cancelAnimationFrame(vizRAF);
      vizRAF = 0;
      document.documentElement.style.setProperty("--energy", "0");
      setKick(0);
      if (eqEl) eqEl.style.cssText = "";
    };

    const startViz = () => {
      if (!analyser || !freq || !eqEl || vizRAF) return;

      const BARS = 32;
      const idxMap = new Uint8Array(BARS);
      for (let i = 0; i < BARS; i++) idxMap[i] = 1 + i * 2;

      let lastBeat = 0;
      let lastUpdate = 0;

      const loop = (ts) => {
        if (ts - lastUpdate < 33) {
          vizRAF = requestAnimationFrame(loop);
          return;
        }
        lastUpdate = ts;

        if (bgMusic.paused || !analyser) {
          vizRAF = 0;
          stopViz();
          return;
        }

        analyser.getByteFrequencyData(freq);

        let sum = 0;
        let css = "";
        const maxIdx = freq.length - 1;

        for (let i = 0; i < BARS; i++) {
          const fi = idxMap[i] > maxIdx ? maxIdx : idxMap[i];
          const v = freq[fi] / 255;
          sum += v;
          css += `--b${i}:${((2 + v * 96) | 0)}%;`;
        }

        eqEl.style.cssText = css;

        const energy = sum / BARS;
        document.documentElement.style.setProperty("--energy", energy.toFixed(3));

        const now = performance.now();
        if (energy > 0.45 && now - lastBeat > 80) {
          lastBeat = now;
          setKick(1);
          dock.classList.add("beat");
          setTimeout(() => {
            setKick(0);
            dock.classList.remove("beat");
          }, 60);
        }

        vizRAF = requestAnimationFrame(loop);
      };

      vizRAF = requestAnimationFrame(loop);
    };

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
      if (bgMusic.paused) {
        play();
      } else {
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
    on(bgMusic, "loadedmetadata", updateProgress);
    on(bgMusic, "timeupdate", updateProgress);
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

    // dock tilt
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

  // ---------- init ----------
  const init = () => {
    renderLinks();

    const moodBtns = $$("[data-mood-btn]");
    for (let i = 0; i < moodBtns.length; i++) {
      const b = moodBtns[i];
      on(b, "click", () => setMood(b.dataset.moodBtn));
    }
    setMood(storage.getItem("mood") || "sweet");
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

    on($("#funQBtn"), "click", () => {
      setFun(pick(FUN_Q));
      toast("🎲 抽到了一个问题");
    });
    on($("#funCBtn"), "click", () => {
      setFun(pick(FUN_C));
      toast("🪄 任务已发放");
    });

    on($("#funCopyBtn"), "click", async () => {
      await copyText(`${funState.t}\n${funState.s}`);
      toast("已复制：去发给TA");
    });

    createMusic();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
