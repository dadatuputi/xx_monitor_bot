import { Events, ActivityType, inlineCode, italic } from "discord.js";
import { Icons, prettify_address_alias } from "../../../utils.js";
import { Chain } from "../../../chain/index.js";
import { NotifyData, StatusData, XXEvent } from "../../../events/types.js";
import { sendToChannel, sendToDM } from "../messager.js";
import PubSub from 'pubsub-js';

import type { CommissionChange } from "../../../chain/types.js";
import type { Database } from "../../../db/index.js";
import type { DiscordClient } from "../types.js";
import { Status, StatusIcon } from "../../../cmix/types.js";
import { MonitorRecord } from "../../../db/types.js";
import { Data } from "@polkadot/types";

export const name = Events.ClientReady;
export const once = true;

export function execute(client: DiscordClient, db: Database) {
  console.log(`Discord bot ready: ${client.user!.tag}`);

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

  // Subscribe to events
  //  Validator Status Change
  const validator_status_change: PubSubJS.SubscriptionListener<StatusData> = (msg, data) => {
    var message = `${StatusIcon[data!.data.status.toUpperCase() as keyof typeof Status]} ${Icons.TRANSIT} ${StatusIcon[data?.status_new.toUpperCase() as keyof typeof Status]}`; // old -> new status icon
    message += `  ${prettify_address_alias(data!.data.name, data!.data.node)} is now ${data!.status_new == Status.ERROR ? "in " : ""}${italic(data!.status_new)}`; // new status
    const notify: NotifyData = {
      id: data!.data.user,
      msg: message,
    }
    notify && sendToDM(client, notify.id, notify.msg)
  }
  PubSub.subscribe(XXEvent.VALIDATOR_STATUS_CHANGE_DISCORD, validator_status_change);

  //  Validator Name Change
  const validator_name_change: PubSubJS.SubscriptionListener<NotifyData> = (msg, data) => {
    data && sendToDM(client, data.id, data.msg)
  }
  PubSub.subscribe(XXEvent.VALIDATOR_NAME_CHANGE, validator_name_change);

  //  Validator Commission Change
  const validator_commission_change: PubSubJS.SubscriptionListener<CommissionChange> = async (msg, data) => {
    if (data) {
      for(const record of await db.updateNodeCommission(data.cmix_id, data.commission)){
        const commission_update = `${Chain.commissionToHuman(data.commission_previous, data.chain_decimals)}${Icons.TRANSIT}${Chain.commissionToHuman(data.commission, data.chain_decimals)}`
        const retrows = new Array<string>();
        retrows.push(`${Icons.UPDATE} Validator ${prettify_address_alias(record.name, record.node, true)} commission ${data.commission_previous<data.commission? 'increased' : 'decreased'}: ${commission_update}`)
        sendToDM(client, record.user, retrows);
      }
    }
  }
  PubSub.subscribe(XXEvent.VALIDATOR_COMMISSION_CHANGE, validator_commission_change)

  //  Claim Executed
  const claim_executed: PubSubJS.SubscriptionListener<NotifyData> = (msg, data) => {
    data && sendToDM(client, data.id, data.msg);
  }
  PubSub.subscribe(XXEvent.CLAIM_EXECUTED, claim_executed)

  //  Claim Failed
  const claim_failed: PubSubJS.SubscriptionListener<NotifyData> = (msg, data) => {
    data && PubSub.publish(XXEvent.LOG_ADMIN, data.msg);
  }
  PubSub.subscribe(XXEvent.CLAIM_FAILED, claim_failed)

  // Log admin events to admin channel
  const logAdmin: PubSubJS.SubscriptionListener<string | string[]> = (msg, data) => {
    process.env.ADMIN_NOTIFY_CHANNEL && data !== undefined && sendToChannel(client, process.env.ADMIN_NOTIFY_CHANNEL, data);
  }
  PubSub.subscribe(XXEvent.LOG_ADMIN, logAdmin);



  // Notify on startup
  PubSub.publish(XXEvent.LOG_ADMIN, "Discord bot started")
}