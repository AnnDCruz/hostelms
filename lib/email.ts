import nodemailer from "nodemailer";

// Returns true when a real email was sent, false when SMTP is not configured
// (the message is printed to the server console so local development still works).
export async function sendMail(input: { to: string; subject: string; text: string }) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log(`\n[email not configured] To: ${input.to}\nSubject: ${input.subject}\n${input.text}\n`);
    return false;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "HostelMS <no-reply@localhost>",
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
  return true;
}
