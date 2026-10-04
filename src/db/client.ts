import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "fs";
import * as schema from "./schema";

const dataDir = process.env.DATA_DIR ?? "./data";
mkdirSync(dataDir, { recursive: true });

const sqlite = new Database(`${dataDir}/mail.db`);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
