/*
Copyright 2024 New Vector Ltd.
Copyright 2026 LLM-LAB (Fanoos fork)

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { EventType, RoomEvent, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import type { ActionPayload } from "../../dispatcher/payloads";

import { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import { RoomNotificationStateStore } from "../../stores/notifications/RoomNotificationStateStore";
import dis from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";
import { useEventEmitter } from "../../hooks/useEventEmitter";
import { _t } from "../../languageHandler";
import UIStore from "../../stores/UIStore";
import { mediaFromMxc } from "../../customisations/Media";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SendWindowState {
    recipients: Array<{ id: string; roomId: string; name: string }>;
    msgText: string;
    pos: { x: number; y: number };
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
}

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
    "good","great","thanks","thank","yes","done","ok","okay","perfect","nice",
    "awesome","excellent","success","agree","love","happy","well","wonderful",
    "sure","correct","right","approved","ready","completed","finished","achievement",
    "congrats","bravo","solved","fixed","merged","shipped","deployed","works","resolved",
    // Arabic
    "جيد","ممتاز","شكرا","شكراً","نعم","تمام","موافق","رائع","صحيح","أحسنت",
    "مبروك","نجح","نجحت","اكتمل","اكتملت","جاهز","حلو","ممتازة","رائعة","تمت",
    "صح","حسناً","أتممت","أكملت","ممتازة","ناجح","ناجحة","تم","انتهى","انتهت",
    // Persian
    "خوب","عالی","ممنون","بله","باشه","باشد","موافقم","آفرین","درست","درسته",
    "آماده","موفق","موفقیت","تموم","خوبه","عالیه","ممنونم","مرسی","تأیید","تایید",
    "کامل","کامله","قبوله","اوکی","اوکیه","حل شد","انجام شد","آپلود","درسته","بله",
]);

const NEG_WORDS = new Set([
    // English
    "bad","no","not","never","failed","fail","error","issue","problem","bug",
    "wrong","broken","sorry","unfortunately","cant","cannot","blocked","stuck",
    "delayed","late","missing","urgent","alert","trouble","critical","warning","oops",
    "crash","regression","revert","rollback","outage","down","offline","timeout",
    // Arabic
    "سيء","خطأ","خطا","لا","مشكلة","مشكله","خلل","معطل","معطلة","متأخر",
    "متأخرة","عاجل","تحذير","فشل","فشلت","للأسف","آسف","آسفة","عالق",
    "مكسور","تأخير","مفقود","مفقودة","خطر","خطير","عطل","توقف","توقفت",
    // Persian
    "بد","اشتباه","نه","مشکل","باگ","خراب","خرابه","معطل","دیر","فوری",
    "هشدار","شکست","متأسفانه","متاسفانه","گیر","بلوک","ارور","خطا",
    "اضطراری","گم","مفقود","ایراد","کرش","قطع","خاموش","کند",
]);

const TOKENIZE_RE = /[\s\u060c\u061b\u061f\u06d4،؟!,.;:'"()[\]{}|/\\@#$%^&*+=<>~`]+/u;

function tokenize(text: string): string[] {
    return text.toLowerCase().split(TOKENIZE_RE).filter((t) => t.length > 1);
}

/** Analyse messages in a single pass — returns score + keyword lists. */
function analyzeMessages(msgs: { body: string }[]): { score: number | null; detail: SentDetail } {
    if (!msgs.length) return { score: null, detail: { pos: [], neg: [], msgCount: 0 } };
    let posCount = 0;
    let negCount = 0;
    const posFound = new Set<string>();
    const negFound = new Set<string>();
    for (const m of msgs) {
        for (const t of tokenize(m.body)) {
            if (POS_WORDS.has(t)) { posCount++; posFound.add(t); }
            if (NEG_WORDS.has(t)) { negCount++; negFound.add(t); }
        }
    }
    const total = posCount + negCount;
    const score = total === 0 ? 0.5 : Math.max(0.05, Math.min(0.95, 0.5 + (posCount - negCount) / Math.max(total * 1.5, 4)));
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
            const isDm = childRoom.getDMInviter() !== undefined || (childRoom.getJoinedMemberCount() === 2 && !childRoom.isSpaceRoom());
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
                    layout.set(kid.id, { a1: ka1, a2: ka1 + arcPerCol, r1: kr1, r2: kr1 + radPerRow, depth: 2, mid: ka1 + arcPerCol / 2 });
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
        return [`M ${f(px(ro, ra1))} ${f(py(ro, ra1))}`, `A ${f(ro)} ${f(ro)} 0 ${large} 0 ${f(px(ro, ra2))} ${f(py(ro, ra2))}`, `L ${f(cx)} ${f(cy)}`, "Z"].join(" ");
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
    searchQuery: string,
    searchIdx: number,
    level: number,
    showNames: boolean,
    W: number,
    H: number,
    activeRoomId: string | null,
    selectedIds: Set<string>,
    isDayMode: boolean,
): { svg: string; layout: Map<string, Segment>; dims: { W: number; H: number; CX: number; CY: number }; hits: string[] } {
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
        r1In = rRoot + 8; r1Out = rMax; r2In = rMax; r2Out = rMax;
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
        const score = seg.depth === 1 ? avgChildSentiment(id, tree, sentiment) : n.matrixRoomId ? sentiment[n.matrixRoomId] : null;
        const color = n.type === "space" || n.type === "virtual" ? "#6366f1" : sentimentColor(score, isDayMode);
        const glowPath = makeSegPath(CX, CY, { ...seg, r1: Math.max(0, seg.r1 - 4), r2: seg.r2 + 4 }, 0);
        if (glowPath) {
            parts.push(`<path d="${glowPath}" fill="${color}" opacity="${isDayMode ? 0.06 : 0.10}" filter="url(#tdGlowSeg)" pointer-events="none"/>`);
        }
    });

    const envParts: string[] = [];

    // Segment pass
    layout.forEach((seg, id) => {
        const n = tree.find((x) => x.id === id);
        if (!n) return;

        if (seg.depth === 0) {
            const pc = "#6366f1";
            parts.push(`<circle cx="${CX.toFixed(1)}" cy="${CY.toFixed(1)}" r="${(rRoot + 12).toFixed(1)}" fill="${pc}" opacity="0.12" filter="url(#tdGlowMd)"/>`);
            parts.push(`<circle cx="${CX.toFixed(1)}" cy="${CY.toFixed(1)}" r="${rRoot.toFixed(1)}" fill="${pc}" opacity="0.88"/>`);
            parts.push(`<circle cx="${CX.toFixed(1)}" cy="${(CY - rRoot * 0.3).toFixed(1)}" r="${(rRoot * 0.38).toFixed(1)}" fill="white" opacity="0.25"/>`);
            if (showNames) {
                const tColor = isDayMode ? "rgba(30,41,59,0.55)" : "rgba(255,255,255,0.28)";
                parts.push(`<text x="${CX.toFixed(1)}" y="${(CY + rRoot + 11).toFixed(1)}" text-anchor="middle" fill="${tColor}" font-size="9" font-family="system-ui,sans-serif" pointer-events="none">${escHtml(n.name)}</text>`);
            }
            return;
        }

        const score = seg.depth === 1 ? avgChildSentiment(n.id, tree, sentiment) : n.matrixRoomId ? sentiment[n.matrixRoomId] : null;
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
        parts.push(`<path d="${path}" fill="${segBodyColor}" opacity="${dim ? 0.40 : segBodyOpacity}"/>`);

        const lightOp = dim ? 0.04 : isVirtual ? (isDayMode ? 0.22 : 0.30) : (isDayMode ? 0.20 : 0.28);
        if ((isActive || un > 0) && !dim) {
            parts.push(`<path d="${path}" fill="${color}" opacity="${lightOp + 0.18}" filter="url(#tdGlowMd)"/>`);
        } else {
            parts.push(`<path d="${path}" fill="${color}" opacity="${lightOp}"/>`);
        }

        if (!dim && seg.r2 - seg.r1 > 28) {
            const sR2 = seg.r2 - gapPx;
            const sR1 = sR2 - Math.max(3, (seg.r2 - seg.r1) * 0.08);
            const specPath = makeSegPath(CX, CY, { a1: seg.a1, a2: seg.a2, r1: sR1, r2: sR2, depth: seg.depth, mid: seg.mid }, gapPx + 0.5);
            if (specPath) parts.push(`<path d="${specPath}" fill="${specularFill}" pointer-events="none"/>`);
        }

        if (isActive) {
            parts.push(`<path d="${path}" fill="none" stroke="#6366f1" stroke-width="1.8" opacity="0.92"/>`);
        } else if (isFocused) {
            parts.push(`<path d="${path}" fill="${isDayMode ? "rgba(99,102,241,0.12)" : "white"}" opacity="0.14"/>`);
            parts.push(`<path d="${path}" fill="none" stroke="${isDayMode ? "#6366f1" : "white"}" stroke-width="2.2" opacity="0.95"/>`);
        } else if (isHit) {
            parts.push(`<path d="${path}" fill="none" stroke="${isDayMode ? "#6366f1" : "white"}" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.65"/>`);
        } else {
            parts.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="${seg.depth === 1 ? 0.9 : 0.6}" opacity="${dim ? 0.08 : isDayMode ? 0.45 : 0.32}"/>`);
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
                    ? (isDayMode ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.12)")
                    : isHit ? (isDayMode ? "#1e3a8a" : "white")
                    : isVirtual ? (isDayMode ? "rgba(49,46,129,0.92)" : "rgba(199,210,254,0.88)")
                    : (isDayMode ? "rgba(15,23,42,0.82)" : "rgba(226,232,240,0.80)");
                parts.push(`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rotDeg.toFixed(1)},${tx.toFixed(1)},${ty.toFixed(1)})" fill="${tColor}" font-size="${fontSize}" font-weight="${isVirtual ? 700 : 500}" font-family="system-ui,sans-serif" pointer-events="none">${escHtml(label)}</text>`);
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
                envParts.push(`<circle cx="${(ex + ew).toFixed(1)}" cy="${(ey - eh).toFixed(1)}" r="${br}" fill="#ef4444" stroke="white" stroke-width="1" pointer-events="none"/>`);
                envParts.push(`<text x="${(ex + ew).toFixed(1)}" y="${(ey - eh).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="7" font-weight="800" fill="white" pointer-events="none">${badge}</text>`);
            }
        }

        // Transparent hit area
        parts.push(`<path d="${path}" id="tdnode-${safeId}" data-nodeid="${id}" fill="transparent" style="cursor:pointer"/>`);
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

// ─── Common emoji sets ─────────────────────────────────────────────────────────

const QUICK_EMOJIS = ["👍","👎","❤️","😂","😊","🙏","🎉","😢","🔥","✅","❌","🤔","😡","💯","👀","✨","💪","🥳"];
const STICKER_EMOJIS = ["🎊","🎂","🎁","🌟","💝","🏆","🌈","🦁","🐶","🌺","⚡","💫","🎵","🍕","☕","🚀","🎈","🎯"];

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

const HoverTooltip: React.FC<HoverTooltipProps> = ({ info, tree, sentiment, sentDetail, unread, client, isDayMode }) => {
    const n = tree.find((x) => x.id === info.nodeId);
    if (!n) return null;

    const score = n.type === "space" || n.type === "virtual"
        ? avgChildSentiment(n.id, tree, sentiment)
        : n.matrixRoomId ? sentiment[n.matrixRoomId] : null;
    const pct = score !== null ? Math.round(score * 100) : null;
    const band = sentimentBand(score);
    const color = sentimentColor(score, isDayMode);
    const un = n.matrixRoomId ? unread[n.matrixRoomId] || 0 : 0;
    const det = n.matrixRoomId ? sentDetail[n.matrixRoomId] : null;

    const room = n.matrixRoomId ? client.getRoom(n.matrixRoomId) : null;
    const allMembers = room ? room.getJoinedMembers() : [];
    const memberNames = allMembers.slice(0, 5).map((m) => m.name || m.userId);
    const extra = Math.max(0, allMembers.length - 5);

    const membersLine = extra > 0
        ? _t("fanoos_dashboard|members_and_more", { names: memberNames.join(", "), more: extra })
        : memberNames.join(", ");

    const bandLabel: Record<string, string> = {
        positive: _t("fanoos_dashboard|positive"),
        neutral: _t("fanoos_dashboard|neutral"),
        negative: _t("fanoos_dashboard|negative"),
        "no-data": _t("fanoos_dashboard|no_data"),
    };

    const posKws = det?.pos.slice(0, 4) ?? [];
    const negKws = det?.neg.slice(0, 4) ?? [];

    const isRtl = document.documentElement.dir === "rtl";
    const winW = UIStore.instance.windowWidth;
    const TIP_W = 250;
    const tipX = isRtl
        ? Math.max(0, info.clientX - TIP_W - 14)
        : Math.min(info.clientX + 14, winW - TIP_W - 4);
    const tipY = Math.max(8, Math.min(info.clientY - 10, UIStore.instance.windowHeight - 200));
    const tipStyle: React.CSSProperties = isRtl
        ? { right: winW - tipX - TIP_W, top: tipY }
        : { left: tipX, top: tipY };

    return createPortal(
        <div
            className={`mx_FanoosDashboard_hoverTip${isDayMode ? " day" : ""}`}
            style={tipStyle}
        >
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
                                <span key={w} className="mx_FanoosDashboard_htKw pos">{w}</span>
                            ))}
                        </div>
                    )}
                    {negKws.length > 0 && (
                        <div className="mx_FanoosDashboard_htKwRow">
                            {negKws.map((w) => (
                                <span key={w} className="mx_FanoosDashboard_htKw neg">{w}</span>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {un > 0 && (
                <div className="mx_FanoosDashboard_htUnread">
                    {_t("fanoos_dashboard|unread_badge", { count: un })}
                </div>
            )}
            {allMembers.length > 0 && (
                <div className="mx_FanoosDashboard_htMembers">{membersLine}</div>
            )}
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
        if (playing) { audio.pause(); setPlaying(false); }
        else { void audio.play().then(() => setPlaying(true)); }
    }, [playing]);

    const seek = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
        const bar = barRef.current;
        const audio = audioRef.current;
        if (!bar || !audio || !total) return;
        const rect = bar.getBoundingClientRect();
        audio.currentTime = ((e.clientX - rect.left) / rect.width) * total;
    }, [total]);

    return (
        <div className={`mx_FanoosDashboard_voicePlayer${isDayMode ? " day" : ""}`}>
            <audio
                ref={audioRef}
                src={url}
                onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setTotal(e.currentTarget.duration)}
                onEnded={() => { setPlaying(false); setCurrent(0); }}
            />
            <button className="mx_FanoosDashboard_vpBtn" onClick={toggle}>{playing ? "⏸" : "▶"}</button>
            <div ref={barRef} className="mx_FanoosDashboard_vpBar" onClick={seek}>
                <div className="mx_FanoosDashboard_vpFill" style={{ width: `${total > 0 ? (current / total) * 100 : 0}%` }} />
            </div>
            <span className="mx_FanoosDashboard_vpTime">{formatVoiceTime(current)} / {formatVoiceTime(total)}</span>
        </div>
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
    const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
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
            (entries) => { if (entries[0].isIntersecting) void loadMore(); },
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
                const ts = new Date(ev.getTs());
                const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const msgType = ev.getContent().msgtype;
                const isAudio = msgType === "m.audio";
                const isMedia = msgType === "m.image" || msgType === "m.file" || msgType === "m.video";
                const showingReactions = reactionTargetId === evId;

                const sendReaction = (emoji: string): void => {
                    setReactionTargetId(null);
                    void client.sendEvent(roomId, "m.reaction" as any, { "m.relates_to": { rel_type: "m.annotation", event_id: evId, key: emoji } });
                };

                return (
                    <div
                        key={evId}
                        className={`mx_FanoosDashboard_chRow${isOwn ? " own" : ""}`}
                        onMouseLeave={() => setReactionTargetId(null)}
                    >
                        {!isOwn && (
                            <div className="mx_FanoosDashboard_chAvatar">
                                {senderName.slice(0, 2).toUpperCase()}
                            </div>
                        )}
                        <div className="mx_FanoosDashboard_chContent">
                            {!isOwn && <div className="mx_FanoosDashboard_chSender">{senderName}</div>}
                            <div
                                className={`mx_FanoosDashboard_chBubble${isOwn ? " own" : ""}`}
                                dir="auto"
                                onMouseEnter={() => setReactionTargetId(evId)}
                            >
                                {isAudio ? (() => {
                                    const mxcUrl = ev.getContent().url as string | undefined;
                                    const httpUrl = mxcUrl ? mediaFromMxc(mxcUrl).srcHttp ?? "" : "";
                                    const durMs = (ev.getContent().info as { duration?: number } | undefined)?.duration;
                                    return httpUrl
                                        ? <VoicePlayer url={httpUrl} durationMs={durMs} isDayMode={isDayMode} />
                                        : <span className="mx_FanoosDashboard_chMedia">🎵 {body}</span>;
                                })() : isMedia ? (
                                    <span className="mx_FanoosDashboard_chMedia">📎 {body}</span>
                                ) : (
                                    <span className="mx_FanoosDashboard_chBody">{body}</span>
                                )}
                                <span className="mx_FanoosDashboard_chTime">{timeStr}</span>
                            </div>
                            {showingReactions && (
                                <div className={`mx_FanoosDashboard_chReactionBar${isOwn ? " own" : ""}`}>
                                    {QUICK_EMOJIS.slice(0, 8).map((em) => (
                                        <button
                                            key={em}
                                            className="mx_FanoosDashboard_chReactionBtn"
                                            onClick={() => sendReaction(em)}
                                        >{em}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}

            <div ref={bottomRef} />
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

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ roomId, tree, sentiment, sentDetail, unread, isDayMode, client }) => {
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
        positive: "#22c55e", neutral: "#eab308", negative: "#ef4444",
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
                        <span className="mx_FanoosDashboard_apBand" style={{ color: bandColors[band] }}>{band}</span>
                        <span className="mx_FanoosDashboard_apPct" style={{ color }}>{pct}%</span>
                    </div>
                    <div className="mx_FanoosDashboard_apTrack">
                        <div className="mx_FanoosDashboard_apFill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                </div>
            )}
            {det.msgCount > 0 && (
                <div className="mx_FanoosDashboard_apMsgCount">{det.msgCount} {_t("fanoos_dashboard|messages_analysed")}</div>
            )}
            {det.pos.length > 0 && (
                <div className="mx_FanoosDashboard_apKwGroup">
                    <span className="mx_FanoosDashboard_apKwLabel pos">{_t("fanoos_dashboard|positive")}</span>
                    <div className="mx_FanoosDashboard_apKws">
                        {det.pos.map((k) => <span key={k} className="mx_FanoosDashboard_apKw pos">{k}</span>)}
                    </div>
                </div>
            )}
            {det.neg.length > 0 && (
                <div className="mx_FanoosDashboard_apKwGroup">
                    <span className="mx_FanoosDashboard_apKwLabel neg">{_t("fanoos_dashboard|issues")}</span>
                    <div className="mx_FanoosDashboard_apKws">
                        {det.neg.map((k) => <span key={k} className="mx_FanoosDashboard_apKw neg">{k}</span>)}
                    </div>
                </div>
            )}
            {members.length > 0 && (
                <div className="mx_FanoosDashboard_apMembers">
                    <div className="mx_FanoosDashboard_apMembersHdr">{_t("fanoos_dashboard|members")}</div>
                    <div className="mx_FanoosDashboard_apMembersList">
                        {members.map((m) => (
                            <span key={m.userId} className="mx_FanoosDashboard_apMemberChip">
                                <span className="mx_FanoosDashboard_apMemberAv">{(m.name || "?").slice(0, 2).toUpperCase()}</span>
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

const SendWindow: React.FC<SendWindowProps> = ({ state, onChange, onClose, client, isDayMode, tree, unread, sentiment, sentDetail }) => {
    const [sending, setSending] = useState(false);
    const [recording, setRecording] = useState(false);
    const [recipientSearch, setRecipientSearch] = useState("");
    const [sent, setSent] = useState<string[]>([]);
    const [showEmojiPicker, setShowEmojiPicker] = useState<"emoji" | "sticker" | null>(null);
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    const mediaRecRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordStartRef = useRef<number>(0);

    const sendVoiceMessage = useCallback(async (blob: Blob, durationMs: number): Promise<void> => {
        setSending(true);
        try {
            const upload = await client.uploadContent(blob, { type: "audio/ogg; codecs=opus", name: "voice-message.ogg" });
            const mxcUrl = (upload as { content_uri: string }).content_uri;
            for (const r of stateRef.current.recipients) {
                await client.sendMessage(r.roomId, {
                    msgtype: "m.audio" as any,
                    body: "Voice message",
                    url: mxcUrl,
                    info: { mimetype: "audio/ogg; codecs=opus", size: blob.size, duration: durationMs },
                    "org.matrix.msc3245.voice": {},
                });
            }
        } catch (e) {
            console.error("Failed to send voice message:", e);
        } finally {
            setSending(false);
        }
    }, [client]);

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

    const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
        if (e.button !== 0) return;
        e.preventDefault();
        const ox = e.clientX - stateRef.current.pos.x;
        const oy = e.clientY - stateRef.current.pos.y;
        const onMove = (ev: MouseEvent): void => {
            const x = Math.max(0, Math.min(ev.clientX - ox, UIStore.instance.windowWidth - 360));
            const y = Math.max(0, Math.min(ev.clientY - oy, UIStore.instance.windowHeight - 40));
            onChange({ ...stateRef.current, pos: { x, y } });
        };
        const onUp = (): void => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }, [onChange]);

    const send = async (): Promise<void> => {
        if (!state.msgText.trim() || sending || !state.recipients.length) return;
        setSending(true);
        const results: string[] = [];
        try {
            for (const r of state.recipients) {
                await client.sendTextMessage(r.roomId, state.msgText.trim());
                results.push(r.name);
            }
            setSent(results);
            onChange({ ...state, msgText: "" });
        } catch (e) {
            console.error("Failed to send:", e);
        } finally {
            setSending(false);
        }
    };

    const insertEmoji = (emoji: string): void => {
        onChange({ ...stateRef.current, msgText: stateRef.current.msgText + emoji });
        setShowEmojiPicker(null);
    };

    const sendSticker = async (emoji: string): Promise<void> => {
        setShowEmojiPicker(null);
        if (!stateRef.current.recipients.length) return;
        for (const r of stateRef.current.recipients) {
            await client.sendTextMessage(r.roomId, emoji);
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
            onChange({ ...stateRef.current, recipients: [...stateRef.current.recipients, { id: n.id, roomId: n.matrixRoomId!, name: n.name }] });
        }
    };

    const toggleAnalysis = useCallback((): void => {
        const next = !stateRef.current.showAnalysis;
        const winW = UIStore.instance.windowWidth;
        const newX = next
            ? Math.max(0, stateRef.current.pos.x - 280)
            : Math.min(winW - 320, stateRef.current.pos.x + 280);
        onChange({ ...stateRef.current, showAnalysis: next, showRecipients: false, pos: { x: newX, y: stateRef.current.pos.y } });
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

    return (
        <div
            className={`mx_FanoosDashboard_sendWindow${isDayMode ? " day" : ""}${state.minimized ? " minimized" : ""}${showSidePanel ? " withPanel" : ""}${state.showAnalysis && !state.minimized && singleRecipient ? " withAnalysis" : ""}`}
            style={{ left: state.pos.x, top: state.pos.y }}
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
                        title="Analysis"
                    >📊</button>
                )}
                <button
                    className={`mx_FanoosDashboard_cbCtrl${state.showRecipients ? " active" : ""}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => onChange({ ...stateRef.current, showRecipients: !stateRef.current.showRecipients, showAnalysis: false })}
                    title="Recipients"
                >👥</button>
                <button
                    className="mx_FanoosDashboard_cbCtrl"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => onChange({ ...stateRef.current, minimized: !stateRef.current.minimized })}
                    title={state.minimized ? "Expand" : "Minimize"}
                >
                    {state.minimized ? "▲" : "▼"}
                </button>
                <button
                    className="mx_FanoosDashboard_cbCtrl"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={onClose}
                    title="Close"
                >✕</button>
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
                                            <span className="mx_FanoosDashboard_swRpCheck">{isSelected ? "✓" : "+"}</span>
                                            <span className="mx_FanoosDashboard_swRpName">{n.type === "dm" ? "👤" : "💬"} {n.name}</span>
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
                                        <button className="mx_FanoosDashboard_swChipX" onClick={() => removeRecipient(r.id)}>✕</button>
                                    </span>
                                ))}
                            </div>
                        )}

                        {sent.length > 0 && (
                            <div className="mx_FanoosDashboard_swSentBanner">✓ {sent.join(", ")}</div>
                        )}

                        {/* Chat history only for single recipient */}
                        {singleRecipient && (
                            <ChatHistory roomId={singleRecipient.roomId} client={client} isDayMode={isDayMode} />
                        )}

                        <div className="mx_FanoosDashboard_cbCompose">
                            {/* Emoji / Sticker picker panel */}
                            {showEmojiPicker && (
                                <div className={`mx_FanoosDashboard_emojiPicker${isDayMode ? " day" : ""}`}>
                                    {(showEmojiPicker === "emoji" ? QUICK_EMOJIS : STICKER_EMOJIS).map((em) => (
                                        <button
                                            key={em}
                                            className="mx_FanoosDashboard_emojiBtn"
                                            onClick={() => showEmojiPicker === "emoji" ? insertEmoji(em) : void sendSticker(em)}
                                        >{em}</button>
                                    ))}
                                </div>
                            )}
                            <textarea
                                className="mx_FanoosDashboard_cbInput"
                                dir="auto"
                                value={state.msgText}
                                onChange={(e) => onChange({ ...state, msgText: e.target.value })}
                                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                                placeholder={state.recipients.length > 1
                                    ? `Send to ${state.recipients.length} channels…`
                                    : _t("fanoos_dashboard|send_placeholder")}
                                rows={2}
                            />
                            <div className="mx_FanoosDashboard_cbActions">
                                <button
                                    className={`mx_FanoosDashboard_cbEmojiBtn${showEmojiPicker === "emoji" ? " active" : ""}`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => setShowEmojiPicker((v) => v === "emoji" ? null : "emoji")}
                                    title="Emoji"
                                >😊</button>
                                <button
                                    className={`mx_FanoosDashboard_cbEmojiBtn${showEmojiPicker === "sticker" ? " active" : ""}`}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => setShowEmojiPicker((v) => v === "sticker" ? null : "sticker")}
                                    title="Sticker"
                                >🎭</button>
                                <button
                                    className={`mx_FanoosDashboard_cbMic${recording ? " recording" : ""}`}
                                    onClick={() => void toggleRecording()}
                                    title={recording ? "Stop recording" : "Record voice message"}
                                    disabled={sending}
                                >
                                    🎙
                                </button>
                                <button
                                    className={`mx_FanoosDashboard_cbSend${sending ? " sending" : ""}`}
                                    onClick={() => void send()}
                                    disabled={sending || !state.recipients.length}
                                >
                                    {state.recipients.length > 1 ? "📢 " : ""}{_t("fanoos_dashboard|send")}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
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

const InfoPanel: React.FC<InfoPanelProps> = ({ nodeId, tree, sentiment, sentDetail, unread, onClose, client, isDayMode }) => {
    const n = tree.find((x) => x.id === nodeId);
    if (!n) return null;

    const score = n.type === "space" || n.type === "virtual"
        ? avgChildSentiment(n.id, tree, sentiment)
        : n.matrixRoomId ? sentiment[n.matrixRoomId] : null;
    const color = sentimentColor(score, isDayMode);
    const band = sentimentBand(score);
    const un = n.matrixRoomId ? unread[n.matrixRoomId] || 0 : 0;
    const d = n.matrixRoomId ? sentDetail[n.matrixRoomId] || { pos: [], neg: [], msgCount: 0 } : { pos: [], neg: [], msgCount: 0 };
    const scorePct = score !== null ? Math.round(score * 100) : null;
    const bandColors: Record<string, string> = {
        positive: "#22c55e",
        neutral: "#eab308",
        negative: "#ef4444",
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
        positive: _t("fanoos_dashboard|positive"),
        neutral: _t("fanoos_dashboard|neutral"),
        negative: _t("fanoos_dashboard|negative"),
        "no-data": _t("fanoos_dashboard|no_data"),
    };

    return (
        <div className={`mx_FanoosDashboard_infoPanel${isDayMode ? " day" : ""}`}>
            <div className="mx_FanoosDashboard_ipHdr" style={{ borderLeftColor: color }}>
                <span className="mx_FanoosDashboard_ipIcon">{n.type === "dm" ? "👤" : n.type === "space" ? "⬡" : "💬"}</span>
                <div className="mx_FanoosDashboard_ipName">{n.name}</div>
                <span className="mx_FanoosDashboard_ipBand" style={{ background: `${bandColors[band]}22`, color: bandColors[band] }}>
                    {bandLabel[band]}
                </span>
                <button className="mx_FanoosDashboard_ipClose" onClick={onClose}>✕</button>
            </div>

            {un > 0 && <div className="mx_FanoosDashboard_ipUnread">{_t("fanoos_dashboard|unread_badge", { count: un })}</div>}

            {childRooms.length > 0 && (
                <div className="mx_FanoosDashboard_ipRow">
                    <span>{_t("fanoos_dashboard|channels")}</span>
                    <span>{childRooms.length}{childUnread > 0 ? ` · ${childUnread} unread` : ""}</span>
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
                        <div className="mx_FanoosDashboard_ipFill" style={{ width: `${scorePct}%`, background: color }} />
                    </div>
                    <span className="mx_FanoosDashboard_ipPct" style={{ color }}>{scorePct}%</span>
                </div>
            )}

            {d.pos.length > 0 && (
                <div className="mx_FanoosDashboard_ipSignals">
                    <span className="mx_FanoosDashboard_ipSigLabel pos">{_t("fanoos_dashboard|positive")}</span>
                    {d.pos.map((k) => <span key={k} className="mx_FanoosDashboard_ipKw pos">{k}</span>)}
                </div>
            )}

            {d.neg.length > 0 && (
                <div className="mx_FanoosDashboard_ipSignals">
                    <span className="mx_FanoosDashboard_ipSigLabel neg">{_t("fanoos_dashboard|issues")}</span>
                    {d.neg.map((k) => <span key={k} className="mx_FanoosDashboard_ipKw neg">{k}</span>)}
                </div>
            )}

            {n.matrixRoomId && <div className="mx_FanoosDashboard_ipRoomId">{n.matrixRoomId}</div>}

            {members.length > 0 && (
                <div className="mx_FanoosDashboard_ipMembers">
                    <div className="mx_FanoosDashboard_ipMembersHdr">{_t("fanoos_dashboard|members")}</div>
                    <div className="mx_FanoosDashboard_ipMembersList">
                        {members.map((m) => (
                            <span key={m.userId} className="mx_FanoosDashboard_ipMemberChip">
                                <span className="mx_FanoosDashboard_ipMemberAv">{(m.name || "?").slice(0, 2).toUpperCase()}</span>
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

// ─── Main Component ───────────────────────────────────────────────────────────

const DASH_SETTINGS_KEY = "fanoosDashboardSettings";
const SCORES_SESSION_KEY = "fanoosDashboardScores";

const FanoosDashboard: React.FC = () => {
    const client = useMatrixClientContext();
    const svgWrapRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [tree, setTree] = useState<TreeNode[]>([]);
    const [unread, setUnread] = useState<Record<string, number>>(() => {
        try {
            const s = JSON.parse(sessionStorage.getItem(SCORES_SESSION_KEY) ?? "{}") as { unread?: Record<string, number> };
            return s.unread ?? {};
        } catch { return {}; }
    });
    const [sentiment, setSentiment] = useState<Record<string, number | null>>(() => {
        try {
            const s = JSON.parse(sessionStorage.getItem(SCORES_SESSION_KEY) ?? "{}") as { sentiment?: Record<string, number | null> };
            return s.sentiment ?? {};
        } catch { return {}; }
    });
    const [sentDetail, setSentDetail] = useState<Record<string, SentDetail>>(() => {
        try {
            const s = JSON.parse(sessionStorage.getItem(SCORES_SESSION_KEY) ?? "{}") as { sentDetail?: Record<string, SentDetail> };
            return s.sentDetail ?? {};
        } catch { return {}; }
    });
    const [search, setSearch] = useState("");
    const [searchHits, setSearchHits] = useState<string[]>([]);
    const [searchIdx, setSearchIdx] = useState(-1);
    const [level, setLevel] = useState<number>(() => {
        try {
            const s = JSON.parse(localStorage.getItem(DASH_SETTINGS_KEY) ?? "{}") as Record<string, unknown>;
            return s.level === 1 || s.level === 2 ? (s.level as number) : 2;
        } catch { return 2; }
    });
    const [showNames, setShowNames] = useState<boolean>(() => {
        try {
            const s = JSON.parse(localStorage.getItem(DASH_SETTINGS_KEY) ?? "{}") as Record<string, unknown>;
            return typeof s.showNames === "boolean" ? s.showNames : true;
        } catch { return true; }
    });
    const [infoPanelNode, setInfoPanelNode] = useState<string | null>(null);
    const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
    const [dims, setDims] = useState({ w: 800, h: 500 });
    const [transformStyle, setTransformStyle] = useState("");
    const [isDayMode, setIsDayMode] = useState<boolean>(() => {
        try {
            const s = JSON.parse(localStorage.getItem(DASH_SETTINGS_KEY) ?? "{}") as Record<string, unknown>;
            return typeof s.isDayMode === "boolean" ? s.isDayMode : true;
        } catch { return true; }
    });
    const [intervalVal, setIntervalVal] = useState<string>(() => {
        try {
            const s = JSON.parse(localStorage.getItem(DASH_SETTINGS_KEY) ?? "{}") as Record<string, unknown>;
            return typeof s.intervalVal === "string" ? s.intervalVal : "24h";
        } catch { return "24h"; }
    });
    const [lastReloaded, setLastReloaded] = useState(new Date());
    const [reloadAgeStr, setReloadAgeStr] = useState(_t("fanoos_dashboard|just_now"));
    const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
    const [sendWindow, setSendWindow] = useState<SendWindowState | null>(null);

    // Persist settings on change
    useEffect(() => {
        localStorage.setItem(DASH_SETTINGS_KEY, JSON.stringify({ level, showNames, isDayMode, intervalVal }));
    }, [level, showNames, isDayMode, intervalVal]);

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
        for (const n of tree) {
            if (!n.matrixRoomId) continue;
            const r = client.getRoom(n.matrixRoomId);
            if (!r) continue;
            m[n.matrixRoomId] = RoomNotificationStateStore.instance.getRoomState(r).count;
            if (n.type !== "space") {
                const msgs = r.getLiveTimeline().getEvents()
                    .filter((ev) => ev.getType() === "m.room.message" && ev.getTs() >= cutoff)
                    .slice(-50)
                    .map((ev) => ({ body: String(ev.getContent().body || "") }));
                const { score, detail } = analyzeMessages(msgs);
                sent[n.matrixRoomId] = score;
                det[n.matrixRoomId] = detail;
            }
        }
        setUnread(m);
        setSentiment(sent);
        setSentDetail(det);
        try {
            sessionStorage.setItem(SCORES_SESSION_KEY, JSON.stringify({ unread: m, sentiment: sent, sentDetail: det, intervalVal }));
        } catch { /* ignore */ }
    }, [tree, client, intervalVal]);

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
    useEffect(() => { treeRef.current = tree; }, [tree]);
    useEffect(() => { sendWindowOpenRef.current = !!sendWindow; }, [sendWindow]);
    useEffect(() => {
        const token = dis.register((payload: ActionPayload) => {
            if (!sendWindowOpenRef.current) return;
            if ((payload as { action: string }).action !== Action.ViewRoom) return;
            const roomId = (payload as { room_id?: string }).room_id;
            if (!roomId) return;
            const n = treeRef.current.find((x) => x.matrixRoomId === roomId && x.type !== "space" && x.type !== "virtual");
            if (!n) return;
            setSendWindow((prev) => prev ? { ...prev, recipients: [{ id: n.id, roomId, name: n.name }], showAnalysis: false } : null);
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
        return renderSVG(tree, unread, sentiment, search, searchIdx, level, showNames, dims.w, dims.h, activeRoomId, selectedIds, isDayMode);
    }, [tree, unread, sentiment, search, searchIdx, level, showNames, dims, activeRoomId, selectedIds, isDayMode]);

    useEffect(() => {
        if (!rendered || !svgWrapRef.current) return;
        svgWrapRef.current.innerHTML = rendered.svg;
        layoutRef.current = rendered.layout;
        dimsRef.current = rendered.dims;
        setSearchHits(rendered.hits);
    }, [rendered]);

    // Click → toggle info panel + navigate to room; shift-click → add/remove from send window
    const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const nodeId = (e.target as Element).closest("[data-nodeid]")?.getAttribute("data-nodeid");
        if (!nodeId) return;
        const n = tree.find((x) => x.id === nodeId);

        if (e.shiftKey && n?.matrixRoomId && n.type !== "space" && n.type !== "virtual") {
            setSendWindow((prev) => {
                if (!prev) {
                    const pos = computeSendWindowPos(e.clientX, e.clientY);
                    return { recipients: [{ id: n.id, roomId: n.matrixRoomId!, name: n.name }], msgText: "", pos, minimized: false, showRecipients: true, showAnalysis: false };
                }
                const already = prev.recipients.find((r) => r.id === nodeId);
                if (already) {
                    return { ...prev, recipients: prev.recipients.filter((r) => r.id !== nodeId) };
                }
                return { ...prev, recipients: [...prev.recipients, { id: n.id, roomId: n.matrixRoomId!, name: n.name }] };
            });
            return;
        }

        setInfoPanelNode((prev) => (prev === nodeId ? null : nodeId));
        if (n?.matrixRoomId && n.type !== "space" && n.type !== "virtual") {
            setActiveRoomId(n.matrixRoomId);
            dis.dispatch({ action: Action.ViewRoom, room_id: n.matrixRoomId });
        }
    }, [tree]);

    // Hover → show tooltip (throttled: update only when node or coords change by ≥4px)
    const lastHoverRef = useRef<HoverInfo | null>(null);
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const nodeId = (e.target as Element).closest("[data-nodeid]")?.getAttribute("data-nodeid") ?? null;
        const prev = lastHoverRef.current;
        if (!nodeId) {
            if (prev) { lastHoverRef.current = null; setHoverInfo(null); }
            return;
        }
        if (prev && prev.nodeId === nodeId && Math.abs(e.clientX - prev.clientX) < 4 && Math.abs(e.clientY - prev.clientY) < 4) return;
        const next = { nodeId, clientX: e.clientX, clientY: e.clientY };
        lastHoverRef.current = next;
        setHoverInfo(next);
    }, []);

    // Right-click → open unified send window (marks room as read for room nodes)
    const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const nodeId = (e.target as Element).closest("[data-nodeid]")?.getAttribute("data-nodeid");
        if (!nodeId) return;
        const n = tree.find((x) => x.id === nodeId);
        if (!n) return;
        const pos = computeSendWindowPos(e.clientX, e.clientY);
        if (n.type === "space" || n.type === "virtual") {
            const recipients = tree
                .filter((c) => c.parentId === n.id && c.matrixRoomId)
                .map((c) => ({ id: c.id, roomId: c.matrixRoomId!, name: c.name }));
            if (recipients.length > 0) {
                setSendWindow({ recipients, msgText: "", pos, minimized: false, showRecipients: false, showAnalysis: false });
            }
            return;
        }
        if (!n.matrixRoomId) return;
        // Mark room as read when opening the send window
        const room = client.getRoom(n.matrixRoomId);
        if (room) {
            const evs = room.getLiveTimeline().getEvents();
            const lastEv = evs[evs.length - 1];
            if (lastEv) { void client.sendReadReceipt(lastEv); }
        }
        setSendWindow({ recipients: [{ id: n.id, roomId: n.matrixRoomId, name: n.name }], msgText: "", pos, minimized: false, showRecipients: false, showAnalysis: false });
    }, [tree, client]);

    // Prevent right-button mousedown from bubbling (some browsers scroll-to-top on right mousedown)
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button === 2) { e.preventDefault(); e.stopPropagation(); }
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
        setTransformStyle(`translate(${(W / 2 - fx * ZOOM).toFixed(1)}px,${(H / 2 - fy * ZOOM).toFixed(1)}px) scale(${ZOOM})`);
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

    const resetZoom = useCallback(() => { setTransformStyle(""); setSearchIdx(-1); }, []);

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
        if (ns <= 0.35) { resetZoom(); return; }
        const base = transformStyle.replace(/\s*scale\([^)]+\)/, "").trim();
        setTransformStyle(`${base} scale(${ns.toFixed(2)})`.trim());
    }, [transformStyle, resetZoom]);

    const handleFullscreen = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        if (!document.fullscreenElement) { el.requestFullscreen().catch(() => {}); }
        else { document.exitFullscreen().catch(() => {}); }
    }, []);

    const searchCount = !search.trim() ? "" : !searchHits.length ? "0" : `${searchIdx >= 0 ? searchIdx + 1 : "–"}/${searchHits.length}`;
    const canvasStyle = isDayMode
        ? { background: "linear-gradient(180deg, #b8d4f0 0%, #dce9f8 40%, #e8eff8 100%)" }
        : { background: "#0a1628" };

    return (
        <div className={`mx_FanoosDashboard${isDayMode ? " day" : " night"}`}>

            {/* ── Row 1: Title + Model + Interval ── */}
            <div className={`mx_FanoosDashboard_topBar${isDayMode ? " day" : ""}`}>
                <span className="mx_FanoosDashboard_title">{_t("fanoos_dashboard|title")}</span>

                <label className="mx_FanoosDashboard_ctrlGroup">
                    <span className="mx_FanoosDashboard_ctrlLabel">{_t("fanoos_dashboard|model")}</span>
                    <select className="mx_FanoosDashboard_select" value="keyword" onChange={() => {}}>
                        <option value="keyword">{_t("fanoos_dashboard|keyword_model")}</option>
                    </select>
                </label>

                <label className="mx_FanoosDashboard_ctrlGroup">
                    <span className="mx_FanoosDashboard_ctrlLabel">{_t("fanoos_dashboard|interval")}</span>
                    <select className="mx_FanoosDashboard_select" value={intervalVal} onChange={(e) => setIntervalVal(e.target.value)}>
                        <option value="24h">{_t("fanoos_dashboard|interval_24h")}</option>
                        <option value="7d">{_t("fanoos_dashboard|interval_7d")}</option>
                        <option value="30d">{_t("fanoos_dashboard|interval_30d")}</option>
                        <option value="all">{_t("fanoos_dashboard|interval_all")}</option>
                    </select>
                </label>
            </div>

            {/* ── Row 2: Depth + Names + Search + Zoom + Reload + Mode + Fullscreen ── */}
            <div className={`mx_FanoosDashboard_ctrlBar${isDayMode ? " day" : ""}`}>
                {/* Depth group */}
                <div className="mx_FanoosDashboard_btnGroup">
                    <span className="mx_FanoosDashboard_ctrlLabel">{_t("fanoos_dashboard|depth")}</span>
                    <button className={`mx_FanoosDashboard_lvlBtn${level === 1 ? " active" : ""}${isDayMode ? " day" : ""}`} onClick={() => setLevel(1)}>1</button>
                    <button className={`mx_FanoosDashboard_lvlBtn${level === 2 ? " active" : ""}${isDayMode ? " day" : ""}`} onClick={() => setLevel(2)}>2</button>
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
                        onChange={(e) => { setSearch(e.target.value); setSearchIdx(-1); if (!e.target.value.trim()) resetZoom(); }}
                        onKeyDown={(e) => { if (e.key === "Enter") searchNext(); }}
                    />
                    {searchCount && <span className="mx_FanoosDashboard_searchCount">{searchCount}</span>}
                    {searchHits.length > 0 && (
                        <>
                            <button className={`mx_FanoosDashboard_navBtn${isDayMode ? " day" : ""}`} onClick={searchPrev} title="Previous">‹</button>
                            <button className={`mx_FanoosDashboard_navBtn${isDayMode ? " day" : ""}`} onClick={searchNext} title="Next">›</button>
                        </>
                    )}
                </div>

                <div className="mx_FanoosDashboard_divider" />

                {/* Zoom group */}
                <div className="mx_FanoosDashboard_btnGroup">
                    <button className={`mx_FanoosDashboard_zoomBtn${isDayMode ? " day" : ""}`} onClick={zoomIn} title="Zoom in">+</button>
                    <button className={`mx_FanoosDashboard_zoomBtn${isDayMode ? " day" : ""}`} onClick={resetZoom} title="Reset zoom">⊙</button>
                    <button className={`mx_FanoosDashboard_zoomBtn${isDayMode ? " day" : ""}`} onClick={zoomOut} title="Zoom out">−</button>
                </div>

                <div className="mx_FanoosDashboard_divider" />

                {/* Reload */}
                <button className={`mx_FanoosDashboard_reloadBtn${isDayMode ? " day" : ""}`} onClick={rebuildTree} title={_t("fanoos_dashboard|reload")}>
                    ↺ <span className="mx_FanoosDashboard_reloadAge">{reloadAgeStr}</span>
                </button>

                <div className="mx_FanoosDashboard_spacer" />

                {/* Mode + Fullscreen */}
                <button className={`mx_FanoosDashboard_modeBtn${isDayMode ? " day" : ""}`} onClick={() => setIsDayMode((v) => !v)}>
                    {isDayMode ? _t("fanoos_dashboard|night") : _t("fanoos_dashboard|day")}
                </button>
                <button className={`mx_FanoosDashboard_fsBtn${isDayMode ? " day" : ""}`} onClick={handleFullscreen} title={_t("fanoos_dashboard|fullscreen")}>
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
                    style={{ transform: transformStyle, transition: "transform 0.42s cubic-bezier(0.25,0.46,0.45,0.94)", transformOrigin: "0 0" }}
                    onClick={handleClick}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => { lastHoverRef.current = null; setHoverInfo(null); }}
                    onMouseDown={handleMouseDown}
                    onContextMenu={handleContextMenu}
                />
                {!tree.length && (
                    <div className={`mx_FanoosDashboard_empty${isDayMode ? " day" : ""}`}>{_t("fanoos_dashboard|no_rooms")}</div>
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

            {/* ── Send window (unified single/multi-channel compose) ── */}
            {sendWindow && createPortal(
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
