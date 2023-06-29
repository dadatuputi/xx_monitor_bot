// built this file with inspiration from https://github.com/w3f/polkadot-k8s-payouts/blob/master/src/actions/start.ts

import "@xxnetwork/types";
import { BN } from "@polkadot/util";
import cronstrue from 'cronstrue';
import { CronJob } from "cron";
import { sendToChannel, sendToDM } from "../messager.js";
import { inlineCode } from "discord.js";
import { Icons, prettify_address_alias } from "../utils.js";
import { Chain } from "./index.js";
import { ClaimLegend } from "./types.js";

import type { DeriveStakerReward } from "@polkadot/api-derive/types";
import type { KeyringPair, KeyringPair$Json } from "@polkadot/keyring/types";
import type { Database } from "../db/index.js";
import type { Client } from "discord.js";
import type {
  ExternalWallet,
  StakerPayout,
  Era,
  Config,
  Claim,
  ClaimPool,
  StakerReward,
  ValidatorStakerReward,
  ClaimNotify,
  ClaimFrequency,
} from "./types.js";

const EXTERNAL = 'external';    // string used to identify wallets claimed from web

// test that we can connect to the provided endpoint
const chain_test = new Chain(process.env.CHAIN_RPC_ENDPOINT);
if (! await chain_test.canConnect()) throw new Error("Can't connect to chain, exiting");

export async function startClaiming(
  db: Database,
  client: Client,
  claim_frequency: ClaimFrequency,
  claim_cron: string,
  claim_batch: number,
  claim_wallet: string,
  claim_pw: string,
  claimer_endpoint?: string,
  claimer_key?: string
): Promise<void> {

  const job = new CronJob(
    claim_cron,
    function () {
      claim(db, client, claim_frequency, claim_batch, claim_wallet, claim_pw, claimer_endpoint, claimer_key);
    },
    null,
    true,
    'UTC'
  );

  console.log(`*** Claim Cron Started: ${cronstrue.toString(claim_cron)} ***`);
  console.log(`*** Next run: ${job.nextDate().toRFC2822()} ***`);
}

export async function claim(
  db: Database,
  client: Client,
  claim_frequency: ClaimFrequency,
  claim_batch: number,
  claim_wallet: string,
  claim_pw: string,
  claimer_endpoint?: string,
  claimer_key?: string
): Promise<void> {
  // get claimers from mongodb
  const claimers: StakerPayout[] = await db.getClaimers(claim_frequency);
  
  // if a claimer endpoint and key are set, grab claimers from that endpoint
  if (claimer_endpoint && claimer_key) claimers.push(...await fetch_claimers(claimer_endpoint, claimer_key));

  // use provider created at module import
  const chain = new Chain(process.env.CHAIN_RPC_ENDPOINT);
  const api = await chain.connect();
  const era = (await api.query.staking.activeEra()).toJSON() as unknown as Era;

  // get current price
  const params = new URLSearchParams({
    ids: "xxcoin",
    vs_currencies: "usd",
  });
  const headers = new Headers({
    accept: "application/json",
  });
  const price: number = (
    await (
      await fetch(`https://api.coingecko.com/api/v3/simple/price?${params}`, {
        headers,
      })
    ).json()
  ).xxcoin.usd;
  const usd_formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  console.log(`Current price of xx is ${price}`);

  // array of available eras - last 84
  const eras_historic = await api.derive.staking.erasHistoric();

  const cfg: Config = {
    api: api,
    era: era.index,
    eras_historic: eras_historic,
    batch_size: claim_batch,
    claim_key: Chain.init_key(JSON.parse(claim_wallet) as KeyringPair$Json, claim_pw),
    async claim_key_bal(): Promise<BN> {
      const { data:balance } = await api.query.system.account(this.claim_key.address)
      return balance.free
    },
    price: price,
    xx_usd(xx: BN): string {
      const usd: number = (xx.toNumber() * price) / 1000000000;
      return usd_formatter.format(usd);
    },
    xx_bal(xx: BN): string {
      return api.registry.createType("Balance", xx).toHuman();
    },
  };


  const claimers_with_rewards = await get_available_rewards(cfg, claimers);                         // query the chain to populate claimers with available rewards 
  const claim_pool = build_claim_pool(claimers_with_rewards);                                       // prepare a list of claims to submit with unique era/address combinations
  const [claims_fulfilled, claims_failed] = await submit_claim(cfg, cfg.claim_key, claim_pool, false);    // submit payout transactions
  console.log("Notifying stakers")
  await notify_stakers(cfg, client, claims_fulfilled, claims_failed)

  api.disconnect();

  return;
}

async function fetch_claimers(endpoint: string, key: string): Promise<Array<StakerPayout>> {
  let claimers: StakerPayout[] = new Array<StakerPayout>();

  // optionally load addresses from cloudflare kv
  if (key) {
    const response = await fetch(
      endpoint,
      {
        headers: { "X-Custom-PSK": key },
      }
    );
    const text = await response.text();
    const wallets = JSON.parse(text) as Array<ExternalWallet>;
    claimers = wallets.map(({ ip, wallet }) => ({
      id: EXTERNAL,
      alias: ip,
      address: wallet,
    }));
  }

  return claimers as Array<StakerPayout>;
}

function convert_staker_rewards(
  rewards: DeriveStakerReward[]
): Map<number, StakerReward> {
  //export type StakerReward = Map<number, Map<string, number>>;
  const stakers = new Map<number, StakerReward>();
  rewards.forEach(({ era, isValidator, validators }) => {
    const rewards: ValidatorStakerReward[] = new Array();
    let available = new BN(0);
    Object.keys(validators).forEach((validator) => {
      rewards.push({
        address: validator,
        total: validators[validator].total,
        value: validators[validator].value,
      });
    });
    stakers.set(era.toNumber(), {
      isValidator: isValidator,
      validators: rewards,
      available: Object.values(validators).reduce(
        (result, { value }) => result.iadd(value),
        new BN(0)
      ), // from https://github.com/polkadot-js/apps/blob/85c3af2055ff55a26fb77f8dd4de6d584055c579/packages/page-staking/src/Payouts/index.tsx#L89
    });
  });

  return stakers;
}

function filter_staker_rewards(
  rewards: DeriveStakerReward[][]
): DeriveStakerReward[][] {
  return rewards.map((claimer) => {
    return claimer
      .filter((reward) => {
        // filter eraReward is somehow 0
        return reward.eraReward.gt(new BN(0));
      })
      .filter(({ validators }) => {
        // filter validator value is somehow 0
        return Object.values(validators).some(({ value }) => {
          return value.gt(new BN(0));
        });
      });
  });
}

function pretty_print_claimers(cfg: Config, claimers: StakerPayout[]): void {
  // pretty print what will be claimed
  claimers.forEach((claimer) => {
    console.log(
      `claiming ${cfg.xx_bal(claimer.available!)} (${cfg.xx_usd(
        claimer.available!
      )}) for ${claimer.id} (${claimer.alias} - ${claimer.address}):`
    ); // from https://github.com/polkadot-js/api/blob/2f07e1c45fbb1f698dbfe68c7fd4701c7741f4cd/packages/types-codec/src/base/UInt.spec.ts#L185 UGH

    claimer.rewards!.forEach(({ isValidator, available, validators }, era) => {
      let _era_info = `\tera ${era}`;
      validators.forEach(({ address, value }) => {
        _era_info += ` ${value.toHuman()} from validator ${address} `;
      });
      console.log(_era_info);
    });
  });
}

async function get_available_rewards(
  cfg: Config,
  claimers: StakerPayout[]
): Promise<StakerPayout[]> {
  // Populate a list of StakerPayout objects with the eras with rewards available

  console.log(`Gathering staker rewards for ${claimers.length} claimers`);
  const claimer_ids = claimers.map((value) => value.address);
  try {
    const staker_rewards = await cfg.api.derive.staking.stakerRewardsMultiEras(
      claimer_ids,
      cfg.eras_historic
    ); // from https://github.com/polkadot-js/apps/blob/85c3af2055ff55a26fb77f8dd4de6d584055c579/packages/react-hooks/src/useOwnEraRewards.ts#L104
    // filter rewards
    const staker_rewards_filtered = filter_staker_rewards(staker_rewards);

    let rewarded_claimers: number = 0;
    let rewarded_eras: Set<number> = new Set();
    staker_rewards_filtered.forEach((reward) => {
      if (reward.length > 0) {
        rewarded_claimers++;
        reward.forEach((era) => {
          rewarded_eras.add(era.era.toNumber());
        });
      }
    });
    console.log(
      `Gathered rewards for ${rewarded_claimers} of the supplied ${claimers.length} claimers`
    );
    console.log(`Eras to claim: ${Array.from(rewarded_eras).sort()}`);

    // plug staker rewards into staker payout items - assumes that stakerRewardsMultiEras returns an array of same length & indexing as claimers
    const claimers_with_rewards: StakerPayout[] = claimers.map(
      (value, index) => ({
        ...value,
        rewards: convert_staker_rewards(staker_rewards_filtered[index]),
      })
    );

    // populate claimers with amount available to claim
    const claimers_with_available: StakerPayout[] = claimers_with_rewards.map(
      (claimer) => ({
        ...claimer,
        available: Array.from(
          claimer.rewards?.values() as Iterable<StakerReward>
        ).reduce((result, { available }) => result.iadd(available), new BN(0)),
      })
    );

    const stash_total: BN = claimers_with_available.reduce<BN>(
      (result, { available }) => result.iadd(available!),
      new BN(0)
    );
    console.log(
      `Total to claim: ${cfg.xx_bal(stash_total)} (${cfg.xx_usd(stash_total)})`
    );

    // pretty print what will be claimed
    pretty_print_claimers(cfg, claimers_with_available);

    return claimers_with_available;
  } catch (e) {
    console.log(e);
    throw new Error("Failed getting staking rewards");
  }
}

async function submit_claim(
  cfg: Config,
  keyPair: KeyringPair,
  claims: ClaimPool,
  submit: boolean = true
): Promise<[ClaimPool, ClaimPool]> {
  const claims_fulfilled = new Array<Claim>() as ClaimPool;
  const claims_failed = new Array<Claim>() as ClaimPool;
  while (claims.length > 0) {
    const payoutCalls: any = [];
    const claims_batch = claims.splice(0, cfg.batch_size); //end not included

    claims_batch.forEach(({ address, era, claimers }) => {
      console.log(`Adding era ${era} claim for ${address} (claimers: ${Array.from(claimers?.keys() as Iterable<string>).join(", ")})`);
      payoutCalls.push(cfg.api.tx.staking.payoutStakers(address, era));
    });

    try {
      if (payoutCalls.length > 0) {
        console.log(`Batching ${payoutCalls.length} payouts:`);
        const transactions = cfg.api.tx.utility.batchAll(payoutCalls);
        const { partialFee, weight } = await transactions.paymentInfo(keyPair);
        console.log(`transaction will have a weight of ${weight}, with ${partialFee.toHuman()} weight fees`);
        
        if (submit) {
          console.log(`Submitting ${transactions.length} in batch`)
          const unsub = await transactions.signAndSend(keyPair, { nonce: -1 }, ({ events = [], status }) =>
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
          console.log("Transactions not submitted due to submit flag=false")
        } 

        // add the tx fee to fulfilled claims
        claims_fulfilled.push(
          ...claims_batch.map((claim) => ({
            ...claim,
            fee: partialFee.div(new BN(payoutCalls.length)),
          }))
        );
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

function create_notify_map(claims: ClaimPool): Map<string, Map<string, ClaimNotify[]>> {
  // Create a map indexed by user id that contains a list of their claims
  const notify_map = new Map<string, Map<string, ClaimNotify[]>>();
  claims.forEach(({ era, claimers, fee }) => {
    claimers?.forEach((staker_payouts, user_id) => {
      // skip if from web
      if (user_id === EXTERNAL) return;

      // each claimer id, put an entry in our notify map
      if (!notify_map.get(user_id)) notify_map.set(user_id, new Map<string, ClaimNotify[]>());

      staker_payouts.forEach((staker_payout) => {  
        // each address, put an entry in the claimer map
        if (!notify_map.get(user_id)?.get(staker_payout.address)) notify_map.get(user_id)?.set(staker_payout.address, new Array<ClaimNotify>());
        
        notify_map.get(user_id)?.get(staker_payout.address)?.push({
          era: era,
          address: staker_payout.address,
          alias: staker_payout.alias,
          payout: staker_payout.rewards!.get(era)!.available,
          fee: fee,
          isValidator: staker_payout.rewards!.get(era)!.isValidator,
          validators: staker_payout.rewards!.get(era)!.validators,
        });
      });
    });
  });
  return notify_map;
}

async function notify_user_message(cfg: Config, claims: Map<string, ClaimNotify[]>, success: boolean = true) : Promise<string[]> {
  const retrows = new Array<string>();

  const _era_len = [ ...claims.values() ].reduce( (acc, val) => Math.max(acc, val.length), -Infinity); // gets the longest length of eras from claims
  // header is always the same
  const _total: BN = [ ...claims.values() ].flat().reduce( (acc, val) => val.payout.add(acc), new BN(0));
  const _total_string = `${cfg.xx_bal(_total)}/${cfg.xx_usd(_total)}`;
  retrows.push(`${success ? `Claimed rewards ${_total_string}` : 'Failed to claim rewards'} for ${_era_len} era${_era_len === 1 ? "" : "s"} / ${claims.size} wallet${claims.size === 1 ? "" : "s"}:`)

  // msg format
  // Claimed rewards xx/$ for x eras / x wallets (tx xx/$)
  //     alias / xxxxxx:
  //         Era xxx: xx/$ as validator|nominator of xxxxx
  claims.forEach( (value, wallet) => {
    // build the top wallet string: alias / xxxxxx:
    retrows.push(inlineCode(`${Icons.WALLET} ${prettify_address_alias(value[0].alias, wallet, false, 40)}:`));

    value.forEach( (claim) => {
      // build the era line: Era xxx: xx
      const _nominator_validators = claim.validators.map(({ address }) => address) as string[];
      const _nominator_string = claim.isValidator ? "" : `${Icons.NOMINATOR} of ${Icons.VALIDATOR} ${_nominator_validators.map( (validator) => prettify_address_alias(null, validator, false, 11)).join(", ")}`;
      const _val_nom_info = `as ${claim.isValidator ? Icons.VALIDATOR : _nominator_string}`
      retrows.push(inlineCode(`\tEra ${claim.era}: ${cfg.xx_bal(claim.payout)}/${cfg.xx_usd(claim.payout)} ${_val_nom_info}`));
    });

  })

  const _total_fee: BN = [ ...claims.values() ].flat().reduce( (acc, val) => acc.add(val.fee ?? new BN(0)), new BN(0));
  retrows.push(inlineCode(' '));
  retrows.push(inlineCode( `Claim ${Icons.WALLET}: ${cfg.claim_key.address}`));
  retrows.push(inlineCode(`\tThis claim used ${cfg.xx_bal(_total_fee)}, ${cfg.xx_bal(await cfg.claim_key_bal())} remaining`))
  retrows.push(inlineCode(`\tTo support this claim feature, consider a donation to the claim wallet above.`))

  retrows.push(inlineCode(' '));
  retrows.push(inlineCode(ClaimLegend));

  return retrows;
}

async function notify_stakers(
  cfg: Config,
  client: Client,
  claims_fulfilled: ClaimPool,
  claims_failed: ClaimPool
): Promise<void> {
  const notify_success : Map<string, Map<string, ClaimNotify[]>> = create_notify_map(claims_fulfilled);
  const notify_failed : Map<string, Map<string, ClaimNotify[]>> = create_notify_map(claims_failed);

  for(const [id, claims] of notify_success){
    // Send a notification to the user
    // skip if from external
    if (id === EXTERNAL) return;
    sendToDM(client, id, await notify_user_message(cfg, claims, true));
  }

  for(const [id, claims] of notify_failed){
    // Send a notification to the user
    // skip if from external
    if (id === EXTERNAL) return;
    if (process.env.ADMIN_NOTIFY_CHANNEL){
      if (process.env.ADMIN_NOTIFY_CHANNEL.toLowerCase() === 'dm') sendToDM(client, id, await notify_user_message(cfg, claims, true));
      else sendToChannel(client, process.env.ADMIN_NOTIFY_CHANNEL, await notify_user_message(cfg, claims, false));
    }
  }
}

function build_claim_pool(claimers: StakerPayout[]): Claim[] {
  // build a claim pool with unique era/addresses

  const claim_pool_map = new Map<
    number,
    Map<string, Map<string, StakerPayout[]>>
  >();
  claimers.forEach((claimer) => {
    claimer.rewards?.forEach((staker_reward, era) => {
      if (!claim_pool_map.has(era))
        claim_pool_map.set(era, new Map<string, Map<string, StakerPayout[]>>());

      staker_reward.validators.forEach(({ address }) => {
        if (!claim_pool_map.get(era)?.has(address))
          claim_pool_map
            .get(era)
            ?.set(address, new Map<string, StakerPayout[]>());      // Create new map for the current era/address if it doesn't exist
        if (!claim_pool_map.get(era)?.get(address)?.has(claimer.id))
          claim_pool_map
            .get(era)
            ?.get(address)
            ?.set(claimer.id, new Array<StakerPayout>());           // Create new array for the current era/address/id if it doesn't exist

        claim_pool_map.get(era)?.get(address)?.get(claimer.id)?.push(claimer); // add staker id
      });
    });
  });

  const claim_pool: ClaimPool = new Array<Claim>();
  claim_pool_map.forEach((validators, era) => {
    validators.forEach((claimers, validator) => {
      claim_pool.push({
        era: era,
        address: validator,
        claimers: claimers,
      });
    });
  });

  return claim_pool;
}
