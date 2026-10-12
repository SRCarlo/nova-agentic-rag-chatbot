# Nova: Agentic RAG AI Assistant

A ChatGPT-style AI assistant with streaming responses, multi-tool agent loop, live web search, document RAG, and a modern React UI. Built with React, Node.js, and the Groq API.

## Features

- **Streaming replies** over Server-Sent Events, with a Stop button
- **Agent loop with tool calling**: web search, calculator, date/time, and document search
- **RAG** over your own `.md` / `.txt` files using BM25 retrieval, with source citations
- **Markdown rendering** with syntax-highlighted code blocks and copy buttons
- **Voice input** (Web Speech API) and **read-aloud** for replies
- **Multi-chat history** saved in the browser, with search, date grouping, and Markdown export
- **Dark / light themes**, responsive mobile layout, backend status badge
- **Production touches**: CORS allowlist, per-IP rate limiting, friendly error handling

## Tech Stack

| Layer    | Tech                                                        |
| -------- | ----------------------------------------------------------- |
| Frontend | React, Vite, react-markdown, rehype-highlight, lucide-react |
| Backend  | Node.js, Express, Groq SDK                                  |
| LLM      | Groq API (`openai/gpt-oss-120b`, configurable)              |
| Search   | Tavily API (web), BM25 (documents)                          |
| Hosting  | Vercel (frontend), Render (backend)                         |

## Project Structure

```
backend/
  server.js        Streaming chat endpoint and agent loop
  tools.js         Tool definitions and implementations
  rag.js           BM25 indexing and search
  knowledge/       Your FAQ / notes (.md, .txt)
frontend/
  src/             React app (components, API client, config)
```

## Getting Started

### Prerequisites

- Node.js 18+
- Free API keys: [Groq](https://console.groq.com/keys) and [Tavily](https://tavily.com)

### 1. Backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
GROQ_API_KEY=your_groq_key
GROQ_MODEL=openai/gpt-oss-120b
PORT=5000
TAVILY_API_KEY=your_tavily_key
DEFAULT_TIMEZONE=Asia/Kolkata
```

```bash
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Using your own documents

Put `.md` or `.txt` files in `backend/knowledge/`, using `## Heading` sections, then restart the backend.

## Deployment

- **Backend (Render):** root directory `backend`, build `npm install`, start `npm start`. Set `GROQ_API_KEY`, `GROQ_MODEL`, `TAVILY_API_KEY`, and `CLIENT_ORIGIN` (your frontend URL).
- **Frontend (Vercel):** root directory `frontend`. Set `VITE_API_URL` to your Render URL.

## Author

**Shubham Raut** · [GitHub](https://github.com/SRCarlo)
