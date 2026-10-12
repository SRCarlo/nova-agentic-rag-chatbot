import { Heart } from "lucide-react";
import { AUTHOR } from "../config.js";

export default function Footer() {
  return (
    <footer className="footer">
      <span>
        Created with <Heart size={12} className="heart" fill="currentColor" />{" "}
        by <strong>{AUTHOR.name}</strong>
      </span>
      <span className="dot">•</span>
      <span>React · Node.js · Groq</span>
      <span className="dot">•</span>
      <a href={AUTHOR.github} target="_blank" rel="noreferrer">
        GitHub
      </a>
      <a href={AUTHOR.linkedin} target="_blank" rel="noreferrer">
        LinkedIn
      </a>
      <span className="dot">•</span>
      <span>© {AUTHOR.year}</span>
    </footer>
  );
}
