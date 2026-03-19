/*
Copyright 2026 LLM-LAB (Fanoos fork)
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
*/

/*
 * Fanoos — file type icons for file messages.
 * "doc" variant: document page SVG (for small inline use).
 * "circle" variant: filled circle with extension badge (Telegram-style).
 */

import React from "react";

interface Props {
    mimeType?: string;
    size?: number;
    variant?: "doc" | "circle";
    /** Override label shown inside the circle (e.g. first chars of filename) */
    label?: string;
}

type IconDef = { color: string; badge?: string };

function iconFor(mime: string): IconDef {
    const m = mime.toLowerCase();
    if (m === "application/pdf") return { color: "#e53935", badge: "PDF" };
    if (m.includes("wordprocessingml") || m === "application/msword" || m === "application/vnd.oasis.opendocument.text")
        return { color: "#1565c0", badge: "DOC" };
    if (m.includes("spreadsheetml") || m === "application/vnd.ms-excel" || m.includes("opendocument.spreadsheet"))
        return { color: "#2e7d32", badge: "XLS" };
    if (
        m.includes("presentationml") ||
        m === "application/vnd.ms-powerpoint" ||
        m.includes("opendocument.presentation")
    )
        return { color: "#e65100", badge: "PPT" };
    if (
        m === "application/zip" ||
        m === "application/x-zip-compressed" ||
        m === "application/x-rar-compressed" ||
        m.includes("zip") ||
        m.includes("tar") ||
        m.includes("gzip")
    )
        return { color: "#f9a825", badge: "ZIP" };
    if (m.startsWith("text/")) return { color: "#546e7a", badge: "TXT" };
    if (m.includes("javascript") || m.includes("json") || m.includes("xml") || m.includes("html"))
        return { color: "#6a1b9a", badge: "CODE" };
    return { color: "#607d8b" };
}

function DocIcon({ mimeType = "", size = 36 }: { mimeType?: string; size?: number }): React.ReactElement {
    const { color, badge } = iconFor(mimeType);
    const w = size;
    const h = Math.round(size * 1.25);
    const fold = Math.round(size * 0.28);
    const r = Math.round(size * 0.1);
    const lineX1 = Math.round(w * 0.22);
    const lineX2 = Math.round(w * 0.78);
    const lineY = [Math.round(h * 0.52), Math.round(h * 0.63), Math.round(h * 0.74)];

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            aria-hidden="true"
            style={{ display: "block", flexShrink: 0 }}
        >
            <path
                d={`M${r},1 H${w - fold} L${w - 1},${fold} V${h - r} Q${w - 1},${h - 1} ${w - r - 1},${h - 1} H${r} Q1,${h - 1} 1,${h - r} V${r + 1} Q1,1 ${r},1 Z`}
                fill={color}
                opacity="0.15"
                stroke={color}
                strokeWidth="1.2"
            />
            <path
                d={`M${w - fold},1 L${w - fold},${fold} L${w - 1},${fold}`}
                fill="none"
                stroke={color}
                strokeWidth="1.2"
                opacity="0.6"
            />
            {!badge &&
                lineY.map((y, i) => (
                    <line
                        key={i}
                        x1={lineX1}
                        y1={y}
                        x2={i === 2 ? Math.round(w * 0.55) : lineX2}
                        y2={y}
                        stroke={color}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        opacity="0.6"
                    />
                ))}
            {badge && (
                <>
                    <rect
                        x={Math.round(w * 0.1)}
                        y={Math.round(h * 0.48)}
                        width={Math.round(w * 0.8)}
                        height={Math.round(h * 0.3)}
                        rx={Math.round(size * 0.07)}
                        fill={color}
                    />
                    <text
                        x={w / 2}
                        y={Math.round(h * 0.685)}
                        textAnchor="middle"
                        fontSize={badge.length > 3 ? Math.round(size * 0.19) : Math.round(size * 0.22)}
                        fontWeight="700"
                        fontFamily="system-ui, sans-serif"
                        fill="#fff"
                        letterSpacing="-0.3"
                    >
                        {badge}
                    </text>
                </>
            )}
        </svg>
    );
}

function CircleIcon({
    mimeType = "",
    size = 48,
    label,
}: {
    mimeType?: string;
    size?: number;
    label?: string;
}): React.ReactElement {
    const { color, badge } = iconFor(mimeType);
    const r = size / 2;
    // Use provided label (filename initials), falling back to mime badge
    const text = label ?? badge;
    const fontSize = text ? Math.round(size * (text.length > 2 ? 0.22 : 0.28)) : Math.round(size * 0.4);

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            aria-hidden="true"
            style={{ display: "block", flexShrink: 0 }}
        >
            <circle cx={r} cy={r} r={r} fill={color} />
            {text ? (
                <text
                    x={r}
                    y={r + fontSize * 0.37}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fontWeight="700"
                    fontFamily="system-ui, sans-serif"
                    fill="#fff"
                    letterSpacing="-0.3"
                >
                    {text}
                </text>
            ) : (
                /* generic document icon in white */
                <>
                    {/* page body */}
                    <rect
                        x={Math.round(size * 0.28)}
                        y={Math.round(size * 0.18)}
                        width={Math.round(size * 0.44)}
                        height={Math.round(size * 0.56)}
                        rx={Math.round(size * 0.05)}
                        fill="none"
                        stroke="#fff"
                        strokeWidth={Math.round(size * 0.065)}
                        strokeLinejoin="round"
                    />
                    {/* fold triangle */}
                    <path
                        d={`M${Math.round(size * 0.58)},${Math.round(size * 0.18)} L${Math.round(size * 0.72)},${Math.round(size * 0.32)} L${Math.round(size * 0.58)},${Math.round(size * 0.32)} Z`}
                        fill="#fff"
                        opacity="0.5"
                    />
                    {/* content lines */}
                    {[0.47, 0.56, 0.65].map((yFrac, i) => (
                        <line
                            key={i}
                            x1={Math.round(size * 0.35)}
                            y1={Math.round(size * yFrac)}
                            x2={Math.round(size * (i === 2 ? 0.57 : 0.65))}
                            y2={Math.round(size * yFrac)}
                            stroke="#fff"
                            strokeWidth={Math.round(size * 0.05)}
                            strokeLinecap="round"
                            opacity="0.8"
                        />
                    ))}
                </>
            )}
        </svg>
    );
}

export function FileTypeIcon({ mimeType = "", size = 36, variant = "doc", label }: Props): React.ReactElement {
    if (variant === "circle") {
        return <CircleIcon mimeType={mimeType} size={size} label={label} />;
    }
    return <DocIcon mimeType={mimeType} size={size} />;
}
