/*
Copyright 2026 LLM-LAB (Fanoos fork)
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
*/

/**
 * Telegram-style player — circular play button, animated waveform bars, time + speed badge.
 */
import React, { useMemo } from "react";

import { useNativeAudio, formatTime } from "../hooks/useNativeAudio";

interface Props {
    src: string;
}

// Generate deterministic bar heights from a seed string
function makeWaveBars(seed: string, count = 28): number[] {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    return Array.from({ length: count }, (_, i) => {
        const v = Math.abs(Math.sin((hash + i * 7919) * 0.1)) * 0.7 + 0.15;
        return Math.round(v * 20) + 4; // 4–24px
    });
}

export function TelegramPlayer({ src }: Props): React.ReactElement {
    const { audioProps, playing, currentTime, duration, speed, error, ready, togglePlay, seekTo, cycleSpeed } =
        useNativeAudio(src);

    const bars = useMemo(() => makeWaveBars(src, 28), [src]);
    const progress = duration > 0 ? currentTime / duration : 0;
    const filledBars = Math.floor(progress * bars.length);

    if (error) return <div className="mx_FanoosPlayer mx_FanoosPlayer_error">⚠ خطا در پخش</div>;

    return (
        <div className="mx_FanoosPlayer mx_FanoosPlayer_telegram">
            <audio {...audioProps} />

            {/* circular play/pause */}
            <button
                className="mx_FanoosPlayer_tgCircle"
                onClick={togglePlay}
                disabled={!ready}
                type="button"
                aria-label={playing ? "Pause" : "Play"}
            >
                <span className="mx_FanoosPlayer_tgIcon">{playing ? "⏸" : "▶"}</span>
            </button>

            <div className="mx_FanoosPlayer_tgRight">
                {/* waveform bars — clickable seek */}
                <div
                    className="mx_FanoosPlayer_tgWave"
                    onClick={(e) => {
                        if (!ready || duration === 0) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        seekTo(((e.clientX - rect.left) / rect.width) * duration);
                    }}
                >
                    {bars.map((h, i) => (
                        <div
                            key={i}
                            className={`mx_FanoosPlayer_tgBar${i < filledBars ? " mx_FanoosPlayer_tgBar_played" : ""}${playing && Math.abs(i - filledBars) < 3 ? " mx_FanoosPlayer_tgBar_active" : ""}`}
                            style={{ height: h }}
                        />
                    ))}
                </div>
                {/* bottom row: time + speed */}
                <div className="mx_FanoosPlayer_tgMeta">
                    <span className="mx_FanoosPlayer_clock">
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                    <button className="mx_FanoosPlayer_speedBtn" onClick={cycleSpeed} type="button">
                        {speed}x
                    </button>
                </div>
            </div>
        </div>
    );
}
