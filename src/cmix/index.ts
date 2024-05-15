import { CronJob } from "cron";
import { Database } from "../db/index.js";
import { Icons, prettify_address_alias } from "../utils.js";
import { StatusCmix, } from "./types.js";
import { inlineCode, spoiler } from "discord.js";
import { NameEventData, StatusEventData, XXEvent } from "../events/types.js";
import cronstrue from "cronstrue";
import PubSub from 'pubsub-js';

import type { CmixNode } from './types.js'
import { BotType } from "../bots/types.js";

// Polls the dashboard API and gets the entire list of nodes per the CMIX_CRON schedule

export async function startPolling(db: Database, api_endpoint: string, cmix_cron: string) {
  // Start a poll immediately on start-up
  await poll(db, api_endpoint);

  const job = new CronJob(
    cmix_cron,
    function () {
      poll(db, api_endpoint);
    },
    null,
    true,
    'UTC'
  );

  console.log(`*** cMix Cron Started: ${cronstrue.toString(cmix_cron)}; next run: ${job.nextDate().toRFC2822()} ***`);
}

let poll_success = false;

async function poll(db: Database, api_endpoint: string) {
  try {
    const response: Response = await fetch(api_endpoint, {
      "headers": { 
        "Accept": "application/json; charset=utf-8",
        "User-Agent": "xxbot",
       },
    });

    if (response.status !== 200) {
      throw new Error(`Non-200 response:\nresponse: ${response}\nbody: ${await response.text()}}`);
    }

    try {
      const results = await response.json() as {nodes: CmixNode[]};
      
      // Process the results
      console.log(`${Icons.CMIX}  Parsing ${results.nodes.length} cMix nodes`);
  
      // step through each node result and send its status to the monitoring db
      results.nodes.forEach(async (node) => {
        const name = node.name;
        const status_new: string = node.status ? 
          StatusCmix[node.status as keyof typeof StatusCmix] : 
          StatusCmix.unknown; // when status is an empty string, status is Status.UNKNOWN
  
        // update monitored node database with new name
        if (node.name) {
          const monitor_results = await db.updateNodeName(node.id, name);
          monitor_results.length && console.log(`Notifying ${monitor_results.length} monitors of node ${node.id} of name change to ${node.name}`);

          for(const record of monitor_results){
            const data : NameEventData = {
              user_id: record.user,
              node_id: node.id,
              node_name: node.name,
              old_name: record.name,
            }

            // Send a notification to the user
            PubSub.publish([XXEvent.MONITOR_NAME_NEW, record.bot].join("."), data)
          }

          // update claim database with new name
          if (node.walletAddress) {
            const claim_results = await db.updateClaimAlias(node.walletAddress, name);
            claim_results.length && console.log(`Notifying ${claim_results.length} claimers of validator ${node.walletAddress} of alias change to ${node.name}`);

            for(const record of claim_results){
              const data : NameEventData = {
                user_id: record.user,
                node_id: node.id,
                node_name: node.name,
                old_name: record.name,
                wallet_address: node.walletAddress,
              }

              PubSub.publish([XXEvent.MONITOR_NAME_NEW, record.bot].join("."), data)
            }
          }
        }

        // update database with new status
        const status_results = await db.updateNodeStatus(node.id, status_new);
        status_results.length && console.log(`Notifying ${status_results.length} monitor of node ${node.id} of status change to ${status_new}`);

        for(const record of status_results) {
          const data: StatusEventData = {
            user_id: record.user,
            new_status: status_new,
            node_id: record.node,
            node_name: record.name,
            old_status: record.status
          }
          console.log(record)

          // Send a notification to the user
          PubSub.publish([XXEvent.MONITOR_STATUS_NEW, record.bot].join("."), data)
        }
      });

      poll_success = true;
    } catch(e) {
      throw new Error(`Response: ${await response.text()}`);
    }

  } catch(e) {
    const error = `Error during cmix poll (API: ${api_endpoint}): ${e}`
    console.log(error)
    poll_success && PubSub.publish(XXEvent.LOG_ADMIN, error)
    poll_success = false;
  }
 
}

export function cmix_id_b64(id: Uint8Array): string {
  return Buffer.from(id).toString('base64').replace('=', 'C');
}