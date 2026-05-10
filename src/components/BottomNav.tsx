import { Link, useLocation } from "@tanstack/react-router";
import { Home, Search, PlusSquare, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export function BottomNav() {
  const { pathname } = useLocation();
  const { profile } = useAuth();

  const items = [
    { to: "/", icon: Home, label: "Home" },
    { to: "/search", icon: Search, label: "Search" },
    { to: "/upload", icon: PlusSquare, label: "Create", highlight: true },
    {
      to: profile ? `/u/${profile.username}` : "/auth",
      icon: User,
      label: "Profile",
    },
  ] as const;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/85 backdrop-blur-lg">
      <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-2">
        {items.map((it) => {
          const active =
            it.to === "/"
              ? pathname === "/"
              : pathname.startsWith(it.to.split("/").slice(0, 2).join("/"));
          const Icon = it.icon;
          if (it.highlight) {
            return (
              <Link key={it.label} to={it.to} className="-mt-3">
                <div className="flex h-12 w-14 items-center justify-center rounded-xl bg-gradient-brand shadow-glow">
                  <Icon className="h-6 w-6 text-primary-foreground" />
                </div>
              </Link>
            );
          }
          return (
            <Link
              key={it.label}
              to={it.to}
              className={`flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] transition-colors ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-6 w-6" />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
