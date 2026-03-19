/*
Copyright 2026 LLM-LAB (Fanoos fork)
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
*/

/*
 * Fanoos font management — applies the user's chosen app font by overriding
 * the --cpd-font-family-sans CSS custom property on the document root.
 */

export interface FontOption {
    key: string;
    label: string;
    stack: string;
}

export const FONT_OPTIONS: FontOption[] = [
    {
        key: "IRANSansX",
        label: "IRANSansX (پیش‌فرض)",
        stack: '"IRANSansX", "Inter", "Apple Color Emoji", "Segoe UI Emoji", "Arial", "Helvetica", sans-serif',
    },
    {
        key: "Inter",
        label: "Inter",
        stack: '"Inter", "Apple Color Emoji", "Segoe UI Emoji", "Arial", "Helvetica", sans-serif',
    },
    {
        key: "System",
        label: "System font",
        stack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Arial", "Helvetica", sans-serif',
    },
];

const FONT_STYLE_ID = "fanoos-font-override";

export function applyAppFont(fontKey: string): void {
    const option = FONT_OPTIONS.find((f) => f.key === fontKey) ?? FONT_OPTIONS[0];
    const stack = option.stack;

    // Inject/update a <style> tag that overrides --cpd-font-family-sans at the highest
    // precedence for both :root and body (body gets the cpd-theme-* class at runtime).
    let styleEl = document.getElementById(FONT_STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = FONT_STYLE_ID;
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = [
        `:root, body, [class*="cpd-theme-"] { --cpd-font-family-sans: ${stack} !important; }`,
        `body, * { font-family: var(--cpd-font-family-sans) !important; }`,
        // Keep monospace elements using their own font
        `code, pre, kbd, samp { font-family: "Fira Code", "Courier New", monospace !important; }`,
    ].join("\n");
}
