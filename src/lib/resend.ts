import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendMailInput {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

/** 发信：走 Resend HTTP API。调用方负责登录态校验（Phase 2）。 */
export async function sendMail(input: SendMailInput): Promise<string> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY 未配置");
  }
  const { data, error } = await resend.emails.send({
    from: input.from,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
  if (error) {
    throw new Error(`Resend 发信失败: ${error.message}`);
  }
  return data!.id;
}
