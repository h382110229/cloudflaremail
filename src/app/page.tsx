"use client";

import { useEffect, useState } from "react";

interface MessageSummary {
  id: string;
  fromAddr: string;
  fromName: string | null;
  subject: string;
  snippet: string;
  date: string | null;
  hasAttachments: number;
  starred: number;
}

interface Attachment {
  id: string;
  filename: string;
  size: number;
  contentType: string;
}

interface MessageDetail extends MessageSummary {
  toAddrs: string;
  ccAddrs: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  attachments: Attachment[];
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function Inbox() {
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [selected, setSelected] = useState<MessageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/messages")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setMessages(d.messages ?? []))
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  const openMessage = async (id: string) => {
    setSelected(null);
    try {
      const r = await fetch(`/api/messages/${id}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSelected(await r.json());
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  // 阅读视图
  if (selected) {
    const m = selected;
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white/95 px-4 py-3 backdrop-blur">
          <button
            onClick={() => setSelected(null)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            ← 返回
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{m.subject || "(无主题)"}</h1>
          </div>
        </header>
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="mb-1 text-sm">
            <span className="font-medium">{m.fromName || m.fromAddr}</span>
            <span className="text-gray-500"> &lt;{m.fromAddr}&gt;</span>
          </div>
          <div className="mb-1 text-xs text-gray-500">收件人：{m.toAddrs}</div>
          {m.ccAddrs && <div className="mb-1 text-xs text-gray-500">抄送：{m.ccAddrs}</div>}
          <div className="mb-4 text-xs text-gray-400">{m.date ? new Date(m.date).toLocaleString("zh-CN") : ""}</div>

          {m.attachments.length > 0 && (
            <div className="mb-4 rounded-lg border bg-gray-50 p-3">
              <div className="mb-2 text-xs font-medium text-gray-500">附件（{m.attachments.length}）</div>
              <div className="flex flex-col gap-1.5">
                {m.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={`/api/attachments/${a.id}`}
                    className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm ring-1 ring-gray-200 hover:ring-gray-300"
                  >
                    <span className="truncate">{a.filename}</span>
                    <span className="ml-3 shrink-0 text-xs text-gray-400">{fmtSize(a.size)}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {m.bodyHtml ? (
            <div className="mail-body text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
          ) : (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">{m.bodyText}</pre>
          )}
        </div>
      </div>
    );
  }

  // 列表视图
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold">📥 收件箱</h1>
      </header>
      <main className="mx-auto max-w-3xl px-2 py-2 sm:px-4">
        {loading && <p className="p-6 text-center text-sm text-gray-400">加载中…</p>}
        {error && <p className="p-6 text-center text-sm text-red-500">{error}</p>}
        {!loading && !error && messages.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-400">还没有邮件。从 Gmail 发一封到你的域名邮箱试试。</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {messages.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => openMessage(m.id)}
                className="flex w-full items-start gap-3 rounded-lg bg-white px-3 py-2.5 text-left ring-1 ring-gray-200 hover:ring-gray-300"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{m.fromName || m.fromAddr}</span>
                    <span className="shrink-0 text-xs text-gray-400">{fmtDate(m.date)}</span>
                  </div>
                  <div className="truncate text-sm text-gray-800">{m.subject || "(无主题)"}</div>
                  <div className="truncate text-xs text-gray-400">
                    {m.hasAttachments ? "📎 " : ""}
                    {m.snippet}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
