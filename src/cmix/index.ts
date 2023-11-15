import { CronJob } from "cron";
import { Database } from "../db/index.js";
import { Icons, prettify_address_alias } from "../utils.js";
import { StatusCmix, Status, StatusIcon } from "./types.js";
import { inlineCode, italic, spoiler } from "discord.js";
import { NotifyData, XXEvent } from "../events/types.js";
import cronstrue from "cronstrue";
import PubSub from 'pubsub-js';

import type { CmixNode } from './types.js'

// Polls the dashboard API and gets the entire list of nodes per the CMIX_CRON schedule

export async function startPolling(db: Database, api_endpoint: string, cmix_cron: string) {
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

async function poll(db: Database, api_endpoint: string) {
  try {
    const response: Response = await fetch(api_endpoint, {
      "headers": { 
        "Accept": "application/json; charset=utf-8",
        "User-Agent": "Wget/1.21.3",
       },
    });
    const results = await response.json() as {nodes: CmixNode[]};
    if (response.status !== 200) {
      console.log(`Non-200 response:\nresponse: ${response}\nbody: ${results}}`);
    } else {
      // Process the results
      console.log(`${Icons.CMIX}  Parsing ${results.nodes.length} cMix nodes`);
  
      // step through each node result and send its status to the monitoring db
      results.nodes.forEach(async (node) => {
        const name = node.name;
        const status_new: string = node.status ? 
          StatusCmix[node.status as keyof typeof StatusCmix] : 
          StatusCmix.unknown; // when status is an empty string, status is Status.UNKNOWN
  
        // update database with new name, as appropriate
        if (node.name) {
          const monitor_results = await db.updateNodeName(node.id, name);
          monitor_results.length && console.log(`Notifying ${monitor_results.length} monitor of node ${node.id} of name change to ${node.name}`);
          for(const record of monitor_results){
            const retrows = new Array<string>();
            retrows.push(`${Icons.UPDATE} cMix node ${prettify_address_alias(null, node.id, true)} name updated: ${inlineCode(record.name ? record.name : 'empty')}${Icons.TRANSIT}${inlineCode(node.name)}`)
            retrows.push(`${Icons.UPDATE} ${spoiler(`Use command ${inlineCode('/monitor add')} to set your own alias and stop name updates from the dashboard`)}`)
            const data: NotifyData = {
              id: record.user,
              msg: retrows,
            }
            PubSub.publish(XXEvent.VALIDATOR_NAME_CHANGE, data)
          }

          const claim_results = await db.updateClaimAlias(node.walletAddress, name);
          claim_results.length && console.log(`Notifying ${claim_results.length} claimers of validator ${node.walletAddress} of name change to ${node.name}`);
          for(const record of claim_results){
            const retrows = new Array<string>();
            retrows.push(`${Icons.UPDATE} Validator ${prettify_address_alias(null, node.walletAddress, true, 48)} alias updated: ${inlineCode(record.name ? record.name : 'empty')}${Icons.TRANSIT}${inlineCode(node.name)}`)
            retrows.push(`${Icons.UPDATE} ${spoiler(inlineCode(`Use command /claim to set your own alias and stop name updates from the dashboard`))}`)
            const data: NotifyData = {
              id: record.user,
              msg: retrows,
            }
            PubSub.publish(XXEvent.VALIDATOR_NAME_CHANGE, data)
          }
        }

        // update database with new status
        const status_results = await db.updateNodeStatus(node.id, status_new);
        status_results.length && console.log(`Notifying ${status_results.length} monitor of node ${node.id} of status change to ${status_new}`);
        for(const record of status_results) {
          console.log(record)
          // Send a notification to the user
          var message = `${StatusIcon[record.status.toUpperCase() as keyof typeof Status]} ${Icons.TRANSIT} ${StatusIcon[status_new.toUpperCase() as keyof typeof Status]}`; // old -> new status icon
          message += `  ${prettify_address_alias(record.name, record.node)} is now ${status_new == Status.ERROR ? "in " : ""}${italic(status_new)}`; // new status
          const data: NotifyData = {
            id: record.user,
            msg: message,
          }
          console.log('pubing this sub')
          console.log(data)
          PubSub.publish(XXEvent.VALIDATOR_STATUS_CHANGE, data)
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