/* Frette — contenu du cours (données uniquement).
   Types de leçon :
     theory  : pages (titre, illustration, texte) puis quiz
     notes   : exercice de notes (renvoie à FretteCore.LESSONS)
     rhythm  : jouer en rythme avec le métronome
     chords  : accord(s) à faire sonner, avec un objectif
     song    : morceau de la bibliothèque
     tuner   : accorder les 6 cordes */
(function (root) {
  'use strict';
  const q = (question, options, answer, why) => ({ q: question, options, answer, why });
  const bars = (pattern, n) => Array.from({ length: n }, () => pattern.slice());

  const COURSE = [
    {
      id: 'ch1', title: 'Bien démarrer',
      lessons: [
        {
          id: 't-guitare', type: 'theory', title: 'La guitare et tes mains',
          pages: [
            { h: 'Les parties de la guitare', fig: 'guitar',
              body: 'La <b>tête</b> porte les <b>mécaniques</b>, qui tendent les cordes. Le <b>manche</b> est découpé par des barrettes de métal, les <b>frettes</b> : l’espace entre deux frettes s’appelle une <b>case</b>. Les cordes vibrent entre le <b>sillet</b> et le <b>chevalet</b>, et la <b>caisse</b> amplifie le son qui sort par la <b>rosace</b>.' },
            { h: 'Les six cordes', fig: 'strings',
              body: 'Les cordes sont numérotées de <b>1</b> (la plus fine, la plus aiguë, en bas quand tu tiens la guitare) à <b>6</b> (la plus grosse, la plus grave, en haut).<br>Accordage standard, de la 6 à la 1 : <b>Mi La Ré Sol Si Mi</b>. En anglais : E A D G B E.' },
            { h: 'Les doigts', fig: 'fingers',
              body: 'Main gauche, sur le manche : <b>1</b> index, <b>2</b> majeur, <b>3</b> annulaire, <b>4</b> auriculaire. Le pouce reste derrière le manche, à peu près face au majeur.<br>La main droite pince ou gratte les cordes au-dessus de la rosace, aux doigts ou avec un médiator.' },
            { h: 'Bien appuyer', fig: 'press',
              body: 'Appuie avec le <b>bout du doigt</b>, juste <b>derrière la frette</b> (côté caisse). Trop loin de la frette, la note frise ; posé sur la frette, le son est étouffé.<br>Inutile d’écraser : appuie juste assez pour que la note sonne clair. Les ongles de la main gauche doivent être courts.' },
          ],
          quiz: [
            q('Quelle est la corde n°1 ?', ['La plus grosse', 'La plus fine', 'Celle du milieu'], 1, 'La corde 1 est la plus fine et la plus aiguë : le Mi aigu.'),
            q('Quelle note donne la 5e corde à vide ?', ['Mi', 'La', 'Ré', 'Sol'], 1, 'De la 6 à la 1 : Mi La Ré Sol Si Mi. La 5e est donc La.'),
            q('Pour la main gauche, le doigt 3 est…', ['l’index', 'le majeur', 'l’annulaire', 'l’auriculaire'], 2, '1 index, 2 majeur, 3 annulaire, 4 auriculaire.'),
            q('Pour jouer la case 2, où poses-tu le doigt ?', ['Sur la 2e frette', 'Juste derrière la 2e frette, côté caisse', 'Juste après la 1re frette'], 1, 'On appuie juste derrière la frette, entre la 1re et la 2e, collé à la 2e : la note sonne clair avec peu d’effort.'),
          ],
        },
        { id: 'p-accord', type: 'tuner', title: 'Accorder ta guitare', desc: 'Accorde les 6 cordes avec l’accordeur. À faire avant chaque séance.' },
        { id: 'p-open', type: 'notes', lesson: 'open', title: 'Les 6 cordes à vide', desc: 'Repère chaque corde à l’oreille et sous les doigts.' },
      ],
    },
    {
      id: 'ch2', title: 'Lire une tablature',
      lessons: [
        {
          id: 't-tab', type: 'theory', title: 'La tablature',
          pages: [
            { h: 'Six lignes, six cordes', fig: 'tab',
              body: 'La tablature dessine le manche vu de face : <b>la ligne du haut est la corde 1</b> (Mi aigu), celle du bas la corde 6 (Mi grave). C’est l’inverse de ce que tu vois quand tu baisses les yeux sur ta guitare : c’est le piège classique du début.' },
            { h: 'Les chiffres', fig: 'tabchord',
              body: 'Chaque chiffre indique la <b>case</b> à jouer sur cette corde. <b>0</b> veut dire corde à vide. On lit de <b>gauche à droite</b>.<br>Des chiffres empilés verticalement se jouent <b>en même temps</b> : c’est un accord.' },
            { h: 'Ce que la tablature ne dit pas',
              body: 'La tablature dit <b>où</b> jouer, mais rarement <b>combien de temps</b>. Pour le rythme, il faut écouter le morceau ou lire la partition.<br>Tu croiseras aussi des lettres : <b>h</b> (hammer-on, on frappe la note sans regratter), <b>p</b> (pull-off, on tire la corde en levant le doigt), <b>/</b> et <b>\\</b> (glissés). Tu les verras plus tard.' },
          ],
          quiz: [
            q('Sur une tablature, la ligne du haut représente…', ['la corde 6, Mi grave', 'la corde 1, Mi aigu'], 1, 'Ligne du haut = corde la plus aiguë, la corde 1.'),
            q('Que signifie un 0 ?', ['Ne pas jouer la corde', 'Corde à vide', 'Case 10'], 1, '0 = on joue la corde sans appuyer sur le manche.'),
            q('Deux chiffres l’un au-dessus de l’autre…', ['se jouent en même temps', 'se jouent l’un après l’autre, de haut en bas'], 0, 'Ce qui est aligné verticalement se joue ensemble.'),
            q('« e|---3--- » : que joues-tu ?', ['Corde 1, case 3', 'Corde 3, case 1', 'Corde 6, case 3'], 0, 'La ligne e est la corde 1 (Mi aigu), le chiffre est la case.'),
          ],
        },
        { id: 'p-e1', type: 'notes', lesson: 'e1', title: 'Corde 1 · Mi aigu', desc: 'Mi, Fa et Sol.' },
        { id: 'p-b2', type: 'notes', lesson: 'b2', title: 'Corde 2 · Si', desc: 'Si, Do et Ré.' },
      ],
    },
    {
      id: 'ch3', title: 'Les notes',
      lessons: [
        {
          id: 't-notes', type: 'theory', title: 'Les notes et les demi-tons',
          pages: [
            { h: 'Do Ré Mi = C D E', fig: 'names',
              body: 'Les 7 notes naturelles ont un nom français et une lettre anglaise. Les tablatures et les grilles d’accords utilisent presque toujours les <b>lettres</b> : retiens surtout <b>A = La</b> et <b>C = Do</b>, le reste suit dans l’ordre.' },
            { h: 'Tons et demi-tons', fig: 'semitones',
              body: 'Entre deux notes voisines il y a un <b>ton</b>, sauf entre <b>Mi et Fa</b> et entre <b>Si et Do</b> : seulement un <b>demi-ton</b>.<br>Sur la guitare, <b>une case = un demi-ton</b>. Pour passer de Do à Ré, tu montes donc de 2 cases ; de Mi à Fa, d’une seule.' },
            { h: 'Dièses et bémols',
              body: 'Les notes « entre deux » portent un <b>♯ dièse</b> (un demi-ton au-dessus) ou un <b>♭ bémol</b> (un demi-ton en dessous). <b>Do♯ et Ré♭ sont la même note</b>, avec deux noms.<br>Au total il y a donc <b>12 notes</b> différentes, puis tout recommence.' },
            { h: 'L’octave', fig: 'octave',
              body: 'Après Si revient Do, une <b>octave</b> plus haut : la même note, en plus aigu. À la <b>case 12</b>, chaque corde rejoue sa note à vide une octave au-dessus (c’est pour ça qu’on y voit souvent un double repère).' },
          ],
          quiz: [
            q('Comment s’écrit Sol en anglais ?', ['E', 'F', 'G', 'A'], 2, 'C D E F G A B = Do Ré Mi Fa Sol La Si.'),
            q('Combien de cases entre Mi et Fa ?', ['1', '2'], 0, 'Mi-Fa est un demi-ton, donc une seule case.'),
            q('Corde de La à vide, puis case 2 : quelle note ?', ['La♯', 'Si', 'Do'], 1, 'Deux cases = un ton : La + 1 ton = Si.'),
            q('Do♯ et Ré♭ sont…', ['deux notes différentes', 'la même note'], 1, 'Même son, deux noms : on parle de notes enharmoniques.'),
            q('À quelle case une corde rejoue-t-elle sa note à vide, une octave plus haut ?', ['5', '7', '12'], 2, '12 demi-tons = une octave = 12 cases.'),
          ],
        },
        { id: 'p-g3', type: 'notes', lesson: 'g3', title: 'Corde 3 · Sol', desc: 'Sol et La.' },
        { id: 'p-d4', type: 'notes', lesson: 'd4', title: 'Corde 4 · Ré', desc: 'Ré, Mi et Fa.' },
        { id: 'p-a5', type: 'notes', lesson: 'a5', title: 'Corde 5 · La', desc: 'La, Si et Do.' },
        { id: 'p-E6', type: 'notes', lesson: 'E6', title: 'Corde 6 · Mi grave', desc: 'Mi, Fa et Sol.' },
        { id: 'p-mix', type: 'notes', lesson: 'mix', title: 'Révision 1re position', desc: 'Toutes les notes, dans le désordre.' },
      ],
    },
    {
      id: 'ch4', title: 'Le rythme',
      lessons: [
        {
          id: 't-rythme', type: 'theory', title: 'Pulsation et durées',
          pages: [
            { h: 'La pulsation',
              body: 'La <b>pulsation</b> est le battement régulier sur lequel tu tapes du pied. Sa vitesse, le <b>tempo</b>, se mesure en <b>BPM</b> (battements par minute) : à 60 BPM, un battement par seconde ; à 120 BPM, deux.' },
            { h: 'Les durées', fig: 'durations',
              body: 'Une note dure un certain nombre de temps : <b>ronde</b> 4 temps, <b>blanche</b> 2, <b>noire</b> 1, <b>croche</b> ½. Il y a donc deux croches dans un temps.' },
            { h: 'Compter', fig: 'count',
              body: 'Les temps sont le plus souvent groupés par 4 : c’est une <b>mesure à 4 temps</b>. On compte « <b>1 2 3 4</b> », et pour les croches « <b>1 et 2 et 3 et 4 et</b> ».<br>Le temps 1 est un peu plus appuyé : dans Frette, c’est le clic le plus aigu du métronome.' },
          ],
          quiz: [
            q('À 120 BPM, combien de battements par seconde ?', ['1', '2', '4'], 1, '120 battements en 60 secondes = 2 par seconde.'),
            q('Une blanche vaut combien de noires ?', ['2', '4'], 0, 'Blanche = 2 temps, noire = 1 temps.'),
            q('Combien de croches dans une mesure à 4 temps ?', ['4', '8', '16'], 1, '2 croches par temps × 4 temps = 8.'),
            q('Dans « 1 et 2 et », les « et » tombent…', ['au milieu des temps', 'un temps sur deux'], 0, 'Le « et » est la 2e croche : pile entre deux temps.'),
          ],
        },
        { id: 'r-noires', type: 'rhythm', title: 'Jouer sur les temps', instr: 'Pince la corde de Mi grave à vide sur chaque clic.', bpm: 60, bars: bars([0, 1, 2, 3], 4) },
        { id: 'r-blanches', type: 'rhythm', title: 'Blanches et noires', instr: 'Corde de La à vide. Laisse sonner les blanches pendant 2 temps.', bpm: 66, bars: [[0, 2], [0, 2], [0, 1, 2, 3], [0, 2], [0, 1, 2], [0, 2], [0, 1, 2, 3], [0]] },
        { id: 'r-croches', type: 'rhythm', title: 'Les croches', instr: 'Corde de Ré à vide. Compte « 1 et 2 et… » et joue aussi sur les « et ».', bpm: 60, bars: [[0, 1, 2, 3], [0, 1, 2, 2.5, 3, 3.5], [0, 0.5, 1, 1.5, 2, 3], [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]] },
      ],
    },
    {
      id: 'ch5', title: 'Les gammes',
      lessons: [
        {
          id: 't-gammes', type: 'theory', title: 'Gamme majeure et pentatonique',
          pages: [
            { h: 'Qu’est-ce qu’une gamme ?',
              body: 'Une <b>gamme</b> est une suite de notes choisies qui sonnent bien ensemble. Presque toutes les mélodies piochent leurs notes dans une gamme. Connaître les gammes, c’est savoir quelles notes « marchent » dans un morceau.' },
            { h: 'La gamme majeure', fig: 'formula',
              body: 'Sa formule : <b>ton, ton, demi-ton, ton, ton, ton, demi-ton</b>. En partant de Do, on obtient Do Ré Mi Fa Sol La Si Do, sans dièse ni bémol : c’est la <b>gamme de Do majeur</b>.' },
            { h: 'Do majeur sur le manche', fig: 'scale-c',
              body: 'En 1re position, la gamme de Do majeur commence corde 5 case 3 et monte jusqu’au Do de la corde 2, case 1. Doigté : case 1 = index, case 2 = majeur, case 3 = annulaire.' },
            { h: 'La pentatonique mineure', fig: 'penta',
              body: '<b>Cinq notes</b> seulement : c’est la gamme du blues et du rock, et il est difficile de jouer faux avec. La pentatonique de <b>Mi mineur</b> : Mi Sol La Si Ré. En 1re position, elle n’utilise que les cordes à vide et les cases 2 et 3.' },
          ],
          quiz: [
            q('Formule de la gamme majeure ?', ['T T ½ T T T ½', 'T ½ T T ½ T T', 'T T T ½ T T ½'], 0, 'Ton, ton, demi-ton, ton, ton, ton, demi-ton.'),
            q('Combien de notes dans une gamme pentatonique ?', ['5', '7', '12'], 0, '« Penta » veut dire cinq.'),
            q('La gamme de Do majeur contient…', ['aucun dièse ni bémol', 'un Fa♯', 'un Si♭'], 0, 'Do majeur n’utilise que les notes naturelles.'),
          ],
        },
        { id: 'p-cmaj', type: 'notes', lesson: 'cmaj', title: 'Gamme de Do majeur', desc: 'En montant puis en descendant.' },
        { id: 'p-penta', type: 'notes', lesson: 'penta', title: 'Pentatonique de Mi mineur', desc: 'Sur les 6 cordes, aller et retour.' },
      ],
    },
    {
      id: 'ch6', title: 'Premiers accords',
      lessons: [
        {
          id: 't-accords', type: 'theory', title: 'Comment marche un accord',
          pages: [
            { h: 'Trois notes ensemble', fig: 'triad',
              body: 'Un accord, c’est au moins trois notes jouées ensemble. L’accord de base, la <b>triade</b>, empile une <b>fondamentale</b> (qui donne son nom à l’accord), une <b>tierce</b> et une <b>quinte</b>.' },
            { h: 'Majeur ou mineur ?',
              body: 'Tout se joue sur la tierce : <b>4 demi-tons</b> au-dessus de la fondamentale pour un accord <b>majeur</b> (son lumineux), <b>3 demi-tons</b> pour un <b>mineur</b> (son plus sombre).<br>Do majeur = Do Mi Sol, noté <b>C</b>. Do mineur = Do Mi♭ Sol, noté <b>Cm</b>.' },
            { h: 'Lire un diagramme', fig: 'diagram',
              body: 'Le diagramme montre le manche debout, face à toi : <b>corde 6 à gauche</b>, sillet en haut. Les ronds pleins sont les doigts (le chiffre dit lequel), <b>o</b> = corde à vide, <b>×</b> = corde à ne pas jouer.' },
            { h: 'Changer d’accord',
              body: 'Cherche les doigts qui ne bougent pas, ou qui glissent, d’un accord à l’autre : ce sont tes <b>pivots</b>. Entre Mi mineur et La mineur, par exemple, les doigts 2 et 3 gardent la même forme, décalée d’une corde.<br>Va lentement : la régularité d’abord, la vitesse viendra seule.' },
          ],
          quiz: [
            q('Les trois notes d’une triade sont…', ['fondamentale, tierce, quinte', 'Do, Ré, Mi', 'basse, médium, aigu'], 0, 'On empile une tierce puis une quinte au-dessus de la fondamentale.'),
            q('Ce qui distingue un accord majeur d’un mineur, c’est…', ['la tierce', 'la quinte', 'la fondamentale'], 0, '4 demi-tons : majeur. 3 demi-tons : mineur.'),
            q('Sur un diagramme, un × au-dessus d’une corde veut dire…', ['ne pas la jouer', 'la jouer à vide'], 0, 'o = à vide, × = on ne la joue pas.'),
            q('Que veut dire « Am » ?', ['La majeur', 'La mineur', 'Mi mineur'], 1, 'A = La, m = mineur.'),
          ],
        },
        { id: 'c-em', type: 'chords', title: 'Mi mineur (Em)', set: ['Em'], count: 3, desc: 'Le plus facile : deux doigts. Fais-le sonner 3 fois.' },
        { id: 'c-am', type: 'chords', title: 'La mineur (Am)', set: ['Am'], count: 3, desc: 'Trois doigts, la corde 6 ne sonne pas.' },
        { id: 'c-em-am', type: 'chords', title: 'Enchaîner Em et Am', set: ['Em', 'Am'], count: 8, desc: '8 changements réussis.' },
        { id: 'c-c', type: 'chords', title: 'Do majeur (C)', set: ['C'], count: 3, desc: 'L’annulaire porte la basse sur la corde 5.' },
        { id: 'c-am-c', type: 'chords', title: 'Enchaîner Am et C', set: ['Am', 'C'], count: 8, desc: 'Seul l’annulaire bouge !' },
      ],
    },
    {
      id: 'ch7', title: 'Gratter en rythme',
      lessons: [
        {
          id: 't-gratter', type: 'theory', title: 'Les rythmiques',
          pages: [
            { h: 'Le geste',
              body: 'Gratte avec le <b>poignet souple</b>, comme pour secouer de l’eau de ta main, pas avec tout le bras. Le médiator ou l’ongle de l’index effleure les cordes.<br>Vers le <b>bas</b> sur les temps, vers le <b>haut</b> sur les « et ».' },
            { h: 'Le balancier', fig: 'strum',
              body: 'Le bras fait l’aller-retour <b>en permanence</b>, même quand il ne touche pas les cordes. C’est ce balancier régulier qui garde le rythme : pour « sauter » un coup, tu passes simplement à côté des cordes.' },
          ],
          quiz: [
            q('Les grattages vers le haut tombent…', ['sur les temps', 'sur les « et »'], 1, 'Bas sur les temps, haut sur les « et ».'),
            q('Quand on saute un coup, le bras…', ['s’arrête', 'continue son aller-retour sans toucher les cordes'], 1, 'Le balancier ne s’arrête jamais : c’est lui qui tient le tempo.'),
          ],
        },
        { id: 'r-em', type: 'rhythm', title: 'Gratter Em sur les temps', instr: 'Fais l’accord de Mi mineur et gratte vers le bas sur chaque clic.', bpm: 66, bars: bars([0, 1, 2, 3], 4) },
        { id: 'r-folk', type: 'rhythm', title: 'Bas, bas-haut', instr: 'Toujours en Em : ↓ sur 1 et 3, ↓↑ sur 2 et 4.', bpm: 60, bars: bars([0, 1, 1.5, 2, 3, 3.5], 4) },
        { id: 'c-g', type: 'chords', title: 'Sol majeur (G)', set: ['G'], count: 3, desc: 'Les 6 cordes sonnent.' },
        { id: 'c-d', type: 'chords', title: 'Ré majeur (D)', set: ['D'], count: 3, desc: 'Ne joue que les 4 cordes aiguës.' },
        { id: 'c-gcd', type: 'chords', title: 'G, C et D', set: ['G', 'C', 'D'], count: 9, desc: 'Les trois accords de milliers de chansons.' },
      ],
    },
    {
      id: 'ch8', title: 'Tes premiers morceaux',
      lessons: [
        {
          id: 't-travail', type: 'theory', title: 'Bien travailler un morceau',
          pages: [
            { h: 'Lentement d’abord',
              body: 'Commence à <b>50 %</b> avec « Attendre ma note » : tu apprends les positions sans stress. Passe à 75 % puis 100 % quand tu dépasses 80 % de réussite.<br>Quand tu le connais, décoche « Attendre ma note » pour le jouer en rythme.' },
            { h: 'Un peu chaque jour',
              body: '<b>15 minutes par jour</b> valent mieux qu’une heure le dimanche : les doigts apprennent pendant le sommeil. Une séance type : accorder, 3 minutes de gamme, 5 minutes d’accords, puis un morceau.<br>Si le bout des doigts fait mal au début, c’est normal : la corne se forme en deux ou trois semaines.' },
          ],
          quiz: [],
        },
        { id: 's-clair', type: 'song', song: 'clair', title: 'Au clair de la lune', desc: 'Sur les cordes 2 et 3, très peu de notes.' },
        { id: 's-ode', type: 'song', song: 'ode', title: 'Ode à la joie', desc: 'Cordes 1 et 2.' },
        { id: 's-jacques', type: 'song', song: 'jacques', title: 'Frère Jacques', desc: 'Premières croches.' },
        { id: 's-anniv', type: 'song', song: 'anniv', title: 'Joyeux anniversaire', desc: 'Pour épater ton entourage.' },
      ],
    },
  ];

  const api = { COURSE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FretteCourse = api;
})(typeof self !== 'undefined' ? self : this);
