import { Events, ActivityType } from "discord.js";
import { startPolling } from "../../cmix/index.js";
import { startClaiming } from '../../chain/claim.js';
import { ClaimConfig, ClaimFrequency, ExternalStakerConfig } from "../../chain/types.js";

import type { Database } from "../../db/index.js";
import type { DiscordClient } from "../types.js";
import type { KeyringPair$Json } from "@polkadot/keyring/types";
import { EXTERNAL, engulph_fetch_claimers } from "../../utils.js";
import { Chain } from "../../chain/index.js";

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

    ClaimFrequency.DAILY.cron = process.env.CLAIM_CRON_REGULAR!;
    const cfg_daily: ClaimConfig = {
      frequency: ClaimFrequency.DAILY,
      batch: +process.env.CLAIM_BATCH!,
      wallet: Chain.init_key(JSON.parse(process.env.CLAIM_WALLET!) as KeyringPair$Json, process.env.CLAIM_PASSWORD!),
      dry_run: true,
    }
    ClaimFrequency.WEEKLY.cron = process.env.CLAIM_CRON_IRREGULAR!;
    const cfg_weekly: ClaimConfig = {
      frequency: ClaimFrequency.WEEKLY,
      batch: +process.env.CLAIM_BATCH!,
      wallet: Chain.init_key(JSON.parse(process.env.CLAIM_WALLET!) as KeyringPair$Json, process.env.CLAIM_PASSWORD!),
      dry_run: true,
    }

    // start discord claim cron
    startClaiming(db, client, process.env.CHAIN_RPC_ENDPOINT!, cfg_daily);
    
    if (process.env.CLAIM_CRON_IRREGULAR) {
      // start irregular claim cron if set
      startClaiming(db, client, process.env.CHAIN_RPC_ENDPOINT!, cfg_weekly);

      // start external staker claim cron
      const external_stakers: ExternalStakerConfig = {
        fn: engulph_fetch_claimers,
        identifier: EXTERNAL,
        args: {endpoint: process.env.CLAIM_ENDPOINT, key: process.env.CLAIM_ENDPOINT_KEY}
      }
      startClaiming(db, client, process.env.CHAIN_RPC_ENDPOINT!, cfg_weekly, external_stakers);
    }
  }

}
