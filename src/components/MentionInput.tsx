import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Suggestion = { username: string; avatar_url: string | null };

/**
 * Detects an active "@token" before the cursor and returns it plus its start
 * index, or null when the user is not currently typing a mention.
 */
function getActiveMention(value: string, cursor: number): { token: string; start: number } | null {
  const left = value.slice(0, cursor);
  const match = left.match(/(?:^|\s)@([a-zA-Z0-9_]{0,30})$/);
  if (!match) return null;
  const token = match[1];
  const start = cursor - token.length - 1; // include "@"
  return { token, start };
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  multiline?: boolean;
  className?: string;
  inputClassName?: string;
};

export function MentionInput({
  value,
  onChange,
  placeholder,
  disabled,
  maxLength,
  multiline,
  className,
  inputClassName,
}: Props) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState<{ token: string; start: number } | null>(null);

  useEffect(() => {
    if (!active) { setSuggestions([]); return; }
    let cancelled = false;
    const run = async () => {
      const q = active.token;
      const builder = supabase.from("profiles").select("username, avatar_url").limit(5);
      const { data } = q
        ? await builder.ilike("username", `${q}%`)
        : await builder.order("username");
      if (!cancelled) setSuggestions((data as any) ?? []);
    };
    run();
    return () => { cancelled = true; };
  }, [active?.token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);
    const cursor = e.target.selectionStart ?? next.length;
    setActive(getActiveMention(next, cursor));
  };

  const insert = (username: string) => {
    if (!active) return;
    const before = value.slice(0, active.start);
    const after = value.slice((ref.current?.selectionStart ?? value.length));
    const inserted = `@${username} `;
    const next = before + inserted + after;
    onChange(next);
    setActive(null);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const pos = (before + inserted).length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const sharedProps = {
    value,
    onChange: handleChange,
    onBlur: () => setTimeout(() => setActive(null), 150),
    placeholder,
    disabled,
    maxLength,
    className: inputClassName,
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      {multiline ? (
        <textarea ref={ref as any} rows={3} {...sharedProps} />
      ) : (
        <input ref={ref as any} {...sharedProps} />
      )}
      {active && suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-64 max-w-[90vw] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
          {suggestions.map((s) => (
            <button
              key={s.username}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insert(s.username); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
            >
              <div className="h-7 w-7 overflow-hidden rounded-full bg-muted">
                {s.avatar_url ? (
                  <img src={s.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-brand text-xs font-bold text-primary-foreground">
                    {s.username[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <span className="text-sm">@{s.username}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
