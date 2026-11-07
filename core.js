/* Frette — logique pure (pas de DOM) : notes, détection de hauteur, accords, morceaux.
   Utilisable dans le navigateur (window.FretteCore) et dans Node (tests). */
(function (root) {
  'use strict';

  const NOTE_FR = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
  const NOTE_EN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

  // index 0 = corde grave (6e corde), index 5 = corde aiguë (1re corde)
  const STRINGS = [
    { num: 6, name: 'Mi grave', short: 'E', midi: 40, color: '#f26d5b' },
    { num: 5, name: 'La', short: 'A', midi: 45, color: '#9bc56a' },
    { num: 4, name: 'Ré', short: 'D', midi: 50, color: '#f4a14a' },
    { num: 3, name: 'Sol', short: 'G', midi: 55, color: '#f2d15c' },
    { num: 2, name: 'Si', short: 'B', midi: 59, color: '#5fc6e8' },
    { num: 1, name: 'Mi aigu', short: 'e', midi: 64, color: '#c39bf0' },
  ];

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
  const pc = (m) => ((Math.round(m) % 12) + 12) % 12;

  function noteName(m) {
    const r = Math.round(m);
    return { fr: NOTE_FR[pc(r)], en: NOTE_EN[pc(r)], octave: Math.floor(r / 12) - 1 };
  }

  function parseNote(s) {
    const mm = /^([A-G])([#b]?)(-?\d)$/.exec(s);
    if (!mm) throw new Error('Note invalide : ' + s);
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[mm[1]];
    const acc = mm[2] === '#' ? 1 : mm[2] === 'b' ? -1 : 0;
    return (parseInt(mm[3], 10) + 1) * 12 + base + acc;
  }

  // Position la plus simple (case la plus basse) pour jouer une note
  function position(midi, maxFret) {
    maxFret = maxFret == null ? 12 : maxFret;
    let best = null;
    for (let s = 5; s >= 0; s--) {
      const f = midi - STRINGS[s].midi;
      if (f >= 0 && f <= maxFret && (!best || f < best.fret)) best = { string: s, fret: f };
    }
    return best;
  }

  /* ---------- Détection de hauteur (YIN) ----------
     buf : échantillons temporels (Float32Array), idéalement 4096 à 44,1/48 kHz.
     On sous-échantillonne par 2 pour alléger le calcul sur téléphone. */
  function detectPitch(buf, sampleRate, opts) {
    opts = opts || {};
    const minF = opts.minF || 70, maxF = opts.maxF || 1400, thr = opts.threshold || 0.12;
    const n = buf.length >> 1;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 0.5 * (buf[2 * i] + buf[2 * i + 1]);
    const sr = sampleRate / 2;
    const tauMin = Math.max(2, Math.floor(sr / maxF));
    const tauMax = Math.min(Math.ceil(sr / minF), n >> 1);
    const W = n - tauMax - 1;
    const d = new Float32Array(tauMax + 2);
    for (let tau = 1; tau <= tauMax + 1; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) { const v = x[j] - x[j + tau]; s += v * v; }
      d[tau] = s;
    }
    const c = new Float32Array(tauMax + 2);
    c[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= tauMax + 1; tau++) {
      run += d[tau];
      c[tau] = run > 0 ? (d[tau] * tau) / run : 1;
    }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (c[t] < thr) {
        while (t + 1 <= tauMax && c[t + 1] < c[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      let mi = tauMin;
      for (let t = tauMin; t <= tauMax; t++) if (c[t] < c[mi]) mi = t;
      if (c[mi] < 0.3) tau = mi; else return null;
    }
    let refined = tau;
    if (tau > 1 && tau <= tauMax) {
      const a = c[tau - 1], b = c[tau], g = c[tau + 1];
      const den = a - 2 * b + g;
      if (den !== 0) refined = tau + (0.5 * (a - g)) / den;
    }
    return { freq: sr / refined, clarity: 1 - c[tau] };
  }

  function rms(buf, from) {
    let s = 0, n = 0;
    for (let i = from || 0; i < buf.length; i++) { s += buf[i] * buf[i]; n++; }
    return Math.sqrt(s / Math.max(1, n));
  }

  /* ---------- Accords ---------- */
  // frets : de la corde grave à l'aiguë, -1 = corde étouffée. fingers : 0 = à vide / rien.
  const CHORDS = [
    { id: 'Em', fr: 'Mi mineur', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
    { id: 'Am', fr: 'La mineur', frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
    { id: 'C', fr: 'Do majeur', frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
    { id: 'G', fr: 'Sol majeur', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
    { id: 'D', fr: 'Ré majeur', frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
    { id: 'E', fr: 'Mi majeur', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
    { id: 'A', fr: 'La majeur', frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
    { id: 'Dm', fr: 'Ré mineur', frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  ];

  // Gabarit de chroma attendu (fondamentale + harmoniques)
  function chordTemplate(frets) {
    const v = new Float32Array(12);
    const harm = [[0, 1], [12, 0.6], [19, 0.4], [24, 0.3], [28, 0.22], [31, 0.15]];
    frets.forEach((f, s) => {
      if (f < 0) return;
      const m = STRINGS[s].midi + f;
      for (const [iv, w] of harm) v[(m + iv) % 12] += w;
    });
    return v;
  }
  CHORDS.forEach((c) => { c.template = chordTemplate(c.frets); });

  // Chromagramme à partir d'un spectre en dB (AnalyserNode.getFloatFrequencyData)
  function chroma(db, sampleRate, fftSize, minF, maxF) {
    minF = minF || 75; maxF = maxF || 1500;
    const hz = sampleRate / fftSize;
    const v = new Float32Array(12);
    const lo = Math.max(1, Math.ceil(minF / hz));
    const hi = Math.min(db.length - 2, Math.floor(maxF / hz));
    let peak = -Infinity;
    for (let k = lo; k <= hi; k++) if (db[k] > peak) peak = db[k];
    const floor = peak - 45; // on ignore ce qui est très en dessous du pic principal
    for (let k = lo; k <= hi; k++) {
      const b = db[k];
      if (!(b > floor) || b < db[k - 1] || b < db[k + 1]) continue;
      const a = db[k - 1], g = db[k + 1];
      const den = a - 2 * b + g;
      const p = den !== 0 ? (0.5 * (a - g)) / den : 0;
      const f = (k + p) * hz;
      v[pc(freqToMidi(f))] += Math.pow(10, (b - peak) / 20);
    }
    return v;
  }

  function cosine(a, b) {
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < 12; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
    return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
  }

  function classifyChord(ch, list) {
    return (list || CHORDS)
      .map((c) => ({ id: c.id, score: cosine(ch, c.template) }))
      .sort((p, q) => q.score - p.score);
  }

  /* ---------- Exercices de notes ---------- */
  const P = (s, f) => ({ string: s, fret: f });
  const LESSONS = [
    { id: 'open', title: 'Les 6 cordes à vide', desc: 'Pince chaque corde sans appuyer sur le manche.', pool: [0, 1, 2, 3, 4, 5].map((s) => P(s, 0)), count: 12 },
    { id: 'e1', title: 'Corde 1 · Mi aigu', desc: 'Mi, Fa et Sol sur la corde la plus fine.', pool: [P(5, 0), P(5, 1), P(5, 3)], count: 10 },
    { id: 'b2', title: 'Corde 2 · Si', desc: 'Si, Do et Ré.', pool: [P(4, 0), P(4, 1), P(4, 3)], count: 10 },
    { id: 'g3', title: 'Corde 3 · Sol', desc: 'Sol et La.', pool: [P(3, 0), P(3, 2)], count: 8 },
    { id: 'd4', title: 'Corde 4 · Ré', desc: 'Ré, Mi et Fa.', pool: [P(2, 0), P(2, 2), P(2, 3)], count: 10 },
    { id: 'a5', title: 'Corde 5 · La', desc: 'La, Si et Do.', pool: [P(1, 0), P(1, 2), P(1, 3)], count: 10 },
    { id: 'E6', title: 'Corde 6 · Mi grave', desc: 'Mi, Fa et Sol sur la corde la plus grosse.', pool: [P(0, 0), P(0, 1), P(0, 3)], count: 10 },
    {
      id: 'cmaj', title: 'Gamme de Do majeur', desc: 'Do Ré Mi Fa Sol La Si Do, en montant puis en descendant.',
      sequence: [P(1, 3), P(2, 0), P(2, 2), P(2, 3), P(3, 0), P(3, 2), P(4, 0), P(4, 1), P(4, 0), P(3, 2), P(3, 0), P(2, 3), P(2, 2), P(2, 0), P(1, 3)],
    },
    {
      id: 'penta', title: 'Pentatonique de Mi mineur', desc: 'Mi Sol La Si Ré sur les 6 cordes, aller et retour.',
      sequence: [P(0, 0), P(0, 3), P(1, 0), P(1, 2), P(2, 0), P(2, 2), P(3, 0), P(3, 2), P(4, 0), P(4, 3), P(5, 0), P(5, 3),
        P(5, 0), P(4, 3), P(4, 0), P(3, 2), P(3, 0), P(2, 2), P(2, 0), P(1, 2), P(1, 0), P(0, 3), P(0, 0)],
    },
    {
      id: 'mix', title: 'Révision 1re position', desc: 'Toutes les notes vues, dans le désordre.',
      pool: [P(0, 0), P(0, 1), P(0, 3), P(1, 0), P(1, 2), P(1, 3), P(2, 0), P(2, 2), P(2, 3), P(3, 0), P(3, 2), P(4, 0), P(4, 1), P(4, 3), P(5, 0), P(5, 1), P(5, 3)],
      count: 16,
    },
  ];

  function lessonTargets(lesson, rnd) {
    rnd = rnd || Math.random;
    if (lesson.sequence) return lesson.sequence.slice();
    const out = [];
    for (let i = 0; i < lesson.count; i++) {
      let p;
      do { p = lesson.pool[Math.floor(rnd() * lesson.pool.length)]; }
      while (out.length && p === out[out.length - 1] && lesson.pool.length > 1);
      out.push(p);
    }
    return out;
  }

  /* ---------- Morceaux (domaine public) ---------- */
  function song(id, title, origin, level, bpm, seq, transpose) {
    let t = 0;
    const notes = seq.map(([n, d]) => {
      const midi = parseNote(n) + (transpose || 0);
      const pos = position(midi, 5) || position(midi, 12);
      const note = { midi, start: t, dur: d, string: pos.string, fret: pos.fret };
      t += d;
      return note;
    });
    return { id, title, origin, level, bpm, notes, length: t };
  }
  const rep = (arr, k) => [].concat(...Array(k).fill(arr));

  const auClairA = [['C4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 2], ['D4', 2], ['C4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 4]];
  const SONGS = [
    song('ode', 'Ode à la joie', 'Beethoven, 1824', 1, 96, [].concat(
      [['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1.5], ['D4', 0.5], ['D4', 2]],
      [['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['D4', 1.5], ['C4', 0.5], ['C4', 2]]
    )),
    song('clair', 'Au clair de la lune', 'Chanson populaire française', 1, 92, [].concat(
      auClairA, auClairA,
      [['D4', 1], ['D4', 1], ['D4', 1], ['D4', 1], ['A3', 2], ['A3', 2], ['D4', 1], ['C4', 1], ['B3', 1], ['A3', 1], ['G3', 4]],
      auClairA
    )),
    song('jacques', 'Frère Jacques', 'Canon traditionnel', 2, 100, [].concat(
      rep([['G3', 1], ['A3', 1], ['B3', 1], ['G3', 1]], 2),
      rep([['B3', 1], ['C4', 1], ['D4', 2]], 2),
      rep([['D4', 0.5], ['E4', 0.5], ['D4', 0.5], ['C4', 0.5], ['B3', 1], ['G3', 1]], 2),
      rep([['G3', 1], ['D3', 1], ['G3', 2]], 2)
    )),
    song('maman', 'Ah ! vous dirai-je, maman', 'Air français du XVIIIe siècle', 2, 92, (() => {
      const a = [['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2]];
      const b = [['G4', 1], ['G4', 1], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 2]];
      return [].concat(a, b, b, a);
    })()),
    song('anniv', 'Joyeux anniversaire', 'Mildred et Patty Hill, 1893', 1, 100, [
      ['G3', 0.75], ['G3', 0.25], ['A3', 1], ['G3', 1], ['C4', 1], ['B3', 2],
      ['G3', 0.75], ['G3', 0.25], ['A3', 1], ['G3', 1], ['D4', 1], ['C4', 2],
      ['G3', 0.75], ['G3', 0.25], ['G4', 1], ['E4', 1], ['C4', 1], ['B3', 1], ['A3', 2],
      ['F4', 0.75], ['F4', 0.25], ['E4', 1], ['C4', 1], ['D4', 1], ['C4', 3],
    ]),
    song('vent', 'Vive le vent (refrain)', 'James Lord Pierpont, 1857', 2, 112, (() => {
      const a = [['E4', 1], ['E4', 1], ['E4', 2], ['E4', 1], ['E4', 1], ['E4', 2], ['E4', 1], ['G4', 1], ['C4', 1.5], ['D4', 0.5], ['E4', 4],
        ['F4', 1], ['F4', 1], ['F4', 1.5], ['F4', 0.5], ['F4', 1], ['E4', 1], ['E4', 1], ['E4', 0.5], ['E4', 0.5]];
      return [].concat(a, [['E4', 1], ['D4', 1], ['D4', 1], ['E4', 1], ['D4', 2], ['G4', 2]],
        a, [['G4', 1], ['G4', 1], ['F4', 1], ['D4', 1], ['C4', 4]]);
    })()),
    song('nuit', 'Douce nuit', 'Franz Xaver Gruber, 1818', 3, 84, [
      ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3], ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3],
      ['D5', 2], ['D5', 1], ['B4', 3], ['C5', 2], ['C5', 1], ['G4', 3],
      ['A4', 2], ['A4', 1], ['C5', 1.5], ['B4', 0.5], ['A4', 1], ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3],
      ['A4', 2], ['A4', 1], ['C5', 1.5], ['B4', 0.5], ['A4', 1], ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['E4', 3],
      ['D5', 2], ['D5', 1], ['F5', 1.5], ['D5', 0.5], ['B4', 1], ['C5', 3], ['E5', 3],
      ['C5', 1], ['G4', 1], ['E4', 1], ['G4', 1.5], ['F4', 0.5], ['D4', 1], ['C4', 6],
    ], -7),
  ];

  /* ---------- Import de tablature ASCII ----------
     Reconnaît les blocs de 6 lignes du type « e|---0---3---| » (corde aiguë en haut).
     Garde la note la plus aiguë de chaque colonne (la mélodie). */
  function parseTab(text) {
    const lines = String(text || '').replace(/\t/g, '    ').split(/\r?\n/);
    const isTab = (l) => {
      const m = /^\s*([A-Ga-g][#b]?)?\s*[|:]\s*?([-0-9hpbrsx\/\\~|.()*^v<>=+ ]+)$/.exec(l);
      if (!m || (m[2].match(/-/g) || []).length < 3) return null;
      return m[2];
    };
    const systems = [];
    let block = [];
    const flush = () => {
      for (let i = 0; i + 6 <= block.length; i += 6) systems.push(block.slice(i, i + 6));
      block = [];
    };
    for (const l of lines) { const b = isTab(l); if (b != null) block.push(b); else flush(); }
    flush();
    if (!systems.length) return { notes: [], error: 'Aucune tablature reconnue. Il faut 6 lignes qui commencent par e| B| G| D| A| E|.' };

    const events = [];
    let offset = 0;
    for (const sys of systems) {
      const w = Math.max.apply(null, sys.map((r) => r.length));
      const rows = sys.map((r) => r.padEnd(w, '-'));
      let col = 0;
      for (let c = 0; c < w; c++) {
        if (rows.every((r) => r[c] === '|')) { col = Math.max(0, col - 1); continue; } // barre de mesure (et son tiret)
        rows.forEach((r, i) => {
          if (!/\d/.test(r[c]) || (c > 0 && /\d/.test(r[c - 1]))) return;
          let num = r[c];
          if (/\d/.test(r[c + 1] || '') && +(r[c] + r[c + 1]) <= 24) num += r[c + 1];
          const string = 5 - i, fret = +num;
          events.push({ col: offset + col, string, fret, midi: STRINGS[string].midi + fret });
        });
        col++;
      }
      offset += col;
    }
    if (!events.length) return { notes: [], error: 'La tablature ne contient aucune note (chiffre).' };

    const byCol = new Map();
    events.forEach((e) => { const p = byCol.get(e.col); if (!p || e.midi > p.midi) byCol.set(e.col, e); });
    const seq = [...byCol.values()].sort((a, b) => a.col - b.col);
    const gaps = seq.slice(1).map((e, i) => e.col - seq[i].col).sort((a, b) => a - b);
    const unit = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 2;
    let t = 0;
    const notes = seq.map((e, i) => {
      const gap = i + 1 < seq.length ? seq[i + 1].col - e.col : unit;
      const dur = Math.min(4, Math.max(0.5, Math.round((gap / unit) * 2) / 2));
      const n = { midi: e.midi, start: t, dur, string: e.string, fret: e.fret };
      t += dur;
      return n;
    });
    return { notes, length: t, chords: events.length - seq.length };
  }

  const api = {
    NOTE_FR, NOTE_EN, STRINGS, CHORDS, LESSONS, SONGS,
    midiToFreq, freqToMidi, noteName, parseNote, position, pc,
    detectPitch, rms, chordTemplate, chroma, cosine, classifyChord, lessonTargets, parseTab,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FretteCore = api;
})(typeof self !== 'undefined' ? self : this);
