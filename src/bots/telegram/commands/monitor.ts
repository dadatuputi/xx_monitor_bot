import moment from "moment";
import { prettify_address_alias, Icons, engulph_fetch_claimers, EXTERNAL, pluralize, base64regex, XX_ID_LEN } from "../../../utils.js";
import type { Database } from "../../../db/index.js";
import base64url from "base64url";
import { Status, StatusIcon } from "../../../cmix/types.js";
import { CallbackQueryContext, InlineKeyboard } from "grammy";

// env guard
import '../../../env-guard/claim.js';
import { BotType } from "../../types.js";
import { XXContext, XXConversation } from "../types.js";



export const name = "monitor"
export const description = "Manage cmix validator monitoring"

export async function execute(ctx: XXContext, db: Database) {
  const user = ctx.from;
  if (user === undefined) {
    await ctx.reply("Who are you!");
    return;
  }

  // Build inline keyboard with additional options - https://grammy.dev/plugins/keyboard#inline-keyboards
  let inlineKeyboard = new InlineKeyboard()
    .text(`${Icons.ADD} Add / Edit Node`, `${name}-add`)

  const response = await buildResponseText(db, user.id.toString())

  // Add remove button if monitoring nodes
  if (response.split(/\r\n|\r|\n/).length > 1)
    inlineKeyboard.text(`${Icons.DELETE} Remove Node`, `${name}-remove`)

  // First display a list of monitored nodes, if any
  await ctx.reply(
    response,
      { 
        parse_mode: "MarkdownV2", 
        reply_markup: inlineKeyboard,
      },
  );

}


export const callbacks = {
  default: async (ctx: XXContext, db: Database) => {
    if (ctx.callbackQuery?.data) {
      const data = ctx.callbackQuery.data;
      if (data.startsWith(`${name}-remove-`)) {
        // REMOVE MONITORED NODE
        const node = data.split('-').at(-1)
        // validate node id
        if (node && node.length === XX_ID_LEN && base64regex.test(node)) {
          console.log(`Deleting ${node}`)

          const user = ctx.from!.id;
          let reply_string = "";
  
          // Get list of users subscriptions
          const [_, deleted] = await db.deleteNode(user.toString(), BotType.TELEGRAM, node);
          if (deleted.length) {
            // Deleted node successfully
            reply_string = `${Icons.DELETE}  You are no longer monitoring ${prettify_address_alias(deleted[0].name, node)}\\.`;
          } else {
            // Node wasn't monitored
            reply_string = `${Icons.ERROR}  Error: You are not monitoring ${prettify_address_alias(null, node)}\\.`;
          }
  
          await ctx.reply(
            reply_string,
              { 
                parse_mode: "MarkdownV2", 
              },
          );

          // Print new list of monitored nodes
          await execute(ctx, db);
        } else {
          await ctx.reply(`Error - can't delete node ${node}`)
        }
      }
    }

    await ctx.answerCallbackQuery(); // clean up loading animation
  },
  add: async (ctx: XXContext, db: Database) => {
    await ctx.conversation.enter(`${name}-add`);
    await ctx.answerCallbackQuery(); // clean up loading animation
  },
  remove: async (ctx: XXContext, db: Database) => {
    await ctx.conversation.enter(`${name}-remove`);
    await ctx.answerCallbackQuery(); // clean up loading animation
  },
};

export const conversations = {
  add: async (conversation: XXConversation, ctx: XXContext, db: Database) => {
    
    // Get cmix ID
    ctx.reply(
      "Please provide a valid cmix ID\\.\n_Valid IDs are 44 characters long and base64 encoded\\._",
      {
        parse_mode: "MarkdownV2"
      })
    let cmix_id = await conversation.form.text()
    while (!(cmix_id.length === XX_ID_LEN && base64regex.test(cmix_id))) {
      ctx.reply(
        "Please provide a valid cmix ID\\.\n_Valid IDs are 44 characters long and base64 encoded\\._",
        {
          parse_mode: "MarkdownV2"
        })
      cmix_id = await conversation.form.text();
    }

    // get friendly name
    ctx.reply("Please provide a friendly name for the node.")    
    const cmix_node_name = await conversation.form.text()
    // returns false if the user is already monitoring this node/name combination
    const status = await conversation.external(() => db.addNode(ctx.from!.id.toString(), BotType.TELEGRAM, cmix_id, cmix_node_name));
    if (status !== undefined) {
      // Successfully added or updated node
      if ("modifiedCount" in status) {
        // result was a record update
        ctx.reply(
          `${Icons.SUCCESS}  Updated \`${cmix_id}\` name to \`${cmix_node_name}\`\\.`,
          {
            parse_mode: "MarkdownV2"
          });
      } else {
        // result was a new record
        ctx.reply(
          `${Icons.WATCH}  Monitoring ${prettify_address_alias(cmix_node_name, cmix_id)}\\. Reporting changes here\\.`,
          {
            parse_mode: "MarkdownV2"
          });
      }
    } else {
      // User is already monitoring this node
      ctx.reply(
        `${Icons.ERROR}  Error: You are already monitoring ${prettify_address_alias(cmix_node_name, cmix_id)}\\.`,
        {
          parse_mode: "MarkdownV2"
        });
    }
  },
  remove: async (conversation: XXConversation, ctx: XXContext, db: Database) => {
    const nodes = await conversation.external(() => db.listUserNodes(ctx.from!.id.toString(), BotType.TELEGRAM));
    
    // Build inline keyboard with additional options - https://grammy.dev/plugins/keyboard#inline-keyboards
    let inlineKeyboard = new InlineKeyboard()
    for(const node of nodes) {
      const status = StatusIcon[node.status.toUpperCase() as keyof typeof Status].toString();
      inlineKeyboard = inlineKeyboard.row()
      .text(`${Icons.DELETE} ${status} ${prettify_address_alias(node.name, node.node, false)}`, `${name}-remove-${node.node}`)
    }
    // First display a list of monitored nodes, if any
    await ctx.reply(
      "Select a node to remove:",
        { 
          parse_mode: "MarkdownV2", 
          reply_markup: inlineKeyboard,
        },
    );
  }
}


async function buildResponseText(db: Database, id: string): Promise<string> {
  // Get a list of user's monitored nodes
  const nodes = await db.listUserNodes(id, BotType.TELEGRAM);

  // User isn't monitoring any nodes
  if (nodes.length <= 0) return `${Icons.ERROR}  You aren't monitoring any nodes\\.`

  let node_list = "";

  // Print a list of nodes
  nodes.forEach((node) => {
    const url = `${process.env.CMIX_DASH_URL}/${base64url.fromBase64(node.node)}`;
    const changed = node.changed ? ` ${moment(node.changed).fromNow()}` : "";
    const status = node.status ?? Status.UNKNOWN; // edge case for empty string status in the database

    let line = StatusIcon[status.toUpperCase() as keyof typeof Status].toString(); // node status icon
    line += `  ${prettify_address_alias(node.name, node.node)}`; // node name & id
    line += `  [${Icons.LINK}](${url})`; // link to dashboard page for node
    line += `  _${status+changed}_`; // status text & time since change

    node_list += line + "\n";
  });

  return `You are monitoring ${nodes.length} node${nodes.length > 1 ? "s" : ""}:\n${node_list}`;
}


//         export async function execute(interaction: ChatInputCommandInteraction, db: Database) {
//           const subcommand = interaction.options.getSubcommand();
//           const user = interaction.user;
//           const channel = interaction.channel
//             ? interaction.channel
//             : await interaction.client.channels.fetch(interaction.channelId);
//           const eph = channel ? (!channel.isDMBased() ? true : false) : false; // make the message ephemeral / visible only to user if not in dm
//           let reply_string = ``;
        
//           switch (subcommand) {
//             case "add": {
//               const cmix_id = interaction.options.getString('id', true);
//               const cmix_node_name = interaction.options.getString('name', false);
        
//   
//                 }
//               } else {
//                 // User is already monitoring this node
//                 reply_string = `${Icons.ERROR}  Error: You are already monitoring ${prettify_address_alias(cmix_node_name, cmix_id)}.`;
//               }
        
//               break;
//             }
        
        
//             case "remove": {
//               const cmix_id = interaction.options.getString('id', true);
        
//               // Get list of users subscriptions
//               const [_, deleted] = await db.deleteNode(user.id, cmix_id);
//               if (deleted.length) {
//                 // Deleted node successfully
//                 reply_string = `${Icons.DELETE}  You are no longer monitoring ${prettify_address_alias(deleted[0].name, cmix_id)}.`;
//               } else {
//                 // Node wasn't monitored
//                 reply_string = `${Icons.ERROR}  Error: You are not monitoring ${prettify_address_alias(null, cmix_id)}.`;
//               }
//               break;
//             }
        
//             case "list": {
//               reply_string = await buildResponseText(db, user.id)
//             }
//           }
        
//           await interaction.reply({ content: reply_string, ephemeral: eph });
//           const options = interaction.options.data[0].options?.map( (opt) => `${opt.name}: ${opt.value}`)
//           console.log(`User ${user.id} interaction from ${eph ? "channel" : "dm"}: /${data.name} ${subcommand}${options && ` - ${options.join(', ')}`}`);
//         }
        
//         export async function autocomplete(interaction: AutocompleteInteraction, db: Database) {
//           const user = interaction.user;
//           const focusedValue = interaction.options.getFocused();
        
//           // Get list of nodes monitored from db
//           const monitored_nodes = await db.listUserNodes(user.id);
//           const choices = monitored_nodes.map((entry) => ({
//             id: entry.node,
//             text: `${prettify_address_alias(entry.name, entry.node, false)}`,
//           }));
//           const filtered = choices.filter((choice) =>
//             choice.text.toLowerCase().includes(focusedValue.toLowerCase())
//           );
        
//           await interaction.respond(
//             filtered.map((choice) => ({ name: choice.id, value: choice.id })) // setting name: choice.text should work, but it doesn't. Asked on SO: https://stackoverflow.com/q/74532512/1486966
//           );
//         }
        
        
        