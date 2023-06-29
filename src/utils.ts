import { inlineCode } from "discord.js";

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
