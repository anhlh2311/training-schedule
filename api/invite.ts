import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.VITE_APP_URL || "https://your-app.vercel.app";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Training Schedule <onboarding@resend.dev>";
const LOGO_URL = `${APP_URL}/IHN.png`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body;
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Your trainer account is ready",
      text: [
        "Hi,",
        "",
        "Your trainer account on the Iaido Hanoi Training Schedule has been set up.",
        "",
        `Sign in with your Google account at: ${APP_URL}`,
        "",
        "-- Iaido Hanoi Training Schedule",
      ].join("\n"),
      html: `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px 0">
  <img src="${LOGO_URL}" alt="IHN" width="48" height="48" style="display:block;margin-bottom:16px;border-radius:50%" />
  <p style="margin:0 0 12px;color:#111827;font-size:15px;line-height:1.6">Hi,</p>
  <p style="margin:0 0 12px;color:#111827;font-size:15px;line-height:1.6">
    Your trainer account on the Iaido Hanoi Training Schedule has been set up.
    You can now sign in and manage your availability.
  </p>
  <p style="margin:0 0 4px;color:#111827;font-size:15px;line-height:1.6">
    Sign in here: <a href="${APP_URL}" style="color:#2563eb">${APP_URL}</a>
  </p>
  <p style="margin:24px 0 0;color:#6b7280;font-size:13px">Iaido Hanoi Training Schedule</p>
</div>
      `.trim(),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Email send failed:", error);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
