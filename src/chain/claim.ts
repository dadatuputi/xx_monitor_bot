// built this file with inspiration from https://github.com/w3f/polkadot-k8s-payouts/blob/master/src/actions/start.ts

import "@xxnetwork/types";
import { BN } from "@polkadot/util";
import cronstrue from 'cronstrue';
import { CronJob } from "cron";
import { sendToChannel, sendToDM } from "../messager.js";
import { inlineCode } from "discord.js";
import { Icons, prettify_address_alias, xx_price as get_xx_price, pluralize } from "../utils.js";
import { Chain } from "./index.js";
import { ClaimLegend } from "./types.js";

import type { KeyringPair$Json } from "@polkadot/keyring/types";
import type { Database } from "../db/index.js";
import type { Client } from "discord.js";
import type {
  ClaimFrequency,
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
import { SubmittableExtrinsic } from "@polkadot/api/types/submittable.js";
import { ISubmittableResult } from "@polkadot/types/types/extrinsic.js";

// test that we can connect to the provided endpoint
if (! await Chain.test(process.env.CHAIN_RPC_ENDPOINT!)) throw new Error("Can't connect to chain, exiting");

export async function startClaiming(
  db: Database,
  client: Client,
  chain_rpc: string,
  claim_frequency: ClaimFrequency,
  claim_cron: string,
  claim_batch: number,
  claim_wallet: string,
  claim_pw: string,
  external_stakers?: ExternalStakerConfig,
  dry_run?: boolean
): Promise<void> {
  const job = new CronJob(
    claim_cron,
    async function () {
      const cfg: ClaimConfig = {
        db,
        client,
        xx: await Chain.create(chain_rpc),
        claim_frequency,
        batch_size: claim_batch,
        claim_wallet: Chain.init_key(JSON.parse(claim_wallet) as KeyringPair$Json, claim_pw),
        external_stakers, 
        dry_run
      }
      const claim = await Claim.create(cfg);
      await claim.prepare();
      await claim.submit();
      await cfg.xx.api.disconnect();
    },
    null,
    true,
    'UTC'
  );

  console.log(`*** Claim Cron Started: ${cronstrue.toString(claim_cron)} ***`);
  console.log(`*** Next run: ${job.nextDate().toRFC2822()} ***`);
}

export class Claim {
  private cfg: ClaimConfig;
  private stakers: StakerRewardsAvailable[] = []
  private price: number | undefined;
  private era_claims: EraClaim[] = [];
  private is_prepared: boolean = false;

  constructor(cfg: ClaimConfig) {
    this.cfg = cfg;
  }

  public static async create(cfg: ClaimConfig) {
    const me = new Claim(cfg);
    await me.prepare();
    return me;
  }

  public async prepare(){
    // populate stakers
    const stakers = await this.cfg.db.getClaimers(this.cfg.claim_frequency); // get stakers from mongodb
    if (this.cfg.external_stakers) {
      const external_stakers = await this.cfg.external_stakers.fn(this.cfg.external_stakers.identifier, this.cfg.external_stakers.args);
      stakers.push(...external_stakers); // if a ExternalStakerConfig object is provided, grab stakers from that endpoint
    }
    
    try{
      this.price = await get_xx_price();
    } catch(e) {
      console.log(`Error getting xx token price: ${e}`)
    }

    // query the chain to populate stakers with available rewards
    // STEP 1
    console.log(`*** Claim Step 1: Querying the chain for rewards for ${pluralize(new Set(stakers.map((value)=>value.user_id)), 'claimer')} / ${pluralize(stakers, 'wallet')} ***`)
    this.stakers = await this.get_available_rewards(stakers);

    // prepare a list of claims to submit with unique era/address combinations
    // STEP 2
    console.log('*** Claim Step 2: Preparing claims from stakers list ***')
    // Build EraClaim[] from StakerRewardsAvailable[]
    this.era_claims = this.build_era_claims(this.stakers);
    this.is_prepared = true; // set prepared flag
    console.log(`\tPreparation of ${this.era_claims.length} claims completed`)
  }

  public async submit() {
    // check claim is prepped and ready to go
    if (!this.is_prepared) await this.prepare();

    // submit payout transactions
    // STEP 3
    console.log(`*** Claim Step 3: Submitting ${this.era_claims.length} claims ***`)
    const [claims_fulfilled, claims_failed] = await this.submit_claim(this.era_claims);

    // notify stakers
    // STEP 4
    console.log("*** Claim Step 4: Notifying stakers of completed claims ***")
    await this.notify_stakers(claims_fulfilled, claims_failed)
    console.log(`\tNotified ${new Set(claims_fulfilled.flatMap( (claim) => claim.notify.map( (staker) => staker.user_id).filter( ( id ) => id !== this.cfg.external_stakers?.identifier))).size} users of a seriously wicked payout`)
    console.log(`\t${new Set(claims_failed.flatMap( (claim) => claim.notify.map( (staker) => staker.user_id).filter( ( id ) => id !== this.cfg.external_stakers?.identifier))).size} users had seriously borked payouts`)
    // disconnect
    console.log(`Disconnecting from ${this.cfg.xx.endpoint}`)
    this.cfg.xx.api.disconnect();
  }

  private async get_available_rewards(stakers: Staker[]): Promise<StakerRewardsAvailable[]> {
    // Populate a list of StakerPayout objects with the eras with rewards available

    try {
      // get all available rewards for all claimer wallets
      const claimer_wallet_addresses: string[] = stakers.map((value) => value.wallet);
      const available_eras = await this.cfg.xx.api.derive.staking.erasHistoric();
      // stakerRewardsMultiEras builds an array (one for each claimer_wallet_address) of arrays (one for each era) of DeriveStakerReward
      // from https://github.com/polkadot-js/apps/blob/85c3af2055ff55a26fb77f8dd4de6d584055c579/packages/react-hooks/src/useOwnEraRewards.ts#L104
      const available_rewards = await this.cfg.xx.api.derive.staking.stakerRewardsMultiEras(claimer_wallet_addresses, available_eras);

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
      console.log(`Gathered rewards for ${rewarded_claimers.length} of the supplied ${pluralize(stakers, 'claimer')}`);
      console.log(`Total to claim: ${this.cfg.xx.xx_bal_usd_string(stash_total, this.price)})`);

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
    } catch (e) {
      console.log(e);
      throw new Error("Failed getting staking rewards");
    }
  }

  private async submit_claim(era_claims: EraClaim[]): Promise<[EraClaim[], EraClaim[]]> {
    const claims_fulfilled = new Array<EraClaim>() as EraClaim[];
    const claims_failed = new Array<EraClaim>() as EraClaim[];

    while (era_claims.length > 0) {
      const payoutCalls: Array<SubmittableExtrinsic<"promise", ISubmittableResult>> = [];
      const claims_batch = era_claims.splice(0, this.cfg.batch_size); //end not included
  
      claims_batch.forEach(({ validator, era, notify: stakers }) => {
        console.log(`Adding era ${era} claim for ${validator} (stakers: ${Array.from(new Set(stakers.map( (staker) => staker.user_id))).join(", ")})`);
        payoutCalls.push(this.cfg.xx.api.tx.staking.payoutStakers(validator, era));
      });
  
      try {
        if (payoutCalls.length > 0) {
          console.log(`Batching ${payoutCalls.length} payouts:`);
          const transactions = this.cfg.xx.api.tx.utility.batchAll(payoutCalls);
          const { partialFee, weight } = await transactions.paymentInfo(this.cfg.claim_wallet);
          console.log(`transaction will have a weight of ${weight}, with ${partialFee.toHuman()} weight fees`);
          
          if (!this.cfg.dry_run) {
            console.log(`Submitting ${transactions.length} in batch`)
            const unsub = await transactions.signAndSend(this.cfg.claim_wallet, { nonce: -1 }, ({ events = [], status }) =>
            {
                console.log(`Current status is ${status.type}`);
                if (status.isInBlock) {
                    console.log(`Transaction included at blockHash ${status.asInBlock.toHex()}`);
                    events.forEach(({ event: { data, method, section }, phase }) => {
                      console.log('\t', phase.toString(), `: ${section}.${method}`, data.toString());
                    });
                } else if (status.isFinalized) {
                    console.log(`Transaction finalized at blockHash ${status.asFinalized.toHex()}`);
                    unsub();
                }
            });
          } else {
            console.log("Dry run; transactions not submitted");
          } 
  
          // add the tx fee to fulfilled claims
          claims_fulfilled.push(...claims_batch.map<EraClaim>( (claim) => ({
            ...claim, 
            fee: partialFee.div(new BN(payoutCalls.length))})));

        }
      } catch (e) {
        console.log(`Could not perform one of the claims: ${e}`);
        claims_failed.push(...claims_batch);
      }
    }
    console.log(
      `Claimed ${claims_fulfilled.length} payouts, ${claims_failed.length} failed.`
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

    for(const [user_id, stakernotify_by_wallet] of claims_fulfilled_notify) {
      // Send a notification to the user
      sendToDM(this.cfg.client, user_id, await this.notify_user_message(this.cfg, user_id, stakernotify_by_wallet, true));
    }
  
    for(const [user_id, stakernotify_by_wallet] of claims_failed_notify) {
      // Send a notification to the user
      const _msg = await this.notify_user_message(this.cfg, user_id, stakernotify_by_wallet, false)
      if (process.env.ADMIN_NOTIFY_CHANNEL){
        if (process.env.ADMIN_NOTIFY_CHANNEL.toLowerCase() === 'dm') sendToDM(this.cfg.client, user_id, _msg);
        else sendToChannel(this.cfg.client, process.env.ADMIN_NOTIFY_CHANNEL, _msg);
      }
    }
  }

  private async notify_user_message(cfg: ClaimConfig, user_id: string, claims: Map<string, StakerNotify[]>, success: boolean = true) : Promise<string[]> {
    const retrows = new Array<string>();
  
    // header is always the same
    const eras = Array.from(new Set([ ...claims.values() ].flat().map( (claim_notify) => claim_notify.era))).sort()
    const wallets = Array.from(claims.keys())
    const _total: BN = [ ...claims.values() ].flat().reduce( (acc, val) => val.payout.add(acc), new BN(0));
    const _total_string = `${this.cfg.xx.xx_bal_usd_string(_total, this.price)}`;
    retrows.push(inlineCode(`${success ? `${this.cfg.claim_frequency.value} claim results: ${_total_string}` : 'failed '}: ${pluralize(eras, 'era')} | ${pluralize(wallets, 'wallet')}:`));
  
    // msg format
    // Claimed rewards xx/$ for x eras / x wallets (tx xx/$)
    //     alias / xxxxxx:
    //         Era xxx: xx/$ as validator|nominator of xxxxx
    claims.forEach( (stakers_notify, wallet) => {
      // build the top wallet string: alias / xxxxxx:
      const alias: string | undefined | null = stakers_notify.find( (claim_notify) => Boolean(claim_notify.alias) )?.alias;
      retrows.push(inlineCode(`  ${Icons.WALLET} ${prettify_address_alias(alias, wallet, false, 40)}:`));
      
      stakers_notify.forEach( (staker_notify) => {
        // build the era line: Era xxx: xx
        const _nominator_string = staker_notify.isValidator ? "" : `${Icons.NOMINATOR} | ${Icons.VALIDATOR} ${staker_notify.validators.map( (validator) => prettify_address_alias(null, validator, false, 11)).join(", ")}`;
        const _val_nom_info = `as ${staker_notify.isValidator ? Icons.VALIDATOR : _nominator_string}`
        retrows.push(inlineCode(`    Era ${staker_notify.era}: ${this.cfg.xx.xx_bal_usd_string(staker_notify.payout, this.price)} ${_val_nom_info}`));
      });
    });

    const _total_fee: BN = [ ...claims.values() ].flat().reduce( (acc, val) => acc.add(val.fee ?? new BN(0)), new BN(0));
    const _claim_wallet_bal: BN = await cfg.xx.wallet_balance(cfg.claim_wallet);
    retrows.push(inlineCode(`Fee: ${this.cfg.xx.xx_bal_string(_total_fee)} of ${this.cfg.xx.xx_bal_string(_claim_wallet_bal)} in ${Icons.WALLET} ${cfg.claim_wallet.address}`))
    if (_claim_wallet_bal.ltn(100000000000)) retrows.push(inlineCode(`  To support this claim feature, consider a donation 👆`)) // print donate pitch if wallet is < 100 xx
  
    retrows.push(inlineCode(ClaimLegend));
  
    return retrows;
  }

  private build_era_claims(stakers: StakerRewardsAvailable[]): EraClaim[] {
    // fugly approach but easiest to manage complexity for now

    //                             era         validator
    const era_claims_map = new Map<number, Map<string, StakerRewardsAvailable[]>>();
    stakers.filter( (staker) => staker.user_id !== this.cfg.external_stakers?.identifier).forEach( (staker) => {
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
