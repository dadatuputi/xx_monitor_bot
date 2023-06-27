import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { hexToU8a, isHex } from '@polkadot/util';

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
