/* ============================================================
   Little Pasture — sound
   Local field recordings provide the animal calls; Web Audio
   synthesises ambience, footsteps and water effects.

   Two buses: the ambience bed (wind, pad, birds, chimes) and the
   creature voices, so one never fights the other for level.
   ============================================================ */
(function () {
  'use strict';
  var P = window.PASTURE;
  if (!P) return;

  var ctx = null;
  var master = null;
  var ambBus = null;
  var voiceBus = null;
  var callBus = null;
  var listenerX = 0, listenerZ = 0;
  var analyser = null;
  var levelBuf = null;
  var muted = false;
  var ready = false;
  var lastVoice = -10;
  var lastCall = Object.create(null);
  var recordings = Object.create(null);
  var pendingRecordings = Object.create(null);
  var clips = { sheep: 1.4, cow: 2.5, horse: 1.2, pig: 0.8, boar: 1.7, duck: 0.9, swan: 1.8 };
  var clipBytes = {};
  Object.keys(clips).forEach(function (kind) {
    clipBytes[kind] = fetch('sounds/' + kind + '.mp3').then(function (response) {
      return response.ok ? response.arrayBuffer() : null;
    }).catch(function () { return null; });
  });

  function prepareCall(buffer, limit) {
    var samples = buffer.getChannelData(0);
    var windowSize = Math.round(buffer.sampleRate * 0.05);
    var peak = 0, loudest = 0, levels = [];
    for (var i = 0; i < samples.length; i += windowSize) {
      var sum = 0;
      for (var j = i; j < Math.min(i + windowSize, samples.length); j++) sum += samples[j] * samples[j];
      var rms = Math.sqrt(sum / windowSize);
      levels.push(rms);
      if (rms > peak) { peak = rms; loudest = levels.length - 1; }
    }
    while (loudest > 0 && levels[loudest - 1] > peak * 0.18) loudest--;
    var offset = buffer.duration <= limit ? 0 : Math.max(0, loudest * 0.05 - 0.09);
    return { buffer: buffer, offset: offset, duration: Math.min(limit, buffer.duration - offset),
      gain: Math.min(2.1, 0.16 / Math.max(0.04, peak)) };
  }

  function loadCalls() {
    Object.keys(clips).forEach(function (kind) {
      pendingRecordings[kind] = clipBytes[kind].then(function (bytes) {
        if (!bytes) return;
        return ctx.decodeAudioData(bytes).then(function (buffer) {
          recordings[kind] = prepareCall(buffer, clips[kind]);
        });
      }).catch(function () {});
    });
  }

  function playCall(call, bus) {
    var source = ctx.createBufferSource();
    var envelope = ctx.createGain();
    var now = ctx.currentTime;
    var rate = 0.96 + Math.random() * 0.08;
    var end = now + call.duration / rate;
    source.buffer = call.buffer;
    source.playbackRate.value = rate;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(call.gain, now + 0.018);
    envelope.gain.setValueAtTime(call.gain, Math.max(now + 0.018, end - 0.1));
    envelope.gain.linearRampToValueAtTime(0, end);
    source.connect(envelope);
    envelope.connect(bus);
    source.onended = function () { source.disconnect(); envelope.disconnect(); };
    source.start(now, call.offset, call.duration);
  }
  var birdAt = 6;
  var chimeAt = 18;
  var lapAt = 12;

  /* ------------------------------------------------------------
     small helpers
     ------------------------------------------------------------ */
  function noiseBuffer(seconds, brownish) {
    var n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < n; i++) {
      var w = Math.random() * 2 - 1;
      if (brownish) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.4; }
      else { d[i] = w; }
    }
    return buf;
  }

  function env(param, t0, peak, attack, hold, release) {
    param.setValueAtTime(0.0001, t0);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    param.setValueAtTime(Math.max(0.0002, peak), t0 + attack + hold);
    param.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  }

  function band(freq, q) {
    var b = ctx.createBiquadFilter();
    b.type = 'bandpass';
    b.frequency.value = freq;
    b.Q.value = q;
    return b;
  }

  /* ------------------------------------------------------------
     one voiced note with formants — the base of every animal call
       f0/f1   pitch glide        dur   length
       form    [[Hz, Q, gain], …] vocal-tract resonances
       trem    optional bleat/growl amplitude wobble
       breath  amount of noise mixed in (soft "h" onset)
     ------------------------------------------------------------ */
  function voiceNote(o) {
    var t0 = ctx.currentTime + (o.delay || 0);
    var dur = o.dur || 0.5;
    var rel = o.release === undefined ? 0.12 : o.release;
    var out = ctx.createGain();
    out.connect(o.bus || callBus || voiceBus || master);
    env(out.gain, t0, o.gain === undefined ? 0.12 : o.gain,
      o.attack === undefined ? 0.02 : o.attack, Math.max(0.01, dur - 0.06), rel);

    var srcs = [];
    if (o.f0) {
      var osc = ctx.createOscillator();
      osc.type = o.type || 'sawtooth';
      osc.frequency.setValueAtTime(o.f0, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, o.f1 || o.f0), t0 + dur);
      if (o.vib) {
        var lfo = ctx.createOscillator();
        var lg = ctx.createGain();
        lfo.frequency.value = o.vib;
        lg.gain.value = o.vibDepth || 12;
        lfo.connect(lg); lg.connect(osc.frequency);
        lfo.start(t0); lfo.stop(t0 + dur + rel + 0.1);
      }
      osc.start(t0);
      osc.stop(t0 + dur + rel + 0.05);
      srcs.push(osc);
    }
    if (o.breath) {
      var nb = ctx.createBufferSource();
      nb.buffer = noiseBuffer(dur + 0.15, false);
      var nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = o.breathHz || 1200;
      nf.Q.value = 0.9;
      var ng = ctx.createGain();
      ng.gain.value = o.breath;
      nb.connect(nf); nf.connect(ng); ng.connect(out);
      nb.start(t0);
      nb.stop(t0 + dur + 0.2);
    }

    var form = o.form || [[700, 3, 1]];
    for (var i = 0; i < form.length; i++) {
      var bp = band(form[i][0], form[i][1]);
      var fg = ctx.createGain();
      fg.gain.value = form[i][2] === undefined ? 1 : form[i][2];
      bp.connect(fg); fg.connect(out);
      for (var s = 0; s < srcs.length; s++) srcs[s].connect(bp);
    }

    if (o.trem) {
      var tl = ctx.createOscillator();
      var tg = ctx.createGain();
      tl.frequency.value = o.trem;
      tg.gain.value = (o.tremDepth === undefined ? 0.35 : o.tremDepth) *
        (o.gain === undefined ? 0.12 : o.gain);
      tl.connect(tg); tg.connect(out.gain);
      tl.start(t0); tl.stop(t0 + dur + rel + 0.05);
    }
    return out;
  }

  /* short filtered noise burst — splashes, grunts, breath */
  function puff(o) {
    var t0 = ctx.currentTime + (o.delay || 0);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(Math.max(0.14, (o.dur || 0.2) + 0.12), false);
    var f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f0 || 800, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + (o.dur || 0.2));
    f.Q.value = o.q === undefined ? 1.1 : o.q;
    var g = ctx.createGain();
    src.connect(f); f.connect(g); g.connect(o.bus || callBus || voiceBus || master);
    env(g.gain, t0, o.gain === undefined ? 0.1 : o.gain,
      o.attack === undefined ? 0.008 : o.attack,
      Math.max(0.01, (o.dur || 0.2) - 0.05), o.release === undefined ? 0.08 : o.release);
    src.start(t0);
    src.stop(t0 + (o.dur || 0.2) + 0.25);
  }

  /* ------------------------------------------------------------
     ambience: a warm pad + soft wind, distant birds, wind chimes
     ------------------------------------------------------------ */
  function buildAmbient() {
    ambBus = ctx.createGain();
    ambBus.gain.value = 0.0001;
    ambBus.connect(master);
    ambBus.gain.exponentialRampToValueAtTime(0.78, ctx.currentTime + 4.5);

    /* air: very low, filtered wind — no hiss */
    var wind = ctx.createBufferSource();
    wind.buffer = noiseBuffer(8, true);
    wind.loop = true;
    var wl = ctx.createBiquadFilter();
    wl.type = 'lowpass';
    wl.frequency.value = 240;
    wl.Q.value = 0.35;
    var wg = ctx.createGain();
    wg.gain.value = 0.030;
    wind.connect(wl); wl.connect(wg); wg.connect(ambBus);
    wind.start();

    var wlfo = ctx.createOscillator();
    var wdep = ctx.createGain();
    wlfo.frequency.value = 0.032;
    wdep.gain.value = 0.012;
    wlfo.connect(wdep); wdep.connect(wg.gain);
    wlfo.start();

    /* a slow, low pad — an A-major drone so quiet it reads as warmth */
    var padNotes = [110.0, 164.81, 220.0, 277.18, 329.63];
    var padGains = [0.007, 0.005, 0.004, 0.003, 0.002];
    var padLp = ctx.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 760;
    padLp.Q.value = 0.6;
    padLp.connect(ambBus);
    for (var i = 0; i < padNotes.length; i++) {
      var po = ctx.createOscillator();
      var pg = ctx.createGain();
      po.type = 'sine';
      po.frequency.value = padNotes[i];
      pg.gain.value = padGains[i];
      /* a slow detune drift keeps it from sounding like a test tone */
      var dr = ctx.createOscillator();
      var dg = ctx.createGain();
      dr.frequency.value = 0.017 + i * 0.006;
      dg.gain.value = 0.9;
      dr.connect(dg); dg.connect(po.frequency);
      dr.start();
      po.connect(pg); pg.connect(padLp);
      po.start();
    }
    var padLfo = ctx.createOscillator();
    var padDepth = ctx.createGain();
    padLfo.frequency.value = 0.021;
    padDepth.gain.value = 0.006;
    padLfo.connect(padDepth); padDepth.connect(padLp.gain);
    padLfo.start();
  }

  /* a soft, round bird phrase — sine glides, no sharp chirp */
  function bird() {
    if (!ready || muted) return;
    var base = 1500 + Math.random() * 900;
    var n = 2 + ((Math.random() * 3) | 0);
    for (var i = 0; i < n; i++) {
      voiceNote({
        type: 'sine', f0: base * (1 + Math.random() * 0.1), f1: base * (1.28 + Math.random() * 0.3),
        dur: 0.12, gain: 0.036, attack: 0.02, release: 0.09,
        form: [[base, 1.6, 1]], bus: ambBus, delay: i * 0.13
      });
    }
  }

  /* distant wind chime — two soft bell tones a fifth apart */
  function chime() {
    if (!ready || muted) return;
    var root = [523.25, 587.33, 659.25, 783.99][(Math.random() * 4) | 0];
    [1, 1.5].forEach(function (m, k) {
      voiceNote({
        type: 'sine', f0: root * m, f1: root * m * 0.999,
        dur: 1.8, gain: k ? 0.020 : 0.028, attack: 0.008, release: 2.6,
        form: [[root * m, 8, 1]], bus: ambBus, delay: k * 0.55
      });
    });
  }

  function lap() {
    if (!ready || muted) return;
    puff({ f0: 380, f1: 210, dur: 0.7, gain: 0.045, q: 0.6, bus: ambBus, attack: 0.12 });
  }

  /* ------------------------------------------------------------
     animal voices
     ------------------------------------------------------------ */
  var VOICE = {
    /* baa — nasal, bleaty, pitch sinking */
    sheep: function () {
      voiceNote({
        type: 'sawtooth', f0: 352, f1: 236, dur: 0.55, gain: 0.30,
        form: [[860, 4.5, 1], [1480, 5, 0.45]], trem: 19, tremDepth: 0.3,
        vib: 6.2, vibDepth: 9, breath: 0.012, breathHz: 1600
      });
    },
    /* moo — long, chesty, falling */
    cow: function () {
      voiceNote({
        type: 'triangle', f0: 118, f1: 79, dur: 1.15, gain: 0.34, attack: 0.14, release: 0.3,
        form: [[392, 3, 1], [760, 4, 0.35]], trem: 5.5, tremDepth: 0.14,
        breath: 0.02, breathHz: 700
      });
    },
    /* neigh — fast descending trill through a bright formant */
    horse: function () {
      voiceNote({
        type: 'triangle', f0: 530, f1: 226, dur: 0.8, gain: 0.28,
        form: [[980, 3, 1], [1750, 4, 0.5]], vib: 17, vibDepth: 60,
        trem: 22, tremDepth: 0.22, breath: 0.016, breathHz: 2000
      });
    },
    /* grunt — three short, low, noisy puffs */
    pig: function () {
      [0, 0.22, 0.46].forEach(function (d, k) {
        puff({ f0: 420 - k * 40, f1: 240, dur: 0.11, gain: 0.15, q: 0.8, attack: 0.006, delay: d });
        voiceNote({
          type: 'square', f0: 168, f1: 120, dur: 0.1, gain: 0.13,
          form: [[300, 3, 1], [700, 4, 0.5]], delay: d, release: 0.05
        });
      });
    },
    boar: function () { VOICE.pig(); },
    /* soft honk with breath */
    swan: function () {
      voiceNote({
        type: 'triangle', f0: 392, f1: 318, dur: 0.5, gain: 0.34,
        form: [[820, 4, 1], [1500, 4, 0.3]], breath: 0.03, breathHz: 1100,
        trem: 6, tremDepth: 0.1
      });
    },
    /* quack — two nasal, buzzy syllables */
    duck: function () {
      [0, 0.24].forEach(function (d, k) {
        voiceNote({
          type: 'sawtooth', f0: 640, f1: 470, dur: 0.14, gain: k ? 0.24 : 0.30,
          form: [[1150, 7, 1], [2350, 6, 0.35]], breath: 0.03, breathHz: 2600,
          delay: d, release: 0.07
        });
      });
    },
    /* bubble — a rising blip with a click */
    fish: function () {
      voiceNote({
        type: 'sine', f0: 460, f1: 1050, dur: 0.11, gain: 0.28, attack: 0.006,
        form: [[900, 5, 1]], release: 0.1
      });
      puff({ f0: 2400, f1: 1200, dur: 0.05, gain: 0.02, q: 2 });
    }
  };

  /* ------------------------------------------------------------
     public api
     ------------------------------------------------------------ */
  P.audio = {
    init: function () {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.82;
      var limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -15;
      limiter.ratio.value = 4;
      limiter.attack.value = 0.008;
      limiter.release.value = 0.25;
      master.connect(limiter);
      limiter.connect(ctx.destination);

      voiceBus = ctx.createGain();
      voiceBus.gain.value = 1;
      voiceBus.connect(master);

      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      levelBuf = new Float32Array(analyser.fftSize);
      limiter.connect(analyser);

      ready = true;
      if (ctx.state === 'suspended') ctx.resume();
      buildAmbient();
      loadCalls();
      var btn = document.getElementById('snd');
      if (btn) btn.classList.add('on');
    },

    /* once per frame; schedules the sparse ambience one-shots */
    tick: function (dt) {
      if (!ready || muted) return;
      birdAt -= dt;
      if (birdAt <= 0) { bird(); birdAt = 7 + Math.random() * 9; }
      chimeAt -= dt;
      if (chimeAt <= 0) { chime(); chimeAt = 26 + Math.random() * 26; }
      lapAt -= dt;
      if (lapAt <= 0) { lap(); lapAt = 14 + Math.random() * 16; }
    },

    /* a creature's voice; the cooldown only applies to random chatter */
    voice: function (kind, vol, force, x, z) {
      if (!ready || muted) return false;
      var fn = VOICE[kind] || VOICE.sheep;
      var t = ctx.currentTime;
      if ((!force && t - lastVoice < 0.5) || t - (lastCall[kind] ?? -10) < (force ? 0.48 : 2.4)) return false;
      lastVoice = t;
      lastCall[kind] = t;
      var dx = Number.isFinite(x) ? x - listenerX : 0;
      var dz = Number.isFinite(z) ? z - listenerZ : 0;
      var gain = ctx.createGain();
      gain.gain.value = (vol === undefined ? 1 : vol) / (1 + Math.hypot(dx, dz) * 0.045);
      if (ctx.createStereoPanner) {
        var pan = ctx.createStereoPanner();
        pan.pan.value = Math.max(-0.75, Math.min(0.75, dx / 21));
        gain.connect(pan);
        pan.connect(voiceBus);
      } else gain.connect(voiceBus);
      function start() {
        if (!muted && ctx.state === 'running') {
          if (recordings[kind]) playCall(recordings[kind], gain);
          else {
            callBus = gain;
            try { fn(); } finally { callBus = null; }
          }
        }
        setTimeout(function () { gain.disconnect(); if (pan) pan.disconnect(); }, 3500);
      }
      if (force && pendingRecordings[kind] && !recordings[kind]) {
        Promise.race([pendingRecordings[kind], new Promise(function (resolve) { setTimeout(resolve, 350); })]).then(start);
      } else start();
      return true;
    },

    listen: function (x, z) { listenerX = x; listenerZ = z; },

    step: function (kind, quick) {
      if (!ready || muted) return;
      var hoof = kind === 'horse' || kind === 'cow';
      puff({ f0: hoof ? 260 : 720, f1: hoof ? 130 : 410,
        dur: hoof ? 0.07 : 0.085, gain: hoof ? (quick ? 0.12 : 0.085) : 0.055,
        q: 0.7, release: 0.055 });
      puff({ f0: 1700, f1: 780, dur: 0.085, gain: hoof ? 0.032 : 0.025, q: 0.65, delay: 0.023 });
    },

    splash: function (big) {
      if (!ready || muted) return;
      puff({
        f0: big ? 240 : 1300, f1: big ? 850 : 600,
        dur: big ? 0.55 : 0.22, gain: big ? 0.085 : 0.04, q: 0.8,
        bus: voiceBus
      });
    },

    setMuted: function (m) {
      muted = !!m;
      var btn = document.getElementById('snd');
      if (btn) {
        btn.classList.toggle('off', muted);
        var lab = btn.querySelector('span');
        if (lab) lab.textContent = muted ? '静音' : '声音';
      }
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.82, ctx.currentTime, 0.08);
    },

    isMuted: function () { return muted; },
    state: function () { return ctx ? ctx.state : 'none'; },
    level: function () {
      if (!analyser) return 0;
      analyser.getFloatTimeDomainData(levelBuf);
      var sum = 0;
      for (var i = 0; i < levelBuf.length; i++) sum += levelBuf[i] * levelBuf[i];
      return Math.sqrt(sum / levelBuf.length);
    },
    /* rough spectral centroid of what is playing, for sanity checks */
    bright: function () {
      if (!analyser) return 0;
      var bins = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(bins);
      var num = 0, den = 0;
      for (var i = 0; i < bins.length; i++) {
        var mag = Math.pow(10, bins[i] / 20);
        num += mag * i;
        den += mag;
      }
      return den > 0 ? (num / den) * (ctx.sampleRate / 2 / bins.length) : 0;
    }
  };

  /* the toggle button, plus the first-gesture unlock */
  window.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('snd');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var wasReady = P.audio.state() !== 'none';
        P.audio.init();
        /* first click just starts the sound; later clicks toggle it */
        if (wasReady) P.audio.setMuted(!P.audio.isMuted());
      });
    }
  });

  /* any gesture unlocks (and re-unlocks after a tab switch) the context */
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function (event) {
      if (!event.target.closest || !event.target.closest('#snd')) P.audio.init();
    }, { passive: true });
  });
})();
