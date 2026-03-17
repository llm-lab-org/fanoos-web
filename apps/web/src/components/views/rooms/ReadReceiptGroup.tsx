/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, type PropsWithChildren, useState } from "react";
import { type User } from "matrix-js-sdk/src/matrix";
import { Tooltip } from "@vector-im/compound-web";

import ReadReceiptMarker, { type IReadReceiptPosition } from "./ReadReceiptMarker";
import { type IReadReceiptProps } from "./EventTile";
import AccessibleButton from "../elements/AccessibleButton";
import MemberAvatar from "../avatars/MemberAvatar";
import AutoHideScrollbar from "../../structures/AutoHideScrollbar";
import { formatDate } from "../../../DateUtils";
import { Action } from "../../../dispatcher/actions";
import dis from "../../../dispatcher/dispatcher";
import ContextMenu, { aboveLeftOf, MenuItem, useContextMenu } from "../../structures/ContextMenu";
import { _t } from "../../../languageHandler";
import { useRovingTabIndex } from "../../../accessibility/RovingTabIndex";
import { formatList } from "../../../utils/FormattingUtils";

// #20547 Design specified that we should show the three latest read receipts
const MAX_READ_AVATARS_PLUS_N = 3;
// #21935 If we’ve got just 4, don’t show +1, just show all of them
const MAX_READ_AVATARS = MAX_READ_AVATARS_PLUS_N + 1;

const READ_AVATAR_OFFSET = 10;
export const READ_AVATAR_SIZE = 16;

interface Props {
    readReceipts: IReadReceiptProps[];
    readReceiptMap: { [userId: string]: IReadReceiptPosition };
    checkUnmounting?: () => boolean;
    suppressAnimation: boolean;
    isTwelveHour?: boolean;
}

interface IAvatarPosition {
    hidden: boolean;
    position: number;
}

export function determineAvatarPosition(index: number, max: number): IAvatarPosition {
    if (index < max) {
        return {
            hidden: false,
            position: index,
        };
    } else {
        return {
            hidden: true,
            position: 0,
        };
    }
}

export function readReceiptTooltip(members: string[], maxAvatars: number): string | undefined {
    return formatList(members, maxAvatars);
}

export function ReadReceiptGroup({
    readReceipts,
    readReceiptMap,
    checkUnmounting,
    suppressAnimation,
    isTwelveHour,
}: Props): JSX.Element {
    const [menuDisplayed, button, openMenu, closeMenu] = useContextMenu();
    const [searchQuery, setSearchQuery] = useState("");

    // If we are above MAX_READ_AVATARS, we’ll have to remove a few to have space for the +n count.
    const hasMore = readReceipts.length > MAX_READ_AVATARS;
    const maxAvatars = hasMore ? MAX_READ_AVATARS_PLUS_N : MAX_READ_AVATARS;

    const tooltipMembers: string[] = readReceipts.map((it) => it.roomMember?.name ?? it.userId);
    const tooltipText = readReceiptTooltip(tooltipMembers, maxAvatars);

    // return early if there are no read receipts — show single tick (sent)
    if (readReceipts.length === 0) {
        // We currently must include `mx_ReadReceiptGroup_container` in
        // the DOM of all events, as it is the positioned parent of the
        // animated read receipts. We can't let it unmount when a receipt
        // moves events, so for now we mount it for all events. Without
        // it, the animation will start from the top of the timeline
        // (because it lost its container).
        // See also https://github.com/vector-im/element-web/issues/17561
        return (
            <div className="mx_EventTile_msgOption">
                <div className="mx_ReadReceiptGroup">
                    <div className="mx_ReadReceiptGroup_button">
                        {/* Single tick: message sent to server */}
                        <span className="mx_DeliveryStatus mx_DeliveryStatus_sent" aria-label="Sent">
                            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path d="M1 5L5 9L13 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </span>
                        <span className="mx_ReadReceiptGroup_container" />
                    </div>
                </div>
            </div>
        );
    }

    const avatars = readReceipts
        .map((receipt, index) => {
            const { hidden, position } = determineAvatarPosition(index, maxAvatars);

            const userId = receipt.userId;
            let readReceiptPosition: IReadReceiptPosition | undefined;

            if (readReceiptMap) {
                readReceiptPosition = readReceiptMap[userId];
                if (!readReceiptPosition) {
                    readReceiptPosition = {};
                    // eslint-disable-next-line react-compiler/react-compiler
                    readReceiptMap[userId] = readReceiptPosition;
                }
            }

            return (
                <ReadReceiptMarker
                    key={userId}
                    member={receipt.roomMember}
                    fallbackUserId={userId}
                    offset={position * READ_AVATAR_OFFSET}
                    hidden={hidden}
                    readReceiptPosition={readReceiptPosition}
                    checkUnmounting={checkUnmounting}
                    suppressAnimation={suppressAnimation}
                    timestamp={receipt.ts}
                    showTwelveHour={isTwelveHour}
                />
            );
        })
        .reverse();

    const filteredReceipts = searchQuery.trim()
        ? readReceipts.filter((r) => {
              const q = searchQuery.toLowerCase();
              return (r.roomMember?.name ?? r.userId).toLowerCase().includes(q) || r.userId.toLowerCase().includes(q);
          })
        : readReceipts;

    let contextMenu: JSX.Element | undefined;
    if (menuDisplayed && button.current) {
        const buttonRect = button.current.getBoundingClientRect();
        contextMenu = (
            <ContextMenu
                menuClassName="mx_ReadReceiptGroup_popup"
                onFinished={() => { setSearchQuery(""); closeMenu(); }}
                {...aboveLeftOf(buttonRect)}
            >
                <SectionHeader className="mx_ReadReceiptGroup_title">
                    {_t("timeline|read_receipt_title", { count: readReceipts.length })}
                </SectionHeader>
                {readReceipts.length > 4 && (
                    <div className="mx_ReadReceiptGroup_search">
                        <input
                            type="text"
                            className="mx_ReadReceiptGroup_searchInput"
                            placeholder={_t("action|search")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                    </div>
                )}
                <AutoHideScrollbar>
                    {filteredReceipts.map((receipt) => (
                        <ReadReceiptPerson
                            key={receipt.userId}
                            {...receipt}
                            isTwelveHour={isTwelveHour}
                            onAfterClick={() => { setSearchQuery(""); closeMenu(); }}
                        />
                    ))}
                    {filteredReceipts.length === 0 && (
                        <p className="mx_ReadReceiptGroup_noResults">{_t("common|no_results")}</p>
                    )}
                </AutoHideScrollbar>
            </ContextMenu>
        );
    }

    return (
        <div className="mx_EventTile_msgOption">
            <Tooltip
                label={_t("timeline|read_receipt_title", { count: readReceipts.length })}
                caption={tooltipText}
                placement="top-end"
            >
                <div className="mx_ReadReceiptGroup" role="group" aria-label={_t("timeline|read_receipts_label")}>
                    <AccessibleButton
                        className="mx_ReadReceiptGroup_button"
                        ref={button}
                        aria-label={tooltipText}
                        aria-haspopup="true"
                        onClick={openMenu}
                    >
                        {/* Double tick: message seen — click to see who */}
                        <span className="mx_DeliveryStatus mx_DeliveryStatus_seen" aria-label="Seen">
                            <svg width="18" height="10" viewBox="0 0 18 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path d="M1 5L5 9L13 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M5 5L9 9L17 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </span>
                        {/* Keep avatars in DOM for animation anchoring, but visually hidden */}
                        <span
                            className="mx_ReadReceiptGroup_container"
                            style={{ width: 0, height: 0, overflow: "hidden", position: "absolute" }}
                        >
                            {avatars}
                        </span>
                    </AccessibleButton>
                    {contextMenu}
                </div>
            </Tooltip>
        </div>
    );
}

interface ReadReceiptPersonProps extends IReadReceiptProps {
    isTwelveHour?: boolean;
    onAfterClick?: () => void;
}

// Export for testing
export function ReadReceiptPerson({
    userId,
    roomMember,
    ts,
    isTwelveHour,
    onAfterClick,
}: ReadReceiptPersonProps): JSX.Element {
    return (
        <Tooltip
            description={roomMember?.rawDisplayName ?? userId}
            caption={userId}
            placement="top"
            isTriggerInteractive={false}
        >
            <MenuItem
                className="mx_ReadReceiptGroup_person"
                onClick={() => {
                    dis.dispatch({
                        action: Action.ViewUser,
                        // XXX: We should be using a real member object and not assuming what the receiver wants.
                        // The ViewUser action leads to the RightPanelStore, and RightPanelStoreIPanelState defines the
                        // member property of IRightPanelCardState as `RoomMember | User`, so we’re fine for now, but we
                        // should definitely clean this up later
                        member: roomMember ?? ({ userId } as User),
                        push: false,
                    });
                    onAfterClick?.();
                }}
            >
                <MemberAvatar
                    member={roomMember}
                    fallbackUserId={userId}
                    size="24px"
                    aria-hidden="true"
                    aria-live="off"
                    resizeMethod="crop"
                    hideTitle
                />
                <div className="mx_ReadReceiptGroup_name">
                    <p>{roomMember?.name ?? userId}</p>
                    <p className="mx_ReadReceiptGroup_secondary">{formatDate(new Date(ts), isTwelveHour)}</p>
                </div>
            </MenuItem>
        </Tooltip>
    );
}

interface ISectionHeaderProps {
    className?: string;
}

function SectionHeader({ className, children }: PropsWithChildren<ISectionHeaderProps>): JSX.Element {
    const [onFocus, , ref] = useRovingTabIndex<HTMLHeadingElement>();

    return (
        <h3 className={className} role="menuitem" onFocus={onFocus} tabIndex={-1} ref={ref}>
            {children}
        </h3>
    );
}
