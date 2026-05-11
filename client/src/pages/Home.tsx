import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Streamdown } from "streamdown";
import { Send, Trash2, Square, Settings } from "lucide-react";
import { toast } from "sonner";

const MODELS = [
  "route/kimi-k2.5",
  "route/glm-5-highspeed",
  "route/glm-5.1",
  "route/glm-5.1-precision",
  "route/qwen3.5-9b",
  "route/qwen3.5-397b-a17b",
  "route/minimax-m2.5",
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("routing_run_api_key") || "";
    }
    return "";
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) {
      toast.error("Please enter a message");
      return;
    }

    if (!apiKey.trim()) {
      toast.error("Please set your routing.run API key in settings");
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const controller = new AbortController();
      setAbortController(controller);

      const chatMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      chatMessages.push({ role: "user", content: input });

      // Stream from the /api/chat/stream endpoint
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: chatMessages,
          model: selectedModel,
          apiKey: apiKey,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `API error: ${response.statusText}`
        );
      }

      if (!response.body) {
        throw new Error("No response body from server");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

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

              if (data.error) {
                throw new Error(data.error);
              }

              if (data.content) {
                fullContent += data.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1]!,
                    content: fullContent,
                  };
                  return updated;
                });
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }

        // Keep the last incomplete line in the buffer
        buffer = lines[lines.length - 1] || "";
      }

      setIsStreaming(false);
      setAbortController(null);
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        toast.error(error.message || "Failed to get response");
        setMessages((prev) => prev.slice(0, -1));
      }
      setIsStreaming(false);
      setAbortController(null);
    }
  };

  const handleStop = () => {
    if (abortController) {
      abortController.abort();
      setIsStreaming(false);
      setAbortController(null);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setInput("");
  };

  const handleSaveApiKey = (newKey: string) => {
    if (!newKey.trim()) {
      toast.error("API key cannot be empty");
      return;
    }
    localStorage.setItem("routing_run_api_key", newKey);
    setApiKey(newKey);
    toast.success("API key saved");
  };

  const handleTestConnection = async (testKey: string) => {
    if (!testKey.trim()) {
      toast.error("Please enter an API key first");
      return;
    }

    try {
      const response = await fetch("https://api.routing.run/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${testKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "route/kimi-k2.5",
          messages: [{ role: "user", content: "test" }],
          stream: false,
          max_tokens: 10,
        }),
      });

      if (response.ok) {
        toast.success("Connection successful!");
      } else {
        toast.error(`Connection failed: ${response.statusText}`);
      }
    } catch (error) {
      toast.error("Connection test failed");
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Routing.run Chatbot</h1>
          <p className="text-sm text-muted-foreground">
            Lightweight AI playground for routing.run models
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Model Selector */}
          <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isStreaming}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((model) => (
                <SelectItem key={model} value={model}>
                  {model.replace("route/", "")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Settings Dialog */}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" disabled={isStreaming}>
                <Settings className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Settings</DialogTitle>
                <DialogDescription>
                  Configure your routing.run API key
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="api-key">API Key</Label>
                  <Input
                    id="api-key"
                    type="password"
                    placeholder="rk_..."
                    defaultValue={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Your API key is stored locally in your browser
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleSaveApiKey(apiKey)}
                    className="flex-1"
                  >
                    Save Key
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleTestConnection(apiKey)}
                    className="flex-1"
                  >
                    Test Connection
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Clear Chat Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={handleClearChat}
            disabled={messages.length === 0 || isStreaming}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Chat Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-96 text-center">
              <div>
                <h2 className="text-xl font-semibold mb-2">
                  Welcome to Routing.run Chatbot
                </h2>
                <p className="text-muted-foreground">
                  Select a model, enter your API key, and start chatting
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-2xl rounded-lg px-4 py-2 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-card-foreground border border-border"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <Streamdown>{message.content}</Streamdown>
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </div>
            ))
          )}
          {isStreaming && (
            <div className="flex justify-start">
              <div className="bg-card text-card-foreground border border-border rounded-lg px-4 py-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-border p-4 bg-background">
        <div className="max-w-4xl mx-auto flex gap-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                handleSendMessage();
              }
            }}
            placeholder="Type your message... (Ctrl+Enter to send)"
            className="resize-none"
            rows={3}
            disabled={isStreaming}
          />
          <div className="flex flex-col gap-2">
            {isStreaming ? (
              <Button
                onClick={handleStop}
                variant="destructive"
                size="icon"
                className="h-full"
              >
                <Square className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSendMessage}
                disabled={!input.trim() || !apiKey.trim()}
                className="h-full"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
