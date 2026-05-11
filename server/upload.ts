import type { Express, Request, Response } from "express";
import { storagePut } from "./storage";
import { ENV } from "./_core/env";

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error("Invalid data URL");
  const mimeType = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");
  return { mimeType, buffer };
}

export function registerUploadRoutes(app: Express) {
  app.post("/api/upload", async (req: Request, res: Response) => {
    try {
      const { dataUrl, name } = req.body as { dataUrl?: string; name?: string };
      if (!dataUrl || typeof dataUrl !== "string") {
        res.status(400).json({ error: "Missing dataUrl" });
        return;
      }

      const filename = (name && name.replace(/[^a-zA-Z0-9_.-]/g, "_") ) || `upload_${Date.now()}.jpg`;

      const { mimeType, buffer } = parseDataUrl(dataUrl);

      // If storage backend is configured, use it. Otherwise return inline data URL.
      if (ENV.forgeApiUrl && ENV.forgeApiKey) {
        const { url } = await storagePut(`uploads/${filename}`, buffer, mimeType);
        res.json({ url, storage: "forge" });
        return;
      }
      res.json({ url: dataUrl, storage: "inline" });
    } catch (err: any) {
      console.error("/api/upload error:", err?.message || err);
      res.status(500).json({ error: err?.message || "Upload failed" });
    }
  });
}
