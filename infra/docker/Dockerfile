FROM node:22-bookworm-slim AS dependencies
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci --omit=dev
FROM node:22-bookworm-slim
WORKDIR /app/backend
COPY --from=dependencies --chown=node:node /build/node_modules ./node_modules
COPY --chown=node:node backend/ ./
COPY --chown=node:node frontend/ /app/frontend/
USER node
CMD ["node", "src/server.js"]
