import { Events, ActivityType } from "discord.js";
import { startPolling } from "../../cmix/index.js";
import type { Database } from "../../db/index.js";
import type { DiscordClient } from "../types.js";

export const name = Events.ClientReady;
export const once = true;

export function execute(client: DiscordClient, db: Database) {
  console.log(`Ready! Logged in as ${client.user!.tag}`);

  // configure client with info from env
  // Set bot username
  if (process.env.BOT_USERNAME) {
    client.user!.setUsername(process.env.BOT_USERNAME);
  }

  // Set bot status
  if (process.env.BOT_STATUS) {
    client.user!.setActivity(process.env.BOT_STATUS, {
      type: ActivityType.Listening,
    });
  }

  // start cmix poller
  startPolling(db, client);
  
}
