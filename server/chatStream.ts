import { Router, Request, Response } from "express";
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
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
  model: z.string().refine(
    (model) => ALLOWED_MODELS.includes(model),
    `Model must be one of: ${ALLOWED_MODELS.join(", ")}`
  ),
  apiKey: z.string().min(1, "API key is required"),
});

export function registerChatStreamRoutes(app: Router) {
  app.post("/api/chat/stream", async (req: Request, res: Response) => {
    try {
      // Validate request body
      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid request",
          details: parsed.error.issues,
        });
        return;
      }

      const { messages, model, apiKey } = parsed.data;

      // Set streaming headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      // Make request to routing.run API
      const response = await fetch(
        `${ROUTING_RUN_API_URL}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            stream: true,
            temperature: 0.7,
            top_p: 0.9,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        res.status(response.status).json({
          error: `routing.run API error`,
          status: response.status,
          message: errorText,
        });
        return;
      }

      if (!response.body) {
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

          // Process all complete lines
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
                  res.write(
                    `data: ${JSON.stringify({ content: chunk })}\n\n`
                  );
                }
              } catch (e) {
                // Skip invalid JSON lines
              }
            }
          }

          // Keep the last incomplete line in the buffer
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
