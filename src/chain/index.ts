import custom from "../custom-derives/index.js";
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { hexToU8a, isHex } from '@polkadot/util';
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";

import type { ApiOptions } from "@polkadot/api/types/index.js";
import type { KeyringPair, KeyringPair$Json } from "@polkadot/keyring/types";

const xxnetworkprefix = 55;

export function isValidAddressXXAddress(address: string) : boolean {
  try {
    encodeAddress(
      isHex(address)
        ? hexToU8a(address)
        : decodeAddress(address, false, xxnetworkprefix)
    );

    return true;
  } catch (error) {
    return false;
  }
};

export class Chain{
  private api_options: ApiOptions;
  
  constructor(endpoint: string | undefined) {
    // test that we can connect to the provided endpoint
    const provider = new WsProvider(endpoint);
    this.api_options = { 
      derives: custom, 
      provider,
      throwOnConnect: true,
    }
  }

  public async connect(): Promise<ApiPromise> {
    const api = await ApiPromise.create(this.api_options);
    const [chain, nodeName, nodeVersion] = await Promise.all([
      api.rpc.system.chain(),
      api.rpc.system.name(),
      api.rpc.system.version(),
    ]);
  
    console.log(
      `You are connected to chain ${chain} using ${nodeName} v${nodeVersion}`
    );
    
    return api;
  }

  public async canConnect(): Promise<boolean> {
    try {
      console.log(`Testing rpc connection to ${process.env.CHAIN_RPC_ENDPOINT}...`)
      const api = await ApiPromise.create(this.api_options);
      console.log(`Connection successful`)
      await api.disconnect()
    } catch (e) {
      console.log(`Could not connect to endpoint ${process.env.CHAIN_RPC_ENDPOINT}: ${e}`)
      return false;
    }
    return true;
  }

  public static init_key(key: KeyringPair$Json, password: string): KeyringPair {
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
};