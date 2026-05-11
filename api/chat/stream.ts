import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";

const ROUTING_RUN_API_URL = "https://api.routing.run/v1";

const ALLOWED_MODELS = [
  "route/kimi-k2.5",
  "route/glm-5-highspeed",
  "route/glm-5.1",
  "route/glm-5.1-precision",
  "route/qwen3.5-9b",
  "route/qwen3.5-397b-a17b",
  "route/minimax-m2.5",
];

const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    })
  ),
  model: z
    .string()
    .refine((model) => ALLOWED_MODELS.includes(model), `Model must be one of: ${ALLOWED_MODELS.join(", ")}`),
  apiKey: z.string().min(1, "API key is required"),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: parsed.error.issues,
      });
    }

    const { messages, model, apiKey } = parsed.data;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const upstream = await fetch(`${ROUTING_RUN_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.7,
        top_p: 0.9,
      }),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return res.status(upstream.status).json({
        error: "routing.run API error",
        status: upstream.status,
        message: errorText,
      });
    }

    if (!upstream.body) {
      return res.status(500).json({ error: "No response body from routing.run API" });
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        if (buffer.trim()) {
          res.write(`data: ${JSON.stringify({ content: buffer })}\n\n`);
        }
        res.write("data: [DONE]\n\n");
        res.end();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i]?.trim();
        if (!line || line === "[DONE]") continue;

        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6)) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const chunk = data.choices?.[0]?.delta?.content;
            if (chunk) {
              res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
            }
          } catch {
            // Ignore malformed stream lines.
          }
        }
      }

      buffer = lines[lines.length - 1] ?? "";
    }
  } catch (error) {
    console.error("Chat stream endpoint error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
