// built this file with inspiration from https://github.com/w3f/polkadot-k8s-payouts/blob/master/src/actions/start.ts

import "@xxnetwork/types";
import { BN } from "@polkadot/util";
import { CronJob } from "cron";
import { codeBlock, spoiler } from "discord.js";
import { Icons, prettify_address_alias, xx_price as get_xx_price, pluralize, engulph_fetch_claimers, EXTERNAL, wait } from "../utils.js";
import { Chain, testChain } from "./index.js";
import { ClaimFrequency } from "./types.js";
import { NotifyData, XXEvent } from "../events/types.js";
import chalk from 'chalk';
import cronstrue from 'cronstrue';
import PubSub from 'pubsub-js';

import type { Database } from "../db/index.js";
import type { ChalkInstance } from 'chalk';
import type { SubmittableExtrinsic } from "@polkadot/api/types/submittable.js";
import type { ISubmittableResult } from "@polkadot/types/types/extrinsic.js";
import type { KeyringPair$Json } from "@polkadot/keyring/types";
import type {
  Staker,
  StakerRewards,
  StakerRewardsAvailable,
  EraClaim,
  StakerNotify,
  ClaimConfig,
  ExternalStakerConfig,
} from "./types.js";

// env guard
import '../env-guard/claim.js'

export async function startAllClaiming(
  db: Database,
  chain_rpc: string,
) {

  ClaimFrequency.DAILY.cron = process.env.CLAIM_CRON_DAILY!;
  const cfg_daily: ClaimConfig = {
    frequency: ClaimFrequency.DAILY,
    batch: +process.env.CLAIM_BATCH!,
    wallet: Chain.init_key(JSON.parse(process.env.CLAIM_WALLET!) as KeyringPair$Json, process.env.CLAIM_PASSWORD!),
  }
  ClaimFrequency.WEEKLY.cron = process.env.CLAIM_CRON_WEEKLY!;
  const cfg_weekly: ClaimConfig = {
    frequency: ClaimFrequency.WEEKLY,
    batch: +process.env.CLAIM_BATCH!,
    wallet: Chain.init_key(JSON.parse(process.env.CLAIM_WALLET!) as KeyringPair$Json, process.env.CLAIM_PASSWORD!),
  }

  // start discord claim cron
  startClaiming(db, chain_rpc, cfg_daily);

  if (process.env.CLAIM_CRON_WEEKLY) {
    // start irregular claim cron if set
    startClaiming(db, chain_rpc, cfg_weekly);

    // start external staker claim cron
    const external_stakers: ExternalStakerConfig = {
      fn: engulph_fetch_claimers,
      identifier: EXTERNAL,
      args: {endpoint: process.env.CLAIM_ENDPOINT, key: process.env.CLAIM_ENDPOINT_KEY}
    }
    startClaiming(db, chain_rpc, cfg_weekly, external_stakers);
  }
}

export async function startClaiming(
  db: Database,
  chain_rpc: string,
  claim_cfg: ClaimConfig,
  external?: ExternalStakerConfig,
): Promise<void> {  
  const job = new CronJob(
    claim_cfg.frequency.cron,
    async function () {
      const chain = await Chain.create(chain_rpc)
      const claim = await Claim.create(db, chain, claim_cfg, external)
      claim.log(`*** Starting ${external ? Icons.EXTERNAL:Icons.BOT} ${claim_cfg.frequency} claim cron ***`);
      await claim.submit();
      await chain.api.disconnect();
      claim.log(`*** Completed ${external ? Icons.EXTERNAL:Icons.BOT} ${claim_cfg.frequency} claim cron; next run: ${job.nextDate().toRFC2822()} ***`);
    },
    null,
    true,
    'UTC'
  );

  console.log(`*** Claim Cron Started: ${external ? Icons.EXTERNAL:Icons.BOT} ${claim_cfg.frequency} ${cronstrue.toString(claim_cfg.frequency.cron)}; next run: ${job.nextDate().toRFC2822()} ***`);
}

export class Claim {
  private stakers: StakerRewardsAvailable[] = []
  private price: number | undefined;
  private era_claims: EraClaim[] = [];
  private is_prepared: boolean = false;
  private _log_color: ChalkInstance;
  private _prefix: string;
  private static _log_color_gen = Claim.log_color_gen()

  constructor(
    private readonly db: Database, 
    private readonly chain: Chain, 
    private readonly cfg: ClaimConfig,
    private readonly external?: ExternalStakerConfig) {
      this._log_color = Claim._log_color_gen.next().value
      this._prefix = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase()
  }

  private static *log_color_gen(): Generator<ChalkInstance, any, ChalkInstance> {
    const colors = [chalk.red, chalk.green, chalk.blue]
    let idx = 0;
    while (true){
      yield colors[idx++%colors.length]
    }
  }

  public log(...msg: string[]){
    console.log(this._log_color(this._prefix, "\t", msg));
    PubSub.publish(XXEvent.LOG_ADMIN, msg)
  }

  public static async create(db: Database, chain: Chain, cfg: ClaimConfig, external?: ExternalStakerConfig) {
    const me = new Claim(db, chain, cfg, external);
    return me;
  }

  public async prepare(){
    // populate stakers
    const stakers: Array<Staker> = [];
    if (this.external) {
      const external_stakers = await this.external.fn(this.external.identifier, this.external.args);
      stakers.push(...external_stakers); // if a ExternalStakerConfig object is provided, grab stakers from that endpoint
      this.log(`Pulled ${external_stakers.length} stakers from external`)
    } else {
      stakers.push(...await this.db.getClaimers(this.cfg.frequency)); // get stakers from mongodb
      this.log(`Pulled ${stakers.length} stakers from db`)
    }
    
    try{
      this.price = await get_xx_price();
      this.log(`Current token price: ${this.price}`)
    } catch(e) {
      this.log(`Error getting xx token price: ${e}`)
    }

    // query the chain to populate stakers with available rewards
    // STEP 1
    this.log(`*** Claim Step 1: Querying the chain for rewards for ${pluralize(new Set(stakers.map((value)=>value.user_id)), 'claimer')} / ${pluralize(stakers, 'wallet')} ***`)
    this.stakers = await this.get_available_rewards(stakers);

    // prepare a list of claims to submit with unique era/address combinations
    // STEP 2
    this.log('*** Claim Step 2: Preparing claims from stakers list ***')
    // Build EraClaim[] from StakerRewardsAvailable[]
    this.era_claims = this.build_era_claims(this.stakers);
    this.is_prepared = true; // set prepared flag
    this.log(`\tPreparation of ${this.era_claims.length} claims completed`)
  }

  public async submit() {
    // check claim is prepped and ready to go
    if (!this.is_prepared) await this.prepare();

    // submit payout transactions
    // STEP 3
    this.log(`*** Claim Step 3: Submitting ${this.era_claims.length} claims ***`)
    const [claims_fulfilled, claims_failed] = await this.submit_claim(this.era_claims);

    // notify stakers
    // STEP 4
    this.log("*** Claim Step 4: Notifying stakers of completed claims ***")
    if (this.external){
      this.log("\tExternal stakers, skipping")
    } else {
      await this.notify_stakers(claims_fulfilled, claims_failed)
      this.log(`\tNotified ${new Set(claims_fulfilled.flatMap( (claim) => claim.notify.map( (staker) => staker.user_id))).size} users of a payout`)
      this.log(`\t${new Set(claims_failed.flatMap( (claim) => claim.notify.map( (staker) => staker.user_id))).size} users had failed payouts`)
    }
    // disconnect
    this.log(`Disconnecting from ${this.chain.endpoint}`)
    this.chain.api.disconnect();
  }

  private async get_available_rewards(stakers: Staker[]): Promise<StakerRewardsAvailable[]> {
    // Populate a list of StakerPayout objects with the eras with rewards available

    try {
      // get all available rewards for all claimer wallets
      const claimer_wallet_addresses: string[] = stakers.map((value) => value.wallet);
      const available_eras = await this.chain.api.derive.staking.erasHistoric();
      // stakerRewardsMultiEras builds an array (one for each claimer_wallet_address) of arrays (one for each era) of DeriveStakerReward
      // from https://github.com/polkadot-js/apps/blob/85c3af2055ff55a26fb77f8dd4de6d584055c579/packages/react-hooks/src/useOwnEraRewards.ts#L104
      const available_rewards = await this.chain.api.derive.staking.stakerRewardsMultiEras(claimer_wallet_addresses, available_eras);

      // plug staker rewards into staker payout items - assumes that stakerRewardsMultiEras rpc returns an array of same length & indexing as stakers 
      const claimer_rewards = stakers.map<StakerRewards>( (staker_payout, index) => ({
        ...staker_payout,
        rewards: available_rewards[index]
      }));
  
      // populate stakers with amount available to claim
      const claimer_rewards_available = claimer_rewards.map<StakerRewardsAvailable>( (staker_rewards) => ({
        ...staker_rewards,
        available: staker_rewards.rewards!.reduce( (acc, current) => acc.iadd(Object.values(current.validators).reduce( (acc, current) => acc.iadd(current.value), new BN(0))), new BN(0))
      }));

  
      // log summary of what rewards are available
      const rewarded_claimers = available_rewards.filter( (value) => value.length)
      const stash_total: BN = claimer_rewards_available.reduce<BN>( (result, { available }) => result.iadd(available!), new BN(0));
      this.log(`\tGathered rewards for ${rewarded_claimers.length} of the supplied ${pluralize(stakers, 'wallet')}`);
      this.log(`\tTotal to claim: ${this.chain.xx_bal_usd_string(stash_total, this.price)})`);

      // table
      // validator | eras | users
      const rows = new Array();
      const validators = new Set(available_rewards.map( (value) => value.map( (value) => Object.keys(value.validators))).flat(2));
      for(const validator of validators){
        rows.push({
          validator,
          eras: Array.from(new Set(available_rewards.map( (value) => value.filter( (value) => Object.keys(value.validators).includes(validator)).map( (value) => value.era.toNumber())).flat())).sort().toString(),
          users: Array.from(new Set(claimer_rewards_available.map( (staker_payout) => staker_payout.rewards!.filter( (value) => Object.keys(value.validators).includes(validator)).map( (_) => staker_payout.user_id)).flat())).sort().toString(),
      })}
      console.table(rows)

  
      return claimer_rewards_available;
    } catch (e:unknown) {
      if (e instanceof Error) this.log(e.message);
      else if (typeof e === 'string') this.log(e);
      throw new Error("Failed getting staking rewards");
    }
  }

  private async submit_claim(era_claims: EraClaim[]): Promise<[EraClaim[], EraClaim[]]> {
    const claims_fulfilled = new Array<EraClaim>() as EraClaim[];
    const claims_failed = new Array<EraClaim>() as EraClaim[];

    while (era_claims.length > 0) {
      const payoutCalls: Array<SubmittableExtrinsic<"promise", ISubmittableResult>> = [];
      const claims_batch = era_claims.splice(0, this.cfg.batch); //end not included
  
      claims_batch.forEach(({ validator, era, notify: stakers }) => {
        this.log(`Adding era ${era} claim for ${validator} (stakers: ${Array.from(new Set(stakers.map( (staker) => staker.user_id))).join(", ")})`);
        payoutCalls.push(this.chain.api.tx.staking.payoutStakers(validator, era));
      });
  
      try {
        if (payoutCalls.length > 0) {
          this.log(`Batching ${payoutCalls.length} payouts:`);
          const transactions = this.chain.api.tx.utility.batchAll(payoutCalls);
          const { partialFee, weight } = await transactions.paymentInfo(this.cfg.wallet);
          this.log(`transaction will have a weight of ${weight}, with ${partialFee.toHuman()} weight fees`);
          
          if (!this.cfg.dry_run) {
            this.log(`Submitting ${transactions.length} in batch`)
            const unsub = await transactions.signAndSend(this.cfg.wallet, { nonce: -1 }, ({ events = [], status }) =>
            {
                this.log(`Current status is ${status.type}`);
                if (status.isInBlock) {
                    this.log(`Transaction included at blockHash ${status.asInBlock.toHex()}`);
                    events.forEach(({ event: { data, method, section }, phase }) => {
                      this.log('\t', phase.toString(), `: ${section}.${method}`, data.toString());
                    });
                } else if (status.isFinalized) {
                    this.log(`Transaction finalized at blockHash ${status.asFinalized.toHex()}`);
                    unsub();
                }
            });
          } else {
            this.log("Dry run; transactions not submitted");
          } 
  
          // add the tx fee to fulfilled claims
          claims_fulfilled.push(...claims_batch.map<EraClaim>( (claim) => ({
            ...claim, 
            fee: partialFee.div(new BN(payoutCalls.length))})));

        }
      } catch (e) {
        this.log(`Could not perform one of the claims: ${e}`);
        claims_failed.push(...claims_batch);
      }
    }
    this.log(
      `\tClaimed ${claims_fulfilled.length} payouts, ${claims_failed.length} failed.`
    );
  
    return [claims_fulfilled, claims_failed];
  }

  private async notify_stakers(claims_fulfilled: EraClaim[], claims_failed: EraClaim[]): Promise<void> {
    
    function eraclaim_to_stakernotify(claims: EraClaim[]): Map<string, Map<string, StakerNotify[]>> {
      // convert EraClaim[] to Map<id: string, Map<wallet: string, StakerNotify[]>>
      const claims_notify = new Map<string, Map<string, StakerNotify[]>>()
      claims.map( ({era, validator, notify, fee}) => {
        notify.map( ({user_id, wallet, alias, rewards, available}) => {
          claims_notify.has(user_id) || claims_notify.set(user_id, new Map<string, StakerNotify[]>())
          claims_notify.get(user_id)!.has(wallet) || claims_notify.get(user_id)!.set(wallet, [])
          const reward = rewards.find( (reward) => reward.era.toNumber() === era)!
          const staker_notify: StakerNotify = {
            user_id: user_id,
            wallet: wallet,
            alias: alias,
            era: era,
            payout: Object.values(reward.validators).reduce( (acc, val) => acc.iadd(val.value), new BN(0)),
            isValidator: reward.isValidator,
            validators: Object.keys(reward.validators),
            fee: fee?.divn(notify.length) // this further divids the fee by the number of claimers
          }
          claims_notify.get(user_id)!.get(wallet)?.push(staker_notify)
        })
      })
      return claims_notify;
    }

    const claims_fulfilled_notify = eraclaim_to_stakernotify(claims_fulfilled)
    const claims_failed_notify = eraclaim_to_stakernotify(claims_failed)
    const claim_wallet_bal = await this.chain.wallet_balance(this.cfg.wallet);


    for(const [user_id, stakernotify_by_wallet] of claims_fulfilled_notify) {
      // Send a notification to the user
      const data: NotifyData = {
        id: user_id,
        msg: await this.notify_user_message(stakernotify_by_wallet, claim_wallet_bal, true),
      }
      PubSub.publish(XXEvent.CLAIM_EXECUTED, data)
    }
  
    for(const [user_id, stakernotify_by_wallet] of claims_failed_notify) {
      // Send a notification to the user
      const data: NotifyData = {
        id: user_id,
        msg: await this.notify_user_message(stakernotify_by_wallet, claim_wallet_bal, false)
      }
      PubSub.publish(XXEvent.CLAIM_FAILED, data)
    }
  }

  private async notify_user_message(claims: Map<string, StakerNotify[]>, claim_wallet_bal: BN, success: boolean = true) : Promise<string[]> {
    const retrows = new Array<string>();
  
    // header is always the same
    const eras = Array.from(new Set([ ...claims.values() ].flat().map( (claim_notify) => claim_notify.era))).sort()
    const wallets = Array.from(claims.keys())
    const _total: BN = [ ...claims.values() ].flat().reduce( (acc, val) => val.payout.add(acc), new BN(0));
    const _total_string = `${this.chain.xx_bal_usd_string(_total, this.price)}`;
    retrows.push(`${success ? `${this.cfg.frequency.symbol} claim results: ${_total_string}` : 'failed '}: ${pluralize(eras, 'era')} | ${pluralize(wallets, 'wallet')}`);
  
    // msg format
    // Claimed rewards xx/$ for x eras / x wallets (tx xx/$)
    //     alias / xxxxxx:
    //         Era xxx: xx/$ as validator|nominator of xxxxx
    const codeblock = new Array<string>();
    claims.forEach( (stakers_notify, wallet) => {
      // build the top wallet string: alias / xxxxxx:
      const alias: string | undefined | null = stakers_notify.find( (claim_notify) => Boolean(claim_notify.alias) )?.alias;
      codeblock.push(`${Icons.WALLET} ${prettify_address_alias(alias, wallet, false, 30)}:`);
      
      stakers_notify.forEach( (staker_notify) => {
        // build the era line: Era xxx: xx
        const _nominator_string = staker_notify.isValidator ? "" : `${Icons.NOMINATOR}⭆${Icons.VALIDATOR} ${staker_notify.validators.map( (validator) => prettify_address_alias(null, validator, false, 9)).join(", ")}`;
        const _val_nom_info = `as ${staker_notify.isValidator ? Icons.VALIDATOR : _nominator_string}`
        codeblock.push(`  Era ${staker_notify.era}: ${this.chain.xx_bal_usd_string(staker_notify.payout, this.price)} ${_val_nom_info}`);
      });
    });

    const _total_fee: BN = [ ...claims.values() ].flat().reduce( (acc, val) => acc.add(val.fee ?? new BN(0)), new BN(0));
    codeblock.push("");
    codeblock.push(`  Fee: ${this.chain.xx_bal_string(_total_fee)} of ${this.chain.xx_bal_string(claim_wallet_bal)} in ${Icons.BOT} wallet`)
    if (claim_wallet_bal.lt(new BN(10000*(10**this.chain.decimals)))) codeblock.push(`  To support this bot, type /donate`) // print donate pitch if wallet is < 10000 xx
    codeblock.push("");
  
    codeblock.push(ClaimLegend);

    retrows.push(spoiler(codeBlock(codeblock.join('\n'))))
    return retrows;
  }

  private build_era_claims(stakers: StakerRewardsAvailable[]): EraClaim[] {
    // fugly approach but easiest to manage complexity for now

    //                             era         validator
    const era_claims_map = new Map<number, Map<string, StakerRewardsAvailable[]>>();
    stakers.forEach( (staker) => {
      staker.rewards.forEach( (reward) => {
        const e = reward.era.toNumber();
        const validator = Object.keys(reward.validators)[0]; // not sure if there are ever multiple validators

        // Create new map for the current era/address/id if it doesn't exist
        era_claims_map.has(e) || era_claims_map.set(e, new Map<string, StakerRewardsAvailable[]>());
        era_claims_map.get(e)!.has(validator) || era_claims_map.get(e)!.set(validator, []);
        era_claims_map.get(e)!.get(validator)!.push(staker);
      });
    });

    // era_claims_map: era/validator/user_id/wallet:StakerNotify
    const era_claims: EraClaim[] = [];
    era_claims_map.forEach((validators, era) => {
      validators.forEach((stakers, validator) => {
        era_claims.push({
          era,
          validator,
          notify: stakers,
        });
      });
    });

    return era_claims;
  }
}

export const ClaimLegend: string = `Key: ${Icons.WALLET}=wallet, ${Icons.NOMINATOR}=nominator, ${Icons.VALIDATOR}=validator`;