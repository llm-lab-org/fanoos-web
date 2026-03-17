/*
 * Shared hook for all Fanoos native audio players.
 * Handles playback state so each player only renders UI.
 */

import { useEffect, useRef, useState } from "react";

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

interface NativeAudioState {
    audioRef: React.RefObject<HTMLAudioElement | null>;
    playing: boolean;
    currentTime: number;
    duration: number;
    speed: number;
    error: boolean;
    ready: boolean;
    togglePlay: () => void;
    seekTo: (t: number) => void;
    cycleSpeed: () => void;
    setSpeed: (s: number) => void;
    audioProps: React.AudioHTMLAttributes<HTMLAudioElement> & { ref: React.RefObject<HTMLAudioElement | null> };
}

export function useNativeAudio(src: string): NativeAudioState {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [speed, setSpeedState] = useState(1);
    const [error, setError] = useState(false);
    const [ready, setReady] = useState(false);

    // Reset when src changes
    useEffect(() => {
        setPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setError(false);
        setReady(false);
    }, [src]);

    const setSpeed = (s: number): void => {
        setSpeedState(s);
        if (audioRef.current) audioRef.current.playbackRate = s;
    };

    const cycleSpeed = (): void => {
        const idx = SPEEDS.indexOf(speed);
        setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
    };

    const togglePlay = (): void => {
        const el = audioRef.current;
        if (!el || !ready) return;
        if (el.paused) el.play().catch(() => setError(true));
        else el.pause();
    };

    const seekTo = (t: number): void => {
        setCurrentTime(t);
        if (audioRef.current) audioRef.current.currentTime = t;
    };

    const audioProps = {
        ref: audioRef,
        src,
        preload: "metadata" as const,
        onPlay: () => setPlaying(true),
        onPause: () => setPlaying(false),
        onEnded: () => { setPlaying(false); setCurrentTime(0); },
        onTimeUpdate: () => setCurrentTime(audioRef.current?.currentTime ?? 0),
        onDurationChange: () => {
            const d = audioRef.current?.duration;
            if (d && isFinite(d)) setDuration(d);
        },
        onLoadedMetadata: () => {
            const el = audioRef.current;
            if (el) {
                if (isFinite(el.duration)) setDuration(el.duration);
                el.playbackRate = speed;
                setReady(true);
            }
        },
        onCanPlay: () => setReady(true),
        onError: () => setError(true),
    };

    return { audioRef, audioProps, playing, currentTime, duration, speed, error, ready, togglePlay, seekTo, cycleSpeed, setSpeed };
}
