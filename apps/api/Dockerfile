# Build from the repository root: docker build -f apps/api/Dockerfile .
# Targets: "runtime" (the API, default) and "migrate" (applies Prisma migrations, then exits).
# The workspace hoists dependencies for the Expo apps; an isolated install fetches only the API's.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
# Loaded as TypeScript source at runtime too (Node strips the types).
COPY packages/validation packages/validation

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @shop/api --config.node-linker=isolated
COPY apps/api apps/api
RUN cd apps/api && node_modules/.bin/tsc -p tsconfig.build.json

# Keeps the Prisma CLI (a dev dependency) for `prisma migrate deploy`.
FROM build AS migrate
WORKDIR /repo/apps/api
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

FROM base AS runtime
ENV NODE_ENV=production
COPY apps/api/scripts/prune-runtime-deps.mjs /tmp/
# The pnpm store is hard-linked into node_modules, so it goes too, in the same layer.
RUN pnpm install --frozen-lockfile --prod --filter @shop/api --config.node-linker=isolated \
  && node /tmp/prune-runtime-deps.mjs \
  && rm -rf /tmp/prune-runtime-deps.mjs "$(pnpm store path)" /root/.cache
COPY --from=build /repo/apps/api/dist apps/api/dist
# Owned by the API user, so a new uploads volume mounted here starts out writable.
RUN mkdir -p apps/api/uploads && chown node:node apps/api/uploads
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/server.js"]
