import { Events, ActivityType } from "discord.js";
import { startPolling } from "../../cmix/index.js";

import { startClaiming } from '../../chain/claim.js';
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
  if ( !process.env.CMIX_API_ENDPOINT 
    || !process.env.CMIX_API_CRON ) { throw new Error('Missing XX API env vars, exiting') }
  startPolling(db, client, process.env.CMIX_API_ENDPOINT, process.env.CMIX_API_CRON);

  // start regular claim cron
  if ( !process.env.CHAIN_RPC_ENDPOINT 
    || !process.env.CLAIM_CRON_REGULAR 
    || !process.env.CLAIM_BATCH 
    || !process.env.CLAIM_WALLET 
    || !process.env.CLAIM_PASSWORD ) { throw new Error('Missing Chain or Claim env vars, exiting') }
  startClaiming(db, process.env.CHAIN_RPC_ENDPOINT, process.env.CLAIM_CRON_REGULAR, +process.env.CLAIM_BATCH, process.env.CLAIM_WALLET, process.env.CLAIM_PASSWORD, process.env.CLAIM_ENDPOINT, process.env.CLAIM_ENDPOINT_KEY);
  
  // start irregular claim cron if set
  if (process.env.CLAIM_CRON_IRREGULAR) {
    startClaiming(db, process.env.CHAIN_RPC_ENDPOINT, process.env.CLAIM_CRON_IRREGULAR, +process.env.CLAIM_BATCH, process.env.CLAIM_WALLET, process.env.CLAIM_PASSWORD, process.env.CLAIM_ENDPOINT, process.env.CLAIM_ENDPOINT_KEY);
  }
}
