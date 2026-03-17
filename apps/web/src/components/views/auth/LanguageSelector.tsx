/*
Copyright 2018-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";

import SdkConfig from "../../../SdkConfig";
import { getCurrentLanguage } from "../../../languageHandler";
import SettingsStore from "../../../settings/SettingsStore";
import PlatformPeg from "../../../PlatformPeg";
import { SettingLevel } from "../../../settings/SettingLevel";
import LanguageDropdown from "../elements/LanguageDropdown";

function onChange(newLang: string): void {
    if (getCurrentLanguage() !== newLang) {
        SettingsStore.setValue("language", null, SettingLevel.DEVICE, newLang);
        PlatformPeg.get()?.reload();
    }
}

interface IProps {
    disabled?: boolean;
}

const GlobeIcon = (): JSX.Element => (
    <svg
        className="mx_LanguageSelector_icon"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
);

export default function LanguageSelector({ disabled }: IProps): JSX.Element {
    if (SdkConfig.get("disable_login_language_selector")) return <div />;
    return (
        <div className="mx_LanguageSelector_wrapper">
            <GlobeIcon />
            <LanguageDropdown
                className="mx_AuthBody_language"
                onOptionChange={onChange}
                value={getCurrentLanguage()}
                disabled={disabled}
            />
        </div>
    );
}
