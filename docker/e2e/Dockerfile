# syntax=docker/dockerfile:1.7

ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.65.0-noble@sha256:9beb546099e11f52d62e505537914870e01a67e0e6b00ae41da4775324e73dbe
ARG NODE_IMAGE=node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
FROM ${NODE_IMAGE} AS pinned-node
FROM ${PLAYWRIGHT_IMAGE} AS dependencies

ARG E2E_FRONTEND_ENV=main

ENV CI=true \
    HOME=/root \
    XDG_CACHE_HOME=/root/.cache \
    REACT_APP_ENV=${E2E_FRONTEND_ENV} \
    UMI_ENV=prod

WORKDIR /app

COPY --from=pinned-node /usr/local/bin/node /usr/local/bin/node
COPY --from=pinned-node /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/corepack

RUN ln -sfn ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
    && corepack enable \
    && test "$(node --version)" = "v24.19.0" \
    && corepack install --global pnpm@11.24.0

# The lockfile layer is intentionally before the candidate archive. Docker can therefore reuse
# the exact pnpm dependency graph and maintained patches when application commits change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ ./patches/
RUN --mount=type=cache,id=tiangong-next-e2e-pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --store-dir=/root/.local/share/pnpm/store

FROM dependencies AS candidate

RUN mkdir -p /opt/tiangong-e2e
COPY candidate-manifest.json /opt/tiangong-e2e/candidate-manifest.json
COPY environment.json /opt/tiangong-e2e/environment.json
COPY verify-build-input.cjs maintained-patches.cjs /tmp/
COPY candidate.tar /tmp/tiangong-candidate.tar
RUN node /tmp/verify-build-input.cjs \
    && tar -xf /tmp/tiangong-candidate.tar -C /app \
    && rm /tmp/tiangong-candidate.tar \
    && rm /tmp/verify-build-input.cjs /tmp/maintained-patches.cjs \
    && pnpm postinstall \
    && pnpm build

ENTRYPOINT ["node", "--import", "tsx", "scripts/e2e/container-runner.ts"]
