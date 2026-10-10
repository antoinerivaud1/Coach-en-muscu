// Fiches techniques des exercices du catalogue système (CM-30).
//
// Contenu 100 % statique, embarqué dans le bundle (compatible avec le futur
// bundle hors ligne, Phase 7) : aucune colonne en base. Indexé par le nom de
// l'exercice système, normalisé (`exerciseKey`) pour résister aux accents et
// à la casse. Un exercice perso (créé par le duo) n'a pas de fiche : la page
// n'affiche alors ni « Exécution » ni « À éviter ».
//
// Règles de rédaction : tutoiement, phrases courtes, exactement 3 étapes,
// 2 à 3 erreurs. Pas de « : ; ? ! » (espace insécable obligatoire avant),
// pas de tiret cadratin. Vérifié par tests/unit/exerciseGuides.spec.ts.

import { exerciseKey } from "@/lib/exerciseKey";

export type Equipment =
  | "Barre"
  | "Haltères"
  | "Poulie"
  | "Machine"
  | "Poids du corps"
  | "Tapis";

export type ExerciseGuide = {
  equipment: Equipment;
  /** Exécution, dans l'ordre. Toujours 3 étapes. */
  steps: readonly [string, string, string];
  /** Erreurs fréquentes, 2 à 3. */
  avoid: readonly string[];
  /** Étirement conseillé après l'effort. */
  stretch: string;
};

export const EXERCISE_GUIDES: Record<string, ExerciseGuide> = {
  // --- Pectoraux ---
  "Cross-over poulie": {
    equipment: "Poulie",
    steps: [
      "Poulies hautes, un pas en avant, buste légèrement penché.",
      "Ramène les poignées devant ton bassin en arc de cercle, coudes peu fléchis.",
      "Serre les pectoraux une seconde puis reviens lentement bras ouverts.",
    ],
    avoid: [
      "Plier les coudes comme sur un développé.",
      "Te cambrer ou te laisser tirer en arrière par la charge.",
    ],
    stretch: "Bras écartés contre un cadre de porte, avance le buste.",
  },
  "Développé couché barre": {
    equipment: "Barre",
    steps: [
      "Allongé, omoplates serrées et basses, pieds bien ancrés au sol.",
      "Descends la barre sous contrôle vers le bas des pectoraux, coudes à environ 45° du buste.",
      "Pousse en expirant jusqu'à bras tendus, fessiers collés au banc.",
    ],
    avoid: [
      "Écarter les coudes à 90° du buste.",
      "Faire rebondir la barre sur la poitrine.",
      "Décoller les fessiers du banc.",
    ],
    stretch: "Bras tendu sur le côté contre un mur, tourne le buste à l'opposé.",
  },
  "Développé couché haltères": {
    equipment: "Haltères",
    steps: [
      "Allongé, omoplates serrées, haltères au-dessus de la poitrine.",
      "Descends les haltères sur les côtés jusqu'au niveau des pectoraux.",
      "Pousse vers le haut en les rapprochant légèrement, sans les cogner.",
    ],
    avoid: [
      "Descendre plus bas que ce que ton épaule tolère.",
      "Casser les poignets vers l'arrière.",
    ],
    stretch: "Ouverture pectorale contre un mur.",
  },
  "Développé décliné": {
    equipment: "Barre",
    steps: [
      "Banc incliné vers le bas, jambes bien calées sous les rouleaux.",
      "Descends la barre sous contrôle vers le bas des pectoraux.",
      "Pousse à la verticale jusqu'à bras tendus.",
    ],
    avoid: [
      "Laisser la barre partir vers le cou ou la tête.",
      "Te lancer sans pareur avec une charge lourde.",
    ],
    stretch: "Ouverture pectorale contre un cadre de porte.",
  },
  "Développé incliné barre": {
    equipment: "Barre",
    steps: [
      "Banc à environ 30°, omoplates serrées, pieds au sol.",
      "Descends la barre vers le haut des pectoraux, sous les clavicules.",
      "Pousse vers le haut en gardant les coudes sous la barre.",
    ],
    avoid: [
      "Incliner trop le banc, les épaules prennent le relais.",
      "Te cambrer pour décoller la barre.",
    ],
    stretch: "Ouverture pectorale haute contre un mur.",
  },
  "Développé incliné haltères": {
    equipment: "Haltères",
    steps: [
      "Banc à environ 30°, haltères au niveau du haut des pectoraux.",
      "Pousse vers le haut en rapprochant légèrement les haltères.",
      "Redescends lentement, coudes un peu sous les épaules.",
    ],
    avoid: [
      "Descendre trop bas, l'épaule part en avant.",
      "Poignets cassés vers l'arrière.",
    ],
    stretch: "Ouverture pectorale haute contre un mur.",
  },
  "Écarté à la poulie": {
    equipment: "Poulie",
    steps: [
      "Poulies à hauteur d'épaules, bras ouverts, coudes peu fléchis.",
      "Rapproche les mains devant ta poitrine en arc de cercle.",
      "Reviens lentement jusqu'à sentir l'étirement des pectoraux.",
    ],
    avoid: [
      "Plier les coudes pour tirer plus lourd.",
      "Ouvrir les bras loin derrière la ligne des épaules.",
    ],
    stretch: "Étirement pectoral contre un cadre de porte.",
  },
  "Écarté couché haltères": {
    equipment: "Haltères",
    steps: [
      "Allongé, haltères au-dessus de la poitrine, coudes peu fléchis.",
      "Ouvre les bras sur les côtés jusqu'à hauteur du banc.",
      "Remonte en arc de cercle en serrant les pectoraux.",
    ],
    avoid: [
      "Descendre sous la ligne du banc.",
      "Tendre complètement les coudes, l'articulation encaisse.",
    ],
    stretch: "Bras écartés au sol, paumes vers le haut.",
  },
  "Pec deck (butterfly)": {
    equipment: "Machine",
    steps: [
      "Règle le siège pour avoir les poignées à hauteur de poitrine, dos calé.",
      "Rapproche les bras devant toi en serrant les pectoraux.",
      "Reviens lentement sans laisser la charge retomber.",
    ],
    avoid: [
      "Forcer l'ouverture derrière la ligne des épaules.",
      "Décoller le dos du dossier.",
    ],
    stretch: "Ouverture pectorale contre un cadre de porte.",
  },
  "Pompes": {
    equipment: "Poids du corps",
    steps: [
      "Mains un peu plus larges que les épaules, corps gainé de la tête aux pieds.",
      "Descends la poitrine près du sol, coudes à environ 45° du buste.",
      "Pousse le sol pour remonter, sans perdre l'alignement.",
    ],
    avoid: [
      "Creuser le bas du dos ou lever les fesses.",
      "Écarter les coudes à 90°.",
    ],
    stretch: "Ouverture pectorale contre un mur.",
  },

  // --- Dos ---
  "Hyperextensions lombaires": {
    equipment: "Machine",
    steps: [
      "Hanches calées sur le support, corps aligné, mains croisées sur la poitrine.",
      "Descends le buste lentement en pliant aux hanches, dos plat.",
      "Remonte jusqu'à l'alignement avec les jambes, pas plus haut.",
    ],
    avoid: [
      "Partir en hyperextension en haut du mouvement.",
      "Monter avec un à-coup.",
    ],
    stretch: "Position de l'enfant au sol pour relâcher le bas du dos.",
  },
  "Pull-over haltère": {
    equipment: "Haltères",
    steps: [
      "Allongé, haltère tenu à deux mains au-dessus de la poitrine, coudes peu fléchis.",
      "Descends l'haltère derrière la tête en gardant les bras quasi tendus.",
      "Ramène-le au-dessus de la poitrine en contractant le dos.",
    ],
    avoid: [
      "Descendre plus bas que ton épaule ne le permet.",
      "Plier les coudes pour transformer le mouvement en extension triceps.",
    ],
    stretch: "Bras au-dessus de la tête contre un mur.",
  },
  "Rowing barre": {
    equipment: "Barre",
    steps: [
      "Buste penché à environ 45°, dos plat, genoux légèrement fléchis.",
      "Tire la barre vers le nombril en serrant les omoplates.",
      "Redescends sous contrôle jusqu'à bras tendus.",
    ],
    avoid: [
      "Arrondir le dos.",
      "Te redresser pour lancer la barre avec les lombaires.",
    ],
    stretch: "Accroche-toi à un support et recule les hanches.",
  },
  "Rowing haltères": {
    equipment: "Haltères",
    steps: [
      "Un genou et une main sur le banc, dos plat, haltère bras tendu.",
      "Tire l'haltère vers la hanche, coude près du corps.",
      "Redescends lentement en laissant l'épaule s'étirer.",
    ],
    avoid: [
      "Tourner le buste pour monter la charge.",
      "Tirer vers l'épaule au lieu de la hanche.",
    ],
    stretch: "Étire le dorsal accroché à un montant.",
  },
  "Rowing machine assis": {
    equipment: "Machine",
    steps: [
      "Poitrine contre le support, bras tendus vers les poignées.",
      "Tire les poignées vers toi en serrant les omoplates.",
      "Reviens lentement jusqu'à bras tendus.",
    ],
    avoid: [
      "Décoller la poitrine du support pour tirer.",
      "Monter les épaules vers les oreilles.",
    ],
    stretch: "Bras tendu accroché à un support, recule les hanches.",
  },
  "Rowing T-bar": {
    equipment: "Barre",
    steps: [
      "Buste penché, dos plat, poignées en main bras tendus.",
      "Tire la barre vers le bas de la poitrine, coudes près du corps.",
      "Redescends sous contrôle sans arrondir le dos.",
    ],
    avoid: [
      "Arrondir le dos en bas du mouvement.",
      "Te redresser pour finir avec l'élan.",
    ],
    stretch: "Étirement dorsal accroché à un support.",
  },
  "Shrugs (haussements)": {
    equipment: "Haltères",
    steps: [
      "Debout, charges le long du corps, bras tendus.",
      "Hausse les épaules vers les oreilles, tiens une seconde.",
      "Redescends lentement jusqu'en bas.",
    ],
    avoid: [
      "Faire rouler les épaules.",
      "Plier les coudes pour aider.",
    ],
    stretch: "Penche la tête sur le côté pour étirer le trapèze.",
  },
  "Soulevé de terre": {
    equipment: "Barre",
    steps: [
      "Barre au-dessus du milieu des pieds, tibias proches, dos plat.",
      "Pousse dans le sol et étends hanches et genoux ensemble, barre collée aux jambes.",
      "Debout, redescends en reculant d'abord les hanches.",
    ],
    avoid: [
      "Arrondir le bas du dos.",
      "Tirer la barre avec les bras.",
      "Éloigner la barre des jambes.",
    ],
    stretch: "Étirement léger ischios et fessiers, dos droit.",
  },
  "Tirage horizontal poulie": {
    equipment: "Poulie",
    steps: [
      "Assis, pieds calés, dos droit, bras tendus vers la poignée.",
      "Tire la poignée vers le nombril en serrant les omoplates.",
      "Reviens lentement jusqu'à bras tendus, buste fixe.",
    ],
    avoid: [
      "Te balancer d'avant en arrière.",
      "Te pencher loin en arrière pour finir.",
    ],
    stretch: "Bras tendu vers l'avant accroché à un support.",
  },
  "Tirage poulie prise serrée": {
    equipment: "Poulie",
    steps: [
      "Assis, cuisses calées, prise serrée, bras tendus.",
      "Tire vers le haut de la poitrine, coudes vers le bas et le long du corps.",
      "Remonte lentement jusqu'à bras tendus.",
    ],
    avoid: [
      "Tirer derrière la nuque.",
      "Te pencher en arrière pour lancer la charge.",
    ],
    stretch: "Suspends-toi pour étirer le dorsal.",
  },
  "Tirage vertical poulie": {
    equipment: "Poulie",
    steps: [
      "Cuisses calées, prise un peu plus large que les épaules.",
      "Tire la barre vers le haut de la poitrine en abaissant les omoplates.",
      "Remonte lentement jusqu'à bras tendus.",
    ],
    avoid: [
      "Tirer derrière la nuque.",
      "Te balancer en arrière pour descendre la barre.",
    ],
    stretch: "Suspension bras tendus pour étirer le dorsal.",
  },
  "Tractions": {
    equipment: "Poids du corps",
    steps: [
      "Suspendu, prise en pronation un peu plus large que les épaules.",
      "Tire en abaissant les omoplates jusqu'à passer le menton au-dessus de la barre.",
      "Redescends lentement jusqu'à bras tendus.",
    ],
    avoid: [
      "Te balancer ou donner des coups de jambes.",
      "Faire des demi-répétitions.",
    ],
    stretch: "Reste suspendu bras tendus en fin de série.",
  },

  // --- Épaules ---
  "Développé Arnold": {
    equipment: "Haltères",
    steps: [
      "Assis dos calé, haltères devant les épaules, paumes vers toi.",
      "Pousse au-dessus de la tête en tournant les paumes vers l'avant.",
      "Redescends en refaisant la rotation inverse.",
    ],
    avoid: [
      "Te cambrer pour pousser.",
      "Prendre trop lourd, la rotation se perd.",
    ],
    stretch: "Bras en travers de la poitrine, tire avec l'autre bras.",
  },
  "Développé haltères assis": {
    equipment: "Haltères",
    steps: [
      "Assis dos calé, haltères à hauteur des oreilles.",
      "Pousse au-dessus de la tête sans cogner les haltères.",
      "Redescends lentement à hauteur des oreilles.",
    ],
    avoid: [
      "Cambrer le bas du dos.",
      "Descendre trop bas, l'épaule se fragilise.",
    ],
    stretch: "Bras croisé devant la poitrine.",
  },
  "Développé militaire barre": {
    equipment: "Barre",
    steps: [
      "Debout gainé, barre sur le haut de la poitrine, fessiers serrés.",
      "Pousse la barre au-dessus de la tête en reculant légèrement le visage.",
      "Redescends sous contrôle jusqu'aux clavicules.",
    ],
    avoid: [
      "Cambrer le bas du dos.",
      "Pousser avec les jambes.",
    ],
    stretch: "Bras croisé devant la poitrine.",
  },
  "Élévations frontales": {
    equipment: "Haltères",
    steps: [
      "Debout, haltères devant les cuisses, bras quasi tendus.",
      "Monte les haltères devant toi jusqu'à hauteur des épaules.",
      "Redescends lentement sans relâcher.",
    ],
    avoid: [
      "Lancer avec le buste.",
      "Monter plus haut que les épaules.",
    ],
    stretch: "Bras croisé devant la poitrine.",
  },
  "Élévations latérales haltères": {
    equipment: "Haltères",
    steps: [
      "Debout, haltères le long du corps, coudes légèrement fléchis.",
      "Monte les bras sur les côtés jusqu'à l'horizontale, coudes en tête.",
      "Redescends lentement sans laisser tomber.",
    ],
    avoid: [
      "Monter au-dessus des épaules.",
      "Prendre de l'élan avec le buste.",
      "Hausser les épaules vers les oreilles.",
    ],
    stretch: "Bras croisé devant la poitrine.",
  },
  "Élévations latérales poulie": {
    equipment: "Poulie",
    steps: [
      "De profil à la poulie basse, poignée dans la main opposée.",
      "Monte le bras sur le côté jusqu'à l'horizontale, coude légèrement fléchi.",
      "Redescends lentement en gardant la tension.",
    ],
    avoid: [
      "Pencher le buste pour aider.",
      "Monter au-dessus de l'épaule.",
    ],
    stretch: "Bras croisé devant la poitrine.",
  },
  "Face pull": {
    equipment: "Poulie",
    steps: [
      "Poulie haute avec corde, bras tendus, un pas en arrière.",
      "Tire la corde vers le visage en écartant les mains, coudes hauts.",
      "Tiens une seconde, omoplates serrées, puis reviens lentement.",
    ],
    avoid: [
      "Tirer vers la poitrine, coudes bas.",
      "Prendre trop lourd et te pencher en arrière.",
    ],
    stretch: "Bras croisé devant la poitrine.",
  },
  "Oiseau haltères": {
    equipment: "Haltères",
    steps: [
      "Buste penché presque à l'horizontale, dos plat, haltères sous la poitrine.",
      "Ouvre les bras sur les côtés, coudes légèrement fléchis.",
      "Redescends lentement sans relâcher.",
    ],
    avoid: [
      "Arrondir le dos.",
      "Redresser le buste pour monter.",
    ],
    stretch: "Bras croisé devant la poitrine.",
  },
  "Rowing menton": {
    equipment: "Barre",
    steps: [
      "Debout, barre devant les cuisses, prise largeur d'épaules.",
      "Tire la barre le long du corps jusqu'au bas de la poitrine, coudes hauts.",
      "Redescends lentement jusqu'aux cuisses.",
    ],
    avoid: [
      "Monter trop haut si l'épaule pince.",
      "Prendre une prise trop serrée.",
    ],
    stretch: "Bras croisé devant la poitrine.",
  },

  // --- Biceps ---
  "Curl à la poulie": {
    equipment: "Poulie",
    steps: [
      "Face à la poulie basse, coudes le long du corps.",
      "Fléchis les bras pour monter la barre vers les épaules.",
      "Redescends lentement jusqu'à bras tendus.",
    ],
    avoid: [
      "Avancer les coudes.",
      "Te pencher en arrière pour tirer.",
    ],
    stretch: "Bras tendu en arrière, paume vers le haut.",
  },
  "Curl barre": {
    equipment: "Barre",
    steps: [
      "Debout, barre en supination, coudes collés au corps.",
      "Monte la barre vers les épaules sans bouger les coudes.",
      "Redescends lentement jusqu'à bras tendus.",
    ],
    avoid: [
      "Lancer la barre avec le dos.",
      "Décoller les coudes du corps.",
    ],
    stretch: "Bras tendu paume vers le haut contre un mur.",
  },
  "Curl concentration": {
    equipment: "Haltères",
    steps: [
      "Assis, coude calé contre l'intérieur de la cuisse, bras tendu.",
      "Monte l'haltère vers l'épaule en tournant le petit doigt vers le haut.",
      "Redescends lentement jusqu'à bras tendu.",
    ],
    avoid: [
      "Décoller le coude de la cuisse.",
      "Balancer le buste.",
    ],
    stretch: "Bras tendu en arrière, paume vers le haut.",
  },
  "Curl haltères": {
    equipment: "Haltères",
    steps: [
      "Debout, haltères le long du corps, coudes fixes.",
      "Monte les haltères en tournant les paumes vers le haut.",
      "Redescends lentement jusqu'à bras tendus.",
    ],
    avoid: [
      "Prendre de l'élan avec le dos.",
      "Avancer les coudes en haut du mouvement.",
    ],
    stretch: "Bras tendu paume vers le haut.",
  },
  "Curl incliné haltères": {
    equipment: "Haltères",
    steps: [
      "Assis sur un banc incliné, bras tendus le long du corps.",
      "Fléchis les bras sans avancer les coudes.",
      "Redescends lentement jusqu'à l'étirement complet.",
    ],
    avoid: [
      "Avancer les coudes, l'amplitude se réduit.",
      "Décoller le dos du banc.",
    ],
    stretch: "Bras tendu vers l'arrière, étirement marqué.",
  },
  "Curl marteau": {
    equipment: "Haltères",
    steps: [
      "Debout, prise neutre, pouces vers le haut, coudes fixes.",
      "Monte les haltères vers les épaules sans tourner les poignets.",
      "Redescends lentement jusqu'à bras tendus.",
    ],
    avoid: [
      "Prendre de l'élan.",
      "Décoller les coudes du corps.",
    ],
    stretch: "Bras tendu, paume vers l'intérieur.",
  },
  "Curl pupitre": {
    equipment: "Barre",
    steps: [
      "Aisselles calées sur le pupitre, bras posés, prise en supination.",
      "Monte la barre vers les épaules en gardant les bras sur le pupitre.",
      "Redescends lentement, sans verrouiller les coudes en bas.",
    ],
    avoid: [
      "Tendre brutalement le coude en bas.",
      "Décoller les bras du pupitre.",
    ],
    stretch: "Bras tendu paume vers le haut, en douceur.",
  },

  // --- Triceps ---
  "Barre au front poulie": {
    equipment: "Poulie",
    steps: [
      "Allongé ou debout face à la poulie, bras vers le haut, coudes fixes.",
      "Plie les coudes pour amener la barre vers le front.",
      "Étends les bras sans bouger les coudes.",
    ],
    avoid: [
      "Laisser les coudes s'ouvrir.",
      "Bouger les épaules pour tirer.",
    ],
    stretch: "Coude plié derrière la tête, tire avec l'autre main.",
  },
  "Dips": {
    equipment: "Poids du corps",
    steps: [
      "Bras tendus sur les barres parallèles, buste droit, épaules basses.",
      "Descends en pliant les coudes vers l'arrière, jusqu'à 90° environ.",
      "Pousse pour remonter jusqu'à bras tendus.",
    ],
    avoid: [
      "Descendre trop bas, l'épaule part en avant.",
      "Hausser les épaules vers les oreilles.",
    ],
    stretch: "Coude derrière la tête, tire doucement.",
  },
  "Extension corde poulie": {
    equipment: "Poulie",
    steps: [
      "Face à la poulie haute, corde en main, coudes collés au corps.",
      "Étends les bras vers le bas en écartant la corde en fin de mouvement.",
      "Remonte lentement jusqu'à 90°, coudes fixes.",
    ],
    avoid: [
      "Lever les coudes en remontant.",
      "Te pencher sur la corde pour pousser.",
    ],
    stretch: "Coude plié derrière la tête.",
  },
  "Extensions triceps poulie": {
    equipment: "Poulie",
    steps: [
      "Face à la poulie haute, barre en main, coudes collés au corps.",
      "Étends les bras vers le bas jusqu'à extension complète.",
      "Remonte lentement jusqu'à 90°, coudes fixes.",
    ],
    avoid: [
      "Décoller les coudes du corps.",
      "Pousser avec le poids du buste.",
    ],
    stretch: "Coude derrière la tête, tire avec l'autre main.",
  },
  "Extensions verticales haltère": {
    equipment: "Haltères",
    steps: [
      "Assis ou debout, haltère tenu à deux mains au-dessus de la tête.",
      "Descends l'haltère derrière la nuque, coudes pointés vers le haut.",
      "Étends les bras pour remonter.",
    ],
    avoid: [
      "Écarter les coudes.",
      "Cambrer le bas du dos.",
    ],
    stretch: "Coude plié derrière la tête.",
  },
  "Kickback haltère": {
    equipment: "Haltères",
    steps: [
      "Buste penché, dos plat, bras collé au corps, coude haut.",
      "Étends l'avant-bras vers l'arrière jusqu'à bras tendu.",
      "Reviens lentement à 90°, sans bouger le coude.",
    ],
    avoid: [
      "Balancer le bras pour lancer la charge.",
      "Laisser tomber le coude.",
    ],
    stretch: "Coude derrière la tête, en douceur.",
  },
  "Skull crushers": {
    equipment: "Barre",
    steps: [
      "Allongé, barre au-dessus du visage, bras tendus.",
      "Plie les coudes pour descendre la barre vers le front.",
      "Étends les bras sans bouger les coudes.",
    ],
    avoid: [
      "Écarter les coudes.",
      "Descendre vite près du visage.",
    ],
    stretch: "Coude derrière la tête.",
  },

  // --- Quadriceps ---
  "Fentes haltères": {
    equipment: "Haltères",
    steps: [
      "Debout, haltères le long du corps, fais un grand pas en avant.",
      "Descends le genou arrière près du sol, buste droit.",
      "Pousse sur la jambe avant pour revenir.",
    ],
    avoid: [
      "Laisser le genou avant rentrer vers l'intérieur.",
      "Pencher le buste en avant.",
    ],
    stretch: "Debout, attrape ta cheville pour étirer l'avant de la cuisse.",
  },
  "Front squat": {
    equipment: "Barre",
    steps: [
      "Barre posée sur l'avant des épaules, coudes hauts.",
      "Descends en gardant le buste droit et les talons au sol.",
      "Remonte en poussant dans tout le pied, coudes toujours hauts.",
    ],
    avoid: [
      "Laisser les coudes tomber.",
      "Décoller les talons.",
    ],
    stretch: "Quadriceps debout, cheville à la main.",
  },
  "Hack squat": {
    equipment: "Machine",
    steps: [
      "Dos et épaules calés, pieds largeur d'épaules sur la plateforme.",
      "Descends jusqu'à cuisses parallèles à la plateforme.",
      "Pousse dans les talons pour remonter, sans verrouiller les genoux.",
    ],
    avoid: [
      "Décoller les talons ou le bas du dos.",
      "Laisser les genoux rentrer vers l'intérieur.",
    ],
    stretch: "Quadriceps debout, cheville à la main.",
  },
  "Leg extension": {
    equipment: "Machine",
    steps: [
      "Dos calé, genoux alignés avec l'axe de la machine.",
      "Étends les jambes jusqu'en haut, tiens une seconde.",
      "Redescends lentement sans laisser tomber la charge.",
    ],
    avoid: [
      "Lancer la charge avec un à-coup.",
      "Décoller les fesses du siège.",
    ],
    stretch: "Talon vers la fesse, debout.",
  },
  "Presse à cuisses": {
    equipment: "Machine",
    steps: [
      "Dos et fesses calés, pieds largeur d'épaules sur la plateforme.",
      "Descends jusqu'à environ 90° aux genoux.",
      "Pousse dans les talons, sans verrouiller les genoux en haut.",
    ],
    avoid: [
      "Décoller les fesses du siège en bas.",
      "Verrouiller les genoux d'un coup sec.",
    ],
    stretch: "Quadriceps debout, cheville à la main.",
  },
  "Sissy squat": {
    equipment: "Poids du corps",
    steps: [
      "Debout sur la pointe des pieds, tiens-toi à un support.",
      "Avance les genoux et penche le buste en arrière, hanches tendues.",
      "Descends autant que tu contrôles puis remonte.",
    ],
    avoid: [
      "Plier les hanches, le mouvement perd son intérêt.",
      "Descendre trop bas trop vite, les genoux encaissent.",
    ],
    stretch: "Quadriceps debout, cheville à la main.",
  },
  "Squat barre": {
    equipment: "Barre",
    steps: [
      "Barre sur le haut du dos, pieds largeur d'épaules, gainé.",
      "Descends hanches en arrière jusqu'à cuisses parallèles, dos plat.",
      "Remonte en poussant dans tout le pied, genoux dans l'axe.",
    ],
    avoid: [
      "Arrondir le dos en bas.",
      "Laisser les genoux rentrer vers l'intérieur.",
      "Décoller les talons.",
    ],
    stretch: "Quadriceps debout et ouverture des hanches.",
  },
  "Squat bulgare": {
    equipment: "Haltères",
    steps: [
      "Pied arrière posé sur un banc, pied avant un grand pas devant.",
      "Descends le genou arrière vers le sol, buste droit.",
      "Pousse sur le talon avant pour remonter.",
    ],
    avoid: [
      "Laisser le genou avant rentrer vers l'intérieur.",
      "Placer le pied avant trop près du banc.",
    ],
    stretch: "Quadriceps debout, cheville à la main.",
  },
  "Step-up": {
    equipment: "Haltères",
    steps: [
      "Pied entier posé sur un banc stable, haltères en main.",
      "Monte en poussant dans le talon du pied posé.",
      "Redescends lentement, même jambe en appui.",
    ],
    avoid: [
      "Pousser avec la jambe restée au sol.",
      "Choisir un banc trop haut.",
    ],
    stretch: "Quadriceps et fessiers, debout.",
  },

  // --- Ischio-jambiers ---
  "Good morning": {
    equipment: "Barre",
    steps: [
      "Barre sur le haut du dos, genoux légèrement fléchis.",
      "Penche le buste en reculant les hanches, dos plat.",
      "Remonte en poussant les hanches vers l'avant.",
    ],
    avoid: [
      "Arrondir le dos.",
      "Charger lourd, ce mouvement se travaille léger.",
    ],
    stretch: "Jambes tendues, penche-toi vers les orteils en douceur.",
  },
  "Leg curl allongé": {
    equipment: "Machine",
    steps: [
      "Allongé sur le ventre, rouleau au-dessus des talons.",
      "Ramène les talons vers les fesses.",
      "Redescends lentement jusqu'à jambes presque tendues.",
    ],
    avoid: [
      "Décoller les hanches du banc.",
      "Lancer la charge avec un à-coup.",
    ],
    stretch: "Jambe tendue, attrape la pointe du pied.",
  },
  "Leg curl assis": {
    equipment: "Machine",
    steps: [
      "Assis, cuisses bloquées par le coussin, rouleau sous les mollets.",
      "Fléchis les jambes sous le siège.",
      "Reviens lentement jusqu'à jambes presque tendues.",
    ],
    avoid: [
      "Décoller les cuisses du coussin.",
      "Laisser la charge remonter d'un coup.",
    ],
    stretch: "Jambe tendue, penche-toi vers le pied.",
  },
  "Nordic curl": {
    equipment: "Poids du corps",
    steps: [
      "À genoux sur un tapis, chevilles bloquées, corps droit.",
      "Descends le buste vers l'avant le plus lentement possible.",
      "Rattrape-toi avec les mains, puis repousse pour remonter.",
    ],
    avoid: [
      "Plier les hanches pendant la descente.",
      "Descendre plus loin que tu ne peux freiner.",
    ],
    stretch: "Ischios jambe tendue, mains vers les orteils.",
  },
  "Souleve de terre jambes tendues": {
    equipment: "Barre",
    steps: [
      "Debout, barre en main, genoux à peine fléchis.",
      "Descends la barre le long des jambes, hanches en arrière, dos plat.",
      "Remonte en contractant les ischios et les fessiers.",
    ],
    avoid: [
      "Arrondir le dos.",
      "Éloigner la barre des jambes.",
    ],
    stretch: "Jambes tendues, mains vers le sol en douceur.",
  },
  "Soulevé de terre roumain": {
    equipment: "Barre",
    steps: [
      "Debout, barre en main, genoux légèrement fléchis.",
      "Recule les hanches et descends la barre le long des cuisses, dos plat.",
      "Remonte en poussant les hanches vers l'avant.",
    ],
    avoid: [
      "Arrondir le dos.",
      "Descendre plus bas que ta souplesse le permet.",
    ],
    stretch: "Ischios jambes tendues, en douceur.",
  },

  // --- Fessiers ---
  "Abducteurs machine": {
    equipment: "Machine",
    steps: [
      "Assis dos calé, coussins à l'extérieur des genoux.",
      "Écarte les cuisses contre la résistance.",
      "Reviens lentement sans laisser les plaques se toucher.",
    ],
    avoid: [
      "Te pencher en arrière pour tricher.",
      "Laisser la charge revenir d'un coup.",
    ],
    stretch: "Cheville sur le genou opposé, penche le buste (figure 4).",
  },
  "Fentes marchées": {
    equipment: "Haltères",
    steps: [
      "Debout, haltères en main, fais un grand pas en avant.",
      "Descends le genou arrière près du sol, buste droit.",
      "Pousse sur la jambe avant et enchaîne avec l'autre jambe.",
    ],
    avoid: [
      "Laisser le genou avant rentrer vers l'intérieur.",
      "Faire des pas trop courts.",
    ],
    stretch: "Figure 4 assis, cheville sur le genou opposé.",
  },
  "Glute bridge": {
    equipment: "Poids du corps",
    steps: [
      "Allongé sur le dos, genoux fléchis, pieds à plat au sol.",
      "Monte le bassin en poussant dans les talons.",
      "Serre les fessiers en haut puis redescends lentement.",
    ],
    avoid: [
      "Cambrer le bas du dos en haut.",
      "Pousser sur la pointe des pieds.",
    ],
    stretch: "Genou ramené vers la poitrine au sol.",
  },
  "Hip thrust": {
    equipment: "Barre",
    steps: [
      "Haut du dos calé sur un banc, barre sur les hanches, pieds à plat.",
      "Monte le bassin jusqu'à l'alignement épaules, hanches, genoux.",
      "Serre les fessiers en haut puis redescends sous contrôle.",
    ],
    avoid: [
      "Partir en hyperextension du dos.",
      "Pousser sur la pointe des pieds.",
    ],
    stretch: "Figure 4, cheville sur le genou opposé.",
  },
  "Hip thrust machine": {
    equipment: "Machine",
    steps: [
      "Dos calé, ceinture ou coussin sur les hanches, pieds à plat.",
      "Pousse le bassin vers le haut jusqu'à l'alignement.",
      "Serre les fessiers en haut puis redescends lentement.",
    ],
    avoid: [
      "Cambrer le bas du dos.",
      "Réduire l'amplitude pour charger plus.",
    ],
    stretch: "Figure 4, cheville sur le genou opposé.",
  },
  "Kickback fessier poulie": {
    equipment: "Poulie",
    steps: [
      "Sangle à la cheville, face à la poulie basse, mains sur le support.",
      "Pousse la jambe vers l'arrière en serrant le fessier.",
      "Reviens lentement sans poser le pied.",
    ],
    avoid: [
      "Cambrer le dos pour monter la jambe.",
      "Lancer la jambe avec l'élan.",
    ],
    stretch: "Figure 4 assis.",
  },

  // --- Mollets ---
  "Mollets à la presse": {
    equipment: "Machine",
    steps: [
      "Pointes des pieds au bas de la plateforme, jambes quasi tendues.",
      "Pousse avec les pointes jusqu'à extension complète des chevilles.",
      "Redescends lentement jusqu'à l'étirement des mollets.",
    ],
    avoid: [
      "Verrouiller les genoux d'un coup sec.",
      "Réduire l'amplitude.",
    ],
    stretch: "Talon dans le vide sur une marche, descends doucement.",
  },
  "Mollets assis": {
    equipment: "Machine",
    steps: [
      "Assis, coussin sur le bas des cuisses, pointes sur la marche.",
      "Monte sur la pointe des pieds le plus haut possible.",
      "Redescends lentement, talons sous la marche.",
    ],
    avoid: [
      "Rebondir en bas.",
      "Faire des demi-répétitions.",
    ],
    stretch: "Talon dans le vide sur une marche.",
  },
  "Mollets debout": {
    equipment: "Machine",
    steps: [
      "Debout, épaules sous les coussins, pointes des pieds sur la marche.",
      "Monte sur la pointe des pieds, tiens une seconde.",
      "Descends les talons sous la marche, lentement.",
    ],
    avoid: [
      "Rebondir en bas.",
      "Plier les genoux pour aider.",
    ],
    stretch: "Avant-pied sur une marche, talon vers le bas.",
  },
  "Mollets unilatéral debout": {
    equipment: "Poids du corps",
    steps: [
      "Sur une jambe, pointe du pied sur une marche, tiens-toi d'une main.",
      "Monte sur la pointe le plus haut possible.",
      "Redescends lentement, talon sous la marche.",
    ],
    avoid: [
      "Rebondir en bas.",
      "Te tirer avec la main qui tient le support.",
    ],
    stretch: "Talon dans le vide sur une marche.",
  },

  // --- Abdominaux / gainage ---
  "Crunch à la poulie": {
    equipment: "Poulie",
    steps: [
      "À genoux face à la poulie haute, corde tenue près de la tête.",
      "Enroule le buste vers le bassin en contractant les abdos.",
      "Remonte lentement sans relâcher la tension.",
    ],
    avoid: [
      "Tirer avec les bras.",
      "Bouger les hanches au lieu d'enrouler le dos.",
    ],
    stretch: "Allongé bras au-dessus de la tête, étire le ventre.",
  },
  "Crunchs": {
    equipment: "Poids du corps",
    steps: [
      "Allongé, genoux fléchis, mains près des tempes.",
      "Décolle les épaules en soufflant, bas du dos au sol.",
      "Redescends lentement sans poser complètement la tête.",
    ],
    avoid: [
      "Tirer sur la nuque.",
      "Décoller tout le dos du sol.",
    ],
    stretch: "Allongé sur le ventre, redresse le buste sur les bras (cobra léger).",
  },
  "Gainage latéral": {
    equipment: "Poids du corps",
    steps: [
      "Sur le côté, coude sous l'épaule, jambes tendues l'une sur l'autre.",
      "Monte les hanches pour aligner tête, bassin et pieds.",
      "Tiens la position en respirant calmement, puis change de côté.",
    ],
    avoid: [
      "Laisser tomber les hanches.",
      "Pencher le buste vers l'avant.",
    ],
    stretch: "Étirement latéral debout, bras au-dessus de la tête.",
  },
  "Mountain climbers": {
    equipment: "Poids du corps",
    steps: [
      "En position de pompe, mains sous les épaules, corps gainé.",
      "Ramène un genou vers la poitrine.",
      "Alterne les jambes à un rythme régulier, hanches basses.",
    ],
    avoid: [
      "Lever les fesses.",
      "Creuser le bas du dos.",
    ],
    stretch: "Cobra léger au sol.",
  },
  "Planche": {
    equipment: "Poids du corps",
    steps: [
      "Sur les avant-bras, coudes sous les épaules, jambes tendues.",
      "Aligne tête, dos et talons, abdos et fessiers serrés.",
      "Tiens la position en respirant calmement.",
    ],
    avoid: [
      "Creuser le bas du dos.",
      "Lever les fesses.",
    ],
    stretch: "Cobra léger au sol.",
  },
  "Relevés de jambes": {
    equipment: "Poids du corps",
    steps: [
      "Allongé, mains sous les fesses, bas du dos plaqué au sol.",
      "Monte les jambes tendues jusqu'à la verticale.",
      "Redescends lentement sans toucher le sol.",
    ],
    avoid: [
      "Cambrer le bas du dos en descendant.",
      "Laisser retomber les jambes.",
    ],
    stretch: "Cobra léger au sol.",
  },
  "Relevés de jambes suspendus": {
    equipment: "Poids du corps",
    steps: [
      "Suspendu à une barre, bras tendus, corps immobile.",
      "Monte les genoux ou les jambes vers la poitrine en enroulant le bassin.",
      "Redescends lentement sans te balancer.",
    ],
    avoid: [
      "Te balancer pour monter.",
      "Monter les jambes sans enrouler le bassin.",
    ],
    stretch: "Reste suspendu, puis cobra léger au sol.",
  },
  "Roue abdominale": {
    equipment: "Poids du corps",
    steps: [
      "À genoux, mains sur la roue sous les épaules, dos gainé.",
      "Déroule la roue vers l'avant sans creuser le dos.",
      "Reviens en contractant les abdos.",
    ],
    avoid: [
      "Creuser le bas du dos.",
      "Aller plus loin que tu ne contrôles.",
    ],
    stretch: "Cobra léger au sol.",
  },
  "Russian twist": {
    equipment: "Poids du corps",
    steps: [
      "Assis, buste incliné en arrière, pieds décollés ou posés.",
      "Tourne le buste d'un côté en gardant le dos droit.",
      "Reviens au centre et tourne de l'autre côté.",
    ],
    avoid: [
      "Bouger seulement les bras.",
      "Arrondir le dos.",
    ],
    stretch: "Rotation douce du buste, debout.",
  },

  // --- Autre ---
  "Avant-bras curl poignets": {
    equipment: "Barre",
    steps: [
      "Assis, avant-bras posés sur les cuisses, poignets dans le vide.",
      "Fléchis les poignets vers le haut.",
      "Redescends lentement jusqu'à l'étirement.",
    ],
    avoid: [
      "Soulever les avant-bras.",
      "Faire des à-coups.",
    ],
    stretch: "Bras tendu, tire les doigts vers le bas puis vers le haut.",
  },
  "Cardio tapis": {
    equipment: "Tapis",
    steps: [
      "Commence par 3 à 5 minutes de marche pour t'échauffer.",
      "Monte l'allure progressivement, posture droite, foulée souple.",
      "Termine par quelques minutes de marche pour récupérer.",
    ],
    avoid: [
      "T'agripper aux barres.",
      "Augmenter vitesse ou pente trop vite.",
    ],
    stretch: "Mollets et ischios après l'effort.",
  },
};

const GUIDES_BY_KEY: ReadonlyMap<string, ExerciseGuide> = new Map(
  Object.entries(EXERCISE_GUIDES).map(([name, guide]) => [exerciseKey(name), guide]),
);

/**
 * Fiche d'un exercice système, ou `null` (exercice perso, ou inconnu du
 * catalogue) : dans ce cas la fiche n'affiche ni « Exécution » ni « À éviter ».
 */
export function getGuide(
  name: string,
  options: { isCustom?: boolean } = {},
): ExerciseGuide | null {
  if (options.isCustom) return null;
  return GUIDES_BY_KEY.get(exerciseKey(name)) ?? null;
}
