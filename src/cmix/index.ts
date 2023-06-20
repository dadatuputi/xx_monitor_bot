import { CronJob } from "cron";
import { Database } from "../db/index.js";
import { dmStatusChange } from "../messager.js";
import { StatusCmix } from "../db/index.js";
import type { Client } from "discord.js";
import type { CmixNode } from "./types.js";
import type { MonitorRecord } from "../db/types.js";

// Polls the dashboard API and gets the entire list of nodes every ENDPOINT_POLLING seconds

const endpoint: string = process.env.ENDPOINT!;
const endpoint_retries = process.env.ENDPOINT_RETRIES;
const cmix_poll_cron: string = process.env.ENDPOINT_CRON!;
const timezone: string = process.env.TZ!;

export async function startPolling(db: Database, client: Client) {
  console.log("*** API Polling Started ***");

  new CronJob(
    cmix_poll_cron,
    function () {
      poll(db, client);
    },
    null,
    true,
    timezone
  );
}

async function poll(db: Database, client: Client) {
  const response: Response = await fetch(endpoint, {
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
