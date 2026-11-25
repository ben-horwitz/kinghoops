/* KING Hoops — scroll-driven clip-art story on the home page.
   A flat, bold-outline cartoon drawn on a 2D canvas. Every frame is a pure function of
   scroll progress p (0..1); ambient motion (crowd bob, flashes) runs on clock time. */
(function () {
  "use strict";
  const scrolly = document.querySelector(".scrolly");
  const stage = scrolly && scrolly.querySelector(".stage");
  const canvas = stage && stage.querySelector("canvas");

  /* ------------------------------------------------------------ utils */
  function clamp(x, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(t) { return t * t * (3 - 2 * t); }
  function range(p, a, b) { return clamp((p - a) / (b - a)); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { return t * t * t; }
  function frac(x) { return x - Math.floor(x); }
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function hash(n) { return frac(Math.sin(n * 12.9898) * 43758.5453); }
  function bounceY(q, hs, ds) {
    let acc = 0;
    for (let i = 0; i < hs.length; i++) {
      if (q <= acc + ds[i]) { const t = (q - acc) / ds[i]; return 4 * hs[i] * t * (1 - t); }
      acc += ds[i];
    }
    return 0;
  }
  const RAD = Math.PI / 180;

  const INK = "#0a1430", NAVY = "#15397c", GOLD = "#ffbc36", BLUE = "#1a6aff", ORANGE = "#f26b1d";
  const FONT = '"Oswald", "Arial Narrow", sans-serif';

  /* ------------------------------------------------------------ poses
     Side view. Angles in degrees, measured from straight down, positive = toward facing.
     fs/fe = front shoulder/elbow, bs/be = back arm, fh/fk = front hip/knee, bh/bk = back leg,
     ft/bt = toe point, lean = torso lean forward, head = head tilt (negative looks up).
     grip 0 = ball between both hands, 1 = in front hand; bx/by = ball offset (facing space). */
  const DEF = { lean: 0, head: 0, fs: 0, fe: 0, bs: 0, be: 0, fh: 0, fk: 0, bh: 0, bk: 0, ft: 0, bt: 0, grip: 0, bx: 0.13, by: 0 };
  const KEYSN = Object.keys(DEF);
  function P(o) { return Object.assign({}, DEF, o); }
  function mix(a, b, t) { const o = {}; for (const k of KEYSN) o[k] = lerp(a[k], b[k], t); return o; }
  function track(keys, p) {
    if (p <= keys[0][0]) return mix(keys[0][1], keys[0][1], 0);
    for (let i = 0; i < keys.length - 1; i++) {
      const p0 = keys[i][0], p1 = keys[i + 1][0];
      if (p <= p1) return mix(keys[i][1], keys[i + 1][1], sstep((p - p0) / (p1 - p0)));
    }
    const l = keys[keys.length - 1][1]; return mix(l, l, 0);
  }

  const STANCE = P({ lean: 12, head: -4, fs: 38, fe: 70, bs: 32, be: 76, fh: 26, fk: 46, bh: 12, bk: 40, grip: 0, bx: 0.14, by: 0.02 });
  const DRIB = P({ lean: 18, head: -6, fs: 26, fe: 30, bs: 62, be: 30, fh: 36, fk: 56, bh: 18, bk: 50, grip: 1, bx: 0.05, by: -0.12 });
  const HIGH = P({ lean: 14, head: -6, fs: 56, fe: 86, bs: 50, be: 92, fh: 30, fk: 50, bh: 22, bk: 48, grip: 0.3, bx: 0.12, by: 0.04 });
  const LOAD = P({ lean: 22, head: -12, fs: 76, fe: 110, bs: 70, be: 112, fh: 60, fk: 100, bh: 54, bk: 96, grip: 0.6, bx: 0.08, by: 0.08 });
  const SET = P({ lean: 5, head: -14, fs: 118, fe: 78, bs: 112, be: 92, fh: 20, fk: 30, bh: 14, bk: 26, ft: 10, bt: 10, grip: 1, bx: 0.02, by: 0.14 });
  const RELEASE = P({ lean: 0, head: -16, fs: 162, fe: 8, bs: 135, be: 40, fh: 5, fk: 6, bh: 2, bk: 5, ft: 40, bt: 40, grip: 1, bx: 0.07, by: 0.13 });
  const FOLLOW = P({ lean: 0, head: -16, fs: 158, fe: 14, bs: 116, be: 30, fh: 10, fk: 16, bh: 8, bk: 14, ft: 30, bt: 30, grip: 1, bx: 0.07, by: 0.13 });
  const LAND = P({ lean: 12, head: -18, fs: 150, fe: 20, bs: 50, be: 40, fh: 34, fk: 50, bh: 28, bk: 48, grip: 1 });
  const WATCH = P({ lean: 5, head: -18, fs: 16, fe: 25, bs: 14, be: 25, fh: 10, fk: 14, bh: 6, bk: 12, grip: 1 });
  const CELEB = P({ lean: 0, head: -6, fs: 172, fe: 14, bs: 22, be: 40, fh: 12, fk: 14, bh: 6, bk: 12, grip: 1 });

  // Dunk poses traced from KING Hoops' own slow-mo dunk clip (assets/video/slow-mo-slam.mp4, 10.8s-11.7s),
  // redrawn side-on: two-hand gather at the chest, knee-drive takeoff, ball cocked high in both hands, two-hand flush.
  const GATHER = P({ lean: 12, head: -6, fs: 60, fe: 95, bs: 55, be: 100, fh: 40, fk: 30, bh: -30, bk: 55, grip: 0, bx: 0.14, by: 0.04 });
  const TAKEOFF = P({ lean: 2, head: -12, fs: 165, fe: 25, bs: 160, be: 30, fh: 85, fk: 95, bh: -8, bk: 10, bt: 40, grip: 0, bx: 0.05, by: 0.12 });
  const COCK = P({ lean: -8, head: -10, fs: 195, fe: 55, bs: 190, be: 60, fh: 75, fk: 100, bh: 5, bk: 40, ft: 20, bt: 30, grip: 0, bx: -0.02, by: 0.12 });
  const COCK2 = P(Object.assign({}, COCK, { fs: 205, fe: 65, bs: 200, be: 70, lean: -10 }));
  const SLAM = P({ lean: 15, head: -6, fs: 145, fe: 10, bs: 140, be: 15, fh: 50, fk: 90, bh: 10, bk: 70, ft: 20, bt: 30, grip: 0, bx: 0.1, by: 0.06 });
  const HANG = P({ lean: 4, head: -4, fs: 178, fe: 4, bs: 175, be: 4, fh: 55, fk: 95, bh: 35, bk: 70, ft: 30, bt: 30, grip: 1 });
  const HANG2 = P(Object.assign({}, HANG, { fh: 25, fk: 50, bh: 14, bk: 40 }));
  const LANDC = P({ lean: 30, head: -20, fs: 60, fe: 40, bs: 60, be: 40, fh: 70, fk: 105, bh: 66, bk: 100, grip: 1 });
  const VPOSE = P({ lean: -4, head: -10, fs: 170, fe: 10, bs: 158, be: 12, fh: 8, fk: 10, bh: 4, bk: 8, grip: 1 });

  const DST = P({ lean: 20, head: -6, fs: 82, fe: 20, bs: 100, be: 20, fh: 45, fk: 70, bh: 40, bk: 65 });
  const DJUMP = P({ lean: 2, head: -22, fs: 172, fe: 5, bs: 164, be: 5, fh: 10, fk: 30, bh: 5, bk: 25, ft: 35, bt: 35 });
  const DLAND = P(Object.assign({}, DST, { fs: 30, bs: 30, fe: 20, be: 20 }));
  const DSHOCK = P({ lean: -6, head: -22, fs: 150, fe: 140, bs: 145, be: 140, fh: 8, fk: 10, bh: 4, bk: 8 });

  const STEAL = 0.556;
  const HDRIB = P(Object.assign({}, DRIB, { lean: 14, bs: 40 }));
  const STUMBLE = P({ lean: 34, head: -10, fs: 60, fe: 20, bs: 30, be: 30, fh: 40, fk: 50, bh: -10, bk: 30 });
  const PDEF = P(Object.assign({}, DST, { fs: 60, bs: 80 }));
  const SWIPE = P({ lean: 30, head: -4, fs: 78, fe: 6, bs: 40, be: 30, fh: 62, fk: 72, bh: 4, bk: 30, grip: 1 });
  const KEYSD2A = [[0.5, HDRIB], [STEAL, HDRIB], [0.564, STUMBLE], [0.57, STUMBLE]];
  const KEYSD2B = [[0.568, STUMBLE], [0.768, DST], [0.8, DJUMP], [0.84, DJUMP], [0.89, DLAND], [0.935, DSHOCK], [1, DSHOCK]];
  const KEYS1 = [[0, STANCE], [0.045, STANCE], [0.056, DRIB], [0.124, DRIB], [0.145, HIGH], [0.178, LOAD], [0.214, SET], [0.24, RELEASE],
    [0.262, FOLLOW], [0.3, LAND], [0.35, LAND], [0.388, WATCH], [0.425, WATCH], [0.452, CELEB], [0.5, CELEB]];
  const KEYS2 = [[0.5, PDEF], [0.546, PDEF], [STEAL, SWIPE], [0.566, STANCE], [0.715, STANCE], [0.738, GATHER], [0.762, TAKEOFF], [0.812, COCK], [0.846, COCK2], [0.862, SLAM],
    [0.878, HANG], [0.908, HANG2], [0.936, LANDC], [0.966, VPOSE], [1, VPOSE]];
  const KEYSD1 = [[0, DST], [0.2, DST], [0.226, DJUMP], [0.258, DJUMP], [0.298, DLAND], [0.4, DLAND], [0.5, DLAND]];
  const KEYSD = [[0.5, DST], [0.768, DST], [0.8, DJUMP], [0.84, DJUMP], [0.89, DLAND], [0.935, DSHOCK], [1, DSHOCK]];

  function runPose(phi, drib) {
    const s = Math.sin(phi), c = Math.cos(phi), d = Math.cos(drib * Math.PI * 2);
    return P({ lean: 26, head: -8,
      fh: 20 + 55 * s, fk: 30 + 85 * Math.max(0, c),
      bh: 20 - 55 * s, bk: 30 + 85 * Math.max(0, -c),
      fs: 38 + 10 * d, fe: 25 + 25 * d,
      bs: 10 - 60 * s, be: 95, grip: 1, bx: 0.08, by: -0.12 });
  }

  /* --------------------------------------------------------- skeleton */
  const L = { thigh: 0.47, shin: 0.47, torso: 0.56, neck: 0.07, head: 0.15, ua: 0.31, fa: 0.29, foot: 0.24 };
  function dir(f, deg) { const r = deg * RAD; return [f * Math.sin(r), -Math.cos(r)]; }
  function add(a, d, s) { return [a[0] + d[0] * s, a[1] + d[1] * s]; }
  function solve(x, f, pose, lift) {
    const J = { f: f, pose: pose };
    const leg = function (h, k, t) {
      const knee = add([0, 0], dir(f, h), L.thigh);
      const ank = add(knee, dir(f, h - k), L.shin);
      return { knee: knee, ank: ank, toeDir: dir(f, 90 - t) };
    };
    const lf = leg(pose.fh, pose.fk, pose.ft), lb = leg(pose.bh, pose.bk, pose.bt);
    const hipY = -Math.min(lf.ank[1], lb.ank[1]) + 0.08 + lift;
    const o = [x, hipY];
    const sh = function (pt) { return [pt[0] + o[0], pt[1] + o[1]]; };
    J.hip = o;
    J.kneeF = sh(lf.knee); J.ankF = sh(lf.ank); J.toeF = add(J.ankF, lf.toeDir, L.foot);
    J.kneeB = sh(lb.knee); J.ankB = sh(lb.ank); J.toeB = add(J.ankB, lb.toeDir, L.foot);
    const lr = pose.lean * RAD;
    const td = [f * Math.sin(lr), Math.cos(lr)];
    J.td = td;
    J.shoulder = add(o, td, L.torso);
    J.neck = add(o, td, L.torso + L.neck);
    const hr = (pose.lean + pose.head) * RAD;
    J.hd = [f * Math.sin(hr), Math.cos(hr)];
    J.headC = add(J.neck, J.hd, L.head * 0.95);
    const a1 = pose.lean + pose.fs, b1 = pose.lean + pose.bs;
    J.elbF = add(J.shoulder, dir(f, a1), L.ua); J.handF = add(J.elbF, dir(f, a1 + pose.fe), L.fa);
    const shB = add(J.shoulder, [-f, 0], 0.03);
    J.shB = shB;
    J.elbB = add(shB, dir(f, b1), L.ua); J.handB = add(J.elbB, dir(f, b1 + pose.be), L.fa);
    return J;
  }
  function gripPos(J) {
    const p = J.pose;
    const mx = (J.handF[0] + J.handB[0]) / 2, my = (J.handF[1] + J.handB[1]) / 2;
    return [lerp(mx, J.handF[0], p.grip) + p.bx * J.f, lerp(my, J.handF[1], p.grip) + p.by];
  }

  function makeBanner(lines) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = NAVY; g.fillRect(0, 0, 256, 512);
    g.fillStyle = GOLD; g.fillRect(0, 0, 256, 16); g.fillRect(0, 0, 12, 470); g.fillRect(244, 0, 12, 470);
    g.beginPath(); g.moveTo(0, 470); g.lineTo(128, 512); g.lineTo(256, 470); g.lineTo(256, 512); g.lineTo(0, 512); g.closePath();
    g.globalCompositeOperation = "destination-out"; g.fill(); g.globalCompositeOperation = "source-over";
    g.strokeStyle = INK; g.lineWidth = 10;
    g.beginPath(); g.moveTo(5, 5); g.lineTo(251, 5); g.lineTo(251, 468); g.lineTo(128, 507); g.lineTo(5, 468); g.closePath(); g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle";
    let y = 110;
    for (const l of lines) { g.font = "700 " + l[1] + "px " + FONT; g.fillStyle = l[2] || "#fff"; g.fillText(l[0], 128, y); y += l[1] * 1.15; }
    return c;
  }

  /* ============================================================ start */
  function start() {
    const ctx = canvas.getContext("2d");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const logo = new Image(); logo.src = "assets/img/b40c4b_43e169ad9888472a8d624c2b9e7cf167.png";
    let banners = [];
    const mkBanners = function () {
      banners = [
        [["KING", 70, GOLD], ["HOOPS", 70], ["EST. 2016", 34, GOLD]],
        [["150+", 96, GOLD], ["PLAYERS", 46], ["SERVED", 46], ["ANNUALLY", 46]],
        [["$400K+", 74, GOLD], ["IN", 40], ["SCHOLAR-", 46], ["SHIPS", 46]],
        [["15+", 96, GOLD], ["COLLEGE", 46], ["PLAYERS", 46], ["2024–25", 40, GOLD]],
        [["375+", 96, GOLD], ["STUDENT-", 46], ["ATHLETES", 46], ["SINCE 2018", 36, GOLD]],
      ].map(makeBanner);
    };
    mkBanners();
    if (document.fonts && document.fonts.load) document.fonts.load("700 64px " + FONT).then(mkBanners).catch(function () {});

    const RIM = [0, 3.05], RIM_R = 0.23, RIM_RY = 0.065, BOARD_X = 0.42, PIVOT = [0.38, 3.05];
    const SCORE1 = 0.4, SCORE2 = 0.864;
    const S1X = -6.9;
    const A2X = -15, T2X = -2.35, D2X = -0.5, END2X = -1.5;
    const DEF0 = -1.0, DEF1 = -1.75, DEF2 = -2.6;

    /* ---- crowd ---- */
    const crowd = [];
    { const r = rng(4);
      const shirts = [NAVY, GOLD, "#ffffff", BLUE, "#0c2250", GOLD, "#e94b3c"];
      const skins = ["#2b4f9e", "#365cb0", "#24448a", "#4067bd", "#2f55a5"];
      const hair = ["#1a1210", "#3b2414", "#0d0d0d", "#6b4423", "#d9a441"];
      for (let row = 0; row < 9; row++) for (let x = -40; x < 26; x += 0.58 + r() * 0.12) {
        crowd.push({ x: x + (row % 2) * 0.29, row: row, shirt: shirts[Math.floor(r() * shirts.length)], skin: skins[Math.floor(r() * skins.length)], hair: hair[Math.floor(r() * hair.length)], s: r(), fan: r() < 0.4 });
      }
    }
    const confetti = [];
    { const r = rng(17); const cols = [GOLD, "#ffffff"];
      for (let i = 0; i < 110; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 2.6; const s = 2 + r() * 4; confetti.push({ vx: Math.cos(a + Math.PI) * s * (r() < 0.5 ? -1 : 1), vy: 3 + r() * 5, c: cols[i % cols.length], w: 0.06 + r() * 0.06, rot: r() * 6, spin: (r() - 0.5) * 20, sway: r() * 6 }); } }

    /* ---- choreography ---- */
    const st = { phi: 0, drib: 0 };
    function runS(p) { return Math.pow(range(p, 0.565, 0.755), 1.3); }

    function playerAt(p, time) {
      if (p < 0.5) {
        const pose = track(KEYS1, p);
        const dw = range(p, 0.045, 0.056) * (1 - range(p, 0.124, 0.135));
        if (dw > 0) { const f = frac(range(p, 0.05, 0.13) * 3); pose.fe += 24 * Math.cos(f * Math.PI * 2) * dw; pose.fs += 8 * Math.cos(f * Math.PI * 2) * dw; }
        if (p < 0.2) pose.lean += Math.sin(time * 2) * 1.2;
        let lift = 0;
        if (p > 0.205 && p < 0.243) lift = 0.45 * easeOut(range(p, 0.205, 0.243));
        else if (p >= 0.243 && p < 0.29) lift = 0.45 * (1 - easeIn(range(p, 0.243, 0.29)));
        return solve(S1X, 1, pose, lift);
      }
      const s = runS(p);
      let x = lerp(A2X, T2X, s), lift = 0;
      const phi = (s * (T2X - A2X)) / 1.5 * Math.PI;
      st.phi = phi; st.drib = phi / (Math.PI * 2);
      if (p > 0.755) {
        const q = range(p, 0.755, 0.846);
        x = lerp(T2X, D2X, easeOut(q));
        if (p < 0.846) lift = 1.08 * easeOut(q);
        else if (p < 0.912) lift = 1.08;
        else lift = 1.08 * (1 - easeIn(range(p, 0.912, 0.934)));
        if (p > 0.925) x = lerp(D2X, END2X, easeOut(range(p, 0.925, 0.975)));
      }
      let pose = track(KEYS2, p);
      const wRun = range(p, 0.566, 0.588) * (1 - range(p, 0.712, 0.738));
      if (wRun > 0) { pose = mix(pose, runPose(phi, st.drib), wRun); lift += 0.1 * Math.max(0, Math.sin(2 * phi)) * wRun; }
      let J = solve(x, 1, pose, lift);
      // hang on the rim: lock the front hand onto the rim's front edge
      const wh = range(p, 0.858, 0.874) * (1 - range(p, 0.906, 0.918));
      if (wh > 0) {
        const tilt = rimTilt(p);
        const rimFront = rimPt(-RIM_R + 0.04, 0, tilt);
        const dx = rimFront[0] - J.handF[0], dy = rimFront[1] + 0.02 - J.handF[1];
        J = solve(x + dx * wh, 1, pose, lift + dy * wh);
      }
      return J;
    }
    function defenderAt(p) {
      if (p < 0.5) {
        // closes out on the shooter, jumps a beat too late
        const cl = range(p, 0.11, 0.21);
        const pose = track(KEYSD1, p);
        if (cl > 0 && cl < 1) { const w = Math.abs(Math.sin(sstep(cl) * 10)); pose.fh += 16 * w; pose.bh -= 6 * w; }
        let lift = 0;
        if (p > 0.222 && p < 0.256) lift = 0.38 * easeOut(range(p, 0.222, 0.256));
        else if (p >= 0.256 && p < 0.295) lift = 0.38 * (1 - easeIn(range(p, 0.256, 0.295)));
        return solve(lerp(-3.4, -5.7, sstep(cl)), -1, pose, lift);
      }
      // Act II: the Rivals guard dribbles up, gets picked clean, then chases #16 down the floor
      if (p < STEAL + 0.012) {
        const x = p < STEAL ? lerp(-12.2, -13.75, range(p, 0.53, STEAL)) : lerp(-13.75, -14.05, range(p, STEAL, STEAL + 0.012));
        const pose = track(KEYSD2A, p);
        if (p < STEAL) pose.fe += 24 * Math.cos(frac(range(p, 0.5, STEAL) * 5) * Math.PI * 2);
        return solve(x, -1, pose, 0);
      }
      const cq = Math.pow(range(p, 0.568, 0.775), 1.3);
      let x = lerp(-14.05, T2X - 1.3, cq);
      let pose = track(KEYSD2B, p);
      const wR = range(p, 0.568, 0.585) * (1 - range(p, 0.76, 0.776));
      if (wR > 0) {
        const phiD = (cq * 10.4) / 1.5 * Math.PI;
        const rp = runPose(phiD, 0); rp.fs = 12 + 55 * Math.sin(phiD + Math.PI); rp.fe = 80;
        pose = mix(pose, rp, wR);
      }
      let lift = 0;
      if (p > 0.775) x = lerp(T2X - 1.3, -2.25, easeOut(range(p, 0.775, 0.885)));
      if (p > 0.89) x = lerp(-2.25, -2.75, sstep(range(p, 0.89, 0.95)));
      if (p > 0.775 && p < 0.826) lift = 0.6 * easeOut(range(p, 0.775, 0.826));
      else if (p >= 0.826 && p < 0.885) lift = 0.6 * (1 - easeIn(range(p, 0.826, 0.885)));
      return solve(x, 1, pose, lift);
    }

    const REL1 = gripPos(playerAt(0.24, 0));
    const REL2 = gripPos(playerAt(0.858, 0));

    function ballAt(p, J, D) {
      let b, spin = 0;
      if (p < 0.5) {
        if (p < 0.24) {
          b = gripPos(J);
          const dw = range(p, 0.045, 0.056) * (1 - range(p, 0.124, 0.135));
          if (dw > 0) {
            const f = frac(range(p, 0.05, 0.13) * 3);
            const top = J.handF[1] - 0.12;
            const d = [J.handF[0] + 0.1, 0.121 + (top - 0.121) * Math.pow(Math.abs(2 * f - 1), 0.85)];
            b = [lerp(b[0], d[0], dw), lerp(b[1], d[1], dw)];
            spin = range(p, 0.05, 0.13) * 10;
          }
        } else if (p < SCORE1) {
          const s = range(p, 0.24, SCORE1), u = lerp(s, easeOut(s), 0.55);
          b = arc1(u); spin = -s * 18;
        } else if (p < 0.43) {
          const q = range(p, SCORE1, 0.43);
          b = [0.3 * easeOut(q), 3.05 - (3.05 - 0.121) * Math.pow(q, 1.35)]; spin = -18 - q * 3;
        } else {
          const q = range(p, 0.43, 0.495);
          b = [lerp(0.3, -2.3, easeOut(q)), 0.121 + bounceY(q, [0.75, 0.32, 0.1], [0.42, 0.33, 0.25])]; spin = -21 + easeOut(q) * 20;
        }
      } else {
        if (p < STEAL && D) {
          // Rivals guard dribbling up the floor
          const f = frac(range(p, 0.5, STEAL) * 5), top = D.handF[1] - 0.12;
          b = [D.handF[0] - 0.1, 0.121 + (top - 0.121) * Math.pow(Math.abs(2 * f - 1), 0.85)];
          spin = -range(p, 0.5, STEAL) * 14;
        } else if (p < 0.566) {
          // poked loose, straight into #16's hands
          const q = range(p, STEAL, 0.566), g = gripPos(J);
          b = [lerp(-13.95, g[0], easeOut(q)), lerp(0.7, g[1], q) + 0.35 * Math.sin(Math.PI * q)];
          spin = q * 6;
        } else if (p < 0.858) {
          b = gripPos(J);
          const dw = range(p, 0.57, 0.585) * (1 - range(p, 0.7, 0.715));
          if (dw > 0) {
            const f = frac(st.drib), top = J.handF[1] - 0.12;
            const d = [J.handF[0] + 0.3, 0.121 + (top - 0.121) * Math.pow(Math.abs(2 * f - 1), 0.85)];
            b = [lerp(b[0], d[0], dw), lerp(b[1], d[1], dw)];
          }
          spin = st.phi * 0.6;
        } else if (p < 0.872) {
          const q = range(p, 0.858, 0.872);
          const c1 = [0, 3.3], e = [0, 2.5];
          b = [REL2[0] * (1 - q) * (1 - q) + c1[0] * 2 * q * (1 - q) + e[0] * q * q, REL2[1] * (1 - q) * (1 - q) + c1[1] * 2 * q * (1 - q) + e[1] * q * q];
          spin = st.phi * 0.6 + q * 4;
        } else if (p < 0.895) {
          const q = range(p, 0.872, 0.895);
          b = [0.06 * q, 2.5 - (2.5 - 0.121) * Math.pow(q, 1.3)]; spin = st.phi * 0.6 + 4;
        } else {
          const q = range(p, 0.895, 0.975);
          b = [lerp(0.06, -3.2, easeOut(q)), 0.121 + bounceY(q, [0.95, 0.4, 0.14], [0.42, 0.33, 0.25])]; spin = st.phi * 0.6 + 4 - easeOut(q) * 14;
        }
      }
      return { x: b[0], y: b[1], spin: spin };
    }
    function arc1(u) { return [lerp(REL1[0], RIM[0], u), lerp(REL1[1], RIM[1], u) + 4 * 1.75 * u * (1 - u)]; }

    function rimTilt(p) {
      if (p < 0.858) return 0;
      if (p < 0.912) return 9 * sstep(range(p, 0.858, 0.868)) - 2 * range(p, 0.88, 0.912);
      const dt = (p - 0.912) * 70;
      return 7 * Math.exp(-dt * 0.9) * Math.cos(dt * 7);
    }
    // point on the rim plane (x along court, z depth) → world, with the rim bent down by `tilt` degrees
    function rimPt(x, z, tilt) {
      const px = RIM[0] + x, py = RIM[1] + z * RIM_RY / RIM_R;
      const a = tilt * RAD, dx = px - PIVOT[0], dy = py - PIVOT[1];
      return [PIVOT[0] + dx * Math.cos(a) + dy * Math.sin(a), PIVOT[1] - dx * Math.sin(a) + dy * Math.cos(a)];
    }

    /* ---- camera ---- */
    const CAM = [
      [0.0, function (J) { return [J.hip[0] + 0.05, 1.15]; }, 3.0],
      [0.04, function (J) { return [J.hip[0] + 0.1, 1.1]; }, 3.2],
      [0.09, function (J) { return [J.hip[0] + 0.2, 1.05]; }, 3.6],
      [0.14, function (J) { return [J.hip[0] + 0.4, 1.3]; }, 3.9],
      [0.2, function () { return [-3.4, 2.3]; }, 8.6],
      [0.24, function () { return [-3.3, 2.5]; }, 8.5],
      [0.29, function (J, b) { return [b.x + 0.2, b.y - 0.4]; }, 4.8],
      [0.355, function (J, b) { return [lerp(b.x, RIM[0], 0.4), lerp(b.y, RIM[1], 0.4) - 0.2]; }, 3.6],
      [0.39, function () { return [0.02, 2.92]; }, 2.0],
      [0.412, function () { return [0.05, 2.45]; }, 2.6],
      [0.445, function () { return [-4.6, 1.9]; }, 6.5],
      [0.475, function () { return [-4.2, 3.0]; }, 8.5],
      [0.512, function () { return [-8.0, 1.8]; }, 7.0],
      [0.548, function (J) { return [J.hip[0] + 0.9, 1.15]; }, 3.9],
      [0.59, function (J) { return [J.hip[0] + 0.6, 1.3]; }, 4.3],
      [0.7, function (J) { return [J.hip[0] + 0.8, 1.4]; }, 4.5],
      [0.745, function (J) { return [J.hip[0] + 0.6, 1.6]; }, 4.7],
      [0.8, function (J) { return [lerp(J.hip[0], 0, 0.4), 2.3]; }, 4.5],
      [0.846, function (J) { return [lerp(J.hip[0], 0, 0.5), 2.6]; }, 3.7],
      [0.866, function () { return [-0.2, 2.65]; }, 3.3],
      [0.905, function () { return [-0.35, 2.3]; }, 4.1],
      [0.95, function () { return [-1.5, 1.8]; }, 5.5],
      [1.0, function () { return [-1.8, 2.2]; }, 6.6],
    ];
    function camAt(p, J, b) {
      let i = 0;
      while (i < CAM.length - 2 && p > CAM[i + 1][0]) i++;
      const t = sstep(range(p, CAM[i][0], CAM[i + 1][0]));
      const a = CAM[i][1](J, b), c = CAM[i + 1][1](J, b);
      return { x: lerp(a[0], c[0], t), y: lerp(a[1], c[1], t), vh: lerp(CAM[i][2], CAM[i + 1][2], t) };
    }

    /* ---- sizing ---- */
    let W = 1, H = 1, dpr = 1;
    function resize() {
      const r = stage.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    new ResizeObserver(resize).observe(stage);
    resize();

    /* ---- drawing ---- */
    let Z = 100, OX = 0, OY = 0, cam = { x: 0, y: 0 }, O = 0.02;
    function layer(k, sc, anchorY) {
      // k=1: the court in world metres. Otherwise a distant backdrop layer: drawn at scale `sc`,
      // scrolling sideways at `k` of the camera speed, with its y=0 pinned to world height anchorY.
      if (k === 1) { ctx.setTransform(dpr * Z, 0, 0, -dpr * Z, dpr * (W / 2 + OX - cam.x * Z), dpr * (H / 2 + OY + cam.y * Z)); return; }
      const z = sc * 150 * Math.pow(Z / 150, 0.3) * (H / 900); // backdrops barely react to zoom
      ctx.setTransform(dpr * z, 0, 0, -dpr * z, dpr * (W / 2 + OX - cam.x * k * z), dpr * (H / 2 + OY - (anchorY - cam.y) * Z));
    }
    function chain(pts, w, color, outline) {
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.strokeStyle = outline || INK; ctx.lineWidth = w + 2 * O; ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
    }
    function circle(x, y, r, fill, outline) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (outline !== false) { ctx.strokeStyle = INK; ctx.lineWidth = O * 2; ctx.stroke(); }
    }
    function poly(pts, fill, lw) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (lw !== 0) { ctx.strokeStyle = INK; ctx.lineWidth = lw || O * 2; ctx.lineJoin = "round"; ctx.stroke(); }
    }
    function text(str, x, y, size, color, opts) {
      opts = opts || {};
      ctx.save(); ctx.translate(x, y); ctx.scale(1, -1);
      if (opts.rot) ctx.rotate(opts.rot);
      if (opts.sx) ctx.scale(opts.sx, 1);
      ctx.font = (opts.weight || 700) + " " + size + "px " + FONT;
      ctx.textAlign = opts.align || "center"; ctx.textBaseline = "middle";
      if (opts.stroke) { ctx.lineWidth = opts.strokeW || size * 0.18; ctx.strokeStyle = opts.stroke; ctx.lineJoin = "round"; ctx.strokeText(str, 0, 0); }
      ctx.fillStyle = color; ctx.fillText(str, 0, 0);
      ctx.restore();
    }

    const BG_TOP = "#071331", BG_BOT = "#0e2660", FLOOR = "#163a82", LINE = "#ffffff";
    function drawBackground() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, BG_TOP); g.addColorStop(1, BG_BOT);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // stands: a few faint tier lines and a row of ceiling lights, drawn as line art
      layer(0.55, 0.5, 2.7);
      const cx0 = cam.x * 0.55;
      ctx.strokeStyle = "rgba(255,255,255,0.09)"; ctx.lineWidth = 0.05;
      ctx.beginPath();
      for (let r = 0; r < 7; r++) { const y = 0.5 + r * 0.7; ctx.moveTo(cx0 - 60, y); ctx.lineTo(cx0 + 60, y); }
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      for (let r = 0; r < 6; r++) for (let x = Math.floor(cx0 - 40); x < cx0 + 40; x += 0.7) {
        ctx.beginPath(); ctx.arc(x + (r % 2) * 0.35, 0.82 + r * 0.7, 0.16, 0, Math.PI * 2); ctx.fill();
      }
      layer(0.3, 0.5, 2.75);
      const xl = cam.x * 0.3;
      for (let x = Math.floor((xl - 40) / 4) * 4; x < xl + 40; x += 4) {
        ctx.beginPath(); ctx.arc(x, 17.5, 0.22, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fill();
      }
    }
    function dimBackdrop() {}

    // The floor is drawn as a real court seen from above at an angle: floor point (x along the
    // court, z toward the viewer) → screen. Players, ball and hoop stand on the z = 0 line.
    const DEPTH = 0.26, SPREAD = 0.05;
    function fp(x, z) { return [cam.x + (x - cam.x) * (1 + z * SPREAD), -z * DEPTH]; }
    function floorPath(pts) {
      ctx.beginPath();
      pts.forEach(function (q, i) { const r = fp(q[0], q[1]); if (i) ctx.lineTo(r[0], r[1]); else ctx.moveTo(r[0], r[1]); });
    }
    function arcPts(cx, cz, r, a0, a1, n) {
      const out = [];
      for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
      return out;
    }
    function drawCourt() {
      layer(1);
      const BASE = 1.575, FAR = BASE - 28, HALF = BASE - 14, FT = BASE - 5.8, SIDE = 7.5;
      const xa = cam.x - 60, xb = cam.x + 60;
      const fillPath = function (pts, col) { floorPath(pts); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); };
      const line = function (pts) { floorPath(pts); ctx.stroke(); };
      fillPath([[xa, -SIDE - 0.9], [xb, -SIDE - 0.9], [xb, SIDE + 3], [xa, SIDE + 3]], "#0b2154");
      ctx.strokeStyle = GOLD; ctx.lineWidth = 0.05; line([[xa, -SIDE - 0.9], [xb, -SIDE - 0.9]]);
      fillPath([[FAR, -SIDE], [BASE, -SIDE], [BASE, SIDE], [FAR, SIDE]], FLOOR);
      ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 0.03;
      for (let z = -SIDE + 0.6; z < SIDE; z += 0.6) line([[FAR, z], [BASE, z]]);
      fillPath([[FT, -2.45], [BASE, -2.45], [BASE, 2.45], [FT, 2.45]], "rgba(255,255,255,0.07)");
      fillPath([[FAR, -2.45], [FAR + 5.8, -2.45], [FAR + 5.8, 2.45], [FAR, 2.45]], "rgba(255,255,255,0.07)");
      ctx.strokeStyle = LINE; ctx.lineWidth = 0.055; ctx.lineJoin = "round"; ctx.lineCap = "round";
      line([[FAR, -SIDE], [BASE, -SIDE], [BASE, SIDE], [FAR, SIDE], [FAR, -SIDE]]);
      line([[HALF, -SIDE], [HALF, SIDE]]);
      line([[FT, -2.45], [BASE, -2.45]]); line([[FT, 2.45], [BASE, 2.45]]); line([[FT, -2.45], [FT, 2.45]]);
      line(arcPts(FT, 0, 1.8, Math.PI / 2, Math.PI * 1.5, 24));
      ctx.setLineDash([0.3, 0.25]); line(arcPts(FT, 0, 1.8, Math.PI * 1.5, Math.PI * 2.5, 24)); ctx.setLineDash([]);
      line(arcPts(0, 0, 1.25, Math.PI / 2, Math.PI * 1.5, 24));
      const a3 = Math.asin(6.6 / 6.75);
      line([[BASE, -6.6], [-Math.cos(a3) * 6.75, -6.6]]);
      line([[BASE, 6.6], [-Math.cos(a3) * 6.75, 6.6]]);
      line(arcPts(0, 0, 6.75, Math.PI - a3, Math.PI + a3, 60));
      line([[FAR + 5.8, -2.45], [FAR + 5.8, 2.45]]);
      line(arcPts(FAR, 0, 6.75, -a3, a3, 60));
      ctx.strokeStyle = GOLD; ctx.lineWidth = 0.07;
      line(arcPts(HALF, 0, 1.8, 0, Math.PI * 2, 48));
      line(arcPts(HALF, 0, 0.6, 0, Math.PI * 2, 32));
    }

    function drawStanchion(fx, tilt, buzzer) {
      layer(1);
      const W_ = LINE;
      poly([[1.15, 0], [2.45, 0], [2.45, 0.85], [1.15, 0.85]], BG_BOT, 0);
      ctx.strokeStyle = W_; ctx.lineWidth = O * 2; ctx.strokeRect(1.15, 0, 1.3, 0.85);
      chain([[1.85, 0.85], [1.85, 3.5], [0.6, 3.5]], 0.12, BG_BOT, W_);
      chain([[1.75, 2.7], [0.62, 3.3]], 0.05, BG_BOT, W_);
      const bp = [[BOARD_X, 2.9], [BOARD_X + 0.14, 2.94], [BOARD_X + 0.14, 4.02], [BOARD_X, 3.98]];
      if (fx > 0) { ctx.save(); ctx.shadowColor = GOLD; ctx.shadowBlur = 60 * fx; }
      poly(bp, BG_BOT, 0);
      ctx.strokeStyle = fx > 0.05 ? GOLD : W_; ctx.lineWidth = O * 2.5; ctx.lineJoin = "round";
      ctx.beginPath(); bp.forEach(function (q, i) { i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.stroke();
      if (fx > 0) ctx.restore();
      chain([[BOARD_X + 0.02, 3.08], [BOARD_X + 0.02, 3.52]], 0.02, W_, W_);
      if (buzzer > 0) {
        ctx.save(); ctx.shadowColor = "#ff3b30"; ctx.shadowBlur = 40 * buzzer;
        ctx.strokeStyle = "rgba(255, 70, 60," + (0.4 + 0.6 * buzzer).toFixed(2) + ")"; ctx.lineWidth = 0.07;
        ctx.beginPath(); bp.forEach(function (q, i) { i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.stroke();
        ctx.restore();
      }
      const a = rimPt(RIM_R, 0, tilt);
      chain([a, [BOARD_X, 3.02]], 0.04, GOLD, BG_BOT);
    }

    // net rings (rim plane coords), deformed by the ball and the swish whip
    const NR = 7, NS = 14;
    function netPoints(p, ball, tilt, time) {
      const pts = [];
      const last = p >= SCORE2 ? SCORE2 : p >= SCORE1 ? SCORE1 : -1;
      const dt = last > 0 ? (p - last) * 80 : 99;
      const whip = dt < 12 ? Math.exp(-dt * 0.45) : 0;
      const inside = Math.abs(ball.x - RIM[0]) < 0.3;
      for (let i = 0; i < NR; i++) {
        const t = i / (NR - 1);
        let r = lerp(RIM_R, 0.13, Math.pow(t, 0.8));
        let yy = -0.46 * t;
        const ringY = RIM[1] + yy;
        if (inside && i > 0) {
          const d = (ringY - ball.y) / 0.15, k = 1 - d * d;
          if (k > 0) { r = Math.max(r, 0.14 * Math.sqrt(k) + 0.012); yy -= 0.05 * k; }
        }
        if (whip > 0 && i > 0) { r *= 1 + 0.3 * whip * Math.sin(dt * 1.6 - t * 2.4) * t; yy += 0.12 * whip * Math.sin(dt * 1.3 - t * 2) * t * t; }
        const sway = 0.008 * t * Math.sin(time * 1.4 + i * 0.7);
        const ring = [];
        for (let j = 0; j < NS; j++) {
          const a = ((j + (i % 2) * 0.5) / NS) * Math.PI * 2;
          const base = rimPt(Math.cos(a) * r + sway, Math.sin(a) * r, tilt);
          ring.push({ x: base[0], y: base[1] + yy, front: Math.sin(a) < 0 });
        }
        pts.push(ring);
      }
      return pts;
    }
    function drawNet(pts, front) {
      ctx.lineCap = "round";
      for (const pass of [0, 1]) {
        ctx.beginPath();
        for (let i = 0; i < NR - 1; i++) for (let j = 0; j < NS; j++) {
          const a = pts[i][j];
          const jn = i % 2 === 0 ? (j - 1 + NS) % NS : (j + 1) % NS;
          for (const b of [pts[i + 1][j], pts[i + 1][jn]]) {
            if ((a.front && b.front) !== front) continue;
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          }
        }
        ctx.strokeStyle = pass ? (front ? "#ffffff" : "rgba(255,255,255,0.55)") : BG_BOT;
        ctx.lineWidth = pass ? 0.018 : 0.018 + O * 1.6;
        ctx.stroke();
      }
    }
    function drawRim(tilt, half) {
      // half: "back" (top of ellipse) or "front"
      const pts = [];
      for (let k = 0; k <= 32; k++) {
        const a = half === "back" ? (k / 32) * Math.PI : Math.PI + (k / 32) * Math.PI;
        pts.push(rimPt(Math.cos(a) * RIM_R, Math.sin(a) * RIM_R, tilt));
      }
      chain(pts, 0.035, half === "back" ? "#c98d1c" : GOLD, BG_BOT);
    }

    // Line-art player. KING: solid white figure, gold jersey. Rivals: hollow outline figure.
    function drawPerson(J, look, ballFn) {
      const td = J.td, f = J.f;
      const out = look.outline, fill = look.fill, back = look.back, lw = look.lw;
      const mid = function (a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; };
      // back leg + back arm
      chain([J.hip, J.kneeB, J.ankB, J.toeB], lw, back, out);
      chain([J.shB, J.elbB, J.handB], lw * 0.85, back, out);
      // shorts + torso
      chain([J.hip, mid(J.hip, J.kneeB, 0.45)], lw * 1.9, look.shorts, out);
      chain([add(J.hip, td, 0.04), add(J.hip, [-td[0], -td[1]], 0.1)], 0.3, look.shorts, out);
      chain([add(J.hip, td, 0.12), add(J.hip, td, L.torso - 0.06)], 0.3, look.jersey, out);
      const nm = add(J.hip, td, 0.33);
      text(look.number, nm[0], nm[1], 0.19, look.numColor, { rot: Math.atan2(td[0], td[1]) });
      // neck + head
      chain([add(J.shoulder, td, -0.02), J.neck], lw * 0.9, fill, out);
      circle(J.headC[0], J.headC[1], L.head, fill, false);
      ctx.beginPath(); ctx.arc(J.headC[0], J.headC[1], L.head, 0, Math.PI * 2); ctx.strokeStyle = out; ctx.lineWidth = O * 2; ctx.stroke();
      // front leg
      chain([J.hip, J.kneeF, J.ankF, J.toeF], lw * 1.05, fill, out);
      chain([J.hip, mid(J.hip, J.kneeF, 0.45)], lw * 1.95, look.shorts, out);
      if (ballFn) ballFn();
      // front arm
      chain([J.shoulder, J.elbF, J.handF], lw * 0.9, fill, out);
    }
    const PLAYER = { fill: "#ffffff", back: "#b9c6e2", outline: "#0b1d4a", shorts: "#ffffff", jersey: GOLD, number: "16", numColor: "#0b1d4a", lw: 0.11 };
    const DEFENDER = { fill: "#0e2660", back: "#0b1f4f", outline: "#ffffff", shorts: "#0e2660", jersey: "#0e2660", number: "00", numColor: "#ffffff", lw: 0.11 };

    function drawBall(b) {
      const r = 0.121;
      circle(b.x, b.y, r, GOLD, false);
      ctx.save();
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.clip();
      ctx.translate(b.x, b.y); ctx.rotate(b.spin);
      ctx.strokeStyle = "#0b1d4a"; ctx.lineWidth = O * 1.3;
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r);
      ctx.moveTo(-r * 0.7, -r); ctx.quadraticCurveTo(-r * 0.15, 0, -r * 0.7, r);
      ctx.moveTo(r * 0.7, -r); ctx.quadraticCurveTo(r * 0.15, 0, r * 0.7, r);
      ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.strokeStyle = "#0b1d4a"; ctx.lineWidth = O * 2; ctx.stroke();
    }
    function shadow(x, h, w) {
      const s = Math.max(0.35, 1 - h * 0.35);
      ctx.beginPath(); ctx.ellipse(x, 0.02, w * s, 0.07 * s, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 6, 24, " + (0.35 * s).toFixed(3) + ")"; ctx.fill();
    }
    // comic "action lines" radiating from the rim on a score
    function burst(x, y, scale, alpha, spikes) {
      if (alpha <= 0) return;
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = GOLD; ctx.lineCap = "round"; ctx.lineWidth = 0.05;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2 + 0.15;
        const r0 = scale * (0.45 + 0.1 * hash(i)), r1 = scale * (0.9 + 0.25 * hash(i + 7));
        ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      }
      ctx.stroke(); ctx.restore();
    }

    /* ---- DOM hooks ---- */
    const beats = Array.prototype.map.call(stage.querySelectorAll("[data-p]"), function (el) {
      const ab = el.getAttribute("data-p").split(",").map(Number);
      return { el: el, a: ab[0], b: ab[1], nums: Array.prototype.slice.call(el.querySelectorAll("[data-to]")), on: false };
    });
    const words = Array.prototype.map.call(stage.querySelectorAll("[data-word]"), function (el) {
      const ab = el.getAttribute("data-word").split(",").map(Number);
      return { el: el, a: ab[0], b: ab[1] };
    });
    const rail = stage.querySelector(".hud__fill");
    const chapters = Array.prototype.slice.call(stage.querySelectorAll("[data-chapter]"));
    const homeEl = stage.querySelector("[data-score-home]");
    const awayEl = stage.querySelector("[data-score-away]");
    const periodEl = stage.querySelector("[data-period]");
    const pbpEl = stage.querySelector("[data-pbp]");
    const boardEl = stage.querySelector(".board");
    const PBP = [
      [0, "KING ball, down 4. 24 seconds left."],
      [0.12, "Defense closes out. #16 squares up from deep\u2026"],
      [0.24, "#16 rises for three\u2026 shot is up!"],
      [SCORE1, "GOOD! KING within one, 87\u201388!"],
      [0.47, "Rivals bring it up, 14 seconds left. KING needs a stop\u2026"],
      [STEAL, "STOLEN by #16! He\u2019s off the other way!"],
      [0.62, "#16 in the open floor, Rivals guard chasing\u2026"],
      [0.74, "#16 takes off, chase-down coming\u2026"],
      [SCORE2, "THROWS IT DOWN AT THE BUZZER! KING WINS!"],
      [0.9, "FINAL: KING 89, Rivals 88."],
    ];
    let lastPbp = "";
    function gameClock(p) {
      if (p <= SCORE1) return 24 - 10 * (p / SCORE1);
      if (p <= 0.555) return 14 - 5 * range(p, SCORE1, 0.555);
      return Math.max(0, 9 - 9 * range(p, 0.555, 0.866));
    }
    const clockEl = stage.querySelector("[data-clock]");
    const flashEl = stage.querySelector(".stage__flash");
    const loader = stage.querySelector(".stage__loader");
    function fmt(n, el) { return (el.getAttribute("data-prefix") || "") + Math.round(n).toLocaleString() + (el.getAttribute("data-suffix") || ""); }
    function updateDOM(p) {
      const fw = 0.011;
      for (const b of beats) {
        const fin = b.a <= 0 ? 1 : sstep(range(p, b.a - fw, b.a + fw));
        const fout = b.b >= 1 ? 1 : 1 - sstep(range(p, b.b - fw, b.b + fw));
        const al = Math.min(fin, fout), on = al > 0.01;
        if (on !== b.on) { b.el.classList.toggle("is-on", on); b.on = on; }
        if (on) {
          b.el.style.opacity = al.toFixed(3);
          b.el.style.transform = "translate3d(0," + ((1 - fin) * 40 - (1 - fout) * 40).toFixed(1) + "px,0)";
          for (const n of b.nums) n.textContent = fmt(+n.getAttribute("data-to") * easeOut(range(p, b.a, b.a + 0.03)), n);
        }
      }
      for (const w of words) {
        const q = range(p, w.a, w.b);
        const al = q <= 0 || q >= 1 ? 0 : Math.min(1, q * 6, (1 - q) * 3);
        w.el.style.opacity = al.toFixed(3);
        const pop = q < 0.12 ? easeOut(q / 0.12) * 1.15 : 1.15 - Math.min(0.15, (q - 0.12) * 0.6);
        w.el.style.transform = "rotate(-6deg) scale(" + (0.4 + 0.6 * pop).toFixed(3) + ")";
        w.el.style.visibility = al > 0 ? "visible" : "hidden";
      }
      if (rail) rail.style.transform = "scaleY(" + p.toFixed(4) + ")";
      chapters.forEach(function (c) { const ab = c.getAttribute("data-chapter").split(",").map(Number); c.classList.toggle("is-active", p >= ab[0] && p < ab[1]); });
      if (homeEl) {
        homeEl.textContent = p >= SCORE2 ? "89" : p >= SCORE1 ? "87" : "84";
        homeEl.classList.toggle("is-hot", (p >= SCORE1 && p < SCORE1 + 0.04) || p >= SCORE2);
      }
      if (awayEl) awayEl.textContent = "88";
      const gc = gameClock(p);
      if (clockEl) clockEl.textContent = gc >= 10 ? "0:" + String(Math.floor(gc)).padStart(2, "0") : (Math.floor(gc * 10) / 10).toFixed(1);
      const final = p >= 0.866;
      if (periodEl) periodEl.textContent = final ? "Final" : "4th Qtr";
      if (boardEl) boardEl.classList.toggle("is-final", final);
      if (pbpEl) {
        let msg = PBP[0][1];
        for (const e of PBP) if (p >= e[0]) msg = e[1];
        if (msg !== lastPbp) { pbpEl.textContent = msg; lastPbp = msg; }
      }
      if (flashEl) {
        const f = Math.max(p >= SCORE1 ? Math.exp(-(p - SCORE1) * 300) : 0, p >= SCORE2 ? Math.exp(-(p - SCORE2) * 240) : 0);
        flashEl.style.opacity = (f * 0.5).toFixed(3);
      }
    }

    /* ---- frame ---- */
    function frame(p, time) {
      const J = playerAt(p, time);
      const D = defenderAt(p);
      const b = ballAt(p, J, D);
      const tilt = rimTilt(p);
      const c = camAt(p, J, b);
      const wide = W / H >= 1.1;
      const vh = wide ? c.vh : c.vh * Math.pow(0.95 / (W / H), 0.6);
      Z = H / vh;
      O = Math.max(2.2, Math.min(5, Z * 0.018)) / Z;
      OX = wide ? W * 0.15 : 0;
      OY = wide ? 0 : -H * 0.12;
      cam = { x: c.x, y: c.y };
      const f2 = p >= SCORE2 ? Math.exp(-(p - SCORE2) * 70) : 0;
      if (!reduce && f2 > 0.02) { cam.x += Math.sin(time * 61) * f2 * 0.06; cam.y += Math.sin(time * 47) * f2 * 0.06; }
      const f1 = p >= SCORE1 ? Math.exp(-(p - SCORE1) * 60) : 0;
      const fx = Math.max(f1, f2, p >= SCORE2 ? Math.exp(-(p - SCORE2) * 25) * 0.6 : 0);

      drawBackground();
      dimBackdrop();
      drawCourt();
      layer(1);

      // score burst behind the hoop
      const which = p >= SCORE2 ? SCORE2 : SCORE1;
      const bq = range(p, which, which + 0.04);
      if (p >= SCORE1 && bq < 1) burst(RIM[0] + 0.05, RIM[1] + 0.05, 0.4 + easeOut(bq) * (which === SCORE2 ? 2.2 : 1.6), 1 - easeIn(bq), which === SCORE2 ? 14 : 11);

      const BUZZ = 0.866;
      drawStanchion(fx, tilt, p >= BUZZ ? (p < 0.95 ? 0.55 + 0.45 * Math.max(0, Math.sin(time * 9)) : 0.5) : 0);
      // shadows
      shadow(J.hip[0] + 0.05, J.hip[1] - 1.0, 0.45);
      if (D) shadow(D.hip[0], D.hip[1] - 1.0, 0.42);
      shadow(b.x, b.y, 0.14);

      const net = netPoints(p, b, tilt, time);
      drawRim(tilt, "back");
      drawNet(net, false);

      // ball trail on the jumper
      if (p > 0.245 && p < SCORE1) {
        const s = range(p, 0.24, SCORE1), u = lerp(s, easeOut(s), 0.55);
        for (let k = 1; k <= 7; k++) {
          const uu = u - k * 0.035; if (uu < 0) break;
          const q = arc1(uu);
          ctx.beginPath(); ctx.arc(q[0], q[1], 0.121 * (1 - k * 0.09), 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 188, 54," + (0.32 - k * 0.04).toFixed(2) + ")"; ctx.fill();
        }
      }
      // speed lines while driving
      const speed = p > 0.6 && p < 0.86 ? range(p, 0.6, 0.68) * (1 - range(p, 0.82, 0.86)) : 0;
      if (speed > 0) {
        ctx.strokeStyle = "rgba(255,255,255," + (0.55 * speed).toFixed(2) + ")"; ctx.lineWidth = 0.035; ctx.lineCap = "round";
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const yy = J.hip[1] - 0.6 + k * 0.32, len = 0.5 + hash(k) * 0.7, off = 0.5 + frac(time * 1.5 + hash(k + 3)) * 0.4;
          ctx.moveTo(J.hip[0] - off, yy); ctx.lineTo(J.hip[0] - off - len, yy);
        }
        ctx.stroke();
      }

      const ballBehindRim = p >= SCORE1 - 0.012 && p < 0.418 || p >= 0.858 && p < 0.886;
      const ballHeld = p < 0.24 || (p >= 0.566 && p < 0.858);
      if (D) drawPerson(D, DEFENDER, null);
      drawPerson(J, PLAYER, ballHeld ? function () { drawBall(b); } : null);
      if (!ballHeld && ballBehindRim) drawBall(b);
      drawNet(net, true);
      drawRim(tilt, "front");
      if (!ballHeld && !ballBehindRim) drawBall(b);

      // confetti
      const cq = range(p, which, which + 0.07);
      if (p >= SCORE1 && cq < 1) {
        const tt = cq * 1.8;
        ctx.save(); ctx.globalAlpha = Math.min(1, (1 - cq) * 2.5);
        confetti.forEach(function (k, i) {
          const x = RIM[0] + k.vx * tt * 0.6 + Math.sin(tt * 4 + k.sway) * 0.15;
          const y = RIM[1] + 0.2 + k.vy * tt - 4.5 * tt * tt;
          ctx.save(); ctx.translate(x, y); ctx.rotate(k.rot + k.spin * tt);
          ctx.fillStyle = k.c; ctx.fillRect(-k.w / 2, -k.w * 0.3, k.w, k.w * 0.6);
          ctx.restore();
        });
        ctx.restore();
      }
      updateDOM(p);
    }

    /* ---- input + loop ---- */
    let target = 0, prog = 0;
    function readScroll() {
      const r = scrolly.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      target = clamp(total > 0 ? -r.top / total : 0);
    }
    window.addEventListener("scroll", readScroll, { passive: true });
    window.addEventListener("resize", readScroll);
    readScroll(); prog = target;
    let visible = true;
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { rootMargin: "100px" }).observe(scrolly);
    let last = performance.now(), first = true;
    function loop(now) {
      requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      if (!visible && !first) return;
      // gentle easing for slow scrolling, but catch up almost instantly on a fast flick
      const gap = Math.abs(target - prog);
      prog += (target - prog) * (1 - Math.exp(-dt * (reduce ? 30 : 7 + gap * 160)));
      if (Math.abs(target - prog) < 1e-5) prog = target;
      frame(prog, now / 1000);
      if (first) { first = false; if (loader) loader.classList.add("is-done"); }
    }
    requestAnimationFrame(loop);
    window.__kh = { go: function (p) { target = prog = p; }, get p() { return prog; } };
  }

  if (canvas && canvas.getContext) {
    scrolly.classList.add("is-3d");
    try { start(); } catch (err) { console.error(err); scrolly.classList.remove("is-3d"); }
  }
})();
