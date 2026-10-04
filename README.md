# cloudflaremail

自用的域名邮箱系统：Next.js + SQLite 自托管，收信走 Cloudflare Email Routing（免费），发信走 Resend API。

> 从零自研，仅借鉴 mailflare 的架构思路，不复制其代码（AGPL）。

## 架构

```
发件人 ──SMTP──▶ Cloudflare Email Routing ──▶ 中转 Worker ──HTTPS POST──▶ /api/inbound ──▶ 解析入库 (SQLite)
                                                                                                │
用户 ◀── Caddy ──▶ Next.js 应用 ◀──▶ SQLite + 本地附件                                            │
                    │                                                                           │
                    └── 发信 ──▶ Resend API ──SMTP──▶ 收件人                                       ▼
                                                                                附件 → ./data/attachments
```

- **收信**：MX 留在 Cloudflare，Email Routing 免费收；一个几十行的小 Worker 把原始邮件转发到应用的签名 webhook。
- **发信**：直接调 Resend HTTP API，不自建 SMTP（省掉 25 端口、PTR、IP 信誉三大坑）。
- **存储**：SQLite 单文件 + 本地磁盘存附件，备份就是拷文件。
- **密钥**：不在仓库里。`.env.example` 是模板，真值放 Google Drive（`Muse-Data/cloudflaremail/secrets`）。

## 目录

- `src/app` — Next.js App Router（页面 + API）
- `src/app/api/inbound` — 收信 webhook（Bearer 签名校验）
- `src/db/schema.ts` — 数据表（Drizzle ORM）
- `src/lib/resend.ts` — 发信封装
- `worker/` — Cloudflare 中转 Worker（Email Routing → webhook）
- `docs/DESIGN.md` — 详细设计文档

## 快速开始

```bash
npm install
cp .env.example .env   # 按 .env.example 里的说明填真值（真值在 Google Drive，不在仓库）
npm run db:push
npm run dev
```

## Docker 部署（推荐）

```bash
cp .env.example .env   # 填真值：RESEND_API_KEY、INBOUND_WEBHOOK_SECRET（openssl rand -hex 32）、
                       # APP_URL=https://mail-app.hawkren.online、MAIL_FROM=hi@email.hawkren.online
docker compose up -d --build
```

- 首次启动自动建表（`drizzle/0001_init.sql`，幂等）。
- 数据持久化在 `cloudflaremail-data` volume（SQLite + 附件 + 原始邮件）。
- 初始化邮箱账号：`docker compose exec cloudflaremail tsx scripts/seed.ts`
  （`SEED_DOMAIN` / `SEED_MAILBOX` 可覆盖，默认 `hi@email.hawkren.online`）。
- 公网访问走 Cloudflare Tunnel（复用已有 tunnel）：Zero Trust 仪表盘给 tunnel
  加 public hostname `mail-app.hawkren.online` → `http://cloudflaremail:3000`
  （与 cloudflared 同一 `homelab` Docker 网络，容器名直连）。

```
中转 Worker 部署（另起）：

```bash
cd worker
npx wrangler secret put INBOUND_WEBHOOK_SECRET
npx wrangler deploy
```

然后在 Cloudflare 后台把域名的 Email Routing 目标指向这个 Worker。

## 路线图

- Phase 0 ✅ 项目骨架、设计文档、DNS 规划
- Phase 1 收信管线端到端 + 只读收件箱 UI
- Phase 2 发信（Resend）+ 写信 UI
- Phase 3 文件夹 / 全文搜索 / 别名 / 路由规则 / 会话视图
- Phase 4 加固：登录 + TOTP、限流、备份自动化、死信处理

## License

MIT
