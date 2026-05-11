import { describe, expect, it } from "vitest";

describe("routing.run API key validation", () => {
  it("should validate the routing.run API key by making a test request", async () => {
    const apiKey = process.env.ROUTING_RUN_API_KEY;
    
    if (!apiKey) {
      throw new Error("ROUTING_RUN_API_KEY environment variable is not set");
    }

    // Make a simple test request to routing.run API
    const response = await fetch("https://api.routing.run/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "route/kimi-k2.5",
        messages: [
          {
            role: "user",
            content: "Say 'API key is valid' in exactly 5 words.",
          },
        ],
        stream: false,
        max_tokens: 20,
      }),
    });

    // Check if the response is successful
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(
        `routing.run API returned ${response.status}: ${errorData}`
      );
    }

    const data = await response.json();
    
    // Verify the response structure
    expect(data).toHaveProperty("choices");
    expect(Array.isArray(data.choices)).toBe(true);
    expect(data.choices.length).toBeGreaterThan(0);
    expect(data.choices[0]).toHaveProperty("message");
    expect(data.choices[0].message).toHaveProperty("content");
    
    console.log("✓ routing.run API key is valid");
    console.log("Response:", data.choices[0].message.content);
  });
});
