/**
 * Routes to the correct Fanoos audio player based on the user's setting.
 */
import React from "react";
import { type MediaEventHelper } from "../../../utils/MediaEventHelper";
import { useAudioBlobUrl } from "./hooks/useAudioBlobUrl";
import { MinimalPlayer } from "./players/MinimalPlayer";
import { TelegramPlayer } from "./players/TelegramPlayer";
import { ModernPlayer } from "./players/ModernPlayer";
import SettingsStore from "../../../settings/SettingsStore";

export type AudioPlayerStyle = "minimal" | "telegram" | "modern";

interface Props {
    mediaEventHelper?: MediaEventHelper;
}

function PlayerFromSrc({ src, style }: { src: string; style: AudioPlayerStyle }): React.ReactElement {
    switch (style) {
        case "telegram": return <TelegramPlayer src={src} />;
        case "modern":   return <ModernPlayer   src={src} />;
        default:         return <MinimalPlayer  src={src} />;
    }
}

export function FanoosAudioPlayer({ mediaEventHelper }: Props): React.ReactElement {
    const { src, error } = useAudioBlobUrl(mediaEventHelper);
    const style = (SettingsStore.getValue("fanoos.audioPlayerStyle") as AudioPlayerStyle) ?? "minimal";

    if (error) return <div className="mx_FanoosPlayer mx_FanoosPlayer_error">⚠ خطا در پخش صدا</div>;
    if (!src)  return <div className="mx_FanoosPlayer mx_FanoosPlayer_loading">…</div>;

    return <PlayerFromSrc src={src} style={style} />;
}

/** For use in settings preview — pass a blob URL directly */
export function FanoosAudioPlayerPreview({ src, style }: { src: string; style: AudioPlayerStyle }): React.ReactElement {
    return <PlayerFromSrc src={src} style={style} />;
}
