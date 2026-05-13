import { BadgeCheck } from "lucide-react";

export function VerifiedBadge({
  verified,
  className = "",
  owner = false,
}: {
  verified?: boolean | null;
  className?: string;
  owner?: boolean;
}) {
  if (!verified) return null;
  return (
    <BadgeCheck
      className={`inline-block h-4 w-4 shrink-0 ${owner ? "fill-secondary text-background" : "fill-primary text-primary-foreground"} ${className}`}
      aria-label={owner ? "Owner verified" : "Verified"}
    />
  );
}
