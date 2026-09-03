# syntax=docker/dockerfile:1.7
# Collector: Hono HTTP service (browser/server ingestion, config delivery, shop + affiliate webhooks).
# Build from the repository root:  docker build -f infra/docker/collector.Dockerfile -t track-site-collector .
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

FROM base AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/collector ./apps/collector
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @track-site/collector...
# tsup bundles every @track-site/* package into dist/main.js; third-party modules stay external
RUN pnpm --filter @track-site/collector build
# pruned production node_modules for the runtime image
RUN pnpm --filter @track-site/collector --prod --legacy deploy /out && cp -r apps/collector/dist /out/dist

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production APP_ENV=production COLLECTOR_PORT=3100
WORKDIR /app
RUN useradd --system --uid 10001 --create-home tracksite
COPY --from=build --chown=tracksite:tracksite /out /app
USER tracksite
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.COLLECTOR_PORT||3100)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
