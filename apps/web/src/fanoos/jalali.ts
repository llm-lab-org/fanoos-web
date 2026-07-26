/*
Copyright 2026 LLM-LAB (Fanoos fork)
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
*/

/*
 * Jalali (Persian / solar Hijri) calendar formatting via built-in Intl.
 * Modern browsers ship ICU data for the "persian" calendar under fa-IR — no
 * external library needed. Falls back to plain toLocaleString for other langs.
 */

import { toLocaleDigits } from "./digits";

/** True when the current UI language should use the Persian calendar. */
export function usesJalali(locale?: string): boolean {
    const lang = (locale ?? document.documentElement.lang ?? "").toLowerCase();
    return lang.startsWith("fa");
}

/**
 * Format a timestamp as HH:MM (short time). Jalali for Persian, Gregorian
 * otherwise. Digits are converted to the locale's native set.
 */
export function formatTime(ts: number | Date, locale?: string): string {
    const date = ts instanceof Date ? ts : new Date(ts);
    const lang = locale ?? document.documentElement.lang ?? undefined;
    const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
    if (usesJalali(lang)) {
        return toLocaleDigits(new Intl.DateTimeFormat("fa-IR-u-ca-persian", opts).format(date), "fa");
    }
    return date.toLocaleTimeString(lang, opts);
}

/**
 * Format a timestamp as a short date + time (e.g. "1403/05/04 13:22" in
 * Persian, "2025-07-26 13:22" otherwise).
 */
export function formatDateTime(ts: number | Date, locale?: string): string {
    const date = ts instanceof Date ? ts : new Date(ts);
    const lang = locale ?? document.documentElement.lang ?? undefined;
    const opts: Intl.DateTimeFormatOptions = {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    };
    if (usesJalali(lang)) {
        return toLocaleDigits(new Intl.DateTimeFormat("fa-IR-u-ca-persian", opts).format(date), "fa");
    }
    return date.toLocaleString(lang, opts);
}
