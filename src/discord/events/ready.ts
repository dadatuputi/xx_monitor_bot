import { Events, ActivityType } from "discord.js";
import { startPolling } from "../../cmix/index.js";
import { startClaiming } from '../../chain/claim.js';
import { ClaimFrequency } from "../../chain/types.js";

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

  // start cmix cron
  // todo - consolidate /monitor commands into single command, then handle command loading like claim i.e. throw error when env vars aren't available. 
  if ( !process.env.CMIX_API_ENDPOINT 
    || !process.env.CMIX_API_CRON ) { throw new Error('Missing XX API env vars, exiting') }
  startPolling(db, client, process.env.CMIX_API_ENDPOINT, process.env.CMIX_API_CRON);

  // if /claim command loaded, start claim cron(s)
  if (client.commands.has('claim')) {
    // start regular claim cron
    startClaiming(db, client, ClaimFrequency.DAILY, process.env.CLAIM_CRON_REGULAR!, +process.env.CLAIM_BATCH!, process.env.CLAIM_WALLET!, process.env.CLAIM_PASSWORD!, process.env.CLAIM_ENDPOINT, process.env.CLAIM_ENDPOINT_KEY);
    
    // start irregular claim cron if set
    if (process.env.CLAIM_CRON_IRREGULAR) {
      startClaiming(db, client, ClaimFrequency.WEEKLY, process.env.CLAIM_CRON_IRREGULAR, +process.env.CLAIM_BATCH!, process.env.CLAIM_WALLET!, process.env.CLAIM_PASSWORD!, process.env.CLAIM_ENDPOINT, process.env.CLAIM_ENDPOINT_KEY);
    }
  }

}
