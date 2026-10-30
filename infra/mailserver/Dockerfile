FROM node:24-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY infra/mailserver/package.json infra/mailserver/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY infra/mailserver/server.js ./

USER node

EXPOSE 5003

CMD ["node", "server.js"]
