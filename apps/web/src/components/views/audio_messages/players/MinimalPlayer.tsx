/*
Copyright 2026 LLM-LAB (Fanoos fork)
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
*/

/**
 * Minimal player — slim horizontal bar with seek, time, and speed cycle button.
 */
import React from "react";

import { useNativeAudio, formatTime } from "../hooks/useNativeAudio";

interface Props {
    src: string;
}

export function MinimalPlayer({ src }: Props): React.ReactElement {
    const { audioProps, playing, currentTime, duration, speed, error, ready, togglePlay, seekTo, cycleSpeed } =
        useNativeAudio(src);

    if (error) return <div className="mx_FanoosPlayer mx_FanoosPlayer_error">⚠ خطا در پخش</div>;

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="mx_FanoosPlayer mx_FanoosPlayer_minimal">
            <audio {...audioProps} />

            <button
                className="mx_FanoosPlayer_playBtn"
                onClick={togglePlay}
                disabled={!ready}
                type="button"
                aria-label={playing ? "Pause" : "Play"}
            >
                {playing ? "⏸" : "▶"}
            </button>

            <div className="mx_FanoosPlayer_seekWrapper">
                <div className="mx_FanoosPlayer_progressTrack">
                    <div className="mx_FanoosPlayer_progressFill" style={{ width: `${progress}%` }} />
                </div>
                <input
                    type="range"
                    className="mx_FanoosPlayer_seekInput"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={currentTime}
                    disabled={!ready || duration === 0}
                    onChange={(e) => seekTo(Number(e.target.value))}
                />
            </div>

            <span className="mx_FanoosPlayer_clock">
                {formatTime(currentTime)}
                <span className="mx_FanoosPlayer_clockSep"> / </span>
                {formatTime(duration)}
            </span>

            <button className="mx_FanoosPlayer_speedBtn" onClick={cycleSpeed} type="button">
                {speed}x
            </button>
        </div>
    );
}
