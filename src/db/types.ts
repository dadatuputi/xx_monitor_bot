import type { Document, OptionalId } from "mongodb";
import type { BN } from "@polkadot/util";

export interface RecordUpdate {
  key: string,
  old: string,
  new: string
}

export interface ClaimRecord extends OptionalId<Document> {
  user: string; // unique chat client user id
  wallet: string; // wallet address
  frequency: string; // how often to claim
  alias?: string | null; // wallet name
  user_set_alias: boolean; // true if user set the name, false otherwise
  last_claim?: Date | null; // timestamp of last claim
  last_amount?: BN | null; // last claim amount
}

export interface MonitorRecord extends OptionalId<Document> {
  user: string; // unique chat client user id
  node: string; // node_id
  bot: string; // bot_type
  name: string | null; // node_name
  user_set_name: boolean; // true if user set the name, false otherwise
  status: string; // based on status object below,
  changed: Date | null; // timestamp of last state change,
  commission?: number;
  commission_changed?: Date
}

export interface LogActionRecord extends OptionalId<Document> {
  user: string; // discord_id
  time: Date; // timestamp
  action: string; // usually the command name
  data: string; // data for action
}
