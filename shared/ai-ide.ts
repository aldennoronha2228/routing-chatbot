export type AiConversationMode = "chat" | "project" | "debug";

export interface AiIdeFile {
  path: string;
  content: string;
}

export interface AiIdeArtifactContext {
  title: string | null;
  subtitle: string | null;
  previewOpen: boolean;
  previewReady: boolean;
  messageId: string | null;
}

export interface AiIdeMessageContext {
  role: "user" | "assistant";
  content: string;
}

export interface AiIdePromptContext {
  mode: AiConversationMode;
  projectTitle?: string | null;
  projectFiles: AiIdeFile[];
  activeFilePath?: string | null;
  activeArtifact?: AiIdeArtifactContext | null;
  recentMessages?: AiIdeMessageContext[];
  selectedModel?: string | null;
  userPrompt?: string | null;
  preferTextOnly?: boolean | null;
}

export interface AiRequestTuning {
  temperature: number;
  topP: number;
}

const MAX_SNIPPET_LENGTH = 420;
const MAX_RELEVANT_FILES = 6;

const normalizeLabel = (value: string) => {
  return value
    .trim()
    .replace(/^`+|`+$/g, "")
    .replace(/\*+$/g, "")
    .replace(/[).,;:]+$/g, "")
    .replace(/^\.?\//, "")
    .replace(/\s+/g, " ");
};

const trimSnippet = (content: string) => {
  const cleaned = content.trim().replace(/\r\n/g, "\n");
  if (cleaned.length <= MAX_SNIPPET_LENGTH) {
    return cleaned;
  }
  return `${cleaned.slice(0, MAX_SNIPPET_LENGTH).trimEnd()}...`;
};

const pathSegments = (path: string) => normalizeLabel(path).toLowerCase().split("/").filter(Boolean);

const scoreFileRelevance = (file: AiIdeFile, prompt: string, activeFilePath?: string | null) => {
  let score = 0;
  const normalizedPrompt = prompt.toLowerCase();
  const promptTokens = normalizedPrompt
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3);
  const path = file.path.toLowerCase();
  const content = file.content.toLowerCase();

  if (activeFilePath && normalizeLabel(file.path) === normalizeLabel(activeFilePath)) {
    score += 200;
  }

  for (const token of promptTokens) {
    if (path.includes(token)) score += 18;
    if (content.includes(token)) score += 4;
  }

  const segments = pathSegments(file.path);
  if (segments.includes("component") || segments.includes("components")) score += 8;
  if (segments.includes("page") || segments.includes("pages")) score += 6;
  if (segments.some((segment) => segment.endsWith(".tsx") || segment.endsWith(".ts"))) score += 2;

  return score;
};

const buildTreeNode = (entries: AiIdeFile[]) => {
  type Node = {
    name: string;
    path: string;
    type: "folder" | "file";
    children: Node[];
  };

  const root: Node = {
    name: "my-app",
    path: "my-app",
    type: "folder",
    children: [],
  };

  const ensureChildFolder = (parent: Node, name: string) => {
    let child = parent.children.find((node) => node.type === "folder" && node.name === name);
    if (!child) {
      child = {
        name,
        path: `${parent.path}/${name}`,
        type: "folder",
        children: [],
      };
      parent.children.push(child);
    }
    return child;
  };

  for (const entry of entries) {
    const cleanedPath = normalizeLabel(entry.path).replace(/^\/+/, "");
    const parts = cleanedPath.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let node = root;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!;
      const isLeaf = index === parts.length - 1;
      if (isLeaf) {
        node.children.push({
          name: part,
          path: cleanedPath,
          type: "file",
          children: [],
        });
      } else {
        node = ensureChildFolder(node, part);
      }
    }
  }

  const sortNode = (node: Node) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortNode);
  };

  sortNode(root);
  return root;
};

const renderTreeLines = (node: { name: string; path: string; type: "folder" | "file"; children: Array<any> }, prefix = ""): string[] => {
  if (node.type === "file") {
    return [`${prefix}${node.name}`];
  }

  const lines = [`${prefix}${node.name}/`];
  node.children.forEach((child, index) => {
    const isLast = index === node.children.length - 1;
    const branch = isLast ? "└─ " : "├─ ";
    const nextPrefix = `${prefix}${isLast ? "   " : "│  "}`;
    if (child.type === "folder") {
      const childLines = renderTreeLines(child, `${prefix}${branch}`);
      if (childLines.length > 0) {
        lines.push(...childLines.map((line, childIndex) => (childIndex === 0 ? line : `${nextPrefix}${line.trimStart()}`)));
      }
      return;
    }
    lines.push(`${prefix}${branch}${child.name}`);
  });
  return lines;
};

const buildTreeText = (files: AiIdeFile[]) => {
  if (files.length === 0) return "my-app/\n└─ (empty)";
  const tree = buildTreeNode(files);
  return renderTreeLines(tree).join("\n");
};

const extractFileBlocks = (content: string) => {
  const results: AiIdeFile[] = [];
  const regex = /FILE:\s*([^\n]+)\n\s*```[^\n]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const path = normalizeLabel(match[1] ?? "");
    const code = match[2]?.trim() ?? "";
    if (path) results.push({ path, content: code });
  }
  return results;
};

export const selectRelevantFiles = (
  files: AiIdeFile[],
  prompt: string,
  activeFilePath?: string | null
) => {
  const scored = files
    .map((file) => ({ file, score: scoreFileRelevance(file, prompt, activeFilePath) }))
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path))
    .slice(0, MAX_RELEVANT_FILES)
    .map(({ file }) => file);

  if (activeFilePath) {
    const active = files.find((file) => normalizeLabel(file.path) === normalizeLabel(activeFilePath));
    if (active && !scored.some((file) => normalizeLabel(file.path) === normalizeLabel(active.path))) {
      scored.unshift(active);
    }
  }

  return scored.slice(0, MAX_RELEVANT_FILES);
};

export const summarizeRecentEdits = (messages: AiIdeMessageContext[] = []) => {
  const summaries: string[] = [];
  const seen = new Set<string>();

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== "assistant") continue;
    const fileBlocks = extractFileBlocks(message.content);
    if (fileBlocks.length === 0) continue;

    const updatedPaths = fileBlocks
      .map((file) => normalizeLabel(file.path))
      .filter((path) => path && !seen.has(path));

    if (updatedPaths.length === 0) continue;
    updatedPaths.forEach((path) => seen.add(path));
    summaries.push(`- Updated: ${updatedPaths.join(", ")}`);
    if (summaries.length >= 3) break;
  }

  return summaries.length > 0 ? summaries.join("\n") : "- No prior assistant file edits in this conversation yet.";
};

export const resolveAiRequestTuning = (mode: AiConversationMode): AiRequestTuning => {
  switch (mode) {
    case "debug":
      return { temperature: 0.15, topP: 0.8 };
    case "project":
      return { temperature: 0.2, topP: 0.85 };
    default:
      return { temperature: 0.55, topP: 0.95 };
  }
};

export const buildAiIdeSystemPrompt = (context: AiIdePromptContext) => {
  const activeFile = context.activeFilePath ? normalizeLabel(context.activeFilePath) : null;
  const relevantFiles = selectRelevantFiles(
    context.projectFiles,
    context.userPrompt || "",
    context.activeFilePath
  );
  const projectTree = buildTreeText(context.projectFiles);
  const recentEdits = summarizeRecentEdits(context.recentMessages || []);
  const artifact = context.activeArtifact;
  const mode = context.mode;

  const responseContract = `STRUCTURED PATCH OUTPUT CONTRACT:
- Prefer minimal edit blocks over full-file rewrites.
- For edits to existing files, emit one or more EDIT blocks:
  EDIT: path/to/file.ext
  FIND:
  \`\`\`text
  <exact existing snippet>
  \`\`\`
  REPLACE:
  \`\`\`text
  <updated snippet>
  \`\`\`
- Use FILE blocks only when creating a new file or when an edit block is not practical:
  FILE: path/to/file.ext
  \`\`\`tsx
  ...full file content...
  \`\`\`
- Keep changes small and localized.
- Do not output prose that says you changed files; output the edit blocks directly when editing.`;

  const workflow = mode === "debug"
    ? `BUG-FIXING WORKFLOW:
1. Identify the root cause first.
2. Patch the smallest set of files that fixes the issue.
3. Preserve the current architecture and existing working code.
4. Explain the failure briefly and verify the fix.`
    : `CODING WORKFLOW:
1. Inspect the provided project context before answering.
2. Edit only the files that need to change.
3. Preserve architecture, naming, and styling conventions.
4. Prefer incremental patches over rewrites.
5. If the user asks for analysis only, answer concisely before offering edits.`;

  const projectContext = [
    `Project: ${context.projectTitle || "Untitled Project"}`,
    `Mode: ${mode}`,
    `Selected model: ${context.selectedModel || "unknown"}`,
    `Active file: ${activeFile || "none"}`,
    `Artifact: ${artifact ? `${artifact.title || "Untitled artifact"} | ${artifact.subtitle || "No subtitle"} | open=${artifact.previewOpen} | ready=${artifact.previewReady}` : "none"}`,
    `Recent edits:\n${recentEdits}`,
    `Project tree:\n${projectTree}`,
    `Prefer text-only output: ${context.preferTextOnly ? "yes" : "no"}`,
    `Relevant files:\n${relevantFiles.length > 0
      ? relevantFiles.map((file) => `FILE: ${file.path}\n\n${trimSnippet(file.content)}`).join("\n\n")
      : "- none"}`,
    context.userPrompt ? `Latest user request:\n${context.userPrompt}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    `You are an AI IDE assistant for a live software project. Act like a senior full-stack engineer, debugging specialist, and pair programmer.`,
    ``,
    `BEHAVIOR:`,
    `- Be concise, practical, and context-aware.`,
    `- Prefer minimal, incremental changes that preserve working code.`,
    `- Do not rewrite entire projects unless the user explicitly asks.`,
    `- Avoid hallucinating files, imports, APIs, or runtime behavior.`,
    `- If the user reports a bug, reason from the current project state and explain the root cause briefly.`,
    `- If the user asks for code, patch the necessary files and keep the preview in sync mentally.`,
    `- When the answer involves changes, use the structured output contract below.`,
    context.preferTextOnly
      ? `- Preference: produce minimal text-only placeholders and simple text-renderable outputs instead of building full UI components unless the user explicitly requests full UI.`
      : null,
    ``,
    responseContract,
    ``,
    workflow,
    ``,
    `PROJECT-AWARE CONTEXT INJECTION:`,
    projectContext,
    ``,
    `RESPONSE STYLE:`,
    `- Answer like a real IDE collaborator.`,
    `- Offer a useful follow-up when appropriate, but keep it short.`,
    `- Ask a clarifying question only when a missing detail blocks a safe edit.`,
  ].join("\n");
};

export const ensureAiIdeSystemMessage = (
  messages: Array<{ role: "system" | "user" | "assistant"; content: string | Array<any> }>,
  context: AiIdePromptContext
) => {
  const hasSystemMessage = messages.some((message) => message.role === "system");
  if (hasSystemMessage) return messages;

  return [
    {
      role: "system" as const,
      content: buildAiIdeSystemPrompt(context),
    },
    ...messages,
  ];
};