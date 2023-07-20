import { CronJob } from "cron";
import { Database } from "../db/index.js";
import { sendToDM } from "../messager.js";
import cronstrue from "cronstrue";

import { inlineCode, type Client } from "discord.js";
import { type CmixNode, StatusCmix, Status, StatusIcon } from "./types.js";
import type { MonitorRecord } from "../db/types.js";
import { Icons, prettify_address_alias } from "../utils.js";

// Polls the dashboard API and gets the entire list of nodes per the CMIX_CRON schedule

export async function startPolling(db: Database, client: Client, api_endpoint: string, cmix_cron: string) {
  const job = new CronJob(
    cmix_cron,
    function () {
      poll(db, client, api_endpoint);
    },
    null,
    true,
    'UTC'
  );

  console.log(`*** cMix Cron Started: ${cronstrue.toString(cmix_cron)} ***`);
  console.log(`*** Next run: ${job.nextDate().toRFC2822()} ***`);
}

async function poll(db: Database, client: Client, api_endpoint: string) {
  try {
    const response: Response = await fetch(api_endpoint, {
      headers: { accept: "application/json; charset=utf-8" },
    });
    const results = await response.json() as {nodes: CmixNode[]};
    if (response.status !== 200) {
      console.log(`Non-200 response:\nresponse: ${response}\nbody: ${results}}`);
    } else {
      // Process the results
      console.log(`${Icons.CMIX} Parsing ${results.nodes.length} cMix nodes`);
  
      // step through each node result and send its status to the monitoring db
      results.nodes.forEach(async (node) => {
        const name = node.name;
        const status_new: string = node.status ? 
          StatusCmix[node.status as keyof typeof StatusCmix] : 
          StatusCmix.unknown; // when status is an empty string, status is Status.UNKNOWN
        const changed: Date = new Date();
  
        // update database with new name, as appropriate
        if (node.name) {
          const monitor_results = await db.updateNodeName(node.id, name);
          if (monitor_results) {  // notify users of cMix node name change
            monitor_results.forEach( (record) => {
              const retrows = new Array<string>();
              retrows.push(`${Icons.UPDATE} cMix node ${prettify_address_alias(null, node.id, true)} name updated from dashboard: ${inlineCode(record.name ? record.name : 'empty')}${Icons.TRANSIT}${inlineCode(node.name)}`)
              retrows.push(`Set the node name yourself using command ${inlineCode('/monitor')} to stop name updates from the dashboard.`)
              sendToDM(client, record.user, retrows);
            })
          }
          const claim_results = await db.updateClaimAlias(node.walletAddress, name);
          if (claim_results) {  // notify users of validator name change
            claim_results.forEach( (record) => {
              const retrows = new Array<string>();
              retrows.push(`${Icons.UPDATE} Validator ${prettify_address_alias(null, node.walletAddress, true, 48)} alias updated from chain: ${inlineCode(record.name ? record.name : 'empty')}${Icons.TRANSIT}${inlineCode(node.name)}`)
              retrows.push(`Set the validator alias yourself using command ${inlineCode('/claim')} to stop alias updates from the dashboard.`)
              sendToDM(client, record.user, retrows);
            })
          }
        }
  
        // update database with new status
        var status_results = await db.updateNodeStatus(node.id, status_new, changed);
  
        // notify users of status change
        if (status_results) {
          console.log(`Notifying ${status_results.length} monitor of node ${node.id} of status change to ${status_new} at ${changed}`);
          status_results.forEach( (entry) => {
            // Send a notification to the user
            var message = StatusIcon[entry.status.toUpperCase() as keyof typeof Status] + ` ${Icons.TRANSIT} ` + StatusIcon[status_new.toUpperCase() as keyof typeof Status]; // old -> new status icon
            message += `  ${prettify_address_alias(entry.name, entry.node)} `; // pretty node name
            message += `is now ${status_new == Status.ERROR ? "in " : ""}${status_new.toUpperCase()}`; // new status
          
            sendToDM(client, entry.user, message);
          });
        }
      });
    }
  } catch(e) {
    console.log(`Error during cmix poll: ${e}`)
  }
 
}

export function cmix_id_b64(id: Uint8Array): string {
  return Buffer.from(id).toString('base64').replace('=', 'C');
}