import { DiscordAPIError } from "discord.js";
import { XXEvent } from "../events/types.js";
import PubSub from 'pubsub-js';

import type { Client, TextChannel} from "discord.js";
import { Db } from "mongodb";
import { Database } from "../db/index.js";

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

export async function sendToDM(client: Client, db: Database, user_id: string, message: string | string[]): Promise<any> {
  const chunks = chunkString(message);

  try {
    const user = await client.users.fetch(user_id);
    for(const chunk of chunks) {
      await user.send(chunk);
    }
  }
  catch (e:unknown) {
    let msg = `sendToDM Error; User: ${user_id}; Message: ${message}\n`
    if (e instanceof DiscordAPIError) {
      msg += `DiscordAPIError ${e.code}: ${e.message}\n`
      if (e.code == 50007) {       // If it's a DiscordAPIError 50007, remove user (they are blocking the bot)
        const result = await db.deleteUser(user_id);
        msg += `Deleting ${result.monitors.deleted.length} monitors and ${result.claims.deleted.length} claims for user\n`;
      }
    } else if (e instanceof Error) {
      msg += `Error ${e.name}: ${e.message}`
    } else {
      msg += e
    }
    console.log(msg);
    PubSub.publish(XXEvent.LOG_ADMIN, msg)
  }
  
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
