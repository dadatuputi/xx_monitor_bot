export interface CmixNode {
  name: string;
  url: string;
  location: string;
  geoBin: string;
  gpsLocation: string;
  team: string;
  network: string;
  email: string;
  twitter: string;
  discord: string;
  instagram: string;
  medium: string;
  other: string;
  forum: string;
  id: string;
  base64url: string;
  applicationId: number;
  description: string;
  uptime: number;
  roundFailureAvg: number;
  realtimeFailureAvg: number;
  precompFailureAvg: number;
  status: string;
  whois: string;
  walletAddress: string;
}

export enum StatusIcon {
  ONLINE = "🟢",
  OFFLINE = "🔴",
  ERROR = "⛔",
  UNELECTED = "⬇️",
  UNKNOWN = "❓",
}

export enum Status {
  ONLINE = "online",
  OFFLINE = "offline",
  ERROR = "error",
  UNELECTED = "unelected",
  UNKNOWN = "unknown",
}

export enum StatusCmix {
  "online" = Status.ONLINE,
  "offline" = Status.OFFLINE,
  "error" = Status.ERROR,
  "not currently a validator" = Status.UNELECTED,
  "unknown" = Status.UNKNOWN,
}