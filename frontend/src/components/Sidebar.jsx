import { useState } from "react";
import { Plus, MessageSquare, Trash2, X, Search, Sparkles } from "lucide-react";
import { AUTHOR, APP } from "../config.js";

const GROUPS = ["Today", "Yesterday", "Previous 7 days", "Older"];

function groupLabel(ts) {
  const now = new Date();
  const startToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const day = 86400000;
  if (ts >= startToday) return "Today";
  if (ts >= startToday - day) return "Yesterday";
  if (ts >= startToday - 7 * day) return "Previous 7 days";
  return "Older";
}

export default function Sidebar({
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClearAll,
  open,
  onClose,
}) {
  const [query, setQuery] = useState("");

  const filtered = chats
    .filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const grouped = GROUPS.map((g) => ({
    label: g,
    items: filtered.filter((c) => groupLabel(c.updatedAt) === g),
  })).filter((g) => g.items.length > 0);

  const initials = AUTHOR.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

  return (
    <>
      {open && <div className="overlay" onClick={onClose} />}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-logo">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="brand-name">{APP.name}</div>
            <div className="brand-sub">{APP.tagline}</div>
          </div>
          <button
            className="icon-btn close-btn"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <button className="new-chat" onClick={onNew}>
          <Plus size={16} /> New chat
        </button>

        <div className="search">
          <Search size={14} />
          <input
            placeholder="Search chats"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="chat-list">
          {chats.length === 0 && (
            <p className="empty-note">No conversations yet</p>
          )}
          {chats.length > 0 && grouped.length === 0 && (
            <p className="empty-note">No matching chats</p>
          )}

          {grouped.map((g) => (
            <div key={g.label} className="chat-group">
              <div className="group-label">{g.label}</div>
              {g.items.map((c) => (
                <div
                  key={c.id}
                  className={`chat-item ${c.id === activeId ? "active" : ""}`}
                  onClick={() => onSelect(c.id)}
                >
                  <MessageSquare size={15} />
                  <span className="chat-title">{c.title}</span>
                  <button
                    className="icon-btn del-btn"
                    title="Delete chat"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(c.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>

        {chats.length > 0 && (
          <button className="clear-all" onClick={onClearAll}>
            <Trash2 size={13} /> Clear all chats
          </button>
        )}

        <div className="profile">
          <div className="profile-avatar">{initials}</div>
          <div className="profile-info">
            <div className="profile-name">{AUTHOR.name}</div>
            <div className="profile-role">{AUTHOR.role}</div>
            <div className="profile-links">
              <a href={AUTHOR.github} target="_blank" rel="noreferrer">
                GitHub
              </a>
              <a href={AUTHOR.linkedin} target="_blank" rel="noreferrer">
                LinkedIn
              </a>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
