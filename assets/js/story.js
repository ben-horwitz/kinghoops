/* KING Hoops — scroll-scrubbed game footage with hand-sketched player traces.
   Frames come from assets/video/slow-mo-slam.mp4 (6.6s–12.4s). Player skeletons were traced
   once, offline, with a pose-detection model (MoveNet) and saved to assets/story/poses.json,
   so visitors only download images + a small JSON file. */
(function () {
  "use strict";
  const scrolly = document.querySelector(".scrolly");
  const stage = scrolly && scrolly.querySelector(".stage");
  const canvas = stage && stage.querySelector("canvas");

  const clamp = (x, a, b) => (x < (a || 0) ? a || 0 : x > (b === undefined ? 1 : b) ? (b === undefined ? 1 : b) : x);
  const range = (p, a, b) => clamp((p - a) / (b - a));
  const sstep = (t) => t * t * (3 - 2 * t);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const hash = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

  // MoveNet keypoints: 0 nose, 5/6 shoulders, 7/8 elbows, 9/10 wrists, 11/12 hips, 13/14 knees, 15/16 ankles
  const BONES = [[5, 7], [7, 9], [6, 8], [8, 10], [5, 6], [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
  const MIN_CONF = 0.1;
  const P_START = 0.05, P_END = 0.9; // portion of the scroll that plays the footage
  const DUNK_T = 11.65;               // clip time where the ball goes through

  function start(data) {
    const ctx = canvas.getContext("2d");
    const N = data.frames.length;                 // traced poses (15 fps)
    const FN = data.video.n, FFPS = data.video.fps; // image frames (30 fps)
    const VW = data.w, VH = data.h;
    const DUR = (FN - 1) / FFPS;
    const pDunk = P_START + ((DUNK_T - data.video.t0) / DUR) * (P_END - P_START);

    /* ---- the KING player's traced pose per frame: bridge short gaps, then smooth ---- */
    const raw = data.frames.map((f) => f.king);
    for (let i = 0; i < N; i++) {
      if (raw[i]) continue;
      let a = i - 1, b = i + 1;
      while (a >= 0 && !raw[a]) a--;
      while (b < N && !raw[b]) b++;
      if (a >= 0 && b < N) {
        const t = (i - a) / (b - a);
        raw[i] = raw[a].map((k, j) => [k[0] + (raw[b][j][0] - k[0]) * t, k[1] + (raw[b][j][1] - k[1]) * t, Math.min(k[2], raw[b][j][2])]);
      } else if (a >= 0 || b < N) {
        raw[i] = (a >= 0 ? raw[a] : raw[b]).map((k) => k.slice()); // hold the nearest pose at the ends
      }
    }
    const king = raw.map((k, i) => k && k.map((q, j) => {
      let x = 0, y = 0, w = 0;
      for (let d = -2; d <= 2; d++) {
        const r = raw[i + d]; if (!r || r[j][2] < MIN_CONF) continue;
        const ww = 3 - Math.abs(d); x += r[j][0] * ww; y += r[j][1] * ww; w += ww;
      }
      return w ? [x / w, y / w, q[2]] : q;
    }));

    // pose at any (fractional) clip time, interpolated between traced frames
    function poseAt(t) {
      const pf = clamp((t - data.t0) * data.fps, 0, N - 1);
      const i0 = Math.floor(pf), i1 = Math.min(N - 1, i0 + 1), a = pf - i0;
      const A = king[i0], B = king[i1];
      if (!A || !B) return A || B;
      return A.map((k, j) => [k[0] + (B[j][0] - k[0]) * a, k[1] + (B[j][1] - k[1]) * a, Math.min(k[2], B[j][2])]);
    }

    /* ---- frames ---- */
    const imgs = new Array(FN), ready = new Array(FN).fill(false);
    let firstReady = false;
    const loadOrder = [];
    for (let step = 16; step >= 1; step = Math.floor(step / 2)) for (let i = 0; i < FN; i += step) if (!loadOrder.includes(i)) loadOrder.push(i);
    loadOrder.forEach((i) => {
      const im = new Image(); im.decoding = "async";
      im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { ready[i] = true; needs = true; firstReady = true; }); };
      im.src = "assets/story/frames/f" + String(i).padStart(3, "0") + ".jpg";
      imgs[i] = im;
    });
    function nearestReady(i) {
      for (let d = 0; d < FN; d++) { if (ready[i - d]) return i - d; if (ready[i + d]) return i + d; }
      return -1;
    }

    /* ---- sizing ---- */
    // On wide screens the canvas only covers the video panel (far fewer pixels to paint each frame);
    // the blurred backdrop behind it is a CSS layer the browser composites on the GPU.
    let W = 1, H = 1, dpr = 1, needs = true, headerH = 76, wide = false, CW = 1, CH = 1;
    const backdrop = document.createElement("div"); backdrop.className = "stage__backdrop"; backdrop.setAttribute("aria-hidden", "true");
    stage.insertBefore(backdrop, canvas);
    function resize() {
      headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 76;
      const r = stage.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      wide = W / H >= 1.1;
      if (wide) {
        CH = Math.round(H - headerH - 48); CW = Math.round(CH * VW / VH);
        Object.assign(canvas.style, { left: (W - CW - 60) + "px", top: (headerH + 24) + "px", width: CW + "px", height: CH + "px" });
      } else {
        CW = W; CH = H;
        Object.assign(canvas.style, { left: "0px", top: "0px", width: "100%", height: "100%" });
      }
      canvas.classList.toggle("is-panel", wide);
      canvas.width = Math.round(CW * dpr); canvas.height = Math.round(CH * dpr);
      needs = true;
    }
    let lastBackdrop = -99;
    new ResizeObserver(resize).observe(stage);
    resize();

    /* ---- relaxed hand-drawn strokes ---- */
    function wobblyLine(ax, ay, bx, by, seed, amp) {
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const j = (q) => (hash(seed + q) - 0.5) * amp;
      const over = 0.03 + hash(seed) * 0.04;
      const x0 = ax - dx * over + j(1), y0 = ay - dy * over + j(2);
      const x1 = bx + dx * over + j(3), y1 = by + dy * over + j(4);
      const c1 = j(5) * 1.4, c2 = j(6) * 1.4;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(x0 + dx * 0.33 + nx * c1, y0 + dy * 0.33 + ny * c1, x0 + dx * 0.66 + nx * c2, y0 + dy * 0.66 + ny * c2, x1, y1);
      ctx.stroke();
    }
    function wobblyCircle(x, y, r, seed, amp) {
      ctx.beginPath();
      const a0 = hash(seed) * Math.PI * 2;
      for (let t = 0; t <= 1.04; t += 0.04) {
        const a = a0 + t * Math.PI * 2;
        const rr = r + Math.sin(t * Math.PI * 4 + hash(seed + 2) * 6) * amp * 0.5;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 1.06;
        t === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    function drawTrace(k, ox, oy, sw, sh, boil) {
      if (!k) return;
      const amp = Math.max(1.2, sh * 0.0028);
      const base = Math.max(1.6, sh / 420);
      const pt = (j) => [ox + k[j][0] * sw, oy + k[j][1] * sh];
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.save();
      ctx.shadowColor = "rgba(255, 188, 54, 0.55)"; ctx.shadowBlur = 8;
      for (const pass of [0, 1]) {
        ctx.strokeStyle = pass ? "rgba(255, 214, 140, 0.95)" : "rgba(255, 188, 54, 0.28)";
        ctx.lineWidth = pass ? base : base * 0.8;
        BONES.forEach((b, bi) => {
          const A = k[b[0]], B = k[b[1]];
          if (A[2] < MIN_CONF || B[2] < MIN_CONF) return;
          const a = pt(b[0]), c = pt(b[1]);
          wobblyLine(a[0], a[1], c[0], c[1], boil * 53 + bi * 13 + pass * 7.7, amp * (pass ? 1 : 2.2));
        });
      }
      const ls = k[5], rs = k[6];
      if (k[0][2] > MIN_CONF && ls[2] > MIN_CONF && rs[2] > MIN_CONF) {
        const sd = Math.hypot((ls[0] - rs[0]) * sw, (ls[1] - rs[1]) * sh);
        const n = pt(0);
        ctx.strokeStyle = "rgba(255, 214, 140, 0.95)"; ctx.lineWidth = base;
        wobblyCircle(n[0], n[1] - sd * 0.05, Math.max(5, sd * 0.38), boil * 31 + 3, amp);
      }
      ctx.restore();
    }

    /* ---- DOM ---- */
    const beats = Array.from(stage.querySelectorAll("[data-p]")).map((el) => {
      const ab = el.getAttribute("data-p").split(",").map(Number);
      return { el, a: ab[0], b: ab[1], nums: Array.from(el.querySelectorAll("[data-to]")), on: false };
    });
    const words = Array.from(stage.querySelectorAll("[data-word]")).map((el) => {
      const ab = el.getAttribute("data-word").split(",").map(Number);
      return { el, a: ab[0], b: ab[1] };
    });
    const flashEl = stage.querySelector(".stage__flash"), loader = stage.querySelector(".stage__loader");
    const fmt = (n, el) => (el.getAttribute("data-prefix") || "") + Math.round(n).toLocaleString() + (el.getAttribute("data-suffix") || "");
    function updateDOM(p) {
      const fw = 0.012;
      for (const b of beats) {
        const fin = b.a <= 0 ? 1 : sstep(range(p, b.a - fw, b.a + fw));
        const fout = b.b >= 1 ? 1 : 1 - sstep(range(p, b.b - fw, b.b + fw));
        const al = Math.min(fin, fout), on = al > 0.01;
        if (on !== b.on) { b.el.classList.toggle("is-on", on); b.on = on; }
        if (on) {
          b.el.style.opacity = al.toFixed(3);
          b.el.style.transform = "translate3d(0," + ((1 - fin) * 30 - (1 - fout) * 30).toFixed(1) + "px,0)";
          for (const n of b.nums) n.textContent = fmt(+n.getAttribute("data-to") * easeOut(range(p, b.a, b.a + 0.04)), n);
        }
      }
      for (const w of words) {
        const q = range(p, w.a, w.b);
        const al = q <= 0 || q >= 1 ? 0 : Math.min(1, q * 6, (1 - q) * 3);
        w.el.style.opacity = al.toFixed(3);
        w.el.style.transform = "rotate(-4deg) scale(" + (0.85 + 0.15 * easeOut(Math.min(1, q * 4))).toFixed(3) + ")";
        w.el.style.visibility = al > 0 ? "visible" : "hidden";
      }
      if (flashEl) flashEl.style.opacity = (p >= pDunk ? Math.exp(-(p - pDunk) * 220) * 0.45 : 0).toFixed(3);
    }

    /* ---- render: cross-fade neighbouring frames so scrubbing is smooth, never steppy ---- */
    let lastKey = "";
    function render(p, time) {
      const ff = range(p, P_START, P_END) * (FN - 1);
      let i0 = Math.floor(ff), i1 = Math.min(FN - 1, i0 + 1), mixA = ff - i0;
      if (!ready[i0] || !ready[i1]) { i0 = i1 = nearestReady(Math.round(ff)); mixA = 0; }
      const boil = Math.floor(time * 4); // lines gently re-draw a few times a second, like hand-drawn animation
      const key = ff.toFixed(3) + "|" + boil + "|" + CW + "x" + CH + "|" + i0;
      if (key === lastKey && !needs) return;
      lastKey = key; needs = false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#081633"; ctx.fillRect(0, 0, CW, CH);
      if (i0 < 0) return;
      const imA = imgs[i0], imB = imgs[i1];
      let ox, oy, sw, sh;
      if (wide) {
        ox = 0; oy = 0; sw = CW; sh = CH;
        if (Math.abs(i0 - lastBackdrop) >= 12) { backdrop.style.backgroundImage = "url(" + imA.src + ")"; lastBackdrop = i0; }
      } else {
        const cs = Math.max(CW / VW, CH / VH);
        sw = VW * cs; sh = VH * cs; ox = (CW - sw) / 2; oy = (CH - sh) / 2 - CH * 0.08;
      }
      ctx.drawImage(imA, ox, oy, sw, sh);
      if (i1 !== i0 && mixA > 0.01) { ctx.globalAlpha = mixA; ctx.drawImage(imB, ox, oy, sw, sh); ctx.globalAlpha = 1; }
      drawTrace(poseAt(data.video.t0 + ff / FFPS), ox, oy, sw, sh, boil);
    }

    /* ---- loop ---- */
    let target = 0, prog = 0, visible = true;
    function readScroll() {
      const r = scrolly.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      target = clamp(total > 0 ? -r.top / total : 0);
    }
    window.addEventListener("scroll", readScroll, { passive: true });
    window.addEventListener("resize", readScroll);
    readScroll(); prog = target;
    new IntersectionObserver((en) => { visible = en[0].isIntersecting; }, { rootMargin: "100px" }).observe(scrolly);
    let last = performance.now(), shown = false;
    function loop(now) {
      requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      if (!visible) return;
      const gap = Math.abs(target - prog);
      prog += (target - prog) * (1 - Math.exp(-dt * (6 + gap * 120)));
      if (Math.abs(target - prog) < 1e-6) prog = target;
      render(prog, now / 1000);
      updateDOM(prog);
      if (!shown && firstReady) { shown = true; if (loader) loader.classList.add("is-done"); }
    }
    requestAnimationFrame(loop);
    window.__kh = { go: (p) => { target = prog = p; }, get p() { return prog; } };
  }

  if (canvas && canvas.getContext) {
    scrolly.classList.add("is-3d");
    fetch("assets/story/poses.json")
      .then((r) => { if (!r.ok) throw new Error("poses " + r.status); return r.json(); })
      .then(start)
      .catch((err) => { console.error(err); scrolly.classList.remove("is-3d"); });
  }
})();
