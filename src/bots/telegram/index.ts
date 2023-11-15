import { Bot, Context, session } from "grammy";
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

import type { TelegramCommand, XXContext, XXConversation } from './types';


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

    async function greeting(conversation: XXConversation, ctx: XXContext){
        console.log("pffft")
    }

    telegram_bot.api.setMyCommands(commands.map( (command) => ({command: command.name, description: command.description})))
    for(const command of commands) {
        telegram_bot.command(command.name, (ctx) => command.execute(ctx, db))
        for (const callback in command.callbacks) { // add all callbacks to the bot before starting
            console.log(`Registering Telegram callback ${callback} for ${command.name}`)
            telegram_bot.callbackQuery(callback, (ctx) => command.callbacks![callback](ctx, db))
        }
        for (const convo in command.convos) {   // add all conversations to the bot before starting
            console.log(`Registering Telegram conversation ${convo} for ${command.name}`)
            telegram_bot.use(createConversation<XXContext>( (conversation, ctx) => command.convos![convo](conversation, ctx, db), convo))
        }

        
    }
    telegram_bot.use(createConversation(greeting))
    telegram_bot.command("start", async (ctx) => await ctx.conversation.enter("greeting"));

    await telegram_bot.init();
    telegram_bot.start();
    console.log(`Telegram bot ready: ${telegram_bot.botInfo.username}`);
}