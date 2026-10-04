# cloudflaremail 设计文档

版本：v0.1（2026-10-04）｜ 技术栈：Next.js 15 + SQLite + Resend ｜ 部署：自家服务器 + Caddy

## 0. 决策记录

| 事项 | 决策 | 理由 |
|---|---|---|
| 后端框架 | Next.js 15（App Router） | 界面是这个项目的大头；AI agent 最熟；mailflare 可作架构参考书 |
| 发信 | Resend HTTP API | 免费 3000 封/月（100 封/天）；官方 SDK 对 Next.js 友好；不碰 SMTP 25 端口 |
| 收信 | Cloudflare Email Routing → 中转 Worker → 签名 webhook | 收信免费；应用本身不吃 Workers CPU；无公网 25 端口需求 |
| 存储 | SQLite（better-sqlite3）+ 本地磁盘 | 单文件备份；自用流量 SQLite 绰绰有余 |
| 密钥 | 不进仓库，真值放 Google Drive（`Muse-Data/cloudflaremail/secrets`） | 本仓库是 public |
| License | MIT | 自研代码，无传染问题 |

## 1. 总体架构

```
发件人 ──SMTP──▶ Cloudflare Email Routing ──▶ 中转 Worker ──HTTPS POST──▶ /api/inbound ──▶ 解析入库 (SQLite)
                                                                                                │
用户 ◀── Caddy ──▶ Next.js 应用 ◀──▶ SQLite + 本地附件                                            │
                    │                                                                           │
                    └── 发信 ──▶ Resend API ──SMTP──▶ 收件人                                       ▼
                                                                                附件 → ./data/attachments
```

## 2. 收信管线

1. 发件人 SMTP 投递到 Cloudflare（域名的 MX 在 CF，启用 Email Routing）。
2. Email Routing 触发 `worker/relay.ts` 的 email handler。
3. Worker 读取原始 MIME，POST 到 `$APP_URL/api/inbound`，携带：
   - `Authorization: Bearer <INBOUND_WEBHOOK_SECRET>`
   - `X-Envelope-To: <原始收件地址>`
   - Body：原始 MIME。
4. `src/app/api/inbound/route.ts` 校验签名 → postal-mime 解析 →
   Message-ID 去重 → 别名/邮箱匹配 → 落库 + 附件落盘 + 原始 MIME 存档。
5. 返回 200。

收件地址解析顺序：别名表 → 精确邮箱 → 无匹配则丢弃并记日志（Phase 3 再加 catch-all 与路由规则）。

## 3. 发信流程

写信 UI → `POST /api/send`（登录态，Phase 2）→ `src/lib/resend.ts` → Resend API →
返回 message id → 落库（`status=sent`）。

收发同用一个子域 `email.hawkren.online`（自用流量小，无需做信誉隔离）。

## 4. 数据表（必读）

共 8 张表，关系：`users 1—N sessions`；`domains 1—N mailboxes/aliases/routingRules`；
`mailboxes 1—N messages`；`messages 1—N attachments`。

- `messages.status` 驱动文件夹视图：`received`=收件箱、`sent`=已发送、
  `draft`=草稿、`spam`=垃圾、`trash`=垃圾箱、`archived`=归档。
- `toAddrs`/`ccAddrs` 存原文拼接（展示用）；精确查询走 `messageId`。
- 附件只存元数据，文件在 `DATA_DIR/attachments/<messageId>/`。
- `settings` 只放非密钥配置；密钥一律走环境变量。

## 5. API 清单

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | `/api/inbound` | 收信 webhook | Bearer 签名 |
| POST | `/api/send` | 发信（Phase 2） | 登录 |
| GET | `/api/messages` | 邮件列表（Phase 1/3） | 登录 |
| GET | `/api/messages/[id]` | 读信 + 附件（Phase 1） | 登录 |

## 6. 环境变量

见 `.env.example`。`INBOUND_WEBHOOK_SECRET` 生成：`openssl rand -hex 32`。
Worker 侧的同名 secret 用 `npx wrangler secret put` 单独设置。

## 7. DNS 清单

收发同用 `email.hawkren.online`（2026-10-04 确认）：

- **MX**：Cloudflare 后台给子域 `email.hawkren.online` 启用 Email Routing，
  MX 自动接管，无需手填。
- **发信验证**：Resend 后台添加域名 `email.hawkren.online`，
  按它给出的记录逐条添加（SPF / DKIM），验证通过后再发信。
  不要猜记录值，以 Resend 后台显示为准（支持 Cloudflare 自动配置）。
- **DMARC**：`_dmarc.email.hawkren.online` TXT →
  `v=DMARC1; p=quarantine; rua=mailto:dmarc@email.hawkren.online`
- **应用域名**（如 `mail-app.hawkren.online`）：A/AAAA 指向自家服务器，
  Caddy 反代 `127.0.0.1:3000`，全站 HTTPS。

## 8. 部署（Docker + Tunnel，2026-10-04 定案）

服务器无公网 IP，公网访问走 Cloudflare Tunnel（复用已有 tunnel，本机反代是 Traefik，不动它）。

- 构建：`docker compose up -d --build`（多阶段构建，better-sqlite3 在构建阶段编译）。
- 容器 `cloudflaremail` 加入已有的 `homelab` Docker 网络；tunnel 在 Zero Trust 仪表盘
  加 public hostname `mail-app.hawkren.online` → `http://cloudflaremail:3000`
  （容器名直连，不发布宿主机端口）。
- 首次启动自动执行 `drizzle/0001_init.sql` 建表（`scripts/docker-entrypoint.mjs`，幂等）。
- 数据持久化：`cloudflaremail-data` volume（SQLite + 附件 + 原始邮件）。
- 初始化邮箱：`docker compose exec cloudflaremail tsx scripts/seed.ts`
  （`SEED_DOMAIN` / `SEED_MAILBOX` 可覆盖）。
- `.env` 在服务器上从 `.env.example` 复制后填真值（不进仓库）；
  `APP_URL=https://mail-app.hawkren.online`。
- 备份（cron 每天）：停容器后把 volume 打包
  `docker run --rm -v cloudflaremail-data:/data -v $(pwd)/backup:/backup alpine tar czf /backup/mail-$(date +%F).tgz -C /data .`
  再起容器，tgz 推到 Google Drive。
- 公网暴露面的鉴权在 Phase 4 登录完成前用 Cloudflare Access 顶着。

## 9. 分阶段计划

- **Phase 0** ✅ 骨架、设计、DNS 规划（当前）
- **Phase 1** 🚧 收信管线端到端 + 只读收件箱 UI（列表/读信/附件下载）。
  验收：从 Gmail 发一封带附件的信到自有域名，出现在收件箱。
- **Phase 2** 发信 + 写信 UI（富文本、附件、回复/转发）。
  验收：发出的信到达 Gmail 且不在垃圾箱（SPF/DKIM/DMARC 对齐）。
- **Phase 3** 文件夹 / 全文搜索（FTS5）/ 别名 / 路由规则 / 会话视图。
- **Phase 4** 加固：密码登录 + TOTP、限流、备份自动化、死信处理。

## 10. 风险与未决事项

1. Cloudflare Email Worker 抛错后的重试语义待实测确认（影响死信设计）。
2. Resend 免费档 100 封/天，自用足够，不要拿来做通知轰炸。
3. 附件大小：Next.js 默认请求体限制，大附件策略 Phase 2 定。
4. mailflare 是 AGPL：只借鉴思路，代码全部自己写，避免许可证纠纷。
5. 首封邮件的冷启动：新域名发信信誉为零，先给自己发几封养一下再正式用。
