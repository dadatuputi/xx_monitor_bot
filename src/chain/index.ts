import "@xxnetwork/types";
import custom from "../custom-derives/index.js";
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { hexToU8a, isHex, formatBalance } from '@polkadot/util';
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { wait } from "../utils.js";
import { cmix_id_b64 } from "../cmix/index.js";
import { XXEvent } from "../events/types.js";
import PubSub from 'pubsub-js';

import type { KeyringPair, KeyringPair$Json, KeyringOptions } from "@polkadot/keyring/types";
import type { BN } from "@polkadot/util";
import type { Balance, Era } from "@polkadot/types/interfaces/types.js";
import type { PalletStakingValidatorPrefs, } from "@polkadot/types/lookup";
import type { CommissionChange } from "./types.js";

const XX_SS58_PREFIX = 55;

export async function testChain(): Promise<void> {
  // test that we can connect to the provided endpoint except when deploying commands
  let t = 5;
  const MAX_MINS = 10
  while (!process.env.BOT_DEPLOY && ! await Chain.test(process.env.CHAIN_RPC_ENDPOINT!)) {
    if (t > MAX_MINS * 60) throw new Error("Can't connect to chain, exiting");
    const msg = `Can't connect to chain, waiting ${t}s`
    console.log(msg)
    PubSub.publish(XXEvent.LOG_ADMIN, msg)
    await wait(t*1000);
    t *= 2;
  }
}

export function isValidXXAddress(address: string) : boolean {
  try {
    encodeAddress(
      isHex(address)
        ? hexToU8a(address)
        : decodeAddress(address, false, XX_SS58_PREFIX)
    );

    return true;
  } catch (error) {
    return false;
  }
};

export async function startListeningCommission(rpc: string) {
  (await Chain.create(rpc)).subscribe_commission_change( (change) => {
    PubSub.publish(XXEvent.VALIDATOR_COMMISSION_CHANGE, change)
  });
}

export class Chain{
  public endpoint: string;
  public api!: ApiPromise;
  public decimals: number = 9;
  
  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  public async connect(): Promise<boolean> {
    const provider = new WsProvider(this.endpoint, 5000);
    const options = {
      derives: custom, 
      provider: provider,
      throwOnConnect: true,
    }    

    try {
      const api = await ApiPromise.create(options);
      await api.isReadyOrError

      this.decimals = api.registry.chainDecimals[0];

      // ensure chain is syncronized; from https://github.com/xx-labs/exchange-integration/blob/a027526819fdcfd4145fd45b7ceeeaaf371ebcf2/detect-transfers/index.js#L33
      while((await api.rpc.system.health()).isSyncing.isTrue){
        const sec = 5;
        console.log(`Chain is syncing, waiting ${sec} seconds`);
        await wait(sec*1000);
      }

      const [chain, nodeName, nodeVersion, era] = await Promise.all([
        api.rpc.system.chain(),
        api.rpc.system.name(),
        api.rpc.system.version(),
        api.query.staking.activeEra()
      ]);
    
      console.log(`Connected to chain ${chain} using ${nodeName} v${nodeVersion}, era: ${(era.toJSON() as unknown as Era).index}`);
      
      this.api = api;

    } catch(e) {
      provider.disconnect();
      return false; 
    }    

    return true;
  }
  
  public static async create(endpoint: string) {
    const me = new Chain(endpoint);
    await me.connect();
    return me;
  }

  public static async test(endpoint: string): Promise<boolean> {
    const guinea = new Chain(endpoint);
    const alive = await guinea.connect()
    alive && guinea.api!.disconnect()
    return alive;
  }

  public async wallet_balance(wallet: string | KeyringPair): Promise<BN> {
    let address: string;
    if (typeof wallet !== 'string') address = wallet.address;
    else address = wallet;

    const { data: balance } = await this.api.query.system.account(address)
    return balance.free
  }

  public async subscribe_commission_change(callbackfn: (change: CommissionChange) => void){
    // https://polkadot.js.org/docs/api/cookbook/blocks/
    console.log('Listening for commission changes');

    this.api.rpc.chain.subscribeFinalizedHeads(async (header) => {
      const blockNumber = header.number.toNumber();
      const blockHash = await this.api.rpc.chain.getBlockHash(blockNumber);
      const signedBlock = await this.api.rpc.chain.getBlock(blockHash);

      for(const [index, extr] of signedBlock.block.extrinsics.entries()){
        if (this.api.tx.staking.validate.is(extr)) {
          const { method: { args } } = extr;
          const arg = (args as [PalletStakingValidatorPrefs]).find((a) => a.has('commission')) // check that extrinsics args has 'commission'
          if (arg) {
            // check if event is a successful extrinsic
            const apiAt = await this.api.at(signedBlock.block.header.hash);
            const events = await apiAt.query.system.events();
            for(const { event } of events.filter(({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(index))) {
              if (this.api.events.system.ExtrinsicSuccess.is(event)) {
                // this was a successful commision change
                const { cmixId } = (await apiAt.query.staking.ledger(extr.signer.toString())).unwrap();  // get ledger/cmixid of the signer
                const change: CommissionChange = {
                  wallet: extr.signer.toString(),
                  cmix_id: cmix_id_b64(cmixId.unwrap().toU8a()),
                  commission: arg.commission.unwrap().toNumber(),
                  commission_previous: await this.get_commission(extr.signer.toString(), blockNumber-1),
                  chain_decimals: this.decimals
                }
                callbackfn(change);
              }
            }
          }
        }
      }
    });
  }

  private async get_commission(validator: string, block?: number): Promise<number> {
    if (block) {
      const blockHash = await this.api.rpc.chain.getBlockHash(block);
      const apiAt = await this.api.at(blockHash);
      const { commission } = await apiAt.query.staking.validators(validator);
      return commission.toNumber();
    } else {
      const { commission } = await this.api.query.staking.validators(validator);
      return commission.toNumber();
    }
  }

  public xx_bal_string(xx: number | bigint | BN | Balance, sig_digits: number = 2): string {
    formatBalance.setDefaults({ decimals: this.decimals, unit: 'xx'})
    const balfor = formatBalance(xx)
    const [num, unit] = balfor.split(' ');
    const [int, frac] = num.split('.');
    const frac_short = frac?.slice(0,sig_digits) ?? ''
    return `${int}${frac_short ? `.${frac_short}` : ''} ${unit}`
  }

  public xx_bal_usd_string(xx: BN, price: number | undefined): string {
    return `${this.xx_bal_string(xx)}${price ? ` (${Chain.xx_to_usd(xx, price)})` : ''}`
  }

  public static xx_to_usd(xx: BN, price: number): string {
    const usd: number = (xx.toNumber() * price) / 1000000000;
    const usd_formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    });
    return usd_formatter.format(usd);
  }

  public static init_key(key: KeyringPair$Json, password: string): KeyringPair {
    const keyring_options: KeyringOptions = {
      ss58Format: XX_SS58_PREFIX,
      type: "sr25519"
    }
    const keyring = new Keyring(keyring_options);
    const key_pair = keyring.addFromJson(key);
    key_pair.decodePkcs8(password);
  
    // console.log(`key init: read account with address: ${keyring.pairs[0].toJson().address}`);
      
    if (key_pair.isLocked) {
      throw new Error(`Could not unlock the wallet: ${keyring.pairs[0].toJson().address}`);
    } 
    
    return key_pair;
  }

  public static commissionToHuman(commission: number, decimals: number): string {
    return `${(100 * commission/10**decimals).toFixed(2)}%`;
  }

};
