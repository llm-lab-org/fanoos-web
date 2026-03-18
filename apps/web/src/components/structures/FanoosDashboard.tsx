/*
Copyright 2024 New Vector Ltd.
Copyright 2026 LLM-LAB (Fanoos fork)

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useCallback, useEffect, useState } from "react";
import { type Room, RoomEvent } from "matrix-js-sdk/src/matrix";

import { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import { RoomNotificationStateStore } from "../../stores/notifications/RoomNotificationStateStore";
import { NotificationLevel } from "../../stores/notifications/NotificationLevel";
import dis from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";
import RoomAvatar from "../views/avatars/RoomAvatar";
import { useEventEmitter } from "../../hooks/useEventEmitter";

interface RoomCardData {
    room: Room;
    unreadCount: number;
    notifLevel: NotificationLevel;
    lastMessage: string;
    lastTs: number;
}

function getRoomCardData(room: Room): RoomCardData {
    const notifState = RoomNotificationStateStore.instance.getRoomState(room);
    const tl = room.getLiveTimeline();
    const events = tl.getEvents();
    let lastMessage = "";
    let lastTs = 0;
    for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i];
        if (ev.getType() === "m.room.message") {
            const body = ev.getContent().body ?? "";
            lastMessage = body.length > 60 ? body.slice(0, 60) + "…" : body;
            lastTs = ev.getTs();
            break;
        }
    }
    return {
        room,
        unreadCount: notifState.count,
        notifLevel: notifState.level,
        lastMessage,
        lastTs,
    };
}

function formatTs(ts: number): string {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays < 7) {
        return d.toLocaleDateString([], { weekday: "short" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const RoomCard: React.FC<{ data: RoomCardData }> = ({ data }) => {
    const { room, unreadCount, notifLevel, lastMessage, lastTs } = data;

    const openRoom = useCallback(() => {
        dis.dispatch({ action: Action.ViewRoom, room_id: room.roomId });
    }, [room.roomId]);

    const hasHighlight = notifLevel >= NotificationLevel.Highlight;
    const hasNotif = notifLevel >= NotificationLevel.Notification;
    const hasActivity = notifLevel >= NotificationLevel.Activity;

    let badgeClass = "mx_FanoosDashboard_badge";
    if (hasHighlight) badgeClass += " mx_FanoosDashboard_badge_highlight";
    else if (hasNotif) badgeClass += " mx_FanoosDashboard_badge_notif";
    else if (hasActivity) badgeClass += " mx_FanoosDashboard_badge_activity";

    return (
        <button className="mx_FanoosDashboard_card" onClick={openRoom} aria-label={room.name}>
            <div className="mx_FanoosDashboard_cardAvatar">
                <RoomAvatar room={room} size="48px" />
                {unreadCount > 0 && (
                    <span className={badgeClass}>
                        {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                )}
                {unreadCount === 0 && hasActivity && (
                    <span className={badgeClass + " mx_FanoosDashboard_badge_dot"} />
                )}
            </div>
            <div className="mx_FanoosDashboard_cardBody">
                <div className="mx_FanoosDashboard_cardHeader">
                    <span className="mx_FanoosDashboard_cardName">{room.name}</span>
                    {lastTs > 0 && (
                        <span className="mx_FanoosDashboard_cardTs">{formatTs(lastTs)}</span>
                    )}
                </div>
                {lastMessage && (
                    <p className="mx_FanoosDashboard_cardPreview">{lastMessage}</p>
                )}
            </div>
        </button>
    );
};

const FanoosDashboard: React.FC = () => {
    const client = useMatrixClientContext();
    const [cards, setCards] = useState<RoomCardData[]>([]);

    const buildCards = useCallback(() => {
        const rooms = client
            .getRooms()
            .filter((r) => r.getMyMembership() === "join")
            .map(getRoomCardData)
            .sort((a, b) => {
                // Sort: unread with highlights first, then by last activity
                if (b.notifLevel !== a.notifLevel) return b.notifLevel - a.notifLevel;
                return b.lastTs - a.lastTs;
            });
        setCards(rooms);
    }, [client]);

    useEffect(() => {
        buildCards();
    }, [buildCards]);

    // Refresh on any room timeline event
    useEventEmitter(client, RoomEvent.Timeline, buildCards);

    const totalUnread = cards.reduce((sum, c) => sum + c.unreadCount, 0);

    return (
        <div className="mx_FanoosDashboard">
            <div className="mx_FanoosDashboard_header">
                <svg className="mx_FanoosDashboard_headerIcon" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                </svg>
                <h1 className="mx_FanoosDashboard_title">Rooms</h1>
                {totalUnread > 0 && (
                    <span className="mx_FanoosDashboard_totalBadge">{totalUnread}</span>
                )}
            </div>
            <div className="mx_FanoosDashboard_grid">
                {cards.map((data) => (
                    <RoomCard key={data.room.roomId} data={data} />
                ))}
                {cards.length === 0 && (
                    <p className="mx_FanoosDashboard_empty">No rooms yet.</p>
                )}
            </div>
        </div>
    );
};

export default FanoosDashboard;
