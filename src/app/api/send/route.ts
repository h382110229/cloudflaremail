import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { attachments, mailboxes, messages } from "@/db/schema";
import { sendEmail } from "@/lib/resend";

export const runtime = "nodejs";

interface SendAttachment {
  filename: string;
  contentType?: string;
  content: string; // base64
}

interface SendBody {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string; // 被回复邮件的 DB id，用于线程归并
  attachments?: SendAttachment[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/send — 发信
export async function POST(req: NextRequest) {
  let body: SendBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const to = (body.to ?? []).map((s) => s.trim()).filter(Boolean);
  const cc = (body.cc ?? []).map((s) => s.trim()).filter(Boolean);
  const bcc = (body.bcc ?? []).map((s) => s.trim()).filter(Boolean);
  const subject = (body.subject ?? "").trim();
  if (to.length === 0) {
    return NextResponse.json({ error: "收件人不能为空" }, { status: 400 });
  }
  for (const a of [...to, ...cc, ...bcc]) {
    if (!EMAIL_RE.test(a)) {
      return NextResponse.json({ error: `邮箱格式错误: ${a}` }, { status: 400 });
    }
  }
  if (!body.text && !body.html) {
    return NextResponse.json({ error: "正文不能为空" }, { status: 400 });
  }

  // 发件邮箱：取第一个 mailbox
  const mailbox = await db.query.mailboxes.findFirst();
  if (!mailbox) {
    return NextResponse.json({ error: "no mailbox" }, { status: 500 });
  }
  const fromAddr = mailbox.address;

  // 回复线程头
  const headers: Record<string, string> = {};
  let threadId = randomUUID();
  if (body.inReplyTo) {
    const orig = await db.query.messages.findFirst({
      where: eq(messages.id, body.inReplyTo),
    });
    if (orig?.messageId) {
      headers["In-Reply-To"] = orig.messageId;
      headers["References"] = orig.messageId;
      threadId = orig.threadId ?? orig.id;
    }
  }

  // 附件：base64 → Buffer
  const atts = (body.attachments ?? []).map((a) => ({
    filename: a.filename || "attachment",
    content: Buffer.from(a.content, "base64"),
  }));
  for (const a of atts) {
    if (a.content.byteLength > 10 * 1024 * 1024) {
      return NextResponse.json({ error: `附件过大: ${a.filename}` }, { status: 400 });
    }
  }

  // 经 Resend 发出
  let resendId: string;
  try {
    resendId = await sendEmail({
      from: fromAddr,
      to,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      subject: subject || "(无主题)",
      text: body.text,
      html: body.html,
      headers,
      attachments: atts.map((a) => ({ filename: a.filename, content: a.content })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `发送失败: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  // 存库（status=sent）
  const id = randomUUID();
  const text = body.text ?? "";
  const dataDir = process.env.DATA_DIR ?? "./data";
  await db.insert(messages).values({
    id,
    mailboxId: mailbox.id,
    messageId: null,
    threadId,
    fromAddr,
    fromName: null,
    toAddrs: to.join(", "),
    ccAddrs: cc.length ? cc.join(", ") : null,
    subject: subject || "(无主题)",
    date: new Date(),
    snippet: text.replace(/\s+/g, " ").slice(0, 200),
    bodyText: text || null,
    bodyHtml: body.html ?? null,
    hasAttachments: atts.length > 0 ? 1 : 0,
    status: "sent",
    starred: 0,
    rawPath: null,
    createdAt: new Date(),
  });

  for (const [i, a] of atts.entries()) {
    const dir = `${dataDir}/attachments/${id}`;
    mkdirSync(dir, { recursive: true });
    const safeName = `${i}-${a.filename.replace(/[^\w.\-]/g, "_")}`;
    const storagePath = `${dir}/${safeName}`;
    writeFileSync(storagePath, a.content);
    await db.insert(attachments).values({
      id: randomUUID(),
      messageId: id,
      filename: a.filename,
      contentType: "application/octet-stream",
      size: a.content.byteLength,
      storagePath,
    });
  }

  return NextResponse.json({ ok: true, id, resendId });
}
