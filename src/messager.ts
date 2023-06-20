import { Status, StatusIcon } from "./db/index.js";
import type { MonitorRecord } from "./db/types.js";
import { prettifyNode, Icons } from "./utils.js";
import type { Client } from "discord.js";

export async function sendDM(client: Client, user_id: string, message: string) {
  client.users.fetch(user_id).then((dm) => {
    dm.send(message);
  });
}

export async function dmStatusChange(
  client: Client,
  node: MonitorRecord,
  status_new: string
) {
  const status = status_new.toUpperCase() as keyof typeof Status;
  var message = StatusIcon[status] + ` ${Icons.TRANSIT} ` + StatusIcon[status]; // old -> new status icon
  message += `  ${prettifyNode(node.name, node.node)} `; // pretty node name
  message += `is now ${status_new == Status.ERROR ? "in " : ""}${status}`; // new status

  sendDM(client, node.user, message);
}
