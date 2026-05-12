import { Link } from "@tanstack/react-router";

const MENTION_RE = /(@[a-zA-Z0-9_]{1,30})/g;

export function renderWithMentions(text: string | null | undefined) {
  if (!text) return null;
  const parts = text.split(MENTION_RE);
  return parts.map((part, i) => {
    if (part.startsWith("@") && part.length > 1) {
      const username = part.slice(1);
      return (
        <Link
          key={i}
          to="/u/$username"
          params={{ username }}
          className="font-semibold text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </Link>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
