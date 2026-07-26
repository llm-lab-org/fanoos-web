/*
Copyright 2024 New Vector Ltd.
Copyright 2026 LLM-LAB (Fanoos fork)

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EventType, RelationType, RoomEvent, type MatrixEvent } from "matrix-js-sdk/src/matrix";

import type { ActionPayload } from "../../dispatcher/payloads";
import { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import { RoomNotificationStateStore } from "../../stores/notifications/RoomNotificationStateStore";
import dis from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";
import { useEventEmitter } from "../../hooks/useEventEmitter";
import { _t } from "../../languageHandler";
import UIStore from "../../stores/UIStore";
import { mediaFromMxc } from "../../customisations/Media";
import EmojiPicker from "../views/emojipicker/EmojiPicker";
import { uploadFile } from "../../ContentMessages";
import { CUSTOM_EMOJI_IMAGES } from "../../fanoos/customFlowerEmojis";
import {
    aggregate as aggregateSentimentEmotion,
    classifyTexts,
    EMOTION_EMOJI,
    EMOTION_LABELS,
    type EmotionDist,
    type EmotionLabel,
    type SentimentDist,
    type SentimentLabel,
} from "../../fanoos/sentimentEmotion";
import {
    addAdminServer,
    type AdminServer,
    readAll as readAdminServers,
    remove as removeAdminServer,
} from "../../fanoos/adminServers";
import {
    fetchAuthMedia,
    fetchLatestEventIds,
    fetchRoomMembers,
    fetchRoomMessages,
    fetchServerHierarchy,
    fetchSpaceRooms,
    fetchUnreadCounts,
    joinRoom as joinServerRoom,
    redactEvent,
    type RoomMember,
    type RoomMessage,
    sendReaction,
    sendRoomMedia,
    sendRoomMessage,
    type ServerHierarchy,
    type ServerRoom,
    uploadMedia,
    uploadMediaBlob,
} from "../../fanoos/adminServersRooms";
import { formatTime as formatJalaliTime } from "../../fanoos/jalali";
import { exportDrawingAsPng, FanoosDrawTab } from "./FanoosDrawTab";

/**
 * Loads a media resource with the admin's Bearer token (needed for modern
 * Synapse authenticated media), holds the resulting blob URL in state, and
 * revokes it on unmount. Renders whatever the caller passes as `render`
 * (typically <img>, <audio>, <video>, or an <a>).
 */
type AuthMediaKind = "img" | "audio" | "video" | "file";
function AuthMedia({
    server,
    mxc,
    kind,
    alt,
    filename,
}: {
    server: AdminServer;
    mxc: string;
    kind: AuthMediaKind;
    alt?: string;
    filename?: string;
}): React.ReactElement {
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        let objUrl: string | null = null;
        let cancelled = false;
        void fetchAuthMedia(server, mxc)
            .then((u) => {
                if (cancelled) {
                    URL.revokeObjectURL(u);
                    return;
                }
                objUrl = u;
                setUrl(u);
            })
            .catch((e) => setError(e instanceof Error ? e.message : String(e)));
        return () => {
            cancelled = true;
            if (objUrl) URL.revokeObjectURL(objUrl);
        };
    }, [server, mxc]);
    if (error) return <span className="mx_FanoosDashboard_chMedia">⚠️ {alt ?? filename ?? "media"}</span>;
    if (!url) return <span className="mx_FanoosDashboard_chMedia">⏳</span>;
    if (kind === "img") {
        return (
            <a href={url} target="_blank" rel="noreferrer noopener">
                <img
                    src={url}
                    alt={alt ?? ""}
                    style={{ maxWidth: 260, maxHeight: 260, borderRadius: 8, display: "block" }}
                />
            </a>
        );
    }
    if (kind === "audio") return <audio controls src={url} style={{ maxWidth: 260 }} />;
    if (kind === "video")
        return <video controls src={url} style={{ maxWidth: 260, maxHeight: 260, borderRadius: 8 }} />;
    return (
        <a href={url} target="_blank" rel="noreferrer noopener" download={filename}>
            📎 {filename ?? alt ?? "file"}
        </a>
    );
}

/**
 * Build the tree Teams Dashboard's renderSVG expects, from a fetched
 * ServerHierarchy. Spaces become depth-1 nodes; their child rooms are
 * depth-2 room nodes. Anything not linked to a space goes into a virtual
 * "Other" bucket at depth 1.
 */
function buildTreeFromHierarchy(h: ServerHierarchy, accountLabel: string): TreeNode[] {
    const nodes: TreeNode[] = [{ id: "__root__", name: accountLabel, type: "account", parentId: null }];
    const assignedRoomIds = new Set<string>();

    // Spaces + their children.
    for (const space of h.spaces) {
        nodes.push({
            id: space.roomId,
            name: space.name,
            type: "space",
            parentId: "__root__",
            matrixRoomId: space.roomId,
        });
        const kids = h.spaceChildren[space.roomId] ?? [];
        for (const childId of kids) {
            if (assignedRoomIds.has(childId)) continue;
            const child = h.rooms.find((r) => r.roomId === childId);
            if (!child) continue; // child may be a room we don't see (private / unjoined)
            assignedRoomIds.add(childId);
            nodes.push({
                id: child.roomId,
                name: child.name,
                type: "room",
                parentId: space.roomId,
                matrixRoomId: child.roomId,
            });
        }
    }

    // Orphans — rooms not in any space's children.
    const orphans = h.rooms.filter((r) => !assignedRoomIds.has(r.roomId));
    if (orphans.length) {
        nodes.push({ id: "__other__", name: "Other", type: "virtual", parentId: "__root__" });
        for (const r of orphans) {
            nodes.push({
                id: r.roomId,
                name: r.name,
                type: "room",
                parentId: "__other__",
                matrixRoomId: r.roomId,
            });
        }
    }

    return nodes;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SendWindowState {
    recipients: Array<{ id: string; roomId: string; name: string }>;
    msgText: string;
    pos: { x: number; y: number };
    size: { w: number; h: number };
    minimized: boolean;
    showRecipients: boolean;
    showAnalysis: boolean;
}

interface TreeNode {
    id: string;
    name: string;
    type: "account" | "space" | "virtual" | "room" | "dm";
    parentId: string | null;
    matrixRoomId?: string;
}

interface Segment {
    a1: number;
    a2: number;
    r1: number;
    r2: number;
    depth: number;
    mid: number;
}

interface SentDetail {
    pos: string[];
    neg: string[];
    msgCount: number;
    /** Populated only when the AI model is active. */
    sentiment3?: SentimentDist;
    emotion?: EmotionDist;
    topSentiment?: SentimentLabel;
    topEmotion?: EmotionLabel;
}

type SentimentModel = "keyword" | "ai";

interface HoverInfo {
    nodeId: string;
    clientX: number;
    clientY: number;
}

// ─── Arc constants ─────────────────────────────────────────────────────────────

const ARC_START = Math.PI * (11 / 12);
const ARC_END = Math.PI * (1 / 12);

// ─── Multilingual keyword sets (English + Arabic + Persian) ──────────────────

const POS_WORDS = new Set([
    // English
    "good",
    "great",
    "thanks",
    "thank",
    "yes",
    "done",
    "ok",
    "okay",
    "perfect",
    "nice",
    "awesome",
    "excellent",
    "success",
    "agree",
    "love",
    "happy",
    "well",
    "wonderful",
    "sure",
    "correct",
    "right",
    "approved",
    "ready",
    "completed",
    "finished",
    "achievement",
    "congrats",
    "bravo",
    "solved",
    "fixed",
    "merged",
    "shipped",
    "deployed",
    "works",
    "resolved",
    // Arabic
    "جيد",
    "ممتاز",
    "شكرا",
    "شكراً",
    "نعم",
    "تمام",
    "موافق",
    "رائع",
    "صحيح",
    "أحسنت",
    "مبروك",
    "نجح",
    "نجحت",
    "اكتمل",
    "اكتملت",
    "جاهز",
    "حلو",
    "ممتازة",
    "رائعة",
    "تمت",
    "صح",
    "حسناً",
    "أتممت",
    "أكملت",
    "ممتازة",
    "ناجح",
    "ناجحة",
    "تم",
    "انتهى",
    "انتهت",
    // Persian
    "خوب",
    "عالی",
    "ممنون",
    "بله",
    "باشه",
    "باشد",
    "موافقم",
    "آفرین",
    "درست",
    "درسته",
    "آماده",
    "موفق",
    "موفقیت",
    "تموم",
    "خوبه",
    "عالیه",
    "ممنونم",
    "مرسی",
    "تأیید",
    "تایید",
    "کامل",
    "کامله",
    "قبوله",
    "اوکی",
    "اوکیه",
    "حل شد",
    "انجام شد",
    "آپلود",
    "درسته",
    "بله",
]);

const NEG_WORDS = new Set([
    // English
    "bad",
    "no",
    "not",
    "never",
    "failed",
    "fail",
    "error",
    "issue",
    "problem",
    "bug",
    "wrong",
    "broken",
    "sorry",
    "unfortunately",
    "cant",
    "cannot",
    "blocked",
    "stuck",
    "delayed",
    "late",
    "missing",
    "urgent",
    "alert",
    "trouble",
    "critical",
    "warning",
    "oops",
    "crash",
    "regression",
    "revert",
    "rollback",
    "outage",
    "down",
    "offline",
    "timeout",
    // Arabic
    "سيء",
    "خطأ",
    "خطا",
    "لا",
    "مشكلة",
    "مشكله",
    "خلل",
    "معطل",
    "معطلة",
    "متأخر",
    "متأخرة",
    "عاجل",
    "تحذير",
    "فشل",
    "فشلت",
    "للأسف",
    "آسف",
    "آسفة",
    "عالق",
    "مكسور",
    "تأخير",
    "مفقود",
    "مفقودة",
    "خطر",
    "خطير",
    "عطل",
    "توقف",
    "توقفت",
    // Persian
    "بد",
    "اشتباه",
    "نه",
    "مشکل",
    "باگ",
    "خراب",
    "خرابه",
    "معطل",
    "دیر",
    "فوری",
    "هشدار",
    "شکست",
    "متأسفانه",
    "متاسفانه",
    "گیر",
    "بلوک",
    "ارور",
    "خطا",
    "اضطراری",
    "گم",
    "مفقود",
    "ایراد",
    "کرش",
    "قطع",
    "خاموش",
    "کند",
]);

// ─── Emoji sentiment sets ─────────────────────────────────────────────────────

const POS_EMOJIS = new Set([
    "👍",
    "❤️",
    "❤",
    "😊",
    "🎉",
    "✅",
    "🚀",
    "💪",
    "👏",
    "🥳",
    "😄",
    "😃",
    "🤩",
    "💯",
    "✨",
    "🙏",
    "😍",
    "🌟",
    "🔥",
    "💚",
    "💙",
    "💜",
    "💕",
    "💖",
    "💗",
    "🙌",
    "👌",
    "😀",
    "😁",
    "🥰",
    "😎",
    "🤗",
    "☑️",
    "🟢",
    "⭐",
    "🌈",
    "🎊",
    "🏆",
    "😇",
    "🌺",
]);

const NEG_EMOJIS = new Set([
    "👎",
    "😡",
    "😢",
    "😭",
    "😞",
    "❌",
    "🚫",
    "⚠️",
    "⚠",
    "🛑",
    "😤",
    "😠",
    "😔",
    "💔",
    "🤦",
    "😫",
    "😩",
    "😟",
    "🙁",
    "☹️",
    "😣",
    "😖",
    "😨",
    "😰",
    "😱",
    "🔴",
    "⛔",
    "😵",
    "🤯",
    "💀",
    "🤬",
    "😒",
    "🥺",
    "😥",
    "😓",
    "⁉️",
    "‼️",
    "🆘",
]);

function graphemes(text: string): string[] {
    try {
        return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
    } catch {
        return [...text];
    }
}

const TOKENIZE_RE = /[\s\u060c\u061b\u061f\u06d4،؟!,.;:'"()[\]{}|/\\@#$%^&*+=<>~`]+/u;

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .split(TOKENIZE_RE)
        .filter((t) => t.length > 1);
}

/** Analyse messages in a single pass — returns score + keyword lists. */
function analyzeMessages(
    msgs: { body: string }[],
    reactions: string[] = [],
): { score: number | null; detail: SentDetail } {
    if (!msgs.length && !reactions.length) return { score: null, detail: { pos: [], neg: [], msgCount: 0 } };
    if (!msgs.length) return { score: null, detail: { pos: [], neg: [], msgCount: 0 } };
    let posCount = 0;
    let negCount = 0;
    const posFound = new Set<string>();
    const negFound = new Set<string>();
    for (const m of msgs) {
        for (const t of tokenize(m.body)) {
            if (POS_WORDS.has(t)) {
                posCount++;
                posFound.add(t);
            }
            if (NEG_WORDS.has(t)) {
                negCount++;
                negFound.add(t);
            }
        }
        // Emoji scan in message body (half weight; tracked so they appear in keyword chips)
        for (const g of graphemes(m.body)) {
            if (POS_EMOJIS.has(g)) {
                posCount += 0.5;
                posFound.add(g);
            } else if (NEG_EMOJIS.has(g)) {
                negCount += 0.5;
                negFound.add(g);
            }
        }
    }
    // Reaction emojis (full weight; tracked so they appear in keyword chips)
    for (const r of reactions) {
        if (POS_EMOJIS.has(r)) {
            posCount += 1;
            posFound.add(r);
        } else if (NEG_EMOJIS.has(r)) {
            negCount += 1;
            negFound.add(r);
        } else {
            for (const g of graphemes(r)) {
                if (POS_EMOJIS.has(g)) {
                    posCount += 1;
                    posFound.add(g);
                    break;
                } else if (NEG_EMOJIS.has(g)) {
                    negCount += 1;
                    negFound.add(g);
                    break;
                }
            }
        }
    }
    const total = posCount + negCount;
    const score =
        total === 0 ? 0.5 : Math.max(0.05, Math.min(0.95, 0.5 + (posCount - negCount) / Math.max(total * 1.5, 4)));
    return {
        score,
        detail: { pos: [...posFound].slice(0, 4), neg: [...negFound].slice(0, 4), msgCount: msgs.length },
    };
}

function sentimentColor(score: number | null | undefined, dayMode = false): string {
    if (score === null || score === undefined) return dayMode ? "#94a3b8" : "#334155";
    const t = Math.max(0, Math.min(1, score));
    const hue = t * 120;
    const lit = dayMode ? 42 - Math.sin(t * Math.PI) * 8 : 62 - Math.sin(t * Math.PI) * 12;
    return `hsl(${hue.toFixed(1)},100%,${lit.toFixed(1)}%)`;
}

function sentimentBand(score: number | null | undefined): string {
    if (score === null || score === undefined) return "no-data";
    if (score >= 0.65) return "positive";
    if (score >= 0.35) return "neutral";
    return "negative";
}

function avgChildSentiment(nodeId: string, tree: TreeNode[], sentMap: Record<string, number | null>): number | null {
    const kids = tree.filter((n) => n.parentId === nodeId && n.matrixRoomId);
    const scores = kids.map((k) => sentMap[k.matrixRoomId!]).filter((s) => s !== null && s !== undefined) as number[];
    if (!scores.length) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

function buildTree(client: ReturnType<typeof useMatrixClientContext>): TreeNode[] {
    const userId = client.getUserId() || "Me";
    const root: TreeNode = { id: "__root__", name: userId, type: "account", parentId: null };
    const nodes: TreeNode[] = [root];

    const allRooms = client.getRooms().filter((r) => r.getMyMembership() === "join");
    const spaces = allRooms.filter((r) => r.isSpaceRoom());
    const assignedIds = new Set<string>();

    for (const space of spaces) {
        nodes.push({
            id: space.roomId,
            name: space.name || space.roomId,
            type: "space",
            parentId: "__root__",
            matrixRoomId: space.roomId,
        });
        const childEvs = space.currentState.getStateEvents(EventType.SpaceChild);
        for (const ev of childEvs) {
            const childId = ev.getStateKey();
            if (!childId) continue;
            const childRoom = client.getRoom(childId);
            if (!childRoom || childRoom.getMyMembership() !== "join" || childRoom.isSpaceRoom()) continue;
            if (assignedIds.has(childId)) continue;
            assignedIds.add(childId);
            const isDm =
                childRoom.getDMInviter() !== undefined ||
                (childRoom.getJoinedMemberCount() === 2 && !childRoom.isSpaceRoom());
            nodes.push({
                id: childId,
                name: childRoom.name || childId,
                type: isDm ? "dm" : "room",
                parentId: space.roomId,
                matrixRoomId: childId,
            });
        }
    }

    const ungrouped = allRooms.filter((r) => !r.isSpaceRoom() && !assignedIds.has(r.roomId));
    if (ungrouped.length) {
        nodes.push({ id: "__other__", name: "Other", type: "virtual", parentId: "__root__" });
        for (const r of ungrouped) {
            const isDm = r.getDMInviter() !== undefined || (r.getJoinedMemberCount() === 2 && !r.isSpaceRoom());
            nodes.push({
                id: r.roomId,
                name: r.name || r.roomId,
                type: isDm ? "dm" : "room",
                parentId: "__other__",
                matrixRoomId: r.roomId,
            });
        }
    }
    return nodes;
}

// ─── Layout ────────────────────────────────────────────────────────────────────

function buildSegmentLayout(
    tree: TreeNode[],
    level: number,
    rRoot: number,
    r1In: number,
    r1Out: number,
    r2In: number,
    r2Out: number,
): Map<string, Segment> {
    const layout = new Map<string, Segment>();
    const root = tree.find((n) => !n.parentId);
    if (!root) return layout;
    const totalArc = ARC_START - ARC_END;

    layout.set(root.id, { a1: ARC_END, a2: ARC_START, r1: 0, r2: rRoot, depth: 0, mid: (ARC_START + ARC_END) / 2 });

    const d1 = tree.filter((n) => n.parentId === root.id);
    if (!d1.length) return layout;

    const weights = d1.map((n) => Math.max(1, tree.filter((c) => c.parentId === n.id).length));
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    let a = ARC_END;

    for (let i = 0; i < d1.length; i++) {
        const groupArc = (weights[i] / totalWeight) * totalArc;
        const a1 = a;
        const a2 = a + groupArc;
        const r2d1 = level <= 1 ? r2Out : r1Out;
        layout.set(d1[i].id, { a1, a2, r1: r1In, r2: r2d1, depth: 1, mid: a1 + groupArc / 2 });

        if (level >= 2) {
            const kids = tree.filter((c) => c.parentId === d1[i].id);
            if (kids.length) {
                const N = kids.length;
                const radH = r2Out - r2In;
                const midR = (r2In + r2Out) / 2;
                const arcW = groupArc * midR;
                const cols = Math.max(1, Math.round(Math.sqrt((N * arcW) / Math.max(radH, 1))));
                const rows = Math.ceil(N / cols);
                const arcPerCol = groupArc / cols;
                const radPerRow = radH / rows;
                kids.forEach((kid, j) => {
                    const col = j % cols;
                    const row = Math.floor(j / cols);
                    const ka1 = a1 + col * arcPerCol;
                    const kr1 = r2In + row * radPerRow;
                    layout.set(kid.id, {
                        a1: ka1,
                        a2: ka1 + arcPerCol,
                        r1: kr1,
                        r2: kr1 + radPerRow,
                        depth: 2,
                        mid: ka1 + arcPerCol / 2,
                    });
                });
            }
        }
        a += groupArc;
    }
    return layout;
}

function makeSegPath(cx: number, cy: number, seg: Segment, gapPx = 3): string {
    const { a1, a2, r1, r2 } = seg;
    if (r2 - r1 < 4) return "";
    const midR = (r1 + r2) / 2;
    const angGap = Math.min(gapPx / Math.max(midR, 1), 0.1);
    const ra1 = a1 + angGap;
    const ra2 = a2 - angGap;
    const ri = r1 + (r1 > 1 ? gapPx : 0);
    const ro = r2 - gapPx;
    if (ra2 - ra1 < 0.005 || ro - ri < 2) return "";
    const f = (v: number): string => v.toFixed(2);
    const px = (r: number, a: number): number => cx + r * Math.cos(a);
    const py = (r: number, a: number): number => cy - r * Math.sin(a);
    const large = ra2 - ra1 > Math.PI ? 1 : 0;
    if (ri <= 1) {
        return [
            `M ${f(px(ro, ra1))} ${f(py(ro, ra1))}`,
            `A ${f(ro)} ${f(ro)} 0 ${large} 0 ${f(px(ro, ra2))} ${f(py(ro, ra2))}`,
            `L ${f(cx)} ${f(cy)}`,
            "Z",
        ].join(" ");
    }
    return [
        `M ${f(px(ri, ra1))} ${f(py(ri, ra1))}`,
        `L ${f(px(ro, ra1))} ${f(py(ro, ra1))}`,
        `A ${f(ro)} ${f(ro)} 0 ${large} 0 ${f(px(ro, ra2))} ${f(py(ro, ra2))}`,
        `L ${f(px(ri, ra2))} ${f(py(ri, ra2))}`,
        `A ${f(ri)} ${f(ri)} 0 ${large} 1 ${f(px(ri, ra1))} ${f(py(ri, ra1))}`,
        "Z",
    ].join(" ");
}

// ─── SVG renderer ─────────────────────────────────────────────────────────────

function renderSVG(
    tree: TreeNode[],
    unread: Record<string, number>,
    sentiment: Record<string, number | null>,
    sentDetail: Record<string, SentDetail>,
    searchQuery: string,
    searchIdx: number,
    level: number,
    showNames: boolean,
    W: number,
    H: number,
    activeRoomId: string | null,
    selectedIds: Set<string>,
    isDayMode: boolean,
): {
    svg: string;
    layout: Map<string, Segment>;
    dims: { W: number; H: number; CX: number; CY: number };
    hits: string[];
} {
    const CX = W / 2;
    const CY = H - 4;
    const rMax = Math.min(CY - 20, W / 2 - 14);
    const rRoot = Math.max(12, Math.min(24, rMax * 0.052));
    const gRing = Math.max(5, Math.floor(rMax * 0.014));

    let r1In: number;
    let r1Out: number;
    let r2In: number;
    let r2Out: number;
    if (level <= 1) {
        r1In = rRoot + 8;
        r1Out = rMax;
        r2In = rMax;
        r2Out = rMax;
    } else {
        const area = rMax - rRoot - 8;
        r1In = rRoot + 8;
        r1Out = r1In + Math.max(42, Math.floor(area * 0.28));
        r2In = r1Out + gRing;
        r2Out = rMax;
    }

    const q = searchQuery.trim().toLowerCase();
    const hits = q ? tree.filter((n) => n.name.toLowerCase().includes(q)).map((n) => n.id) : [];
    const layout = buildSegmentLayout(tree, level, rRoot, r1In, r1Out, r2In, r2Out);
    const dims = { W, H, CX, CY };
    const parts: string[] = [];

    const segBodyColor = isDayMode ? "#e8f0f8" : "#0e1520";
    const segBodyOpacity = isDayMode ? 0.88 : 0.93;
    const guideArcColor = isDayMode ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.04)";
    const guideArcColor2 = isDayMode ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.03)";
    const specularFill = isDayMode ? "rgba(255,255,255,0.50)" : "rgba(255,255,255,0.06)";

    parts.push(`<defs>
      <filter id="tdGlowSeg" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="tdGlowMd" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="tdGlowEnv" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="tdDropShadow">
        <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="rgba(0,0,0,0.35)"/>
      </filter>
    </defs>`);

    if (!isDayMode) {
        parts.push(`<rect width="${W}" height="${H}" fill="#0a1628"/>`);
    }

    const guideArc = (r: number): string => {
        const x1 = (CX + r * Math.cos(ARC_END)).toFixed(1);
        const y1 = (CY - r * Math.sin(ARC_END)).toFixed(1);
        const x2 = (CX + r * Math.cos(ARC_START)).toFixed(1);
        const y2 = (CY - r * Math.sin(ARC_START)).toFixed(1);
        return `M ${x1} ${y1} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 0 ${x2} ${y2}`;
    };
    if (level >= 2 && r1Out < r2Out) {
        parts.push(`<path d="${guideArc(r1Out)}" fill="none" stroke="${guideArcColor2}" stroke-width="1"/>`);
    }
    parts.push(`<path d="${guideArc(rMax)}" fill="none" stroke="${guideArcColor}" stroke-width="1"/>`);

    // Glow pass
    layout.forEach((seg, id) => {
        if (seg.depth === 0) return;
        const n = tree.find((x) => x.id === id);
        if (!n || (hits.length > 0 && !hits.includes(id))) return;
        const score =
            seg.depth === 1
                ? avgChildSentiment(id, tree, sentiment)
                : n.matrixRoomId
                  ? sentiment[n.matrixRoomId]
                  : null;
        const color = n.type === "space" || n.type === "virtual" ? "#6366f1" : sentimentColor(score, isDayMode);
        const glowPath = makeSegPath(CX, CY, { ...seg, r1: Math.max(0, seg.r1 - 4), r2: seg.r2 + 4 }, 0);
        if (glowPath) {
            parts.push(
                `<path d="${glowPath}" fill="${color}" opacity="${isDayMode ? 0.06 : 0.1}" filter="url(#tdGlowSeg)" pointer-events="none"/>`,
            );
        }
    });

    const envParts: string[] = [];

    // Segment pass
    layout.forEach((seg, id) => {
        const n = tree.find((x) => x.id === id);
        if (!n) return;

        if (seg.depth === 0) {
            const pc = "#6366f1";
            parts.push(`<g data-nodeid="${id}" cursor="context-menu" title="Send to all">`);
            parts.push(
                `<circle cx="${CX.toFixed(1)}" cy="${CY.toFixed(1)}" r="${(rRoot + 12).toFixed(1)}" fill="${pc}" opacity="0.12" filter="url(#tdGlowMd)"/>`,
            );
            parts.push(
                `<circle cx="${CX.toFixed(1)}" cy="${CY.toFixed(1)}" r="${rRoot.toFixed(1)}" fill="${pc}" opacity="0.88"/>`,
            );
            parts.push(
                `<circle cx="${CX.toFixed(1)}" cy="${(CY - rRoot * 0.3).toFixed(1)}" r="${(rRoot * 0.38).toFixed(1)}" fill="white" opacity="0.25"/>`,
            );
            if (showNames) {
                const tColor = isDayMode ? "rgba(30,41,59,0.55)" : "rgba(255,255,255,0.28)";
                parts.push(
                    `<text x="${CX.toFixed(1)}" y="${(CY + rRoot + 11).toFixed(1)}" text-anchor="middle" fill="${tColor}" font-size="9" font-family="system-ui,sans-serif" pointer-events="none">${escHtml(n.name)}</text>`,
                );
            }
            parts.push(`</g>`);
            return;
        }

        const score =
            seg.depth === 1
                ? avgChildSentiment(n.id, tree, sentiment)
                : n.matrixRoomId
                  ? sentiment[n.matrixRoomId]
                  : null;
        const un = n.matrixRoomId ? unread[n.matrixRoomId] || 0 : 0;
        const dim = hits.length > 0 && !hits.includes(id);
        const isHit = hits.includes(id);
        const isFocused = searchIdx >= 0 && hits[searchIdx] === id;
        const isActive = !!n.matrixRoomId && n.matrixRoomId === activeRoomId;
        const isVirtual = n.type === "space" || n.type === "virtual";
        const color = sentimentColor(score, isDayMode);
        const gapPx = seg.depth === 1 ? 4 : 2.5;
        const path = makeSegPath(CX, CY, seg, gapPx);
        if (!path) return;

        const safeId = id.replace(/[^a-zA-Z0-9]/g, "_");
        parts.push("<g>");
        parts.push(`<path d="${path}" fill="${segBodyColor}" opacity="${dim ? 0.4 : segBodyOpacity}"/>`);

        const lightOp = dim ? 0.04 : isVirtual ? (isDayMode ? 0.22 : 0.3) : isDayMode ? 0.2 : 0.28;
        if ((isActive || un > 0) && !dim) {
            parts.push(`<path d="${path}" fill="${color}" opacity="${lightOp + 0.18}" filter="url(#tdGlowMd)"/>`);
        } else {
            parts.push(`<path d="${path}" fill="${color}" opacity="${lightOp}"/>`);
        }

        if (!dim && seg.r2 - seg.r1 > 28) {
            const sR2 = seg.r2 - gapPx;
            const sR1 = sR2 - Math.max(3, (seg.r2 - seg.r1) * 0.08);
            const specPath = makeSegPath(
                CX,
                CY,
                { a1: seg.a1, a2: seg.a2, r1: sR1, r2: sR2, depth: seg.depth, mid: seg.mid },
                gapPx + 0.5,
            );
            if (specPath) parts.push(`<path d="${specPath}" fill="${specularFill}" pointer-events="none"/>`);
        }

        if (isActive) {
            parts.push(`<path d="${path}" fill="none" stroke="#6366f1" stroke-width="1.8" opacity="0.92"/>`);
        } else if (isFocused) {
            parts.push(`<path d="${path}" fill="${isDayMode ? "rgba(99,102,241,0.12)" : "white"}" opacity="0.14"/>`);
            parts.push(
                `<path d="${path}" fill="none" stroke="${isDayMode ? "#6366f1" : "white"}" stroke-width="2.2" opacity="0.95"/>`,
            );
        } else if (isHit) {
            parts.push(
                `<path d="${path}" fill="none" stroke="${isDayMode ? "#6366f1" : "white"}" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.65"/>`,
            );
        } else {
            parts.push(
                `<path d="${path}" fill="none" stroke="${color}" stroke-width="${seg.depth === 1 ? 0.9 : 0.6}" opacity="${dim ? 0.08 : isDayMode ? 0.45 : 0.32}"/>`,
            );
        }

        if (selectedIds.has(id)) {
            parts.push(`<path d="${path}" fill="rgba(99,102,241,0.18)" opacity="0.9"/>`);
            parts.push(`<path d="${path}" fill="none" stroke="#6366f1" stroke-width="2" opacity="0.9"/>`);
        }

        if (showNames) {
            const midR = (seg.r1 + seg.r2) / 2;
            const arcLen = (seg.a2 - seg.a1) * midR;
            const radH = seg.r2 - seg.r1 - gapPx * 2;
            if (arcLen > 18 && radH > 11) {
                const tx = CX + midR * Math.cos(seg.mid);
                const ty = CY - midR * Math.sin(seg.mid);
                const rotDeg = ((seg.mid - Math.PI / 2) * 180) / Math.PI;
                const fontSize = Math.max(9, Math.min(seg.depth === 1 ? 14 : 12, radH * 0.46));
                const maxChars = Math.max(2, Math.floor(arcLen / (fontSize * 0.63)));
                const label = n.name.length > maxChars ? n.name.slice(0, Math.max(1, maxChars - 1)) + "…" : n.name;
                const tColor = dim
                    ? isDayMode
                        ? "rgba(0,0,0,0.18)"
                        : "rgba(255,255,255,0.12)"
                    : isHit
                      ? isDayMode
                          ? "#1e3a8a"
                          : "white"
                      : isVirtual
                        ? isDayMode
                            ? "rgba(49,46,129,0.92)"
                            : "rgba(199,210,254,0.88)"
                        : isDayMode
                          ? "rgba(15,23,42,0.82)"
                          : "rgba(255,255,255,0.92)";
                parts.push(
                    `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rotDeg.toFixed(1)},${tx.toFixed(1)},${ty.toFixed(1)})" fill="${tColor}" font-size="${fontSize}" font-weight="${isVirtual ? 700 : 500}" font-family="system-ui,sans-serif" pointer-events="none">${escHtml(label)}</text>`,
                );
            }
        }

        // ── Dominant emotion badge (AI mode only) — small emoji near inner edge ─
        const topEmo = n.matrixRoomId ? sentDetail[n.matrixRoomId]?.topEmotion : undefined;
        if (topEmo && !dim && !isVirtual) {
            const emoR = seg.r1 + Math.min(12, (seg.r2 - seg.r1) * 0.28);
            const arcLen = (seg.a2 - seg.a1) * emoR;
            if (arcLen > 14 && seg.r2 - seg.r1 > 22) {
                const ex = CX + emoR * Math.cos(seg.mid);
                const ey = CY - emoR * Math.sin(seg.mid);
                parts.push(
                    `<text x="${ex.toFixed(1)}" y="${ey.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="12" pointer-events="none" opacity="0.95">${EMOTION_EMOJI[topEmo]}</text>`,
                );
            }
        }

        // ── Unread envelope at outer cell border ──────────────────────────────
        if (un > 0 && !dim) {
            const envR = seg.r2 - gapPx;
            if (envR > seg.r1 + gapPx + 6) {
                const ex = CX + envR * Math.cos(seg.mid);
                const ey = CY - envR * Math.sin(seg.mid);
                const ew = 10;
                const eh = 7;
                envParts.push(
                    `<g filter="url(#tdDropShadow)" pointer-events="none">` +
                        `<rect x="${(ex - ew).toFixed(1)}" y="${(ey - eh).toFixed(1)}" width="${(ew * 2).toFixed(1)}" height="${(eh * 2).toFixed(1)}" rx="2.5" fill="white" stroke="rgba(0,0,0,0.15)" stroke-width="0.5"/>` +
                        `<path d="M${(ex - ew).toFixed(1)},${(ey - eh).toFixed(1)} L${ex.toFixed(1)},${(ey + 2).toFixed(1)} L${(ex + ew).toFixed(1)},${(ey - eh).toFixed(1)}" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="1" stroke-linejoin="round"/>` +
                        `</g>`,
                );
                const badge = un > 99 ? "99+" : String(un);
                const br = un > 9 ? 8 : 7;
                envParts.push(
                    `<circle cx="${(ex + ew).toFixed(1)}" cy="${(ey - eh).toFixed(1)}" r="${br}" fill="#ef4444" stroke="white" stroke-width="1" pointer-events="none"/>`,
                );
                envParts.push(
                    `<text x="${(ex + ew).toFixed(1)}" y="${(ey - eh).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="7" font-weight="800" fill="white" pointer-events="none">${badge}</text>`,
                );
            }
        }

        // Transparent hit area
        parts.push(
            `<path d="${path}" id="tdnode-${safeId}" data-nodeid="${id}" fill="transparent" style="cursor:pointer"/>`,
        );
        parts.push("</g>");
    });

    // Envelope overlay — drawn on top of all segments so they're always visible
    if (envParts.length) {
        parts.push(`<g id="tdEnvOverlay">${envParts.join("")}</g>`);
    }

    const svgStr = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block">${parts.join("\n")}</svg>`;
    return { svg: svgStr, layout, dims, hits };
}

function escHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Position helper: open send window near click, on side with more space ────

function computeSendWindowPos(clientX: number, clientY: number): { x: number; y: number } {
    const winW = UIStore.instance.windowWidth;
    const winH = UIStore.instance.windowHeight;
    const SW_W = 340;
    const SW_H = 480;
    const rightSpace = winW - clientX;
    const leftSpace = clientX;
    let x: number;
    if (rightSpace >= SW_W + 24) {
        x = clientX + 20;
    } else if (leftSpace >= SW_W + 24) {
        x = clientX - SW_W - 20;
    } else {
        x = Math.max(0, Math.round((winW - SW_W) / 2));
    }
    const y = Math.max(0, Math.min(Math.round(clientY - SW_H / 2), winH - SW_H - 10));
    return { x: Math.max(0, x), y };
}

// ─── Custom flower body renderer ─────────────────────────────────────────────

/** Render a message body, substituting PUA flower chars with <img> elements */
function renderHtmlBody(html: string): React.ReactElement {
    // Inline-replace any PUA flower chars still present as raw text
    let safeHtml = html;
    for (const [char, src] of Object.entries(CUSTOM_EMOJI_IMAGES)) {
        safeHtml = safeHtml.replaceAll(
            char,
            `<img src="${src}" alt="${char}" class="mx_FanoosDashboard_flowerEmoji" style="width:1.2em;height:1.2em;vertical-align:middle">`,
        );
    }
    return (
        <span
            className="mx_FanoosDashboard_chBody mx_FanoosDashboard_chHtmlBody"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
    );
}

function renderBody(text: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    let current = "";
    let key = 0;
    for (const char of text) {
        const imgSrc = CUSTOM_EMOJI_IMAGES[char];
        if (imgSrc) {
            if (current) {
                parts.push(current);
                current = "";
            }
            parts.push(<img key={key++} src={imgSrc} alt={char} className="mx_FanoosDashboard_flowerEmoji" />);
        } else {
            current += char;
        }
    }
    if (current) parts.push(current);
    return parts;
}

// ─── Interval + age helpers ───────────────────────────────────────────────────

function intervalMs(v: string): number {
    if (v === "24h") return 86_400_000;
    if (v === "7d") return 604_800_000;
    if (v === "30d") return 2_592_000_000;
    return Infinity;
}

function reloadAgeLabel(d: Date): string {
    const secs = Math.floor((Date.now() - d.getTime()) / 1000);
    if (secs < 10) return _t("fanoos_dashboard|just_now");
    if (secs < 60) return _t("fanoos_dashboard|time_secs", { s: secs });
    const mins = Math.floor(secs / 60);
    if (mins < 60) return _t("fanoos_dashboard|time_mins", { m: mins });
    return _t("fanoos_dashboard|time_hours", { h: Math.floor(mins / 60) });
}

// ─── Hover Tooltip ────────────────────────────────────────────────────────────

interface HoverTooltipProps {
    info: HoverInfo;
    tree: TreeNode[];
    sentiment: Record<string, number | null>;
    sentDetail: Record<string, SentDetail>;
    unread: Record<string, number>;
    client: ReturnType<typeof useMatrixClientContext>;
    isDayMode: boolean;
}

const HoverTooltip: React.FC<HoverTooltipProps> = ({
    info,
    tree,
    sentiment,
    sentDetail,
    unread,
    client,
    isDayMode,
}) => {
    const n = tree.find((x) => x.id === info.nodeId);
    if (!n) return null;

    const score =
        n.type === "space" || n.type === "virtual"
            ? avgChildSentiment(n.id, tree, sentiment)
            : n.matrixRoomId
              ? sentiment[n.matrixRoomId]
              : null;
    const pct = score !== null ? Math.round(score * 100) : null;
    const band = sentimentBand(score);
    const color = sentimentColor(score, isDayMode);
    const un = n.matrixRoomId ? unread[n.matrixRoomId] || 0 : 0;
    const det = n.matrixRoomId ? sentDetail[n.matrixRoomId] : null;

    const room = n.matrixRoomId ? client.getRoom(n.matrixRoomId) : null;
    const allMembers = room ? room.getJoinedMembers() : [];
    const memberNames = allMembers.slice(0, 5).map((m) => m.name || m.userId);
    const extra = Math.max(0, allMembers.length - 5);

    const membersLine =
        extra > 0
            ? _t("fanoos_dashboard|members_and_more", { names: memberNames.join(", "), more: extra })
            : memberNames.join(", ");

    const bandLabel: Record<string, string> = {
        "positive": _t("fanoos_dashboard|positive"),
        "neutral": _t("fanoos_dashboard|neutral"),
        "negative": _t("fanoos_dashboard|negative"),
        "no-data": _t("fanoos_dashboard|no_data"),
    };

    const posKws = det?.pos.slice(0, 4) ?? [];
    const negKws = det?.neg.slice(0, 4) ?? [];

    const isRtl = document.documentElement.dir === "rtl";
    const winW = UIStore.instance.windowWidth;
    const TIP_W = 250;
    const tipX = isRtl ? Math.max(0, info.clientX - TIP_W - 14) : Math.min(info.clientX + 14, winW - TIP_W - 4);
    const tipY = Math.max(8, Math.min(info.clientY - 10, UIStore.instance.windowHeight - 200));
    const tipStyle: React.CSSProperties = isRtl ? { right: winW - tipX - TIP_W, top: tipY } : { left: tipX, top: tipY };

    return createPortal(
        <div className={`mx_FanoosDashboard_hoverTip${isDayMode ? " day" : ""}`} style={tipStyle}>
            <div className="mx_FanoosDashboard_htTitle">
                {n.type === "dm" ? "👤" : n.type === "space" ? "⬡" : "💬"} {n.name}
            </div>
            {pct !== null && (
                <div className="mx_FanoosDashboard_htScore" style={{ color }}>
                    <span className="mx_FanoosDashboard_htBand">{bandLabel[band]}</span>
                    <span className="mx_FanoosDashboard_htPct">{pct}%</span>
                    <div className="mx_FanoosDashboard_htBar">
                        <div className="mx_FanoosDashboard_htBarFill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                </div>
            )}
            {det && det.msgCount > 0 && (
                <div className="mx_FanoosDashboard_htMsgCount">
                    {det.msgCount} {_t("fanoos_dashboard|messages_analysed")}
                </div>
            )}
            {(posKws.length > 0 || negKws.length > 0) && (
                <div className="mx_FanoosDashboard_htKeywords">
                    {posKws.length > 0 && (
                        <div className="mx_FanoosDashboard_htKwRow">
                            {posKws.map((w) => (
                                <span key={w} className="mx_FanoosDashboard_htKw pos">
                                    {w}
                                </span>
                            ))}
                        </div>
                    )}
                    {negKws.length > 0 && (
                        <div className="mx_FanoosDashboard_htKwRow">
                            {negKws.map((w) => (
                                <span key={w} className="mx_FanoosDashboard_htKw neg">
                                    {w}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {det?.emotion && (
                <div className="mx_FanoosDashboard_htEmotions">
                    {(Object.entries(det.emotion) as [EmotionLabel, number][])
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([k, v]) => (
                            <span key={k} className="mx_FanoosDashboard_htEmo">
                                <span className="mx_FanoosDashboard_htEmoIcon">{EMOTION_EMOJI[k]}</span>
                                <span className="mx_FanoosDashboard_htEmoLabel">
                                    {_t(`fanoos_dashboard|emotion_${k}`)}
                                </span>
                                <span className="mx_FanoosDashboard_htEmoPct">{Math.round(v * 100)}%</span>
                            </span>
                        ))}
                </div>
            )}
            {un > 0 && (
                <div className="mx_FanoosDashboard_htUnread">{_t("fanoos_dashboard|unread_badge", { count: un })}</div>
            )}
            {allMembers.length > 0 && <div className="mx_FanoosDashboard_htMembers">{membersLine}</div>}
        </div>,
        document.body,
    );
};

// ─── Voice Player ─────────────────────────────────────────────────────────────

function formatVoiceTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

interface VoicePlayerProps {
    url: string;
    durationMs?: number;
    isDayMode: boolean;
}

const VoicePlayer: React.FC<VoicePlayerProps> = ({ url, durationMs, isDayMode }) => {
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [total, setTotal] = useState((durationMs ?? 0) / 1000);
    const audioRef = useRef<HTMLAudioElement>(null);
    const barRef = useRef<HTMLDivElement>(null);

    const toggle = useCallback((): void => {
        const audio = audioRef.current;
        if (!audio) return;
        if (playing) {
            audio.pause();
            setPlaying(false);
        } else {
            void audio.play().then(() => setPlaying(true));
        }
    }, [playing]);

    const seek = useCallback(
        (e: React.MouseEvent<HTMLDivElement>): void => {
            const bar = barRef.current;
            const audio = audioRef.current;
            if (!bar || !audio || !total) return;
            const rect = bar.getBoundingClientRect();
            audio.currentTime = ((e.clientX - rect.left) / rect.width) * total;
        },
        [total],
    );

    return (
        <div className={`mx_FanoosDashboard_voicePlayer${isDayMode ? " day" : ""}`}>
            <audio
                ref={audioRef}
                src={url}
                onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setTotal(e.currentTarget.duration)}
                onEnded={() => {
                    setPlaying(false);
                    setCurrent(0);
                }}
            />
            <button className="mx_FanoosDashboard_vpBtn" onClick={toggle}>
                {playing ? "⏸" : "▶"}
            </button>
            <div ref={barRef} className="mx_FanoosDashboard_vpBar" onClick={seek}>
                <div
                    className="mx_FanoosDashboard_vpFill"
                    style={{ width: `${total > 0 ? (current / total) * 100 : 0}%` }}
                />
            </div>
            <span className="mx_FanoosDashboard_vpTime">
                {formatVoiceTime(current)} / {formatVoiceTime(total)}
            </span>
        </div>
    );
};

// ─── Emoji Picker Portal ───────────────────────────────────────────────────────

interface EmojiPickerPortalProps {
    anchor: { x: number; y: number } | null;
    onChoose: (unicode: string) => boolean;
    onClose: () => void;
}

const EmojiPickerPortal: React.FC<EmojiPickerPortalProps> = ({ anchor, onChoose, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!anchor) return;
        const onDown = (e: MouseEvent): void => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [anchor, onClose]);

    if (!anchor) return null;

    const PICKER_H = 360;
    const top = anchor.y - PICKER_H - 8 < 0 ? anchor.y + 8 : anchor.y - PICKER_H - 8;

    return createPortal(
        <div
            ref={ref}
            className="mx_FanoosDashboard_emojiPickerPortal"
            style={{ position: "fixed", left: anchor.x, top, zIndex: 500 }}
        >
            <EmojiPicker onChoose={onChoose} onFinished={onClose} />
        </div>,
        document.body,
    );
};

// ─── Chat History ─────────────────────────────────────────────────────────────

const HISTORY_PAGE = 30;

interface ChatHistoryProps {
    roomId: string;
    client: ReturnType<typeof useMatrixClientContext>;
    isDayMode: boolean;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ roomId, client, isDayMode }) => {
    const room = client.getRoom(roomId);
    const [events, setEvents] = useState<MatrixEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [canLoadMore, setCanLoadMore] = useState(true);
    const reactionTargetIdRef = useRef<string | null>(null);
    const setReactionTargetId = (v: string | null): void => {
        reactionTargetIdRef.current = v;
    };
    const [reactionTick, setReactionTick] = useState(0);
    const [emojiPickerAnchor, setEmojiPickerAnchor] = useState<{ x: number; y: number } | null>(null);
    const [emojiPickerTargetId, setEmojiPickerTargetId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const topSentinelRef = useRef<HTMLDivElement>(null);
    const didInitRef = useRef(false);
    // Use a ref for loading so IntersectionObserver doesn't recreate on every tick
    const loadingRef = useRef(false);
    const canLoadMoreRef = useRef(true);

    const readEvents = useCallback((): MatrixEvent[] => {
        if (!room) return [];
        return room
            .getLiveTimeline()
            .getEvents()
            .filter((ev) => ev.getType() === "m.room.message" && ev.getContent()?.body);
    }, [room]);

    const refresh = useCallback((): void => {
        setEvents([...readEvents()]);
    }, [readEvents]);

    // Initial load + subscribe to new events
    useEffect(() => {
        refresh();
    }, [refresh]);

    useEventEmitter(room ?? undefined, RoomEvent.Timeline, refresh);
    // Re-render reactions when any timeline event arrives (includes m.reaction)
    useEventEmitter(room ?? undefined, RoomEvent.Timeline, () => setReactionTick((t) => t + 1));

    // Scroll to bottom on first render only
    useEffect(() => {
        if (!didInitRef.current && events.length > 0) {
            didInitRef.current = true;
            bottomRef.current?.scrollIntoView({ behavior: "instant" });
        }
    }, [events]);

    const loadMore = useCallback(async (): Promise<void> => {
        if (!room || loadingRef.current || !canLoadMoreRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        const el = scrollRef.current;
        const prevHeight = el?.scrollHeight ?? 0;
        try {
            const timeline = room.getLiveTimeline();
            const hasMore = await client.paginateEventTimeline(timeline, { backwards: true, limit: HISTORY_PAGE });
            canLoadMoreRef.current = hasMore;
            setCanLoadMore(hasMore);
            // Re-read events after pagination
            const next = room
                .getLiveTimeline()
                .getEvents()
                .filter((ev) => ev.getType() === "m.room.message" && ev.getContent()?.body);
            setEvents([...next]);
            // Preserve scroll position after prepend
            if (el) {
                requestAnimationFrame(() => {
                    el.scrollTop += el.scrollHeight - prevHeight;
                });
            }
        } catch (e) {
            console.error("Failed to paginate:", e);
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [room, client]);

    // IntersectionObserver — stable, uses refs so it never recreates on loading changes
    useEffect(() => {
        const sentinel = topSentinelRef.current;
        if (!sentinel) return;
        const obs = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) void loadMore();
            },
            { root: scrollRef.current, threshold: 0.1 },
        );
        obs.observe(sentinel);
        return () => obs.disconnect();
    }, [loadMore]);

    const myId = client.getUserId();

    if (!room) return <div className="mx_FanoosDashboard_chEmpty">Room not found</div>;

    return (
        <div ref={scrollRef} className={`mx_FanoosDashboard_chatHistory${isDayMode ? " day" : ""}`}>
            {/* Top sentinel — loading indicator */}
            <div ref={topSentinelRef} className="mx_FanoosDashboard_chTop">
                {loading && <div className="mx_FanoosDashboard_chLoading">⏳ Loading…</div>}
                {!loading && !canLoadMore && events.length > 0 && (
                    <div className="mx_FanoosDashboard_chStart">── beginning ──</div>
                )}
            </div>

            {events.map((ev) => {
                const evId = ev.getId() ?? "";
                const isOwn = ev.getSender() === myId;
                const senderName = ev.sender?.name || ev.getSender() || "";
                const body = ev.getContent().body as string;
                const formattedBody = ev.getContent().formatted_body as string | undefined;
                const isHtmlMsg = ev.getContent().format === "org.matrix.custom.html" && !!formattedBody;
                const ts = new Date(ev.getTs());
                const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const msgType = ev.getContent().msgtype;
                const isAudio = msgType === "m.audio";
                const isImage = msgType === "m.image";
                const isMedia = msgType === "m.file" || msgType === "m.video";

                const sendReaction = (emoji: string, closeAll = true): void => {
                    if (closeAll) {
                        setReactionTargetId(null);
                        setEmojiPickerAnchor(null);
                        setEmojiPickerTargetId(null);
                    }
                    void client.sendEvent(roomId, EventType.Reaction, {
                        "m.relates_to": {
                            rel_type: RelationType.Annotation,
                            event_id: evId,
                            key: emoji,
                        },
                    });
                };

                // Get current reactions for this event
                const relations = room
                    ?.getUnfilteredTimelineSet()
                    .relations.getChildEventsForEvent(evId, RelationType.Annotation, EventType.Reaction);
                void reactionTick;
                const reactionGroups =
                    relations?.getSortedAnnotationsByKey()?.filter(([, evSet]) => evSet.size > 0) ?? [];
                const myUserId = client.getUserId();

                const openFullPicker = (e: React.MouseEvent<HTMLButtonElement>): void => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setEmojiPickerAnchor({ x: rect.left, y: rect.top });
                    setEmojiPickerTargetId(evId);
                    setReactionTargetId(null);
                };

                return (
                    <div key={evId} className={`mx_FanoosDashboard_chRow${isOwn ? " own" : ""}`}>
                        {!isOwn && (
                            <div className="mx_FanoosDashboard_chAvatar">{senderName.slice(0, 2).toUpperCase()}</div>
                        )}
                        <div className="mx_FanoosDashboard_chContent">
                            {!isOwn && <div className="mx_FanoosDashboard_chSender">{senderName}</div>}
                            <div className={`mx_FanoosDashboard_chBubbleRow${isOwn ? " own" : ""}`}>
                                <div className={`mx_FanoosDashboard_chBubble${isOwn ? " own" : ""}`} dir="auto">
                                    {isAudio ? (
                                        (() => {
                                            const mxcUrl = ev.getContent().url as string | undefined;
                                            const httpUrl = mxcUrl ? (mediaFromMxc(mxcUrl).srcHttp ?? "") : "";
                                            const durMs = (ev.getContent().info as { duration?: number } | undefined)
                                                ?.duration;
                                            return httpUrl ? (
                                                <VoicePlayer url={httpUrl} durationMs={durMs} isDayMode={isDayMode} />
                                            ) : (
                                                <span className="mx_FanoosDashboard_chMedia">🎵 {body}</span>
                                            );
                                        })()
                                    ) : isImage ? (
                                        (() => {
                                            const mxcUrl = ev.getContent().url as string | undefined;
                                            const httpUrl = mxcUrl ? (mediaFromMxc(mxcUrl).srcHttp ?? "") : "";
                                            return httpUrl ? (
                                                <img src={httpUrl} alt={body} className="mx_FanoosDashboard_chImage" />
                                            ) : (
                                                <span className="mx_FanoosDashboard_chMedia">📎 {body}</span>
                                            );
                                        })()
                                    ) : isMedia ? (
                                        <span className="mx_FanoosDashboard_chMedia">📎 {body}</span>
                                    ) : isHtmlMsg ? (
                                        renderHtmlBody(formattedBody!)
                                    ) : (
                                        <span className="mx_FanoosDashboard_chBody">{renderBody(body)}</span>
                                    )}
                                    <span className="mx_FanoosDashboard_chTime">{timeStr}</span>
                                </div>
                                <button
                                    className="mx_FanoosDashboard_chReactionMore"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={openFullPicker}
                                    title={_t("fanoos_dashboard|add_reaction")}
                                >
                                    ☺
                                </button>
                            </div>

                            {/* Reactions display */}
                            {reactionGroups.length > 0 && (
                                <div className={`mx_FanoosDashboard_chReactions${isOwn ? " own" : ""}`}>
                                    {reactionGroups.map(([emoji, evSet]) => {
                                        const iMine = myUserId
                                            ? [...evSet].some((e) => e.getSender() === myUserId)
                                            : false;
                                        return (
                                            <button
                                                key={emoji}
                                                className={`mx_FanoosDashboard_chReactionChip${iMine ? " mine" : ""}`}
                                                onClick={() => sendReaction(emoji)}
                                                title={`${evSet.size} reaction${evSet.size !== 1 ? "s" : ""}`}
                                            >
                                                {renderBody(emoji)}
                                                <span className="mx_FanoosDashboard_chReactionCount">{evSet.size}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}

            <div ref={bottomRef} />

            {/* Full emoji picker portal for reactions */}
            <EmojiPickerPortal
                anchor={emojiPickerAnchor}
                onChoose={(unicode) => {
                    if (!emojiPickerTargetId) return false;
                    void client.sendEvent(roomId, EventType.Reaction, {
                        "m.relates_to": {
                            rel_type: RelationType.Annotation,
                            event_id: emojiPickerTargetId,
                            key: unicode,
                        },
                    });
                    setEmojiPickerAnchor(null);
                    setEmojiPickerTargetId(null);
                    return true;
                }}
                onClose={() => {
                    setEmojiPickerAnchor(null);
                    setEmojiPickerTargetId(null);
                }}
            />
        </div>
    );
};

// ─── Analysis Panel ────────────────────────────────────────────────────────────

interface AnalysisPanelProps {
    roomId: string;
    tree: TreeNode[];
    sentiment: Record<string, number | null>;
    sentDetail: Record<string, SentDetail>;
    unread: Record<string, number>;
    isDayMode: boolean;
    client: ReturnType<typeof useMatrixClientContext>;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
    roomId,
    tree,
    sentiment,
    sentDetail,
    unread,
    isDayMode,
    client,
}) => {
    const n = tree.find((x) => x.matrixRoomId === roomId);
    if (!n) return null;

    const score = sentiment[roomId] ?? null;
    const det = sentDetail[roomId] ?? { pos: [], neg: [], msgCount: 0 };
    const un = unread[roomId] || 0;
    const pct = score !== null ? Math.round(score * 100) : null;
    const color = sentimentColor(score, isDayMode);
    const band = sentimentBand(score);
    const room = client.getRoom(roomId);
    const members = room ? room.getJoinedMembers().slice(0, 15) : [];
    const bandColors: Record<string, string> = {
        "positive": "#22c55e",
        "neutral": "#eab308",
        "negative": "#ef4444",
        "no-data": isDayMode ? "#94a3b8" : "#475569",
    };

    return (
        <div className={`mx_FanoosDashboard_analysisPanel${isDayMode ? " day" : ""}`}>
            <div className="mx_FanoosDashboard_apHdr">
                <span>{n.type === "dm" ? "👤" : "💬"}</span>
                <span className="mx_FanoosDashboard_apHdrName">{n.name}</span>
                {un > 0 && <span className="mx_FanoosDashboard_apUnread">{un}</span>}
            </div>
            {pct !== null && (
                <div className="mx_FanoosDashboard_apScoreSection">
                    <div className="mx_FanoosDashboard_apBandRow">
                        <span className="mx_FanoosDashboard_apBand" style={{ color: bandColors[band] }}>
                            {band}
                        </span>
                        <span className="mx_FanoosDashboard_apPct" style={{ color }}>
                            {pct}%
                        </span>
                    </div>
                    <div className="mx_FanoosDashboard_apTrack">
                        <div className="mx_FanoosDashboard_apFill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                </div>
            )}
            {det.msgCount > 0 && (
                <div className="mx_FanoosDashboard_apMsgCount">
                    {det.msgCount} {_t("fanoos_dashboard|messages_analysed")}
                </div>
            )}
            {det.pos.length > 0 && (
                <div className="mx_FanoosDashboard_apKwGroup">
                    <span className="mx_FanoosDashboard_apKwLabel pos">{_t("fanoos_dashboard|positive")}</span>
                    <div className="mx_FanoosDashboard_apKws">
                        {det.pos.map((k) => (
                            <span key={k} className="mx_FanoosDashboard_apKw pos">
                                {k}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {det.neg.length > 0 && (
                <div className="mx_FanoosDashboard_apKwGroup">
                    <span className="mx_FanoosDashboard_apKwLabel neg">{_t("fanoos_dashboard|issues")}</span>
                    <div className="mx_FanoosDashboard_apKws">
                        {det.neg.map((k) => (
                            <span key={k} className="mx_FanoosDashboard_apKw neg">
                                {k}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {det.emotion && (
                <div className="mx_FanoosDashboard_apEmotions">
                    <div className="mx_FanoosDashboard_apEmotionsHdr">{_t("fanoos_dashboard|emotions_title")}</div>
                    <div className="mx_FanoosDashboard_apEmotionsList">
                        {EMOTION_LABELS.map((k) => {
                            const v = det.emotion?.[k] ?? 0;
                            const pct = Math.round(v * 100);
                            const isTop = det.topEmotion === k;
                            return (
                                <div
                                    key={k}
                                    className={`mx_FanoosDashboard_apEmoRow${isTop ? " top" : ""}`}
                                    title={`${_t(`fanoos_dashboard|emotion_${k}`)} ${pct}%`}
                                >
                                    <span className="mx_FanoosDashboard_apEmoIcon">{EMOTION_EMOJI[k]}</span>
                                    <span className="mx_FanoosDashboard_apEmoLabel">
                                        {_t(`fanoos_dashboard|emotion_${k}`)}
                                    </span>
                                    <div className="mx_FanoosDashboard_apEmoTrack">
                                        <div
                                            className={`mx_FanoosDashboard_apEmoFill emo_${k}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <span className="mx_FanoosDashboard_apEmoPct">{pct}%</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            {members.length > 0 && (
                <div className="mx_FanoosDashboard_apMembers">
                    <div className="mx_FanoosDashboard_apMembersHdr">{_t("fanoos_dashboard|members")}</div>
                    <div className="mx_FanoosDashboard_apMembersList">
                        {members.map((m) => (
                            <span key={m.userId} className="mx_FanoosDashboard_apMemberChip">
                                <span className="mx_FanoosDashboard_apMemberAv">
                                    {(m.name || "?").slice(0, 2).toUpperCase()}
                                </span>
                                <span className="mx_FanoosDashboard_apMemberName">{m.name || m.userId}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Send Window (unified single/multi-channel compose) ───────────────────────

interface SendWindowProps {
    state: SendWindowState;
    onChange: (s: SendWindowState) => void;
    onClose: () => void;
    client: ReturnType<typeof useMatrixClientContext>;
    isDayMode: boolean;
    tree: TreeNode[];
    unread: Record<string, number>;
    sentiment: Record<string, number | null>;
    sentDetail: Record<string, SentDetail>;
}

const SendWindow: React.FC<SendWindowProps> = ({
    state,
    onChange,
    onClose,
    client,
    isDayMode,
    tree,
    unread,
    sentiment,
    sentDetail,
}) => {
    const [sending, setSending] = useState(false);
    const [recording, setRecording] = useState(false);
    const [recipientSearch, setRecipientSearch] = useState("");
    const [sent, setSent] = useState<string[]>([]);
    const [showEmojiPicker, setShowEmojiPicker] = useState<"emoji" | null>(null);
    const [emojiPickerAnchor, setEmojiPickerAnchor] = useState<{ x: number; y: number } | null>(null);
    const [htmlFlowers, setHtmlFlowers] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const htmlEditorRef = useRef<HTMLDivElement>(null);
    const colorInputRef = useRef<HTMLInputElement>(null);
    const htmlSavedRangeRef = useRef<Range | null>(null);
    const [uploading, setUploading] = useState(false);

    const saveHtmlSelection = (): void => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) htmlSavedRangeRef.current = sel.getRangeAt(0).cloneRange();
    };

    const restoreHtmlSelection = (): void => {
        const range = htmlSavedRangeRef.current;
        if (!range) return;
        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }
    };

    const applyForeColor = (color: string): void => {
        htmlEditorRef.current?.focus();
        restoreHtmlSelection();
        document.execCommand("foreColor", false, color);
    };
    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    const mediaRecRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordStartRef = useRef<number>(0);

    const sendVoiceMessage = useCallback(
        async (blob: Blob, durationMs: number): Promise<void> => {
            setSending(true);
            try {
                const upload = await client.uploadContent(blob, {
                    type: "audio/ogg; codecs=opus",
                    name: "voice-message.ogg",
                });
                const mxcUrl = (upload as { content_uri: string }).content_uri;
                for (const r of stateRef.current.recipients) {
                    await client.sendMessage(r.roomId, {
                        "msgtype": "m.audio" as any,
                        "body": "Voice message",
                        "url": mxcUrl,
                        "info": { mimetype: "audio/ogg; codecs=opus", size: blob.size, duration: durationMs },
                        "org.matrix.msc3245.voice": {},
                    });
                }
            } catch (e) {
                console.error("Failed to send voice message:", e);
            } finally {
                setSending(false);
            }
        },
        [client],
    );

    const toggleRecording = useCallback(async (): Promise<void> => {
        if (recording) {
            mediaRecRef.current?.stop();
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
            audioChunksRef.current = [];
            recordStartRef.current = Date.now();
            mr.ondataavailable = (ev: BlobEvent): void => {
                if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
            };
            mr.onstop = (): void => {
                stream.getTracks().forEach((t) => t.stop());
                const durationMs = Date.now() - recordStartRef.current;
                const blob = new Blob(audioChunksRef.current, { type: "audio/ogg; codecs=opus" });
                void sendVoiceMessage(blob, durationMs);
                setRecording(false);
            };
            mr.start();
            mediaRecRef.current = mr;
            setRecording(true);
        } catch (e) {
            console.error("Microphone access denied:", e);
        }
    }, [recording, sendVoiceMessage]);

    const handleDragStart = useCallback(
        (e: React.MouseEvent<HTMLDivElement>): void => {
            if (e.button !== 0) return;
            e.preventDefault();
            const ox = e.clientX - stateRef.current.pos.x;
            const oy = e.clientY - stateRef.current.pos.y;
            const onMove = (ev: MouseEvent): void => {
                const x = Math.max(
                    0,
                    Math.min(ev.clientX - ox, UIStore.instance.windowWidth - stateRef.current.size.w),
                );
                const y = Math.max(0, Math.min(ev.clientY - oy, UIStore.instance.windowHeight - 40));
                onChange({ ...stateRef.current, pos: { x, y } });
            };
            const onUp = (): void => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        },
        [onChange],
    );

    const handleResizeStart = useCallback(
        (e: React.MouseEvent<HTMLDivElement>): void => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const startW = stateRef.current.size.w;
            const startH = stateRef.current.size.h;
            const onMove = (ev: MouseEvent): void => {
                const w = Math.max(280, startW + ev.clientX - startX);
                const h = Math.max(300, startH + ev.clientY - startY);
                onChange({ ...stateRef.current, size: { w, h } });
            };
            const onUp = (): void => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        },
        [onChange],
    );

    // Replace flower <img data:…> tags with their PUA alt char before sending,
    // because Matrix clients strip data: URLs from img src.
    // Our renderHtmlBody() on the receiving side converts PUA chars back to images.
    const prepareHtmlForSend = (html: string): string =>
        html.replace(/<img[^>]*alt="([\uE000-\uE00F])"[^>]*\/?>/g, (_, ch: string) => ch);

    const send = async (): Promise<void> => {
        const htmlEl = htmlEditorRef.current;
        const textContent = htmlEl?.textContent?.trim() ?? "";
        if (!textContent || sending || !state.recipients.length) return;
        setSending(true);
        const results: string[] = [];
        try {
            for (const r of state.recipients) {
                await client.sendHtmlMessage(
                    r.roomId,
                    htmlEl?.textContent ?? "",
                    prepareHtmlForSend(htmlEl?.innerHTML ?? ""),
                );
                results.push(r.name);
            }
            setSent(results);
            if (htmlEl) htmlEl.innerHTML = "";
            setHtmlFlowers([]);
            onChange({ ...state, msgText: "" });
        } catch (e) {
            console.error("Failed to send:", e);
        } finally {
            setSending(false);
        }
    };

    const insertEmoji = (emoji: string): void => {
        const imgSrc = CUSTOM_EMOJI_IMAGES[emoji];
        const editor = htmlEditorRef.current;
        if (!editor) {
            setShowEmojiPicker(null);
            return;
        }
        editor.focus();
        if (imgSrc) {
            // Restore saved selection (emoji picker stole focus), then use Range API
            restoreHtmlSelection();
            const sel = window.getSelection();
            let range: Range;
            if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
                range = sel.getRangeAt(0);
            } else {
                range = document.createRange();
                range.selectNodeContents(editor);
                range.collapse(false);
            }
            range.deleteContents();
            const img = document.createElement("img");
            img.src = imgSrc;
            img.alt = emoji;
            img.style.width = "1.2em";
            img.style.height = "1.2em";
            img.style.verticalAlign = "middle";
            range.insertNode(img);
            range.setStartAfter(img);
            range.collapse(true);
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }
            setHtmlFlowers((prev) => [...prev, emoji]);
        } else {
            document.execCommand("insertText", false, emoji);
        }
        setShowEmojiPicker(null);
    };

    const sendDrawing = useCallback(async (): Promise<void> => {
        const recipients = stateRef.current.recipients;
        if (!recipients.length) return;
        setUploading(true);
        try {
            const blob = await exportDrawingAsPng();
            if (!blob) return;
            const file = new File([blob], "drawing.png", { type: "image/png" });
            const result = await uploadFile(client, recipients[0].roomId, file);
            const content = {
                msgtype: "m.image",
                body: "drawing.png",
                url: result.url,
                file: result.file,
                info: { mimetype: "image/png", size: blob.size },
            };
            for (const r of recipients) {
                await client.sendMessage(r.roomId, content as any);
            }
        } catch (err) {
            console.error("Drawing send failed:", err);
        } finally {
            setUploading(false);
        }
    }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
        const files = Array.from(e.target.files ?? []);
        if (!files.length || !stateRef.current.recipients.length) return;
        if (e.target) e.target.value = "";
        setUploading(true);
        try {
            for (const file of files) {
                const isImage = file.type.startsWith("image/");
                const result = await uploadFile(client, stateRef.current.recipients[0].roomId, file);
                const msgtype = isImage ? "m.image" : "m.file";
                const content: Record<string, unknown> = {
                    msgtype,
                    body: file.name,
                    url: result.url,
                    file: result.file,
                    info: { mimetype: file.type, size: file.size },
                };
                for (const r of stateRef.current.recipients) {
                    await client.sendMessage(r.roomId, content as any);
                }
            }
        } catch (err) {
            console.error("File upload failed:", err);
        } finally {
            setUploading(false);
        }
    };

    const removeRecipient = (id: string): void => {
        onChange({ ...stateRef.current, recipients: stateRef.current.recipients.filter((r) => r.id !== id) });
    };

    const toggleRecipient = (nodeId: string): void => {
        const n = tree.find((x) => x.id === nodeId);
        if (!n?.matrixRoomId) return;
        const already = stateRef.current.recipients.find((r) => r.id === nodeId);
        if (already) {
            onChange({ ...stateRef.current, recipients: stateRef.current.recipients.filter((r) => r.id !== nodeId) });
        } else {
            onChange({
                ...stateRef.current,
                recipients: [...stateRef.current.recipients, { id: n.id, roomId: n.matrixRoomId!, name: n.name }],
            });
        }
    };

    const toggleAnalysis = useCallback((): void => {
        const next = !stateRef.current.showAnalysis;
        const winW = UIStore.instance.windowWidth;
        const newX = next
            ? Math.max(0, stateRef.current.pos.x - 280)
            : Math.min(winW - 320, stateRef.current.pos.x + 280);
        onChange({
            ...stateRef.current,
            showAnalysis: next,
            showRecipients: false,
            pos: { x: newX, y: stateRef.current.pos.y },
        });
    }, [onChange]);

    const singleRecipient = state.recipients.length === 1 ? state.recipients[0] : null;
    const allRooms = tree.filter((n) => n.matrixRoomId && n.type !== "space" && n.type !== "virtual");
    const q = recipientSearch.trim().toLowerCase();
    const filteredRooms = q ? allRooms.filter((n) => n.name.toLowerCase().includes(q)) : allRooms;
    const firstNode = singleRecipient ? tree.find((n) => n.id === singleRecipient.id) : null;
    const title = singleRecipient
        ? `${firstNode?.type === "dm" ? "👤" : "💬"} ${singleRecipient.name}`
        : `📤 ${_t("fanoos_dashboard|send")} (${state.recipients.length})`;

    const showSidePanel = !state.minimized && (state.showRecipients || (state.showAnalysis && !!singleRecipient));
    // Panel is additive: window grows by panel width so chat area keeps full width
    const effectiveWidth = state.size.w + (showSidePanel ? 220 : 0);

    return (
        <div
            className={`mx_FanoosDashboard_sendWindow${isDayMode ? " day" : ""}${state.minimized ? " minimized" : ""}${showSidePanel ? " withPanel" : ""}${!singleRecipient ? " noHistory" : ""}`}
            style={{
                left: state.pos.x,
                top: state.pos.y,
                width: effectiveWidth,
                height: state.minimized ? undefined : state.size.h,
            }}
        >
            {/* Header / drag handle */}
            <div className="mx_FanoosDashboard_cbHdr" onMouseDown={handleDragStart}>
                <span className="mx_FanoosDashboard_cbDragHandle">⠿</span>
                <span className="mx_FanoosDashboard_cbTitle">{title}</span>
                {singleRecipient && (
                    <button
                        className={`mx_FanoosDashboard_cbCtrl${state.showAnalysis ? " active" : ""}`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={toggleAnalysis}
                        title={_t("fanoos_dashboard|analysis")}
                    >
                        📊
                    </button>
                )}
                <button
                    className={`mx_FanoosDashboard_cbCtrl${state.showRecipients ? " active" : ""}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() =>
                        onChange({
                            ...stateRef.current,
                            showRecipients: !stateRef.current.showRecipients,
                            showAnalysis: false,
                        })
                    }
                    title={_t("fanoos_dashboard|recipients")}
                >
                    👥
                </button>
                <button
                    className="mx_FanoosDashboard_cbCtrl"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => onChange({ ...stateRef.current, minimized: !stateRef.current.minimized })}
                    title={state.minimized ? _t("fanoos_dashboard|expand") : _t("fanoos_dashboard|minimize")}
                >
                    {state.minimized ? "▲" : "▼"}
                </button>
                <button
                    className="mx_FanoosDashboard_cbCtrl"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={onClose}
                    title={_t("fanoos_dashboard|close")}
                >
                    ✕
                </button>
            </div>

            {!state.minimized && (
                <div className={`mx_FanoosDashboard_swBody${showSidePanel ? " withPanel" : ""}`}>
                    {/* Analysis panel (single recipient only) */}
                    {state.showAnalysis && singleRecipient && (
                        <AnalysisPanel
                            roomId={singleRecipient.roomId}
                            tree={tree}
                            sentiment={sentiment}
                            sentDetail={sentDetail}
                            unread={unread}
                            isDayMode={isDayMode}
                            client={client}
                        />
                    )}
                    {/* Recipients panel – search + add/remove rooms */}
                    {state.showRecipients && !state.showAnalysis && (
                        <div className="mx_FanoosDashboard_swRecipientsPanel">
                            <div className="mx_FanoosDashboard_swRpHdr">Recipients</div>
                            <input
                                className="mx_FanoosDashboard_swRpSearch"
                                type="search"
                                placeholder={_t("fanoos_dashboard|search_placeholder")}
                                value={recipientSearch}
                                onChange={(e) => setRecipientSearch(e.target.value)}
                            />
                            <div className="mx_FanoosDashboard_swRpList">
                                {filteredRooms.map((n) => {
                                    const isSelected = state.recipients.some((r) => r.id === n.id);
                                    const un = n.matrixRoomId ? unread[n.matrixRoomId] || 0 : 0;
                                    return (
                                        <div
                                            key={n.id}
                                            className={`mx_FanoosDashboard_swRpRow${isSelected ? " selected" : ""}`}
                                            onClick={() => toggleRecipient(n.id)}
                                        >
                                            <span className="mx_FanoosDashboard_swRpCheck">
                                                {isSelected ? "✓" : "+"}
                                            </span>
                                            <span className="mx_FanoosDashboard_swRpName">
                                                {n.type === "dm" ? "👤" : "💬"} {n.name}
                                            </span>
                                            {un > 0 && <span className="mx_FanoosDashboard_swRpBadge">{un}</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Main column */}
                    <div className="mx_FanoosDashboard_swMain">
                        {/* Recipient chips when multiple */}
                        {state.recipients.length > 1 && (
                            <div className="mx_FanoosDashboard_swChips">
                                {state.recipients.map((r) => (
                                    <span key={r.id} className="mx_FanoosDashboard_swChip">
                                        {r.name}
                                        <button
                                            className="mx_FanoosDashboard_swChipX"
                                            onClick={() => removeRecipient(r.id)}
                                        >
                                            ✕
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}

                        {sent.length > 0 && <div className="mx_FanoosDashboard_swSentBanner">✓ {sent.join(", ")}</div>}

                        {/* Chat history only for single recipient */}
                        {singleRecipient && (
                            <ChatHistory roomId={singleRecipient.roomId} client={client} isDayMode={isDayMode} />
                        )}

                        <div className="mx_FanoosDashboard_cbCompose">
                            {/* HTML toolbar — always visible */}
                            <div className="mx_FanoosDashboard_htmlToolbar">
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => document.execCommand("bold")}
                                    title={_t("fanoos_dashboard|html_bold")}
                                >
                                    <b>B</b>
                                </button>
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => document.execCommand("italic")}
                                    title={_t("fanoos_dashboard|html_italic")}
                                >
                                    <i>I</i>
                                </button>
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => document.execCommand("underline")}
                                    title={_t("fanoos_dashboard|html_underline")}
                                >
                                    <u>U</u>
                                </button>
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => document.execCommand("strikeThrough")}
                                    title={_t("fanoos_dashboard|html_strikethrough")}
                                >
                                    <s>S</s>
                                </button>
                                <span className="mx_FanoosDashboard_htmlToolbarDivider" />
                                <label
                                    className="mx_FanoosDashboard_htmlColorBtn"
                                    title={_t("fanoos_dashboard|html_color")}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        saveHtmlSelection();
                                    }}
                                    onClick={() => colorInputRef.current?.click()}
                                >
                                    <span>A</span>
                                    <input
                                        ref={colorInputRef}
                                        type="color"
                                        defaultValue="#e879f9"
                                        style={{
                                            position: "absolute",
                                            opacity: 0,
                                            width: 0,
                                            height: 0,
                                            pointerEvents: "none",
                                        }}
                                        onChange={(e) => applyForeColor(e.target.value)}
                                    />
                                </label>
                                <span className="mx_FanoosDashboard_htmlToolbarDivider" />
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        const el = htmlEditorRef.current;
                                        if (el) el.dir = "ltr";
                                    }}
                                    title={_t("fanoos_dashboard|html_ltr")}
                                >
                                    ⇒
                                </button>
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        const el = htmlEditorRef.current;
                                        if (el) el.dir = "rtl";
                                    }}
                                    title={_t("fanoos_dashboard|html_rtl")}
                                >
                                    ⇐
                                </button>
                                <span className="mx_FanoosDashboard_htmlToolbarDivider" />
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => document.execCommand("insertUnorderedList")}
                                    title={_t("fanoos_dashboard|html_ul")}
                                >
                                    •≡
                                </button>
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => document.execCommand("insertOrderedList")}
                                    title={_t("fanoos_dashboard|html_ol")}
                                >
                                    1≡
                                </button>
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => document.execCommand("indent")}
                                    title={_t("fanoos_dashboard|html_indent")}
                                >
                                    →
                                </button>
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => document.execCommand("outdent")}
                                    title={_t("fanoos_dashboard|html_outdent")}
                                >
                                    ←
                                </button>
                            </div>

                            {/* HTML editor — always active; Enter = new line, Ctrl+Enter = send */}
                            <div
                                ref={htmlEditorRef}
                                className="mx_FanoosDashboard_cbInput mx_FanoosDashboard_cbHtmlEditor"
                                contentEditable
                                dir="auto"
                                suppressContentEditableWarning
                                onInput={(e) => {
                                    onChange({
                                        ...stateRef.current,
                                        msgText: (e.currentTarget as HTMLDivElement).textContent ?? "",
                                    });
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && e.ctrlKey) {
                                        e.preventDefault();
                                        void send();
                                    }
                                }}
                                data-placeholder={
                                    state.recipients.length > 1
                                        ? _t("fanoos_dashboard|send_to_channels", { count: state.recipients.length })
                                        : _t("fanoos_dashboard|send_placeholder")
                                }
                            />

                            {/* Flower chips row */}
                            {htmlFlowers.length > 0 && (
                                <div className="mx_FanoosDashboard_cbFlowerChips">
                                    {htmlFlowers.map((ch, i) => (
                                        <img
                                            key={i}
                                            src={CUSTOM_EMOJI_IMAGES[ch]}
                                            alt={ch}
                                            className="mx_FanoosDashboard_cbFlowerChip"
                                        />
                                    ))}
                                </div>
                            )}

                            <div className="mx_FanoosDashboard_cbActions">
                                {/* Hidden file input */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                                    style={{ display: "none" }}
                                    onChange={(e) => void handleFileSelect(e)}
                                />
                                <button
                                    className="mx_FanoosDashboard_cbEmojiBtn"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                        if (showEmojiPicker === "emoji") {
                                            setShowEmojiPicker(null);
                                            setEmojiPickerAnchor(null);
                                        } else {
                                            saveHtmlSelection(); // preserve cursor in whichever editor is active
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setEmojiPickerAnchor({ x: rect.left, y: rect.top });
                                            setShowEmojiPicker("emoji");
                                        }
                                    }}
                                    title={_t("fanoos_dashboard|emoji_btn")}
                                >
                                    😊
                                </button>
                                <button
                                    className="mx_FanoosDashboard_cbEmojiBtn"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => fileInputRef.current?.click()}
                                    title={_t("fanoos_dashboard|send_file")}
                                    disabled={uploading}
                                >
                                    📎
                                </button>
                                <button
                                    className="mx_FanoosDashboard_cbEmojiBtn"
                                    onClick={() => void sendDrawing()}
                                    title={_t("fanoos_dashboard|draw_send")}
                                    disabled={uploading || !state.recipients.length}
                                >
                                    <svg
                                        viewBox="0 0 20 20"
                                        width="16"
                                        height="16"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.4"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M10 2.5C6 2.5 2.5 5.7 2.5 9.5c0 2 1 3.7 2.8 4.5.5.2.7.8.4 1.3-.4.8-.2 1.7.7 2 4.5 1.5 9-1.5 9-5.8C15.4 5.7 13 2.5 10 2.5Z" />
                                        <circle cx="7" cy="8.5" r="1" fill="currentColor" stroke="none" />
                                        <circle cx="10" cy="6.5" r="1" fill="currentColor" stroke="none" />
                                        <circle cx="13" cy="8.5" r="1" fill="currentColor" stroke="none" />
                                        <circle cx="12" cy="11.5" r="1" fill="currentColor" stroke="none" />
                                        <path d="M14.5 4.5l2-2" strokeWidth="1.8" />
                                    </svg>
                                </button>
                                <button
                                    className={`mx_FanoosDashboard_cbMic${recording ? " recording" : ""}`}
                                    onClick={() => void toggleRecording()}
                                    title={
                                        recording
                                            ? _t("fanoos_dashboard|stop_recording")
                                            : _t("fanoos_dashboard|record_voice")
                                    }
                                    disabled={sending || uploading}
                                >
                                    🎙
                                </button>
                                <button
                                    className={`mx_FanoosDashboard_cbSend${sending ? " sending" : ""}`}
                                    onClick={() => void send()}
                                    disabled={sending || uploading || !state.recipients.length}
                                >
                                    {state.recipients.length > 1 ? "📢 " : ""}
                                    {_t("fanoos_dashboard|send")}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Full EmojiPicker portal for compose emoji insertion */}
            <EmojiPickerPortal
                anchor={emojiPickerAnchor}
                onChoose={(unicode) => {
                    insertEmoji(unicode);
                    return true;
                }}
                onClose={() => {
                    setShowEmojiPicker(null);
                    setEmojiPickerAnchor(null);
                }}
            />

            {/* Resize grip */}
            {!state.minimized && <div className="mx_FanoosDashboard_swResize" onMouseDown={handleResizeStart} />}
        </div>
    );
};

// ─── Legend Overlay ───────────────────────────────────────────────────────────

interface LegendOverlayProps {
    tree: TreeNode[];
    sentiment: Record<string, number | null>;
    level: number;
    isDayMode: boolean;
}

const LegendOverlay: React.FC<LegendOverlayProps> = ({ tree, sentiment, level, isDayMode }) => {
    const rooms = tree.filter((n) => n.matrixRoomId && n.type !== "space");
    const counts = { positive: 0, neutral: 0, negative: 0, noData: 0 };
    for (const r of rooms) {
        const band = sentimentBand(sentiment[r.matrixRoomId!]);
        if (band === "positive") counts.positive++;
        else if (band === "neutral") counts.neutral++;
        else if (band === "negative") counts.negative++;
        else counts.noData++;
    }

    const items = [
        { label: _t("fanoos_dashboard|positive"), color: sentimentColor(0.8, isDayMode), count: counts.positive },
        { label: _t("fanoos_dashboard|neutral"), color: sentimentColor(0.5, isDayMode), count: counts.neutral },
        { label: _t("fanoos_dashboard|negative"), color: sentimentColor(0.15, isDayMode), count: counts.negative },
        { label: _t("fanoos_dashboard|no_data"), color: isDayMode ? "#94a3b8" : "#475569", count: counts.noData },
    ];

    return (
        <div className={`mx_FanoosDashboard_legendOverlay${isDayMode ? " day" : ""}`}>
            {items.map((it) => (
                <div key={it.label} className="mx_FanoosDashboard_legendRow">
                    <span className="mx_FanoosDashboard_legendDot" style={{ background: it.color }} />
                    <span className="mx_FanoosDashboard_legendLabel">{it.label}</span>
                    <span className="mx_FanoosDashboard_legendCount">{it.count}</span>
                </div>
            ))}
            <div className="mx_FanoosDashboard_legendFooter">
                {_t("fanoos_dashboard|rooms_depth", { count: rooms.length, depth: level })}
            </div>
        </div>
    );
};

// ─── Info Panel ───────────────────────────────────────────────────────────────

interface InfoPanelProps {
    nodeId: string;
    tree: TreeNode[];
    sentiment: Record<string, number | null>;
    sentDetail: Record<string, SentDetail>;
    unread: Record<string, number>;
    onClose: () => void;
    client: ReturnType<typeof useMatrixClientContext>;
    isDayMode: boolean;
}

const InfoPanel: React.FC<InfoPanelProps> = ({
    nodeId,
    tree,
    sentiment,
    sentDetail,
    unread,
    onClose,
    client,
    isDayMode,
}) => {
    const n = tree.find((x) => x.id === nodeId);
    if (!n) return null;

    const score =
        n.type === "space" || n.type === "virtual"
            ? avgChildSentiment(n.id, tree, sentiment)
            : n.matrixRoomId
              ? sentiment[n.matrixRoomId]
              : null;
    const color = sentimentColor(score, isDayMode);
    const band = sentimentBand(score);
    const un = n.matrixRoomId ? unread[n.matrixRoomId] || 0 : 0;
    const d = n.matrixRoomId
        ? sentDetail[n.matrixRoomId] || { pos: [], neg: [], msgCount: 0 }
        : { pos: [], neg: [], msgCount: 0 };
    const scorePct = score !== null ? Math.round(score * 100) : null;
    const bandColors: Record<string, string> = {
        "positive": "#22c55e",
        "neutral": "#eab308",
        "negative": "#ef4444",
        "no-data": isDayMode ? "#94a3b8" : "#475569",
    };
    const childRooms = tree.filter((c) => c.parentId === n.id && c.matrixRoomId);
    const childUnread = childRooms.reduce((s, c) => s + (unread[c.matrixRoomId!] || 0), 0);
    const room = n.matrixRoomId ? client.getRoom(n.matrixRoomId) : null;
    const members = room ? room.getJoinedMembers().slice(0, 20) : [];

    const openRoom = (): void => {
        if (n.matrixRoomId) dis.dispatch({ action: Action.ViewRoom, room_id: n.matrixRoomId });
    };

    const bandLabel: Record<string, string> = {
        "positive": _t("fanoos_dashboard|positive"),
        "neutral": _t("fanoos_dashboard|neutral"),
        "negative": _t("fanoos_dashboard|negative"),
        "no-data": _t("fanoos_dashboard|no_data"),
    };

    return (
        <div className={`mx_FanoosDashboard_infoPanel${isDayMode ? " day" : ""}`}>
            <div className="mx_FanoosDashboard_ipHdr" style={{ borderLeftColor: color }}>
                <span className="mx_FanoosDashboard_ipIcon">
                    {n.type === "dm" ? "👤" : n.type === "space" ? "⬡" : "💬"}
                </span>
                <div className="mx_FanoosDashboard_ipName">{n.name}</div>
                <span
                    className="mx_FanoosDashboard_ipBand"
                    style={{ background: `${bandColors[band]}22`, color: bandColors[band] }}
                >
                    {bandLabel[band]}
                </span>
                <button className="mx_FanoosDashboard_ipClose" onClick={onClose}>
                    ✕
                </button>
            </div>

            {un > 0 && (
                <div className="mx_FanoosDashboard_ipUnread">{_t("fanoos_dashboard|unread_badge", { count: un })}</div>
            )}

            {childRooms.length > 0 && (
                <div className="mx_FanoosDashboard_ipRow">
                    <span>{_t("fanoos_dashboard|channels")}</span>
                    <span>
                        {childRooms.length}
                        {childUnread > 0 ? ` · ${childUnread} unread` : ""}
                    </span>
                </div>
            )}

            {d.msgCount > 0 && (
                <div className="mx_FanoosDashboard_ipRow">
                    <span>{_t("fanoos_dashboard|messages_analysed")}</span>
                    <span>{d.msgCount}</span>
                </div>
            )}

            {scorePct !== null && (
                <div className="mx_FanoosDashboard_ipScoreBar">
                    <div className="mx_FanoosDashboard_ipTrack">
                        <div
                            className="mx_FanoosDashboard_ipFill"
                            style={{ width: `${scorePct}%`, background: color }}
                        />
                    </div>
                    <span className="mx_FanoosDashboard_ipPct" style={{ color }}>
                        {scorePct}%
                    </span>
                </div>
            )}

            {d.pos.length > 0 && (
                <div className="mx_FanoosDashboard_ipSignals">
                    <span className="mx_FanoosDashboard_ipSigLabel pos">{_t("fanoos_dashboard|positive")}</span>
                    {d.pos.map((k) => (
                        <span key={k} className="mx_FanoosDashboard_ipKw pos">
                            {k}
                        </span>
                    ))}
                </div>
            )}

            {d.neg.length > 0 && (
                <div className="mx_FanoosDashboard_ipSignals">
                    <span className="mx_FanoosDashboard_ipSigLabel neg">{_t("fanoos_dashboard|issues")}</span>
                    {d.neg.map((k) => (
                        <span key={k} className="mx_FanoosDashboard_ipKw neg">
                            {k}
                        </span>
                    ))}
                </div>
            )}

            {n.matrixRoomId && <div className="mx_FanoosDashboard_ipRoomId">{n.matrixRoomId}</div>}

            {members.length > 0 && (
                <div className="mx_FanoosDashboard_ipMembers">
                    <div className="mx_FanoosDashboard_ipMembersHdr">{_t("fanoos_dashboard|members")}</div>
                    <div className="mx_FanoosDashboard_ipMembersList">
                        {members.map((m) => (
                            <span key={m.userId} className="mx_FanoosDashboard_ipMemberChip">
                                <span className="mx_FanoosDashboard_ipMemberAv">
                                    {(m.name || "?").slice(0, 2).toUpperCase()}
                                </span>
                                <span className="mx_FanoosDashboard_ipMemberName">{m.name || m.userId}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {n.matrixRoomId && (
                <button className="mx_FanoosDashboard_ipOpenBtn" onClick={openRoom}>
                    {_t("fanoos_dashboard|open_room")}
                </button>
            )}
        </div>
    );
};

// ─── Admin Panel ──────────────────────────────────────────────────────────────

const nodeAvatarColor = (id: string): string => {
    const p = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#22c55e", "#14b8a6", "#3b82f6", "#06b6d4"];
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
    return p[Math.abs(h) % p.length];
};

interface SynapseUser {
    name: string;
    displayname?: string;
    avatar_url?: string;
    deactivated: boolean;
    admin: boolean;
    creation_ts: number;
    last_seen_ts?: number;
}

interface RoomInfo {
    room_id: string;
    name?: string;
    canonical_alias?: string;
    joined_members: number;
    room_type?: string;
}

// ─── Space Outline ────────────────────────────────────────────────────────────
// Three-level hierarchy: Space → Group (room/dm) → Member
// "Main Space" is a virtual bucket for groups with no parent space.

function SpaceOutline({
    client,
    tree,
    isDayMode,
    onRefresh,
}: {
    client: ReturnType<typeof useMatrixClientContext>;
    tree: TreeNode[];
    isDayMode: boolean;
    onRefresh?: () => void;
}): React.ReactElement {
    // ── Core state ─────────────────────────────────────────────────────────
    const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(
        () => new Set([...tree.filter((n) => n.type === "space").map((n) => n.id), "__main__"]),
    );
    const [rootExpanded, setRootExpanded] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [inlineEditId, setInlineEditId] = useState<string | null>(null);
    const [inlineEditName, setInlineEditName] = useState("");
    const [addingTo, setAddingTo] = useState<{ parentId: string | null; isSpace: boolean } | null>(null);
    const [newName, setNewName] = useState("");
    const [dragSrc, setDragSrc] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [rooms, setRooms] = useState<RoomInfo[]>([]);
    const [search, setSearch] = useState("");
    const [dirOverride, setDirOverride] = useState<"ltr" | "rtl">(() => {
        const s = localStorage.getItem("fanoos_outline_dir");
        if (s === "ltr" || s === "rtl") return s;
        return document.documentElement.dir === "rtl" ? "rtl" : "ltr";
    });

    // Float edit window
    const [floatNode, setFloatNode] = useState<TreeNode | null>(null);
    const [floatPos, setFloatPos] = useState({ x: 300, y: 80 });
    const floatNodeDragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
    const [floatName, setFloatName] = useState("");
    const [floatAvatarFile, setFloatAvatarFile] = useState<File | null>(null);
    const [floatAvatarPreview, setFloatAvatarPreview] = useState<string | null>(null);
    const floatAvatarInputRef = useRef<HTMLInputElement>(null);
    const [floatSaving, setFloatSaving] = useState(false);
    const [floatConfirmDelete, setFloatConfirmDelete] = useState(false);
    const [synapseUsers, setSynapseUsers] = useState<SynapseUser[] | null>(null);
    const [floatMemberSearch, setFloatMemberSearch] = useState("");
    const floatMemberInputRef = useRef<HTMLInputElement>(null);
    const [memberBusyIds, setMemberBusyIds] = useState<Set<string>>(new Set());
    const [confirmKickId, setConfirmKickId] = useState<string | null>(null);
    const [floatTopic, setFloatTopic] = useState("");
    const [floatPowerLevels, setFloatPowerLevels] = useState<Record<string, number>>({});

    const token = client.getAccessToken() ?? "";
    const baseUrl = client.getHomeserverUrl();
    const serverDomain = client.getDomain() ?? "";

    // ── Helpers ────────────────────────────────────────────────────────────
    const o = (c: string): string => `mx_FanoosDashboard_adminOutline${c}${isDayMode ? " day" : ""}`;
    const setBusyId = (id: string, on: boolean): void =>
        setBusyIds((prev) => {
            const s = new Set(prev);
            if (on) s.add(id);
            else s.delete(id);
            return s;
        });
    const setMemberBusyId = (id: string, on: boolean): void =>
        setMemberBusyIds((prev) => {
            const s = new Set(prev);
            if (on) s.add(id);
            else s.delete(id);
            return s;
        });

    // ── Derived data ────────────────────────────────────────────────────────
    const spaces = useMemo(() => tree.filter((n) => n.type === "space"), [tree]);
    const groups = useMemo(() => tree.filter((n) => n.type === "room" || n.type === "dm"), [tree]);

    // Map: spaceId | null → groups in that space (null = "Main Space" / orphans)
    const spaceGroups = useMemo<Map<string | null, TreeNode[]>>(() => {
        const map = new Map<string | null, TreeNode[]>();
        map.set(null, []);
        for (const s of spaces) map.set(s.id, []);
        for (const g of groups) {
            const pid = spaces.find((s) => s.id === g.parentId)?.id ?? null;
            (map.get(pid) ?? map.get(null)!).push(g);
        }
        return map;
    }, [spaces, groups]);

    const memberCountMap = useMemo(() => new Map(rooms.map((r) => [r.room_id, r.joined_members])), [rooms]);

    // ── Effects ────────────────────────────────────────────────────────────
    useEffect(() => {
        fetch(`${baseUrl}/_synapse/admin/v1/rooms?limit=500`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((d: { rooms?: RoomInfo[] }) => setRooms(d.rooms ?? []))
            .catch(() => {});
    }, [baseUrl, token, tree]);

    // ── Float window helpers ───────────────────────────────────────────────
    const openFloat = useCallback(
        (node: TreeNode, anchorRect: DOMRect): void => {
            setFloatNode(node);
            setFloatName(node.name);
            setFloatAvatarFile(null);
            setFloatAvatarPreview(null);
            setFloatSaving(false);
            setFloatConfirmDelete(false);
            setFloatMemberSearch("");
            setConfirmKickId(null);
            // Fetch topic
            if (node.matrixRoomId) {
                const topicEv = client.getRoom(node.matrixRoomId)?.currentState.getStateEvents("m.room.topic", "");
                setFloatTopic((topicEv?.getContent?.() as any)?.topic ?? "");
                // Fetch power levels
                const plEv = client.getRoom(node.matrixRoomId)?.currentState.getStateEvents("m.room.power_levels", "");
                const users = (plEv?.getContent?.() as any)?.users ?? {};
                setFloatPowerLevels({ ...users });
            } else {
                setFloatTopic("");
                setFloatPowerLevels({});
            }
            setFloatPos({
                x: Math.max(8, Math.min(anchorRect.right + 12, UIStore.instance.windowWidth - 380)),
                y: Math.max(8, Math.min(anchorRect.top - 24, UIStore.instance.windowHeight - 520)),
            });
            if ((node.type === "room" || node.type === "dm") && synapseUsers === null) {
                fetch(`${baseUrl}/_synapse/admin/v2/users?from=0&limit=500&guests=false`, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                    .then((r) => r.json())
                    .then((d: { users?: SynapseUser[] }) => setSynapseUsers(d.users ?? []))
                    .catch(() => setSynapseUsers([]));
            }
        },
        [baseUrl, client, token, synapseUsers],
    );

    const startFloatNodeDrag = useCallback(
        (e: React.MouseEvent): void => {
            floatNodeDragRef.current = { sx: e.clientX, sy: e.clientY, px: floatPos.x, py: floatPos.y };
            const onMove = (me: MouseEvent): void => {
                if (!floatNodeDragRef.current) return;
                setFloatPos({
                    x: floatNodeDragRef.current.px + (me.clientX - floatNodeDragRef.current.sx),
                    y: floatNodeDragRef.current.py + (me.clientY - floatNodeDragRef.current.sy),
                });
            };
            const onUp = (): void => {
                floatNodeDragRef.current = null;
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        },
        [floatPos],
    );

    // ── API ────────────────────────────────────────────────────────────────
    const renameNode = useCallback(
        async (node: TreeNode, name: string): Promise<void> => {
            if (!node.matrixRoomId || !name.trim()) return;
            setBusyId(node.id, true);
            try {
                await fetch(
                    `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(node.matrixRoomId)}/state/m.room.name`,
                    {
                        method: "PUT",
                        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ name: name.trim() }),
                    },
                );
                onRefresh?.();
            } finally {
                setBusyId(node.id, false);
            }
        },
        [baseUrl, token, onRefresh],
    ); // eslint-disable-line react-hooks/exhaustive-deps

    const uploadNodeAvatar = useCallback(
        async (file: File): Promise<string> => {
            const res = await fetch(`${baseUrl}/_matrix/media/v3/upload`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": file.type },
                body: file,
            });
            return ((await res.json()) as { content_uri: string }).content_uri;
        },
        [baseUrl, token],
    );

    const handleCreate = async (): Promise<void> => {
        if (!newName.trim()) {
            setAddingTo(null);
            return;
        }
        const name = newName.trim();
        const cur = addingTo;
        setAddingTo(null);
        setNewName("");
        setBusyIds((s) => new Set([...s, "__creating__"]));
        try {
            if (cur?.isSpace) {
                await (client as any).createRoom({
                    name,
                    visibility: "private",
                    creation_content: { type: "m.space" },
                });
            } else {
                const result = (await (client as any).createRoom({ name, visibility: "private" })) as {
                    room_id: string;
                };
                if (cur?.parentId) {
                    const spaceNode = tree.find((n) => n.id === cur.parentId);
                    if (spaceNode?.matrixRoomId) {
                        await client.sendStateEvent(
                            spaceNode.matrixRoomId,
                            "m.space.child" as any,
                            { via: [serverDomain], suggested: false, auto_join: false },
                            result.room_id,
                        );
                    }
                }
            }
            onRefresh?.();
        } catch {
            /* ignore */
        } finally {
            setBusyIds((s) => {
                const n = new Set(s);
                n.delete("__creating__");
                return n;
            });
        }
    };

    const handleMove = useCallback(
        async (groupNode: TreeNode, targetSpaceId: string | null): Promise<void> => {
            if (!groupNode.matrixRoomId) return;
            setBusyId(groupNode.id, true);
            try {
                const oldSpace = spaces.find((s) => s.id === groupNode.parentId);
                if (oldSpace?.matrixRoomId) {
                    await client.sendStateEvent(
                        oldSpace.matrixRoomId,
                        "m.space.child" as any,
                        {},
                        groupNode.matrixRoomId,
                    );
                }
                if (targetSpaceId) {
                    const newSpace = spaces.find((s) => s.id === targetSpaceId);
                    if (newSpace?.matrixRoomId) {
                        await client.sendStateEvent(
                            newSpace.matrixRoomId,
                            "m.space.child" as any,
                            { via: [serverDomain], suggested: false, auto_join: false },
                            groupNode.matrixRoomId,
                        );
                    }
                }
                onRefresh?.();
            } finally {
                setBusyId(groupNode.id, false);
            }
        },
        [client, spaces, serverDomain, onRefresh],
    ); // eslint-disable-line react-hooks/exhaustive-deps

    const handleDelete = useCallback(
        async (node: TreeNode): Promise<void> => {
            if (!node.matrixRoomId) return;
            setBusyId(node.id, true);
            try {
                await fetch(`${baseUrl}/_synapse/admin/v2/rooms/${encodeURIComponent(node.matrixRoomId)}`, {
                    method: "DELETE",
                    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ block: false, purge: false }),
                });
                setConfirmDeleteId(null);
                setFloatNode(null);
                setSelectedId(null);
                onRefresh?.();
            } finally {
                setBusyId(node.id, false);
            }
        },
        [baseUrl, token, onRefresh],
    ); // eslint-disable-line react-hooks/exhaustive-deps

    const saveFloat = useCallback(async (): Promise<void> => {
        if (!floatNode) return;
        setFloatSaving(true);
        try {
            const tasks: Promise<void>[] = [];
            if (floatName.trim() && floatName.trim() !== floatNode.name) tasks.push(renameNode(floatNode, floatName));
            if (floatAvatarFile && floatNode.matrixRoomId) {
                tasks.push(
                    (async () => {
                        const mxc = await uploadNodeAvatar(floatAvatarFile);
                        await fetch(
                            `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(floatNode.matrixRoomId!)}/state/m.room.avatar`,
                            {
                                method: "PUT",
                                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                                body: JSON.stringify({ url: mxc }),
                            },
                        );
                        onRefresh?.();
                    })(),
                );
            }
            // Topic
            if (floatTopic !== undefined && floatNode.matrixRoomId) {
                const topicEv = client.getRoom(floatNode.matrixRoomId)?.currentState.getStateEvents("m.room.topic", "");
                const oldTopic = (topicEv?.getContent?.() as any)?.topic ?? "";
                if (floatTopic !== oldTopic) {
                    tasks.push(
                        fetch(
                            `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(floatNode.matrixRoomId)}/state/m.room.topic`,
                            {
                                method: "PUT",
                                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                                body: JSON.stringify({ topic: floatTopic }),
                            },
                        ).then(() => {}),
                    );
                }
            }
            // Power levels
            if (Object.keys(floatPowerLevels).length > 0 && floatNode.matrixRoomId) {
                const plEv = client
                    .getRoom(floatNode.matrixRoomId)
                    ?.currentState.getStateEvents("m.room.power_levels", "");
                const current = plEv?.getContent?.() ?? {};
                const merged = { ...current, users: floatPowerLevels };
                tasks.push(
                    fetch(
                        `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(floatNode.matrixRoomId)}/state/m.room.power_levels`,
                        {
                            method: "PUT",
                            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                            body: JSON.stringify(merged),
                        },
                    ).then(() => {}),
                );
            }
            await Promise.all(tasks);
            setFloatNode(null);
        } finally {
            setFloatSaving(false);
        }
    }, [
        floatNode,
        floatName,
        floatAvatarFile,
        floatTopic,
        floatPowerLevels,
        renameNode,
        uploadNodeAvatar,
        baseUrl,
        token,
        client,
        onRefresh,
    ]);

    const kickMember = useCallback(
        async (roomId: string, userId: string): Promise<void> => {
            setMemberBusyId(userId, true);
            try {
                await fetch(`${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/kick`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ user_id: userId }),
                });
                setConfirmKickId(null);
                onRefresh?.();
            } finally {
                setMemberBusyId(userId, false);
            }
        },
        [baseUrl, token, onRefresh],
    ); // eslint-disable-line react-hooks/exhaustive-deps

    const addToRoom = useCallback(
        async (roomId: string, userId: string): Promise<void> => {
            setMemberBusyId(userId, true);
            try {
                await fetch(`${baseUrl}/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ user_id: userId }),
                });
                setFloatMemberSearch("");
                onRefresh?.();
            } finally {
                setMemberBusyId(userId, false);
            }
        },
        [baseUrl, token, onRefresh],
    ); // eslint-disable-line react-hooks/exhaustive-deps

    const commitInline = useCallback(
        async (nodeId: string, name: string): Promise<void> => {
            setInlineEditId(null);
            const node = tree.find((n) => n.id === nodeId);
            if (node && name.trim() && name.trim() !== node.name) await renameNode(node, name.trim());
        },
        [tree, renameNode],
    );

    // ── Dir toggle ─────────────────────────────────────────────────────────
    const toggleDir = (): void => {
        const next = dirOverride === "ltr" ? "rtl" : "ltr";
        setDirOverride(next);
        localStorage.setItem("fanoos_outline_dir", next);
    };

    // ── Keyboard (Tab/Shift+Tab to indent/outdent groups) ──────────────────
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent): void => {
            if (inlineEditId !== null || addingTo !== null) return;
            if (!selectedId) return;
            const selNode = tree.find((n) => n.id === selectedId);
            if (!selNode || selNode.type === "space") return;
            if (e.key === "Tab") {
                e.preventDefault();
                const curIdx = spaces.findIndex((s) => s.id === selNode.parentId);
                if (e.shiftKey) {
                    void handleMove(selNode, curIdx > 0 ? spaces[curIdx - 1].id : null);
                } else {
                    if (curIdx < spaces.length - 1) void handleMove(selNode, spaces[curIdx + 1].id);
                }
            }
        },
        [inlineEditId, addingTo, selectedId, tree, spaces, handleMove],
    );

    // ── Search helpers ─────────────────────────────────────────────────────
    const sq = search.toLowerCase().trim();
    const nodeMatches = (n: TreeNode): boolean =>
        !sq || n.name.toLowerCase().includes(sq) || (n.matrixRoomId ?? "").toLowerCase().includes(sq);
    const memberMatches = (userId: string, name: string): boolean =>
        !sq || userId.toLowerCase().includes(sq) || name.toLowerCase().includes(sq);

    // sections = [{spaceNode: TreeNode|null, gList: TreeNode[]}]
    type Section = { spaceNode: TreeNode | null; gList: TreeNode[] };
    const sections: Section[] = [];
    const mainGroups = (spaceGroups.get(null) ?? []).filter((g) => {
        if (!sq) return true;
        if (nodeMatches(g)) return true;
        const ms = g.matrixRoomId ? (client.getRoom(g.matrixRoomId)?.getMembersWithMembership("join") ?? []) : [];
        return ms.some((m) => memberMatches(m.userId, m.name));
    });
    for (const space of spaces) {
        const gList = (spaceGroups.get(space.id) ?? []).filter((g) => {
            if (!sq) return true;
            if (nodeMatches(g)) return true;
            const ms = g.matrixRoomId ? (client.getRoom(g.matrixRoomId)?.getMembersWithMembership("join") ?? []) : [];
            return ms.some((m) => memberMatches(m.userId, m.name));
        });
        if (!sq || nodeMatches(space) || gList.length > 0) sections.push({ spaceNode: space, gList });
    }
    if (!sq || mainGroups.length > 0) sections.push({ spaceNode: null, gList: mainGroups });

    // ── Local SVG icons ────────────────────────────────────────────────────
    const IcoPen = (): React.ReactElement => (
        <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M11 2L14 5L5 14H2V11L11 2Z" />
        </svg>
    );
    const IcoBin = (): React.ReactElement => (
        <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <polyline points="2,4 14,4" />
            <path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M3.5 4l.7 9.3A1 1 0 0 0 5.2 14h5.6a1 1 0 0 0 1-.7L12.5 4" />
        </svg>
    );
    const IcoAdd = (): React.ReactElement => (
        <svg
            viewBox="0 0 14 14"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
        >
            <path d="M7 2v10M2 7h10" />
        </svg>
    );
    const IcoOpen = (): React.ReactElement => (
        <svg
            viewBox="0 0 14 14"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M6 2H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8" />
            <path d="M9 1h4v4M13 1L6 8" />
        </svg>
    );
    const IcoChevD = (): React.ReactElement => (
        <svg
            viewBox="0 0 10 6"
            width="9"
            height="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
        >
            <path d="M1 1l4 4 4-4" />
        </svg>
    );
    const IcoChevR = (): React.ReactElement => (
        <svg
            viewBox="0 0 6 10"
            width="9"
            height="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
        >
            <path d="M1 1l4 4-4 4" />
        </svg>
    );
    const IcoCamSm = (): React.ReactElement => (
        <svg
            viewBox="0 0 16 16"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M1 5a1 1 0 0 1 1-1h1.2L4.5 2h7l1.3 2H14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5Z" />
            <circle cx="8" cy="8.5" r="2.5" />
        </svg>
    );

    const AddRow = ({ placeholder }: { placeholder: string }): React.ReactElement => (
        <div className={o("AddRow")}>
            <input
                className={o("InlineInput")}
                dir="auto"
                autoFocus
                placeholder={placeholder}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") void handleCreate();
                    if (e.key === "Escape") setAddingTo(null);
                }}
            />
            <button className={o("AddConfirm")} onClick={() => void handleCreate()} disabled={!newName.trim()}>
                ✓
            </button>
            <button className={o("AddCancel")} onClick={() => setAddingTo(null)}>
                ✕
            </button>
        </div>
    );

    // ── Render ─────────────────────────────────────────────────────────────
    const fMemberQ = floatMemberSearch.toLowerCase().trim();
    const dropdownAnchor = floatNode ? (floatMemberInputRef.current?.getBoundingClientRect() ?? null) : null;

    return (
        <div className={o("Wrap")} dir={dirOverride} tabIndex={0} onKeyDown={handleKeyDown}>
            {/* Confirm delete overlay */}
            {confirmDeleteId &&
                (() => {
                    const node = tree.find((n) => n.id === confirmDeleteId);
                    const isBusy = busyIds.has(confirmDeleteId);
                    return (
                        <div className={`mx_FanoosDashboard_adminConfirmOverlay${isDayMode ? " day" : ""}`}>
                            <div className={`mx_FanoosDashboard_adminConfirmBox${isDayMode ? " day" : ""}`}>
                                <p dir="auto">
                                    {_t("fanoos_dashboard|outline_confirm_delete", {
                                        name: node?.name ?? confirmDeleteId,
                                    })}
                                </p>
                                <button
                                    className={`mx_FanoosDashboard_adminBtnDanger${isDayMode ? " day" : ""}`}
                                    disabled={isBusy}
                                    onClick={() => node && void handleDelete(node)}
                                >
                                    {isBusy ? "…" : _t("fanoos_dashboard|outline_delete")}
                                </button>
                                <button
                                    className={`mx_FanoosDashboard_adminBtnCancel${isDayMode ? " day" : ""}`}
                                    onClick={() => setConfirmDeleteId(null)}
                                >
                                    {_t("fanoos_dashboard|outline_cancel")}
                                </button>
                            </div>
                        </div>
                    );
                })()}

            {/* Toolbar */}
            <div className={o("Toolbar")}>
                <input
                    className={o("ToolSearch")}
                    type="search"
                    placeholder={_t("fanoos_dashboard|outline_search_ph")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <button
                    className={o("ToolDirBtn")}
                    onClick={toggleDir}
                    title={
                        dirOverride === "rtl"
                            ? _t("fanoos_dashboard|outline_switch_ltr")
                            : _t("fanoos_dashboard|outline_switch_rtl")
                    }
                >
                    {dirOverride === "rtl" ? "LTR" : "RTL"} ⇆
                </button>
                <button
                    className={`${o("ToolIconBtn")} add`}
                    title={_t("fanoos_dashboard|outline_new_space")}
                    onClick={() => {
                        setAddingTo({ parentId: null, isSpace: true });
                        setNewName("");
                    }}
                >
                    🏢 <IcoAdd />
                </button>
                <button
                    className={o("ToolIconBtn")}
                    title={_t("fanoos_dashboard|outline_refresh")}
                    onClick={() => onRefresh?.()}
                >
                    ↺
                </button>
            </div>

            {/* Add new space input */}
            {addingTo?.isSpace && <AddRow placeholder={_t("fanoos_dashboard|outline_new_space_ph")} />}

            {/* Three-level tree */}
            <div className={o("Body")}>
                {/* ── Root: My Spaces ── */}
                <div className={o("RootRow")} onClick={() => setRootExpanded((p) => !p)}>
                    <button
                        className={o("Expander")}
                        onClick={(e) => {
                            e.stopPropagation();
                            setRootExpanded((p) => !p);
                        }}
                    >
                        {rootExpanded ? <IcoChevD /> : <IcoChevR />}
                    </button>
                    <span className={o("RootLabel")}>{_t("fanoos_dashboard|outline_my_spaces")}</span>
                    <span className={o("Badge")}>{sections.length}</span>
                </div>
                {rootExpanded &&
                    sections.map(({ spaceNode, gList }) => {
                        const sKey = spaceNode?.id ?? "__main__";
                        const spaceKey = spaceNode?.id ?? "__main__";
                        const isSpaceExpanded = expandedSpaces.has(spaceKey);
                        const isDragTarget = dragOver === sKey;
                        const rawMxc = spaceNode?.matrixRoomId
                            ? (client.getRoom(spaceNode.matrixRoomId)?.getMxcAvatarUrl() ?? null)
                            : null;
                        const spaceAvatar = rawMxc ? (mediaFromMxc(rawMxc).srcHttp ?? null) : null;

                        return (
                            <div
                                key={sKey}
                                className={`${o("Section")}${isDragTarget ? " dragover" : ""}`}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDragOver(sKey);
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (dragSrc) {
                                        const srcNode = tree.find((n) => n.id === dragSrc);
                                        if (srcNode && srcNode.type !== "space")
                                            void handleMove(srcNode, spaceNode?.id ?? null);
                                    }
                                    setDragSrc(null);
                                    setDragOver(null);
                                }}
                                onDragLeave={(e) => {
                                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
                                }}
                            >
                                {/* ── Level 0: Space row ── */}
                                <div
                                    data-row
                                    className={`${o("SpaceRow")}${selectedId === spaceNode?.id ? " selected" : ""}`}
                                    onClick={() =>
                                        setSelectedId((p) => (p === spaceNode?.id ? null : (spaceNode?.id ?? null)))
                                    }
                                >
                                    <button
                                        className={o("Expander")}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedSpaces((p) => {
                                                const s = new Set(p);
                                                if (s.has(spaceKey)) s.delete(spaceKey);
                                                else s.add(spaceKey);
                                                return s;
                                            });
                                        }}
                                    >
                                        {isSpaceExpanded ? <IcoChevD /> : <IcoChevR />}
                                    </button>
                                    <span
                                        className={`${o("NodeAvatar")} space${!spaceNode ? " main" : ""}`}
                                        style={
                                            spaceAvatar
                                                ? undefined
                                                : { background: spaceNode ? nodeAvatarColor(spaceNode.id) : "#6366f1" }
                                        }
                                    >
                                        {spaceAvatar ? (
                                            <img src={spaceAvatar} alt="" />
                                        ) : spaceNode ? (
                                            spaceNode.name.slice(0, 1).toUpperCase()
                                        ) : (
                                            "🏠"
                                        )}
                                    </span>
                                    {inlineEditId === spaceNode?.id ? (
                                        <input
                                            className={o("InlineInput")}
                                            dir="auto"
                                            autoFocus
                                            value={inlineEditName}
                                            onChange={(e) => setInlineEditName(e.target.value)}
                                            onKeyDown={(e) => {
                                                e.stopPropagation();
                                                if (e.key === "Enter") void commitInline(spaceNode!.id, inlineEditName);
                                                if (e.key === "Escape") setInlineEditId(null);
                                            }}
                                            onBlur={() => void commitInline(spaceNode!.id, inlineEditName)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    ) : (
                                        <span
                                            className={o("SpaceName")}
                                            dir="auto"
                                            onDoubleClick={
                                                spaceNode
                                                    ? (e) => {
                                                          e.stopPropagation();
                                                          setInlineEditId(spaceNode.id);
                                                          setInlineEditName(spaceNode.name);
                                                      }
                                                    : undefined
                                            }
                                        >
                                            {spaceNode?.name ?? _t("fanoos_dashboard|outline_main_space")}
                                        </span>
                                    )}
                                    <span className={o("Badge")}>{gList.length}</span>
                                    {busyIds.has(spaceNode?.id ?? "") && <span className={o("Spinner")} />}
                                    <span className={o("RowActions")}>
                                        {spaceNode && (
                                            <button
                                                className={o("ActionBtn")}
                                                title={_t("fanoos_dashboard|outline_edit_space")}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openFloat(
                                                        spaceNode,
                                                        (e.currentTarget as HTMLElement)
                                                            .closest("[data-row]")
                                                            ?.getBoundingClientRect() ??
                                                            (e.currentTarget as HTMLElement).getBoundingClientRect(),
                                                    );
                                                }}
                                            >
                                                <IcoPen />
                                            </button>
                                        )}
                                        <button
                                            className={o("ActionBtn")}
                                            title={_t("fanoos_dashboard|outline_add_group")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setAddingTo({ parentId: spaceNode?.id ?? null, isSpace: false });
                                                setNewName("");
                                                if (!expandedSpaces.has(spaceKey))
                                                    setExpandedSpaces((p) => new Set([...p, spaceKey]));
                                            }}
                                        >
                                            <IcoAdd />
                                        </button>
                                        {spaceNode?.matrixRoomId && (
                                            <button
                                                className={o("ActionBtn")}
                                                title={_t("fanoos_dashboard|outline_open")}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    dis.dispatch({
                                                        action: Action.ViewRoom,
                                                        room_id: spaceNode.matrixRoomId!,
                                                    });
                                                }}
                                            >
                                                <IcoOpen />
                                            </button>
                                        )}
                                        {spaceNode && (
                                            <button
                                                className={`${o("ActionBtn")} danger`}
                                                title={_t("fanoos_dashboard|outline_delete_space")}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setConfirmDeleteId(spaceNode.id);
                                                }}
                                            >
                                                <IcoBin />
                                            </button>
                                        )}
                                    </span>
                                </div>

                                {/* Add group under this space */}
                                {addingTo &&
                                    !addingTo.isSpace &&
                                    addingTo.parentId === (spaceNode?.id ?? null) &&
                                    isSpaceExpanded && (
                                        <div className={o("GroupIndent")}>
                                            <AddRow placeholder={_t("fanoos_dashboard|outline_new_group_ph")} />
                                        </div>
                                    )}

                                {/* ── Level 1: Groups ── */}
                                {isSpaceExpanded && (
                                    <div className={o("GroupIndent")}>
                                        {gList.map((group) => {
                                            const gRawMxc = group.matrixRoomId
                                                ? (client.getRoom(group.matrixRoomId)?.getMxcAvatarUrl() ?? null)
                                                : null;
                                            const gAvatar = gRawMxc ? (mediaFromMxc(gRawMxc).srcHttp ?? null) : null;
                                            const isGExpanded = expandedGroups.has(group.id);
                                            const isGBusy = busyIds.has(group.id);
                                            const members = group.matrixRoomId
                                                ? (client
                                                      .getRoom(group.matrixRoomId)
                                                      ?.getMembersWithMembership("join") ?? [])
                                                : [];
                                            const filtMembers = sq
                                                ? members.filter((m) => memberMatches(m.userId, m.name))
                                                : members;
                                            const mCount =
                                                memberCountMap.get(group.matrixRoomId ?? "") ?? members.length;

                                            return (
                                                <div key={group.id}>
                                                    <div
                                                        data-row
                                                        className={`${o("GroupRow")}${selectedId === group.id ? " selected" : ""}${dragSrc === group.id ? " dragging" : ""}`}
                                                        draggable={!isGBusy}
                                                        onDragStart={(e) => {
                                                            e.stopPropagation();
                                                            setDragSrc(group.id);
                                                            e.dataTransfer.effectAllowed = "move";
                                                        }}
                                                        onDragEnd={() => {
                                                            setDragSrc(null);
                                                            setDragOver(null);
                                                        }}
                                                        onClick={() =>
                                                            setSelectedId((p) => (p === group.id ? null : group.id))
                                                        }
                                                    >
                                                        <span className={o("Grip")}>⠿</span>
                                                        <button
                                                            className={o("Expander")}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setExpandedGroups((p) => {
                                                                    const s = new Set(p);
                                                                    if (s.has(group.id)) s.delete(group.id);
                                                                    else s.add(group.id);
                                                                    return s;
                                                                });
                                                            }}
                                                        >
                                                            {isGExpanded ? <IcoChevD /> : <IcoChevR />}
                                                        </button>
                                                        <span
                                                            className={`${o("NodeAvatar")} group`}
                                                            style={
                                                                gAvatar
                                                                    ? undefined
                                                                    : { background: nodeAvatarColor(group.id) }
                                                            }
                                                        >
                                                            {gAvatar ? (
                                                                <img src={gAvatar} alt="" />
                                                            ) : (
                                                                group.name.slice(0, 1).toUpperCase()
                                                            )}
                                                        </span>
                                                        {inlineEditId === group.id ? (
                                                            <input
                                                                className={o("InlineInput")}
                                                                dir="auto"
                                                                autoFocus
                                                                value={inlineEditName}
                                                                onChange={(e) => setInlineEditName(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    e.stopPropagation();
                                                                    if (e.key === "Enter")
                                                                        void commitInline(group.id, inlineEditName);
                                                                    if (e.key === "Escape") setInlineEditId(null);
                                                                }}
                                                                onBlur={() =>
                                                                    void commitInline(group.id, inlineEditName)
                                                                }
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                        ) : (
                                                            <span
                                                                className={o("GroupName")}
                                                                dir="auto"
                                                                onDoubleClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setInlineEditId(group.id);
                                                                    setInlineEditName(group.name);
                                                                }}
                                                            >
                                                                {group.name}
                                                            </span>
                                                        )}
                                                        <span className={o("Badge")}>{mCount}</span>
                                                        {isGBusy && <span className={o("Spinner")} />}
                                                        {!isGBusy && inlineEditId !== group.id && (
                                                            <span className={o("RowActions")}>
                                                                <button
                                                                    className={o("ActionBtn")}
                                                                    title={_t("fanoos_dashboard|outline_edit_group")}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openFloat(
                                                                            group,
                                                                            (e.currentTarget as HTMLElement)
                                                                                .closest("[data-row]")
                                                                                ?.getBoundingClientRect() ??
                                                                                (
                                                                                    e.currentTarget as HTMLElement
                                                                                ).getBoundingClientRect(),
                                                                        );
                                                                    }}
                                                                >
                                                                    <IcoPen />
                                                                </button>
                                                                {group.matrixRoomId && (
                                                                    <button
                                                                        className={o("ActionBtn")}
                                                                        title={_t("fanoos_dashboard|outline_open")}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            dis.dispatch({
                                                                                action: Action.ViewRoom,
                                                                                room_id: group.matrixRoomId!,
                                                                            });
                                                                        }}
                                                                    >
                                                                        <IcoOpen />
                                                                    </button>
                                                                )}
                                                                <button
                                                                    className={`${o("ActionBtn")} danger`}
                                                                    title={_t("fanoos_dashboard|outline_delete")}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setConfirmDeleteId(group.id);
                                                                    }}
                                                                >
                                                                    <IcoBin />
                                                                </button>
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* ── Level 2: Members ── */}
                                                    {isGExpanded && (
                                                        <div className={o("MemberIndent")}>
                                                            {filtMembers.map((m) => {
                                                                const mxc = (m as any).getMxcAvatarUrl?.() ?? null;
                                                                const msrc = mxc
                                                                    ? (mediaFromMxc(mxc).srcHttp ?? null)
                                                                    : null;
                                                                return (
                                                                    <div key={m.userId} className={o("MemberRow")}>
                                                                        <span
                                                                            className={o("MemberAvatar")}
                                                                            style={
                                                                                msrc
                                                                                    ? undefined
                                                                                    : {
                                                                                          background: nodeAvatarColor(
                                                                                              m.userId,
                                                                                          ),
                                                                                      }
                                                                            }
                                                                        >
                                                                            {msrc ? (
                                                                                <img src={msrc} alt="" />
                                                                            ) : (
                                                                                m.name.slice(0, 1).toUpperCase()
                                                                            )}
                                                                        </span>
                                                                        <span className={o("MemberName")} dir="auto">
                                                                            {m.name}
                                                                        </span>
                                                                        <span className={o("MemberId")} dir="ltr">
                                                                            {m.userId}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                            {filtMembers.length === 0 && (
                                                                <span className={o("EmptyLabel")}>
                                                                    {_t("fanoos_dashboard|outline_no_members")}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {gList.length === 0 && !addingTo && (
                                            <span className={o("EmptyLabel")}>
                                                {sq
                                                    ? _t("fanoos_dashboard|outline_no_matches")
                                                    : _t("fanoos_dashboard|outline_no_groups")}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                {rootExpanded && sections.length === 0 && (
                    <div className={`mx_FanoosDashboard_adminEmpty${isDayMode ? " day" : ""}`}>
                        {_t("fanoos_dashboard|outline_empty")}
                    </div>
                )}
            </div>

            {/* ── Float edit window (portaled) ── */}
            {floatNode &&
                createPortal(
                    <div
                        className={`mx_FanoosDashboard_adminOutlineFloat${isDayMode ? " day" : ""}`}
                        style={{ left: floatPos.x, top: floatPos.y }}
                    >
                        {/* Header / drag handle */}
                        <div
                            className={`mx_FanoosDashboard_adminOutlineFloatHead${isDayMode ? " day" : ""}`}
                            onMouseDown={startFloatNodeDrag}
                        >
                            <span>
                                {floatNode.type === "space"
                                    ? _t("fanoos_dashboard|outline_edit_space_title")
                                    : _t("fanoos_dashboard|outline_edit_group_title")}
                            </span>
                            <button
                                className={`mx_FanoosDashboard_adminFloatClose${isDayMode ? " day" : ""}`}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={() => setFloatNode(null)}
                            >
                                ✕
                            </button>
                        </div>
                        <div className={`mx_FanoosDashboard_adminOutlineFloatBody${isDayMode ? " day" : ""}`}>
                            {/* Avatar */}
                            {(() => {
                                const fn = floatNode;
                                const rawM = fn.matrixRoomId
                                    ? (client.getRoom(fn.matrixRoomId)?.getMxcAvatarUrl() ?? null)
                                    : null;
                                const avatarSrc = rawM ? (mediaFromMxc(rawM).srcHttp ?? null) : null;
                                const isGroup = fn.type === "room" || fn.type === "dm";
                                const members =
                                    isGroup && fn.matrixRoomId
                                        ? (client.getRoom(fn.matrixRoomId)?.getMembersWithMembership("join") ?? [])
                                        : [];
                                return (
                                    <>
                                        <div
                                            className={`mx_FanoosDashboard_adminFloatAvatarRow${isDayMode ? " day" : ""}`}
                                        >
                                            <div
                                                className={`mx_FanoosDashboard_adminFormAvatarWrap${isDayMode ? " day" : ""}`}
                                                style={
                                                    floatAvatarPreview || avatarSrc
                                                        ? undefined
                                                        : { background: nodeAvatarColor(fn.id) }
                                                }
                                                onClick={() => floatAvatarInputRef.current?.click()}
                                            >
                                                {floatAvatarPreview || avatarSrc ? (
                                                    <img
                                                        src={floatAvatarPreview ?? avatarSrc!}
                                                        alt=""
                                                        className={`mx_FanoosDashboard_adminFormAvatarImg${isDayMode ? " day" : ""}`}
                                                    />
                                                ) : (
                                                    <span>{fn.name.slice(0, 1).toUpperCase()}</span>
                                                )}
                                                <div
                                                    className={`mx_FanoosDashboard_adminFormAvatarOverlay${isDayMode ? " day" : ""}`}
                                                >
                                                    <IcoCamSm />
                                                </div>
                                                <input
                                                    ref={floatAvatarInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    style={{ display: "none" }}
                                                    onChange={(e) => {
                                                        const f = e.target.files?.[0];
                                                        if (f) {
                                                            setFloatAvatarFile(f);
                                                            setFloatAvatarPreview(URL.createObjectURL(f));
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div
                                                className={`mx_FanoosDashboard_adminFloatUserInfo${isDayMode ? " day" : ""}`}
                                            >
                                                <span
                                                    className={`mx_FanoosDashboard_adminFloatUserDn${isDayMode ? " day" : ""}`}
                                                    dir="auto"
                                                >
                                                    {fn.name}
                                                </span>
                                                <span
                                                    className={`mx_FanoosDashboard_adminFloatUserId${isDayMode ? " day" : ""}`}
                                                    dir="ltr"
                                                >
                                                    {fn.matrixRoomId ?? fn.id}
                                                </span>
                                            </div>
                                        </div>
                                        <input
                                            className={`mx_FanoosDashboard_adminEditInput${isDayMode ? " day" : ""}`}
                                            placeholder={_t("fanoos_dashboard|outline_display_name_ph")}
                                            dir="auto"
                                            value={floatName}
                                            onChange={(e) => setFloatName(e.target.value)}
                                        />
                                        <input
                                            className={`mx_FanoosDashboard_adminEditInput${isDayMode ? " day" : ""}`}
                                            placeholder={_t("fanoos_dashboard|outline_topic_ph")}
                                            dir="auto"
                                            value={floatTopic}
                                            onChange={(e) => setFloatTopic(e.target.value)}
                                        />
                                        <div className={`mx_FanoosDashboard_adminFormBtns${isDayMode ? " day" : ""}`}>
                                            <button
                                                className={`mx_FanoosDashboard_adminBtnSave${isDayMode ? " day" : ""}`}
                                                disabled={floatSaving}
                                                onClick={() => void saveFloat()}
                                            >
                                                {floatSaving ? "…" : _t("fanoos_dashboard|outline_save")}
                                            </button>
                                            <button
                                                className={`mx_FanoosDashboard_adminBtnCancel${isDayMode ? " day" : ""}`}
                                                onClick={() => setFloatNode(null)}
                                            >
                                                {_t("fanoos_dashboard|outline_cancel")}
                                            </button>
                                        </div>

                                        {/* Members section — groups only */}
                                        {isGroup && fn.matrixRoomId && (
                                            <div
                                                className={`mx_FanoosDashboard_adminFloatSection${isDayMode ? " day" : ""}`}
                                            >
                                                <div
                                                    className={`mx_FanoosDashboard_adminFloatSectionHead${isDayMode ? " day" : ""}`}
                                                >
                                                    <span
                                                        className={`mx_FanoosDashboard_adminFloatSectionTitle${isDayMode ? " day" : ""}`}
                                                    >
                                                        {_t("fanoos_dashboard|outline_members")}
                                                    </span>
                                                    <span
                                                        className={`mx_FanoosDashboard_adminFloatSectionCount${isDayMode ? " day" : ""}`}
                                                    >
                                                        {members.length}
                                                    </span>
                                                </div>
                                                <div
                                                    className={`mx_FanoosDashboard_adminOutlineFloatMembers${isDayMode ? " day" : ""}`}
                                                >
                                                    {members.map((m) => {
                                                        const mxc = (m as any).getMxcAvatarUrl?.() ?? null;
                                                        const msrc = mxc ? (mediaFromMxc(mxc).srcHttp ?? null) : null;
                                                        const isKickBusy = memberBusyIds.has(m.userId);
                                                        const isPendingKick = confirmKickId === m.userId;
                                                        return (
                                                            <div
                                                                key={m.userId}
                                                                className={`mx_FanoosDashboard_adminOutlineFloatMember${isDayMode ? " day" : ""}${isPendingKick ? " confirming" : ""}`}
                                                            >
                                                                <span
                                                                    className={`mx_FanoosDashboard_adminOutlineFloatMemberAvatar${isDayMode ? " day" : ""}`}
                                                                    style={
                                                                        msrc
                                                                            ? undefined
                                                                            : { background: nodeAvatarColor(m.userId) }
                                                                    }
                                                                >
                                                                    {msrc ? (
                                                                        <img src={msrc} alt="" />
                                                                    ) : (
                                                                        m.name.slice(0, 1).toUpperCase()
                                                                    )}
                                                                </span>
                                                                <span
                                                                    className={`mx_FanoosDashboard_adminOutlineFloatMemberName${isDayMode ? " day" : ""}`}
                                                                    dir="auto"
                                                                >
                                                                    {m.name}
                                                                </span>
                                                                {!isPendingKick && !isKickBusy && (
                                                                    <select
                                                                        className={`mx_FanoosDashboard_adminOutlineFloatPLSelect${isDayMode ? " day" : ""}`}
                                                                        value={floatPowerLevels[m.userId] ?? 0}
                                                                        onChange={(e) =>
                                                                            setFloatPowerLevels((p) => ({
                                                                                ...p,
                                                                                [m.userId]: Number(e.target.value),
                                                                            }))
                                                                        }
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <option value={0}>
                                                                            {_t("fanoos_dashboard|outline_pl_user")}
                                                                        </option>
                                                                        <option value={50}>
                                                                            {_t("fanoos_dashboard|outline_pl_mod")}
                                                                        </option>
                                                                        <option value={100}>
                                                                            {_t("fanoos_dashboard|outline_pl_admin")}
                                                                        </option>
                                                                    </select>
                                                                )}
                                                                {isPendingKick ? (
                                                                    <span
                                                                        className={`mx_FanoosDashboard_adminOutlineFloatMemberConfirm${isDayMode ? " day" : ""}`}
                                                                    >
                                                                        <button
                                                                            className={`mx_FanoosDashboard_adminFloatRoomConfirmBtn${isDayMode ? " day" : ""} yes`}
                                                                            onClick={() =>
                                                                                void kickMember(
                                                                                    fn.matrixRoomId!,
                                                                                    m.userId,
                                                                                )
                                                                            }
                                                                        >
                                                                            {_t("fanoos_dashboard|outline_remove")}
                                                                        </button>
                                                                        <button
                                                                            className={`mx_FanoosDashboard_adminFloatRoomConfirmBtn${isDayMode ? " day" : ""}`}
                                                                            onClick={() => setConfirmKickId(null)}
                                                                        >
                                                                            {_t("fanoos_dashboard|outline_cancel")}
                                                                        </button>
                                                                    </span>
                                                                ) : isKickBusy ? (
                                                                    <span
                                                                        className={`mx_FanoosDashboard_adminFloatChipSpinner${isDayMode ? " day" : ""}`}
                                                                    />
                                                                ) : (
                                                                    <button
                                                                        className={`mx_FanoosDashboard_adminOutlineFloatMemberBtn${isDayMode ? " day" : ""}`}
                                                                        title={_t(
                                                                            "fanoos_dashboard|outline_remove_from_group",
                                                                        )}
                                                                        onClick={() => setConfirmKickId(m.userId)}
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    {members.length === 0 && (
                                                        <span
                                                            className={`mx_FanoosDashboard_adminFloatEmpty${isDayMode ? " day" : ""}`}
                                                        >
                                                            {_t("fanoos_dashboard|outline_no_members")}
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Add member search */}
                                                <div
                                                    className={`mx_FanoosDashboard_adminFloatRoomAdd${isDayMode ? " day" : ""}`}
                                                >
                                                    <input
                                                        ref={floatMemberInputRef}
                                                        className={`mx_FanoosDashboard_adminEditInput${isDayMode ? " day" : ""}`}
                                                        placeholder={_t("fanoos_dashboard|outline_add_member_ph")}
                                                        value={floatMemberSearch}
                                                        onChange={(e) => setFloatMemberSearch(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Escape") setFloatMemberSearch("");
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* Actions section */}
                                        <div
                                            className={`mx_FanoosDashboard_adminFloatSection${isDayMode ? " day" : ""}`}
                                        >
                                            <div
                                                className={`mx_FanoosDashboard_adminFloatSectionHead${isDayMode ? " day" : ""}`}
                                            >
                                                <span
                                                    className={`mx_FanoosDashboard_adminFloatSectionTitle${isDayMode ? " day" : ""}`}
                                                >
                                                    {_t("fanoos_dashboard|outline_actions")}
                                                </span>
                                            </div>
                                            {floatConfirmDelete ? (
                                                <div
                                                    className={`mx_FanoosDashboard_adminFloatConfirmRow${isDayMode ? " day" : ""}`}
                                                >
                                                    <span
                                                        className={`mx_FanoosDashboard_adminFloatConfirmMsg${isDayMode ? " day" : ""}`}
                                                    >
                                                        {_t("fanoos_dashboard|outline_delete_confirm_msg", {
                                                            name: fn.name,
                                                        })}
                                                    </span>
                                                    <button
                                                        className={`mx_FanoosDashboard_adminFloatActionBtn${isDayMode ? " day" : ""} danger`}
                                                        onClick={() => void handleDelete(fn)}
                                                    >
                                                        {_t("fanoos_dashboard|outline_delete")}
                                                    </button>
                                                    <button
                                                        className={`mx_FanoosDashboard_adminFloatActionBtn${isDayMode ? " day" : ""}`}
                                                        onClick={() => setFloatConfirmDelete(false)}
                                                    >
                                                        {_t("fanoos_dashboard|outline_cancel")}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div
                                                    className={`mx_FanoosDashboard_adminFloatActionBtns${isDayMode ? " day" : ""}`}
                                                >
                                                    {fn.matrixRoomId && (
                                                        <button
                                                            className={`mx_FanoosDashboard_adminFloatActionBtn${isDayMode ? " day" : ""}`}
                                                            onClick={() =>
                                                                dis.dispatch({
                                                                    action: Action.ViewRoom,
                                                                    room_id: fn.matrixRoomId!,
                                                                })
                                                            }
                                                        >
                                                            → {_t("fanoos_dashboard|outline_open")}
                                                        </button>
                                                    )}
                                                    <button
                                                        className={`mx_FanoosDashboard_adminFloatActionBtn${isDayMode ? " day" : ""} danger`}
                                                        onClick={() => setFloatConfirmDelete(true)}
                                                    >
                                                        🗑 {_t("fanoos_dashboard|outline_delete")}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>,
                    document.body,
                )}

            {/* Member-add dropdown (separate portal to escape overflow) */}
            {floatNode &&
                fMemberQ &&
                dropdownAnchor &&
                createPortal(
                    <div
                        className={`mx_FanoosDashboard_adminFloatRoomDropdown${isDayMode ? " day" : ""}`}
                        style={{
                            position: "fixed",
                            left: dropdownAnchor.left,
                            top: dropdownAnchor.bottom + 4,
                            width: dropdownAnchor.width,
                            zIndex: 10000,
                        }}
                    >
                        {(() => {
                            const fn = floatNode;
                            const members = fn.matrixRoomId
                                ? (client.getRoom(fn.matrixRoomId)?.getMembersWithMembership("join") ?? [])
                                : [];
                            const candidates = synapseUsers
                                ? synapseUsers
                                      .filter(
                                          (u) =>
                                              !members.find((m) => m.userId === u.name) &&
                                              !u.deactivated &&
                                              (u.name.toLowerCase().includes(fMemberQ) ||
                                                  (u.displayname ?? "").toLowerCase().includes(fMemberQ)),
                                      )
                                      .slice(0, 6)
                                : [];
                            if (candidates.length === 0) {
                                return (
                                    <span style={{ padding: "8px 10px", display: "block", opacity: 0.5, fontSize: 12 }}>
                                        {synapseUsers === null
                                            ? _t("fanoos_dashboard|outline_loading")
                                            : _t("fanoos_dashboard|outline_no_matches")}
                                    </span>
                                );
                            }
                            return candidates.map((u) => (
                                <button
                                    key={u.name}
                                    className={`mx_FanoosDashboard_adminFloatRoomOption${isDayMode ? " day" : ""}`}
                                    disabled={memberBusyIds.has(u.name)}
                                    onClick={() => fn.matrixRoomId && void addToRoom(fn.matrixRoomId, u.name)}
                                >
                                    <span dir="auto">{u.displayname || u.name.split(":")[0].slice(1)}</span>
                                    <span dir="ltr" style={{ opacity: 0.5, marginInlineStart: "auto", fontSize: 11 }}>
                                        {u.name.split(":")[0]}
                                    </span>
                                </button>
                            ));
                        })()}
                    </div>,
                    document.body,
                )}
        </div>
    );
}

// ─── SVG action icons ─────────────────────────────────────────────────────────
const IcoEdit = (): React.ReactElement => (
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
        <path d="M11 2L14 5L5 14H2V11L11 2Z" />
    </svg>
);
const IcoKey = (): React.ReactElement => (
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
        <circle cx="5.5" cy="9.5" r="3.5" />
        <path d="M8.5 6.5L14 1" />
        <line x1="13" y1="1" x2="13" y2="3.5" />
        <line x1="11" y1="1.5" x2="11" y2="4" />
    </svg>
);
const IcoCrown = (): React.ReactElement => (
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
        <path d="M2 12.5h12M3 12.5L4.5 6 8 10l3.5-7 1.5 6.5" />
        <circle cx="2.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="13.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
    </svg>
);
const IcoBan = (): React.ReactElement => (
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
        <circle cx="8" cy="8" r="6" />
        <line x1="3.76" y1="3.76" x2="12.24" y2="12.24" />
    </svg>
);
const IcoTrash = (): React.ReactElement => (
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
        <polyline points="2,4 14,4" />
        <path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M3.5 4l.7 9.3A1 1 0 0 0 5.2 14h5.6a1 1 0 0 0 1-.7L12.5 4" />
        <line x1="6.5" y1="7" x2="6.5" y2="11.5" />
        <line x1="9.5" y1="7" x2="9.5" y2="11.5" />
    </svg>
);
const IcoCamera = (): React.ReactElement => (
    <svg
        viewBox="0 0 16 16"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M1 5a1 1 0 0 1 1-1h1.2L4.5 2h7l1.3 2H14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5Z" />
        <circle cx="8" cy="8.5" r="2.5" />
    </svg>
);
const IcoSortNone = (): React.ReactElement => (
    <svg viewBox="0 0 10 12" width="8" height="10" fill="currentColor" aria-hidden="true" style={{ opacity: 0.35 }}>
        <path d="M5 0L9 4H1L5 0ZM5 12L1 8H9L5 12Z" />
    </svg>
);
const IcoSortAsc = (): React.ReactElement => (
    <svg viewBox="0 0 10 12" width="8" height="10" fill="currentColor" aria-hidden="true">
        <path d="M5 0L9 4H1L5 0Z" />
        <path d="M5 12L1 8H9L5 12Z" style={{ opacity: 0.3 }} />
    </svg>
);
const IcoSortDesc = (): React.ReactElement => (
    <svg viewBox="0 0 10 12" width="8" height="10" fill="currentColor" aria-hidden="true">
        <path d="M5 0L9 4H1L5 0Z" style={{ opacity: 0.3 }} />
        <path d="M5 12L1 8H9L5 12Z" />
    </svg>
);

function AdminPanel({
    client,
    tree,
    isDayMode,
    onRefresh,
    mode = "full",
}: {
    client: ReturnType<typeof useMatrixClientContext>;
    tree: TreeNode[];
    isDayMode: boolean;
    onRefresh?: () => void;
    /**
     * "full"          — current behavior. Local server chip visible, Users/Spaces/Bots sub-tabs.
     * "servers-only"  — external-servers-only. Local chip hidden; Spaces/Bots sub-tabs hidden.
     *                    Used by the top-level "Admin servers" tab that any user can open.
     */
    mode?: "full" | "servers-only";
}): React.ReactElement {
    const [view, setView] = useState<"users" | "spaces" | "teams">("users");
    const [search, setSearch] = useState("");
    const [users, setUsers] = useState<SynapseUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingUser, setEditingUser] = useState<string | null>(null);
    const [editDisplayName, setEditDisplayName] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmAction, setConfirmAction] = useState<{ userId: string; action: "ban" | "delete" } | null>(null);
    // Create user
    const [showAddUser, setShowAddUser] = useState(false);
    const [newLocalpart, setNewLocalpart] = useState("");
    const [newDisplayName, setNewDisplayName] = useState("");
    const [newPwd, setNewPwd] = useState("");
    const [newIsAdmin, setNewIsAdmin] = useState(false);
    // Random password feedback
    const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
    // Filters / sort
    const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "deactivated">("all");
    const [sortField, setSortField] = useState<"name" | "role" | "status" | "date" | "activity">("name");
    const [sortDir, setSortDir] = useState<1 | -1>(1);
    // Avatar upload
    const newAvatarRef = useRef<HTMLInputElement>(null);
    const editAvatarRef = useRef<HTMLInputElement>(null);
    const [newAvatarPreview, setNewAvatarPreview] = useState<string | null>(null);
    const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
    // Inline name edit
    const [inlineEditUserId, setInlineEditUserId] = useState<string | null>(null);
    const [inlineEditName, setInlineEditName] = useState("");
    // Float edit window
    const [floatPos, setFloatPos] = useState({ x: 240, y: 120 });
    const floatDragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
    // Groups in float window
    const [editUserRooms, setEditUserRooms] = useState<string[] | null>(null);
    const [editUserRoomsLoading, setEditUserRoomsLoading] = useState(false);
    const [editRoomBusyIds, setEditRoomBusyIds] = useState<Set<string>>(new Set());
    const [roomPowerBusyIds, setRoomPowerBusyIds] = useState<Set<string>>(new Set());
    const [editUserRoomPowers, setEditUserRoomPowers] = useState<Map<string, number>>(new Map());
    const [confirmRemoveRoom, setConfirmRemoveRoom] = useState<string | null>(null);
    const [floatConfirm, setFloatConfirm] = useState<"ban" | "delete" | null>(null);
    const [roomAddSearch, setRoomAddSearch] = useState("");
    const roomSearchInputRef = useRef<HTMLInputElement>(null);

    // ─── Multi-server admin scope ───────────────────────────────────────────
    // "local" = the current Matrix session. Any other id refers to an
    // AdminServer stored in localStorage (see fanoos/adminServers.ts).
    // In "servers-only" mode we skip "local" so a non-admin of the current
    // homeserver can still use this panel against servers they have admin on.
    const [externalServers, setExternalServers] = useState<AdminServer[]>(() => readAdminServers());
    const [selectedServerId, setSelectedServerId] = useState<string>(() => {
        if (mode === "servers-only") {
            return externalServers[0]?.id ?? "";
        }
        return "local";
    });
    const [showAddServer, setShowAddServer] = useState(false);
    const [addServerForm, setAddServerForm] = useState({ label: "", mxid: "", password: "" });
    const [addServerBusy, setAddServerBusy] = useState(false);
    const [addServerError, setAddServerError] = useState<string | null>(null);

    // Spaces panel only makes sense against local admin. Users sub-tab is
    // admin-only. Silently snap views when the selected server can't support
    // the current view.
    useEffect(() => {
        if (selectedServerId !== "local" && view === "spaces") {
            setView("teams");
        }
        if (view === "users" && activeServer && activeServer.isAdmin === false) {
            setView("teams");
        }
    }, [selectedServerId, view, activeServer]);

    // Resolve the currently-selected server's baseUrl + token + domain.
    // In "servers-only" mode there is no "local" fallback — if nothing is
    // selected we fall back to empty strings and adminFetch will simply
    // return 404s (surface handles the empty state visually).
    const activeServer =
        selectedServerId && selectedServerId !== "local"
            ? externalServers.find((s) => s.id === selectedServerId)
            : null;
    const hasLocal = mode === "full" && selectedServerId === "local";
    const token = activeServer ? activeServer.accessToken : hasLocal ? (client.getAccessToken() ?? "") : "";
    const baseUrl = activeServer ? activeServer.homeserverUrl : hasLocal ? client.getHomeserverUrl() : "";
    const serverDomain = activeServer
        ? (activeServer.adminMxid.split(":")[1] ?? "")
        : hasLocal
          ? (client.getDomain() ?? "")
          : "";

    const adminFetch = useCallback(
        (path: string, opts?: RequestInit) =>
            fetch(`${baseUrl}${path}`, {
                ...opts,
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                    ...(opts?.headers ?? {}),
                },
            }),
        [baseUrl, token],
    );

    const submitAddServer = useCallback(async () => {
        setAddServerBusy(true);
        setAddServerError(null);
        try {
            const s = await addAdminServer({
                label: addServerForm.label,
                mxid: addServerForm.mxid,
                password: addServerForm.password,
            });
            setExternalServers(readAdminServers());
            setSelectedServerId(s.id);
            setAddServerForm({ label: "", mxid: "", password: "" });
            setShowAddServer(false);
        } catch (e) {
            setAddServerError(e instanceof Error ? e.message : String(e));
        } finally {
            setAddServerBusy(false);
        }
    }, [addServerForm]);

    const deleteExternalServer = useCallback(
        (id: string) => {
            removeAdminServer(id);
            const remaining = readAdminServers();
            setExternalServers(remaining);
            setSelectedServerId((cur) => {
                if (cur !== id) return cur;
                if (mode === "full") return "local";
                return remaining[0]?.id ?? "";
            });
        },
        [mode],
    );

    const loadUsers = useCallback(async () => {
        // No server selected (servers-only mode with empty list) → skip fetch,
        // leave users empty. The render layer shows an empty state.
        if (!baseUrl || !token) {
            setUsers([]);
            setLoading(false);
            setError(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await adminFetch("/_synapse/admin/v2/users?from=0&limit=500&guests=false");
            if (!res.ok) throw new Error(`${res.status}`);
            const data = (await res.json()) as { users: SynapseUser[] };
            setUsers(data.users);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, [adminFetch, baseUrl, token]);

    useEffect(() => {
        if (view === "users") void loadUsers();
    }, [view, loadUsers]);

    const deactivateUser = async (userId: string, erase = false): Promise<void> => {
        await adminFetch(`/_synapse/admin/v1/deactivate/${encodeURIComponent(userId)}`, {
            method: "POST",
            body: JSON.stringify({ erase }),
        });
        void loadUsers();
    };

    const resetPassword = async (userId: string, password: string): Promise<void> => {
        await adminFetch(`/_synapse/admin/v1/reset_password/${encodeURIComponent(userId)}`, {
            method: "POST",
            body: JSON.stringify({ new_password: password, logout_devices: false }),
        });
        setEditingUser(null);
        setNewPassword("");
    };

    const saveDisplayName = async (userId: string, displayname: string): Promise<void> => {
        const body: Record<string, unknown> = {};
        if (displayname) body.displayname = displayname;
        if (editAvatarRef.current?.files?.[0]) {
            try {
                body.avatar_url = await uploadAvatar(editAvatarRef.current.files[0]);
            } catch {
                /* ignore */
            }
        }
        if (Object.keys(body).length) {
            await adminFetch(`/_synapse/admin/v2/users/${encodeURIComponent(userId)}`, {
                method: "PUT",
                body: JSON.stringify(body),
            });
        }
        setEditingUser(null);
        setEditAvatarPreview(null);
        void loadUsers();
    };

    const toggleAdmin = async (userId: string, makeAdmin: boolean): Promise<void> => {
        await adminFetch(`/_synapse/admin/v2/users/${encodeURIComponent(userId)}`, {
            method: "PUT",
            body: JSON.stringify({ admin: makeAdmin }),
        });
        void loadUsers();
    };

    const generatePassword = (): string => {
        const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
        return Array.from({ length: 14 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    };

    const createUser = async (): Promise<void> => {
        if (!newLocalpart || !newPwd) return;
        const userId = `@${newLocalpart}:${serverDomain}`;
        try {
            let avatarUrl: string | undefined;
            if (newAvatarRef.current?.files?.[0]) {
                avatarUrl = await uploadAvatar(newAvatarRef.current.files[0]);
            }
            const body: Record<string, unknown> = {
                password: newPwd,
                displayname: newDisplayName || newLocalpart,
                admin: newIsAdmin,
            };
            if (avatarUrl) body.avatar_url = avatarUrl;
            const res = await adminFetch(`/_synapse/admin/v2/users/${encodeURIComponent(userId)}`, {
                method: "PUT",
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(`${res.status}`);
            setShowAddUser(false);
            setNewLocalpart("");
            setNewDisplayName("");
            setNewPwd("");
            setNewIsAdmin(false);
            setNewAvatarPreview(null);
            void loadUsers();
        } catch (e) {
            setError(String(e));
        }
    };

    const assignRandomPassword = async (userId: string): Promise<void> => {
        const pwd = generatePassword();
        try {
            await resetPassword(userId, pwd);
            await navigator.clipboard.writeText(`user:${userId} pass:${pwd}`);
            setCopiedUserId(userId);
            setTimeout(() => setCopiedUserId((prev) => (prev === userId ? null : prev)), 2500);
        } catch (e) {
            setError(String(e));
        }
    };

    const uploadAvatar = useCallback(
        async (file: File): Promise<string> => {
            const res = await fetch(`${baseUrl}/_matrix/media/v3/upload`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": file.type },
                body: file,
            });
            if (!res.ok) throw new Error(`Upload failed ${res.status}`);
            return ((await res.json()) as { content_uri: string }).content_uri;
        },
        [baseUrl, token],
    );

    const loadUserRooms = useCallback(
        async (userId: string): Promise<void> => {
            setEditUserRoomsLoading(true);
            try {
                const res = await adminFetch(`/_synapse/admin/v1/users/${encodeURIComponent(userId)}/joined_rooms`);
                if (!res.ok) throw new Error(`${res.status}`);
                const data = (await res.json()) as { joined_rooms: string[] };
                setEditUserRooms(data.joined_rooms);
            } catch {
                setEditUserRooms([]);
            } finally {
                setEditUserRoomsLoading(false);
            }
        },
        [adminFetch],
    );

    const setRoomBusy = (roomId: string, on: boolean): void =>
        setEditRoomBusyIds((prev) => {
            const s = new Set(prev);
            if (on) s.add(roomId);
            else s.delete(roomId);
            return s;
        });

    const addUserToRoom = async (userId: string, roomId: string): Promise<void> => {
        setRoomBusy(roomId, true);
        try {
            await adminFetch(`/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`, {
                method: "POST",
                body: JSON.stringify({ user_id: userId }),
            });
            void loadUserRooms(userId);
        } finally {
            setRoomBusy(roomId, false);
        }
    };

    const removeUserFromRoom = async (userId: string, roomId: string): Promise<void> => {
        setRoomBusy(roomId, true);
        try {
            await fetch(`${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/kick`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId }),
            });
            setConfirmRemoveRoom(null);
            void loadUserRooms(userId);
        } finally {
            setRoomBusy(roomId, false);
        }
    };

    const loadRoomPowerLevel = useCallback(
        async (userId: string, roomId: string): Promise<void> => {
            try {
                const res = await fetch(
                    `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.power_levels`,
                    { headers: { Authorization: `Bearer ${token}` } },
                );
                if (!res.ok) return;
                const data = (await res.json()) as { users?: Record<string, number>; users_default?: number };
                const level = data.users?.[userId] ?? data.users_default ?? 0;
                setEditUserRoomPowers((prev) => new Map(prev).set(roomId, level));
            } catch {
                /* ignore */
            }
        },
        [baseUrl, token],
    );

    const toggleRoomAdmin = async (userId: string, roomId: string, makeAdmin: boolean): Promise<void> => {
        setRoomPowerBusyIds((prev) => {
            const s = new Set(prev);
            s.add(roomId);
            return s;
        });
        try {
            const res = await fetch(
                `${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.power_levels`,
                { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!res.ok) return;
            const pl = (await res.json()) as Record<string, unknown>;
            const users = { ...((pl.users as Record<string, number>) ?? {}) };
            if (makeAdmin) users[userId] = 100;
            else delete users[userId];
            pl.users = users;
            await fetch(`${baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.power_levels`, {
                method: "PUT",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify(pl),
            });
            setEditUserRoomPowers((prev) => new Map(prev).set(roomId, makeAdmin ? 100 : 0));
        } finally {
            setRoomPowerBusyIds((prev) => {
                const s = new Set(prev);
                s.delete(roomId);
                return s;
            });
        }
    };

    useEffect(() => {
        if (editingUser) {
            setEditUserRooms(null);
            setEditUserRoomPowers(new Map());
            setConfirmRemoveRoom(null);
            setFloatConfirm(null);
            setRoomAddSearch("");
            void loadUserRooms(editingUser);
        }
    }, [editingUser, loadUserRooms]);

    useEffect(() => {
        if (editingUser && editUserRooms) {
            for (const roomId of editUserRooms) {
                void loadRoomPowerLevel(editingUser, roomId);
            }
        }
    }, [editUserRooms, editingUser, loadRoomPowerLevel]);

    const toggleSort = (field: typeof sortField): void => {
        if (sortField === field) setSortDir((d) => (d === 1 ? -1 : 1));
        else {
            setSortField(field);
            setSortDir(-1);
        }
    };

    const commitInlineName = useCallback(
        async (userId: string, name: string): Promise<void> => {
            setInlineEditUserId(null);
            const u = users.find((x) => x.name === userId);
            const current = u?.displayname || u?.name.split(":")[0].slice(1) || "";
            if (!name.trim() || name.trim() === current) return;
            await adminFetch(`/_synapse/admin/v2/users/${encodeURIComponent(userId)}`, {
                method: "PUT",
                body: JSON.stringify({ displayname: name.trim() }),
            });
            void loadUsers();
        },
        [adminFetch, loadUsers, users],
    );

    const startFloatDrag = (e: React.MouseEvent): void => {
        e.preventDefault();
        floatDragRef.current = { sx: e.clientX, sy: e.clientY, px: floatPos.x, py: floatPos.y };
        const onMove = (me: MouseEvent): void => {
            if (!floatDragRef.current) return;
            setFloatPos({
                x: floatDragRef.current.px + (me.clientX - floatDragRef.current.sx),
                y: floatDragRef.current.py + (me.clientY - floatDragRef.current.sy),
            });
        };
        const onUp = (): void => {
            floatDragRef.current = null;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    };

    const openFloatEdit = (u: SynapseUser, e: React.MouseEvent): void => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setFloatPos({
            x: Math.max(8, Math.min(rect.right + 10, UIStore.instance.windowWidth - 370)),
            y: Math.max(8, Math.min(rect.top - 30, UIStore.instance.windowHeight - 400)),
        });
        setEditingUser(u.name);
        setEditDisplayName(u.displayname ?? "");
        setNewPassword("");
        setEditAvatarPreview(null);
    };

    const SortIcon = ({ field }: { field: typeof sortField }): React.ReactElement => {
        if (sortField !== field) return <IcoSortNone />;
        return sortDir === 1 ? <IcoSortAsc /> : <IcoSortDesc />;
    };

    const cls = (c: string): string => `mx_FanoosDashboard_admin${c}${isDayMode ? " day" : ""}`;

    const filteredUsers = users
        .filter((u) => {
            const q = search.toLowerCase();
            const matchSearch =
                !q || u.name.toLowerCase().includes(q) || (u.displayname ?? "").toLowerCase().includes(q);
            const matchRole = roleFilter === "all" || (roleFilter === "admin" ? u.admin : !u.admin);
            const matchStatus = statusFilter === "all" || (statusFilter === "active" ? !u.deactivated : u.deactivated);
            return matchSearch && matchRole && matchStatus;
        })
        .sort((a, b) => {
            let diff = 0;
            if (sortField === "name") diff = (a.displayname || a.name).localeCompare(b.displayname || b.name);
            else if (sortField === "role") diff = Number(a.admin) - Number(b.admin);
            else if (sortField === "status") diff = Number(a.deactivated) - Number(b.deactivated);
            else if (sortField === "date") diff = (a.creation_ts ?? 0) - (b.creation_ts ?? 0);
            else if (sortField === "activity") diff = (a.last_seen_ts ?? 0) - (b.last_seen_ts ?? 0);
            return diff * sortDir;
        });

    return (
        <div className={cls("Panel")}>
            {/* Server selector — pick which homeserver's admin API to use */}
            <div className={cls("ServerBar")}>
                <span className={cls("ServerBarLabel")}>{_t("fanoos_dashboard|admin_server")}</span>
                {mode === "full" && (
                    <button
                        className={`${cls("ServerChip")}${selectedServerId === "local" ? " active" : ""}`}
                        onClick={() => setSelectedServerId("local")}
                        title={client.getDomain() ?? ""}
                    >
                        {client.getDomain() ?? "local"}
                    </button>
                )}
                {externalServers.map((s) => (
                    <span key={s.id} className={cls("ServerChipWrap")}>
                        <button
                            className={`${cls("ServerChip")}${selectedServerId === s.id ? " active" : ""}`}
                            onClick={() => setSelectedServerId(s.id)}
                            title={`${s.adminMxid} @ ${s.homeserverUrl}${s.isAdmin ? " · admin" : ""}`}
                        >
                            {s.isAdmin ? "🛡 " : ""}
                            {s.label}
                        </button>
                        <button
                            className={cls("ServerChipDel")}
                            onClick={() => deleteExternalServer(s.id)}
                            title={_t("fanoos_dashboard|admin_server_remove")}
                        >
                            ✕
                        </button>
                    </span>
                ))}
                <button className={cls("ServerAdd")} onClick={() => setShowAddServer((v) => !v)}>
                    {_t("fanoos_dashboard|admin_server_add")}
                </button>
            </div>

            {showAddServer && (
                <div className={cls("AddServerForm")}>
                    <input
                        className={cls("AddServerInput")}
                        placeholder={_t("fanoos_dashboard|admin_server_label_ph")}
                        value={addServerForm.label}
                        onChange={(e) => setAddServerForm((f) => ({ ...f, label: e.target.value }))}
                        disabled={addServerBusy}
                    />
                    <input
                        className={cls("AddServerInput")}
                        placeholder="@admin:server.example"
                        value={addServerForm.mxid}
                        onChange={(e) => setAddServerForm((f) => ({ ...f, mxid: e.target.value }))}
                        disabled={addServerBusy}
                    />
                    <input
                        className={cls("AddServerInput")}
                        type="password"
                        placeholder={_t("fanoos_dashboard|admin_server_password_ph")}
                        value={addServerForm.password}
                        onChange={(e) => setAddServerForm((f) => ({ ...f, password: e.target.value }))}
                        disabled={addServerBusy}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void submitAddServer();
                        }}
                    />
                    {addServerError && <div className={cls("AddServerError")}>{addServerError}</div>}
                    <div className={cls("AddServerActions")}>
                        <button
                            className={cls("AddServerBtnPrimary")}
                            disabled={addServerBusy}
                            onClick={() => void submitAddServer()}
                        >
                            {addServerBusy ? "…" : _t("fanoos_dashboard|admin_server_add_submit")}
                        </button>
                        <button
                            className={cls("AddServerBtnGhost")}
                            onClick={() => setShowAddServer(false)}
                            disabled={addServerBusy}
                        >
                            {_t("fanoos_dashboard|admin_cancel")}
                        </button>
                    </div>
                </div>
            )}

            {/* Sub-tab bar */}
            <div className={cls("SubTabs")}>
                {/* Users management is admin-only. For non-admin external
                    entries we hide it (Synapse admin API would return 403). */}
                {(selectedServerId === "local" || activeServer?.isAdmin !== false) && (
                    <button
                        className={`${cls("SubTab")}${view === "users" ? " active" : ""}`}
                        onClick={() => setView("users")}
                    >
                        👤 {_t("fanoos_dashboard|admin_tab_users")}
                    </button>
                )}
                {selectedServerId === "local" && (
                    <button
                        className={`${cls("SubTab")}${view === "spaces" ? " active" : ""}`}
                        onClick={() => setView("spaces")}
                    >
                        🏢 {_t("fanoos_dashboard|admin_tab_spaces")}
                    </button>
                )}
                {mode === "servers-only" && !!activeServer && (
                    <button
                        className={`${cls("SubTab")}${view === "teams" ? " active" : ""}`}
                        onClick={() => setView("teams")}
                    >
                        🌐 {_t("fanoos_dashboard|admin_tab_teams")}
                    </button>
                )}
            </div>

            {/* Search + reload + add button — hidden in Teams view */}
            {view !== "teams" && (
                <div className={cls("SearchRow")}>
                    <input
                        className={cls("Search")}
                        type="search"
                        placeholder={
                            view === "users"
                                ? _t("fanoos_dashboard|admin_search_users")
                                : _t("fanoos_dashboard|admin_search_spaces")
                        }
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button
                        className={cls("Reload")}
                        onClick={() => void (view === "users" ? loadUsers() : onRefresh?.())}
                    >
                        ↺
                    </button>
                    {view === "users" && (
                        <button className={cls("BtnAdd")} onClick={() => setShowAddUser((v) => !v)}>
                            {_t("fanoos_dashboard|admin_add_user")}
                        </button>
                    )}
                </div>
            )}

            {/* Filter / sort bar (users only) */}
            {view === "users" && (
                <div className={cls("FilterBar")}>
                    {(["all", "admin", "user"] as const).map((r) => (
                        <button
                            key={r}
                            className={`${cls("FilterChip")}${roleFilter === r ? " active" : ""}`}
                            onClick={() => setRoleFilter(r)}
                        >
                            {r === "all"
                                ? _t("fanoos_dashboard|admin_filter_all")
                                : r === "admin"
                                  ? _t("fanoos_dashboard|admin_filter_admins")
                                  : _t("fanoos_dashboard|admin_filter_users")}
                        </button>
                    ))}
                    <span className={cls("FilterSep")} />
                    {(["all", "active", "deactivated"] as const).map((s) => (
                        <button
                            key={s}
                            className={`${cls("FilterChip")}${statusFilter === s ? " active" : ""}${s === "deactivated" ? " danger" : ""}`}
                            onClick={() => setStatusFilter(s)}
                        >
                            {s === "all"
                                ? _t("fanoos_dashboard|admin_filter_all_status")
                                : s === "active"
                                  ? _t("fanoos_dashboard|admin_filter_active")
                                  : _t("fanoos_dashboard|admin_filter_deactivated")}
                        </button>
                    ))}
                </div>
            )}

            {/* Add user form */}
            {view === "users" && showAddUser && (
                <div className={cls("AddUserForm")}>
                    <div className={cls("AddUserTop")}>
                        {/* Avatar picker */}
                        <div
                            className={cls("FormAvatarWrap")}
                            style={
                                newAvatarPreview
                                    ? undefined
                                    : { background: newLocalpart ? nodeAvatarColor(`@${newLocalpart}:x`) : "#6366f1" }
                            }
                            onClick={() => newAvatarRef.current?.click()}
                        >
                            {newAvatarPreview ? (
                                <img src={newAvatarPreview} alt="" className={cls("FormAvatarImg")} />
                            ) : (
                                <span>{(newDisplayName || newLocalpart || "?").slice(0, 1).toUpperCase()}</span>
                            )}
                            <div className={cls("FormAvatarOverlay")}>
                                <IcoCamera />
                            </div>
                            <input
                                ref={newAvatarRef}
                                type="file"
                                accept="image/*"
                                style={{ display: "none" }}
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) setNewAvatarPreview(URL.createObjectURL(f));
                                }}
                            />
                        </div>
                        {/* Fields */}
                        <div className={cls("AddUserFields")}>
                            <div className={cls("NewUserIdRow")}>
                                <input
                                    className={cls("EditInput")}
                                    placeholder={_t("fanoos_dashboard|admin_username_label")}
                                    value={newLocalpart}
                                    autoFocus
                                    onChange={(e) => setNewLocalpart(e.target.value.replace(/[^a-z0-9._-]/gi, ""))}
                                    dir="ltr"
                                />
                                {serverDomain && (
                                    <span className={cls("DomainHint")} dir="ltr">
                                        @{newLocalpart || "…"}:{serverDomain}
                                    </span>
                                )}
                            </div>
                            <input
                                className={cls("EditInput")}
                                placeholder={_t("fanoos_dashboard|admin_display_name_label")}
                                value={newDisplayName}
                                onChange={(e) => setNewDisplayName(e.target.value)}
                            />
                            <div className={cls("PwdRow")}>
                                <input
                                    className={cls("EditInput")}
                                    type="password"
                                    placeholder={_t("fanoos_dashboard|admin_password_label")}
                                    value={newPwd}
                                    onChange={(e) => setNewPwd(e.target.value)}
                                />
                                <button
                                    className={cls("BtnRandom")}
                                    title={_t("fanoos_dashboard|admin_random_pwd")}
                                    onClick={() => setNewPwd(generatePassword())}
                                >
                                    <IcoKey />
                                </button>
                            </div>
                            <label className={cls("AdminToggle")}>
                                <input
                                    type="checkbox"
                                    checked={newIsAdmin}
                                    onChange={(e) => setNewIsAdmin(e.target.checked)}
                                />
                                {_t("fanoos_dashboard|admin_is_admin_label")}
                            </label>
                        </div>
                    </div>
                    <div className={cls("FormBtns")}>
                        <button className={cls("BtnSave")} onClick={() => void createUser()}>
                            {_t("fanoos_dashboard|admin_create")}
                        </button>
                        <button
                            className={cls("BtnCancel")}
                            onClick={() => {
                                setShowAddUser(false);
                                setNewLocalpart("");
                                setNewDisplayName("");
                                setNewPwd("");
                                setNewIsAdmin(false);
                                setNewAvatarPreview(null);
                            }}
                        >
                            {_t("fanoos_dashboard|admin_cancel")}
                        </button>
                    </div>
                </div>
            )}

            {loading && <div className={cls("Loading")}>{_t("fanoos_dashboard|admin_loading")}</div>}
            {error && <div className={cls("Error")}>⚠ {error}</div>}

            {/* Confirm dialog */}
            {confirmAction && (
                <div className={cls("ConfirmOverlay")}>
                    <div className={cls("ConfirmBox")}>
                        <p>
                            {confirmAction.action === "ban"
                                ? _t("fanoos_dashboard|admin_confirm_ban", { userId: confirmAction.userId })
                                : _t("fanoos_dashboard|admin_confirm_delete", { userId: confirmAction.userId })}
                        </p>
                        <button
                            className={cls("BtnDanger")}
                            onClick={async () => {
                                await deactivateUser(confirmAction.userId, confirmAction.action === "delete");
                                setConfirmAction(null);
                            }}
                        >
                            {_t("fanoos_dashboard|admin_confirm")}
                        </button>
                        <button className={cls("BtnCancel")} onClick={() => setConfirmAction(null)}>
                            {_t("fanoos_dashboard|admin_cancel")}
                        </button>
                    </div>
                </div>
            )}

            {/* Users view */}
            {!loading && view === "users" && (
                <div className={cls("UserTable")}>
                    {/* Table header */}
                    <div className={cls("TableHead")}>
                        <div className={`${cls("Th")} user`}>
                            <button className={cls("ThBtn")} onClick={() => toggleSort("name")}>
                                {_t("fanoos_dashboard|admin_user_col")} <SortIcon field="name" />
                            </button>
                        </div>
                        <div className={`${cls("Th")} role`}>
                            <button className={cls("ThBtn")} onClick={() => toggleSort("role")}>
                                Role <SortIcon field="role" />
                            </button>
                        </div>
                        <div className={`${cls("Th")} status`}>
                            <button className={cls("ThBtn")} onClick={() => toggleSort("status")}>
                                {_t("fanoos_dashboard|admin_status_col")} <SortIcon field="status" />
                            </button>
                        </div>
                        <div className={`${cls("Th")} date`}>
                            <button className={cls("ThBtn")} onClick={() => toggleSort("date")}>
                                Joined <SortIcon field="date" />
                            </button>
                        </div>
                        <div className={`${cls("Th")} activity`}>
                            <button className={cls("ThBtn")} onClick={() => toggleSort("activity")}>
                                {_t("fanoos_dashboard|admin_last_seen")} <SortIcon field="activity" />
                            </button>
                        </div>
                        <div className={`${cls("Th")} actions`}>{_t("fanoos_dashboard|admin_actions_col")}</div>
                    </div>

                    {filteredUsers.map((u) => {
                        const displayName = u.displayname || u.name.split(":")[0].slice(1);
                        const avatarSrc = u.avatar_url ? (mediaFromMxc(u.avatar_url).srcHttp ?? null) : null;
                        const isInlineEdit = inlineEditUserId === u.name;
                        return (
                            <div
                                key={u.name}
                                className={`${cls("UserRow")}${u.deactivated ? " deactivated" : ""}${u.admin ? " admin" : ""}`}
                            >
                                {/* Col: Avatar + Name (with inline name edit) */}
                                <div className={cls("TdUser")}>
                                    <div
                                        className={cls("UserAvatar")}
                                        style={avatarSrc ? undefined : { background: nodeAvatarColor(u.name) }}
                                    >
                                        {avatarSrc ? (
                                            <img src={avatarSrc} alt="" className={cls("UserAvatarImg")} />
                                        ) : (
                                            displayName.slice(0, 1).toUpperCase()
                                        )}
                                    </div>
                                    <div className={cls("UserIdent")}>
                                        {isInlineEdit ? (
                                            <input
                                                className={cls("UserInlineInput")}
                                                value={inlineEditName}
                                                dir="auto"
                                                autoFocus
                                                onChange={(e) => setInlineEditName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    e.stopPropagation();
                                                    if (e.key === "Enter")
                                                        void commitInlineName(u.name, inlineEditName);
                                                    if (e.key === "Escape") setInlineEditUserId(null);
                                                }}
                                                onBlur={() => void commitInlineName(u.name, inlineEditName)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ) : (
                                            <span
                                                className={cls("UserDisplayName")}
                                                dir="auto"
                                                title="Double-click to rename"
                                                onDoubleClick={() => {
                                                    setInlineEditUserId(u.name);
                                                    setInlineEditName(displayName);
                                                }}
                                            >
                                                {displayName}
                                            </span>
                                        )}
                                        <span className={cls("UserMatrixId")} dir="ltr">
                                            {u.name}
                                        </span>
                                    </div>
                                </div>
                                {/* Col: Role */}
                                <div className={cls("TdRole")}>
                                    {u.admin && <span className={cls("BadgeAdmin")}>admin</span>}
                                </div>
                                {/* Col: Status */}
                                <div className={cls("TdStatus")}>
                                    <span className={`${cls("BadgeStatus")}${u.deactivated ? " banned" : ""}`}>
                                        {u.deactivated
                                            ? _t("fanoos_dashboard|admin_filter_deactivated")
                                            : _t("fanoos_dashboard|admin_filter_active")}
                                    </span>
                                </div>
                                {/* Col: Joined */}
                                <div className={cls("TdDate")}>
                                    {u.creation_ts > 0
                                        ? new Date(
                                              u.creation_ts * 1000 > 9999999999 ? u.creation_ts : u.creation_ts * 1000,
                                          ).toLocaleDateString()
                                        : "—"}
                                </div>
                                {/* Col: Last seen */}
                                <div className={cls("TdActivity")}>
                                    {u.last_seen_ts != null && u.last_seen_ts > 0
                                        ? new Date(u.last_seen_ts).toLocaleDateString()
                                        : "—"}
                                </div>
                                {/* Col: Actions */}
                                <div className={cls("UserActions")}>
                                    <button
                                        className={cls("UABtn")}
                                        title={_t("fanoos_dashboard|admin_edit")}
                                        onClick={(e) => openFloatEdit(u, e)}
                                    >
                                        <IcoEdit />
                                    </button>
                                    <button
                                        className={`${cls("UABtn")}${copiedUserId === u.name ? " copied" : ""}`}
                                        title={_t("fanoos_dashboard|admin_random_pwd")}
                                        onClick={() => void assignRandomPassword(u.name)}
                                    >
                                        <IcoKey />
                                    </button>
                                    <button
                                        className={`${cls("UABtn")}${u.admin ? " active" : ""}`}
                                        title={
                                            u.admin
                                                ? _t("fanoos_dashboard|admin_remove_admin")
                                                : _t("fanoos_dashboard|admin_make_admin")
                                        }
                                        onClick={() => void toggleAdmin(u.name, !u.admin)}
                                    >
                                        <IcoCrown />
                                    </button>
                                    {!u.deactivated && (
                                        <button
                                            className={`${cls("UABtn")} danger`}
                                            title={_t("fanoos_dashboard|admin_ban")}
                                            onClick={() => setConfirmAction({ userId: u.name, action: "ban" })}
                                        >
                                            <IcoBan />
                                        </button>
                                    )}
                                    <button
                                        className={`${cls("UABtn")} danger`}
                                        title={_t("fanoos_dashboard|admin_delete")}
                                        onClick={() => setConfirmAction({ userId: u.name, action: "delete" })}
                                    >
                                        <IcoTrash />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {!filteredUsers.length && !loading && (
                        <div className={cls("Empty")}>{_t("fanoos_dashboard|admin_no_users")}</div>
                    )}
                </div>
            )}

            {/* Spaces & Rooms view */}
            {view === "spaces" && (
                <SpaceOutline client={client} tree={tree} isDayMode={isDayMode} onRefresh={onRefresh} />
            )}

            {/* ── Floating user edit window ── */}
            {editingUser &&
                (() => {
                    const u = users.find((x) => x.name === editingUser);
                    if (!u) return null;
                    const dn = u.displayname || u.name.split(":")[0].slice(1);
                    const avatarSrc = u.avatar_url ? (mediaFromMxc(u.avatar_url).srcHttp ?? null) : null;
                    return createPortal(
                        <div className={cls("FloatWin")} style={{ left: floatPos.x, top: floatPos.y }}>
                            {/* Drag handle / title bar */}
                            <div className={cls("FloatHead")} onMouseDown={startFloatDrag}>
                                <span className={cls("FloatTitle")}>Edit user</span>
                                <button
                                    className={cls("FloatClose")}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => {
                                        setEditingUser(null);
                                        setEditAvatarPreview(null);
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                            {/* Body */}
                            <div className={cls("FloatBody")}>
                                {/* Avatar picker */}
                                <div className={cls("FloatAvatarRow")}>
                                    <div
                                        className={cls("FormAvatarWrap")}
                                        style={
                                            editAvatarPreview || avatarSrc
                                                ? undefined
                                                : { background: nodeAvatarColor(u.name) }
                                        }
                                        onClick={() => editAvatarRef.current?.click()}
                                    >
                                        {editAvatarPreview || avatarSrc ? (
                                            <img
                                                src={editAvatarPreview ?? avatarSrc!}
                                                alt=""
                                                className={cls("FormAvatarImg")}
                                            />
                                        ) : (
                                            <span>{dn.slice(0, 1).toUpperCase()}</span>
                                        )}
                                        <div className={cls("FormAvatarOverlay")}>
                                            <IcoCamera />
                                        </div>
                                        <input
                                            ref={editAvatarRef}
                                            type="file"
                                            accept="image/*"
                                            style={{ display: "none" }}
                                            onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                if (f) setEditAvatarPreview(URL.createObjectURL(f));
                                            }}
                                        />
                                    </div>
                                    <div className={cls("FloatUserInfo")}>
                                        <span className={cls("FloatUserDn")} dir="auto">
                                            {dn}
                                        </span>
                                        <span className={cls("FloatUserId")} dir="ltr">
                                            {u.name}
                                        </span>
                                    </div>
                                </div>
                                {/* Fields */}
                                <input
                                    className={cls("EditInput")}
                                    placeholder={_t("fanoos_dashboard|admin_display_name_ph")}
                                    value={editDisplayName}
                                    autoFocus
                                    onChange={(e) => setEditDisplayName(e.target.value)}
                                />
                                <div className={cls("PwdRow")}>
                                    <input
                                        className={cls("EditInput")}
                                        placeholder={_t("fanoos_dashboard|admin_password_ph")}
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                    />
                                    <button
                                        className={cls("BtnRandom")}
                                        title={_t("fanoos_dashboard|admin_random_pwd")}
                                        onClick={() => setNewPassword(generatePassword())}
                                    >
                                        <IcoKey />
                                    </button>
                                </div>
                                <div className={cls("FormBtns")}>
                                    <button
                                        className={cls("BtnSave")}
                                        onClick={async () => {
                                            await saveDisplayName(u.name, editDisplayName);
                                            if (newPassword) await resetPassword(u.name, newPassword);
                                        }}
                                    >
                                        {_t("fanoos_dashboard|admin_save")}
                                    </button>
                                    <button
                                        className={cls("BtnCancel")}
                                        onClick={() => {
                                            setEditingUser(null);
                                            setEditAvatarPreview(null);
                                        }}
                                    >
                                        {_t("fanoos_dashboard|admin_cancel")}
                                    </button>
                                </div>

                                {/* ── Groups section ── */}
                                <div className={cls("FloatSection")}>
                                    <div className={cls("FloatSectionHead")}>
                                        <span className={cls("FloatSectionTitle")}>Groups</span>
                                        {editUserRoomsLoading && <span className={cls("FloatSpinner")} />}
                                        {editUserRooms && (
                                            <span className={cls("FloatSectionCount")}>{editUserRooms.length}</span>
                                        )}
                                    </div>

                                    {/* Current memberships */}
                                    <div className={cls("FloatRoomList")}>
                                        {editUserRooms?.map((roomId) => {
                                            const node = tree.find((n) => n.matrixRoomId === roomId);
                                            const isBusy = editRoomBusyIds.has(roomId);
                                            const isPowerBusy = roomPowerBusyIds.has(roomId);
                                            const isAdmin = (editUserRoomPowers.get(roomId) ?? 0) >= 100;
                                            const isPendingRemove = confirmRemoveRoom === roomId;
                                            return (
                                                <div
                                                    key={roomId}
                                                    className={`${cls("FloatRoomChip")}${isBusy ? " busy" : ""}${isPendingRemove ? " confirming" : ""}`}
                                                >
                                                    <span className={cls("FloatRoomIcon")}>
                                                        {node?.type === "space"
                                                            ? "🏢"
                                                            : node?.type === "dm"
                                                              ? "👤"
                                                              : "💬"}
                                                    </span>
                                                    <span className={cls("FloatRoomName")} dir="auto">
                                                        {node?.name ?? roomId}
                                                    </span>
                                                    {isPendingRemove ? (
                                                        <span className={cls("FloatRoomConfirm")}>
                                                            <button
                                                                className={`${cls("FloatRoomConfirmBtn")} yes`}
                                                                onClick={() => void removeUserFromRoom(u.name, roomId)}
                                                            >
                                                                Remove
                                                            </button>
                                                            <button
                                                                className={cls("FloatRoomConfirmBtn")}
                                                                onClick={() => setConfirmRemoveRoom(null)}
                                                            >
                                                                Cancel
                                                            </button>
                                                        </span>
                                                    ) : isBusy ? (
                                                        <span className={cls("FloatChipSpinner")} />
                                                    ) : (
                                                        <span className={cls("FloatRoomActions")}>
                                                            {/* Open room */}
                                                            {node?.matrixRoomId && (
                                                                <button
                                                                    className={cls("FloatRoomBtn")}
                                                                    title="Open room"
                                                                    onClick={() => {
                                                                        dis.dispatch({
                                                                            action: Action.ViewRoom,
                                                                            room_id: node.matrixRoomId!,
                                                                        });
                                                                    }}
                                                                >
                                                                    <svg
                                                                        viewBox="0 0 14 14"
                                                                        width="12"
                                                                        height="12"
                                                                        fill="none"
                                                                        stroke="currentColor"
                                                                        strokeWidth="1.5"
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                    >
                                                                        <path d="M6 2H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8" />
                                                                        <path d="M9 1h4v4" />
                                                                        <line x1="13" y1="1" x2="6" y2="8" />
                                                                    </svg>
                                                                </button>
                                                            )}
                                                            {/* Admin toggle */}
                                                            <button
                                                                className={`${cls("FloatRoomBtn")}${isAdmin ? " active" : ""}${isPowerBusy ? " busy" : ""}`}
                                                                title={
                                                                    isAdmin ? "Remove room admin" : "Make room admin"
                                                                }
                                                                disabled={isPowerBusy}
                                                                onClick={() =>
                                                                    void toggleRoomAdmin(u.name, roomId, !isAdmin)
                                                                }
                                                            >
                                                                {isPowerBusy ? (
                                                                    <span className={cls("FloatChipSpinner")} />
                                                                ) : (
                                                                    <IcoCrown />
                                                                )}
                                                            </button>
                                                            {/* Remove */}
                                                            <button
                                                                className={`${cls("FloatRoomBtn")} danger`}
                                                                title="Remove from group"
                                                                onClick={() => setConfirmRemoveRoom(roomId)}
                                                            >
                                                                ✕
                                                            </button>
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {editUserRooms?.length === 0 && !editUserRoomsLoading && (
                                            <span className={cls("FloatEmpty")}>Not in any groups</span>
                                        )}
                                    </div>

                                    {/* Add to group — dropdown portaled to body to escape overflow clip */}
                                    <div className={cls("FloatRoomAdd")}>
                                        <input
                                            ref={roomSearchInputRef}
                                            className={cls("EditInput")}
                                            placeholder="Add to group…"
                                            value={roomAddSearch}
                                            onChange={(e) => setRoomAddSearch(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Escape") setRoomAddSearch("");
                                            }}
                                        />
                                        {roomAddSearch.trim() &&
                                            (() => {
                                                const anchor = roomSearchInputRef.current?.getBoundingClientRect();
                                                if (!anchor) return null;
                                                const q = roomAddSearch.toLowerCase();
                                                const opts = tree
                                                    .filter(
                                                        (n) =>
                                                            n.matrixRoomId &&
                                                            !editUserRooms?.includes(n.matrixRoomId) &&
                                                            (n.name.toLowerCase().includes(q) ||
                                                                (n.matrixRoomId ?? "").toLowerCase().includes(q)),
                                                    )
                                                    .slice(0, 8);
                                                return createPortal(
                                                    <div
                                                        className={cls("FloatRoomDropdown")}
                                                        style={{
                                                            position: "fixed",
                                                            left: anchor.left,
                                                            top: anchor.bottom + 4,
                                                            width: anchor.width,
                                                            zIndex: 10000,
                                                        }}
                                                    >
                                                        {opts.length === 0 ? (
                                                            <span
                                                                className={cls("FloatEmpty")}
                                                                style={{ padding: "8px 10px", display: "block" }}
                                                            >
                                                                No matches
                                                            </span>
                                                        ) : (
                                                            opts.map((n) => (
                                                                <button
                                                                    key={n.id}
                                                                    className={cls("FloatRoomOption")}
                                                                    disabled={editRoomBusyIds.has(n.matrixRoomId!)}
                                                                    onClick={() => {
                                                                        void addUserToRoom(u.name, n.matrixRoomId!);
                                                                        setRoomAddSearch("");
                                                                    }}
                                                                >
                                                                    <span>
                                                                        {n.type === "space"
                                                                            ? "🏢"
                                                                            : n.type === "dm"
                                                                              ? "👤"
                                                                              : "💬"}
                                                                    </span>
                                                                    <span dir="auto">{n.name}</span>
                                                                </button>
                                                            ))
                                                        )}
                                                    </div>,
                                                    document.body,
                                                );
                                            })()}
                                    </div>
                                </div>

                                {/* ── User actions section ── */}
                                <div className={cls("FloatSection")}>
                                    <div className={cls("FloatSectionHead")}>
                                        <span className={cls("FloatSectionTitle")}>Account</span>
                                    </div>
                                    {floatConfirm ? (
                                        <div className={cls("FloatConfirmRow")}>
                                            <span className={cls("FloatConfirmMsg")}>
                                                {floatConfirm === "ban"
                                                    ? `Deactivate ${u.name}?`
                                                    : `Permanently delete ${u.name}? This cannot be undone.`}
                                            </span>
                                            <button
                                                className={`${cls("FloatActionBtn")} danger`}
                                                onClick={async () => {
                                                    await deactivateUser(u.name, floatConfirm === "delete");
                                                    setFloatConfirm(null);
                                                    setEditingUser(null);
                                                }}
                                            >
                                                {floatConfirm === "ban" ? "Deactivate" : "Delete"}
                                            </button>
                                            <button
                                                className={cls("FloatActionBtn")}
                                                onClick={() => setFloatConfirm(null)}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <div className={cls("FloatActionBtns")}>
                                            {u.deactivated ? (
                                                <button
                                                    className={cls("FloatActionBtn")}
                                                    onClick={async () => {
                                                        await adminFetch(
                                                            `/_synapse/admin/v2/users/${encodeURIComponent(u.name)}`,
                                                            {
                                                                method: "PUT",
                                                                body: JSON.stringify({ deactivated: false }),
                                                            },
                                                        );
                                                        void loadUsers();
                                                        setEditingUser(null);
                                                    }}
                                                >
                                                    ✓ Activate user
                                                </button>
                                            ) : (
                                                <button
                                                    className={`${cls("FloatActionBtn")} warn`}
                                                    onClick={() => setFloatConfirm("ban")}
                                                >
                                                    <IcoBan /> Deactivate
                                                </button>
                                            )}
                                            <button
                                                className={`${cls("FloatActionBtn")} danger`}
                                                onClick={() => setFloatConfirm("delete")}
                                            >
                                                <IcoTrash /> Delete user
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>,
                        document.body,
                    );
                })()}

            {view === "teams" && activeServer && <ServerTeamsView server={activeServer} isDayMode={isDayMode} />}
        </div>
    );
}

// ─── Server Teams view + message pane (Admin servers tab) ──────────────────

function ServerTeamsView({ server, isDayMode }: { server: AdminServer; isDayMode: boolean }): React.ReactElement {
    const [hierarchy, setHierarchy] = useState<ServerHierarchy>({ rooms: [], spaces: [], spaceChildren: {} });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openRoomId, setOpenRoomId] = useState<string | null>(null);
    // Recipients live here (not inside the pane) so radial shift-click can
    // add/remove multiple channels without the pane being open first.
    const [recipients, setRecipients] = useState<Array<{ roomId: string; name: string }>>([]);
    const [search, setSearch] = useState("");
    const [level, setLevel] = useState(2);
    const [showNames, setShowNames] = useState(true);
    const [intervalVal, setIntervalVal] = useState<string>("24h");
    const [model, setModel] = useState<SentimentModel>("keyword");
    const [analyzing, setAnalyzing] = useState(false);
    const [dims, setDims] = useState({ w: 800, h: 500 });
    const [unread, setUnread] = useState<Record<string, number>>({});
    const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
    // Cache of members per room for hover tooltip.
    const [members, setMembers] = useState<Record<string, RoomMember[]>>({});
    // Sentiment maps — same shape renderSVG + HoverTooltip already expect.
    const [sentiment, setSentiment] = useState<Record<string, number | null>>({});
    const [sentDetail, setSentDetail] = useState<Record<string, SentDetail>>({});

    // Refs for the SVG surface + resize observer.
    const containerRef = useRef<HTMLDivElement>(null);
    const svgWrapRef = useRef<HTMLDivElement>(null);
    // Stores latest event_id per room across polls — a change = new activity.
    const lastEventIdsRef = useRef<Record<string, string>>({});
    // Layout emitted by renderSVG — used by click/hover to map coords → node.
    const layoutRef = useRef<Map<string, Segment>>(new Map());
    const dimsRef = useRef({ W: 800, H: 500, CX: 400, CY: 496 });
    // Track in-flight member fetches to avoid dupes.
    const memberFetchingRef = useRef<Set<string>>(new Set());

    const allRoomIds = useMemo(() => hierarchy.rooms.map((r) => r.roomId), [hierarchy]);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const h = await fetchServerHierarchy(server);
            setHierarchy(h);
            // Pick up the homeserver's *own* unread bookkeeping (same signal
            // Element uses to draw badges) so pre-existing unread messages
            // appear immediately, not just those that arrive after mount.
            const [seed, unreadMap] = await Promise.all([
                fetchLatestEventIds(
                    server,
                    h.rooms.map((r) => r.roomId),
                ),
                fetchUnreadCounts(server),
            ]);
            lastEventIdsRef.current = seed;
            setUnread(unreadMap);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [server]);

    useEffect(() => {
        void reload();
    }, [reload]);

    // Fetch messages per joined room and run keyword sentiment analysis (the
    // same function the local Teams Dashboard uses). If model === "ai", also
    // enrich via the hadith.ai sentiment_emotion API. Interval filters out
    // messages older than the cutoff.
    useEffect(() => {
        if (!allRoomIds.length) return;
        let cancelled = false;
        const cutoff = Date.now() - intervalMs(intervalVal);
        void (async () => {
            const chunkSize = 8;
            const bodiesByRoom: Record<string, string[]> = {};
            for (let i = 0; i < allRoomIds.length; i += chunkSize) {
                if (cancelled) return;
                const batch = allRoomIds.slice(i, i + chunkSize);
                const results = await Promise.all(batch.map((id) => fetchRoomMessages(server, id, 50).catch(() => [])));
                if (cancelled) return;
                const batchSent: Record<string, number | null> = {};
                const batchDet: Record<string, SentDetail> = {};
                for (let j = 0; j < batch.length; j++) {
                    const roomId = batch[j];
                    const filtered = results[j].filter((m) => m.ts >= cutoff);
                    const msgs = filtered.map((m) => ({ body: m.body }));
                    const { score, detail } = analyzeMessages(msgs, []);
                    batchSent[roomId] = score;
                    batchDet[roomId] = detail;
                    bodiesByRoom[roomId] = filtered.map((m) => m.body).filter((b) => b.trim().length > 0);
                }
                setSentiment((prev) => ({ ...prev, ...batchSent }));
                setSentDetail((prev) => ({ ...prev, ...batchDet }));
            }

            // Optional AI enrichment via /api/v1/embed/sentiment_emotion.
            if (model === "ai" && !cancelled) {
                const uniqueTexts = Array.from(new Set(Object.values(bodiesByRoom).flat()));
                if (uniqueTexts.length === 0) return;
                setAnalyzing(true);
                try {
                    await classifyTexts(uniqueTexts, (textMap) => {
                        if (cancelled) return;
                        setSentiment((prevSent) => {
                            setSentDetail((prevDet) => {
                                const nextDet = { ...prevDet };
                                const nextSent = { ...prevSent };
                                for (const [roomId, bodies] of Object.entries(bodiesByRoom)) {
                                    const perText = bodies
                                        .map((b) => textMap.get(b))
                                        .filter((r): r is NonNullable<typeof r> => !!r);
                                    const agg = aggregateSentimentEmotion(perText);
                                    if (!agg) continue;
                                    nextSent[roomId] = agg.score;
                                    nextDet[roomId] = {
                                        ...(nextDet[roomId] ?? { pos: [], neg: [], msgCount: bodies.length }),
                                        sentiment3: agg.sentiment,
                                        emotion: agg.emotion,
                                        topSentiment: agg.topSentiment,
                                        topEmotion: agg.topEmotion,
                                    };
                                }
                                Object.assign(prevSent, nextSent);
                                return nextDet;
                            });
                            return prevSent;
                        });
                    });
                } catch (err) {
                    console.warn("[fanoos] external AI enrichment failed:", err);
                } finally {
                    if (!cancelled) setAnalyzing(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [server, allRoomIds, intervalVal, model]);

    // Poll every 30s. Pull fresh unread counts from /sync — the same signal
    // Element uses for its own badges.
    useEffect(() => {
        if (!allRoomIds.length) return;
        const tick = async (): Promise<void> => {
            try {
                const unreadMap = await fetchUnreadCounts(server);
                setUnread(unreadMap);
            } catch {
                /* ignore transient errors */
            }
        };
        const id = window.setInterval(tick, 30_000);
        return () => window.clearInterval(id);
    }, [server, allRoomIds]);

    // Observe the SVG container size so renderSVG can fit it.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const e = entries[0];
            setDims({ w: e.contentRect.width, h: e.contentRect.height });
        });
        ro.observe(el);
        setDims({ w: el.clientWidth, h: el.clientHeight });
        return () => ro.disconnect();
    }, []);

    // Build the tree from the hierarchy fetched via /hierarchy.
    const tree = useMemo(() => buildTreeFromHierarchy(hierarchy, server.label), [hierarchy, server.label]);

    // Selected recipient ids → passed to renderSVG so shift-selected rooms
    // get the "selected" fill/border treatment on the radial.
    const selectedIds = useMemo(() => {
        const set = new Set<string>();
        for (const r of recipients) {
            const node = tree.find((n) => n.matrixRoomId === r.roomId);
            if (node) set.add(node.id);
        }
        return set;
    }, [recipients, tree]);

    // Reuse the same renderSVG the local Teams Dashboard uses.
    const rendered = useMemo(() => {
        if (!tree.length || dims.w < 100) return null;
        return renderSVG(
            tree,
            unread,
            sentiment,
            sentDetail,
            search,
            -1, // searchIdx
            level,
            showNames,
            dims.w,
            dims.h,
            openRoomId,
            selectedIds,
            isDayMode,
        );
    }, [tree, unread, sentiment, sentDetail, search, dims, openRoomId, isDayMode, level, showNames, selectedIds]);

    // Inject SVG into the DOM (renderSVG returns an SVG string).
    useEffect(() => {
        if (!rendered || !svgWrapRef.current) return;
        svgWrapRef.current.innerHTML = rendered.svg;
        layoutRef.current = rendered.layout;
        dimsRef.current = rendered.dims;
    }, [rendered]);

    // Click on a radial segment: same multi-select semantics as the local
    // Teams Dashboard.
    //   Plain click on a room   → open pane, single recipient.
    //   Shift-click on a room   → add/remove that room to the recipients
    //                             (open pane if not already open).
    //   Shift-click on a space  → bulk-add every room in the space's hierarchy.
    //   Ctrl/Cmd-click on root  → add every room on the server.
    const handleClick = useCallback(
        async (ev: React.MouseEvent) => {
            const el = (ev.target as HTMLElement).closest("[data-nodeid]");
            const nodeId = el?.getAttribute("data-nodeid");
            if (!nodeId) return;
            const n = tree.find((x) => x.id === nodeId);
            if (!n) return;

            // Ctrl/Cmd-click on root → send to all rooms.
            if ((ev.ctrlKey || ev.metaKey) && n.type === "account") {
                const all = hierarchy.rooms.map((r) => ({ roomId: r.roomId, name: r.name }));
                if (all.length === 0) return;
                setRecipients(all);
                setOpenRoomId(all[0].roomId);
                return;
            }

            // Shift-click on a space → bulk-add all its rooms.
            if (ev.shiftKey && n.type === "space" && n.matrixRoomId) {
                const kids = await fetchSpaceRooms(server, n.matrixRoomId);
                if (!kids.length) return;
                setRecipients((prev) => {
                    const set = new Set(prev.map((r) => r.roomId));
                    const additions = kids
                        .filter((k) => !set.has(k.roomId))
                        .map((k) => ({ roomId: k.roomId, name: k.name }));
                    return additions.length ? [...prev, ...additions] : prev;
                });
                if (!openRoomId) setOpenRoomId(kids[0].roomId);
                return;
            }

            // Shift-click on a room → toggle in the recipients list.
            if (ev.shiftKey && n.matrixRoomId && n.type !== "space" && n.type !== "virtual") {
                const rid = n.matrixRoomId;
                setRecipients((prev) => {
                    if (prev.some((r) => r.roomId === rid)) {
                        return prev.length > 1 ? prev.filter((r) => r.roomId !== rid) : prev;
                    }
                    return [...prev, { roomId: rid, name: n.name }];
                });
                if (!openRoomId) setOpenRoomId(rid);
                return;
            }

            // Plain click on a room → open (or replace with) single-recipient view.
            if (n.matrixRoomId && n.type !== "space" && n.type !== "virtual") {
                const rid = n.matrixRoomId;
                setUnread((prev) => (prev[rid] ? { ...prev, [rid]: 0 } : prev));
                setRecipients([{ roomId: rid, name: n.name }]);
                setOpenRoomId(rid);
                if (!members[rid] && !memberFetchingRef.current.has(rid)) {
                    memberFetchingRef.current.add(rid);
                    void fetchRoomMembers(server, rid).then((ms) => {
                        memberFetchingRef.current.delete(rid);
                        setMembers((prev) => ({ ...prev, [rid]: ms }));
                    });
                }
            }
        },
        [tree, members, server, openRoomId, hierarchy.rooms],
    );

    const handleMouseMove = useCallback(
        (ev: React.MouseEvent) => {
            const el = (ev.target as HTMLElement).closest("[data-nodeid]");
            const nodeId = el?.getAttribute("data-nodeid");
            if (nodeId) {
                setHoverInfo({ nodeId, clientX: ev.clientX, clientY: ev.clientY });
                // Lazily fetch members for the hovered room so the tooltip can show them.
                const n = tree.find((x) => x.id === nodeId);
                const roomId = n?.matrixRoomId;
                if (roomId && !members[roomId] && !memberFetchingRef.current.has(roomId)) {
                    memberFetchingRef.current.add(roomId);
                    void fetchRoomMembers(server, roomId).then((ms) => {
                        memberFetchingRef.current.delete(roomId);
                        setMembers((prev) => ({ ...prev, [roomId]: ms }));
                    });
                }
            } else if (hoverInfo) {
                setHoverInfo(null);
            }
        },
        [hoverInfo, tree, members, server],
    );

    const totalRooms = hierarchy.rooms.length + hierarchy.spaces.length;

    return (
        <div className={`mx_FanoosDashboard_stv${isDayMode ? " day" : ""}`}>
            {/* Control bar — same shape as the local Teams Dashboard's ctrlBar */}
            <div className={`mx_FanoosDashboard_ctrlBar${isDayMode ? " day" : ""}`}>
                <label className="mx_FanoosDashboard_ctrlGroup">
                    <span className="mx_FanoosDashboard_ctrlLabel">{_t("fanoos_dashboard|model")}</span>
                    <select
                        className="mx_FanoosDashboard_select"
                        value={model}
                        onChange={(e) => setModel(e.target.value as SentimentModel)}
                    >
                        <option value="keyword">{_t("fanoos_dashboard|keyword_model")}</option>
                        <option value="ai">{_t("fanoos_dashboard|ai_model")}</option>
                    </select>
                    {analyzing && (
                        <span className="mx_FanoosDashboard_analyzing" title={_t("fanoos_dashboard|analyzing")}>
                            …
                        </span>
                    )}
                </label>
                <div className="mx_FanoosDashboard_divider" />
                <label className="mx_FanoosDashboard_ctrlGroup">
                    <span className="mx_FanoosDashboard_ctrlLabel">{_t("fanoos_dashboard|interval")}</span>
                    <select
                        className="mx_FanoosDashboard_select"
                        value={intervalVal}
                        onChange={(e) => setIntervalVal(e.target.value)}
                    >
                        <option value="24h">{_t("fanoos_dashboard|interval_24h")}</option>
                        <option value="7d">{_t("fanoos_dashboard|interval_7d")}</option>
                        <option value="30d">{_t("fanoos_dashboard|interval_30d")}</option>
                        <option value="all">{_t("fanoos_dashboard|interval_all")}</option>
                    </select>
                </label>
                <div className="mx_FanoosDashboard_divider" />
                <div className="mx_FanoosDashboard_btnGroup">
                    <span className="mx_FanoosDashboard_ctrlLabel">{_t("fanoos_dashboard|depth")}</span>
                    <button
                        className={`mx_FanoosDashboard_lvlBtn${level === 1 ? " active" : ""}${isDayMode ? " day" : ""}`}
                        onClick={() => setLevel(1)}
                    >
                        1
                    </button>
                    <button
                        className={`mx_FanoosDashboard_lvlBtn${level === 2 ? " active" : ""}${isDayMode ? " day" : ""}`}
                        onClick={() => setLevel(2)}
                    >
                        2
                    </button>
                </div>
                <div className="mx_FanoosDashboard_divider" />
                <button
                    className={`mx_FanoosDashboard_lvlBtn${showNames ? " active" : ""}${isDayMode ? " day" : ""}`}
                    onClick={() => setShowNames((v) => !v)}
                    title={_t("fanoos_dashboard|names")}
                >
                    {_t("fanoos_dashboard|names")}
                </button>
                <div className="mx_FanoosDashboard_divider" />
                <div className="mx_FanoosDashboard_searchWrap">
                    <input
                        className={`mx_FanoosDashboard_searchInput${isDayMode ? " day" : ""}`}
                        type="search"
                        placeholder={_t("fanoos_dashboard|search_placeholder")}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="mx_FanoosDashboard_divider" />
                <button
                    className={`mx_FanoosDashboard_reloadBtn${isDayMode ? " day" : ""}`}
                    onClick={() => void reload()}
                    disabled={loading}
                    title={_t("fanoos_dashboard|reload")}
                >
                    ↺
                </button>
                <div className="mx_FanoosDashboard_spacer" />
                <span className="mx_FanoosDashboard_stvCount">
                    {loading ? "…" : `${totalRooms} 💬 · ${hierarchy.spaces.length} ⬡`}
                </span>
            </div>
            {error && <div className="mx_FanoosDashboard_stvError">{error}</div>}
            <div className="mx_FanoosDashboard_stvCanvas" ref={containerRef}>
                {!loading && totalRooms === 0 && (
                    <div className="mx_FanoosDashboard_stvEmpty">{_t("fanoos_dashboard|admin_stv_empty")}</div>
                )}
                <div
                    ref={svgWrapRef}
                    className="mx_FanoosDashboard_svgWrap"
                    onClick={handleClick}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setHoverInfo(null)}
                />
                {hoverInfo && (
                    <ServerHoverTooltip
                        info={hoverInfo}
                        tree={tree}
                        unread={unread}
                        sentiment={sentiment}
                        sentDetail={sentDetail}
                        members={members}
                        isDayMode={isDayMode}
                    />
                )}
            </div>
            {openRoomId && (
                <ServerMessagePane
                    server={server}
                    roomId={openRoomId}
                    roomName={hierarchy.rooms.find((r) => r.roomId === openRoomId)?.name}
                    allRooms={hierarchy.rooms}
                    spaces={hierarchy.spaces}
                    spaceChildren={hierarchy.spaceChildren}
                    recipients={recipients}
                    setRecipients={setRecipients}
                    onClose={() => {
                        setOpenRoomId(null);
                        setRecipients([]);
                    }}
                    isDayMode={isDayMode}
                    sentiment={sentiment[openRoomId] ?? null}
                    sentDetail={sentDetail[openRoomId]}
                    members={members[openRoomId]}
                />
            )}
        </div>
    );
}

/** Hover tooltip for the external Teams view — same shape as the local
 *  HoverTooltip: title, sentiment band + percentage bar, message-count,
 *  keyword chips, unread, members. Members come from a cache populated
 *  on hover in the parent.
 */
function ServerHoverTooltip({
    info,
    tree,
    unread,
    sentiment,
    sentDetail,
    members,
    isDayMode,
}: {
    info: HoverInfo;
    tree: TreeNode[];
    unread: Record<string, number>;
    sentiment: Record<string, number | null>;
    sentDetail: Record<string, SentDetail>;
    members: Record<string, RoomMember[]>;
    isDayMode: boolean;
}): React.ReactElement | null {
    const n = tree.find((x) => x.id === info.nodeId);
    if (!n) return null;

    // Compute the same fields the local HoverTooltip uses.
    const score =
        n.type === "space" || n.type === "virtual"
            ? avgChildSentiment(n.id, tree, sentiment)
            : n.matrixRoomId
              ? (sentiment[n.matrixRoomId] ?? null)
              : null;
    const pct = score !== null ? Math.round(score * 100) : null;
    const band = sentimentBand(score);
    const color = sentimentColor(score, isDayMode);
    const un = n.matrixRoomId ? unread[n.matrixRoomId] || 0 : 0;
    const det = n.matrixRoomId ? sentDetail[n.matrixRoomId] : null;
    const posKws = det?.pos.slice(0, 4) ?? [];
    const negKws = det?.neg.slice(0, 4) ?? [];

    const memberList = n.matrixRoomId ? (members[n.matrixRoomId] ?? []) : [];
    const shownMembers = memberList.slice(0, 5).map((m) => m.displayName);
    const extra = Math.max(0, memberList.length - 5);
    const membersLine =
        extra > 0
            ? _t("fanoos_dashboard|members_and_more", { names: shownMembers.join(", "), more: extra })
            : shownMembers.join(", ");
    const bandLabel: Record<string, string> = {
        "positive": _t("fanoos_dashboard|positive"),
        "neutral": _t("fanoos_dashboard|neutral"),
        "negative": _t("fanoos_dashboard|negative"),
        "no-data": _t("fanoos_dashboard|no_data"),
    };

    const isRtl = document.documentElement.dir === "rtl";
    const winW = UIStore.instance.windowWidth;
    const TIP_W = 250;
    const tipX = isRtl ? Math.max(0, info.clientX - TIP_W - 14) : Math.min(info.clientX + 14, winW - TIP_W - 4);
    const tipY = Math.max(8, Math.min(info.clientY - 10, UIStore.instance.windowHeight - 200));
    const tipStyle: React.CSSProperties = isRtl ? { right: winW - tipX - TIP_W, top: tipY } : { left: tipX, top: tipY };

    return createPortal(
        <div className={`mx_FanoosDashboard_hoverTip${isDayMode ? " day" : ""}`} style={tipStyle}>
            <div className="mx_FanoosDashboard_htTitle">
                {n.type === "dm" ? "👤" : n.type === "space" ? "⬡" : "💬"} {n.name}
            </div>
            {pct !== null && (
                <div className="mx_FanoosDashboard_htScore" style={{ color }}>
                    <span className="mx_FanoosDashboard_htBand">{bandLabel[band]}</span>
                    <span className="mx_FanoosDashboard_htPct">{pct}%</span>
                    <div className="mx_FanoosDashboard_htBar">
                        <div className="mx_FanoosDashboard_htBarFill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                </div>
            )}
            {det && det.msgCount > 0 && (
                <div className="mx_FanoosDashboard_htMsgCount">
                    {det.msgCount} {_t("fanoos_dashboard|messages_analysed")}
                </div>
            )}
            {(posKws.length > 0 || negKws.length > 0) && (
                <div className="mx_FanoosDashboard_htKeywords">
                    {posKws.length > 0 && (
                        <div className="mx_FanoosDashboard_htKwRow">
                            {posKws.map((w) => (
                                <span key={w} className="mx_FanoosDashboard_htKw pos">
                                    {w}
                                </span>
                            ))}
                        </div>
                    )}
                    {negKws.length > 0 && (
                        <div className="mx_FanoosDashboard_htKwRow">
                            {negKws.map((w) => (
                                <span key={w} className="mx_FanoosDashboard_htKw neg">
                                    {w}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {un > 0 && (
                <div className="mx_FanoosDashboard_htUnread">{_t("fanoos_dashboard|unread_badge", { count: un })}</div>
            )}
            {memberList.length > 0 && <div className="mx_FanoosDashboard_htMembers">{membersLine}</div>}
        </div>,
        document.body,
    );
}

function ServerMessagePane({
    server,
    roomId,
    roomName,
    allRooms,
    spaces,
    spaceChildren,
    recipients,
    setRecipients,
    onClose,
    isDayMode,
    sentiment,
    sentDetail,
    members,
}: {
    server: AdminServer;
    roomId: string;
    roomName?: string;
    allRooms: ServerRoom[];
    spaces: ServerRoom[];
    spaceChildren: Record<string, string[]>;
    recipients: Array<{ roomId: string; name: string }>;
    setRecipients: React.Dispatch<React.SetStateAction<Array<{ roomId: string; name: string }>>>;
    onClose: () => void;
    isDayMode: boolean;
    sentiment?: number | null;
    sentDetail?: SentDetail;
    members?: RoomMember[];
}): React.ReactElement {
    const [messages, setMessages] = useState<RoomMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notMember, setNotMember] = useState(false);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editorRef = useRef<HTMLDivElement>(null);
    const colorInputRef = useRef<HTMLInputElement>(null);
    const savedRangeRef = useRef<Range | null>(null);
    // Draggable window state — same shape as local SendWindow.
    const [pos, setPos] = useState<{ x: number; y: number }>(() => {
        const winW = UIStore.instance.windowWidth;
        const winH = UIStore.instance.windowHeight;
        return { x: Math.max(20, (winW - 560) / 2), y: Math.max(20, (winH - 640) / 2) };
    });
    const [size, setSize] = useState<{ w: number; h: number }>({ w: 560, h: 640 });
    const [minimized, setMinimized] = useState(false);
    const [showAnalysis, setShowAnalysis] = useState(false);
    const [showEmoji, setShowEmoji] = useState(false);
    const [recording, setRecording] = useState(false);
    const mediaRecRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordStartRef = useRef(0);
    // Which message's reaction picker is currently open (eventId), or null.
    const [reactionFor, setReactionFor] = useState<string | null>(null);
    // Multi-recipient broadcast state lives in the parent so radial shift-click
    // can manipulate it before/while the pane is open. The parent (handleClick
    // in ServerTeamsView) seeds recipients when a room is clicked, so we don't
    // need to seed here.
    const [showRecipients, setShowRecipients] = useState(false);
    const [recipientSearch, setRecipientSearch] = useState("");
    // Banner listing rooms just successfully sent to.
    const [sent, setSent] = useState<string[]>([]);

    const singleRecipient = recipients.length === 1 ? recipients[0] : null;
    const activeRoomId = singleRecipient?.roomId ?? null;

    const toggleRecipient = useCallback(
        (r: ServerRoom): void => {
            setRecipients((prev) => {
                if (prev.some((x) => x.roomId === r.roomId)) {
                    // Never let the list drop to empty.
                    if (prev.length === 1) return prev;
                    return prev.filter((x) => x.roomId !== r.roomId);
                }
                return [...prev, { roomId: r.roomId, name: r.name }];
            });
        },
        [setRecipients],
    );

    const removeRecipient = useCallback(
        (rid: string): void => {
            setRecipients((prev) => (prev.length > 1 ? prev.filter((r) => r.roomId !== rid) : prev));
        },
        [setRecipients],
    );

    // Cache of space → resolved children, populated on first click of each space.
    const [spaceKidsCache, setSpaceKidsCache] = useState<Record<string, ServerRoom[]>>({});
    // Anchor for shift-click range selection in the room list.
    const [rowAnchor, setRowAnchor] = useState<number | null>(null);

    /**
     * Toggle every child of a space at once. Fetches the space's rooms live
     * via /hierarchy the first time (so it works even if the initial
     * hierarchy didn't capture every child), then adds/removes them.
     */
    const toggleSpace = useCallback(
        async (spaceId: string): Promise<void> => {
            let kids = spaceKidsCache[spaceId];
            if (!kids) {
                // First click on this space — fetch its rooms live.
                kids = await fetchSpaceRooms(server, spaceId);
                // Fallback: merge with anything we already knew from the initial hierarchy.
                const fallbackIds = spaceChildren[spaceId] ?? [];
                for (const fid of fallbackIds) {
                    if (kids.some((k) => k.roomId === fid)) continue;
                    const r = allRooms.find((x) => x.roomId === fid);
                    if (r) kids.push(r);
                }
                setSpaceKidsCache((prev) => ({ ...prev, [spaceId]: kids! }));
            }
            if (kids.length === 0) return;
            setRecipients((prev) => {
                const currentSet = new Set(prev.map((r) => r.roomId));
                const allSelected = kids!.every((k) => currentSet.has(k.roomId));
                if (allSelected) {
                    const kidIds = new Set(kids!.map((k) => k.roomId));
                    const filtered = prev.filter((r) => !kidIds.has(r.roomId));
                    return filtered.length ? filtered : prev;
                }
                const additions = kids!
                    .filter((k) => !currentSet.has(k.roomId))
                    .map((k) => ({ roomId: k.roomId, name: k.name }));
                return [...prev, ...additions];
            });
        },
        [server, spaceChildren, allRooms, spaceKidsCache, setRecipients],
    );

    /** For a given space, compute selection state across its child rooms. */
    const spaceSelectionState = useCallback(
        (spaceId: string): "none" | "partial" | "all" => {
            const kids = spaceChildren[spaceId] ?? [];
            if (kids.length === 0) return "none";
            const rset = new Set(recipients.map((r) => r.roomId));
            const selectedCount = kids.filter((k) => rset.has(k)).length;
            if (selectedCount === 0) return "none";
            if (selectedCount === kids.length) return "all";
            return "partial";
        },
        [recipients, spaceChildren],
    );

    const q = recipientSearch.trim().toLowerCase();
    const filteredSpaces = q ? spaces.filter((s) => s.name.toLowerCase().includes(q)) : spaces;
    const filteredRooms = q ? allRooms.filter((r) => r.name.toLowerCase().includes(q)) : allRooms;
    const posRef = useRef(pos);
    const sizeRef = useRef(size);
    useEffect(() => {
        posRef.current = pos;
    }, [pos]);
    useEffect(() => {
        sizeRef.current = size;
    }, [size]);

    const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
        if (e.button !== 0) return;
        e.preventDefault();
        const ox = e.clientX - posRef.current.x;
        const oy = e.clientY - posRef.current.y;
        const onMove = (ev: MouseEvent): void => {
            const x = Math.max(0, Math.min(ev.clientX - ox, UIStore.instance.windowWidth - sizeRef.current.w));
            const y = Math.max(0, Math.min(ev.clientY - oy, UIStore.instance.windowHeight - 40));
            setPos({ x, y });
        };
        const onUp = (): void => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }, []);

    const handleResizeStart = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = sizeRef.current.w;
        const startH = sizeRef.current.h;
        const onMove = (ev: MouseEvent): void => {
            const w = Math.max(320, startW + ev.clientX - startX);
            const h = Math.max(300, startH + ev.clientY - startY);
            setSize({ w, h });
        };
        const onUp = (): void => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }, []);

    const saveSelection = useCallback((): void => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        // Only save selections that live inside our editor.
        if (editorRef.current?.contains(range.commonAncestorContainer)) {
            savedRangeRef.current = range.cloneRange();
        }
    }, []);

    const restoreSelection = useCallback((): void => {
        const range = savedRangeRef.current;
        if (!range || !editorRef.current) return;
        editorRef.current.focus();
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    }, []);

    const insertAtCursor = useCallback(
        (text: string): void => {
            const el = editorRef.current;
            if (!el) return;
            const savedInside = savedRangeRef.current && el.contains(savedRangeRef.current.commonAncestorContainer);
            if (savedInside) {
                restoreSelection();
            } else {
                // No saved selection (user opened the picker before clicking
                // into the editor). Put the cursor at the end.
                el.focus();
                const range = document.createRange();
                range.selectNodeContents(el);
                range.collapse(false);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
            document.execCommand("insertText", false, text);
            setDraft(el.innerText);
        },
        [restoreSelection],
    );

    const applyFormat = useCallback(
        (cmd: string, value?: string): void => {
            restoreSelection();
            document.execCommand(cmd, false, value);
            if (editorRef.current) setDraft(editorRef.current.innerText);
        },
        [restoreSelection],
    );

    /** Convert the contentEditable's rich HTML into the plaintext body Matrix expects. */
    const plainFromHtml = useCallback((): string => {
        return editorRef.current?.innerText.trim() ?? "";
    }, []);

    const reload = useCallback(async () => {
        // Multi-recipient mode: no chat history to fetch — the compose surface
        // takes over and we skip straight to "ready".
        if (!activeRoomId) {
            setMessages([]);
            setLoading(false);
            setNotMember(false);
            setError(null);
            return;
        }
        try {
            const rows = await fetchRoomMessages(server, activeRoomId, 50);
            setMessages(rows);
            setNotMember(false);
            setError(null);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/M_FORBIDDEN|not.*member|not in the room/i.test(msg)) {
                setNotMember(true);
                setError(null);
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    }, [server, activeRoomId]);

    useEffect(() => {
        void reload();
        const id = window.setInterval(reload, 5000);
        return () => window.clearInterval(id);
    }, [reload]);

    // Auto-scroll to bottom when new messages arrive.
    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [messages]);

    const join = useCallback(async () => {
        if (!activeRoomId) return;
        try {
            await joinServerRoom(server, activeRoomId);
            setNotMember(false);
            await reload();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [server, activeRoomId, reload]);

    /**
     * Broadcast helper: run `op(rid)` against every recipient in parallel,
     * collect the room names that succeeded, and surface them in the
     * "✓ sent to …" banner.
     */
    const broadcast = useCallback(
        async (op: (rid: string) => Promise<unknown>): Promise<void> => {
            setSending(true);
            setError(null);
            const results = await Promise.allSettled(recipients.map((r) => op(r.roomId)));
            const okRooms: string[] = [];
            const failures: string[] = [];
            results.forEach((res, idx) => {
                if (res.status === "fulfilled") okRooms.push(recipients[idx].name);
                else failures.push(`${recipients[idx].name}: ${(res.reason as Error).message}`);
            });
            setSending(false);
            if (okRooms.length) {
                setSent(okRooms);
                // Fade the banner after a moment.
                window.setTimeout(() => setSent([]), 4000);
            }
            if (failures.length) setError(failures.join(" · "));
        },
        [recipients],
    );

    const send = useCallback(async () => {
        if (!editorRef.current) return;
        const html = editorRef.current.innerHTML.trim();
        const plain = editorRef.current.innerText.trim();
        if (!plain) return;
        const hasFormatting = /<(b|i|u|s|strong|em|font|span|br|p|ul|ol|li)\b/i.test(html);
        await broadcast((rid) => sendRoomMessage(server, rid, plain, hasFormatting ? html : undefined));
        if (editorRef.current) editorRef.current.innerHTML = "";
        setDraft("");
        await reload();
    }, [server, reload, broadcast]);

    const onFilePick = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
                const mxc = await uploadMedia(server, file);
                const msgtype = file.type.startsWith("image/")
                    ? "m.image"
                    : file.type.startsWith("audio/")
                      ? "m.audio"
                      : "m.file";
                await broadcast((rid) => sendRoomMedia(server, rid, mxc, file, msgtype));
                await reload();
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            }
        },
        [server, reload, broadcast],
    );

    // Toggle a reaction on a message. If the admin has already reacted with
    // this emoji, redact their previous m.reaction event; otherwise send a new one.
    const toggleReaction = useCallback(
        async (msg: RoomMessage, emoji: string) => {
            setReactionFor(null);
            const existing = msg.reactions?.[emoji];
            try {
                if (existing?.mine && existing.myEventId) {
                    await redactEvent(server, roomId, existing.myEventId);
                } else {
                    await sendReaction(server, roomId, msg.eventId, emoji);
                }
                await reload();
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            }
        },
        [server, roomId, reload],
    );

    const toggleRecording = useCallback(async () => {
        if (recording) {
            mediaRecRef.current?.stop();
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            void broadcast; // keep dep-tracker happy for the closure below
            const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
            audioChunksRef.current = [];
            recordStartRef.current = Date.now();
            mr.ondataavailable = (ev: BlobEvent): void => {
                if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
            };
            mr.onstop = async (): Promise<void> => {
                stream.getTracks().forEach((t) => t.stop());
                const durationMs = Date.now() - recordStartRef.current;
                const blob = new Blob(audioChunksRef.current, { type: "audio/ogg; codecs=opus" });
                setRecording(false);
                try {
                    const mxc = await uploadMediaBlob(server, blob, "voice-message.ogg");
                    await broadcast((rid) =>
                        sendRoomMedia(server, rid, mxc, blob, "m.audio", {
                            durationMs,
                            body: "Voice message",
                            voiceMessage: true,
                        }),
                    );
                    await reload();
                } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                }
            };
            mr.start();
            mediaRecRef.current = mr;
            setRecording(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }, [recording, server, reload, broadcast]);

    // Draggable window, same behaviour as the local SendWindow (chrome + drag/
    // resize/minimize/analysis-toggle). Instead of a modal overlay we pin the
    // pane at `pos` so multiple can coexist and be moved around.
    const bandColors: Record<string, string> = {
        "positive": "#22c55e",
        "neutral": "#eab308",
        "negative": "#ef4444",
        "no-data": isDayMode ? "#94a3b8" : "#475569",
    };
    const pct = sentiment != null ? Math.round(sentiment * 100) : null;
    const scoreColor = sentimentColor(sentiment ?? null, isDayMode);
    const band = sentimentBand(sentiment ?? null);

    const showSidePanel = showAnalysis || showRecipients;
    return createPortal(
        <div
            className={`mx_FanoosDashboard_sendWindow${isDayMode ? " day" : ""}${minimized ? " minimized" : ""}${
                showSidePanel ? " withPanel" : ""
            }${!singleRecipient ? " noHistory" : ""}`}
            style={{
                left: pos.x,
                top: pos.y,
                width: size.w + (showSidePanel ? 220 : 0),
                height: minimized ? undefined : size.h,
            }}
        >
            {/* Header — drag handle + control buttons */}
            <div className="mx_FanoosDashboard_cbHdr" onMouseDown={handleDragStart}>
                <span className="mx_FanoosDashboard_cbDragHandle">⠿</span>
                <span className="mx_FanoosDashboard_cbTitle">
                    {recipients.length > 1 ? `📢 ${recipients.length}` : `💬 ${roomName || roomId}`}
                </span>
                <button
                    className={`mx_FanoosDashboard_cbCtrl${showRecipients ? " active" : ""}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => {
                        setShowRecipients((v) => !v);
                        if (!showRecipients) setShowAnalysis(false);
                    }}
                    title={_t("fanoos_dashboard|recipients")}
                >
                    👥
                </button>
                <button
                    className={`mx_FanoosDashboard_cbCtrl${showAnalysis ? " active" : ""}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => {
                        setShowAnalysis((v) => !v);
                        if (!showAnalysis) setShowRecipients(false);
                    }}
                    title={_t("fanoos_dashboard|analysis")}
                    disabled={!singleRecipient}
                >
                    📊
                </button>
                <button
                    className="mx_FanoosDashboard_cbCtrl"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setMinimized((v) => !v)}
                    title={minimized ? _t("fanoos_dashboard|expand") : _t("fanoos_dashboard|minimize")}
                >
                    {minimized ? "▲" : "▼"}
                </button>
                <button
                    className="mx_FanoosDashboard_cbCtrl"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={onClose}
                    title={_t("fanoos_dashboard|close")}
                >
                    ✕
                </button>
            </div>

            {!minimized && (
                <div className={`mx_FanoosDashboard_swBody${showSidePanel ? " withPanel" : ""}`}>
                    {/* Recipients side panel — spaces (bulk toggle) + rooms (individual) */}
                    {showRecipients && !showAnalysis && (
                        <div className="mx_FanoosDashboard_swRecipientsPanel">
                            <div className="mx_FanoosDashboard_swRpHdr">{_t("fanoos_dashboard|recipients")}</div>
                            <input
                                className="mx_FanoosDashboard_swRpSearch"
                                type="search"
                                placeholder={_t("fanoos_dashboard|search_placeholder")}
                                value={recipientSearch}
                                onChange={(e) => setRecipientSearch(e.target.value)}
                            />
                            <div className="mx_FanoosDashboard_swRpList">
                                {filteredSpaces.length > 0 && (
                                    <>
                                        <div className="mx_FanoosDashboard_swRpHdr" style={{ padding: "6px 12px 2px" }}>
                                            ⬡ {_t("fanoos_dashboard|admin_tab_spaces")}
                                        </div>
                                        {filteredSpaces.map((s) => {
                                            const state = spaceSelectionState(s.roomId);
                                            // Prefer the fetched cache count; fall back to the initial hierarchy.
                                            const kidCount =
                                                spaceKidsCache[s.roomId]?.length ??
                                                (spaceChildren[s.roomId] ?? []).length;
                                            const check = state === "all" ? "✓" : state === "partial" ? "◐" : "+";
                                            return (
                                                <div
                                                    key={s.roomId}
                                                    className={`mx_FanoosDashboard_swRpRow${
                                                        state !== "none" ? " selected" : ""
                                                    }`}
                                                    onClick={() => void toggleSpace(s.roomId)}
                                                >
                                                    <span className="mx_FanoosDashboard_swRpCheck">{check}</span>
                                                    <span className="mx_FanoosDashboard_swRpName">⬡ {s.name}</span>
                                                    <span className="mx_FanoosDashboard_swRpBadge">{kidCount}</span>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                                {filteredRooms.length > 0 && (
                                    <>
                                        <div className="mx_FanoosDashboard_swRpHdr" style={{ padding: "8px 12px 2px" }}>
                                            💬 {_t("fanoos_dashboard|channels")}
                                        </div>
                                        {filteredRooms.map((r, idx) => {
                                            const selected = recipients.some((x) => x.roomId === r.roomId);
                                            return (
                                                <div
                                                    key={r.roomId}
                                                    className={`mx_FanoosDashboard_swRpRow${
                                                        selected ? " selected" : ""
                                                    }`}
                                                    onClick={(ev) => {
                                                        // Shift-click: select range from anchor to this row.
                                                        if (ev.shiftKey && rowAnchor !== null && rowAnchor !== idx) {
                                                            const [from, to] =
                                                                rowAnchor < idx ? [rowAnchor, idx] : [idx, rowAnchor];
                                                            const range = filteredRooms.slice(from, to + 1);
                                                            setRecipients((prev) => {
                                                                const set = new Set(prev.map((x) => x.roomId));
                                                                const add = range
                                                                    .filter((x) => !set.has(x.roomId))
                                                                    .map((x) => ({
                                                                        roomId: x.roomId,
                                                                        name: x.name,
                                                                    }));
                                                                return add.length ? [...prev, ...add] : prev;
                                                            });
                                                            // Preserve text selection cleanup — user was shift-selecting.
                                                            window.getSelection()?.removeAllRanges();
                                                        } else if (ev.ctrlKey || ev.metaKey) {
                                                            // Ctrl / Cmd-click: toggle just this row (explicit non-range).
                                                            toggleRecipient(r);
                                                            setRowAnchor(idx);
                                                        } else {
                                                            toggleRecipient(r);
                                                            setRowAnchor(idx);
                                                        }
                                                    }}
                                                >
                                                    <span className="mx_FanoosDashboard_swRpCheck">
                                                        {selected ? "✓" : "+"}
                                                    </span>
                                                    <span className="mx_FanoosDashboard_swRpName">💬 {r.name}</span>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                    {/* Analysis side panel — sentiment + members, mirrors local AnalysisPanel */}
                    {showAnalysis && !showRecipients && (
                        <div className="mx_FanoosDashboard_analysisPanel">
                            <div className="mx_FanoosDashboard_apHdr">
                                <span>💬</span>
                                <span className="mx_FanoosDashboard_apHdrName">{roomName || roomId}</span>
                            </div>
                            {pct !== null && (
                                <div className="mx_FanoosDashboard_apScoreSection">
                                    <div className="mx_FanoosDashboard_apBandRow">
                                        <span className="mx_FanoosDashboard_apBand" style={{ color: bandColors[band] }}>
                                            {band}
                                        </span>
                                        <span className="mx_FanoosDashboard_apPct" style={{ color: scoreColor }}>
                                            {pct}%
                                        </span>
                                    </div>
                                    <div className="mx_FanoosDashboard_apTrack">
                                        <div
                                            className="mx_FanoosDashboard_apFill"
                                            style={{ width: `${pct}%`, background: scoreColor }}
                                        />
                                    </div>
                                </div>
                            )}
                            {sentDetail && sentDetail.msgCount > 0 && (
                                <div className="mx_FanoosDashboard_apMsgCount">
                                    {sentDetail.msgCount} {_t("fanoos_dashboard|messages_analysed")}
                                </div>
                            )}
                            {sentDetail && sentDetail.pos.length > 0 && (
                                <div className="mx_FanoosDashboard_apKwGroup">
                                    <span className="mx_FanoosDashboard_apKwLabel pos">
                                        {_t("fanoos_dashboard|positive")}
                                    </span>
                                    <div className="mx_FanoosDashboard_apKws">
                                        {sentDetail.pos.map((k) => (
                                            <span key={k} className="mx_FanoosDashboard_apKw pos">
                                                {k}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {sentDetail && sentDetail.neg.length > 0 && (
                                <div className="mx_FanoosDashboard_apKwGroup">
                                    <span className="mx_FanoosDashboard_apKwLabel neg">
                                        {_t("fanoos_dashboard|issues")}
                                    </span>
                                    <div className="mx_FanoosDashboard_apKws">
                                        {sentDetail.neg.map((k) => (
                                            <span key={k} className="mx_FanoosDashboard_apKw neg">
                                                {k}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {members && members.length > 0 && (
                                <div className="mx_FanoosDashboard_apMembers">
                                    <div className="mx_FanoosDashboard_apMembersHdr">
                                        {_t("fanoos_dashboard|members")}
                                    </div>
                                    <div className="mx_FanoosDashboard_apMembersList">
                                        {members.slice(0, 15).map((m) => (
                                            <span key={m.userId} className="mx_FanoosDashboard_apMemberChip">
                                                <span className="mx_FanoosDashboard_apMemberAv">
                                                    {(m.displayName || m.userId).slice(0, 2).toUpperCase()}
                                                </span>
                                                <span className="mx_FanoosDashboard_apMemberName">
                                                    {m.displayName || m.userId}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Main column */}
                    <div className="mx_FanoosDashboard_swMain">
                        <div className="mx_FanoosDashboard_swChips">
                            {recipients.length === 1 ? (
                                <span className="mx_FanoosDashboard_swChip">
                                    {server.label} · {recipients[0].name}
                                </span>
                            ) : (
                                recipients.map((r) => (
                                    <span key={r.roomId} className="mx_FanoosDashboard_swChip">
                                        {r.name}
                                        <button
                                            className="mx_FanoosDashboard_swChipX"
                                            onClick={() => removeRecipient(r.roomId)}
                                            title={_t("action|remove")}
                                        >
                                            ✕
                                        </button>
                                    </span>
                                ))
                            )}
                        </div>

                        {sent.length > 0 && <div className="mx_FanoosDashboard_swSentBanner">✓ {sent.join(", ")}</div>}
                        {error && (
                            <div
                                className="mx_FanoosDashboard_swSentBanner"
                                style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}
                            >
                                {error}
                            </div>
                        )}

                        {/* Chat history only for single recipient — broadcast mode is compose-only */}
                        {singleRecipient && (
                            <div className="mx_FanoosDashboard_chatHistory" ref={listRef}>
                                {loading && <div className="mx_FanoosDashboard_chLoading">⏳</div>}
                                {!loading && notMember && (
                                    <div className="mx_FanoosDashboard_chEmpty" style={{ textAlign: "center" }}>
                                        <div>{_t("fanoos_dashboard|admin_stv_not_member")}</div>
                                        <button
                                            className="mx_FanoosDashboard_cbEmojiBtn"
                                            style={{ marginTop: 10, padding: "4px 12px" }}
                                            onClick={() => void join()}
                                        >
                                            {_t("fanoos_dashboard|admin_stv_join")}
                                        </button>
                                    </div>
                                )}
                                {!loading && !notMember && messages.length === 0 && (
                                    <div className="mx_FanoosDashboard_chEmpty">
                                        {_t("fanoos_dashboard|admin_stv_no_messages")}
                                    </div>
                                )}
                                {messages.map((m) => {
                                    const senderName = m.sender.split(":")[0].replace(/^@/, "");
                                    const isOwn = m.sender === server.adminMxid;
                                    let bodyEl: React.ReactNode;
                                    if (m.msgtype === "m.image" && m.url) {
                                        bodyEl = <AuthMedia server={server} mxc={m.url} kind="img" alt={m.body} />;
                                    } else if (m.msgtype === "m.audio" && m.url) {
                                        bodyEl = <AuthMedia server={server} mxc={m.url} kind="audio" alt={m.body} />;
                                    } else if (m.msgtype === "m.video" && m.url) {
                                        bodyEl = <AuthMedia server={server} mxc={m.url} kind="video" alt={m.body} />;
                                    } else if (m.msgtype === "m.file" && m.url) {
                                        bodyEl = (
                                            <AuthMedia server={server} mxc={m.url} kind="file" filename={m.body} />
                                        );
                                    } else if (m.formattedBody) {
                                        bodyEl = (
                                            <div
                                                className="mx_FanoosDashboard_chBody mx_FanoosDashboard_chHtmlBody"
                                                dangerouslySetInnerHTML={{ __html: m.formattedBody }}
                                            />
                                        );
                                    } else {
                                        bodyEl = <div className="mx_FanoosDashboard_chBody">{m.body}</div>;
                                    }
                                    const rx = m.reactions ?? {};
                                    const rxKeys = Object.keys(rx);
                                    return (
                                        <div
                                            key={m.eventId}
                                            className={`mx_FanoosDashboard_chRow${isOwn ? " own" : ""}`}
                                        >
                                            {!isOwn && (
                                                <div className="mx_FanoosDashboard_chAvatar">
                                                    {senderName.slice(0, 2).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="mx_FanoosDashboard_chContent">
                                                {!isOwn && (
                                                    <div className="mx_FanoosDashboard_chSender">{senderName}</div>
                                                )}
                                                <div
                                                    className={`mx_FanoosDashboard_chBubbleRow${isOwn ? " own" : ""}`}
                                                    style={{ position: "relative" }}
                                                >
                                                    <div
                                                        className={`mx_FanoosDashboard_chBubble${isOwn ? " own" : ""}`}
                                                        dir="auto"
                                                    >
                                                        {bodyEl}
                                                        <div className="mx_FanoosDashboard_chTs">
                                                            {formatJalaliTime(m.ts)}
                                                        </div>
                                                    </div>
                                                    {/* React "+" button — appears on bubble hover */}
                                                    <button
                                                        className="mx_FanoosDashboard_smpReactBtn"
                                                        onClick={() =>
                                                            setReactionFor((cur) =>
                                                                cur === m.eventId ? null : m.eventId,
                                                            )
                                                        }
                                                        title={_t("action|react")}
                                                    >
                                                        😊+
                                                    </button>
                                                    {reactionFor === m.eventId && (
                                                        <div
                                                            className="mx_FanoosDashboard_smpReactPicker"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <EmojiPicker
                                                                onChoose={(unicode) => {
                                                                    void toggleReaction(m, unicode);
                                                                    return true;
                                                                }}
                                                                onFinished={() => setReactionFor(null)}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                                {rxKeys.length > 0 && (
                                                    <div className="mx_FanoosDashboard_smpReactions">
                                                        {rxKeys.map((k) => {
                                                            const b = rx[k];
                                                            return (
                                                                <button
                                                                    key={k}
                                                                    className={`mx_FanoosDashboard_smpReactionChip${
                                                                        b.mine ? " mine" : ""
                                                                    }`}
                                                                    onClick={() => void toggleReaction(m, k)}
                                                                    title={b.senders
                                                                        .map((s) => s.split(":")[0].replace(/^@/, ""))
                                                                        .join(", ")}
                                                                >
                                                                    <span>{k}</span>
                                                                    <span className="mx_FanoosDashboard_smpReactionCount">
                                                                        {b.count}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Composer — HTML rich-text editor + toolbar */}
                        {(!singleRecipient || !notMember) && (
                            <div className="mx_FanoosDashboard_cbCompose">
                                {/* HTML toolbar */}
                                <div className="mx_FanoosDashboard_htmlToolbar">
                                    <button
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            saveSelection();
                                        }}
                                        onClick={() => applyFormat("bold")}
                                        title={_t("fanoos_dashboard|html_bold")}
                                    >
                                        <b>B</b>
                                    </button>
                                    <button
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            saveSelection();
                                        }}
                                        onClick={() => applyFormat("italic")}
                                        title={_t("fanoos_dashboard|html_italic")}
                                    >
                                        <i>I</i>
                                    </button>
                                    <button
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            saveSelection();
                                        }}
                                        onClick={() => applyFormat("underline")}
                                        title={_t("fanoos_dashboard|html_underline")}
                                    >
                                        <u>U</u>
                                    </button>
                                    <button
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            saveSelection();
                                        }}
                                        onClick={() => applyFormat("strikeThrough")}
                                        title={_t("fanoos_dashboard|html_strikethrough")}
                                    >
                                        <s>S</s>
                                    </button>
                                    <span className="mx_FanoosDashboard_htmlToolbarDivider" />
                                    <label
                                        className="mx_FanoosDashboard_htmlColorBtn"
                                        title={_t("fanoos_dashboard|html_color")}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            saveSelection();
                                        }}
                                        onClick={() => colorInputRef.current?.click()}
                                    >
                                        <span>A</span>
                                        <input
                                            ref={colorInputRef}
                                            type="color"
                                            defaultValue="#e879f9"
                                            style={{
                                                position: "absolute",
                                                opacity: 0,
                                                width: 0,
                                                height: 0,
                                                pointerEvents: "none",
                                            }}
                                            onChange={(e) => applyFormat("foreColor", e.target.value)}
                                        />
                                    </label>
                                    <span className="mx_FanoosDashboard_htmlToolbarDivider" />
                                    <button
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            if (editorRef.current) editorRef.current.dir = "ltr";
                                        }}
                                        title={_t("fanoos_dashboard|html_ltr")}
                                    >
                                        ⇒
                                    </button>
                                    <button
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            if (editorRef.current) editorRef.current.dir = "rtl";
                                        }}
                                        title={_t("fanoos_dashboard|html_rtl")}
                                    >
                                        ⇐
                                    </button>
                                    <button
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            if (editorRef.current) editorRef.current.dir = "auto";
                                        }}
                                        title="Auto direction"
                                    >
                                        ⇔
                                    </button>
                                </div>
                                <div
                                    ref={editorRef}
                                    className="mx_FanoosDashboard_cbInput mx_FanoosDashboard_cbHtmlEditor"
                                    contentEditable
                                    suppressContentEditableWarning
                                    dir="auto"
                                    data-placeholder={_t("fanoos_dashboard|admin_stv_send_ph")}
                                    onInput={() => {
                                        setDraft(editorRef.current?.innerText ?? "");
                                    }}
                                    onBlur={saveSelection}
                                    onKeyUp={saveSelection}
                                    onMouseUp={saveSelection}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey && plainFromHtml()) {
                                            e.preventDefault();
                                            void send();
                                        }
                                    }}
                                    style={{
                                        minHeight: 40,
                                        maxHeight: 200,
                                        overflowY: "auto",
                                        outline: "none",
                                    }}
                                />
                                <div className="mx_FanoosDashboard_cbActions" style={{ position: "relative" }}>
                                    <button
                                        className="mx_FanoosDashboard_cbEmojiBtn"
                                        onClick={() => setShowEmoji((v) => !v)}
                                        title={_t("fanoos_dashboard|emoji_btn")}
                                        disabled={sending || recording}
                                    >
                                        😀
                                    </button>
                                    <button
                                        className="mx_FanoosDashboard_cbEmojiBtn"
                                        onClick={() => fileInputRef.current?.click()}
                                        title={_t("fanoos_dashboard|send_file")}
                                        disabled={sending || recording}
                                    >
                                        📎
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        style={{ display: "none" }}
                                        onChange={(e) => void onFilePick(e)}
                                    />
                                    <button
                                        className={`mx_FanoosDashboard_cbMic${recording ? " recording" : ""}`}
                                        onClick={() => void toggleRecording()}
                                        title={
                                            recording
                                                ? _t("fanoos_dashboard|stop_recording")
                                                : _t("fanoos_dashboard|record_voice")
                                        }
                                        disabled={sending}
                                    >
                                        🎙
                                    </button>
                                    <button
                                        className={`mx_FanoosDashboard_cbSend${sending ? " sending" : ""}`}
                                        onClick={() => void send()}
                                        disabled={sending || recording || !draft.trim()}
                                        title={_t("fanoos_dashboard|send")}
                                    >
                                        {sending ? "…" : _t("fanoos_dashboard|send")}
                                    </button>

                                    {showEmoji && (
                                        <div
                                            style={{
                                                position: "absolute",
                                                bottom: "100%",
                                                right: 0,
                                                marginBottom: 6,
                                                zIndex: 100,
                                                background: "var(--cpd-color-bg-canvas-default)",
                                                border: "1px solid rgba(148,163,184,0.3)",
                                                borderRadius: 8,
                                                boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                                            }}
                                        >
                                            <EmojiPicker
                                                onChoose={(unicode) => {
                                                    insertAtCursor(unicode);
                                                    return true;
                                                }}
                                                onFinished={() => setShowEmoji(false)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Resize handle */}
                    <div className="mx_FanoosDashboard_swResize" onMouseDown={handleResizeStart} />
                </div>
            )}
        </div>,
        document.body,
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const DASH_SETTINGS_KEY = "fanoosDashboardSettings";
const SCORES_SESSION_KEY = "fanoosDashboardScores";

const FanoosDashboard: React.FC = () => {
    const client = useMatrixClientContext();
    const svgWrapRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dashboardRef = useRef<HTMLDivElement>(null);

    const [tree, setTree] = useState<TreeNode[]>([]);
    const [unread, setUnread] = useState<Record<string, number>>(() => {
        try {
            const s = JSON.parse(sessionStorage.getItem(SCORES_SESSION_KEY) ?? "{}") as {
                unread?: Record<string, number>;
            };
            return s.unread ?? {};
        } catch {
            return {};
        }
    });
    const [sentiment, setSentiment] = useState<Record<string, number | null>>(() => {
        try {
            const s = JSON.parse(sessionStorage.getItem(SCORES_SESSION_KEY) ?? "{}") as {
                sentiment?: Record<string, number | null>;
            };
            return s.sentiment ?? {};
        } catch {
            return {};
        }
    });
    const [sentDetail, setSentDetail] = useState<Record<string, SentDetail>>(() => {
        try {
            const s = JSON.parse(sessionStorage.getItem(SCORES_SESSION_KEY) ?? "{}") as {
                sentDetail?: Record<string, SentDetail>;
            };
            return s.sentDetail ?? {};
        } catch {
            return {};
        }
    });
    const [search, setSearch] = useState("");
    const [searchHits, setSearchHits] = useState<string[]>([]);
    const [searchIdx, setSearchIdx] = useState(-1);
    const [level, setLevel] = useState<number>(() => {
        try {
            const s = JSON.parse(localStorage.getItem(DASH_SETTINGS_KEY) ?? "{}") as Record<string, unknown>;
            return s.level === 1 || s.level === 2 ? (s.level as number) : 2;
        } catch {
            return 2;
        }
    });
    const [showNames, setShowNames] = useState<boolean>(() => {
        try {
            const s = JSON.parse(localStorage.getItem(DASH_SETTINGS_KEY) ?? "{}") as Record<string, unknown>;
            return typeof s.showNames === "boolean" ? s.showNames : true;
        } catch {
            return true;
        }
    });
    const [infoPanelNode, setInfoPanelNode] = useState<string | null>(null);
    const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
    const [dims, setDims] = useState({ w: 800, h: 500 });
    const [transformStyle, setTransformStyle] = useState("");
    const [isDayMode, setIsDayMode] = useState<boolean>(() => {
        try {
            const s = JSON.parse(localStorage.getItem(DASH_SETTINGS_KEY) ?? "{}") as Record<string, unknown>;
            return typeof s.isDayMode === "boolean" ? s.isDayMode : true;
        } catch {
            return true;
        }
    });
    const [intervalVal, setIntervalVal] = useState<string>(() => {
        try {
            const s = JSON.parse(localStorage.getItem(DASH_SETTINGS_KEY) ?? "{}") as Record<string, unknown>;
            return typeof s.intervalVal === "string" ? s.intervalVal : "24h";
        } catch {
            return "24h";
        }
    });
    const [model, setModel] = useState<SentimentModel>(() => {
        try {
            const s = JSON.parse(localStorage.getItem(DASH_SETTINGS_KEY) ?? "{}") as Record<string, unknown>;
            return s.model === "ai" ? "ai" : "keyword";
        } catch {
            return "keyword";
        }
    });
    const [analyzing, setAnalyzing] = useState(false);
    const enrichReqRef = useRef(0);
    const [lastReloaded, setLastReloaded] = useState(new Date());
    const [reloadAgeStr, setReloadAgeStr] = useState(_t("fanoos_dashboard|just_now"));
    const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
    const [sendWindow, setSendWindow] = useState<SendWindowState | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [activeTab, setActiveTab] = useState<"teams" | "admin" | "servers" | "draw">("teams");

    useEffect(() => {
        const token = client.getAccessToken();
        const baseUrl = client.getHomeserverUrl();
        fetch(`${baseUrl}/_synapse/admin/v2/users?limit=1`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => {
                if (r.ok) setIsAdmin(true);
            })
            .catch(() => {});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Persist settings on change
    useEffect(() => {
        localStorage.setItem(DASH_SETTINGS_KEY, JSON.stringify({ level, showNames, isDayMode, intervalVal, model }));
    }, [level, showNames, isDayMode, intervalVal, model]);

    const layoutRef = useRef<Map<string, Segment>>(new Map());
    const dimsRef = useRef({ W: 800, H: 500, CX: 400, CY: 496 });

    // Reload age ticker
    useEffect(() => {
        const tick = (): void => setReloadAgeStr(reloadAgeLabel(lastReloaded));
        tick();
        const id = window.setInterval(tick, 30_000);
        return () => window.clearInterval(id);
    }, [lastReloaded]);

    // Build tree (room structure — only changes on membership events, not messages)
    const rebuildTree = useCallback(() => {
        setTree(buildTree(client));
        setLastReloaded(new Date());
    }, [client]);
    useEffect(rebuildTree, [rebuildTree]);

    // Refresh unread + sentiment (single pass per room, no tree rebuild)
    const refreshStats = useCallback(() => {
        const cutoff = Date.now() - intervalMs(intervalVal);
        const m: Record<string, number> = {};
        const sent: Record<string, number | null> = {};
        const det: Record<string, SentDetail> = {};
        // Bodies per room, kept for the AI enrichment pass below.
        const bodiesByRoom: Record<string, string[]> = {};
        for (const n of tree) {
            if (!n.matrixRoomId) continue;
            const r = client.getRoom(n.matrixRoomId);
            if (!r) continue;
            m[n.matrixRoomId] = RoomNotificationStateStore.instance.getRoomState(r).count;
            if (n.type !== "space") {
                const allEvs = r.getLiveTimeline().getEvents();
                const msgs = allEvs
                    .filter((ev) => ev.getType() === "m.room.message" && ev.getTs() >= cutoff)
                    .slice(-50)
                    .map((ev) => ({ body: String(ev.getContent().body || "") }));
                const reactions = allEvs
                    .filter((ev) => ev.getType() === EventType.Reaction && ev.getTs() >= cutoff)
                    .map((ev) =>
                        String((ev.getContent() as { "m.relates_to"?: { key?: string } })["m.relates_to"]?.key ?? ""),
                    )
                    .filter(Boolean);
                const { score, detail } = analyzeMessages(msgs, reactions);
                sent[n.matrixRoomId] = score;
                det[n.matrixRoomId] = detail;
                bodiesByRoom[n.matrixRoomId] = msgs.map((mm) => mm.body).filter((b) => b.trim().length > 0);
            }
        }
        setUnread(m);
        setSentiment(sent);
        setSentDetail(det);
        try {
            sessionStorage.setItem(
                SCORES_SESSION_KEY,
                JSON.stringify({ unread: m, sentiment: sent, sentDetail: det, intervalVal }),
            );
        } catch {
            /* ignore */
        }

        // AI enrichment — async, augments the keyword pass with API-based sentiment + emotions.
        // The request ref guards against stale updates when refreshStats fires again while a
        // previous call is still in-flight.
        if (model !== "ai") return;
        const req = ++enrichReqRef.current;
        // Normalise the same way the API client does so per-text lookups line up.
        const normalize = (s: string): string => (s.length > 600 ? s.slice(0, 600) : s);
        const normBodies: Record<string, string[]> = {};
        for (const [roomId, bs] of Object.entries(bodiesByRoom)) normBodies[roomId] = bs.map(normalize);
        const uniqueTexts = Array.from(new Set(Object.values(normBodies).flat()));
        if (uniqueTexts.length === 0) return;
        setAnalyzing(true);
        const applyPartial = (
            textMap: Map<
                string,
                {
                    sentiment: SentimentDist;
                    emotion: EmotionDist;
                    topSentiment: SentimentLabel;
                    topEmotion: EmotionLabel;
                }
            >,
        ): void => {
            if (req !== enrichReqRef.current) return;
            const nextSent: Record<string, number | null> = { ...sent };
            const nextDet: Record<string, SentDetail> = { ...det };
            for (const [roomId, bodies] of Object.entries(normBodies)) {
                const perText = bodies.map((b) => textMap.get(b)).filter((r): r is NonNullable<typeof r> => !!r);
                const agg = aggregateSentimentEmotion(perText);
                if (!agg) continue;
                nextSent[roomId] = agg.score;
                nextDet[roomId] = {
                    ...(nextDet[roomId] ?? { pos: [], neg: [], msgCount: bodies.length }),
                    sentiment3: agg.sentiment,
                    emotion: agg.emotion,
                    topSentiment: agg.topSentiment,
                    topEmotion: agg.topEmotion,
                };
            }
            setSentiment(nextSent);
            setSentDetail(nextDet);
            try {
                sessionStorage.setItem(
                    SCORES_SESSION_KEY,
                    JSON.stringify({ unread: m, sentiment: nextSent, sentDetail: nextDet, intervalVal }),
                );
            } catch {
                /* ignore */
            }
        };
        void classifyTexts(uniqueTexts, applyPartial)
            .catch((err) => {
                console.error("[fanoos] classifyTexts failed", err);
            })
            .finally(() => {
                if (req === enrichReqRef.current) setAnalyzing(false);
            });
    }, [tree, client, intervalVal, model]);

    useEffect(refreshStats, [refreshStats]);

    // Observe container size
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const e = entries[0];
            setDims({ w: e.contentRect.width, h: e.contentRect.height });
        });
        ro.observe(el);
        setDims({ w: el.clientWidth, h: el.clientHeight });
        return () => ro.disconnect();
    }, []);

    // When send window is open, intercept ViewRoom dispatch → switch recipient to new room
    const sendWindowOpenRef = useRef(false);
    const treeRef = useRef(tree);
    useEffect(() => {
        treeRef.current = tree;
    }, [tree]);
    useEffect(() => {
        sendWindowOpenRef.current = !!sendWindow;
    }, [sendWindow]);
    useEffect(() => {
        const token = dis.register((payload: ActionPayload) => {
            if (!sendWindowOpenRef.current) return;
            if ((payload as { action: string }).action !== Action.ViewRoom) return;
            const roomId = (payload as { room_id?: string }).room_id;
            if (!roomId) return;
            const n = treeRef.current.find(
                (x) => x.matrixRoomId === roomId && x.type !== "space" && x.type !== "virtual",
            );
            if (!n) return;
            setSendWindow((prev) =>
                prev ? { ...prev, recipients: [{ id: n.id, roomId, name: n.name }], showAnalysis: false } : null,
            );
        });
        return () => dis.unregister(token);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Derive selectedIds from sendWindow recipients so selected cells are highlighted
    const selectedIds = useMemo(
        () => (sendWindow ? new Set(sendWindow.recipients.map((r) => r.id)) : new Set<string>()),
        [sendWindow],
    );

    // Render SVG
    const rendered = useMemo(() => {
        if (!tree.length || dims.w < 100) return null;
        return renderSVG(
            tree,
            unread,
            sentiment,
            sentDetail,
            search,
            searchIdx,
            level,
            showNames,
            dims.w,
            dims.h,
            activeRoomId,
            selectedIds,
            isDayMode,
        );
    }, [
        tree,
        unread,
        sentiment,
        sentDetail,
        search,
        searchIdx,
        level,
        showNames,
        dims,
        activeRoomId,
        selectedIds,
        isDayMode,
    ]);

    useEffect(() => {
        if (!rendered || !svgWrapRef.current) return;
        svgWrapRef.current.innerHTML = rendered.svg;
        layoutRef.current = rendered.layout;
        dimsRef.current = rendered.dims;
        setSearchHits(rendered.hits);
    }, [rendered, activeTab]); // activeTab re-injects SVG when switching back to teams tab

    // Click → toggle info panel + navigate to room; shift-click → add/remove from send window
    const handleClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const nodeId = (e.target as Element).closest("[data-nodeid]")?.getAttribute("data-nodeid");
            if (!nodeId) return;
            const n = tree.find((x) => x.id === nodeId);

            // Ctrl+click on root circle → send to all channels
            if (e.ctrlKey && n?.type === "account") {
                e.preventDefault();
                const pos = computeSendWindowPos(e.clientX, e.clientY);
                const recipients = tree
                    .filter((c) => c.type !== "space" && c.type !== "virtual" && c.type !== "account" && c.matrixRoomId)
                    .map((c) => ({ id: c.id, roomId: c.matrixRoomId!, name: c.name }));
                if (recipients.length > 0) {
                    setSendWindow({
                        recipients,
                        msgText: "",
                        pos,
                        size: { w: 440, h: 520 },
                        minimized: false,
                        showRecipients: true,
                        showAnalysis: false,
                    });
                }
                return;
            }

            if (e.shiftKey && n?.matrixRoomId && n.type !== "space" && n.type !== "virtual") {
                setSendWindow((prev) => {
                    if (!prev) {
                        const pos = computeSendWindowPos(e.clientX, e.clientY);
                        return {
                            recipients: [{ id: n.id, roomId: n.matrixRoomId!, name: n.name }],
                            msgText: "",
                            pos,
                            size: { w: 440, h: 520 },
                            minimized: false,
                            showRecipients: true,
                            showAnalysis: false,
                        };
                    }
                    const already = prev.recipients.find((r) => r.id === nodeId);
                    if (already) {
                        return { ...prev, recipients: prev.recipients.filter((r) => r.id !== nodeId) };
                    }
                    return {
                        ...prev,
                        recipients: [...prev.recipients, { id: n.id, roomId: n.matrixRoomId!, name: n.name }],
                    };
                });
                return;
            }

            setInfoPanelNode((prev) => (prev === nodeId ? null : nodeId));
            if (n?.matrixRoomId && n.type !== "space" && n.type !== "virtual") {
                setActiveRoomId(n.matrixRoomId);
                dis.dispatch({ action: Action.ViewRoom, room_id: n.matrixRoomId });
            }
        },
        [tree],
    );

    // Hover → show tooltip (throttled: update only when node or coords change by ≥4px)
    const lastHoverRef = useRef<HoverInfo | null>(null);
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const nodeId = (e.target as Element).closest("[data-nodeid]")?.getAttribute("data-nodeid") ?? null;
        const prev = lastHoverRef.current;
        if (!nodeId) {
            if (prev) {
                lastHoverRef.current = null;
                setHoverInfo(null);
            }
            return;
        }
        if (
            prev &&
            prev.nodeId === nodeId &&
            Math.abs(e.clientX - prev.clientX) < 4 &&
            Math.abs(e.clientY - prev.clientY) < 4
        )
            return;
        const next = { nodeId, clientX: e.clientX, clientY: e.clientY };
        lastHoverRef.current = next;
        setHoverInfo(next);
    }, []);

    // Right-click → open unified send window (marks room as read for room nodes)
    const handleContextMenu = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            const nodeId = (e.target as Element).closest("[data-nodeid]")?.getAttribute("data-nodeid");
            if (!nodeId) return;
            const n = tree.find((x) => x.id === nodeId);
            if (!n) return;
            const pos = computeSendWindowPos(e.clientX, e.clientY);
            if (n.type === "account") {
                // Root circle → send to ALL channels
                const recipients = tree
                    .filter((c) => c.type !== "space" && c.type !== "virtual" && c.type !== "account" && c.matrixRoomId)
                    .map((c) => ({ id: c.id, roomId: c.matrixRoomId!, name: c.name }));
                if (recipients.length > 0) {
                    setSendWindow({
                        recipients,
                        msgText: "",
                        pos,
                        size: { w: 440, h: 520 },
                        minimized: false,
                        showRecipients: true,
                        showAnalysis: false,
                    });
                }
                return;
            }
            if (n.type === "space" || n.type === "virtual") {
                const recipients = tree
                    .filter((c) => c.parentId === n.id && c.matrixRoomId)
                    .map((c) => ({ id: c.id, roomId: c.matrixRoomId!, name: c.name }));
                if (recipients.length > 0) {
                    setSendWindow({
                        recipients,
                        msgText: "",
                        pos,
                        size: { w: 320, h: 480 },
                        minimized: false,
                        showRecipients: false,
                        showAnalysis: false,
                    });
                }
                return;
            }
            if (!n.matrixRoomId) return;
            // Mark room as read when opening the send window
            const room = client.getRoom(n.matrixRoomId);
            if (room) {
                const evs = room.getLiveTimeline().getEvents();
                const lastEv = evs[evs.length - 1];
                if (lastEv) {
                    void client.sendReadReceipt(lastEv);
                }
            }
            setSendWindow({
                recipients: [{ id: n.id, roomId: n.matrixRoomId, name: n.name }],
                msgText: "",
                pos,
                size: { w: 320, h: 480 },
                minimized: false,
                showRecipients: false,
                showAnalysis: false,
            });
        },
        [tree, client],
    );

    // Prevent right-button mousedown from bubbling (some browsers scroll-to-top on right mousedown)
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button === 2) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, []);

    // Search navigation
    const focusOnNode = useCallback((nodeId: string): void => {
        const seg = layoutRef.current.get(nodeId);
        const { W, H, CX, CY } = dimsRef.current;
        if (!seg || !W) return;
        const midR = (seg.r1 + seg.r2) / 2;
        const fx = CX + midR * Math.cos(seg.mid);
        const fy = CY - midR * Math.sin(seg.mid);
        const ZOOM = 2.4;
        setTransformStyle(
            `translate(${(W / 2 - fx * ZOOM).toFixed(1)}px,${(H / 2 - fy * ZOOM).toFixed(1)}px) scale(${ZOOM})`,
        );
    }, []);

    const searchNext = useCallback(() => {
        if (!searchHits.length) return;
        const idx = (searchIdx + 1) % searchHits.length;
        setSearchIdx(idx);
        focusOnNode(searchHits[idx]);
    }, [searchHits, searchIdx, focusOnNode]);

    const searchPrev = useCallback(() => {
        if (!searchHits.length) return;
        const idx = (searchIdx - 1 + searchHits.length) % searchHits.length;
        setSearchIdx(idx);
        focusOnNode(searchHits[idx]);
    }, [searchHits, searchIdx, focusOnNode]);

    const resetZoom = useCallback(() => {
        setTransformStyle("");
        setSearchIdx(-1);
    }, []);

    const zoomIn = useCallback(() => {
        const m = transformStyle.match(/scale\(([^)]+)\)/);
        const s = m ? parseFloat(m[1]) : 1;
        const base = transformStyle.replace(/\s*scale\([^)]+\)/, "").trim();
        setTransformStyle(`${base} scale(${Math.min(s * 1.3, 6).toFixed(2)})`.trim());
    }, [transformStyle]);

    const zoomOut = useCallback(() => {
        const m = transformStyle.match(/scale\(([^)]+)\)/);
        const s = m ? parseFloat(m[1]) : 1;
        const ns = Math.max(s / 1.3, 0.3);
        if (ns <= 0.35) {
            resetZoom();
            return;
        }
        const base = transformStyle.replace(/\s*scale\([^)]+\)/, "").trim();
        setTransformStyle(`${base} scale(${ns.toFixed(2)})`.trim());
    }, [transformStyle, resetZoom]);

    const handleFullscreen = useCallback(() => {
        const el = dashboardRef.current;
        if (!el) return;
        if (!document.fullscreenElement) {
            el.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }, []);

    const searchCount = !search.trim()
        ? ""
        : !searchHits.length
          ? "0"
          : `${searchIdx >= 0 ? searchIdx + 1 : "–"}/${searchHits.length}`;
    const canvasStyle = isDayMode
        ? { background: "linear-gradient(180deg, #b8d4f0 0%, #dce9f8 40%, #e8eff8 100%)" }
        : { background: "#0a1628" };

    return (
        <div className={`mx_FanoosDashboard${isDayMode ? " day" : " night"}`} ref={dashboardRef}>
            {/* ── Dashboard Tabs ── */}
            <div className={`mx_FanoosDashboard_tabBar${isDayMode ? " day" : ""}`}>
                <div className="mx_FanoosDashboard_tabList">
                    <button
                        className={`mx_FanoosDashboard_tab${activeTab === "teams" ? " active" : ""}${isDayMode ? " day" : ""}`}
                        onClick={() => setActiveTab("teams")}
                    >
                        <span className="mx_FanoosDashboard_tabIcon">🌐</span>
                        {_t("fanoos_dashboard|tab_teams")}
                    </button>
                    {isAdmin && (
                        <button
                            className={`mx_FanoosDashboard_tab${activeTab === "admin" ? " active" : ""}${isDayMode ? " day" : ""}`}
                            onClick={() => setActiveTab("admin")}
                        >
                            <span className="mx_FanoosDashboard_tabIcon">⚙️</span>
                            {_t("fanoos_dashboard|tab_admin")}
                        </button>
                    )}
                    <button
                        className={`mx_FanoosDashboard_tab${activeTab === "servers" ? " active" : ""}${isDayMode ? " day" : ""}`}
                        onClick={() => setActiveTab("servers")}
                    >
                        <span className="mx_FanoosDashboard_tabIcon">🖥️</span>
                        {_t("fanoos_dashboard|tab_servers")}
                    </button>
                    <button
                        className={`mx_FanoosDashboard_tab${activeTab === "draw" ? " active" : ""}${isDayMode ? " day" : ""}`}
                        onClick={() => setActiveTab("draw")}
                    >
                        <span className="mx_FanoosDashboard_tabIcon">✏️</span>
                        {_t("fanoos_dashboard|draw_tab")}
                    </button>
                </div>
                {(() => {
                    // Compute the underline position for the animated tab indicator.
                    // Tab order: teams, [admin?], servers, draw
                    const tabCount = isAdmin ? 4 : 3;
                    const width = `${(100 / tabCount).toFixed(3)}%`;
                    const idx =
                        activeTab === "teams"
                            ? 0
                            : activeTab === "admin"
                              ? 1
                              : activeTab === "servers"
                                ? isAdmin
                                    ? 2
                                    : 1
                                : /* draw */ tabCount - 1;
                    return (
                        <div
                            className="mx_FanoosDashboard_tabIndicator"
                            style={{
                                transform: `translateX(${idx * 100}%)`,
                                width,
                            }}
                        />
                    );
                })()}
            </div>

            {/* Keep all tab content mounted; toggle visibility with display so state is preserved on tab switch */}
            <div style={{ display: activeTab === "teams" ? "contents" : "none" }}>
                <>
                    {/* ── Row 2: Model + Interval + Depth + Names + Search + Zoom + Reload + Mode + Fullscreen ── */}
                    <div className={`mx_FanoosDashboard_ctrlBar${isDayMode ? " day" : ""}`}>
                        {/* Model */}
                        <label className="mx_FanoosDashboard_ctrlGroup">
                            <span className="mx_FanoosDashboard_ctrlLabel">{_t("fanoos_dashboard|model")}</span>
                            <select
                                className="mx_FanoosDashboard_select"
                                value={model}
                                onChange={(e) => setModel(e.target.value as SentimentModel)}
                            >
                                <option value="keyword">{_t("fanoos_dashboard|keyword_model")}</option>
                                <option value="ai">{_t("fanoos_dashboard|ai_model")}</option>
                            </select>
                            {analyzing && (
                                <span className="mx_FanoosDashboard_analyzing" title={_t("fanoos_dashboard|analyzing")}>
                                    …
                                </span>
                            )}
                        </label>

                        <div className="mx_FanoosDashboard_divider" />

                        {/* Interval */}
                        <label className="mx_FanoosDashboard_ctrlGroup">
                            <span className="mx_FanoosDashboard_ctrlLabel">{_t("fanoos_dashboard|interval")}</span>
                            <select
                                className="mx_FanoosDashboard_select"
                                value={intervalVal}
                                onChange={(e) => setIntervalVal(e.target.value)}
                            >
                                <option value="24h">{_t("fanoos_dashboard|interval_24h")}</option>
                                <option value="7d">{_t("fanoos_dashboard|interval_7d")}</option>
                                <option value="30d">{_t("fanoos_dashboard|interval_30d")}</option>
                                <option value="all">{_t("fanoos_dashboard|interval_all")}</option>
                            </select>
                        </label>

                        <div className="mx_FanoosDashboard_divider" />

                        {/* Depth group */}
                        <div className="mx_FanoosDashboard_btnGroup">
                            <span className="mx_FanoosDashboard_ctrlLabel">{_t("fanoos_dashboard|depth")}</span>
                            <button
                                className={`mx_FanoosDashboard_lvlBtn${level === 1 ? " active" : ""}${isDayMode ? " day" : ""}`}
                                onClick={() => setLevel(1)}
                            >
                                1
                            </button>
                            <button
                                className={`mx_FanoosDashboard_lvlBtn${level === 2 ? " active" : ""}${isDayMode ? " day" : ""}`}
                                onClick={() => setLevel(2)}
                            >
                                2
                            </button>
                        </div>

                        <div className="mx_FanoosDashboard_divider" />

                        {/* Names toggle */}
                        <button
                            className={`mx_FanoosDashboard_lvlBtn${showNames ? " active" : ""}${isDayMode ? " day" : ""}`}
                            onClick={() => setShowNames((v) => !v)}
                            title={_t("fanoos_dashboard|names")}
                        >
                            {_t("fanoos_dashboard|names")}
                        </button>

                        <div className="mx_FanoosDashboard_divider" />

                        {/* Search */}
                        <div className="mx_FanoosDashboard_searchWrap">
                            <input
                                className={`mx_FanoosDashboard_searchInput${isDayMode ? " day" : ""}`}
                                type="search"
                                placeholder={_t("fanoos_dashboard|search_placeholder")}
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setSearchIdx(-1);
                                    if (!e.target.value.trim()) resetZoom();
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") searchNext();
                                }}
                            />
                            {searchCount && <span className="mx_FanoosDashboard_searchCount">{searchCount}</span>}
                            {searchHits.length > 0 && (
                                <>
                                    <button
                                        className={`mx_FanoosDashboard_navBtn${isDayMode ? " day" : ""}`}
                                        onClick={searchPrev}
                                        title="Previous"
                                    >
                                        ‹
                                    </button>
                                    <button
                                        className={`mx_FanoosDashboard_navBtn${isDayMode ? " day" : ""}`}
                                        onClick={searchNext}
                                        title="Next"
                                    >
                                        ›
                                    </button>
                                </>
                            )}
                        </div>

                        <div className="mx_FanoosDashboard_divider" />

                        {/* Zoom group */}
                        <div className="mx_FanoosDashboard_btnGroup">
                            <button
                                className={`mx_FanoosDashboard_zoomBtn${isDayMode ? " day" : ""}`}
                                onClick={zoomIn}
                                title="Zoom in"
                            >
                                +
                            </button>
                            <button
                                className={`mx_FanoosDashboard_zoomBtn${isDayMode ? " day" : ""}`}
                                onClick={resetZoom}
                                title="Reset zoom"
                            >
                                ⊙
                            </button>
                            <button
                                className={`mx_FanoosDashboard_zoomBtn${isDayMode ? " day" : ""}`}
                                onClick={zoomOut}
                                title="Zoom out"
                            >
                                −
                            </button>
                        </div>

                        <div className="mx_FanoosDashboard_divider" />

                        {/* Reload */}
                        <button
                            className={`mx_FanoosDashboard_reloadBtn${isDayMode ? " day" : ""}`}
                            onClick={rebuildTree}
                            title={_t("fanoos_dashboard|reload")}
                        >
                            ↺ <span className="mx_FanoosDashboard_reloadAge">{reloadAgeStr}</span>
                        </button>

                        <div className="mx_FanoosDashboard_spacer" />

                        {/* Mode + Fullscreen */}
                        <button
                            className={`mx_FanoosDashboard_modeBtn${isDayMode ? " day" : ""}`}
                            onClick={() => setIsDayMode((v) => !v)}
                        >
                            {isDayMode ? _t("fanoos_dashboard|night") : _t("fanoos_dashboard|day")}
                        </button>
                        <button
                            className={`mx_FanoosDashboard_fsBtn${isDayMode ? " day" : ""}`}
                            onClick={handleFullscreen}
                            title={_t("fanoos_dashboard|fullscreen")}
                        >
                            {_t("fanoos_dashboard|fullscreen")}
                        </button>
                    </div>

                    {/* ── Canvas ── */}
                    <div className="mx_FanoosDashboard_canvasWrap" ref={containerRef} style={canvasStyle}>
                        {tree.length > 0 && (
                            <LegendOverlay tree={tree} sentiment={sentiment} level={level} isDayMode={isDayMode} />
                        )}
                        <div
                            ref={svgWrapRef}
                            className="mx_FanoosDashboard_svgWrap"
                            style={{
                                transform: transformStyle,
                                transition: "transform 0.42s cubic-bezier(0.25,0.46,0.45,0.94)",
                                transformOrigin: "0 0",
                            }}
                            onClick={handleClick}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={() => {
                                lastHoverRef.current = null;
                                setHoverInfo(null);
                            }}
                            onMouseDown={handleMouseDown}
                            onContextMenu={handleContextMenu}
                        />
                        {!tree.length && (
                            <div className={`mx_FanoosDashboard_empty${isDayMode ? " day" : ""}`}>
                                {_t("fanoos_dashboard|no_rooms")}
                            </div>
                        )}
                    </div>

                    {/* ── Hover tooltip (fixed, follows mouse) ── */}
                    {hoverInfo && (
                        <HoverTooltip
                            info={hoverInfo}
                            tree={tree}
                            sentiment={sentiment}
                            sentDetail={sentDetail}
                            unread={unread}
                            client={client}
                            isDayMode={isDayMode}
                        />
                    )}

                    {/* ── Info panel (slide-in) ── */}
                    {infoPanelNode && (
                        <InfoPanel
                            nodeId={infoPanelNode}
                            tree={tree}
                            sentiment={sentiment}
                            sentDetail={sentDetail}
                            unread={unread}
                            onClose={() => setInfoPanelNode(null)}
                            client={client}
                            isDayMode={isDayMode}
                        />
                    )}
                </>
            </div>

            {isAdmin && (
                <div style={{ display: activeTab === "admin" ? "contents" : "none" }}>
                    <AdminPanel client={client} tree={tree} isDayMode={isDayMode} onRefresh={rebuildTree} />
                </div>
            )}

            {/* "Admin servers" — visible to any logged-in user. Manage users on
                any homeserver the user has admin credentials for. */}
            <div style={{ display: activeTab === "servers" ? "contents" : "none" }}>
                <AdminPanel
                    client={client}
                    tree={tree}
                    isDayMode={isDayMode}
                    onRefresh={rebuildTree}
                    mode="servers-only"
                />
            </div>

            <div style={{ display: activeTab === "draw" ? "contents" : "none" }}>
                <FanoosDrawTab isDayMode={isDayMode} client={client} />
            </div>

            {/* ── Send window (unified single/multi-channel compose) ── */}
            {sendWindow &&
                createPortal(
                    <SendWindow
                        state={sendWindow}
                        onChange={setSendWindow}
                        onClose={() => setSendWindow(null)}
                        client={client}
                        isDayMode={isDayMode}
                        tree={tree}
                        unread={unread}
                        sentiment={sentiment}
                        sentDetail={sentDetail}
                    />,
                    document.body,
                )}
        </div>
    );
};

export default FanoosDashboard;
