import { Bot, Context, RawApi, session } from "grammy";
import { Database } from '../../db/index.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from "node:fs";
import { BN } from "@polkadot/util/bn/bn";
import { CommissionEventData, EventReceiver } from '../../events/types.js'

import {
    type Conversation,
    type ConversationFlavor,
    conversations,
    createConversation,
  } from "@grammyjs/conversations";

import PubSub from 'pubsub-js';


import type { TelegramCommand, XXContext } from './types.js';
import { ClaimEventData, NameEventData, StatusEventData, XXEvent } from "../../events/types.js";
import { Status, StatusIcon } from "../../cmix/types.js";
import { Icons, pluralize, prettify_address_alias } from "../../utils.js";

import type { ParseMode } from "grammy/types";
import { BotType } from "../types.js";
import { Chain } from "../../chain/index.js";
import { ClaimLegend } from "../../chain/claim.js";
import { codeBlock, spoiler } from "discord.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function initTelegram(db: Database, token: string) {
    console.log("Initializing Telegram")

    // Create a new client instance
    const telegram_bot = new Bot<XXContext>(token);
    telegram_bot.use(session({ initial: () => ({}) }));
    telegram_bot.use(conversations<XXContext>());

    const commands = new Array<TelegramCommand>();
    const commandsPath = join(__dirname, "commands");
    const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

    // Build collection of available commands from the commands directory
    for (const file of commandFiles) {
        // each command file determines whether it will load by throwing an error when it can't
        try {
            const filePath = join(commandsPath, file);
            const command = (await import(filePath)) as TelegramCommand;
            // Set a new item in the Collection with the key as the command name and the value as the exported module
            if ("name" in command && "description" in command && "execute" in command) {
                commands.push(command);
            } else {
                throw new Error(`[WARNING] The command at ${filePath} was not loaded: missing a required "name", "description", or "execute" property. Continuing`)
            }
        } catch (e) {
            console.log(e);
        }
    }

    telegram_bot.api.setMyCommands(commands.map( (command) => ({command: command.name, description: command.description})))
    for(const command of commands) {
        telegram_bot.command(command.name, (ctx) => command.execute(ctx, db)) // register command with callback
        for (const convo in command.conversations) {   // add all conversations to the bot before starting
            console.log(`Registering Telegram conversation ${convo} for ${command.name}`)
            telegram_bot.use(createConversation<XXContext>( (conversation, ctx) => command.conversations![convo](conversation, ctx, db), `${command.name}-${convo}`))
        }
        for (const callback in command.callbacks) { // add all callbacks to the bot before starting
            console.log(`Registering Telegram callback ${callback} for ${command.name}`)
            telegram_bot.callbackQuery(`${command.name}-${callback}`, (ctx) => command.callbacks![callback](ctx, db))
        }

        // Default callback handler
        command.callbacks && 
        command.callbacks.default !== undefined && 
        telegram_bot.on("callback_query:data").filter((ctx) => ctx.callbackQuery.data.startsWith(command.name), async (ctx) => {
            command.callbacks!.default(ctx, db)
        })
    }

    await telegram_bot.init();
    telegram_bot.start();
    const receiver = new TelegramEventReceiver(telegram_bot, db);

    console.log(`Telegram bot ready: ${telegram_bot.botInfo.username}`);
    
}

class TelegramEventReceiver extends EventReceiver {

    private readonly botType: BotType = BotType.TELEGRAM
    private bot: Bot<XXContext>;
    private db: Database;

    constructor(bot: Bot<XXContext>, db: Database) {
        super();
        this.bot = bot;
        this.db = db;

        // Subscribe to events
        //  Validator Name Change
        PubSub.subscribe([XXEvent.MONITOR_NAME_NEW, this.botType].join("."), this.handleMonitorNameNew);
        //  Validator Status Change
        PubSub.subscribe([XXEvent.MONITOR_STATUS_NEW, this.botType].join("."), this.handleMonitorStatusNew);
        //  Validator Commission Change
        PubSub.subscribe([XXEvent.MONITOR_COMMISSION_NEW, this.botType].join("."), this.handleMonitorCommissionNew)
        // Claim Executed Notification
        PubSub.subscribe([XXEvent.CLAIM_EXECUTED, this.botType].join("."), this.handleClaimExecuted)

    }

    async sendDM(user_id: string | number, message: string | string[]): Promise<void> {

        const telegram_message_format =
        {
            parse_mode: "MarkdownV2" as ParseMode
        }

        if (Array.isArray(message)) {
            for (const msg of message) {
                await this.bot.api.sendMessage(user_id, msg, telegram_message_format)
            }
        }
        else
            await this.bot.api.sendMessage(user_id, message, telegram_message_format)
    }

    handleMonitorStatusNew: PubSubJS.SubscriptionListener<StatusEventData> = (msg, data) => {
        if (data) {
            var message = `${StatusIcon[data.old_status.toUpperCase() as keyof typeof Status]} ${Icons.TRANSIT} ${StatusIcon[data.new_status.toUpperCase() as keyof typeof Status]}`; // old -> new status icon
            message += `  ${prettify_address_alias(data.node_name, data.node_id, true, 30)} is now ${data.new_status == Status.ERROR ? "in " : ""}_${data.new_status}_`; // new status
            this.sendDM(data.user_id, message);
        } else log_empty_event(msg)
    }

    handleMonitorNameNew: PubSubJS.SubscriptionListener<NameEventData> = (msg, data) => {
        const validator_name_change: PubSubJS.SubscriptionListener<NameEventData> = (msg, data) => {
            if (data){
                const retrows = new Array<string>();
        
                if (!data.wallet_address) {
                retrows.push(`${Icons.UPDATE} Monitored node ${prettify_address_alias(null, data.node_id, true)} name updated: \`${data.old_name ? data.old_name : 'empty'}\` ${Icons.TRANSIT} \`${data.node_name!}\``)
                } else {
                retrows.push(`${Icons.UPDATE} Validator ${prettify_address_alias(null, data.wallet_address, true, 48)} alias updated: \`${data.old_name ? data.old_name : 'empty'}\` ${Icons.TRANSIT} \`${data.node_name!}\``)
                }
                this.sendDM(data.user_id, retrows)
        
            } else log_empty_event(msg)
        }
    }

    handleMonitorCommissionNew: PubSubJS.SubscriptionListener<CommissionEventData> = async (msg, data) => {
        if (data) {
            const commission_update = `${Chain.commissionToHuman(data.commission_data.commission_previous)}${Icons.TRANSIT}${Chain.commissionToHuman(data.commission_data.commission)}`
            const retrows = new Array<string>();
            retrows.push(`${Icons.UPDATE} Validator ${prettify_address_alias(data.node_name, data.node_id, true)} commission ${data.commission_data.commission_previous < data.commission_data.commission? 'increased' : 'decreased'}: ${commission_update}`)
            this.sendDM(data.user_id, retrows);
          }
    }

    handleClaimExecuted: PubSubJS.SubscriptionListener<ClaimEventData> = async (msg, data) => {
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
        this.sendDM(event_data.user_id, retrows)
    }

    handleLogAdmin: PubSubJS.SubscriptionListener<string | string[]> = (msg, data) => {

    }

}