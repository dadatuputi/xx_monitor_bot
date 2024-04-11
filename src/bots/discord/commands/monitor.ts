import moment from "moment";
import { SlashCommandBuilder, DiscordAPIError, italic } from "discord.js";
import { prettify_address_alias, Icons, XX_ID_LEN } from "../../../utils.js";
import base64url from "base64url";

import type { Database } from "../../../db/index.js";
import type { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";
import { BotType } from "../../types.js";
import { Status, StatusIcon } from "../../../cmix/types.js";

// env guard
import '../../../env-guard/monitor.js';
import '../../../env-guard/discord.js';
import { Bot } from "grammy";


export const data = new SlashCommandBuilder()
  .setName("monitor")
  .setDescription("Manage cmix validator monitoring")
  .addSubcommand(subcommand =>
    subcommand 
      .setName('add')
      .setDescription('Monitor a cmix node')
      .addStringOption((option) =>
        option
          .setName("id")
          .setDescription("The cmix ID to monitor")
          .setRequired(true)
          .setMaxLength(XX_ID_LEN)
          .setMinLength(XX_ID_LEN)
          .setAutocomplete(true))
      .addStringOption((option) =>
        option
          .setName("name")
          .setDescription("An alias for the cmix node")
      ))
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List monitored cmix nodes')
  )
  .addSubcommand(subcommand =>
    subcommand 
      .setName('remove')
      .setDescription('Stop monitoring a cmix node')
      .addStringOption((option) =>
        option
          .setName("id")
          .setDescription("The cmix ID to stop monitoring")
          .setRequired(true)
          .setMaxLength(44)
          .setMinLength(44)
          .setAutocomplete(true)));


export async function execute(interaction: ChatInputCommandInteraction, db: Database) {
  const subcommand = interaction.options.getSubcommand();
  const user = interaction.user;
  const channel = interaction.channel
    ? interaction.channel
    : await interaction.client.channels.fetch(interaction.channelId);
  const eph = channel ? (!channel.isDMBased() ? true : false) : false; // make the message ephemeral / visible only to user if not in dm
  let reply_string = ``;

  switch (subcommand) {
    case "add": {
      const cmix_id = interaction.options.getString('id', true);
      const cmix_node_name = interaction.options.getString('name', false);

      const status = await db.addNode(user.id, BotType.DISCORD, cmix_id, cmix_node_name); // returns false if the user is already monitoring this node/name combination
      if (status !== undefined) {
        // Successfully added or updated node

        if ("modifiedCount" in status) {
          // result was a record update
          reply_string = `${Icons.SUCCESS}  Updated \`${cmix_id}\` name to \`${cmix_node_name}\`.`;
        } else {
          // result was a new record
          const monitoring = `${Icons.WATCH}  Monitoring ${prettify_address_alias(cmix_node_name, cmix_id)}. Reporting changes `;
    
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
              await db.deleteNode(user.id, BotType.DISCORD, cmix_id);
    
              reply_string = `${Icons.ERROR}  Error: I cannot send you a Direct Message. Please resolve that and try again.`;
            } else throw err; // this is some other kind of error, pass it on
          }
    
          reply_string = monitoring + (eph ? "in your DMs." : "here");
        }
      } else {
        // User is already monitoring this node
        reply_string = `${Icons.ERROR}  Error: You are already monitoring ${prettify_address_alias(cmix_node_name, cmix_id)}.`;
      }

      break;
    }


    case "remove": {
      const cmix_id = interaction.options.getString('id', true);

      // Get list of users subscriptions
      const [_, deleted] = await db.deleteNode(user.id, BotType.DISCORD, cmix_id);
      if (deleted.length) {
        // Deleted node successfully
        reply_string = `${Icons.DELETE}  You are no longer monitoring ${prettify_address_alias(deleted[0].name, cmix_id)}.`;
      } else {
        // Node wasn't monitored
        reply_string = `${Icons.ERROR}  Error: You are not monitoring ${prettify_address_alias(null, cmix_id)}.`;
      }
      break;
    }

    case "list": {
      reply_string = await buildResponseText(db, user.id)
    }
  }

  await interaction.reply({ content: reply_string, ephemeral: eph });
  const options = interaction.options.data[0].options?.map( (opt) => `${opt.name}: ${opt.value}`)
  console.log(`User ${user.id} interaction from ${eph ? "channel" : "dm"}: /${data.name} ${subcommand}${options && ` - ${options.join(', ')}`}`);
}

export async function autocomplete(interaction: AutocompleteInteraction, db: Database) {
  const user = interaction.user;
  const focusedValue = interaction.options.getFocused();

  // Get list of nodes monitored from db
  const monitored_nodes = await db.listUserNodes(user.id, BotType.DISCORD);
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

async function buildResponseText(db: Database, id: string) {
  // Get a list of user's monitored nodes
  const nodes = await db.listUserNodes(id, BotType.DISCORD);

  // User isn't monitoring any nodes
  if (nodes.length <= 0) return `${Icons.ERROR}  You aren't monitoring any nodes.`

  let node_list = "";

  // Print a list of nodes
  nodes.forEach((node) => {
    const url = `${process.env.CMIX_DASH_URL}/${base64url.fromBase64(node.node)}`;
    const changed = node.changed ? ` ${moment(node.changed).fromNow()}` : "";
    const status = node.status ? node.status : Status.UNKNOWN; // edge case for empty string status in the database

    let line = StatusIcon[status.toUpperCase() as keyof typeof Status].toString(); // node status icon
    line += `  ${prettify_address_alias(node.name, node.node)}`; // node name & id
    line += `  [${Icons.LINK}](<${url}>)`; // link to dashboard page for node
    line += `  ${italic(status+changed)}`; // status text & time since change

    node_list += line + "\n";
  });

  return `You are monitoring ${nodes.length} node${nodes.length > 1 ? "s" : ""}:\n${node_list}`;
}
