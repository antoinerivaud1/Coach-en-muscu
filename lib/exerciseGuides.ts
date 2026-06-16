// Fiches techniques concises par exercice. Mouvement / erreurs à éviter / étirement.
// Rédigées à partir des techniques d'exécution standard.

export type ExerciseGuide = { how: string; avoid: string; stretch: string };

export const EXERCISE_GUIDES: Record<string, ExerciseGuide> = {
  // --- Pectoraux ---
  "Cross-over poulie": { how: "Poulies hautes, buste légèrement penché, ramène les poignées devant toi en arc, coudes peu fléchis.", avoid: "Ne plie pas les coudes comme un développé et ne te cambre pas.", stretch: "Bras écartés contre un cadre de porte, avance le buste." },
  "Développé couché barre": { how: "Allongé, omoplates serrées, descends la barre vers le bas des pectoraux puis pousse jusqu'à extension.", avoid: "Ne rebondis pas sur la poitrine et ne décolle pas les fesses du banc.", stretch: "Bras tendu sur le côté contre un mur, tourne le buste à l'opposé." },
  "Développé couché haltères": { how: "Allongé, haltères au niveau des pectoraux, pousse vers le haut en les rapprochant légèrement.", avoid: "Ne descends pas trop bas si l'épaule tire; poignets droits.", stretch: "Ouverture pectorale contre un mur." },
  "Développé décliné": { how: "Banc incliné vers le bas, descends vers le bas des pectoraux puis pousse à la verticale.", avoid: "Cale bien tes jambes; ne laisse pas la charge partir vers la tête.", stretch: "Ouverture pectorale contre un cadre de porte." },
  "Développé incliné barre": { how: "Banc à ~30°, descends la barre vers le haut des pectoraux, pousse vers le haut.", avoid: "Inclinaison trop forte = trop d'épaules; évite de cambrer.", stretch: "Ouverture pectorale haute contre un mur." },
  "Développé incliné haltères": { how: "Banc à ~30°, haltères au niveau du haut des pecs, pousse en les rapprochant.", avoid: "Ne descends pas trop bas; poignets neutres.", stretch: "Ouverture pectorale haute contre un mur." },
  "Écarté à la poulie": { how: "Poulies à hauteur d'épaule, bras peu fléchis, rapproche les mains devant toi en arc.", avoid: "Ne plie pas les coudes; reste léger et contrôlé.", stretch: "Étirement pectoral contre un cadre de porte." },
  "Écarté couché haltères": { how: "Allongé, bras peu fléchis, ouvre les haltères sur les côtés puis remonte en arc.", avoid: "Ne descends pas trop bas; garde les coudes un peu fléchis.", stretch: "Bras écartés au sol, paumes vers le haut." },
  "Pec deck (butterfly)": { how: "Assis dos calé, avant-bras sur les coussinets, rapproche les bras devant la poitrine.", avoid: "Ne force pas l'ouverture derrière la ligne des épaules.", stretch: "Ouverture pectorale contre un cadre de porte." },
  "Pompes": { how: "Mains un peu plus larges que les épaules, corps gainé, descends la poitrine près du sol puis pousse.", avoid: "Ne creuse pas le bas du dos; ne laisse pas les coudes s'écarter à 90°.", stretch: "Ouverture pectorale contre un mur." },

  // --- Dos ---
  "Hyperextensions lombaires": { how: "Hanches calées sur le banc, descends le buste puis remonte jusqu'à l'alignement.", avoid: "Ne pars pas en hyperextension en haut; mouvement contrôlé.", stretch: "Position de l'enfant au sol pour relâcher le bas du dos." },
  "Pull-over haltère": { how: "Allongé en travers d'un banc, descends l'haltère derrière la tête bras peu fléchis puis ramène au-dessus.", avoid: "Ne descends pas plus bas que le confort de l'épaule.", stretch: "Bras au-dessus de la tête contre un mur." },
  "Rowing barre": { how: "Buste penché ~45°, dos plat, tire la barre vers le nombril en serrant les omoplates.", avoid: "N'arrondis pas le dos et n'utilise pas l'élan des lombaires.", stretch: "Accroche-toi à un support et recule les hanches." },
  "Rowing haltères": { how: "Un genou et une main sur le banc, tire l'haltère vers la hanche, coude près du corps.", avoid: "Ne tourne pas le buste pour tricher; dos plat.", stretch: "Étire le dorsal accroché à un montant." },
  "Rowing machine assis": { how: "Poitrine contre le support, tire les poignées vers toi en serrant les omoplates.", avoid: "Ne te balance pas d'avant en arrière.", stretch: "Bras tendu accroché à un support, recule les hanches." },
  "Rowing T-bar": { how: "Buste penché dos plat, tire la barre vers le torse, coudes près du corps.", avoid: "N'arrondis pas le dos; évite l'élan.", stretch: "Étirement dorsal accroché à un support." },
  "Shrugs (haussements)": { how: "Debout charges en main, hausse les épaules vers les oreilles puis redescends lentement.", avoid: "Ne roule pas les épaules; garde le cou détendu.", stretch: "Penche la tête sur le côté pour étirer le trapèze." },
  "Soulevé de terre": { how: "Barre près des tibias, dos plat, pousse dans le sol et étends hanches et genoux ensemble.", avoid: "N'arrondis JAMAIS le bas du dos; ne tire pas avec les bras.", stretch: "Étirement léger ischios/fessiers, dos droit." },
  "Tirage horizontal poulie": { how: "Assis dos droit, tire la poignée vers le nombril en serrant les omoplates.", avoid: "Ne te penche pas exagérément en arrière.", stretch: "Bras tendu vers l'avant accroché à un support." },
  "Tirage poulie prise serrée": { how: "Assis, prise serrée, tire vers le bas du sternum, coudes vers le bas.", avoid: "Ne tire pas derrière la nuque; pas d'élan.", stretch: "Suspends-toi pour étirer le dorsal." },
  "Tirage vertical poulie": { how: "Cuisses calées, tire la barre vers le haut de la poitrine en serrant les omoplates.", avoid: "Ne tire pas derrière la nuque et ne te balance pas.", stretch: "Suspension bras tendus pour étirer le dorsal." },
  "Tractions": { how: "Suspendu en pronation, tire jusqu'à passer le menton au-dessus de la barre, omoplates basses.", avoid: "Évite les à-coups et l'amplitude partielle.", stretch: "Reste suspendu bras tendus en fin de série." },

  // --- Épaules ---
  "Développé Arnold": { how: "Assis, paumes vers toi en bas, pousse en tournant les paumes vers l'avant en haut.", avoid: "Ne cambre pas le dos; charges modérées.", stretch: "Bras en travers de la poitrine, tire avec l'autre bras." },
  "Développé haltères assis": { how: "Assis dos calé, haltères au niveau des oreilles, pousse au-dessus de la tête.", avoid: "Ne descends pas trop bas; ne cambre pas le dos.", stretch: "Bras croisé devant la poitrine." },
  "Développé militaire barre": { how: "Debout gainé, barre au niveau des clavicules, pousse au-dessus de la tête.", avoid: "Ne cambre pas le bas du dos; serre les fessiers.", stretch: "Bras croisé devant la poitrine." },
  "Élévations frontales": { how: "Monte l'haltère devant toi jusqu'à hauteur des yeux, bras quasi tendu.", avoid: "Pas d'élan du buste; reste contrôlé.", stretch: "Bras croisé devant la poitrine." },
  "Élévations latérales haltères": { how: "Monte les haltères sur les côtés jusqu'à l'horizontale, coudes légèrement fléchis.", avoid: "Ne monte pas au-dessus des épaules; pas d'élan.", stretch: "Bras croisé devant la poitrine." },
  "Élévations latérales poulie": { how: "Poulie basse derrière toi, monte le bras sur le côté jusqu'à l'horizontale.", avoid: "Pas d'élan; garde le buste fixe.", stretch: "Bras croisé devant la poitrine." },
  "Face pull": { how: "Poulie haute avec corde, tire vers le visage en écartant les mains, coudes hauts.", avoid: "Ne tire pas trop bas; reste léger.", stretch: "Bras croisé devant la poitrine." },
  "Oiseau haltères": { how: "Buste penché dos plat, ouvre les haltères sur les côtés en serrant les omoplates.", avoid: "N'arrondis pas le dos; charges légères.", stretch: "Bras croisé devant la poitrine." },
  "Rowing menton": { how: "Tire la barre le long du corps jusqu'aux clavicules, coudes hauts.", avoid: "Ne monte pas trop haut si l'épaule pince; prise pas trop serrée.", stretch: "Bras croisé devant la poitrine." },

  // --- Biceps ---
  "Curl à la poulie": { how: "Poulie basse, coudes fixes le long du corps, fléchis les bras vers les épaules.", avoid: "Ne bouge pas les coudes ni le buste.", stretch: "Bras tendu en arrière, paume vers le haut." },
  "Curl barre": { how: "Debout coudes fixes, monte la barre vers les épaules puis redescends en contrôle.", avoid: "Pas d'élan du dos; ne décolle pas les coudes.", stretch: "Bras tendu paume vers le haut contre un mur." },
  "Curl concentration": { how: "Assis, coude appuyé sur la cuisse, fléchis l'haltère vers l'épaule.", avoid: "Ne balance pas; isole le biceps.", stretch: "Bras tendu en arrière, paume vers le haut." },
  "Curl haltères": { how: "Debout coudes fixes, monte les haltères en supinant, redescends lentement.", avoid: "Pas d'élan; poignets stables.", stretch: "Bras tendu paume vers le haut." },
  "Curl incliné haltères": { how: "Assis sur banc incliné, bras le long du corps, fléchis sans avancer les coudes.", avoid: "Ne raccourcis pas l'amplitude en avançant le coude.", stretch: "Bras tendu vers l'arrière, étirement marqué." },
  "Curl marteau": { how: "Prise neutre (pouces vers le haut), monte les haltères vers les épaules.", avoid: "Pas d'élan; coudes fixes.", stretch: "Bras tendu, paume vers l'intérieur." },
  "Curl pupitre": { how: "Bras posés sur le pupitre, monte la barre puis redescends sans tendre brutalement.", avoid: "Ne tends pas violemment le coude en bas.", stretch: "Bras tendu paume vers le haut, en douceur." },

  // --- Triceps ---
  "Barre au front poulie": { how: "Poulie, coudes hauts et fixes, étends les avant-bras vers le bas.", avoid: "Ne bouge pas les coudes; contrôle la charge.", stretch: "Coude plié derrière la tête, tire avec l'autre main." },
  "Dips": { how: "Appuis parallèles, buste droit pour les triceps, descends coudes vers l'arrière puis pousse.", avoid: "Ne descends pas trop bas (épaule); reste droit pour viser les triceps.", stretch: "Coude derrière la tête, tire doucement." },
  "Extension corde poulie": { how: "Poulie haute, coudes au corps, étends en écartant la corde en bas.", avoid: "Ne lève pas les coudes; pas d'élan du buste.", stretch: "Coude plié derrière la tête." },
  "Extensions triceps poulie": { how: "Poulie haute avec barre, coudes fixes, étends les bras vers le bas.", avoid: "Ne décolle pas les coudes; buste stable.", stretch: "Coude derrière la tête, tire avec l'autre main." },
  "Extensions verticales haltère": { how: "Haltère au-dessus de la tête, descends derrière la nuque coudes hauts puis étends.", avoid: "Ne écarte pas les coudes; contrôle derrière la tête.", stretch: "Coude plié derrière la tête." },
  "Kickback haltère": { how: "Buste penché, coude haut et fixe, étends l'avant-bras vers l'arrière.", avoid: "Ne balance pas; garde le coude immobile.", stretch: "Coude derrière la tête, en douceur." },
  "Skull crushers": { how: "Allongé, descends la barre vers le front coudes fixes puis étends.", avoid: "Ne écarte pas les coudes; descends en contrôle près du front.", stretch: "Coude derrière la tête." },

  // --- Quadriceps ---
  "Fentes haltères": { how: "Grand pas en avant, descends le genou arrière vers le sol, buste droit, pousse pour revenir.", avoid: "Le genou avant ne part pas vers l'intérieur; ne penche pas le buste.", stretch: "Debout, attrape ta cheville pour étirer l'avant de la cuisse." },
  "Front squat": { how: "Barre sur l'avant des épaules, coudes hauts, descends buste droit puis remonte.", avoid: "Ne laisse pas les coudes tomber; talons au sol.", stretch: "Quadriceps debout, cheville à la main." },
  "Hack squat": { how: "Dos contre la machine, pieds devant, descends à 90° puis pousse dans les talons.", avoid: "Ne décolle pas les talons ni le bas du dos.", stretch: "Quadriceps debout, cheville à la main." },
  "Leg extension": { how: "Assis, étends les jambes jusqu'à quasi tension puis redescends en contrôle.", avoid: "Ne claque pas l'extension; règle bien le dossier.", stretch: "Talon vers la fesse, debout." },
  "Presse à cuisses": { how: "Pieds largeur d'épaules, descends à 90° puis pousse sans verrouiller brutalement.", avoid: "Ne décolle pas les fesses; ne verrouille pas sec les genoux.", stretch: "Quadriceps debout, cheville à la main." },
  "Sissy squat": { how: "Sur la pointe, recule les genoux et penche le buste en arrière, descends puis remonte.", avoid: "Exigeant pour les genoux: reste léger et progressif.", stretch: "Quadriceps debout, cheville à la main." },
  "Squat barre": { how: "Barre sur le haut du dos, descends hanches en arrière sous la parallèle dos plat, remonte.", avoid: "N'arrondis pas le dos; genoux dans l'axe des pieds, talons au sol.", stretch: "Quadriceps debout + ouverture des hanches." },
  "Squat bulgare": { how: "Pied arrière surélevé, descends le genou avant à 90°, buste droit, remonte.", avoid: "Genou avant stable dans l'axe; ne te penche pas trop.", stretch: "Quadriceps debout, cheville à la main." },
  "Step-up": { how: "Monte sur un banc en poussant dans le talon, contrôle la descente.", avoid: "Ne pousse pas avec la jambe restée au sol; banc pas trop haut.", stretch: "Quadriceps et fessiers, debout." },

  // --- Ischio-jambiers ---
  "Good morning": { how: "Barre sur le dos, genoux peu fléchis, penche le buste en reculant les hanches, dos plat.", avoid: "N'arrondis pas le dos; charges légères, amplitude maîtrisée.", stretch: "Jambes tendues, penche-toi vers les orteils en douceur." },
  "Leg curl allongé": { how: "Allongé, fléchis les talons vers les fesses puis redescends en contrôle.", avoid: "Ne décolle pas les hanches; pas d'à-coups.", stretch: "Jambe tendue, attrape la pointe du pied." },
  "Leg curl assis": { how: "Assis cuisses calées, fléchis les jambes sous le siège puis reviens lentement.", avoid: "Ne décolle pas les cuisses du coussin.", stretch: "Jambe tendue, penche-toi vers le pied." },
  "Nordic curl": { how: "À genoux chevilles bloquées, descends le buste lentement en freinant puis reviens.", avoid: "Très intense: ne descends que là où tu peux freiner.", stretch: "Ischios jambe tendue, mains vers les orteils." },
  "Souleve de terre jambes tendues": { how: "Genoux peu fléchis, descends la barre le long des jambes dos plat, hanches en arrière.", avoid: "N'arrondis pas le dos; garde la barre près du corps.", stretch: "Jambes tendues, mains vers le sol en douceur." },
  "Soulevé de terre roumain": { how: "Depuis debout, recule les hanches, descends la barre le long des cuisses dos plat puis remonte.", avoid: "N'arrondis pas le dos; ne descends pas au-delà de ta souplesse.", stretch: "Ischios jambes tendues, en douceur." },

  // --- Fessiers ---
  "Abducteurs machine": { how: "Assis, écarte les cuisses contre la résistance puis reviens en contrôle.", avoid: "Ne te penche pas en arrière pour tricher.", stretch: "Cheville sur le genou opposé, penche le buste (figure 4)." },
  "Fentes marchées": { how: "Avance en fentes alternées, genou arrière vers le sol, buste droit.", avoid: "Genou avant dans l'axe; ne penche pas trop le buste.", stretch: "Figure 4 assis: cheville sur le genou opposé." },
  "Glute bridge": { how: "Au sol genoux fléchis, monte le bassin en serrant les fessiers en haut.", avoid: "Ne cambre pas le bas du dos; pousse dans les talons.", stretch: "Genou ramené vers la poitrine au sol." },
  "Hip thrust": { how: "Haut du dos sur un banc, barre sur les hanches, monte le bassin et serre les fessiers.", avoid: "Ne pars pas en hyperextension du dos; menton rentré.", stretch: "Figure 4: cheville sur le genou opposé." },
  "Hip thrust machine": { how: "Dos calé, pousse la plateforme avec les hanches en serrant les fessiers en haut.", avoid: "Ne cambre pas; amplitude contrôlée.", stretch: "Figure 4: cheville sur le genou opposé." },
  "Kickback fessier poulie": { how: "Sangle à la cheville, pousse la jambe vers l'arrière en serrant le fessier.", avoid: "Ne cambre pas le dos; pas d'élan.", stretch: "Figure 4 assis." },

  // --- Mollets ---
  "Mollets à la presse": { how: "Pointes sur la plateforme, pousse en extension de cheville puis descends les talons.", avoid: "Ne verrouille pas les genoux sec; amplitude complète.", stretch: "Talon dans le vide sur une marche, descends doucement." },
  "Mollets assis": { how: "Assis charge sur les genoux, monte sur la pointe puis descends lentement.", avoid: "Amplitude complète; ne rebondis pas.", stretch: "Talon dans le vide sur une marche." },
  "Mollets debout": { how: "Debout, monte sur la pointe des pieds puis descends les talons sous l'horizontale.", avoid: "Ne rebondis pas; contrôle la descente.", stretch: "Avant-pied sur une marche, talon vers le bas." },
  "Mollets unilatéral debout": { how: "Sur une jambe, monte sur la pointe puis descends lentement.", avoid: "Tiens-toi pour l'équilibre; amplitude complète.", stretch: "Talon dans le vide sur une marche." },

  // --- Abdominaux / gainage ---
  "Crunch à la poulie": { how: "À genoux corde derrière la tête, enroule le buste vers le bassin.", avoid: "Ne tire pas avec les bras; arrondis seulement le haut du dos.", stretch: "Allongé bras au-dessus de la tête, étire le ventre." },
  "Crunchs": { how: "Allongé genoux fléchis, décolle les épaules en soufflant, sans tirer sur la nuque.", avoid: "Ne tire pas la tête; ne décolle pas tout le dos.", stretch: "Cobra léger: allongé sur le ventre, redresse le buste sur les bras." },
  "Gainage latéral": { how: "Sur l'avant-bras et le côté du pied, corps aligné, hanches hautes.", avoid: "Ne laisse pas tomber les hanches.", stretch: "Étirement latéral debout, bras au-dessus de la tête." },
  "Mountain climbers": { how: "En position de pompe gainée, ramène alternativement les genoux vers la poitrine.", avoid: "Ne creuse pas le dos; garde les hanches basses.", stretch: "Cobra léger au sol." },
  "Planche": { how: "Sur les avant-bras, corps gainé et aligné, abdos et fessiers serrés.", avoid: "Ne creuse pas le bas du dos; ne lève pas les fesses.", stretch: "Cobra léger au sol." },
  "Relevés de jambes": { how: "Allongé, monte les jambes tendues puis descends sans toucher le sol, bas du dos plaqué.", avoid: "Ne cambre pas le bas du dos.", stretch: "Cobra léger au sol." },
  "Relevés de jambes suspendus": { how: "Suspendu, monte les genoux ou jambes vers la poitrine en contrôlant la descente.", avoid: "Ne te balance pas; engage le bas du dos.", stretch: "Reste suspendu, puis cobra léger au sol." },
  "Roue abdominale": { how: "À genoux, déroule la roue vers l'avant en gainant puis reviens.", avoid: "Ne creuse pas le dos; n'avance que ce que tu peux contrôler.", stretch: "Cobra léger au sol." },
  "Russian twist": { how: "Assis buste incliné, pieds décollés, tourne le buste d'un côté à l'autre.", avoid: "Tourne le buste, pas juste les bras; dos pas arrondi.", stretch: "Rotation douce du buste, debout." },

  // --- Autre ---
  "Avant-bras curl poignets": { how: "Avant-bras posés, fléchis les poignets vers le haut puis redescends lentement.", avoid: "Petite amplitude contrôlée; pas d'à-coups.", stretch: "Bras tendu, tire les doigts vers le bas puis vers le haut." },
  "Cardio tapis": { how: "Course ou marche à allure régulière, posture droite, foulée souple.", avoid: "Ne t'agrippe pas aux barres; augmente progressivement.", stretch: "Mollets et ischios après l'effort." },
};

const GROUP_STRETCH: Record<string, string> = {
  chest: "Ouverture pectorale contre un cadre de porte.",
  back: "Accroche-toi à un support et recule les hanches pour étirer le dos.",
  shoulders: "Bras croisé devant la poitrine.",
  biceps: "Bras tendu, paume vers le haut.",
  triceps: "Coude plié derrière la tête, tire doucement.",
  quads: "Quadriceps debout, cheville à la main.",
  hamstrings: "Jambes tendues, mains vers les orteils en douceur.",
  glutes: "Figure 4: cheville sur le genou opposé.",
  calves: "Avant-pied sur une marche, talon vers le bas.",
  core: "Cobra léger au sol pour étirer le ventre.",
  other: "Étire les muscles principalement sollicités après l'effort.",
};

export function getGuide(name: string, group: string): ExerciseGuide {
  const found = EXERCISE_GUIDES[name];
  if (found) return found;
  return {
    how: "Mouvement contrôlé sur toute l'amplitude, respiration régulière, dos gainé.",
    avoid: "Évite l'élan et les à-coups; garde une posture neutre.",
    stretch: GROUP_STRETCH[group] ?? GROUP_STRETCH.other!,
  };
}
