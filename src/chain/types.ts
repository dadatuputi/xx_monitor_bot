import { Icons } from "../utils.js";

import type { ApiPromise } from "@polkadot/api";
import type { BN } from "@polkadot/util";
import type { Balance, EraIndex } from "@polkadot/types/interfaces";
import type { KeyringPair } from "@polkadot/keyring/types";

export type ClaimPool = Claim[];

export interface Claim {
  era: number;
  address: string;
  claimers?: Map<string, StakerPayout[]>;   // all of the claimers for this era, indexed by discord user_id
  fee?: BN;
}

export enum ClaimFrequency {
  DAILY = "daily",
  WEEKLY = "weekly",
  NOW = "now"
}

export interface ClaimNotify {
  era: number;
  address: string;
  payout: BN;
  isValidator: boolean;
  validators: ValidatorStakerReward[];
  alias?: string | null;
  fee?: BN;
}

export interface ExternalWallet {
  wallet: string;
  ip: string;
}

export interface StakerPayout {
  id: string;
  address: string;
  alias?: string | null;
  rewards?: Map<number, StakerReward>;
  available?: BN;
}

export interface StakerReward {
  isValidator: boolean;
  validators: ValidatorStakerReward[];
  available: BN;
}

export interface ValidatorStakerReward {
  address: string;
  total: Balance;
  value: Balance;
}

export interface Era {
  index: number;
  start: number;
}

export interface Config {
  api: ApiPromise;
  era: number;
  eras_historic: EraIndex[];
  batch_size: number;
  claim_key: KeyringPair;
  claim_key_bal(): Promise<BN>;
  price: number;
  xx_usd(xx: BN): string;
  xx_bal(xx: BN): string;
}

export interface Reward {
  era: BN;
  eraReward: BN;
  isEmpty: boolean;
  isValidator: boolean;
}

export const ClaimLegend: string = `Key: ${Icons.WALLET}=wallet, ${Icons.NOMINATOR}=nominator, ${Icons.VALIDATOR}=validator`;