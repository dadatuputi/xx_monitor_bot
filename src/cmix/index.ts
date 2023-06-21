import { CronJob } from "cron";
import { Database } from "../db/index.js";
import { dmStatusChange } from "../messager.js";
import { StatusCmix } from "../db/index.js";
import cronstrue from "cronstrue";

import type { Client } from "discord.js";
import type { CmixNode } from "./types.js";
import type { MonitorRecord } from "../db/types.js";

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

  console.log(`*** Cmix Cron Started: ${cronstrue.toString(cmix_cron)} ***`);
  console.log(`*** Next run: ${job.nextDate().toRFC2822()} ***`);
}

async function poll(db: Database, client: Client, api_endpoint: string) {
  const response: Response = await fetch(api_endpoint, {
    headers: { accept: "application/json; charset=utf-8" },
  });
  const results = await response.json();
  if (response.status !== 200) {
    console.log(`non-200 response:\nresponse: ${response}\nbody: ${results}}`);
  } else {
    // Process the results
    console.log(`parsing ${results.nodes.length} nodes`);

    // step through each node result and send its status to the monitoring db
    results.nodes.forEach(async (node: CmixNode) => {
      const name: string = node.name;
      const status = node.status as keyof typeof StatusCmix;
      const status_new: StatusCmix = node.status
        ? StatusCmix[status]
        : StatusCmix.unknown; // when status is an empty string, status is Status.UNKNOWN
      const node_id: string = node.id;
      const changed: Date = new Date();

      // update database with new name, as appropriate
      if (node.name) {
        db.updateNodeName(node_id, name);
      }

      // update database with new status
      var result: MonitorRecord[] | undefined = await db.updateNodeStatus(
        node.id,
        status_new,
        changed
      );

      // notify users of status change
      if (result) {
        console.log(
          `notifying ${result.length} users of node ${node_id} status change to ${status_new} at ${changed}`
        );
        result.forEach(async (entry) => {
          // Send a notification to the user
          dmStatusChange(client, entry, status_new);
        });
      }
    });
  }
}
