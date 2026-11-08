/* ============================================================
   Little Pasture — hand-painted ground
   Everything is drawn procedurally on canvas: watercolour washes,
   crayon grass, wobbly hedgerows, a river and a trodden path,
   then the paper edge is nibbled away so the island looks torn.
   ============================================================ */
window.PASTURE = window.PASTURE || {};
(function (P) {
  'use strict';

  var TAU = Math.PI * 2;
  P.TAU = TAU;

  /* ---------- random ---------- */
  P.mulberry32 = function (a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  P.hexA = function (hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  P.clamp = clamp;
  P.lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---------- island outline ---------- */
  P.islandPoints = function (cx, cy, rx, ry, n, count) {
    var pts = [], i, a, ca, sa, ex, ey, w;
    for (i = 0; i < count; i++) {
      a = i / count * TAU;
      ca = Math.cos(a); sa = Math.sin(a);
      ex = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / n);
      ey = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / n);
      w = 1 + 0.020 * Math.sin(a * 3 + 1.1) + 0.014 * Math.sin(a * 5 - 0.4)
            + 0.009 * Math.sin(a * 8 + 2.6) + 0.005 * Math.sin(a * 13 + 0.3);
      pts.push([cx + rx * ex * w, cy + ry * ey * w]);
    }
    return pts;
  };

  function tracePoly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  /* ---------- catmull-rom -> bezier ---------- */
  P.smoothPath = function (ctx, uvPts, W, H) {
    var p = uvPts.map(function (q) { return [q[0] * W, q[1] * H]; });
    var i, p0, p1, p2, p3, c1x, c1y, c2x, c2y;
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (i = 0; i < p.length - 1; i++) {
      p0 = p[i - 1] || p[i];
      p1 = p[i];
      p2 = p[i + 1];
      p3 = p[i + 2] || p2;
      c1x = p1[0] + (p2[0] - p0[0]) / 6;
      c1y = p1[1] + (p2[1] - p0[1]) / 6;
      c2x = p2[0] - (p3[0] - p1[0]) / 6;
      c2y = p2[1] - (p3[1] - p1[1]) / 6;
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
    }
  };

  /* ---------- layout (normalised, v from the top) ---------- */
  /* the plane's texture is v-flipped relative to uvToWorld(), so anything
     with a 3D twin must be painted at 1-v to line up in world space */
  P.layout = {
    river: [
      [0.262, -0.02], [0.258, 0.070], [0.248, 0.155], [0.245, 0.245],
      [0.252, 0.335], [0.243, 0.425], [0.228, 0.515], [0.214, 0.605],
      [0.208, 0.700], [0.216, 0.790], [0.228, 0.880], [0.234, 1.020]
    ],
    path: [
      [0.586, -0.02], [0.578, 0.070], [0.566, 0.160], [0.554, 0.260],
      [0.566, 0.335], [0.626, 0.390], [0.692, 0.452], [0.716, 0.520],
      [0.700, 0.596], [0.638, 0.660], [0.574, 0.716], [0.534, 0.790],
      [0.518, 0.870], [0.522, 1.020]
    ],
    pond: { u: 0.478, v: 0.503, rx: 0.166, ry: 0.186 },
    hedges: [
      [[0.055, 0.205], [0.125, 0.222], [0.190, 0.258], [0.245, 0.272], [0.292, 0.262]],
      [[0.455, 0.015], [0.462, 0.095], [0.448, 0.175], [0.468, 0.255], [0.470, 0.335]],
      [[0.640, 0.052], [0.700, 0.078], [0.760, 0.068], [0.820, 0.092], [0.900, 0.100]],
      [[0.330, 0.700], [0.400, 0.726], [0.470, 0.712], [0.530, 0.742]],
      [[0.700, 0.690], [0.760, 0.712], [0.820, 0.700], [0.880, 0.726]],
      [[0.040, 0.330], [0.130, 0.372], [0.220, 0.352], [0.290, 0.392]],
      [[0.300, 0.860], [0.392, 0.892], [0.500, 0.878], [0.592, 0.915], [0.700, 0.900]],
      [[0.862, 0.010], [0.856, 0.100], [0.870, 0.190], [0.858, 0.280], [0.866, 0.345]],
      [[0.040, 0.615], [0.110, 0.648], [0.180, 0.634], [0.238, 0.660]],
      [[0.120, 0.455], [0.180, 0.482], [0.235, 0.470]],
      [[0.640, 0.815], [0.700, 0.842], [0.760, 0.826], [0.820, 0.852]]
    ],
    sand: { u: 0.752, v: 0.905, rx: 0.128, ry: 0.072 }
  }
  P.layout.riverTex = P.layout.river.map(function (q) { return [q[0], 1 - q[1]]; });


  /* catmull-rom sampling of a layout path, returns n points in uv */
  P.samplePath = function (pts, n) {
    var out = [], m = pts.length, i, k, t, t2, t3, p0, p1, p2, p3, f;
    n = n || 120;
    for (i = 0; i < n; i++) {
      f = (i / (n - 1)) * (m - 1);
      k = Math.min(m - 2, Math.floor(f));
      t = f - k;
      t2 = t * t; t3 = t2 * t;
      p0 = pts[Math.max(0, k - 1)];
      p1 = pts[k]; p2 = pts[k + 1];
      p3 = pts[Math.min(m - 1, k + 2)];
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ]);
    }
    return out;
  };

  /* ============================================================
     paint the ground
     ============================================================ */
  P.pondK = function (phi) {
    return 1 + 0.075 * Math.sin(phi * 3 + 1.1) + 0.042 * Math.sin(phi * 5 - 0.4) + 0.028 * Math.sin(phi * 8 + 2.2);
  };

  P.paintGround = function (W, H) {
    var rnd = P.mulberry32(20261108);
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    g.lineJoin = 'round';
    g.lineCap = 'round';

    var cx = W * 0.5, cy = H * 0.5;
    var RX = W * 0.474, RY = H * 0.472;
    var pts = P.islandPoints(cx, cy, RX, RY, 3.5, 720);

    /* ---------------- base + clip ---------------- */
    g.save();
    tracePoly(g, pts);
    g.clip();

    var base = g.createLinearGradient(W * 0.18, 0, W * 0.72, H);
    base.addColorStop(0.00, '#88ab52');
    base.addColorStop(0.28, '#7fa147');
    base.addColorStop(0.58, '#77993f');
    base.addColorStop(0.82, '#708f3a');
    base.addColorStop(1.00, '#688536');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);

    /* ---------------- broad watercolour washes ---------------- */
    var washes = [
      ['#96b75d', 0.17], ['#83a44b', 0.15], ['#6d8c39', 0.15],
      ['#5f7e30', 0.13], ['#a7c46c', 0.12], ['#7d9d44', 0.14],
      ['#b6ae70', 0.08], ['#557527', 0.11]
    ];
    var i, x, y, r, col, grd;
    for (i = 0; i < 110; i++) {
      x = rnd() * W; y = rnd() * H;
      r = W * (0.045 + rnd() * 0.17);
      col = washes[(rnd() * washes.length) | 0];
      grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, P.hexA(col[0], col[1]));
      grd.addColorStop(0.55, P.hexA(col[0], col[1] * 0.55));
      grd.addColorStop(1, P.hexA(col[0], 0));
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    /* ---------------- large soft colour fields (paper-map feel) ---------------- */
    g.save();
    g.filter = 'blur(26px)';
    for (i = 0; i < 34; i++) {
      x = W * (0.08 + rnd() * 0.84); y = H * (0.06 + rnd() * 0.88);
      var br = W * (0.035 + Math.pow(rnd(), 1.4) * 0.11);
      g.fillStyle = rnd() < 0.55
        ? 'rgba(66,104,30,' + (0.10 + rnd() * 0.10).toFixed(3) + ')'
        : 'rgba(196,216,140,' + (0.07 + rnd() * 0.08).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(x, y, br, br * (0.4 + rnd() * 0.7), rnd() * 3, 0, TAU);
      g.fill();
    }
    g.restore();

    /* ---------------- mid-scale pigment patchwork ---------------- */
    var patchCols = ['#557527', '#a7c46c', '#6b8b38', '#b3ab6d', '#4c6a24', '#8aa851'];
    for (i = 0; i < 320; i++) {
      x = rnd() * W; y = rnd() * H;
      r = W * (0.006 + Math.pow(rnd(), 1.7) * 0.045);
      col = patchCols[(rnd() * patchCols.length) | 0];
      g.fillStyle = P.hexA(col, (0.06 + rnd() * 0.10).toFixed(3));
      g.beginPath();
      g.ellipse(x, y, r, r * (0.45 + rnd() * 0.85), rnd() * Math.PI, 0, TAU);
      g.fill();
    }
    // dusty dry patches
    g.save();
    g.filter = 'blur(22px)';
    for (i = 0; i < 22; i++) {
      x = rnd() * W; y = H * (0.15 + rnd() * 0.8);
      r = W * (0.02 + rnd() * 0.05);
      g.fillStyle = 'rgba(176,166,104,' + (0.07 + rnd() * 0.08).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(x, y, r, r * 0.62, rnd() * 3, 0, TAU);
      g.fill();
    }
    g.restore();

    /* ---------------- big soft brush sweeps ---------------- */
    g.save();
    g.filter = 'blur(46px)';
    for (i = 0; i < 16; i++) {
      x = W * (0.1 + rnd() * 0.8);
      y = H * (0.1 + rnd() * 0.8);
      var rr = W * (0.10 + rnd() * 0.16);
      g.fillStyle = rnd() < 0.5 ? 'rgba(198,232,138,0.14)' : 'rgba(80,138,46,0.13)';
      g.beginPath();
      g.ellipse(x, y, rr, rr * (0.35 + rnd() * 0.5), rnd() * 3, 0, TAU);
      g.fill();
    }
    g.restore();

    /* ---------------- darker edges / depth ---------------- */
    var corners = [
      [0.06, 0.06, 0.30], [0.94, 0.06, 0.26], [0.04, 0.94, 0.34],
      [0.96, 0.94, 0.30], [0.5, 1.02, 0.34]
    ];
    for (i = 0; i < corners.length; i++) {
      var cc = corners[i];
      x = cc[0] * W; y = cc[1] * H;
      r = Math.max(W, H) * cc[2];
      grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(64,112,34,0.20)');
      grd.addColorStop(1, 'rgba(64,112,34,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    /* ---------------- hedgerows ---------------- */
    function hedge(uv, width, alpha) {
      var jitter, k;
      // wide, soft shade — reads as the shadow of a bank of grass
      g.save();
      g.filter = 'blur(34px)';
      g.strokeStyle = 'rgba(44,84,26,' + (alpha * 0.44).toFixed(3) + ')';
      g.lineWidth = width * 7.5;
      P.smoothPath(g, uv, W, H);
      g.stroke();
      g.restore();
      // soft dark halo
      g.save();
      g.filter = 'blur(9px)';
      g.strokeStyle = 'rgba(48,92,24,' + (alpha * 0.50).toFixed(3) + ')';
      g.lineWidth = width * 3.0;
      P.smoothPath(g, uv, W, H);
      g.stroke();
      g.restore();
      // crayon core, twice with jitter
      for (k = 0; k < 2; k++) {
        jitter = uv.map(function (q) {
          return [q[0] + (rnd() - 0.5) * 0.0035, q[1] + (rnd() - 0.5) * 0.0035];
        });
        g.strokeStyle = 'rgba(46,88,22,' + (alpha * (k ? 0.55 : 0.78)).toFixed(3) + ')';
        g.lineWidth = width * (k ? 0.5 : 0.95);
        P.smoothPath(g, jitter, W, H);
        g.stroke();
      }
      // dry-brush highlight along one side
      g.save();
      g.filter = 'blur(3px)';
      g.strokeStyle = 'rgba(190,222,130,0.16)';
      g.lineWidth = width * 0.9;
      P.smoothPath(g, uv.map(function (q) { return [q[0] + 0.0035, q[1] - 0.0026]; }), W, H);
      g.stroke();
      g.restore();
    }

    var hw = W * 0.0096;
    for (i = 0; i < P.layout.hedges.length; i++) {
      hedge(P.layout.hedges[i], hw * (0.8 + rnd() * 0.4), 0.62 + rnd() * 0.16);
    }

    /* ---------------- grass detail (crayon) ---------------- */
    var n;
    var S = W / 2048;          // detail scale for a larger pasture
    var DN = S * S * 1.85;     // extra density: the pasture grew faster than the sheet
    // bold crayon blades — wide enough to survive downscaling
    for (n = 0; n < 5200 * DN; n++) {
      x = rnd() * W; y = rnd() * H;
      if (nearRiver(x, y, W, H, 0.012)) continue;
      var len = (16 + rnd() * 54) * Math.sqrt(S);
      var ang = -1.15 + rnd() * 1.35;
      var light = rnd() < 0.46;
      g.strokeStyle = light
        ? 'rgba(186,212,132,' + (0.10 + rnd() * 0.17).toFixed(3) + ')'
        : 'rgba(46,82,22,' + (0.08 + rnd() * 0.15).toFixed(3) + ')';
      g.lineWidth = (3.2 + rnd() * 9.0) * S;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(
        x + Math.cos(ang) * len * 0.5 + (rnd() - 0.5) * 6,
        y + Math.sin(ang) * len * 0.5 + (rnd() - 0.5) * 6,
        x + Math.cos(ang) * len, y + Math.sin(ang) * len
      );
      g.stroke();
    }
    // long dry-brush sweeps
    for (n = 0; n < 220 * DN; n++) {
      x = rnd() * W; y = rnd() * H;
      var bl = 50 + rnd() * 210;
      var ba = -0.85 + rnd() * 1.7;
      g.strokeStyle = rnd() < 0.55
        ? 'rgba(206,232,142,' + (0.05 + rnd() * 0.07).toFixed(3) + ')'
        : 'rgba(62,106,28,' + (0.045 + rnd() * 0.06).toFixed(3) + ')';
      g.lineWidth = (6 + rnd() * 12) * S;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(
        x + Math.cos(ba) * bl * 0.5 + (rnd() - 0.5) * 40,
        y + Math.sin(ba) * bl * 0.5 + (rnd() - 0.5) * 26,
        x + Math.cos(ba) * bl, y + Math.sin(ba) * bl
      );
      g.stroke();
    }
    // soft dabs of pigment
    for (n = 0; n < 1900 * DN; n++) {
      x = rnd() * W; y = rnd() * H;
      r = 3 + rnd() * 16;
      g.fillStyle = rnd() < 0.5
        ? 'rgba(190,222,124,' + (0.05 + rnd() * 0.09).toFixed(3) + ')'
        : 'rgba(64,110,30,' + (0.04 + rnd() * 0.08).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(x, y, r, r * (0.5 + rnd() * 0.7), rnd() * 3, 0, TAU);
      g.fill();
    }
    // fine speckle (paper tooth)
    for (n = 0; n < 9000 * DN; n++) {
      x = rnd() * W; y = rnd() * H;
      g.fillStyle = 'rgba(248,252,212,' + (0.03 + rnd() * 0.07).toFixed(3) + ')';
      g.fillRect(x, y, 2.0, 2.0);
    }
    // darker crayon scribbles that read like brush strokes
    g.save();
    g.filter = 'blur(2px)';
    for (n = 0; n < 70 * DN; n++) {
      x = rnd() * W; y = rnd() * H;
      r = 16 + rnd() * 58;
      g.strokeStyle = 'rgba(88,136,44,' + (0.05 + rnd() * 0.07).toFixed(3) + ')';
      g.lineWidth = 4 + rnd() * 6;
      g.beginPath();
      g.arc(x, y, r, rnd() * 6, rnd() * 2 + 0.6);
      g.stroke();
    }
    g.restore();

    /* ---------------- tiny flowers ---------------- */
    for (n = 0; n < 90 * DN; n++) {
      x = rnd() * W; y = rnd() * H;
      if (nearRiver(x, y, W, H, 0.02)) continue;
      var fr = 1.6 + rnd() * 1.6;
      g.fillStyle = rnd() < 0.45 ? 'rgba(255,252,228,0.85)' : 'rgba(252,236,160,0.8)';
      g.beginPath();
      g.arc(x, y, fr, 0, TAU);
      g.fill();
    }

    /* ---------------- river ---------------- */
    var rv = P.layout.riverTex || P.layout.river;
    // bank shadow
    g.save();
    g.filter = 'blur(12px)';
    g.strokeStyle = 'rgba(60,108,36,0.26)';
    g.lineWidth = W * 0.070;
    P.smoothPath(g, rv.map(function (q) { return [q[0] + 0.005, q[1]]; }), W, H);
    g.stroke();
    g.restore();
    // soft outer water edge
    g.save();
    g.filter = 'blur(4px)';
    g.strokeStyle = 'rgba(58,96,146,0.62)';
    g.lineWidth = W * 0.058;
    P.smoothPath(g, rv, W, H);
    g.stroke();
    g.restore();
    // water body — layered translucent washes
    g.save();
    g.globalAlpha = 1.0;
    g.strokeStyle = '#3f6ca3';
    g.lineWidth = W * 0.050;
    P.smoothPath(g, rv, W, H);
    g.stroke();
    g.globalAlpha = 0.95;
    g.strokeStyle = '#4370a6';
    g.lineWidth = W * 0.040;
    P.smoothPath(g, rv.map(function (q) { return [q[0] - 0.0015, q[1]]; }), W, H);
    g.stroke();
    g.globalAlpha = 0.62;
    g.strokeStyle = '#5d8bba';
    g.lineWidth = W * 0.024;
    P.smoothPath(g, rv.map(function (q) { return [q[0] - 0.004, q[1]]; }), W, H);
    g.stroke();
    g.restore();
    // light current in the middle
    g.save();
    g.globalAlpha = 0.55;
    g.strokeStyle = '#8db6dd';
    g.lineWidth = W * 0.007;
    P.smoothPath(g, rv.map(function (q) { return [q[0] - 0.003, q[1]]; }), W, H);
    g.stroke();
    g.globalAlpha = 0.26;
    g.strokeStyle = '#ffffff';
    g.lineWidth = W * 0.0034;
    P.smoothPath(g, rv.map(function (q) { return [q[0] - 0.006, q[1] - 0.004]; }), W, H);
    g.stroke();
    g.restore();
    // paper-white lip on the near bank
    g.save();
    g.filter = 'blur(2px)';
    g.globalAlpha = 0.28;
    g.strokeStyle = '#f4f6e6';
    g.lineWidth = W * 0.0035;
    P.smoothPath(g, rv.map(function (q) { return [q[0] + 0.0205, q[1]]; }), W, H);
    g.stroke();
    g.restore();
    // watercolour mottling on the water
    for (n = 0; n < 220; n++) {
      var t = rnd();
      var seg = t * (rv.length - 1);
      var si = Math.min(rv.length - 2, seg | 0);
      var f = seg - si;
      var rx = P.lerp(rv[si][0], rv[si + 1][0], f) * W;
      var ry = P.lerp(rv[si][1], rv[si + 1][1], f) * H;
      var off = (rnd() - 0.5) * W * 0.041;
      x = rx + off; y = ry + (rnd() - 0.5) * 26;
      r = 2 + rnd() * 7;
      g.fillStyle = rnd() < 0.5 ? 'rgba(190,224,250,0.16)' : 'rgba(44,104,170,0.13)';
      g.beginPath();
      g.ellipse(x, y, r, r * 0.6, 0, 0, TAU);
      g.fill();
    }
    // foam flecks at the banks
    for (n = 0; n < 90; n++) {
      var t2 = rnd();
      var seg2 = t2 * (rv.length - 1);
      var sj = Math.min(rv.length - 2, seg2 | 0);
      var fj = seg2 - sj;
      var bx = P.lerp(rv[sj][0], rv[sj + 1][0], fj) * W + (rnd() < 0.5 ? -1 : 1) * W * (0.020 + rnd() * 0.006);
      var by = P.lerp(rv[sj][1], rv[sj + 1][1], fj) * H + (rnd() - 0.5) * 30;
      g.fillStyle = 'rgba(240,250,255,' + (0.25 + rnd() * 0.4).toFixed(2) + ')';
      g.beginPath();
      g.ellipse(bx, by, 1 + rnd() * 2.6, 1 + rnd() * 1.6, rnd() * 3, 0, TAU);
      g.fill();
    }

    /* ---------------- trodden path ---------------- */
    var pth = P.layout.path;
    g.save();
    g.filter = 'blur(10px)';
    g.strokeStyle = 'rgba(196,170,112,0.30)';
    g.lineWidth = W * 0.064;
    P.smoothPath(g, pth, W, H);
    g.stroke();
    g.restore();

    g.strokeStyle = '#d8c28c';
    g.lineWidth = W * 0.047;
    P.smoothPath(g, pth, W, H);
    g.stroke();
    g.strokeStyle = '#e2cd99';
    g.lineWidth = W * 0.038;
    P.smoothPath(g, pth, W, H);
    g.stroke();
    g.save();
    g.globalAlpha = 0.55;
    g.strokeStyle = '#f1e3bb';
    g.lineWidth = W * 0.016;
    P.smoothPath(g, pth.map(function (q) { return [q[0] - 0.003, q[1]]; }), W, H);
    g.stroke();
    g.restore();

    // path speckles / pebbles
    for (n = 0; n < 900 * DN; n++) {
      var tp = rnd();
      var sp2 = tp * (pth.length - 1);
      var sk = Math.min(pth.length - 2, sp2 | 0);
      var fk = sp2 - sk;
      var px = P.lerp(pth[sk][0], pth[sk + 1][0], fk) * W + (rnd() - 0.5) * W * 0.055;
      var py = P.lerp(pth[sk][1], pth[sk + 1][1], fk) * H + (rnd() - 0.5) * 24;
      g.fillStyle = rnd() < 0.5 ? 'rgba(198,168,110,0.35)' : 'rgba(255,246,214,0.5)';
      g.beginPath();
      g.ellipse(px, py, 0.8 + rnd() * 2.2, 0.8 + rnd() * 1.6, rnd() * 3, 0, TAU);
      g.fill();
    }
    // grass nibbling at the edges of the track
    for (n = 0; n < 900; n++) {
      var tq = rnd(), sg3 = Math.min(pth.length - 2, (tq * (pth.length - 1)) | 0);
      var sf = tq * (pth.length - 1) - sg3;
      var ex = P.lerp(pth[sg3][0], pth[sg3 + 1][0], sf) * W + (rnd() < 0.5 ? -1 : 1) * W * (0.019 + rnd() * 0.012);
      var ey = P.lerp(pth[sg3][1], pth[sg3 + 1][1], sf) * H + (rnd() - 0.5) * 26;
      var el = 2 + rnd() * 7;
      g.strokeStyle = 'rgba(104,150,52,' + (0.18 + rnd() * 0.28).toFixed(2) + ')';
      g.lineWidth = 1.2 + rnd() * 2;
      g.beginPath();
      g.moveTo(ex, ey);
      g.lineTo(ex + (rnd() - 0.5) * 4, ey - el);
      g.stroke();
    }

    /* ---------------- sandy patch ---------------- */
    var sd = P.layout.sand;
    var sandPts = [];
    (function () {
      var k, ang, rr, rad;
      for (k = 0; k < 64; k++) {
        ang = k / 64 * TAU;
        rad = 1 + 0.10 * Math.sin(ang * 3 + 0.7) + 0.07 * Math.sin(ang * 5 - 1.2) + 0.05 * Math.sin(ang * 9 + 0.2);
        sandPts.push([
          (sd.u + Math.cos(ang) * sd.rx * rad) * W,
          (sd.v + Math.sin(ang) * sd.ry * rad) * H
        ]);
      }
    })();
    g.beginPath();
    g.moveTo(sandPts[0][0], sandPts[0][1]);
    for (i = 1; i < sandPts.length; i++) g.lineTo(sandPts[i][0], sandPts[i][1]);
    g.closePath();
    g.save();
    g.filter = 'blur(5px)';
    g.fillStyle = 'rgba(168,140,82,0.34)';
    g.fill();
    g.restore();
    g.fillStyle = '#d5bf90';
    g.fill();
    g.save();
    g.clip();
    for (n = 0; n < 700 * DN; n++) {
      x = (sd.u + (rnd() - 0.5) * sd.rx * 2.2) * W;
      y = (sd.v + (rnd() - 0.5) * sd.ry * 2.4) * H;
      g.fillStyle = rnd() < 0.5 ? 'rgba(206,176,116,0.5)' : 'rgba(238,218,170,0.45)';
      g.beginPath();
      g.ellipse(x, y, 1 + rnd() * 5, 1 + rnd() * 3, rnd() * 3, 0, TAU);
      g.fill();
    }
    g.restore();
    // soft rim of the sand patch
    g.save();
    g.filter = 'blur(4px)';
    g.strokeStyle = 'rgba(150,128,70,0.35)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(sandPts[0][0], sandPts[0][1]);
    for (i = 1; i < sandPts.length; i++) g.lineTo(sandPts[i][0], sandPts[i][1]);
    g.closePath();
    g.stroke();
    g.restore();

    /* ---------------- pond (bank colouring; the hole is cut later) -------------- */
    /* the outline is a gentle, irregular lobed curve — the 3D basin samples the same one */
    var pd = P.layout.pond;
    var PX = pd.u * W, PY = pd.v * H, PRX = pd.rx * W, PRY = pd.ry * H;
    function pondPath(ctx, k, wob) {
      var j, a, rr, qx, qy;
      wob = wob === undefined ? 0.05 : wob;
      ctx.beginPath();
      for (j = 0; j <= 108; j++) {
        a = j / 108 * TAU;
        // canvas y runs opposite to world z, so the world-space angle is -a
        rr = P.pondK(-a) / P.pondK(0) * (1 + wob * Math.sin(a * 3 + 1.1));
        qx = PX + Math.cos(a) * PRX * k * rr;
        qy = PY + Math.sin(a) * PRY * k * rr;
        if (j === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
      }
      ctx.closePath();
    }
    // damp soil ring around the water
    g.save();
    g.filter = 'blur(18px)';
    g.strokeStyle = 'rgba(92,78,50,0.40)';
    g.lineWidth = W * 0.026;
    pondPath(g, 1.055);
    g.stroke();
    g.restore();
    // wet sandy lip
    g.save();
    g.filter = 'blur(7px)';
    g.strokeStyle = 'rgba(178,166,120,0.30)';
    g.lineWidth = W * 0.0075;
    pondPath(g, 1.004);
    g.stroke();
    g.restore();
    // dark water edge just inside the rim
    g.save();
    g.filter = 'blur(8px)';
    g.strokeStyle = 'rgba(38,70,74,0.60)';
    g.lineWidth = W * 0.014;
    pondPath(g, 0.998);
    g.stroke();
    g.restore();
    // reeds / wet grass tufts along the shore
    for (n = 0; n < 420; n++) {
      var ra = rnd() * TAU;
      var rk = 1.02 + rnd() * 0.06;
      var sxs = PX + Math.cos(ra) * PRX * rk;
      var sys = PY + Math.sin(ra) * PRY * rk;
      var sl = (6 + rnd() * 22) * S;
      g.strokeStyle = rnd() < 0.55
        ? 'rgba(78,124,48,' + (0.18 + rnd() * 0.3).toFixed(2) + ')'
        : 'rgba(148,168,92,' + (0.14 + rnd() * 0.22).toFixed(2) + ')';
      g.lineWidth = (1.4 + rnd() * 2.2) * S;
      g.beginPath();
      g.moveTo(sxs, sys);
      g.lineTo(sxs + (rnd() - 0.5) * 6 * S, sys - sl);
      g.stroke();
    }


    g.save();
    g.filter = 'blur(16px)';
    g.globalCompositeOperation = 'multiply';
    for (i = 0; i < P.layout.hedges.length; i++) {
      g.strokeStyle = 'rgba(214,228,188,0.55)';
      g.lineWidth = hw * 2.0;
      P.smoothPath(g, P.layout.hedges[i].map(function (q) { return [q[0] + 0.005, q[1] + 0.006]; }), W, H);
      g.stroke();
    }
    g.restore();

    /* ---------------- overall pigment density ---------------- */
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgba(226,226,214,1)';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';

    g.restore(); // unclip

    /* river banks are 3D strips in app.js */

    /* ---------------- sandy banks along the river (painted, symmetric) ---------------- */
    (function riverShore() {
      var RVR = P.layout.riverTex || P.layout.river;
      var band = 1.25 / 74 * W;
      var rndS = P.mulberry32(4477);
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      var pass = [
        [band * 2.60, 'rgba(158,138,98,0.58)', 22],
        [band * 1.95, 'rgba(176,156,116,0.74)', 15],
        [band * 1.35, 'rgba(192,172,128,0.86)', 9],
        [band * 0.85, 'rgba(204,186,142,0.92)', 4]
      ];
      for (var pi = 0; pi < pass.length; pi++) {
        g.filter = 'blur(' + pass[pi][2] + 'px)';
        g.strokeStyle = pass[pi][1];
        g.lineWidth = W * 0.0455 + pass[pi][0];
        P.smoothPath(g, RVR, W, H);
        g.stroke();
      }
      g.filter = 'none';
      var samp = P.samplePath(RVR, 260);
      for (var si2 = 0; si2 < 460; si2++) {
        var pp = samp[(rndS() * 259) | 0];
        var side2 = rndS() < 0.5 ? -1 : 1;
        var off2 = (W * 0.0227) + 0.20 / 74 * W + rndS() * band * 1.1;
        var qx2 = pp[0] + side2 * off2;
        var qy2 = pp[1] + (rndS() - 0.5) * 20;
        var r2 = 1.4 + rndS() * 3.6;
        g.fillStyle = rndS() < 0.62 ? 'rgba(132,116,84,0.30)' : 'rgba(228,218,190,0.32)';
        g.beginPath(); g.arc(qx2, qy2, r2, 0, 6.283); g.fill();
      }
      g.restore();
    })();

    /* ---------------- punch the water out of the paper ------------- */
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // pond bowl
    g.fillStyle = '#000';
    pondPath(g, 0.972, 0.02);
    g.fill();
    // river channel — narrower than the painted banks, so a wet rim stays
    g.strokeStyle = '#000';
    g.lineWidth = W * 0.0455;
    P.smoothPath(g, P.layout.riverTex || P.layout.river, W, H);
    g.stroke();
    g.restore();
    // soften those cut edges a touch
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.filter = 'blur(3px)';
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 3.5;
    pondPath(g, 0.972, 0.02);
    g.stroke();
    P.smoothPath(g, P.layout.riverTex || P.layout.river, W, H);
    g.lineWidth = W * 0.0455;
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.stroke();
    g.restore();

    /* ---------------- torn paper edge ---------------- */
    g.globalCompositeOperation = 'destination-out';
    for (i = 0; i < 1700; i++) {
      var idx = (rnd() * pts.length) | 0;
      var pt = pts[idx];
      var inward = 1 - rnd() * 0.85;
      var nx = pt[0] + (cx * inward - pt[0]) * 0.016 * (0.4 + rnd());
      var ny = pt[1] + (cy * inward - pt[1]) * 0.016 * (0.4 + rnd());
      var rad2 = 3 + rnd() * 24;
      var g2 = g.createRadialGradient(nx, ny, 0, nx, ny, rad2);
      g2.addColorStop(0, 'rgba(0,0,0,' + (0.45 + rnd() * 0.55).toFixed(2) + ')');
      g2.addColorStop(0.65, 'rgba(0,0,0,' + (0.14 + rnd() * 0.3).toFixed(2) + ')');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = g2;
      g.fillRect(nx - rad2, ny - rad2, rad2 * 2, rad2 * 2);
    }
    g.globalCompositeOperation = 'source-over';

    /* ---------------- light paper rim inside the edge ---------------- */
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.filter = 'blur(6px)';
    g.strokeStyle = 'rgba(250,247,232,0.16)';
    g.lineWidth = 7;
    tracePoly(g, pts);
    g.stroke();
    g.filter = 'blur(2px)';
    g.strokeStyle = 'rgba(255,253,240,0.10)';
    g.lineWidth = 3;
    tracePoly(g, pts);
    g.stroke();
    g.restore();

    /* ---------------- feather the paint into the paper ---------------- */
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.filter = 'blur(7px)';
    g.strokeStyle = 'rgba(0,0,0,0.30)';
    g.lineWidth = 11;
    tracePoly(g, pts);
    g.stroke();
    g.restore();

    /* ---------------- cream paper fringe behind the island ---------------- */
    var fc = document.createElement('canvas');
    fc.width = W; fc.height = H;
    var fg = fc.getContext('2d');
    var fpts = P.islandPoints(cx, cy, RX * 1.002 + 2, RY * 1.002 + 2, 3.5, 720);
    fg.save();
    fg.filter = 'blur(2.5px)';
    fg.fillStyle = 'rgba(251,247,234,0.30)';
    fg.beginPath();
    fg.moveTo(fpts[0][0], fpts[0][1]);
    for (i = 1; i < fpts.length; i++) fg.lineTo(fpts[i][0], fpts[i][1]);
    fg.closePath();
    fg.fill();
    fg.restore();

    /* ---------------- cast shadow for the paper island ---------------- */
    var SW = 1800, SH = 1310;              // 66 x 48 world units
    var sc = document.createElement('canvas');
    sc.width = SW; sc.height = SH;
    var sg = sc.getContext('2d');
    sg.filter = 'blur(20px)';
    sg.fillStyle = 'rgba(104,102,80,0.16)';
    var spts = P.islandPoints(
      SW * 0.5 + 5, SH * 0.5 + 9,
      RX / W * SW * 1.0, RY / H * SH * 1.0, 3.5, 240
    );
    sg.beginPath();
    sg.moveTo(spts[0][0], spts[0][1]);
    for (i = 1; i < spts.length; i++) sg.lineTo(spts[i][0], spts[i][1]);
    sg.closePath();
    sg.fill();

    return { color: c, shadow: sc, fringe: fc, width: W, height: H };
  };

  /* distance (normalised) from a canvas point to the river centreline */
  function nearRiver(x, y, W, H, tol) {
    var uv = P.layout.riverTex || P.layout.river, best = 9, i, ax, ay, bx, by, dx, dy, t, px, py, d;
    for (i = 0; i < uv.length - 1; i++) {
      ax = uv[i][0] * W; ay = uv[i][1] * H;
      bx = uv[i + 1][0] * W; by = uv[i + 1][1] * H;
      dx = bx - ax; dy = by - ay;
      t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      px = ax + dx * t; py = ay + dy * t;
      d = Math.hypot(x - px, y - py) / W;
      if (d < best) best = d;
    }
    return best < tol;
  }
  P.nearRiver = nearRiver;

})(window.PASTURE);
