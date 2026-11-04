FROM node:24-bookworm-slim AS build
ARG NODE_OPTIONS=--max-old-space-size=1400
ENV NODE_OPTIONS=$NODE_OPTIONS NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web ./
COPY prompts /app/prompts
ENV DATABASE_URL=file:/app/data/nail.db
RUN npx prisma generate && npm run build

FROM node:24-bookworm-slim AS app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/app/data/nail.db \
    NAIL_DATA_DIR=/app/data \
    SYSTEM_PROMPT_PATH=/app/prompts/system-prompt.md

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/web
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static ./.next/static
COPY --from=build /app/web/public ./public
COPY --from=build /app/web/node_modules ./node_modules
COPY --from=build /app/web/prisma ./prisma
COPY --from=build /app/web/scripts ./scripts
COPY --from=build /app/web/src/lib/nail ./src/lib/nail
COPY --from=build /app/prompts /app/prompts

RUN chmod 755 ./scripts/start-nail.sh && mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["./scripts/start-nail.sh"]
