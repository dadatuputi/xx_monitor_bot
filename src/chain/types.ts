import type { ApiPromise } from "@polkadot/api";
import type { BN } from "@polkadot/util";
import type { Balance, EraIndex } from "@polkadot/types/interfaces";
import type { KeyringPair$Json } from "@polkadot/keyring/types";

export type ClaimPool = Claim[];

export interface Claim {
  era: number;
  address: string;
  claimers?: Map<string, StakerPayout[]>;
  fee?: BN;
}

export interface ClaimNotify {
  era: number;
  address: string;
  alias: string;
  payout: BN;
  fee?: BN;
  isValidator: boolean;
  validators: ValidatorStakerReward[];
}

export interface EngulphWallet {
  wallet: string;
  ip: string;
}

export interface StakerPayout {
  id: string;
  alias: string;
  address: string;
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
  claim_wallet: KeyringPair$Json;
  claim_pw: string;
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
