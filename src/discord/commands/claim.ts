import { SlashCommandBuilder, DiscordAPIError } from "discord.js";
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { prettify_address_alias, Icons } from "../../utils.js";
import type { Database } from "../../db/index.js";
import { isValidAddressXXAddress } from "../../chain/index.js";
import moment from "moment";
import { ClaimRecord } from "../../db/types.js";
import type { Document, DeleteResult, WithId } from "mongodb";

import { claim } from "../../chain/claim.js"
import { ClaimFrequency } from "../../chain/types.js";

export const data = new SlashCommandBuilder()
  .setName("claim")
  .setDescription("Claim rewards for a validator or nominator wallet")
  .addSubcommand(subcommand =>
    subcommand
      .setName('now')
      .setDescription('temporary command for testing'))
  .addSubcommand(subcommand =>
    subcommand 
      .setName('daily')
      .setDescription('Subscribe to daily payouts')
      .addStringOption((option) =>
      option
        .setName("wallet")
        .setDescription("The wallet to payout")
        .setRequired(true)
        .setMaxLength(48)
        .setMinLength(47)
        .setAutocomplete(true))
      .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("A friendly name for the wallet")))
  .addSubcommand(subcommand =>
    subcommand
      .setName('weekly')
      .setDescription('Subscribe to weekly payouts')
      .addStringOption((option) =>
      option
        .setName("wallet")
        .setDescription("The wallet to payout")
        .setRequired(true)
        .setMaxLength(48)
        .setMinLength(47)
        .setAutocomplete(true))
      .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("A friendly name for the wallet")))
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List subscribed claim wallets'))
  .addSubcommand(subcommand =>
    subcommand
      .setName('unsubscribe')
      .setDescription('Unsubscribe a wallet')
      .addStringOption((option) =>
      option
        .setName("wallet")
        .setDescription("The wallet to unsubscribe")
        .setRequired(true)
        .setMaxLength(48)
        .setMinLength(47)
        .setAutocomplete(true)));

export async function execute(
  interaction: ChatInputCommandInteraction,
  db: Database
) {
  const subcommand = interaction.options.getSubcommand();
  const user = interaction.user;
  const channel = interaction.channel
    ? interaction.channel
    : await interaction.client.channels.fetch(interaction.channelId);
  const eph = channel ? (!channel.isDMBased() ? true : false) : false; // make the message ephemeral / visible only to user if not in dm
  let reply_string = ``;

  switch (subcommand) {

    case "daily":
    case "weekly": {
      const wallet : string = interaction.options.getString("wallet", true);
      const wallet_name = interaction.options.getString("name", false);
      if (!isValidAddressXXAddress(wallet)) {
        reply_string = "Not a valid xx wallet address";
        break;
      }
      const updates = await db.addClaim(user.id, subcommand, wallet, wallet_name); // returns empty array if new record, or array of updates if not

      if (updates === null) {
        // User is already monitoring this wallet as-is
        reply_string = `${Icons.ERROR}  Error: You are already subscribed to ${subcommand} payouts for ${prettify_address_alias(wallet_name, wallet)}.`;
      }
      else if (updates.length) {
        const _replies = new Array<string>();
        updates.forEach( ( value ) => {
          _replies.push(`${Icons.SUCCESS}  Updated ${value.key} from \`${value.old}\` to \`${value.new}\``);
        });
        reply_string += _replies.join('\n');
      } else {
        const subscribed = `${Icons.WATCH}  Subscribed to ${subcommand} payouts for ${prettify_address_alias(wallet_name, wallet)}. Reporting payouts `;
        
        try {
          // if this interaction is from a channel, verify their dms are open by sending one
          if (eph) {
            await user.send(subscribed + "here.");
          }
        } catch (err) {
          // when the bot can't send a dm, an exception is thrown
          if (err instanceof DiscordAPIError) {
            console.log(err);
  
            // delete the db entry
            await db.deleteClaim(user.id, wallet);
  
            reply_string = `${Icons.ERROR}  Error: I cannot send you a Direct Message. Please resolve that and try again.`;
          } else throw err; // this is some other kind of error, pass it on
        }

        reply_string = subscribed + (eph ? "in your DMs." : "here.");
      }
      break;
    }


    case "now": {
      claim(db, interaction.client, process.env.CHAIN_RPC_ENDPOINT!, ClaimFrequency.NOW, +process.env.CLAIM_BATCH!, process.env.CLAIM_WALLET!, process.env.CLAIM_PASSWORD!, process.env.CLAIM_ENDPOINT, process.env.CLAIM_ENDPOINT_KEY);
      reply_string = "trying to claim";
      break;
    }

    case "list": {
      // Get a list of user's subscribed wallets
      const wallets: Map<string, ClaimRecord[]> = await db.listUserClaims(user.id);

      // User isn't subscribed for any wallets
      if (wallets.size <= 0) {
        reply_string += `${Icons.ERROR}  You aren't subscribed to payouts for any wallet.`
      } else {
        // Print a list of nodes
        wallets.forEach( (claims, frequency) => {
          reply_string += `You are subscribed to _${frequency}_ payouts for ${claims.length} wallet${
            claims.length > 1 ? "s" : ""
          }:\n`;
          claims.forEach((claim) => {
            const url = `<${process.env.EXPLORER_URL}/${claim.wallet}>`;
            const amount = claim.last_amount ? ` ${claim.last_amount} ` : ' ';
            const changed = claim.last_claim
              ? ` _(claimed${amount}${moment(claim.last_claim).fromNow()})_ `
              : " ";
  
            let line = `${Icons.WALLET}`; // node status icon
            line += `  ${prettify_address_alias(claim.alias, claim.wallet, true, 48)}`; // node name & id
            line += `${changed}`; // status text & time since change
            line += ` [${Icons.LINK}](${url})`; // link to dashboard page for node
  
            reply_string += line + "\n";
          });
        });
        
      }

      break;
    }


    case "unsubscribe": {
      const wallet : string = interaction.options.getString("wallet", true);

      // Get list of users subscriptions
        const [result, deleted]: [DeleteResult, WithId<ClaimRecord>[]] = await db.deleteClaim(user.id, wallet);
      if (deleted.length) {
        // Deleted node successfully
        reply_string = `${
          Icons.DELETE
        }  You are no longer subscribed to payouts for ${prettify_address_alias(deleted[0].alias, wallet)}.`;
      } else {
        // Node wasn't monitored
        reply_string = `${
          Icons.ERROR
        }  Error: You are not subscribed to payouts for ${prettify_address_alias(null, wallet)}.`;
      }
    
      break;
    }
  }


  await interaction.reply({ content: reply_string, ephemeral: eph });
  console.log(
    `User ${user.id} interaction from ${
      eph ? "channel" : "dm"
    }: claim ${subcommand}: ${reply_string}`
  );
}

export async function autocomplete(
  interaction: AutocompleteInteraction,
  db: Database
) {
  const user = interaction.user;
  const focusedValue = interaction.options.getFocused();

  // Get list of nodes monitored from db
  const monitored_nodes = await db.listUserClaimsFlat(user.id);
  const choices = monitored_nodes.map((entry) => ({
    id: entry.wallet,
    text: `${prettify_address_alias(entry.alias, entry.wallet, false)}`,
  }));
  const filtered = choices.filter((choice) =>
    choice.text.toLowerCase().includes(focusedValue.toLowerCase())
  );

  await interaction.respond(
    filtered.map((choice) => ({ name: choice.id, value: choice.id })) // setting name: choice.text should work, but it doesn't. Asked on SO: https://stackoverflow.com/q/74532512/1486966
  );
}
