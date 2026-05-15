export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type SignalMessage =
  | { type: "join"; viewerId: string }
  | { type: "leave"; viewerId: string }
  | { type: "offer"; viewerId: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; viewerId: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; viewerId: string; from: "host" | "viewer"; candidate: RTCIceCandidateInit };

export const channelName = (streamId: string) => `live:${streamId}`;
