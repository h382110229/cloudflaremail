/**
 * Resend 发信封装。
 */
import { Resend, type CreateEmailOptions } from "resend";

export interface SendEmailInput {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: Buffer }[];
}

export async function sendEmail(input: SendEmailInput): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY 未配置");
  }
  if (!input.html && !input.text) {
    throw new Error("邮件内容不能为空（html / text 至少其一）");
  }

  const resend = new Resend(apiKey);
  const attachments = input.attachments?.map((a) => ({
    filename: a.filename,
    content: a.content,
  }));

  // Resend v6 的 send 参数是联合类型（html/text/react 与 template 互斥），
  // 必须显式收窄到某一分支：直接传可选字段 TS 无法推断。
  const options: CreateEmailOptions = input.html
    ? {
        from: input.from,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        html: input.html,
        text: input.text,
        replyTo: input.replyTo,
        headers: input.headers,
        attachments,
      }
    : {
        from: input.from,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        text: input.text ?? "",
        replyTo: input.replyTo,
        headers: input.headers,
        attachments,
      };

  const { data, error } = await resend.emails.send(options);
  if (error) {
    throw new Error(`Resend 发送失败: ${JSON.stringify(error)}`);
  }
  return data!.id;
}
