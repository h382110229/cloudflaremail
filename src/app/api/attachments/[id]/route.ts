import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { attachments } from "@/db/schema";

export const runtime = "nodejs";

// GET /api/attachments/[id] — 附件下载
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const att = await db.query.attachments.findFirst({ where: eq(attachments.id, id) });
  if (!att) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const data = await fs.readFile(att.storagePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "content-type": att.contentType,
        "content-length": String(att.size),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
      },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 410 });
  }
}
