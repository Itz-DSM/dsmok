import { BadgeCheck } from "lucide-react";

export function VerifiedBadge({ verified, className = "" }: { verified?: boolean | null; className?: string }) {
  if (!verified) return null;
  return (
    <BadgeCheck
      className={`inline-block h-4 w-4 shrink-0 fill-primary text-primary-foreground ${className}`}
      aria-label="Verified"
    />
  );
}
