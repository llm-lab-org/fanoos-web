/*
Copyright 2026 LLM-LAB (Fanoos fork)
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
*/

/*
 * Direct Matrix/Synapse HTTP calls for the "Admin servers" Teams-dashboard-shaped
 * view. We drive these via the stored admin access token from an AdminServer
 * entry — no full matrix-js-sdk client per server (that's the multi-user
 * refactor we already ruled out).
 *
 * Coverage is intentionally minimal:
 *   - List rooms via Synapse admin API.
 *   - List recent messages via /messages?dir=b.
 *   - Send plaintext via /send/m.room.message/{txnId}.
 *   - Join a room via /join.
 * No E2EE, threads, reactions, media rendering — those need a real client.
 */

import { type AdminServer } from "./adminServers";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ServerRoom {
    roomId: string;
    name: string;
    joinedMembers: number;
    canonicalAlias?: string;
    encryption?: string;
    joinRules?: string;
}

export interface RoomMessage {
    eventId: string;
    sender: string;
    ts: number;
    body: string;
    msgtype: string;
    /** Present when message is HTML-formatted (format === "org.matrix.custom.html"). */
    formattedBody?: string;
    /** MXC URI for m.image / m.audio / m.file messages. */
    url?: string;
    /** Duration in ms (voice messages), size + mimetype for files/images. */
    info?: { mimetype?: string; size?: number; duration?: number; w?: number; h?: number };
    /** Grouped reactions on this message: emoji → { count, mine, senders, myEventId? } */
    reactions?: Record<string, { count: number; mine: boolean; senders: string[]; myEventId?: string }>;
}

/**
 * Auth-aware media fetch. Uses /_matrix/client/v1/media/download (with the
 * admin's Bearer token) so it works on newer Synapse deployments that require
 * authenticated media. Returns an object URL the browser can render in an
 * <img> / <audio> / <video> tag. Caller is responsible for URL.revokeObjectURL.
 */
export async function fetchAuthMedia(server: AdminServer, mxc: string): Promise<string> {
    const m = mxc.match(/^mxc:\/\/([^/]+)\/(.+)$/);
    if (!m) throw new Error("bad mxc uri");
    // Try v1 authenticated endpoint first — required on Synapse ≥ 1.100 with
    // enable_authenticated_media = true (default in newer deployments).
    const v1 = `${server.homeserverUrl.replace(/\/$/, "")}/_matrix/client/v1/media/download/${m[1]}/${m[2]}`;
    let resp = await fetch(v1, {
        headers: { Authorization: `Bearer ${server.accessToken}` },
    });
    if (!resp.ok) {
        // Fall back to the legacy unauthenticated endpoint.
        const v3 = `${server.homeserverUrl.replace(/\/$/, "")}/_matrix/media/v3/download/${m[1]}/${m[2]}`;
        resp = await fetch(v3);
        if (!resp.ok) throw new Error(`media fetch failed: ${resp.status}`);
    }
    const blob = await resp.blob();
    return URL.createObjectURL(blob);
}

// ─── Low-level fetch helper ─────────────────────────────────────────────────

async function api<T>(server: AdminServer, path: string, init: RequestInit = {}): Promise<T> {
    const url = `${server.homeserverUrl.replace(/\/$/, "")}${path}`;
    const resp = await fetch(url, {
        ...init,
        headers: {
            "Authorization": `Bearer ${server.accessToken}`,
            "content-type": "application/json",
            ...(init.headers ?? {}),
        },
    });
    if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try {
            const body = (await resp.json()) as { error?: string; errcode?: string };
            if (body.error) msg = `${body.errcode ?? resp.status}: ${body.error}`;
        } catch {
            /* ignore */
        }
        throw new Error(msg);
    }
    return (await resp.json()) as T;
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

interface JoinedRoomsResponse {
    joined_rooms: string[];
}

interface NameStateResponse {
    name?: string;
}

interface AliasStateResponse {
    alias?: string;
}

interface JoinedMembersResponse {
    joined: Record<string, { display_name?: string | null; avatar_url?: string | null }>;
}

interface HierarchyResponse {
    rooms: Array<{
        room_id: string;
        name?: string;
        canonical_alias?: string | null;
        num_joined_members?: number;
        room_type?: string;
        children_state?: Array<{
            state_key: string;
            content?: { via?: string[] };
        }>;
        encryption?: string | null;
        guest_can_join?: boolean;
    }>;
}

export interface RoomMember {
    userId: string;
    displayName: string;
}

export interface ServerHierarchy {
    /** Every non-space room the admin knows about. */
    rooms: ServerRoom[];
    /** Space rooms (type: m.space). */
    spaces: ServerRoom[];
    /** For each space id → list of child room ids that appeared in its children_state. */
    spaceChildren: Record<string, string[]>;
}

/**
 * Best-effort display name for a single room. Prefers m.room.name, then
 * m.room.canonical_alias, then the raw id. Used when /hierarchy didn't supply
 * a name (older Synapses, restricted rooms).
 */
async function resolveRoomName(server: AdminServer, roomId: string): Promise<string> {
    const enc = encodeURIComponent(roomId);
    const [nameRes, aliasRes] = await Promise.allSettled([
        api<NameStateResponse>(server, `/_matrix/client/v3/rooms/${enc}/state/m.room.name`),
        api<AliasStateResponse>(server, `/_matrix/client/v3/rooms/${enc}/state/m.room.canonical_alias`),
    ]);
    if (nameRes.status === "fulfilled" && nameRes.value.name) return nameRes.value.name;
    if (aliasRes.status === "fulfilled" && aliasRes.value.alias) return aliasRes.value.alias;
    return roomId;
}

/**
 * List rooms visible to the stored admin token, grouped by space when possible.
 * Strategy:
 *   1. /_matrix/client/v3/joined_rooms → every room the admin has joined.
 *   2. For each joined room, call /_matrix/client/v1/rooms/{id}/hierarchy
 *      which returns:
 *        - The room itself (with name / canonical_alias / num_joined_members / room_type).
 *        - For spaces (room_type === "m.space"): every child room in children_state.
 *   3. Anything not linked as a space child is grouped under a virtual "Other" bucket.
 */
export async function fetchServerHierarchy(server: AdminServer): Promise<ServerHierarchy> {
    const joined = await api<JoinedRoomsResponse>(server, "/_matrix/client/v3/joined_rooms");
    const roomIds = joined.joined_rooms ?? [];

    // Fetch hierarchy for each joined room in parallel, capped to 12 at a time.
    const allRoomsSeen = new Map<
        string,
        {
            name?: string;
            canonicalAlias?: string;
            joinedMembers: number;
            roomType?: string;
            encryption?: string;
        }
    >();
    const spaceChildren: Record<string, string[]> = {};

    const chunkSize = 12;
    for (let i = 0; i < roomIds.length; i += chunkSize) {
        const batch = roomIds.slice(i, i + chunkSize);
        const results = await Promise.all(
            batch.map((id) =>
                api<HierarchyResponse>(
                    server,
                    `/_matrix/client/v1/rooms/${encodeURIComponent(id)}/hierarchy?limit=100`,
                ).catch(() => null),
            ),
        );
        for (let j = 0; j < batch.length; j++) {
            const parentId = batch[j];
            const resp = results[j];
            if (!resp?.rooms) continue;
            for (const room of resp.rooms) {
                // Only remember the best data for each room across all hierarchies.
                if (!allRoomsSeen.has(room.room_id)) {
                    allRoomsSeen.set(room.room_id, {
                        name: room.name ?? undefined,
                        canonicalAlias: room.canonical_alias ?? undefined,
                        joinedMembers: room.num_joined_members ?? 0,
                        roomType: room.room_type ?? undefined,
                        encryption: room.encryption ?? undefined,
                    });
                }
                // If this room is the parent AND it's a space, harvest its children_state.
                if (room.room_id === parentId && room.room_type === "m.space") {
                    const kids = (room.children_state ?? []).map((cs) => cs.state_key).filter(Boolean);
                    if (kids.length) spaceChildren[parentId] = kids;
                }
            }
        }
    }

    // Backfill names via state-event fetches for anything /hierarchy didn't name.
    const missingName = Array.from(allRoomsSeen.entries()).filter(([, v]) => !v.name && !v.canonicalAlias);
    for (let i = 0; i < missingName.length; i += chunkSize) {
        const batch = missingName.slice(i, i + chunkSize);
        const names = await Promise.all(batch.map(([id]) => resolveRoomName(server, id)));
        for (let j = 0; j < batch.length; j++) {
            const info = allRoomsSeen.get(batch[j][0]);
            if (info) info.name = names[j];
        }
    }

    // Split into rooms + spaces, prefer alias over raw id.
    const rooms: ServerRoom[] = [];
    const spaces: ServerRoom[] = [];
    for (const [id, info] of allRoomsSeen) {
        const displayName = info.name || info.canonicalAlias || id;
        const record: ServerRoom = {
            roomId: id,
            name: displayName,
            joinedMembers: info.joinedMembers,
            canonicalAlias: info.canonicalAlias,
            encryption: info.encryption,
        };
        if (info.roomType === "m.space") spaces.push(record);
        else rooms.push(record);
    }
    return { rooms, spaces, spaceChildren };
}

/**
 * Fetch just the rooms under a given space (recursively). Returned rooms
 * exclude the space itself and any child spaces. Used at click-time so we
 * don't rely on the initial hierarchy fetch capturing every child.
 */
export async function fetchSpaceRooms(server: AdminServer, spaceId: string): Promise<ServerRoom[]> {
    try {
        const resp = await api<HierarchyResponse>(
            server,
            `/_matrix/client/v1/rooms/${encodeURIComponent(spaceId)}/hierarchy?limit=500&max_depth=10&suggested_only=false`,
        );
        const rooms: ServerRoom[] = [];
        for (const r of resp.rooms ?? []) {
            // Skip the space itself and nested spaces.
            if (r.room_id === spaceId) continue;
            if (r.room_type === "m.space") continue;
            rooms.push({
                roomId: r.room_id,
                name: r.name ?? r.canonical_alias ?? r.room_id,
                joinedMembers: r.num_joined_members ?? 0,
                canonicalAlias: r.canonical_alias ?? undefined,
                encryption: r.encryption ?? undefined,
            });
        }
        return rooms;
    } catch {
        return [];
    }
}

/** Fetch joined members of a room (used for hover tooltip + analysis pane). */
export async function fetchRoomMembers(server: AdminServer, roomId: string): Promise<RoomMember[]> {
    try {
        const resp = await api<JoinedMembersResponse>(
            server,
            `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`,
        );
        return Object.entries(resp.joined ?? {}).map(([userId, info]) => ({
            userId,
            displayName: info.display_name || userId.split(":")[0].replace(/^@/, ""),
        }));
    } catch {
        return [];
    }
}

// ─── Messages ────────────────────────────────────────────────────────────────

interface MessagesResponse {
    chunk: Array<{
        event_id: string;
        sender: string;
        origin_server_ts: number;
        type: string;
        content: {
            "body"?: string;
            "msgtype"?: string;
            "format"?: string;
            "formatted_body"?: string;
            "url"?: string;
            "info"?: { mimetype?: string; size?: number; duration?: number; w?: number; h?: number };
            "m.relates_to"?: {
                rel_type?: string;
                event_id?: string;
                key?: string;
            };
        };
    }>;
    start?: string;
    end?: string;
}

/**
 * Last N messages of a room, ordered oldest-first for rendering. Also folds
 * m.reaction events into their target message so the UI can render them
 * without a second round-trip. Non-message/reaction events are filtered out.
 */
export async function fetchRoomMessages(server: AdminServer, roomId: string, limit = 50): Promise<RoomMessage[]> {
    // Ask for both m.room.message and m.reaction so we can pair them up.
    const resp = await api<MessagesResponse>(
        server,
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=${limit}&filter=${encodeURIComponent(
            JSON.stringify({ types: ["m.room.message", "m.reaction"] }),
        )}`,
    );
    const msgs: RoomMessage[] = [];
    const msgById = new Map<string, RoomMessage>();
    const reactions: Array<{ target: string; key: string; sender: string; eventId: string }> = [];
    for (const e of resp.chunk) {
        if (e.type === "m.room.message" && e.content?.body) {
            const msg: RoomMessage = {
                eventId: e.event_id,
                sender: e.sender,
                ts: e.origin_server_ts,
                body: String(e.content.body ?? ""),
                msgtype: e.content.msgtype ?? "m.text",
                url: e.content.url,
                info: e.content.info,
                formattedBody: e.content.format === "org.matrix.custom.html" ? e.content.formatted_body : undefined,
            };
            msgs.push(msg);
            msgById.set(e.event_id, msg);
        } else if (e.type === "m.reaction") {
            const rel = e.content?.["m.relates_to"];
            if (rel?.rel_type === "m.annotation" && rel.event_id && rel.key) {
                reactions.push({
                    target: rel.event_id,
                    key: rel.key,
                    sender: e.sender,
                    eventId: e.event_id,
                });
            }
        }
    }
    // Fold reactions into their target messages.
    for (const r of reactions) {
        const target = msgById.get(r.target);
        if (!target) continue;
        target.reactions = target.reactions ?? {};
        const bucket = target.reactions[r.key] ?? { count: 0, mine: false, senders: [] };
        // De-dupe by sender per key.
        if (!bucket.senders.includes(r.sender)) {
            bucket.senders.push(r.sender);
            bucket.count = bucket.senders.length;
        }
        // Track my own reaction event_id so we can redact it on toggle-off.
        if (r.sender === server.adminMxid) bucket.myEventId = r.eventId;
        target.reactions[r.key] = bucket;
    }
    // Mark "mine" — reactions the admin themselves made.
    for (const msg of msgs) {
        if (!msg.reactions) continue;
        for (const key of Object.keys(msg.reactions)) {
            msg.reactions[key].mine = msg.reactions[key].senders.includes(server.adminMxid);
        }
    }
    msgs.sort((a, b) => a.ts - b.ts);
    return msgs;
}

/** Send an m.reaction event annotating a message with an emoji. */
export async function sendReaction(
    server: AdminServer,
    roomId: string,
    targetEventId: string,
    key: string,
): Promise<string> {
    const txnId = `fanoos-r-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const url = `${server.homeserverUrl.replace(/\/$/, "")}/_matrix/client/v3/rooms/${encodeURIComponent(
        roomId,
    )}/send/m.reaction/${encodeURIComponent(txnId)}`;
    const resp = await fetch(url, {
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${server.accessToken}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            "m.relates_to": { rel_type: "m.annotation", event_id: targetEventId, key },
        }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = (await resp.json()) as { event_id: string };
    return json.event_id;
}

/** Redact (undo) a previously-sent reaction event. */
export async function redactEvent(server: AdminServer, roomId: string, eventId: string): Promise<void> {
    const txnId = `fanoos-x-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const url = `${server.homeserverUrl.replace(/\/$/, "")}/_matrix/client/v3/rooms/${encodeURIComponent(
        roomId,
    )}/redact/${encodeURIComponent(eventId)}/${encodeURIComponent(txnId)}`;
    const resp = await fetch(url, {
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${server.accessToken}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({}),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
}

/**
 * Upload a File / Blob to the server's media repo. Returns an mxc:// URI.
 * Uses the admin token; the resulting content_uri can be referenced from
 * an m.image / m.file / m.audio event.
 */
export async function uploadMedia(server: AdminServer, file: File): Promise<string> {
    const url = `${server.homeserverUrl.replace(/\/$/, "")}/_matrix/media/v3/upload?filename=${encodeURIComponent(
        file.name,
    )}`;
    const resp = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${server.accessToken}`,
            "content-type": file.type || "application/octet-stream",
        },
        body: file,
    });
    if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try {
            const body = (await resp.json()) as { error?: string; errcode?: string };
            if (body.error) msg = `${body.errcode ?? resp.status}: ${body.error}`;
        } catch {
            /* ignore */
        }
        throw new Error(msg);
    }
    const json = (await resp.json()) as { content_uri: string };
    return json.content_uri;
}

/** Send an m.image / m.file / m.audio event by content URI. Returns the event_id. */
export async function sendRoomMedia(
    server: AdminServer,
    roomId: string,
    contentUri: string,
    file: File | Blob,
    msgtype: "m.image" | "m.file" | "m.audio" = "m.image",
    extra: { durationMs?: number; body?: string; voiceMessage?: boolean } = {},
): Promise<string> {
    const txnId = `fanoos-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const name = (file as File).name || "file";
    const info: Record<string, unknown> = { mimetype: file.type, size: file.size };
    if (extra.durationMs) info.duration = extra.durationMs;
    const body: Record<string, unknown> = {
        msgtype,
        body: extra.body ?? name,
        url: contentUri,
        info,
    };
    if (extra.voiceMessage) {
        // MSC3245 marker so clients render as voice-message playback.
        body["org.matrix.msc3245.voice"] = {};
    }
    const resp = await fetch(
        `${server.homeserverUrl.replace(/\/$/, "")}/_matrix/client/v3/rooms/${encodeURIComponent(
            roomId,
        )}/send/m.room.message/${encodeURIComponent(txnId)}`,
        {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${server.accessToken}`,
                "content-type": "application/json",
            },
            body: JSON.stringify(body),
        },
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = (await resp.json()) as { event_id: string };
    return json.event_id;
}

/** Upload a Blob (voice recording, etc) to the media repo. */
export async function uploadMediaBlob(server: AdminServer, blob: Blob, filename: string): Promise<string> {
    const url = `${server.homeserverUrl.replace(/\/$/, "")}/_matrix/media/v3/upload?filename=${encodeURIComponent(
        filename,
    )}`;
    const resp = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${server.accessToken}`,
            "content-type": blob.type || "application/octet-stream",
        },
        body: blob,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = (await resp.json()) as { content_uri: string };
    return json.content_uri;
}

/**
 * Send a text message. If `formattedHtml` is provided, sends as
 * `format: "org.matrix.custom.html"` with formatted_body — the same shape
 * Element uses for rich-text messages so other clients render bold/italic/
 * etc. correctly.
 */
export async function sendRoomMessage(
    server: AdminServer,
    roomId: string,
    body: string,
    formattedHtml?: string,
): Promise<string> {
    const txnId = `fanoos-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const payload: Record<string, unknown> = { msgtype: "m.text", body };
    if (formattedHtml && formattedHtml !== body) {
        payload.format = "org.matrix.custom.html";
        payload.formatted_body = formattedHtml;
    }
    const resp = await api<{ event_id: string }>(
        server,
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txnId)}`,
        {
            method: "PUT",
            body: JSON.stringify(payload),
        },
    );
    return resp.event_id;
}

/** Join a room via the admin's token — needed before we can read/write. */
export async function joinRoom(server: AdminServer, roomId: string): Promise<void> {
    await api(server, `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/join`, {
        method: "POST",
        body: JSON.stringify({}),
    });
}

interface SyncResponse {
    rooms?: {
        join?: Record<
            string,
            {
                unread_notifications?: { notification_count?: number; highlight_count?: number };
            }
        >;
    };
}

/**
 * Fetch per-room unread counts from the homeserver's own bookkeeping via a
 * minimal /sync (no timeline / state / ephemeral events — just the room
 * summaries with `unread_notifications`). Same source the local Matrix client
 * uses for its unread badges.
 */
export async function fetchUnreadCounts(server: AdminServer): Promise<Record<string, number>> {
    const filter = {
        room: {
            rooms: [],
            state: { types: [], limit: 0 },
            timeline: { types: [], limit: 0 },
            ephemeral: { types: [], limit: 0 },
            account_data: { types: [], limit: 0 },
        },
        account_data: { types: [], limit: 0 },
        presence: { types: [], limit: 0 },
    };
    const url = `/_matrix/client/v3/sync?timeout=0&filter=${encodeURIComponent(JSON.stringify(filter))}`;
    try {
        const resp = await api<SyncResponse>(server, url);
        const out: Record<string, number> = {};
        const join = resp.rooms?.join ?? {};
        for (const [roomId, data] of Object.entries(join)) {
            const count = data.unread_notifications?.notification_count ?? 0;
            if (count > 0) out[roomId] = count;
        }
        return out;
    } catch {
        return {};
    }
}

/**
 * Fetch just the newest event_id (any type) for each room. Cheap for polling —
 * ~1 event per room per call. Returns a map roomId → event_id.
 * Rooms the caller isn't a member of are silently skipped.
 */
export async function fetchLatestEventIds(server: AdminServer, roomIds: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    // Sequential rather than parallel so we don't hammer the server with N
    // requests at once. Poll cadence is 30s so this is fine.
    for (const roomId of roomIds) {
        try {
            const resp = await api<MessagesResponse>(
                server,
                `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=1`,
            );
            const evt = resp.chunk?.[0];
            if (evt) out[roomId] = evt.event_id;
        } catch {
            /* not a member or ephemeral error — skip */
        }
    }
    return out;
}
