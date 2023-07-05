import { Icons } from "../utils.js";
import type { DeriveStakerReward } from "@polkadot/api-derive/types";

import type { BN } from "@polkadot/util";
import type { KeyringPair } from "@polkadot/keyring/types";
import type { Database } from "../db/index.js";
import type { Client } from "discord.js";
import type { Chain } from "./index.js";

export enum ClaimFrequency {
  DAILY = "daily",
  WEEKLY = "weekly",
  NOW = "now"
}

export interface ExternalStaker {
  // records from external staker source
  wallet: string;
  ip: string;
}

export interface Staker {
  // used to manage user-staker claim subscriptions
  user_id: string;
  wallet: string;
  alias?: string | null;
}

export interface StakerRewards extends Staker {
  // associates available rewards for a staker
  rewards: DeriveStakerReward[];
}

export interface StakerRewardsAvailable extends StakerRewards {
  // total available tokens for staker
  available: BN;
}

export interface EraClaim {
  // Used for executing the claim
  era: number;
  validator: string;
  notify: StakerRewardsAvailable[];   // all of the claimers for this era/validator, indexed by user_id and wallet
  fee?: BN;
}

export interface StakerNotify extends Staker {
  // everything needed to notify a user of claims made on their behalf
  era: number;
  payout: BN;
  isValidator: boolean;
  validators: string[];
  fee?: BN;
}

export interface ClaimConfig {
  db: Database,
  client: Client,
  xx: Chain;
  claim_frequency: ClaimFrequency,
  batch_size: number,
  claim_wallet: KeyringPair,
  external_stakers?: ExternalStakerConfig
}

export interface ExternalStakerConfig {
  fn: Function,
  identifier: string,
  args: {[key: string]: any}
}

export const ClaimLegend: string = `Key: ${Icons.WALLET}=wallet, ${Icons.NOMINATOR}=nominator, ${Icons.VALIDATOR}=validator`;