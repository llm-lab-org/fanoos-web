# Fanoos — Matrix Web Client

**Fanoos** is a Persian/Arabic-first fork of [Element Web](https://github.com/element-hq/element-web), a Matrix web client built on the [Matrix JS SDK](https://github.com/matrix-org/matrix-js-sdk). It adds a rich dashboard, RTL/multilingual support, drawing tools, audio players, and many UX improvements on top of the upstream codebase.

---

## What's New in Fanoos

### Dashboard (`/dashboard`)

A full-screen dashboard accessible from the sidebar, with animated tabs:

- **Teams tab** — lists all joined Matrix spaces and rooms, with expandable group view, member counts, admin controls (invite/kick/ban/promote), and a floating room-detail panel
- **Admin tab** _(admins only)_ — user management panel: search users, assign roles, ban/unban, invite to rooms
- **Draw tab** — embedded Excalidraw whiteboard with:
    - Full locale support (Persian, Arabic, and 50+ other languages via Excalidraw's `langCode`)
    - Save drawing to a Matrix room named **MyDrawing** as both PNG and SVG, with a filename prompt
    - Send current drawing as a PNG directly into any chat via the composer palette button
    - Dark/light theme follows the app theme
    - External social links (GitHub, YouTube, Discord, libraries.excalidraw.com) hidden for a clean UI
    - All whiteboard UI translated for Persian and Arabic users

### RTL & Multilingual Support

- **Quick language switcher** in the settings menu — toggle between Persian (فارسی), English, and Arabic instantly; page reloads and returns to the same view you were in (dashboard state preserved via sessionStorage)
- **Quick direction control** — switch between RTL / Auto / LTR without a full settings page
- **Locale-aware digits** — all numbers in the UI render as native Persian (۰–۹) or Arabic (٠–٩) digits when the locale is `fa` or `ar`
- **Custom flower emoji** (U+E000–E007, Private Use Area) rendered as `<img>` in the composer

### Font & Appearance

- **Quick font-size control** in the settings menu — A / A slider directly in the quick-settings panel (9px–36px range)
- **IRANSansX** as the default app font for Persian users, with fallback to Inter and system fonts
- **Light-beige chat background** (`#faf7f2`) in light mode — no pattern, easy on the eyes
- Custom animated login page with a Persian/English poem and blurred glassmorphism modal

### Audio Player

- Custom Fanoos audio player with three skins: **Minimal**, **Modern**, and **Telegram-style**
- Native `<audio>` element fallback for broad format support
- Waveform display and playback controls integrated into the message timeline

### Chat Composer

- **Send Drawing** button (palette icon) in the message composer — exports the current Excalidraw canvas and sends it as an image to the active room

### Deployment

- Docker-based deployment via `docker compose --build` on push to `develop`
- Deployed to:
    - `fanoos.quranic.network`
    - `fanoos.llm-lab.org`
- Dev server runs on **port 8080** (`pnpm nx start fanoos-web`)

---

## Getting Started

### Development

```bash
pnpm install
pnpm nx start fanoos-web
# → http://localhost:8080
```

### Production Build

```bash
pnpm nx build fanoos-web
# Output: apps/web/webapp/
```

### Docker

```bash
docker compose --env-file /opt/fanoos-<site>.env up --build -d
```

---

## Supported Environments

- Modern desktop browsers (Chrome, Firefox, Edge, Safari)
- Mobile web (Chrome, Firefox, Safari on Android/iOS/iPadOS)
- RTL layouts fully supported

---

## Translations

Fanoos ships full Persian (`fa`) and Arabic (`ar`) translations for all custom UI strings, including the dashboard, drawing tools, outline panels, and audio player. Upstream Element Web strings are translated via [Localazy](https://localazy.com/p/element-web).

---

## Upstream

This project is a fork of [Element Web](https://github.com/element-hq/element-web) by New Vector Ltd / Element.

## Copyright & License

Copyright (c) 2014–2017 OpenMarket Ltd
Copyright (c) 2017 Vector Creations Ltd
Copyright (c) 2017–2025 New Vector Ltd
Copyright (c) 2026 LLM-LAB (Fanoos fork)

This software is multi-licensed by New Vector Ltd (Element). It can be used either:

1. For free under the terms of the **GNU Affero General Public License** (AGPL-3.0-only), as published by the Free Software Foundation, either version 3 of the License or (at your option) any later version; **OR**
2. For free under the terms of the **GNU General Public License** (GPL-3.0-only), as published by the Free Software Foundation, either version 3 of the License or (at your option) any later version; **OR**
3. Under the terms of a paid-for **Element Commercial License** agreement between you and Element.

Please contact [licensing@element.io](mailto:licensing@element.io) to purchase an Element commercial license.
