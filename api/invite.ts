import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.VITE_APP_URL || "https://your-app.vercel.app";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Training Schedule <onboarding@resend.dev>";

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
      subject: "You've been invited as a Trainer",
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="margin:0 0 16px">You're invited!</h2>
          <p style="color:#4b5563;line-height:1.6">
            You've been added as a trainer on the Training Schedule app.
            Sign in with your Google account to start managing your availability.
          </p>
          <a href="${APP_URL}"
             style="display:inline-block;margin-top:16px;padding:12px 24px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:500">
            Sign In
          </a>
        </div>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Email send failed:", error);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
