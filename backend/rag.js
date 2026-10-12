import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR = path.join(__dirname, "knowledge");

const STOP = new Set(
  "a an the and or but if of to in on at by for with from is are was were be been am do does did have has had i me my we our you your it its this that these those what when where which who how can could should would will about as into than then so not no yes please tell want need get give".split(
    " ",
  ),
);

// Very light stemmer so "returns/returned/returning" match "return"
function stem(w) {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  let s = w;
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith("es")) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss"))
    s = s.slice(0, -1);
  if (s.length > 3 && s[s.length - 1] === s[s.length - 2]) s = s.slice(0, -1); // shipp -> ship
  return s;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

// ---------- Load and chunk documents ----------
function loadChunks() {
  if (!fs.existsSync(KB_DIR)) return [];
  const files = fs.readdirSync(KB_DIR).filter((f) => /\.(md|txt)$/i.test(f));
  const chunks = [];

  for (const file of files) {
    const raw = fs
      .readFileSync(path.join(KB_DIR, file), "utf8")
      .replace(/\r\n/g, "\n");

    if (/^## /m.test(raw)) {
      const parts = raw.split(/^## /m);
      for (let i = 0; i < parts.length; i++) {
        const lines = parts[i].split("\n");
        if (i === 0) {
          // text before the first "##" (skip pure "# Title" lines)
          const pre = lines
            .filter((l) => l.trim() && !l.startsWith("#"))
            .join("\n")
            .trim();
          if (pre) chunks.push({ source: file, title: file, text: pre });
          continue;
        }
        const title = lines[0].trim();
        const text = lines.slice(1).join("\n").trim();
        if (text) chunks.push({ source: file, title, text });
      }
    } else {
      // no headings: split into paragraphs
      raw
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((p, i) =>
          chunks.push({ source: file, title: `${file} #${i + 1}`, text: p }),
        );
    }
  }
  return chunks;
}

// ---------- Build BM25 index ----------
const chunks = loadChunks();
const docs = chunks.map((c) => {
  const tokens = [
    ...tokenize(c.title),
    ...tokenize(c.title),
    ...tokenize(c.text),
  ]; // title counts double
  const tf = new Map();
  tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
  return { ...c, tf, len: tokens.length };
});

const N = docs.length;
const avgdl = N ? docs.reduce((s, d) => s + d.len, 0) / N : 0;
const df = new Map();
docs.forEach((d) => d.tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1)));

export function knowledgeStats() {
  return { chunks: N };
}

// ---------- Search ----------
export function searchKnowledge(query, k = 3) {
  const qTokens = [...new Set(tokenize(query))];
  if (!qTokens.length || !N) return [];

  const k1 = 1.5;
  const b = 0.75;

  const scored = docs.map((d) => {
    let score = 0;
    for (const t of qTokens) {
      const f = d.tf.get(t);
      if (!f) continue;
      const n = df.get(t) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score +=
        idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avgdl)));
    }
    return {
      source: d.source,
      title: d.title,
      text: d.text,
      score: Number(score.toFixed(3)),
    };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, k);
}
