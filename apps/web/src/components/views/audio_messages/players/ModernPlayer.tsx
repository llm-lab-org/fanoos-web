/**
 * Modern player — card with large play button, seek bar, elapsed/total time,
 * and a row of speed buttons so all options are visible at once.
 */
import React from "react";
import { useNativeAudio, formatTime, SPEEDS } from "../hooks/useNativeAudio";

interface Props {
    src: string;
}

export function ModernPlayer({ src }: Props): React.ReactElement {
    const { audioProps, playing, currentTime, duration, speed, error, ready, togglePlay, seekTo, setSpeed } =
        useNativeAudio(src);

    if (error) return <div className="mx_FanoosPlayer mx_FanoosPlayer_error">⚠ خطا در پخش</div>;

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="mx_FanoosPlayer mx_FanoosPlayer_modern">
            <audio {...audioProps} />

            {/* top row: play + time */}
            <div className="mx_FanoosPlayer_modernTop">
                <button className="mx_FanoosPlayer_modernPlay" onClick={togglePlay} disabled={!ready} type="button"
                    aria-label={playing ? "Pause" : "Play"}>
                    {playing ? "⏸" : "▶"}
                </button>
                <div className="mx_FanoosPlayer_modernSeekArea">
                    <div className="mx_FanoosPlayer_seekWrapper">
                        <div className="mx_FanoosPlayer_progressTrack">
                            <div className="mx_FanoosPlayer_progressFill" style={{ width: `${progress}%` }} />
                        </div>
                        <input type="range" className="mx_FanoosPlayer_seekInput"
                            min={0} max={duration || 0} step={0.1} value={currentTime}
                            disabled={!ready || duration === 0}
                            onChange={(e) => seekTo(Number(e.target.value))} />
                    </div>
                    <div className="mx_FanoosPlayer_modernTimes">
                        <span className="mx_FanoosPlayer_clock">{formatTime(currentTime)}</span>
                        <span className="mx_FanoosPlayer_clock">{formatTime(duration)}</span>
                    </div>
                </div>
            </div>

            {/* speed row */}
            <div className="mx_FanoosPlayer_modernSpeeds">
                {SPEEDS.map((s) => (
                    <button
                        key={s}
                        className={`mx_FanoosPlayer_modernSpeedBtn${s === speed ? " mx_FanoosPlayer_modernSpeedBtn_active" : ""}`}
                        onClick={() => setSpeed(s)}
                        type="button"
                    >
                        {s}x
                    </button>
                ))}
            </div>
        </div>
    );
}
