import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { messages } from "@/db/schema";

export const runtime = "nodejs";

// GET /api/messages?mailboxId=&limit=50&offset=0
// 注意：登录鉴权在 Phase 4 做；此前建议用 Caddy basic_auth 把整站保护起来。
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mailboxId = searchParams.get("mailboxId");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);
  const offset = Number(searchParams.get("offset") ?? 0) || 0;

  const rows = await db.query.messages.findMany({
    where: mailboxId ? eq(messages.mailboxId, mailboxId) : undefined,
    orderBy: [desc(messages.date)],
    limit,
    offset,
    columns: {
      id: true,
      fromAddr: true,
      fromName: true,
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
