# Build from the repository root: docker build -f apps/web/Dockerfile .
# Needs API_URL at runtime (e.g. http://api:4000 inside Docker Compose).
# The workspace hoists dependencies for the Expo apps; an isolated install fetches only the website's.

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN --mount=type=secret,id=pnpm-verified-cache,target=/tmp/pnpm-lockfile-verified.jsonl,required=false \
  mkdir -p /root/.cache/pnpm \
  && if [ -f /tmp/pnpm-lockfile-verified.jsonl ]; then cp /tmp/pnpm-lockfile-verified.jsonl /root/.cache/pnpm/lockfile-verified.jsonl; fi \
  && pnpm install --frozen-lockfile --filter web --config.node-linker=isolated
COPY apps/web apps/web
RUN cd apps/web && node_modules/.bin/next build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/robots.txt').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/web/server.js"]
