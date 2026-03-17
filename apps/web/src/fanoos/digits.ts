/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

/**
 * Locale-aware digit conversion.
 *
 * Converts ASCII/Western digits (0-9) to the native digit set for the
 * current locale:
 *   - Persian (fa): ۰ ۱ ۲ ۳ ۴ ۵ ۶ ۷ ۸ ۹
 *   - Arabic  (ar): ٠ ١ ٢ ٣ ٤ ٥ ٦ ٧ ٨ ٩
 *   - All others:   unchanged
 */

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const ARABIC_DIGITS  = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

type DigitSet = typeof PERSIAN_DIGITS;

function replaceDigits(value: string, digits: DigitSet): string {
    return value.replace(/[0-9]/g, (d) => digits[d as unknown as number]);
}

/**
 * Convert all ASCII digits in `value` to the native digits for `locale`.
 *
 * @param value  The string (or number) to convert.
 * @param locale BCP-47 language tag, e.g. "fa", "ar", "en".
 *               Defaults to the page's current `document.documentElement.lang`.
 */
export function toLocaleDigits(value: string | number, locale?: string): string {
    const str = String(value);
    const lang = (locale ?? document.documentElement.lang ?? "").toLowerCase();

    if (lang.startsWith("fa")) return replaceDigits(str, PERSIAN_DIGITS);
    if (lang.startsWith("ar")) return replaceDigits(str, ARABIC_DIGITS);
    return str;
}

/**
 * Convert a plain number to a locale-aware string.
 * Convenience wrapper around `toLocaleDigits`.
 */
export function formatNumber(n: number, locale?: string): string {
    return toLocaleDigits(n, locale);
}

/**
 * Post-process a fully-interpolated translation string, replacing any
 * ASCII digits with locale-native digits.
 *
 * Call this after `_t(...)` when the output will contain dynamic numbers.
 *
 * @example
 *   localizeDigits(_t("room_list|filters|unread", { count: 42 }))
 *   // → "۴۲ خوانده‌نشده"  (in Persian)
 */
export function localizeDigits(str: string, locale?: string): string {
    return toLocaleDigits(str, locale);
}
