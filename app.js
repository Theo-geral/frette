/* Frette — interface et moteur audio (navigateur). Dépend de core.js (window.FretteCore). */
(function () {
  'use strict';
  const C = window.FretteCore;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FINGER = ['', 'index', 'majeur', 'annulaire', 'auriculaire'];

  /* ================= Sauvegarde locale ================= */
  const Store = {
    read() { try { return JSON.parse(localStorage.getItem('frette') || '{}'); } catch (e) { return {}; } },
    write(o) { try { localStorage.setItem('frette', JSON.stringify(o)); } catch (e) { /* stockage indisponible */ } },
    best(kind, id) { const o = this.read(); return (o[kind] && o[kind][id]) || null; },
    saveBest(kind, id, pct) {
      const o = this.read();
      o[kind] = o[kind] || {};
      if (!o[kind][id] || pct > o[kind][id]) o[kind][id] = pct;
      this.write(o);
    },
    pref(k, v) {
      const o = this.read();
      if (v === undefined) return o.prefs ? o.prefs[k] : undefined;
      o.prefs = o.prefs || {}; o.prefs[k] = v; this.write(o);
    },
  };
  const Library = {
    imported() {
      const list = Store.read().imports || [];
      return list.map((it) => {
        const notes = it.notes.map((n) => ({ midi: C.STRINGS[n.s].midi + n.f, string: n.s, fret: n.f, dur: n.d, start: 0 }));
        let t = 0; notes.forEach((n) => { n.start = t; t += n.dur; });
        return { id: it.id, title: it.title, origin: 'Tablature importée', level: 0, bpm: it.bpm, notes, length: t, imported: true };
      });
    },
    all() { return C.SONGS.concat(this.imported()); },
    add(title, bpm, notes) {
      const o = Store.read();
      o.imports = o.imports || [];
      const id = 'imp-' + Date.now().toString(36);
      o.imports.push({ id, title, bpm, notes: notes.map((n) => ({ s: n.string, f: n.fret, d: n.dur })) });
      Store.write(o);
      return id;
    },
    remove(id) {
      const o = Store.read();
      o.imports = (o.imports || []).filter((x) => x.id !== id);
      if (o.songs) delete o.songs[id];
      Store.write(o);
    },
  };
  const fold = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const starsOf = (pct) => (pct == null ? 0 : pct >= 90 ? 3 : pct >= 70 ? 2 : 1);
  const starsHtml = (n) => '<span class="stars">' + [0, 1, 2].map((i) => (i < n ? '★' : '<span class="off">★</span>')).join('') + '</span>';

  /* ================= Sortie audio (sons de référence, clics) ================= */
  const Out = {
    _c: null,
    ctx() {
      if (!this._c) this._c = new (window.AudioContext || window.webkitAudioContext)();
      if (this._c.state === 'suspended') this._c.resume();
      return this._c;
    },
    tone(freq, dur) {
      dur = dur || 1.8;
      const c = this.ctx(), t = c.currentTime;
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = freq;
      o2.type = 'sine'; o2.frequency.value = freq * 2;
      const g2 = c.createGain(); g2.gain.value = 0.25;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); o2.connect(g2).connect(g); g.connect(c.destination);
      o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
    },
    click(when, strong) {
      const c = this.ctx();
      if (!this.nb) {
        const n = Math.floor(c.sampleRate * 0.025);
        this.nb = c.createBuffer(1, n, c.sampleRate);
        const d = this.nb.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n / 5));
      }
      const src = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.nb;
      hp.type = 'highpass'; hp.frequency.value = strong ? 5000 : 3500;
      g.gain.value = strong ? 1.4 : 0.9;
      src.connect(hp).connect(g).connect(c.destination);
      src.start(when);
    },
  };

  /* ================= Moteur d'écoute ================= */
  const Engine = {
    running: false, an: null, anC: null, buf: null, spec: null, sr: 48000, wake: null,
    subs: new Set(), hist: [],
    s: {
      now: 0, rms: 0, gate: 0.01, noise: 0.004, level: 0,
      voiced: false, freq: 0, midiF: null, stableMidi: null, stableFrames: 0, lastRound: null,
      unvoiced: 99, onsetSeq: 0, lastOnset: -10, lastNote: null,
    },
    async start() {
      if (this.running) return;
      if (!window.isSecureContext) throw Object.assign(new Error('insecure'), { code: 'insecure' });
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('unsupported'), { code: 'unsupported' });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ctx = Out.ctx();
      await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      this.an = ctx.createAnalyser(); this.an.fftSize = 4096; this.an.smoothingTimeConstant = 0;
      this.anC = ctx.createAnalyser(); this.anC.fftSize = 8192; this.anC.smoothingTimeConstant = 0.5;
      src.connect(this.an); src.connect(this.anC);
      this.buf = new Float32Array(this.an.fftSize);
      this.spec = new Float32Array(this.anC.frequencyBinCount);
      this.sr = ctx.sampleRate;
      this.running = true;
      this.keepAwake();
      const loop = (t) => { this.tick(t / 1000); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },
    async keepAwake() {
      try { if ('wakeLock' in navigator && document.visibilityState === 'visible') this.wake = await navigator.wakeLock.request('screen'); } catch (e) { /* refusé : pas grave */ }
    },
    tick(now) {
      const s = this.s;
      this.an.getFloatTimeDomainData(this.buf);
      s.now = now;
      const r = this.lowRms(1024);
      if (r < s.noise) s.noise = s.noise * 0.7 + r * 0.3; else s.noise = Math.min(s.noise * 1.003, 0.05);
      s.gate = Math.max(0.0035, s.noise * 2.5);
      s.rms = r;
      s.level = Math.max(0, Math.min(1, (20 * Math.log10(r + 1e-9) + 60) / 50));

      // attaque : hausse brutale du volume
      const prevMin = this.hist.length ? Math.min.apply(null, this.hist) : r;
      this.hist.push(r); if (this.hist.length > 7) this.hist.shift();
      let onset = r > s.gate && r > 1.5 * Math.max(prevMin, s.noise) && now - s.lastOnset > 0.12;

      // hauteur
      let res = null;
      if (r > s.gate) res = C.detectPitch(this.buf, this.sr);
      let round = null;
      if (res && res.clarity > 0.75) {
        const m = C.freqToMidi(res.freq);
        if (m > 36 && m < 92) { s.freq = res.freq; s.midiF = m; round = Math.round(m); }
      }
      s.voiced = round !== null;
      if (s.voiced) {
        if (s.unvoiced >= 4 && now - s.lastOnset > 0.12) onset = true; // une note apparaît après un silence
        s.unvoiced = 0;
      } else s.unvoiced++;
      if (onset) { s.onsetSeq++; s.lastOnset = now; s.stableFrames = 0; }
      if (s.voiced && round === s.lastRound) s.stableFrames++;
      else s.stableFrames = s.voiced ? 1 : 0;
      s.lastRound = round;
      s.stableMidi = s.stableFrames >= 3 ? round : null;
      // changement de note sans attaque nette (corde précédente encore en train de sonner)
      if (s.stableMidi != null && s.stableMidi !== s.lastNote) {
        if (now - s.lastOnset > 0.2) { s.onsetSeq++; s.lastOnset = now; }
        s.lastNote = s.stableMidi;
      }
      if (s.unvoiced > 10) s.lastNote = null;

      const bar = document.getElementById('levelBar');
      if (bar) bar.style.width = Math.round(s.level * 100) + '%';
      this.subs.forEach((f) => f(s));
    },
    lowRms(n) {
      const b = this.buf, a = 1 - Math.exp((-2 * Math.PI * 1200) / this.sr);
      let y1 = b[b.length - n], y2 = y1, acc = 0;
      for (let i = b.length - n; i < b.length; i++) { y1 += a * (b[i] - y1); y2 += a * (y1 - y2); acc += y2 * y2; }
      return Math.sqrt(acc / n);
    },
    chroma() {
      this.anC.getFloatFrequencyData(this.spec);
      return C.chroma(this.spec, this.sr, this.anC.fftSize);
    },
  };
  // Une nouvelle note jouée, pas encore utilisée par l'exercice
  const fresh = (s, consumed) => s.onsetSeq > consumed && s.now - s.lastOnset < 0.6;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Engine.running) { Out.ctx(); Engine.keepAwake(); }
  });

  /* ================= Micro : activation et messages ================= */
  let micError = '';
  function micNotice() {
    if (Engine.running) return '';
    return '<div class="notice mic-notice' + (micError ? ' err' : '') + '">' +
      '<p>' + (micError ? esc(micError) : 'Frette a besoin du micro pour t’entendre jouer. Rien n’est enregistré ni envoyé.') + '</p>' +
      '<button class="btn primary" data-act="mic" type="button">Activer le micro</button></div>';
  }
  async function startMic() {
    try {
      await Engine.start();
      micError = '';
    } catch (e) {
      if (e.code === 'insecure') micError = 'Le micro ne fonctionne que si l’appli est ouverte en HTTPS (par exemple via GitHub Pages).';
      else if (e.name === 'NotAllowedError') micError = 'Accès au micro refusé. Autorise-le dans les réglages du site (icône à gauche de l’adresse), puis réessaie.';
      else if (e.name === 'NotFoundError') micError = 'Aucun micro trouvé sur cet appareil.';
      else micError = 'Impossible d’ouvrir le micro (' + (e.message || e.name) + ').';
    }
    updateMicUI();
  }
  function updateMicUI() {
    const b = $('#micBtn');
    b.classList.toggle('off', !Engine.running);
    $('#micLabel').textContent = Engine.running ? 'Micro actif' : 'Activer le micro';
    document.querySelectorAll('.mic-notice').forEach((n) => {
      if (Engine.running) n.remove();
      else { n.classList.toggle('err', !!micError); if (micError) n.querySelector('p').textContent = micError; }
    });
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act="mic"]');
    if (t && !Engine.running) startMic();
    if (e.target.closest('[data-act="course"]')) { Notes.mode = 'list'; show('notes'); }
  });

  /* ================= Dessins SVG ================= */
  // Manche horizontal, corde aiguë en haut (comme une tablature)
  function fretboard(targets, frets) {
    targets = targets || []; frets = frets || 5;
    const W = 340, L = 58, R = 10, T = 14, G = 18, fw = (W - L - R) / frets, H = T + G * 5 + 30;
    const active = new Set(targets.map((t) => t.string));
    let s = '<svg class="board" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Manche de guitare">';
    s += '<rect x="' + L + '" y="' + (T - 9) + '" width="' + (W - L - R) + '" height="' + (G * 5 + 18) + '" rx="3" fill="#3a2920"/>';
    [3, 5, 7, 9].filter((f) => f <= frets).forEach((f) => {
      s += '<circle cx="' + (L + (f - 0.5) * fw) + '" cy="' + (T + 2.5 * G) + '" r="5" fill="#d9cbbb" opacity=".35"/>';
    });
    if (frets >= 12) [1.5, 3.5].forEach((k) => { s += '<circle cx="' + (L + 11.5 * fw) + '" cy="' + (T + k * G) + '" r="4" fill="#d9cbbb" opacity=".35"/>'; });
    for (let f = 1; f <= frets; f++) s += '<line x1="' + (L + f * fw) + '" y1="' + (T - 9) + '" x2="' + (L + f * fw) + '" y2="' + (T + 5 * G + 9) + '" stroke="#a89584" stroke-width="2.2"/>';
    s += '<rect x="' + (L - 5) + '" y="' + (T - 9) + '" width="6" height="' + (G * 5 + 18) + '" rx="1.5" fill="#efe4d6"/>';
    for (let st = 0; st < 6; st++) {
      const y = T + (5 - st) * G, str = C.STRINGS[st];
      const op = active.size && !active.has(st) ? 0.35 : 1;
      s += '<line x1="30" y1="' + y + '" x2="' + (W - R) + '" y2="' + y + '" stroke="' + str.color + '" stroke-width="' + (2.8 - st * 0.33).toFixed(2) + '" opacity="' + op + '"/>';
      s += '<text x="12" y="' + (y + 5) + '" fill="' + str.color + '" font-size="15" font-weight="700" font-family="Barlow Condensed, sans-serif" opacity="' + op + '">' + str.short + '</text>';
    }
    for (let f = 1; f <= frets; f++) s += '<text x="' + (L + (f - 0.5) * fw) + '" y="' + (H - 6) + '" fill="#b59f8f" font-size="13" text-anchor="middle" font-family="Barlow Condensed, sans-serif">' + f + '</text>';
    targets.forEach((t) => {
      const x = t.fret === 0 ? L - 22 : L + (t.fret - 0.5) * fw, y = T + (5 - t.string) * G;
      const col = C.STRINGS[t.string].color;
      s += '<circle cx="' + x + '" cy="' + y + '" r="12" fill="' + col + '" stroke="#1a120f" stroke-width="2.5"/>';
      const lab = String(t.label != null ? t.label : t.fret);
      s += '<text x="' + x + '" y="' + (y + 4.5) + '" fill="#1a120f" font-size="' + (lab.length > 2 ? 10 : 13) + '" font-weight="700" text-anchor="middle" font-family="Barlow Condensed, sans-serif">' + esc(lab) + '</text>';
    });
    return s + '</svg>';
  }

  // Diagramme d'accord vertical (corde grave à gauche)
  function chordDiagram(ch) {
    const W = 190, x0 = 30, gx = 26, y0 = 44, gy = 34, rows = 4;
    let s = '<svg class="diagram" viewBox="0 0 ' + W + ' ' + (y0 + gy * rows + 12) + '" role="img" aria-label="Diagramme ' + esc(ch.fr) + '">';
    for (let r = 1; r <= rows; r++) s += '<line x1="' + x0 + '" x2="' + (x0 + 5 * gx) + '" y1="' + (y0 + r * gy) + '" y2="' + (y0 + r * gy) + '" stroke="#a89584" stroke-width="2"/>';
    s += '<rect x="' + (x0 - 2) + '" y="' + (y0 - 5) + '" width="' + (5 * gx + 4) + '" height="6" rx="1.5" fill="#efe4d6"/>';
    for (let st = 0; st < 6; st++) {
      const x = x0 + st * gx, f = ch.frets[st], col = C.STRINGS[st].color;
      s += '<line x1="' + x + '" x2="' + x + '" y1="' + y0 + '" y2="' + (y0 + rows * gy) + '" stroke="' + col + '" stroke-width="' + (2.6 - st * 0.3).toFixed(2) + '" opacity="' + (f < 0 ? 0.3 : 1) + '"/>';
      if (f < 0) s += '<text x="' + x + '" y="' + (y0 - 14) + '" text-anchor="middle" font-size="18" fill="#f0786a">×</text>';
      else if (f === 0) s += '<circle cx="' + x + '" cy="' + (y0 - 19) + '" r="6.5" fill="none" stroke="#f4eadf" stroke-width="2"/>';
      else {
        const y = y0 + (f - 0.5) * gy;
        s += '<circle cx="' + x + '" cy="' + y + '" r="11.5" fill="#f4eadf"/>';
        s += '<text x="' + x + '" y="' + (y + 5) + '" text-anchor="middle" font-size="15" fill="#1a120f">' + ch.fingers[st] + '</text>';
      }
    }
    return s + '</svg>';
  }

  /* ================= Accordeur ================= */
  const Tuner = {
    manual: null, disp: 0, lastVoiced: -10, okSince: 0, tuned: new Set(), cur: null,
    mount(el) {
      this.el = el;
      el.innerHTML = micNotice() +
        '<div class="tuner-note"><div class="big" id="tnNote">—</div><div class="sub" id="tnSub">Pince une corde à vide</div></div>' +
        this.gauge() +
        '<div class="verdict" id="tnVerdict"></div>' +
        '<div class="mode-line"><span id="tnMode"></span><button class="chip" id="tnAuto" type="button">Auto</button></div>' +
        '<div class="strings6">' + C.STRINGS.map((st, i) =>
          '<button type="button" data-s="' + i + '"><span class="n">' + st.num + '</span><span class="l">' + st.name + '</span><span class="dot" style="background:' + st.color + '"></span></button>').join('') + '</div>' +
        '<p class="tip">Touche une corde pour entendre sa note de référence et la choisir. « Auto » reconnaît la corde jouée.</p>';
      el.querySelectorAll('.strings6 button').forEach((b) => b.addEventListener('click', () => {
        const i = +b.dataset.s;
        this.manual = i;
        Out.tone(C.midiToFreq(C.STRINGS[i].midi));
        this.syncMode();
      }));
      $('#tnAuto', el).addEventListener('click', () => { this.manual = null; this.syncMode(); });
      this.syncMode();
      this.sub = (s) => this.frame(s);
      Engine.subs.add(this.sub);
    },
    unmount() { Engine.subs.delete(this.sub); },
    gauge() {
      const cx = 160, cy = 172, R = 140;
      const pt = (c, r) => { const a = (c / 50) * (Math.PI / 3); return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
      let s = '<svg class="gauge idle" id="tnGauge" viewBox="0 0 320 196" aria-hidden="true">';
      const [ax, ay] = pt(-5, R), [bx, by] = pt(5, R);
      s += '<path class="zone" d="M' + cx + ' ' + cy + ' L' + ax.toFixed(1) + ' ' + ay.toFixed(1) + ' A' + R + ' ' + R + ' 0 0 1 ' + bx.toFixed(1) + ' ' + by.toFixed(1) + ' Z"/>';
      for (let c = -50; c <= 50; c += 5) {
        const major = c % 25 === 0;
        const [x1, y1] = pt(c, major ? 116 : c % 10 === 0 ? 126 : 132), [x2, y2] = pt(c, R);
        s += '<line class="tick' + (major ? ' major' : '') + '" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
      }
      const lab = (c, t) => { const [x, y] = pt(c, 100); return '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="middle">' + t + '</text>'; };
      s += lab(-50, '−50') + lab(0, '0') + lab(50, '+50') + lab(-30, 'trop bas') + lab(30, 'trop haut');
      s += '<line class="needle" id="tnNeedle" x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + (cy - 128) + '"/>';
      s += '<circle class="hub" cx="' + cx + '" cy="' + cy + '" r="7"/>';
      return s + '</svg>';
    },
    setGoal() {
      this.tuned = new Set(); this.goal = true;
      this.el.insertAdjacentHTML('afterbegin', '<div class="goal" id="tnGoal"><span>Leçon : accorde les 6 cordes jusqu\u2019à « Juste ! »</span><b id="tnGoalN">0 / 6</b></div>');
      this.syncMode();
    },
    syncMode() {
      const auto = this.manual == null;
      const gn = $('#tnGoalN', this.el);
      if (gn) gn.textContent = this.tuned.size + ' / 6';
      if (this.goal && this.tuned.size >= 6) {
        this.goal = false;
        Store.saveBest('tuner', 'all', 100);
        const g = $('#tnGoal', this.el);
        if (g) g.innerHTML = '<span>Leçon validée : ta guitare est accordée !</span><button class="chip" type="button" data-act="course">Retour au cours</button>';
      }
      $('#tnAuto', this.el).setAttribute('aria-pressed', String(auto));
      $('#tnMode', this.el).textContent = auto ? 'Corde détectée automatiquement' : 'Corde ' + C.STRINGS[this.manual].num + ' choisie';
      this.el.querySelectorAll('.strings6 button').forEach((b) => {
        const i = +b.dataset.s;
        b.classList.toggle('active', i === (auto ? this.cur : this.manual));
        b.classList.toggle('tuned', this.tuned.has(i));
      });
    },
    frame(s) {
      const g = $('#tnGauge', this.el); if (!g) return;
      if (s.voiced) {
        this.lastVoiced = s.now;
        let si = this.manual;
        if (si == null) {
          let best = 1e9;
          C.STRINGS.forEach((st, i) => { const d = Math.abs(s.midiF - st.midi); if (d < best) { best = d; si = i; } });
        }
        if (si !== this.cur) { this.cur = si; this.syncMode(); }
        const st = C.STRINGS[si];
        const cents = (s.midiF - st.midi) * 100;
        this.disp += (Math.max(-60, Math.min(60, cents)) - this.disp) * 0.3;
        $('#tnNote', this.el).textContent = st.name;
        $('#tnSub', this.el).textContent = 'Corde ' + st.num + ' · ' + s.freq.toFixed(1).replace('.', ',') + ' Hz · ' + (cents >= 0 ? '+' : '−') + Math.abs(Math.round(cents)) + ' cents';
        const ok = Math.abs(cents) < 5;
        const v = $('#tnVerdict', this.el);
        if (ok) {
          if (!this.okSince) this.okSince = s.now;
          v.textContent = 'Juste !'; v.className = 'verdict ok';
          if (s.now - this.okSince > 0.6 && !this.tuned.has(si)) { this.tuned.add(si); this.syncMode(); }
        } else {
          this.okSince = 0;
          if (Math.abs(cents) > 100) v.textContent = cents < 0 ? 'Beaucoup trop bas : tends la corde' : 'Beaucoup trop haut : détends la corde';
          else v.textContent = cents < 0 ? 'Trop bas : tends un peu la corde' : 'Trop haut : détends un peu la corde';
          v.className = 'verdict warn';
        }
        g.classList.remove('idle');
        g.classList.toggle('ok', ok);
      } else if (s.now - this.lastVoiced > 0.9) {
        this.disp *= 0.85;
        g.classList.add('idle'); g.classList.remove('ok');
        $('#tnVerdict', this.el).textContent = '';
        this.okSince = 0;
      }
      const a = (this.disp / 50) * 60;
      $('#tnNeedle', this.el).setAttribute('transform', 'rotate(' + a.toFixed(2) + ' 160 172)');
    },
  };

  /* ================= Cours ================= */
  const K = window.FretteCourse;
  const ALL_LESSONS = [];
  K.COURSE.forEach((ch, ci) => ch.lessons.forEach((l) => { l.chapter = ch; l.chapterNum = ci + 1; ALL_LESSONS.push(l); }));
  const TYPE_LABEL = { theory: 'Théorie', notes: 'Notes', rhythm: 'Rythme', chords: 'Accords', song: 'Morceau', tuner: 'Accordage' };
  const Progress = {
    best(l) {
      switch (l.type) {
        case 'theory': return Store.best('theory', l.id);
        case 'notes': return Store.best('lessons', l.lesson);
        case 'rhythm': return Store.best('rhythm', l.id);
        case 'chords': return Store.best('chords', l.id);
        case 'song': return Store.best('songs', l.song);
        case 'tuner': return Store.best('tuner', 'all');
      }
      return null;
    },
    done(l) {
      const b = this.best(l);
      if (b == null) return false;
      return l.type === 'theory' ? b >= 50 : b >= 70;
    },
    next() { return ALL_LESSONS.find((l) => !this.done(l)) || null; },
    after(l) { const i = ALL_LESSONS.indexOf(l); return i >= 0 ? ALL_LESSONS[i + 1] || null : null; },
  };
  const BACK = '<button class="back" type="button" aria-label="Retour au cours"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>';
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  const Notes = {
    mode: 'list',
    mount(el) {
      this.el = el;
      this.render();
      this.sub = (s) => this.frame(s);
      Engine.subs.add(this.sub);
    },
    unmount() {
      Engine.subs.delete(this.sub); clearTimeout(this.timer);
      if (this.mode !== 'list' && this.mode !== 'theory') this.mode = 'list';
      if (this.rh) this.rh.running = false;
    },
    head(title, count) {
      return '<div class="bar-head">' + BACK + '<h2>' + esc(title) + '</h2>' + (count ? '<span class="count" id="hdCount">' + count + '</span>' : '') + '</div>';
    },
    bindBack() {
      const b = $('.back', this.el);
      if (b) b.addEventListener('click', () => { this.mode = 'list'; if (this.rh) this.rh.running = false; this.render(); });
    },
    nextButtons(again) {
      const nx = this.current ? Progress.after(this.current) : null;
      return '<div class="row">' + (again ? '<button class="btn" id="lsAgain" type="button">Recommencer</button>' : '') +
        (nx ? '<button class="btn primary" id="lsNext" type="button">Leçon suivante</button>' : '<button class="btn primary" id="lsList" type="button">Retour au cours</button>') + '</div>';
    },
    bindNext(again) {
      const n = $('#lsNext', this.el), li = $('#lsList', this.el), a = $('#lsAgain', this.el);
      if (n) n.addEventListener('click', () => this.runLesson(Progress.after(this.current)));
      if (li) li.addEventListener('click', () => { this.mode = 'list'; this.render(); });
      if (a && again) a.addEventListener('click', again);
    },
    runLesson(l) {
      if (!l) { this.mode = 'list'; this.render(); return; }
      this.current = l;
      $('#main').scrollTop = 0;
      switch (l.type) {
        case 'notes': this.start(C.LESSONS.find((x) => x.id === l.lesson)); break;
        case 'theory': this.th = { page: 0, q: -1, picked: null, score: 0 }; this.mode = 'theory'; this.render(); break;
        case 'rhythm': this.rh = null; this.mode = 'rhythm'; this.render(); break;
        case 'chords': this.mode = 'list'; show('chords'); Chords.preset(l); break;
        case 'song': this.mode = 'list'; openSong(l.song); break;
        case 'tuner': this.mode = 'list'; show('tuner'); Tuner.setGoal(); break;
      }
    },
    render() {
      const el = this.el;
      if (this.mode === 'list') this.renderList();
      else if (this.mode === 'theory') this.renderTheory();
      else if (this.mode === 'rhythm') this.renderRhythm();
      else if (this.mode === 'play') {
        el.innerHTML = micNotice() + this.head(this.lesson.title, ' ') +
          '<div class="progress"><i id="ntProg"></i></div>' +
          '<div class="target" id="ntTarget"><div class="big" id="ntNote"></div><div class="where" id="ntWhere"></div></div>' +
          '<div class="board-wrap" id="ntBoard"></div>' +
          '<div class="heard">Entendu : <b id="ntHeard">—</b></div>' +
          '<p class="tip">Appuie juste derrière la frette avec le bout du doigt, puis pince la corde une fois.</p>' +
          '<div class="row"><button class="btn ghost" id="ntSkip" type="button">Passer cette note</button></div>';
        this.bindBack();
        $('#ntSkip', el).addEventListener('click', () => { this.wrong++; this.next(); });
        this.showTarget();
      } else {
        const pct = this.pct;
        el.innerHTML = this.head(this.lesson.title) +
          '<div class="result"><div class="eyebrow">Précision</div><div class="pct">' + pct + ' %</div>' + starsHtml(starsOf(pct)) +
          '<p>' + this.right + ' notes justes, ' + this.wrong + ' erreur' + (this.wrong > 1 ? 's' : '') + '.</p>' +
          (pct < 70 ? '<p>Il faut 70 % pour valider la leçon. Recommence tranquillement.</p>' : '') + '</div>' +
          this.nextButtons(true);
        this.bindBack();
        this.bindNext(() => this.start(this.lesson));
      }
    },

    /* ----- liste du cours ----- */
    renderList() {
      const el = this.el;
      const nx = Progress.next();
      const nd = ALL_LESSONS.filter((l) => Progress.done(l)).length;
      let h = '<div><div class="eyebrow">Ton parcours</div><h1 style="font-size:32px">Apprendre la guitare</h1></div>' +
        '<div class="course-prog"><div class="progress"><i style="width:' + Math.round((nd / ALL_LESSONS.length) * 100) + '%"></i></div><span>' + nd + ' / ' + ALL_LESSONS.length + ' leçons</span></div>';
      if (nx) {
        h += '<button class="continue" type="button" data-id="' + nx.id + '"><span class="eyebrow">' + (nd ? 'Continuer' : 'Commencer') + ' · chapitre ' + nx.chapterNum + '</span>' +
          '<b>' + esc(nx.title) + '</b><span class="ctype">' + TYPE_LABEL[nx.type] + (nx.desc ? ' · ' + esc(nx.desc) : '') + '</span></button>';
      } else {
        h += '<div class="notice"><p>Bravo, tu as terminé tout le cours ! Continue avec les morceaux, ou importe des tablatures dans l’onglet Chercher.</p></div>';
      }
      K.COURSE.forEach((ch, ci) => {
        const d = ch.lessons.filter((l) => Progress.done(l)).length;
        h += '<section class="chap"><div class="chap-head"><span class="chap-num">' + (ci + 1) + '</span><h2>' + esc(ch.title) + '</h2><span class="chap-prog' + (d === ch.lessons.length ? ' full' : '') + '">' + d + '/' + ch.lessons.length + '</span></div><div class="lessons">';
        ch.lessons.forEach((l) => {
          const done = Progress.done(l), b = Progress.best(l), isNext = nx === l;
          const score = (l.type === 'notes' || l.type === 'rhythm' || l.type === 'song') && b != null ? starsHtml(starsOf(b)) : '';
          h += '<button class="lrow' + (done ? ' done' : '') + (isNext ? ' next' : '') + '" type="button" data-id="' + l.id + '">' +
            '<span class="lstate">' + (done ? CHECK : '') + '</span>' +
            '<span class="lmain"><b>' + esc(l.title) + '</b><small>' + TYPE_LABEL[l.type] + (l.desc ? ' · ' + esc(l.desc) : '') + '</small></span>' +
            '<span class="lscore">' + score + '</span></button>';
        });
        h += '</div></section>';
      });
      el.innerHTML = h;
      el.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => this.runLesson(ALL_LESSONS.find((l) => l.id === b.dataset.id))));
    },

    /* ----- théorie et quiz ----- */
    renderTheory() {
      const el = this.el, l = this.current, th = this.th;
      const nP = l.pages.length, quiz = l.quiz || [], nQ = quiz.length, steps = nP + nQ;
      if (th.q < 0) {
        const pg = l.pages[th.page];
        const last = th.page === nP - 1;
        el.innerHTML = this.head(l.title, (th.page + 1) + ' / ' + nP) +
          '<div class="progress"><i style="width:' + ((th.page + 1) / steps) * 100 + '%"></i></div>' +
          '<article class="theory"><h2>' + esc(pg.h) + '</h2>' +
          (pg.fig ? '<figure class="fig">' + window.FretteFigs.figure(pg.fig, { fretboard, chordDiagram }) + '</figure>' : '') +
          '<p>' + pg.body + '</p></article>' +
          '<div class="row">' + (th.page > 0 ? '<button class="btn ghost" id="thPrev" type="button">Précédent</button>' : '') +
          '<button class="btn primary" id="thNext" type="button">' + (!last ? 'Suivant' : nQ ? 'Passer au quiz' : 'Terminer la leçon') + '</button></div>';
        this.bindBack();
        const pv = $('#thPrev', el); if (pv) pv.addEventListener('click', () => { th.page--; this.render(); $('#main').scrollTop = 0; });
        $('#thNext', el).addEventListener('click', () => {
          if (!last) th.page++;
          else if (nQ) { th.q = 0; th.picked = null; }
          else { th.q = 0; Store.saveBest('theory', l.id, 100); th.final = 100; }
          this.render(); $('#main').scrollTop = 0;
        });
        return;
      }
      if (th.q >= nQ) {
        const pct = th.final != null ? th.final : Math.round((th.score / nQ) * 100);
        el.innerHTML = this.head(l.title) +
          '<div class="result">' + (nQ ? '<div class="eyebrow">Quiz</div><div class="pct">' + th.score + ' / ' + nQ + '</div>' + starsHtml(starsOf(pct)) : '<div class="eyebrow">Leçon terminée</div>' + starsHtml(3)) +
          (nQ && pct < 50 ? '<p>Relis les pages et retente le quiz pour valider la leçon.</p>' : '<p>Leçon validée.</p>') + '</div>' +
          this.nextButtons(true);
        this.bindBack();
        this.bindNext(() => { this.th = { page: 0, q: -1, picked: null, score: 0 }; this.render(); });
        return;
      }
      const qq = quiz[th.q];
      el.innerHTML = this.head(l.title, 'Quiz') +
        '<div class="progress"><i style="width:' + ((nP + th.q + 1) / steps) * 100 + '%"></i></div>' +
        '<div class="quiz"><div class="eyebrow">Question ' + (th.q + 1) + ' sur ' + nQ + '</div><h2>' + esc(qq.q) + '</h2>' +
        '<div class="opts">' + qq.options.map((o, i) => '<button class="opt" type="button" data-i="' + i + '">' + esc(o) + '</button>').join('') + '</div>' +
        '<p class="why" id="qWhy" hidden></p></div>' +
        '<div class="row"><button class="btn primary" id="qNext" type="button" hidden>' + (th.q + 1 < nQ ? 'Question suivante' : 'Voir le résultat') + '</button></div>';
      this.bindBack();
      el.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
        if (th.picked != null) return;
        const i = +b.dataset.i; th.picked = i;
        const ok = i === qq.answer;
        if (ok) th.score++;
        el.querySelectorAll('.opt').forEach((x) => {
          const k = +x.dataset.i;
          if (k === qq.answer) x.classList.add('right');
          else if (k === i) x.classList.add('wrong');
          x.disabled = true;
        });
        const w = $('#qWhy', el);
        w.innerHTML = '<b>' + (ok ? 'Exact !' : 'Pas tout à fait.') + '</b> ' + esc(qq.why);
        w.className = 'why ' + (ok ? 'ok' : 'bad'); w.hidden = false;
        $('#qNext', el).hidden = false;
      }));
      $('#qNext', el).addEventListener('click', () => {
        th.q++; th.picked = null;
        if (th.q >= nQ) Store.saveBest('theory', l.id, Math.round((th.score / nQ) * 100));
        this.render();
      });
    },

    /* ----- exercice de rythme ----- */
    renderRhythm() {
      const el = this.el, l = this.current;
      const lab = ['1', 'et', '2', 'et', '3', 'et', '4', 'et'];
      el.innerHTML = micNotice() + this.head(l.title) +
        '<div class="rh-instr">' + esc(l.instr) + '</div>' +
        '<div class="rh-beat"><div class="rh-count" id="rhCount">·</div><div class="rh-tempo">' + l.bpm + ' BPM</div></div>' +
        '<div class="rh-grid"><div class="rh-bar rh-lab"><span class="rh-num"></span><div class="rh-cells">' + lab.map((x, i) => '<span class="' + (i % 2 ? 'et' : '') + '">' + x + '</span>').join('') + '</div></div>' +
        l.bars.map((bar, bi) => '<div class="rh-bar"><span class="rh-num">' + (bi + 1) + '</span><div class="rh-cells">' +
          [0, 1, 2, 3, 4, 5, 6, 7].map((k) => '<i class="' + (bar.includes(k / 2) ? 'on' : '') + '" data-b="' + bi + '" data-k="' + k + '"></i>').join('') + '</div></div>').join('') +
        '</div>' +
        '<div id="rhOut"><p class="tip">Après 4 clics de décompte, joue sur chaque case dorée. Le clic du temps 1 est plus aigu. Pose le téléphone près de la guitare.</p>' +
        '<div class="row"><button class="btn primary" id="rhGo" type="button">Démarrer</button></div></div>';
      this.bindBack();
      $('#rhGo', el).addEventListener('click', () => this.rhStart());
    },
    rhStart() {
      if (!Engine.running) { startMic().then(() => { if (Engine.running) this.rhStart(); }); return; }
      const l = this.current, el = this.el;
      const exp = [];
      l.bars.forEach((bar, bi) => bar.forEach((b) => exp.push({ beat: bi * 4 + b, el: $('i[data-b="' + bi + '"][data-k="' + b * 2 + '"]', el), dev: null })));
      exp.forEach((e, i) => {
        const a = i > 0 ? e.beat - exp[i - 1].beat : 2, z = i + 1 < exp.length ? exp[i + 1].beat - e.beat : 2;
        e.win = Math.min(0.45, a / 2, z / 2);
      });
      el.querySelectorAll('.rh-cells i').forEach((c) => c.classList.remove('got', 'good', 'ok', 'off', 'miss', 'cur'));
      const ctx = Out.ctx(), spb = 60 / l.bpm, lead = 0.4, total = 4 + l.bars.length * 4;
      const tA = ctx.currentTime + lead;
      for (let k = 0; k < total; k++) Out.click(tA + k * spb, k % 4 === 0);
      const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
      this.rh = { spb, t0: performance.now() / 1000 + lead + lat + 4 * spb, exp, pending: null, consumed: Engine.s.onsetSeq, end: l.bars.length * 4, running: true, cur: null };
      $('#rhOut', el).innerHTML = '<p class="tip">Écoute le décompte…</p><div class="row"><button class="btn ghost" id="rhStop" type="button">Arrêter</button></div>';
      $('#rhStop', el).addEventListener('click', () => { this.rh.running = false; this.render(); });
    },
    rhFrame(s) {
      const r = this.rh; if (!r || !r.running) return;
      const beat = (s.now - r.t0) / r.spb;
      const cnt = $('#rhCount', this.el);
      if (cnt) {
        const n = beat < 0 ? Math.floor(beat + 4) + 1 : (Math.floor(beat) % 4) + 1;
        cnt.textContent = beat < -4 ? '·' : String(Math.max(1, n));
        cnt.className = 'rh-count' + (beat < 0 ? ' pre' : '') + (beat - Math.floor(beat) < 0.15 ? ' tick' : '');
      }
      const ci = Math.floor(beat * 2);
      if (ci !== r.ci) {
        r.ci = ci;
        if (r.cur) r.cur.classList.remove('cur');
        r.cur = beat >= 0 ? $('i[data-b="' + Math.floor(ci / 8) + '"][data-k="' + (ci % 8) + '"]', this.el) : null;
        if (r.cur) r.cur.classList.add('cur');
      }
      if (s.onsetSeq > r.consumed) { r.consumed = s.onsetSeq; r.pending = s.lastOnset; }
      if (r.pending != null) {
        if (s.voiced) { this.rhRegister(r.pending); r.pending = null; }
        else if (s.now - r.pending > 0.25) r.pending = null;
      }
      if (beat > r.end + 0.6) this.rhFinish();
    },
    rhRegister(t) {
      const r = this.rh, b = (t - r.t0) / r.spb;
      let best = null, bd = 1e9;
      r.exp.forEach((e) => { if (e.dev != null) return; const d = Math.abs(b - e.beat); if (d < bd) { bd = d; best = e; } });
      if (!best || bd > best.win) return;
      best.dev = (b - best.beat) * r.spb * 1000;
      if (best.el) best.el.classList.add('got');
    },
    rhFinish() {
      const r = this.rh; r.running = false;
      if (r.cur) r.cur.classList.remove('cur');
      const devs = r.exp.filter((e) => e.dev != null).map((e) => e.dev).sort((a, b) => a - b);
      const med = devs.length ? Math.max(-150, Math.min(150, devs[devs.length >> 1])) : 0;
      let good = 0, ok = 0, off = 0, miss = 0;
      r.exp.forEach((e) => {
        let cls;
        if (e.dev == null) { miss++; cls = 'miss'; }
        else {
          const a = Math.abs(e.dev - med);
          if (a <= 80) { good++; cls = 'good'; } else if (a <= 150) { ok++; cls = 'ok'; } else { off++; cls = 'off'; }
        }
        if (e.el) { e.el.classList.remove('got'); e.el.classList.add(cls); }
      });
      const n = r.exp.length;
      const pct = Math.round(((good + ok * 0.6 + off * 0.2) / n) * 100);
      Store.saveBest('rhythm', this.current.id, pct);
      const cnt = $('#rhCount', this.el); if (cnt) { cnt.textContent = '·'; cnt.className = 'rh-count'; }
      $('#rhOut', this.el).innerHTML =
        '<div class="result compact"><div class="pct">' + pct + ' %</div>' + starsHtml(starsOf(pct)) +
        '<p><span class="dot good"></span>' + good + ' en place · <span class="dot ok"></span>' + ok + ' presque · <span class="dot off"></span>' + off + ' décalées · <span class="dot miss"></span>' + miss + ' manquées</p>' +
        (pct < 70 ? '<p>Il faut 70 % pour valider. Compte à voix haute avec le métronome, ça aide beaucoup.</p>' : '') + '</div>' +
        this.nextButtons(true);
      this.bindNext(() => this.rhStart());
    },

    /* ----- exercice de notes ----- */
    start(lesson) {
      this.lesson = lesson;
      this.targets = C.lessonTargets(lesson);
      this.i = 0; this.right = 0; this.wrong = 0; this.lock = 0;
      this.consumed = Engine.s.onsetSeq;
      this.mode = 'play';
      this.render();
    },
    showTarget() {
      const t = this.targets[this.i], st = C.STRINGS[t.string];
      const m = st.midi + t.fret, n = C.noteName(m);
      $('#ntNote', this.el).innerHTML = esc(n.fr) + '<small>' + n.en + '</small>';
      $('#ntWhere', this.el).innerHTML = 'Corde <b>' + st.num + '</b> (' + st.name + ') · ' + (t.fret === 0 ? '<b>à vide</b>' : 'case <b>' + t.fret + '</b>');
      $('#ntBoard', this.el).innerHTML = fretboard([t], 5);
      $('#ntTarget', this.el).className = 'target';
      $('#hdCount', this.el).textContent = (this.i + 1) + ' / ' + this.targets.length;
      $('#ntProg', this.el).style.width = (this.i / this.targets.length) * 100 + '%';
    },
    next() {
      this.i++;
      this.consumed = Engine.s.onsetSeq;
      if (this.i >= this.targets.length) {
        this.pct = Math.round((this.right / Math.max(1, this.right + this.wrong)) * 100);
        Store.saveBest('lessons', this.lesson.id, this.pct);
        if (!this.current || this.current.lesson !== this.lesson.id) this.current = ALL_LESSONS.find((l) => l.lesson === this.lesson.id) || null;
        this.mode = 'result';
        this.render();
      } else this.showTarget();
    },
    frame(s) {
      if (this.mode === 'rhythm') { this.rhFrame(s); return; }
      if (this.mode !== 'play') return;
      const h = $('#ntHeard', this.el);
      if (h) h.textContent = s.stableMidi != null ? C.noteName(s.stableMidi).fr : s.voiced ? '…' : '—';
      if (s.now < this.lock) return;
      const t = this.targets[this.i], target = C.STRINGS[t.string].midi + t.fret;
      if (!fresh(s, this.consumed) || s.stableMidi == null) return;
      const box = $('#ntTarget', this.el);
      if (s.stableMidi === target) {
        this.consumed = s.onsetSeq; this.right++;
        box.className = 'target hit';
        this.lock = s.now + 0.45;
        $('#ntProg', this.el).style.width = ((this.i + 1) / this.targets.length) * 100 + '%';
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.next(), 380);
      } else if (s.now - s.lastOnset > 0.15) {
        this.consumed = s.onsetSeq; this.wrong++;
        box.className = 'target miss';
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { if (box.isConnected) box.className = 'target'; }, 450);
      }
    },
  };

  /* ================= Accords ================= */
  const Chords = {
    multi: false, sel: ['Em'], idx: 0,
    mount(el) {
      this.el = el;
      this.ema = new Float32Array(12);
      this.render();
      this.sub = (s) => this.frame(s);
      Engine.subs.add(this.sub);
    },
    unmount() { Engine.subs.delete(this.sub); },
    target() { return C.CHORDS.find((c) => c.id === this.sel[this.idx % this.sel.length]); },
    render() {
      const el = this.el;
      el.innerHTML = micNotice() +
        (this.goal ? '<div class="goal" id="chGoal"><span>Leçon : ' + esc(this.goal.title) + '</span><b id="chGoalN">' + this.goal.n + ' / ' + this.goal.count + '</b></div>' : '') +
        '<div><div class="eyebrow">Accords de base</div><h1 style="font-size:32px">Apprendre les accords</h1></div>' +
        '<div class="chord-chips">' + C.CHORDS.map((c) => '<button type="button" data-id="' + c.id + '" aria-pressed="' + this.sel.includes(c.id) + '">' + c.id + '</button>').join('') + '</div>' +
        '<label class="switch"><input type="checkbox" id="chMulti"' + (this.multi ? ' checked' : '') + '> Enchaîner plusieurs accords</label>' +
        '<div class="chord-stage" id="chStage"></div>' +
        '<div class="meter" id="chMeter"><i></i></div>' +
        '<div class="verdict" id="chVerdict">Gratte toutes les cordes qui sonnent</div>' +
        '<div class="seq" id="chSeq"' + (this.sel.length > 1 ? '' : ' hidden') + '></div>' +
        '<p class="tip">Les chiffres sont les doigts de la main gauche : 1 index, 2 majeur, 3 annulaire, 4 auriculaire.</p>';
      el.querySelectorAll('.chord-chips button').forEach((b) => b.addEventListener('click', () => this.pick(b.dataset.id)));
      $('#chMulti', el).addEventListener('change', (e) => {
        this.multi = e.target.checked; this.goal = null;
        if (!this.multi) this.sel = [this.target().id];
        else if (this.sel.length === 1) this.sel = this.sel[0] === 'Em' ? ['Em', 'Am'] : [this.sel[0], 'Em'];
        this.resetSeq(); this.render();
      });
      this.showChord();
    },
    preset(l) {
      this.multi = l.set.length > 1; this.sel = l.set.slice();
      this.goal = { id: l.id, title: l.title, count: l.count, n: 0 };
      this.resetSeq(); this.render();
    },
    goalTick() {
      const g = this.goal; if (!g) return;
      g.n++;
      const n = $('#chGoalN', this.el); if (n) n.textContent = g.n + ' / ' + g.count;
      if (g.n >= g.count) {
        Store.saveBest('chords', g.id, 100);
        this.goal = null;
        const box = $('#chGoal', this.el);
        if (box) box.innerHTML = '<span>Leçon validée !</span><button class="chip" type="button" data-act="course">Retour au cours</button>';
      }
    },
    pick(id) {
      this.goal = null;
      if (!this.multi) this.sel = [id];
      else if (this.sel.includes(id)) { if (this.sel.length > 2) this.sel = this.sel.filter((x) => x !== id); }
      else this.sel = this.sel.concat(id);
      this.resetSeq(); this.render();
    },
    resetSeq() { this.idx = 0; this.done = 0; this.t0 = 0; this.okSince = 0; this.lockUntil = 0; this.success = false; },
    showChord() {
      const ch = this.target();
      const parts = [];
      ch.frets.forEach((f, st) => {
        if (f > 0) parts.push('<li><span class="f">' + ch.fingers[st] + '</span>' + FINGER[ch.fingers[st]] + ' · corde ' + C.STRINGS[st].num + ', case ' + f + '</li>');
      });
      const muted = ch.frets.map((f, st) => (f < 0 ? C.STRINGS[st].num : null)).filter((x) => x);
      if (muted.length) parts.push('<li><span class="f" style="background:var(--bad)">×</span>ne joue pas la corde ' + muted.join(' ni la ') + '</li>');
      $('#chStage', this.el).innerHTML = chordDiagram(ch) +
        '<div><div class="chord-title">' + esc(ch.fr) + '<small>' + ch.id + '</small></div><ul class="fingers">' + parts.join('') + '</ul>' +
        (this.sel.length > 1 ? '<p class="next-chord">Ensuite : ' + esc(C.CHORDS.find((c) => c.id === this.sel[(this.idx + 1) % this.sel.length]).fr) + '</p>' : '') + '</div>';
      this.updateSeq();
    },
    updateSeq() {
      const q = $('#chSeq', this.el); if (!q || this.sel.length < 2) return;
      const mins = this.t0 ? (Engine.s.now - this.t0) / 60 : 0;
      const rate = mins > 0.05 ? Math.round(this.done / mins) : 0;
      q.innerHTML = '<span>Changements réussis : <b>' + this.done + '</b></span><span><b>' + rate + '</b> par minute</span>';
    },
    frame(s) {
      const meter = $('#chMeter', this.el), v = $('#chVerdict', this.el);
      if (!meter) return;
      const ch = this.target();
      if (s.rms > s.gate) {
        const c = Engine.chroma();
        let mx = 0; for (let i = 0; i < 12; i++) mx = Math.max(mx, c[i]);
        if (mx > 0) for (let i = 0; i < 12; i++) this.ema[i] = this.ema[i] * 0.6 + (c[i] / mx) * 0.4;
      } else for (let i = 0; i < 12; i++) this.ema[i] *= 0.9;

      const ranked = C.classifyChord(this.ema);
      const score = C.cosine(this.ema, ch.template);
      const loud = s.rms > s.gate * 1.5;
      meter.querySelector('i').style.width = (loud ? Math.max(0, Math.min(1, (score - 0.5) / 0.45)) * 100 : 0) + '%';
      if (s.now < (this.lockUntil || 0)) return;
      const good = loud && ranked[0].id === ch.id && score >= 0.8;
      if (ranked[0].id !== this.otherId) { this.otherId = ranked[0].id; this.otherSince = s.now; }
      meter.classList.toggle('ok', good);
      if (good) {
        if (!this.okSince) this.okSince = s.now;
        if (s.now - this.okSince > 0.3 && !this.success) {
          this.success = true;
          if (this.sel.length > 1) {
            if (!this.t0) this.t0 = s.now;
            this.done++;
            this.goalTick();
            this.idx = (this.idx + 1) % this.sel.length;
            this.lockUntil = s.now + 0.5;
            this.okSince = 0; this.success = false;
            v.textContent = 'Bien ! Change d’accord'; v.className = 'verdict ok';
            this.showChord();
            return;
          }
          v.textContent = this.goal ? 'Bien joué ! Arrête le son, puis rejoue-le' : 'Bien joué, l’accord sonne !'; v.className = 'verdict ok';
          this.goalTick();
        }
      } else {
        this.okSince = 0;
        if (!loud) {
          if (this.success && s.now - s.lastOnset > 1.2) this.success = false;
          if (!this.success) { v.textContent = 'Gratte toutes les cordes qui sonnent'; v.className = 'verdict'; }
        } else if (!this.success) {
          if (ranked[0].id !== ch.id && ranked[0].score >= 0.8 && ranked[0].id === this.otherId && s.now - this.otherSince > 0.6) {
            v.textContent = 'On dirait plutôt ' + C.CHORDS.find((c) => c.id === ranked[0].id).fr;
          } else v.textContent = 'Presque : vérifie que chaque corde sonne bien';
          v.className = 'verdict warn';
        }
      }
      if (this.sel.length > 1) this.updateSeq();
    },
  };

  /* ================= Musique de fond (YouTube) ================= */
  const Tracks = {
    get(id) { const o = Store.read(); return (o.tracks && o.tracks[id]) || null; },
    set(id, t) {
      const o = Store.read(); o.tracks = o.tracks || {};
      if (t) o.tracks[id] = t; else delete o.tracks[id];
      Store.write(o);
    },
  };
  function ytId(u) {
    u = String(u || '').trim();
    if (/^[\w-]{11}$/.test(u)) return u;
    const m = /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/.exec(u);
    return m ? m[1] : null;
  }
  function loadYT() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (!loadYT.p) {
      loadYT.p = new Promise((res, rej) => {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => { if (prev) prev(); res(); };
        const sc = document.createElement('script');
        sc.src = 'https://www.youtube.com/iframe_api';
        sc.onerror = () => { loadYT.p = null; rej(new Error('yt')); };
        document.head.appendChild(sc);
      });
    }
    return loadYT.p;
  }
  const YT_ERR = {
    2: 'Ce lien ne correspond à aucune vidéo.',
    5: 'Cette vidéo ne peut pas être lue ici.',
    100: 'Vidéo introuvable ou privée.',
    101: 'Le propriétaire de cette vidéo interdit sa lecture hors de YouTube. Essaie une autre version (cover, live, karaoké…).',
    150: 'Le propriétaire de cette vidéo interdit sa lecture hors de YouTube. Essaie une autre version (cover, live, karaoké…).',
  };

  /* ================= Morceaux ================= */
  const Songs = {
    mode: 'list', speed: 0.75, wait: true, playing: false,
    mount(el) {
      this.el = el;
      const sp = Store.pref('speed'); if (sp) this.speed = sp;
      const w = Store.pref('wait'); if (w !== undefined) this.wait = w;
      this.render();
      this.onResize = () => this.sizeCanvas();
      window.addEventListener('resize', this.onResize);
    },
    unmount() {
      this.stop();
      this.destroyPlayer();
      window.removeEventListener('resize', this.onResize);
      if (this.mode === 'play') this.mode = 'list';
    },
    render() {
      const el = this.el;
      this.stop();
      this.destroyPlayer();
      const back = '<button class="back" type="button" aria-label="Retour"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>';
      if (this.mode === 'list') {
        el.innerHTML = micNotice() +
          '<div><div class="eyebrow">Mélodies</div><h1 style="font-size:32px">Jouer des morceaux</h1></div>' +
          '<p class="lead">Les notes défilent vers la ligne dorée. Joue chaque note quand elle l’atteint. Le chiffre indique la case, la couleur la corde.</p>' +
          '<div class="list">' + Library.all().map((sg) => {
            const b = Store.best('songs', sg.id);
            return '<button class="item" type="button" data-id="' + sg.id + '"><h3>' + esc(sg.title) + '</h3><p>' + esc(sg.origin) + ' · ' + sg.notes.length + ' notes</p>' +
              '<span class="side">' + starsHtml(starsOf(b)) + '<span class="lvl">' + (sg.imported ? 'importé' : 'niveau ' + sg.level) + '</span></span></button>';
          }).join('') + '</div>';
        el.querySelectorAll('.item').forEach((b) => b.addEventListener('click', () => this.open(Library.all().find((x) => x.id === b.dataset.id))));
      } else if (this.mode === 'play') {
        el.innerHTML = micNotice() +
          '<div class="bar-head">' + back + '<h2>' + esc(this.song.title) + '</h2><span class="count" id="sgScore"></span></div>' +
          '<div class="hw-wrap"><canvas id="hw"></canvas></div>' +
          (this.track ? '<div class="yt-wrap"><div id="ytPlayer"></div></div>' : '') +
          '<div class="now"><div class="nm" id="sgName"></div><div class="ps" id="sgPos"></div><div class="heard" style="margin-left:auto">Entendu : <b id="sgHeard">—</b></div></div>' +
          '<div class="board-wrap" id="sgBoard"></div>' +
          '<div class="ctrl"><div class="row" style="flex:1"><button class="btn primary" id="sgPlay" type="button">Jouer</button><button class="btn ghost" id="sgRestart" type="button">Recommencer</button></div></div>' +
          '<div class="ctrl"><div class="seg" role="group" aria-label="Vitesse">' + [0.5, 0.75, 1].map((v) =>
            '<button type="button" data-sp="' + v + '" aria-pressed="' + (v === this.speed) + '">' + Math.round(v * 100) + ' %</button>').join('') + '</div>' +
          '<label class="switch"><input type="checkbox" id="sgWait"' + (this.waitOn() ? ' checked' : '') + (this.track ? ' disabled' : '') + '> Attendre ma note</label></div>' +
          this.bgHtml();
        $('.back', el).addEventListener('click', () => { this.mode = 'list'; this.render(); });
        $('#sgPlay', el).addEventListener('click', () => (this.playing ? this.pause() : this.play()));
        $('#sgRestart', el).addEventListener('click', () => { this.reset(); this.play(); });
        el.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
          this.speed = +b.dataset.sp; Store.pref('speed', this.speed);
          if (this.vid()) { try { this.yt.setPlaybackRate(this.speed); } catch (e) { /* ignoré */ } }
          el.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        }));
        $('#sgWait', el).addEventListener('change', (e) => { this.wait = e.target.checked; Store.pref('wait', this.wait); });
        this.bindBg();
        this.canvas = $('#hw', el);
        this.sizeCanvas();
        this.updatePanel(true);
        this.loop();
      } else {
        const pct = this.pct;
        el.innerHTML = '<div class="bar-head">' + back + '<h2>' + esc(this.song.title) + '</h2></div>' +
          '<div class="result"><div class="eyebrow">' + (this.wasWait ? 'Notes justes du premier coup' : 'Notes jouées en rythme') + '</div><div class="pct">' + pct + ' %</div>' + starsHtml(starsOf(pct)) +
          '<p>' + (this.wasWait ? this.hits + ' notes, ' + this.wrongs + ' fausse' + (this.wrongs > 1 ? 's' : '') + ' note' + (this.wrongs > 1 ? 's' : '') + '.' : this.hits + ' sur ' + this.notes.length + ' notes réussies.') + '</p>' +
          (this.wasWait && pct >= 80 ? '<p>Prêt pour la suite : décoche « Attendre ma note » pour jouer en rythme.</p>' : '') + '</div>' +
          '<div class="row"><button class="btn primary" id="sgAgain" type="button">Rejouer</button><button class="btn" id="sgList" type="button">Autres morceaux</button></div>';
        $('.back', el).addEventListener('click', () => { this.mode = 'list'; this.render(); });
        $('#sgList', el).addEventListener('click', () => { this.mode = 'list'; this.render(); });
        $('#sgAgain', el).addEventListener('click', () => { this.mode = 'play'; this.reset(); this.render(); });
      }
    },
    open(song) { this.song = song; this.track = Tracks.get(song.id); this.mode = 'play'; this.reset(); this.render(); },
    bpm() { return this.track ? this.track.bpm : this.song.bpm; },
    waitOn() { return this.wait && !this.track; },
    vid() { return !!(this.track && this.ytReady && this.yt); },
    ytMsg(t) { const m = $('#ytMsg', this.el); if (m) { m.textContent = t || ''; m.className = 'tb-msg' + (t ? ' bad' : ''); } },
    destroyPlayer() {
      if (this.yt) { try { this.yt.destroy(); } catch (e) { /* déjà détruit */ } }
      this.yt = null; this.ytReady = false;
    },
    mountPlayer() {
      this.ytReady = false; this.mt = 0; this.lastRep = -1;
      const id = this.track.vid;
      loadYT().then(() => {
        if (this.mode !== 'play' || !$('#ytPlayer', this.el)) return;
        this.yt = new window.YT.Player('ytPlayer', {
          videoId: id, width: '100%', height: '100%',
          playerVars: { playsinline: 1, rel: 0 },
          events: {
            onReady: () => { this.ytReady = true; try { this.yt.setPlaybackRate(this.speed); } catch (e) { /* ignoré */ } },
            onError: (e) => this.ytMsg(YT_ERR[e.data] || 'Lecture impossible (erreur ' + e.data + ').'),
            onStateChange: (e) => { if (e.data === 0 && this.mode === 'play' && this.started) this.finish(); },
          },
        });
      }).catch(() => this.ytMsg('YouTube ne répond pas. Vérifie ta connexion internet.'));
    },
    bgHtml() {
      const head = '<h2 style="font-size:22px">Musique de fond</h2>';
      if (!this.track) {
        const q = encodeURIComponent(this.song.title);
        return '<div class="notice bg">' + head +
          '<p>Joue par-dessus un enregistrement trouvé sur YouTube. Mets des écouteurs, sinon le micro entend aussi la musique.</p>' +
          '<a class="btn ghost" href="https://www.youtube.com/results?search_query=' + q + '" target="_blank" rel="noopener">Chercher sur YouTube</a>' +
          '<input class="field" id="ytUrl" type="url" inputmode="url" placeholder="Colle ici le lien de la vidéo" autocomplete="off">' +
          '<p class="tb-msg" id="ytMsg"></p>' +
          '<button class="btn" id="ytSet" type="button">Utiliser cette vidéo</button></div>';
      }
      const t = this.track;
      return '<div class="notice bg">' + head +
        '<p class="tb-msg" id="ytMsg"></p>' +
        '<div class="sync"><label for="ytStart">Moment de la première note</label>' +
        '<div class="sync-row"><input class="field" id="ytStart" type="number" step="0.1" min="0" value="' + t.start + '"><span>s</span><button class="btn" id="ytMark" type="button">Marquer maintenant</button></div>' +
        '<label for="ytBpm">Tempo de l’enregistrement</label>' +
        '<div class="sync-row"><input class="field" id="ytBpm" type="number" min="30" max="240" value="' + t.bpm + '"><span>BPM</span><button class="btn" id="ytTap" type="button">Taper le tempo</button></div></div>' +
        '<p class="tip" style="text-align:left">Pour caler la musique : lance la vidéo, touche « Marquer maintenant » pile sur la première note de la mélodie, puis touche « Taper le tempo » au moins 4 fois en suivant le rythme. Ensuite « Recommencer ».</p>' +
        '<button class="btn ghost" id="ytDel" type="button">Retirer la musique</button></div>';
    },
    bindBg() {
      const el = this.el, sid = this.song.id;
      if (!this.track) {
        $('#ytSet', el).addEventListener('click', () => {
          const id = ytId($('#ytUrl', el).value);
          if (!id) { this.ytMsg('Lien non reconnu. Copie l’adresse de la vidéo (bouton Partager, puis Copier le lien).'); return; }
          this.track = { vid: id, start: 0, bpm: this.song.bpm };
          Tracks.set(sid, this.track);
          this.reset(); this.render();
        });
        return;
      }
      const save = () => Tracks.set(sid, this.track);
      $('#ytStart', el).addEventListener('change', (e) => { this.track.start = Math.max(0, +e.target.value || 0); save(); });
      $('#ytBpm', el).addEventListener('change', (e) => { this.track.bpm = Math.max(30, Math.min(240, +e.target.value || this.song.bpm)); save(); });
      $('#ytMark', el).addEventListener('click', () => {
        if (!this.vid()) { this.ytMsg('La vidéo charge encore.'); return; }
        this.track.start = Math.max(0, Math.round((this.yt.getCurrentTime() - 0.08) * 10) / 10);
        $('#ytStart', el).value = this.track.start; save();
      });
      $('#ytTap', el).addEventListener('click', (e) => {
        const now = performance.now();
        if (!this.taps || now - this.taps[this.taps.length - 1] > 2000) this.taps = [];
        this.taps.push(now);
        if (this.taps.length < 4) { e.target.textContent = 'Encore ' + (4 - this.taps.length) + '…'; return; }
        const iv = this.taps.slice(1).map((t, i) => t - this.taps[i]).sort((a, b) => a - b);
        this.track.bpm = Math.round(60000 / iv[iv.length >> 1]);
        $('#ytBpm', el).value = this.track.bpm; save();
        e.target.textContent = 'Taper (' + this.track.bpm + ')';
      });
      $('#ytDel', el).addEventListener('click', () => { Tracks.set(sid, null); this.track = null; this.reset(); this.render(); });
      this.mountPlayer();
    },
    reset() {
      this.notes = this.song.notes.map((n) => Object.assign({}, n, { status: 'pending', flash: -10 }));
      this.beat = -4; this.ci = 0; this.hits = 0; this.wrongs = 0; this.playing = false; this.waiting = false;
      this.counted = false; this.lastPanel = -1; this.started = false;
      if (this.vid()) { try { this.yt.pauseVideo(); } catch (e) { /* ignoré */ } }
      const b = $('#sgPlay', this.el); if (b) b.textContent = 'Jouer';
      this.updatePanel(true);
    },
    play() {
      if (!Engine.running) { startMic().then(() => { if (Engine.running) this.play(); }); return; }
      const ctx = Out.ctx();
      if (this.track) {
        if (!this.vid()) { this.ytMsg('La vidéo charge encore, réessaie dans un instant.'); return; }
        if (!this.started) {
          const to = Math.max(0, this.track.start - (4 * 60) / this.bpm());
          this.yt.seekTo(to, true); this.mt = to; this.started = true;
        }
        try { this.yt.setPlaybackRate(this.speed); } catch (e) { /* ignoré */ }
        this.yt.playVideo();
        this.playing = true; this.wasWait = false;
        this.lastT = performance.now();
        this.consumed = Engine.s.onsetSeq;
        $('#sgPlay', this.el).textContent = 'Pause';
        return;
      }
      if (this.beat <= -4 + 1e-6 && !this.counted) {
        const spb = 60 / (this.bpm() * this.speed);
        for (let k = 0; k < 4; k++) Out.click(ctx.currentTime + 0.05 + k * spb, k === 0);
        this.counted = true;
        this.beat = -4 - 0.05 / spb;
      }
      this.playing = true; this.wasWait = this.waitOn();
      this.lastT = performance.now();
      this.consumed = Engine.s.onsetSeq;
      $('#sgPlay', this.el).textContent = 'Pause';
    },
    pause() {
      this.playing = false;
      if (this.vid()) { try { this.yt.pauseVideo(); } catch (e) { /* ignoré */ } }
      const b = $('#sgPlay', this.el); if (b) b.textContent = 'Reprendre';
    },
    stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.playing = false; },
    loop() {
      const step = (t) => {
        if (this.mode !== 'play') return;
        const dt = Math.min(0.1, (t - this.lastT) / 1000); this.lastT = t;
        if (this.vid()) this.syncVideo(dt);
        if (this.playing) this.advance(dt);
        this.draw();
        this.raf = requestAnimationFrame(step);
      };
      this.lastT = performance.now();
      this.raf = requestAnimationFrame(step);
    },
    syncVideo(dt) {
      let st, rep, rate;
      try { st = this.yt.getPlayerState(); rep = this.yt.getCurrentTime() || 0; rate = this.yt.getPlaybackRate() || 1; } catch (e) { return; }
      const on = st === 1;
      if (on) {
        this.mt += dt * rate;
        if (rep !== this.lastRep) { if (Math.abs(rep - this.mt) > 0.25) this.mt = rep; else this.mt += (rep - this.mt) * 0.3; }
      } else this.mt = rep;
      this.lastRep = rep;
      if (on !== this.playing && (st === 1 || st === 2)) {
        this.playing = on;
        if (on) { this.started = true; this.wasWait = false; this.consumed = Engine.s.onsetSeq; }
        const b = $('#sgPlay', this.el); if (b) b.textContent = on ? 'Pause' : 'Reprendre';
      }
      if (!this.started) return;
      this.beat = ((this.mt - this.track.start) * this.bpm()) / 60;
      // retour en arrière dans la vidéo : on rejoue les notes concernées
      if (this.ci > 0 && this.beat < this.notes[this.ci - 1].start - 1) {
        let k = this.notes.findIndex((n) => n.start >= this.beat - 0.3);
        if (k < 0) k = this.notes.length;
        for (let i = k; i < this.notes.length; i++) this.notes[i].status = 'pending';
        this.ci = k;
        this.hits = this.notes.filter((n) => n.status === 'hit').length;
      }
    },
    advance(dt) {
      const s = Engine.s, v = this.vid();
      const bps = (this.bpm() * (v ? (this.yt.getPlaybackRate() || 1) : this.speed)) / 60;
      const cur = this.notes[this.ci];
      this.waiting = false;
      if (!v) {
        let nb = this.beat + dt * bps;
        if (this.waitOn() && cur && nb >= cur.start) { nb = cur.start; this.waiting = true; }
        this.beat = nb;
      }
      if (cur) {
        const win = 0.28 * bps;
        const canHit = this.waitOn() ? this.beat >= cur.start - 1 : Math.abs(this.beat - cur.start) <= win;
        const same = s.stableMidi != null && (s.stableMidi - cur.midi) % 12 === 0;
        if (canHit && fresh(s, this.consumed) && same) {
          cur.status = 'hit'; this.hits++; this.consumed = s.onsetSeq; this.ci++;
        } else if (this.waitOn() && canHit && fresh(s, this.consumed) && !same && s.stableMidi != null && s.now - s.lastOnset > 0.15) {
          this.wrongs++; this.consumed = s.onsetSeq; cur.flash = s.now;
        } else if (!this.waitOn() && this.beat > cur.start + win) {
          cur.status = 'miss'; this.ci++;
        }
      }
      if (this.ci !== this.lastPanel) this.updatePanel();
      if (this.ci >= this.notes.length && this.beat > this.song.length + 0.5) this.finish();
    },
    finish() {
      if (this.vid()) { try { this.yt.pauseVideo(); } catch (e) { /* ignoré */ } }
      this.stop();
      this.pct = this.wasWait
        ? Math.round((this.hits / Math.max(1, this.hits + this.wrongs)) * 100)
        : Math.round((this.hits / this.notes.length) * 100);
      Store.saveBest('songs', this.song.id, this.pct);
      this.mode = 'result';
      this.render();
    },
    updatePanel(force) {
      if (!this.el || this.mode !== 'play') return;
      this.lastPanel = this.ci;
      const sc = $('#sgScore', this.el);
      if (sc) sc.textContent = this.hits + ' / ' + this.notes.length;
      const n = this.notes[Math.min(this.ci, this.notes.length - 1)];
      const nm = $('#sgName', this.el); if (!nm) return;
      const st = C.STRINGS[n.string];
      nm.textContent = C.noteName(n.midi).fr;
      nm.style.color = st.color;
      $('#sgPos', this.el).innerHTML = 'Corde ' + st.num + ' (' + st.name + ')<br>' + (n.fret === 0 ? 'à vide' : 'case ' + n.fret);
      const maxF = Math.max.apply(null, this.notes.map((x) => x.fret));
      $('#sgBoard', this.el).innerHTML = fretboard([n], Math.min(12, Math.max(5, maxF)));
    },
    sizeCanvas() {
      const c = this.canvas; if (!c || !c.isConnected) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      c.width = Math.round(c.clientWidth * dpr); c.height = Math.round(c.clientHeight * dpr);
      this.dpr = dpr;
    },
    draw() {
      const c = this.canvas; if (!c || !c.isConnected) return;
      if (!c.width) this.sizeCanvas();
      const hd = $('#sgHeard', this.el), es = Engine.s;
      if (hd) hd.textContent = !Engine.running ? '—' : es.stableMidi != null ? C.noteName(es.stableMidi).fr : es.voiced ? '…' : '—';
      const g = c.getContext('2d'), dpr = this.dpr || 1;
      const W = c.width / dpr, H = c.height / dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#261a15'; g.fillRect(0, 0, W, H);
      const top = 30, bottom = H - 34, gap = (bottom - top) / 5, hitX = 72, ppb = Math.max(70, Math.min(110, W / 5));
      const laneY = (st) => top + (5 - st) * gap;
      // grille des temps
      const b0 = Math.max(0, Math.floor(this.beat - hitX / ppb)), b1 = this.beat + (W - hitX) / ppb + 1;
      for (let b = b0; b <= b1; b++) {
        const x = hitX + (b - this.beat) * ppb;
        g.strokeStyle = b % 4 === 0 ? '#4b362c' : '#33241d'; g.lineWidth = b % 4 === 0 ? 2 : 1;
        g.beginPath(); g.moveTo(x, top - 14); g.lineTo(x, bottom + 14); g.stroke();
      }
      // cordes
      g.font = '700 15px "Barlow Condensed", sans-serif'; g.textBaseline = 'middle';
      for (let st = 0; st < 6; st++) {
        const y = laneY(st), col = C.STRINGS[st].color;
        g.globalAlpha = 0.5; g.strokeStyle = col; g.lineWidth = 2.6 - st * 0.33;
        g.beginPath(); g.moveTo(28, y); g.lineTo(W, y); g.stroke();
        g.globalAlpha = 1; g.fillStyle = col; g.textAlign = 'left'; g.fillText(C.STRINGS[st].short, 10, y);
      }
      // ligne de frappe
      g.fillStyle = '#e3ad4f'; g.fillRect(hitX - 2, top - 16, 4, bottom - top + 32);
      // notes
      const now = Engine.s.now;
      g.textAlign = 'center';
      for (let i = 0; i < this.notes.length; i++) {
        const n = this.notes[i];
        const x = hitX + (n.start - this.beat) * ppb;
        if (x > W + 30) break;
        const w = Math.max(0, n.dur * ppb - 10);
        if (x + w < -20) continue;
        const y = laneY(n.string);
        const col = n.status === 'hit' ? '#79d39b' : n.status === 'miss' ? '#6b5a50' : C.STRINGS[n.string].color;
        g.globalAlpha = 0.3; g.fillStyle = col;
        roundRect(g, x, y - 8, w, 16, 8); g.fill();
        g.globalAlpha = 1;
        g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1a120f'; g.font = '700 16px "Barlow Condensed", sans-serif';
        g.fillText(String(n.fret), x, y + 1);
        if (i === this.ci) {
          const bad = now - n.flash < 0.4;
          g.strokeStyle = bad ? '#f0786a' : '#f4eadf'; g.lineWidth = 2.5;
          g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.stroke();
        }
      }
      g.fillStyle = '#261a15'; g.fillRect(0, top - 18, 28, bottom - top + 36);
      g.font = '700 15px "Barlow Condensed", sans-serif'; g.textAlign = 'left';
      for (let st = 0; st < 6; st++) { g.fillStyle = C.STRINGS[st].color; g.fillText(C.STRINGS[st].short, 10, laneY(st)); }
      // messages
      g.font = '600 16px "Barlow", sans-serif'; g.fillStyle = '#f4eadf'; g.textAlign = 'center';
      if (this.beat < 0 && this.beat > -4 && this.playing) {
        g.font = '700 64px "Barlow Condensed", sans-serif'; g.globalAlpha = 0.9;
        g.fillText(String(Math.ceil(-this.beat)), W / 2, H / 2); g.globalAlpha = 1;
      } else if (!this.playing && !this.started && this.track) {
        g.fillText('Appuie sur « Jouer » : la musique démarre', W / 2 + 20, H - 14);
      } else if (!this.playing && this.beat <= -4 + 0.2) {
        g.fillText('Appuie sur « Jouer » : 4 clics, puis c’est parti', W / 2 + 20, H - 14);
      } else if (this.waiting) {
        g.fillStyle = '#e3ad4f'; g.fillText('À toi : joue la note entourée', W / 2 + 20, H - 14);
      }
    },
  };
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    if (w < 2 * r) { g.rect(x, y, Math.max(0, w), h); return; }
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden && Songs.playing) Songs.pause(); });

  /* ================= Chercher / importer ================= */
  const EXAMPLE_TAB = [
    'e|-0-0-1-3-|-3-1-0---|-------0-|-0-------|',
    'B|---------|-------3-|-1-1-3---|---3-3---|',
    'G|---------|---------|---------|---------|',
    'D|---------|---------|---------|---------|',
    'A|---------|---------|---------|---------|',
    'E|---------|---------|---------|---------|',
  ].join('\n');
  const Search = {
    q: '',
    mount(el) { this.el = el; this.render(); },
    unmount() {},
    render() {
      const el = this.el;
      el.innerHTML =
        '<div><div class="eyebrow">Bibliothèque</div><h1 style="font-size:32px">Chercher un morceau</h1></div>' +
        '<input class="field" id="srQ" type="search" placeholder="Titre du morceau…" autocomplete="off" value="' + esc(this.q) + '">' +
        '<div class="list" id="srRes"></div>' +
        '<div class="notice" style="gap:12px">' +
          '<h2 style="font-size:24px">Importer une tablature</h2>' +
          '<p>Le morceau que tu veux n\u2019est pas dans la liste ? Copie sa tablature (sur un site de tablatures, dans un livre…) et colle-la ici : Frette en fait un morceau qui défile.</p>' +
          '<input class="field" id="tbTitle" type="text" placeholder="Titre" maxlength="60">' +
          '<textarea class="field mono" id="tbText" rows="8" spellcheck="false" placeholder="' + esc(EXAMPLE_TAB) + '"></textarea>' +
          '<label class="switch" style="justify-content:space-between">Tempo de départ <span><input class="field" id="tbBpm" type="number" min="40" max="200" value="80" style="width:84px;display:inline-block"> BPM</span></label>' +
          '<p id="tbMsg" class="tb-msg"></p>' +
          '<div class="row"><button class="btn ghost" id="tbEx" type="button">Coller l\u2019exemple</button><button class="btn primary" id="tbGo" type="button">Créer le morceau</button></div>' +
          '<p class="tip" style="text-align:left">Seule la mélodie est gardée : quand plusieurs notes sont jouées ensemble (accord), Frette retient la plus aiguë. Les durées sont estimées d\u2019après l\u2019espacement des chiffres.</p>' +
        '</div>';
      const q = $('#srQ', el);
      q.addEventListener('input', () => { this.q = q.value; this.results(); });
      $('#tbEx', el).addEventListener('click', () => { $('#tbText', el).value = EXAMPLE_TAB; if (!$('#tbTitle', el).value) $('#tbTitle', el).value = 'Ode à la joie (tablature)'; this.preview(); });
      $('#tbText', el).addEventListener('input', () => this.preview());
      $('#tbGo', el).addEventListener('click', () => this.create());
      this.results();
    },
    results() {
      const box = $('#srRes', this.el);
      const q = fold(this.q.trim());
      const list = Library.all().filter((sg) => !q || fold(sg.title + ' ' + sg.origin).includes(q));
      if (!list.length) {
        box.innerHTML = '<p class="lead">Aucun morceau ne correspond à « ' + esc(this.q) + ' ». Tu peux importer sa tablature juste en dessous.</p>';
        return;
      }
      box.innerHTML = list.map((sg) =>
        '<div class="item" data-id="' + sg.id + '" role="button" tabindex="0"><h3>' + esc(sg.title) + '</h3><p>' + esc(sg.origin) + ' · ' + sg.notes.length + ' notes</p>' +
        '<span class="side">' + (sg.imported ? '<button class="chip del" type="button" data-del="' + sg.id + '">Supprimer</button>' : '<span class="lvl">niveau ' + sg.level + '</span>') + '</span></div>').join('');
      box.querySelectorAll('.item').forEach((it) => {
        const go = (e) => { if (e.target.closest('[data-del]')) return; openSong(it.dataset.id); };
        it.addEventListener('click', go);
        it.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e); });
      });
      box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.armed) { Library.remove(b.dataset.del); this.results(); return; }
        b.dataset.armed = '1'; b.textContent = 'Confirmer ?';
        setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Supprimer'; } }, 3000);
      }));
    },
    preview() {
      const msg = $('#tbMsg', this.el), txt = $('#tbText', this.el).value;
      if (!txt.trim()) { msg.textContent = ''; msg.className = 'tb-msg'; return null; }
      const r = C.parseTab(txt);
      if (r.error) { msg.textContent = r.error; msg.className = 'tb-msg bad'; return null; }
      const frets = r.notes.map((n) => n.fret);
      msg.textContent = r.notes.length + ' notes reconnues, cases ' + Math.min.apply(null, frets) + ' à ' + Math.max.apply(null, frets) + (r.chords ? ' · ' + r.chords + ' notes d\u2019accord ignorées' : '') + '.';
      msg.className = 'tb-msg ok';
      return r;
    },
    create() {
      const r = this.preview();
      const msg = $('#tbMsg', this.el);
      if (!r) { if (!msg.textContent) { msg.textContent = 'Colle d\u2019abord une tablature.'; msg.className = 'tb-msg bad'; } return; }
      const title = $('#tbTitle', this.el).value.trim() || 'Morceau importé';
      const bpm = Math.max(40, Math.min(200, +$('#tbBpm', this.el).value || 80));
      const id = Library.add(title, bpm, r.notes);
      openSong(id);
    },
  };
  function openSong(id) {
    const sg = Library.all().find((x) => x.id === id);
    if (!sg) return;
    show('songs');
    Songs.open(sg);
  }

  /* ================= Navigation ================= */
  const VIEWS = { tuner: Tuner, notes: Notes, chords: Chords, songs: Songs, search: Search };
  let current = null;
  function show(name) {
    if (!VIEWS[name]) name = 'tuner';
    if (current) { VIEWS[current].unmount(); $('#view-' + current).hidden = true; }
    current = name;
    const el = $('#view-' + name);
    el.hidden = false;
    VIEWS[name].mount(el);
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $('#main').scrollTop = 0;
    Store.pref('tab', name);
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  show(Store.pref('tab') || 'tuner');
  updateMicUI();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible */ });
  }
})();
