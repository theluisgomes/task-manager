import nodemailer from "nodemailer";
import { ENV } from "./_core/env";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  if (!ENV.emailFrom) {
    console.warn("[Email] EMAIL_FROM not configured — skipping send to", opts.to);
    return false;
  }

  if (ENV.resendApiKey) {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ENV.emailFrom,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!resp.ok) {
      const msg = await resp.text().catch(() => resp.statusText);
      console.error("[Email] Resend failed:", msg);
      return false;
    }
    return true;
  }

  if (ENV.smtpHost) {
    const transporter = nodemailer.createTransport({
      host: ENV.smtpHost,
      port: ENV.smtpPort,
      secure: ENV.smtpSecure,
      auth: ENV.smtpUser
        ? { user: ENV.smtpUser, pass: ENV.smtpPass ?? "" }
        : undefined,
    });
    await transporter.sendMail({
      from: ENV.emailFrom,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    return true;
  }

  console.warn("[Email] No email provider configured — skipping send to", opts.to);
  return false;
}

export function inviteEmailHtml(params: {
  inviterName: string;
  projectName: string;
  inviteUrl: string;
}): string {
  return `
    <p>${params.inviterName} invited you to join <strong>${params.projectName}</strong> on Task Manager Pro.</p>
    <p><a href="${params.inviteUrl}">Accept invitation</a></p>
    <p>This link expires in 7 days.</p>
  `;
}

export function assignmentEmailHtml(params: {
  taskTitle: string;
  projectName: string;
  boardUrl: string;
}): string {
  return `
    <p>You were assigned to <strong>${params.taskTitle}</strong> in project <strong>${params.projectName}</strong>.</p>
    <p><a href="${params.boardUrl}">View task</a></p>
  `;
}

export function mentionEmailHtml(params: {
  commenterName: string;
  taskTitle: string;
  boardUrl: string;
}): string {
  return `
    <p>${params.commenterName} mentioned you in a comment on <strong>${params.taskTitle}</strong>.</p>
    <p><a href="${params.boardUrl}">View comment</a></p>
  `;
}

export function inviteAcceptedEmailHtml(params: {
  memberName: string;
  projectName: string;
}): string {
  return `
    <p><strong>${params.memberName}</strong> accepted your invitation to join <strong>${params.projectName}</strong>.</p>
  `;
}
