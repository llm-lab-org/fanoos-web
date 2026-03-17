/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { type Emoji as IEmoji } from "@matrix-org/emojibase-bindings";

// Unicode Private Use Area (U+E000–U+F8FF) for custom flower emojis
const U_LAVENDER = "\uE000";
const U_ORCHID = "\uE001";
const U_PEONY = "\uE002";
const U_DAFFODIL = "\uE003";
const U_POPPY = "\uE004";
const U_CORNFLOWER = "\uE005";
const U_MAGNOLIA = "\uE006";
const U_JASMINE = "\uE007";
// Combined / new flowers (E008–E00F)
const U_ANEMONE = "\uE008";      // Poppy silhouette + Cornflower dark centre
const U_CAMELLIA = "\uE009";     // Peony layers + Magnolia palette
const U_IRIS = "\uE00A";         // Orchid shape + Cornflower blue
const U_PANSY = "\uE00B";        // Peony petal count + two-tone Lavender colours
const U_CHRYSANTHEMUM = "\uE00C"; // Cornflower radial + Daffodil gold
const U_FREESIA = "\uE00D";      // Jasmine trumpet + Daffodil yellow-orange
const U_HIBISCUS = "\uE00E";     // Poppy broad petals + Orchid stamen tube
const U_DAHLIA = "\uE00F";       // Cornflower dense radial + Peony deep red

const svgToDataUrl = (svg: string): string =>
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const LAVENDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="18" width="2" height="12" rx="1" fill="#4a7c3f"/>
  <ellipse cx="12" cy="23" rx="4.5" ry="1.8" fill="#4a7c3f" transform="rotate(-22 12 23)"/>
  <ellipse cx="20" cy="23" rx="4.5" ry="1.8" fill="#4a7c3f" transform="rotate(22 20 23)"/>
  <ellipse cx="13" cy="18" rx="2.2" ry="3.5" fill="#c39bd3"/>
  <ellipse cx="19" cy="18" rx="2.2" ry="3.5" fill="#c39bd3"/>
  <ellipse cx="14" cy="12.5" rx="2" ry="3" fill="#9b59b6"/>
  <ellipse cx="18" cy="12.5" rx="2" ry="3" fill="#9b59b6"/>
  <ellipse cx="16" cy="7" rx="2.2" ry="3.8" fill="#7d3c98"/>
</svg>`;

const ORCHID_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="25" width="2" height="6" rx="1" fill="#4a7c3f"/>
  <ellipse cx="16" cy="7" rx="3.5" ry="6" fill="#e8b0d8"/>
  <ellipse cx="8" cy="14" rx="7" ry="3" fill="#e8b0d8" transform="rotate(-35 8 14)"/>
  <ellipse cx="24" cy="14" rx="7" ry="3" fill="#e8b0d8" transform="rotate(35 24 14)"/>
  <ellipse cx="9.5" cy="9" rx="5.5" ry="2.5" fill="#d070c0" transform="rotate(45 9.5 9)"/>
  <ellipse cx="22.5" cy="9" rx="5.5" ry="2.5" fill="#d070c0" transform="rotate(-45 22.5 9)"/>
  <path d="M12 18 Q16 13 20 18 Q18 24 16 25 Q14 24 12 18Z" fill="#8b1a8b"/>
  <ellipse cx="16" cy="15" rx="3" ry="2" fill="#fff0fe"/>
  <circle cx="16" cy="14" r="1.5" fill="#6a0dad"/>
</svg>`;

const PEONY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="27" width="2" height="4" rx="1" fill="#4a7c3f"/>
  <ellipse cx="16" cy="6" rx="4" ry="6" fill="#f9a8c4"/>
  <ellipse cx="9" cy="10" rx="4" ry="6" fill="#f9a8c4" transform="rotate(72 9 10)"/>
  <ellipse cx="7" cy="19" rx="4" ry="6" fill="#f9a8c4" transform="rotate(144 7 19)"/>
  <ellipse cx="21" cy="22" rx="4" ry="6" fill="#f9a8c4" transform="rotate(216 21 22)"/>
  <ellipse cx="26" cy="13" rx="4" ry="6" fill="#f9a8c4" transform="rotate(288 26 13)"/>
  <ellipse cx="21" cy="7" rx="3.5" ry="5.5" fill="#f06090" transform="rotate(36 21 7)"/>
  <ellipse cx="7" cy="10" rx="3.5" ry="5.5" fill="#f06090" transform="rotate(108 7 10)"/>
  <ellipse cx="8" cy="23" rx="3.5" ry="5.5" fill="#f06090" transform="rotate(180 8 23)"/>
  <ellipse cx="24" cy="21" rx="3.5" ry="5.5" fill="#f06090" transform="rotate(252 24 21)"/>
  <ellipse cx="25" cy="9" rx="3.5" ry="5.5" fill="#f06090" transform="rotate(324 25 9)"/>
  <circle cx="16" cy="15" r="5" fill="#c8104c"/>
  <circle cx="16" cy="15" r="3" fill="#f5c518"/>
</svg>`;

const DAFFODIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="23" width="2" height="8" rx="1" fill="#4a7c3f"/>
  <ellipse cx="16" cy="8" rx="3" ry="6" fill="#fcd34d"/>
  <ellipse cx="9" cy="11" rx="3" ry="6" fill="#fcd34d" transform="rotate(60 9 11)"/>
  <ellipse cx="9" cy="19" rx="3" ry="6" fill="#fcd34d" transform="rotate(120 9 19)"/>
  <ellipse cx="16" cy="22" rx="3" ry="6" fill="#fcd34d" transform="rotate(180 16 22)"/>
  <ellipse cx="23" cy="19" rx="3" ry="6" fill="#fcd34d" transform="rotate(240 23 19)"/>
  <ellipse cx="23" cy="11" rx="3" ry="6" fill="#fcd34d" transform="rotate(300 23 11)"/>
  <circle cx="16" cy="15" r="5.5" fill="#f97316"/>
  <circle cx="16" cy="15" r="4" fill="#fdba74"/>
  <circle cx="16" cy="15" r="2.5" fill="#9a3412"/>
</svg>`;

const POPPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="23" width="2" height="8" rx="1" fill="#4a7c3f"/>
  <ellipse cx="16" cy="8" rx="5.5" ry="7" fill="#ef4444"/>
  <ellipse cx="8" cy="15" rx="7" ry="5" fill="#ef4444"/>
  <ellipse cx="24" cy="15" rx="7" ry="5" fill="#ef4444"/>
  <ellipse cx="16" cy="22" rx="5.5" ry="6" fill="#dc2626"/>
  <ellipse cx="16" cy="15" rx="4.5" ry="5.5" fill="#991b1b" opacity="0.35"/>
  <circle cx="16" cy="15" r="4.5" fill="#1c1917"/>
  <circle cx="16" cy="15" r="3" fill="#292524"/>
  <line x1="16" y1="12" x2="16" y2="13.5" stroke="#fbbf24" stroke-width="1.2"/>
  <line x1="13.2" y1="13" x2="14.3" y2="14" stroke="#fbbf24" stroke-width="1.2"/>
  <line x1="18.8" y1="13" x2="17.7" y2="14" stroke="#fbbf24" stroke-width="1.2"/>
  <line x1="12.5" y1="15.5" x2="14" y2="15.5" stroke="#fbbf24" stroke-width="1.2"/>
  <line x1="19.5" y1="15.5" x2="18" y2="15.5" stroke="#fbbf24" stroke-width="1.2"/>
</svg>`;

const CORNFLOWER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="23" width="2" height="8" rx="1" fill="#4a7c3f"/>
  <ellipse cx="16" cy="7" rx="1.8" ry="4.5" fill="#3b82f6"/>
  <ellipse cx="20" cy="8" rx="1.8" ry="4.5" fill="#3b82f6" transform="rotate(30 20 8)"/>
  <ellipse cx="23" cy="11" rx="1.8" ry="4.5" fill="#3b82f6" transform="rotate(60 23 11)"/>
  <ellipse cx="24" cy="15" rx="1.8" ry="4.5" fill="#3b82f6" transform="rotate(90 24 15)"/>
  <ellipse cx="23" cy="19" rx="1.8" ry="4.5" fill="#3b82f6" transform="rotate(120 23 19)"/>
  <ellipse cx="20" cy="22" rx="1.8" ry="4.5" fill="#3b82f6" transform="rotate(150 20 22)"/>
  <ellipse cx="16" cy="23" rx="1.8" ry="4.5" fill="#3b82f6" transform="rotate(180 16 23)"/>
  <ellipse cx="12" cy="22" rx="1.8" ry="4.5" fill="#3b82f6" transform="rotate(210 12 22)"/>
  <ellipse cx="9" cy="19" rx="1.8" ry="4.5" fill="#3b82f6" transform="rotate(240 9 19)"/>
  <ellipse cx="8" cy="15" rx="1.8" ry="4.5" fill="#3b82f6" transform="rotate(270 8 15)"/>
  <ellipse cx="9" cy="11" rx="1.8" ry="4.5" fill="#3b82f6" transform="rotate(300 9 11)"/>
  <ellipse cx="12" cy="8" rx="1.8" ry="4.5" fill="#3b82f6" transform="rotate(330 12 8)"/>
  <circle cx="16" cy="15" r="4" fill="#1e3a8a"/>
  <circle cx="16" cy="15" r="2.5" fill="#2563eb"/>
</svg>`;

const MAGNOLIA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="26" width="2" height="5" rx="1" fill="#6b4226"/>
  <ellipse cx="16" cy="6" rx="4" ry="7" fill="#fce7f3"/>
  <ellipse cx="8" cy="9.5" rx="4" ry="7" fill="#fce7f3" transform="rotate(60 8 9.5)"/>
  <ellipse cx="8" cy="20.5" rx="4" ry="7" fill="#fce7f3" transform="rotate(120 8 20.5)"/>
  <ellipse cx="16" cy="24" rx="4" ry="7" fill="#fbcfe8" transform="rotate(180 16 24)"/>
  <ellipse cx="24" cy="20.5" rx="4" ry="7" fill="#fbcfe8" transform="rotate(240 24 20.5)"/>
  <ellipse cx="24" cy="9.5" rx="4" ry="7" fill="#fce7f3" transform="rotate(300 24 9.5)"/>
  <ellipse cx="16" cy="9" rx="3.5" ry="6" fill="#f9a8d4"/>
  <ellipse cx="11" cy="15.5" rx="3.5" ry="6" fill="#f9a8d4" transform="rotate(120 11 15.5)"/>
  <ellipse cx="21" cy="15.5" rx="3.5" ry="6" fill="#f9a8d4" transform="rotate(240 21 15.5)"/>
  <ellipse cx="16" cy="15" rx="4" ry="5" fill="#92400e"/>
  <ellipse cx="16" cy="13" rx="3" ry="3.5" fill="#b45309"/>
</svg>`;

const JASMINE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="19" width="2" height="11" rx="1" fill="#4a7c3f"/>
  <ellipse cx="11" cy="25" rx="5" ry="2" fill="#4a7c3f" transform="rotate(-28 11 25)"/>
  <ellipse cx="21" cy="25" rx="5" ry="2" fill="#4a7c3f" transform="rotate(28 21 25)"/>
  <ellipse cx="16" cy="7" rx="2.5" ry="6" fill="#ffffff"/>
  <ellipse cx="22.5" cy="9.5" rx="2.5" ry="6" fill="#ffffff" transform="rotate(72 22.5 9.5)"/>
  <ellipse cx="21" cy="18" rx="2.5" ry="6" fill="#ffffff" transform="rotate(144 21 18)"/>
  <ellipse cx="11" cy="18" rx="2.5" ry="6" fill="#ffffff" transform="rotate(216 11 18)"/>
  <ellipse cx="9.5" cy="9.5" rx="2.5" ry="6" fill="#ffffff" transform="rotate(288 9.5 9.5)"/>
  <ellipse cx="16" cy="7" rx="2.5" ry="6" fill="none" stroke="#d1d5db" stroke-width="0.6"/>
  <ellipse cx="22.5" cy="9.5" rx="2.5" ry="6" fill="none" stroke="#d1d5db" stroke-width="0.6" transform="rotate(72 22.5 9.5)"/>
  <ellipse cx="21" cy="18" rx="2.5" ry="6" fill="none" stroke="#d1d5db" stroke-width="0.6" transform="rotate(144 21 18)"/>
  <ellipse cx="11" cy="18" rx="2.5" ry="6" fill="none" stroke="#d1d5db" stroke-width="0.6" transform="rotate(216 11 18)"/>
  <ellipse cx="9.5" cy="9.5" rx="2.5" ry="6" fill="none" stroke="#d1d5db" stroke-width="0.6" transform="rotate(288 9.5 9.5)"/>
  <circle cx="16" cy="14" r="4" fill="#fef08a"/>
  <circle cx="16" cy="14" r="2.5" fill="#fde047"/>
</svg>`;

// ── Combined flowers ─────────────────────────────────────────────────────────

// Anemone: poppy-style broad petals (cornflower blue) + near-black seed centre
const ANEMONE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="23" width="2" height="8" rx="1" fill="#4a7c3f"/>
  <ellipse cx="16" cy="8" rx="5.5" ry="7" fill="#5c6bc0"/>
  <ellipse cx="8" cy="15" rx="7" ry="5" fill="#5c6bc0"/>
  <ellipse cx="24" cy="15" rx="7" ry="5" fill="#5c6bc0"/>
  <ellipse cx="16" cy="22" rx="5.5" ry="6" fill="#3949ab"/>
  <ellipse cx="16" cy="15" rx="4.5" ry="5.5" fill="#1a237e" opacity="0.35"/>
  <circle cx="16" cy="15" r="4.5" fill="#1a1a2e"/>
  <circle cx="16" cy="15" r="2.8" fill="#212121"/>
  <circle cx="14.2" cy="13.5" r="0.7" fill="#7986cb"/>
  <circle cx="17.8" cy="13.5" r="0.7" fill="#7986cb"/>
  <circle cx="16" cy="12.2" r="0.7" fill="#7986cb"/>
  <circle cx="13.2" cy="16" r="0.7" fill="#7986cb"/>
  <circle cx="18.8" cy="16" r="0.7" fill="#7986cb"/>
</svg>`;

// Camellia: peony-style layered petals in magnolia cream/pink tones
const CAMELLIA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="27" width="2" height="4" rx="1" fill="#6b4226"/>
  <ellipse cx="16" cy="6" rx="4" ry="6" fill="#fce7f3"/>
  <ellipse cx="9" cy="10" rx="4" ry="6" fill="#fce7f3" transform="rotate(72 9 10)"/>
  <ellipse cx="7" cy="19" rx="4" ry="6" fill="#fce7f3" transform="rotate(144 7 19)"/>
  <ellipse cx="21" cy="22" rx="4" ry="6" fill="#fce7f3" transform="rotate(216 21 22)"/>
  <ellipse cx="26" cy="13" rx="4" ry="6" fill="#fce7f3" transform="rotate(288 26 13)"/>
  <ellipse cx="20" cy="7" rx="3" ry="5" fill="#f48fb1" transform="rotate(36 20 7)"/>
  <ellipse cx="8" cy="11" rx="3" ry="5" fill="#f48fb1" transform="rotate(108 8 11)"/>
  <ellipse cx="9" cy="23" rx="3" ry="5" fill="#f48fb1" transform="rotate(180 9 23)"/>
  <ellipse cx="23" cy="21" rx="3" ry="5" fill="#f48fb1" transform="rotate(252 23 21)"/>
  <ellipse cx="25" cy="9" rx="3" ry="5" fill="#f48fb1" transform="rotate(324 25 9)"/>
  <circle cx="16" cy="15" r="4" fill="#f8bbd0"/>
  <line x1="16" y1="12" x2="16" y2="14" stroke="#f9a825" stroke-width="1.2"/>
  <line x1="13.5" y1="13" x2="14.8" y2="14.5" stroke="#f9a825" stroke-width="1.2"/>
  <line x1="18.5" y1="13" x2="17.2" y2="14.5" stroke="#f9a825" stroke-width="1.2"/>
  <line x1="12.5" y1="15.5" x2="14.2" y2="15.5" stroke="#f9a825" stroke-width="1.2"/>
  <line x1="19.5" y1="15.5" x2="17.8" y2="15.5" stroke="#f9a825" stroke-width="1.2"/>
</svg>`;

// Iris: three upright + three drooping petals, cornflower blue with orchid veining
const IRIS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="25" width="2" height="6" rx="1" fill="#4a7c3f"/>
  <ellipse cx="13" cy="25" rx="5" ry="2" fill="#4a7c3f" transform="rotate(-25 13 25)"/>
  <ellipse cx="16" cy="7" rx="3" ry="6.5" fill="#5c6bc0"/>
  <ellipse cx="10" cy="9" rx="3" ry="6.5" fill="#5c6bc0" transform="rotate(-40 10 9)"/>
  <ellipse cx="22" cy="9" rx="3" ry="6.5" fill="#5c6bc0" transform="rotate(40 22 9)"/>
  <ellipse cx="11" cy="19" rx="3.5" ry="6" fill="#7986cb" transform="rotate(30 11 19)"/>
  <ellipse cx="21" cy="19" rx="3.5" ry="6" fill="#7986cb" transform="rotate(-30 21 19)"/>
  <ellipse cx="16" cy="21" rx="3" ry="5.5" fill="#7986cb"/>
  <ellipse cx="16" cy="13" rx="2.5" ry="3" fill="#fff9c4" opacity="0.8"/>
  <line x1="16" y1="10.5" x2="16" y2="15.5" stroke="#3949ab" stroke-width="0.8" opacity="0.6"/>
</svg>`;

// Pansy: five rounded petals, two upper deep purple, three lower lavender with dark lines
const PANSY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="25" width="2" height="6" rx="1" fill="#4a7c3f"/>
  <ellipse cx="11" cy="29" rx="5" ry="2" fill="#4a7c3f" transform="rotate(-20 11 29)"/>
  <ellipse cx="12" cy="8.5" rx="5" ry="6.5" fill="#6a1b9a"/>
  <ellipse cx="20" cy="8.5" rx="5" ry="6.5" fill="#6a1b9a"/>
  <ellipse cx="8" cy="17" rx="6" ry="5" fill="#c39bd3" transform="rotate(30 8 17)"/>
  <ellipse cx="24" cy="17" rx="6" ry="5" fill="#c39bd3" transform="rotate(-30 24 17)"/>
  <ellipse cx="16" cy="21" rx="6" ry="5" fill="#e8daef"/>
  <circle cx="16" cy="15" r="3" fill="#fff59d"/>
  <line x1="16" y1="17.5" x2="12" y2="22" stroke="#6a1b9a" stroke-width="0.9" opacity="0.5"/>
  <line x1="16" y1="17.5" x2="20" y2="22" stroke="#6a1b9a" stroke-width="0.9" opacity="0.5"/>
  <line x1="16" y1="17.5" x2="16" y2="23" stroke="#6a1b9a" stroke-width="0.9" opacity="0.5"/>
</svg>`;

// Chrysanthemum: cornflower dense radial petals in daffodil gold, layered
const CHRYSANTHEMUM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="24" width="2" height="7" rx="1" fill="#4a7c3f"/>
  ${Array.from({length: 16}, (_, i) => {
    const a = (i * 22.5) * Math.PI / 180;
    const cx = (16 + Math.cos(a) * 7.5).toFixed(1);
    const cy = (15 + Math.sin(a) * 7.5).toFixed(1);
    return `<ellipse cx="${cx}" cy="${cy}" rx="1.4" ry="4.5" fill="#fdd835" transform="rotate(${i * 22.5} ${cx} ${cy})"/>`;
  }).join("")}
  ${Array.from({length: 12}, (_, i) => {
    const a = (i * 30 + 15) * Math.PI / 180;
    const cx = (16 + Math.cos(a) * 4.5).toFixed(1);
    const cy = (15 + Math.sin(a) * 4.5).toFixed(1);
    return `<ellipse cx="${cx}" cy="${cy}" rx="1.2" ry="3" fill="#f9a825" transform="rotate(${i * 30 + 15} ${cx} ${cy})"/>`;
  }).join("")}
  <circle cx="16" cy="15" r="3" fill="#f57f17"/>
  <circle cx="16" cy="15" r="1.8" fill="#e65100"/>
</svg>`;

// Freesia: jasmine-style stem with daffodil-yellow trumpet florets
const FREESIA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <path d="M16 30 Q14 22 16 15 Q18 8 17 3" fill="none" stroke="#4a7c3f" stroke-width="1.8" stroke-linecap="round"/>
  <ellipse cx="11" cy="22" rx="4.5" ry="1.8" fill="#4a7c3f" transform="rotate(-28 11 22)"/>
  <ellipse cx="21" cy="18" rx="4" ry="1.6" fill="#4a7c3f" transform="rotate(20 21 18)"/>
  <ellipse cx="22" cy="13" rx="4.5" ry="3" fill="#fff176" transform="rotate(35 22 13)"/>
  <ellipse cx="22" cy="13" rx="2.5" ry="1.8" fill="#fdd835" transform="rotate(35 22 13)"/>
  <ellipse cx="18" cy="8" rx="4" ry="3" fill="#fff176" transform="rotate(10 18 8)"/>
  <ellipse cx="18" cy="8" rx="2.2" ry="1.6" fill="#fdd835" transform="rotate(10 18 8)"/>
  <ellipse cx="13" cy="12" rx="4.2" ry="3" fill="#fffde7" transform="rotate(-20 13 12)"/>
  <ellipse cx="13" cy="12" rx="2.3" ry="1.7" fill="#fff176" transform="rotate(-20 13 12)"/>
  <ellipse cx="10" cy="17" rx="4" ry="2.8" fill="#fffde7" transform="rotate(-35 10 17)"/>
  <ellipse cx="10" cy="17" rx="2.2" ry="1.6" fill="#fff176" transform="rotate(-35 10 17)"/>
</svg>`;

// Hibiscus: poppy broad petals (tropical red-pink) + long orchid-style stamen tube
const HIBISCUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="25" width="2" height="6" rx="1" fill="#4a7c3f"/>
  <ellipse cx="11" cy="29" rx="5" ry="2" fill="#4a7c3f" transform="rotate(-22 11 29)"/>
  <ellipse cx="16" cy="7" rx="5" ry="7" fill="#f06292"/>
  <ellipse cx="8" cy="13" rx="7" ry="4.5" fill="#f06292" transform="rotate(-35 8 13)"/>
  <ellipse cx="24" cy="13" rx="7" ry="4.5" fill="#f06292" transform="rotate(35 24 13)"/>
  <ellipse cx="10" cy="22" rx="6" ry="4.5" fill="#e91e63" transform="rotate(30 10 22)"/>
  <ellipse cx="22" cy="22" rx="6" ry="4.5" fill="#e91e63" transform="rotate(-30 22 22)"/>
  <ellipse cx="16" cy="14" rx="4" ry="5" fill="#ad1457" opacity="0.3"/>
  <line x1="16" y1="8" x2="16" y2="15" stroke="#ffb300" stroke-width="2" stroke-linecap="round"/>
  <circle cx="16" cy="7.5" r="2" fill="#ffb300"/>
  <circle cx="14" cy="6.5" r="1.2" fill="#fff"/>
  <circle cx="18" cy="6.5" r="1.2" fill="#fff"/>
  <circle cx="16" cy="5.5" r="1.2" fill="#fff"/>
</svg>`;

// Dahlia: dense cornflower-style radial in peony deep red, double-layered
const DAHLIA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="15" y="25" width="2" height="6" rx="1" fill="#4a7c3f"/>
  ${Array.from({length: 14}, (_, i) => {
    const a = (i * (360/14)) * Math.PI / 180;
    const cx = (16 + Math.cos(a) * 8).toFixed(1);
    const cy = (15 + Math.sin(a) * 8).toFixed(1);
    return `<ellipse cx="${cx}" cy="${cy}" rx="1.6" ry="4.8" fill="#b71c1c" transform="rotate(${(i*(360/14)).toFixed(1)} ${cx} ${cy})"/>`;
  }).join("")}
  ${Array.from({length: 10}, (_, i) => {
    const a = (i * 36 + 18) * Math.PI / 180;
    const cx = (16 + Math.cos(a) * 5).toFixed(1);
    const cy = (15 + Math.sin(a) * 5).toFixed(1);
    return `<ellipse cx="${cx}" cy="${cy}" rx="1.4" ry="3.2" fill="#c62828" transform="rotate(${(i * 36 + 18).toFixed(1)} ${cx} ${cy})"/>`;
  }).join("")}
  <circle cx="16" cy="15" r="3.2" fill="#4a0000"/>
  <circle cx="16" cy="15" r="1.8" fill="#7f0000"/>
</svg>`;

/** Maps private-use-area unicode → SVG data URL for custom flower emojis */
export const CUSTOM_EMOJI_IMAGES: Record<string, string> = {
    [U_LAVENDER]: svgToDataUrl(LAVENDER_SVG),
    [U_ORCHID]: svgToDataUrl(ORCHID_SVG),
    [U_PEONY]: svgToDataUrl(PEONY_SVG),
    [U_DAFFODIL]: svgToDataUrl(DAFFODIL_SVG),
    [U_POPPY]: svgToDataUrl(POPPY_SVG),
    [U_CORNFLOWER]: svgToDataUrl(CORNFLOWER_SVG),
    [U_MAGNOLIA]: svgToDataUrl(MAGNOLIA_SVG),
    [U_JASMINE]: svgToDataUrl(JASMINE_SVG),
    [U_ANEMONE]: svgToDataUrl(ANEMONE_SVG),
    [U_CAMELLIA]: svgToDataUrl(CAMELLIA_SVG),
    [U_IRIS]: svgToDataUrl(IRIS_SVG),
    [U_PANSY]: svgToDataUrl(PANSY_SVG),
    [U_CHRYSANTHEMUM]: svgToDataUrl(CHRYSANTHEMUM_SVG),
    [U_FREESIA]: svgToDataUrl(FREESIA_SVG),
    [U_HIBISCUS]: svgToDataUrl(HIBISCUS_SVG),
    [U_DAHLIA]: svgToDataUrl(DAHLIA_SVG),
};

const makeCustomEmoji = (unicode: string, hexcode: string, label: string, shortcodes: string[]): IEmoji =>
    ({ unicode, hexcode, label, shortcodes } as IEmoji);

export const CUSTOM_FLOWER_EMOJIS: IEmoji[] = [
    makeCustomEmoji(U_LAVENDER, "E000", "Lavender", ["lavender"]),
    makeCustomEmoji(U_ORCHID, "E001", "Orchid", ["orchid"]),
    makeCustomEmoji(U_PEONY, "E002", "Peony", ["peony"]),
    makeCustomEmoji(U_DAFFODIL, "E003", "Daffodil", ["daffodil"]),
    makeCustomEmoji(U_POPPY, "E004", "Poppy", ["poppy"]),
    makeCustomEmoji(U_CORNFLOWER, "E005", "Cornflower", ["cornflower"]),
    makeCustomEmoji(U_MAGNOLIA, "E006", "Magnolia", ["magnolia"]),
    makeCustomEmoji(U_JASMINE, "E007", "Jasmine", ["jasmine"]),
    makeCustomEmoji(U_ANEMONE, "E008", "Anemone", ["anemone"]),
    makeCustomEmoji(U_CAMELLIA, "E009", "Camellia", ["camellia"]),
    makeCustomEmoji(U_IRIS, "E00A", "Iris", ["iris"]),
    makeCustomEmoji(U_PANSY, "E00B", "Pansy", ["pansy"]),
    makeCustomEmoji(U_CHRYSANTHEMUM, "E00C", "Chrysanthemum", ["chrysanthemum", "mum"]),
    makeCustomEmoji(U_FREESIA, "E00D", "Freesia", ["freesia"]),
    makeCustomEmoji(U_HIBISCUS, "E00E", "Hibiscus", ["hibiscus"]),
    makeCustomEmoji(U_DAHLIA, "E00F", "Dahlia", ["dahlia"]),
];
