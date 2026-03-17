/*
Copyright 2024 New Vector Ltd.
Copyright 2021, 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type ReactNode } from "react";

import PlayPauseButton from "./PlayPauseButton";
import PlaybackClock from "./PlaybackClock";
import AudioPlayerBase, { type IProps as IAudioPlayerBaseProps } from "./AudioPlayerBase";
import LegacySeekBar from "./LegacySeekBar";
import PlaybackWaveform from "./PlaybackWaveform";
import { PlaybackState } from "../../../audio/Playback";

export enum PlaybackLayout {
    /**
     * Clock on the left side of a waveform, without seek bar.
     */
    Composer,

    /**
     * Clock on the right side of a waveform, with an added seek bar.
     */
    Timeline,
}

interface IProps extends IAudioPlayerBaseProps {
    layout?: PlaybackLayout; // Defaults to Timeline layout
}

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2, 0.75];

export default class RecordingPlayback extends AudioPlayerBase<IProps> {
    private speedIndex = 0;

    private cycleSpeed = (): void => {
        this.speedIndex = (this.speedIndex + 1) % PLAYBACK_SPEEDS.length;
        this.props.playback.setPlaybackRate(PLAYBACK_SPEEDS[this.speedIndex]);
        this.forceUpdate();
    };

    private renderSpeedButton(): ReactNode {
        const speed = PLAYBACK_SPEEDS[this.speedIndex];
        return (
            <button
                className="mx_VoicePlayback_speedButton"
                onClick={this.cycleSpeed}
                title="Change playback speed"
                type="button"
            >
                {speed}x
            </button>
        );
    }

    private renderComposerLook(): ReactNode {
        return (
            <>
                <PlaybackClock playback={this.props.playback} />
                <PlaybackWaveform playback={this.props.playback} />
            </>
        );
    }

    private renderTimelineLook(): ReactNode {
        return (
            <>
                <div className="mx_RecordingPlayback_timelineLayoutMiddle">
                    <PlaybackWaveform playback={this.props.playback} />
                    <LegacySeekBar
                        playback={this.props.playback}
                        tabIndex={0}
                        disabled={this.state.playbackPhase === PlaybackState.Decoding}
                        ref={this.seekRef}
                    />
                </div>
                <PlaybackClock playback={this.props.playback} />
                {this.renderSpeedButton()}
            </>
        );
    }

    protected renderComponent(): ReactNode {
        let body: ReactNode;
        switch (this.props.layout) {
            case PlaybackLayout.Composer:
                body = this.renderComposerLook();
                break;
            case PlaybackLayout.Timeline:
            default:
                body = this.renderTimelineLook();
                break;
        }

        return (
            <div
                className="mx_MediaBody mx_VoiceMessagePrimaryContainer"
                onKeyDown={this.onKeyDown}
                data-testid="recording-playback"
            >
                <PlayPauseButton
                    playback={this.props.playback}
                    playbackPhase={this.state.playbackPhase}
                    ref={this.playPauseRef}
                />
                {body}
            </div>
        );
    }
}
