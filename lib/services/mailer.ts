import nodemailer from "nodemailer";

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

/** Envia e-mail se o SMTP estiver configurado; caso contrário devolve false (nada é simulado). */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!mailConfigured()) return false;
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  try {
    await t.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
    return true;
  } catch (e) {
    console.error("[mail] falha no envio:", e instanceof Error ? e.message : "erro");
    return false;
  }
}
