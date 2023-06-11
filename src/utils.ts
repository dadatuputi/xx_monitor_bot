import { inlineCode } from "discord.js";

// truncate a string to set length, using ellipsis in the center
function truncate(text: string, length: number = 44): string {
  length = length < 5 ? 5 : length; // do not truncate anything shorter than 5 characters
  const trunc =
    text.length > length
      ? `${text.substring(0, Math.ceil(length / 2) - 1)}…${text.substring(
          text.length - Math.floor(length / 2)
        )}`
      : text;
  return trunc;
}

// take a pretty name and an id and combine; if no name provided, just return id
export function prettifyNode(
  name: string | null,
  id: string,
  codify: boolean = true,
  maxlen: number = 44
) {
  if (!name) return codify ? inlineCode(id) : id; // just return id if no name is given
  const MAX_LEN = maxlen - 3; // arbitrary, can be increased
  const MAX_NAME_LEN = Math.ceil(MAX_LEN / 2); // name shouldn't be much longer than half the max length
  const name_new = truncate(name, MAX_NAME_LEN);
  const MAX_ID_LEN = MAX_LEN - name_new.length; // id takes up the rest of the space
  const pretty = `${name_new} / ${truncate(id, MAX_ID_LEN)}`;
  return codify ? inlineCode(pretty) : pretty;
}

export enum Icons {
  WATCH = "👀",
  ERROR = "💢",
  SUCCESS = "🙌",
  DELETE = "🗑️",
  TRANSIT = "➜",
  LINK = "🔗",
}

export const XX_ID_LEN = 44;
