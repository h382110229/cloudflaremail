import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "cloudflaremail",
  description: "自用域名邮箱",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
