/**
 * cloudflaremail SMTP 提交服务器（独立进程）
 *
 * 监听 587 端口，其他服务用标准 SMTP 协议经它发信：
 *   - 必须 AUTH（SMTP_USER / SMTP_PASS）
 *   - MAIL FROM 必须是本站已存在的 mailbox 地址
 *   - 经 Resend API 实际发出，同时写入 messages 表（status=sent）
 *   - STARTTLS：/data/smtp-cert.pem + smtp-key.pem 存在即启用，不存在则自动生成自签名证书
 *
 * 环境变量：SMTP_USER, SMTP_PASS, RESEND_API_KEY, DATA_DIR（默认 /data）, SMTP_PORT（默认 587）
 */
import { SMTPServer } from "smtp-server";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import PostalMime from "postal-mime";
import selfsigned from "selfsigned";

const PORT = Number(process.env.SMTP_PORT ?? 587);
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const DB_PATH = `${DATA_DIR}/mail.db`;
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";

if (!SMTP_USER || !SMTP_PASS) {
  console.error("[smtp] SMTP_USER / SMTP_PASS 未配置，退出");
  process.exit(1);
}
if (!RESEND_API_KEY) {
  console.error("[smtp] RESEND_API_KEY 未配置，退出");
  process.exit(1);
}
mkdirSync(DATA_DIR, { recursive: true });

// ---- TLS 证书（自签名，持久化到 DATA_DIR）----
let tls = undefined;
try {
  const certPath = `${DATA_DIR}/smtp-cert.pem`;
  const keyPath = `${DATA_DIR}/smtp-key.pem`;
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    console.log("[smtp] 生成自签名 TLS 证书…");
    const pems = selfsigned.generate([{ name: "commonName", value: "cloudflaremail-smtp" }], {
      days: 3650,
      keySize: 2048,
    });
    writeFileSync(certPath, pems.cert);
    writeFileSync(keyPath, pems.private);
  }
  tls = { cert: readFileSync(certPath), key: readFileSync(keyPath) };
  console.log("[smtp] STARTTLS 已启用");
} catch (e) {
  console.warn("[smtp] TLS 证书不可用，明文运行:", e.message);
}

const db = new DatabaseSync(DB_PATH);
const findMailbox = db.prepare("SELECT id, address FROM mailboxes WHERE address = ?");

async function sendViaResend({ from, to, cc, bcc, subject, text, html, attachments }) {
  const body = { from, to, subject };
  if (cc?.length) body.cc = cc;
  if (bcc?.length) body.bcc = bcc;
  if (html) body.html = html;
  if (text) body.text = text;
  if (attachments?.length) {
    body.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content).toString("base64"),
    }));
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend ${r.status}: ${d.message ?? JSON.stringify(d)}`);
  return d.id;
}

function logSent({ mailboxId, fromAddr, to, cc, subject, text, html, attachments }) {
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const snippet = (text ?? "").replace(/\s+/g, " ").slice(0, 200);
  db.prepare(
    `INSERT INTO messages (id, mailbox_id, message_id, thread_id, from_addr, from_name,
      to_addrs, cc_addrs, subject, date, snippet, body_text, body_html,
      has_attachments, status, starred, raw_path, created_at)
     VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', 0, NULL, ?)`
  ).run(
    id, mailboxId, id, fromAddr,
    to.join(", "), cc.length ? cc.join(", ") : null,
    subject || "(无主题)", now, snippet,
    text || null, html || null,
    attachments.length > 0 ? 1 : 0, now
  );
  // 附件落盘（与 /api/send 一致的目录结构）
  attachments.forEach((a, i) => {
    const dir = `${DATA_DIR}/attachments/${id}`;
    mkdirSync(dir, { recursive: true });
    const safeName = `${i}-${(a.filename || "attachment").replace(/[^\w.\-]/g, "_")}`;
    const storagePath = `${dir}/${safeName}`;
    writeFileSync(storagePath, Buffer.from(a.content));
    db.prepare(
      `INSERT INTO attachments (id, message_id, filename, content_type, size, storage_path)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), id, a.filename || "attachment", a.contentType || "application/octet-stream",
      Buffer.from(a.content).byteLength, storagePath);
  });
  return id;
}

const server = new SMTPServer({
  // 不强制 TLS（内网服务），但提供 STARTTLS
  disabledCommands: [],
  authMethods: ["PLAIN", "LOGIN"],
  onAuth(auth, session, callback) {
    if (auth.username === SMTP_USER && auth.password === SMTP_PASS) {
      return callback(null, { user: auth.username });
    }
    return callback(new Error("鉴权失败"));
  },
  onMailFrom(address, session, callback) {
    const mb = findMailbox.get(address.address.toLowerCase());
    if (!mb) {
      console.warn(`[smtp] 拒绝未知发件人: ${address.address}`);
      return callback(new Error("发件人不属于本站邮箱"));
    }
    session.fromMailbox = mb;
    session.envelopeFrom = address.address;
    callback();
  },
  onRcptTo(address, session, callback) {
    (session.rcpts ??= []).push(address.address);
    callback();
  },
  onData(stream, session, callback) {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", async () => {
      try {
        const raw = Buffer.concat(chunks);
        const parsed = await PostalMime.parse(raw);
        const to = (session.rcpts ?? []).filter(Boolean);
        if (to.length === 0) throw new Error("无收件人");

        const fromAddr = session.fromMailbox.address;
        const subject = parsed.subject ?? "(无主题)";
        const text = parsed.text ?? "";
        const html = parsed.html ?? null;
        const attachments = (parsed.attachments ?? []).map((a) => ({
          filename: a.filename ?? "attachment",
          contentType: a.mimeType ?? "application/octet-stream",
          content: a.content, // Uint8Array
        }));

        const resendId = await sendViaResend({ from: fromAddr, to, subject, text, html, attachments });
        const dbId = logSent({
          mailboxId: session.fromMailbox.id, fromAddr, to, cc: [],
          subject, text, html, attachments,
        });
        console.log(`[smtp] 已发送 ${fromAddr} -> ${to.join(",")} resend=${resendId} db=${dbId}`);
        callback(null);
      } catch (e) {
        console.error("[smtp] 发送失败:", e.message);
        callback(new Error(`发送失败: ${e.message}`));
      }
    });
  },
  ...(tls ? { key: tls.key, cert: tls.cert } : {}),
});

server.on("error", (e) => console.error("[smtp] server error:", e.message));
server.listen(PORT, "::", () => {
  console.log(`[smtp] 监听 [::]:${PORT}（用户 ${SMTP_USER}）`);
});
