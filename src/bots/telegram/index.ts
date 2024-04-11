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


import type { TelegramCommand, XXContext, XXConversation } from './types.js';
import { NotifyData, StatusData, XXEvent } from "../../events/types.js";
import { Status, StatusIcon } from "../../cmix/types.js";
import { Icons, prettify_address_alias } from "../../utils.js";
import { Other } from "grammy/out/core/api";


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

    // debug
    async function greeting(conversation: XXConversation, ctx: XXContext){
        console.log(await ctx.conversation)
    }
    telegram_bot.use(createConversation(greeting))
    telegram_bot.command("start", async (ctx) => await ctx.conversation.enter("greeting"));

    telegram_bot.command("fart", async (ctx) => await ctx.conversation.enter("add"))

    await telegram_bot.init();
    telegram_bot.start();
    console.log(`Telegram bot ready: ${telegram_bot.botInfo.username}`);


    // Subscribe to events
    //  Validator Status Change
    const validator_status_change: PubSubJS.SubscriptionListener<StatusData> = (msg, data) => {
        var message = `${StatusIcon[data!.data.status.toUpperCase() as keyof typeof Status]} ${Icons.TRANSIT} ${StatusIcon[data?.status_new.toUpperCase() as keyof typeof Status]}`; // old -> new status icon
        message += `  ${prettify_address_alias(data!.data.name, data!.data.node)} is now ${data!.status_new == Status.ERROR ? "in " : ""}_${data!.status_new}_`; // new status
        const notify: NotifyData = {
            id: data!.data.user,
            msg: message,
        }
        notify && sendToDM(telegram_bot, notify.id, notify.msg, 
        {
            parse_mode: "MarkdownV2"
        });
    }
    PubSub.subscribe(XXEvent.VALIDATOR_STATUS_CHANGE_TELEGRAM, validator_status_change);
}

async function sendToDM(bot: Bot<XXContext>, user_id: string | number, message: string | string[], other?: Other<RawApi, "sendMessage", "text" | "chat_id"> | undefined): Promise<any> {
    if (Array.isArray(message)) {
        for (const msg of message) {
            await bot.api.sendMessage(user_id, msg, other)
        }
    }
    else
        await bot.api.sendMessage(user_id, message, other)
}