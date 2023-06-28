import { Events } from "discord.js";
import type { CommandInteraction } from "discord.js";
import type { Database } from "../../db/index.js";
import type { DiscordClient } from "../types.js";

export const name = Events.InteractionCreate;

export async function execute(interaction: CommandInteraction, db: Database) {
  const command = (interaction.client as DiscordClient).commands.get(
    interaction.commandName
  );

  if (!command) {
    console.error(`No bot command matching /${interaction.commandName} was found.`);
    return;
  }

  try {
    // fetch the channel if it isn't cached (dms are not usually cached)
    if (!interaction.channel) {
      await interaction.client.channels.fetch(interaction.channelId);
    }

    if (interaction.isChatInputCommand()) {
      // log action in db
      const user_id = interaction.user.id;
      await db.logAction(
        user_id,
        interaction.commandName,
        interaction.options.data.toString()
      );
      await command.execute(interaction, db);
    } else if (interaction.isAutocomplete()) {
      await command.autocomplete(interaction, db);
    }
  } catch (error) {
    console.error(`Error executing bot command /${interaction.commandName}`);
    console.error(error);
  }
}
