import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { observable } from "@trpc/server/observable";
import { TRPCError } from "@trpc/server";
import {
  ensureAiIdeSystemMessage,
  resolveAiRequestTuning,
} from "@shared/ai-ide";

const ROUTING_RUN_API_URL = "https://api.routing.run/v1";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Streaming chat endpoint that proxies to routing.run API
 */
export const chatRouter = router({
  stream: publicProcedure
    .input(
      z.object({
        messages: z.array(
          z.object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string(),
          })
        ),
        model: z.string().default("route/kimi-k2.5"),
        apiKey: z.string().min(1, "API key is required"),
        temperature: z.number().min(0).max(2).optional(),
        topP: z.number().min(0).max(1).optional(),
      })
    )
    .mutation(({ input }) => {
      return observable<string>((emit) => {
        (async () => {
          try {
            const messagesWithSystem = ensureAiIdeSystemMessage(input.messages, {
              mode: "chat",
              projectTitle: "Unknown project",
              projectFiles: [],
              selectedModel: input.model,
              userPrompt: "",
            });

            const response = await fetch(
              `${ROUTING_RUN_API_URL}/chat/completions`,
              {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${input.apiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: input.model,
                  messages: messagesWithSystem,
                  stream: true,
                  temperature: input.temperature ?? resolveAiRequestTuning("chat").temperature,
                  top_p: input.topP ?? resolveAiRequestTuning("chat").topP,
                }),
              }
            );

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(
                `routing.run API error ${response.status}: ${errorText}`
              );
            }

            if (!response.body) {
              throw new Error("No response body from routing.run API");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                if (buffer.trim()) {
                  emit.next(buffer);
                }
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
                      emit.next(data.choices[0].delta.content);
                    }
                  } catch (e) {
                    // Skip invalid JSON lines
                  }
                }
              }

              // Keep the last incomplete line in the buffer
              buffer = lines[lines.length - 1] || "";
            }

            emit.complete();
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            emit.error(new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Streaming error: ${message}`,
            }));
          }
        })();
      });
    }),
});
