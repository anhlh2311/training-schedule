import type { VercelRequest, VercelResponse } from "@vercel/node";

const manifest = {
  name: "Training Schedule",
  short_name: "Training Schedule",
  description: "Team training availability and schedule",
  display: "standalone" as const,
  start_url: "/",
  theme_color: "#2563eb",
  background_color: "#ffffff",
  icons: [
    { src: "/IHN.png", sizes: "192x192", type: "image/png", purpose: "any" as const },
    { src: "/IHN.png", sizes: "512x512", type: "image/png", purpose: "any" as const },
    { src: "/IHN.png", sizes: "1280x1280", type: "image/png", purpose: "any" as const },
  ],
  id: "/?homescreen=1",
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end();
    return;
  }
  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).json(manifest);
}
