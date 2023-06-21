// built this file with inspiration from https://github.com/w3f/polkadot-k8s-payouts/blob/master/src/actions/start.ts

import custom from "../custom-derives/index.js";
import "@xxnetwork/types";
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { BN } from "@polkadot/util";
import cronstrue from 'cronstrue';
import { CronJob } from "cron";

import type { DeriveStakerReward } from "@polkadot/api-derive/types";
import type { KeyringPair, KeyringPair$Json } from "@polkadot/keyring/types";
import type { Database } from "../db/index.js";
import type {
  EngulphWallet,
  StakerPayout,
  Era,
  Config,
  Claim,
  ClaimPool,
  StakerReward,
  ValidatorStakerReward,
  ClaimNotify,
} from "./types.js";

export async function startClaiming(  
  db: Database,
  rpc_endpoint: string,
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
      claim(db, rpc_endpoint, claim_batch, claim_wallet, claim_pw, claimer_endpoint, claimer_key);
    },
    null,
    true,
    'UTC'
  );

  console.log(`*** Claim Cron Started: ${cronstrue.toString(claim_cron)} ***`);
  console.log(`*** Next run: ${job.nextDate().toRFC2822()} ***`);
}

async function claim(
  db: Database,
  rpc_endpoint: string,
  claim_batch: number,
  claim_wallet: string,
  claim_pw: string,
  claimer_endpoint?: string,
  claimer_key?: string
): Promise<void> {
  const claimers: StakerPayout[] = new Array<StakerPayout>();

  // get claimers from mongodb
  
  // if a claimer endpoint and key are set, grab claimers from that endpoint
  if (claimer_endpoint && claimer_key) claimers.push(...await fetch_claimers(claimer_endpoint, claimer_key));

  const provider = new WsProvider(rpc_endpoint);
  const api = await ApiPromise.create({ derives: custom, provider });
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
    claim_wallet: JSON.parse(claim_wallet) as KeyringPair$Json,
    claim_pw: claim_pw,
    price: price,
    xx_usd(xx: BN): string {
      const usd: number = (xx.toNumber() * price) / 1000000000;
      return usd_formatter.format(usd);
    },
    xx_bal(xx: BN): string {
      return api.registry.createType("Balance", xx).toHuman();
    },
  };

  const [chain, nodeName, nodeVersion] = await Promise.all([
    api.rpc.system.chain(),
    api.rpc.system.name(),
    api.rpc.system.version(),
  ]);

  console.log(
    `You are connected to chain ${chain} using ${nodeName} v${nodeVersion}`
  );

  const claimers_with_rewards = await get_available_rewards(cfg, claimers);
  const claim_pool = build_claim_pool(claimers_with_rewards);
  const keyPair = init_key(cfg.claim_wallet, cfg.claim_pw);
  await submit_claim(cfg, keyPair, claim_pool, claimers_with_rewards);

  // //recap
  // console.log(`***** RECAP *****`)
  // for (const [address, validatorInfo] of validators_map) {
  //     console.log(`${validatorInfo.alias}|${address}`)
  //     validatorInfo.unclaimed_payouts.length>0 ? console.log(`To be claimed Payouts: ${validatorInfo.unclaimed_payouts.toString()}`) : {}
  //     validatorInfo.claimed_payouts.length>0 ? console.log(`Claimed Payouts: ${validatorInfo.claimed_payouts.toString()}`) : {}
  //     console.log(`**********`)
  // }

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
    const wallets = JSON.parse(text) as Array<EngulphWallet>;
    claimers = wallets.map(({ ip, wallet }) => ({
      id: "engulph",
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
  claimers: StakerPayout[]
): Promise<void> {
  let currentTxDone = true;
  let totClaimed = 0;
  const claims_fulfilled = new Array<Claim>() as ClaimPool;
  const claims_failed = new Array<Claim>() as ClaimPool;
  while (claims.length > 0) {
    const payoutCalls: any = [];
    const claims_batch = claims.splice(0, cfg.batch_size); //end not included

    claims_batch.forEach(({ address, era, claimers }) => {
      console.log(
        `Adding era ${era} claim for ${address} (claimers: ${Array.from(
          claimers?.keys() as Iterable<string>
        ).join(", ")})`
      );
      payoutCalls.push(cfg.api.tx.staking.payoutStakers(address, era));
    });

    currentTxDone = false;
    try {
      if (payoutCalls.length > 0) {
        console.log(`Batching ${payoutCalls.length} payouts:`);
        const transactions = await cfg.api.tx.utility.batchAll(payoutCalls);
        const { partialFee, weight } = await transactions.paymentInfo(keyPair);
        console.log(
          `transaction will have a weight of ${weight}, with ${partialFee.toHuman()} weight fees`
        );
        // const unsub = transactions.signAndSend(keyPair, result =>
        //     {
        //         console.log(`Current status is ${result.status}`);
        //         if (result.status.isInBlock) {
        //             console.log(`Transaction included at blockHash ${result.status.asInBlock}`);
        //         } else if (result.status.isFinalized) {
        //             console.log(`Transaction finalized at blockHash ${result.status.asFinalized}`);
        //             currentTxDone = true
        //             unsub();
        //         }
        //     });

        // add the tx fee to fulfilled claims
        claims_fulfilled.push(
          ...claims_batch.map((claim) => ({
            ...claim,
            fee: partialFee,
          }))
        );
      } else {
        currentTxDone = true;
      }
    } catch (e) {
      console.log(`Could not perform one of the claims: ${e}`);
      claims_failed.push(...claims_batch);
    }
  }
  console.log(
    `Claimed ${claims_fulfilled.length} payouts, ${claims_failed.length} failed.`
  );

  notify_stakers(cfg, claims_fulfilled, claims_failed);
}

function create_notify_map(claims: ClaimPool): Map<string, ClaimNotify[]> {
  const notify_map = new Map<string, ClaimNotify[]>();
  claims.forEach(({ era, address, claimers, fee }) => {
    claimers?.forEach((staker_payouts, id) => {
      // each claimer id, put an entry in our notify map
      if (!notify_map.get(id)) notify_map.set(id, new Array<ClaimNotify>());

      staker_payouts.forEach((staker_payout) => {
        notify_map.get(id)?.push({
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

function notify_stakers(
  cfg: Config,
  claims_fulfilled: ClaimPool,
  claims_failed: ClaimPool
): void {
  const notify_success = create_notify_map(claims_fulfilled);
  const notify_failed = create_notify_map(claims_failed);

  function _generate_msg(claim: ClaimNotify): string {
    const _validators = claim.validators.map(
      ({ address }) => address
    ) as string[];
    const _validators_string = claim.isValidator
      ? ""
      : ` on validator${_validators.length > 1 ? "s" : ""} ${_validators.join(
          ", "
        )}`;
    const _payout = `${cfg.xx_bal(claim.payout)} (${cfg.xx_usd(claim.payout)})`;
    const _tx = claim.fee
      ? ` (batch tx: ${cfg.xx_bal(claim.fee)}/${cfg.xx_usd(claim.fee)})`
      : "";
    const _alias_address = `${claim.alias} (${claim.address})`;
    return `Era ${claim.era}: ${_payout} claimed for ${
      claim.isValidator ? "validator" : "nominator"
    } ${_alias_address}${_validators_string}${_tx}`;
  }

  notify_success.forEach((claims, id) => {
    console.log(`Successful claims for ${id}:`);

    claims.forEach((claim) => {
      console.log(_generate_msg(claim));
    });
  });

  notify_failed.forEach((claims, id) => {
    console.log(`Failed claims for ${id}:`);

    claims.forEach((claim) => {
      console.log(_generate_msg(claim));
    });
  });
}

function init_key(key: KeyringPair$Json, password: string): KeyringPair {
  const keyring = new Keyring({ type: "sr25519" });
  const key_pair = keyring.addFromJson(key);
  key_pair.decodePkcs8(password);

  console.log(
    `key init: read account with address: ${keyring.pairs[0].toJson().address}`
  );
  console.log(`key init: is locked: ${key_pair.isLocked}`);

  if (key_pair.isLocked) {
    console.log(`problem unlocking the wallet, exiting ...`);
    process.exit(1);
  } else return key_pair;
}

function build_claim_pool(claimers: StakerPayout[]): Claim[] {
  // build a claim pool with unique era/address

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
