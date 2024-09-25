import type { Document, OptionalId } from "mongodb";
import type { BN } from "@polkadot/util";
import type { BotType } from "../bots/types";

export interface RecordUpdate {
  key: string,
  old: string,
  new: string
}

interface XxRecord extends OptionalId<Document> {
  user: string; // unique chat client user id
  bot: BotType; // bot type 
}

export interface ClaimRecord extends XxRecord {
  wallet: string; // wallet address
  frequency: string; // how often to claim
  alias?: string | null; // wallet name
  user_set_alias: boolean; // true if user set the name, false otherwise
  last_claim?: Date | null; // timestamp of last claim
  last_amount?: BN | null; // last claim amount
}

export interface MonitorRecord extends XxRecord {
  node: string; // node_id
  name: string | null; // node_name
  user_set_name: boolean; // true if user set the name, false otherwise
  status: string; // based on status object below,
  changed: Date | null; // timestamp of last state change,
  commission?: number;
  commission_changed?: Date
}

export interface LogActionRecord extends XxRecord {
  time: Date; // timestamp
  action: string; // usually the command name
  data: string; // data for action
}
