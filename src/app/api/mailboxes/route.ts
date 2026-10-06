import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { mailboxes } from "@/db/schema";

export const runtime = "nodejs";

// GET /api/mailboxes — 列出所有邮箱
export async function GET() {
  const rows = await db.query.mailboxes.findMany({
    orderBy: [asc(mailboxes.address)],
    columns: { id: true, address: true, localPart: true },
  });
  return NextResponse.json({ mailboxes: rows });
}
