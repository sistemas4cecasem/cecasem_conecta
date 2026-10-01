FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build
WORKDIR /app
RUN corepack enable && corepack prepare yarn@4.18.1 --activate
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN yarn install --immutable
COPY apps/web ./apps/web
ENV VITE_API_BASE_URL=/api/v1
RUN yarn workspace @cecasem-conecta/web build

FROM nginx:1.30.4-alpine@sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c AS runtime
COPY infra/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
