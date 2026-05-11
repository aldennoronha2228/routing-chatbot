import { Router, Request, Response } from "express";
import { z } from "zod";
import { createWorker } from "tesseract.js";
import {
  ensureAiIdeSystemMessage,
  resolveAiRequestTuning,
} from "@shared/ai-ide";

const ROUTING_RUN_API_URL = "https://api.routing.run/v1";

let ocrWorkerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null;

const getOcrWorker = async () => {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker("eng");
  }
  return ocrWorkerPromise;
};

const extractTextFromDataUrl = async (dataUrl: string) => {
  if (!dataUrl.startsWith("data:image/")) return "";
  const worker = await getOcrWorker();
  const result = await worker.recognize(dataUrl);
  return (result?.data?.text || "").trim();
};

const messageContentSchema = z.union([
  z.string(),
  z.array(
    z.union([
      z.object({
        type: z.literal("text"),
        text: z.string(),
      }),
      z.object({
        type: z.literal("image_url"),
        image_url: z.union([
          z.string(),
          z.object({
            url: z.string(),
          }),
        ]),
      }),
    ])
  ),
]);

const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: messageContentSchema,
    })
  ),
  model: z.string().min(1, "Model is required"),
  apiKey: z.string().min(1, "API key is required"),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
});

export function registerChatStreamRoutes(app: Router) {
  app.post("/api/chat/stream", async (req: Request, res: Response) => {
    try {
      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid request",
          details: parsed.error.issues,
        });
        return;
      }

      const { messages, model, apiKey, temperature, topP } = parsed.data;
      const imageCount = messages.reduce((count, msg) => {
        if (!Array.isArray(msg.content)) return count;
        return count + msg.content.filter((part) => part.type === "image_url").length;
      }, 0);
      console.log(
        `[chatStream] model=${model} messages=${messages.length} images=${imageCount}`
      );

      const normalizedMessages = await Promise.all(
        messages.map(async (message) => {
          if (!Array.isArray(message.content)) {
            return message;
          }

          const parts: Array<
            | { type: "text"; text: string }
            | { type: "image_url"; image_url: { url: string } }
          > = [];

          for (const part of message.content) {
            if (part.type !== "image_url") {
              parts.push(part as { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } });
              continue;
            }

            const imageUrl = typeof part.image_url === "string" ? part.image_url : part.image_url.url;
            if (!imageUrl.startsWith("data:image/")) {
              parts.push({
                type: "image_url",
                image_url: { url: imageUrl },
              });
              continue;
            }

            try {
              const ocrText = await extractTextFromDataUrl(imageUrl);
              if (ocrText) {
                parts.push({
                  type: "text",
                  text: `Extracted text from attached image:\n\n${ocrText}`,
                });
              } else {
                parts.push({
                  type: "text",
                  text:
                    "An attached image was provided, but OCR could not read any text from it. Please inspect the image manually if needed.",
                });
              }
            } catch (err) {
              parts.push({
                type: "text",
                text:
                  "An attached image was provided, but OCR processing failed. Please inspect the image manually if needed.",
              });
            }
          }

          return {
            ...message,
            content: parts,
          };
        })
      );

      const messagesWithSystem = ensureAiIdeSystemMessage(normalizedMessages, {
        mode: "chat",
        projectTitle: "Unknown project",
        projectFiles: [],
        selectedModel: model,
        userPrompt: "",
      });

      const normalizedImageCount = messagesWithSystem.reduce((count, msg) => {
        if (!Array.isArray(msg.content)) return count;
        return count + msg.content.filter((part) => part.type === "image_url").length;
      }, 0);
      if (normalizedImageCount !== imageCount) {
        console.log(
          `[chatStream] normalized image payloads to text-only OCR parts; remaining images=${normalizedImageCount}`
        );
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      const response = await fetch(`${ROUTING_RUN_API_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: messagesWithSystem,
          stream: true,
          temperature: temperature ?? resolveAiRequestTuning("chat").temperature,
          top_p: topP ?? resolveAiRequestTuning("chat").topP,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[chatStream] upstream error ${response.status} ${response.statusText}: ${errorText}`
        );
        res.status(response.status).json({
          error: `routing.run API error`,
          status: response.status,
          message: errorText,
        });
        return;
      }

      if (!response.body) {
        console.error("[chatStream] upstream returned empty body");
        res.status(500).json({
          error: "No response body from routing.run API",
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
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
            const line = lines[i]!.trim();

            if (!line || line === "[DONE]") continue;

            if (line.startsWith("data: ")) {
              try {
                const jsonStr = line.slice(6);
                const data = JSON.parse(jsonStr);

                if (
                  data.choices &&
                  data.choices[0] &&
                  data.choices[0].delta &&
                  data.choices[0].delta.content
                ) {
                  const chunk = data.choices[0].delta.content;
                  res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
                }
              } catch (_error) {
                // Skip invalid JSON lines.
              }
            }
          }

          buffer = lines[lines.length - 1] || "";
        }
      } catch (error) {
        console.error("Streaming error:", error);
        res.write(
          `data: ${JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error",
          })}\n\n`
        );
        res.end();
      }
    } catch (error) {
      console.error("Chat stream endpoint error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
