import { Bot, Context, RawApi, session } from "grammy";
import { Database } from '../../db';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from "node:fs";

import {
    type Conversation,
    type ConversationFlavor,
    conversations,
    createConversation,
  } from "@grammyjs/conversations";

import PubSub from 'pubsub-js';


import type { TelegramCommand, XXContext } from './types.js';
import { NameEventData, StatusEventData, XXEvent } from "../../events/types.js";
import { Status, StatusIcon } from "../../cmix/types.js";
import { Icons, prettify_address_alias } from "../../utils.js";
import { Other } from "grammy/out/core/api";
import { BotType } from "../types.js";


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

    // // debug
    // async function greeting(conversation: XXConversation, ctx: XXContext){
    //     console.log(await ctx.conversation)
    // }
    // telegram_bot.use(createConversation(greeting))
    // telegram_bot.command("start", async (ctx) => await ctx.conversation.enter("greeting"));

    // telegram_bot.command("fart", async (ctx) => await ctx.conversation.enter("add"))

    await telegram_bot.init();
    telegram_bot.start();
    console.log(`Telegram bot ready: ${telegram_bot.botInfo.username}`);

    // if (data) {
    //     var message = `${StatusIcon[data.old_status.toUpperCase() as keyof typeof Status]} ${Icons.TRANSIT} ${StatusIcon[data.new_status.toUpperCase() as keyof typeof Status]}`; // old -> new status icon
    //     message += `  ${prettify_address_alias(data.node_name, data.node_id)} is now ${data.new_status == Status.ERROR ? "in " : ""}${italic(data.new_status)}`; // new status
    //     sendToDM(client, data.user_id, message)
    //   } else log_empty_event(msg)

    // Subscribe to events
    //  Validator Status Change
    const validator_status_change: PubSubJS.SubscriptionListener<StatusEventData> = (msg, data) => {
        if (data) {
            var message = `${StatusIcon[data.old_status.toUpperCase() as keyof typeof Status]} ${Icons.TRANSIT} ${StatusIcon[data.new_status.toUpperCase() as keyof typeof Status]}`; // old -> new status icon
            message += `  ${prettify_address_alias(data.node_name, data.node_id)} is now ${data.new_status == Status.ERROR ? "in " : ""}_${data.new_status}_`; // new status
            sendToDM(telegram_bot, data.user_id, message);
        } else log_empty_event(msg)
    }
    PubSub.subscribe([XXEvent.MONITOR_STATUS_NEW, BotType.TELEGRAM].join("."), validator_status_change);


    //  Validator Name Change
    const validator_name_change: PubSubJS.SubscriptionListener<NameEventData> = (msg, data) => {
        if (data){
            const retrows = new Array<string>();
      
            if (!data.wallet_address) {
              retrows.push(`${Icons.UPDATE} Monitored node ${prettify_address_alias(null, data.node_id, true)} name updated: \`${data.old_name ? data.old_name : 'empty'}\`${Icons.TRANSIT}\`${data.node_name!}\``)
            } else {
              retrows.push(`${Icons.UPDATE} Validator ${prettify_address_alias(null, data.wallet_address, true, 48)} alias updated: \`${data.old_name ? data.old_name : 'empty'}\`${Icons.TRANSIT}\`${data.node_name!}\``)
            }
            sendToDM(telegram_bot, data.user_id, retrows)
      
        } else log_empty_event(msg)
    }
    PubSub.subscribe([XXEvent.MONITOR_NAME_NEW, BotType.TELEGRAM].join("."), validator_name_change);

    // //  Validator Commission Change
    // const validator_commission_change: PubSubJS.SubscriptionListener<CommissionChange> = async (msg, data) => {
    //     if (data) {
    //     for(const record of await db.updateNodeCommission(data.cmix_id, data.commission)){
    //         const commission_update = `${Chain.commissionToHuman(data.commission_previous, data.chain_decimals)}${Icons.TRANSIT}${Chain.commissionToHuman(data.commission, data.chain_decimals)}`
    //         const retrows = new Array<string>();
    //         retrows.push(`${Icons.UPDATE} Validator ${prettify_address_alias(record.name, record.node, true)} commission ${data.commission_previous<data.commission? 'increased' : 'decreased'}: ${commission_update}`)
    //         sendToDM(client, record.user, retrows);
    //     }
    //     }
    // }
    // PubSub.subscribe(XXEvent.VALIDATOR_COMMISSION_CHANGE_TELEGRAM, validator_commission_change)
}

async function sendToDM(bot: Bot<XXContext>, user_id: string | number, message: string | string[]): Promise<any> {

    if (Array.isArray(message)) {
        for (const msg of message) {
            await bot.api.sendMessage(user_id, msg, telegram_message_format)
        }
    }
    else
        await bot.api.sendMessage(user_id, message, telegram_message_format)
}

export const telegram_message_format: Other<RawApi, "sendMessage", "text" | "chat_id"> | undefined =
{
    parse_mode: "MarkdownV2"
}