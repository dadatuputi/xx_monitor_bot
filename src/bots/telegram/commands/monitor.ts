import moment from "moment";
import { prettify_address_alias, Icons, engulph_fetch_claimers, pluralize, base64regex, XX_ID_LEN, code } from "../../../utils.js";
import type { Database } from "../../../db/index.js";
import base64url from "base64url";
import { Status, StatusIcon } from "../../../cmix/types.js";
import { CallbackQueryContext, InlineKeyboard } from "grammy";

// env guard
import '../../../env-guard/chain.js';
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

  const [response, num_nodes] = await list_text(db, user.id.toString())

  // Add remove button if monitoring nodes
  if (num_nodes > 0)
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
        `${code(cmix_id)} is invalid\\.\nPlease provide a valid cmix ID\\.\n_Valid IDs are 44 characters long and base64 encoded\\._`,
        {
          parse_mode: "MarkdownV2"
        })
      cmix_id = await conversation.form.text();
    }

    // get friendly name
    const name_keyboard = new InlineKeyboard()
      .text(`${Icons.HASH} Use node ID as name`, 'add-no-name')
    await ctx.reply("Please provide a friendly name for the node\\.\n_Optional \\- leave blank for none\\._",
    {
      parse_mode: "MarkdownV2",
      reply_markup: name_keyboard,
    })
    let cmix_node_name: string | null = null;
    await conversation.waitForCallbackQuery(["add-no-name"], {
      otherwise: async (ctx) => {
        cmix_node_name = await conversation.form.text();
        await ctx.answerCallbackQuery();
      }
    });
    console.log(`friendly name is: ${cmix_node_name}`)
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


async function list_text(db: Database, id: string): Promise<[string, number]> {
  // Get a list of user's monitored nodes
  const nodes = await db.listUserNodes(id, BotType.TELEGRAM);

  // User isn't monitoring any nodes
  if (nodes.length <= 0) return [`${Icons.ERROR}  You aren't monitoring any nodes\\.`, nodes.length]

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

  return [`You are monitoring ${pluralize(nodes, "node")}:\n${node_list}`, nodes.length];
}
