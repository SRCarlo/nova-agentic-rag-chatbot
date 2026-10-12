import "dotenv/config";
import express from "express";
import cors from "cors";
import Groq from "groq-sdk";
import { toolDefinitions, runTool } from "./tools.js";
import { knowledgeStats } from "./rag.js";

if (!process.env.GROQ_API_KEY) {
  console.error("Missing GROQ_API_KEY in backend/.env");
  process.exit(1);
}

const app = express();
app.set("trust proxy", 1);

// CORS: allow only your frontend in production (comma-separated list in CLIENT_ORIGIN)
const allowed = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);
app.use(cors({ origin: allowed.length ? allowed : true }));
app.use(express.json({ limit: "100kb" }));

// Simple in-memory rate limit: 20 chat requests per IP per minute
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip;
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 20) {
    return res
      .status(429)
      .json({
        error: "Too many requests. Please wait a minute and try again.",
      });
  }
  recent.push(now);
  hits.set(ip, recent);
  next();
}
setInterval(() => hits.clear(), 10 * 60_000);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const MAX_HISTORY = 12;

const buildSystemPrompt =
  () => `You are "Nova", a helpful, friendly, and knowledgeable AI assistant.
Today's date is ${new Date().toDateString()}.

How to behave:
- Answer questions on any topic: explanations, writing, coding, math, brainstorming, study help, and everyday advice.
- Be clear and concise. Use Markdown: short paragraphs, bullet lists, tables, and fenced code blocks with a language name.
- Use web_search for anything current or that may have changed: news, prices, scores, weather, recent releases, "latest" or "today" questions, or facts you are unsure about. After searching, answer from the results and mention the source names.
- Use calculator for any non-trivial arithmetic instead of computing in your head.
- Use get_datetime when the user asks for the current time or date.
- Use search_documents when the user asks about their own notes, files, or documents.
- If you don't know something and can't look it up, say so honestly. Never invent facts, links, or quotes.
- If a request is unsafe or harmful, politely decline and offer a safer alternative.
- Ask a short clarifying question when a request is ambiguous.`;

function friendlyError(err) {
  if (err.status === 429)
    return "Too many requests right now. Please wait a moment and try again.";
  if (err.status === 401)
    return "Server API key is invalid. Check backend/.env.";
  if (err.status === 404 || err.status === 400)
    return "Model problem. Check GROQ_MODEL in backend/.env.";
  return "Something went wrong. Please try again.";
}

app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    model: MODEL,
    knowledgeChunks: knowledgeStats().chunks,
  }),
);

app.post("/api/chat", rateLimit, async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res
      .status(400)
      .json({ error: "messages must be a non-empty array" });
  }

  const history = messages
    .filter(
      (m) =>
        ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return res
      .status(400)
      .json({ error: "Last message must be from the user" });
  }

  // Server-Sent Events headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let aborted = false;
  res.on("close", () => {
    aborted = !res.writableEnded;
  });
  const send = (data) => {
    if (!res.writableEnded && !aborted)
      res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const convo = [
      { role: "system", content: buildSystemPrompt() },
      ...history,
    ];

    for (let step = 0; step < 5; step++) {
      if (aborted) return;

      const stream = await groq.chat.completions.create({
        model: MODEL,
        messages: convo,
        tools: toolDefinitions,
        tool_choice: "auto",
        temperature: 0.6,
        max_completion_tokens: 2048,
        stream: true,
      });

      let content = "";
      const toolCalls = [];

      for await (const chunk of stream) {
        if (aborted) {
          stream.controller?.abort();
          break;
        }
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          content += delta.content;
          send({ type: "token", text: delta.content });
        }

        // Tool call arguments arrive in pieces, so collect them
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const i = tc.index ?? 0;
            if (!toolCalls[i]) {
              toolCalls[i] = {
                id: "",
                type: "function",
                function: { name: "", arguments: "" },
              };
            }
            if (tc.id) toolCalls[i].id = tc.id;
            if (tc.function?.name)
              toolCalls[i].function.name += tc.function.name;
            if (tc.function?.arguments)
              toolCalls[i].function.arguments += tc.function.arguments;
          }
        }
      }

      if (aborted) return;

      const calls = toolCalls.filter(Boolean);

      if (calls.length === 0) {
        send({ type: "done" });
        return res.end();
      }

      convo.push({ role: "assistant", content, tool_calls: calls });

      for (const call of calls) {
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        send({ type: "tool", name: call.function.name });

        const result = await runTool(call.function.name, args);

        // Send sources to the UI
        let sources = [];
        if (
          call.function.name === "search_documents" &&
          result.results?.length
        ) {
          sources = result.results.map((r) => ({
            title: r.title,
            source: r.source,
          }));
        }
        if (call.function.name === "web_search" && result.results?.length) {
          sources = result.results.map((r) => ({ title: r.title, url: r.url }));
        }
        if (sources.length) send({ type: "sources", sources });

        convo.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    send({
      type: "token",
      text: "Sorry, I'm having trouble completing that. Please try again.",
    });
    send({ type: "done" });
    res.end();
  } catch (err) {
    console.error("Groq error:", err.status, err.message);
    send({ type: "error", message: friendlyError(err) });
    res.end();
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(
    `Backend running on http://localhost:${PORT} (model: ${MODEL}, KB chunks: ${knowledgeStats().chunks})`,
  ),
);
