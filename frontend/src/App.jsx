/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef } from "react";
import {
  Menu,
  ArrowUp,
  ArrowDown,
  Square,
  Sparkles,
  RefreshCw,
  Mic,
  MicOff,
  Sun,
  Moon,
  Download,
  Newspaper,
  Code,
  Calculator,
  Lightbulb,
} from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import Message from "./components/Message.jsx";
import Footer from "./components/Footer.jsx";
import { streamChat, getHealth } from "./api.js";
import { APP } from "./config.js";

const SUGGESTIONS = [
  {
    icon: Newspaper,
    title: "Latest news",
    text: "What are the top tech news stories today?",
  },
  {
    icon: Code,
    title: "Write code",
    text: "Write a Python function to check if a string is a palindrome",
  },
  {
    icon: Calculator,
    title: "Do the math",
    text: "What is 18% GST on Rs 12,499, and the final total?",
  },
  {
    icon: Lightbulb,
    title: "Explain simply",
    text: "Explain how neural networks work like I'm 15",
  },
];

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const makeTitle = (t) => (t.length > 36 ? t.slice(0, 36) + "…" : t);

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil?";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

// Clean up any half-finished messages from a previous session
function loadChats() {
  return load("chats", []).map((c) => ({
    ...c,
    messages: c.messages
      .filter((m) => m.content)
      .map((m) => ({ ...m, streaming: false })),
  }));
}

export default function App() {
  const [chats, setChats] = useState(loadChats);
  const [activeId, setActiveId] = useState(() => load("activeId", null));
  const [theme, setTheme] = useState(() => load("theme", "dark"));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [listening, setListening] = useState(false);
  const [showDown, setShowDown] = useState(false);
  const [health, setHealth] = useState({ status: "connecting", model: "" });

  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const stickRef = useRef(true);
  const textareaRef = useRef(null);
  const recRef = useRef(null);
  const toastTimer = useRef(null);

  const activeChat = chats.find((c) => c.id === activeId) || null;
  const messages = activeChat?.messages || [];

  // Persist
  useEffect(() => {
    localStorage.setItem("chats", JSON.stringify(chats));
  }, [chats]);
  useEffect(() => {
    localStorage.setItem("activeId", JSON.stringify(activeId));
  }, [activeId]);
  useEffect(() => {
    localStorage.setItem("theme", JSON.stringify(theme));
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Backend status (retries while the free server wakes up)
  useEffect(() => {
    let stopped = false;
    let timer;
    async function ping() {
      try {
        const h = await getHealth();
        if (!stopped) setHealth({ status: "online", model: h.model || "" });
      } catch {
        if (!stopped) {
          setHealth((prev) => ({ ...prev, status: "offline" }));
          timer = setTimeout(ping, 5000);
        }
      }
    }
    ping();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  // Smart auto-scroll: only follow the stream if the user is near the bottom
  useEffect(() => {
    if (stickRef.current) {
      bottomRef.current?.scrollIntoView({
        behavior: loading ? "auto" : "smooth",
      });
    }
  }, [messages, loading]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = dist < 120;
    setShowDown(dist > 300);
  }

  function scrollToBottom() {
    stickRef.current = true;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }

  function patchLast(chatId, fn) {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m, i) =>
                i === c.messages.length - 1 ? fn(m) : m,
              ),
            }
          : c,
      ),
    );
  }

  async function run(chatId, history) {
    setLoading(true);
    setError("");
    const controller = new AbortController();
    abortRef.current = controller;

    const apiMessages = history
      .filter((m) => m.content)
      .map(({ role, content }) => ({ role, content }));

    try {
      await streamChat(apiMessages, {
        signal: controller.signal,
        onToken: (t) =>
          patchLast(chatId, (m) => ({ ...m, content: m.content + t })),
        onTool: (name) =>
          patchLast(chatId, (m) => ({
            ...m,
            tools: [...new Set([...(m.tools || []), name])],
          })),
        onSources: (s) =>
          patchLast(chatId, (m) => {
            const existing = m.sources || [];
            const extra = s.filter(
              (x) =>
                !existing.some(
                  (e) => (e.url || e.title) === (x.url || x.title),
                ),
            );
            return { ...m, sources: [...existing, ...extra] };
          }),
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message || "Network error. Is the backend running?");
      }
    } finally {
      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== chatId) return c;
          const last = c.messages[c.messages.length - 1];
          if (last && last.role === "assistant") {
            if (!last.content)
              return { ...c, messages: c.messages.slice(0, -1) };
            return {
              ...c,
              messages: c.messages.map((m, i) =>
                i === c.messages.length - 1 ? { ...m, streaming: false } : m,
              ),
            };
          }
          return c;
        }),
      );
      setLoading(false);
      abortRef.current = null;
    }
  }

  async function sendMessage(text) {
    const content = text.trim();
    if (!content || loading) return;

    recRef.current?.stop();
    stickRef.current = true;

    let chatId = activeId;
    let base = messages;
    if (!activeChat) {
      chatId = uid();
      base = [];
    }

    const userMsg = { id: uid(), role: "user", content };
    const botMsg = {
      id: uid(),
      role: "assistant",
      content: "",
      tools: [],
      sources: [],
      streaming: true,
    };
    const newMessages = [...base, userMsg, botMsg];

    setChats((prev) => {
      if (!prev.some((c) => c.id === chatId)) {
        return [
          {
            id: chatId,
            title: makeTitle(content),
            messages: newMessages,
            updatedAt: Date.now(),
          },
          ...prev,
        ];
      }
      return prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              title: c.messages.length === 0 ? makeTitle(content) : c.title,
              messages: newMessages,
              updatedAt: Date.now(),
            }
          : c,
      );
    });
    setActiveId(chatId);
    setInput("");

    await run(chatId, [...base, userMsg]);
  }

  async function regenerate() {
    if (loading || !activeChat) return;
    const msgs = activeChat.messages;
    const last = msgs[msgs.length - 1];
    if (!last) return;

    const history = last.role === "assistant" ? msgs.slice(0, -1) : msgs;
    if (history.length === 0 || history[history.length - 1].role !== "user")
      return;

    stickRef.current = true;
    const botMsg = {
      id: uid(),
      role: "assistant",
      content: "",
      tools: [],
      sources: [],
      streaming: true,
    };
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id ? { ...c, messages: [...history, botMsg] } : c,
      ),
    );
    await run(activeChat.id, history);
  }

  function stop() {
    abortRef.current?.abort();
  }

  function newChat() {
    stop();
    setError("");
    setSidebarOpen(false);
    if (activeChat && activeChat.messages.length === 0) return;
    const chat = {
      id: uid(),
      title: "New chat",
      messages: [],
      updatedAt: Date.now(),
    };
    setChats((prev) => [chat, ...prev]);
    setActiveId(chat.id);
  }

  function selectChat(id) {
    stop();
    setError("");
    stickRef.current = true;
    setActiveId(id);
    setSidebarOpen(false);
  }

  function deleteChat(id) {
    if (id === activeId) {
      stop();
      setActiveId(null);
    }
    setChats((prev) => prev.filter((c) => c.id !== id));
  }

  function clearAll() {
    if (!window.confirm("Delete all chats? This cannot be undone.")) return;
    stop();
    setChats([]);
    setActiveId(null);
  }

  function exportChat() {
    if (!activeChat || messages.length === 0) return;
    const md =
      `# ${activeChat.title}\n\n` +
      messages
        .map(
          (m) => `**${m.role === "user" ? "You" : APP.name}:**\n\n${m.content}`,
        )
        .join("\n\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeChat.title.replace(/[^\w]+/g, "-").slice(0, 40) || "chat"}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Chat exported as Markdown");
  }

  function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      showToast(
        "Voice input isn't supported in this browser. Try Chrome or Edge.",
      );
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    const base = input ? input.trimEnd() + " " : "";

    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++)
        text += e.results[i][0].transcript;
      setInput(base + text);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed")
        showToast("Microphone permission was denied.");
      setListening(false);
    };
    rec.onend = () => setListening(false);

    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const statusText =
    health.status === "online"
      ? health.model.replace(/^openai\//, "") || "Online"
      : health.status === "connecting"
        ? "Connecting…"
        : "Offline";

  return (
    <div className="layout">
      <Sidebar
        chats={chats}
        activeId={activeId}
        onSelect={selectChat}
        onNew={newChat}
        onDelete={deleteChat}
        onClearAll={clearAll}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main">
        <header className="topbar">
          <button
            className="icon-btn menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu size={20} />
          </button>

          <div className="topbar-title">
            {APP.name} <span>{APP.tagline}</span>
          </div>

          <div className="topbar-right">
            <div className={`status ${health.status}`} title="Backend status">
              <i /> {statusText}
            </div>
            <button
              className="icon-btn"
              onClick={exportChat}
              disabled={messages.length === 0}
              title="Export chat"
            >
              <Download size={18} />
            </button>
            <button
              className="icon-btn"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <div className="scroll" ref={scrollRef} onScroll={onScroll}>
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-logo">
                <Sparkles size={30} />
              </div>
              <h2>{greeting()} 👋</h2>
              <h3>How can I help you today?</h3>
              <p>Web search · Calculator · Code · Your documents · Voice</p>
              <div className="suggest-grid">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.title}
                    className="suggest-card"
                    onClick={() => sendMessage(s.text)}
                  >
                    <s.icon size={18} className="suggest-icon" />
                    <strong>{s.title}</strong>
                    <span>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="thread">
              {messages.map((m, i) => (
                <Message
                  key={m.id}
                  message={m}
                  isLast={i === messages.length - 1}
                  loading={loading}
                  onRegenerate={regenerate}
                />
              ))}
            </div>
          )}

          {error && (
            <div className="error">
              <span>{error}</span>
              {messages.length > 0 && (
                <button onClick={regenerate}>
                  <RefreshCw size={13} /> Retry
                </button>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {showDown && (
          <button
            className="scroll-down"
            onClick={scrollToBottom}
            title="Scroll to bottom"
          >
            <ArrowDown size={16} />
          </button>
        )}

        {toast && <div className="toast">{toast}</div>}

        <div className="composer-wrap">
          <div className={`composer ${listening ? "listening" : ""}`}>
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={listening ? "Listening…" : `Message ${APP.name}...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              className={`mic ${listening ? "on" : ""}`}
              onClick={toggleMic}
              title={listening ? "Stop listening" : "Voice input"}
            >
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            {loading ? (
              <button
                className="send stop"
                onClick={stop}
                title="Stop generating"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                className="send"
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                title="Send"
              >
                <ArrowUp size={18} />
              </button>
            )}
          </div>
          <p className="disclaimer">
            {APP.name} can make mistakes. Please verify important information.
          </p>
          <Footer />
        </div>
      </main>
    </div>
  );
}
