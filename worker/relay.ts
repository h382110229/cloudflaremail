/**
 * Cloudflare Email Routing 中转 Worker。
 *
 * 在 Cloudflare 后台对域名启用 Email Routing，并把路由目标指向这个 Worker。
 * 收到邮件后，把原始 MIME 转发到 Next.js 应用的签名 webhook。
 *
 * 部署：
 *   npx wrangler secret put INBOUND_WEBHOOK_SECRET   # 与应用 .env 里的一致
 *   npx wrangler deploy
 */

interface Env {
  /** 应用收信地址，例如 https://mail.example.com/api/inbound */
  APP_INBOUND_URL: string;
  /** 与应用共用的 webhook 签名（wrangler secret） */
  INBOUND_WEBHOOK_SECRET: string;
}

interface EmailMessageLike {
  raw: ReadableStream<Uint8Array>;
  from: string;
  to: string;
}

export default {
  async email(message: EmailMessageLike, env: Env): Promise<void> {
    const raw = await new Response(message.raw).arrayBuffer();
    const res = await fetch(env.APP_INBOUND_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.INBOUND_WEBHOOK_SECRET}`,
        "content-type": "message/rfc822",
        "x-envelope-from": message.from,
        "x-envelope-to": message.to,
      },
      body: raw,
    });
    if (!res.ok) {
      // 注意：Email Worker 抛错后的重试语义待实测（见 docs/DESIGN.md 未决事项）。
      // 应用侧 /api/inbound 已做 Message-ID 去重，重复投递不会产生重复记录。
      throw new Error(`relay failed: ${res.status} ${await res.text()}`);
    }
  },
};
