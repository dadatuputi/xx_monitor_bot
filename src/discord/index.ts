import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import type { Database } from "../db/index.js";
import type { DiscordClient } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function initDiscord(db: Database, token: string): Promise<void> {
  // Create a new client instance
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  }) as DiscordClient;

  // Commands initialization - from https://discordjs.guide/creating-your-bot/command-handling.html#loading-command-files
  client.commands = new Collection();

  const commandsPath = join(__dirname, "commands");
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  // Build collection of available commands from the commands directory
  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const command = await import(filePath);
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
      );
    }
  }

  // Events initialization - from https://discordjs.guide/creating-your-bot/event-handling.html#individual-event-files
  const eventsPath = join(__dirname, "events");
  const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of eventFiles) {
    const filePath = join(eventsPath, file);
    const event = await import(filePath);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, db));
    } else {
      client.on(event.name, (...args) => event.execute(...args, db));
    }
  }

  // Log in to Discord with your client's token
  client.login(token);
}
