/*
 * Copyright 2026 Fanoos Project
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * A native HTML5 <audio> player that supports reliable playback speed control.
 * Uses URL.createObjectURL so the browser handles decoding — playbackRate
 * works correctly even after seeking, unlike AudioBufferSourceNode.
 */

import React, { useEffect, useRef, useState } from "react";
import { type IBodyProps } from "../messages/IBodyProps";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(seconds: number): string {
    if (!isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export function FanoosNativeAudioPlayer({ mediaEventHelper }: Pick<IBodyProps, "mediaEventHelper">): React.ReactElement {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [src, setSrc] = useState<string>("");
    const [speed, setSpeed] = useState(1);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState(false);

    useEffect(() => {
        let objUrl: string | null = null;
        mediaEventHelper?.sourceBlob.value
            .then((blob) => {
                objUrl = URL.createObjectURL(blob);
                setSrc(objUrl);
            })
            .catch(() => setError(true));
        return () => {
            if (objUrl) URL.revokeObjectURL(objUrl);
        };
    }, [mediaEventHelper]);

    const togglePlay = (): void => {
        const el = audioRef.current;
        if (!el) return;
        if (el.paused) {
            el.play().catch(() => setError(true));
        } else {
            el.pause();
        }
    };

    const cycleSpeed = (): void => {
        const idx = SPEEDS.indexOf(speed);
        const next = SPEEDS[(idx + 1) % SPEEDS.length];
        setSpeed(next);
        if (audioRef.current) audioRef.current.playbackRate = next;
    };

    const onSeek = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const t = Number(e.target.value);
        setCurrentTime(t);
        if (audioRef.current) audioRef.current.currentTime = t;
    };

    if (error) {
        return <div className="mx_FanoosNativeAudioPlayer mx_FanoosNativeAudioPlayer_error">⚠ خطا در پخش صدا</div>;
    }

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="mx_FanoosNativeAudioPlayer">
            {/* hidden native element */}
            <audio
                ref={audioRef}
                src={src}
                preload="metadata"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => { setPlaying(false); setCurrentTime(0); }}
                onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
                onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
                onLoadedMetadata={() => {
                    const el = audioRef.current;
                    if (el) {
                        setDuration(el.duration);
                        el.playbackRate = speed;
                    }
                }}
            />

            {/* play / pause */}
            <button
                className="mx_FanoosNativeAudioPlayer_playPause"
                onClick={togglePlay}
                disabled={!src}
                aria-label={playing ? "Pause" : "Play"}
                type="button"
            >
                {playing ? "⏸" : "▶"}
            </button>

            {/* seek bar */}
            <div className="mx_FanoosNativeAudioPlayer_seekWrapper">
                <input
                    type="range"
                    className="mx_FanoosNativeAudioPlayer_seek"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={currentTime}
                    onChange={onSeek}
                    disabled={!src || duration === 0}
                />
                <div
                    className="mx_FanoosNativeAudioPlayer_progress"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* clock */}
            <span className="mx_FanoosNativeAudioPlayer_clock">
                {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* speed */}
            <button
                className="mx_FanoosNativeAudioPlayer_speed"
                onClick={cycleSpeed}
                title="Change playback speed"
                type="button"
            >
                {speed}x
            </button>
        </div>
    );
}
