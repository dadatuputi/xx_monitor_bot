import type { Document, OptionalId } from "mongodb";
import type { BN } from "@polkadot/util";

export enum Status {
  ONLINE = "online",
  OFFLINE = "offline",
  ERROR = "error",
  UNELECTED = "unelected",
  UNKNOWN = "unknown",
}

export enum StatusIcon {
  ONLINE = "🟢",
  OFFLINE = "🔴",
  ERROR = "⛔",
  UNELECTED = "⬇️",
  UNKNOWN = "❓",
}

export enum StatusCmix {
  "online" = Status.ONLINE,
  "offline" = Status.OFFLINE,
  "error" = Status.ERROR,
  "not currently a validator" = Status.UNELECTED,
  "unknown" = Status.UNKNOWN,
}

export interface RecordUpdate {
  key: string,
  old: string,
  new: string
}

export interface ClaimRecord extends OptionalId<Document> {
  user: string; // discord_id
  wallet: string; // wallet address
  frequency: string; // how often to claim
  alias?: string | null; // wallet name
  last_claim?: Date | null; // timestamp of last claim
  last_amount?: BN | null; // last claim amount
}

export interface MonitorRecord extends OptionalId<Document> {
  user: string; // discord_id
  node: string; // node_id
  name: string | null; // node_name
  user_set_name: boolean; // true if user set the name, false otherwise
  status: string; // based on status object below,
  changed: Date | null; // timestamp of last state change,
}

export interface LogActionRecord extends OptionalId<Document> {
  user: string; // discord_id
  time: Date; // timestamp
  action: string; // usually the command name
  data: string; // data for action
}
