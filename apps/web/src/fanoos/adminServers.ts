/*
Copyright 2026 LLM-LAB (Fanoos fork)
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
*/

/*
 * Multi-server admin panel: store credentials for extra Synapse instances so
 * a single Fanoos admin can manage users across several homeservers from one
 * dashboard. Not a multi-user Matrix client — just a stash of admin API
 * tokens used exclusively by AdminPanel's user-management surface.
 *
 * Credentials live in localStorage on this browser only. Access tokens never
 * leave the client; adding a server logs in *once* to obtain a token, verifies
 * the admin flag, then persists.
 */

export const STORAGE_KEY = "fanoos_admin_servers";

export interface AdminServer {
    id: string;
    label: string;
    homeserverUrl: string;
    adminMxid: string;
    accessToken: string;
    addedAt: number;
    /** True when the account has admin flag on the target Synapse.
     *  Non-admin entries can still be added — they get a Teams-only view
     *  (User Management sub-tab is hidden). */
    isAdmin?: boolean;
}

// ─── Read / write ────────────────────────────────────────────────────────────

export function readAll(): AdminServer[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function writeAll(servers: AdminServer[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}

export function find(id: string): AdminServer | undefined {
    return readAll().find((s) => s.id === id);
}

export function upsert(s: AdminServer): void {
    const all = readAll();
    const idx = all.findIndex((x) => x.id === s.id);
    if (idx >= 0) all[idx] = s;
    else all.push(s);
    writeAll(all);
}

export function remove(id: string): void {
    writeAll(readAll().filter((s) => s.id !== id));
}

// ─── Homeserver discovery ────────────────────────────────────────────────────

export function inferHomeserver(mxid: string): string {
    const m = mxid.match(/^@[^:]+:(.+)$/);
    return m ? `https://${m[1]}` : "";
}

// ─── Add flow: login + admin-flag check ─────────────────────────────────────

interface LoginResponse {
    access_token: string;
    user_id: string;
    device_id: string;
}

/**
 * Register a Synapse instance for admin management. Steps:
 *   1. POST /_matrix/client/v3/login with (mxid, password) on the target homeserver.
 *   2. GET /_synapse/admin/v2/users/{mxid} with the returned token, require admin: true.
 * On success, persist { id, label, homeserverUrl, adminMxid, accessToken } and return it.
 * Throws on login failure or non-admin caller.
 */
export async function addAdminServer(input: {
    label: string;
    mxid: string;
    password: string;
    homeserver?: string;
}): Promise<AdminServer> {
    const mxid = input.mxid.trim();
    const password = input.password;
    if (!mxid || !password) throw new Error("mxid and password required");
    const homeserverUrl = (input.homeserver && input.homeserver.trim()) || inferHomeserver(mxid);
    if (!homeserverUrl) throw new Error("Cannot infer homeserver from mxid");
    const localpart = mxid.replace(/^@/, "").split(":")[0];

    // 1) login
    const loginResp = await fetch(`${homeserverUrl.replace(/\/$/, "")}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            type: "m.login.password",
            identifier: { type: "m.id.user", user: localpart },
            password,
            initial_device_display_name: "Fanoos admin panel",
        }),
    });
    if (!loginResp.ok) {
        let msg = `login failed (HTTP ${loginResp.status})`;
        try {
            const body = (await loginResp.json()) as { error?: string; errcode?: string };
            if (body.error) msg = `${body.errcode ?? loginResp.status}: ${body.error}`;
        } catch {
            /* ignore */
        }
        throw new Error(msg);
    }
    const login = (await loginResp.json()) as LoginResponse;

    // 2) Best-effort admin flag check. Non-admins are still accepted;
    //    they get a Teams-only view without User Management.
    let isAdmin = false;
    try {
        const adminResp = await fetch(
            `${homeserverUrl.replace(/\/$/, "")}/_synapse/admin/v2/users/${encodeURIComponent(login.user_id)}`,
            { headers: { Authorization: `Bearer ${login.access_token}` } },
        );
        if (adminResp.ok) {
            const adminBody = (await adminResp.json()) as { admin?: boolean };
            isAdmin = !!adminBody.admin;
        }
    } catch {
        /* treat as non-admin */
    }

    const server: AdminServer = {
        id: `srv-${Date.now()}`,
        label: input.label.trim() || homeserverUrl.replace(/^https?:\/\//, ""),
        homeserverUrl,
        adminMxid: login.user_id,
        accessToken: login.access_token,
        addedAt: Date.now(),
        isAdmin,
    };
    upsert(server);
    return server;
}
