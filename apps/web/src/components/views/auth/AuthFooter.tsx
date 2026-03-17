/*
Copyright 2019-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type ReactElement } from "react";

const AuthFooter = (): ReactElement => {
    return (
        <footer className="mx_AuthFooter" role="contentinfo">
            <span>Fanoos is an adapted version of Element, licensed under AGPL-3.0 · Modified by LLM-LAB</span>
        </footer>
    );
};

export default AuthFooter;
