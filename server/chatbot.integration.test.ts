import { describe, expect, it, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer } from "http";
import { registerChatStreamRoutes } from "./chatStream";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerChatStreamRoutes(app);

  server = createServer(app);

  return new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(() => {
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe("Chat Streaming Integration Tests", () => {
  it("should validate request format and reject invalid models", async () => {
    const response = await fetch(`${baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "test" }],
        model: "invalid-model-xyz",
        apiKey: "test-key",
      }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request");
  });

  it("should accept all valid models", async () => {
    const models = [
      "route/kimi-k2.5",
      "route/glm-5-highspeed",
      "route/glm-5.1",
      "route/glm-5.1-precision",
      "route/qwen3.5-9b",
      "route/qwen3.5-397b-a17b",
      "route/minimax-m2.5",
    ];

    for (const model of models) {
      const response = await fetch(`${baseUrl}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "test" }],
          model,
          apiKey: "test-key",
        }),
      });

      // Should not be a validation error (400)
      expect(response.status).not.toBe(400);

      // Consume response to clean up
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
    }
  });

  it("should stream response with valid API key", async () => {
    if (!process.env.ROUTING_RUN_API_KEY) {
      console.log("Skipping streaming test - no API key provided");
      return;
    }

    const response = await fetch(`${baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Say hello" }],
        model: "route/kimi-k2.5",
        apiKey: process.env.ROUTING_RUN_API_KEY,
      }),
    });

    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toBe("text/event-stream");

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let totalContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i]!.trim();
        if (!line || line === "[DONE]") continue;

        if (line.startsWith("data: ")) {
          try {
            const jsonStr = line.slice(6);
            const data = JSON.parse(jsonStr);
            if (data.content) {
              totalContent += data.content;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }

      buffer = lines[lines.length - 1] || "";
    }

    // Verify we received actual content
    expect(totalContent.length).toBeGreaterThan(0);
  });

  it("should handle conversation history", async () => {
    if (!process.env.ROUTING_RUN_API_KEY) {
      console.log("Skipping history test - no API key provided");
      return;
    }

    const response = await fetch(`${baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", content: "What is 2+2?" },
          { role: "assistant", content: "4" },
          { role: "user", content: "What is 3+3?" },
        ],
        model: "route/kimi-k2.5",
        apiKey: process.env.ROUTING_RUN_API_KEY,
      }),
    });

    expect(response.ok).toBe(true);

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }
  });

  it("should reject invalid message roles", async () => {
    const response = await fetch(`${baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "system", content: "test" }],
        model: "route/kimi-k2.5",
        apiKey: "test-key",
      }),
    });

    expect(response.status).toBe(400);
  });

  it("should reject empty messages array", async () => {
    const response = await fetch(`${baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [],
        model: "route/kimi-k2.5",
        apiKey: "test-key",
      }),
    });

    // Should be rejected by validation
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("should reject missing API key", async () => {
    const response = await fetch(`${baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "test" }],
        model: "route/kimi-k2.5",
        apiKey: "",
      }),
    });

    expect(response.status).toBe(400);
  });

  it("should set proper streaming headers", async () => {
    const response = await fetch(`${baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "test" }],
        model: "route/kimi-k2.5",
        apiKey: "test-key",
      }),
    });

    // Even if request fails, should have streaming headers
    if (response.status !== 400) {
      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("text/event-stream");
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(response.headers.get("connection")).toBe("keep-alive");
    }

    // Consume response
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }
  });
});
