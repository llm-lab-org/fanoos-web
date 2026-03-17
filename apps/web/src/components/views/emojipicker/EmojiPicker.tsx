/*
Copyright 2024 New Vector Ltd.
Copyright 2020 The Matrix.org Foundation C.I.C.
Copyright 2019 Tulir Asokan <tulir@maunium.net>

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type Dispatch } from "react";
import { DATA_BY_CATEGORY, getEmojiFromUnicode, type Emoji as IEmoji } from "@matrix-org/emojibase-bindings";
import { clamp } from "@element-hq/web-shared-components";
import classNames from "classnames";

import { _t } from "../../../languageHandler";
import * as recent from "../../../emojipicker/recent";
import AutoHideScrollbar from "../../structures/AutoHideScrollbar";
import Header from "./Header";
import Search from "./Search";
import Preview from "./Preview";
import QuickReactions from "./QuickReactions";
import Category, { type CategoryKey, type ICategory } from "./Category";
import { filterBoolean } from "../../../utils/arrays";
import { CUSTOM_FLOWER_EMOJIS } from "../../../fanoos/customFlowerEmojis";
import {
    type IAction as RovingAction,
    type IState as RovingState,
    RovingTabIndexProvider,
    Type,
} from "../../../accessibility/RovingTabIndex";
import { Key } from "../../../Keyboard";
import { type ButtonEvent } from "../elements/AccessibleButton";

export const CATEGORY_HEADER_HEIGHT = 20;
export const EMOJI_HEIGHT = 35;
export const EMOJIS_PER_ROW = 8;

const ZERO_WIDTH_JOINER = "\u200D";

interface IProps {
    selectedEmojis?: Set<string>;
    onChoose(unicode: string): boolean;
    onFinished(): void;
    isEmojiDisabled?: (unicode: string) => boolean;
}

interface IState {
    filter: string;
    previewEmoji?: IEmoji;
    scrollTop: number;
    // initial estimation of height, dialog is hardcoded to 450px height.
    // should be enough to never have blank rows of emojis as
    // 3 rows of overflow are also rendered. The actual value is updated on scroll.
    viewportHeight: number;
    // Track if user has interacted with arrow keys or search
    showHighlight: boolean;
}

class EmojiPicker extends React.Component<IProps, IState> {
    private readonly recentlyUsed: IEmoji[];
    private readonly memoizedDataByCategory: Record<CategoryKey, IEmoji[]>;
    private readonly originalDataByCategory: Record<CategoryKey, IEmoji[]>;
    private readonly categories: ICategory[];

    private scrollRef = React.createRef<AutoHideScrollbar<"div">>();

    public constructor(props: IProps) {
        super(props);

        this.state = {
            filter: "",
            scrollTop: 0,
            viewportHeight: 280,
            showHighlight: false,
        };

        // Convert recent emoji characters to emoji data, removing unknowns and duplicates
        this.recentlyUsed = Array.from(new Set(filterBoolean(recent.get().map(getEmojiFromUnicode))));

        // Flower & plant emoji collection — ordered from most iconic to decorative
        const flowerUnicodes = [
            "💐", // Bouquet
            "🌸", // Cherry Blossom
            "🌹", // Rose
            "🌺", // Hibiscus
            "🌻", // Sunflower
            "🌼", // Blossom
            "🌷", // Tulip
            "🪷", // Lotus
            "🥀", // Wilted Flower
            "🌿", // Herb
            "🍀", // Four Leaf Clover
            "☘️", // Shamrock
            "🌱", // Seedling
            "🌾", // Sheaf of Rice
            "🍁", // Maple Leaf
            "🍂", // Fallen Leaf
            "🍃", // Leaf Fluttering in Wind
            "🪴", // Potted Plant
            "🌵", // Cactus
            "🎋", // Tanabata Tree
            "🎍", // Pine Decoration
            "🌲", // Evergreen Tree
            "🌳", // Deciduous Tree
            "🌴", // Palm Tree
        ];
        // CUSTOM_FLOWER_EMOJIS already includes all 16 custom flowers (E000–E00F)
        const flowerEmojis = [...CUSTOM_FLOWER_EMOJIS, ...filterBoolean(flowerUnicodes.map(getEmojiFromUnicode))];

        // Happiness & Friendship emoji collection
        const happyFriendsUnicodes = [
            "🥰", // Smiling Face with Hearts
            "😍", // Smiling Face with Heart-Eyes
            "🤩", // Star-Struck
            "😄", // Grinning Face with Smiling Eyes
            "😊", // Smiling Face with Smiling Eyes
            "😂", // Face with Tears of Joy
            "🥹", // Face Holding Back Tears
            "🤗", // Smiling Face with Open Hands
            "🫂", // People Hugging
            "🤝", // Handshake
            "🫶", // Heart Hands
            "👏", // Clapping Hands
            "🙌", // Raising Hands
            "💕", // Two Hearts
            "💖", // Sparkling Heart
            "💞", // Revolving Hearts
            "❤️", // Red Heart
            "🧡", // Orange Heart
            "💛", // Yellow Heart
            "💚", // Green Heart
            "💙", // Blue Heart
            "🥳", // Partying Face
            "🎉", // Party Popper
            "✨", // Sparkles
            "🌟", // Glowing Star
            "🎈", // Balloon
            "🎊", // Confetti Ball
        ];
        const happyFriendsEmojis = filterBoolean(happyFriendsUnicodes.map(getEmojiFromUnicode));

        // Work & Tasks emoji collection
        const workTaskUnicodes = [
            "💼", // Briefcase
            "📋", // Clipboard
            "✅", // Check Mark Button
            "❌", // Cross Mark
            "📝", // Memo
            "✏️", // Pencil
            "📌", // Pushpin
            "📍", // Round Pushpin
            "📎", // Paperclip
            "🗂️", // Card Index Dividers
            "📁", // File Folder
            "🗓️", // Spiral Calendar
            "📅", // Calendar
            "⏰", // Alarm Clock
            "⏱️", // Stopwatch
            "💡", // Light Bulb
            "🎯", // Bullseye
            "📊", // Bar Chart
            "📈", // Chart Increasing
            "📉", // Chart Decreasing
            "⚙️", // Gear
            "🔧", // Wrench
            "💻", // Laptop
            "🖥️", // Desktop Computer
            "📧", // E-Mail
            "📤", // Outbox Tray
            "🔍", // Magnifying Glass
            "🏆", // Trophy
        ];
        const workTaskEmojis = filterBoolean(workTaskUnicodes.map(getEmojiFromUnicode));

        // Stars & Sky emoji collection
        const starsSkyUnicodes = [
            "⭐", // Star
            "🌟", // Glowing Star
            "✨", // Sparkles
            "💫", // Dizzy / Shooting Star
            "🌠", // Shooting Star
            "🌌", // Milky Way
            "🌙", // Crescent Moon
            "🌛", // First Quarter Moon Face
            "🌜", // Last Quarter Moon Face
            "🌝", // Full Moon Face
            "🌚", // New Moon Face
            "🌕", // Full Moon
            "☀️", // Sun
            "🌤️", // Sun Behind Small Cloud
            "⛅", // Sun Behind Cloud
            "☁️", // Cloud
            "⛈️", // Thunder Cloud and Rain
            "🌈", // Rainbow
            "❄️", // Snowflake
            "☄️", // Comet
            "🪐", // Ringed Planet (Saturn)
            "🔭", // Telescope
            "🚀", // Rocket
            "🛸", // Flying Saucer
            "🌅", // Sunrise
            "🌃", // Night with Stars
        ];
        const starsSkyEmojis = filterBoolean(starsSkyUnicodes.map(getEmojiFromUnicode));

        // Empathy emoji collection
        const empathyUnicodes = [
            "🥺", // Pleading Face
            "😢", // Crying Face
            "😔", // Pensive Face
            "🤗", // Smiling Face with Open Hands
            "🫂", // People Hugging
            "🙏", // Folded Hands
            "🤲", // Palms Up Together
            "👂", // Ear (listening)
            "👐", // Open Hands
            "💗", // Growing Heart
            "💓", // Beating Heart
            "💞", // Revolving Hearts
            "💝", // Heart with Ribbon
            "💌", // Love Letter
            "🩹", // Adhesive Bandage
            "🕊️", // Dove (peace)
            "🌈", // Rainbow (hope)
            "☀️", // Sun (warmth)
            "🌿", // Herb (calm/healing)
            "🌊", // Water Wave (calming)
            "🕯️", // Candle (warmth/remembrance)
            "🧠", // Brain (mental health)
            "💬", // Speech Bubble (listening)
            "🌸", // Cherry Blossom (gentleness)
        ];
        const empathyEmojis = filterBoolean(empathyUnicodes.map(getEmojiFromUnicode));

        // Surprise & Dissatisfaction emoji collection
        const surpriseDisUnicodes = [
            "😮", // Face with Open Mouth
            "😲", // Astonished Face
            "🤯", // Exploding Head
            "😱", // Face Screaming in Fear
            "😳", // Flushed Face
            "🫨", // Shaking Face
            "😵", // Face with Crossed-Out Eyes
            "😵‍💫", // Face with Spiral Eyes
            "🤭", // Face with Hand Over Mouth
            "👀", // Eyes (wide-eyed surprise)
            "😒", // Unamused Face
            "🙄", // Face with Rolling Eyes
            "😑", // Expressionless Face
            "😐", // Neutral Face
            "😤", // Face with Steam from Nose
            "😠", // Angry Face
            "😡", // Pouting Face
            "🤬", // Face with Symbols on Mouth
            "👎", // Thumbs Down
            "💔", // Broken Heart
            "😩", // Weary Face
            "😫", // Tired Face
            "😞", // Disappointed Face
            "🤦", // Person Facepalming
            "🤷", // Person Shrugging
        ];
        const surpriseDisEmojis = filterBoolean(surpriseDisUnicodes.map(getEmojiFromUnicode));

        this.originalDataByCategory = {
            flowers: flowerEmojis,
            stars_sky: starsSkyEmojis,
            happy_friends: happyFriendsEmojis,
            work_task: workTaskEmojis,
            empathy: empathyEmojis,
            surprise_dissatisfaction: surpriseDisEmojis,
            recent: this.recentlyUsed,
            ...DATA_BY_CATEGORY,
        };
        this.memoizedDataByCategory = { ...this.originalDataByCategory };

        const hasRecentlyUsed = this.recentlyUsed.length > 0;

        const categoryConfig: Pick<ICategory, "id" | "name" | "emoji">[] = [
            { id: "flowers", name: _t("emoji|category_flowers_plants"), emoji: "🌸" },
            { id: "stars_sky", name: _t("emoji|category_stars_sky"), emoji: "⭐" },
            { id: "happy_friends", name: _t("emoji|category_happy_friends"), emoji: "🥰" },
            { id: "work_task", name: _t("emoji|category_work_task"), emoji: "💼" },
            { id: "empathy", name: _t("emoji|category_empathy"), emoji: "🥺" },
            { id: "surprise_dissatisfaction", name: _t("emoji|category_surprise_dissatisfaction"), emoji: "😲" },
            { id: "recent", name: _t("emoji|category_frequently_used"), emoji: "🕒" },
            { id: "people", name: _t("emoji|category_smileys_people"), emoji: "😀" },
            { id: "nature", name: _t("emoji|category_animals_nature"), emoji: "🐕" },
            { id: "foods", name: _t("emoji|category_food_drink"), emoji: "🍎" },
            { id: "activity", name: _t("emoji|category_activities"), emoji: "⚽️" },
            { id: "places", name: _t("emoji|category_travel_places"), emoji: "🚗" },
            { id: "objects", name: _t("emoji|category_objects"), emoji: "💡" },
            { id: "symbols", name: _t("emoji|category_symbols"), emoji: "⁉️" },
            { id: "flags", name: _t("emoji|category_flags"), emoji: "🏁" },
        ];

        this.categories = categoryConfig.map((config) => {
            let isEnabled = true;
            let isVisible = false;
            let firstVisible = false;
            if (config.id === "flowers") {
                isVisible = true;
                firstVisible = true;
            } else if (config.id === "stars_sky") {
                isVisible = true;
                firstVisible = false;
            } else if (config.id === "happy_friends") {
                isVisible = true;
                firstVisible = false;
            } else if (config.id === "work_task") {
                isVisible = true;
                firstVisible = false;
            } else if (config.id === "empathy") {
                isVisible = true;
                firstVisible = false;
            } else if (config.id === "surprise_dissatisfaction") {
                isVisible = true;
                firstVisible = false;
            } else if (config.id === "recent") {
                isEnabled = hasRecentlyUsed;
                isVisible = hasRecentlyUsed;
                firstVisible = false;
            } else if (config.id === "people") {
                isVisible = true;
                firstVisible = false;
            }
            return {
                ...config,
                enabled: isEnabled,
                visible: isVisible,
                firstVisible: firstVisible,
                ref: React.createRef(),
            };
        });
    }

    private onScroll = (): void => {
        const body = this.scrollRef.current?.containerRef.current;
        if (!body) return;
        this.setState({
            scrollTop: body.scrollTop,
            viewportHeight: body.clientHeight,
        });
        this.updateVisibility();
    };

    // Given a roving emoji button returns the role=row element containing it
    private getRow(rovingNode?: Element): Element | undefined {
        return this.getGridcell(rovingNode)?.parentElement ?? undefined;
    }

    // Given a roving emoji button returns the role=gridcell element containing it
    private getGridcell(rovingNode?: Element): Element | undefined {
        return rovingNode?.parentElement ?? undefined;
    }

    // Given a role=gridcell node returns the roving emoji button contained within
    private getRovingNode(gridcellNode?: Element): Element | undefined {
        return gridcellNode?.children[0];
    }

    private keyboardNavigation(ev: React.KeyboardEvent, state: RovingState, dispatch: Dispatch<RovingAction>): void {
        const rowElement = this.getRow(state.activeNode);
        const gridcellNode = this.getGridcell(state.activeNode);
        if (!rowElement || !gridcellNode || !state.activeNode) return;

        // Index of element within row container
        const columnIndex = Array.from(rowElement.children).indexOf(gridcellNode);
        // Index of element within the list of roving nodes
        const refIndex = state.nodes.indexOf(state.activeNode);

        let focusNode: HTMLElement | undefined;
        let newRowElement: Element | undefined;
        switch (ev.key) {
            case Key.ARROW_LEFT:
                focusNode = state.nodes[refIndex - 1];
                newRowElement = this.getRow(focusNode);
                break;

            case Key.ARROW_RIGHT:
                focusNode = state.nodes[refIndex + 1];
                newRowElement = this.getRow(focusNode);
                break;

            case Key.ARROW_UP:
            case Key.ARROW_DOWN: {
                // For up/down we find the prev/next parent by inspecting the refs either side of our row
                const node =
                    ev.key === Key.ARROW_UP
                        ? state.nodes[refIndex - columnIndex - 1]
                        : state.nodes[refIndex - columnIndex + EMOJIS_PER_ROW];
                newRowElement = this.getRow(node);
                if (newRowElement) {
                    const newColumnIndex = clamp(columnIndex, 0, newRowElement.children.length - 1);
                    const newTarget = this.getRovingNode(newRowElement?.children[newColumnIndex]);
                    focusNode = state.nodes.find((r) => r === newTarget);
                }
                break;
            }
        }

        if (focusNode) {
            // Only move actual DOM focus if an emoji already has focus
            // If the input has focus, keep using aria-activedescendant for virtual focus
            if (document.activeElement !== document.querySelector(".mx_EmojiPicker_search input")) {
                focusNode?.focus();
            }
            dispatch({
                type: Type.SetFocus,
                payload: { node: focusNode },
            });

            if (rowElement !== newRowElement) {
                focusNode?.scrollIntoView({
                    behavior: "auto",
                    block: "center",
                    inline: "center",
                });
            }
        }

        ev.preventDefault();
        ev.stopPropagation();
    }

    private onKeyDown = (ev: React.KeyboardEvent, state: RovingState, dispatch: Dispatch<RovingAction>): void => {
        if (state.activeNode && [Key.ARROW_DOWN, Key.ARROW_RIGHT, Key.ARROW_LEFT, Key.ARROW_UP].includes(ev.key)) {
            // If highlight is not shown yet, show it and reset to first emoji
            if (!this.state.showHighlight) {
                this.setState({ showHighlight: true });
                // Reset to first emoji when showing highlight for the first time (or after it was hidden)
                if (state.nodes.length > 0) {
                    dispatch({
                        type: Type.SetFocus,
                        payload: { node: state.nodes[0] },
                    });
                }
                ev.preventDefault();
                ev.stopPropagation();
                return;
            }
            this.keyboardNavigation(ev, state, dispatch);
        }
    };

    private updateVisibility = (): void => {
        const body = this.scrollRef.current?.containerRef.current;
        if (!body) return;
        const rect = body.getBoundingClientRect();
        let firstVisibleFound = false;
        for (const cat of this.categories) {
            const elem = body.querySelector(`[data-category-id="${cat.id}"]`);
            if (!elem) {
                cat.visible = false;
                cat.ref.current?.classList.remove("mx_EmojiPicker_anchor_visible");
                continue;
            }
            const elemRect = elem.getBoundingClientRect();
            const y = elemRect.y - rect.y;
            const yEnd = elemRect.y + elemRect.height - rect.y;
            cat.visible = y < rect.height && yEnd > 0;
            if (cat.visible && !firstVisibleFound) {
                firstVisibleFound = true;
                cat.firstVisible = true;
            } else {
                cat.firstVisible = false;
            }
            // We update this here instead of through React to avoid re-render on scroll.
            if (!cat.ref.current) continue;
            if (cat.visible) {
                cat.ref.current.classList.add("mx_EmojiPicker_anchor_visible");
                cat.ref.current.setAttribute("aria-selected", "true");
            } else {
                cat.ref.current.classList.remove("mx_EmojiPicker_anchor_visible");
                cat.ref.current.setAttribute("aria-selected", "false");
            }
            if (cat.firstVisible) {
                cat.ref.current.setAttribute("tabindex", "0");
            } else {
                cat.ref.current.setAttribute("tabindex", "-1");
            }
        }
    };

    private scrollToCategory = (category: string): void => {
        this.scrollRef.current?.containerRef.current
            ?.querySelector(`[data-category-id="${category}"]`)
            ?.scrollIntoView();
    };

    private onChangeFilter = (filter: string): void => {
        const lcFilter = filter.toLowerCase().trim(); // filter is case insensitive

        // User has typed a query, show highlight
        // If filter is cleared, hide highlight again
        if (lcFilter && !this.state.showHighlight) {
            this.setState({ showHighlight: true });
        } else if (!lcFilter && this.state.showHighlight) {
            this.setState({ showHighlight: false });
        }

        for (const cat of this.categories) {
            let emojis: IEmoji[];
            // If the new filter string includes the old filter string, we don't have to re-filter the whole dataset.
            if (lcFilter.includes(this.state.filter)) {
                emojis = this.memoizedDataByCategory[cat.id];
            } else {
                emojis = this.originalDataByCategory[cat.id] ?? [];
            }

            if (lcFilter !== "") {
                emojis = emojis.filter((emoji) => this.emojiMatchesFilter(emoji, lcFilter));
                // Copy the array to not clobber the original unfiltered sorting
                emojis = [...emojis].sort((a, b) => {
                    const indexA = a.shortcodes[0].indexOf(lcFilter);
                    const indexB = b.shortcodes[0].indexOf(lcFilter);

                    // Prioritize emojis containing the filter in its shortcode
                    if (indexA == -1 || indexB == -1) {
                        return indexB - indexA;
                    }

                    // If both emojis start with the filter
                    // put the shorter emoji first
                    if (indexA == 0 && indexB == 0) {
                        return a.shortcodes[0].length - b.shortcodes[0].length;
                    }

                    // Prioritize emojis starting with the filter
                    return indexA - indexB;
                });
            }

            this.memoizedDataByCategory[cat.id] = emojis;
            cat.enabled = emojis.length > 0;
            // The setState below doesn't re-render the header and we already have the refs for updateVisibility, so...
            if (cat.ref.current) {
                cat.ref.current.disabled = !cat.enabled;
            }
        }
        this.setState({ filter });
        // Header underlines need to be updated, but updating requires knowing
        // where the categories are, so we wait for a tick.
        window.setTimeout(this.updateVisibility, 0);
    };

    private emojiMatchesFilter = (emoji: IEmoji, filter: string): boolean => {
        // If the query is an emoji containing a variation then strip it to provide more useful matches
        if (filter.includes(ZERO_WIDTH_JOINER)) {
            filter = filter.split(ZERO_WIDTH_JOINER, 2)[0];
        }
        return (
            emoji.label.toLowerCase().includes(filter) ||
            (Array.isArray(emoji.emoticon)
                ? emoji.emoticon.some((x) => x.includes(filter))
                : emoji.emoticon?.includes(filter)) ||
            emoji.shortcodes.some((x) => x.toLowerCase().includes(filter)) ||
            emoji.unicode.split(ZERO_WIDTH_JOINER).includes(filter)
        );
    };

    private onEnterFilter = (): void => {
        // Only select emoji if highlight is shown
        if (!this.state.showHighlight) return;

        const btn = this.scrollRef.current?.containerRef.current?.querySelector<HTMLButtonElement>(
            '.mx_EmojiPicker_item_wrapper [tabindex="0"]',
        );
        btn?.click();
        this.props.onFinished();
    };

    private onHoverEmoji = (emoji: IEmoji): void => {
        this.setState({
            previewEmoji: emoji,
        });
    };

    private onHoverEmojiEnd = (): void => {
        this.setState({
            previewEmoji: undefined,
        });
    };

    private onClickEmoji = (ev: ButtonEvent, emoji: IEmoji): void => {
        if (this.props.onChoose(emoji.unicode) !== false) {
            recent.add(emoji.unicode);
        }
        if ((ev as React.KeyboardEvent).key === Key.ENTER) {
            this.props.onFinished();
        }
    };

    private static categoryHeightForEmojiCount(count: number): number {
        if (count === 0) {
            return 0;
        }
        return CATEGORY_HEADER_HEIGHT + Math.ceil(count / EMOJIS_PER_ROW) * EMOJI_HEIGHT;
    }

    public render(): React.ReactNode {
        return (
            <RovingTabIndexProvider onKeyDown={this.onKeyDown}>
                {({ onKeyDownHandler }) => {
                    let heightBefore = 0;
                    return (
                        <section
                            className="mx_EmojiPicker"
                            data-testid="mx_EmojiPicker"
                            onKeyDown={onKeyDownHandler}
                            aria-label={_t("a11y|emoji_picker")}
                        >
                            <Header categories={this.categories} onAnchorClick={this.scrollToCategory} />
                            <Search
                                query={this.state.filter}
                                onChange={this.onChangeFilter}
                                onEnter={this.onEnterFilter}
                                onKeyDown={onKeyDownHandler}
                            />
                            <AutoHideScrollbar
                                id="mx_EmojiPicker_body"
                                className={classNames("mx_EmojiPicker_body", {
                                    mx_EmojiPicker_body_showHighlight: this.state.showHighlight,
                                })}
                                ref={this.scrollRef}
                                onScroll={this.onScroll}
                            >
                                {this.categories.map((category) => {
                                    const emojis = this.memoizedDataByCategory[category.id];
                                    const categoryElement = (
                                        <Category
                                            key={category.id}
                                            id={category.id}
                                            name={category.name}
                                            heightBefore={heightBefore}
                                            viewportHeight={this.state.viewportHeight}
                                            scrollTop={this.state.scrollTop}
                                            emojis={emojis}
                                            onClick={this.onClickEmoji}
                                            onMouseEnter={this.onHoverEmoji}
                                            onMouseLeave={this.onHoverEmojiEnd}
                                            isEmojiDisabled={this.props.isEmojiDisabled}
                                            selectedEmojis={this.props.selectedEmojis}
                                        />
                                    );
                                    const height = EmojiPicker.categoryHeightForEmojiCount(emojis.length);
                                    heightBefore += height;
                                    return categoryElement;
                                })}
                            </AutoHideScrollbar>
                            {this.state.previewEmoji ? (
                                <Preview emoji={this.state.previewEmoji} />
                            ) : (
                                <QuickReactions
                                    onClick={this.onClickEmoji}
                                    selectedEmojis={this.props.selectedEmojis}
                                />
                            )}
                        </section>
                    );
                }}
            </RovingTabIndexProvider>
        );
    }
}

export default EmojiPicker;
