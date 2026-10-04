import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * 数据表设计说明（必读）：
 *
 * - 主键全部用文本 UUID（crypto.randomUUID()），SQLite 下简单可靠。
 * - messages.status 驱动文件夹视图：received=收件箱 / sent=已发送 /
 *   draft=草稿 / spam=垃圾 / trash=垃圾箱 / archived=归档。
 *   用户自建文件夹 Phase 3 再加 folderId。
 * - toAddrs / ccAddrs 存原文拼接（展示用）；精确查询走 messageId。
 * - 附件只存元数据，文件本体在 DATA_DIR/attachments/<messageId>/。
 * - settings 只放非密钥配置；密钥一律走环境变量，不进库。
 */

// 用户（自用通常只有一条记录，表结构保留扩展性）
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  totpSecret: text("totp_secret"), // Phase 4
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// 域名
export const domains = sqliteTable("domains", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// 邮箱账号
export const mailboxes = sqliteTable("mailboxes", {
  id: text("id").primaryKey(),
  domainId: text("domain_id")
    .notNull()
    .references(() => domains.id),
  localPart: text("local_part").notNull(),
  address: text("address").notNull().unique(), // local@domain
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// 别名：source -> destination（destination 必须是本站 mailbox 地址）
export const aliases = sqliteTable("aliases", {
  id: text("id").primaryKey(),
  domainId: text("domain_id")
    .notNull()
    .references(() => domains.id),
  source: text("source").notNull().unique(),
  destination: text("destination").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// 邮件
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  mailboxId: text("mailbox_id")
    .notNull()
    .references(() => mailboxes.id),
  messageId: text("message_id"), // Message-ID 头，用于去重（可空：部分垃圾邮件没有）
  threadId: text("thread_id"), // Phase 3 会话归并；此前等于自身 id
  fromAddr: text("from_addr").notNull(),
  fromName: text("from_name"),
  toAddrs: text("to_addrs").notNull(),
  ccAddrs: text("cc_addrs"),
  subject: text("subject").notNull().default(""),
  date: integer("date", { mode: "timestamp" }), // Date 头
  snippet: text("snippet").notNull().default(""), // 正文前 200 字
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  hasAttachments: integer("has_attachments").notNull().default(0),
  status: text("status").notNull().default("received"),
  starred: integer("starred").notNull().default(0),
  rawPath: text("raw_path"), // 原始 MIME 存档路径（排障用）
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// 附件
export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => messages.id),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull(),
  storagePath: text("storage_path").notNull(),
});

// 路由规则：按 priority 从大到小执行，首个命中生效
export const routingRules = sqliteTable("routing_rules", {
  id: text("id").primaryKey(),
  domainId: text("domain_id")
    .notNull()
    .references(() => domains.id),
  priority: integer("priority").notNull().default(0),
  action: text("action").notNull(), // store | forward | reject
  pattern: text("pattern").notNull(), // 精确地址 / *@domain / *
  forwardTo: text("forward_to"), // action=forward 时的目标地址
});

// 登录会话
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// 非密钥类配置
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
