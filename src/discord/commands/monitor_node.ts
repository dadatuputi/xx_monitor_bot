import { SlashCommandBuilder, DiscordAPIError } from "discord.js";
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { prettify_address_alias, Icons } from "../../utils.js";
import type { Database } from "../../db/index.js";

export const data = new SlashCommandBuilder()
  .setName("monitor_node")
  .setDescription("Register a new validator node to monitor")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription("The Node ID to monitor")
      .setRequired(true)
      .setMaxLength(44)
      .setMinLength(44)
      .setAutocomplete(true)
  )
  .addStringOption((option) =>
    option.setName("name").setDescription("A friendly name for the node")
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  db: Database
) {
  const node_id = interaction.options.getString("id", true);
  const node_name = interaction.options.getString("name", false);
  const user = interaction.user;
  const channel = interaction.channel
    ? interaction.channel
    : await interaction.client.channels.fetch(interaction.channelId);
  const eph = channel ? (!channel.isDMBased() ? true : false) : false; // make the message ephemeral / visible only to user if not in dm
  let reply_string = ``;

  const status = await db.addNode(user.id, node_id, node_name); // returns false if the user is already monitoring this node/name combination

  if (status) {
    // Successfully added or updated node

    if ("modifiedCount" in status) {
      // result was a record update
      reply_string = `${Icons.SUCCESS}  Updated \`${node_id}\` name to \`${node_name}\`.`;
    } else {
      // result was a new record
      const monitoring = `${Icons.WATCH}  Monitoring ${prettify_address_alias(node_name, node_id)}. Reporting changes `;

      try {
        // if this interaction is from a channel, verify their dms are open by sending one
        if (eph) {
          await user.send(monitoring + "here.");
        }
      } catch (err) {
        // when the bot can't send a dm, an exception is thrown
        if (err instanceof DiscordAPIError) {
          console.log(err);

          // delete the db entry
          await db.deleteNode(user.id, node_id);

          reply_string = `${Icons.ERROR}  Error: I cannot send you a Direct Message. Please resolve that and try again.`;
        } else throw err; // this is some other kind of error, pass it on
      }

      reply_string = monitoring + (eph ? "in your DMs." : "here");
    }
  } else {
    // User is already monitoring this node
    reply_string = `${
      Icons.ERROR
    }  Error: You are already monitoring ${prettify_address_alias(node_name, node_id)}.`;
  }

  await interaction.reply({ content: reply_string, ephemeral: eph });
  console.log(
    `User ${user.id} interaction from ${
      eph ? "channel" : "dm"
    }: monitor ${node_id}: ${reply_string}`
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
    text: `${prettify_address_alias(entry.name, entry.node, false)}`,
  }));
  const filtered = choices.filter((choice) =>
    choice.text.toLowerCase().includes(focusedValue.toLowerCase())
  );

  await interaction.respond(
    filtered.map((choice) => ({ name: choice.id, value: choice.id })) // setting name: choice.text should work, but it doesn't. Asked on SO: https://stackoverflow.com/q/74532512/1486966
  );
}
