/**
 * SQLite 连接（better-sqlite3，同步驱动）。
 * DATA_DIR 环境变量指定数据目录，Docker 里为 /data（volume 持久化）。
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "fs";
import * as schema from "./schema";

const dataDir = process.env.DATA_DIR ?? "./data";
mkdirSync(dataDir, { recursive: true });
mkdirSync(`${dataDir}/raw`, { recursive: true });
mkdirSync(`${dataDir}/attachments`, { recursive: true });

// timeout: 忙等待 5s 再报 SQLITE_BUSY（默认 0 = 立即失败）。
const sqlite = new Database(`${dataDir}/mail.db`, { timeout: 5000 });
// WAL 是数据库级持久属性：只要有一个连接转换成功，所有连接即为 WAL 模式。
// next build 的 "Collecting page data" 会多 worker 并发 import 路由模块，
// 此时 journal_mode pragma 偶发 SQLITE_BUSY 竞态，可安全忽略。
try {
  sqlite.pragma("journal_mode = WAL");
} catch {
  /* 并发 build 期的锁竞态：已有其他连接完成 WAL 转换，忽略 */
}

export const db = drizzle(sqlite, { schema });
