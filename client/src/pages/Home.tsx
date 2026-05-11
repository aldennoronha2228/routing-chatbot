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
import {
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
} from "@codesandbox/sandpack-react";
import { Streamdown } from "streamdown";
import {
  ArrowUpRight,
  ChevronLeft,
  Monitor,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Settings,
  Smartphone,
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

const PROJECTS_KEY = "routing_run_projects";
const MAX_PROJECTS = 20;
const CUSTOM_MODELS_KEY = "routing_run_models";

const DEFAULT_FILES = [
  {
    path: "app/page.tsx",
    content: `export default function Page() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
      <div className="max-w-xl text-center space-y-4">
        <h1 className="text-4xl font-semibold">Build something beautiful</h1>
        <p className="text-sm text-white/70">
          Ask the AI to create sections, components, and layouts. The preview updates instantly.
        </p>
      </div>
    </main>
  );
}
`,
  },
  {
    path: "styles/global.css",
    content: `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: "Inter", system-ui, sans-serif;
}
`,
  },
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

type ConversationMode = "chat" | "project";

interface Project {
  id: string;
  title: string;
  mode: ConversationMode;
  isAutoTitle: boolean;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  files: VfsFile[];
  activeFilePath: string;
  previewTab: PreviewTab;
  previewDevice: PreviewDevice;
  previewOpen: boolean;
  previewReady: boolean;
  artifactTitle: string | null;
  artifactSubtitle: string | null;
  artifactMessageId: string | null;
}

type PreviewTab = "preview" | "code";
type PreviewDevice = "desktop" | "mobile";

type VfsFile = {
  path: string;
  content: string;
};

export default function Home() {
  const createProject = (
    title = "Untitled Project",
    mode: ConversationMode = "chat"
  ): Project => {
    const now = Date.now();
    return {
      id: `proj_${now}`,
      title,
      mode,
      isAutoTitle: true,
      createdAt: now,
      updatedAt: now,
      messages: [],
      files: DEFAULT_FILES,
      activeFilePath: DEFAULT_FILES[0]?.path ?? "app/page.tsx",
      previewTab: "preview",
      previewDevice: "desktop",
      previewOpen: false,
      previewReady: false,
      artifactTitle: null,
      artifactSubtitle: null,
      artifactMessageId: null,
    };
  };

  const [projects, setProjects] = useState<Project[]>(() => {
    if (typeof window === "undefined") return [createProject()];
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Project[]) : [];
      if (parsed.length === 0) return [createProject()];
      return parsed.map((project) => ({
        ...project,
        mode: project.mode ?? "chat",
      }));
    } catch (error) {
      return [createProject()];
    }
  });
  const [activeProjectId, setActiveProjectId] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Project[]) : [];
      return parsed[0]?.id ?? null;
    } catch (error) {
      return null;
    }
  });
  const [messages, setMessages] = useState<Message[]>([]);
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
  const [previewTab, setPreviewTab] = useState<PreviewTab>("preview");
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("desktop");
  const [conversationMode, setConversationMode] = useState<ConversationMode>("chat");
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [artifactTitle, setArtifactTitle] = useState<string | null>(null);
  const [artifactSubtitle, setArtifactSubtitle] = useState<string | null>(null);
  const [artifactMessageId, setArtifactMessageId] = useState<string | null>(null);
  const [files, setFiles] = useState<VfsFile[]>(DEFAULT_FILES);
  const [activeFilePath, setActiveFilePath] = useState(
    DEFAULT_FILES[0]?.path ?? "app/page.tsx"
  );
  const [previewReady, setPreviewReady] = useState(false);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
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
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const lastArtifactAppliedMessageIdRef = useRef<string | null>(null);
  const isMobile = useIsMobile();
  const [mobileWorkspaceOpen, setMobileWorkspaceOpen] = useState(false);
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<"chat" | "preview" | "code">(
    "chat"
  );

  const modelLabel = useMemo(
    () => selectedModel.replace("route/", ""),
    [selectedModel]
  );
  const isProjectMode = conversationMode === "project";

  useEffect(() => {
    if (!isMobile) {
      setMobileWorkspaceOpen(false);
      setMobileWorkspaceTab("chat");
    }
  }, [isMobile]);


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

  const getLanguageForFile = (path: string) => {
    const ext = path.split(".").pop()?.toLowerCase();
    if (!ext) return "text";
    if (["ts", "tsx"].includes(ext)) return "tsx";
    if (["js", "jsx"].includes(ext)) return "jsx";
    if (ext === "css") return "css";
    if (ext === "html") return "html";
    return "text";
  };

  const normalizeVfsPath = (path: string) => {
    if (!path.startsWith("/")) return `/${path}`;
    return path;
  };

  const buildVfsMap = (currentFiles: VfsFile[]) => {
    return currentFiles.reduce<Record<string, string>>((acc, file) => {
      const normalized = normalizeVfsPath(file.path);
      acc[normalized] = file.content;
      return acc;
    }, {});
  };

  const getEntryPath = (filesMap: Record<string, string>) => {
    const candidates = [
      "/App.tsx",
      "/App.jsx",
      "/app/page.tsx",
      "/app/page.jsx",
      "/app/page.ts",
      "/app/page.js",
    ];
    const hit = candidates.find((path) => filesMap[path]);
    if (hit) return hit;
    return Object.keys(filesMap)[0] ?? "/app/page.tsx";
  };

  const parseFileBlocks = (content: string) => {
    const results: VfsFile[] = [];
    const regex = /FILE:\s*([^\n]+)\n\s*```[^\n]*\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const path = match[1]?.trim();
      const code = match[2]?.trim() ?? "";
      if (path) {
        results.push({ path, content: code });
      }
    }

    if (results.length > 0) {
      return results;
    }

    const fallbackBlocks: VfsFile[] = [];
    const fenceRegex = /```([\w-]+)?\n([\s\S]*?)```/g;
    let fenceMatch: RegExpExecArray | null;
    while ((fenceMatch = fenceRegex.exec(content)) !== null) {
      const language = (fenceMatch[1] ?? "").toLowerCase();
      const code = fenceMatch[2]?.trim() ?? "";
      if (!code) continue;

      if (language === "html" && code.includes("<html")) {
        const escaped = code
          .replace(/\\/g, "\\\\")
          .replace(/`/g, "\\`")
          .replace(/\$\{/g, "\\${");
        fallbackBlocks.push({
          path: "app/page.tsx",
          content: `export default function Page() {
  return (
    <iframe
      title="Generated Preview"
      srcDoc={\`${escaped}\`}
      width="100%"
      height="100%"
      style={{
        display: "block",
        width: "100%",
        minWidth: "100%",
        maxWidth: "100%",
        height: "100vh",
        minHeight: "100vh",
        border: "0",
      }}
    />
  );
}
`,
        });
        continue;
      }

      if (["tsx", "jsx", "typescript", "javascript", "js", "ts"].includes(language)) {
        fallbackBlocks.push({ path: "app/page.tsx", content: code });
        continue;
      }

      if (language === "css") {
        fallbackBlocks.push({ path: "styles/global.css", content: code });
      }
    }

    return fallbackBlocks;
  };

  const PROJECT_INTENT_PATTERNS = [
    /\b(build|create|make|generate|design)\b.*\b(website|web app|webapp|app|landing page|portfolio|dashboard|ui|frontend)\b/i,
    /\b(nextjs|next\.js|react app|tailwind site|saas landing|admin dashboard)\b/i,
    /\b(code|implement)\b.*\b(page|component|site|app)\b/i,
  ];

  const CHAT_INTENT_PATTERNS = [
    /\b(explain|what is|how does|why does|help me debug|debug|difference between|jwt|hooks?)\b/i,
  ];
  const DEBUG_INTENT_PATTERNS = [
    /\berror\b/i,
    /\bexception\b/i,
    /\bstack\s*trace\b/i,
    /\btraceback\b/i,
    /\bfailed\b/i,
    /\bnot found\b/i,
    /\bundefined\b/i,
    /\bcannot\b/i,
    /\bminified react error\b/i,
    /\bTypeError\b|\bReferenceError\b|\bSyntaxError\b/i,
    /\bERR_[A-Z0-9_]+\b/i,
    /\bHTTP\s*[45]\d{2}\b/i,
    /\bat\s.+\(.+\)/i,
    /\bbug\b/i,
    /\bissue\b/i,
    /\bfix\b/i,
    /\bcorrect\b/i,
    /\bmistake\b/i,
    /\bbroken\b/i,
    /\bnot working\b/i,
    /\bdoesn'?t work\b/i,
    /\bcrash(ed)?\b/i,
    /\bfail(?:ed|ing)?\b/i,
  ];

  const isDebugRequest = (prompt: string) => {
    return DEBUG_INTENT_PATTERNS.some((pattern) => pattern.test(prompt));
  };

  const detectIntentMode = (
    prompt: string,
    existingMode: ConversationMode
  ): ConversationMode => {
    if (isDebugRequest(prompt)) return "chat";
    if (existingMode === "project") return "project";
    if (PROJECT_INTENT_PATTERNS.some((pattern) => pattern.test(prompt))) {
      return "project";
    }
    if (CHAT_INTENT_PATTERNS.some((pattern) => pattern.test(prompt))) {
      return "chat";
    }
    return "chat";
  };

  const shouldCreateArtifact = (fileBlocks: VfsFile[]) => {
    if (fileBlocks.length === 0) return false;
    const paths = fileBlocks.map((file) => file.path.toLowerCase());
    const hasReactOrPage = paths.some((path) =>
      [".tsx", ".jsx", "app/page", "components/"].some((needle) =>
        path.includes(needle)
      )
    );
    const hasStyle = paths.some((path) => path.endsWith(".css"));
    return hasReactOrPage || hasStyle;
  };
  const sanitizeCss = (content: string) => {
    return content.replace(/@tailwind\s+[^;]+;/g, "");
  };

  const stripExtension = (path: string) => {
    return path.replace(/\.[^/.]+$/, "");
  };

  const buildSandpackFiles = (currentFiles: VfsFile[]) => {
    const filesMap = buildVfsMap(currentFiles);
    const entryPath = getEntryPath(filesMap);
    const hasAppFile = Boolean(filesMap["/App.tsx"] || filesMap["/App.jsx"]);
    const sandpackFiles: Record<string, { code: string }> = {};

    Object.entries(filesMap).forEach(([path, content]) => {
      const normalized = normalizeVfsPath(path);
      if (normalized.endsWith(".css")) {
        sandpackFiles[normalized] = { code: sanitizeCss(content) };
      } else {
        sandpackFiles[normalized] = { code: content };
      }
    });

    if (!hasAppFile || (entryPath !== "/App.tsx" && entryPath !== "/App.jsx")) {
      const importTarget = `.${stripExtension(entryPath)}`;
      sandpackFiles["/App.tsx"] = {
        code: `import Page from "${importTarget}";

export default function App() {
  return <Page />;
}
`,
      };
    }

    const cssContent = Object.entries(filesMap)
      .filter(([path]) => path.endsWith(".css"))
      .map(([, content]) => sanitizeCss(content))
      .join("\n\n");

    const generatedPreviewIframeFix = `
iframe[title="Generated Preview"] {
  display: block;
  width: 100% !important;
  min-width: 100% !important;
  max-width: 100% !important;
  height: 100vh;
  min-height: 100vh;
  border: 0;
}
`.trim();

    const mergedStyles = [cssContent, generatedPreviewIframeFix]
      .filter(Boolean)
      .join("\n\n");

    sandpackFiles["/styles.css"] = { code: mergedStyles };
    sandpackFiles["/index.tsx"] = {
      code: `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
`,
    };
    sandpackFiles["/index.html"] = {
      code: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
    };
    sandpackFiles["/tsconfig.json"] = {
      code: JSON.stringify(
        {
          compilerOptions: {
            jsx: "react-jsx",
            target: "ESNext",
            module: "ESNext",
            moduleResolution: "Bundler",
            baseUrl: ".",
            paths: {
              "@/*": ["./*"]
            }
          }
        },
        null,
        2
      ),
    };

    return sandpackFiles;
  };

  const activeProject = useMemo(() => {
    return projects.find((project) => project.id === activeProjectId) ?? projects[0];
  }, [projects, activeProjectId]);

  const activeFile = useMemo(() => {
    return files.find((file) => file.path === activeFilePath) ?? files[0];
  }, [files, activeFilePath]);

  const hasPreviewAvailable = useMemo(() => {
    if (previewReady) return true;
    if (files.length > DEFAULT_FILES.length) return true;
    const baseline = new Map(DEFAULT_FILES.map((file) => [file.path, file.content]));
    return files.some((file) => baseline.get(file.path) !== file.content);
  }, [previewReady, files]);


  const projectItems = useMemo(() => {
    return projects.slice(0, 10);
  }, [projects]);

  const deriveTitle = (items: Message[]) => {
    const firstUser = items.find((message) => message.role === "user");
    if (!firstUser) return "New chat";
    return firstUser.content.slice(0, 48);
  };

  const formatProjectTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
    return `${Math.floor(diff / 86_400_000)}d`;
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
  }, [messages, isStreaming, projects, activeProjectId]);

  useEffect(() => {
    if (!activeProjectId) return;
    const project = projects.find((item) => item.id === activeProjectId);
    if (!project) return;
    setConversationMode(project.mode ?? "chat");
    setMessages(project.messages);
    setFiles(project.files);
    setActiveFilePath(project.activeFilePath ?? project.files[0]?.path ?? "app/page.tsx");
    setPreviewTab(project.previewTab ?? "preview");
    setPreviewDevice(project.previewDevice ?? "desktop");
    setArtifactOpen(project.previewOpen ?? false);
    setPreviewReady(project.previewReady ?? false);
    setArtifactTitle(project.artifactTitle ?? null);
    setArtifactSubtitle(project.artifactSubtitle ?? null);
    setArtifactMessageId(project.artifactMessageId ?? null);
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId) return;
    setProjects((prev) => {
      return prev.map((project) => {
        if (project.id !== activeProjectId) return project;
        const nextTitle = project.isAutoTitle ? deriveTitle(messages) : project.title;
        return {
          ...project,
          mode: conversationMode,
          title: nextTitle,
          messages,
          files,
          activeFilePath,
          previewTab,
          previewDevice,
          previewOpen: artifactOpen,
          previewReady,
          artifactTitle,
          artifactSubtitle,
          artifactMessageId,
          updatedAt: Date.now(),
        };
      });
    });
  }, [
    messages,
    files,
    activeFilePath,
    previewTab,
    previewDevice,
    artifactOpen,
    previewReady,
    artifactTitle,
    artifactSubtitle,
    artifactMessageId,
    conversationMode,
    activeProjectId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  }, [projects]);

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
    if (files.length === 0) return;
    if (!files.find((file) => file.path === activeFilePath)) {
      setActiveFilePath(files[0].path);
    }
  }, [files, activeFilePath]);

  useEffect(() => {
    if (isStreaming) return;
    const lastAssistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (!lastAssistant) return;
    if (lastArtifactAppliedMessageIdRef.current === lastAssistant.id) return;
    const fileBlocks = parseFileBlocks(lastAssistant.content);
    if (fileBlocks.length === 0) return;

    if (!shouldCreateArtifact(fileBlocks)) return;

    setFiles((prev) => {
      const map = new Map(prev.map((file) => [file.path, file]));
      let changed = false;
      fileBlocks.forEach((file) => {
        const existing = map.get(file.path);
        if (!existing || existing.content !== file.content) {
          changed = true;
        }
        map.set(file.path, file);
      });
      return changed ? Array.from(map.values()) : prev;
    });
    setActiveFilePath(fileBlocks[0].path);
    setPreviewReady(true);
    setPreviewTab("preview");
    setConversationMode("project");
    setArtifactOpen(!isMobile);
    lastArtifactAppliedMessageIdRef.current = lastAssistant.id;
    setArtifactTitle("Website Ready");
    setArtifactSubtitle("Generated project");
    setArtifactMessageId(lastAssistant.id);
  }, [messages, isStreaming, isMobile]);

  const sandpackFiles = useMemo(() => {
    return buildSandpackFiles(files);
  }, [files]);

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
      const actions = document.createElement("div");
      actions.className = "code-block-actions";

      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "code-copy-btn";
      copyButton.textContent = "Copy";
      const downloadButton = document.createElement("button");
      downloadButton.type = "button";
      downloadButton.className = "code-download-btn";
      downloadButton.textContent = "Download";

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

      downloadButton.addEventListener("click", () => {
        const text = code?.textContent ?? "";
        if (!text) return;
        const ext = languageLabel === "code" ? "txt" : languageLabel;
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `snippet.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
      });

      actions.appendChild(downloadButton);
      actions.appendChild(copyButton);
      header.appendChild(actions);
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

    const activeProjectMode = activeProject?.mode ?? "chat";
    const debugMode = isDebugRequest(trimmed);
    const nextMode = detectIntentMode(trimmed, activeProjectMode);

    if (!activeProjectId) {
      const newProject = createProject(
        nextMode === "project" ? "New project" : "New chat",
        nextMode
      );
      setProjects((prev) => [newProject, ...prev].slice(0, MAX_PROJECTS));
      setActiveProjectId(newProject.id);
      setConversationMode(newProject.mode);
    } else if (nextMode !== activeProjectMode) {
      setConversationMode(nextMode);
      if (nextMode === "chat") {
        setArtifactOpen(false);
      }
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

      const chatMessages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }> = nextMessages
        .filter((message) => message.role !== "assistant" || message.content)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      if (debugMode) {
        chatMessages.unshift({ role: "system", content: buildDebugContext() });
      } else if (nextMode === "project") {
        chatMessages.unshift({ role: "system", content: buildProjectContext() });
      }

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
        const rawError = await response.text();
        let errorMessage = `API error: ${response.statusText || response.status}`;

        if (rawError) {
          try {
            const parsed = JSON.parse(rawError) as { message?: string };
            if (parsed.message) {
              errorMessage = parsed.message;
            }
          } catch {
            // Server may return HTML/plain-text (for example fallback pages).
            const shortText = rawError.replace(/\s+/g, " ").trim().slice(0, 140);
            if (shortText) {
              errorMessage = shortText;
            }
          }
        }

        throw new Error(errorMessage);
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
    setPreviewReady(false);
    setPreviewTab("preview");
    setArtifactOpen(false);
    setArtifactTitle(null);
    setArtifactSubtitle(null);
    setArtifactMessageId(null);
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

  const handleNewProject = () => {
    const newProject = createProject("New chat", "chat");
    setProjects((prev) => [newProject, ...prev].slice(0, MAX_PROJECTS));
    setActiveProjectId(newProject.id);
    setMessages([]);
    setFiles(newProject.files);
    setActiveFilePath(newProject.activeFilePath);
    setPreviewReady(newProject.previewReady);
    setArtifactOpen(newProject.previewOpen);
    setArtifactTitle(newProject.artifactTitle);
    setArtifactSubtitle(newProject.artifactSubtitle);
    setArtifactMessageId(newProject.artifactMessageId);
    setConversationMode("chat");
  };

  const handleSelectProject = (projectId: string) => {
    if (isStreaming) return;
    if (projectId === activeProjectId) return;
    setActiveProjectId(projectId);
    scrollToBottom("auto");
  };

  const handleRenameProject = () => {
    if (!activeProject) return;
    const nextTitle = window.prompt("Rename project", activeProject.title);
    if (!nextTitle) return;
    setProjects((prev) =>
      prev.map((project) =>
        project.id === activeProject.id
          ? { ...project, title: nextTitle.trim(), isAutoTitle: false }
          : project
      )
    );
  };

  const handleDuplicateProject = () => {
    if (!activeProject) return;
    const now = Date.now();
    const duplicate: Project = {
      ...activeProject,
      id: `proj_${now}`,
      title: `${activeProject.title} Copy`,
      isAutoTitle: false,
      createdAt: now,
      updatedAt: now,
    };
    setProjects((prev) => [duplicate, ...prev].slice(0, MAX_PROJECTS));
    setActiveProjectId(duplicate.id);
  };

  const handleDeleteProject = () => {
    if (!activeProject) return;
    const confirmed = window.confirm(`Delete "${activeProject.title}"?`);
    if (!confirmed) return;
    setProjects((prev) => prev.filter((project) => project.id !== activeProject.id));
    const remaining = projects.filter((project) => project.id !== activeProject.id);
    if (remaining.length > 0) {
      setActiveProjectId(remaining[0].id);
    } else {
      handleNewProject();
    }
  };

  const buildProjectContext = () => {
    const fileList = files.map((file) => `- ${file.path}`).join("\n");
    const fileSnippets = files
      .map((file) => {
        const snippet = file.content.slice(0, 800);
        return `FILE: ${file.path}\n\n${snippet}`;
      })
      .join("\n\n");

    return `You are an AI website builder. Update the project incrementally and return code in a strict machine-readable format.

STRICT RESPONSE CONTRACT (MANDATORY):
- Return ONLY FILE blocks. No intro, no explanation, no headings, no markdown text outside file blocks.
- Every block must follow this exact format:
FILE: path/to/file.ext
\`\`\`ext
...full file content...
\`\`\`
- You may include multiple FILE blocks.
- If you modify a file, return the FULL updated file.
- If you add a file, include it fully.
- Do NOT include "..." placeholders.
- Do NOT output plain HTML without a FILE block.

QUALITY REQUIREMENTS:
- Build a complete, working, modern responsive website.
- Use semantic HTML and accessible structure.
- Ensure mobile-first layout (phone/tablet/desktop).
- Keep styling consistent and production-ready.
- If React/TSX is used, output valid TSX.

If uncertain, still output best-effort valid FILE blocks only.

Current files:
${fileList}

Relevant snippets:
${fileSnippets}`;
  };

  const buildDebugContext = () => {
    const fileList = files.map((file) => `- ${file.path}`).join("\n");
    const fileSnippets = files
      .slice(0, 6)
      .map((file) => {
        const snippet = file.content.slice(0, 700);
        return `FILE: ${file.path}\n${snippet}`;
      })
      .join("\n\n");

    return `You are a senior debugging assistant.
Goal: diagnose and FIX the reported bug/error with concrete changes.

Response format (mandatory):
1) ROOT CAUSE
2) FIX PLAN
3) CODE FIXES
4) VERIFICATION

Rules:
- Be specific to the reported error/bug.
- Do not generate a new unrelated website.
- Prefer minimal targeted fixes over rewrites.
- In CODE FIXES, include complete FILE blocks for changed files:
FILE: path/to/file.ext
\`\`\`ext
...full updated file...
\`\`\`
- If uncertain, state assumptions and still provide the best fix.

Current project files:
${fileList}

Relevant snippets:
${fileSnippets}`;
  };

  const handlePreviewRefresh = () => {
    setPreviewRefreshKey((value) => value + 1);
  };

  const handleOpenPreviewInNewTab = () => {
    const iframe = previewFrameRef.current?.querySelector("iframe");
    const previewUrl = iframe?.getAttribute("src");
    const previewSrcDoc = iframe?.getAttribute("srcdoc");

    if (previewUrl && previewUrl !== "about:blank") {
      const opened = window.open(previewUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        toast.error("Popup blocked. Please allow popups for this site.");
      }
      return;
    }

    if (previewSrcDoc) {
      const opened = window.open("", "_blank", "noopener,noreferrer");
      if (!opened) {
        toast.error("Popup blocked. Please allow popups for this site.");
        return;
      }
      opened.document.open();
      opened.document.write(previewSrcDoc);
      opened.document.close();
      return;
    }

    if (previewUrl === "about:blank") {
      toast.error("Preview is still loading. Try Refresh, then Open tab.");
      return;
    }

    if (!iframe) {
      toast.error("Preview iframe not found");
      return;
    }

    if (!previewUrl) {
      toast.error("Preview URL not ready yet");
      return;
    }

    const opened = window.open(previewUrl, "_blank");
    if (!opened) {
      toast.error("Popup blocked. Please allow popups for this site.");
    }
  };

  const handleCopyPreviewCode = async () => {
    if (!activeFile?.content) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      toast.success("Code copied");
    } catch (error) {
      toast.error("Failed to copy");
    }
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
                  onClick={handleNewProject}
                >
                  <Plus className="size-4" />
                  <span className="group-data-[collapsible=icon]:hidden">New project</span>
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
              Projects
            </div>
            <SidebarMenu className="mt-2 gap-1">
              {projectItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-sidebar-border px-3 py-4 text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
                  Your projects will show up here.
                </div>
              ) : (
                projectItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      className="h-10 gap-2"
                      isActive={item.id === activeProjectId}
                      onClick={() => handleSelectProject(item.id)}
                      disabled={isStreaming}
                    >
                      <ArrowUpRight className="size-4 text-sidebar-foreground/70" />
                      <span className="truncate group-data-[collapsible=icon]:hidden">
                        {item.title || "Untitled"}
                      </span>
                      <span className="ml-auto text-[10px] text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
                        {formatProjectTime(item.updatedAt)}
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
            <div className="grid grid-cols-3 gap-2 group-data-[collapsible=icon]:hidden">
              <Button variant="secondary" size="sm" onClick={handleRenameProject}>
                Rename
              </Button>
              <Button variant="secondary" size="sm" onClick={handleDuplicateProject}>
                Duplicate
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteProject}>
                Delete
              </Button>
            </div>
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
                <h1 className="text-lg font-semibold tracking-tight">
                  {activeProject?.title ?? "Workspace"}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {isProjectMode
                    ? "Website Builder / Coding Mode"
                    : "Normal Chat Mode"}
                </p>
              </div>
            </div>
              <div className="flex items-center gap-2">
              {isProjectMode && hasPreviewAvailable && !artifactOpen && (
                <span className="preview-ready">Preview ready</span>
              )}
              {(isProjectMode || hasPreviewAvailable) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (isMobile) {
                      setMobileWorkspaceTab("preview");
                      setMobileWorkspaceOpen(true);
                      return;
                    }
                    setArtifactOpen((value) => !value);
                  }}
                  disabled={!hasPreviewAvailable}
                >
                  {isMobile ? "Open preview" : artifactOpen ? "Close preview" : "Open preview"}
                </Button>
              )}
            </div>
          </header>

          <div
            className={`ai-ide-layout ${
              isProjectMode && artifactOpen ? "is-open" : "is-closed"
            } ${isMobile ? "is-mobile-layout" : ""}`}
          >
            <section className="chat-pane">
              <div className="chat-scroll" ref={scrollAreaRef}>
                <ScrollArea className="h-full">
                  <div className="chat-content flex w-full flex-col gap-6">
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
                          const showArtifactCard =
                            isProjectMode &&
                            isAssistant &&
                            message.id === artifactMessageId &&
                            previewReady;

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
                              {isAssistant ? (
                                <div className="flex max-w-full flex-col items-start gap-3">
                                  <div className="message-bubble bg-card/70 text-card-foreground border border-border/70">
                                    {showTyping ? (
                                      <div className="typing-dots" aria-label="AI is typing">
                                        <span />
                                        <span />
                                        <span />
                                      </div>
                                    ) : (
                                      <div className="chat-prose prose prose-sm dark:prose-invert max-w-none">
                                        <Streamdown skipHtml>{message.content}</Streamdown>
                                        {showCursor && (
                                          <span className="streaming-cursor" aria-hidden />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  {showArtifactCard && (
                                    <div className="artifact-card">
                                      <div className="artifact-card-header">
                                        <span className="artifact-card-icon" aria-hidden>
                                          ✨
                                        </span>
                                        <div>
                                          <div className="artifact-card-title">
                                            {artifactTitle ?? "Website Ready"}
                                          </div>
                                          <div className="artifact-card-subtitle">
                                            {artifactSubtitle ?? "Preview is ready"}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="artifact-card-actions">
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            setConversationMode("project");
                                            setPreviewTab("preview");
                                            setArtifactOpen(true);
                                          }}
                                        >
                                          Open Preview
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          onClick={() => {
                                            setConversationMode("project");
                                            setPreviewTab("code");
                                            setArtifactOpen(true);
                                          }}
                                        >
                                          View Code
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="message-bubble bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                                    {message.content}
                                  </p>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {isMobile && (isProjectMode || hasPreviewAvailable) && (
                <div className="mobile-workspace-switcher">
                  <button
                    className={mobileWorkspaceTab === "chat" ? "is-active" : ""}
                    onClick={() => {
                      setMobileWorkspaceTab("chat");
                      setMobileWorkspaceOpen(false);
                    }}
                  >
                    Chat
                  </button>
                  <button
                    className={mobileWorkspaceTab === "preview" ? "is-active" : ""}
                    onClick={() => {
                      setMobileWorkspaceTab("preview");
                      setMobileWorkspaceOpen(true);
                    }}
                  >
                    Preview
                  </button>
                  <button
                    className={mobileWorkspaceTab === "code" ? "is-active" : ""}
                    onClick={() => {
                      setMobileWorkspaceTab("code");
                      setMobileWorkspaceOpen(true);
                    }}
                  >
                    Code
                  </button>
                </div>
              )}

              <div className="chat-input-bar">
                <div className="chat-input-wrap flex w-full flex-col gap-3">
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
            </section>

            <AnimatePresence>
              {!isMobile && artifactOpen && hasPreviewAvailable && (
                <motion.section
                  className="preview-pane"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                >
                  <div className="preview-card vscode-panel">
                    <div className="preview-toolbar vscode-toolbar">
                      <div className="preview-tabs">
                        <button
                          className={`preview-tab ${previewTab === "preview" ? "is-active" : ""}`}
                          onClick={() => setPreviewTab("preview")}
                        >
                          Preview
                        </button>
                        <button
                          className={`preview-tab ${previewTab === "code" ? "is-active" : ""}`}
                          onClick={() => setPreviewTab("code")}
                        >
                          Code
                        </button>
                      </div>
                      <div className="preview-actions">
                        {previewReady ? (
                          <span className="preview-status">Preview ready</span>
                        ) : (
                          <span className="preview-status muted">No artifact yet</span>
                        )}
                        <div className="preview-device-toggle">
                          <button
                            className={previewDevice === "desktop" ? "is-active" : ""}
                            onClick={() => setPreviewDevice("desktop")}
                          >
                            Desktop
                          </button>
                          <button
                            className={previewDevice === "mobile" ? "is-active" : ""}
                            onClick={() => setPreviewDevice("mobile")}
                          >
                            Mobile
                          </button>
                        </div>
                        <button
                          className="preview-refresh"
                          onClick={handlePreviewRefresh}
                        >
                          Refresh
                        </button>
                        <button
                          className="preview-refresh"
                          onClick={handleOpenPreviewInNewTab}
                        >
                          Open tab
                        </button>
                      </div>
                    </div>

                    <div className="preview-body">
                      {previewTab === "code" ? (
                        <div className="preview-code">
                          <aside className="preview-files">
                            <div className="preview-files-header">Files</div>
                            <div className="preview-files-list">
                              {files.map((file) => (
                                <button
                                  key={file.path}
                                  className={
                                    file.path === activeFile?.path
                                      ? "is-active"
                                      : ""
                                  }
                                  onClick={() => setActiveFilePath(file.path)}
                                >
                                  {file.path}
                                </button>
                              ))}
                            </div>
                          </aside>
                          <div className="preview-code-editor">
                            <div className="preview-code-header">
                              <span>
                                {(activeFile?.path && getLanguageForFile(activeFile.path).toUpperCase()) ||
                                  "CODE"}
                              </span>
                              <button onClick={handleCopyPreviewCode}>Copy</button>
                            </div>
                            <pre>
                              <code>{activeFile?.content || "No code yet."}</code>
                            </pre>
                          </div>
                        </div>
                      ) : files.length > 0 ? (
                        <div
                          ref={previewFrameRef}
                          className={`preview-frame ${
                            previewDevice === "mobile" ? "is-mobile" : ""
                          }`}
                        >
                          <SandpackProvider
                            key={previewRefreshKey}
                            template="react-ts"
                            files={sandpackFiles}
                            customSetup={{
                              entry: "/index.tsx",
                              dependencies: {
                                react: "^19.2.1",
                                "react-dom": "^19.2.1",
                                "framer-motion": "^12.23.22",
                                "lucide-react": "^0.453.0",
                                "class-variance-authority": "^0.7.1",
                                clsx: "^2.1.1",
                                "tailwind-merge": "^3.3.1",
                                three: "^0.179.1",
                                "@react-three/fiber": "^9.3.0",
                                "@react-three/drei": "^10.0.8",
                              },
                            }}
                            options={{
                              recompileMode: "immediate",
                              recompileDelay: 200,
                              autorun: true,
                            }}
                          >
                            <SandpackLayout className="sandpack-shell">
                              <SandpackPreview
                                className="sandpack-preview"
                                showOpenInCodeSandbox={false}
                                showRefreshButton={false}
                                viewportSize={
                                  previewDevice === "mobile"
                                    ? { width: 390, height: 844 }
                                    : "auto"
                                }
                              />
                            </SandpackLayout>
                          </SandpackProvider>
                        </div>
                      ) : (
                        <div className="preview-empty">
                          <Sparkles className="size-6 text-primary" />
                          <h3>Preview panel</h3>
                          <p>Generated code will appear here automatically.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {isMobile && mobileWorkspaceOpen && hasPreviewAvailable && (
              <motion.section
                className="mobile-workspace-overlay"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <div className="mobile-workspace-header">
                  <button
                    className="mobile-workspace-back"
                    onClick={() => {
                      setMobileWorkspaceOpen(false);
                      setMobileWorkspaceTab("chat");
                    }}
                  >
                    <ChevronLeft className="size-4" />
                    Back to chat
                  </button>
                  <div className="mobile-workspace-tabs">
                    <button
                      className={mobileWorkspaceTab === "preview" ? "is-active" : ""}
                      onClick={() => setMobileWorkspaceTab("preview")}
                    >
                      <Smartphone className="size-3.5" />
                      Preview
                    </button>
                    <button
                      className={mobileWorkspaceTab === "code" ? "is-active" : ""}
                      onClick={() => setMobileWorkspaceTab("code")}
                    >
                      <Monitor className="size-3.5" />
                      Code
                    </button>
                  </div>
                </div>
                <div className="mobile-workspace-body">
                  {mobileWorkspaceTab === "code" ? (
                    <div className="mobile-code-view">
                      <div className="mobile-file-strip">
                        {files.map((file) => (
                          <button
                            key={file.path}
                            className={file.path === activeFile?.path ? "is-active" : ""}
                            onClick={() => setActiveFilePath(file.path)}
                          >
                            {file.path}
                          </button>
                        ))}
                      </div>
                      <div className="mobile-code-actions">
                        <span>{(activeFile?.path && getLanguageForFile(activeFile.path).toUpperCase()) || "CODE"}</span>
                        <button onClick={handleCopyPreviewCode}>Copy</button>
                      </div>
                      <pre className="mobile-code-pre">
                        <code>{activeFile?.content || "No code yet."}</code>
                      </pre>
                    </div>
                  ) : (
                    <div
                      ref={previewFrameRef}
                      className={`preview-frame ${
                        previewDevice === "mobile" ? "is-mobile" : ""
                      }`}
                    >
                      <SandpackProvider
                        key={previewRefreshKey}
                        template="react-ts"
                        files={sandpackFiles}
                        customSetup={{
                          entry: "/index.tsx",
                          dependencies: {
                            react: "^19.2.1",
                            "react-dom": "^19.2.1",
                            "framer-motion": "^12.23.22",
                            "lucide-react": "^0.453.0",
                            "class-variance-authority": "^0.7.1",
                            clsx: "^2.1.1",
                            "tailwind-merge": "^3.3.1",
                            three: "^0.179.1",
                            "@react-three/fiber": "^9.3.0",
                            "@react-three/drei": "^10.0.8",
                          },
                        }}
                        options={{
                          recompileMode: "immediate",
                          recompileDelay: 200,
                          autorun: true,
                        }}
                      >
                        <SandpackLayout className="sandpack-shell">
                          <SandpackPreview
                            className="sandpack-preview"
                            showOpenInCodeSandbox={false}
                            showRefreshButton={false}
                            viewportSize={
                              previewDevice === "mobile"
                                ? { width: 390, height: 844 }
                                : "auto"
                            }
                          />
                        </SandpackLayout>
                      </SandpackProvider>
                    </div>
                  )}
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
