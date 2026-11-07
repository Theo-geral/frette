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
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = strong ? 2600 : 2000; // au-dessus de la plage détectée : pas de fausse note
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(strong ? 0.5 : 0.3, when + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      o.connect(g).connect(c.destination);
      o.start(when); o.stop(when + 0.06);
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
      const r = C.rms(this.buf, this.buf.length - 1024);
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
      s += '<text x="' + x + '" y="' + (y + 4.5) + '" fill="#1a120f" font-size="13" font-weight="700" text-anchor="middle" font-family="Barlow Condensed, sans-serif">' + (t.fret === 0 ? '0' : t.fret) + '</text>';
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
    syncMode() {
      const auto = this.manual == null;
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

  /* ================= Exercices de notes ================= */
  const Notes = {
    mode: 'list',
    mount(el) {
      this.el = el;
      this.render();
      this.sub = (s) => this.frame(s);
      Engine.subs.add(this.sub);
    },
    unmount() { Engine.subs.delete(this.sub); clearTimeout(this.timer); if (this.mode === 'play') this.mode = 'list'; },
    render() {
      const el = this.el;
      if (this.mode === 'list') {
        el.innerHTML = micNotice() +
          '<div><div class="eyebrow">Première position</div><h1 style="font-size:32px">Apprendre les notes</h1></div>' +
          '<p class="lead">Une note s’affiche, tu la joues, Frette vérifie à l’oreille. Commence par les cordes à vide.</p>' +
          '<div class="list">' + C.LESSONS.map((l) => {
            const b = Store.best('lessons', l.id);
            return '<button class="item" type="button" data-id="' + l.id + '"><h3>' + esc(l.title) + '</h3><p>' + esc(l.desc) + '</p>' +
              '<span class="side">' + starsHtml(starsOf(b)) + '<span class="best">' + (b != null ? 'record ' + b + ' %' : 'à faire') + '</span></span></button>';
          }).join('') + '</div>';
        el.querySelectorAll('.item').forEach((b) => b.addEventListener('click', () => this.start(C.LESSONS.find((l) => l.id === b.dataset.id))));
      } else if (this.mode === 'play') {
        el.innerHTML = micNotice() +
          '<div class="bar-head"><button class="back" type="button" aria-label="Retour"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>' +
          '<h2>' + esc(this.lesson.title) + '</h2><span class="count" id="ntCount"></span></div>' +
          '<div class="progress"><i id="ntProg"></i></div>' +
          '<div class="target" id="ntTarget"><div class="big" id="ntNote"></div><div class="where" id="ntWhere"></div></div>' +
          '<div class="board-wrap" id="ntBoard"></div>' +
          '<div class="heard">Entendu : <b id="ntHeard">—</b></div>' +
          '<p class="tip">Appuie juste derrière la frette avec le bout du doigt, puis pince la corde une fois.</p>' +
          '<div class="row"><button class="btn ghost" id="ntSkip" type="button">Passer cette note</button></div>';
        $('.back', el).addEventListener('click', () => { this.mode = 'list'; this.render(); });
        $('#ntSkip', el).addEventListener('click', () => { this.wrong++; this.next(); });
        this.showTarget();
      } else {
        const pct = this.pct;
        el.innerHTML = '<div class="bar-head"><button class="back" type="button" aria-label="Retour"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button><h2>' + esc(this.lesson.title) + '</h2></div>' +
          '<div class="result"><div class="eyebrow">Précision</div><div class="pct">' + pct + ' %</div>' + starsHtml(starsOf(pct)) +
          '<p>' + this.right + ' notes justes, ' + this.wrong + ' erreur' + (this.wrong > 1 ? 's' : '') + '.</p></div>' +
          '<div class="row"><button class="btn primary" id="ntAgain" type="button">Recommencer</button><button class="btn" id="ntList" type="button">Autres exercices</button></div>';
        $('.back', el).addEventListener('click', () => { this.mode = 'list'; this.render(); });
        $('#ntList', el).addEventListener('click', () => { this.mode = 'list'; this.render(); });
        $('#ntAgain', el).addEventListener('click', () => this.start(this.lesson));
      }
    },
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
      $('#ntCount', this.el).textContent = (this.i + 1) + ' / ' + this.targets.length;
      $('#ntProg', this.el).style.width = (this.i / this.targets.length) * 100 + '%';
    },
    next() {
      this.i++;
      this.consumed = Engine.s.onsetSeq;
      if (this.i >= this.targets.length) {
        this.pct = Math.round((this.right / Math.max(1, this.right + this.wrong)) * 100);
        Store.saveBest('lessons', this.lesson.id, this.pct);
        this.mode = 'result';
        this.render();
      } else this.showTarget();
    },
    frame(s) {
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
        this.multi = e.target.checked;
        if (!this.multi) this.sel = [this.target().id];
        else if (this.sel.length === 1) this.sel = this.sel[0] === 'Em' ? ['Em', 'Am'] : [this.sel[0], 'Em'];
        this.resetSeq(); this.render();
      });
      this.showChord();
    },
    pick(id) {
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
            this.idx = (this.idx + 1) % this.sel.length;
            this.lockUntil = s.now + 0.5;
            this.okSince = 0; this.success = false;
            v.textContent = 'Bien ! Change d’accord'; v.className = 'verdict ok';
            this.showChord();
            return;
          }
          v.textContent = 'Bien joué, l’accord sonne !'; v.className = 'verdict ok';
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
      window.removeEventListener('resize', this.onResize);
      if (this.mode === 'play') this.mode = 'list';
    },
    render() {
      const el = this.el;
      this.stop();
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
          '<div class="now"><div class="nm" id="sgName"></div><div class="ps" id="sgPos"></div><div class="heard" style="margin-left:auto">Entendu : <b id="sgHeard">—</b></div></div>' +
          '<div class="board-wrap" id="sgBoard"></div>' +
          '<div class="ctrl"><div class="row" style="flex:1"><button class="btn primary" id="sgPlay" type="button">Jouer</button><button class="btn ghost" id="sgRestart" type="button">Recommencer</button></div></div>' +
          '<div class="ctrl"><div class="seg" role="group" aria-label="Vitesse">' + [0.5, 0.75, 1].map((v) =>
            '<button type="button" data-sp="' + v + '" aria-pressed="' + (v === this.speed) + '">' + Math.round(v * 100) + ' %</button>').join('') + '</div>' +
          '<label class="switch"><input type="checkbox" id="sgWait"' + (this.wait ? ' checked' : '') + '> Attendre ma note</label></div>';
        $('.back', el).addEventListener('click', () => { this.mode = 'list'; this.render(); });
        $('#sgPlay', el).addEventListener('click', () => (this.playing ? this.pause() : this.play()));
        $('#sgRestart', el).addEventListener('click', () => { this.reset(); this.play(); });
        el.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
          this.speed = +b.dataset.sp; Store.pref('speed', this.speed);
          el.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        }));
        $('#sgWait', el).addEventListener('change', (e) => { this.wait = e.target.checked; Store.pref('wait', this.wait); });
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
    open(song) { this.song = song; this.mode = 'play'; this.reset(); this.render(); },
    reset() {
      this.notes = this.song.notes.map((n) => Object.assign({}, n, { status: 'pending', flash: -10 }));
      this.beat = -4; this.ci = 0; this.hits = 0; this.wrongs = 0; this.playing = false; this.waiting = false;
      this.counted = false; this.lastPanel = -1;
      const b = $('#sgPlay', this.el); if (b) b.textContent = 'Jouer';
      this.updatePanel(true);
    },
    play() {
      if (!Engine.running) { startMic().then(() => { if (Engine.running) this.play(); }); return; }
      const ctx = Out.ctx();
      if (this.beat <= -4 + 1e-6 && !this.counted) {
        const spb = 60 / (this.song.bpm * this.speed);
        for (let k = 0; k < 4; k++) Out.click(ctx.currentTime + 0.05 + k * spb, k === 0);
        this.counted = true;
        this.beat = -4 - 0.05 / spb;
      }
      this.playing = true; this.wasWait = this.wait;
      this.lastT = performance.now();
      this.consumed = Engine.s.onsetSeq;
      $('#sgPlay', this.el).textContent = 'Pause';
    },
    pause() {
      this.playing = false;
      const b = $('#sgPlay', this.el); if (b) b.textContent = 'Reprendre';
    },
    stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.playing = false; },
    loop() {
      const step = (t) => {
        if (this.mode !== 'play') return;
        const dt = Math.min(0.1, (t - this.lastT) / 1000); this.lastT = t;
        if (this.playing) this.advance(dt);
        this.draw();
        this.raf = requestAnimationFrame(step);
      };
      this.lastT = performance.now();
      this.raf = requestAnimationFrame(step);
    },
    advance(dt) {
      const s = Engine.s, bps = (this.song.bpm * this.speed) / 60;
      let nb = this.beat + dt * bps;
      const cur = this.notes[this.ci];
      this.waiting = false;
      if (this.wait && cur && nb >= cur.start) { nb = cur.start; this.waiting = true; }
      this.beat = nb;
      if (cur) {
        const win = 0.28 * bps;
        const canHit = this.wait ? this.beat >= cur.start - 1 : Math.abs(this.beat - cur.start) <= win;
        const same = s.stableMidi != null && (s.stableMidi - cur.midi) % 12 === 0;
        if (canHit && fresh(s, this.consumed) && same) {
          cur.status = 'hit'; this.hits++; this.consumed = s.onsetSeq; this.ci++;
        } else if (this.wait && canHit && fresh(s, this.consumed) && !same && s.stableMidi != null && s.now - s.lastOnset > 0.15) {
          this.wrongs++; this.consumed = s.onsetSeq; cur.flash = s.now;
        } else if (!this.wait && this.beat > cur.start + win) {
          cur.status = 'miss'; this.ci++;
        }
      }
      if (this.ci !== this.lastPanel) this.updatePanel();
      if (this.ci >= this.notes.length && this.beat > this.song.length + 0.5) this.finish();
    },
    finish() {
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
      if (this.beat < 0 && this.playing) {
        g.font = '700 64px "Barlow Condensed", sans-serif'; g.globalAlpha = 0.9;
        g.fillText(String(Math.ceil(-this.beat)), W / 2, H / 2); g.globalAlpha = 1;
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
