/*
Copyright 2024 New Vector Ltd.
Copyright 2021 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";

import MAudioBody from "./MAudioBody";
import MVoiceMessageBody from "./MVoiceMessageBody";
import { type IBodyProps } from "./IBodyProps";
import { isVoiceMessage } from "../../../utils/EventUtils";
import SettingsStore from "../../../settings/SettingsStore";
import { FanoosAudioPlayer } from "../audio_messages/FanoosAudioPlayer";

export default class MVoiceOrAudioBody extends React.PureComponent<IBodyProps> {
    public render(): React.ReactNode {
        const playerStyle = SettingsStore.getValue("fanoos.audioPlayerStyle");
        if (!this.props.forExport && playerStyle !== "default") {
            return <FanoosAudioPlayer mediaEventHelper={this.props.mediaEventHelper} />;
        }

        if (!this.props.forExport && isVoiceMessage(this.props.mxEvent)) {
            return <MVoiceMessageBody {...this.props} />;
        } else {
            return <MAudioBody {...this.props} />;
        }
    }
}
