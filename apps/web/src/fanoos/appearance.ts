/*
Copyright 2026 LLM-LAB (Fanoos fork)
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
*/

/*
 * Fanoos appearance overrides — chat background, panel colors, message colors,
 * and color palettes. All injected as CSS custom property overrides.
 */

import SettingsStore from "../settings/SettingsStore";

const APPEARANCE_STYLE_ID = "fanoos-appearance-override";

function getStyleEl(): HTMLStyleElement {
    let el = document.getElementById(APPEARANCE_STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
        el = document.createElement("style");
        el.id = APPEARANCE_STYLE_ID;
        document.head.appendChild(el);
    }
    return el;
}

// ─── Palette definitions ──────────────────────────────────────────────────────
export interface ColorPalette {
    key: string;
    label: string;
    labelFa: string;
    labelAr: string;
    vars: Record<string, string>;
}

export const COLOR_PALETTES: ColorPalette[] = [
    {
        key: "default",
        label: "Default",
        labelFa: "پیش‌فرض",
        labelAr: "افتراضي",
        vars: {},
    },
    {
        key: "night_sky",
        label: "Clear Sky",
        labelFa: "آسمان صاف",
        labelAr: "سماء صافية",
        vars: {
            // ── Structure ──
            "--fanoos-left-panel-bg": "#e8eef8",
            "--fanoos-header-bg": "#ffffff",
            "--fanoos-composer-bg": "#f4f7fd",
            "--fanoos-chat-bg": "#f0f4fb",
            // ── Bubbles ──
            "--fanoos-sent-msg-bg": "#3b6fd4",
            "--fanoos-received-msg-bg": "#e8eef8",
            "--fanoos-sent-msg-color": "#ffffff",
            "--fanoos-received-msg-color": "#1a2a48",
            // ── Hover ──
            "--fanoos-hover-bg": "rgba(59, 111, 212, 0.06)",
            // ── Compound tokens ──
            "--cpd-color-bg-canvas-default": "#f0f4fb",
            "--cpd-color-bg-subtle-secondary": "#e8eef8",
            "--cpd-color-bg-subtle-primary": "#dde5f5",
            "--cpd-color-bg-action-primary-rest": "#3b6fd4",
            "--cpd-color-text-primary": "#1a2a48",
            "--cpd-color-text-secondary": "#4a6a9a",
            "--cpd-color-text-placeholder": "#8aa0c4",
            "--cpd-color-icon-primary": "#2a4070",
            "--cpd-color-icon-secondary": "#4a6a9a",
            "--cpd-color-icon-tertiary": "#7090bc",
            "--cpd-color-icon-accent-primary": "#3b6fd4",
            "--cpd-color-icon-accent-tertiary": "#3b6fd4",
            "--cpd-color-border-interactive-primary": "#c0d0e8",
            "--cpd-color-border-interactive-secondary": "#d8e4f4",
        },
    },
    {
        key: "technology",
        label: "Clean Tech",
        labelFa: "فناوری روشن",
        labelAr: "تقنية نظيفة",
        vars: {
            "--fanoos-left-panel-bg": "#e0f0f8",
            "--fanoos-header-bg": "#ffffff",
            "--fanoos-composer-bg": "#f0f8fc",
            "--fanoos-chat-bg": "#f2f9fd",
            "--fanoos-sent-msg-bg": "#0284a8",
            "--fanoos-received-msg-bg": "#e0f0f8",
            "--fanoos-sent-msg-color": "#ffffff",
            "--fanoos-received-msg-color": "#013a52",
            "--fanoos-hover-bg": "rgba(2, 132, 168, 0.06)",
            "--cpd-color-bg-canvas-default": "#f2f9fd",
            "--cpd-color-bg-subtle-secondary": "#e0f0f8",
            "--cpd-color-bg-subtle-primary": "#cce5f4",
            "--cpd-color-bg-action-primary-rest": "#0284a8",
            "--cpd-color-text-primary": "#013a52",
            "--cpd-color-text-secondary": "#0369a1",
            "--cpd-color-text-placeholder": "#6ab0cc",
            "--cpd-color-icon-primary": "#01334a",
            "--cpd-color-icon-secondary": "#0369a1",
            "--cpd-color-icon-tertiary": "#4a9ab8",
            "--cpd-color-icon-accent-primary": "#0284a8",
            "--cpd-color-icon-accent-tertiary": "#0284a8",
            "--cpd-color-border-interactive-primary": "#b0d8ec",
            "--cpd-color-border-interactive-secondary": "#cce5f4",
        },
    },
    {
        key: "sunset",
        label: "Sunrise",
        labelFa: "طلوع آفتاب",
        labelAr: "شروق الشمس",
        vars: {
            "--fanoos-left-panel-bg": "#fae8dc",
            "--fanoos-header-bg": "#ffffff",
            "--fanoos-composer-bg": "#fdf4ee",
            "--fanoos-chat-bg": "#fef6f0",
            "--fanoos-sent-msg-bg": "#d4622a",
            "--fanoos-received-msg-bg": "#fae8dc",
            "--fanoos-sent-msg-color": "#ffffff",
            "--fanoos-received-msg-color": "#3d1606",
            "--fanoos-hover-bg": "rgba(212, 98, 42, 0.06)",
            "--cpd-color-bg-canvas-default": "#fef6f0",
            "--cpd-color-bg-subtle-secondary": "#fae8dc",
            "--cpd-color-bg-subtle-primary": "#f5d8c8",
            "--cpd-color-bg-action-primary-rest": "#d4622a",
            "--cpd-color-text-primary": "#3d1606",
            "--cpd-color-text-secondary": "#b85020",
            "--cpd-color-text-placeholder": "#daa080",
            "--cpd-color-icon-primary": "#36100a",
            "--cpd-color-icon-secondary": "#b85020",
            "--cpd-color-icon-tertiary": "#d08060",
            "--cpd-color-icon-accent-primary": "#d4622a",
            "--cpd-color-icon-accent-tertiary": "#d4622a",
            "--cpd-color-border-interactive-primary": "#f0c8b0",
            "--cpd-color-border-interactive-secondary": "#f8dece",
        },
    },
    {
        key: "forest",
        label: "Garden",
        labelFa: "باغ سبز",
        labelAr: "حديقة خضراء",
        vars: {
            "--fanoos-left-panel-bg": "#ddf0e4",
            "--fanoos-header-bg": "#ffffff",
            "--fanoos-composer-bg": "#eef8f2",
            "--fanoos-chat-bg": "#f2faf5",
            "--fanoos-sent-msg-bg": "#1e8040",
            "--fanoos-received-msg-bg": "#ddf0e4",
            "--fanoos-sent-msg-color": "#ffffff",
            "--fanoos-received-msg-color": "#0a2e18",
            "--fanoos-hover-bg": "rgba(30, 128, 64, 0.06)",
            "--cpd-color-bg-canvas-default": "#f2faf5",
            "--cpd-color-bg-subtle-secondary": "#ddf0e4",
            "--cpd-color-bg-subtle-primary": "#cce8d6",
            "--cpd-color-bg-action-primary-rest": "#1e8040",
            "--cpd-color-text-primary": "#0a2e18",
            "--cpd-color-text-secondary": "#1a6e38",
            "--cpd-color-text-placeholder": "#70b888",
            "--cpd-color-icon-primary": "#082818",
            "--cpd-color-icon-secondary": "#1a6e38",
            "--cpd-color-icon-tertiary": "#4aaa68",
            "--cpd-color-icon-accent-primary": "#1e8040",
            "--cpd-color-icon-accent-tertiary": "#1e8040",
            "--cpd-color-border-interactive-primary": "#b0dcc0",
            "--cpd-color-border-interactive-secondary": "#ccecd8",
        },
    },
    {
        key: "desert",
        label: "Sandy Shore",
        labelFa: "ساحل ماسه‌ای",
        labelAr: "شاطئ رملي",
        vars: {
            "--fanoos-left-panel-bg": "#f2e8d4",
            "--fanoos-header-bg": "#ffffff",
            "--fanoos-composer-bg": "#faf4e8",
            "--fanoos-chat-bg": "#fdf8ef",
            "--fanoos-sent-msg-bg": "#a86c20",
            "--fanoos-received-msg-bg": "#f2e8d4",
            "--fanoos-sent-msg-color": "#ffffff",
            "--fanoos-received-msg-color": "#3a1e04",
            "--fanoos-hover-bg": "rgba(168, 108, 32, 0.06)",
            "--cpd-color-bg-canvas-default": "#fdf8ef",
            "--cpd-color-bg-subtle-secondary": "#f2e8d4",
            "--cpd-color-bg-subtle-primary": "#e8d8bc",
            "--cpd-color-bg-action-primary-rest": "#a86c20",
            "--cpd-color-text-primary": "#3a1e04",
            "--cpd-color-text-secondary": "#8c5c18",
            "--cpd-color-text-placeholder": "#c8a468",
            "--cpd-color-icon-primary": "#321804",
            "--cpd-color-icon-secondary": "#8c5c18",
            "--cpd-color-icon-tertiary": "#c09040",
            "--cpd-color-icon-accent-primary": "#a86c20",
            "--cpd-color-icon-accent-tertiary": "#a86c20",
            "--cpd-color-border-interactive-primary": "#e0c898",
            "--cpd-color-border-interactive-secondary": "#ecdab8",
        },
    },
    {
        key: "ocean",
        label: "Coastal",
        labelFa: "ساحلی",
        labelAr: "ساحلي",
        vars: {
            "--fanoos-left-panel-bg": "#dceef8",
            "--fanoos-header-bg": "#ffffff",
            "--fanoos-composer-bg": "#eef6fc",
            "--fanoos-chat-bg": "#f2f9fd",
            "--fanoos-sent-msg-bg": "#0068a8",
            "--fanoos-received-msg-bg": "#dceef8",
            "--fanoos-sent-msg-color": "#ffffff",
            "--fanoos-received-msg-color": "#01324e",
            "--fanoos-hover-bg": "rgba(0, 104, 168, 0.06)",
            "--cpd-color-bg-canvas-default": "#f2f9fd",
            "--cpd-color-bg-subtle-secondary": "#dceef8",
            "--cpd-color-bg-subtle-primary": "#c8e4f4",
            "--cpd-color-bg-action-primary-rest": "#0068a8",
            "--cpd-color-text-primary": "#01324e",
            "--cpd-color-text-secondary": "#0068a8",
            "--cpd-color-text-placeholder": "#60a8cc",
            "--cpd-color-icon-primary": "#012c45",
            "--cpd-color-icon-secondary": "#0068a8",
            "--cpd-color-icon-tertiary": "#4090b8",
            "--cpd-color-icon-accent-primary": "#0080c8",
            "--cpd-color-icon-accent-tertiary": "#0080c8",
            "--cpd-color-border-interactive-primary": "#a8d4ec",
            "--cpd-color-border-interactive-secondary": "#c8e4f4",
        },
    },
    {
        key: "amethyst",
        label: "Lavender",
        labelFa: "اسطوخودوس",
        labelAr: "خزامى",
        vars: {
            "--fanoos-left-panel-bg": "#ece4f8",
            "--fanoos-header-bg": "#ffffff",
            "--fanoos-composer-bg": "#f6f2fc",
            "--fanoos-chat-bg": "#faf7fe",
            "--fanoos-sent-msg-bg": "#6930c8",
            "--fanoos-received-msg-bg": "#ece4f8",
            "--fanoos-sent-msg-color": "#ffffff",
            "--fanoos-received-msg-color": "#28106a",
            "--fanoos-hover-bg": "rgba(105, 48, 200, 0.06)",
            "--cpd-color-bg-canvas-default": "#faf7fe",
            "--cpd-color-bg-subtle-secondary": "#ece4f8",
            "--cpd-color-bg-subtle-primary": "#ddd4f4",
            "--cpd-color-bg-action-primary-rest": "#6930c8",
            "--cpd-color-text-primary": "#28106a",
            "--cpd-color-text-secondary": "#5828a8",
            "--cpd-color-text-placeholder": "#a888e0",
            "--cpd-color-icon-primary": "#220e60",
            "--cpd-color-icon-secondary": "#5828a8",
            "--cpd-color-icon-tertiary": "#8a60cc",
            "--cpd-color-icon-accent-primary": "#6930c8",
            "--cpd-color-icon-accent-tertiary": "#6930c8",
            "--cpd-color-border-interactive-primary": "#d0bef0",
            "--cpd-color-border-interactive-secondary": "#e2d8f8",
        },
    },
    {
        key: "rose_gold",
        label: "Blossom",
        labelFa: "شکوفه",
        labelAr: "زهر",
        vars: {
            "--fanoos-left-panel-bg": "#f8e4ec",
            "--fanoos-header-bg": "#ffffff",
            "--fanoos-composer-bg": "#fdf2f6",
            "--fanoos-chat-bg": "#fef7fa",
            "--fanoos-sent-msg-bg": "#bc406a",
            "--fanoos-received-msg-bg": "#f8e4ec",
            "--fanoos-sent-msg-color": "#ffffff",
            "--fanoos-received-msg-color": "#4a1028",
            "--fanoos-hover-bg": "rgba(188, 64, 106, 0.06)",
            "--cpd-color-bg-canvas-default": "#fef7fa",
            "--cpd-color-bg-subtle-secondary": "#f8e4ec",
            "--cpd-color-bg-subtle-primary": "#f2d0df",
            "--cpd-color-bg-action-primary-rest": "#bc406a",
            "--cpd-color-text-primary": "#4a1028",
            "--cpd-color-text-secondary": "#a03060",
            "--cpd-color-text-placeholder": "#d898b0",
            "--cpd-color-icon-primary": "#420e24",
            "--cpd-color-icon-secondary": "#a03060",
            "--cpd-color-icon-tertiary": "#cc7090",
            "--cpd-color-icon-accent-primary": "#bc406a",
            "--cpd-color-icon-accent-tertiary": "#bc406a",
            "--cpd-color-border-interactive-primary": "#ecc0d4",
            "--cpd-color-border-interactive-secondary": "#f5d8e6",
        },
    },
    {
        key: "light_breeze",
        label: "Light Breeze",
        labelFa: "نسیم روشن",
        labelAr: "نسيم خفيف",
        vars: {
            "--fanoos-left-panel-bg": "#e8eef8",
            "--fanoos-header-bg": "#ffffff",
            "--fanoos-composer-bg": "#f4f7fd",
            "--fanoos-chat-bg": "#f8faff",
            "--fanoos-sent-msg-bg": "#2a6ad8",
            "--fanoos-received-msg-bg": "#edf1f8",
            "--fanoos-sent-msg-color": "#ffffff",
            "--fanoos-received-msg-color": "#1a2a50",
            "--fanoos-hover-bg": "rgba(42, 106, 216, 0.05)",
            "--cpd-color-bg-canvas-default": "#f8faff",
            "--cpd-color-bg-subtle-secondary": "#e8eef8",
            "--cpd-color-bg-subtle-primary": "#dce5f5",
            "--cpd-color-bg-action-primary-rest": "#2a6ad8",
            "--cpd-color-text-primary": "#1a2a50",
            "--cpd-color-text-secondary": "#4060a0",
            "--cpd-color-text-placeholder": "#8898c8",
            "--cpd-color-icon-primary": "#1a2a50",
            "--cpd-color-icon-secondary": "#4060a0",
            "--cpd-color-icon-tertiary": "#7088bc",
            "--cpd-color-icon-accent-primary": "#2a6ad8",
            "--cpd-color-icon-accent-tertiary": "#2a6ad8",
            "--cpd-color-border-interactive-primary": "#c0cce8",
            "--cpd-color-border-interactive-secondary": "#d8e2f4",
        },
    },
];

// ─── Background patterns ──────────────────────────────────────────────────────
export interface BgPattern {
    key: string;
    label: string;
    labelFa: string;
    svgTile: string; // raw SVG string for the tile
    tileSize: string; // CSS background-size value
}

const p = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const BG_PATTERNS: BgPattern[] = [
    {
        key: "none",
        label: "None",
        labelFa: "بدون الگو",
        svgTile: "",
        tileSize: "",
    },
    {
        key: "dots",
        label: "Dots",
        labelFa: "نقاط",
        svgTile: p(
            `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="1.8" fill="rgba(0,0,0,0.07)"/></svg>`,
        ),
        tileSize: "20px 20px",
    },
    {
        key: "lines",
        label: "Diagonal Lines",
        labelFa: "خطوط مورب",
        svgTile: p(
            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><line x1="0" y1="0" x2="16" y2="16" stroke="rgba(0,0,0,0.06)" stroke-width="1.5"/><line x1="-8" y1="0" x2="8" y2="16" stroke="rgba(0,0,0,0.06)" stroke-width="1.5"/><line x1="8" y1="0" x2="24" y2="16" stroke="rgba(0,0,0,0.06)" stroke-width="1.5"/></svg>`,
        ),
        tileSize: "16px 16px",
    },
    {
        key: "crosses",
        label: "Crosses",
        labelFa: "علامت‌های ضربدر",
        svgTile: p(
            `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="12" y1="7" x2="12" y2="17" stroke="rgba(0,0,0,0.07)" stroke-width="1.3" stroke-linecap="round"/><line x1="7" y1="12" x2="17" y2="12" stroke="rgba(0,0,0,0.07)" stroke-width="1.3" stroke-linecap="round"/></svg>`,
        ),
        tileSize: "24px 24px",
    },
    {
        key: "hexagons",
        label: "Hexagons",
        labelFa: "لانه زنبوری",
        svgTile: p(
            `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="46"><polygon points="20,2 38,12 38,34 20,44 2,34 2,12" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="1"/></svg>`,
        ),
        tileSize: "40px 46px",
    },
    {
        key: "waves",
        label: "Waves",
        labelFa: "امواج",
        svgTile: p(
            `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="20"><path d="M0 10 C15 2 45 18 60 10" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="1.3"/></svg>`,
        ),
        tileSize: "60px 20px",
    },
    {
        key: "flowers",
        label: "Flowers",
        labelFa: "گل‌ها",
        svgTile: p(
            `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><circle cx="22" cy="22" r="3" fill="rgba(0,0,0,0.06)"/><ellipse cx="22" cy="14" rx="2.2" ry="6" fill="rgba(0,0,0,0.05)"/><ellipse cx="29" cy="17" rx="2.2" ry="6" fill="rgba(0,0,0,0.05)" transform="rotate(60 29 17)"/><ellipse cx="29" cy="27" rx="2.2" ry="6" fill="rgba(0,0,0,0.05)" transform="rotate(120 29 27)"/><ellipse cx="22" cy="30" rx="2.2" ry="6" fill="rgba(0,0,0,0.05)" transform="rotate(180 22 30)"/><ellipse cx="15" cy="27" rx="2.2" ry="6" fill="rgba(0,0,0,0.05)" transform="rotate(240 15 27)"/><ellipse cx="15" cy="17" rx="2.2" ry="6" fill="rgba(0,0,0,0.05)" transform="rotate(300 15 17)"/></svg>`,
        ),
        tileSize: "44px 44px",
    },
    {
        key: "diamonds",
        label: "Diamonds",
        labelFa: "لوزی",
        svgTile: p(
            `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><polygon points="15,2 28,15 15,28 2,15" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="1"/></svg>`,
        ),
        tileSize: "30px 30px",
    },
    {
        key: "stars",
        label: "Stars",
        labelFa: "ستاره‌ها",
        svgTile: p(
            `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><polygon points="18,3 21,13 31,13 23,19 26,29 18,23 10,29 13,19 5,13 15,13" fill="rgba(0,0,0,0.05)" stroke="rgba(0,0,0,0.04)" stroke-width="0.5"/></svg>`,
        ),
        tileSize: "36px 36px",
    },
    {
        key: "night_sky",
        label: "Night Sky",
        labelFa: "آسمان شب",
        svgTile: p(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
  <!-- large star top-left -->
  <polygon points="18,2 20.4,9.8 28.6,9.8 22,14.8 24.4,22.6 18,17.6 11.6,22.6 14,14.8 7.4,9.8 15.6,9.8" fill="rgba(0,0,0,0.07)" stroke="rgba(0,0,0,0.04)" stroke-width="0.5"/>
  <!-- small 4-point star top-right -->
  <polygon points="98,8 99.4,11.4 103,12.8 99.4,14.2 98,17.6 96.6,14.2 93,12.8 96.6,11.4" fill="rgba(0,0,0,0.05)"/>
  <!-- tiny dot cluster -->
  <circle cx="55" cy="15" r="1.2" fill="rgba(0,0,0,0.06)"/>
  <circle cx="60" cy="12" r="0.8" fill="rgba(0,0,0,0.05)"/>
  <circle cx="65" cy="18" r="1" fill="rgba(0,0,0,0.05)"/>
  <!-- medium 6-point star bottom-center -->
  <polygon points="60,68 62,74 68,74 63,78 65,84 60,80 55,84 57,78 52,74 58,74" fill="rgba(0,0,0,0.06)" stroke="rgba(0,0,0,0.04)" stroke-width="0.4"/>
  <!-- crescent moon bottom-right -->
  <path d="M100 85 A14 14 0 1 1 100 109 A10 10 0 1 0 100 85 Z" fill="rgba(0,0,0,0.05)"/>
  <!-- tiny sparkle: 4 lines bottom-left -->
  <line x1="20" y1="90" x2="20" y2="98" stroke="rgba(0,0,0,0.06)" stroke-width="1" stroke-linecap="round"/>
  <line x1="16" y1="94" x2="24" y2="94" stroke="rgba(0,0,0,0.06)" stroke-width="1" stroke-linecap="round"/>
  <line x1="17.2" y1="91.2" x2="22.8" y2="96.8" stroke="rgba(0,0,0,0.04)" stroke-width="0.8" stroke-linecap="round"/>
  <line x1="22.8" y1="91.2" x2="17.2" y2="96.8" stroke="rgba(0,0,0,0.04)" stroke-width="0.8" stroke-linecap="round"/>
  <!-- scattered micro-dots -->
  <circle cx="40" cy="50" r="0.9" fill="rgba(0,0,0,0.05)"/>
  <circle cx="80" cy="45" r="1.1" fill="rgba(0,0,0,0.05)"/>
  <circle cx="30" cy="70" r="0.7" fill="rgba(0,0,0,0.04)"/>
  <circle cx="90" cy="60" r="0.8" fill="rgba(0,0,0,0.04)"/>
  <circle cx="50" cy="100" r="0.9" fill="rgba(0,0,0,0.05)"/>
  <circle cx="75" cy="105" r="0.7" fill="rgba(0,0,0,0.04)"/>
</svg>`),
        tileSize: "120px 120px",
    },
];

// ─── Apply function ───────────────────────────────────────────────────────────
export function applyFanoosAppearance(): void {
    const paletteKey = (SettingsStore.getValue("fanoos.palette") as string) ?? "default";
    const palette = COLOR_PALETTES.find((p) => p.key === paletteKey);
    const paletteVars = palette?.vars ?? {};

    // Per-setting overrides win over palette
    const chatBgPatternKey = (SettingsStore.getValue("fanoos.chatBgPattern") as string | null) ?? "none";
    const chatBgPattern = BG_PATTERNS.find((pt) => pt.key === chatBgPatternKey) ?? null;
    const chatBgUrl = (SettingsStore.getValue("fanoos.chatBgUrl") as string | null) ?? null;
    const chatBgOpacity = (SettingsStore.getValue("fanoos.chatBgOpacity") as number) ?? 0.15;
    const chatBgColor =
        (SettingsStore.getValue("fanoos.chatBgColor") as string | null) ?? paletteVars["--fanoos-chat-bg"] ?? null;
    const leftPanelColor =
        (SettingsStore.getValue("fanoos.leftPanelColor") as string | null) ??
        paletteVars["--fanoos-left-panel-bg"] ??
        null;
    const headerColor =
        (SettingsStore.getValue("fanoos.headerColor") as string | null) ?? paletteVars["--fanoos-header-bg"] ?? null;
    const composerColor =
        (SettingsStore.getValue("fanoos.composerColor") as string | null) ??
        paletteVars["--fanoos-composer-bg"] ??
        null;
    const sentMsgColor =
        (SettingsStore.getValue("fanoos.sentMsgColor") as string | null) ?? paletteVars["--fanoos-sent-msg-bg"] ?? null;
    const receivedMsgColor =
        (SettingsStore.getValue("fanoos.receivedMsgColor") as string | null) ??
        paletteVars["--fanoos-received-msg-bg"] ??
        null;
    const accentColor =
        (SettingsStore.getValue("fanoos.accentColor") as string | null) ??
        paletteVars["--cpd-color-icon-accent-primary"] ??
        null;
    const sentMsgTextColor =
        (SettingsStore.getValue("fanoos.sentMsgTextColor") as string | null) ??
        paletteVars["--fanoos-sent-msg-color"] ??
        null;
    const receivedMsgTextColor = paletteVars["--fanoos-received-msg-color"] ?? null;

    const rules: string[] = [];

    // ── Palette-wide CSS variable overrides ───────────────────────────────────
    if (Object.keys(paletteVars).length > 0) {
        const cssVars = Object.entries(paletteVars)
            .filter(([k]) => !k.startsWith("--fanoos-")) // fanoos vars applied separately below
            .map(([k, v]) => `${k}: ${v} !important;`)
            .join("\n    ");
        if (cssVars) {
            rules.push(`:root, body, [class*="cpd-theme-"] {\n    ${cssVars}\n}`);
        }
    }

    // ── Accent color override (wins over palette) ─────────────────────────────
    if (accentColor) {
        rules.push(`:root, body, [class*="cpd-theme-"] {
    --cpd-color-icon-accent-primary: ${accentColor} !important;
    --cpd-color-icon-accent-tertiary: ${accentColor} !important;
    --cpd-color-bg-action-primary-rest: ${accentColor} !important;
}`);
    }

    // ── Chat background pattern ───────────────────────────────────────────────
    if (chatBgPattern && chatBgPattern.key !== "none") {
        const patternUrl = chatBgPattern.svgTile;
        if (chatBgUrl) {
            // Layer pattern over image
            rules.push(`.mx_RoomView_timeline_rr_panel, .mx_RoomView_body {
    background-image: url(${JSON.stringify(patternUrl)}), url(${JSON.stringify(chatBgUrl)}) !important;
    background-size: ${chatBgPattern.tileSize}, cover !important;
    background-repeat: repeat, no-repeat !important;
    background-position: top left, center !important;
}`);
        } else {
            rules.push(`.mx_RoomView_timeline_rr_panel, .mx_RoomView_body {
    background-image: url(${JSON.stringify(patternUrl)}) !important;
    background-size: ${chatBgPattern.tileSize} !important;
    background-repeat: repeat !important;
}`);
        }
    }

    // ── Chat background image ─────────────────────────────────────────────────
    if (chatBgUrl && !(chatBgPattern && chatBgPattern.key !== "none")) {
        rules.push(`.mx_RoomView_timeline_rr_panel, .mx_RoomView_body {
    background-image: url(${JSON.stringify(chatBgUrl)}) !important;
    background-size: cover !important;
    background-position: center !important;
}`);
        rules.push(`.mx_RoomView_timeline::before {
    content: "" !important; position: absolute !important;
    inset: 0 !important;
    background: var(--cpd-color-bg-canvas-default) !important;
    opacity: ${1 - chatBgOpacity} !important;
    pointer-events: none !important; z-index: 0 !important;
}`);
    }

    // ── Chat area background ──────────────────────────────────────────────────
    if (chatBgColor) {
        rules.push(`.mx_RoomView_body { background-color: ${chatBgColor} !important; }`);
    }

    // ── Left panel + space panel ──────────────────────────────────────────────
    if (leftPanelColor) {
        rules.push(`.mx_LeftPanel, .mx_SpacePanel { background-color: ${leftPanelColor} !important; }`);
    }

    // ── Room header ───────────────────────────────────────────────────────────
    if (headerColor) {
        rules.push(`.mx_RoomHeader, .mx_LegacyRoomHeader { background-color: ${headerColor} !important; }`);
        rules.push(`:root { --fanoos-header-bg: ${headerColor}; }`);
    }

    // ── Composer ─────────────────────────────────────────────────────────────
    if (composerColor) {
        rules.push(`:root { --fanoos-composer-bg: ${composerColor}; }`);
        rules.push(`.mx_MessageComposer_wrapper { background-color: ${composerColor} !important; }`);
    }

    // ── System / info events — transparent, blend with chat bg ───────────────
    // These are join/leave/topic-change events that should not stand out
    if (chatBgColor || Object.keys(paletteVars).length > 0) {
        rules.push(`
/* System events blend into chat background */
.mx_EventTile.mx_EventTile_info .mx_EventTile_line,
.mx_EventTile.mx_EventTile_bubbleContainer .mx_EventTile_line,
.mx_EventTile.mx_EventTile_noBubble .mx_EventTile_line,
.mx_EventTile.mx_EventTile_leftAlignedBubble .mx_EventTile_line,
.mx_GenericEventListSummary .mx_EventTile_line {
    background: transparent !important;
}
.mx_TextualEvent,
.mx_StatelessTextualEvent,
.mx_MemberEventListSummary,
.mx_GenericEventListSummary {
    background: transparent !important;
}`);
    }

    // ── Highlight / last-in-section — blend with chat background ─────────────
    rules.push(`
/* mx_EventTile_highlight and mx_EventTile_lastInSection: no special background */
.mx_EventTile.mx_EventTile_highlight,
.mx_EventTile.mx_EventTile_highlight::before,
.mx_EventTile.mx_EventTile_lastInSection,
.mx_EventTile.mx_EventTile_lastInSection::before {
    background: transparent !important;
    box-shadow: none !important;
}
`);

    // ── Hover — completely disabled so bubble backgrounds don't change ────────
    rules.push(`
/* No background change on hover, no size change */
.mx_EventTile[data-layout="bubble"]:hover::before,
.mx_EventTile[data-layout="bubble"].mx_EventTile_selected::before {
    background: transparent !important;
}
.mx_EventTile[data-layout="bubble"]:hover .mx_EventTile_avatar img,
.mx_EventTile[data-layout="bubble"].mx_EventTile_selected .mx_EventTile_avatar img {
    box-shadow: none !important;
}
/* Suppress row-level hover background */
.mx_EventTile:hover {
    background: transparent !important;
}
/* Freeze bubble line dimensions on hover — no padding/margin shifts */
.mx_EventTile[data-layout="bubble"]:hover .mx_EventTile_line,
.mx_EventTile[data-layout="bubble"]:focus-within .mx_EventTile_line {
    padding: inherit !important;
}
/* Ensure the bubble line itself uses fixed padding that won't shift */
.mx_EventTile[data-layout="bubble"][data-self="true"]:hover .mx_EventTile_line {
    padding: 12px 18px 10px 18px !important;
}
.mx_EventTile[data-layout="bubble"][data-self="false"]:hover .mx_EventTile_line {
    padding: 12px 18px 10px 18px !important;
}`);

    // ── Message bubble colors — Telegram palette defaults, user overrides after ─
    rules.push(`
/* Sent: Telegram light green */
.mx_EventTile[data-layout="bubble"][data-self="true"] { --backgroundColor: #effdde; }
.mx_EventTile[data-layout="bubble"][data-self="true"] .mx_EventTile_line { background: #effdde; }
.mx_EventTile[data-layout="bubble"][data-self="true"] .mx_MediaBody { background: #effdde; }
/* Received: white */
.mx_EventTile[data-layout="bubble"][data-self="false"] { --backgroundColor: #ffffff; }
.mx_EventTile[data-layout="bubble"][data-self="false"] .mx_EventTile_line { background: #ffffff; }
.mx_EventTile[data-layout="bubble"][data-self="false"] .mx_MediaBody { background: #ffffff; }
/* Text: near-black on both */
.mx_EventTile[data-layout="bubble"] .mx_EventTile_body { color: #000000; }
.mx_EventTile[data-layout="bubble"] .mx_EventTile_body a { color: #168acd; }
`);
    if (sentMsgColor) {
        rules.push(
            `.mx_EventTile[data-layout="bubble"][data-self="true"] { --backgroundColor: ${sentMsgColor} !important; }`,
        );
        rules.push(
            `.mx_EventTile[data-layout="bubble"][data-self="true"] .mx_EventTile_line { background: ${sentMsgColor} !important; }`,
        );
        rules.push(
            `.mx_EventTile[data-layout="bubble"][data-self="true"] .mx_MediaBody { background: ${sentMsgColor} !important; }`,
        );
    }
    if (receivedMsgColor) {
        rules.push(
            `.mx_EventTile[data-layout="bubble"][data-self="false"] { --backgroundColor: ${receivedMsgColor} !important; }`,
        );
        rules.push(
            `.mx_EventTile[data-layout="bubble"][data-self="false"] .mx_EventTile_line { background: ${receivedMsgColor} !important; }`,
        );
        rules.push(
            `.mx_EventTile[data-layout="bubble"][data-self="false"] .mx_MediaBody { background: ${receivedMsgColor} !important; }`,
        );
    }

    // ── Info/system events: always transparent, override msg color rules ─────
    // Must come after sentMsgColor/receivedMsgColor rules (which have specificity 0,4,0)
    // so we match that specificity here and rely on source order to win.
    rules.push(`
.mx_EventTile[data-layout="bubble"].mx_EventTile_info,
.mx_EventTile[data-layout="bubble"].mx_EventTile_noBubble,
.mx_EventTile[data-layout="bubble"].mx_EventTile_bubbleContainer,
.mx_EventTile[data-layout="bubble"].mx_EventTile_leftAlignedBubble { --backgroundColor: transparent !important; }
.mx_EventTile[data-layout="bubble"].mx_EventTile_info .mx_EventTile_line,
.mx_EventTile[data-layout="bubble"].mx_EventTile_noBubble .mx_EventTile_line,
.mx_EventTile[data-layout="bubble"].mx_EventTile_bubbleContainer .mx_EventTile_line,
.mx_EventTile[data-layout="bubble"].mx_EventTile_leftAlignedBubble .mx_EventTile_line,
.mx_GenericEventListSummary[data-layout="bubble"] .mx_EventTile_line { background: transparent !important; }
`);

    // ── Message text & link colors ────────────────────────────────────────────
    if (sentMsgTextColor) {
        rules.push(
            `.mx_EventTile[data-layout="bubble"][data-self="true"] .mx_EventTile_body { color: ${sentMsgTextColor} !important; }`,
        );
        rules.push(
            `.mx_EventTile[data-layout="bubble"][data-self="true"] .mx_EventTile_body a { color: ${sentMsgTextColor} !important; opacity: 0.85; }`,
        );
    }
    if (receivedMsgTextColor) {
        rules.push(
            `.mx_EventTile[data-layout="bubble"][data-self="false"] .mx_EventTile_body { color: ${receivedMsgTextColor} !important; }`,
        );
        rules.push(
            `.mx_EventTile[data-layout="bubble"][data-self="false"] .mx_EventTile_body a { color: ${receivedMsgTextColor} !important; opacity: 0.85; }`,
        );
    }

    // ── Properties / right panel text colors ─────────────────────────────────
    if (accentColor || Object.keys(paletteVars).length > 0) {
        const textPrimary = paletteVars["--cpd-color-text-primary"] ?? null;
        if (textPrimary) {
            rules.push(`.mx_RightPanel, .mx_UserInfo, .mx_RoomSettingsDialog, .mx_SpotlightDialog {
    color: ${textPrimary} !important;
}
.mx_RightPanel h2, .mx_UserInfo h2, .mx_RightPanel .mx_BaseCard_header {
    color: ${textPrimary} !important;
}`);
        }
    }

    // ── RTL layout fixes ─────────────────────────────────────────────────────
    rules.push(`
/* ── RTL: Room header name right-aligned ── */
[dir="rtl"] .mx_RoomHeader_info,
[dir="rtl"] .mx_RoomHeader_heading,
[dir="rtl"] .mx_RoomHeader_infoWrapper {
    text-align: right !important;
    direction: rtl !important;
}
[dir="rtl"] .mx_RoomHeader_heading {
    justify-content: flex-end !important;
}
[dir="rtl"] .mx_RoomHeader {
    flex-direction: row-reverse !important;
}
[dir="rtl"] .mx_RoomHeader_infoWrapper {
    flex-direction: row-reverse !important;
}

/* ── RTL: Space panel and create-space button ── */
[dir="rtl"] .mx_SpaceButton {
    flex-direction: row-reverse !important;
}
[dir="rtl"] .mx_SpaceButton_name {
    text-align: right !important;
}
[dir="rtl"] .mx_SpaceItem_new {
    direction: rtl !important;
}
[dir="rtl"] .mx_SpaceButton_new {
    flex-direction: row-reverse !important;
}
[dir="rtl"] .mx_SpaceTreeLevel {
    direction: rtl !important;
}

/* ── RTL: Left panel room list ── */
[dir="rtl"] .mx_LeftPanel_filterContainer {
    direction: rtl !important;
}
[dir="rtl"] .mx_RoomTile {
    direction: rtl !important;
}
/* Physical margin swap: avatar on right, badges on left */
[dir="rtl"] .mx_RoomTile .mx_DecoratedRoomAvatar,
[dir="rtl"] .mx_RoomTile .mx_RoomTile_avatarContainer {
    margin-right: 0 !important;
    margin-left: 10px !important;
}
[dir="rtl"] .mx_RoomTile .mx_RoomTile_titleContainer {
    margin-right: 0 !important;
    margin-left: 8px !important;
    text-align: right !important;
}
[dir="rtl"] .mx_RoomTile .mx_RoomTile_notificationsButton {
    margin-left: 0 !important;
    margin-right: 4px !important;
}
[dir="rtl"] .mx_RoomTile .mx_NotificationBadge {
    margin-right: 0 !important;
    margin-left: 2px !important;
}
[dir="rtl"] .mx_RoomTile .mx_NotificationBadge_dot {
    margin-left: 7px !important;
    margin-right: 5px !important;
}
[dir="rtl"] .mx_RoomTile_nameContainer,
[dir="rtl"] .mx_RoomTile_title,
[dir="rtl"] .mx_RoomTile_name {
    text-align: right !important;
}
[dir="rtl"] .mx_RoomSublist_headerContainer {
    direction: rtl !important;
    text-align: right !important;
}
[dir="rtl"] .mx_RoomSublist_headerText {
    text-align: right !important;
}

/* ═══════════════════════════════════════════════════════
   BUBBLE POSITIONING — LTR and RTL (WhatsApp convention)
   ═══════════════════════════════════════════════════════
   Sent messages stay on the RIGHT, received on the LEFT, in both LTR and RTL.
   The base CSS uses margin-inline-start: auto for sent, which flips to LEFT in RTL.
   We override with physical margins to keep sent=RIGHT regardless of dir.
   ═══════════════════════════════════════════════════════ */

/* Sent → RIGHT in RTL (override the logical CSS flip) */
[dir="rtl"] .mx_EventTile[data-layout="bubble"][data-self="true"] .mx_EventTile_line {
    margin-left: auto !important;
    margin-right: 0 !important;
    padding: 12px 18px 10px 18px !important;
}

/* Received → LEFT in RTL (override the inline-start default which would put it RIGHT) */
[dir="rtl"] .mx_EventTile[data-layout="bubble"][data-self="false"] .mx_EventTile_line {
    margin-right: auto !important;
    margin-left: 0 !important;
    padding: 12px 18px 10px 18px !important;
}

/* ══ Sender name: align to the same physical side as the received bubble (LEFT in RTL) ══
   Root cause (CSS §10.3.3): in RTL block formatting, an over-constrained block element's
   left margin absorbs remaining space, placing the element at the physical RIGHT.
   Fix: explicitly set margin-right: auto so the RIGHT margin absorbs remaining space,
   pushing the element to the physical LEFT.

   Two code paths:
   1. Default Room timeline  → {sender} is a DIRECT child of li.mx_EventTile
   2. Thread timeline        → {sender} is inside .mx_EventTile_senderDetails
*/

/* ── Path 1: direct child (Room/Search/Pinned timelines) ── */
[dir="rtl"] .mx_EventTile[data-layout="bubble"][data-self="false"] > .mx_DisambiguatedProfile {
    display: block !important;         /* ensure block so margins apply */
    margin-right: auto !important;     /* RIGHT margin absorbs space → element at physical LEFT */
    margin-left: 0 !important;
}

/* ── Path 2: inside senderDetails wrapper (Thread timeline) ── */
[dir="rtl"] .mx_EventTile[data-layout="bubble"][data-self="false"] .mx_EventTile_senderDetails,
[dir="rtl"] .mx_EventTile[data-layout="bubble"][data-self="false"] .mx_EventTile_senderDetailsLink {
    display: block !important;
    width: fit-content !important;     /* shrink so margin has room to absorb */
    max-width: 70% !important;
    margin-right: auto !important;
    margin-left: 0 !important;
}

/* Reactions & footer: keep aligned with bubble side in RTL.
   In a RTL flex-row: flex-start=RIGHT (physical), flex-end=LEFT (physical).
   We want reactions on RIGHT in LTR and LEFT in RTL, so flex-end works for both.
   Footer alignment mirrors this. */
[dir="rtl"] .mx_EventTile[data-layout="bubble"][data-self="true"] .mx_EventTile_footer,
[dir="rtl"] .mx_EventTile[data-layout="bubble"][data-self="false"] .mx_EventTile_footer {
    justify-content: flex-start !important;
}

/* ── Message text: auto-detect direction per paragraph ──
   unicode-bidi: plaintext lets the browser set direction per-paragraph:
   Arabic/Farsi → RTL (right-aligned), English/Latin → LTR (left-aligned) */
.mx_EventTile_body,
.mx_EventTile_content {
    unicode-bidi: plaintext !important;
    text-align: start !important;
}
[dir="rtl"] .mx_DisambiguatedProfile {
    text-align: right !important;
}

/* ── RTL: Composer bar ──
   In RTL flex-direction: row, source order maps physically right→left:
     [E2E icon]  [input]  [actions (emoji/attach/voice/send)]
   becomes visually:
     [actions]  [input]  [E2E icon]
   i.e. emoji/attach buttons are on the physical LEFT, E2E icon on the RIGHT.
   We move E2E to the far LEFT by giving it a high order value. */

/* E2E encryption icon: the base CSS uses position: absolute; inset-inline-start: 20px.
   In RTL inset-inline-start resolves to right: 20px — placing the icon at the physical
   RIGHT (near the send button / input start). We move it to the physical LEFT instead
   so it sits near the action buttons and doesn't overlap the typing cursor. */
[dir="rtl"] .mx_MessageComposer_e2eIconWrapper {
    inset-inline-start: unset !important;  /* cancel: right: 20px (RTL resolution) */
    right: unset !important;
    left: 20px !important;                 /* anchor to physical LEFT */
}

/* Send button: rightmost in the RTL actions group (closest to input) */
[dir="rtl"] .mx_MessageComposer_actions .mx_MessageComposer_sendMessage {
    order: -1 !important;
}

/* ── Popup menus — label text auto-detects direction ── */
.mx_ContextualMenu .mx_IconizedContextMenu_label,
.mx_IconizedContextMenu .mx_IconizedContextMenu_label {
    unicode-bidi: plaintext !important;
    text-align: start !important;
}

/* ── RTL: Popup menus follow page direction ──
   When dir=rtl, menus inherit rtl from html element.
   We add specific fixes so items flow right-to-left correctly. */

/* IconizedContextMenu items: icon right, label left in RTL */
[dir="rtl"] .mx_IconizedContextMenu .mx_IconizedContextMenu_item {
    flex-direction: row-reverse !important;
}
[dir="rtl"] .mx_IconizedContextMenu .mx_IconizedContextMenu_item svg + .mx_IconizedContextMenu_label {
    padding-left: 0 !important;
    padding-right: 14px !important;
}
[dir="rtl"] .mx_IconizedContextMenu .mx_IconizedContextMenu_label {
    text-align: right !important;
    unicode-bidi: plaintext !important;
}
[dir="rtl"] .mx_IconizedContextMenu .mx_IconizedContextMenu_sublabel {
    margin-left: 0 !important;
    margin-right: 20px !important;
}
[dir="rtl"] .mx_IconizedContextMenu svg.mx_IconizedContextMenu_checked {
    margin-left: -5px !important;
    margin-right: 16px !important;
}
[dir="rtl"] .mx_IconizedContextMenu .mx_BetaCard_betaPill {
    margin-left: 0 !important;
    margin-right: 16px !important;
}

/* RTL: SpaceCreateMenu form — text and inputs align right */
[dir="rtl"] .mx_SpaceCreateMenu_wrapper .mx_ContextualMenu {
    direction: rtl !important;
    text-align: right !important;
}
[dir="rtl"] .mx_SpaceCreateMenu_wrapper .mx_AccessibleButton_kind_primary {
    margin-left: 0 !important;
    margin-right: auto !important;
}

/* RTL: EmojiPicker — search bar and headers flow right */
[dir="rtl"] .mx_EmojiPicker {
    direction: rtl !important;
}
[dir="rtl"] .mx_EmojiPicker .mx_EmojiPicker_search {
    flex-direction: row-reverse !important;
}
[dir="rtl"] .mx_EmojiPicker .mx_EmojiPicker_search input {
    text-align: right !important;
}
[dir="rtl"] .mx_EmojiPicker .mx_EmojiPicker_category_label {
    text-align: right !important;
}

/* ── Composer input: auto-detect text direction per paragraph ── */
/* unicode-bidi: plaintext lets the browser flip direction per-character run,
   so English text stays LTR and Arabic/Farsi text becomes RTL automatically */
.mx_BasicMessageComposer_input,
.mx_WysiwygComposer_Editor_content {
    unicode-bidi: plaintext !important;
}
/* In an RTL interface, cursor starts from the right */
[dir="rtl"] .mx_BasicMessageComposer_input,
[dir="rtl"] .mx_WysiwygComposer_Editor_content {
    direction: rtl !important;
    text-align: right !important;
    unicode-bidi: plaintext !important;
}
/* Ensure emoji and other inline elements don't break direction */
[dir="rtl"] .mx_BasicMessageComposer_input span,
[dir="rtl"] .mx_WysiwygComposer_Editor_content span {
    unicode-bidi: embed !important;
}

/* ── Composer: full-width, flush to all edges ──
   The bar should cover the entire bottom of the chat area edge-to-edge,
   with no gap between it and the left panel or right edge. */
.mx_MessageComposer {
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    margin: 0 !important;
    padding: 0 !important;
    flex-shrink: 0 !important;
    border-top: 1px solid var(--cpd-color-border-interactive-secondary, rgba(0,0,0,0.08)) !important;
    border-radius: 0 !important;
}
.mx_MessageComposer_wrapper {
    width: 100% !important;
    box-sizing: border-box !important;
    padding: 8px 12px 10px !important;
    margin: 0 !important;
}
.mx_MessageComposer_row {
    width: 100% !important;
    box-sizing: border-box !important;
    align-items: center !important;
    gap: 4px !important;
}
/* Input expands to fill all space between icon and buttons */
.mx_MessageComposer_row .mx_BasicMessageComposer,
.mx_MessageComposer_row .mx_WysiwygComposer {
    flex: 1 1 0 !important;
    min-width: 0 !important;
}
/* Remove bottom gap / safe-area push that creates whitespace below composer */
.mx_RoomView_body {
    padding-bottom: 0 !important;
}
.mx_RoomView_statusArea {
    padding: 0 !important;
    flex-shrink: 0 !important;
}

/* ── Space button: margin between icon and name ── */
.mx_SpaceButton_name {
    margin-inline-start: 8px !important;
}

/* ── RTL: Space create context menu — open on right side ── */
[dir="rtl"] .mx_SpacePanel_contextMenu {
    left: auto !important;
    right: 0 !important;
}

/* ── RTL: Space panel toggle collapse button — on correct side ── */
[dir="rtl"] .mx_SpacePanel .mx_SpacePanel_toggleCollapse {
    right: auto !important;
    left: -8px !important;
}

/* ── RTL: SpacePillButton — icon on right, text right-aligned ── */
[dir="rtl"] .mx_SpacePillButton {
    padding: 18px 72px 18px 24px !important;
    text-align: right !important;
}
[dir="rtl"] .mx_SpacePillButton svg {
    left: auto !important;
    right: 22px !important;
}

/* ── RTL: Reply quote line on the right side ── */
[dir="rtl"] .mx_ReplyChain {
    padding-left: 0 !important;
    padding-right: 10px !important;
    border-left: none !important;
    border-right: 2px solid var(--username-color) !important;
    text-align: right !important;
}

/* ── System / info events: ensure fully transparent in bubble layout ── */
.mx_EventTile_info .mx_EventTile_line,
.mx_EventTile_info::before,
.mx_EventTile.mx_EventTile_info {
    background: transparent !important;
    box-shadow: none !important;
}
/* ── Hide avatar on info/state events (rename, invite, etc.) ── */
.mx_EventTile_info .mx_EventTile_avatar,
.mx_EventTile.mx_EventTile_info .mx_EventTile_avatar,
.mx_GenericEventListSummary .mx_EventTile_avatar {
    display: none !important;
}

/* ── RTL: Action tools on left side ── */
[dir="rtl"] .mx_MessageActionBar {
    flex-direction: row-reverse !important;
}

/* ── Adequate spacing: action bar & emoji ── */
.mx_MessageActionBar {
    min-width: 60px !important;
    gap: 2px !important;
}
.mx_MessageActionBar_iconButton {
    min-width: 28px !important;
    min-height: 28px !important;
}

/* ══════════════════════════════════════════════════════
   BUBBLE BOTTOM ROW — reactions left, time+ticks right
   ══════════════════════════════════════════════════════

   Layout (LTR and RTL both physical left→right):
   [+][😀][😂][❤️]  ···  [12:34 ✓✓]

   - direction: ltr forces physical LTR regardless of page dir
   - Separator line above with padding
   - Reactions wrap at max 3 per row; bubble grows vertically
   - Time+ticks are align-self: flex-end (bottom of the row)
*/

.mx_EventTile_bubbleBottom {
    display: flex !important;
    flex-direction: row !important;
    align-items: flex-end !important;
    /* physical LTR: reactions always left, time always right */
    direction: ltr !important;
    border-top: none !important;
    margin-top: 6px !important;
    padding-top: 0 !important;
    /* inner side padding so content doesn't touch bubble borders */
    padding-left: 2px !important;
    padding-right: 2px !important;
    padding-bottom: 2px !important;
    min-height: 22px !important;
    width: 100% !important;
    box-sizing: border-box !important;
}

/* ── Reactions: left side, wraps at max ~3 pills per row ── */
.mx_EventTile[data-layout="bubble"] .mx_ReactionsRow {
    position: static !important;
    inset: auto !important;
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: wrap !important;
    /* flex-grow: 0 so it doesn't expand beyond its content */
    flex: 0 0 auto !important;
    /* max-width = 3 pills × 54px + 2 gaps × 4px = 170px */
    max-width: 170px !important;
    gap: 4px !important;
    margin: 0 !important;
    padding: 0 !important;
    background: transparent !important;
    border: none !important;
    align-content: flex-start !important;
}

/* Add-reaction "+" button: always leftmost, always visible */
.mx_EventTile[data-layout="bubble"] .mx_ReactionsRow .mx_ReactionsRow_addReactionButton,
.mx_EventTile[data-layout="bubble"] .mx_ReactionsRow [class*="addReaction"],
.mx_EventTile[data-layout="bubble"] .mx_ReactionsRow [aria-label*="eact"] {
    order: -1 !important;
    display: inline-flex !important;
    visibility: visible !important;
    opacity: 0.65 !important;
    background: rgba(0, 0, 0, 0.07) !important;
    font-size: 15px !important;
    pointer-events: auto !important;
}

/* ── Time + ticks: pushed to far right, aligned to bottom ── */
.mx_EventTile_bubbleTimeRow {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 3px !important;
    flex-shrink: 0 !important;
    /* push to the right */
    margin-left: auto !important;
    padding-left: 8px !important;
    white-space: nowrap !important;
    align-self: flex-end !important;
}

/* Timestamp: static in the row */
.mx_EventTile_bubbleTimeRow a,
.mx_EventTile_bubbleTimeRow .mx_MessageTimestamp {
    position: static !important;
    inset: auto !important;
    padding: 0 1px !important;
    font-size: 0.68em !important;
    opacity: 0.75 !important;
    background: transparent !important;
    color: inherit !important;
    white-space: nowrap !important;
}

/* Ticks: static in the row */
.mx_EventTile_bubbleTimeRow .mx_EventTile_msgOption {
    position: static !important;
    inset: auto !important;
    overflow: visible !important;
    display: flex !important;
    align-items: center !important;
}
.mx_EventTile[data-layout="bubble"][data-self="false"] .mx_EventTile_bubbleTimeRow .mx_EventTile_msgOption {
    display: none !important;
}

/* Reset ReadReceiptGroup inside the time row */
.mx_EventTile_bubbleTimeRow .mx_ReadReceiptGroup {
    position: static !important;
    inset: auto !important;
}

/* ── Time row: always visible — Telegram muted blue-gray ── */
.mx_EventTile[data-layout="bubble"] .mx_EventTile_bubbleTimeRow,
.mx_EventTile[data-layout="bubble"] .mx_EventTile_bubbleTimeRow * {
    color: #8b97a2 !important;
}
`);

    // ── Delivery status ticks ─────────────────────────────────────────────────
    rules.push(`
/* ── Delivery ticks ── */
.mx_DeliveryStatus {
    display: inline-flex;
    align-items: center;
    margin-inline-end: 2px;
    flex-shrink: 0;
    vertical-align: middle;
    line-height: 1;
}
/* Sending (clock): Telegram muted */
.mx_DeliveryStatus_sending svg {
    color: #8b97a2 !important;
    opacity: 0.6;
}
/* Single tick: sent — Telegram muted blue-gray */
.mx_DeliveryStatus_sent svg {
    color: #8b97a2 !important;
    opacity: 1;
}
/* Double tick: seen — Telegram blue */
.mx_DeliveryStatus_seen svg {
    color: #4fa3e0 !important;
    opacity: 1;
}
/* Failed */
.mx_DeliveryStatus_failed {
    margin-inline-end: 0;
}
/* Received messages: hide ticks */
.mx_EventTile[data-self="false"] .mx_DeliveryStatus {
    display: none !important;
}

/* ── Read receipt button: compact, clean ── */
.mx_ReadReceiptGroup_button {
    display: inline-flex !important;
    align-items: center !important;
    gap: 2px !important;
    cursor: pointer !important;
    background: transparent !important;
    border: none !important;
    padding: 0 !important;
}

/* ── Read receipt popup: search box ── */
.mx_ReadReceiptGroup_search {
    padding: 8px 12px 4px !important;
}
.mx_ReadReceiptGroup_searchInput {
    width: 100% !important;
    box-sizing: border-box !important;
    padding: 6px 10px !important;
    border: 1px solid #d0d7de !important;
    border-radius: 8px !important;
    font-size: 0.85em !important;
    outline: none !important;
    background: #f6f8fa !important;
    color: #1a1a1a !important;
}
.mx_ReadReceiptGroup_searchInput:focus {
    border-color: #4fa3e0 !important;
    background: #ffffff !important;
}
.mx_ReadReceiptGroup_noResults {
    text-align: center !important;
    padding: 12px !important;
    font-size: 0.85em !important;
    color: #8b97a2 !important;
    margin: 0 !important;
}
`);

    // ── Voice playback speed button ────────────────────────────────────────────
    rules.push(`
/* ── Voice message: speed control button ── */
.mx_VoicePlayback_speedButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    height: 24px;
    padding: 0 6px;
    border-radius: 12px;
    border: 1.5px solid currentColor;
    background: transparent;
    color: var(--cpd-color-text-secondary, #666);
    font-size: 0.72em;
    font-weight: 700;
    cursor: pointer;
    margin-inline-start: 4px;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
    letter-spacing: 0.02em;
}
.mx_VoicePlayback_speedButton:hover {
    background: var(--cpd-color-bg-subtle-primary, rgba(0,0,0,0.07));
    color: var(--cpd-color-text-primary, #222);
}
.mx_VoicePlayback_speedButton:active {
    background: var(--cpd-color-bg-subtle-secondary, rgba(0,0,0,0.12));
}
`);

    // ── Fanoos audio players ──────────────────────────────────────────────────
    rules.push(`
/* ─── Shared base styles ─── */
.mx_FanoosPlayer {
    box-sizing: border-box;
    font-family: inherit;
}
.mx_FanoosPlayer_error {
    color: var(--cpd-color-text-critical-primary, #c00);
    font-size: 0.85em;
    padding: 6px;
}
.mx_FanoosPlayer_loading {
    color: var(--cpd-color-text-secondary, #888);
    font-size: 0.85em;
    padding: 6px;
}
/* play button base */
.mx_FanoosPlayer_playBtn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: none;
    background: var(--cpd-color-bg-action-primary-rest, #3b6fd4);
    color: #fff;
    font-size: 0.85em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s;
    padding: 0;
}
.mx_FanoosPlayer_playBtn:hover { background: var(--cpd-color-bg-action-primary-hovered, #2a5ab8); }
.mx_FanoosPlayer_playBtn:disabled { opacity: 0.4; cursor: default; }
/* seek */
.mx_FanoosPlayer_seekWrapper {
    flex: 1;
    position: relative;
    height: 20px;
    display: flex;
    align-items: center;
    min-width: 60px;
}
.mx_FanoosPlayer_progressTrack {
    position: absolute;
    left: 0; right: 0;
    height: 4px;
    border-radius: 2px;
    background: var(--cpd-color-bg-subtle-primary, rgba(0,0,0,0.12));
    overflow: hidden;
    pointer-events: none;
}
.mx_FanoosPlayer_progressFill {
    height: 100%;
    background: var(--cpd-color-bg-action-primary-rest, #3b6fd4);
    border-radius: 2px;
    transition: width 0.1s linear;
}
.mx_FanoosPlayer_seekInput {
    position: absolute;
    left: 0; right: 0;
    width: 100%;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    height: 20px;
    margin: 0;
    cursor: pointer;
    z-index: 1;
}
.mx_FanoosPlayer_seekInput::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px; height: 12px;
    border-radius: 50%;
    background: var(--cpd-color-bg-action-primary-rest, #3b6fd4);
}
.mx_FanoosPlayer_seekInput:disabled { opacity: 0.4; cursor: default; }
/* clock */
.mx_FanoosPlayer_clock {
    font-size: 0.72em;
    color: var(--cpd-color-text-secondary, #666);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
}
.mx_FanoosPlayer_clockSep { opacity: 0.5; }
/* speed button (cycle) */
.mx_FanoosPlayer_speedBtn {
    min-width: 34px; height: 22px;
    padding: 0 6px;
    border-radius: 11px;
    border: 1.5px solid currentColor;
    background: transparent;
    color: var(--cpd-color-text-secondary, #666);
    font-size: 0.72em; font-weight: 700;
    cursor: pointer; flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
}
.mx_FanoosPlayer_speedBtn:hover {
    background: var(--cpd-color-bg-subtle-primary, rgba(0,0,0,0.07));
    color: var(--cpd-color-text-primary, #222);
}

/* ─── Minimal player ─── */
.mx_FanoosPlayer_minimal {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 10px;
    border-radius: 12px;
    background: var(--cpd-color-bg-subtle-secondary, rgba(0,0,0,0.05));
    min-width: 220px;
    max-width: 340px;
}

/* ─── Telegram player ─── */
.mx_FanoosPlayer_telegram {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 14px;
    background: var(--cpd-color-bg-subtle-secondary, rgba(0,0,0,0.05));
    min-width: 220px;
    max-width: 340px;
}
.mx_FanoosPlayer_tgCircle {
    width: 38px; height: 38px;
    border-radius: 50%;
    border: none;
    background: var(--cpd-color-bg-action-primary-rest, #3b6fd4);
    color: #fff;
    font-size: 1em;
    cursor: pointer;
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s;
    padding: 0;
}
.mx_FanoosPlayer_tgCircle:hover { background: var(--cpd-color-bg-action-primary-hovered, #2a5ab8); }
.mx_FanoosPlayer_tgCircle:disabled { opacity: 0.4; cursor: default; }
.mx_FanoosPlayer_tgIcon { line-height: 1; }
.mx_FanoosPlayer_tgRight { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.mx_FanoosPlayer_tgWave {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 26px;
    cursor: pointer;
    user-select: none;
}
.mx_FanoosPlayer_tgBar {
    width: 3px;
    border-radius: 2px;
    background: var(--cpd-color-bg-subtle-primary, rgba(0,0,0,0.2));
    transition: background 0.15s, transform 0.1s;
    flex-shrink: 0;
}
.mx_FanoosPlayer_tgBar_played {
    background: var(--cpd-color-bg-action-primary-rest, #3b6fd4);
}
.mx_FanoosPlayer_tgBar_active {
    transform: scaleY(1.15);
    background: var(--cpd-color-bg-action-primary-hovered, #2a5ab8) !important;
}
.mx_FanoosPlayer_tgMeta {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

/* ─── Modern player ─── */
.mx_FanoosPlayer_modern {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--cpd-color-bg-subtle-secondary, rgba(0,0,0,0.05));
    min-width: 240px;
    max-width: 360px;
    box-sizing: border-box;
}
.mx_FanoosPlayer_modernTop {
    display: flex;
    align-items: center;
    gap: 10px;
}
.mx_FanoosPlayer_modernPlay {
    width: 36px; height: 36px;
    border-radius: 50%;
    border: none;
    background: var(--cpd-color-bg-action-primary-rest, #3b6fd4);
    color: #fff;
    font-size: 1em;
    cursor: pointer;
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s;
    padding: 0;
}
.mx_FanoosPlayer_modernPlay:hover { background: var(--cpd-color-bg-action-primary-hovered, #2a5ab8); }
.mx_FanoosPlayer_modernPlay:disabled { opacity: 0.4; cursor: default; }
.mx_FanoosPlayer_modernSeekArea { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.mx_FanoosPlayer_modernTimes {
    display: flex;
    justify-content: space-between;
}
.mx_FanoosPlayer_modernSpeeds {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
}
.mx_FanoosPlayer_modernSpeedBtn {
    flex: 1;
    min-width: 36px;
    height: 22px;
    border-radius: 11px;
    border: 1.5px solid var(--cpd-color-border-interactive-secondary, rgba(0,0,0,0.2));
    background: transparent;
    color: var(--cpd-color-text-secondary, #666);
    font-size: 0.72em; font-weight: 700;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.mx_FanoosPlayer_modernSpeedBtn:hover {
    background: var(--cpd-color-bg-subtle-primary, rgba(0,0,0,0.07));
}
.mx_FanoosPlayer_modernSpeedBtn_active {
    background: var(--cpd-color-bg-action-primary-rest, #3b6fd4) !important;
    color: #fff !important;
    border-color: var(--cpd-color-bg-action-primary-rest, #3b6fd4) !important;
}

/* ─── Player picker in settings ─── */
.mx_FanoosPlayerPicker_grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
    margin-top: 8px;
}
.mx_FanoosPlayerPicker_card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    border: 2px solid var(--cpd-color-border-interactive-secondary, rgba(0,0,0,0.12));
    background: var(--cpd-color-bg-canvas-default, #fff);
    cursor: pointer;
    text-align: start;
    transition: border-color 0.15s, box-shadow 0.15s;
}
.mx_FanoosPlayerPicker_card:hover {
    border-color: var(--cpd-color-bg-action-primary-rest, #3b6fd4);
}
.mx_FanoosPlayerPicker_card_active {
    border-color: var(--cpd-color-bg-action-primary-rest, #3b6fd4) !important;
    box-shadow: 0 0 0 2px var(--cpd-color-bg-action-primary-rest, #3b6fd4);
}
.mx_FanoosPlayerPicker_preview {
    pointer-events: none;
}
.mx_FanoosPlayerPicker_label {
    font-size: 0.78em;
    font-weight: 600;
    color: var(--cpd-color-text-secondary, #555);
    text-align: center;
}
.mx_FanoosPlayerPicker_defaultPreview {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 52px;
    gap: 4px;
    font-size: 0.9em;
    color: var(--cpd-color-text-secondary, #666);
    background: var(--cpd-color-bg-subtle-secondary, rgba(0,0,0,0.04));
    border-radius: 8px;
}
`);

    // ── Fanoos native audio player (legacy — kept for compat) ─────────────────
    rules.push(`
.mx_FanoosNativeAudioPlayer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 12px;
    background: var(--cpd-color-bg-subtle-secondary, rgba(0,0,0,0.05));
    min-width: 220px;
    max-width: 340px;
    box-sizing: border-box;
}
.mx_FanoosNativeAudioPlayer_error {
    color: var(--cpd-color-text-critical-primary, #c00);
    font-size: 0.85em;
}
.mx_FanoosNativeAudioPlayer_playPause {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--cpd-color-bg-action-primary-rest, #3b6fd4);
    color: #fff;
    font-size: 0.9em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s;
}
.mx_FanoosNativeAudioPlayer_playPause:hover {
    background: var(--cpd-color-bg-action-primary-hovered, #2a5ab8);
}
.mx_FanoosNativeAudioPlayer_playPause:disabled {
    opacity: 0.4;
    cursor: default;
}
.mx_FanoosNativeAudioPlayer_seekWrapper {
    flex: 1;
    position: relative;
    height: 20px;
    display: flex;
    align-items: center;
}
.mx_FanoosNativeAudioPlayer_seek {
    width: 100%;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 2px;
    background: var(--cpd-color-bg-subtle-primary, rgba(0,0,0,0.15));
    outline: none;
    cursor: pointer;
    position: relative;
    z-index: 1;
}
.mx_FanoosNativeAudioPlayer_seek::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--cpd-color-bg-action-primary-rest, #3b6fd4);
    cursor: pointer;
}
.mx_FanoosNativeAudioPlayer_progress {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 4px;
    background: var(--cpd-color-bg-action-primary-rest, #3b6fd4);
    border-radius: 2px;
    pointer-events: none;
    max-width: 100%;
}
.mx_FanoosNativeAudioPlayer_clock {
    font-size: 0.72em;
    color: var(--cpd-color-text-secondary, #666);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
}
.mx_FanoosNativeAudioPlayer_speed {
    min-width: 34px;
    height: 22px;
    padding: 0 5px;
    border-radius: 11px;
    border: 1.5px solid currentColor;
    background: transparent;
    color: var(--cpd-color-text-secondary, #666);
    font-size: 0.72em;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
}
.mx_FanoosNativeAudioPlayer_speed:hover {
    background: var(--cpd-color-bg-subtle-primary, rgba(0,0,0,0.07));
    color: var(--cpd-color-text-primary, #222);
}
`);

    // ── Font size widget CSS ───────────────────────────────────────────────────
    rules.push(`
/* ── Quick settings: font size widget ── */
.mx_QuickSettingsButton_fontSizeWidget {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0 8px;
    direction: ltr !important; /* Always LTR so small-A is on left, big-A on right */
}
.mx_QuickSettingsButton_fontSizeStep {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: none;
    background: var(--cpd-color-bg-subtle-secondary, #e8eef8);
    color: var(--cpd-color-text-primary, #222);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 0.8em;
    padding: 0;
    transition: background 0.15s;
}
.mx_QuickSettingsButton_fontSizeStep:not([disabled]):hover {
    background: var(--cpd-color-bg-subtle-primary, #dde5f5);
}
.mx_QuickSettingsButton_fontSizeStep[disabled] {
    opacity: 0.35;
    cursor: not-allowed;
}
.mx_QuickSettingsButton_fontSizeStepBig {
    font-size: 1em;
}
.mx_QuickSettingsButton_fontSizeTrack {
    flex: 1;
    position: relative;
    height: 6px;
    background: var(--cpd-color-bg-subtle-secondary, #e8eef8);
    border-radius: 3px;
    overflow: visible;
    display: flex;
    align-items: center;
}
.mx_QuickSettingsButton_fontSizeBar {
    position: absolute;
    left: 0;
    top: 0;
    height: 6px;
    background: var(--cpd-color-bg-action-primary-rest, #3b6fd4);
    border-radius: 3px;
    transition: width 0.15s;
    pointer-events: none;
}
.mx_QuickSettingsButton_fontSizeLabel {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    top: -18px;
    font-size: 0.7em;
    color: var(--cpd-color-text-secondary, #666);
    white-space: nowrap;
    pointer-events: none;
}
`);

    // ── Telegram-like bubble aesthetics ──────────────────────────────────────
    rules.push(`
/* ── Bubble line: flex column so bottom row sits at the bottom ── */
.mx_EventTile[data-layout="bubble"] .mx_EventTile_line {
    display: flex !important;
    flex-direction: column !important;
    min-width: 110px !important;
    box-shadow: none !important;
}

/* Sent: notch top-right */
.mx_EventTile[data-layout="bubble"][data-self="true"] .mx_EventTile_line {
    border-radius: 18px 4px 18px 18px !important;
    padding: 12px 18px 10px 18px !important;
}
/* Received: notch top-left */
.mx_EventTile[data-layout="bubble"][data-self="false"] .mx_EventTile_line {
    border-radius: 4px 18px 18px 18px !important;
    padding: 12px 18px 10px 18px !important;
}

/* Message text */
.mx_EventTile[data-layout="bubble"] .mx_EventTile_body {
    line-height: 1.6 !important;
}

/* Tighter spacing between consecutive bubbles */
.mx_EventTile[data-layout="bubble"] + .mx_EventTile[data-layout="bubble"] {
    margin-top: 2px !important;
}

/* ── Reply chain ── */
.mx_EventTile[data-layout="bubble"] .mx_ReplyChain_wrapper {
    background: rgba(0, 0, 0, 0.06) !important;
    border-left: 3px solid var(--cpd-color-bg-action-primary-rest, #3b6fd4) !important;
    border-right: none !important;
    border-top: none !important;
    border-bottom: none !important;
    border-radius: 0 6px 6px 0 !important;
    padding: 4px 8px !important;
    margin-bottom: 6px !important;
    overflow: hidden !important;
    max-height: 48px !important;
}
[dir="rtl"] .mx_EventTile[data-layout="bubble"] .mx_ReplyChain_wrapper {
    border-left: none !important;
    border-right: 3px solid var(--cpd-color-bg-action-primary-rest, #3b6fd4) !important;
    border-radius: 6px 0 0 6px !important;
}
.mx_EventTile[data-layout="bubble"] .mx_ReplyChain {
    background: transparent !important;
    border: none !important;
    padding: 0 !important;
    margin: 0 !important;
}
.mx_EventTile[data-layout="bubble"] .mx_ReplyChain .mx_DisambiguatedProfile,
.mx_EventTile[data-layout="bubble"] .mx_ReplyChain .mx_DisambiguatedProfile_displayName {
    color: var(--cpd-color-bg-action-primary-rest, #3b6fd4) !important;
    font-weight: 600 !important;
    font-size: 0.78em !important;
    opacity: 1 !important;
    margin-bottom: 1px !important;
}
.mx_EventTile[data-layout="bubble"] .mx_ReplyChain .mx_EventTile_reply,
.mx_EventTile[data-layout="bubble"] .mx_ReplyChain .mx_EventTile_body {
    background: transparent !important;
    font-size: 0.85em !important;
    opacity: 0.85 !important;
    overflow: hidden !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 1 !important;
    -webkit-box-orient: vertical !important;
}

/* Sender name */
.mx_EventTile[data-layout="bubble"] .mx_DisambiguatedProfile_displayName {
    font-weight: 600 !important;
    font-size: 0.82em !important;
    margin-bottom: 3px !important;
}

/* Timestamp */
.mx_EventTile[data-layout="bubble"] .mx_MessageTimestamp {
    font-size: 0.68em !important;
    opacity: 0.75 !important;
    color: inherit !important;
}

/* ── IMAGE: bleed to bubble edges ── */
.mx_EventTile[data-layout="bubble"] .mx_MImageBody,
.mx_EventTile[data-layout="bubble"] .mx_MImageBody_thumbnail_container {
    border-radius: 12px !important;
    overflow: hidden !important;
    margin: -4px -4px 0 !important;
    background: rgba(0, 0, 0, 0.08) !important;
}
.mx_EventTile[data-layout="bubble"] .mx_MImageBody img {
    display: block !important;
    width: 100% !important;
    object-fit: cover !important;
}
/* Reduce bubble padding when image is present */
.mx_EventTile[data-layout="bubble"][data-self="true"]  .mx_EventTile_line:has(.mx_MImageBody) { padding: 4px 4px 10px !important; }
.mx_EventTile[data-layout="bubble"][data-self="false"] .mx_EventTile_line:has(.mx_MImageBody) { padding: 4px 4px 10px !important; }

/* ── FILE attachment ── */
.mx_EventTile[data-layout="bubble"] .mx_MFileBody {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 4px 2px !important;
    min-width: 200px !important;
}
/* File icon: rounded square */
.mx_EventTile[data-layout="bubble"] .mx_MFileBody svg,
.mx_EventTile[data-layout="bubble"] .mx_MFileBody .mx_MFileBody_fileicon {
    width: 38px !important;
    height: 38px !important;
    flex-shrink: 0 !important;
    border-radius: 10px !important;
    background: rgba(255, 255, 255, 0.20) !important;
    padding: 8px !important;
    opacity: 1 !important;
}
.mx_EventTile[data-layout="bubble"][data-self="false"] .mx_MFileBody svg,
.mx_EventTile[data-layout="bubble"][data-self="false"] .mx_MFileBody .mx_MFileBody_fileicon {
    background: rgba(59, 111, 212, 0.12) !important;
}
.mx_EventTile[data-layout="bubble"] .mx_MFileBody_info {
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
    min-width: 0 !important;
    flex: 1 !important;
}
.mx_EventTile[data-layout="bubble"] .mx_MFileBody_info_filename {
    font-weight: 600 !important;
    font-size: 0.88em !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}
.mx_EventTile[data-layout="bubble"] .mx_MFileBody_size {
    font-size: 0.72em !important;
    opacity: 0.7 !important;
}

/* ── VOICE / AUDIO player ── */
.mx_EventTile[data-layout="bubble"] .mx_MediaBody.mx_VoiceMessagePrimaryContainer {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 2px 0 !important;
    min-width: 220px !important;
    background: transparent !important;
}
/* Play/pause button */
.mx_EventTile[data-layout="bubble"] .mx_PlayPauseButton {
    width: 38px !important;
    height: 38px !important;
    border-radius: 50% !important;
    background: rgba(255, 255, 255, 0.25) !important;
    flex-shrink: 0 !important;
}
.mx_EventTile[data-layout="bubble"][data-self="false"] .mx_PlayPauseButton {
    background: rgba(59, 111, 212, 0.15) !important;
}
/* Waveform bars */
.mx_EventTile[data-layout="bubble"] .mx_PlaybackWaveform {
    flex: 1 !important;
    height: 28px !important;
    gap: 2px !important;
}
.mx_EventTile[data-layout="bubble"] .mx_PlaybackWaveform .mx_PlaybackWaveform_bar {
    width: 3px !important;
    border-radius: 2px !important;
    opacity: 0.55 !important;
}
/* Clock */
.mx_EventTile[data-layout="bubble"] .mx_PlaybackClock {
    font-size: 0.72em !important;
    opacity: 0.75 !important;
    flex-shrink: 0 !important;
    min-width: 30px !important;
    text-align: right !important;
}

/* ── Footer alignment (non-bubble reactions etc.) ── */
.mx_EventTile[data-layout="bubble"][data-self="true"] .mx_EventTile_footer {
    justify-content: flex-end !important;
}
.mx_EventTile[data-layout="bubble"][data-self="false"] .mx_EventTile_footer {
    justify-content: flex-start !important;
}

/* ── Read receipts ── */
.mx_ReadReceiptGroup_container { border: none !important; }
.mx_ReadReceiptGroup .mx_BaseAvatar { width: 16px !important; height: 16px !important; }
.mx_ReadReceiptGroup_title { padding: 10px 12px 4px !important; font-size: 0.85em !important; color: #8b97a2 !important; margin: 0 !important; }
.mx_ReadReceiptGroup_popup { min-width: 220px !important; max-height: 320px !important; overflow: hidden !important; }

/* ── Unread badge ── */
.mx_RoomTile_notificationsButton .mx_NotificationBadge,
.mx_RoomTile .mx_NotificationBadge {
    border-radius: 10px !important;
    min-width: 18px !important;
    height: 18px !important;
    font-size: 0.7em !important;
    font-weight: 700 !important;
    padding: 0 5px !important;
}
.mx_NotificationBadge_unread { font-weight: 700 !important; }
.mx_NotificationBadge_muted  { background-color: #b0b8c8 !important; }
.mx_RoomTile_hasUnreadMentions .mx_RoomTile_name,
.mx_RoomTile_hasUnreadNotif .mx_RoomTile_name { font-weight: 600 !important; }

/* ── Misc ── */
.mx_RoomPreviewBar { background: transparent !important; border: none !important; box-shadow: none !important; }
.mx_RoomPreviewBar_message { background: transparent !important; }

.mx_TextualEvent,
.mx_StatelessTextualEvent,
.mx_MemberEventListSummary,
.mx_GenericEventListSummary {
    text-align: center !important;
    font-size: 0.78em !important;
    opacity: 0.7 !important;
}
.mx_GenericEventListSummary .mx_EventTile_line,
.mx_TextualEvent .mx_EventTile_line {
    display: inline-block !important;
    background: transparent !important;
    border-radius: 12px !important;
    padding: 2px 12px !important;
}
.mx_ReplyTile:hover,
.mx_EventTile .mx_EventTile_reply:hover {
    background: transparent !important;
    background-color: transparent !important;
}

/* ── Reaction pill buttons ── */
.mx_EventTile[data-layout="bubble"] .mx_ReactionsRow .mx_ReactionsRow_item,
.mx_EventTile[data-layout="bubble"] .mx_ReactionsRow button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 3px !important;
    /* consistent pill size so exactly 3 fit per row */
    min-width: 44px !important;
    max-width: 54px !important;
    height: 24px !important;
    padding: 0 6px !important;
    border-radius: 12px !important;
    background: rgba(0, 0, 0, 0.10) !important;
    border: none !important;
    font-size: 0.82em !important;
    cursor: pointer !important;
    flex-shrink: 0 !important;
    transition: background 0.15s !important;
    box-sizing: border-box !important;
}
.mx_EventTile[data-layout="bubble"] .mx_ReactionsRow .mx_ReactionsRow_item:hover,
.mx_EventTile[data-layout="bubble"] .mx_ReactionsRow button:hover {
    background: rgba(0, 0, 0, 0.18) !important;
}
/* Own reaction: accent highlight */
.mx_EventTile[data-layout="bubble"] .mx_ReactionsRow .mx_ReactionsRow_item_reacted {
    background: rgba(59, 111, 212, 0.22) !important;
}
`);

    // ── Telegram-style right-click context menu + no hover action bar ─────────
    rules.push(`
/* ── No hover action bar — use right-click only (Telegram style) ── */
.mx_MessageActionBar {
    display: none !important;
}
/* Keep action bar visible when keyboard-focused (accessibility) */
.mx_EventTile_actionBarFocused .mx_MessageActionBar {
    display: flex !important;
}

/* ── Telegram-style context menu container ── */
.mx_ContextualMenu {
    border-radius: 12px !important;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.22) !important;
    border: none !important;
    padding: 6px 0 !important;
    min-width: 200px !important;
    overflow: hidden !important;
}

/* Message context menu: compact Telegram style */
.mx_MessageContextMenu.mx_IconizedContextMenu {
    min-width: 220px !important;
}

/* Section divider: thin subtle line */
.mx_IconizedContextMenu .mx_IconizedContextMenu_optionList:nth-child(n + 2),
.mx_IconizedContextMenu .mx_IconizedContextMenu_optionList_notFirst {
    border-top: 1px solid var(--cpd-color-border-interactive-secondary, rgba(0,0,0,0.08)) !important;
    margin: 4px 0 !important;
    padding-top: 4px !important;
}

/* Menu items: Telegram compact sizing */
.mx_IconizedContextMenu_item {
    padding: 10px 16px !important;
    font-size: 0.92rem !important;
    font-weight: 400 !important;
    border-radius: 0 !important;
    gap: 12px !important;
}
.mx_IconizedContextMenu_item:hover,
.mx_IconizedContextMenu_item:focus-visible {
    background-color: var(--cpd-color-bg-subtle-secondary, rgba(0,0,0,0.05)) !important;
}

/* Icons: Telegram-sized */
.mx_IconizedContextMenu_item svg {
    width: 20px !important;
    height: 20px !important;
    flex-shrink: 0 !important;
    opacity: 0.8 !important;
}

/* Label: clean, no extra indent */
.mx_IconizedContextMenu_item .mx_IconizedContextMenu_label {
    font-size: 0.92rem !important;
    padding-left: 0 !important;
}

/* Destructive items (Delete, Report): red */
.mx_IconizedContextMenu_optionList_red .mx_IconizedContextMenu_item,
.mx_IconizedContextMenu_item.mx_IconizedContextMenu_itemDestructive,
.mx_IconizedContextMenu_option_red {
    color: var(--cpd-color-text-critical-primary, #c93b3b) !important;
}
.mx_IconizedContextMenu_optionList_red svg,
.mx_IconizedContextMenu_item.mx_IconizedContextMenu_itemDestructive svg,
.mx_IconizedContextMenu_option_red svg {
    color: var(--cpd-color-text-critical-primary, #c93b3b) !important;
    opacity: 1 !important;
}

/* Reaction picker row in context menu: compact emoji row */
.mx_ReactionPicker {
    border-radius: 8px !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.18) !important;
    border: none !important;
}

/* ── Background pattern picker grid ── */
.mx_FanoosAppearance_patternGrid {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)) !important;
    gap: 8px !important;
    margin-top: 8px !important;
}
.mx_FanoosAppearance_patternCard {
    position: relative !important;
    width: 100% !important;
    aspect-ratio: 1 / 1 !important;
    min-height: 64px !important;
    border-radius: 10px !important;
    border: 2px solid transparent !important;
    background-color: var(--cpd-color-bg-subtle-secondary, #eaeaea) !important;
    cursor: pointer !important;
    overflow: hidden !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: flex-end !important;
    padding: 0 !important;
    transition: border-color 0.15s, box-shadow 0.15s !important;
}
.mx_FanoosAppearance_patternCard:hover {
    border-color: var(--cpd-color-border-interactive-primary, #c0cce8) !important;
}
.mx_FanoosAppearance_patternCard_active {
    border-color: var(--cpd-color-bg-action-primary-rest, #3b6fd4) !important;
    box-shadow: 0 0 0 2px var(--cpd-color-bg-action-primary-rest, #3b6fd4) !important;
}
.mx_FanoosAppearance_patternLabel {
    position: absolute !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    font-size: 0.65em !important;
    text-align: center !important;
    background: rgba(255, 255, 255, 0.82) !important;
    padding: 2px 2px 3px !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    line-height: 1.3 !important;
}

/* ── Settings dialog: comfortable padding on all panels ── */
.mx_SettingsDialog_content {
    padding: 8px 4px !important;
}
.mx_SettingsTab {
    padding: 16px 24px !important;
    box-sizing: border-box !important;
}
.mx_SettingsSection {
    padding-bottom: 8px !important;
}
.mx_SettingsSubsection {
    padding: 8px 0 !important;
}
.mx_SettingsSubsection_content {
    padding: 4px 0 !important;
}
/* Each individual setting row */
.mx_SettingsFlag,
.mx_Field,
.mx_FanoosAppearance_row {
    margin-bottom: 10px !important;
}
/* Tabs left rail padding */
.mx_TabbedView_tabLabels {
    padding: 12px 8px !important;
    gap: 4px !important;
}
.mx_TabbedView_tabLabel {
    border-radius: 8px !important;
    padding: 8px 12px !important;
}
`);

    getStyleEl().textContent = rules.join("\n");
}

// ─── Watcher ──────────────────────────────────────────────────────────────────
const FANOOS_APPEARANCE_SETTING_KEYS = [
    "fanoos.chatBgUrl",
    "fanoos.chatBgOpacity",
    "fanoos.chatBgPattern",
    "fanoos.leftPanelColor",
    "fanoos.headerColor",
    "fanoos.composerColor",
    "fanoos.chatBgColor",
    "fanoos.sentMsgColor",
    "fanoos.sentMsgTextColor",
    "fanoos.receivedMsgColor",
    "fanoos.accentColor",
    "fanoos.palette",
] as const;

type FanoosAppearanceKey = (typeof FANOOS_APPEARANCE_SETTING_KEYS)[number];

export function watchFanoosAppearance(): string[] {
    return FANOOS_APPEARANCE_SETTING_KEYS.map((k: FanoosAppearanceKey) =>
        SettingsStore.watchSetting(k, null, applyFanoosAppearance),
    );
}
