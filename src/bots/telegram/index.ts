import { Bot, CommandMiddleware, Context } from 'grammy';
import { Database } from '../../db';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from "node:fs";

import type { TelegramCommand } from './types';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function initTelegram(db: Database, token: string) {
    // Create a new client instance
    const bot = new Bot(token)

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
                commands.push({ 
                    name: command.name, 
                    description: command.description, 
                    execute: command.execute
                });
            } else {
                throw new Error(`[WARNING] The command at ${filePath} was not loaded: missing a required "name", "description", or "execute" property. Continuing`)
            }
        } catch (e) {
            console.log(e);
        }
    }

    bot.api.setMyCommands(commands.map( (command) => ({command: command.name, description: command.description})))
    for(const command of commands) {
        bot.command(command.name, command.execute)
    }

    bot.start()

    console.log("Telegram Initialized")
}