FROM node:24-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build


FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# The standalone output contains the server and its node_modules, static assets and public files are copied next to it
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node

EXPOSE 3000

CMD ["node", "server.js"]


FROM node:24-alpine AS dev
WORKDIR /app

ENV NODE_ENV=development

COPY web/package.json web/package-lock.json ./
RUN npm ci

EXPOSE 3000
CMD ["npm","run","dev"]
