# ---- 构建阶段：编译 better-sqlite3（native 模块）需要 python3/make/g++ ----
FROM node:26-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# ---- 运行阶段 ----
FROM node:26-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000
# Next.js standalone 输出（含裁剪后的 node_modules，含 better-sqlite3 二进制）
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# 迁移 SQL 与启动脚本
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
# seed 脚本需要 src/ 与 drizzle-orm（standalone 只含被路由引用的依赖，这里补上）
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
RUN npm install --no-save --no-audit --no-fund drizzle-orm
# seed 脚本需要 tsx（dev 依赖未装进 runner，这里全局装一个）
RUN npm install -g tsx
VOLUME /data
EXPOSE 3000
CMD ["sh", "-c", "node ./scripts/docker-entrypoint.mjs && node ./server.js"]
