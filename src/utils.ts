import { inlineCode } from "discord.js";
import type { ExternalStaker, Staker } from "./chain/types";

export enum Icons {
  WATCH = "👀",
  ERROR = "💢",
  SUCCESS = "🙌",
  DELETE = "🗑️",
  TRANSIT = "➜",
  LINK = "🔗",
  WALLET = "💎",
  VALIDATOR = "❤️",
  NOMINATOR = "💚",
}

export const XX_ID_LEN = 44;

const ADDRESS_ALIAS_MIN_ID: number = 5; // the minimum length for an ID
const ADDRESS_ALIAS_SEPARATOR: string = " / ";

// truncate a string to set length, using ellipsis in the center
function truncate(text: string, length: number = XX_ID_LEN): string {
  length = length < ADDRESS_ALIAS_MIN_ID ? ADDRESS_ALIAS_MIN_ID : length; // do not truncate anything shorter than 5 characters
  const trunc =
    text.length > length
      ? `${text.substring(0, Math.ceil(length / 2) - 1)}…${text.substring(
          text.length - Math.floor(length / 2)
        )}`
      : text;
  return trunc;
}

// take a pretty name and an id and combine; if no name provided, just return id
export function prettify_address_alias(
  name: string | null | undefined,
  id: string,
  codify: boolean = true,
  maxlen: number = XX_ID_LEN
) {
  let retval: string;
  if (!name) {
    // if there's no name, just truncate the id and return
    retval = truncate(id, maxlen);
  } else if(id.length + name.length + ADDRESS_ALIAS_SEPARATOR.length <= maxlen) {
    // if the name and id are somehow less than the max, just return untruncated
    retval = `${name} / ${id}`
  } else {
    // is the name too long? i.e., it doesn't allow for the minimum id length
    const truncate_name: boolean = maxlen - (name.length + ADDRESS_ALIAS_SEPARATOR.length) < ADDRESS_ALIAS_MIN_ID;
    if (truncate_name) {
      const name_truncate_len: number = maxlen - ADDRESS_ALIAS_SEPARATOR.length - ADDRESS_ALIAS_MIN_ID;
      name = truncate(name, name_truncate_len);
      id = truncate(id, ADDRESS_ALIAS_MIN_ID);
    } else {
      const id_truncate_len: number = maxlen - ADDRESS_ALIAS_SEPARATOR.length - name.length;
      id = truncate(id, id_truncate_len);
    }
    retval = `${name} / ${id}`
  }

  return codify ? inlineCode(retval) : retval;
}

export async function xx_price(): Promise<number> {
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
  return price;
}

export function pluralize(collection: Array<any> | Map<any, any> | Set<any>, noun: string, suffix = 's') {
  const count = ('size' in collection) ? collection.size : collection.length
  return `${count} ${noun}${count !== 1 ? suffix : ''}`;
}


export const EXTERNAL = 'external';    // string used to identify wallets claimed from web
// This is an engul.ph-specific implementation of an external staker source; it can be replaced with a function that returns Array<Staker>
export async function engulph_fetch_claimers(identifier: string, args: {endpoint: string, key: string}): Promise<Array<Staker>> {
  // load addresses from cloudflare kv
  const response = await fetch(
    args.endpoint,
    {
      headers: { "X-Custom-PSK": args.key },
    }
  );
  const text = await response.text();
  const wallets = JSON.parse(text) as Array<ExternalStaker>;
  const claimers = wallets.map<Staker>(({ ip, wallet }) => ({
    user_id: identifier,
    alias: ip,
    wallet: wallet,
  }));

  return claimers as Array<Staker>;
}
