# ⚡ Routing Playground AI

<div align="center">

### Lightweight AI Coding Playground powered by routing.run

Test multiple `route/...` models using a single `rk_` API key with real-time streaming, markdown rendering, and syntax-highlighted code blocks.

<br/>

<img src="https://readme-typing-svg.demolab.com?font=Inter&weight=600&size=24&duration=3000&pause=1000&color=8B5CF6&center=true&vCenter=true&width=700&lines=Fast+AI+Coding+Playground;Streaming+LLM+Responses;One+API+Key+for+All+Models;Built+with+Next.js+15+%2B+routing.run" />

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=500&size=16&duration=2200&pause=900&color=4F8BFF&center=true&vCenter=true&width=700&lines=Realtime+Streaming+Tokens;Smooth+Sidebar+Transitions;IDE+Style+Code+Blocks" />

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=500&size=14&duration=1800&pause=800&color=22D3EE&center=true&vCenter=true&width=700&lines=Typing+Indicator+Pulse...;Optimized+Rendering+Flow;Minimal+Latency+UX" />

</div>

---

## ✨ Features

* ⚡ Real-time streaming AI responses
* 🧠 Multiple `route/...` model support
* 🔑 Single `rk_` API key system
* 📝 Markdown rendering
* 💻 Syntax-highlighted code blocks
* 📋 Copy code button
* 🌙 Clean dark mode UI
* 🚀 Lightweight & fast architecture
* 🔄 Instant model switching
* 💾 LocalStorage API key persistence
* 🛑 Abort generation support

---

## 🧠 Supported Models

```txt
route/kimi-k2.5
route/glm-5-highspeed
route/glm-5.1
route/glm-5.1-precision
route/qwen3.5-9b
route/qwen3.5-397b-a17b
route/minimax-m2.5
```

---

## ⚙️ Tech Stack

* Next.js 15
* TypeScript
* TailwindCSS
* shadcn/ui
* React Markdown
* routing.run API
* Syntax Highlighting

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone YOUR_REPO_URL
cd YOUR_PROJECT_NAME
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

---

## 🔑 API Setup

Get your `rk_` API key from:

➡️ https://routing.run

Then paste it into the app settings panel.

---

## 🌐 API Configuration

Base URL:

```txt
https://api.routing.run/v1
```

Endpoint:

```txt
POST /chat/completions
```

Example Request:

```json
{
  "model": "route/kimi-k2.5",
  "messages": [
    {
      "role": "user",
      "content": "Build a React navbar"
    }
  ],
  "stream": true
}
```

---

## 📂 Project Structure

```bash
app/
components/
hooks/
lib/
types/
api/
```

---

## 🎨 UI Inspiration

* ChatGPT Playground
* Claude
* OpenRouter Playground

---

## ⚡ Performance Focused

This project is intentionally built to be:

* Minimal
* Fast
* Responsive
* Easy to extend
* Lightweight
* Streaming optimized

No unnecessary enterprise complexity.

---

## 🛠️ Roadmap

* [ ] Chat history
* [ ] File uploads
* [ ] Multi-chat support
* [ ] Prompt templates
* [ ] Mobile optimization
* [ ] Better code rendering

---

## 📜 License

MIT License

---

<div align="center">

### Built for fast AI experimentation ⚡

</div>
