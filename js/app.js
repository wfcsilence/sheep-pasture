/* ============================================================
   Little Pasture — scene, animals, pond and interaction
   ============================================================ */
(function () {
  'use strict';

  var P = window.PASTURE;
  var T = THREE;

  var W = 74, D = 52;
  var ISLAND_RX = W * 0.474;
  var ISLAND_RZ = D * 0.472;
  var MAX_ANIMALS = 40;

  /* ------------------------------------------------------------
     dom
     ------------------------------------------------------------ */
  var stage  = document.getElementById('stage');
  var canvas = document.getElementById('webgl');
  var ink    = document.getElementById('ink');
  var inkCtx = ink.getContext('2d');
  var selEl  = document.getElementById('sel');
  var selSize = document.getElementById('selSize');
  var selDist = document.getElementById('selDist');
  var bar    = document.getElementById('bar');
  var hintEl = document.getElementById('hint');
  var bubbleEl = document.getElementById('bubble');

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var vw = window.innerWidth, vh = window.innerHeight;

  /* ------------------------------------------------------------
     renderer / scene / camera
     ------------------------------------------------------------ */
  var renderer = new T.WebGLRenderer({
    canvas: canvas, antialias: true, alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(dpr);
  renderer.setSize(vw, vh, false);
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  var scene = new T.Scene();
  scene.background = null;

  var camera = new T.PerspectiveCamera(32, vw / vh, 0.5, 300);

  var CAM = {
    elev: 0.90,
    dist: 70,
    target: new T.Vector3(0, 0.1, 0.4)
  };
  var camBase = new T.Vector3();
  var parallax = { x: 0, y: 0 };
  var zoom = 1, zoomTarget = 1;

  function placeCam(d) {
    var ey = Math.sin(CAM.elev) * d;
    var ez = Math.cos(CAM.elev) * d;
    camBase.set(CAM.target.x, CAM.target.y + ey, CAM.target.z + ez);
    camera.position.copy(camBase);
    camera.lookAt(CAM.target);
  }

  function fitCamera() {
    var corners = [
      new T.Vector3(-W / 2, 0, -D / 2),
      new T.Vector3(W / 2, 0, -D / 2),
      new T.Vector3(-W / 2, 0, D / 2),
      new T.Vector3(W / 2, 0, D / 2)
    ];
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    var portrait = (vw / vh) < 1.05;
    /* the pasture now runs off the edges of the page */
    var limX = portrait ? 1.55 : 1.24;
    var limY = portrait ? 0.86 : 0.93;
    var lo = 10, hi = 260, i, j, mid, v, minX, maxX, minY, maxY;
    for (i = 0; i < 30; i++) {
      mid = (lo + hi) * 0.5;
      placeCam(mid);
      camera.updateMatrixWorld(true);
      minX = 9; maxX = -9; minY = 9; maxY = -9;
      for (j = 0; j < 4; j++) {
        v = corners[j].clone().project(camera);
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
      if ((maxX - minX) * 0.5 <= limX && (maxY - minY) * 0.5 <= limY) hi = mid;
      else lo = mid;
    }
    CAM.dist = hi;
    placeCam(hi);
    camera.updateMatrixWorld(true);
  }

  /* ------------------------------------------------------------
     light
     ------------------------------------------------------------ */
  var hemi = new T.HemisphereLight(
    new T.Color(0xffffff).convertSRGBToLinear(),
    new T.Color(0xc9d3a8).convertSRGBToLinear(),
    0.56
  );
  scene.add(hemi);

  var sun = new T.DirectionalLight(new T.Color(0xfff2d6).convertSRGBToLinear(), 1.28);
  sun.position.set(-22, 44, 20);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 130;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  var fill = new T.DirectionalLight(new T.Color(0xe6efff).convertSRGBToLinear(), 0.16);
  fill.position.set(26, 16, -22);
  scene.add(fill);

  /* ------------------------------------------------------------
     ground
     ------------------------------------------------------------ */
  var painted = P.paintGround(3000, 2100);

  var groundTex = new T.CanvasTexture(painted.color);
  groundTex.encoding = T.sRGBEncoding;
  groundTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  var groundGeo = new T.PlaneGeometry(W, D, 1, 1);
  groundGeo.rotateX(-Math.PI / 2);
  var ground = new T.Mesh(groundGeo, new T.MeshStandardMaterial({
    map: groundTex, transparent: true, roughness: 1.0, metalness: 0.0,
    depthWrite: false
  }));
  ground.receiveShadow = true;
  scene.add(ground);

  var shadowTex = new T.CanvasTexture(painted.shadow);
  shadowTex.encoding = T.sRGBEncoding;
  var islandShadow = new T.Mesh(
    new T.PlaneGeometry(W + 5, D + 5),
    new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 })
  );
  islandShadow.rotation.x = -Math.PI / 2;
  islandShadow.position.y = -0.06;
  islandShadow.renderOrder = -2;
  scene.add(islandShadow);

  /* ------------------------------------------------------------
     world data
     ------------------------------------------------------------ */
  function uvToWorld(u, v) {
    return { x: (u - 0.5) * W, z: (v - 0.5) * D };
  }

  var riverWorld = (P.layout.riverTex || P.layout.river).map(function (q) {
    var w = uvToWorld(q[0], q[1]); return [w.x, w.z];
  });

  function nearestRiver(x, z) {
    var best = 1e9, bx = 0, bz = 0, i, ax, az, dx, dz, t, px, pz, d;
    for (i = 0; i < riverWorld.length - 1; i++) {
      ax = riverWorld[i][0]; az = riverWorld[i][1];
      dx = riverWorld[i + 1][0] - ax; dz = riverWorld[i + 1][1] - az;
      t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      px = ax + dx * t; pz = az + dz * t;
      d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; bx = px; bz = pz; }
    }
    var nx = x - bx, nz = z - bz, len = Math.hypot(nx, nz) || 1;
    return { d: best, nx: nx / len, nz: nz / len };
  }

  var PD = P.layout.pond;
  var pond = {
    x: (PD.u - 0.5) * W, z: (PD.v - 0.5) * D,
    rx: PD.rx * W, rz: PD.ry * D
  };
  var POND_Y = -0.16;      // water surface
  var POND_FLOOR = -0.62;  // bed

  /* normalised distance to the pond edge: <1 means inside the water */
  function pondDist(x, z) {
    var dx = (x - pond.x) / pond.rx, dz = (z - pond.z) / pond.rz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  var treeColliders = [];

  /* ------------------------------------------------------------
     water: pond bowl + river channel + raised track
     ------------------------------------------------------------ */
  function gradientTex(stops, horizontal) {
    var c = document.createElement('canvas');
    c.width = horizontal ? 128 : 8;
    c.height = horizontal ? 8 : 128;
    var g = c.getContext('2d');
    var grd = horizontal ? g.createLinearGradient(0, 0, 128, 0) : g.createLinearGradient(0, 0, 0, 128);
    stops.forEach(function (s) { grd.addColorStop(s[0], s[1]); });
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    var t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }

  /* ---- pond ---- */
  /* every pond mesh is bent by the same outline the texture hole uses */
  function pondFit(geo, kx, kz) {
    var pos = geo.attributes.position, i, x, z, phi, f;
    for (i = 0; i < pos.count; i++) {
      x = pos.getX(i); z = pos.getZ(i);
      if (Math.abs(x) < 1e-5 && Math.abs(z) < 1e-5) continue;
      phi = Math.atan2(z * kz, x * kx);
      f = P.pondK(phi) / P.pondK(0);
      pos.setX(i, x * f);
      pos.setZ(i, z * f);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  (function buildPond() {
    var bankTex = gradientTex([[0, '#c2ad86'], [0.45, '#8f8462'], [1, '#4a5a4e']]);
    var bankGeo = new T.CylinderGeometry(0.995, 0.90, 0.62, 64, 1, true);
    pondFit(bankGeo, pond.rx, pond.rz);
    var bank = new T.Mesh(
      bankGeo,
      new T.MeshStandardMaterial({
        map: bankTex, roughness: 1, metalness: 0, side: T.DoubleSide
      })
    );
    bank.scale.set(pond.rx, 1, pond.rz);
    bank.position.set(pond.x, -0.31, pond.z);
    bank.receiveShadow = true;
    scene.add(bank);

    var bedTex = gradientTex([[0, '#7f9d8f'], [0.55, '#4d7a72'], [1, '#2b5352']], false);
    var bedGeo = new T.CircleGeometry(1, 48);
    bedGeo.rotateX(-Math.PI / 2);
    pondFit(bedGeo, pond.rx * 0.93, pond.rz * 0.93);
    var bed = new T.Mesh(bedGeo, new T.MeshStandardMaterial({ map: bedTex, roughness: 1 }));
    bed.scale.set(pond.rx * 0.93, 1, pond.rz * 0.93);
    bed.position.set(pond.x, -0.56, pond.z);
    bed.receiveShadow = true;
    scene.add(bed);

    var waterGeo = new T.CircleGeometry(1, 64);
    waterGeo.rotateX(-Math.PI / 2);
    pondFit(waterGeo, pond.rx * 0.962, pond.rz * 0.962);
    var water = new T.Mesh(waterGeo, new T.MeshStandardMaterial({
      color: new T.Color(0x4a92b4).convertSRGBToLinear(),
      roughness: 0.20, metalness: 0.0,
      transparent: true, opacity: 0.52,
      emissive: new T.Color(0x14486e).convertSRGBToLinear(), emissiveIntensity: 0.12
    }));
    /* deeper towards the middle */
    var wc = document.createElement('canvas');
    wc.width = wc.height = 256;
    var wg = wc.getContext('2d');
    var rg = wg.createRadialGradient(128, 128, 6, 128, 128, 128);
    rg.addColorStop(0, 'rgba(84,130,156,1)');
    rg.addColorStop(0.55, 'rgba(140,186,206,1)');
    rg.addColorStop(1, 'rgba(255,255,255,1)');
    wg.fillStyle = rg;
    wg.fillRect(0, 0, 256, 256);
    var depthTex = new T.CanvasTexture(wc);
    depthTex.encoding = T.sRGBEncoding;
    water.material.map = depthTex;
    water.material.needsUpdate = true;

    water.scale.set(pond.rx * 0.962, 1, pond.rz * 0.962);
    water.position.set(pond.x, -0.10, pond.z);
    water.receiveShadow = false;
    water.renderOrder = 1;
    water.userData.water = 'pond';
    scene.add(water);

    /* glints on the surface */
    var gc = document.createElement('canvas');
    gc.width = 512; gc.height = 512;
    var gg = gc.getContext('2d');
    gg.clearRect(0, 0, 512, 512);
    for (var q = 0; q < 26; q++) {
      var ax = 70 + Math.random() * 370;
      var ay = 90 + Math.random() * 330;
      var ar = 20 + Math.random() * 60;
      gg.save();
      gg.filter = 'blur(' + (7 + Math.random() * 9).toFixed(0) + 'px)';
      gg.strokeStyle = 'rgba(255,255,255,' + (0.20 + Math.random() * 0.35).toFixed(2) + ')';
      gg.lineWidth = 1.5 + Math.random() * 3;
      gg.beginPath();
      gg.ellipse(ax, ay, ar, ar * 0.34, Math.random() * 0.5, 0.2, Math.random() * 2.4 + 1.2);
      gg.stroke();
      gg.restore();
    }
    var glintTex = new T.CanvasTexture(gc);
    glintTex.encoding = T.sRGBEncoding;
    var glint = new T.Mesh(
      new T.PlaneGeometry(pond.rx * 2, pond.rz * 2),
      new T.MeshBasicMaterial({
        map: glintTex, transparent: true, opacity: 0.5,
        blending: T.AdditiveBlending, depthWrite: false
      })
    );
    glint.rotation.x = -Math.PI / 2;
    glint.position.set(pond.x, -0.085, pond.z);
    glint.renderOrder = 3;
    scene.add(glint);

    window.__pondWater = water;
  })();

  /* ---- river ---- */
  var riverFlow = null;
  var riverWave = null;
  var riverCurve = P.samplePath(P.layout.riverTex || P.layout.river, 170);
  var riverPts = riverCurve.map(function (q) {
    var w = uvToWorld(q[0], q[1]);
    return new T.Vector3(w.x, 0, w.z);
  });

  function buildStrip(railA, railB, uRepeat) {
    var n = railA.length;
    var pos = [], uv = [], idx = [], i;
    for (i = 0; i < n; i++) {
      pos.push(railA[i].x, railA[i].y, railA[i].z);
      pos.push(railB[i].x, railB[i].y, railB[i].z);
      var t = i / (n - 1);
      uv.push(0, t, 1, t);
    }
    for (i = 0; i < n - 1; i++) {
      var a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  (function buildRiver() {
    var n = riverPts.length;
    var halfHole = W * 0.0227;    // matches the hole cut in the paper
    var halfTop = halfHole + 0.14; // tucks under the paper lip
    var halfWater = halfHole - 0.10;
    var halfBed = halfHole + 0.04;
    var waterA = [], waterB = [], bedA = [], bedB = [];
    var bankLA = [], bankLB = [], bankRA = [], bankRB = [];
    var i, p, prev, next, tx, tz, len, nx, nz;

    for (i = 0; i < n; i++) {
      p = riverPts[i];
      prev = riverPts[Math.max(0, i - 1)];
      next = riverPts[Math.min(n - 1, i + 1)];
      tx = next.x - prev.x; tz = next.z - prev.z;
      len = Math.hypot(tx, tz) || 1;
      tx /= len; tz /= len;
      nx = -tz; nz = tx;

      waterA.push(new T.Vector3(p.x + nx * halfWater, -0.42, p.z + nz * halfWater));
      waterB.push(new T.Vector3(p.x - nx * halfWater, -0.42, p.z - nz * halfWater));
      bedA.push(new T.Vector3(p.x + nx * halfBed, -0.60, p.z + nz * halfBed));
      bedB.push(new T.Vector3(p.x - nx * halfBed, -0.60, p.z - nz * halfBed));
      bankLA.push(new T.Vector3(p.x + nx * halfTop, 0.0, p.z + nz * halfTop));
      bankLB.push(new T.Vector3(p.x + nx * (halfWater + 0.02), -0.46, p.z + nz * (halfWater + 0.02)));
      bankRA.push(new T.Vector3(p.x - nx * halfTop, 0.0, p.z - nz * halfTop));
      bankRB.push(new T.Vector3(p.x - nx * (halfWater + 0.02), -0.46, p.z - nz * (halfWater + 0.02)));
    }

    var bankMat = new T.MeshStandardMaterial({
      map: gradientTex([[0, '#c2ad86'], [0.45, '#8f8462'], [1, '#4a5a4e']], true),
      roughness: 1, metalness: 0, side: T.DoubleSide
    });

    var bedMat = new T.MeshStandardMaterial({
      color: new T.Color(0x76907e).convertSRGBToLinear(), roughness: 1,
      side: T.DoubleSide
    });

    var waterMat = new T.MeshStandardMaterial({
      color: new T.Color(0x56a0c4).convertSRGBToLinear(),
      roughness: 0.50, metalness: 0.0,
      transparent: true, opacity: 0.72,
      emissive: new T.Color(0x2a5f9c).convertSRGBToLinear(), emissiveIntensity: 0.42,
      side: T.DoubleSide
    });

    var bedMesh = new T.Mesh(buildStrip(bedA, bedB), bedMat);
    bedMesh.receiveShadow = true;
    scene.add(bedMesh);

    var wMesh = new T.Mesh(buildStrip(waterA, waterB), waterMat);
    wMesh.renderOrder = 1;
    wMesh.userData.water = 'river';
    scene.add(wMesh);

    /* flowing highlights baked into the water's own emissive map */
    var fc = document.createElement('canvas');
    fc.width = 128; fc.height = 256;
    var fg = fc.getContext('2d');
    fg.fillStyle = '#ffffff';
    fg.fillRect(0, 0, 128, 256);
    for (var f = 0; f < 90; f++) {
      var fx = Math.random() * 128;
      var fy = Math.random() * 256;
      var fh = 10 + Math.random() * 70;
      fg.save();
      fg.filter = 'blur(' + (1 + Math.random() * 3).toFixed(0) + 'px)';
      fg.fillStyle = Math.random() < 0.55
        ? 'rgba(120,150,182,' + (0.45 + Math.random() * 0.45).toFixed(2) + ')'
        : 'rgba(255,255,255,' + (0.35 + Math.random() * 0.55).toFixed(2) + ')';
      fg.fillRect(fx, fy, 2 + Math.random() * 9, fh);
      fg.restore();
    }
    var flowTex = new T.CanvasTexture(fc);
    flowTex.wrapS = T.ClampToEdgeWrapping;
    flowTex.wrapT = T.RepeatWrapping;
    flowTex.repeat.set(1, 12);
    waterMat.emissiveMap = flowTex;
    waterMat.emissiveIntensity = 0.34;
    waterMat.needsUpdate = true;
    riverFlow = flowTex;

    /* soft wave bands across the surface, scrolling downstream */
    var wc2 = document.createElement('canvas');
    wc2.width = 256; wc2.height = 256;
    var wg2 = wc2.getContext('2d');
    wg2.fillStyle = '#dcecf4';
    wg2.fillRect(0, 0, 256, 256);
    for (var wv = 0; wv < 34; wv++) {
      var wy = (wv / 34) * 256 + Math.random() * 5;
      var amp = 2 + Math.random() * 5;
      wg2.beginPath();
      wg2.moveTo(0, wy);
      for (var wx = 0; wx <= 256; wx += 16) {
        wg2.lineTo(wx, wy + Math.sin(wx / 26 + wv) * amp);
      }
      wg2.strokeStyle = Math.random() < 0.5
        ? 'rgba(132,172,200,' + (0.30 + Math.random() * 0.38).toFixed(2) + ')'
        : 'rgba(255,255,255,' + (0.34 + Math.random() * 0.42).toFixed(2) + ')';
      wg2.lineWidth = 1.4 + Math.random() * 4.2;
      wg2.stroke();
    }
    var waveTex = new T.CanvasTexture(wc2);
    waveTex.wrapS = T.RepeatWrapping;
    waveTex.wrapT = T.RepeatWrapping;
    waveTex.repeat.set(1, 16);
    waveTex.encoding = T.sRGBEncoding;
    waterMat.map = waveTex;
    waterMat.needsUpdate = true;
    riverWave = waveTex;

    /* sandy, pebbly shore strips either side — same palette as the pond shelf */
    var shoreTex = (function () {
      var c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      var g2 = c.getContext('2d');
      var grd = g2.createLinearGradient(0, 0, 128, 0);
      grd.addColorStop(0, 'rgba(214,196,150,0.95)');
      grd.addColorStop(0.5, 'rgba(210,190,144,0.72)');
      grd.addColorStop(1, 'rgba(206,186,140,0.0)');
      g2.fillStyle = grd;
      g2.fillRect(0, 0, 128, 128);
      var rnd3 = P.mulberry32(771);
      for (var q3 = 0; q3 < 260; q3++) {
        var sx3 = rnd3() * 128, sy3 = rnd3() * 128;
        var sr3 = 0.7 + rnd3() * 2.2;
        g2.fillStyle = rnd3() < 0.5 ? 'rgba(158,140,102,0.30)' : 'rgba(240,230,200,0.28)';
        g2.beginPath(); g2.arc(sx3, sy3, sr3, 0, 6.283); g2.fill();
      }
      var t3 = new T.CanvasTexture(c);
      t3.encoding = T.sRGBEncoding;
      return t3;
    })();
    function shoreStrip(side) {
      var A2 = [], B2 = [];
      for (var j = 0; j < n; j++) {
        var q = riverPts[j];
        var pr = riverPts[Math.max(0, j - 1)], nx2 = riverPts[Math.min(n - 1, j + 1)];
        var t2x = nx2.x - pr.x, t2z = nx2.z - pr.z;
        var l2 = Math.hypot(t2x, t2z) || 1;
        t2x /= l2; t2z /= l2;
        var n2x = -t2z * side, n2z = t2x * side;
        A2.push(new T.Vector3(q.x + n2x * (halfHole + 0.02), -0.02, q.z + n2z * (halfHole + 0.02)));
        B2.push(new T.Vector3(q.x + n2x * (halfHole + 1.26), -0.02, q.z + n2z * (halfHole + 1.26)));
      }
      var m2 = new T.Mesh(buildStrip(A2, B2), new T.MeshStandardMaterial({
        map: shoreTex, transparent: true, roughness: 1, metalness: 0, side: T.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
      }));
      m2.receiveShadow = true;
      m2.renderOrder = 0;
      scene.add(m2);
    }
    /* river sand banks are painted into the ground texture */

    var bL = new T.Mesh(buildStrip(bankLA, bankLB), bankMat);
    bL.receiveShadow = true;
    scene.add(bL);
    var bR = new T.Mesh(buildStrip(bankRA, bankRB), bankMat);
    bR.receiveShadow = true;
    scene.add(bR);
  })();

  /* ---- a little boat drifting down the river ---- */
  var boat = null;
  (function buildBoat() {
    var b = P.makeBoat(9);
    b.root.scale.setScalar(2.55);
    b.root.traverse(function (o) { if (o.isMesh) o.castShadow = false; });
    scene.add(b.root);
    boat = { m: b.root, t: 0.30, speed: 0.0075, phase: Math.random() * 6.28 };
  })();

  function updateBoat(dt, time) {
    if (!boat) return;
    boat.t += dt * boat.speed;
    if (boat.t > 1) boat.t -= 1;
    var f = boat.t * (riverPts.length - 1);
    var i0 = Math.floor(f), i1 = Math.min(riverPts.length - 1, i0 + 1);
    var a = riverPts[i0], b2 = riverPts[i1];
    var k = f - i0;
    var px = a.x + (b2.x - a.x) * k;
    var pz = a.z + (b2.z - a.z) * k;
    var tx = b2.x - a.x, tz = b2.z - a.z;
    var head = Math.atan2(tx, tz);
    boat.m.position.set(px + Math.sin(time * 0.5 + boat.phase) * 0.10,
      -0.395 + Math.sin(time * 1.35 + boat.phase) * 0.022,
      pz + Math.cos(time * 0.42 + boat.phase) * 0.08);
    boat.m.rotation.y = head + Math.PI + Math.sin(time * 0.55 + boat.phase) * 0.055;
    boat.m.rotation.z = Math.sin(time * 1.1 + boat.phase) * 0.045;
    boat.m.rotation.x = Math.sin(time * 0.85 + boat.phase * 1.7) * 0.03;
  }

  /* ---- raised sandy track ---- */
  (function buildRoad() {
    var uvPath = P.samplePath(P.layout.path, 170);
    var pts = uvPath.map(function (q) { var w = uvToWorld(q[0], q[1]); return new T.Vector3(w.x, 0, w.z); });
    var halfW = W * 0.0215;
    var A = [], B = [], i, p, prev, next, tx, tz, len, nx, nz;
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      prev = pts[Math.max(0, i - 1)];
      next = pts[Math.min(pts.length - 1, i + 1)];
      tx = next.x - prev.x; tz = next.z - prev.z;
      len = Math.hypot(tx, tz) || 1;
      tx /= len; tz /= len;
      nx = -tz; nz = tx;
      A.push(new T.Vector3(p.x + nx * halfW, 0.035, p.z + nz * halfW));
      B.push(new T.Vector3(p.x - nx * halfW, 0.035, p.z - nz * halfW));
    }
    var tex = (function roadTexture() {
      var cw = 192, ch = 512;
      var c = document.createElement('canvas'); c.width = cw; c.height = ch;
      var g = c.getContext('2d');
      g.clearRect(0, 0, cw, ch);
      /* soft sandy body, transparent at both edges */
      var grad = g.createLinearGradient(0, 0, cw, 0);
      grad.addColorStop(0.00, 'rgba(224,203,151,0)');
      grad.addColorStop(0.16, 'rgba(206,183,132,0.88)');
      grad.addColorStop(0.34, 'rgba(216,194,142,0.97)');
      grad.addColorStop(0.68, 'rgba(211,189,138,0.97)');
      grad.addColorStop(0.90, 'rgba(201,179,128,0.82)');
      grad.addColorStop(1.00, 'rgba(214,192,140,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, cw, ch);
      /* grain */
      var rnd = P.mulberry32(4471);
      var i, x, y, r;
      for (i = 0; i < 2600; i++) {
        x = 18 + rnd() * (cw - 36);
        y = rnd() * ch;
        g.fillStyle = rnd() < 0.5 ? 'rgba(190,166,116,' + (0.10 + rnd() * 0.22).toFixed(2) + ')'
                                  : 'rgba(246,232,196,' + (0.10 + rnd() * 0.25).toFixed(2) + ')';
        g.fillRect(x, y, 1 + rnd() * 2.4, 1 + rnd() * 2.4);
      }
      /* pebbles */
      for (i = 0; i < 150; i++) {
        x = 20 + rnd() * (cw - 40);
        y = rnd() * ch;
        r = 1.6 + rnd() * 4.6;
        var tone = ['#c9bda4', '#b3a78e', '#d8cdb6', '#9d947e', '#c2b49a'][(rnd() * 5) | 0];
        g.beginPath();
        g.ellipse(x, y, r * (0.8 + rnd() * 0.6), r * (0.7 + rnd() * 0.5), rnd() * 3.14, 0, 6.283);
        g.fillStyle = tone;
        g.globalAlpha = 0.55 + rnd() * 0.4;
        g.fill();
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.beginPath();
        g.ellipse(x - r * 0.25, y - r * 0.3, r * 0.45, r * 0.35, 0, 0, 6.283);
        g.fill();
      }
      /* a couple of worn ruts */
      g.globalAlpha = 0.10;
      g.fillStyle = '#8d7a58';
      g.fillRect(cw * 0.30, 0, 5, ch);
      g.fillRect(cw * 0.62, 0, 4, ch);
      g.globalAlpha = 1;
      var t = new T.CanvasTexture(c);
      t.encoding = T.sRGBEncoding;
      t.wrapS = T.ClampToEdgeWrapping;
      t.wrapT = T.RepeatWrapping;
      t.repeat.set(1, 10);
      t.anisotropy = 4;
      return t;
    })();
    var geo = buildStrip(A, B);
    var mesh = new T.Mesh(geo, new T.MeshStandardMaterial({
      map: tex, transparent: true, roughness: 1, metalness: 0, depthWrite: true, side: T.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    }));
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    scene.add(mesh);

    /* loose stones along the track */
    var stoneGeo = new T.IcosahedronGeometry(1, 0);
    var stoneMat = new T.MeshLambertMaterial({ color: new T.Color(0xb8ad96).convertSRGBToLinear() });
    var COUNT = 64;
    var inst = new T.InstancedMesh(stoneGeo, stoneMat, COUNT);
    var mtx = new T.Matrix4(), quat = new T.Quaternion(), eul = new T.Euler(), sc = new T.Vector3(), pv = new T.Vector3();
    for (var si = 0; si < COUNT; si++) {
      var t = (si + 0.5) / COUNT;
      var idx2 = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)));
      var q2 = pts[idx2];
      var prev2 = pts[Math.max(0, idx2 - 1)], next2 = pts[Math.min(pts.length - 1, idx2 + 1)];
      var tx2 = next2.x - prev2.x, tz2 = next2.z - prev2.z;
      var ln2 = Math.hypot(tx2, tz2) || 1;
      var nx2 = -tz2 / ln2, nz2 = tx2 / ln2;
      var off = (Math.random() - 0.5) * halfW * 1.7;
      pv.set(q2.x + nx2 * off, 0.045, q2.z + nz2 * off);
      var ss = 0.05 + Math.random() * 0.11;
      sc.set(ss * (1 + Math.random() * 0.5), ss * 0.55, ss * (1 + Math.random() * 0.5));
      eul.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      quat.setFromEuler(eul);
      mtx.compose(pv, quat, sc);
      inst.setMatrixAt(si, mtx);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    scene.add(inst);
  })();

  /* ------------------------------------------------------------
     trees
     ------------------------------------------------------------ */
  var TREE_SPOTS = [
    { u: 0.105, v: 0.080, h: 5.05, s: 1.52, blobs: 8 },
    { u: 0.245, v: 0.048, h: 3.95, s: 1.20, blobs: 6 },
    { u: 0.470, v: 0.040, h: 4.45, s: 1.34, blobs: 7 },
    { u: 0.700, v: 0.055, h: 4.05, s: 1.24, blobs: 6 },
    { u: 0.905, v: 0.130, h: 4.35, s: 1.30, blobs: 7 },
    { u: 0.952, v: 0.545, h: 4.65, s: 1.38, blobs: 7 },
    { u: 0.928, v: 0.880, h: 4.10, s: 1.26, blobs: 6 },
    { u: 0.620, v: 0.945, h: 3.85, s: 1.16, blobs: 6 },
    { u: 0.298, v: 0.932, h: 4.05, s: 1.22, blobs: 6 },
    { u: 0.072, v: 0.862, h: 4.25, s: 1.28, blobs: 7 },
    { u: 0.042, v: 0.492, h: 3.70, s: 1.14, blobs: 6 },
    { u: 0.152, v: 0.660, h: 5.30, s: 1.62, blobs: 8, kind: 'purple' },
    { u: 0.842, v: 0.372, h: 3.30, s: 1.06, blobs: 5 }
  ];

  TREE_SPOTS.forEach(function (spot, i) {
    var w = uvToWorld(spot.u, spot.v);
    var tree = P.makeTree(i + 3, {
      h: spot.h, spread: spot.s, blobs: spot.blobs, kind: spot.kind
    });
    tree.group.position.set(w.x, 0, w.z);
    scene.add(tree.group);
    treeColliders.push({ x: w.x, z: w.z, r: 0.82 * spot.s * (spot.h / 2.7) + 0.30 });
  });

  /* ------------------------------------------------------------
     tall grass — one merged mesh of crossed billboards
     ------------------------------------------------------------ */
  (function buildGrass() {
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    var rnd = P.mulberry32(9931);
    var tones = ['#59893a', '#4a7a2c', '#6f9f45', '#3f6b22', '#7cab4b'];
    for (var b = 0; b < 9; b++) {
      var bx = 18 + rnd() * 92;
      var bh = 62 + rnd() * 62;
      var bend = (rnd() - 0.5) * 40;
      g.strokeStyle = tones[(rnd() * tones.length) | 0];
      g.lineWidth = 9 + rnd() * 8;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(bx, 128);
      g.quadraticCurveTo(bx + bend * 0.3, 128 - bh * 0.55, bx + bend, 128 - bh);
      g.stroke();
    }
    var tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = 4;
    var mat = new T.MeshLambertMaterial({
      map: tex, alphaTest: 0.45, side: T.DoubleSide,
      emissive: new T.Color(0x3c4d22).convertSRGBToLinear(), emissiveIntensity: 0.10
    });

    var pos = [], uv = [], idx = [], vert = 0;
    var patch = 0, k, j, a, rr, x, z, hgt, w, ang, dx, dz, hh;
    var pathPts = P.samplePath(P.layout.path, 90).map(function (q) { return uvToWorld(q[0], q[1]); });

    function nearPath(x, z, tol) {
      for (var q = 0; q < pathPts.length; q++) {
        if (Math.hypot(x - pathPts[q].x, z - pathPts[q].z) < tol) return true;
      }
      return false;
    }

    for (patch = 0; patch < 26; patch++) {
      var pcx = (Math.random() - 0.5) * W * 0.82;
      var pcz = (Math.random() - 0.5) * D * 0.82;
      var nT = 10 + (Math.random() * 8) | 0;
      for (k = 0; k < nT; k++) {
        a = Math.random() * 6.283;
        rr = Math.random() * 4.2;
        x = pcx + Math.cos(a) * rr;
        z = pcz + Math.sin(a) * rr * 0.8;
        if (!insideIsland(x, z, 0.93)) continue;
        if (nearestRiver(x, z).d < 2.2) continue;
        if (pondDist(x, z) < 1.06) continue;
        if (nearPath(x, z, 1.6)) continue;
        hgt = 0.62 + Math.random() * 0.72;
        w = hgt * (0.80 + Math.random() * 0.30);
        for (j = 0; j < 3; j++) {
          ang = j * 1.047 + Math.random() * 0.3;
          dx = Math.cos(ang) * w * 0.5;
          dz = Math.sin(ang) * w * 0.5;
          pos.push(x - dx, 0, z - dz, x + dx, 0, z + dz, x + dx, hgt, z + dz, x - dx, hgt, z - dz);
          uv.push(0, 0, 1, 0, 1, 1, 0, 1);
          idx.push(vert, vert + 1, vert + 2, vert, vert + 2, vert + 3);
          vert += 4;
        }
      }
    }
    if (!pos.length) return;
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    var mesh = new T.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 0;
    scene.add(mesh);
  })();

  /* ------------------------------------------------------------
     windmill on the north-west rise
     ------------------------------------------------------------ */
  var windmill = null;
  (function buildWindmill() {
    var w = uvToWorld(0.176, 0.156);
    var m = P.makeWindmill({ h: 7.8 });
    m.root.position.set(w.x, 0, w.z);
    m.root.rotation.y = Math.atan2(pond.x - w.x, pond.z - w.z);
    scene.add(m.root);
    windmill = m;
    treeColliders.push({ x: w.x, z: w.z, r: 1.55 });
    /* a few stones at its foot */
    for (var i = 0; i < 5; i++) {
      var a = Math.random() * Math.PI * 2;
      var r = 1.5 + Math.random() * 1.1;
      var rk = P.makeRock(i + 21, 0.16 + Math.random() * 0.14);
      rk.position.set(w.x + Math.cos(a) * r, 0, w.z + Math.sin(a) * r);
      scene.add(rk);
    }
  })();

  /* ------------------------------------------------------------
     clouds
     ------------------------------------------------------------ */
  var clouds = [];
  [
    { x: -9.0, y: 11.6, z: -9.5, s: 1.55, v: 0.42 },
    { x: 13.0, y: 12.4, z: -10.5, s: 1.05, v: 0.30 },
    { x: 27.0, y: 11.0, z: -13.0, s: 0.80, v: 0.46 }
  ].forEach(function (c, i) {
    var cl = P.makeCloud(i + 5, c.s);
    cl.position.set(c.x, c.y, c.z);
    scene.add(cl);
    clouds.push({ g: cl, v: c.v, z: c.z, s: c.s });
  });

  /* ------------------------------------------------------------
     animals
     ------------------------------------------------------------ */
  var animals = [];
  var selected = null;
  var followed = null;
  var followedRadius = 0;
  var lastAnimalTap = null;

  var ICONS = {
    turn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3.5V9h-5.5"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.64-6.36"/><path d="M3 3.5V9h5.5"/></svg>',
    clone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11.5" height="11.5" rx="2.2"/><path d="M5.2 15.2H4.4A1.4 1.4 0 0 1 3 13.8V4.4A1.4 1.4 0 0 1 4.4 3h9.4a1.4 1.4 0 0 1 1.4 1.4v.8"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.6 6.2h16.8"/><path d="M8.4 6.2V4.1h7.2v2.1"/><path d="M18.6 6.2 17.5 20a1.4 1.4 0 0 1-1.4 1.3H7.9A1.4 1.4 0 0 1 6.5 20L5.4 6.2"/></svg>'
  };

  var SPECIES = {
    sheep: {
      make: P.makeSheep, scale: 1.86, speed: 0.80, radius: 1.02, headDown: 0.95,
      states: { graze: 0.34, walk: 0.30, idle: 0.20, jump: 0.09, sleep: 0.07 },
      actions: [{ act: 'idle', label: 'Idle' }, { act: 'graze', label: 'Graze' },
                { act: 'walk', label: 'Walk' }, { act: 'jump', label: 'Jump' }],
      sound: '咩～'
    },
    cow: {
      make: P.makeCow, scale: 1.62, speed: 0.52, radius: 1.55, headDown: 1.05,
      states: { graze: 0.42, walk: 0.20, idle: 0.28, lie: 0.10 },
      actions: [{ act: 'graze', label: 'Graze' }, { act: 'walk', label: 'Walk' },
                { act: 'lie', label: 'Lie' }, { act: 'milk', label: 'Milk' }],
      sound: '哞～'
    },
    horse: {
      make: P.makeHorse, scale: 1.72, speed: 0.95, radius: 1.60, headDown: 0.92,
      states: { graze: 0.34, walk: 0.24, idle: 0.24, trot: 0.18 },
      actions: [{ act: 'graze', label: 'Graze' }, { act: 'walk', label: 'Walk' },
                { act: 'trot', label: 'Trot' }, { act: 'rear', label: 'Rear' }],
      sound: '咴儿～'
    },
    pig: {
      make: P.makePig, scale: 1.62, speed: 0.62, radius: 0.98, headDown: 0.62,
      states: { root: 0.40, walk: 0.24, idle: 0.22, roll: 0.14 },
      actions: [{ act: 'root', label: 'Root' }, { act: 'walk', label: 'Walk' },
                { act: 'roll', label: 'Roll' }, { act: 'oink', label: 'Oink' }],
      sound: '哼唧～'
    },
    /* the one wild boar: heavier, darker, tusked */
    boar: {
      make: P.makeBoar, scale: 1.78, speed: 0.68, radius: 1.10, headDown: 0.66,
      states: { root: 0.42, walk: 0.22, idle: 0.16, roll: 0.20 },
      actions: [{ act: 'root', label: 'Root' }, { act: 'walk', label: 'Walk' },
                { act: 'roll', label: 'Roll' }, { act: 'oink', label: 'Snort' }],
      sound: '呼噜噜——'
    }
  };

  function lerpAngle(a, b, t) {
    var d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return a + d * t;
  }

  function insideIsland(x, z, f) {
    var nx = x / (ISLAND_RX * f), nz = z / (ISLAND_RZ * f);
    return Math.pow(Math.abs(nx), 4) + Math.pow(Math.abs(nz), 4) <= 1;
  }

  function canStand(x, z, ignoreAnimals) {
    if (!insideIsland(x, z, 0.88)) return false;
    if (nearestRiver(x, z).d < 2.6) return false;
    if (pondDist(x, z) < 1.05) return false;
    var i, dx, dz, d;
    for (i = 0; i < treeColliders.length; i++) {
      dx = x - treeColliders[i].x; dz = z - treeColliders[i].z;
      d = Math.hypot(dx, dz);
      if (d < treeColliders[i].r + 0.5) return false;
    }
    if (!ignoreAnimals) {
      for (i = 0; i < animals.length; i++) {
        dx = x - animals[i].x; dz = z - animals[i].z;
        if (Math.hypot(dx, dz) < animals[i].radius * 2.0) return false;
      }
    }
    return true;
  }

  function findSpot(x, z, radius) {
    if (canStand(x, z)) return { x: x, z: z };
    var i, j, a, r, tx, tz, d;
    for (j = 1; j <= 7; j++) {
      d = radius * j * 0.6;
      for (i = 0; i < 28; i++) {
        a = Math.random() * Math.PI * 2;
        r = d * (0.45 + Math.random() * 0.8);
        tx = x + Math.cos(a) * r;
        tz = z + Math.sin(a) * r * 0.85;
        if (canStand(tx, tz)) return { x: tx, z: tz };
      }
    }
    return null;
  }

  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function Critter(kind, seed, x, z, heading) {
    var spec = SPECIES[kind];
    this.kind = kind;
    this.spec = spec;
    this.seed = seed;
    this.model = spec.make(seed);
    this.group = this.model.root;
    this.group.userData.critter = this;

    var hitMat = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    var hit = new T.Mesh(new T.SphereGeometry(1, 8, 6), hitMat);
    hit.position.set(0, spec.radius * 0.55, 0);
    hit.scale.set(spec.radius, spec.radius * 0.95, spec.radius * 1.15);
    hit.castShadow = false;
    hit.receiveShadow = false;
    this.group.add(hit);
    this.hit = hit;

    this.samples = silhouettePoints(this.group);
    this.localBox = new T.Box3(
      new T.Vector3(-spec.radius, -0.02, -spec.radius * 1.3),
      new T.Vector3(spec.radius, spec.radius * 1.9, spec.radius * 1.3)
    );

    this.x = x; this.z = z;
    this.homeX = x; this.homeZ = z;
    this.homeHeading = heading;
    this.heading = heading;
    this.baseScale = spec.scale * (0.94 + Math.random() * 0.12);
    this.radius = spec.radius;
    this.appear = 0;
    this.speed = spec.speed * (0.9 + Math.random() * 0.25);
    this.phase = Math.random() * 10;

    this.state = (this.kind === 'pig' || this.kind === 'boar') ? 'root' : 'graze';
    this.t = 0;
    this.dur = 2 + Math.random() * 3;
    this.locked = false;
    this.targetX = x; this.targetZ = z;

    this.hp = 0; this.hy = 0; this.rootY = 0;
    this.bodyY = 0; this.squash = 1; this.legPhase = Math.random() * 8;
    this.action = 0;                 // 0..1 progress of a special action
    this.actionName = '';
    this.wantDrink = false;
    this.drinkCd = 8 + Math.random() * 22;
    this.voiceT = 6 + Math.random() * 18;   // idle vocalisation timer
    this.drinkPulse = 0;

    scene.add(this.group);
  }

  Critter.prototype.setState = function (name, manual) {
    if (manual) this.locked = true;
    this.state = name;
    this.stateBase = name;
    this.t = 0;
    this.action = 0;
    var R = Math.random;
    switch (name) {
      case 'graze': this.dur = 2.6 + R() * 4.2; break;
      case 'idle':  this.dur = 1.2 + R() * 2.8; break;
      case 'sleep': this.dur = 4.0 + R() * 5.0; break;
      case 'jump':  this.dur = 1.15 + R() * 1.15; break;
      case 'walk':  this.dur = 5.0 + R() * 5.0; this.pickTarget(); break;
      case 'trot':  this.dur = 3.4 + R() * 3.0; this.pickTarget(true); break;
      case 'lie':   this.dur = 6.0 + R() * 6.0; break;
      case 'root':  this.dur = 3.0 + R() * 3.0; break;
      case 'roll':  this.dur = 2.2 + R() * 1.6; break;
      case 'drink': this.dur = 4.2 + R() * 3.4; break;
    }
  };

  Critter.prototype.pickTarget = function (far) {
    var i, a, r, x, z;
    for (i = 0; i < 44; i++) {
      a = Math.random() * Math.PI * 2;
      r = far ? 4 + Math.random() * 9 : 2 + Math.random() * 7;
      x = this.x + Math.cos(a) * r;
      z = this.z + Math.sin(a) * r;
      if (canStand(x, z, true)) {
        this.targetX = x; this.targetZ = z;
        return;
      }
    }
    this.targetX = this.x; this.targetZ = this.z;
  };

  Critter.prototype.pickNext = function () {
    var w = {}, k, mine = this.spec.states;
    /* now and then, walk to the pond for a drink */
    var busy = 0;
    for (var dz2 = 0; dz2 < animals.length; dz2++) {
      if (animals[dz2] !== this && (animals[dz2].wantDrink || animals[dz2].state === 'drink')) busy++;
    }
    if (!this.locked && this.drinkCd <= 0 && busy < 2 && pondDist(this.x, this.z) < 3.4) {
      var ang = Math.random() * Math.PI * 2;
      var px = pond.x + Math.cos(ang) * pond.rx * 1.06;
      var pz = pond.z + Math.sin(ang) * pond.rz * 1.06;
      if (canStand(px, pz, true)) {
        this.setState('walk', false);
        this.targetX = px; this.targetZ = pz;
        this.wantDrink = true;
        return;
      }
    }
    /* now and then head for the far bank and hop the river */
    if (!this.locked && Math.random() < 0.16) {
      var rv3 = nearestRiver(this.x, this.z);
      if (rv3.d < 11 && rv3.d > 2.2) {
        var fx = this.x - rv3.nx * (rv3.d * 2 + 4.5);
        var fz = this.z - rv3.nz * (rv3.d * 2 + 4.5);
        if (canStand(fx, fz, true)) {
          this.setState('walk', false);
          this.targetX = fx; this.targetZ = fz;
          this.dur = 22;
          return;
        }
      }
    }

    for (k in mine) w[k] = mine[k];
    if (this.state === 'graze') w.graze = 0.10;
    if (this.state === 'walk') w.walk = 0.14;
    if (this.state === 'lie') w.lie = 0.05;
    if (this.state === 'root') w.root = 0.12;
    var total = 0;
    for (k in w) total += w[k];
    var r = Math.random() * total, acc = 0, pick = 'idle';
    for (k in w) { acc += w[k]; if (r <= acc) { pick = k; break; } }
    this.setState(pick, false);
  };

  Critter.prototype.arrive = function () {
    if (this.wantDrink) {
      this.wantDrink = false;
      this.drinkCd = 55 + Math.random() * 60;
      this.setState('drink', false);
      return;
    }
    if (this.locked) this.setState(this.stateBase, false);
    else this.pickNext();
  };

  Critter.prototype.resolve = function () {
    var i, o, dx, dz, d, min;
    for (i = 0; i < treeColliders.length; i++) {
      o = treeColliders[i];
      dx = this.x - o.x; dz = this.z - o.z;
      d = Math.hypot(dx, dz) || 0.0001;
      min = o.r + this.radius * 0.7;
      if (d < min) {
        this.x += (dx / d) * (min - d);
        this.z += (dz / d) * (min - d);
      }
    }
    for (i = 0; i < animals.length; i++) {
      o = animals[i];
      if (o === this) continue;
      dx = this.x - o.x; dz = this.z - o.z;
      d = Math.hypot(dx, dz) || 0.0001;
      min = (this.radius + o.radius) * 1.04;
      if (d < min) {
        this.x += (dx / d) * (min - d) * 0.62;
        this.z += (dz / d) * (min - d) * 0.62;
      }
    }
    var rv = nearestRiver(this.x, this.z);
    if (rv.d < this.radius + 0.6) {
      var need = this.radius + 0.6 - rv.d;
      this.x += rv.nx * need;
      this.z += rv.nz * need;
    }
    var pd = pondDist(this.x, this.z);
    if (pd < 1.10) {
      var need2 = (1.10 - pd) * pond.rx;
      var px = (this.x - pond.x) / (pond.rx || 1), pz = (this.z - pond.z) / (pond.rz || 1);
      var l = Math.hypot(px, pz) || 1;
      this.x += (px / l) * need2;
      this.z += (pz / l) * need2;
    }
    var nx = this.x / (ISLAND_RX * 0.895);
    var nz = this.z / (ISLAND_RZ * 0.895);
    var q = Math.pow(Math.abs(nx), 4) + Math.pow(Math.abs(nz), 4);
    if (q > 1) {
      var f = Math.pow(1 / q, 0.25);
      this.x *= f; this.z *= f;
    }
  };

  Critter.prototype.unwedge = function () {
    /* nudge it out of whatever it is caught on, and if that fails, move it */
    var i, o, dx, dz, d, min;
    for (i = 0; i < treeColliders.length; i++) {
      o = treeColliders[i];
      dx = this.x - o.x; dz = this.z - o.z;
      d = Math.hypot(dx, dz) || 0.0001;
      min = o.r + 0.9;
      if (d < min + 0.6) {
        this.x = o.x + (dx / d) * min;
        this.z = o.z + (dz / d) * min;
      }
    }
    this.stuck = 0;
    this.__lx = this.x; this.__lz = this.z; this.__still = 0;
    var spot = findSpot(this.x, this.z, 3.2);
    if (!spot && !canStand(this.x, this.z, true)) {
      spot = findSpot(0, 0, 9);
    }
    if (spot) {
      this.x = spot.x; this.z = spot.z;
      this.targetX = spot.x; this.targetZ = spot.z;
      makeRipple(spot.x, spot.z, 0xffffff, 0.02);
    }
    this.pickNext();
  };

  Critter.prototype.update = function (dt, time) {
    var m = this.model, spec = this.spec;
    if (this.appear < 1) this.appear = Math.min(1, this.appear + dt / 0.55);
    this.t += dt;
    if (this.drinkCd > 0) this.drinkCd -= dt;

    /* now and then a little voice, more often while awake */
    this.voiceT -= dt;
    if (this.voiceT <= 0) {
      this.voiceT = 10 + Math.random() * 24;
      if (P.audio && !this.leap && this.state !== 'sleep' && Math.random() < 0.5) {
        P.audio.voice(this.kind, 0.5, false, this.x, this.z);
      }
    }

    var moving = (this.state === 'walk' || this.state === 'trot');

    /* if the river is between it and where it wants to go, hop over in one bound */
    if (this.leap) {
      this.leap.t += dt;
      var lq = Math.min(1, this.leap.t / this.leap.dur);
      this.x = this.leap.fx + (this.leap.tx - this.leap.fx) * lq;
      this.z = this.leap.fz + (this.leap.tz - this.leap.fz) * lq;
      this.heading = this.leap.head;
      this.leapUp = Math.sin(lq * Math.PI);
      if (lq >= 1) {
        this.leap = null;
        this.leapUp = 0;
        this.stuck = 0;
        waterRipple(this.x - Math.sin(this.heading) * 1.0, this.z - Math.cos(this.heading) * 1.0, false);
      }
    }

    /* if it cannot make headway, push it free (animals must never stay wedged) */
    if (moving) {
      this.__lx = this.__lx === undefined ? this.x : this.__lx;
      this.__lz = this.__lz === undefined ? this.z : this.__lz;
      this.__still = (this.__still || 0) + dt;
      if (this.__still > 0.6) {
        var travelled = Math.hypot(this.x - this.__lx, this.z - this.__lz);
        if (travelled < 0.05) this.stuck = (this.stuck || 0) + this.__still; else this.stuck = 0;
        this.__lx = this.x; this.__lz = this.z; this.__still = 0;
      }
      if ((this.stuck || 0) > 1.6) this.unwedge();
    } else {
      this.__lx = this.x; this.__lz = this.z; this.__still = 0; this.stuck = 0;
    }
    if (!this.locked && !moving && this.state !== 'jump' && this.t > this.dur) this.pickNext();

    var hp = 0.02, hy = 0, rootY = 0, bodyY = 0, squash = 1;
    var legA = 0, legB = 0, legC = 0, legD = 0;
    var bodyRot = 0, headRoll = 0;

    if (this.leap) {
      rootY = (this.leapUp || 0) * 1.05;
      hp = 0.16;
      squash = 1 + (this.leapUp || 0) * 0.06;
      legA = -0.55; legB = -0.55; legC = 0.75; legD = 0.75;
    } else if (moving) {
      var dx = this.targetX - this.x;
      var dz = this.targetZ - this.z;
      var dist = Math.hypot(dx, dz);
      var rvn = nearestRiver(this.x, this.z);
      var towards = dx * rvn.nx + dz * rvn.nz;
      if (rvn.d < 1.8 && towards < -1.2 && dist > 3.2) {
        this.leap = {
          t: 0, dur: 0.92,
          fx: this.x, fz: this.z,
          tx: this.x - rvn.nx * 3.9, tz: this.z - rvn.nz * 3.9,
          head: Math.atan2(-rvn.nx, -rvn.nz)
        };
        this.leapUp = 0;
        return this.update(dt, time);
      }
      if (dist < 0.4 || this.t > this.dur + 7) {
        this.arrive();
      } else {
        var want = Math.atan2(dx, dz);
        var turnRate = this.state === 'trot' ? 3.6 : 5.0;
        this.heading = lerpAngle(this.heading, want, 1 - Math.exp(-turnRate * dt));
        var maxSp = this.state === 'trot' ? this.speed * 2.15 : this.speed;
        var sp = Math.min(maxSp, maxSp * dist / 1.1);
        this.x += Math.sin(this.heading) * sp * dt;
        this.z += Math.cos(this.heading) * sp * dt;
        var rate = this.state === 'trot' ? 13.5 :
          ((this.kind === 'pig' || this.kind === 'boar') ? 10 : 8.0);
        this.legPhase += dt * rate;
        hp = 0.10;
        bodyY = Math.abs(Math.sin(this.legPhase)) * 0.035 * (this.state === 'trot' ? 1.6 : 1);
        legA = Math.sin(this.legPhase) * (this.state === 'trot' ? 0.85 : 0.6);
        legB = -legA;
        if (this.state === 'trot') {
          legC = Math.sin(this.legPhase + Math.PI) * 0.8;
          legD = -legC;
        } else {
          legC = legA; legD = legB;
        }
      }
    } else if (this.state === 'graze') {
      hp = spec.headDown + Math.sin(this.t * 2.1 + this.phase) * 0.10;
      hy = Math.sin(this.t * 0.45 + this.phase) * 0.22;
      bodyY = -0.015;
      squash = 1.0 + Math.sin(this.t * 2.1 + this.phase) * 0.008;
    } else if (this.state === 'drink') {
      hp = 1.02 + Math.sin(this.t * 3.4 + this.phase) * 0.07;
      hy = Math.sin(this.t * 0.7 + this.phase) * 0.10;
      bodyY = -0.012;
      squash = 1.0 + Math.sin(this.t * 3.4 + this.phase) * 0.006;
      this.drinkPulse -= dt;
      if (this.drinkPulse <= 0) {
        this.drinkPulse = 0.85;
        var ex = this.x - pond.x, ez = this.z - pond.z;
        var el = Math.hypot(ex / pond.rx, ez / pond.rz) || 1;
        waterRipple(pond.x + (ex / el) * 0.96, pond.z + (ez / el) * 0.96, false);
      }
    } else if (this.state === 'sleep') {
      hp = 0.55; hy = 0.55; rootY = -0.05; bodyY = -0.12;
      squash = 0.93 + Math.sin(time * 1.3 + this.phase) * 0.012;
      legA = 0.35; legC = 0.35;
    } else if (this.state === 'jump') {
      var p = (this.t / 0.62) % 1;
      rootY = Math.max(0, Math.sin(p * Math.PI)) * 0.62;
      squash = 1 - 0.10 * Math.cos(p * Math.PI * 2);
      hp = 0.12;
      legA = 0.4 * Math.sin(p * Math.PI);
      legC = legA;
      if (!this.locked && this.t > this.dur) this.pickNext();
    } else if (this.state === 'lie') {
      bodyY = -0.16; rootY = 0;
      squash = 0.96;
      legA = 1.35; legB = 1.35; legC = 1.35; legD = 1.35;
      hp = 0.28 + Math.sin(time * 0.8 + this.phase) * 0.03;
      hy = Math.sin(time * 0.4 + this.phase) * 0.10;
    } else if (this.state === 'root') {
      var rp = Math.sin(this.t * 6.2 + this.phase);
      hp = spec.headDown + 0.22 + rp * 0.14;
      hy = Math.sin(this.t * 3.1 + this.phase) * 0.18;
      bodyY = -0.03 + Math.abs(rp) * 0.02;
      legA = 0.15;
      if (Math.random() < dt * 3.2) puffDirt(this);
    } else if (this.state === 'roll') {
      var rr = Math.min(1, this.t / 0.9);
      bodyRot = Math.sin(this.t * 6.5) * 0.5;
      bodyY = -0.10 + Math.sin(this.t * 6.5) * 0.03;
      squash = 0.92;
      hp = 0.35;
      legA = 0.9; legC = 0.9;
      if (Math.random() < dt * 2.4) puffDirt(this);
      if (rr >= 1) bodyRot *= Math.max(0, 1 - (this.t - 0.9));
    } else { // idle
      hp = 0.03 + Math.sin(time * 1.6 + this.phase) * 0.055;
      hy = Math.sin(time * 0.55 + this.phase) * 0.34;
      bodyY = Math.sin(time * 1.6 + this.phase) * 0.012;
      squash = 1 + Math.sin(time * 1.6 + this.phase) * 0.008;
      headRoll = Math.sin(time * 0.9 + this.phase) * 0.02;
    }

    /* special one-shot animations */
    if (this.actionName === 'rear') {
      var rq = Math.min(1, this.action / 0.85);
      var up = Math.sin(rq * Math.PI);
      bodyRot = -up * 0.55;
      rootY = up * 0.28;
      legA = up * 1.0; legB = up * 1.0;
      hp = -up * 0.25;
    }

    if (!this.leap) this.resolve();

    var k = 1 - Math.exp(-9 * dt);
    this.hp += (hp - this.hp) * k;
    this.hy += (hy - this.hy) * k;
    this.bodyY += (bodyY - this.bodyY) * k;
    this.squash += (squash - this.squash) * k;
    this.rootY += (rootY - this.rootY) * Math.min(1, dt * 26);
    this.bodyRot = (this.bodyRot || 0) + (bodyRot - (this.bodyRot || 0)) * k;

    m.head.rotation.x = this.hp + (m.headBias || 0);
    m.head.rotation.y = this.hy;
    m.head.rotation.z = headRoll;
    m.body.position.y = this.bodyY;
    m.body.rotation.x = this.bodyRot;
    m.body.scale.set(1, this.squash, 1);
    var legs = m.legs;
    if (legs) {
      legs[0].rotation.x = legA; legs[1].rotation.x = legB;
      legs[2].rotation.x = legC; legs[3].rotation.x = legD;
    }
    if (m.tail) {
      m.tail.rotation.z = Math.sin(time * 1.7 + this.phase) * 0.22;
      if (this.kind === 'cow') m.tail.rotation.x = Math.sin(time * 1.1 + this.phase) * 0.12;
    }

    var pop = easeOutBack(this.appear);
    this.group.scale.setScalar(this.baseScale * pop);
    this.group.position.set(this.x, this.rootY, this.z);
    this.group.rotation.y = this.heading;
    this.group.updateMatrixWorld(true);
  };

  Critter.prototype.startAction = function (name) {
    this.actionName = name;
    this.action = 0;
    this.locked = true;
    if (name === 'rear') this.t = 0;
    if (name === 'milk') this.milkT = 0;
  };

  Critter.prototype.destroy = function () {
    scene.remove(this.group);
    P.disposeObject(this.group);
  };

  function spawnAnimal(kind, x, z, opts) {
    opts = opts || {};
    if (animals.length >= MAX_ANIMALS) return null;
    var spot = opts.force ? { x: x, z: z } : (findSpot(x, z, 2.6) || { x: x, z: z });
    var seed = (Math.random() * 1e6) | 0;
    var a = new Critter(kind, seed, spot.x, spot.z,
      opts.heading === undefined ? Math.random() * Math.PI * 2 : opts.heading);
    a.talk = opts.talk || '';
    a.appear = 0;
    animals.push(a);
    if (!opts.silent) makeRipple(spot.x, spot.z, 0xffffff);
    if (opts.select) select(a);
    return a;
  }

  /* ---- the opening herd ---- */
  [
    ['sheep', 0.345, 0.300], ['sheep', 0.398, 0.244], ['sheep', 0.330, 0.186],
    ['sheep', 0.610, 0.205], ['sheep', 0.682, 0.272], ['sheep', 0.736, 0.362],
    ['sheep', 0.354, 0.662], ['sheep', 0.412, 0.726], ['sheep', 0.482, 0.816],
    ['sheep', 0.592, 0.762], ['sheep', 0.300, 0.446],
    ['cow', 0.802, 0.188], ['cow', 0.864, 0.336], ['cow', 0.762, 0.522],
    ['horse', 0.666, 0.616], ['horse', 0.846, 0.642],
    ['boar', 0.700, 0.860, { talk: '我是WFC' }],
    ['pig', 0.762, 0.802], ['pig', 0.656, 0.906]
  ].forEach(function (row) {
    var w = uvToWorld(row[1], row[2]);
    var o = row[3] || {};
    o.silent = true;
    spawnAnimal(row[0], w.x, w.z, o);
  });

  /* ------------------------------------------------------------
     pond life — swans, ducks, fish, lily pads, reeds
     ------------------------------------------------------------ */
  var swans = [], ducks = [], fishes = [], pondProps = [], pondRipples = [];

  function waterY(x, z) {
    return POND_Y + 0.015;
  }

  (function buildPondLife() {
    var i, a, r, x, z;

    /* swans glide on slow circles */
    [[0.62, 0.9], [1.5, 2.1]].forEach(function (cfg, i2) {
      var m = P.makeSwan(i2 + 2);
      var sw = {
        m: m, g: m.root, ang: cfg[1], rad: cfg[0], speed: 0.11 + i2 * 0.02,
        flap: 0, t: Math.random() * 6, kind: 'swan'
      };
      m.root.userData.pond = sw;
      m.root.scale.setScalar(1.38);
      m.root.position.set(pond.x + Math.cos(sw.ang) * sw.rad * pond.rx * 0.5, waterY(), pond.z + Math.sin(sw.ang) * sw.rad * pond.rz * 0.5);
      scene.add(m.root);
      swans.push(sw);
    });

    /* ducks paddle about, sometimes dive */
    for (i = 0; i < 4; i++) {
      var dm = P.makeDuck(i + 7, i % 2 === 0);
      var du = {
        m: dm, g: dm.root,
        x: pond.x + (Math.random() - 0.5) * pond.rx * 1.1,
        z: pond.z + (Math.random() - 0.5) * pond.rz * 1.1,
        heading: Math.random() * Math.PI * 2,
        t: Math.random() * 4, dive: 0, bob: Math.random() * 6, kind: 'duck'
      };
      dm.root.userData.pond = du;
      dm.root.scale.setScalar(1.08);
      dm.root.position.set(du.x, waterY(), du.z);
      scene.add(dm.root);
      ducks.push(du);
    }

    /* fish under the surface — 3 grey, 3 red, 2 pied, 1 gold */
    var roster = [
      [P.mats.fishGray, 1.42, false], [P.mats.fishGray, 1.28, false], [P.mats.fishGray, 1.58, false],
      [P.mats.fishRed, 1.48, false], [P.mats.fishRed, 1.32, false], [P.mats.fishRed, 1.62, false],
      [P.mats.fishPied, 1.44, false], [P.mats.fishPied, 1.56, false],
      [P.mats.fishGold, 1.50, true]
    ];
    for (i = 0; i < roster.length; i++) {
      var size = roster[i][1];
      var fm = P.makeFish(i + 3, roster[i][0], size);
      var fs = {
        m: fm, g: fm.root,
        x: pond.x + (Math.random() - 0.5) * pond.rx * 1.2,
        z: pond.z + (Math.random() - 0.5) * pond.rz * 1.2,
        heading: Math.random() * Math.PI * 2,
        speed: 0.55 + Math.random() * 0.5,
        t: Math.random() * 9, depth: -0.30 - Math.random() * 0.12, rise: 0,
        scale: size, gold: roster[i][2], kind: 'fish'
      };
      fm.root.userData.pond = fs;
      fm.root.scale.setScalar(1.0);
      fs.depth0 = fs.depth;
      fm.root.position.set(fs.x, fs.depth, fs.z);
      scene.add(fm.root);
      fishes.push(fs);
    }

    /* lily pads */
    for (i = 0; i < 9; i++) {
      var lp = P.makeLilyPad(i + 2);
      a = Math.random() * Math.PI * 2;
      r = 0.2 + Math.random() * 0.62;
      lp.position.set(pond.x + Math.cos(a) * r * pond.rx, -0.075, pond.z + Math.sin(a) * r * pond.rz);
      lp.rotation.y = Math.random() * 6.28;
      lp.scale.setScalar(1.25 + Math.random() * 0.35);
      scene.add(lp);
      pondProps.push({ g: lp, y: -0.075, t: Math.random() * 6 });
    }

    /* shallow shelf: a sandy rim you can wade to */
    var shelfTex = (function () {
      var c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      var g2 = c.getContext('2d');
      g2.clearRect(0, 0, 256, 256);
      var grd = g2.createRadialGradient(128, 128, 80, 128, 128, 128);
      grd.addColorStop(0.00, 'rgba(216,198,152,0.0)');
      grd.addColorStop(0.06, 'rgba(216,198,152,0.92)');
      grd.addColorStop(0.55, 'rgba(210,190,144,0.86)');
      grd.addColorStop(0.86, 'rgba(198,180,136,0.42)');
      grd.addColorStop(1.00, 'rgba(198,180,136,0.0)');
      g2.fillStyle = grd;
      g2.beginPath(); g2.ellipse(128, 128, 126, 126, 0, 0, 6.283); g2.fill();
      var rnd2 = P.mulberry32(5512);
      for (var q2 = 0; q2 < 150; q2++) {
        var ang2 = rnd2() * 6.283;
        var rad2 = 84 + rnd2() * 42;
        var px2 = 128 + Math.cos(ang2) * rad2;
        var py2 = 128 + Math.sin(ang2) * rad2;
        var pr2 = 0.9 + rnd2() * 2.4;
        g2.fillStyle = rnd2() < 0.5 ? 'rgba(158,140,102,0.30)' : 'rgba(238,228,198,0.26)';
        g2.beginPath(); g2.arc(px2, py2, pr2, 0, 6.283); g2.fill();
      }
      var t2 = new T.CanvasTexture(c);
      t2.encoding = T.sRGBEncoding;
      return t2;
    })();
    var shelfGeo = new T.RingGeometry(0.985, 1.31, 72, 1);
    shelfGeo.rotateX(-Math.PI / 2);
    pondFit(shelfGeo, pond.rx, pond.rz);
    var shelf = new T.Mesh(shelfGeo, new T.MeshStandardMaterial({
      map: shelfTex, transparent: true, roughness: 1, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    }));
    shelf.scale.set(pond.rx, 1, pond.rz);
    shelf.position.set(pond.x, -0.014, pond.z);
    shelf.receiveShadow = true;
    shelf.renderOrder = 0;
    scene.add(shelf);

    /* reeds and rocks at the shore */
    for (i = 0; i < 26; i++) {
      a = (i / 26) * Math.PI * 2 + Math.random() * 0.4;
      r = 0.95 + Math.random() * 0.09;
      var rp = P.makeReed(i + 4);
      rp.position.set(pond.x + Math.cos(a) * r * pond.rx, 0, pond.z + Math.sin(a) * r * pond.rz);
      rp.scale.setScalar(1.25 + Math.random() * 0.7);
      scene.add(rp);
    }
    for (i = 0; i < 7; i++) {
      a = Math.random() * Math.PI * 2;
      r = 0.965 + Math.random() * 0.065;
      var rk = P.makeRock(i + 6, 0.24 + Math.random() * 0.18);
      rk.position.set(pond.x + Math.cos(a) * r * pond.rx, 0, pond.z + Math.sin(a) * r * pond.rz);
      scene.add(rk);
    }
  })();

  /* ------------------------------------------------------------
     ripples + puffs
     ------------------------------------------------------------ */
  var rippleGeo = new T.RingGeometry(0.90, 1.0, 48);
  rippleGeo.rotateX(-Math.PI / 2);
  var ripples = [];

  function makeRipple(x, z, color, y) {
    var mat = new T.MeshBasicMaterial({
      color: color === undefined ? 0xffffff : color,
      transparent: true, opacity: 0.75,
      depthWrite: false, side: T.DoubleSide
    });
    var mesh = new T.Mesh(rippleGeo, mat);
    mesh.position.set(x, y === undefined ? 0.04 : y, z);
    mesh.scale.setScalar(0.35);
    scene.add(mesh);
    ripples.push({ m: mesh, t: 0, life: 0.85, s0: 0.35, s1: 2.3 });
    return mesh;
  }

  function waterRipple(x, z, big) {
    var mat = new T.MeshBasicMaterial({
      color: 0xdff2ff, transparent: true, opacity: 0.7,
      depthWrite: false, side: T.DoubleSide
    });
    var mesh = new T.Mesh(rippleGeo, mat);
    mesh.position.set(x, POND_Y + 0.02, z);
    mesh.scale.setScalar(0.3);
    scene.add(mesh);
    ripples.push({ m: mesh, t: 0, life: big ? 1.4 : 1.0, s0: 0.3, s1: big ? 3.0 : 1.8 });
  }

  /* little dust puffs when a pig roots */
  var puffGeo = new T.SphereGeometry(0.09, 6, 5);
  var puffs = [];
  function puffDirt(a) {
    for (var i = 0; i < 2; i++) {
      var mat = new T.MeshBasicMaterial({
        color: 0xb49a72, transparent: true, opacity: 0.7, depthWrite: false
      });
      var m = new T.Mesh(puffGeo, mat);
      m.position.set(
        a.x + Math.sin(a.heading) * a.radius * 0.7 + (Math.random() - 0.5) * 0.3,
        0.12 + Math.random() * 0.1,
        a.z + Math.cos(a.heading) * a.radius * 0.7 + (Math.random() - 0.5) * 0.3
      );
      m.scale.setScalar(0.6 + Math.random() * 0.7);
      scene.add(m);
      puffs.push({
        m: m, t: 0,
        vx: (Math.random() - 0.5) * 0.5, vy: 0.5 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.5
      });
    }
  }

  /* milk squirts for the cow */
  var milkDrops = [];
  function squirtMilk(a) {
    for (var i = 0; i < 4; i++) {
      var mat = new T.MeshBasicMaterial({ color: 0xfffdf2, transparent: true, opacity: 0.95, depthWrite: false });
      var m = new T.Mesh(new T.SphereGeometry(0.055, 6, 5), mat);
      var bx = a.x - Math.sin(a.heading) * a.radius * 0.32;
      var bz = a.z - Math.cos(a.heading) * a.radius * 0.32;
      m.position.set(bx, 0.30, bz);
      scene.add(m);
      milkDrops.push({
        m: m, t: 0,
        vx: (Math.random() - 0.5) * 0.25, vy: 0.35 + Math.random() * 0.25, vz: (Math.random() - 0.5) * 0.25
      });
    }
    makeRipple(a.x, a.z, 0xfffdf2, 0.05);
  }

  function updateRipples(dt) {
    var i, r, p;
    for (i = ripples.length - 1; i >= 0; i--) {
      r = ripples[i];
      r.t += dt;
      p = r.t / r.life;
      if (p >= 1) {
        scene.remove(r.m);
        r.m.material.dispose();
        ripples.splice(i, 1);
        continue;
      }
      var s = r.s0 + p * (r.s1 - r.s0);
      r.m.scale.setScalar(s);
      r.m.material.opacity = 0.75 * (1 - p) * (1 - p);
    }
    for (i = puffs.length - 1; i >= 0; i--) {
      var pf = puffs[i];
      pf.t += dt;
      var q = pf.t / 0.9;
      if (q >= 1) { scene.remove(pf.m); pf.m.material.dispose(); puffs.splice(i, 1); continue; }
      pf.m.position.x += pf.vx * dt;
      pf.m.position.y += pf.vy * dt;
      pf.m.position.z += pf.vz * dt;
      pf.vy -= dt * 0.6;
      pf.m.material.opacity = 0.7 * (1 - q);
      pf.m.scale.multiplyScalar(1 + dt * 0.8);
    }
    for (i = milkDrops.length - 1; i >= 0; i--) {
      var md = milkDrops[i];
      md.t += dt;
      var mq = md.t / 0.8;
      if (mq >= 1) { scene.remove(md.m); md.m.material.dispose(); milkDrops.splice(i, 1); continue; }
      md.m.position.x += md.vx * dt;
      md.m.position.y += md.vy * dt;
      md.m.position.z += md.vz * dt;
      md.vy -= dt * 2.2;
      md.m.material.opacity = 0.95 * (1 - mq);
    }
  }

  /* ------------------------------------------------------------
     picking
     ------------------------------------------------------------ */
  var raycaster = new T.Raycaster();
  var ndc = new T.Vector2();
  var groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);

  function setNdc(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
  }

  function pickAnimal(clientX, clientY) {
    setNdc(clientX, clientY);
    raycaster.setFromCamera(ndc, camera);
    var list = [];
    for (var i = 0; i < animals.length; i++) list.push(animals[i].group);
    var hits = raycaster.intersectObjects(list, true);
    for (var h = 0; h < hits.length; h++) {
      var o = hits[h].object;
      while (o) {
        if (o.userData && o.userData.critter) return o.userData.critter;
        o = o.parent;
      }
    }
    return null;
  }

  function pickPondLife(clientX, clientY) {
    setNdc(clientX, clientY);
    raycaster.setFromCamera(ndc, camera);
    var list = [];
    var i;
    for (i = 0; i < swans.length; i++) list.push(swans[i].g);
    for (i = 0; i < ducks.length; i++) list.push(ducks[i].g);
    for (i = 0; i < fishes.length; i++) list.push(fishes[i].g);
    var hits = raycaster.intersectObjects(list, true);
    if (!hits.length) return null;
    var o = hits[0].object;
    while (o) {
      if (o.userData && o.userData.pond) return o.userData.pond;
      o = o.parent;
    }
    // fall back to the root we hit
    for (i = 0; i < swans.length; i++) if (swans[i].g === hits[0].object.parent) return swans[i];
    return null;
  }

  function screenToGround(clientX, clientY) {
    setNdc(clientX, clientY);
    raycaster.setFromCamera(ndc, camera);
    var p = new T.Vector3();
    var hit = raycaster.ray.intersectPlane(groundPlane, p);
    return hit ? p : null;
  }

  /* ------------------------------------------------------------
     selection ui
     ------------------------------------------------------------ */
  var tmpV = new T.Vector3();
  var worldBox = new T.Box3();

  function silhouettePoints(root) {
    root.updateMatrixWorld(true);
    var pts = [], inv = new T.Matrix4().copy(root.matrixWorld).invert();
    var m = new T.Matrix4(), c = new T.Vector3(), sc = new T.Vector3();
    root.traverse(function (o) {
      if (!o.isMesh || (o.material && o.material.colorWrite === false)) return;
      var g = o.geometry;
      if (!g) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      var bs = g.boundingSphere;
      if (!bs || !bs.radius) return;
      m.multiplyMatrices(inv, o.matrixWorld);
      sc.setFromMatrixScale(o.matrixWorld);
      var r = bs.radius * Math.max(sc.x, sc.y, sc.z);
      c.copy(bs.center).applyMatrix4(m);
      pts.push(c.clone());
      pts.push(new T.Vector3(c.x + r, c.y, c.z), new T.Vector3(c.x - r, c.y, c.z));
      pts.push(new T.Vector3(c.x, c.y + r, c.z), new T.Vector3(c.x, c.y - r, c.z));
      pts.push(new T.Vector3(c.x, c.y, c.z + r), new T.Vector3(c.x, c.y, c.z - r));
    });
    return pts;
  }

  function barHTML(kind) {
    var spec = SPECIES[kind], h = '', i;
    for (i = 0; i < spec.actions.length; i++) {
      h += '<button data-act="' + spec.actions[i].act + '">' + spec.actions[i].label + '</button>';
    }
    h += '<span class="div"></span>';
    h += '<button class="icon" data-act="turn" title="转个方向">' + ICONS.turn + '</button>';
    h += '<button class="icon" data-act="reset" title="回到原位">' + ICONS.reset + '</button>';
    h += '<button class="icon" data-act="clone" title="再来一只">' + ICONS.clone + '</button>';
    h += '<button class="icon danger" data-act="delete" title="送走它">' + ICONS.del + '</button>';
    return h;
  }

  function select(a) {
    if (selected === a) return;
    if (selected) selected.locked = false;
    selected = a;
    if (selected) {
      bar.innerHTML = barHTML(selected.kind);
      if (P.audio) P.audio.voice(selected.kind, 0.85, true);
    }
    selEl.hidden = !selected;
    updateBarActive();
  }

  function deselect(keepView) {
    if (selected) selected.locked = false;
    selected = null;
    if (keepView !== true) { followed = null; lastAnimalTap = null; }
    selEl.hidden = true;
  }

  function updateBarActive() {
    if (!selected) return;
    var btns = bar.querySelectorAll('button[data-act]');
    for (var i = 0; i < btns.length; i++) {
      var at = btns[i].getAttribute('data-act');
      var marching = marchTarget === selected;
      var lit = marching ? (at === 'walk' || at === 'trot') : (at === selected.state);
      btns[i].classList.toggle('active', lit);
    }
  }

  function updateSelectionUI() {
    if (!selected) return;
    var g = selected.group;
    worldBox.makeEmpty();
    var i;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    var pts = selected.samples;
    for (i = 0; i < pts.length; i++) {
      tmpV.copy(pts[i]).applyMatrix4(g.matrixWorld);
      worldBox.expandByPoint(tmpV);
      tmpV.project(camera);
      var sx = (tmpV.x * 0.5 + 0.5) * vw;
      var sy = (-tmpV.y * 0.5 + 0.5) * vh;
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
    }
    minX -= 3; maxX += 3; minY -= 3; maxY += 3;
    selEl.style.left = minX.toFixed(1) + 'px';
    selEl.style.top = minY.toFixed(1) + 'px';
    selEl.style.width = Math.max(12, maxX - minX).toFixed(1) + 'px';
    selEl.style.height = Math.max(12, maxY - minY).toFixed(1) + 'px';

    var sz = worldBox.getSize(new T.Vector3());
    selSize.textContent = sz.x.toFixed(2) + ' × ' + sz.z.toFixed(2) + ' m';
    var center = worldBox.getCenter(new T.Vector3());
    var dist = camera.position.distanceTo(center);
    selDist.textContent = Math.max(5, Math.round(dist * 1.35 / 5) * 5) + ' m away';

    var barW = 320;
    if (bar.offsetWidth) barW = bar.offsetWidth;
    var left = 0;
    if (minX + barW > vw - 10) left = (vw - 10) - barW - minX;
    if (minX + left < 10) left = 10 - minX;
    bar.style.left = left.toFixed(1) + 'px';

    var below = minY + (maxY - minY) + 34 + 44;
    if (below > vh - 8) {
      bar.style.top = 'auto';
      bar.style.bottom = 'calc(100% + 34px)';
    } else {
      bar.style.top = 'calc(100% + 34px)';
      bar.style.bottom = 'auto';
    }

    // speech bubble (only when it belongs to the selected animal)
    if (bubbleT > 0 && bubbleOwner === selected) {
      bubbleT -= 1 / 60;
      var bx = (minX + maxX) * 0.5;
      bubbleEl.style.left = bx.toFixed(1) + 'px';
      bubbleEl.style.top = (minY - 6).toFixed(1) + 'px';
      if (bubbleT <= 0) bubbleEl.classList.remove('on');
    }
  }

  /* ------------------------------------------------------------
     speech bubble
     ------------------------------------------------------------ */
  var bubbleT = 0, bubbleOwner = null;
  function say(a, text) {
    if (!a) return;
    bubbleOwner = a;
    var wp;
    if (a.g) {
      wp = new T.Vector3(a.g.position.x, a.g.position.y + 0.85, a.g.position.z);
    } else {
      wp = new T.Vector3(a.x, a.radius * 1.7 * a.baseScale, a.z);
    }
    wp.project(camera);
    bubbleEl.textContent = text;
    bubbleEl.style.left = ((wp.x * 0.5 + 0.5) * vw).toFixed(1) + 'px';
    bubbleEl.style.top = ((-wp.y * 0.5 + 0.5) * vh).toFixed(1) + 'px';
    bubbleEl.classList.add('on');
    bubbleT = 1.6;
    clearTimeout(say.timer);
    say.timer = setTimeout(function () { bubbleEl.classList.remove('on'); }, 1600);
  }

  /* ------------------------------------------------------------
     toolbar actions
     ------------------------------------------------------------ */
  bar.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button[data-act]') : null;
    if (!btn || !selected) return;
    e.preventDefault();
    e.stopPropagation();
    var act = btn.getAttribute('data-act');
    var spec = SPECIES[selected.kind];

    if (act === 'milk') {
      selected.setState('idle', true);
      selected.startAction('milk');
      squirtMilk(selected);
      say(selected, '哞～');
      return;
    }
    if (act === 'rear') {
      selected.setState('idle', true);
      selected.startAction('rear');
      say(selected, '咴儿～');
      return;
    }
    if (act === 'oink') {
      say(selected, spec.sound || '哼唧～');
      selected.setState('root', true);
      return;
    }
    if (act === 'walk' || act === 'trot') {
      if (marchTarget === selected) { marchTarget = null; updateBarActive(); return; }
      marchTarget = selected;
      updateBarActive();
      hintFlash('在草地上点一个地方，它就走过去');
      return;
    }
    if (act === 'turn') {
      selected.heading += Math.PI / 5;
    } else if (act === 'reset') {
      selected.x = selected.homeX;
      selected.z = selected.homeZ;
      selected.heading = selected.homeHeading;
      selected.setState((selected.kind === 'pig' || selected.kind === 'boar') ? 'root' : 'idle', true);
      selected.appear = 1;
    } else if (act === 'clone') {
      var spot = findSpot(selected.x + selected.radius * 1.6, selected.z + selected.radius * 1.4, 3.0);
      if (spot) {
        var baby = spawnAnimal(selected.kind, spot.x, spot.z, { select: true, force: true });
        if (baby) { baby.locked = true; baby.setState('idle', true); }
      }
    } else if (act === 'delete') {
      var i = animals.indexOf(selected);
      if (i >= 0) {
        selected.destroy();
        animals.splice(i, 1);
      }
      deselect();
    } else {
      selected.setState(act, true);
      if (act === 'idle' || act === 'graze' || act === 'walk' ||
          act === 'jump' || act === 'lie' || act === 'root' || act === 'roll' || act === 'trot') {
        if (spec.sound && act === 'idle' && Math.random() < 0.0) say(selected, spec.sound);
      }
      updateBarActive();
    }
  });

  /* ------------------------------------------------------------
     ink drawing + spawning by lasso
     ------------------------------------------------------------ */
  var draw = { active: false, moved: false, pts: [], id: null };
  var inkFading = false;

  function inkSize() {
    ink.width = Math.round(vw * dpr);
    ink.height = Math.round(vh * dpr);
    ink.style.width = vw + 'px';
    ink.style.height = vh + 'px';
  }
  inkSize();

  function tracePath(ctx, pts) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i].x + pts[i + 1].x) * 0.5;
      var my = (pts[i].y + pts[i + 1].y) * 0.5;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    var last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  function redrawInk() {
    inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    inkCtx.clearRect(0, 0, vw, vh);
    if (draw.pts.length < 2) return;
    inkCtx.lineCap = 'round';
    inkCtx.lineJoin = 'round';
    inkCtx.strokeStyle = 'rgba(255,255,255,0.13)';
    inkCtx.lineWidth = 26;
    tracePath(inkCtx, draw.pts);
    inkCtx.stroke();
    inkCtx.strokeStyle = 'rgba(252,255,240,0.90)';
    inkCtx.lineWidth = 3.6;
    tracePath(inkCtx, draw.pts);
    inkCtx.stroke();
  }

  function clearInk(fade) {
    if (fade) {
      ink.style.opacity = '0';
      clearTimeout(inkFading);
      inkFading = setTimeout(function () {
        inkCtx.clearRect(0, 0, ink.width, ink.height);
        draw.pts = [];
        ink.style.opacity = '1';
      }, 520);
    } else {
      draw.pts = [];
      inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      inkCtx.clearRect(0, 0, vw, vh);
    }
  }

  function polygonArea(pts) {
    var a = 0;
    for (var i = 0; i < pts.length; i++) {
      var j = (i + 1) % pts.length;
      a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return a * 0.5;
  }

  function polygonCentroid(pts) {
    var a = 0, cx = 0, cy = 0;
    for (var i = 0; i < pts.length; i++) {
      var j = (i + 1) % pts.length;
      var f = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
      a += f;
      cx += (pts[i].x + pts[j].x) * f;
      cy += (pts[i].y + pts[j].y) * f;
    }
    if (Math.abs(a) < 0.001) {
      cx = 0; cy = 0;
      for (var k = 0; k < pts.length; k++) { cx += pts[k].x; cy += pts[k].y; }
      return { x: cx / pts.length, y: cy / pts.length };
    }
    a *= 0.5;
    return { x: cx / (6 * a), y: cy / (6 * a) };
  }

  var marchTarget = null;

  function hintFlash(msg) {
    var h = document.getElementById('hint');
    if (!h) return;
    if (!h.dataset.orig) h.dataset.orig = h.innerHTML;
    h.innerHTML = msg;
    clearTimeout(hintFlash._t);
    hintFlash._t = setTimeout(function () { h.innerHTML = h.dataset.orig; }, 3200);
  }

  function toggleFollowOnDoubleTap(event, group, radius) {
    var now = performance.now();
    var previous = lastAnimalTap;
    if (previous && previous.group === group && previous.type === event.pointerType &&
        now - previous.time <= 420 && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 28) {
      followed = followed === group ? null : group;
      followedRadius = radius;
      lastAnimalTap = null;
      return true;
    }
    lastAnimalTap = { group: group, type: event.pointerType, time: now, x: event.clientX, y: event.clientY };
    return false;
  }

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (bar.contains(e.target)) return;
    if (P.audio) P.audio.init();

    var a = pickAnimal(e.clientX, e.clientY);
    if (a) {
      var toggled = toggleFollowOnDoubleTap(e, a.group, a.radius);
      if (!toggled && selected === a && P.audio) P.audio.voice(a.kind, 0.85, true);
      select(a);
      if (!toggled && a.talk) say(a, a.talk);
      e.preventDefault();
      return;
    }

    var life = pickPondLife(e.clientX, e.clientY);
    if (life) {
      deselect(true);
      if (toggleFollowOnDoubleTap(e, life.g, 0)) { e.preventDefault(); return; }
      if (P.audio) P.audio.voice(life.kind, 0.8, true);
      if (life.kind === 'swan') {
        life.flap = 1;
        life.t = 0;
        say(null, '');
        waterRipple(life.g.position.x, life.g.position.z, true);
      } else if (life.kind === 'duck') {
        if (life.dive <= 0) {
          life.dive = 2.4; life.splashed = false;
          if (P.audio) P.audio.splash(false);
          waterRipple(life.x, life.z, true);
        }
      } else if (life.kind === 'fish') {
        life.rise = 3.0;
        waterRipple(life.x, life.z, false);
        if (life.gold) say(life, '我是ZY');
      }
      e.preventDefault();
      return;
    }

    lastAnimalTap = null;

    // water: ripple + fish scatter, and still allow lassoing a new pond creature
    var g = screenToGround(e.clientX, e.clientY);
    if (g && pondDist(g.x, g.z) < 1.0) {
      waterRipple(g.x, g.z, true);
      if (P.audio) P.audio.splash(false);
      for (var i = 0; i < fishes.length; i++) {
        var f = fishes[i];
        var dd = Math.hypot(f.x - g.x, f.z - g.z);
        if (dd < 4) {
          f.heading = Math.atan2(f.x - g.x, f.z - g.z);
          f.startle = 1.6;
        }
      }
      deselect();
      marchTarget = null;
      /* fall through: the stroke may turn into a lasso in the water */
    } else if (marchTarget && g) {
      var mt = marchTarget;
      marchTarget = null;
      mt.wantDrink = false;
      mt.locked = false;
      mt.setState('walk', false);   /* sets its own random target */
      mt.targetX = g.x; mt.targetZ = g.z;
      mt.dur = 26;
      mt.pick = Math.atan2(g.x - mt.x, g.z - mt.z);
      makeRipple(g.x, g.z, 0xffd98a, 0.02);
      updateBarActive();
      e.preventDefault();
      return;
    }

    deselect();
    draw.active = true;
    draw.moved = false;
    draw.pts = [{ x: e.clientX, y: e.clientY }];
    draw.id = e.pointerId;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  }

  function onMove(e) {
    if (!draw.active || e.pointerId !== draw.id) return;
    var p = { x: e.clientX, y: e.clientY };
    var last = draw.pts[draw.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 2.2) return;
    draw.pts.push(p);
    if (!draw.moved) {
      var s = draw.pts[0];
      if (Math.hypot(p.x - s.x, p.y - s.y) > 9) draw.moved = true;
    }
    if (draw.moved) redrawInk();
  }


  /* ------------------------------------------------------------
     lasso in the water → a new pond creature
     ------------------------------------------------------------ */
  function pondFreeSpot(kind) {
    var pad = kind === 'swan' ? 1.55 : kind === 'duck' ? 0.95 : 0.5;
    for (var tries = 0; tries < 60; tries++) {
      var a2 = Math.random() * Math.PI * 2;
      var rr = Math.sqrt(Math.random()) * 0.76;           // even spread, stays off the shore
      var px = pond.x + Math.cos(a2) * rr * pond.rx;
      var pz = pond.z + Math.sin(a2) * rr * pond.rz;
      var ok = true, i2;
      for (i2 = 0; i2 < swans.length && ok; i2++) ok = Math.hypot(swans[i2].g.position.x - px, swans[i2].g.position.z - pz) > pad;
      for (i2 = 0; i2 < ducks.length && ok; i2++) ok = Math.hypot(ducks[i2].x - px, ducks[i2].z - pz) > pad;
      for (i2 = 0; i2 < fishes.length && ok; i2++) ok = Math.hypot(fishes[i2].x - px, fishes[i2].z - pz) > pad * 0.7;
      if (ok) return { x: px, z: pz, a: a2, r: rr };
    }
    return null;
  }

  function addPondCreature(kind, x, z) {
    var i2;
    if (kind === 'swan') {
      var m = P.makeSwan((Math.random() * 900) | 0);
      var ang = Math.atan2((z - pond.z) / pond.rz, (x - pond.x) / pond.rx);
      var rad = Math.max(0.42, Math.min(1.72, pondDist(x, z) / 0.52));
      /* keep its circle away from the other swans' rings */
      for (i2 = 0; i2 < swans.length; i2++) {
        if (Math.abs(swans[i2].rad - rad) < 0.3) rad += 0.36;
      }
      var sw = { m: m, g: m.root, ang: ang, rad: rad, speed: 0.1 + Math.random() * 0.05, flap: 0.9, t: 0, kind: 'swan', voiceT: 8 + Math.random() * 10 };
      m.root.userData.pond = sw;
      m.root.scale.setScalar(1.38);
      m.root.position.set(pond.x + Math.cos(ang) * rad * 0.52 * pond.rx, waterY(), pond.z + Math.sin(ang) * rad * 0.52 * pond.rz);
      scene.add(m.root);
      swans.push(sw);
      return sw;
    }
    if (kind === 'duck') {
      var dm = P.makeDuck((Math.random() * 900) | 0, Math.random() < 0.5);
      var du = {
        m: dm, g: dm.root, x: x, z: z, heading: Math.random() * Math.PI * 2,
        t: 0, dive: 0, bob: Math.random() * 6, kind: 'duck', voiceT: 8 + Math.random() * 10
      };
      dm.root.userData.pond = du;
      dm.root.scale.setScalar(1.08);
      dm.root.position.set(x, waterY(), z);
      scene.add(dm.root);
      ducks.push(du);
      return du;
    }
    var mats = [P.mats.fishGray, P.mats.fishRed, P.mats.fishGold, P.mats.fishPied];
    var mat = mats[(Math.random() * mats.length) | 0];
    var size = 1.2 + Math.random() * 0.45;
    var fm = P.makeFish((Math.random() * 900) | 0, mat, size);
    var fs2 = {
      m: fm, g: fm.root, x: x, z: z, heading: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 0.5, t: 0, depth: -0.30 - Math.random() * 0.12,
      rise: 0, scale: size, gold: mat === P.mats.fishGold, kind: 'fish', voiceT: 20 + Math.random() * 20
    };
    fm.root.userData.pond = fs2;
    fm.root.scale.setScalar(1.0);
    fs2.depth0 = fs2.depth;
    fm.root.position.set(x, fs2.depth, z);
    scene.add(fm.root);
    fishes.push(fs2);
    return fs2;
  }

  function spawnPondFromLasso(x, z) {
    var roll = Math.random();
    var kind = roll < 0.12 ? 'swan' : roll < 0.46 ? 'duck' : 'fish';
    var spot = pondFreeSpot(kind);
    if (!spot) return null;
    var made = addPondCreature(kind, spot.x, spot.z);
    if (made) {
      if (P.audio) P.audio.splash(true);
      waterRipple(spot.x, spot.z, true);
    }
    return made;
  }

  function spawnFromLasso(x, z) {
    var roll = Math.random();
    var kind = roll < 0.58 ? 'sheep' : roll < 0.78 ? 'pig' : roll < 0.93 ? 'cow' : 'horse';
    var a = spawnAnimal(kind, x, z, {});
    if (a) { a.setState('idle', true); }
    return a;
  }

  function onUp(e) {
    if (!draw.active || e.pointerId !== draw.id) return;
    draw.active = false;
    try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
    if (!draw.moved) { clearInk(false); return; }

    var pts = draw.pts.slice();
    var area = Math.abs(polygonArea(pts));
    var perim = 0, i;
    for (i = 1; i < pts.length; i++) perim += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);

    var closed = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y)
      < Math.max(80, perim * 0.30);
    var bigEnough = pts.length > 7 && perim > 170 && area > 5200;

    if (closed && bigEnough) {
      var c = polygonCentroid(pts);
      var g = screenToGround(c.x, c.y);
      var made = false;
      if (g) {
        if (pondDist(g.x, g.z) < 0.94) {
          made = !!spawnPondFromLasso(g.x, g.z);
        } else {
          var spot = findSpot(g.x, g.z, 3.0);
          if (spot) { spawnFromLasso(spot.x, spot.z); made = true; }
        }
      }
      if (!made) {
        for (i = 0; i < 12 && !made; i++) {
          var rx = c.x + (Math.random() - 0.5) * 90;
          var ry = c.y + (Math.random() - 0.5) * 70;
          var gg = screenToGround(rx, ry);
          if (!gg) continue;
          var sp = findSpot(gg.x, gg.z, 2.4);
          if (sp) { spawnFromLasso(sp.x, sp.z); made = true; }
        }
      }
      clearInk(true);
      if (made) hideHintSoon();
    } else {
      clearInk(true);
    }
  }

  stage.addEventListener('pointerdown', onDown, { passive: false });
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  stage.addEventListener('pointermove', function (e) {
    parallax.x = ((e.clientX / vw) - 0.5) * 1.4;
    parallax.y = -((e.clientY / vh) - 0.5) * 0.95;
    if (!draw.active) {
      stage.style.cursor = (pickAnimal(e.clientX, e.clientY) || pickPondLife(e.clientX, e.clientY))
        ? 'pointer' : 'crosshair';
    }
  });

  /* ------------------------------------------------------------
     zoom
     ------------------------------------------------------------ */
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    var d = e.deltaY;
    if (e.deltaMode === 1) d *= 16;
    zoomTarget = Math.max(0.5, Math.min(3.6, zoomTarget * Math.exp(d * 0.0013)));
  }, { passive: false });

  stage.addEventListener('dblclick', function () {
    zoomTarget = 1;
  });

  /* pinch zoom */
  var pinch = { active: false, d0: 0, z0: 1 };
  stage.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      pinch.active = true;
      pinch.d0 = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinch.z0 = zoomTarget;
    }
  }, { passive: true });
  stage.addEventListener('touchmove', function (e) {
    if (pinch.active && e.touches.length === 2) {
      var d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      zoomTarget = Math.max(0.5, Math.min(3.6, pinch.z0 * (pinch.d0 / (d || 1))));
      e.preventDefault();
    }
  }, { passive: false });
  stage.addEventListener('touchend', function () { pinch.active = false; }, { passive: true });

  /* ------------------------------------------------------------
     hint
     ------------------------------------------------------------ */
  var hintTimer = setTimeout(hideHint, 13000);
  function hideHint() { hintEl.classList.add('hide'); }
  function hideHintSoon() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 1600);
  }

  /* ------------------------------------------------------------
     resize
     ------------------------------------------------------------ */
  function onResize() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    fitCamera();
    camera.updateProjectionMatrix();
    inkSize();
    inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', function (event) { if (event.key === 'Escape') deselect(); });

  /* ------------------------------------------------------------
     pond life update
     ------------------------------------------------------------ */
  function updatePondLife(dt, time) {
    var i, s, d, f;

    for (i = 0; i < swans.length; i++) {
      s = swans[i];
      s.t += dt;
      s.voiceT = (s.voiceT === undefined ? 10 + Math.random() * 16 : s.voiceT) - dt;
      if (s.voiceT <= 0) { s.voiceT = 16 + Math.random() * 22; if (P.audio) P.audio.voice('swan', 0.45); }
      s.ang += s.speed * dt * 0.6;
      var sx = pond.x + Math.cos(s.ang) * s.rad * 0.52 * pond.rx;
      var sz = pond.z + Math.sin(s.ang) * s.rad * 0.52 * pond.rz;
      s.g.position.set(sx, waterY() + Math.sin(time * 1.1 + i) * 0.012, sz);
      s.g.rotation.y = -s.ang + Math.PI / 2;
      if (s.flap > 0) {
        s.flap = Math.max(0, s.flap - dt * 1.6);
        var fl = Math.sin(s.t * 18) * 0.9 * s.flap;
        s.m.wings[0].rotation.z = fl;
        s.m.wings[1].rotation.z = -fl;
        if (s.flap > 0.02) s.g.position.y += Math.abs(Math.sin(s.t * 18)) * 0.03 * s.flap;
      } else {
        s.m.wings[0].rotation.z += (0 - s.m.wings[0].rotation.z) * 0.1;
        s.m.wings[1].rotation.z += (0 - s.m.wings[1].rotation.z) * 0.1;
      }
    }

    for (i = 0; i < ducks.length; i++) {
      d = ducks[i];
      d.t += dt;
      d.voiceT = (d.voiceT === undefined ? 8 + Math.random() * 18 : d.voiceT) - dt;
      if (d.voiceT <= 0) { d.voiceT = 14 + Math.random() * 24; if (P.audio) P.audio.voice('duck', 0.4); }
      if (d.dive > 0) {
        d.dive -= dt;
        var dEl = 2.4 - d.dive;
        var dip = Math.min(1, dEl / 0.62);
        if (dEl > 1.62) dip = Math.max(0, 1 - (dEl - 1.62) / 0.72);
        d.g.position.set(d.x, waterY() - 0.38 * dip, d.z);
        d.g.rotation.z = Math.sin(dEl * 8.5) * 0.24 * dip;
        if (dip > 0.5 && !d.splashed) { d.splashed = true; waterRipple(d.x, d.z, true); }
        if (d.dive <= 0) { d.splashed = false; d.g.rotation.z = 0; waterRipple(d.x, d.z, true); }
        continue;
      }
      d.g.rotation.z *= 0.9;
      d.heading += Math.sin(time * 0.5 + i * 2.1) * dt * 0.6;
      var sp = 0.32;
      d.x += Math.sin(d.heading) * sp * dt;
      d.z += Math.cos(d.heading) * sp * dt;
      // keep them inside the pond
      var pdx = (d.x - pond.x) / (pond.rx * 0.86), pdz = (d.z - pond.z) / (pond.rz * 0.86);
      if (pdx * pdx + pdz * pdz > 1) {
        d.heading = Math.atan2(pond.x - d.x, pond.z - d.z) + (Math.random() - 0.5) * 0.6;
        d.x += (pond.x - d.x) * 0.02;
        d.z += (pond.z - d.z) * 0.02;
      }
      d.g.position.set(d.x, waterY() - 0.02 + Math.sin(time * 2.2 + d.bob) * 0.012, d.z);
      d.g.rotation.y = d.heading;
      d.m.head.rotation.y = Math.sin(time * 0.8 + i) * 0.3;
    }

    for (i = 0; i < fishes.length; i++) {
      f = fishes[i];
      f.t += dt;
      var fsp = f.speed * (f.startle > 0 ? 2.6 : 1);
      if (f.startle > 0) f.startle -= dt;
      f.heading += Math.sin(time * 1.3 + i * 2.7) * dt * 1.2;
      f.x += Math.sin(f.heading) * fsp * dt;
      f.z += Math.cos(f.heading) * fsp * dt;
      var fdx = (f.x - pond.x) / (pond.rx * 0.9), fdz = (f.z - pond.z) / (pond.rz * 0.9);
      if (fdx * fdx + fdz * fdz > 1) {
        f.heading = Math.atan2(pond.x - f.x, pond.z - f.z) + (Math.random() - 0.5) * 0.8;
      }
      if (f.rise > 0) {
        f.rise -= dt;
        if (!f.rose) { f.rose = true; waterRipple(f.x, f.z, false); }
      } else if (f.rose) { f.rose = false; }
      var wantDepth = f.rise > 0 ? (POND_Y + 0.045) : f.depth0;
      f.depth += (wantDepth - f.depth) * (1 - Math.exp(-4.5 * dt));
      f.g.position.set(f.x, f.depth + Math.sin(time * 2 + i) * 0.03, f.z);
      f.g.rotation.y = f.heading;
      f.g.rotation.z = Math.sin(time * 6 + i) * 0.06;
    }


    /* soft separation — floating birds must never intersect each other */
    for (i = 0; i < ducks.length; i++) {
      var di = ducks[i];
      if (di.dive > 0) continue;
      for (var j = i + 1; j < ducks.length; j++) {
        var dj = ducks[j];
        if (dj.dive > 0) continue;
        var vx = dj.x - di.x, vz = dj.z - di.z;
        var dd2 = Math.hypot(vx, vz);
        if (dd2 > 0.001 && dd2 < 0.86) {
          var push = (0.86 - dd2) * 0.5;
          vx /= dd2; vz /= dd2;
          di.x -= vx * push; di.z -= vz * push;
          dj.x += vx * push; dj.z += vz * push;
        }
      }
      for (var k = 0; k < swans.length; k++) {
        var sk = swans[k];
        var ux = di.x - sk.g.position.x, uz = di.z - sk.g.position.z;
        var ud = Math.hypot(ux, uz);
        if (ud > 0.001 && ud < 1.15) {
          var pu = (1.15 - ud) * 0.5;
          di.x += (ux / ud) * pu; di.z += (uz / ud) * pu;
        }
      }
      di.x = Math.max(pond.x - pond.rx * 0.84, Math.min(pond.x + pond.rx * 0.84, di.x));
      di.z = Math.max(pond.z - pond.rz * 0.84, Math.min(pond.z + pond.rz * 0.84, di.z));
      di.g.position.x = di.x;
      di.g.position.z = di.z;
    }
    for (i = 0; i < fishes.length; i++) {
      var fi = fishes[i];
      for (var j2 = i + 1; j2 < fishes.length; j2++) {
        var fj = fishes[j2];
        var ax = fj.x - fi.x, az = fj.z - fi.z;
        var ad = Math.hypot(ax, az);
        if (ad > 0.001 && ad < 0.46) {
          var pp2 = (0.46 - ad) * 0.5;
          ax /= ad; az /= ad;
          fi.x -= ax * pp2; fi.z -= az * pp2;
          fj.x += ax * pp2; fj.z += az * pp2;
        }
      }
    }

    for (i = 0; i < pondProps.length; i++) {
      var pp = pondProps[i];
      pp.t += dt;
      pp.g.position.y = pp.y + Math.sin(time * 1.3 + pp.t) * 0.006;
      pp.g.rotation.z = Math.sin(time * 0.9 + pp.t) * 0.02;
    }
  }

  /* ------------------------------------------------------------
     loop
     ------------------------------------------------------------ */
  var clock = new T.Clock();
  var camPos = new T.Vector3();
  var look = CAM.target.clone();
  var focus = new T.Vector3();
  var cameraDistance = null;
  var footTimer = 0;

  function tick() {
    requestAnimationFrame(tick);
    var dt = Math.min(clock.getDelta(), 0.05);
    var time = clock.elapsedTime;

    if (P.audio) P.audio.tick(dt);

    for (var i = 0; i < animals.length; i++) animals[i].update(dt, time);
    updatePondLife(dt, time);

    // one-shot actions progress
    for (i = 0; i < animals.length; i++) {
      var a = animals[i];
      if (a.actionName === 'milk') {
        a.action += dt;
        if (a.action > 1.6) a.actionName = '';
      } else if (a.actionName) {
        a.action += dt;
        if (a.action > 1.1) a.actionName = '';
      }
    }

    updateBoat(dt, time);

    // the river runs
    if (riverFlow) riverFlow.offset.y -= dt * 0.075;
    if (riverWave) { riverWave.offset.y -= dt * 0.030; riverWave.offset.x += dt * 0.004; }

    // the sails turn
    if (windmill) windmill.blades.rotation.z -= dt * 0.55;

    // clouds drift
    for (i = 0; i < clouds.length; i++) {
      var cl = clouds[i];
      cl.g.position.x += cl.v * dt;
      cl.g.position.z += Math.sin(time * 0.2 + i) * 0.02 * dt * 10;
      if (cl.g.position.x > 46) cl.g.position.x = -46;
    }

    updateRipples(dt);

    // smooth zoom
    if (Math.abs(zoom - zoomTarget) > 0.0005) {
      zoom += (zoomTarget - zoom) * (1 - Math.exp(-6 * dt));

    }

    focus.copy(followed ? followed.position : CAM.target);
    if (followed) focus.y += followedRadius ? followedRadius * 0.8 : 0.32;
    look.lerp(focus, 1 - Math.exp(-5.2 * dt));
    var distance = followed ? (followedRadius ? Math.max(7.5, followedRadius * 6) : 8.5) * zoom : CAM.dist * zoom;
    if (followed && camera.aspect < 1) distance /= Math.max(0.62, camera.aspect);
    if (cameraDistance === null) cameraDistance = CAM.dist;
    cameraDistance += (distance - cameraDistance) * (1 - Math.exp(-3.5 * dt));
    var elevation = CAM.elev;
    camPos.set(look.x + (followed ? 0 : parallax.x),
      look.y + Math.sin(elevation) * cameraDistance + (followed ? 0 : parallax.y),
      look.z + Math.cos(elevation) * cameraDistance);
    camera.position.copy(camPos);
    camera.lookAt(look);
    camera.updateMatrixWorld(true);
    updateSelectionUI();
    if (P.audio) {
      P.audio.listen(look.x, look.z);
      footTimer -= dt;
      if (selected && !selected.leap && /^(walk|trot|run|sprint)$/.test(selected.state) && footTimer <= 0) {
        var quick = selected.state !== 'walk';
        P.audio.step(selected.kind, quick);
        footTimer = quick ? 0.19 : 0.34;
      }
    }

    renderer.render(scene, camera);
  }

  /* ------------------------------------------------------------
     go
     ------------------------------------------------------------ */
  onResize();
  placeCam(CAM.dist);
  camera.position.copy(camBase);
  camera.lookAt(CAM.target);
  requestAnimationFrame(tick);

  window.PASTURE.app = {
    pick: function (cx, cy) { return screenToGround(cx, cy); },
    march: function () { return marchTarget; },
    nearestRiver: nearestRiver,
    canStand: canStand,
    pondDist: pondDist,
    spawnPond: function (x, z) { return spawnPondFromLasso(x, z); },
    drawState: function () { return { active: draw.active, n: draw.pts.length, moved: draw.moved }; },
    selected: function () { return selected ? selected.kind : null; },
    pondLife: function () { return { swans: swans.length, ducks: ducks.length, fishes: fishes.length }; },
    animals: animals,
    flock: animals,
    select: select,
    deselect: deselect,
    spawnAnimal: spawnAnimal,
    spawnSheep: function (x, z, o) { return spawnAnimal('sheep', x, z, o); },
    camera: camera,
    scene: scene,
    renderer: renderer,
    pond: pond,
    zoom: function (z) { zoomTarget = z; }
  };

})();
