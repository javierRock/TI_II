FROM node:22-bookworm-slim AS dependencies
WORKDIR /build
# Compilar Argon2 si no hay un binario precompilado para la arquitectura.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
# Las herramientas de migración son necesarias también en la inicialización.
RUN npm ci && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
ENV SKIP_DOTENV=1
WORKDIR /app/backend
COPY --from=dependencies --chown=node:node /build/node_modules ./node_modules
COPY --chown=node:node backend/package.json backend/package-lock.json ./
COPY --chown=node:node backend/src ./src
COPY --chown=node:node backend/scripts ./scripts
COPY --chown=node:node backend/db ./db
COPY --chown=node:node frontend /app/frontend
USER node
EXPOSE 3000
ENTRYPOINT ["node", "scripts/docker-entrypoint.js"]
CMD ["serve"]
