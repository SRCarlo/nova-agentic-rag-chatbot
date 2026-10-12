import { searchKnowledge } from "./rag.js";

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the internet for current or recent information: news, prices, sports, weather, releases, people, or any fact that may have changed. Use it whenever you are unsure or the answer depends on today's date.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Short, specific search query",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_documents",
      description:
        "Search the user's own uploaded notes and documents (the knowledge base). Use it when the user asks about their files, notes, company docs, or policies.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Short search query with key terms",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculator",
      description:
        "Evaluate a math expression exactly. Supports + - * / % ^ and parentheses. Use for any non-trivial arithmetic.",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "e.g. (1250 * 1.18) / 3" },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_datetime",
      description:
        "Get the current date and time, optionally for a specific IANA timezone such as Asia/Kolkata or America/New_York.",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "IANA timezone name (optional)",
          },
        },
      },
    },
  },
];

// ---------- Tool implementations ----------

function calculate(expression) {
  const expr = String(expression || "").replace(/\^/g, "**");
  if (!/^[0-9+\-*/().%\s]+$/.test(expr)) {
    return { error: "Only numbers and + - * / % ^ ( ) are allowed" };
  }
  try {
    const value = Function(`"use strict"; return (${expr})`)();
    if (typeof value !== "number" || !Number.isFinite(value))
      return { error: "Could not compute" };
    return { expression, result: value };
  } catch {
    return { error: "Invalid expression" };
  }
}

function getDatetime(timezone) {
  const tz = timezone || process.env.DEFAULT_TIMEZONE || "UTC";
  try {
    const text = new Date().toLocaleString("en-US", {
      timeZone: tz,
      dateStyle: "full",
      timeStyle: "long",
    });
    return { timezone: tz, datetime: text };
  } catch {
    return { error: `Unknown timezone: ${tz}` };
  }
}

async function webSearch(query) {
  if (!process.env.TAVILY_API_KEY) {
    return {
      error:
        "Web search is not configured. Tell the user to add TAVILY_API_KEY to backend/.env.",
    };
  }
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({ query, max_results: 5, search_depth: "basic" }),
    });
    if (!res.ok) return { error: `Search failed (status ${res.status})` };
    const data = await res.json();
    return {
      results: (data.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        content: String(r.content || "").slice(0, 600),
      })),
    };
  } catch {
    return { error: "Search request failed" };
  }
}

export async function runTool(name, args) {
  if (name === "web_search") return webSearch(String(args.query || ""));

  if (name === "search_documents") {
    const results = searchKnowledge(String(args.query || ""), 3);
    return results.length
      ? { results }
      : {
          results: [],
          note: "Nothing relevant found in the user's documents.",
        };
  }

  if (name === "calculator") return calculate(args.expression);
  if (name === "get_datetime") return getDatetime(args.timezone);

  return { error: `Unknown tool: ${name}` };
}
