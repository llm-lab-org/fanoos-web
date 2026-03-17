/*
Copyright 2024 New Vector Ltd.
Copyright 2019-2021 The Matrix.org Foundation C.I.C.
Copyright 2019 New Vector Ltd

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type ChangeEvent, type ReactElement, type ReactNode } from "react";
import { type EmptyObject } from "matrix-js-sdk/src/matrix";
import { Form } from "@vector-im/compound-web";

import { _t } from "../../../../../languageHandler";
import SettingsStore from "../../../../../settings/SettingsStore";
import SettingsFlag from "../../../elements/SettingsFlag";
import Field from "../../../elements/Field";
import AccessibleButton from "../../../elements/AccessibleButton";
import { SettingLevel } from "../../../../../settings/SettingLevel";
import { UIFeature } from "../../../../../settings/UIFeature";
import { LayoutSwitcher } from "../../LayoutSwitcher";
import FontScalingPanel from "../../FontScalingPanel";
import { ThemeChoicePanel } from "../../ThemeChoicePanel";
import ImageSizePanel from "../../ImageSizePanel";
import SettingsTab from "../SettingsTab";
import { SettingsSection } from "../../shared/SettingsSection";
import { SettingsSubsection } from "../../shared/SettingsSubsection";
import Dropdown from "../../../elements/Dropdown";
import { FONT_OPTIONS } from "../../../../../fanoos/fonts";
import { BG_PATTERNS, COLOR_PALETTES } from "../../../../../fanoos/appearance";
import { FanoosAudioPlayerPreview } from "../../../audio_messages/FanoosAudioPlayer";
import { getSampleAudioUrl } from "../../../../../fanoos/sampleAudio";

interface IState {
    useBundledEmojiFont: boolean;
    useSystemFont: boolean;
    systemFont: string;
    showAdvanced: boolean;
    interfaceDirection: string;
    appFont: string;
    // Fanoos appearance
    chatBgPattern: string;
    chatBgUrl: string;
    chatBgOpacity: number;
    chatBgColor: string;
    leftPanelColor: string;
    headerColor: string;
    composerColor: string;
    sentMsgColor: string;
    receivedMsgColor: string;
    accentColor: string;
    palette: string;
    audioPlayerStyle: string;
}

export default class AppearanceUserSettingsTab extends React.Component<EmptyObject, IState> {
    public constructor(props: EmptyObject) {
        super(props);

        this.state = {
            useBundledEmojiFont: SettingsStore.getValue("useBundledEmojiFont"),
            useSystemFont: SettingsStore.getValue("useSystemFont"),
            systemFont: SettingsStore.getValue("systemFont"),
            showAdvanced: false,
            interfaceDirection: SettingsStore.getValue("interfaceDirection"),
            appFont: SettingsStore.getValue("appFont"),
            chatBgPattern: SettingsStore.getValue("fanoos.chatBgPattern") ?? "none",
            chatBgUrl: SettingsStore.getValue("fanoos.chatBgUrl") ?? "",
            chatBgOpacity: SettingsStore.getValue("fanoos.chatBgOpacity") ?? 0.15,
            chatBgColor: SettingsStore.getValue("fanoos.chatBgColor") ?? "",
            leftPanelColor: SettingsStore.getValue("fanoos.leftPanelColor") ?? "",
            headerColor: SettingsStore.getValue("fanoos.headerColor") ?? "",
            composerColor: SettingsStore.getValue("fanoos.composerColor") ?? "",
            sentMsgColor: SettingsStore.getValue("fanoos.sentMsgColor") ?? "",
            receivedMsgColor: SettingsStore.getValue("fanoos.receivedMsgColor") ?? "",
            accentColor: SettingsStore.getValue("fanoos.accentColor") ?? "",
            palette: SettingsStore.getValue("fanoos.palette") ?? "default",
            audioPlayerStyle: SettingsStore.getValue("fanoos.audioPlayerStyle") ?? "default",
        };
    }

    // ──────────── Advanced section ────────────────────────────────────────────

    private renderAdvancedSection(): ReactNode {
        if (!SettingsStore.getValue(UIFeature.AdvancedSettings)) return null;

        const toggle = (
            <AccessibleButton
                kind="link"
                onClick={() => this.setState({ showAdvanced: !this.state.showAdvanced })}
                aria-expanded={this.state.showAdvanced}
            >
                {this.state.showAdvanced ? _t("action|hide_advanced") : _t("action|show_advanced")}
            </AccessibleButton>
        );

        let advanced: React.ReactNode;

        if (this.state.showAdvanced) {
            advanced = (
                <Form.Root
                    onSubmit={(evt) => {
                        evt.preventDefault();
                        evt.stopPropagation();
                    }}
                >
                    <SettingsFlag name="useCompactLayout" level={SettingLevel.DEVICE} />
                    <SettingsFlag
                        name="useBundledEmojiFont"
                        level={SettingLevel.DEVICE}
                        onChange={(checked) => this.setState({ useBundledEmojiFont: checked })}
                    />
                    <SettingsFlag
                        name="useSystemFont"
                        level={SettingLevel.DEVICE}
                        onChange={(checked) => this.setState({ useSystemFont: checked })}
                    />
                    <Field
                        className="mx_AppearanceUserSettingsTab_checkboxControlledField"
                        label={SettingsStore.getDisplayName("systemFont")!}
                        onChange={(value: ChangeEvent<HTMLInputElement>) => {
                            this.setState({ systemFont: value.target.value });
                            SettingsStore.setValue("systemFont", null, SettingLevel.DEVICE, value.target.value);
                        }}
                        disabled={!this.state.useSystemFont}
                        value={this.state.systemFont}
                    />
                </Form.Root>
            );
        }
        return (
            <SettingsSubsection>
                {toggle}
                {advanced}
            </SettingsSubsection>
        );
    }

    // ──────────── Personalisation: Font + Direction ───────────────────────────

    private renderFontSection(): ReactNode {
        return (
            <SettingsSubsection
                heading={_t("settings|appearance|app_font")}
                description={_t("settings|appearance|app_font_description")}
            >
                <Dropdown
                    id="mx_AppearanceUserSettingsTab_font"
                    value={this.state.appFont}
                    onOptionChange={(v) => {
                        SettingsStore.setValue("appFont", null, SettingLevel.DEVICE, v);
                        this.setState({ appFont: v });
                    }}
                    label={_t("settings|appearance|app_font")}
                >
                    {(<div key="IRANSansX" style={{ fontFamily: FONT_OPTIONS[0].stack }}>{FONT_OPTIONS[0].label}</div>) as ReactElement & { key: string }}
                    {(<div key="Inter" style={{ fontFamily: FONT_OPTIONS[1].stack }}>{FONT_OPTIONS[1].label}</div>) as ReactElement & { key: string }}
                    {(<div key="System" style={{ fontFamily: FONT_OPTIONS[2].stack }}>{FONT_OPTIONS[2].label}</div>) as ReactElement & { key: string }}
                </Dropdown>
            </SettingsSubsection>
        );
    }

    private renderDirectionSection(): ReactNode {
        return (
            <SettingsSubsection
                heading={_t("settings|appearance|interface_direction")}
                description={_t("settings|appearance|interface_direction_description")}
            >
                <Dropdown
                    id="mx_AppearanceUserSettingsTab_direction"
                    value={this.state.interfaceDirection}
                    onOptionChange={(v) => {
                        SettingsStore.setValue("interfaceDirection", null, SettingLevel.DEVICE, v);
                        this.setState({ interfaceDirection: v });
                    }}
                    label={_t("settings|appearance|interface_direction")}
                >
                    {(<div key="auto">{_t("settings|appearance|direction_auto")}</div>) as ReactElement & { key: string }}
                    {(<div key="rtl">{_t("settings|appearance|direction_rtl")} ← راست به چپ</div>) as ReactElement & { key: string }}
                    {(<div key="ltr">{_t("settings|appearance|direction_ltr")} → Left to Right</div>) as ReactElement & { key: string }}
                </Dropdown>
            </SettingsSubsection>
        );
    }

    // ──────────── Color Palettes ──────────────────────────────────────────────

    private renderPaletteSection(): ReactNode {
        const currentLang = document.documentElement.lang ?? "en";
        return (
            <SettingsSubsection
                heading={_t("settings|appearance|fanoos_palettes")}
                description={_t("settings|appearance|fanoos_palettes_description")}
            >
                <div className="mx_FanoosAppearance_paletteGrid">
                    {COLOR_PALETTES.map((p) => {
                        const label = currentLang.startsWith("fa") ? p.labelFa
                            : currentLang.startsWith("ar") ? p.labelAr
                            : p.label;
                        const isActive = this.state.palette === p.key;
                        const previewVars = p.vars;
                        return (
                            <button
                                key={p.key}
                                className={`mx_FanoosAppearance_paletteCard${isActive ? " mx_FanoosAppearance_paletteCard_active" : ""}`}
                                onClick={() => {
                                    SettingsStore.setValue("fanoos.palette", null, SettingLevel.DEVICE, p.key);
                                    this.setState({ palette: p.key });
                                }}
                                title={label}
                            >
                                <div className="mx_FanoosAppearance_palettePreview">
                                    <div
                                        className="mx_FanoosAppearance_previewPanel"
                                        style={{ background: previewVars["--fanoos-left-panel-bg"] ?? "#2a2d3e" }}
                                    />
                                    <div
                                        className="mx_FanoosAppearance_previewChat"
                                        style={{ background: previewVars["--fanoos-chat-bg"] ?? "#ffffff" }}
                                    >
                                        <div
                                            className="mx_FanoosAppearance_previewBubbleSent"
                                            style={{ background: previewVars["--fanoos-sent-msg-bg"] ?? "#c3f0d4" }}
                                        />
                                        <div
                                            className="mx_FanoosAppearance_previewBubbleReceived"
                                            style={{ background: previewVars["--fanoos-received-msg-bg"] ?? "#e8e8e8" }}
                                        />
                                    </div>
                                </div>
                                <span className="mx_FanoosAppearance_paletteLabel">{label}</span>
                            </button>
                        );
                    })}
                </div>
            </SettingsSubsection>
        );
    }

    // ──────────── Message colors ──────────────────────────────────────────────

    private renderMessageColorsSection(): ReactNode {
        return (
            <SettingsSubsection
                heading={_t("settings|appearance|fanoos_message_colors")}
                description={_t("settings|appearance|fanoos_message_colors_description")}
            >
                <div className="mx_FanoosAppearance_row">
                    <label className="mx_FanoosAppearance_label">
                        {_t("settings|appearance|fanoos_sent_msg_color")}
                        <span className="mx_FanoosAppearance_previewSwatch"
                            style={{ background: this.state.sentMsgColor || "var(--cpd-color-green-300)" }} />
                    </label>
                    <input type="color"
                        value={this.state.sentMsgColor || "#c3f0d4"}
                        onChange={(e) => {
                            this.setState({ sentMsgColor: e.target.value });
                            SettingsStore.setValue("fanoos.sentMsgColor", null, SettingLevel.DEVICE, e.target.value);
                        }}
                        className="mx_FanoosAppearance_colorPicker"
                    />
                    {this.state.sentMsgColor && (
                        <AccessibleButton kind="link" onClick={() => {
                            this.setState({ sentMsgColor: "" });
                            SettingsStore.setValue("fanoos.sentMsgColor", null, SettingLevel.DEVICE, null);
                        }}>{_t("action|reset")}</AccessibleButton>
                    )}
                </div>
                <div className="mx_FanoosAppearance_row">
                    <label className="mx_FanoosAppearance_label">
                        {_t("settings|appearance|fanoos_received_msg_color")}
                        <span className="mx_FanoosAppearance_previewSwatch"
                            style={{ background: this.state.receivedMsgColor || "var(--cpd-color-gray-300)" }} />
                    </label>
                    <input type="color"
                        value={this.state.receivedMsgColor || "#e8e8e8"}
                        onChange={(e) => {
                            this.setState({ receivedMsgColor: e.target.value });
                            SettingsStore.setValue("fanoos.receivedMsgColor", null, SettingLevel.DEVICE, e.target.value);
                        }}
                        className="mx_FanoosAppearance_colorPicker"
                    />
                    {this.state.receivedMsgColor && (
                        <AccessibleButton kind="link" onClick={() => {
                            this.setState({ receivedMsgColor: "" });
                            SettingsStore.setValue("fanoos.receivedMsgColor", null, SettingLevel.DEVICE, null);
                        }}>{_t("action|reset")}</AccessibleButton>
                    )}
                </div>
            </SettingsSubsection>
        );
    }

    // ──────────── Background pattern ─────────────────────────────────────────

    private renderPatternSection(): ReactNode {
        const currentLang = document.documentElement.lang ?? "en";
        return (
            <SettingsSubsection
                heading={_t("settings|appearance|fanoos_bg_pattern")}
                description={_t("settings|appearance|fanoos_bg_pattern_description")}
            >
                <div className="mx_FanoosAppearance_patternGrid">
                    {BG_PATTERNS.map((pt) => {
                        const label = currentLang.startsWith("fa") ? pt.labelFa : pt.label;
                        const isActive = this.state.chatBgPattern === pt.key;
                        return (
                            <button
                                key={pt.key}
                                title={label}
                                className={`mx_FanoosAppearance_patternCard${isActive ? " mx_FanoosAppearance_patternCard_active" : ""}`}
                                onClick={() => {
                                    SettingsStore.setValue("fanoos.chatBgPattern", null, SettingLevel.DEVICE, pt.key);
                                    this.setState({ chatBgPattern: pt.key });
                                }}
                                style={pt.key !== "none" ? {
                                    backgroundImage: `url("${pt.svgTile}")`,
                                    backgroundSize: pt.tileSize,
                                    backgroundRepeat: "repeat",
                                } : {}}
                            >
                                <span className="mx_FanoosAppearance_patternLabel">{label}</span>
                            </button>
                        );
                    })}
                </div>
            </SettingsSubsection>
        );
    }

    // ──────────── Chat background ─────────────────────────────────────────────

    private renderChatBackgroundSection(): ReactNode {
        return (
            <SettingsSubsection
                heading={_t("settings|appearance|fanoos_chat_background")}
                description={_t("settings|appearance|fanoos_chat_background_description")}
            >
                <Field
                    label={_t("settings|appearance|fanoos_chat_bg_url")}
                    type="url"
                    value={this.state.chatBgUrl}
                    placeholder="https://example.com/background.jpg"
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        const val = e.target.value;
                        this.setState({ chatBgUrl: val });
                        SettingsStore.setValue("fanoos.chatBgUrl", null, SettingLevel.DEVICE, val || null);
                    }}
                />
                <div className="mx_FanoosAppearance_row">
                    <label className="mx_FanoosAppearance_label">
                        {_t("settings|appearance|fanoos_chat_bg_opacity")}
                        <span className="mx_FanoosAppearance_value">{Math.round(this.state.chatBgOpacity * 100)}%</span>
                    </label>
                    <input type="range" min="0" max="1" step="0.05"
                        value={this.state.chatBgOpacity}
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            this.setState({ chatBgOpacity: val });
                            SettingsStore.setValue("fanoos.chatBgOpacity", null, SettingLevel.DEVICE, val);
                        }}
                        className="mx_FanoosAppearance_slider"
                    />
                </div>
                <div className="mx_FanoosAppearance_row">
                    <label className="mx_FanoosAppearance_label">{_t("settings|appearance|fanoos_chat_bg_color")}</label>
                    <input type="color"
                        value={this.state.chatBgColor || "#ffffff"}
                        onChange={(e) => {
                            this.setState({ chatBgColor: e.target.value });
                            SettingsStore.setValue("fanoos.chatBgColor", null, SettingLevel.DEVICE, e.target.value);
                        }}
                        className="mx_FanoosAppearance_colorPicker"
                    />
                    {this.state.chatBgColor && (
                        <AccessibleButton kind="link" onClick={() => {
                            this.setState({ chatBgColor: "" });
                            SettingsStore.setValue("fanoos.chatBgColor", null, SettingLevel.DEVICE, null);
                        }}>{_t("action|reset")}</AccessibleButton>
                    )}
                </div>
            </SettingsSubsection>
        );
    }

    // ──────────── Panel colors ────────────────────────────────────────────────

    private renderPanelColorsSection(): ReactNode {
        return (
            <SettingsSubsection
                heading={_t("settings|appearance|fanoos_panel_colors")}
                description={_t("settings|appearance|fanoos_panel_colors_description")}
            >
                {(
                    [
                        ["leftPanelColor", "fanoos.leftPanelColor", "fanoos_left_panel_color"],
                        ["headerColor", "fanoos.headerColor", "fanoos_header_color"],
                        ["composerColor", "fanoos.composerColor", "fanoos_composer_color"],
                        ["accentColor", "fanoos.accentColor", "fanoos_accent_color"],
                    ] as Array<[keyof IState, string, string]>
                ).map(([stateKey, settingKey, i18nKey]) => {
                    const current = (this.state[stateKey] as string) || "";
                    const sk = settingKey as Parameters<typeof SettingsStore.setValue>[0];
                    return (
                        <div key={settingKey} className="mx_FanoosAppearance_row">
                            <label className="mx_FanoosAppearance_label">
                                {_t(`settings|appearance|${i18nKey}` as any)}
                                {current && (
                                    <span className="mx_FanoosAppearance_previewSwatch"
                                        style={{ background: current }} />
                                )}
                            </label>
                            <input type="color"
                                value={current || "#4a9ede"}
                                onChange={(e) => {
                                    this.setState({ [stateKey]: e.target.value } as any);
                                    SettingsStore.setValue(sk, null, SettingLevel.DEVICE, e.target.value);
                                }}
                                className="mx_FanoosAppearance_colorPicker"
                            />
                            {current && (
                                <AccessibleButton kind="link" onClick={() => {
                                    this.setState({ [stateKey]: "" } as any);
                                    SettingsStore.setValue(sk, null, SettingLevel.DEVICE, null);
                                }}>{_t("action|reset")}</AccessibleButton>
                            )}
                        </div>
                    );
                })}
                <AccessibleButton kind="secondary"
                    onClick={() => {
                        (["fanoos.leftPanelColor", "fanoos.headerColor", "fanoos.composerColor", "fanoos.accentColor"] as Parameters<typeof SettingsStore.setValue>[0][]).forEach((k) =>
                            SettingsStore.setValue(k, null, SettingLevel.DEVICE, null),
                        );
                        this.setState({ leftPanelColor: "", headerColor: "", composerColor: "", accentColor: "" });
                    }}
                    className="mx_FanoosAppearance_resetAll"
                >
                    {_t("settings|appearance|fanoos_reset_all_colors")}
                </AccessibleButton>
            </SettingsSubsection>
        );
    }

    // ──────────── Audio player picker ────────────────────────────────────────

    private renderAudioPlayerSection(): ReactNode {
        const sampleSrc = getSampleAudioUrl();
        const current = this.state.audioPlayerStyle;

        const PLAYERS: Array<{ key: string; label: string; labelFa: string; preview: ReactNode }> = [
            {
                key: "default",
                label: "Default (Element)",
                labelFa: "پیش‌فرض",
                preview: (
                    <div className="mx_FanoosPlayerPicker_defaultPreview">
                        <span>▶ ▂▃▅▆▅▃▂</span>
                        <span style={{ fontSize: "0.75em", color: "#888" }}>Element Waveform</span>
                    </div>
                ),
            },
            {
                key: "minimal",
                label: "Minimal",
                labelFa: "مینیمال",
                preview: <FanoosAudioPlayerPreview src={sampleSrc} style="minimal" />,
            },
            {
                key: "telegram",
                label: "Telegram",
                labelFa: "تلگرام",
                preview: <FanoosAudioPlayerPreview src={sampleSrc} style="telegram" />,
            },
            {
                key: "modern",
                label: "Modern",
                labelFa: "مدرن",
                preview: <FanoosAudioPlayerPreview src={sampleSrc} style="modern" />,
            },
        ];

        const lang = document.documentElement.lang ?? "en";

        return (
            <SettingsSubsection
                heading="انتخاب پخش‌کننده / Choose Player"
                description="یک پخش‌کننده انتخاب کنید. پخش‌کننده‌های زیر از تنظیم سرعت پشتیبانی می‌کنند. / Choose a player. Native players support reliable speed control."
            >
                <div className="mx_FanoosPlayerPicker_grid">
                    {PLAYERS.map((p) => (
                        <button
                            key={p.key}
                            type="button"
                            className={`mx_FanoosPlayerPicker_card${current === p.key ? " mx_FanoosPlayerPicker_card_active" : ""}`}
                            onClick={() => {
                                SettingsStore.setValue("fanoos.audioPlayerStyle", null, SettingLevel.DEVICE, p.key);
                                this.setState({ audioPlayerStyle: p.key });
                            }}
                        >
                            <div className="mx_FanoosPlayerPicker_preview">{p.preview}</div>
                            <span className="mx_FanoosPlayerPicker_label">
                                {lang.startsWith("fa") ? p.labelFa : p.label}
                            </span>
                        </button>
                    ))}
                </div>
            </SettingsSubsection>
        );
    }

    // ──────────── Render ──────────────────────────────────────────────────────

    public render(): React.ReactNode {
        return (
            <SettingsTab data-testid="mx_AppearanceUserSettingsTab">
                <SettingsSection heading={_t("settings|appearance|theme_section")}>
                    <ThemeChoicePanel />
                </SettingsSection>

                <SettingsSection heading={_t("settings|appearance|personalisation_section")}>
                    {this.renderFontSection()}
                    <FontScalingPanel />
                    {this.renderDirectionSection()}
                </SettingsSection>

                <SettingsSection heading={_t("settings|appearance|fanoos_palettes")}>
                    {this.renderPaletteSection()}
                </SettingsSection>

                <SettingsSection heading={_t("settings|appearance|chat_customisation_section")}>
                    {this.renderMessageColorsSection()}
                    {this.renderPatternSection()}
                    {this.renderChatBackgroundSection()}
                    {this.renderPanelColorsSection()}
                </SettingsSection>

                <SettingsSection heading={_t("settings|appearance|layout_section")}>
                    <LayoutSwitcher />
                    {this.renderAdvancedSection()}
                    <ImageSizePanel />
                </SettingsSection>

                <SettingsSection heading="پخش‌کننده صدا / Audio Player">
                    {this.renderAudioPlayerSection()}
                </SettingsSection>
            </SettingsTab>
        );
    }
}
