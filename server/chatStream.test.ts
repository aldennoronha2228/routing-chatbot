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

describe("Chat Stream Endpoint", () => {
  it("should reject requests with invalid model", async () => {
    const response = await fetch(`${baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "test" }],
        model: "invalid-model",
        apiKey: "test-key",
      }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request");
  });

  it("should reject requests with missing API key", async () => {
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
    const data = await response.json();
    expect(data.error).toBe("Invalid request");
  });

  it("should reject requests with invalid message format", async () => {
    const response = await fetch(`${baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "invalid", content: "test" }],
        model: "route/kimi-k2.5",
        apiKey: "test-key",
      }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request");
  });

  it("should accept valid request with correct model", async () => {
    // This test verifies the endpoint accepts valid input format
    // It will fail at the routing.run API level if the key is invalid,
    // but the endpoint itself should process it correctly
    const response = await fetch(`${baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "test" }],
        model: "route/kimi-k2.5",
        apiKey: process.env.ROUTING_RUN_API_KEY || "test-key",
      }),
    });

    // Should either succeed (200) or fail with routing.run API error (non-400)
    expect(response.status).not.toBe(400);

    // Should have streaming headers
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache");
  });

  it("should validate all allowed models", async () => {
    const allowedModels = [
      "route/kimi-k2.5",
      "route/glm-5-highspeed",
      "route/glm-5.1",
      "route/glm-5.1-precision",
      "route/qwen3.5-9b",
      "route/qwen3.5-397b-a17b",
      "route/minimax-m2.5",
    ];

    for (const model of allowedModels) {
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
    }
  });
});
