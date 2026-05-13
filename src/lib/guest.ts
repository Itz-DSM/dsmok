const GUEST_KEY = "dsmok_guest_session_started_at";
const GUEST_EMAIL_SUFFIX = "@guest.dsmok.local";
const GUEST_DURATION_MS = 30 * 60 * 1000;

export function isGuestEmail(email: string | null | undefined) {
  return !!email && email.endsWith(GUEST_EMAIL_SUFFIX);
}

export function markGuestSessionStart() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_KEY, String(Date.now()));
}

export function clearGuestSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GUEST_KEY);
}

export function getGuestSessionExpiry() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(GUEST_KEY);
  if (!raw) return null;
  const startedAt = Number(raw);
  if (!Number.isFinite(startedAt)) return null;
  return startedAt + GUEST_DURATION_MS;
}

export function getGuestTimeRemaining() {
  const expiry = getGuestSessionExpiry();
  if (!expiry) return null;
  return Math.max(0, expiry - Date.now());
}

export function formatGuestTimeRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}