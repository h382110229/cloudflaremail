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
  messageId: string | null;
  attachments: Attachment[];
}

interface ComposeState {
  mode: "new" | "reply" | "forward";
  to: string;
  cc: string;
  subject: string;
  body: string;
  inReplyTo?: string;
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

function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "");
}

export default function Mail() {
  const [folder, setFolder] = useState<"received" | "sent">("received");
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [selected, setSelected] = useState<MessageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const loadMessages = (f: "received" | "sent") => {
    setLoading(true);
    setError("");
    fetch(`/api/messages?status=${f}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setMessages(d.messages ?? []))
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMessages(folder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

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

  const startReply = (m: MessageDetail) => {
    const origText = m.bodyText ?? (m.bodyHtml ? stripHtml(m.bodyHtml) : "");
    const quoted = origText
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    setCompose({
      mode: "reply",
      to: m.fromAddr,
      cc: "",
      subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
      body: `\n\n--- ${m.fromName || m.fromAddr} 于 ${m.date ? new Date(m.date).toLocaleString("zh-CN") : ""} 写道 ---\n${quoted}`,
      inReplyTo: m.id,
    });
    setFiles([]);
    setSendError("");
  };

  const startForward = (m: MessageDetail) => {
    const origText = m.bodyText ?? (m.bodyHtml ? stripHtml(m.bodyHtml) : "");
    setCompose({
      mode: "forward",
      to: "",
      cc: "",
      subject: m.subject.startsWith("Fwd:") ? m.subject : `Fwd: ${m.subject}`,
      body: `\n\n---------- 转发邮件 ----------\n发件人：${m.fromName || ""} <${m.fromAddr}>\n日期：${m.date ? new Date(m.date).toLocaleString("zh-CN") : ""}\n主题：${m.subject}\n\n${origText}`,
    });
    setFiles([]);
    setSendError("");
  };

  const doSend = async () => {
    if (!compose) return;
    const to = compose.to.split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean);
    if (to.length === 0) {
      setSendError("收件人不能为空");
      return;
    }
    setSending(true);
    setSendError("");
    try {
      const atts = await Promise.all(
        files.map(
          (f) =>
            new Promise<{ filename: string; contentType: string; content: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  filename: f.name,
                  contentType: f.type || "application/octet-stream",
                  content: (reader.result as string).split(",")[1],
                });
              reader.onerror = reject;
              reader.readAsDataURL(f);
            })
        )
      );
      const r = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          cc: compose.cc.split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean),
          subject: compose.subject,
          text: compose.body,
          inReplyTo: compose.inReplyTo,
          attachments: atts,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setCompose(null);
      setFiles([]);
      if (folder === "sent") loadMessages("sent");
    } catch (e) {
      setSendError(String((e as Error).message ?? e));
    } finally {
      setSending(false);
    }
  };

  // 写信视图
  if (compose) {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white/95 px-4 py-3 backdrop-blur">
          <button
            onClick={() => setCompose(null)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            ← 取消
          </button>
          <h1 className="text-base font-semibold">
            {compose.mode === "new" ? "写邮件" : compose.mode === "reply" ? "回复" : "转发"}
          </h1>
          <div className="flex-1" />
          <button
            onClick={doSend}
            disabled={sending}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? "发送中…" : "发送"}
          </button>
        </header>
        <div className="mx-auto max-w-3xl px-4 py-4">
          {sendError && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{sendError}</div>
          )}
          <div className="mb-2 flex items-center gap-2 border-b py-2">
            <span className="w-12 shrink-0 text-sm text-gray-500">收件人</span>
            <input
              value={compose.to}
              onChange={(e) => setCompose({ ...compose, to: e.target.value })}
              placeholder="a@b.com, c@d.com"
              className="flex-1 text-sm outline-none"
            />
          </div>
          <div className="mb-2 flex items-center gap-2 border-b py-2">
            <span className="w-12 shrink-0 text-sm text-gray-500">抄送</span>
            <input
              value={compose.cc}
              onChange={(e) => setCompose({ ...compose, cc: e.target.value })}
              placeholder="可选"
              className="flex-1 text-sm outline-none"
            />
          </div>
          <div className="mb-2 flex items-center gap-2 border-b py-2">
            <span className="w-12 shrink-0 text-sm text-gray-500">主题</span>
            <input
              value={compose.subject}
              onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
              placeholder="主题"
              className="flex-1 text-sm outline-none"
            />
          </div>
          <textarea
            value={compose.body}
            onChange={(e) => setCompose({ ...compose, body: e.target.value })}
            rows={14}
            placeholder="正文"
            className="mt-2 w-full rounded-lg border p-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          />
          <div className="mt-2">
            <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
              📎 添加附件
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </label>
            {files.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-sm">
                    <span className="truncate">{f.name}</span>
                    <span className="ml-2 text-xs text-gray-400">{fmtSize(f.size)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

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
          <button
            onClick={() => startReply(m)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
          >
            回复
          </button>
          <button
            onClick={() => startForward(m)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            转发
          </button>
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
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            <button
              onClick={() => setFolder("received")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${folder === "received" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              📥 收件箱
            </button>
            <button
              onClick={() => setFolder("sent")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${folder === "sent" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              📤 已发送
            </button>
          </div>
          <button
            onClick={() => { setCompose({ mode: "new", to: "", cc: "", subject: "", body: "" }); setFiles([]); setSendError(""); }}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            ✏️ 写邮件
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-2 py-2 sm:px-4">
        {loading && <p className="p-6 text-center text-sm text-gray-400">加载中…</p>}
        {error && <p className="p-6 text-center text-sm text-red-500">{error}</p>}
        {!loading && !error && messages.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-400">
            {folder === "received" ? "还没有邮件。从 Gmail 发一封到你的域名邮箱试试。" : "还没有已发送邮件。"}
          </p>
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
                    <span className="truncate text-sm font-medium">
                      {folder === "sent" ? m.subject : (m.fromName || m.fromAddr)}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">{fmtDate(m.date)}</span>
                  </div>
                  <div className="truncate text-sm text-gray-800">
                    {folder === "sent" ? m.snippet : (m.subject || "(无主题)")}
                  </div>
                  <div className="truncate text-xs text-gray-400">
                    {m.hasAttachments ? "📎 " : ""}
                    {folder === "sent" ? "" : m.snippet}
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
