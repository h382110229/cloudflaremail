import { NextRequest, NextResponse } from "next/server";
import PostalMime from "postal-mime";
import { randomUUID, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aliases, attachments, mailboxes, messages } from "@/db/schema";

export const runtime = "nodejs";

/**
 * 收信 webhook：只接受中转 Worker 的签名请求。
 * Headers: Authorization: Bearer <INBOUND_WEBHOOK_SECRET>
 *          X-Envelope-To: <原始收件地址>
 * Body: 原始 MIME（message/rfc822）
 */

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) return false;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function resolveMailbox(envelopeTo: string) {
  const addr = envelopeTo.trim().toLowerCase();
  if (!addr) return null;
  // 1. 别名
  const alias = await db.query.aliases.findFirst({ where: eq(aliases.source, addr) });
  const target = alias?.destination ?? addr;
  // 2. 精确邮箱
  return (await db.query.mailboxes.findFirst({ where: eq(mailboxes.address, target) })) ?? null;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const envelopeTo = req.headers.get("x-envelope-to") ?? "";
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length === 0) {
    return NextResponse.json({ error: "empty body" }, { status: 400 });
  }

  const email = await PostalMime.parse(raw);
  const messageId = email.messageId ?? null;

  // 幂等：Message-ID 去重（网络重试导致重复投递时不产生两条记录）
  if (messageId) {
    const dup = await db.query.messages.findFirst({ where: eq(messages.messageId, messageId) });
    if (dup) return NextResponse.json({ ok: true, deduped: true, id: dup.id });
  }

  const mailbox = await resolveMailbox(envelopeTo);
  if (!mailbox) {
    console.warn(`[inbound] 无匹配邮箱，丢弃: envelopeTo=${envelopeTo} subject=${email.subject}`);
    return NextResponse.json({ ok: true, dropped: true });
  }

  const dataDir = process.env.DATA_DIR ?? "./data";
  const id = randomUUID();
  const text = email.text ?? "";
  const snippet = text.replace(/\s+/g, " ").slice(0, 200);
  const atts = email.attachments ?? [];

  // 原始 MIME 存档（排障用）
  const rawDir = path.join(dataDir, "raw");
  await fs.mkdir(rawDir, { recursive: true });
  const rawPath = path.join(rawDir, `${id}.eml`);
  await fs.writeFile(rawPath, raw);

  // 先插 messages：attachments.message_id 有外键约束引用 messages.id，
  // 顺序反了会 SQLITE_CONSTRAINT_FOREIGNKEY
  await db.insert(messages).values({
    id,
    mailboxId: mailbox.id,
    messageId,
    threadId: id, // Phase 3 再做会话归并
    fromAddr: email.from?.address ?? "",
    fromName: email.from?.name ?? null,
    toAddrs: (email.to ?? []).map((t) => t.address ?? "").join(", "),
    ccAddrs: (email.cc ?? []).map((t) => t.address ?? "").join(", ") || null,
    subject: email.subject ?? "",
    date: email.date ? new Date(email.date) : null,
    snippet,
    bodyText: text || null,
    bodyHtml: email.html ?? null,
    hasAttachments: atts.length > 0 ? 1 : 0,
    status: "received",
    starred: 0,
    rawPath,
    createdAt: new Date(),
  });

  // 附件落盘（message 已插入，外键满足）
  for (const [i, att] of atts.entries()) {
    const dir = path.join(dataDir, "attachments", id);
    await fs.mkdir(dir, { recursive: true });
    const safeName = `${i}-${(att.filename ?? "attachment").replace(/[^\w.\-]/g, "_")}`;
    const storagePath = path.join(dir, safeName);
    const content = Buffer.from(att.content as ArrayBuffer);
    await fs.writeFile(storagePath, content);
    await db.insert(attachments).values({
      id: randomUUID(),
      messageId: id,
      filename: att.filename ?? "attachment",
      contentType: att.mimeType ?? "application/octet-stream",
      size: content.byteLength,
      storagePath,
    });
  }

  return NextResponse.json({ ok: true, id });
}
