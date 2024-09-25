import { Events, ActivityType, inlineCode, italic, spoiler, codeBlock } from "discord.js";
import { Icons, pluralize, prettify_address_alias } from "../../../utils.js";
import { Chain } from "../../../chain/index.js";
import { ClaimEventData, CommissionEventData, NameEventData, StatusEventData, XXEvent } from "../../../events/types.js";
import { sendToChannel, sendToDM } from "../messager.js";
import PubSub from 'pubsub-js';

import type { CommissionChange } from "../../../chain/types.js";
import type { Database } from "../../../db/index.js";
import type { DiscordClient } from "../types.js";
import { CmixNode, Status, StatusIcon } from "../../../cmix/types.js";
import { MonitorRecord } from "../../../db/types.js";
import { Data } from "@polkadot/types";
import { BotType } from "../../types.js";
import { BN } from "@polkadot/util";
import { ClaimLegend } from "../../../chain/claim.js";

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
  const validator_status_change: PubSubJS.SubscriptionListener<StatusEventData> = (msg, data) => {
    if (data) {
      var message = `${StatusIcon[data.old_status.toUpperCase() as keyof typeof Status]} ${Icons.TRANSIT} ${StatusIcon[data.new_status.toUpperCase() as keyof typeof Status]}`; // old -> new status icon
      message += `  ${prettify_address_alias(data.node_name, data.node_id)} is now ${data.new_status == Status.ERROR ? "in " : ""}${italic(data.new_status)}`; // new status
      sendToDM(client, data.user_id, message)
    } else log_empty_event(msg)
  }
  PubSub.subscribe([XXEvent.MONITOR_STATUS_NEW, BotType.DISCORD].join("."), validator_status_change);

  //  Validator Name Change
  const validator_name_change: PubSubJS.SubscriptionListener<NameEventData> = (msg, data) => {
    if (data){
      const retrows = new Array<string>();

      if (!data.wallet_address) {
        retrows.push(`${Icons.UPDATE} Monitored node ${prettify_address_alias(null, data.node_id, true)} name updated: ${inlineCode(data.old_name ? data.old_name : 'empty')}${Icons.TRANSIT}${inlineCode(data.node_name!)}`)
        retrows.push(`${Icons.UPDATE} ${spoiler(`Use command ${inlineCode('/monitor add')} to set your own alias and stop name updates from the dashboard`)}`)
      } else {
        retrows.push(`${Icons.UPDATE} Validator ${prettify_address_alias(null, data.wallet_address, true, 48)} alias updated: ${inlineCode(data.old_name ? data.old_name : 'empty')}${Icons.TRANSIT}${inlineCode(data.node_name!)}`)
        retrows.push(`${Icons.UPDATE} ${spoiler(`Use command ${inlineCode('/claim')} to set your own alias and stop name updates from the dashboard`)}`)
      }
      sendToDM(client, data.user_id, retrows)

    } else log_empty_event(msg)
  }
  PubSub.subscribe([XXEvent.MONITOR_NAME_NEW, BotType.DISCORD].join("."), validator_name_change);
  
  //  Validator Commission Change
  const validator_commission_change: PubSubJS.SubscriptionListener<CommissionEventData> = async (_, data) => {
    if (data) {
      const commission_update = `${Chain.commissionToHuman(data.commission_data.commission_previous)}${Icons.TRANSIT}${Chain.commissionToHuman(data.commission_data.commission)}`
      const retrows = new Array<string>();
      retrows.push(`${Icons.UPDATE} Validator ${prettify_address_alias(data.node_name, data.node_id, true)} commission ${data.commission_data.commission_previous < data.commission_data.commission? 'increased' : 'decreased'}: ${commission_update}`)
      sendToDM(client, data.user_id, retrows);
    }
  }
  PubSub.subscribe([XXEvent.MONITOR_COMMISSION_NEW, BotType.DISCORD].join("."), validator_commission_change)

  
  const notify_claim_results: PubSubJS.SubscriptionListener<ClaimEventData> = async (msg, data) => {
    const event_data = data!
    const retrows = new Array<string>();
  
    // header is always the same
    const wallets = Array.from(event_data.wallets.keys())
    const claim_total_xx = event_data.chain.xx_bal_usd_string(event_data.claim_total, await event_data.chain.price_promise)
    retrows.push(`${event_data.success ? `${event_data.frequency.symbol} claim results: ${claim_total_xx}` : 'failed '}: ${pluralize(event_data.eras, 'era')} | ${pluralize(wallets, 'wallet')}`);
    
    // msg format
    // Daily claim results: 100 xx ($100.00): 1 eras | 6 wallets
    //     alias / xxxxxx:
    //         Era xxx: xx/$ as validator|nominator of xxxxx
    const codeblock = new Array<string>();
    for (const [wallet, stakers_notify] of event_data.wallets) {
      // build the top wallet string: alias / xxxxxx:
      const alias: string | undefined | null = stakers_notify.find( (claim_notify) => Boolean(claim_notify.alias) )?.alias;
      codeblock.push(`${Icons.WALLET} ${prettify_address_alias(alias, wallet, false, 30)}:`);
      
      for (const staker_notify of stakers_notify) {
        // build the era line: Era xxx: xx
        const _nominator_string = staker_notify.isValidator ? "" : `${Icons.NOMINATOR}⭆${Icons.VALIDATOR} ${staker_notify.validators.map( (validator) => prettify_address_alias(null, validator, false, 9)).join(", ")}`;
        const _val_nom_info = `as ${staker_notify.isValidator ? Icons.VALIDATOR : _nominator_string}`
        const _era_total_xx = event_data.chain.xx_bal_usd_string(staker_notify.payout, await event_data.chain.price_promise)
        codeblock.push(`  Era ${staker_notify.era}: ${_era_total_xx} ${_val_nom_info}`);
      };
    };

    const _total_fee: BN = [ ...event_data.wallets.values() ].flat().reduce( (acc, val) => acc.add(val.fee ?? new BN(0)), new BN(0));
    codeblock.push("");
    codeblock.push(`  Fee: ${event_data.chain.xx_bal_string(_total_fee)} of ${event_data.chain.xx_bal_string(event_data.claim_wallet_bal)} in ${Icons.BOT} wallet`)
    if (event_data.claim_wallet_bal.lt(new BN(10000*(10**Chain.decimals)))) codeblock.push(`  To support this bot, type /donate`) // print donate pitch if wallet is < 10000 xx
    codeblock.push("");
  
    codeblock.push(ClaimLegend);

    retrows.push(spoiler(codeBlock(codeblock.join('\n'))))
    sendToDM(client, data!.user_id, retrows)
  }
  PubSub.subscribe([XXEvent.CLAIM_EXECUTED, BotType.DISCORD].join("."), notify_claim_results)


  // Log admin events to admin channel
  const logAdmin: PubSubJS.SubscriptionListener<string | string[]> = (msg, data) => {
    process.env.ADMIN_NOTIFY_CHANNEL && data !== undefined && sendToChannel(client, process.env.ADMIN_NOTIFY_CHANNEL, data);
  }
  PubSub.subscribe(XXEvent.LOG_ADMIN, logAdmin);



  // Notify on startup
  PubSub.publish(XXEvent.LOG_ADMIN, "Discord bot started")
}