# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ patches/
COPY scripts/ scripts/
COPY packages/shared-components/package.json packages/shared-components/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm nx build

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/apps/web/webapp /usr/share/nginx/html

EXPOSE 80
