# syntax=docker/dockerfile:1.7
# Impact - multi-stage build. Nothing here needs node on the host.
#
#   docker build --target dist --output type=local,dest=./out .   # export ./out/dist
#   docker build --target runtime -t impact-grafana .              # Grafana + Impact + demo dashboards

ARG NODE_VERSION=22
ARG GRAFANA_IMAGE=grafana
ARG GRAFANA_VERSION=13.0.10

# ---- deps -------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---- build ------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN npm run typecheck && npm run lint && npm run test:ci && npm run build

# ---- dist (export only) -----------------------------------------------------
FROM scratch AS dist
COPY --from=build /app/dist /dist

# ---- runtime: Grafana with the plugin and demo dashboards baked in ----------
FROM grafana/${GRAFANA_IMAGE}:${GRAFANA_VERSION} AS runtime
ENV GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=sparkanswers-impact-app,sparkanswers-impact-flow-panel,sparkanswers-impact-gauge-panel,sparkanswers-impact-river-panel,sparkanswers-impact-bars-panel \
    GF_AUTH_ANONYMOUS_ENABLED=true \
    GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer \
    GF_SECURITY_ADMIN_PASSWORD=admin
COPY --from=build /app/dist /var/lib/grafana/plugins/sparkanswers-impact-app
COPY provisioning /etc/grafana/provisioning
