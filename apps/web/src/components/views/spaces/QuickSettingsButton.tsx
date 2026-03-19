/*
Copyright 2024,2025 New Vector Ltd.
Copyright 2021-2023 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import classNames from "classnames";
import {
    OverflowHorizontalIcon,
    UserProfileSolidIcon,
    FavouriteSolidIcon,
    PinSolidIcon,
    SettingsSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { IconButton, Text, Tooltip } from "@vector-im/compound-web";

import { _t } from "../../../languageHandler";
import ContextMenu, { alwaysAboveRightOf, ChevronFace, useContextMenu } from "../../structures/ContextMenu";
import AccessibleButton from "../elements/AccessibleButton";
import StyledCheckbox from "../elements/StyledCheckbox";
import { MetaSpace } from "../../../stores/spaces";
import { useSettingValue } from "../../../hooks/useSettings";
import { onMetaSpaceChangeFactory } from "../settings/tabs/user/SidebarUserSettingsTab";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { UserTab } from "../dialogs/UserTab";
import QuickThemeSwitcher from "./QuickThemeSwitcher";
import Modal from "../../../Modal";
import DevtoolsDialog from "../dialogs/DevtoolsDialog";
import { SdkContextClass } from "../../../contexts/SDKContext";
import SettingsStore from "../../../settings/SettingsStore";
import { SettingLevel } from "../../../settings/SettingLevel";
import { getInterfaceDirection } from "../../../vector/init";
import * as languageHandler from "../../../languageHandler";
import { FontWatcher } from "../../../settings/watchers/FontWatcher";

// Languages offered as quick toggles in the settings menu
const QUICK_LANGUAGES = [
    { code: "fa", label: "فارسی" },
    { code: "en", label: "English" },
    { code: "ar", label: "العربية" },
];

const QuickSettingsButton: React.FC<{
    isPanelCollapsed: boolean;
}> = ({ isPanelCollapsed = false }) => {
    const [menuDisplayed, handle, openMenu, closeMenu] = useContextMenu<HTMLButtonElement>();

    const { [MetaSpace.Favourites]: favouritesEnabled, [MetaSpace.People]: peopleEnabled } =
        useSettingValue("Spaces.enabledMetaSpaces");

    const currentRoomId = SdkContextClass.instance.roomViewStore.getRoomId();
    const developerModeEnabled = useSettingValue("developerMode");
    // "Favourites" and "People" meta spaces are not available in the new room list
    const newRoomListEnabled = useSettingValue("feature_new_room_list");

    const currentDirection = useSettingValue("interfaceDirection") as string;
    const currentLang = languageHandler.getCurrentLanguage();
    const fontSizeDelta = useSettingValue("fontSizeDelta") as number;
    const browserDefault = FontWatcher.getBrowserDefaultFontSize();
    const currentFontSize = browserDefault + (fontSizeDelta ?? 0);

    const changeFontSize = (delta: number): void => {
        const newDelta = (fontSizeDelta ?? 0) + delta;
        const newSize = browserDefault + newDelta;
        if (newSize < 9 || newSize > 36) return;
        SettingsStore.setValue("fontSizeDelta", null, SettingLevel.DEVICE, newDelta);
    };

    const handleLanguageChange = async (langCode: string): Promise<void> => {
        await SettingsStore.setValue("language", null, SettingLevel.DEVICE, langCode);
        // Apply direction immediately based on new language (if direction is auto)
        const dir = getInterfaceDirection(langCode);
        document.documentElement.setAttribute("lang", langCode);
        document.documentElement.setAttribute("dir", dir);
        // If the user is currently viewing the dashboard, restore it after reload
        if (document.querySelector(".mx_FanoosDashboard")) {
            sessionStorage.setItem("fanoos_return_to_dashboard", "1");
        }
        // Reload to fully apply the new language strings
        window.location.reload();
    };

    let contextMenu: JSX.Element | undefined;
    if (menuDisplayed && handle.current) {
        contextMenu = (
            <ContextMenu
                {...alwaysAboveRightOf(handle.current.getBoundingClientRect(), ChevronFace.None, 16)}
                wrapperClassName={classNames("mx_QuickSettingsButton_ContextMenuWrapper", {
                    mx_QuickSettingsButton_ContextMenuWrapper_new_room_list: newRoomListEnabled,
                })}
                data-testid="quick-settings-menu"
                onFinished={closeMenu}
                managed={false}
                focusLock={true}
            >
                <h2>{_t("quick_settings|title")}</h2>

                <AccessibleButton
                    onClick={() => {
                        closeMenu();
                        defaultDispatcher.dispatch({ action: Action.ViewUserSettings });
                    }}
                    kind="primary_outline"
                >
                    {_t("quick_settings|all_settings")}
                </AccessibleButton>

                {currentRoomId && developerModeEnabled && (
                    <AccessibleButton
                        onClick={() => {
                            closeMenu();
                            Modal.createDialog(
                                DevtoolsDialog,
                                {
                                    roomId: currentRoomId,
                                },
                                "mx_DevtoolsDialog_wrapper",
                            );
                        }}
                        kind="danger_outline"
                    >
                        {_t("devtools|title")}
                    </AccessibleButton>
                )}

                {/* Fanoos: Language quick switcher */}
                <h4 className="mx_QuickSettingsButton_sectionHeading">🌐 {_t("quick_settings|language")}</h4>
                <div className="mx_QuickSettingsButton_langRow">
                    {QUICK_LANGUAGES.map((lang) => (
                        <AccessibleButton
                            key={lang.code}
                            className={classNames("mx_QuickSettingsButton_langButton", {
                                mx_QuickSettingsButton_langButton_active: currentLang.startsWith(lang.code),
                            })}
                            onClick={() => handleLanguageChange(lang.code)}
                        >
                            {lang.label}
                        </AccessibleButton>
                    ))}
                </div>

                {/* Fanoos: Direction quick toggle */}
                <h4 className="mx_QuickSettingsButton_sectionHeading">↔ {_t("quick_settings|direction")}</h4>
                <div className="mx_QuickSettingsButton_langRow">
                    <AccessibleButton
                        className={classNames("mx_QuickSettingsButton_langButton", {
                            mx_QuickSettingsButton_langButton_active: currentDirection === "rtl",
                        })}
                        onClick={() => {
                            SettingsStore.setValue("interfaceDirection", null, SettingLevel.DEVICE, "rtl");
                            document.documentElement.setAttribute("dir", "rtl");
                        }}
                    >
                        ← RTL
                    </AccessibleButton>
                    <AccessibleButton
                        className={classNames("mx_QuickSettingsButton_langButton", {
                            mx_QuickSettingsButton_langButton_active: currentDirection === "auto",
                        })}
                        onClick={() => {
                            SettingsStore.setValue("interfaceDirection", null, SettingLevel.DEVICE, "auto");
                            const dir = getInterfaceDirection(languageHandler.getCurrentLanguage());
                            document.documentElement.setAttribute("dir", dir);
                        }}
                    >
                        Auto
                    </AccessibleButton>
                    <AccessibleButton
                        className={classNames("mx_QuickSettingsButton_langButton", {
                            mx_QuickSettingsButton_langButton_active: currentDirection === "ltr",
                        })}
                        onClick={() => {
                            SettingsStore.setValue("interfaceDirection", null, SettingLevel.DEVICE, "ltr");
                            document.documentElement.setAttribute("dir", "ltr");
                        }}
                    >
                        LTR →
                    </AccessibleButton>
                </div>

                {/* Fanoos: Font size quick control */}
                <h4 className="mx_QuickSettingsButton_sectionHeading">Aa {_t("settings|appearance|font_size")}</h4>
                <div className="mx_QuickSettingsButton_fontSizeWidget">
                    <AccessibleButton
                        className="mx_QuickSettingsButton_fontSizeStep"
                        onClick={() => changeFontSize(-1)}
                        disabled={(fontSizeDelta ?? 0) + browserDefault <= 9}
                        aria-label="Decrease font size"
                    >
                        A
                    </AccessibleButton>
                    <div className="mx_QuickSettingsButton_fontSizeTrack">
                        <div
                            className="mx_QuickSettingsButton_fontSizeBar"
                            style={{ width: `${Math.round(((currentFontSize - 9) / (36 - 9)) * 100)}%` }}
                        />
                        <span className="mx_QuickSettingsButton_fontSizeLabel">{currentFontSize}px</span>
                    </div>
                    <AccessibleButton
                        className="mx_QuickSettingsButton_fontSizeStep mx_QuickSettingsButton_fontSizeStepBig"
                        onClick={() => changeFontSize(1)}
                        disabled={(fontSizeDelta ?? 0) + browserDefault >= 36}
                        aria-label="Increase font size"
                    >
                        A
                    </AccessibleButton>
                </div>

                {!newRoomListEnabled && (
                    <>
                        <h4>
                            <PinSolidIcon className="mx_QuickSettingsButton_icon" />
                            {_t("quick_settings|metaspace_section")}
                        </h4>
                        <StyledCheckbox
                            className="mx_QuickSettingsButton_option"
                            checked={!!favouritesEnabled}
                            onChange={onMetaSpaceChangeFactory(
                                MetaSpace.Favourites,
                                "WebQuickSettingsPinToSidebarCheckbox",
                            )}
                        >
                            <FavouriteSolidIcon className="mx_QuickSettingsButton_icon" />
                            {_t("common|favourites")}
                        </StyledCheckbox>
                        <StyledCheckbox
                            className="mx_QuickSettingsButton_option"
                            checked={!!peopleEnabled}
                            onChange={onMetaSpaceChangeFactory(
                                MetaSpace.People,
                                "WebQuickSettingsPinToSidebarCheckbox",
                            )}
                        >
                            <UserProfileSolidIcon className="mx_QuickSettingsButton_icon" />
                            {_t("common|people")}
                        </StyledCheckbox>
                        <AccessibleButton
                            className="mx_QuickSettingsButton_moreOptionsButton mx_QuickSettingsButton_option"
                            onClick={() => {
                                closeMenu();
                                defaultDispatcher.dispatch({
                                    action: Action.ViewUserSettings,
                                    initialTabId: UserTab.Sidebar,
                                });
                            }}
                        >
                            <OverflowHorizontalIcon className="mx_QuickSettingsButton_icon" />
                            {_t("quick_settings|sidebar_settings")}
                        </AccessibleButton>
                    </>
                )}
                <QuickThemeSwitcher requestClose={closeMenu} />
            </ContextMenu>
        );
    }

    let button = (
        <IconButton
            aria-label={_t("quick_settings|title")}
            className={classNames("mx_QuickSettingsButton", { expanded: !isPanelCollapsed })}
            onClick={openMenu}
            title={isPanelCollapsed ? _t("quick_settings|title") : undefined}
            ref={handle}
            aria-expanded={!isPanelCollapsed}
        >
            <>
                <SettingsSolidIcon />
                {/* This is dirty, but we need to add the label to the indicator icon */}
                {!isPanelCollapsed && (
                    <Text className="mx_QuickSettingsButton_label" as="span" size="md" title={_t("common|settings")}>
                        {_t("common|settings")}
                    </Text>
                )}
            </>
        </IconButton>
    );

    if (isPanelCollapsed) {
        button = (
            <Tooltip label={_t("quick_settings|title")} placement="right">
                {button}
            </Tooltip>
        );
    }

    return (
        <>
            {button}
            {contextMenu}
        </>
    );
};

export default QuickSettingsButton;
