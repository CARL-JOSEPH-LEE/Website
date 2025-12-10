(() => {
  "use strict";

  /* ------------------------------
   * Utils 工具函数
   * ------------------------------ */
  
  // DOM查询简化函数
  const $ = (s, p = document) => p.querySelector(s);           // 查询单个元素
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s)); // 查询多个元素
  
  // 事件绑定简化函数
  const on = (el, type, fn, opt) => el && el.addEventListener(type, fn, opt);
  
  // 从数组中随机选择一个元素
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  
  // 限制数值在指定范围内
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  
  // 生成指定范围内的随机数
  const rand = (a, b) => a + Math.random() * (b - a);

  // ✅ localStorage 兜底（避免某些环境直接报错导致播放器/事件失效）
  const storage = (() => {
    try {
      const s = window.localStorage;     // 获取localStorage对象
      const k = "__dj_test__";          // 测试键名
      s.setItem(k, "1");               // 设置测试值
      s.removeItem(k);                  // 移除测试值
      return s;                         // 返回可用的localStorage对象
    } catch {
      // 如果localStorage不可用，返回空实现
      return { 
        getItem: () => null, 
        setItem: () => {}, 
        removeItem: () => {} 
      };
    }
  })();

  /* ------------------------------
   * Toast 提示消息
   * ------------------------------ */
  
  const toastEl = $("#toast");      // 获取提示元素
  let toastTimer = null;             // 提示定时器
  
  // 显示提示消息函数
  const toast = (msg) => {
    if (!toastEl) return;            // 如果没有提示元素则返回
    toastEl.textContent = msg;       // 设置提示文本
    toastEl.classList.add("show");   // 显示提示
    clearTimeout(toastTimer);        // 清除之前的定时器
    // 1.6秒后隐藏提示
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
  };

  // 全局错误处理
  window.addEventListener("error", (e) => {
    console.error(e.error || e.message);  // 输出错误到控制台
    toast("脚本出错：打开控制台看看报错");   // 显示错误提示
  });

  /* ------------------------------
   * Links 链接配置
   * ------------------------------ */
  
  // 链接数据数组
  const LINKS = [
    // GitHub链接
    { title: "GitHub", desc: "@CARL-JOSEPH-LEE", href: "https://github.com/CARL-JOSEPH-LEE", icon: "github.jpg", badge: "GH" },
    // Twitter链接
    { title: "Twitter", desc: "@CarlJosephLee1", href: "https://twitter.com/CarlJosephLee1", icon: "Twitter.jpg", badge: "X" },
    // 洛谷链接
    { title: "洛谷", desc: "算法 / 刷题", href: "https://www.luogu.com.cn/user/1230548", icon: "lg.jpg", badge: "LG" },
    // YouTube链接
    { title: "YouTube", desc: "@carljosephlee9537", href: "https://youtube.com/@carljosephlee9537", icon: "youtube.jpg", badge: "YT" },
    // 牛客链接
    { title: "牛客", desc: "竞赛 / 训练", href: "https://ac.nowcoder.com/acm/contest/profile/473495180", icon: "nowcoder.png", badge: "NK" },
    // osu链接
    { title: "osu", desc: "硬核音游", href: "https://osu.ppy.sh/users/32702900/fruits", icon: "osu.png", badge: "OS" },
    // 雀魂牌谱屋链接
    { title: "雀魂", desc: "日麻/二次元", href: "https://ikeda.sapk.ch/player/19922191/24", icon: "quehun.png", badge: "QH" },
    // 打字狗链接
    { title: "打字狗", desc: "盲打/竞速", href: "https://dazigo.vip/personal-page/results?id=1721167720648589313", icon: "dazigo.png", badge: "DZ" },
  ];

  // 渲染链接函数
  const renderLinks = () => {
    const grid = $("#linksGrid");    // 获取链接容器
    if (!grid) return;               // 如果没有容器则返回
    grid.innerHTML = "";             // 清空容器内容
    
    // 遍历链接数据创建链接元素
    LINKS.forEach((l) => {
      // 创建链接元素
      const a = document.createElement("a");
      a.className = "linkCard";      // 设置类名
      a.href = l.href;               // 设置链接地址
      a.target = "_blank";           // 在新窗口打开
      a.rel = "noopener noreferrer"; // 安全属性

      // 创建图标元素
      const ico = document.createElement("div");
      ico.className = "ico";
      // 如果有图标则设置背景图，否则使用文字
      if (l.icon) ico.style.backgroundImage = `url('${l.icon}')`;
      else {
        const fallback = document.createElement("span");
        fallback.textContent = (l.badge || (l.title || "LINK").slice(0, 2)).toUpperCase();
        ico.appendChild(fallback);
      }

      // 创建描述元素
      const meta = document.createElement("div");
      meta.className = "linkMeta";
      meta.innerHTML = `<p class="t">${l.title}</p><p class="d">${l.desc}</p>`;

      // 添加元素到链接
      a.append(ico, meta);
      // 添加链接到容器
      grid.appendChild(a);
    });
  };

  /* ------------------------------
   * Mood 主题切换
   * ------------------------------ */
  
  // 主题切换提示消息
  const moodMsg = { 
    sweet: "切到「甜 · 粉色」", 
    cool: "切到「酷 · 紫夜」", 
    soft: "切到「柔 · 蓝绿」" 
  };

  // 设置主题函数
  const setMood = (m) => {
    document.body.dataset.mood = m;                    // 设置body的主题属性
    storage.setItem("mood", m);                        // 保存主题设置到localStorage
    // 更新所有主题按钮的选中状态
    $$("[data-mood-btn]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.moodBtn === m)));
    fx?.readPalette?.();                               // 更新特效调色板
    toast(moodMsg[m] || "切换主题");                   // 显示提示消息
  };

  /* ------------------------------
   * ✅ FX Canvas：流光背景 + 爱心雨 + 拖动喷射 + 节拍炸裂
   * ------------------------------ */
  
  const fxCanvas = $("#fxCanvas");                                   // 获取canvas元素
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  const fx = (() => {
    // 如果没有canvas或用户偏好减少动画则返回null
    if (!fxCanvas || prefersReducedMotion) return null;
    const ctx = fxCanvas.getContext("2d", { alpha: true });         // 获取2D绘图上下文
    if (!ctx) return null;

    // canvas尺寸和设备像素比相关变量
    let W = 0, H = 0, DPR = 1;                                      // 宽度、高度、设备像素比
    let palette = ["#ff9ac9", "#ff6fb1", "#ffd3f0"];              // 默认调色板

    // 将十六进制颜色转换为RGB对象
    const hexToRgb = (hex) => {
      const h = hex.replace("#", "").trim();                       // 移除#号
      // 检查是否为有效的十六进制颜色
      if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 255, g: 255, b: 255 };
      // 解析RGB值
      return { 
        r: parseInt(h.slice(0, 2), 16), 
        g: parseInt(h.slice(2, 4), 16), 
        b: parseInt(h.slice(4, 6), 16) 
      };
    };

    // 从CSS变量读取当前主题调色板
    const readPalette = () => {
      const s = getComputedStyle(document.body);                    // 获取计算后的样式
      const a1 = s.getPropertyValue("--a1").trim() || "#ff9ac9";   // 主题色1
      const a2 = s.getPropertyValue("--a2").trim() || "#ff6fb1";   // 主题色2
      const a3 = s.getPropertyValue("--a3").trim() || "#ffd3f0";   // 主题色3
      palette = [a1, a2, a3];                                       // 更新调色板
    };

    // 调整canvas尺寸以适配不同设备
    const resize = () => {
      DPR = Math.min(2, window.devicePixelRatio || 1);              // 设备像素比最大为2
      W = window.innerWidth;                                        // 获取窗口宽度
      H = window.innerHeight;                                       // 获取窗口高度
      fxCanvas.width = Math.floor(W * DPR);                         // 设置canvas宽度
      fxCanvas.height = Math.floor(H * DPR);                        // 设置canvas高度
      fxCanvas.style.width = W + "px";                             // 设置显示宽度
      fxCanvas.style.height = H + "px";                            // 设置显示高度
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);                       // 设置绘图变换
      readPalette();                                                // 重新读取调色板
    };

    // 监听窗口大小变化
    on(window, "resize", resize, { passive: true });
    resize();                                                       // 初始化尺寸

    // ---- particles 粒子系统
    const P = [];                          // 粒子数组
    const MAX = 1200;                      // 最大粒子数
    // 添加粒子函数
    const add = (p) => {
      P.push(p);
      // 如果超过最大数量，则删除多余的粒子
      if (P.length > MAX) P.splice(0, P.length - MAX);
    };

    // ---- aurora blobs (background flowing light) 流光背景
    let beatEnergy = 0;                    // 节拍能量值
    // 创建3个流光斑点
    const blobs = Array.from({ length: 3 }, (_, i) => ({
      x: rand(0, W),                       // X坐标
      y: rand(0, H),                       // Y坐标
      vx: rand(-18, 18),                   // X方向速度
      vy: rand(-12, 12),                   // Y方向速度
      r: rand(240, 420),                   // 半径
      p: i * 2.1,                          // 相位
    }));

    // 绘制流光背景
    const drawAurora = (dt, t) => {
      // 不依赖 CSS color-mix：直接把主题色转成 rgba 画“流光”
      const cols = palette.map(hexToRgb);   // 将调色板转换为RGB
      const energy = clamp(beatEnergy, 0, 1); // 限制能量值在0-1之间

      ctx.save();
      ctx.globalCompositeOperation = "screen";  // 设置混合模式
      ctx.globalAlpha = 0.10 + energy * 0.22;   // 根据能量调整透明度
      ctx.filter = "blur(42px) saturate(1.25)"; // 设置模糊和饱和度

      // 绘制每个流光斑点
      blobs.forEach((b, i) => {
        // 更新相位和位置
        b.p += dt * (0.4 + energy * 0.9);
        b.x += b.vx * dt * (0.8 + energy * 1.4);
        b.y += b.vy * dt * (0.8 + energy * 1.4);

        // 轻微“呼吸漂移”
        b.x += Math.sin(t * 0.0006 + b.p) * (0.8 + energy * 1.6);
        b.y += Math.cos(t * 0.0005 + b.p) * (0.8 + energy * 1.6);

        // 边界处理：超出边界则从另一边出现
        if (b.x < -b.r) b.x = W + b.r;
        if (b.x > W + b.r) b.x = -b.r;
        if (b.y < -b.r) b.y = H + b.r;
        if (b.y > H + b.r) b.y = -b.r;

        // 创建径向渐变
        const c = cols[i % cols.length];
        const r = b.r * (0.95 + energy * 0.28);
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
        g.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${0.55 + energy * 0.35})`);
        g.addColorStop(0.45, `rgba(${c.r},${c.g},${c.b},${0.18 + energy * 0.22})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);
      });

      ctx.restore();
    };

    // ---- hearts & sparks 爱心和火花效果
    
    // 绘制爱心路径
    const heartPath = (c) => {
      c.beginPath();
      c.moveTo(0, -0.2);
      // 使用贝塞尔曲线绘制爱心形状
      c.bezierCurveTo(0.9, -0.95, 1.95, 0.1, 0, 1.25);
      c.bezierCurveTo(-1.95, 0.1, -0.9, -0.95, 0, -0.2);
      c.closePath();
    };

    // 绘制爱心粒子
    const drawHeart = (p) => {
      ctx.save();
      ctx.translate(p.x, p.y);      // 移动到指定位置
      ctx.rotate(p.r);              // 旋转
      ctx.scale(p.size, p.size);    // 缩放

      // 绘制爱心主体
      ctx.globalAlpha = p.a;        // 设置透明度
      ctx.shadowBlur = 18;          // 设置阴影模糊
      ctx.shadowColor = p.c;        // 设置阴影颜色
      ctx.fillStyle = p.c;          // 设置填充颜色
      heartPath(ctx);
      ctx.fill();

      // 绘制内部高光
      ctx.globalAlpha = p.a * 0.35; // 更低的透明度
      ctx.shadowBlur = 0;           // 无阴影
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.scale(0.55, 0.55);        // 缩小
      heartPath(ctx);
      ctx.fill();

      ctx.restore();
    };

    // 生成爱心粒子
    const spawnHeart = (x, y, power = 1, vx = 0, vy = 0) => {
      const c = pick(palette);      // 随机选择颜色
      add({
        kind: "heart",              // 类型
        x,                          // X坐标
        y,                          // Y坐标
        vx: vx + rand(-26, 26) * power,  // X方向速度
        vy: vy + rand(-52, -16) * power, // Y方向速度
        g: rand(70, 150),           // 重力
        r: rand(-1.2, 1.2),         // 旋转角度
        vr: rand(-3.2, 3.2),        // 旋转速度
        size: rand(3.8, 8.6) * power, // 大小
        t: 0,                       // 时间
        life: rand(0.85, 1.4),      // 生命周期
        a: 1,                       // 透明度
        c,                          // 颜色
      });
    };

    // 爆炸效果：在指定位置生成多个爱心
    const burst = (x, y, n = 16) => {
      for (let i = 0; i < n; i++) {
        spawnHeart(x + rand(-7, 7), y + rand(-7, 7), rand(0.9, 1.35));
      }
    };

    // pointer trail 指针轨迹效果
    let down = false;          // 鼠标是否按下
    let last = null;           // 上一次指针位置
    let lastMoveT = 0;         // 上一次移动时间

    // 指针按下事件处理
    on(window, "pointerdown", (e) => {
      down = true;
      last = { x: e.clientX, y: e.clientY };  // 记录当前位置
      lastMoveT = performance.now();          // 记录当前时间
      // burst(e.clientX, e.clientY, 18);
      try { e.target?.setPointerCapture?.(e.pointerId); } catch {}
    }, { passive: true });

    // 指针释放函数
    const up = () => { down = false; last = null; };
    
    // 各种指针释放事件
    on(window, "pointerup", up, { passive: true });
    on(window, "pointercancel", up, { passive: true });
    on(window, "blur", up, { passive: true });

    // 指针移动事件处理
    on(window, "pointermove", (e) => {
      if (!down || !last) return;             // 如果未按下或无起始位置则返回
      const x = e.clientX, y = e.clientY;     // 当前位置
      const now = performance.now();          // 当前时间
      const dtm = Math.max(1, now - lastMoveT); // 时间差
      lastMoveT = now;

      // 计算移动距离和速度
      const dx = x - last.x;
      const dy = y - last.y;
      const speed = Math.min(2.0, Math.hypot(dx, dy) / (10 + dtm * 0.25));

      // 计算插值步数
      const steps = Math.max(2, Math.floor(Math.hypot(dx, dy) / 9));
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const px = last.x + dx * t;  // 插值X坐标
        const py = last.y + dy * t;  // 插值Y坐标
        // spawnHeart(px, py, 1.0 + speed * 0.9, dx * 2.6, dy * 2.6);
      }
      last = { x, y };  // 更新位置
    }, { passive: true });

    // ambient 环境粒子
    let ambientAcc = 0;         // 环境粒子累计时间
    let lastBeatAt = 0;         // 上次节拍时间

    // 设置节拍能量值
    const setBeatEnergy = (v) => { beatEnergy = v; };

    let lastT = performance.now();  // 上次更新时间
    
    // 动画主循环
    const tick = (t) => {
      const dt = Math.min(0.033, (t - lastT) / 1000);  // 计算时间差
      lastT = t;

      // fade old pixels (doesn't darken page) 淡化旧像素
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(0, 0, W, H);

      // background aurora 绘制流光背景
      drawAurora(dt, t);

      // ambient hearts - 增加飘落数量
      ambientAcc += dt;
      // 根据播放状态调整生成速率
      const rate = document.body.classList.contains("is-playing") ? 20 : 10; // 增加频率
      while (ambientAcc > 1 / rate) {
        ambientAcc -= 1 / rate;
        // 添加新的环境爱心粒子
        add({
          kind: "heart",           // 类型
          x: rand(0, W),           // 随机X坐标
          y: rand(-50, -12),        // Y坐标在屏幕上方
          vx: rand(-12, 12),        // X方向速度
          vy: rand(30, 78),         // Y方向速度（向下）
          g: rand(10, 28),          // 重力
          r: rand(-0.7, 0.7),       // 旋转角度
          vr: rand(-1.2, 1.2),      // 旋转速度
          size: rand(3.0, 6.2),     // 大小
          t: 0,                     // 时间
          life: rand(10, 20),       // 生命周期
          a: rand(0.22, 0.55),      // 透明度
          aBase: rand(0.22, 0.55),  // 基础透明度
          c: pick(palette),         // 颜色
        });
      }

      // draw particles 绘制所有粒子
      ctx.globalCompositeOperation = "lighter";
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.t += dt;                // 更新粒子时间
        const u = p.t / p.life;   // 计算生命周期比例
        if (u >= 1) { P.splice(i, 1); continue; }  // 生命周期结束则移除

        // 更新粒子位置
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.g) p.vy += p.g * dt;  // 应用重力
        if (p.vr) p.r += p.vr * dt; // 应用旋转

        // 更新透明度
        p.a = (p.aBase != null ? p.aBase : p.a) * (1 - u);
        p.a = clamp(p.a, 0, 1);

        // 绘制爱心粒子
        if (p.kind === "heart") drawHeart(p);
      }

      requestAnimationFrame(tick);  // 请求下一帧动画
    };

    requestAnimationFrame(tick);    // 启动动画循环
    return { readPalette, burst, setBeatEnergy };  // 返回公共方法
  })();

  /* ------------------------------
   * Clipboard 剪贴板操作
   * ------------------------------ */
  
  // 复制文本到剪贴板
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);  // 尝试使用现代API
      return true;
    } catch {
      // 如果现代API失败，则使用传统提示方式
      prompt("复制这段：", text);
      return false;
    }
  };

  /* ------------------------------
   * Ideas / Openers / Fun
   * ------------------------------ */
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

  /* ------------------------------
   * ✅ Music (更夸张：能量驱动 + 进度丝滑 + 3D 倾斜 + beat 抖动)
   * ------------------------------ */
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

    // audio element tuning
    bgMusic.preload = "metadata"; // 让 duration 更快可用（解决“进度条像卡住”）
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

    // WebAudio analyser (real spectrum)
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
      analyser.smoothingTimeConstant = 0.82;
      freq = new Uint8Array(analyser.frequencyBinCount);

      // createMediaElementSource only once per element
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
      if (eqEl) {
        eqEl.style.setProperty("--b0", "18%");
        eqEl.style.setProperty("--b1", "26%");
        eqEl.style.setProperty("--b2", "36%");
        eqEl.style.setProperty("--b3", "22%");
        eqEl.style.setProperty("--b4", "16%");
      }
      document.documentElement.style.setProperty("--energy", "0");
      fx?.setBeatEnergy?.(0);
      setKick(0);
    };

    const startViz = () => {
      if (!analyser || !freq || !eqEl || vizRAF) return;

      let lastBeat = 0;

      const loop = () => {
        if (bgMusic.paused || !analyser) { vizRAF = null; stopViz(); return; }

        analyser.getByteFrequencyData(freq);

        // 使用更多频段，提高灵敏度
        const b = (i) => freq[Math.min(freq.length - 1, i)] / 255;
        const v0 = b(1), v1 = b(3), v2 = b(5), v3 = b(7), v4 = b(9);
        const v5 = b(11), v6 = b(13), v7 = b(15), v8 = b(17), v9 = b(19);
        const v10 = b(21), v11 = b(23), v12 = b(25), v13 = b(27), v14 = b(29);
        const v15 = b(31), v16 = b(33), v17 = b(35), v18 = b(37), v19 = b(39);
        const v20 = b(41), v21 = b(43), v22 = b(45), v23 = b(47);
        const v24 = b(49), v25 = b(51), v26 = b(53), v27 = b(55), v28 = b(57);
        const v29 = b(59), v30 = b(61), v31 = b(63);

        // 大幅增加跳动幅度（从2%到98%的变化范围）
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

        // 计算整体能量值，用于视觉效果
        const energy = (v0 + v1 + v2 + v3 + v4 + v5 + v6 + v7 + v8 + v9 + 
                      v10 + v11 + v12 + v13 + v14 + v15 + v16 + v17 + v18 + v19 +
                      v20 + v21 + v22 + v23 + v24 + v25 + v26 + v27 + v28 + v29 +
                      v30 + v31) / 32;
        
        document.documentElement.style.setProperty("--energy", energy.toFixed(3));
        fx?.setBeatEnergy?.(energy);

        // 节拍检测和视觉反馈
        const now = performance.now();
        if (energy > 0.45 && now - lastBeat > 80) { // 降低节拍检测阈值，提高灵敏度
          lastBeat = now;
          setKick(1);
          dock.classList.add("beat");
          setTimeout(() => { setKick(0); dock.classList.remove("beat"); }, 60); // 缩短动画时间
        }

        vizRAF = requestAnimationFrame(loop);
      };

      vizRAF = requestAnimationFrame(loop);
    };

    // ✅ 进度条：timeupdate + RAF 双保险（丝滑、不“卡死”）
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
      // ✅ i 可能是 NaN：这里强制修正，彻底避免 NaN.mp3
      const ii = parseInt(String(i), 10);
      const safeI = Number.isFinite(ii) ? ii : 1;

      idx = ((safeI - 1 + TOTAL_TRACKS) % TOTAL_TRACKS) + 1;
      storage.setItem("trackIndex", String(idx));

      bgMusic.src = `${idx}.mp3`;
      bgMusic.load(); // ✅ 立刻触发加载，避免 duration 一直不可用

      if (trackName) trackName.textContent = `第 ${idx} 首`;
      if (hint) hint.textContent = autoplay ? "音乐：加载中…" : "音乐：点 ▶ 开始（需要你手动点一下）";

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

        // 夸张一点：一按播放就炸一波
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

    // UI events
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

    // status hints
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

    // ✅ 点击进度条跳转（更像播放器）
    on(barEl, "click", (e) => {
      if (!bgMusic.duration || !isFinite(bgMusic.duration)) return;
      const r = barEl.getBoundingClientRect();
      const pct = clamp((e.clientX - r.left) / r.width, 0, 1);
      bgMusic.currentTime = pct * bgMusic.duration;
      updateProgress();
      fx?.burst?.(e.clientX, r.top, 12);
    });

    // ✅ 3D 倾斜：让播放器更“炫酷”
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

    // init
    setTrack(idx, false);
  };

  /* ------------------------------
   * Init
   * ------------------------------ */
  const init = () => {
    renderLinks();

    // mood buttons
    $$("[data-mood-btn]").forEach((b) => on(b, "click", () => setMood(b.dataset.moodBtn)));
    setMood(storage.getItem("mood") || "sweet");

    // idea
    on($("#ideaBtn"), "click", () => {
      const it = pick(IDEAS);
      const ideaTitle = $("#ideaTitle");
      const ideaSub = $("#ideaSub");
      if (ideaTitle) ideaTitle.textContent = it.t;
      if (ideaSub) ideaSub.textContent = it.s;
      toast("💡 灵感已刷新");
      // fx?.burst?.(window.innerWidth * 0.35, window.innerHeight * 0.28, 12);
    });

    // copy opener
    on($("#copyLineBtn"), "click", async () => {
      const line = pick(OPENERS);
      await copyText(line);
      toast("已复制：去发给TA");
    });

    // fun
    const funTitle = $("#funTitle");
    const funSub = $("#funSub");
    let funState = { t: funTitle?.textContent || "", s: funSub?.textContent || "" };

    const setFun = (it) => {
      funState = it;
      if (funTitle) funTitle.textContent = it.t;
      if (funSub) funSub.textContent = it.s;
    };

    on($("#funQBtn"), "click", () => { setFun(pick(FUN_Q)); toast("🎲 抽到了一个问题"); /* fx?.burst?.(window.innerWidth * 0.72, window.innerHeight * 0.35, 10); */ });
    on($("#funCBtn"), "click", () => { setFun(pick(FUN_C)); toast("🪄 任务已发放"); /* fx?.burst?.(window.innerWidth * 0.72, window.innerHeight * 0.35, 10); */ });

    on($("#funCopyBtn"), "click", async () => {
      await copyText(`${funState.t}\n${funState.s}`);
      toast("已复制：去发给TA");
    });

    // music
    createMusic();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
