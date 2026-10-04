import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { attachments, messages } from "@/db/schema";

export const runtime = "nodejs";

// GET /api/messages/[id] — 邮件全文 + 附件列表
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const msg = await db.query.messages.findFirst({ where: eq(messages.id, id) });
  if (!msg) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const atts = await db.query.attachments.findMany({
    where: eq(attachments.messageId, id),
    columns: { id: true, filename: true, size: true, contentType: true },
  });
  return NextResponse.json({ ...msg, attachments: atts });
}
