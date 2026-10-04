/**
 * Docker 容器启动入口：先执行 drizzle/*.sql 建表（幂等），再起 Next.js。
 * 由 Dockerfile CMD 调用。
 */
import Database from "better-sqlite3";
import { readdirSync, readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, "..", "drizzle");
const dataDir = process.env.DATA_DIR ?? "/data";
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, "mail.db"));
db.pragma("journal_mode = WAL");
db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);

const applied = new Set(
  db.prepare("SELECT name FROM _migrations").all().map((r) => r.name)
);
const files = readdirSync(drizzleDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const f of files) {
  if (applied.has(f)) continue;
  db.exec(readFileSync(join(drizzleDir, f), "utf8"));
  db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
    f,
    new Date().toISOString()
  );
  console.log(`[migrate] applied ${f}`);
}
db.close();
console.log("[migrate] done");
