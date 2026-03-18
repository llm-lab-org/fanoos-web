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
import { EventType, type Room, RoomEvent } from "matrix-js-sdk/src/matrix";

import { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import { RoomNotificationStateStore } from "../../stores/notifications/RoomNotificationStateStore";
import dis from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";
import { useEventEmitter } from "../../hooks/useEventEmitter";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Arc constants (exact from team-dash.js) ──────────────────────────────────

const ARC_START = Math.PI * (11 / 12); // ~165°
const ARC_END = Math.PI * (1 / 12); // ~15°

// ─── Sentiment ────────────────────────────────────────────────────────────────

const POS_RE =
    /\b(good|great|thanks?|yes|done|ok|okay|perfect|nice|awesome|excellent|success|agree|love|happy|well|wonderful|sure|correct|right|approved|ready|congrats?|complete[d]?|finish(?:ed)?|achievement|well done)\b/gi;
const NEG_RE =
    /\b(bad|no\b|not\b|never|fail(?:ed)?|error|issue|problem|bug|wrong|broken|sorry|unfortunately|can'?t|cannot|blocked|stuck|delay(?:ed)?|late|missing|urgent|alert|trouble|critical|warning|oops)\b/gi;

function scoreSentiment(msgs: { body: string }[]): number | null {
    if (!msgs.length) return null;
    let pos = 0,
        neg = 0;
    for (const m of msgs) {
        pos += (m.body.match(POS_RE) || []).length;
        neg += (m.body.match(NEG_RE) || []).length;
    }
    const total = pos + neg;
    if (total === 0) return 0.5;
    return Math.max(0.05, Math.min(0.95, 0.5 + (pos - neg) / Math.max(total * 1.5, 4)));
}

function sentimentDetail(msgs: { body: string }[]): SentDetail {
    const posSet = new Set<string>(),
        negSet = new Set<string>();
    for (const m of msgs) {
        for (const w of m.body.match(POS_RE) || []) posSet.add(w.toLowerCase());
        for (const w of m.body.match(NEG_RE) || []) negSet.add(w.toLowerCase());
    }
    return { pos: [...posSet].slice(0, 4), neg: [...negSet].slice(0, 4), msgCount: msgs.length };
}

function sentimentColor(score: number | null | undefined): string {
    if (score === null || score === undefined) return "#334155";
    const t = Math.max(0, Math.min(1, score));
    const hue = t * 120;
    const lit = 62 - Math.sin(t * Math.PI) * 12;
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
            const isDm =
                r.getDMInviter() !== undefined || (r.getJoinedMemberCount() === 2 && !r.isSpaceRoom());
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

// ─── Layout algorithm (exact port of buildSegmentLayout from team-dash.js) ────

function buildSegmentLayout(
    tree: TreeNode[],
    level: number,
    R_ROOT: number,
    R1_IN: number,
    R1_OUT: number,
    R2_IN: number,
    R2_OUT: number,
): Map<string, Segment> {
    const layout = new Map<string, Segment>();
    const root = tree.find((n) => !n.parentId);
    if (!root) return layout;
    const totalArc = ARC_START - ARC_END;

    layout.set(root.id, {
        a1: ARC_END,
        a2: ARC_START,
        r1: 0,
        r2: R_ROOT,
        depth: 0,
        mid: (ARC_START + ARC_END) / 2,
    });

    const d1 = tree.filter((n) => n.parentId === root.id);
    if (!d1.length) return layout;

    const weights = d1.map((n) => Math.max(1, tree.filter((c) => c.parentId === n.id).length));
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    let a = ARC_END;

    for (let i = 0; i < d1.length; i++) {
        const groupArc = (weights[i] / totalWeight) * totalArc;
        const a1 = a,
            a2 = a + groupArc;
        const r2d1 = level <= 1 ? R2_OUT : R1_OUT;
        layout.set(d1[i].id, {
            a1,
            a2,
            r1: R1_IN,
            r2: r2d1,
            depth: 1,
            mid: a1 + groupArc / 2,
        });

        if (level >= 2) {
            const kids = tree.filter((c) => c.parentId === d1[i].id);
            if (kids.length) {
                const N = kids.length;
                const radH = R2_OUT - R2_IN;
                const midR = (R2_IN + R2_OUT) / 2;
                const arcW = groupArc * midR;
                const cols = Math.max(1, Math.round(Math.sqrt((N * arcW) / Math.max(radH, 1))));
                const rows = Math.ceil(N / cols);
                const arcPerCol = groupArc / cols;
                const radPerRow = radH / rows;
                kids.forEach((kid, j) => {
                    const col = j % cols;
                    const row = Math.floor(j / cols);
                    const ka1 = a1 + col * arcPerCol;
                    const kr1 = R2_IN + row * radPerRow;
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

// ─── Path generator (exact port of makeSegPath from team-dash.js) ─────────────

function makeSegPath(cx: number, cy: number, seg: Segment, gapPx = 3): string {
    const { a1, a2, r1, r2 } = seg;
    if (r2 - r1 < 4) return "";
    const midR = (r1 + r2) / 2;
    const angGap = Math.min(gapPx / Math.max(midR, 1), 0.1);
    const ra1 = a1 + angGap,
        ra2 = a2 - angGap;
    const ri = r1 + (r1 > 1 ? gapPx : 0),
        ro = r2 - gapPx;
    if (ra2 - ra1 < 0.005 || ro - ri < 2) return "";
    const f = (v: number) => v.toFixed(2);
    const px = (r: number, a: number) => cx + r * Math.cos(a);
    const py = (r: number, a: number) => cy - r * Math.sin(a);
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

// ─── SVG renderer (faithful port of tdRender from team-dash.js) ───────────────

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
): { svg: string; layout: Map<string, Segment>; dims: { W: number; H: number; CX: number; CY: number }; hits: string[] } {
    const CX = W / 2;
    const CY = H - 4;
    const R_MAX = Math.min(CY - 20, W / 2 - 14);
    const R_ROOT = Math.max(12, Math.min(24, R_MAX * 0.052));
    const G_RING = Math.max(5, Math.floor(R_MAX * 0.014));

    let R1_IN: number, R1_OUT: number, R2_IN: number, R2_OUT: number;
    if (level <= 1) {
        R1_IN = R_ROOT + 8;
        R1_OUT = R_MAX;
        R2_IN = R_MAX;
        R2_OUT = R_MAX;
    } else {
        const area = R_MAX - R_ROOT - 8;
        R1_IN = R_ROOT + 8;
        R1_OUT = R1_IN + Math.max(42, Math.floor(area * 0.28));
        R2_IN = R1_OUT + G_RING;
        R2_OUT = R_MAX;
    }

    const q = searchQuery.trim().toLowerCase();
    const hits = q
        ? tree.filter((n) => n.name.toLowerCase().includes(q)).map((n) => n.id)
        : [];

    const layout = buildSegmentLayout(tree, level, R_ROOT, R1_IN, R1_OUT, R2_IN, R2_OUT);
    const dims = { W, H, CX, CY };

    const parts: string[] = [];

    // Defs
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
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <radialGradient id="tdBg" cx="50%" cy="100%" r="80%">
        <stop offset="0%" stop-color="#131c2e"/>
        <stop offset="100%" stop-color="#0a0f1a"/>
      </radialGradient>
    </defs>`);

    // Background
    parts.push(`<rect width="${W}" height="${H}" fill="url(#tdBg)"/>`);

    // Guide arcs
    const guideArc = (r: number) => {
        const x1 = (CX + r * Math.cos(ARC_END)).toFixed(1);
        const y1 = (CY - r * Math.sin(ARC_END)).toFixed(1);
        const x2 = (CX + r * Math.cos(ARC_START)).toFixed(1);
        const y2 = (CY - r * Math.sin(ARC_START)).toFixed(1);
        return `M ${x1} ${y1} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 0 ${x2} ${y2}`;
    };
    if (level >= 2 && R1_OUT < R2_OUT) {
        parts.push(
            `<path d="${guideArc(R1_OUT)}" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>`,
        );
    }
    parts.push(`<path d="${guideArc(R_MAX)}" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`);

    // Glow pass
    layout.forEach((seg, id) => {
        if (seg.depth === 0) return;
        const n = tree.find((x) => x.id === id);
        if (!n) return;
        const dim = hits.length > 0 && !hits.includes(id);
        if (dim) return;
        const score =
            seg.depth === 1
                ? avgChildSentiment(id, tree, sentiment)
                : n.matrixRoomId
                  ? sentiment[n.matrixRoomId]
                  : null;
        const color = n.type === "space" || n.type === "virtual" ? "#6366f1" : sentimentColor(score);
        const glowSeg = { ...seg, r1: Math.max(0, seg.r1 - 4), r2: seg.r2 + 4 };
        const glowPath = makeSegPath(CX, CY, glowSeg, 0);
        if (glowPath) {
            parts.push(
                `<path d="${glowPath}" fill="${color}" opacity="0.10" filter="url(#tdGlowSeg)" pointer-events="none"/>`,
            );
        }
    });

    // Segment pass
    layout.forEach((seg, id) => {
        const n = tree.find((x) => x.id === id);
        if (!n) return;

        // Root pivot circle
        if (seg.depth === 0) {
            const pc = "#818cf8";
            parts.push(
                `<circle cx="${CX.toFixed(1)}" cy="${CY.toFixed(1)}" r="${(R_ROOT + 12).toFixed(1)}" fill="${pc}" opacity="0.07" filter="url(#tdGlowMd)"/>`,
            );
            parts.push(
                `<circle cx="${CX.toFixed(1)}" cy="${CY.toFixed(1)}" r="${R_ROOT.toFixed(1)}" fill="${pc}" opacity="0.88"/>`,
            );
            parts.push(
                `<circle cx="${CX.toFixed(1)}" cy="${(CY - R_ROOT * 0.3).toFixed(1)}" r="${(R_ROOT * 0.38).toFixed(1)}" fill="white" opacity="0.20"/>`,
            );
            if (showNames) {
                parts.push(
                    `<text x="${CX.toFixed(1)}" y="${(CY + R_ROOT + 11).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,0.28)" font-size="9" font-family="system-ui,sans-serif" pointer-events="none">${escHtml(n.name)}</text>`,
                );
            }
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
        const color = sentimentColor(score);
        const gapPx = seg.depth === 1 ? 4 : 2.5;
        const path = makeSegPath(CX, CY, seg, gapPx);
        if (!path) return;

        const safeId = id.replace(/[^a-zA-Z0-9]/g, "_");

        parts.push("<g>");
        parts.push(`<path d="${path}" fill="#0e1520" opacity="${dim ? 0.45 : 0.93}"/>`);

        const lightOp = dim ? 0.04 : isVirtual ? 0.3 : 0.28;
        if ((isActive || un > 0) && !dim) {
            parts.push(
                `<path d="${path}" fill="${color}" opacity="${lightOp + 0.18}" filter="url(#tdGlowMd)"/>`,
            );
        } else {
            parts.push(`<path d="${path}" fill="${color}" opacity="${lightOp}"/>`);
        }

        if (!dim && seg.r2 - seg.r1 > 28) {
            const sR2 = seg.r2 - gapPx;
            const sR1 = sR2 - Math.max(3, (seg.r2 - seg.r1) * 0.08);
            const specPath = makeSegPath(CX, CY, { a1: seg.a1, a2: seg.a2, r1: sR1, r2: sR2, depth: seg.depth, mid: seg.mid }, gapPx + 0.5);
            if (specPath)
                parts.push(`<path d="${specPath}" fill="rgba(255,255,255,0.06)" pointer-events="none"/>`);
        }

        if (isActive) {
            parts.push(`<path d="${path}" fill="none" stroke="#c7d2fe" stroke-width="1.8" opacity="0.92"/>`);
        } else if (isFocused) {
            parts.push(`<path d="${path}" fill="white" opacity="0.14"/>`);
            parts.push(`<path d="${path}" fill="none" stroke="white" stroke-width="2.2" opacity="0.95"/>`);
        } else if (isHit) {
            parts.push(
                `<path d="${path}" fill="none" stroke="white" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.65"/>`,
            );
        } else {
            parts.push(
                `<path d="${path}" fill="none" stroke="${color}" stroke-width="${seg.depth === 1 ? 0.9 : 0.6}" opacity="${dim ? 0.08 : 0.32}"/>`,
            );
        }

        if (selectedIds.has(id)) {
            parts.push(`<path d="${path}" fill="rgba(99,102,241,0.18)" opacity="0.9"/>`);
            parts.push(`<path d="${path}" fill="none" stroke="#818cf8" stroke-width="2" opacity="0.9"/>`);
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
                    ? "rgba(255,255,255,0.12)"
                    : isHit
                      ? "white"
                      : isVirtual
                        ? "rgba(199,210,254,0.88)"
                        : "rgba(226,232,240,0.80)";
                parts.push(
                    `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rotDeg.toFixed(1)},${tx.toFixed(1)},${ty.toFixed(1)})" fill="${tColor}" font-size="${fontSize}" font-weight="${isVirtual ? 700 : 500}" font-family="system-ui,sans-serif" pointer-events="none">${escHtml(label)}</text>`,
                );
            }
        }

        if (un > 0 && !dim) {
            const envR = seg.r2 - gapPx - 16;
            if (envR > seg.r1 + gapPx + 6) {
                const ex = CX + envR * Math.cos(seg.mid);
                const ey = CY - envR * Math.sin(seg.mid);
                const ew = 9,
                    eh = 6.5;
                parts.push(
                    `<g filter="url(#tdGlowEnv)" pointer-events="none"><rect x="${(ex - ew).toFixed(1)}" y="${(ey - eh).toFixed(1)}" width="${(ew * 2).toFixed(1)}" height="${(eh * 2).toFixed(1)}" rx="2" fill="#f59e0b" opacity="0.95"/><path d="M${(ex - ew).toFixed(1)},${(ey - eh).toFixed(1)} L${ex.toFixed(1)},${(ey + 1).toFixed(1)} L${(ex + ew).toFixed(1)},${(ey - eh).toFixed(1)}" fill="none" stroke="#0d1117" stroke-width="1.3" stroke-linejoin="round"/></g>`,
                );
                const badge = un > 99 ? "99+" : String(un);
                const br = un > 9 ? 8 : 7;
                parts.push(
                    `<circle cx="${(ex + ew).toFixed(1)}" cy="${(ey - eh).toFixed(1)}" r="${br}" fill="#ef4444" stroke="#0d1117" stroke-width="0.8" pointer-events="none"/>`,
                );
                parts.push(
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

    const svgStr = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block">${parts.join("\n")}</svg>`;
    return { svg: svgStr, layout, dims, hits };
}

function escHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Info Panel ───────────────────────────────────────────────────────────────

interface InfoPanelProps {
    nodeId: string;
    tree: TreeNode[];
    sentiment: Record<string, number | null>;
    sentDetail: Record<string, SentDetail>;
    unread: Record<string, number>;
    onClose: () => void;
    client: ReturnType<typeof useMatrixClientContext>;
}

const InfoPanel: React.FC<InfoPanelProps> = ({ nodeId, tree, sentiment, sentDetail, unread, onClose, client }) => {
    const n = tree.find((x) => x.id === nodeId);
    if (!n) return null;

    const isD1 = tree.find((p) => p.id === n.parentId)?.id === "__root__" || !n.parentId;
    const score =
        n.type === "space" || n.type === "virtual"
            ? avgChildSentiment(n.id, tree, sentiment)
            : n.matrixRoomId
              ? sentiment[n.matrixRoomId]
              : null;
    const color = sentimentColor(score);
    const band = sentimentBand(score);
    const un = n.matrixRoomId ? unread[n.matrixRoomId] || 0 : 0;
    const d = n.matrixRoomId ? sentDetail[n.matrixRoomId] || { pos: [], neg: [], msgCount: 0 } : { pos: [], neg: [], msgCount: 0 };
    const scorePct = score !== null ? Math.round(score * 100) : null;
    const bandColors: Record<string, string> = {
        positive: "#22c55e",
        neutral: "#eab308",
        negative: "#ef4444",
        "no-data": "#475569",
    };
    const childRooms = tree.filter((c) => c.parentId === n.id && c.matrixRoomId);
    const childUnread = childRooms.reduce((s, c) => s + (unread[c.matrixRoomId!] || 0), 0);

    const room = n.matrixRoomId ? client.getRoom(n.matrixRoomId) : null;
    const members = room ? room.getJoinedMembers().slice(0, 20) : [];

    const openRoom = () => {
        if (n.matrixRoomId) dis.dispatch({ action: Action.ViewRoom, room_id: n.matrixRoomId });
    };

    return (
        <div className="mx_FanoosDashboard_infoPanel">
            <div className="mx_FanoosDashboard_ipHdr" style={{ borderLeftColor: color }}>
                <span className="mx_FanoosDashboard_ipIcon">
                    {n.type === "dm" ? "👤" : n.type === "space" ? "⬡" : "💬"}
                </span>
                <div className="mx_FanoosDashboard_ipName">{n.name}</div>
                <span
                    className="mx_FanoosDashboard_ipBand"
                    style={{ background: `${bandColors[band]}22`, color: bandColors[band] }}
                >
                    {band}
                </span>
                <button className="mx_FanoosDashboard_ipClose" onClick={onClose}>
                    ✕
                </button>
            </div>

            {un > 0 && (
                <div className="mx_FanoosDashboard_ipUnread">📬 {un} unread</div>
            )}

            {childRooms.length > 0 && (
                <div className="mx_FanoosDashboard_ipRow">
                    <span>Channels</span>
                    <span>
                        {childRooms.length}
                        {childUnread > 0 ? ` · ${childUnread} unread` : ""}
                    </span>
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
                    <span className="mx_FanoosDashboard_ipSigLabel pos">Positive</span>
                    {d.pos.map((k) => (
                        <span key={k} className="mx_FanoosDashboard_ipKw pos">
                            {k}
                        </span>
                    ))}
                </div>
            )}

            {d.neg.length > 0 && (
                <div className="mx_FanoosDashboard_ipSignals">
                    <span className="mx_FanoosDashboard_ipSigLabel neg">Issues</span>
                    {d.neg.map((k) => (
                        <span key={k} className="mx_FanoosDashboard_ipKw neg">
                            {k}
                        </span>
                    ))}
                </div>
            )}

            {n.matrixRoomId && (
                <div className="mx_FanoosDashboard_ipRoomId">{n.matrixRoomId}</div>
            )}

            {members.length > 0 && (
                <div className="mx_FanoosDashboard_ipMembers">
                    <div className="mx_FanoosDashboard_ipMembersHdr">Members</div>
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
                    Open Room →
                </button>
            )}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const FanoosDashboard: React.FC = () => {
    const client = useMatrixClientContext();
    const svgWrapRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [tree, setTree] = useState<TreeNode[]>([]);
    const [unread, setUnread] = useState<Record<string, number>>({});
    const [sentiment, setSentiment] = useState<Record<string, number | null>>({});
    const [sentDetail, setSentDetail] = useState<Record<string, SentDetail>>({});
    const [search, setSearch] = useState("");
    const [searchHits, setSearchHits] = useState<string[]>([]);
    const [searchIdx, setSearchIdx] = useState(-1);
    const [level, setLevel] = useState(2);
    const [showNames, setShowNames] = useState(true);
    const [infoPanelNode, setInfoPanelNode] = useState<string | null>(null);
    const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
    const [selectedIds] = useState(new Set<string>());
    const [dims, setDims] = useState({ w: 800, h: 500 });
    const [transformStyle, setTransformStyle] = useState("");
    const layoutRef = useRef<Map<string, Segment>>(new Map());
    const dimsRef = useRef({ W: 800, H: 500, CX: 400, CY: 496 });

    // Build tree
    const rebuildTree = useCallback(() => {
        setTree(buildTree(client));
    }, [client]);
    useEffect(rebuildTree, [rebuildTree]);
    useEventEmitter(client, RoomEvent.Timeline, rebuildTree);

    // Build unread
    useEffect(() => {
        const m: Record<string, number> = {};
        for (const n of tree) {
            if (n.matrixRoomId) {
                const r = client.getRoom(n.matrixRoomId);
                if (r) m[n.matrixRoomId] = RoomNotificationStateStore.instance.getRoomState(r).count;
            }
        }
        setUnread(m);
    }, [tree, client]);

    // Build sentiment
    useEffect(() => {
        const sent: Record<string, number | null> = {};
        const det: Record<string, SentDetail> = {};
        for (const n of tree) {
            if (!n.matrixRoomId || n.type === "space") continue;
            const r = client.getRoom(n.matrixRoomId);
            if (!r) continue;
            const evs = r.getLiveTimeline().getEvents();
            const msgs = evs
                .filter((ev) => ev.getType() === "m.room.message")
                .slice(-50)
                .map((ev) => ({ body: String(ev.getContent().body || "") }));
            sent[n.matrixRoomId] = scoreSentiment(msgs);
            det[n.matrixRoomId] = sentimentDetail(msgs);
        }
        setSentiment(sent);
        setSentDetail(det);
    }, [tree, client]);

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

    // Render SVG
    const rendered = useMemo(() => {
        if (!tree.length || dims.w < 100) return null;
        return renderSVG(
            tree,
            unread,
            sentiment,
            search,
            searchIdx,
            level,
            showNames,
            dims.w,
            dims.h,
            activeRoomId,
            selectedIds,
        );
    }, [tree, unread, sentiment, search, searchIdx, level, showNames, dims, activeRoomId, selectedIds]);

    useEffect(() => {
        if (!rendered || !svgWrapRef.current) return;
        svgWrapRef.current.innerHTML = rendered.svg;
        layoutRef.current = rendered.layout;
        dimsRef.current = rendered.dims;
        setSearchHits(rendered.hits);
    }, [rendered]);

    // Click handler
    const handleClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const target = e.target as Element;
            const nodeId = target.closest("[data-nodeid]")?.getAttribute("data-nodeid");
            if (!nodeId) return;
            setInfoPanelNode((prev) => (prev === nodeId ? null : nodeId));
            const n = tree.find((x) => x.id === nodeId);
            if (n?.matrixRoomId && n.type !== "space" && n.type !== "virtual") {
                setActiveRoomId(n.matrixRoomId);
                dis.dispatch({ action: Action.ViewRoom, room_id: n.matrixRoomId });
            }
        },
        [tree],
    );

    // Search navigation
    const searchNext = useCallback(() => {
        if (!searchHits.length) return;
        const idx = (searchIdx + 1) % searchHits.length;
        setSearchIdx(idx);
        focusOnNode(searchHits[idx]);
    }, [searchHits, searchIdx]);

    const searchPrev = useCallback(() => {
        if (!searchHits.length) return;
        const idx = (searchIdx - 1 + searchHits.length) % searchHits.length;
        setSearchIdx(idx);
        focusOnNode(searchHits[idx]);
    }, [searchHits, searchIdx]);

    const focusOnNode = (nodeId: string) => {
        const seg = layoutRef.current.get(nodeId);
        const { W, H, CX, CY } = dimsRef.current;
        if (!seg || !W) return;
        const midR = (seg.r1 + seg.r2) / 2;
        const fx = CX + midR * Math.cos(seg.mid);
        const fy = CY - midR * Math.sin(seg.mid);
        const ZOOM = 2.4;
        const tx = W / 2 - fx * ZOOM;
        const ty = H / 2 - fy * ZOOM;
        setTransformStyle(`translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${ZOOM})`);
    };

    const resetZoom = () => {
        setTransformStyle("");
        setSearchIdx(-1);
    };

    const zoomIn = () => {
        // Parse current scale and bump
        const m = transformStyle.match(/scale\(([^)]+)\)/);
        const s = m ? parseFloat(m[1]) : 1;
        const ns = Math.min(s * 1.3, 6);
        setTransformStyle((prev) => prev.replace(/scale\([^)]+\)/, `scale(${ns.toFixed(2)})`).replace(/^$/, `scale(${ns.toFixed(2)})`));
    };

    const zoomOut = () => {
        const m = transformStyle.match(/scale\(([^)]+)\)/);
        const s = m ? parseFloat(m[1]) : 1;
        const ns = Math.max(s / 1.3, 0.3);
        if (ns <= 0.35) { resetZoom(); return; }
        setTransformStyle((prev) => prev.replace(/scale\([^)]+\)/, `scale(${ns.toFixed(2)})`).replace(/^$/, `scale(${ns.toFixed(2)})`));
    };

    const searchCount =
        !search.trim() ? "" : !searchHits.length ? "0" : `${searchIdx >= 0 ? searchIdx + 1 : "–"}/${searchHits.length}`;

    return (
        <div className="mx_FanoosDashboard">
            {/* Control bar */}
            <div className="mx_FanoosDashboard_controls">
                <button
                    className={`mx_FanoosDashboard_lvlBtn${level === 1 ? " active" : ""}`}
                    onClick={() => setLevel(1)}
                >
                    L1
                </button>
                <button
                    className={`mx_FanoosDashboard_lvlBtn${level === 2 ? " active" : ""}`}
                    onClick={() => setLevel(2)}
                >
                    L2
                </button>
                <button
                    className={`mx_FanoosDashboard_lvlBtn${showNames ? " active" : ""}`}
                    onClick={() => setShowNames((v) => !v)}
                    title="Toggle names"
                >
                    Aa
                </button>
                <div className="mx_FanoosDashboard_searchWrap">
                    <input
                        className="mx_FanoosDashboard_searchInput"
                        type="search"
                        placeholder="Search rooms…"
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
                            <button className="mx_FanoosDashboard_navBtn" onClick={searchPrev} title="Previous">
                                ‹
                            </button>
                            <button className="mx_FanoosDashboard_navBtn" onClick={searchNext} title="Next">
                                ›
                            </button>
                        </>
                    )}
                </div>
                <button className="mx_FanoosDashboard_zoomBtn" onClick={zoomIn} title="Zoom in">
                    +
                </button>
                <button className="mx_FanoosDashboard_zoomBtn" onClick={zoomOut} title="Zoom out">
                    −
                </button>
                <button className="mx_FanoosDashboard_zoomBtn" onClick={resetZoom} title="Reset zoom">
                    ⊙
                </button>
                <button className="mx_FanoosDashboard_zoomBtn" onClick={rebuildTree} title="Reload">
                    ↺
                </button>
            </div>

            {/* Legend */}
            <div className="mx_FanoosDashboard_legend">
                <span className="mx_FanoosDashboard_legendItem" style={{ color: sentimentColor(0.8) }}>
                    ● Positive
                </span>
                <span className="mx_FanoosDashboard_legendItem" style={{ color: sentimentColor(0.5) }}>
                    ● Neutral
                </span>
                <span className="mx_FanoosDashboard_legendItem" style={{ color: sentimentColor(0.15) }}>
                    ● Issues
                </span>
                <span className="mx_FanoosDashboard_legendItem" style={{ color: "#334155" }}>
                    ● No data
                </span>
            </div>

            {/* SVG canvas */}
            <div className="mx_FanoosDashboard_canvasWrap" ref={containerRef}>
                <div
                    ref={svgWrapRef}
                    className="mx_FanoosDashboard_svgWrap"
                    style={{
                        transform: transformStyle,
                        transition: "transform 0.42s cubic-bezier(0.25,0.46,0.45,0.94)",
                        transformOrigin: "0 0",
                    }}
                    onClick={handleClick}
                />
                {!tree.length && (
                    <div className="mx_FanoosDashboard_empty">No rooms yet</div>
                )}
            </div>

            {/* Info panel */}
            {infoPanelNode && (
                <InfoPanel
                    nodeId={infoPanelNode}
                    tree={tree}
                    sentiment={sentiment}
                    sentDetail={sentDetail}
                    unread={unread}
                    onClose={() => setInfoPanelNode(null)}
                    client={client}
                />
            )}
        </div>
    );
};

export default FanoosDashboard;
