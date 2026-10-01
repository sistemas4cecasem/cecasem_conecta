FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS base
WORKDIR /app
RUN corepack enable && corepack prepare yarn@4.18.1 --activate

FROM base AS dependencies
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN yarn install --immutable

FROM dependencies AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY apps/api ./apps/api
RUN yarn workspace @cecasem-conecta/api build

FROM base AS production-dependencies
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN YARN_ENABLE_IMMUTABLE_INSTALLS=true yarn workspaces focus @cecasem-conecta/api --production

FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=production-dependencies /app/node_modules /app/node_modules
COPY --from=production-dependencies /app/apps/api /app/apps/api
COPY --from=build /app/apps/api/dist ./dist
USER node
CMD ["node", "dist/main.js"]
