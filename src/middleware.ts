import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// inbound.* / inbound-* 只做收信 webhook 入口：
//  - /api/inbound 正常放行（靠 Bearer secret 鉴权）
//  - 其余一切路径（UI、/api/messages 等）一律 404，不对外暴露
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const isInbound = host.startsWith("inbound.") || host.startsWith("inbound-");
  if (isInbound && !req.nextUrl.pathname.startsWith("/api/inbound")) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
