/* eslint-disable no-unused-vars */
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Loader2,
  Globe,
  Volume2,
  VolumeX,
} from "lucide-react";

const TOOL_LABELS = {
  web_search: ["Searching the web", "Searched the web"],
  search_documents: ["Searching your documents", "Searched your documents"],
  calculator: ["Calculating", "Calculated"],
  get_datetime: ["Checking the time", "Checked the time"],
};

// Get plain text out of highlighted React nodes
function nodeText(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (node.props) return nodeText(node.props.children);
  return "";
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }
  return [copied, copy];
}

function CodeBlock({ children }) {
  const [copied, copy] = useCopy();
  const codeEl = Array.isArray(children) ? children[0] : children;
  const text = nodeText(codeEl?.props?.children).replace(/\n$/, "");
  const lang =
    /language-([\w-]+)/.exec(codeEl?.props?.className || "")?.[1] || "code";

  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span>{lang}</span>
        <button onClick={() => copy(text)}>
          {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const mdComponents = {
  pre: CodeBlock,
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
  table: ({ node, ...props }) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
};

export default function Message({ message, isLast, loading, onRegenerate }) {
  const [copied, copy] = useCopy();
  const [speaking, setSpeaking] = useState(false);

  function toggleSpeak() {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (synth.speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const clean = message.content
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/[*_`#>|]/g, "");
    const utter = new SpeechSynthesisUtterance(clean);
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utter);
  }

  if (message.role === "user") {
    return (
      <div className="msg-row user">
        <div className="user-bubble">{message.content}</div>
      </div>
    );
  }

  const waiting = message.streaming && !message.content;

  return (
    <div className="msg-row assistant">
      <div className="avatar">
        <Sparkles size={16} />
      </div>
      <div className="msg-body">
        {message.tools?.length > 0 && (
          <div className="tool-chips">
            {message.tools.map((t) => {
              const [active, done] = TOOL_LABELS[t] || [t, t];
              return (
                <span
                  key={t}
                  className={`chip ${message.streaming ? "running" : ""}`}
                >
                  {message.streaming ? (
                    <Loader2 size={12} className="spin" />
                  ) : (
                    <Check size={12} />
                  )}
                  {message.streaming ? active : done}
                </span>
              );
            })}
          </div>
        )}

        {waiting && !(message.tools?.length > 0) && (
          <div className="typing">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}

        {message.content && (
          <div className="markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[
                [rehypeHighlight, { detect: true, ignoreMissing: true }],
              ]}
              components={mdComponents}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {!message.streaming && message.sources?.length > 0 && (
          <div className="sources">
            <Globe size={13} />
            <span className="sources-label">Sources</span>
            {message.sources.map((s, i) =>
              s.url ? (
                <a
                  key={s.url + i}
                  className="source-chip"
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  title={s.url}
                >
                  {s.title}
                </a>
              ) : (
                <span
                  key={s.title + i}
                  className="source-chip"
                  title={s.source}
                >
                  {s.title}
                </span>
              ),
            )}
          </div>
        )}

        {!message.streaming && message.content && (
          <div className="actions">
            <button onClick={() => copy(message.content)} title="Copy">
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
            <button
              onClick={toggleSpeak}
              title={speaking ? "Stop reading" : "Read aloud"}
            >
              {speaking ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            {isLast && !loading && (
              <button onClick={onRegenerate} title="Regenerate">
                <RefreshCw size={15} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
