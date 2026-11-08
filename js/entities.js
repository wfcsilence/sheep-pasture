/* ============================================================
   Little Pasture — the little 3D residents
   Clay-like farm animals, trees and clouds built from lumpy spheres.
   ============================================================ */
window.PASTURE = window.PASTURE || {};
(function (P) {
  'use strict';
  var T = THREE;

  /* ------------------------------------------------------------
     materials
     ------------------------------------------------------------ */
  function matte(color, opts) {
    opts = opts || {};
    return new T.MeshLambertMaterial({
      color: new T.Color(color).convertSRGBToLinear(),
      emissive: new T.Color(opts.emissive || 0x000000).convertSRGBToLinear(),
      emissiveIntensity: opts.emissiveIntensity || 0
    });
  }
  P.matte = matte;

  function std(color, rough) {
    return new T.MeshStandardMaterial({
      color: new T.Color(color).convertSRGBToLinear(),
      roughness: rough === undefined ? 0.95 : rough,
      metalness: 0.0
    });
  }

  var WOOL_FILL = { emissive: 0x6e6555, emissiveIntensity: 0.42 };

  /* sheep coats — four fixed breed pairs: fleece / shade / deep / face / leg */
  var COATS = [
    { wool: [0xe4dcc7, 0xdcd3bb, 0xeae2cd], shade: 0xd0c4a4, deep: 0xbfb08e, face: 0x3a332b, leg: 0x342d26 },  /* cream + dark face  */
    { wool: [0xe9e1cc, 0xe2d9c2, 0xefe7d3], shade: 0xd8cdb2, deep: 0xc9bd9e, face: 0xd8c5a2, leg: 0xbfaa88 },  /* cream + tan face   */
    { wool: [0xdfd6c2, 0xd7cdb7, 0xe7dec9], shade: 0xcbc2ac, deep: 0xb0a791, face: 0x3a332b, leg: 0x342d26 },  /* warm grey + dark   */
    { wool: [0x9d9486, 0x948b7e, 0xa8a093], shade: 0x827a6d, deep: 0x6b6458, face: 0xd8c5a2, leg: 0xbfaa88 }   /* deep grey + tan    */
  ];

  /* faces are fixed per coat now — kept for other species that need spares */
  var FACES = [0x4a3c2e, 0x36312c, 0xd9c6a4, 0xd2a995];
  var FACE_LEG = [0x483a2d, 0x342f2a, 0xc0ab8a, 0xbb9280];
  P.faceMats = FACES.map(function (c, i) { return { face: matte(c), leg: matte(FACE_LEG[i]) }; });

  P.coatMats = COATS.map(function (c) {
    return {
      wool: c.wool.map(function (col) { return matte(col, WOOL_FILL); }),
      shade: matte(c.shade, { emissive: 0x635b4c, emissiveIntensity: 0.42 }),
      deep: matte(c.deep, { emissive: 0x5a5345, emissiveIntensity: 0.42 }),
      face: matte(c.face),
      leg: matte(c.leg),
      faceMat: matte(c.face),
      legMat: matte(c.leg)
    };
  });

  P.mats = {
    wool: P.coatMats[0].wool,
    woolShade: P.coatMats[0].shade,
    woolDeep: P.coatMats[0].deep,
    face: P.coatMats[0].face,
    leg: P.coatMats[0].leg,
    eye: std(0xfdf8ea, 0.8),
    nose: matte(0x5a4740),
    trunk: matte(0x8a6746),
    trunkDark: matte(0x7a5a3c),
    leafA: matte(0x5b9636),
    leafB: matte(0x477f27),
    leafC: matte(0x6cab45),
    leafD: matte(0x396c1e),
    leafE: matte(0x518b2d),
    plumA: matte(0xc99ad0),
    plumB: matte(0xb07fba),
    plumC: matte(0xdcb4e0),
    cloud: new T.MeshStandardMaterial({
      color: new T.Color(0xffffff).convertSRGBToLinear(), roughness: 1.0, metalness: 0.0,
      emissive: new T.Color(0xfff8ef).convertSRGBToLinear(), emissiveIntensity: 0.16
    }),
    /* cow */
    cowHide: new T.MeshLambertMaterial({
      map: null, color: 0xffffff
    }),
    cowNose: matte(0xd8a6a0),
    hoof: matte(0x3b332c),
    horn: matte(0xd9cfae),
    /* horse */
    horse: matte(0x9c6a45),
    horseDark: matte(0x5d3d28),
    /* pig */
    pig: matte(0xe8a9a0),
    pigDark: matte(0xd08a84),
    /* wild boar */
    boarHide: matte(0x8b7359),
    boarDark: matte(0x5d4b3a),
    boarSnout: matte(0xb2906f),
    boarMane: matte(0x4f3f33),
    boarEye: matte(0x241d19),
    tusk: matte(0xf8f0da),
    /* water birds */
    swan: matte(0xfbf7ee),
    beakOrange: matte(0xe28a3c),
    beakYellow: matte(0xf0b93c),
    duckBrown: matte(0x9a7a55),
    duckGreen: matte(0x2f6b4a),
    duckWhite: matte(0xf2ecdd),
    /* fish */
    fishGray: matte(0x8b98a3),
    fishRed: matte(0xd4654f),
    fishWhite: matte(0xf0ebdd),
    fishGold: matte(0xd8a24a),
    fishPied: matte(0xe8dcc6),
    rock: matte(0x9a978c),
    reed: matte(0x6f9440),
    reedHead: matte(0x7a5a38),
    lily: matte(0x4e8a3c),
    lilyFlower: matte(0xf3d3e2)
  };

  /* ------------------------------------------------------------
     helpers
     ------------------------------------------------------------ */
  P.lumpy = function (geo, amt, seed) {
    seed = seed || 0;
    var pos = geo.attributes.position;
    var i, x, y, z, n, k;
    for (i = 0; i < pos.count; i++) {
      x = pos.getX(i); y = pos.getY(i); z = pos.getZ(i);
      n = Math.sin(x * 3.1 + y * 2.7 + z * 4.3 + seed) * 0.55
        + Math.sin(x * 7.7 - y * 5.3 + z * 3.1 + seed * 1.7) * 0.30
        + Math.sin(x * 13.1 + y * 11.7 - z * 9.3 + seed * 2.3) * 0.15;
      k = 1 + n * amt;
      pos.setXYZ(i, x * k, y * k, z * k);
    }
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  };

  function jointBall(r, mat) {
    var m = new T.Mesh(new T.SphereGeometry(r, 10, 8), mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function shadowed(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function ball(rx, ry, rz, mat, seg, lumpy) {
    var geo = new T.SphereGeometry(0.5, seg || 16, (seg || 16) * 0.7);
    if (lumpy) P.lumpy(geo, lumpy, Math.random() * 20);
    var m = new T.Mesh(geo, mat);
    m.scale.set(rx * 2, ry * 2, rz * 2);
    return m;
  }

  /* spotted hide for the cows */
  P.patchTexture = function (base, spot, seed) {
    var w = 256, h = 192;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    var rnd = P.mulberry32(seed || 7);
    for (var i = 0; i < 7; i++) {
      var x = rnd() * w, y = rnd() * h, r = 16 + rnd() * 38;
      g.fillStyle = spot;
      g.beginPath();
      for (var j = 0; j < 14; j++) {
        var a = j / 14 * Math.PI * 2;
        var rr = r * (0.65 + rnd() * 0.7);
        var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.82;
        if (j) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.closePath(); g.fill();
    }
    var t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  };

  /* ------------------------------------------------------------
     sheep — one lumpy body, a woolly crown, dark face and legs
     ------------------------------------------------------------ */
  P.makeSheep = function (seed) {
    var rnd = P.mulberry32(1917 + seed * 97);
    var cr = rnd();
    var ci = cr < 0.40 ? 0 : cr < 0.65 ? 1 : cr < 0.87 ? 2 : 3;
    var coat = P.coatMats[ci];
    var faceMat = coat.faceMat;
    var legMat = coat.legMat;
    var wool = coat.wool[0];
    var root = new T.Group();
    var body = new T.Group();
    root.add(body);

    var ax = 0.545, ay = 0.375, az = 0.700;   // body semi axes — a rounded loaf
    var cyB = 0.655;                          // body centre height

    var tones = [coat.wool[0], coat.wool[1], coat.wool[2], coat.shade];
    var bodyGeo = P.lumpy(new T.SphereGeometry(0.5, 44, 30), 0.07, seed * 1.3);
    var bodyMesh = new T.Mesh(bodyGeo, tones[1]);
    bodyMesh.scale.set(ax / 0.5, ay / 0.5, az / 0.5);
    bodyMesh.position.set(0, cyB, 0);
    body.add(shadowed(bodyMesh));

    /* --- big lobes so the silhouette reads as wool --- */
    var lobes = [
      [0.00, 0.96, -0.10, 0.250], [0.14, 0.84, 0.46, 0.212],
      [0.00, 0.50, -0.94, 0.230], [-0.85, 0.42, 0.12, 0.222],
      [0.85, 0.40, 0.10, 0.222], [-0.72, -0.08, -0.50, 0.198],
      [0.70, -0.02, 0.44, 0.192], [-0.42, 0.80, -0.48, 0.202],
      [0.46, 0.74, -0.34, 0.212], [0.02, 0.26, 0.96, 0.196],
      [-0.30, 0.70, 0.60, 0.192]
    ];
    var i, q, r, geo, puff;
    for (i = 0; i < lobes.length; i++) {
      q = lobes[i];
      r = q[3] * (0.84 + rnd() * 0.18);
      geo = P.lumpy(new T.SphereGeometry(r, 14, 10), 0.20, seed + i * 3.1);
      puff = new T.Mesh(geo, i % 4 === 0 ? tones[2] : (i % 3 === 0 ? tones[0] : tones[1]));
      var m = 0.735 + rnd() * 0.05;
      puff.position.set(
        (q[0] + (rnd() - 0.5) * 0.10) * ax * m,
        cyB + (q[1] + (rnd() - 0.5) * 0.10) * ay * m,
        (q[2] + (rnd() - 0.5) * 0.10) * az * m
      );
      puff.scale.set(1, 0.94, 1);
      puff.rotation.set(rnd() * 0.5, rnd() * 6.283, rnd() * 0.5);
      body.add(shadowed(puff));
    }

    /* --- skirt: a few low tufts that overhang the legs --- */
    var tufs = [[-0.62, -0.42, 0.30, 0.165], [0.60, -0.40, -0.26, 0.160], [-0.20, -0.44, -0.55, 0.155]];
    for (i = 0; i < tufs.length; i++) {
      q = tufs[i];
      r = q[3] * (0.92 + rnd() * 0.16);
      puff = new T.Mesh(P.lumpy(new T.SphereGeometry(r, 12, 9), 0.18, seed + i * 5.7), tones[3]);
      puff.position.set(q[0] * ax, cyB + q[1] * ay, q[2] * az);
      puff.scale.set(1, 0.82, 1);
      body.add(shadowed(puff));
    }

    /* --- a woolly neck so the head does not float --- */
    var neck = new T.Mesh(P.lumpy(new T.SphereGeometry(0.215, 14, 10), 0.16, seed * 2.6), tones[2]);
    neck.position.set(0, cyB + 0.045, az * 0.78);
    neck.scale.set(1.02, 0.92, 1.05);
    body.add(shadowed(neck));

    /* --- head --- */
    var head = new T.Group();
    head.position.set(0, 0.762, 0.700);
    head.rotation.x = 0.30;
    body.add(head);

    var skull = new T.Mesh(P.lumpy(new T.SphereGeometry(0.250, 16, 12), 0.04, seed * 2.1), faceMat);
    skull.position.set(0, -0.02, 0.215);
    skull.scale.set(0.86, 0.90, 1.06);
    head.add(shadowed(skull));

    var muzzle = new T.Mesh(new T.SphereGeometry(0.100, 12, 9), faceMat);
    muzzle.position.set(0, -0.10, 0.365);
    muzzle.scale.set(0.84, 0.70, 0.88);
    head.add(shadowed(muzzle));

    var crown = new T.Mesh(P.lumpy(new T.SphereGeometry(0.160, 14, 10), 0.16, seed * 3.3), wool);
    crown.position.set(0, 0.148, -0.050);
    crown.scale.set(1.12, 0.74, 1.02);
    head.add(shadowed(crown));

    var earGeo = new T.SphereGeometry(1, 8, 6);
    var earL = new T.Mesh(earGeo, faceMat);
    earL.scale.set(0.130, 0.044, 0.072);
    earL.position.set(-0.215, 0.03, 0.15);
    earL.rotation.z = 0.62;
    earL.rotation.y = 0.34;
    head.add(shadowed(earL));
    var earR = new T.Mesh(earGeo, faceMat);
    earR.scale.set(0.130, 0.044, 0.072);
    earR.position.set(0.215, 0.03, 0.15);
    earR.rotation.z = -0.62;
    earR.rotation.y = -0.34;
    head.add(shadowed(earR));

    var eyeGeo = new T.SphereGeometry(0.021, 8, 6);
    var eyeL = new T.Mesh(eyeGeo, P.mats.eye);
    eyeL.position.set(-0.068, 0.03, 0.345);
    head.add(eyeL);
    var eyeR = new T.Mesh(eyeGeo, P.mats.eye);
    eyeR.position.set(0.068, 0.03, 0.345);
    head.add(eyeR);

    /* --- legs --- */
    var legs = [];
    var legGeo = new T.CylinderGeometry(0.050, 0.040, 0.30, 7);
    var positions = [
      [-0.205, 0.315, 0.300], [0.205, 0.315, 0.300],
      [-0.205, 0.315, -0.265], [0.205, 0.315, -0.265]
    ];
    for (i = 0; i < 4; i++) {
      var hip = new T.Group();
      hip.position.set(positions[i][0], positions[i][1], positions[i][2]);
      var leg = new T.Mesh(legGeo, legMat);
      leg.position.y = -0.15;
      hip.add(shadowed(leg));
      var jt = jointBall(0.086, legMat);
      jt.position.y = -0.03;
      jt.scale.set(1, 1.15, 1);
      hip.add(jt);
      body.add(hip);
      legs.push(hip);
    }

    /* --- tail --- */
    var tail = new T.Mesh(P.lumpy(new T.SphereGeometry(0.140, 10, 8), 0.2, seed * 4.4), wool);
    tail.position.set(0, 0.680, -0.640);
    body.add(shadowed(tail));

    root.scale.setScalar(1.0);

    return {
      root: root, body: body, head: head, legs: legs, tail: tail,
      eyeL: eyeL, eyeR: eyeR, wool: wool, kind: 'sheep'
    };
  };

  /* ------------------------------------------------------------
     cow — a barrel of a body, spotted hide, patient face
     ------------------------------------------------------------ */
  P.makeCow = function (seed) {
    var rnd = P.mulberry32(seed * 71 + 13);
    var root = new T.Group();
    var body = new T.Group();
    root.add(body);

    var hide = new T.MeshLambertMaterial({ map: P.patchTexture('#f4efe4', '#4a453f', seed) });
    hide.map.needsUpdate = true;
    var white = matte(0xf4efe4);

    /* barrel */
    var torso = ball(0.74, 0.56, 0.94, hide, 28, 0.02);
    torso.position.set(0, 0.98, 0);
    body.add(shadowed(torso));

    /* shoulders / rump so it is not a plain egg */
    var shoulder = ball(0.59, 0.48, 0.42, hide, 20);
    shoulder.position.set(0, 1.00, 0.52);
    body.add(shadowed(shoulder));
    var rump = ball(0.60, 0.46, 0.38, hide, 20);
    rump.position.set(0, 0.98, -0.56);
    body.add(shadowed(rump));

    /* neck + head */
    var head = new T.Group();
    head.position.set(0, 1.02, 0.92);
    body.add(head);

    var neck = ball(0.26, 0.24, 0.28, white, 14);
    neck.position.set(0, -0.02, -0.12);
    head.add(shadowed(neck));

    var skull = ball(0.29, 0.27, 0.34, white, 18);
    skull.position.set(0, 0.06, 0.20);
    head.add(shadowed(skull));

    var snout = ball(0.255, 0.132, 0.17, P.mats.cowNose, 18);
    snout.position.set(0, -0.04, 0.46);
    head.add(shadowed(snout));
    [-1, 1].forEach(function (side) {
      var nostril = ball(0.034, 0.024, 0.016, P.mats.face, 10);
      nostril.position.set(side * 0.116, -0.02, 0.604);
      head.add(nostril);
    });

    var earGeo = new T.SphereGeometry(1, 8, 6);
    var earL = new T.Mesh(earGeo, white);
    earL.scale.set(0.14, 0.06, 0.10); earL.position.set(-0.30, 0.16, 0.10);
    earL.rotation.z = 0.8; head.add(shadowed(earL));
    var earR = new T.Mesh(earGeo, white);
    earR.scale.set(0.14, 0.06, 0.10); earR.position.set(0.30, 0.16, 0.10);
    earR.rotation.z = -0.8; head.add(shadowed(earR));

    var hornGeo = new T.ConeGeometry(0.045, 0.14, 6);
    var hornL = new T.Mesh(hornGeo, P.mats.horn);
    hornL.position.set(-0.17, 0.30, 0.04); hornL.rotation.z = 0.5;
    head.add(shadowed(hornL));
    var hornR = new T.Mesh(hornGeo, P.mats.horn);
    hornR.position.set(0.17, 0.30, 0.04); hornR.rotation.z = -0.5;
    head.add(shadowed(hornR));

    var eyeGeo = new T.SphereGeometry(0.035, 8, 6);
    var eyeL = new T.Mesh(eyeGeo, P.mats.face);
    eyeL.position.set(-0.20, 0.10, 0.36); head.add(eyeL);
    var eyeR = new T.Mesh(eyeGeo, P.mats.face);
    eyeR.position.set(0.20, 0.10, 0.36); head.add(eyeR);

    /* udder */
    var udder = ball(0.17, 0.13, 0.20, P.mats.cowNose, 12);
    udder.position.set(0, 0.60, -0.42);
    body.add(shadowed(udder));

    /* legs */
    var legs = [];
    var legGeo = new T.CylinderGeometry(0.112, 0.086, 0.56, 8);
    var hoofGeo = new T.CylinderGeometry(0.085, 0.085, 0.10, 8);
    var spots = [[-0.36, 0.62, 0.60], [0.36, 0.62, 0.60], [-0.36, 0.62, -0.58], [0.36, 0.62, -0.58]];
    for (var i = 0; i < 4; i++) {
      var hip = new T.Group();
      hip.position.set(spots[i][0], spots[i][1], spots[i][2]);
      var leg = new T.Mesh(legGeo, white);
      leg.position.y = -0.31;
      hip.add(shadowed(leg));
      var jt = jointBall(0.155, white);
      jt.position.y = -0.04;
      jt.scale.set(1, 1.2, 1);
      hip.add(jt);
      var hoof = new T.Mesh(hoofGeo, P.mats.hoof);
      hoof.position.y = -0.60;
      hip.add(shadowed(hoof));
      body.add(hip);
      legs.push(hip);
    }

    /* tail */
    var tail = new T.Group();
    tail.position.set(0, 1.15, -0.92);
    var tailStem = new T.Mesh(new T.CylinderGeometry(0.028, 0.020, 0.62, 6), white);
    tailStem.position.y = -0.31;
    tail.add(shadowed(tailStem));
    var tuft = ball(0.06, 0.10, 0.06, P.mats.face, 8);
    tuft.position.y = -0.66;
    tail.add(shadowed(tuft));
    body.add(tail);

    return {
      root: root, body: body, head: head, legs: legs, tail: tail,
      kind: 'cow', hide: hide, white: white,
      udder: udder
    };
  };

  /* ------------------------------------------------------------
     horse — deep barrel, long arched neck, proper legs
     ------------------------------------------------------------ */
  P.makeHorse = function (seed) {
    var root = new T.Group();
    var body = new T.Group();
    root.add(body);
    var coats = [[0xa3714c, 0x4c3024], [0x76503e, 0x372a25], [0xd2aa76, 0x816046], [0xa8a2a0, 0x635d5a]];
    var palette = coats[Math.abs(seed || 0) % coats.length | 0];
    var coat = matte(palette[0]), dark = matte(palette[1]);
    var i;

    /* barrel: one long mass, chest in front, hindquarters behind */
    var torso = ball(0.47, 0.48, 0.82, coat, 30, 0.014);
    torso.position.set(0, 1.62, -0.06);
    body.add(shadowed(torso));

    var chest = ball(0.40, 0.44, 0.40, coat, 18, 0.02);
    chest.position.set(0, 1.62, 0.52);
    body.add(shadowed(chest));

    var rump = ball(0.47, 0.50, 0.49, coat, 20, 0.02);
    rump.position.set(0, 1.66, -0.62);
    body.add(shadowed(rump));

    /* withers: the ridge between neck and back */
    var withers = ball(0.20, 0.16, 0.30, coat, 12);
    withers.position.set(0, 2.00, 0.42);
    body.add(shadowed(withers));

    /* neck: one tapered column, blended at both ends */
    var neckBase = new T.Mesh(new T.CylinderGeometry(0.185, 0.320, 1.05, 18), coat);
    neckBase.position.set(0, 2.05, 0.90);
    neckBase.rotation.x = 0.38;
    body.add(shadowed(neckBase));

    var neckRoot = ball(0.325, 0.345, 0.33, coat, 16);
    neckRoot.position.set(0, 1.60, 0.68);
    body.add(shadowed(neckRoot));

    var poll = ball(0.195, 0.195, 0.21, coat, 14);
    poll.position.set(0, 2.56, 1.04);
    body.add(shadowed(poll));

    /* head */
    var head = new T.Group();
    head.position.set(0, 2.58, 1.07);
    body.add(head);

    var skull = ball(0.195, 0.215, 0.30, coat, 18);
    skull.position.set(0, 0.02, 0.02);
    head.add(shadowed(skull));

    var cheek = ball(0.175, 0.19, 0.22, coat, 14, 0.02);
    cheek.position.set(0, -0.07, 0.12);
    head.add(shadowed(cheek));

    var muzzle = ball(0.147, 0.146, 0.27, coat, 18);
    muzzle.position.set(0, -0.115, 0.37);
    head.add(shadowed(muzzle));

    var nose = ball(0.108, 0.104, 0.085, dark, 12);
    nose.position.set(0, -0.132, 0.585);
    head.add(shadowed(nose));

    var chin = ball(0.092, 0.082, 0.14, coat, 10);
    chin.position.set(0, -0.228, 0.36);
    head.add(shadowed(chin));

    var nostrilGeo = new T.SphereGeometry(0.023, 6, 5);
    var noL = new T.Mesh(nostrilGeo, P.mats.nose);
    noL.position.set(-0.050, -0.090, 0.628); head.add(noL);
    var noR = new T.Mesh(nostrilGeo, P.mats.nose);
    noR.position.set(0.050, -0.090, 0.628); head.add(noR);

    /* ears with dark inner */
    var earGeo = new T.ConeGeometry(0.056, 0.20, 7);
    var earL = new T.Mesh(earGeo, coat);
    earL.position.set(-0.115, 0.245, -0.075);
    earL.rotation.set(-0.16, 0, 0.30);
    head.add(shadowed(earL));
    var earR = new T.Mesh(earGeo, coat);
    earR.position.set(0.115, 0.245, -0.075);
    earR.rotation.set(-0.16, 0, -0.30);
    head.add(shadowed(earR));
    var innerGeo = new T.ConeGeometry(0.036, 0.12, 7);
    var inL = new T.Mesh(innerGeo, dark);
    inL.position.set(-0.112, 0.238, -0.038);
    inL.rotation.set(-0.16, 0, 0.30);
    head.add(inL);
    var inR = new T.Mesh(innerGeo, dark);
    inR.position.set(0.112, 0.238, -0.038);
    inR.rotation.set(-0.16, 0, -0.30);
    head.add(inR);

    /* eyes: dark bead, glint, brow lid */
    var eyeGeo = new T.SphereGeometry(0.040, 10, 8);
    var eyeL = new T.Mesh(eyeGeo, dark);
    eyeL.position.set(-0.162, 0.055, 0.145); head.add(eyeL);
    var eyeR = new T.Mesh(eyeGeo, dark);
    eyeR.position.set(0.162, 0.055, 0.145); head.add(eyeR);
    var glintGeo = new T.SphereGeometry(0.014, 6, 5);
    var glL = new T.Mesh(glintGeo, P.mats.face);
    glL.position.set(-0.173, 0.073, 0.170); head.add(glL);
    var glR = new T.Mesh(glintGeo, P.mats.face);
    glR.position.set(0.173, 0.073, 0.170); head.add(glR);
    var lidL = ball(0.075, 0.026, 0.060, coat, 8);
    lidL.position.set(-0.158, 0.100, 0.140); lidL.rotation.z = -0.24;
    head.add(lidL);
    var lidR = ball(0.075, 0.026, 0.060, coat, 8);
    lidR.position.set(0.158, 0.100, 0.140); lidR.rotation.z = 0.24;
    head.add(lidR);

    /* mane: dark tufts down the crest of the neck, withers to poll */
    /* the crest line of the neck: base point, axis and outward normal */
    var neckAxis = new T.Vector3(0, Math.cos(0.38), Math.sin(0.38));
    var neckOut = new T.Vector3(0, Math.sin(0.38), -Math.cos(0.38));
    var neckFoot = new T.Vector3(0, 1.563, 0.705);
    function crest(t, push) {
      var r = 0.320 - 0.135 * t;
      return neckFoot.clone()
        .add(neckAxis.clone().multiplyScalar(1.05 * t))
        .add(neckOut.clone().multiplyScalar(r * (1.00 + push)));
    }
    /* dark band so the mane reads even from the pasture camera */
    for (i = 0; i < 7; i++) {
      var bp = crest(i / 6, -0.05 + 0.0);
      var band = ball(0.046, 0.062, 0.20, dark, 8);
      band.position.copy(bp);
      band.rotation.x = -0.42;
      body.add(band);
    }
    /* tufts standing out of the band */
    for (i = 0; i < 8; i++) {
      var tp = crest(0.03 + i / 7 * 0.95, 0.10);
      var mt = new T.Mesh(new T.ConeGeometry(0.088 - i * 0.005, 0.34 - i * 0.012, 4), dark);
      mt.position.copy(tp);
      mt.rotation.set(-1.22, 0, (i % 2 ? -0.10 : 0.10));
      mt.scale.set(0.9, 1, 0.7);
      body.add(mt);
    }
    /* forelock */
    for (i = 0; i < 3; i++) {
      var fl = new T.Mesh(new T.ConeGeometry(0.038, 0.18, 4), dark);
      fl.position.set((i - 1) * 0.045, 0.245, 0.115);
      fl.rotation.set(1.20, 0, (i - 1) * 0.24);
      head.add(fl);
    }

    /* legs: thigh, knee, cannon, fetlock, hoof */
    var legs = [];
    var upperGeo = new T.CylinderGeometry(0.118, 0.086, 0.58, 10);
    var cannonGeo = new T.CylinderGeometry(0.084, 0.062, 0.46, 9);
    var hoofGeo = new T.CylinderGeometry(0.080, 0.094, 0.13, 8);
    var spots = [[-0.265, 1.30, 0.54], [0.265, 1.30, 0.54], [-0.285, 1.34, -0.62], [0.285, 1.34, -0.62]];
    for (i = 0; i < 4; i++) {
      var hip = new T.Group();
      hip.position.set(spots[i][0], spots[i][1], spots[i][2]);
      var up = new T.Mesh(upperGeo, coat);
      up.position.y = -0.29;
      hip.add(shadowed(up));
      var knee = jointBall(0.092, coat);
      knee.position.y = -0.58;
      knee.scale.set(1, 1.02, 1);
      hip.add(knee);
      var cannon = new T.Mesh(cannonGeo, coat);
      cannon.position.y = -0.83;
      hip.add(shadowed(cannon));
      var fet = jointBall(0.072, coat);
      fet.position.y = -1.08;
      fet.scale.set(1, 1.05, 1);
      hip.add(fet);
      var hoof = new T.Mesh(hoofGeo, P.mats.hoof);
      hoof.position.y = -1.245;
      hip.add(shadowed(hoof));
      body.add(hip);
      legs.push(hip);
    }

    /* tail: dock plus long strands */
    var tail = new T.Group();
    tail.position.set(0, 1.96, -1.10);
    tail.rotation.x = 0.30;
    var dock = new T.Mesh(new T.CylinderGeometry(0.085, 0.070, 0.24, 8), coat);
    dock.position.y = -0.08;
    tail.add(shadowed(dock));
    for (i = 0; i < 5; i++) {
      var q = (i - 2) / 2;
      var strand = new T.Mesh(new T.CylinderGeometry(0.046, 0.016, 1.06, 5), dark);
      strand.position.set(q * 0.042, -0.64, q * 0.026);
      strand.rotation.z = q * 0.10;
      strand.rotation.x = q * 0.05;
      tail.add(shadowed(strand));
    }
    body.add(tail);

    return {
      root: root, body: body, head: head, legs: legs, tail: tail,
      headBias: 0.14, kind: 'horse', coat: coat
    };
  };

  /* ------------------------------------------------------------
     pig — round, pink, snouty
     ------------------------------------------------------------ */
  P.makePig = function (seed) {
    var root = new T.Group();
    var body = new T.Group();
    root.add(body);
    var pink = P.mats.pig;
    var dark = P.mats.pigDark;

    var torso = ball(0.46, 0.36, 0.56, pink, 20, 0.03);
    torso.position.set(0, 0.72, 0);
    body.add(shadowed(torso));

    var head = new T.Group();
    head.position.set(0, 0.80, 0.56);
    body.add(head);

    var skull = ball(0.29, 0.27, 0.27, pink, 16);
    skull.position.set(0, 0.01, 0.06);
    head.add(shadowed(skull));

    var snout = new T.Mesh(new T.CylinderGeometry(0.145, 0.155, 0.10, 14), dark);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.06, 0.31);
    head.add(shadowed(snout));

    var nostrilGeo = new T.SphereGeometry(0.022, 6, 5);
    var nL = new T.Mesh(nostrilGeo, P.mats.face);
    nL.position.set(-0.048, -0.06, 0.362); head.add(nL);
    var nR = new T.Mesh(nostrilGeo, P.mats.face);
    nR.position.set(0.048, -0.06, 0.362); head.add(nR);

    var earGeo = new T.ConeGeometry(0.10, 0.20, 4);
    var earL = new T.Mesh(earGeo, dark);
    earL.position.set(-0.19, 0.23, 0.02);
    earL.rotation.set(0.45, 0, 0.42);
    head.add(shadowed(earL));
    var earR = new T.Mesh(earGeo, dark);
    earR.position.set(0.19, 0.23, 0.02);
    earR.rotation.set(0.45, 0, -0.42);
    head.add(shadowed(earR));

    var eyeGeo = new T.SphereGeometry(0.026, 8, 6);
    var eyeL = new T.Mesh(eyeGeo, P.mats.face);
    eyeL.position.set(-0.14, 0.06, 0.24); head.add(eyeL);
    var eyeR = new T.Mesh(eyeGeo, P.mats.face);
    eyeR.position.set(0.14, 0.06, 0.24); head.add(eyeR);

    var legs = [];
    var legGeo = new T.CylinderGeometry(0.072, 0.060, 0.38, 7);
    var spots = [[-0.24, 0.40, 0.30], [0.24, 0.40, 0.30], [-0.24, 0.40, -0.30], [0.24, 0.40, -0.30]];
    for (var i = 0; i < 4; i++) {
      var hip = new T.Group();
      hip.position.set(spots[i][0], spots[i][1], spots[i][2]);
      var leg = new T.Mesh(legGeo, dark);
      leg.position.y = -0.19;
      hip.add(shadowed(leg));
      var jt = jointBall(0.112, dark);
      jt.position.y = -0.03;
      jt.scale.set(1, 1.2, 1);
      hip.add(jt);
      body.add(hip);
      legs.push(hip);
    }

    var tail = new T.Mesh(new T.TorusGeometry(0.075, 0.024, 6, 14, Math.PI * 1.5), dark);
    tail.position.set(0, 0.86, -0.58);
    tail.rotation.y = Math.PI / 2;
    body.add(shadowed(tail));

    return {
      root: root, body: body, head: head, legs: legs, tail: tail,
      kind: 'pig'
    };
  };

  /* ------------------------------------------------------------
     wild boar — high shoulders, bristled crest, tusks
     ------------------------------------------------------------ */
  P.makeBoar = function (seed) {
    var root = new T.Group();
    var body = new T.Group();
    root.add(body);

    var hide = P.mats.boarHide, dark = P.mats.boarDark, mane = P.mats.boarMane;
    var i;

    /* tapered wedge: heavy shoulder mass, lighter hindquarters */
    var rump = ball(0.41, 0.32, 0.40, hide, 18, 0.03);
    rump.position.set(0, 0.76, -0.22);
    body.add(shadowed(rump));

    var shoulders = ball(0.42, 0.40, 0.42, hide, 18, 0.02);
    shoulders.position.set(0, 0.86, 0.22);
    body.add(shadowed(shoulders));

    var chest = ball(0.30, 0.31, 0.26, hide, 14, 0.02);
    chest.position.set(0, 0.74, 0.50);
    body.add(shadowed(chest));

    /* bristle crest: tall, sitting proud of the spine */
    for (i = 0; i < 9; i++) {
      var q = i / 8;
      var br = new T.Mesh(new T.ConeGeometry(0.065 - q * 0.022, 0.22 - q * 0.06, 4), mane);
      br.position.set((i % 2 ? 0.04 : -0.04), 1.26 - q * 0.15, 0.46 - q * 1.02);
      br.rotation.set(-0.85 - q * 0.30, 0, (i % 2 ? -0.14 : 0.14));
      body.add(br);
    }
    /* a few shorter bristles on the shoulder tops */
    for (i = 0; i < 4; i++) {
      var sb = new T.Mesh(new T.ConeGeometry(0.050, 0.15, 4), mane);
      sb.position.set((i % 2 ? 0.20 : -0.20), 1.16 - (i >> 1) * 0.10, 0.30 - (i >> 1) * 0.22);
      sb.rotation.set(-0.35, 0, (i % 2 ? -0.55 : 0.55));
      body.add(sb);
    }

    var neck = ball(0.24, 0.24, 0.22, hide, 12, 0.02);
    neck.position.set(0, 0.80, 0.54);
    body.add(shadowed(neck));

    var head = new T.Group();
    head.position.set(0, 0.84, 0.72);
    body.add(head);

    var skull = ball(0.28, 0.25, 0.27, hide, 16);
    skull.position.set(0, 0.02, 0.04);
    head.add(shadowed(skull));

    /* brow wedge + long snout: the boar's wedge profile */
    var bridge = ball(0.17, 0.15, 0.20, hide, 12, 0.02);
    bridge.position.set(0, 0.1, 0.16);
    head.add(shadowed(bridge));

    var snout = new T.Mesh(new T.CylinderGeometry(0.115, 0.150, 0.26, 12), hide);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.09, 0.32);
    head.add(shadowed(snout));

    var disc = new T.Mesh(new T.CylinderGeometry(0.100, 0.100, 0.04, 12), P.mats.boarSnout);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, -0.09, 0.452);
    head.add(disc);

    var nostrilGeo = new T.SphereGeometry(0.019, 6, 5);
    var nL = new T.Mesh(nostrilGeo, dark);
    nL.position.set(-0.042, -0.09, 0.470); head.add(nL);
    var nR = new T.Mesh(nostrilGeo, dark);
    nR.position.set(0.042, -0.09, 0.470); head.add(nR);

    /* tusks — big enough to read at pasture zoom */
    var tuskGeo = new T.ConeGeometry(0.046, 0.26, 6);
    var tuskL = new T.Mesh(tuskGeo, P.mats.tusk);
    tuskL.position.set(-0.160, -0.15, 0.345);
    tuskL.rotation.set(0.26, 0, 0.40);
    head.add(tuskL);
    var tuskR = new T.Mesh(tuskGeo, P.mats.tusk);
    tuskR.position.set(0.160, -0.15, 0.345);
    tuskR.rotation.set(0.26, 0, -0.40);
    head.add(tuskR);

    /* small ears pinned back */
    var earGeo = new T.ConeGeometry(0.090, 0.17, 4);
    var earL = new T.Mesh(earGeo, dark);
    earL.position.set(-0.195, 0.20, -0.03);
    earL.rotation.set(-0.40, 0, 0.66);
    head.add(shadowed(earL));
    var earR = new T.Mesh(earGeo, dark);
    earR.position.set(0.195, 0.20, -0.03);
    earR.rotation.set(-0.40, 0, -0.66);
    head.add(shadowed(earR));

    /* eyes under a heavy brow */
    var eyeGeo = new T.SphereGeometry(0.030, 8, 6);
    var glintGeo = new T.SphereGeometry(0.011, 6, 5);
    var eyeL = new T.Mesh(eyeGeo, P.mats.boarEye);
    eyeL.position.set(-0.140, 0.055, 0.245); head.add(eyeL);
    var eyeR = new T.Mesh(eyeGeo, P.mats.boarEye);
    eyeR.position.set(0.140, 0.055, 0.245); head.add(eyeR);
    var glL = new T.Mesh(glintGeo, P.mats.face);
    glL.position.set(-0.152, 0.070, 0.262); head.add(glL);
    var glR = new T.Mesh(glintGeo, P.mats.face);
    glR.position.set(0.152, 0.070, 0.262); head.add(glR);
    var browL = ball(0.095, 0.026, 0.070, mane, 10);
    browL.position.set(-0.138, 0.115, 0.220); browL.rotation.z = -0.32;
    head.add(browL);
    var browR = ball(0.095, 0.026, 0.070, mane, 10);
    browR.position.set(0.138, 0.115, 0.220); browR.rotation.z = 0.32;
    head.add(browR);

    /* short, stout legs with dark hooves */
    var legs = [];
    var legGeo = new T.CylinderGeometry(0.086, 0.070, 0.34, 7);
    var hoofGeo = new T.CylinderGeometry(0.090, 0.098, 0.07, 7);
    var spots = [[-0.26, 0.40, 0.30], [0.26, 0.40, 0.30], [-0.26, 0.40, -0.32], [0.26, 0.40, -0.32]];
    for (i = 0; i < 4; i++) {
      var hip = new T.Group();
      hip.position.set(spots[i][0], spots[i][1], spots[i][2]);
      var leg = new T.Mesh(legGeo, dark);
      leg.position.y = -0.17;
      hip.add(shadowed(leg));
      var jt = jointBall(0.115, dark);
      jt.position.y = -0.02;
      jt.scale.set(1, 1.2, 1);
      hip.add(jt);
      var hoof = new T.Mesh(hoofGeo, P.mats.hoof);
      hoof.position.y = -0.325;
      hip.add(hoof);
      body.add(hip);
      legs.push(hip);
    }

    /* thin tail with a bristly tuft */
    var tail = new T.Group();
    tail.position.set(0, 0.86, -0.58);
    var tstick = new T.Mesh(new T.CylinderGeometry(0.022, 0.013, 0.30, 6), dark);
    tstick.position.y = -0.15;
    tail.add(tstick);
    var tuft = ball(0.050, 0.075, 0.050, mane, 10);
    tuft.position.y = -0.31;
    tail.add(tuft);
    tail.rotation.x = 0.50;
    body.add(tail);

    return {
      root: root, body: body, head: head, legs: legs, tail: tail,
      kind: 'boar', headBias: 0.05
    };
  };

  /* ------------------------------------------------------------
     swan / duck / fish
     ------------------------------------------------------------ */
  P.makeSwan = function (seed) {
    var root = new T.Group();
    var body = new T.Group();
    root.add(body);

    var torso = ball(0.42, 0.30, 0.56, P.mats.swan, 20, 0.04);
    torso.position.set(0, 0.16, 0);
    body.add(shadowed(torso));

    /* upswept tail */
    var tail = new T.Mesh(new T.ConeGeometry(0.16, 0.34, 8), P.mats.swan);
    tail.rotation.x = -Math.PI / 2 + 0.55;
    tail.position.set(0, 0.24, -0.56);
    body.add(shadowed(tail));

    var head = new T.Group();
    head.position.set(0, 0.34, 0.34);
    body.add(head);

    var neckA = new T.Mesh(new T.CylinderGeometry(0.070, 0.095, 0.34, 10), P.mats.swan);
    neckA.position.set(0, 0.16, 0.02); neckA.rotation.x = -0.18;
    head.add(shadowed(neckA));
    var neckB = new T.Mesh(new T.CylinderGeometry(0.058, 0.070, 0.30, 10), P.mats.swan);
    neckB.position.set(0, 0.42, 0.09); neckB.rotation.x = 0.22;
    head.add(shadowed(neckB));

    var skull = ball(0.11, 0.11, 0.15, P.mats.swan, 12);
    skull.position.set(0, 0.58, 0.14);
    head.add(shadowed(skull));

    var beak = new T.Mesh(new T.ConeGeometry(0.055, 0.20, 8), P.mats.beakOrange);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.55, 0.30);
    head.add(shadowed(beak));

    var mask = ball(0.06, 0.045, 0.05, P.mats.face, 8);
    mask.position.set(0, 0.615, 0.21);
    head.add(mask);

    var wings = [];
    [-1, 1].forEach(function (s, i) {
      var wg = new T.Group();
      wg.position.set(s * 0.26, 0.24, -0.02);
      var w = ball(0.11, 0.20, 0.34, P.mats.swan, 14);
      w.position.set(s * 0.06, 0.05, 0);
      w.rotation.z = s * -0.2;
      wg.add(shadowed(w));
      body.add(wg);
      wings.push(wg);
    });

    return { root: root, body: body, head: head, tail: tail, wings: wings, kind: 'swan' };
  };

  P.makeDuck = function (seed, male) {
    var root = new T.Group();
    var body = new T.Group();
    root.add(body);
    var bodyMat = male ? P.mats.duckBrown : P.mats.duckBrown;

    var torso = ball(0.26, 0.20, 0.36, bodyMat, 16, 0.03);
    torso.position.set(0, 0.12, 0);
    body.add(shadowed(torso));

    var chest = ball(0.20, 0.17, 0.16, P.mats.duckWhite, 12);
    chest.position.set(0, 0.12, 0.26);
    body.add(shadowed(chest));

    var head = new T.Group();
    head.position.set(0, 0.30, 0.24);
    body.add(head);

    var skull = ball(0.135, 0.135, 0.145, male ? P.mats.duckGreen : P.mats.duckBrown, 14);
    skull.position.set(0, 0.05, 0.02);
    head.add(shadowed(skull));

    var beak = new T.Mesh(new T.ConeGeometry(0.055, 0.16, 8), P.mats.beakYellow);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.02, 0.16);
    head.add(shadowed(beak));

    var eyeGeo = new T.SphereGeometry(0.018, 6, 5);
    var eyeL = new T.Mesh(eyeGeo, P.mats.face);
    eyeL.position.set(-0.075, 0.075, 0.10); head.add(eyeL);
    var eyeR = new T.Mesh(eyeGeo, P.mats.face);
    eyeR.position.set(0.075, 0.075, 0.10); head.add(eyeR);

    var tail = new T.Mesh(new T.ConeGeometry(0.075, 0.20, 6), bodyMat);
    tail.rotation.x = -Math.PI / 2 - 0.5;
    tail.position.set(0, 0.18, -0.34);
    body.add(shadowed(tail));

    return { root: root, body: body, head: head, tail: tail, kind: 'duck' };
  };

  P.makeFish = function (seed, mat, size) {
    var root = new T.Group();
    var g = new T.Group();
    root.add(g);
    g.scale.setScalar(size || 1);

    var torso = ball(0.10, 0.13, 0.26, mat, 12);
    g.add(torso);

    /* a few red patches so the pied fish reads as red-and-white */
    if (mat === P.mats.fishPied) {
      var patches = [[-0.09, 0.05, 0.06, 0.075], [-0.06, -0.02, -0.10, 0.065], [-0.10, 0.08, -0.16, 0.05]];
      for (var pj = 0; pj < patches.length; pj++) {
        var pm = new T.Mesh(new T.SphereGeometry(patches[pj][3], 8, 6), P.mats.fishRed);
        pm.position.set(patches[pj][0], patches[pj][1], patches[pj][2]);
        pm.scale.set(0.35, 1.1, 1.2);
        g.add(pm);
      }
    }

    var tail = new T.Mesh(new T.ConeGeometry(0.10, 0.16, 4), mat);
    tail.rotation.x = Math.PI / 2;
    tail.rotation.z = Math.PI / 4;
    tail.scale.set(1, 1, 0.35);
    tail.position.set(0, 0, -0.28);
    g.add(tail);

    var fin = new T.Mesh(new T.ConeGeometry(0.07, 0.12, 4), mat);
    fin.rotation.x = -Math.PI / 2;
    fin.scale.set(1, 1, 0.3);
    fin.position.set(0, 0.12, 0.02);
    g.add(fin);

    var eyeGeo = new T.SphereGeometry(0.025, 6, 5);
    [-1, 1].forEach(function (s) {
      var e = new T.Mesh(eyeGeo, P.mats.face);
      e.position.set(s * 0.075, 0.03, 0.18);
      g.add(e);
    });

    torso.castShadow = false; torso.receiveShadow = false;
    return { root: root, body: g, kind: 'fish', tail: tail };
  };

  /* ------------------------------------------------------------
     trees, clouds, pond props
     ------------------------------------------------------------ */
  P.makeTree = function (seed, opts) {
    opts = opts || {};
    var rnd = P.mulberry32(seed * 3571 + 7);
    var g = new T.Group();
    var h = opts.h || 2.7;
    var spread = opts.spread || 1.0;
    var kind = opts.kind || 'green';
    var k = spread * (h / 2.7) * 1.28;

    var trunkH = h * 0.40;
    var trunk = new T.Mesh(
      new T.CylinderGeometry(0.085 * k, 0.16 * k, trunkH, 8, 1),
      P.mats.trunk
    );
    trunk.position.y = trunkH * 0.5;
    trunk.rotation.z = (rnd() - 0.5) * 0.08;
    trunk.rotation.x = (rnd() - 0.5) * 0.08;
    g.add(shadowed(trunk));

    var leaves = kind === 'purple'
      ? [P.mats.plumA, P.mats.plumB, P.mats.plumC]
      : [P.mats.leafA, P.mats.leafB, P.mats.leafC, P.mats.leafD, P.mats.leafE];

    var blobs = (opts.blobs || 7) + 2;
    var baseY = h * 0.62;
    var i, geo, mesh, ang, rad, yy, rr;

    var core = new T.Mesh(P.lumpy(new T.SphereGeometry(0.56 * k, 22, 16), 0.09, seed), leaves[0]);
    core.position.y = baseY;
    core.scale.set(1, 0.9, 1);
    g.add(shadowed(core));

    for (i = 0; i < blobs; i++) {
      ang = (i / blobs) * P.TAU + rnd() * 0.7;
      rad = (0.36 + rnd() * 0.24) * k;
      yy = baseY + (rnd() - 0.4) * 0.42 * k;
      rr = (0.44 + rnd() * 0.22) * k;
      geo = P.lumpy(new T.SphereGeometry(rr, 16, 12), 0.12, seed + i * 2.9);
      mesh = new T.Mesh(geo, leaves[(rnd() * leaves.length) | 0]);
      mesh.position.set(Math.cos(ang) * rad, yy, Math.sin(ang) * rad);
      mesh.scale.set(1, 0.9 + rnd() * 0.16, 1);
      g.add(shadowed(mesh));
    }

    for (i = 0; i < 3; i++) {
      ang = (i / 3) * P.TAU + rnd();
      rad = (0.30 + rnd() * 0.16) * k;
      rr = (0.31 + rnd() * 0.13) * k;
      geo = P.lumpy(new T.SphereGeometry(rr, 14, 10), 0.13, seed + 40 + i);
      mesh = new T.Mesh(geo, kind === 'purple' ? P.mats.plumB : P.mats.leafD);
      mesh.position.set(Math.cos(ang) * rad, baseY - 0.42 * k, Math.sin(ang) * rad);
      g.add(shadowed(mesh));
    }

    return { group: g, radius: 0.82 * k, height: h };
  };

  P.makeCloud = function (seed, scale) {
    var rnd = P.mulberry32(seed * 6151 + 3);
    var g = new T.Group();
    scale = scale || 1;
    var n = 6 + ((rnd() * 2) | 0);
    var i, geo, mesh, ang, rad, rr;
    for (i = 0; i < n; i++) {
      ang = rnd() * P.TAU;
      rad = Math.pow(rnd(), 0.6) * 1.5;
      rr = (0.55 + rnd() * 0.45) * (i === 0 ? 1.25 : 1);
      geo = P.lumpy(new T.SphereGeometry(rr, 14, 10), 0.09, seed + i * 1.7);
      mesh = new T.Mesh(geo, P.mats.cloud);
      mesh.position.set(Math.cos(ang) * rad, (rnd() - 0.15) * 0.34, Math.sin(ang) * rad * 0.5);
      mesh.scale.set(1.05, 0.78, 1);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      g.add(mesh);
    }
    g.scale.setScalar(scale);
    return g;
  };

  P.makeLilyPad = function (seed) {
    var rnd = P.mulberry32(seed * 91 + 5);
    var g = new T.Group();
    var pad = new T.Mesh(
      new T.CircleGeometry(0.34 + rnd() * 0.18, 16, rnd() * 2, Math.PI * 1.72),
      P.mats.lily
    );
    pad.rotation.x = -Math.PI / 2;
    pad.receiveShadow = false;
    g.add(pad);
    if (rnd() < 0.35) {
      var fl = ball(0.06, 0.05, 0.06, P.mats.lilyFlower, 8);
      fl.position.set(0.05, 0.05, -0.05);
      g.add(fl);
    }
    return g;
  };

  P.makeReed = function (seed) {
    var rnd = P.mulberry32(seed * 33 + 11);
    var g = new T.Group();
    var n = 3 + ((rnd() * 3) | 0);
    for (var i = 0; i < n; i++) {
      var hh = 0.7 + rnd() * 0.9;
      var st = new T.Mesh(new T.CylinderGeometry(0.018, 0.026, hh, 5), P.mats.reed);
      st.position.set((rnd() - 0.5) * 0.4, hh * 0.5, (rnd() - 0.5) * 0.4);
      st.rotation.z = (rnd() - 0.5) * 0.25;
      g.add(st);
      if (rnd() < 0.45) {
        var head = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 0.22, 6), P.mats.reedHead);
        head.position.set(st.position.x, hh * 0.92, st.position.z);
        head.rotation.z = st.rotation.z;
        g.add(head);
      }
    }
    return g;
  };

  P.makeRock = function (seed, s) {
    var rnd = P.mulberry32(seed * 17 + 3);
    var m = new T.Mesh(P.lumpy(new T.SphereGeometry(0.5, 12, 9), 0.26, seed), P.mats.rock);
    m.scale.set((s || 1) * (1 + rnd() * 0.5), (s || 1) * 0.6, (s || 1) * (1 + rnd() * 0.4));
    m.position.y = (s || 1) * 0.14;
    m.castShadow = true; m.receiveShadow = true;
    var g = new T.Group(); g.add(m);
    return g;
  };

  /* ------------------------------------------------------------
     windmill — stone tower, red cap, four lattice sails
     ------------------------------------------------------------ */
  P.makeWindmill = function (opts) {
    opts = opts || {};
    var h = opts.h || 5.0;               // tower height
    var rBase = h * 0.205, rTop = h * 0.135;
    var root = new T.Group();

    var stone = matte(0xd6cdb8);
    var stoneDark = matte(0xb9ae96);
    var wood = matte(0x9a7c53);
    var woodDark = matte(0x7c6141);
    var roofRed = matte(0xbb5140);

    /* plinth */
    var plinth = new T.Mesh(new T.CylinderGeometry(rBase * 1.14, rBase * 1.24, h * 0.09, 14), stoneDark);
    plinth.position.y = h * 0.045;
    root.add(shadowed(plinth));

    /* tower */
    var tower = new T.Mesh(new T.CylinderGeometry(rTop, rBase, h, 14, 1), stone);
    tower.position.y = h * 0.5 + h * 0.04;
    root.add(shadowed(tower));

    /* a couple of darker bands so the masonry reads */
    [0.34, 0.66].forEach(function (t) {
      var band = new T.Mesh(new T.CylinderGeometry(
        rTop + (rBase - rTop) * (1 - t) + 0.012,
        rTop + (rBase - rTop) * (1 - t) + 0.012,
        h * 0.045, 14, 1, true), stoneDark);
      band.position.y = h * 0.04 + h * t;
      root.add(shadowed(band));
    });

    /* door + a window */
    var door = new T.Mesh(new T.BoxGeometry(rBase * 0.52, h * 0.20, 0.05), woodDark);
    door.position.set(0, h * 0.10 + h * 0.04, rBase * 0.94);
    root.add(shadowed(door));
    var win = new T.Mesh(new T.BoxGeometry(rBase * 0.30, h * 0.10, 0.05), woodDark);
    win.position.set(0, h * 0.52, (rTop + (rBase - rTop) * 0.48) * 0.93);
    root.add(shadowed(win));

    /* gallery ring */
    var gal = new T.Mesh(new T.CylinderGeometry(rTop * 1.30, rTop * 1.30, h * 0.05, 14, 1, true), wood);
    gal.position.y = h * 0.80;
    root.add(shadowed(gal));

    /* roof */
    var roof = new T.Mesh(new T.ConeGeometry(rTop * 1.24, h * 0.24, 14), roofRed);
    roof.position.y = h * 0.94 + h * 0.12;
    root.add(shadowed(roof));
    var cap = new T.Mesh(new T.SphereGeometry(rTop * 0.13, 8, 6), woodDark);
    cap.position.y = h * 0.94 + h * 0.24;
    root.add(shadowed(cap));

    /* sails — a hub on the +z face, blades turning in the xy plane */
    var hubZ = rTop * 1.85;
    var axle = new T.Mesh(new T.CylinderGeometry(rTop * 0.16, rTop * 0.16, hubZ + rTop * 0.3, 8), woodDark);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(0, h * 0.98, hubZ * 0.5);
    root.add(shadowed(axle));
    var hub = new T.Mesh(new T.SphereGeometry(rTop * 0.30, 10, 8), woodDark);
    hub.position.set(0, h * 0.98, hubZ);
    root.add(shadowed(hub));

    var blades = new T.Group();
    blades.position.set(0, h * 0.98, hubZ + 0.02);
    root.add(blades);

    /* lattice sail texture */
    var c = document.createElement('canvas');
    c.width = 96; c.height = 192;
    var g = c.getContext('2d');
    g.clearRect(0, 0, 96, 192);
    g.fillStyle = 'rgba(246,240,225,0.94)';
    g.fillRect(6, 6, 84, 180);
    g.strokeStyle = 'rgba(120,96,64,0.85)';
    g.lineWidth = 3;
    for (var i = 0; i <= 6; i++) {
      g.beginPath(); g.moveTo(6, 6 + i * 30); g.lineTo(90, 6 + i * 30); g.stroke();
    }
    for (var j = 0; j <= 3; j++) {
      g.beginPath(); g.moveTo(6 + j * 28, 6); g.lineTo(6 + j * 28, 186); g.stroke();
    }
    var sailTex = new T.CanvasTexture(c);
    sailTex.encoding = T.sRGBEncoding;
    var sailMat = new T.MeshLambertMaterial({
      map: sailTex, transparent: true, alphaTest: 0.35, side: T.DoubleSide
    });

    var armLen = h * 0.62, armW = h * 0.028;
    var armGeo = new T.BoxGeometry(armW, armLen, armW);
    var sailGeo = new T.PlaneGeometry(armLen * 0.40, armLen * 0.86);
    for (var k = 0; k < 4; k++) {
      var arm = new T.Group();
      arm.rotation.z = k * Math.PI / 2;
      var spar = new T.Mesh(armGeo, wood);
      spar.position.y = armLen * 0.5 + h * 0.06;
      arm.add(shadowed(spar));
      var sail = new T.Mesh(sailGeo, sailMat);
      sail.position.set(armLen * 0.20 + armW * 0.6, armLen * 0.56 + h * 0.06, 0);
      arm.add(sail);
      blades.add(arm);
    }

    return { root: root, blades: blades, height: h, radius: rBase * 1.3 };
  };

  /* ------------------------------------------------------------
     a little rowing boat for the river
     ------------------------------------------------------------ */
  P.makeBoat = function (seed) {
    var root = new T.Group();
    var hull = new T.Group();
    root.add(hull);

    var plank = matte(0xa97a4e);
    var plankDark = matte(0x8a5f3a);
    var trim = matte(0xc9a06a);

    /* hull: a squashed half-ellipsoid with a pointed bow */
    var shell = new T.Mesh(
      P.lumpy(new T.SphereGeometry(0.5, 20, 12), 0.03, seed || 1),
      plank
    );
    shell.scale.set(0.80, 0.38, 1.72);
    shell.position.y = 0.10;
    hull.add(shadowed(shell));

    /* cut the top off visually with a deck plane */
    var deck = new T.Mesh(new T.CircleGeometry(0.5, 20), plankDark);
    deck.scale.set(0.78, 1.56, 1);
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = 0.20;
    hull.add(deck);

    /* gunwale rim */
    var rim = new T.Mesh(new T.TorusGeometry(0.5, 0.045, 6, 24), trim);
    rim.scale.set(0.80, 1.72, 1);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.21;
    hull.add(shadowed(rim));

    /* bench + a pair of oars */
    var bench = new T.Mesh(new T.BoxGeometry(1.10, 0.08, 0.22), plankDark);
    bench.position.set(0, 0.26, -0.05);
    hull.add(shadowed(bench));

    var bench2 = new T.Mesh(new T.BoxGeometry(1.00, 0.08, 0.20), plankDark);
    bench2.position.set(0, 0.26, 0.46);
    hull.add(shadowed(bench2));
    var cargo = new T.Mesh(new T.SphereGeometry(0.15, 8, 6), trim);
    cargo.scale.set(1, 0.8, 1);
    cargo.position.set(0.10, 0.33, -0.30);
    hull.add(shadowed(cargo));

    /* a little lantern post at the stern */
    var post = new T.Mesh(new T.CylinderGeometry(0.022, 0.028, 0.34, 6), plankDark);
    post.position.set(0, 0.36, -0.52);
    hull.add(shadowed(post));
    var lamp = new T.Mesh(new T.SphereGeometry(0.075, 8, 6), matte(0xf2c766));
    lamp.position.set(0, 0.55, -0.52);
    hull.add(shadowed(lamp));

    return { root: root, hull: hull };
  };

  /* ------------------------------------------------------------
     disposal
     ------------------------------------------------------------ */
  P.disposeObject = function (obj) {
    obj.traverse(function (o) {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
      }
    });
  };

})(window.PASTURE);
