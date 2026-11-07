/* Frette — illustrations du cours (SVG/HTML). Dépend de core.js. Expose window.FretteFigs. */
(function () {
  'use strict';
  const C = window.FretteCore;
  const INK = '#f4eadf', MUTED = '#b59f8f', LINE = '#4b362c', ACC = '#e3ad4f', GOOD = '#79d39b', BAD = '#f0786a', WOOD = '#3a2920';
  const T = (x, y, s, o) => '<text x="' + x + '" y="' + y + '" fill="' + ((o && o.fill) || INK) + '" font-size="' + ((o && o.size) || 14) +
    '" font-family="Barlow Condensed, sans-serif" font-weight="' + ((o && o.w) || 600) + '" text-anchor="' + ((o && o.anchor) || 'middle') + '">' + s + '</text>';
  const L = (x1, y1, x2, y2, c, w) => '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + (c || MUTED) + '" stroke-width="' + (w || 1.2) + '"/>';
  const svg = (w, h, inner, label) => '<svg class="figsvg" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + (label || '') + '">' + inner + '</svg>';

  function guitar() {
    let s = '';
    s += '<ellipse cx="300" cy="88" rx="56" ry="62" fill="#7a4e2e" stroke="#2a1a12" stroke-width="2"/>';
    s += '<ellipse cx="226" cy="88" rx="44" ry="50" fill="#7a4e2e" stroke="#2a1a12" stroke-width="2"/>';
    s += '<rect x="220" y="44" width="60" height="88" fill="#7a4e2e"/>';
    s += '<circle cx="238" cy="88" r="18" fill="#1a120f" stroke="' + ACC + '" stroke-width="3"/>';
    s += '<rect x="299" y="69" width="11" height="38" rx="2" fill="#2a1a12"/>';
    s += '<path d="M8 70 Q8 64 14 64 L58 72 L58 104 L14 112 Q8 112 8 106 Z" fill="#5a3b2a"/>';
    [20, 33, 46].forEach((x) => { s += '<circle cx="' + x + '" cy="58" r="4" fill="' + MUTED + '"/><circle cx="' + x + '" cy="118" r="4" fill="' + MUTED + '"/>'; });
    s += '<rect x="62" y="75" width="148" height="26" fill="' + WOOD + '"/>';
    [82, 100, 117, 132, 146, 159, 171, 182, 192, 201].forEach((x) => { s += L(x, 75, x, 101, '#a89584', 1.6); });
    s += '<rect x="58" y="73" width="5" height="30" fill="#efe4d6"/>';
    for (let i = 0; i < 6; i++) { const y = 78 + i * 4; s += L(20, y, 305, y, '#d9cbbb', 0.7); }
    s += T(33, 26, 'Tête') + L(33, 31, 33, 60);
    s += T(116, 26, 'Frettes') + L(116, 31, 117, 74);
    s += T(238, 18, 'Rosace') + L(238, 23, 238, 69);
    s += T(318, 18, 'Chevalet') + L(310, 23, 305, 68);
    s += T(60, 160, 'Sillet') + L(60, 145, 60, 104);
    s += T(150, 160, 'Manche · cases') + L(150, 145, 150, 102);
    s += T(318, 170, 'Caisse', { anchor: 'middle' }) + L(318, 155, 312, 142);
    return svg(360, 176, s, 'Schéma de la guitare');
  }

  function fingers() {
    let s = '';
    s += '<rect x="66" y="92" width="168" height="60" rx="26" fill="#a88d77"/>';
    s += '<rect x="20" y="96" width="70" height="26" rx="13" fill="#a88d77" transform="rotate(-28 55 109)"/>';
    const f = [[74, 36, '1'], [112, 20, '2'], [150, 28, '3'], [188, 50, '4']];
    f.forEach(([x, top, n]) => {
      s += '<rect x="' + x + '" y="' + top + '" width="32" height="' + (110 - top) + '" rx="16" fill="#a88d77"/>';
      s += '<circle cx="' + (x + 16) + '" cy="' + (top + 17) + '" r="12" fill="' + ACC + '"/>';
      s += T(x + 16, top + 22, n, { fill: '#2a1a0c', w: 700, size: 15 });
    });
    s += T(28, 84, 'pouce', { fill: MUTED, size: 13 });
    s += T(260, 50, '1 index', { anchor: 'start', size: 13 }) + T(260, 68, '2 majeur', { anchor: 'start', size: 13 }) +
      T(260, 86, '3 annulaire', { anchor: 'start', size: 13 }) + T(260, 104, '4 auriculaire', { anchor: 'start', size: 13 });
    return svg(340, 156, s, 'Numéros des doigts de la main gauche');
  }

  function press() {
    let s = '';
    s += '<rect x="20" y="30" width="300" height="50" fill="' + WOOD + '" rx="3"/>';
    s += L(70, 26, 70, 84, '#a89584', 4) + L(270, 26, 270, 84, '#a89584', 4);
    s += L(20, 55, 320, 55, '#d9cbbb', 2.4);
    s += '<circle cx="246" cy="55" r="14" fill="' + GOOD + '"/>' + T(246, 60, '✓', { fill: '#1a120f', w: 700, size: 16 });
    s += '<circle cx="118" cy="55" r="14" fill="none" stroke="' + BAD + '" stroke-width="2.5" stroke-dasharray="4 3"/>' + T(118, 60, '✗', { fill: BAD, w: 700, size: 16 });
    s += T(270, 18, 'frette', { fill: MUTED, size: 13 }) + T(70, 18, 'frette', { fill: MUTED, size: 13 });
    s += T(246, 102, 'collé à la frette : son clair', { fill: GOOD, size: 13 });
    s += T(118, 102, 'trop loin : ça frise', { fill: BAD, size: 13 });
    return svg(340, 110, s, 'Où appuyer dans une case');
  }

  function naturals(title) {
    const names = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do'];
    const steps = ['T', 'T', '½', 'T', 'T', 'T', '½'];
    let s = '';
    names.forEach((n, i) => {
      const x = 4 + i * 43;
      s += '<rect x="' + x + '" y="8" width="35" height="34" rx="7" fill="#33241d" stroke="' + LINE + '"/>' + T(x + 17.5, 31, n, { size: 15 });
      if (i < 7) {
        const half = steps[i] === '½';
        s += T(x + 39, 66, steps[i], { fill: half ? ACC : MUTED, size: half ? 18 : 15, w: 700 });
        s += '<path d="M' + (x + 20) + ' 46 Q' + (x + 39) + ' ' + (half ? 52 : 58) + ' ' + (x + 58) + ' 46" fill="none" stroke="' + (half ? ACC : LINE) + '" stroke-width="1.5"/>';
      }
    });
    s += T(175, 92, 'T = 1 ton (2 cases) · ½ = 1 demi-ton (1 case)', { fill: MUTED, size: 13, w: 500 });
    return svg(350, 100, s, title || 'Tons et demi-tons');
  }

  function durations() {
    const rows = [['Ronde', '4 temps', 4], ['Blanche', '2 temps', 2], ['Noire', '1 temps', 1], ['Croche', '½ temps', 0.5]];
    const x0 = 92, bw = 60;
    let s = '';
    for (let b = 0; b <= 4; b++) s += L(x0 + b * bw, 18, x0 + b * bw, 160, b % 4 === 0 ? MUTED : LINE, 1);
    for (let b = 0; b < 4; b++) s += T(x0 + b * bw + bw / 2, 13, String(b + 1), { fill: MUTED, size: 13 });
    rows.forEach(([n, d, len], r) => {
      const y = 26 + r * 34;
      s += T(4, y + 12, n, { anchor: 'start', size: 15 }) + T(4, y + 26, d, { anchor: 'start', fill: MUTED, size: 12, w: 500 });
      for (let t = 0; t < 4; t += len) {
        s += '<rect x="' + (x0 + t * bw + 2) + '" y="' + (y + 2) + '" width="' + (len * bw - 4) + '" height="22" rx="6" fill="' + ACC + '" opacity="' + (0.95 - r * 0.15) + '"/>';
      }
    });
    return svg(340, 164, s, 'Durées des notes');
  }

  function triad() {
    const names = ['Do', '', 'Ré', '', 'Mi', 'Fa', '', 'Sol', '', 'La', '', 'Si', 'Do'];
    const rows = [['C · Do majeur', [0, 4, 7], '4 demi-tons'], ['Cm · Do mineur', [0, 3, 7], '3 demi-tons']];
    const roles = ['fondamentale', 'tierce', 'quinte'], cols = [ACC, GOOD, '#5fc6e8'];
    const cw = 25.5;
    let s = '';
    rows.forEach(([label, notes, gap], r) => {
      const y = 22 + r * 84;
      s += T(4, y - 6, label, { anchor: 'start', size: 15 }) + T(336, y - 6, 'tierce à ' + gap, { anchor: 'end', fill: MUTED, size: 13, w: 500 });
      names.forEach((n, i) => {
        const x = 4 + i * cw, k = notes.indexOf(i), black = n === '';
        const fill = k >= 0 ? cols[k] : black ? '#1a120f' : '#33241d';
        s += '<rect x="' + x + '" y="' + y + '" width="' + (cw - 3) + '" height="30" rx="5" fill="' + fill + '" stroke="' + LINE + '"/>';
        const lab = n || (k >= 0 ? (i === 3 ? 'Mi♭' : '') : '');
        if (lab) s += T(x + (cw - 3) / 2, y + 20, lab, { size: lab.length > 2 ? 10 : 12, fill: k >= 0 ? '#1a120f' : INK, w: 700 });
        if (k >= 0) s += T(k === 0 ? x : x + (cw - 3) / 2, y + 46, roles[k], { size: 11, fill: cols[k], w: 600, anchor: k === 0 ? 'start' : 'middle' });
      });
    });
    return svg(340, 160, s, 'Construction des accords majeur et mineur');
  }

  function pre(lines, cap) {
    return '<div class="tabfig"><pre>' + lines.join('\n') + '</pre>' + (cap ? '<p>' + cap + '</p>' : '') + '</div>';
  }

  function beatsRow(cells, cls) {
    return '<div class="beatrow ' + (cls || '') + '">' + cells.join('') + '</div>';
  }
  function count() {
    const lab = ['1', 'et', '2', 'et', '3', 'et', '4', 'et'];
    return '<div class="countfig">' +
      beatsRow(lab.map((l, i) => '<span class="' + (i % 2 ? 'off' : 'on') + '">' + l + '</span>')) +
      '<p>Noires : on joue sur 1, 2, 3, 4. Croches : on joue sur toutes les cases.</p></div>';
  }
  function strum() {
    const pats = [['Sur les temps', 'D.D.D.D.'], ['Bas, bas-haut', 'D.DUD.DU'], ['Rythme folk', 'D.DU.UDU']];
    const lab = ['1', 'et', '2', 'et', '3', 'et', '4', 'et'];
    let h = '<div class="countfig">' + beatsRow(lab.map((l, i) => '<span class="hd ' + (i % 2 ? 'off' : '') + '">' + l + '</span>'));
    pats.forEach(([name, p]) => {
      h += '<div class="pat-name">' + name + '</div>' + beatsRow(p.split('').map((c, i) => {
        const dir = i % 2 ? '↑' : '↓';
        return '<span class="arrow ' + (c === '.' ? 'ghost' : 'play') + '">' + dir + '</span>';
      }));
    });
    return h + '<p>Flèches pâles : le bras fait le geste sans toucher les cordes.</p></div>';
  }

  function figure(name, h) {
    switch (name) {
      case 'guitar': return guitar();
      case 'fingers': return fingers();
      case 'press': return press();
      case 'strings': return h.fretboard([0, 1, 2, 3, 4, 5].map((s) => ({ string: s, fret: 0, label: C.STRINGS[s].num })), 4) +
        '<p class="figcap">Cordes 1 (Mi aigu, en haut du schéma) à 6 (Mi grave). Le schéma montre le manche vu de face, comme une tablature.</p>';
      case 'tab': return pre(['e|-------0---1---3---|  ← corde 1 (aiguë)', 'B|---1---------------|', 'G|-------------------|', 'D|-------------------|', 'A|-------------------|', 'E|-------------------|  ← corde 6 (grave)'],
        'Ici : corde 2 case 1, puis corde 1 à vide, case 1, case 3.');
      case 'tabchord': return pre(['e|--0-----0-------|', 'B|--0-------1-----|', 'G|--0---------0---|', 'D|--2-----------2-|', 'A|--2-------------|', 'E|--0-------------|'],
        'À gauche, un accord (Mi mineur) : toutes les cordes ensemble. Puis des notes l’une après l’autre.');
      case 'names': return '<table class="names"><tr><th>Français</th><td>Do</td><td>Ré</td><td>Mi</td><td>Fa</td><td>Sol</td><td>La</td><td>Si</td></tr>' +
        '<tr><th>Anglais</th><td>C</td><td>D</td><td>E</td><td>F</td><td>G</td><td>A</td><td>B</td></tr></table>';
      case 'semitones': return naturals('Tons et demi-tons');
      case 'formula': return naturals('Formule de la gamme majeure');
      case 'octave': return h.fretboard([{ string: 0, fret: 0, label: 'Mi' }, { string: 0, fret: 12, label: 'Mi' }], 12) +
        '<p class="figcap">Corde 6 : Mi à vide, et le même Mi une octave plus haut à la case 12.</p>';
      case 'durations': return durations();
      case 'count': return count();
      case 'scale-c': return h.fretboard([[1, 3, 'Do'], [2, 0, 'Ré'], [2, 2, 'Mi'], [2, 3, 'Fa'], [3, 0, 'Sol'], [3, 2, 'La'], [4, 0, 'Si'], [4, 1, 'Do']]
        .map(([s, f, l]) => ({ string: s, fret: f, label: l })), 4);
      case 'penta': return h.fretboard([[0, 0, 'Mi'], [0, 3, 'Sol'], [1, 0, 'La'], [1, 2, 'Si'], [2, 0, 'Ré'], [2, 2, 'Mi'], [3, 0, 'Sol'], [3, 2, 'La'], [4, 0, 'Si'], [4, 3, 'Ré'], [5, 0, 'Mi'], [5, 3, 'Sol']]
        .map(([s, f, l]) => ({ string: s, fret: f, label: l })), 4);
      case 'triad': return triad();
      case 'diagram': return '<div class="diagfig">' + h.chordDiagram(C.CHORDS.find((c) => c.id === 'Em')) + h.chordDiagram(C.CHORDS.find((c) => c.id === 'Am')) + '</div>' +
        '<p class="figcap">Mi mineur (Em) et La mineur (Am) : même forme des doigts 2 et 3, décalée d’une corde.</p>';
      case 'strum': return strum();
    }
    return '';
  }

  window.FretteFigs = { figure };
})();
