/**
 * 初始化脚本：创建域名和邮箱账号。
 * 用法：SEED_DOMAIN=email.hawkren.online SEED_MAILBOX=hi npm run seed
 * 已存在则跳过，可重复执行。
 */
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { domains, mailboxes } from "../src/db/schema";

type DomainRow = typeof domains.$inferSelect;

const domain = (process.env.SEED_DOMAIN ?? "email.hawkren.online").toLowerCase();
const localPart = (process.env.SEED_MAILBOX ?? "hi").toLowerCase();
const address = `${localPart}@${domain}`;

async function main() {
  let d: DomainRow | undefined = await db.query.domains.findFirst({
    where: eq(domains.domain, domain),
  });
  if (!d) {
    const newDomain: DomainRow = { id: randomUUID(), domain, createdAt: new Date() };
    await db.insert(domains).values(newDomain);
    d = newDomain;
    console.log(`+ 域名: ${domain}`);
  } else {
    console.log(`= 域名已存在: ${domain}`);
  }

  const m = await db.query.mailboxes.findFirst({ where: eq(mailboxes.address, address) });
  if (!m) {
    await db.insert(mailboxes).values({
      id: randomUUID(),
      domainId: d.id,
      localPart,
      address,
      createdAt: new Date(),
    });
    console.log(`+ 邮箱: ${address}`);
  } else {
    console.log(`= 邮箱已存在: ${address}`);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
