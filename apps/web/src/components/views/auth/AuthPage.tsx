/*
Copyright 2019-2024 New Vector Ltd.
Copyright 2019 The Matrix.org Foundation C.I.C.
Copyright 2015, 2016 OpenMarket Ltd

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import classNames from "classnames";

import SdkConfig from "../../../SdkConfig";
import AuthFooter from "./AuthFooter";
import { getCurrentLanguage } from "../../../languageHandler";

const POEMS: Record<string, { main: string; sub: string; dir: "rtl" | "ltr"; font: string }> = {
    fa: {
        main: "ای روشنای قلب من، فانوس راهت می‌شوم",
        sub: "O light of my heart, I will become the lantern that lights your way.",
        dir: "rtl",
        font: "'IRANSansX', 'Vazirmatn', serif",
    },
    ar: {
        main: "يا ضياءَ قلبي، سأغدو فانوسًا يهدي طريقك",
        sub: "O light of my heart, I will become the lantern that lights your way.",
        dir: "rtl",
        font: "'Scheherazade New', 'Noto Naskh Arabic', serif",
    },
    en: {
        main: "O light of my heart, I will become the lantern that lights your way.",
        sub: "",
        dir: "ltr",
        font: "'Georgia', 'Palatino Linotype', serif",
    },
};

interface IProps {
    /**
     * Whether to add a blurred shadow around the modal.
     *
     * If the modal component provides its own shadow or blurring, this can be
     * disabled.  Defaults to `true`.
     */
    addBlur?: boolean;
}

export default class AuthPage extends React.PureComponent<React.PropsWithChildren<IProps>> {
    private static welcomeBackgroundUrl?: string;

    // cache the url as a static to prevent it changing without refreshing
    private static getWelcomeBackgroundUrl(): string {
        if (AuthPage.welcomeBackgroundUrl) return AuthPage.welcomeBackgroundUrl;

        const brandingConfig = SdkConfig.getObject("branding");
        AuthPage.welcomeBackgroundUrl = "themes/element/img/backgrounds/lake.jpg";

        const configuredUrl = brandingConfig?.get("welcome_background_url");
        if (configuredUrl) {
            if (Array.isArray(configuredUrl)) {
                const index = Math.floor(Math.random() * configuredUrl.length);
                AuthPage.welcomeBackgroundUrl = configuredUrl[index];
            } else {
                AuthPage.welcomeBackgroundUrl = configuredUrl;
            }
        }

        return AuthPage.welcomeBackgroundUrl;
    }

    public render(): React.ReactElement {
        const pageStyle = {
            background: `center/cover fixed url(${AuthPage.getWelcomeBackgroundUrl()})`,
        };

        const modalStyle: React.CSSProperties = {
            position: "relative",
            background: "initial",
        };

        const blurStyle: React.CSSProperties = {
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            filter: "blur(40px)",
            background: pageStyle.background,
        };

        const modalContentStyle: React.CSSProperties = {
            display: "flex",
            zIndex: 1,
            borderRadius: "inherit",
        };

        let modalBlur;
        if (this.props.addBlur !== false) {
            // Blur out the background: add a `div` which covers the content behind the modal,
            // and blurs it out.
            modalBlur = <div className="mx_AuthPage_modalBlur" style={blurStyle} />;
        }

        const modalClasses = classNames({
            mx_AuthPage_modal: true,
            mx_AuthPage_modal_withBlur: this.props.addBlur !== false,
        });

        const lang = getCurrentLanguage();
        const poemKey = lang.startsWith("fa") ? "fa" : lang.startsWith("ar") ? "ar" : "en";
        const poem = POEMS[poemKey];

        return (
            <div className="mx_AuthPage" style={pageStyle}>
                <div className="mx_AuthPage_poem" dir={poem.dir}>
                    <p className="mx_AuthPage_poem_main" style={{ fontFamily: poem.font }}>{poem.main}</p>
                    {poem.sub && <p className="mx_AuthPage_poem_sub">{poem.sub}</p>}
                </div>
                <div className={modalClasses} style={modalStyle}>
                    {modalBlur}
                    <main
                        className="mx_AuthPage_modalContent"
                        style={modalContentStyle}
                        tabIndex={-1}
                        aria-live="polite"
                    >
                        {this.props.children}
                    </main>
                </div>
                <AuthFooter />
            </div>
        );
    }
}
