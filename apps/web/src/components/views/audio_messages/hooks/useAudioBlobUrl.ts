/*
Copyright 2026 LLM-LAB (Fanoos fork)
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
*/

import { useEffect, useState } from "react";

import { type MediaEventHelper } from "../../../../utils/MediaEventHelper";

export function useAudioBlobUrl(mediaEventHelper?: MediaEventHelper): { src: string; error: boolean } {
    const [src, setSrc] = useState("");
    const [error, setError] = useState(false);

    useEffect(() => {
        let objUrl: string | null = null;
        mediaEventHelper?.sourceBlob.value
            .then((blob) => {
                objUrl = URL.createObjectURL(blob);
                setSrc(objUrl);
            })
            .catch(() => setError(true));
        return () => {
            if (objUrl) URL.revokeObjectURL(objUrl);
        };
    }, [mediaEventHelper]);

    return { src, error };
}
