import "@xxnetwork/types";
import custom from "../custom-derives/index.js";
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { hexToU8a, isHex, formatBalance } from '@polkadot/util';
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import base64url from "base64url";


import type { KeyringPair, KeyringPair$Json, KeyringOptions } from "@polkadot/keyring/types";
import type { BN } from "@polkadot/util";
import type { StakingQueryFlags } from "@polkadot/api-derive/types";
import { Balance, Era, Event, H256, ValidatorPrefs } from "@polkadot/types/interfaces/types.js";
import { Vec } from "@polkadot/types";
import { FrameSystemEventRecord, PalletStakingValidatorPrefs, } from "@polkadot/types/lookup";
import { wait } from "../utils.js";
import { CommissionChange } from "./types.js";
import { AnyTuple, RegistryError, } from "@polkadot/types/types";
import type { DeriveStakingQuery, DeriveStakingWaiting } from '@polkadot/api-derive/staking/types';
import { cmix_id_b64 } from "../cmix/index.js";

const XX_SS58_PREFIX = 55;

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

export class Chain{
  public endpoint: string;
  public api!: ApiPromise;
  
  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  public async connect(): Promise<void> {
    const provider = new WsProvider(this.endpoint);
    const options = {
      derives: custom, 
      provider: provider,
      throwOnConnect: true,
    }    
    const api = await ApiPromise.create(options);
    await api.isReady;

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
  }
  
  public static async create(endpoint: string) {
    const me = new Chain(endpoint);
    await me.connect();
    return me;
  }

  public static async test(endpoint: string): Promise<boolean> {
    try {
      console.log(`Testing rpc connection to ${endpoint}...`)
      const me = await Chain.create(endpoint);
      console.log(`Connection successful`)
      await me.api!.disconnect()
    } catch (e) {
      console.log(`Could not connect to endpoint ${endpoint}: ${e}`)
      return false;
    }
    return true;
  }

  public async wallet_balance(wallet: string | KeyringPair): Promise<BN> {
    let address: string;
    if (typeof wallet !== 'string') address = wallet.address;
    else address = wallet;

    const { data: balance } = await this.api.query.system.account(address)
    return balance.free
  }

  // public async events(){
  //   this.api.query.system.extrinsicData

  //   this.api.query.system.events((events: Vec<FrameSystemEventRecord>) => {
  //     console.log(`\nReceived ${events.length} events:`);
  
  //     // Loop through the Vec<EventRecord>
  //     events.forEach((record) => {
  //       // Extract the phase, event and the event types
  //       const { event, phase, topics } = record;
  //       const types = event.typeDef;
  
  //       // Show what we are busy with
  //       console.log(`\t${event.section}:${event.method}:: (phase=${phase.toString()})`);
  //       console.log(`\t\t${event.meta.toString()}`);

  //       // Loop through each of the parameters, displaying the type and data
  //       event.data.forEach((data, index) => {
  //         console.log(`\t\t\t${types[index].type}: ${data.toString()}`);
  //       });
  //     });
  //   });
  
  // }

  public xx_bal_string(xx: number | bigint | BN | Balance, sig_digits: number = 2): string {
    formatBalance.setDefaults({ decimals: this.api.registry.chainDecimals[0], unit: 'xx'})
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

};