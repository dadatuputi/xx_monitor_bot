import { Status, StatusIcon } from "./db/index.js";
import type { MonitorRecord } from "./db/types.js";
import { prettify_address_alias, Icons } from "./utils.js";
import type { Client, TextChannel } from "discord.js";

const MAX_MESSAGE_SIZE = 2000;

function chunkString(str: string | string[], size: number = MAX_MESSAGE_SIZE): string[] {
  const _lines_in = new Array<string>();
  const _lines_out = new Array<string>();
  if (typeof str === 'string'){
    _lines_in.push(...str.split('\n'));
  } else {
    _lines_in.push(...str);
  }

  let _char_count = 0;
  let _line_buffer = new Array<string>();
  for (const line of _lines_in) {
    if (_char_count + line.length + _line_buffer.length > size) {
      // line buffer is full, push it to lines out and make a new one
      _lines_out.push(_line_buffer.join('\n'))
      _line_buffer = new Array<string>();
      _char_count = 0;
    } 
    _char_count += line.length
    _line_buffer.push(line);
  }
  _lines_out.push(_line_buffer.join('\n'))

  return _lines_out;
}

export async function sendToDM(client: Client, user_id: string, message: string | string[]): Promise<any> {
  const chunks = chunkString(message);

  client.users.fetch(user_id).then((dm) => {
    for(const chunk of chunks) {
      dm.send(chunk);
    }
  });
}

export async function sendToChannel(client: Client, channel: string, message: string | string[]): Promise<any> {
  const chunks = chunkString(message);

  client.channels.fetch(channel).then((channel) => {
    if (channel === null) throw new Error(`Channel ${channel} does not exist`); 
    for(const chunk of chunks) {
      (channel as TextChannel).send(chunk);
    }
  })
}

export async function dmStatusChange(
  client: Client,
  node: MonitorRecord,
  status_new: string
) {
  const status = status_new.toUpperCase() as keyof typeof Status;
  var message = StatusIcon[status] + ` ${Icons.TRANSIT} ` + StatusIcon[status]; // old -> new status icon
  message += `  ${prettify_address_alias(node.name, node.node)} `; // pretty node name
  message += `is now ${status_new == Status.ERROR ? "in " : ""}${status}`; // new status

  sendToDM(client, node.user, message);
}
