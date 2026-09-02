/*
Copyright 2026 Fanoos / LLM Lab

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
*/

import React, { useCallback, useEffect, useState } from "react";

import { useMatrixClientContext } from "../../../contexts/MatrixClientContext";
import { SettingsSubsection } from "./shared/SettingsSubsection";

// Account-data event type. Same blob used by the admin panel; unknown fields
// are preserved on save so nothing gets clobbered.
const PROFILE_TYPE = "im.llm-lab.profile";

// Homeservers whose Synapse is Fanoos-configured to surface these fields.
// Users on any other server never see this subsection — the profile blob
// wouldn't be read anywhere on those servers.
function isFanoosServer(userId: string | null | undefined): boolean {
    if (!userId) return false;
    const domain = userId.split(":")[1] ?? "";
    return domain === "llm-lab.org" || domain.endsWith(".llm-lab.org");
}

interface FanoosProfile {
    email?: string;
    github?: string;
    huggingface?: string;
    phone_number?: string;
    whatsapp_number?: string;
    [key: string]: unknown;
}

const IcoMail: React.FC = () => (
    <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
        <path d="M2 4l6 4.5L14 4" />
    </svg>
);
const IcoGithub: React.FC = () => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path
            fillRule="evenodd"
            d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
        />
    </svg>
);
const IcoHuggingFace: React.FC = () => (
    <span
        aria-hidden="true"
        style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 14,
            height: 14,
            fontSize: 12,
            lineHeight: 1,
        }}
    >
        🤗
    </span>
);
const IcoPhone: React.FC = () => (
    <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M3.5 2.5h2l1 3-1.5 1a8 8 0 0 0 4.5 4.5l1-1.5 3 1v2A1.5 1.5 0 0 1 12 14 10 10 0 0 1 2 4a1.5 1.5 0 0 1 1.5-1.5Z" />
    </svg>
);
const IcoWhatsApp: React.FC = () => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M8.02 1.5A6.48 6.48 0 0 0 2.34 11.2L1.5 14.5l3.4-.83a6.48 6.48 0 1 0 3.12-12.17Zm0 11.86a5.34 5.34 0 0 1-2.72-.75l-.2-.12-2.02.5.51-1.96-.13-.2a5.35 5.35 0 1 1 4.56 2.53Zm3.03-3.96c-.16-.08-.98-.48-1.13-.54-.15-.06-.26-.08-.37.08-.11.16-.42.54-.52.65-.1.11-.19.12-.35.04a4.4 4.4 0 0 1-2.16-1.88c-.16-.28.16-.26.46-.87.05-.11.03-.2-.01-.28-.04-.08-.37-.88-.5-1.2-.13-.32-.27-.28-.37-.28h-.31c-.11 0-.28.04-.43.2-.15.16-.57.55-.57 1.35s.58 1.56.66 1.67c.08.11 1.14 1.74 2.76 2.44 1.02.44 1.42.48 1.93.4.31-.05.98-.4 1.11-.79.14-.39.14-.72.1-.79-.04-.07-.15-.11-.31-.19Z" />
    </svg>
);

type FieldKey = "email" | "phone_number" | "whatsapp_number" | "github" | "huggingface";

interface FieldSpec {
    key: FieldKey;
    label: string;
    placeholder: string;
    type?: string;
    icon: React.FC;
}

const FIELDS: FieldSpec[] = [
    { key: "email", label: "Email", placeholder: "you@example.com", type: "email", icon: IcoMail },
    { key: "phone_number", label: "Phone", placeholder: "+974 …", type: "tel", icon: IcoPhone },
    { key: "whatsapp_number", label: "WhatsApp", placeholder: "+974 …", type: "tel", icon: IcoWhatsApp },
    { key: "github", label: "GitHub", placeholder: "github username", icon: IcoGithub },
    { key: "huggingface", label: "Hugging Face", placeholder: "huggingface username", icon: IcoHuggingFace },
];

// Custom account_data types aren't in matrix-js-sdk's typed AccountDataEvents
// map, so hit the CS API directly. The user's own token authorises reads/writes
// to their own account_data — no impersonation needed here.
async function fetchOwnProfile(baseUrl: string, token: string, userId: string): Promise<FanoosProfile> {
    try {
        const r = await fetch(
            `${baseUrl}/_matrix/client/v3/user/${encodeURIComponent(userId)}/account_data/${PROFILE_TYPE}`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!r.ok) return {};
        return (await r.json()) as FanoosProfile;
    } catch {
        return {};
    }
}

async function saveOwnProfile(baseUrl: string, token: string, userId: string, body: FanoosProfile): Promise<boolean> {
    try {
        const r = await fetch(
            `${baseUrl}/_matrix/client/v3/user/${encodeURIComponent(userId)}/account_data/${PROFILE_TYPE}`,
            {
                method: "PUT",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify(body),
            },
        );
        return r.ok;
    } catch {
        return false;
    }
}

export const FanoosProfileSettings: React.FC = () => {
    const client = useMatrixClientContext();
    const baseUrl = client.getHomeserverUrl();
    const token = client.getAccessToken() ?? "";
    const userId = client.getUserId() ?? "";
    const supported = isFanoosServer(userId);
    const [values, setValues] = useState<Record<FieldKey, string>>({
        email: "",
        phone_number: "",
        whatsapp_number: "",
        github: "",
        huggingface: "",
    });
    // Preserve unknown keys we didn't render so save() doesn't clobber them.
    const [existing, setExisting] = useState<FanoosProfile>({});
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

    useEffect(() => {
        if (!supported || !baseUrl || !token || !userId) return;
        void fetchOwnProfile(baseUrl, token, userId).then((content) => {
            setExisting(content);
            setValues({
                email: (content.email as string) ?? "",
                phone_number: (content.phone_number as string) ?? "",
                whatsapp_number: (content.whatsapp_number as string) ?? "",
                github: (content.github as string) ?? "",
                huggingface: (content.huggingface as string) ?? "",
            });
        });
    }, [supported, baseUrl, token, userId]);

    const onChangeField = useCallback((key: FieldKey, v: string) => {
        setValues((prev) => ({ ...prev, [key]: v }));
        setStatus("idle");
    }, []);

    const onSave = useCallback(async () => {
        if (!baseUrl || !token || !userId) {
            setStatus("error");
            return;
        }
        setStatus("saving");
        const merged: FanoosProfile = { ...existing };
        for (const f of FIELDS) {
            const trimmed = values[f.key].trim();
            if (trimmed) merged[f.key] = trimmed;
            else delete merged[f.key];
        }
        const ok = await saveOwnProfile(baseUrl, token, userId, merged);
        if (ok) {
            setExisting(merged);
            setStatus("saved");
        } else {
            setStatus("error");
        }
    }, [baseUrl, token, userId, existing, values]);

    // Rules of Hooks: early return must come AFTER every hook call above.
    if (!supported) return null;

    return (
        <SettingsSubsection heading="Fanoos profile" stretchContent>
            <div className="mx_FanoosProfileSettings">
                {FIELDS.map((f) => {
                    const Icon = f.icon;
                    return (
                        <label key={f.key} className="mx_FanoosProfileSettings_row">
                            <span className="mx_FanoosProfileSettings_icon" title={f.label}>
                                <Icon />
                            </span>
                            <input
                                className="mx_FanoosProfileSettings_input"
                                type={f.type ?? "text"}
                                dir="ltr"
                                placeholder={f.placeholder}
                                value={values[f.key]}
                                onChange={(e) => onChangeField(f.key, e.target.value)}
                                aria-label={f.label}
                            />
                        </label>
                    );
                })}
                <div className="mx_FanoosProfileSettings_actions">
                    <button className="mx_FanoosProfileSettings_save" onClick={onSave} disabled={status === "saving"}>
                        {status === "saving" ? "Saving…" : "Save"}
                    </button>
                    {status === "saved" && <span className="mx_FanoosProfileSettings_ok">Saved.</span>}
                    {status === "error" && (
                        <span className="mx_FanoosProfileSettings_err">Could not save. Try again.</span>
                    )}
                </div>
            </div>
        </SettingsSubsection>
    );
};

export default FanoosProfileSettings;
