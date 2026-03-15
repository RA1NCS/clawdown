# clawdown api — markdown to styled PDF
FROM oven/bun:1-slim AS deps
WORKDIR /app/api
COPY api/package.json ./
RUN bun install --production

FROM oven/bun:1-slim
WORKDIR /app

# deps from cache layer
COPY --from=deps /app/api/node_modules ./api/node_modules

# source + assets
COPY api/src/ ./api/src/
COPY api/assets/ ./api/assets/
COPY api/package.json ./api/

# style.css lives at project root — render.ts reads ../../style.css from src/
COPY style.css ./style.css

WORKDIR /app/api
EXPOSE 8080
CMD ["bun", "src/index.ts"]
