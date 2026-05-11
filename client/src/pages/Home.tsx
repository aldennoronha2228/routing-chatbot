import { useState, useRef, useEffect, useMemo } from "react";
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Streamdown } from "streamdown";
import {
  ArrowUpRight,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Settings,
  Square,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { useIsMobile } from "@/hooks/useMobile";

const MODELS = [
  "route/kimi-k2.5",
  "route/glm-5-highspeed",
  "route/glm-5.1",
  "route/glm-5.1-precision",
  "route/qwen3.5-9b",
  "route/qwen3.5-397b-a17b",
  "route/minimax-m2.5",
];

const RECENT_CHATS_KEY = "routing_run_recent_chats";
const MAX_RECENT_CHATS = 12;
const CUSTOM_MODELS_KEY = "routing_run_models";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(RECENT_CHATS_KEY);
      return raw ? (JSON.parse(raw) as Conversation[]) : [];
    } catch (error) {
      return [];
    }
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [models, setModels] = useState<string[]>(() => {
    if (typeof window === "undefined") return MODELS;
    try {
      const raw = localStorage.getItem(CUSTOM_MODELS_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : MODELS;
      return parsed.length > 0 ? parsed : MODELS;
    } catch (error) {
      return MODELS;
    }
  });
  const [selectedModel, setSelectedModel] = useState(models[0] ?? MODELS[0]);
  const [manageModelsOpen, setManageModelsOpen] = useState(false);
  const [modelsInput, setModelsInput] = useState("");
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("routing_run_api_key") || "";
    }
    return "";
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = useIsMobile();

  const modelLabel = useMemo(
    () => selectedModel.replace("route/", ""),
    [selectedModel]
  );

  const parseModelsInput = (value: string) => {
    return Array.from(
      new Set(
        value
          .split(/\s+|,|;/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  };

  const historyItems = useMemo(() => {
    return conversations.slice(0, 8);
  }, [conversations]);

  const deriveTitle = (items: Message[]) => {
    const firstUser = items.find((message) => message.role === "user");
    if (!firstUser) return "New chat";
    return firstUser.content.slice(0, 48);
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLDivElement | null;

    if (!viewport) return;

    requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    });
  };

  const isNearBottom = () => {
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLDivElement | null;

    if (!viewport) return true;
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 160;
  };

  // Auto-scroll to bottom when messages change, without snapping when user scrolls up
  useEffect(() => {
    if (isNearBottom()) {
      scrollToBottom("smooth");
    }
  }, [messages, isStreaming]);

  useEffect(() => {
    if (messages.length === 0) return;
    const conversationId = activeConversationId ?? `conv_${Date.now()}`;
    if (!activeConversationId) {
      setActiveConversationId(conversationId);
    }

    setConversations((prev) => {
      const updatedAt = Date.now();
      const existingIndex = prev.findIndex((item) => item.id === conversationId);
      const nextItem: Conversation = {
        id: conversationId,
        title: deriveTitle(messages),
        messages,
        updatedAt,
      };

      let next = [...prev];
      if (existingIndex >= 0) {
        next.splice(existingIndex, 1);
      }
      next = [nextItem, ...next];
      return next.slice(0, MAX_RECENT_CHATS);
    });
  }, [messages, activeConversationId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(RECENT_CHATS_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(models));
  }, [models]);

  useEffect(() => {
    if (!models.includes(selectedModel)) {
      setSelectedModel(models[0] ?? MODELS[0]);
    }
  }, [models, selectedModel]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = `${nextHeight}px`;
  }, [input]);

  useEffect(() => {
    const root = scrollAreaRef.current;
    if (!root) return;

    const blocks = root.querySelectorAll("pre");
    blocks.forEach((pre) => {
      if (pre.getAttribute("data-code-enhanced") === "true") return;
      const code = pre.querySelector("code");
      const languageMatch = code?.className.match(/language-([\w-]+)/);
      const languageLabel = languageMatch ? languageMatch[1] : "code";

      const header = document.createElement("div");
      header.className = "code-block-header";
      header.textContent = languageLabel.toUpperCase();

      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "code-copy-btn";
      copyButton.textContent = "Copy";

      copyButton.addEventListener("click", async () => {
        const text = code?.textContent ?? "";
        if (!text) return;

        try {
          await navigator.clipboard.writeText(text);
          copyButton.textContent = "Copied";
          copyButton.setAttribute("data-copied", "true");
          window.setTimeout(() => {
            copyButton.textContent = "Copy";
            copyButton.removeAttribute("data-copied");
          }, 2000);
        } catch (err) {
          copyButton.textContent = "Error";
          window.setTimeout(() => {
            copyButton.textContent = "Copy";
          }, 2000);
        }
      });

      header.appendChild(copyButton);
      pre.prepend(header);
      pre.setAttribute("data-code-enhanced", "true");
    });
  }, [messages]);

  const handleSendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed) {
      toast.error("Please enter a message");
      return;
    }

    if (!apiKey.trim()) {
      toast.error("Please set your routing.run API key in settings");
      return;
    }

    const conversationId = activeConversationId ?? `conv_${Date.now()}`;
    if (!activeConversationId) {
      setActiveConversationId(conversationId);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: trimmed,
    };

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
    };

    const nextMessages = [...messages, userMessage, assistantMessage];
    setMessages(nextMessages);
    setInput("");
    setIsStreaming(true);
    scrollToBottom("smooth");

    try {
      const controller = new AbortController();
      setAbortController(controller);

      const chatMessages = nextMessages
        .filter((message) => message.role !== "assistant" || message.content)
        .map((m) => ({
        role: m.role,
        content: m.content,
      }));

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
                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === assistantMessage.id
                      ? { ...message, content: fullContent }
                      : message
                  )
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

      setIsStreaming(false);
      setAbortController(null);
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        toast.error(error.message || "Failed to get response");
        setMessages((prev) =>
          prev.filter((message) => message.id !== assistantMessage.id)
        );
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
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsStreaming(false);
    }
    setMessages([]);
    setInput("");
    setActiveConversationId(null);
  };

  const handleSelectConversation = (conversationId: string) => {
    if (isStreaming) return;
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;
    setActiveConversationId(conversationId);
    setMessages(conversation.messages);
    scrollToBottom("auto");
  };

  const handleAddModels = () => {
    const additions = parseModelsInput(modelsInput);
    if (additions.length === 0) {
      toast.error("Add at least one model");
      return;
    }
    const merged = Array.from(new Set([...models, ...additions]));
    setModels(merged);
    setModelsInput("");
    toast.success("Models updated");
  };

  const handleRemoveModel = (model: string) => {
    const next = models.filter((item) => item !== model);
    setModels(next.length > 0 ? next : MODELS);
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
    <SidebarProvider defaultOpen>
      <div className="app-shell">
        <Sidebar collapsible="icon" className="border-r border-sidebar-border">
          <SidebarHeader className="h-14 px-3">
            <div className="flex h-full items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/20">
                  <Sparkles className="size-4 text-primary" />
                </div>
                <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                  <span className="text-sm font-semibold tracking-tight">Routing.run</span>
                  <span className="text-xs text-muted-foreground">AI Workspace</span>
                </div>
              </div>
              <SidebarTrigger className="hidden md:inline-flex" />
            </div>
          </SidebarHeader>

          <SidebarContent className="px-3 pt-2 overflow-x-hidden">
            <SidebarMenu className="gap-2">
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="h-10 gap-2 rounded-lg bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80 group-data-[collapsible=icon]:justify-center"
                  onClick={handleClearChat}
                >
                  <Plus className="size-4" />
                  <span className="group-data-[collapsible=icon]:hidden">New chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton className="h-10 gap-2" isActive>
                  <MessageSquare className="size-4" />
                  <span className="group-data-[collapsible=icon]:hidden">Chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            <SidebarSeparator className="my-3" />

            <div className="px-1 text-xs uppercase tracking-[0.18em] text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
              Recent
            </div>
            <SidebarMenu className="mt-2 gap-1">
              {historyItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-sidebar-border px-3 py-4 text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
                  Your conversations will show up here.
                </div>
              ) : (
                historyItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      className="h-10 gap-2"
                      isActive={item.id === activeConversationId}
                      onClick={() => handleSelectConversation(item.id)}
                      disabled={isStreaming}
                    >
                      <ArrowUpRight className="size-4 text-sidebar-foreground/70" />
                      <span className="truncate group-data-[collapsible=icon]:hidden">
                        {item.title || "Untitled"}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="gap-3 px-3 pb-4 pt-3 border-t border-sidebar-border">
            <div className="rounded-xl border border-sidebar-border bg-sidebar/80 px-3 py-2.5 text-xs shadow-sm group-data-[collapsible=icon]:hidden">
              <div className="text-[0.7rem] uppercase tracking-[0.2em] text-sidebar-foreground/60">
                Model
              </div>
              <div className="mt-1 text-sm font-medium text-sidebar-foreground">
                {modelLabel}
              </div>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full justify-start gap-2 rounded-lg border-sidebar-border bg-sidebar/40 text-sidebar-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                >
                  <Settings className="size-4" />
                  <span className="group-data-[collapsible=icon]:hidden">Settings</span>
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
                    <p className="mt-1 text-xs text-muted-foreground">
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
                  <div className="rounded-lg border border-border bg-card/40 p-3">
                    <div className="text-xs font-medium">Models</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Manage the list used by the model picker.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => setManageModelsOpen(true)}
                    >
                      Manage models
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={manageModelsOpen} onOpenChange={setManageModelsOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Manage models</DialogTitle>
                  <DialogDescription>
                    Paste a list or add models one by one. Commas, spaces, and new lines all work.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="models-input">Add models</Label>
                    <Textarea
                      id="models-input"
                      value={modelsInput}
                      onChange={(e) => setModelsInput(e.target.value)}
                      placeholder="route/kimi-k2.5\nroute/glm-5.1\nroute/qwen3.5-9b"
                      className="min-h-[120px]"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Paste an entire list and we will split it automatically.
                    </p>
                  </div>
                  <Button onClick={handleAddModels} className="w-full">
                    Add models
                  </Button>
                  <div className="space-y-2">
                    <div className="text-xs font-medium">Current models</div>
                    <div className="flex flex-wrap gap-2">
                      {models.map((model) => (
                        <Button
                          key={model}
                          variant="secondary"
                          size="sm"
                          className="gap-2"
                          onClick={() => handleRemoveModel(model)}
                        >
                          {model}
                          <span aria-hidden>×</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-full justify-start gap-2 rounded-lg text-sidebar-foreground/80 hover:text-sidebar-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
              onClick={handleClearChat}
              disabled={messages.length === 0 || isStreaming}
            >
              <Trash2 className="size-4" />
              <span className="group-data-[collapsible=icon]:hidden">Clear chat</span>
            </Button>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="relative">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-5 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <div className="flex items-center gap-3">
              {isMobile && <SidebarTrigger className="mr-1" />}
              <div>
                <h1 className="text-lg font-semibold tracking-tight">Workspace</h1>
                <p className="text-xs text-muted-foreground">Route models with streaming</p>
              </div>
            </div>
            <div className="flex items-center gap-2" />
          </header>

          <div className="flex h-[calc(100vh-56px)] flex-col">
            <div className="flex-1 px-4" ref={scrollAreaRef}>
              <ScrollArea className="h-full">
                <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-8">
                {messages.length === 0 ? (
                  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15">
                      <Sparkles className="size-6 text-primary" />
                    </div>
                    <div className="max-w-md space-y-2">
                      <h2 className="text-2xl font-semibold tracking-tight">
                        Start a new conversation
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Choose a model, add your API key, and explore streaming AI
                        responses.
                      </p>
                    </div>
                    <div className="grid w-full max-w-2xl gap-3 md:grid-cols-2">
                      {[
                        "Draft a product update for routing.run",
                        "Explain a concept like an expert tutor",
                        "Refactor this prompt for clarity",
                        "Summarize a long article into bullets",
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => setInput(prompt)}
                          className="rounded-xl border border-border/70 bg-card/50 p-4 text-left text-sm text-foreground transition hover:border-primary/40 hover:bg-card"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {messages.map((message, index) => {
                      const isAssistant = message.role === "assistant";
                      const isLast = index === messages.length - 1;
                      const showCursor = isAssistant && isStreaming && isLast;
                      const showTyping =
                        isAssistant && isStreaming && isLast && !message.content;

                      return (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className={`flex w-full ${
                            isAssistant ? "justify-start" : "justify-end"
                          }`}
                          layout
                        >
                          <div
                            className={`message-bubble ${
                              isAssistant
                                ? "bg-card/70 text-card-foreground border border-border/70"
                                : "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                            }`}
                          >
                            {isAssistant ? (
                              showTyping ? (
                                <div className="typing-dots" aria-label="AI is typing">
                                  <span />
                                  <span />
                                  <span />
                                </div>
                              ) : (
                                <div className="chat-prose prose prose-sm dark:prose-invert max-w-none">
                                  <Streamdown>{message.content}</Streamdown>
                                  {showCursor && (
                                    <span className="streaming-cursor" aria-hidden />
                                  )}
                                </div>
                              )
                            ) : (
                              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                                {message.content}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
                </div>
              </ScrollArea>
            </div>

            <div className="sticky bottom-0 z-20 border-t border-border/60 bg-background/80 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
                <div className="chat-input-container flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/70 p-3 shadow-lg shadow-black/10 transition">
                  <div className="flex items-start gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-1 size-9 rounded-xl text-muted-foreground hover:text-foreground"
                      disabled={isStreaming}
                      aria-label="Attach file"
                    >
                      <Paperclip className="size-4" />
                    </Button>
                    <Textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Message routing.run..."
                      className="min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm leading-relaxed focus-visible:ring-0"
                      rows={1}
                      disabled={isStreaming}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Select
                      value={selectedModel}
                      onValueChange={setSelectedModel}
                      disabled={isStreaming}
                    >
                      <SelectTrigger className="h-8 w-[200px] bg-background/60 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start">
                        {models.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model.replace("route/", "")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground">
                        Enter to send, Shift+Enter for newline
                      </div>
                      {isStreaming ? (
                        <Button
                          onClick={handleStop}
                          variant="destructive"
                          className="h-8 gap-2 rounded-full px-3 text-xs"
                        >
                          <Square className="size-3" />
                          Stop
                        </Button>
                      ) : (
                        <Button
                          onClick={handleSendMessage}
                          disabled={!input.trim() || !apiKey.trim()}
                          className="h-8 gap-2 rounded-full px-3 text-xs"
                        >
                          <Send className="size-3" />
                          Send
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
