import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  BaseInteraction,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  BaseGuildTextChannel,
} from "discord.js";
import moment from "moment";
import base64url from "base64url";
import { prettify_address_alias, Icons } from "../../utils.js";
import { Database, Status, StatusIcon } from "../../db/index.js";
import type { DeleteResult, Document, WithId } from "mongodb";

function buildResponseButtons(
  db: Database,
  nodes: WithId<Document>[],
  unmonitor_buttons: boolean = true
) {
  let rows = new Array<ActionRowBuilder<ButtonBuilder>>();
  const MAX_BUTTON_TEXT_LEN = 80; // 80 is value from exception thrown when string is too long

  nodes.forEach((node) => {
    const row = new ActionRowBuilder<ButtonBuilder>(); // let's build on this puppy

    // node status - disabled (just used to show node id)
    const button_style =
      node.status === Status.UNKNOWN
        ? ButtonStyle.Secondary
        : node.status === Status.ONLINE
        ? ButtonStyle.Success
        : ButtonStyle.Danger;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${node.node}-status`)
        .setDisabled(true)
        .setLabel((node.status as string).toUpperCase())
        .setStyle(button_style)
    );

    // node id button - disabled
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${node.node}-text`)
        .setDisabled(true)
        .setLabel(
          prettify_address_alias(node.name, node.node, false, MAX_BUTTON_TEXT_LEN)
        )
        .setStyle(ButtonStyle.Primary)
    );

    // unmonitor button
    if (unmonitor_buttons) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(node.node)
          .setLabel("Unmonitor")
          .setStyle(ButtonStyle.Danger)
      );
    }

    // dashboard link
    const url = `<${process.env.CMIX_DASH_URL}/${base64url.fromBase64(node.node)}>`;
    row.addComponents(
      new ButtonBuilder()
        .setURL(url)
        .setLabel("Dashboard")
        .setStyle(ButtonStyle.Link)
    );

    rows.push(row);
  });

  return rows;
}

function buildResponseText(db: Database, nodes: WithId<Document>[]) {
  let reply_string = "";

  // Print a list of nodes
  nodes.forEach((node) => {
    const url = `${process.env.CMIX_DASH_URL}/${base64url.fromBase64(
      node.node
    )}`;
    const changed = node.changed
      ? ` since ${moment(node.changed).fromNow()}`
      : "";
    const status: keyof typeof Status = node.status
      ? node.status.toUpperCase()
      : Status.UNKNOWN.toUpperCase(); // edge case for empty string status in the database

    let line = StatusIcon[status].toString(); // node status icon
    line += `  ${prettify_address_alias(node.name, node.node)}`; // node name & id
    line += ` _(${status}${changed})_`; // status text & time since change
    line += `  [${Icons.LINK}](${url})`; // link to dashboard page for node

    reply_string += line + "\n";
  });

  return reply_string;
}

async function buildResponse(
  db: Database,
  user_id: string,
  fancy: boolean = true,
  unmonitor_buttons: boolean = true
) {
  // Get a list of user's monitored nodes
  const nodes = await db.listUserNodes(user_id);

  // User isn't monitoring any nodes
  if (nodes.length <= 0) {
    return {
      text: `${Icons.ERROR}  You aren't monitoring any nodes.`,
      components: [],
    };
  }

  const reply_string = `You are monitoring ${nodes.length} node${
    nodes.length > 1 ? "s" : ""
  }:\n`;

  // User is monitoring 1-5 nodes AND the fancy flag is set - show buttons
  if (nodes.length > 0 && nodes.length <= 5 && fancy) {
    return {
      text: reply_string,
      components: buildResponseButtons(db, nodes, unmonitor_buttons),
    };
  }
  // Build a codeblock if we have results > 5 or fancy flag is unset
  else {
    return {
      text: `${reply_string}${buildResponseText(db, nodes)}`,
      components: [],
    };
  }
}

export const data = new SlashCommandBuilder()
  .setName("list_monitored_nodes")
  .setDescription("Display a list of validators that you are monitoring")
  .addStringOption((option) =>
    option
      .setName("format")
      .setDescription(
        "Choose the format of the validator list. Default is Text."
      )
      .addChoices(
        { name: "Text", value: "text" },
        { name: "Buttons", value: "buttons" }
      )
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
  db: Database
) {
  const user = interaction.user;
  const format = interaction.options.getString("format");
  const fancy = format == "buttons" ? true : false;
  const channel = (
    interaction.channel
      ? interaction.channel
      : await interaction.client.channels.fetch(interaction.channelId)
  ) as BaseGuildTextChannel;
  const eph = channel ? (!channel.isDMBased() ? true : false) : false; // make the message ephemeral / visible only to user if not in dm

  let { text, components } = await buildResponse(db, user.id, fancy); // build fancy list (if plain not set by user)
  await interaction.reply({
    content: text,
    components: components,
    ephemeral: eph,
    flags: MessageFlags.SuppressEmbeds,
  });

  // if we have button components, make sure we have the right callback
  if (components.length) {
    // button event handling - https://discordjs.guide/interactions/buttons.html#updating-the-button-message

    const filter = (i: BaseInteraction) => i.user.id === user.id;
    const collector = channel.createMessageComponentCollector({
      filter,
      time: 45000,
      dispose: true,
    });

    collector.on("collect", async (i) => {
      // if button was clicked, delete it from user and update message
      const [result, deleted]: [DeleteResult, WithId<Document>[]] =
        await db.deleteNode(user.id, i.customId);
      if (deleted.length) {
        // Deleted node successfully
        let reply_string = `${
          Icons.DELETE
        }  You are no longer monitoring ${prettify_address_alias(
          deleted[0].name,
          i.customId
        )}.`;
        let { text, components } = await buildResponse(db, user.id);
        await i.update({ content: text, components: components });
        await interaction.followUp({ content: reply_string, ephemeral: eph });
      }
    });

    collector.on("end", async () => {
      // Disable the unmonitor buttons because we're done listening for them
      let { text, components } = await buildResponse(db, user.id, true, false);
      await interaction.editReply({ content: text, components: components });
    });
  }

  console.log(
    `User ${user.id} interaction from ${eph ? "channel" : "dm"}: listed nodes`
  );
}
