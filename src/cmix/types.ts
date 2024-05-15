export type CmixID = string

export interface CmixNode {
  name: string;
  location: string;
  geoBin: string;
  id: CmixID;
  base64url: string;
  uptime: number;
  realtimeFailureAvg: number;
  precompFailureAvg: number;
  status: string;
  walletAddress?: string;
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