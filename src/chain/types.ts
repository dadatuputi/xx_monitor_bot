import { Icons } from "../utils.js";

import type { DeriveStakerReward } from "@polkadot/api-derive/types";
import type { BN } from "@polkadot/util";
import type { KeyringPair } from "@polkadot/keyring/types";

export class ClaimFrequency {   // from https://stackoverflow.com/a/51398471/1486966
  static readonly DAILY  = new ClaimFrequency('daily', '☀️');
  static readonly WEEKLY  = new ClaimFrequency('weekly', '');
  static readonly IMMEDIATE  = new ClaimFrequency('immediate', '');
  private _cron: string = '';

  // private to disallow creating other instances of this type
  private constructor(private readonly key: string, public readonly symbol: string) {
    this.symbol = `${key.charAt(0).toUpperCase()}${key.slice(1)}${symbol ? ` ${symbol}` : ''}`   // e.g., Daily ☀️
  }

  public set cron(cron: string) {
    this._cron = cron;
  }

  public get cron(){
    return this._cron;
  }

  toString() { return this.key; }
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
  frequency: ClaimFrequency,
  batch: number,
  wallet: KeyringPair,
  dry_run?: boolean
}

export interface ExternalStakerConfig {
  fn: Function,
  identifier: string,
  args: {[key: string]: any}
}

export const ClaimLegend: string = `Key: ${Icons.WALLET}=wallet, ${Icons.NOMINATOR}=nominator, ${Icons.VALIDATOR}=validator`;