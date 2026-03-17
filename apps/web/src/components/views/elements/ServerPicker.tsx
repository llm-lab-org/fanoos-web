/*
Copyright 2024 New Vector Ltd.
Copyright 2020, 2021 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";

import AccessibleButton from "./AccessibleButton";
import { type ValidatedServerConfig } from "../../../utils/ValidatedServerConfig";
import { _t } from "../../../languageHandler";
import TextWithTooltip from "./TextWithTooltip";
import SdkConfig from "../../../SdkConfig";
import Modal from "../../../Modal";
import ServerPickerDialog from "../dialogs/ServerPickerDialog";

interface IProps {
    title?: string;
    dialogTitle?: string;
    serverConfig: ValidatedServerConfig;
    disabled?: boolean;
    onServerConfigChange?(this: void, config: ValidatedServerConfig): void;
}

const showPickerDialog = (
    title: string | undefined,
    serverConfig: ValidatedServerConfig,
    onFinished: (config?: ValidatedServerConfig) => void,
): void => {
    const { finished } = Modal.createDialog(ServerPickerDialog, { title, serverConfig });
    finished.then(([config]) => onFinished(config));
};

const ServerPicker: React.FC<IProps> = ({ title, dialogTitle, serverConfig, onServerConfigChange, disabled }) => {
    const disableCustomUrls = SdkConfig.get("disable_custom_urls");

    const onClick = (): void => {
        if (!disableCustomUrls && onServerConfigChange) {
            showPickerDialog(dialogTitle, serverConfig, (config?: ValidatedServerConfig) => {
                if (config) onServerConfigChange(config);
            });
        }
    };

    let serverName: React.ReactNode = serverConfig.isNameResolvable ? serverConfig.hsName : serverConfig.hsUrl;
    if (serverConfig.hsNameIsDifferent) {
        serverName = (
            <TextWithTooltip className="mx_Login_underlinedServerName" tooltip={serverConfig.hsUrl}>
                {serverConfig.hsName}
            </TextWithTooltip>
        );
    }

    return (
        <div className="mx_ServerPicker mx_ServerPicker_field" onClick={!disabled ? onClick : undefined}>
            <div className="mx_ServerPicker_fieldIcon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
            </div>
            <div className="mx_ServerPicker_fieldContent">
                <span className="mx_ServerPicker_fieldLabel">{title || _t("common|homeserver")}</span>
                <span className="mx_ServerPicker_server">{serverName}</span>
            </div>
            {!disableCustomUrls && onServerConfigChange && (
                <div className="mx_ServerPicker_fieldEdit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </div>
            )}
        </div>
    );
};

export default ServerPicker;
