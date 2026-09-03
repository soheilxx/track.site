# syntax=docker/dockerfile:1.7
# Worker: ingest pipeline, destination delivery, retention and usage jobs (no inbound port).
# Build from the repository root:  docker build -f infra/docker/worker.Dockerfile -t track-site-worker .
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

FROM base AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @track-site/worker...
RUN pnpm --filter @track-site/worker build
RUN pnpm --filter @track-site/worker --prod --legacy deploy /out && cp -r apps/worker/dist /out/dist

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production APP_ENV=production
WORKDIR /app
RUN useradd --system --uid 10001 --create-home tracksite
COPY --from=build --chown=tracksite:tracksite /out /app
USER tracksite
# the worker exposes a small health endpoint on WORKER_PORT (default 3199) for orchestrators
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.WORKER_PORT||3199)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
