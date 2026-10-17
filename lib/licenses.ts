// CM-93 : textes de licence affichés sur /credits. Texte à faire relire par Antoine.
// Copies exactes (fins de ligne normalisées en LF) :
// - react-body-highlighter : node_modules/react-body-highlighter/LICENSE
//   (vérifié par tests/unit/legal.spec.ts, à resynchroniser après une mise à jour)
// - react-native-body-highlighter : LICENSE du dépôt HichamELBSI/react-native-body-highlighter
//   (les polygones SVG du modèle en sont repris, cf. README de react-body-highlighter)
// CM-116 : Archivo et Oswald retirées, l'app utilise la police du système (SF Pro).

export type LicenseEntry = {
  id: string;
  name: string;
  usage: string;
  license: string;
  url: string;
  text: string;
};

export const LICENSES: readonly LicenseEntry[] = [
  {
    id: "react-body-highlighter",
    name: "react-body-highlighter",
    usage: "Silhouettes anatomiques (muscles travaillés)",
    license: "MIT",
    url: "https://github.com/GV79/react-body-highlighter",
    text: "MIT License\n\nCopyright (c) 2020 GV79\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.",
  },
  {
    id: "react-native-body-highlighter",
    name: "react-native-body-highlighter",
    usage: "Tracés SVG du modèle anatomique, repris par react-body-highlighter",
    license: "MIT",
    url: "https://github.com/HichamELBSI/react-native-body-highlighter",
    text: "MIT License\n\nCopyright (c) 2022 ELABBASSI Hicham\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.",
  },
];
