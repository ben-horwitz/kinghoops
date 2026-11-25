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
  const MIN_CONF = 0.22;
  const P_START = 0.05, P_END = 0.9; // portion of the scroll that plays the footage
  const DUNK_T = 11.65;               // clip time where the ball goes through

  function start(data) {
    const ctx = canvas.getContext("2d");
    const N = data.frames.length;
    const VW = data.w, VH = data.h;
    const pDunk = P_START + ((DUNK_T - data.t0) * data.fps / (N - 1)) * (P_END - P_START);

    /* ---- tracks: fill short detection gaps and smooth jitter ---- */
    const tracks = {}; // id -> array[N] of keypoints|null
    data.frames.forEach((fr, i) => fr.people.forEach((pp) => {
      (tracks[pp.id] = tracks[pp.id] || new Array(N).fill(null))[i] = pp.k;
    }));
    Object.keys(tracks).forEach((id) => {
      const tr = tracks[id];
      for (let i = 0; i < N; i++) {
        if (tr[i]) continue;
        let a = i - 1; while (a >= 0 && !tr[a] && i - a <= 3) a--;
        if (a >= 0 && tr[a] && i - a <= 3) tr[i] = tr[a].map((k) => [k[0], k[1], k[2] * 0.85]);
      }
    });
    const people = []; // per frame: smoothed list of keypoint arrays
    for (let i = 0; i < N; i++) {
      const list = [];
      Object.keys(tracks).forEach((id) => {
        const tr = tracks[id];
        if (!tr[i]) return;
        list.push(tr[i].map((k, j) => {
          let x = 0, y = 0, w = 0;
          for (let d = -1; d <= 1; d++) {
            const q = tr[i + d]; if (!q || q[j][2] < MIN_CONF) continue;
            const ww = d === 0 ? 2 : 1; x += q[j][0] * ww; y += q[j][1] * ww; w += ww;
          }
          return w ? [x / w, y / w, k[2]] : k;
        }));
      });
      people.push(list);
    }

    /* ---- frames ---- */
    const imgs = new Array(N), ready = new Array(N).fill(false);
    let firstReady = false;
    const loadOrder = [];
    for (let step = 16; step >= 1; step = Math.floor(step / 2)) for (let i = 0; i < N; i += step) if (!loadOrder.includes(i)) loadOrder.push(i);
    loadOrder.forEach((i) => {
      const im = new Image(); im.decoding = "async";
      im.onload = () => { ready[i] = true; if (!firstReady) { firstReady = true; needs = true; } };
      im.src = "assets/story/frames/f" + String(i).padStart(3, "0") + ".jpg";
      imgs[i] = im;
    });
    function nearestReady(i) {
      for (let d = 0; d < N; d++) { if (ready[i - d]) return i - d; if (ready[i + d]) return i + d; }
      return -1;
    }

    /* ---- sizing ---- */
    let W = 1, H = 1, dpr = 1, needs = true;
    function resize() {
      const r = stage.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      needs = true;
    }
    new ResizeObserver(resize).observe(stage);
    resize();

    /* ---- sketch strokes ---- */
    function sketchLine(ax, ay, bx, by, seed, amp, passes) {
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      for (let k = 0; k < passes; k++) {
        const s = seed * 7.13 + k * 3.7;
        const over = 0.06 + hash(s) * 0.08;               // pencil overshoot past the joint
        const j = (q) => (hash(s + q) - 0.5) * amp;
        const x0 = ax - dx * over + j(1), y0 = ay - dy * over + j(2);
        const x1 = bx + dx * over * 0.7 + j(3), y1 = by + dy * over * 0.7 + j(4);
        const bow = (hash(s + 5) - 0.5) * amp * 1.6;
        const cx = (x0 + x1) / 2 + nx * bow, cy = (y0 + y1) / 2 + ny * bow;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
      }
    }
    function sketchCircle(x, y, r, seed, amp) {
      for (let k = 0; k < 2; k++) {
        const s = seed * 5.3 + k * 11.1, a0 = hash(s) * Math.PI * 2;
        ctx.beginPath();
        for (let t = 0; t <= 1.08; t += 0.06) {
          const a = a0 + t * Math.PI * 2, rr = r * (1 + (hash(s + Math.floor(t * 9)) - 0.5) * 0.18) + (hash(s + 1) - 0.5) * amp;
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 1.08;
          t === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    function drawTraces(fi, ox, oy, sw, sh, boil) {
      const amp = Math.max(2, sh * 0.005);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      people[fi].forEach((k, pi) => {
        const pt = (j) => [ox + k[j][0] * sw, oy + k[j][1] * sh];
        const seedBase = boil * 97 + pi * 31;
        // soft graphite shadow pass, then crisp pencil passes
        for (const pass of [0, 1]) {
          ctx.strokeStyle = pass ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.18)";
          ctx.lineWidth = (pass ? 1.6 : 4) * (sh / 900 + 0.5);
          BONES.forEach((b, bi) => {
            const A = k[b[0]], B = k[b[1]];
            if (A[2] < MIN_CONF || B[2] < MIN_CONF) return;
            const a = pt(b[0]), c = pt(b[1]);
            sketchLine(a[0], a[1], c[0], c[1], seedBase + bi * 13 + pass * 101, amp * (pass ? 1 : 1.6), pass ? 2 : 1);
          });
        }
        const ls = k[5], rs = k[6];
        if (k[0][2] > MIN_CONF && ls[2] > MIN_CONF && rs[2] > MIN_CONF) {
          const sd = Math.hypot((ls[0] - rs[0]) * sw, (ls[1] - rs[1]) * sh);
          const n = pt(0);
          ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.5 * (sh / 900 + 0.5);
          sketchCircle(n[0], n[1] - sd * 0.05, Math.max(6, sd * 0.42), seedBase + 7, amp);
        }
      });
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
    const homeEl = stage.querySelector("[data-score-home]"), clockEl = stage.querySelector("[data-clock]");
    const periodEl = stage.querySelector("[data-period]"), boardEl = stage.querySelector(".board");
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
      // game clock: 6 seconds left, dunk beats the buzzer
      const c = Math.max(0, 6 * (1 - range(p, P_START, pDunk + 0.004)));
      if (clockEl) clockEl.textContent = c.toFixed(1);
      if (homeEl) homeEl.textContent = p >= pDunk ? "88" : "86";
      const final = p >= pDunk + 0.004;
      if (periodEl) periodEl.textContent = final ? "Final" : "4th Qtr";
      if (boardEl) boardEl.classList.toggle("is-final", final);
      if (flashEl) flashEl.style.opacity = (p >= pDunk ? Math.exp(-(p - pDunk) * 220) * 0.45 : 0).toFixed(3);
    }

    /* ---- render ---- */
    let lastKey = "";
    function render(p, time) {
      const fiWanted = Math.round(range(p, P_START, P_END) * (N - 1));
      const fi = nearestReady(fiWanted);
      const boil = Math.floor(time * 6); // lines re-draw a few times a second, like hand-drawn animation
      const key = fi + "|" + boil + "|" + W + "x" + H;
      if (key === lastKey && !needs) return;
      lastKey = key; needs = false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#081633"; ctx.fillRect(0, 0, W, H);
      if (fi < 0) return;
      const im = imgs[fi];
      const wide = W / H >= 1.1;
      const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 76;
      let ox, oy, sw, sh;
      if (wide) {
        // blurred fill behind, sharp portrait panel on the right
        const cs = Math.max(W / VW, H / VH);
        ctx.filter = "blur(28px) grayscale(1) brightness(0.32)";
        ctx.drawImage(im, (W - VW * cs) / 2, (H - VH * cs) / 2, VW * cs, VH * cs);
        sh = H - headerH - 48; sw = sh * VW / VH;
        ox = Math.min(W - sw - 350, W * 0.64 - sw / 2); oy = headerH + 24;
      } else {
        const cs = Math.max(W / VW, H / VH);
        sw = VW * cs; sh = VH * cs; ox = (W - sw) / 2; oy = (H - sh) / 2 - H * 0.08;
      }
      ctx.save();
      if (wide) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ox, oy, sw, sh, 18) : ctx.rect(ox, oy, sw, sh); ctx.clip(); }
      ctx.filter = "grayscale(1) contrast(1.15) brightness(0.8)";
      ctx.drawImage(im, ox, oy, sw, sh);
      ctx.filter = "none";
      ctx.fillStyle = "rgba(12, 34, 90, 0.28)"; ctx.fillRect(ox, oy, sw, sh);
      drawTraces(fi, ox, oy, sw, sh, boil);
      ctx.restore();
      if (wide) { ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ox, oy, sw, sh, 18) : ctx.rect(ox, oy, sw, sh); ctx.stroke(); }
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
      prog += (target - prog) * (1 - Math.exp(-dt * (8 + gap * 160)));
      if (Math.abs(target - prog) < 1e-5) prog = target;
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
