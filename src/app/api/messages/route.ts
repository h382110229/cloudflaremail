import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, like, or } from "drizzle-orm";
import { db } from "@/db/client";
import { messages } from "@/db/schema";

export const runtime = "nodejs";

// GET /api/messages?mailboxId=&status=&q=&limit=50&offset=0
// q：在主题 / 发件人 / 发件地址 / 收件人 / 摘要中模糊搜索
// 注意：登录鉴权在 Phase 4 做；此前建议用 Caddy basic_auth 把整站保护起来。
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mailboxId = searchParams.get("mailboxId");
  const status = searchParams.get("status");
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);
  const offset = Number(searchParams.get("offset") ?? 0) || 0;

  const conds = [];
  if (mailboxId) conds.push(eq(messages.mailboxId, mailboxId));
  if (status) conds.push(eq(messages.status, status));
  if (q) {
    const pat = `%${q.replace(/[%_]/g, "")}%`;
    conds.push(
      or(
        like(messages.subject, pat),
        like(messages.fromAddr, pat),
        like(messages.fromName, pat),
        like(messages.toAddrs, pat),
        like(messages.snippet, pat)
      )
    );
  }
  const rows = await db.query.messages.findMany({
    where: conds.length ? and(...conds) : undefined,
    orderBy: [desc(messages.date)],
    limit,
    offset,
    columns: {
      id: true,
      fromAddr: true,
      fromName: true,
      toAddrs: true,
      subject: true,
      snippet: true,
      date: true,
      hasAttachments: true,
      starred: true,
      status: true,
    },
  });
  return NextResponse.json({ messages: rows });
}
