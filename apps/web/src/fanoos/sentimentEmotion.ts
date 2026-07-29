/*
Copyright 2026 LLM-LAB (Fanoos fork)
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
*/

/*
 * Client for the hadith.ai sentiment + Plutchik-8 emotion API.
 * See POST /api/v1/embed/sentiment_emotion.
 */

import { _td } from "../languageHandler";

// FanoosDashboard renders emotion labels via `_t(`fanoos_dashboard|emotion_${k}`)`
// where k is an EmotionLabel. The i18n extractor can't statically resolve the
// template literal, so these _td markers let it see every valid key.
_td("fanoos_dashboard|emotion_anger");
_td("fanoos_dashboard|emotion_anticipation");
_td("fanoos_dashboard|emotion_disgust");
_td("fanoos_dashboard|emotion_fear");
_td("fanoos_dashboard|emotion_joy");
_td("fanoos_dashboard|emotion_sadness");
_td("fanoos_dashboard|emotion_surprise");
_td("fanoos_dashboard|emotion_trust");

/**
 * Ordered list of endpoints to try. Same-origin path comes first so the browser can
 * reach the API through a reverse proxy (webpack-dev-server in dev, nginx in prod)
 * and avoid CORS. If the same-origin path returns 404, we fall back to hitting
 * api.hadith.ai directly — which will work once its CORS allowlist includes the
 * deploy origin.
 */
const API_URLS = [
    "/hadith-api/v1/embed/sentiment_emotion",
    "https://api.hadith.ai/api/v1/embed/sentiment_emotion",
] as const;
/**
 * The API scales ~linearly (~0.1s / text). Bigger batches also let a single pathological
 * message stall the whole call for a very long time, hitting nginx's 300s gateway timeout.
 * Keep batches small so one bad batch never blocks the rest.
 */
const MAX_BATCH = 48;
const REQUEST_TIMEOUT_MS = 45_000;
/** Trim absurdly long individual messages — most of a paste has no additional sentiment signal. */
const MAX_TEXT_CHARS = 600;
const CACHE_MAX = 4000;

/** Cached index of the first URL that has succeeded in this session. */
let workingUrlIdx = 0;

export const SENTIMENT_LABELS = ["positive", "neutral", "negative"] as const;
export const EMOTION_LABELS = [
    "joy",
    "trust",
    "fear",
    "surprise",
    "sadness",
    "disgust",
    "anger",
    "anticipation",
] as const;

export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];
export type EmotionLabel = (typeof EMOTION_LABELS)[number];

export type SentimentDist = Record<SentimentLabel, number>;
export type EmotionDist = Record<EmotionLabel, number>;

export interface PerTextResult {
    sentiment: SentimentDist;
    emotion: EmotionDist;
    topSentiment: SentimentLabel;
    topEmotion: EmotionLabel;
}

export interface AggregatedResult {
    sentiment: SentimentDist;
    emotion: EmotionDist;
    topSentiment: SentimentLabel;
    topEmotion: EmotionLabel;
    /** 0..1 sentiment score compatible with the existing `sentimentColor` gradient. */
    score: number;
    count: number;
}

export const EMOTION_EMOJI: Record<EmotionLabel, string> = {
    joy: "😊",
    trust: "🤝",
    fear: "😨",
    surprise: "😲",
    sadness: "😢",
    disgust: "🤢",
    anger: "😠",
    anticipation: "⏳",
};

interface ApiRow {
    text: string;
    sentiment: SentimentDist;
    emotion: EmotionDist;
    top: { sentiment: SentimentLabel; emotion: EmotionLabel };
}

interface ApiResponse {
    n_texts: number;
    sentiment_labels: SentimentLabel[];
    emotion_labels: EmotionLabel[];
    results: ApiRow[];
}

/** Simple LRU-ish cache keyed by exact text. */
const cache = new Map<string, PerTextResult>();

function cachePut(text: string, r: PerTextResult): void {
    if (cache.size >= CACHE_MAX) {
        // Drop the oldest ~10% of entries (Map preserves insertion order).
        const drop = Math.floor(CACHE_MAX * 0.1);
        let n = 0;
        for (const k of cache.keys()) {
            cache.delete(k);
            if (++n >= drop) break;
        }
    }
    cache.set(text, r);
}

async function callApi(texts: string[]): Promise<ApiRow[]> {
    const body = JSON.stringify({ texts, with_top: true, temperature: 8.0 });
    let lastErr: unknown = null;
    for (let i = 0; i < API_URLS.length; i++) {
        const idx = (workingUrlIdx + i) % API_URLS.length;
        const url = API_URLS[idx];
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(new Error("timeout")), REQUEST_TIMEOUT_MS);
        try {
            const resp = await fetch(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body,
                signal: ctl.signal,
            });
            if (!resp.ok) {
                lastErr = new Error(`sentiment_emotion API ${url} returned ${resp.status}`);
                continue;
            }
            const json = (await resp.json()) as ApiResponse;
            workingUrlIdx = idx;
            return json.results;
        } catch (err) {
            lastErr = err;
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastErr ?? new Error("sentiment_emotion API unreachable");
}

function normalize(t: string): string {
    return t.length > MAX_TEXT_CHARS ? t.slice(0, MAX_TEXT_CHARS) : t;
}

/**
 * Classify a batch of texts. Uses a per-text cache; only uncached texts are sent to the API.
 * Errors are logged and treated as "no result" (missing entries in the returned map).
 *
 * The optional `onProgress` callback fires once per successful API batch, receiving the
 * cumulative map so far. Use it to update the UI progressively instead of waiting for all
 * batches to finish (a slow batch can otherwise stall the whole enrichment for a minute+).
 */
export async function classifyTexts(
    texts: string[],
    onProgress?: (partial: Map<string, PerTextResult>) => void,
): Promise<Map<string, PerTextResult>> {
    const out = new Map<string, PerTextResult>();
    const needed: string[] = [];
    const seen = new Set<string>();
    for (const raw of texts) {
        if (!raw) continue;
        const t = normalize(raw);
        const cached = cache.get(t);
        if (cached) {
            out.set(t, cached);
        } else if (!seen.has(t)) {
            seen.add(t);
            needed.push(t);
        }
    }
    // Fire progress once with whatever's cached so the UI reflects known-good data
    // even if the whole API is down.
    if (onProgress && out.size > 0) onProgress(new Map(out));

    for (let i = 0; i < needed.length; i += MAX_BATCH) {
        const batch = needed.slice(i, i + MAX_BATCH);
        try {
            const rows = await callApi(batch);
            for (const row of rows) {
                const r: PerTextResult = {
                    sentiment: row.sentiment,
                    emotion: row.emotion,
                    topSentiment: row.top.sentiment,
                    topEmotion: row.top.emotion,
                };
                cachePut(row.text, r);
                out.set(row.text, r);
            }
            if (onProgress) onProgress(new Map(out));
        } catch (err) {
            console.warn("[fanoos] sentiment_emotion API batch failed:", err);
        }
    }
    return out;
}

function zeroSentiment(): SentimentDist {
    return { positive: 0, neutral: 0, negative: 0 };
}
function zeroEmotion(): EmotionDist {
    return {
        joy: 0,
        trust: 0,
        fear: 0,
        surprise: 0,
        sadness: 0,
        disgust: 0,
        anger: 0,
        anticipation: 0,
    };
}

/** Sum→argmax on any label→number map. Returns the first label if all zeros. */
function argmax<K extends string>(dist: Record<K, number>, fallback: K): K {
    let bestK = fallback;
    let bestV = -Infinity;
    for (const k of Object.keys(dist) as K[]) {
        if (dist[k] > bestV) {
            bestV = dist[k];
            bestK = k;
        }
    }
    return bestK;
}

/**
 * Aggregate per-text results into a single room-level summary by averaging the distributions.
 * Returns null if `results` is empty.
 */
export function aggregate(results: PerTextResult[]): AggregatedResult | null {
    if (!results.length) return null;
    const s = zeroSentiment();
    const e = zeroEmotion();
    for (const r of results) {
        for (const k of SENTIMENT_LABELS) s[k] += r.sentiment[k] ?? 0;
        for (const k of EMOTION_LABELS) e[k] += r.emotion[k] ?? 0;
    }
    const n = results.length;
    for (const k of SENTIMENT_LABELS) s[k] /= n;
    for (const k of EMOTION_LABELS) e[k] /= n;
    // Map (positive - negative) ∈ [-1, 1] → score ∈ [0, 1]; matches existing colour ramp.
    const score = Math.max(0, Math.min(1, 0.5 + (s.positive - s.negative) / 2));
    return {
        sentiment: s,
        emotion: e,
        topSentiment: argmax(s, "neutral"),
        topEmotion: argmax(e, "joy"),
        score,
        count: n,
    };
}
