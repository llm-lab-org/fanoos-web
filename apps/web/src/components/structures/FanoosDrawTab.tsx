/*
Copyright 2026 LLM-LAB (Fanoos fork)
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
*/

import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import { _t, getUserLanguage } from "../../languageHandler";
import { uploadFile } from "../../ContentMessages";

const STORAGE_KEY = "fanoos_drawing_v1";
const MY_DRAWING_ROOM_NAME = "MyDrawing";

/**
 * Maps an Element Web / browser locale code to an Excalidraw langCode.
 * Excalidraw uses codes like "ar-SA", "fa-IR", "he-IL", "zh-CN", "en", etc.
 * Falls back to "en" for anything not in the table.
 */
function toExcalidrawLang(appLang: string): string {
    const lang = appLang.toLowerCase().split(/[-_]/)[0];
    const region = appLang.split(/[-_]/)[1]?.toUpperCase();

    const map: Record<string, string> = {
        ar: "ar-SA",
        az: "az-AZ",
        bg: "bg-BG",
        bn: "bn-BD",
        ca: "ca-ES",
        cs: "cs-CZ",
        da: "da-DK",
        de: "de-DE",
        el: "el-GR",
        en: "en",
        es: "es-ES",
        eu: "eu-ES",
        fa: "fa-IR",
        fi: "fi-FI",
        fr: "fr-FR",
        gl: "gl-ES",
        he: "he-IL",
        hi: "hi-IN",
        hu: "hu-HU",
        id: "id-ID",
        it: "it-IT",
        ja: "ja-JP",
        kk: "kk-KZ",
        km: "km-KH",
        ko: "ko-KR",
        lt: "lt-LT",
        lv: "lv-LV",
        mr: "mr-IN",
        my: "my-MM",
        nb: "nb-NO",
        nl: "nl-NL",
        nn: "nn-NO",
        pa: "pa-IN",
        pl: "pl-PL",
        pt: region === "PT" ? "pt-PT" : "pt-BR",
        ro: "ro-RO",
        ru: "ru-RU",
        si: "si-LK",
        sk: "sk-SK",
        sl: "sl-SI",
        sv: "sv-SE",
        ta: "ta-IN",
        th: "th-TH",
        tr: "tr-TR",
        uk: "uk-UA",
        vi: "vi-VN",
        zh: region === "TW" ? "zh-TW" : region === "HK" ? "zh-HK" : "zh-CN",
    };

    return map[lang] ?? "en";
}

export function loadDrawing(): { elements: any[]; appState: Record<string, any> } | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as { elements: any[]; appState: Record<string, any> };
    } catch {
        return null;
    }
}

export async function exportDrawingAsPng(): Promise<Blob | null> {
    const data = loadDrawing();
    if (!data || !data.elements.length) return null;
    const { exportToBlob } = await import("@excalidraw/excalidraw");
    return exportToBlob({ elements: data.elements, appState: data.appState, files: null });
}

/** Find an existing room named `name` or create it; returns the roomId. */
async function findOrCreateRoom(client: MatrixClient, name: string): Promise<string> {
    const existing = client.getRooms().find((r) => r.name === name);
    if (existing) return existing.roomId;
    const result = await client.createRoom({ name, preset: "private_chat" as any });
    return result.room_id;
}

interface ExcalidrawWrapperProps {
    excalidrawAPI: (api: any) => void;
    initialData: any;
    theme: "light" | "dark";
    langCode: string;
    onChange?: (elements: readonly any[], appState: any, files: any) => void;
}

/**
 * Lazy wrapper that co-imports Excalidraw + MainMenu in a single chunk.
 * Renders Excalidraw with a curated MainMenu: core tools + Export + Help,
 * but no external social links (GitHub, YouTube, Discord, etc.).
 * Excalidraw's own langCode prop handles all internal menu translations.
 */
const ExcalidrawWithMenu = lazy(async () => {
    const { Excalidraw, MainMenu } = await import("@excalidraw/excalidraw");
    const D = MainMenu.DefaultItems;

    const Wrapper = ({
        excalidrawAPI,
        initialData,
        theme,
        langCode,
        onChange,
    }: ExcalidrawWrapperProps): React.ReactElement => (
        <Excalidraw
            excalidrawAPI={excalidrawAPI}
            initialData={initialData}
            theme={theme}
            langCode={langCode}
            onChange={onChange}
            UIOptions={{ canvasActions: { saveToActiveFile: false } }}
        >
            <MainMenu>
                <D.LoadScene />
                <MainMenu.Separator />
                <D.Export />
                <MainMenu.Separator />
                <D.ClearCanvas />
                <D.ToggleTheme />
                <D.ChangeCanvasBackground />
                <MainMenu.Separator />
                <D.Help />
            </MainMenu>
        </Excalidraw>
    );
    Wrapper.displayName = "ExcalidrawWithMenu";
    return { default: Wrapper };
});

interface Props {
    isDayMode: boolean;
    client: MatrixClient;
}

export const FanoosDrawTab = ({ isDayMode, client }: Props): React.ReactElement => {
    const savedData = loadDrawing();
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showDialog, setShowDialog] = useState(false);
    const [filename, setFilename] = useState("drawing");
    const apiRef = useRef<any>(null);
    const filenameInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const autoSaveTimer = useRef<number>(0);
    const [langCode, setLangCode] = useState(() => toExcalidrawLang(getUserLanguage()));

    // Auto-save drawing to localStorage on every change (debounced).
    // Persist cleared state too, otherwise send-drawing re-sends the pre-clear content.
    const handleChange = useCallback((elements: readonly any[], appState: any) => {
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = window.setTimeout(() => {
            const live = elements.filter((el) => !el.isDeleted);
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ elements: live, appState: { ...appState, collaborators: [] } }),
            );
        }, 800);
    }, []);

    useEffect(() => () => clearTimeout(autoSaveTimer.current), []);

    // Re-sync Excalidraw language if the app language changes while the tab is open
    useEffect(() => {
        const onStorage = (e: StorageEvent): void => {
            if (e.key === "mx_local_settings") {
                setLangCode(toExcalidrawLang(getUserLanguage()));
            }
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    // Focus the filename input when dialog opens
    useEffect(() => {
        if (showDialog) {
            setTimeout(() => filenameInputRef.current?.select(), 50);
        }
    }, [showDialog]);

    // Make Excalidraw's properties panel collapsible
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let collapsed = false;

        const setup = (): void => {
            const island = canvas.querySelector<HTMLElement>(".selected-shape-actions .Island");
            if (!island || island.querySelector(".fanoos-collapse-toggle")) return;

            const btn = document.createElement("button");
            btn.className = "fanoos-collapse-toggle";
            btn.setAttribute("aria-label", "Toggle properties panel");
            btn.type = "button";
            btn.innerHTML =
                '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M2 10l6-6 6 6" stroke="currentColor" stroke-width="2" ' +
                'fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

            if (collapsed) island.classList.add("fanoos-panel-collapsed");

            btn.addEventListener("click", (e: MouseEvent) => {
                collapsed = !collapsed;
                island.classList.toggle("fanoos-panel-collapsed", collapsed);
                e.stopPropagation();
            });

            island.prepend(btn);
        };

        setup();
        const observer = new MutationObserver(setup);
        observer.observe(canvas, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, []);

    const handleSaveConfirm = useCallback(async () => {
        if (!apiRef.current) return;
        setShowDialog(false);

        const name = filename.trim() || "drawing";
        const elements = apiRef.current.getSceneElements();
        const appState = apiRef.current.getAppState();
        const files = apiRef.current.getFiles();

        // Save to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ elements, appState: { ...appState, collaborators: [] } }));

        setSaving(true);
        try {
            const { exportToBlob, exportToSvg } = await import("@excalidraw/excalidraw");

            // Export PNG and SVG in parallel
            const [pngBlob, svgEl] = await Promise.all([
                exportToBlob({ elements, appState, files }),
                exportToSvg({ elements, appState, files }),
            ]);

            const svgString = new XMLSerializer().serializeToString(svgEl);
            const svgBlob = new Blob([svgString], { type: "image/svg+xml" });

            const roomId = await findOrCreateRoom(client, MY_DRAWING_ROOM_NAME);

            // Upload PNG and SVG in parallel
            const [pngResult, svgResult] = await Promise.all([
                uploadFile(client, roomId, new File([pngBlob], `${name}.png`, { type: "image/png" })),
                uploadFile(client, roomId, new File([svgBlob], `${name}.svg`, { type: "image/svg+xml" })),
            ]);

            await Promise.all([
                client.sendMessage(roomId, {
                    msgtype: "m.image",
                    body: `${name}.png`,
                    url: pngResult.url,
                    file: pngResult.file,
                    info: { mimetype: "image/png", size: pngBlob.size },
                } as any),
                client.sendMessage(roomId, {
                    msgtype: "m.file",
                    body: `${name}.svg`,
                    url: svgResult.url,
                    file: svgResult.file,
                    info: { mimetype: "image/svg+xml", size: svgBlob.size },
                } as any),
            ]);
        } catch (err) {
            console.error("Failed to send drawing to MyDrawing room:", err);
        } finally {
            setSaving(false);
        }

        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }, [client, filename]);

    const day = isDayMode;

    return (
        <div className={`mx_FanoosDashboard_drawTab${day ? " day" : ""}`}>
            <div className={`mx_FanoosDashboard_drawToolbar${day ? " day" : ""}`}>
                <span className={`mx_FanoosDashboard_drawToolbarTitle${day ? " day" : ""}`}>
                    {_t("fanoos_dashboard|draw_title")}
                </span>
                <button
                    className={`mx_FanoosDashboard_drawSaveBtn${day ? " day" : ""}${saved ? " saved" : ""}${saving ? " saving" : ""}`}
                    onClick={() => setShowDialog(true)}
                    disabled={saving}
                >
                    {saving
                        ? _t("fanoos_dashboard|draw_saving")
                        : saved
                          ? _t("fanoos_dashboard|draw_saved")
                          : _t("fanoos_dashboard|draw_save")}
                </button>
            </div>

            {/* Filename dialog */}
            {showDialog && (
                <div className={`mx_FanoosDashboard_drawDialog${day ? " day" : ""}`}>
                    <div className={`mx_FanoosDashboard_drawDialogBox${day ? " day" : ""}`}>
                        <label className={`mx_FanoosDashboard_drawDialogLabel${day ? " day" : ""}`}>
                            {_t("fanoos_dashboard|draw_filename_label")}
                        </label>
                        <input
                            ref={filenameInputRef}
                            className={`mx_FanoosDashboard_drawDialogInput${day ? " day" : ""}`}
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            placeholder={_t("fanoos_dashboard|draw_filename_ph")}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void handleSaveConfirm();
                                if (e.key === "Escape") setShowDialog(false);
                            }}
                        />
                        <div className="mx_FanoosDashboard_drawDialogActions">
                            <button
                                className={`mx_FanoosDashboard_drawDialogConfirm${day ? " day" : ""}`}
                                onClick={() => void handleSaveConfirm()}
                            >
                                {_t("fanoos_dashboard|draw_confirm")}
                            </button>
                            <button
                                className={`mx_FanoosDashboard_drawDialogCancel${day ? " day" : ""}`}
                                onClick={() => setShowDialog(false)}
                            >
                                {_t("fanoos_dashboard|draw_cancel")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="mx_FanoosDashboard_drawCanvas" ref={canvasRef}>
                <Suspense
                    fallback={
                        <div className={`mx_FanoosDashboard_drawLoading${day ? " day" : ""}`}>
                            {_t("fanoos_dashboard|draw_loading")}
                        </div>
                    }
                >
                    <ExcalidrawWithMenu
                        key={langCode}
                        excalidrawAPI={(api: any) => {
                            apiRef.current = api;
                        }}
                        initialData={savedData ?? undefined}
                        theme={day ? "light" : "dark"}
                        langCode={langCode}
                        onChange={handleChange}
                    />
                </Suspense>
            </div>
        </div>
    );
};
