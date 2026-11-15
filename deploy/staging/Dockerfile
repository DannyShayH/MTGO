# syntax=docker/dockerfile:1.7
# Release images for the DigitalOcean staging Droplet. One Dockerfile, three
# targets that share the dependency layer: backend (also runs the worker and
# the migrations), partner and storefront. The storefront target embeds its
# public values at build time, so it is built after the backend of the same
# release is running (see .github/workflows/on_main.yml).
#
# Build from the repository root:
#   docker build -f deploy/staging/Dockerfile --target backend -t mtogo-backend .
ARG NODE_IMAGE=node:24.22.3-bookworm-slim

FROM ${NODE_IMAGE} AS deps
ENV CI=true \
    MEDUSA_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1
WORKDIR /app
# Only manifests, so the install layer survives source changes.
COPY package.json package-lock.json turbo.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/docs/package.json apps/docs/
COPY apps/partner/package.json apps/partner/
COPY apps/storefront/package.json apps/storefront/
COPY packages/i18n/package.json packages/i18n/
COPY packages/logging/package.json packages/logging/
COPY packages/next-react/package.json packages/next-react/
COPY packages/ui/package.json packages/ui/
RUN npm ci

FROM deps AS source
COPY . .
ENV NODE_ENV=production

# Medusa backend, admin and worker. Also carries the Compose file of the same
# release, which the deploy script extracts (deploy/staging/mtogo-deploy.sh).
FROM source AS backend
RUN cd apps/backend && npm run build \
    && mkdir -p .medusa/server/static \
    && chown -R node:node .medusa/server/static
WORKDIR /app/apps/backend/.medusa/server
USER node
EXPOSE 9000
CMD ["npm", "run", "start"]

# Partner app. MEDUSA_BACKEND_URL is read at runtime on the server side.
FROM source AS partner
RUN cd apps/partner && npm run build && rm -rf .next/cache
WORKDIR /app/apps/partner
USER node
EXPOSE 8100
CMD ["npm", "exec", "--no", "--", "next", "start", "--port", "8100"]

# Storefront. Next.js inlines NEXT_PUBLIC_* at build time and prerenders the
# sitemap from the backend, so the backend of this release must be reachable at
# NEXT_PUBLIC_MEDUSA_BACKEND_URL with this publishable key during the build.
FROM source AS storefront
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_DEFAULT_REGION=dk
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_MEDUSA_BACKEND_URL=${NEXT_PUBLIC_MEDUSA_BACKEND_URL} \
    NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL} \
    NEXT_PUBLIC_DEFAULT_REGION=${NEXT_PUBLIC_DEFAULT_REGION} \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY}
RUN test -n "$NEXT_PUBLIC_MEDUSA_BACKEND_URL" && test -n "$NEXT_PUBLIC_BASE_URL" \
    && test -n "$NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY" \
    || { echo "The storefront build needs its public staging values as build arguments" >&2; exit 1; }
RUN cd apps/storefront && npm run build && rm -rf .next/cache
WORKDIR /app/apps/storefront
USER node
EXPOSE 8000
CMD ["npm", "exec", "--no", "--", "next", "start", "--port", "8000"]
