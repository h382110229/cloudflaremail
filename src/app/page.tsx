"use client";

import { useEffect, useState } from "react";

interface MessageSummary {
  id: string;
  fromAddr: string;
  fromName: string | null;
  toAddrs: string;
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
  from: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  inReplyTo?: string;
}

interface Mailbox {
  id: string;
  address: string;
  localPart: string;
}

/* ---------- 工具 ---------- */

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  const md = d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}/${md}`;
}

function fmtFullDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "");
}

/* 头像：按发件人哈希取青绿/香槟金系 */
const AVATAR_BG = ["bg-teal/20 text-teal", "bg-gold/20 text-gold", "bg-teal/15 text-teal", "bg-gold/15 text-gold"];
function avatarCls(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length];
}
function initials(name: string): string {
  const s = name.trim();
  if (!s) return "?";
  return /[\u4e00-\u9fff]/.test(s[0]) ? s[0] : s[0].toUpperCase();
}
function Avatar({ seed, size = "md" }: { seed: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "h-11 w-11 text-base" : size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${avatarCls(seed)} ${sz}`}>
      {initials(seed)}
    </div>
  );
}

/* 品牌 Logo：H 字母徽标（香槟金线条 / 石墨黑底） */
function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  const sz = size === "sm" ? "h-8 w-8 text-sm rounded-[10px]" : "h-10 w-10 text-lg rounded-[14px]";
  return (
    <div className={`flex shrink-0 items-center justify-center bg-graphite font-bold text-gold ring-1 ring-gold/30 ${sz}`}>
      H
    </div>
  );
}

/* ---------- 图标 ---------- */
const Icon = {
  inbox: (c: string) => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path d="M2 5.5A1.5 1.5 0 013.5 4h4l1.2 1.6h7.8A1.5 1.5 0 0118 7v7.5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 012 14.5v-9zm1.5 1v8h13V7h-7.2a1 1 0 01-.8-.4L7.3 5.5H3.5v1z" /></svg>
  ),
  sent: (c: string) => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path d="M3.7 2.3a1 1 0 01.9-.3l11 3.5a1 1 0 01.1 1.8L8.6 11.4l-2.9 5.3a1 1 0 01-1.8-.4l-.5-4.1-2-2.1a1 1 0 01.3-1.6l2-1.2.5-4a1 1 0 01.5-.9zM8 8.6l6.2-2-4.5 4.7L8 8.6z" /></svg>
  ),
  compose: (c: string) => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path d="M13.8 3.2a2 2 0 012.8 0l.2.2a2 2 0 010 2.8l-8.4 8.4a2 2 0 01-.9.5l-3.2.8a1 1 0 01-1.2-1.2l.8-3.2a2 2 0 01.5-.9l8.4-8.4z" /></svg>
  ),
  back: (c: string) => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.7 5.3a1 1 0 010 1.4L8.4 11l4.3 4.3a1 1 0 01-1.4 1.4l-5-5a1 1 0 010-1.4l5-5a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
  ),
  reply: (c: string) => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7 4a1 1 0 011 1v2.5h3.5A4.5 4.5 0 0116 12v4a1 1 0 01-2 0v-4a2.5 2.5 0 00-2.5-2.5H8V12a1 1 0 01-1.7.7l-4-4a1 1 0 010-1.4l4-4A1 1 0 017 4z" clipRule="evenodd" /></svg>
  ),
  forward: (c: string) => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M13 4a1 1 0 00-1.7-.7l-4 4a1 1 0 000 1.4l4 4A1 1 0 0013 12V9.5h.5A4.5 4.5 0 0118 14v2a1 1 0 002 0v-2a6.5 6.5 0 00-6.5-6.5H13V4z" clipRule="evenodd" /></svg>
  ),
  attach: (c: string) => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a3 3 0 016 0v7a5 5 0 01-10 0V6a1 1 0 012 0v5a3 3 0 006 0V4a1 1 0 10-2 0v7a1 1 0 11-2 0V6a1 1 0 00-2 0v5a3 3 0 006 0V4z" clipRule="evenodd" transform="rotate(45 10 10)" /></svg>
  ),
  file: (c: string) => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8.4a2 2 0 00-.6-1.4L12.6 2.2A2 2 0 0011.2 1.6H4zm9 2.6L16.4 8H13V4.6z" clipRule="evenodd" /></svg>
  ),
  x: (c: string) => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6.3 5.3a1 1 0 00-1.4 1.4L8.6 10l-3.7 3.3a1 1 0 101.4 1.4L10 11l3.7 3.7a1 1 0 001.4-1.4L11.4 10l3.7-3.3a1 1 0 00-1.4-1.4L10 9 6.3 5.3z" clipRule="evenodd" /></svg>
  ),
  chevron: (c: string) => (
    <svg className={c} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z" clipRule="evenodd" /></svg>
  ),
};

/* ---------- 主组件 ---------- */

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
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mailboxId, setMailboxId] = useState<string>("");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE = 50;

  const loadMessages = (f: "received" | "sent", mid?: string, q?: string, off?: number, append?: boolean) => {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError("");
    }
    const params = new URLSearchParams({ status: f, limit: String(PAGE), offset: String(off ?? 0) });
    if (mid) params.set("mailboxId", mid);
    if (q) params.set("q", q);
    fetch(`/api/messages?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        const list = d.messages ?? [];
        setMessages((prev) => (append ? [...prev, ...list] : list));
        setHasMore(list.length >= PAGE);
      })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  };

  const reload = (f = folder, mid = mailboxId, q = query) => {
    setSelected(null);
    loadMessages(f, mid, q, 0, false);
  };

  const loadMore = () => {
    loadMessages(folder, mailboxId, query, messages.length, true);
  };

  // 搜索防抖
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 400);
    return () => clearTimeout(t);
  }, [queryInput]);

  useEffect(() => {
    fetch("/api/mailboxes")
      .then((r) => r.json())
      .then((d) => {
        const list: Mailbox[] = d.mailboxes ?? [];
        setMailboxes(list);
        const saved = localStorage.getItem("mailboxId") ?? "";
        const initial = list.some((m) => m.id === saved) ? saved : (list[0]?.id ?? "");
        setMailboxId(initial);
        if (initial) localStorage.setItem("mailboxId", initial);
        loadMessages(folder, initial, "", 0, false);
      })
      .catch(() => loadMessages(folder, "", "", 0, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mailboxId) reload(folder, mailboxId, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, mailboxId, query]);

  const switchMailbox = (id: string) => {
    setMailboxId(id);
    localStorage.setItem("mailboxId", id);
    setQueryInput("");
    setQuery("");
  };

  const currentMailbox = mailboxes.find((m) => m.id === mailboxId);
  const defaultFrom = currentMailbox?.address ?? mailboxes[0]?.address ?? "";

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
    const quoted = origText.split("\n").map((l) => `> ${l}`).join("\n");
    setCompose({
      mode: "reply",
      from: defaultFrom,
      to: m.fromAddr,
      cc: "",
      subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
      body: `\n\n--- ${m.fromName || m.fromAddr} 于 ${fmtFullDate(m.date)} 写道 ---\n${quoted}`,
      inReplyTo: m.id,
    });
    setFiles([]);
    setSendError("");
  };

  const startForward = (m: MessageDetail) => {
    const origText = m.bodyText ?? (m.bodyHtml ? stripHtml(m.bodyHtml) : "");
    setCompose({
      mode: "forward",
      from: defaultFrom,
      to: "",
      cc: "",
      subject: m.subject.startsWith("Fwd:") ? m.subject : `Fwd: ${m.subject}`,
      body: `\n\n---------- 转发邮件 ----------\n发件人：${m.fromName || ""} <${m.fromAddr}>\n日期：${fmtFullDate(m.date)}\n主题：${m.subject}\n\n${origText}`,
    });
    setFiles([]);
    setSendError("");
  };

  const startNew = () => {
    setCompose({ mode: "new", from: defaultFrom, to: "", cc: "", subject: "", body: "" });
    setFiles([]);
    setSendError("");
  };

  const removeFile = (i: number) => setFiles((fs) => fs.filter((_, j) => j !== i));

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
          from: compose.from,
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
      if (folder === "sent") reload("sent", mailboxId, query);
    } catch (e) {
      setSendError(String((e as Error).message ?? e));
    } finally {
      setSending(false);
    }
  };

  /* ---------- 写信 ---------- */
  if (compose) {
    const title = compose.mode === "new" ? "写邮件" : compose.mode === "reply" ? "回复邮件" : "转发邮件";
    return (
      <div className="flex min-h-screen flex-col bg-obsidian">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-obsidian/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
            <button
              onClick={() => setCompose(null)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate transition hover:bg-white/5 hover:text-ivory"
            >
              {Icon.back("h-4 w-4")}取消
            </button>
            <h1 className="ml-1 text-[15px] font-semibold text-ivory">{title}</h1>
            <div className="flex-1" />
            <button
              onClick={doSend}
              disabled={sending}
              className="flex items-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-obsidian shadow-sm transition hover:bg-gold-dim disabled:opacity-50"
            >
              {sending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-obsidian/30 border-t-obsidian" />
              ) : (
                Icon.sent("h-4 w-4")
              )}
              {sending ? "发送中…" : "发送"}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
          {sendError && (
            <div className="mb-4 rounded-xl border border-err/40 bg-err/10 px-4 py-3 text-sm text-err">{sendError}</div>
          )}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-graphite shadow-sm">
            {(
              [
                { label: "发件人", node: (
                  <select
                    value={compose.from}
                    onChange={(e) => setCompose({ ...compose, from: e.target.value })}
                    className="w-full appearance-none bg-transparent text-sm text-ivory outline-none [&>option]:bg-graphite"
                  >
                    {mailboxes.map((m) => (
                      <option key={m.id} value={m.address}>{m.address}</option>
                    ))}
                  </select>
                )},
                { label: "收件人", node: (
                  <input
                    value={compose.to}
                    onChange={(e) => setCompose({ ...compose, to: e.target.value })}
                    placeholder="name@example.com，可用逗号分隔多个"
                    className="w-full bg-transparent text-sm text-ivory outline-none placeholder:text-slate/60"
                  />
                )},
                { label: "抄送", node: (
                  <input
                    value={compose.cc}
                    onChange={(e) => setCompose({ ...compose, cc: e.target.value })}
                    placeholder="可选"
                    className="w-full bg-transparent text-sm text-ivory outline-none placeholder:text-slate/60"
                  />
                )},
                { label: "主题", node: (
                  <input
                    value={compose.subject}
                    onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
                    placeholder="邮件主题"
                    className="w-full bg-transparent text-sm font-medium text-ivory outline-none placeholder:font-normal placeholder:text-slate/60"
                  />
                )},
              ] as const
            ).map((row) => (
              <div key={row.label} className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-0">
                <span className="w-12 shrink-0 text-[13px] text-slate">{row.label}</span>
                <div className="min-w-0 flex-1">{row.node}</div>
              </div>
            ))}
            <div className="px-4 py-3">
              <textarea
                value={compose.body}
                onChange={(e) => setCompose({ ...compose, body: e.target.value })}
                rows={14}
                placeholder="写点什么…"
                className="w-full resize-y bg-transparent text-sm leading-relaxed text-ivory outline-none placeholder:text-slate/60"
              />
            </div>
            {files.length > 0 && (
              <div className="border-t border-white/5 px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-charcoal py-1.5 pl-3 pr-2 text-sm">
                      {Icon.file("h-4 w-4 text-slate")}
                      <span className="max-w-[180px] truncate text-ivory/80">{f.name}</span>
                      <span className="text-xs text-slate">{fmtSize(f.size)}</span>
                      <button onClick={() => removeFile(i)} className="rounded p-0.5 text-slate transition hover:bg-white/10 hover:text-ivory">
                        {Icon.x("h-3.5 w-3.5")}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center border-t border-white/5 bg-black/20 px-4 py-2.5">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-slate transition hover:bg-white/5 hover:text-ivory">
                {Icon.attach("h-4 w-4")}添加附件
                <input type="file" multiple className="hidden" onChange={(e) => setFiles((p) => [...p, ...Array.from(e.target.files ?? [])])} />
              </label>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ---------- 阅读 ---------- */
  if (selected) {
    const m = selected;
    return (
      <div className="flex min-h-screen flex-col bg-obsidian">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-obsidian/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
            <button
              onClick={() => setSelected(null)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate transition hover:bg-white/5 hover:text-ivory"
            >
              {Icon.back("h-4 w-4")}返回
            </button>
            <div className="flex-1" />
            <button
              onClick={() => startReply(m)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gold transition hover:bg-gold/10"
            >
              {Icon.reply("h-4 w-4")}回复
            </button>
            <button
              onClick={() => startForward(m)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate transition hover:bg-white/5 hover:text-ivory"
            >
              {Icon.forward("h-4 w-4")}转发
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
          <article className="overflow-hidden rounded-2xl border border-white/10 bg-graphite shadow-sm">
            <div className="border-b border-white/5 px-5 pb-5 pt-5 sm:px-6">
              <h1 className="text-lg font-semibold leading-snug text-ivory">{m.subject || "(无主题)"}</h1>
              <div className="mt-4 flex items-start gap-3">
                <Avatar seed={m.fromName || m.fromAddr} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-ivory">{m.fromName || m.fromAddr}</span>
                    <span className="truncate text-[13px] text-slate">&lt;{m.fromAddr}&gt;</span>
                  </div>
                  <div className="mt-0.5 truncate text-[13px] text-slate">收件人：{m.toAddrs}</div>
                  {m.ccAddrs && <div className="truncate text-[13px] text-slate">抄送：{m.ccAddrs}</div>}
                </div>
                <span className="shrink-0 pt-0.5 text-xs text-slate">{fmtFullDate(m.date)}</span>
              </div>
            </div>

            {m.attachments.length > 0 && (
              <div className="border-b border-white/5 bg-black/20 px-5 py-3 sm:px-6">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-widest text-slate">
                  附件 · {m.attachments.length}
                </div>
                <div className="flex flex-col gap-1.5">
                  {m.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={`/api/attachments/${a.id}`}
                      className="group flex items-center gap-3 rounded-xl border border-white/10 bg-charcoal px-3.5 py-2.5 transition hover:border-teal/40"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal/15 text-teal">
                        {Icon.file("h-4 w-4")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ivory/80 group-hover:text-teal">{a.filename}</span>
                      <span className="shrink-0 text-xs text-slate">{fmtSize(a.size)}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="px-5 py-5 sm:px-6">
              {m.bodyHtml ? (
                <div className="mail-body text-[15px] leading-relaxed" dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-ivory/90">{m.bodyText}</pre>
              )}
            </div>
          </article>
        </main>
      </div>
    );
  }

  /* ---------- 列表 ---------- */
  const folderMeta = {
    received: { label: "收件箱", icon: Icon.inbox },
    sent: { label: "已发送", icon: Icon.sent },
  } as const;

  return (
    <div className="flex min-h-screen bg-obsidian">
      {/* 侧边栏（桌面） */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-graphite md:flex">
        <div className="px-5 pb-4 pt-6">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <div className="text-[15px] font-bold leading-tight tracking-wide text-ivory">
                H A W K
                <span className="ml-1 text-teal">·</span>
              </div>
              <div className="text-[11px] leading-tight text-slate">霍克 · 自建邮箱</div>
            </div>
          </div>
          <button
            onClick={startNew}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-obsidian shadow-sm transition hover:bg-gold-dim active:scale-[0.99]"
          >
            {Icon.compose("h-4 w-4")}写邮件
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {(Object.keys(folderMeta) as Array<"received" | "sent">).map((f) => {
            const active = folder === f && !selected;
            return (
              <button
                key={f}
                onClick={() => { setFolder(f); setSelected(null); setQueryInput(""); setQuery(""); }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active ? "bg-gold/15 text-gold" : "text-slate hover:bg-white/5 hover:text-ivory"
                }`}
              >
                {folderMeta[f].icon(`h-5 w-5 ${active ? "text-gold" : "text-slate"}`)}
                {folderMeta[f].label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold" />}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-widest text-slate">当前邮箱</div>
          <div className="relative">
            <select
              value={mailboxId}
              onChange={(e) => switchMailbox(e.target.value)}
              className="w-full appearance-none truncate rounded-[10px] border border-white/10 bg-charcoal py-2.5 pl-3 pr-9 text-[13px] font-medium text-ivory outline-none transition hover:border-white/20 focus:border-gold/50 [&>option]:bg-graphite"
              title="切换邮箱"
            >
              {mailboxes.map((m) => (
                <option key={m.id} value={m.id}>{m.address}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate">
              {Icon.chevron("h-4 w-4")}
            </span>
          </div>
        </div>
      </aside>

      {/* 主区域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 移动端顶栏 */}
        <header className="sticky top-0 z-10 border-b border-white/10 bg-obsidian/90 backdrop-blur md:hidden">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <BrandMark size="sm" />
            <select
              value={mailboxId}
              onChange={(e) => switchMailbox(e.target.value)}
              className="max-w-[140px] truncate rounded-lg bg-charcoal px-2 py-1.5 text-[13px] font-medium text-ivory outline-none [&>option]:bg-graphite"
              title="切换邮箱"
            >
              {mailboxes.map((m) => (
                <option key={m.id} value={m.id}>{m.address}</option>
              ))}
            </select>
            <div className="flex gap-1">
              {(Object.keys(folderMeta) as Array<"received" | "sent">).map((f) => (
                <button
                  key={f}
                  onClick={() => { setFolder(f); setQueryInput(""); setQuery(""); }}
                  className={`rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition ${
                    folder === f ? "bg-gold text-obsidian font-bold" : "text-slate hover:text-ivory"
                  }`}
                >
                  {folderMeta[f].label}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <div className="relative w-32 shrink-0 md:hidden">
              <input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="搜索…"
                className="w-full rounded-lg bg-charcoal py-1.5 pl-8 pr-2 text-[13px] text-ivory outline-none placeholder:text-slate/60"
              />
              <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.9 3.5l4.3 4.3a1 1 0 01-1.4 1.4l-4.3-4.3A6 6 0 012 8z" clipRule="evenodd" /></svg>
            </div>
            <button
              onClick={startNew}
              className="flex items-center gap-1 rounded-lg bg-gold px-3 py-1.5 text-[13px] font-bold text-obsidian"
            >
              {Icon.compose("h-3.5 w-3.5")}写邮件
            </button>
          </div>
        </header>

        {/* 桌面端标题 + 搜索 */}
        <div className="hidden border-b border-white/10 px-8 py-5 md:block">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-ivory">{folderMeta[folder].label}</h1>
              <p className="mt-0.5 truncate text-[13px] text-slate">
                {currentMailbox?.address}
                <span className="mx-2 text-teal">·</span>
                <span className="text-gold">SIMPLE TOOLS. A BRIGHTER TOMORROW</span>
              </p>
            </div>
            <div className="relative w-64 shrink-0">
              <input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="搜索邮件…"
                className="w-full rounded-[10px] border border-white/10 bg-charcoal py-2 pl-9 pr-8 text-sm text-ivory outline-none transition placeholder:text-slate/60 focus:border-gold/50"
              />
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.9 3.5l4.3 4.3a1 1 0 01-1.4 1.4l-4.3-4.3A6 6 0 012 8z" clipRule="evenodd" /></svg>
              {queryInput && (
                <button
                  onClick={() => { setQueryInput(""); setQuery(""); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate hover:text-ivory"
                >
                  {Icon.x("h-3.5 w-3.5")}
                </button>
              )}
            </div>
          </div>
        </div>

        <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-4 sm:px-6 md:px-8">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-16 text-slate">
              <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-white/10 border-t-gold" />
              <p className="text-sm">加载中…</p>
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-err/40 bg-err/10 px-5 py-4 text-sm text-err">{error}</div>
          )}
          {!loading && !error && messages.length === 0 && !query && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-graphite/50 px-6 py-16 text-center">
              <BrandMark />
              <p className="text-sm font-medium text-ivory">
                {folder === "received" ? "收件箱是空的" : "还没有已发送邮件"}
              </p>
              <p className="max-w-xs text-[13px] text-slate">
                {folder === "received"
                  ? `从 Gmail 发一封到 ${currentMailbox?.address ?? "你的域名邮箱"} 试试`
                  : "点「写邮件」发出第一封吧"}
              </p>
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {messages.map((m) => {
              const seed = folder === "sent" ? m.subject : (m.fromName || m.fromAddr);
              const isSent = folder === "sent";
              return (
                <li key={m.id}>
                  <button
                    onClick={() => openMessage(m.id)}
                    className="group flex w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-graphite px-4 py-3.5 text-left transition hover:-translate-y-[1px] hover:border-gold/30 hover:shadow-lg hover:shadow-black/30"
                  >
                    <Avatar seed={seed} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-ivory">
                          {isSent ? (m.subject || "(无主题)") : (m.fromName || m.fromAddr)}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-slate">{fmtDate(m.date)}</span>
                      </div>
                      {isSent ? (
                        <div className="mt-0.5 truncate text-[13px] text-teal/90">
                          收件人：{m.toAddrs || "—"}
                        </div>
                      ) : (
                        <div className="mt-0.5 truncate text-sm text-ivory/70">{m.subject || "(无主题)"}</div>
                      )}
                      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-slate">
                        {m.hasAttachments ? <span className="shrink-0">{Icon.attach("h-3.5 w-3.5")}</span> : null}
                        <span className="truncate">{m.snippet}</span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {!loading && !error && hasMore && (
            <div className="mt-4 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-white/10 bg-graphite px-6 py-2 text-sm font-medium text-slate transition hover:border-gold/30 hover:text-gold disabled:opacity-50"
              >
                {loadingMore ? "加载中…" : "加载更多"}
              </button>
            </div>
          )}
          {!loading && !error && query && messages.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/15 bg-graphite/50 px-6 py-12 text-center">
              <p className="text-sm font-medium text-ivory">没有找到匹配「{query}」的邮件</p>
              <button
                onClick={() => { setQueryInput(""); setQuery(""); }}
                className="text-[13px] text-gold hover:underline"
              >
                清除搜索
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
