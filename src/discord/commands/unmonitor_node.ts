import { SlashCommandBuilder } from "discord.js";
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { prettify_address_alias, Icons, XX_ID_LEN } from "../../utils.js";
import type { Database } from "../../db/index.js";
import type { Document, DeleteResult, WithId } from "mongodb";

export const data = new SlashCommandBuilder()
  .setName("unmonitor_node")
  .setDescription("Stop monitoring a validator")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription("The Node ID to stop monitoring")
      .setRequired(true)
      .setMaxLength(XX_ID_LEN)
      .setMinLength(XX_ID_LEN)
      .setAutocomplete(true)
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  db: Database
) {
  const node_id = interaction.options.getString("id", true);
  const user = interaction.user;
  const channel = interaction.channel
    ? interaction.channel
    : await interaction.client.channels.fetch(interaction.channelId);
  const eph = channel ? (!channel.isDMBased() ? true : false) : false; // make the message ephemeral / visible only to user if not in dm
  let reply_string = "";

  // Get list of users subscriptions
  const [result, deleted]: [DeleteResult, WithId<Document>[]] =
    await db.deleteNode(user.id, node_id);
  if (deleted.length) {
    // Deleted node successfully
    reply_string = `${
      Icons.DELETE
    }  You are no longer monitoring ${prettify_address_alias(deleted[0].name, node_id)}.`;
  } else {
    // Node wasn't monitored
    reply_string = `${
      Icons.ERROR
    }  Error: You are not monitoring ${prettify_address_alias(null, node_id)}.`;
  }

  await interaction.reply({ content: reply_string, ephemeral: eph });
  console.log(
    `User ${user.id} interaction from ${
      eph ? "channel" : "dm"
    }: unmonitor ${node_id}: ${reply_string}`
  );
}

export async function autocomplete(
  interaction: AutocompleteInteraction,
  db: Database
) {
  const user = interaction.user;
  const focusedValue = interaction.options.getFocused();

  // Get list of nodes monitored from db
  const monitored_nodes = await db.listUserNodes(user.id);
  const choices = monitored_nodes.map((entry) => ({
    id: entry.node,
    text: `${prettify_address_alias(entry.name, entry.node, false, XX_ID_LEN)}`,
  }));
  const filtered = choices.filter((choice) =>
    choice.text.toLowerCase().includes(focusedValue.toLowerCase())
  );

  await interaction.respond(
    filtered.map((choice) => ({ name: choice.id, value: choice.id })) // setting name: choice.text should work, but it doesn't. Asked on SO: https://stackoverflow.com/q/74532512/1486966
  );
}
