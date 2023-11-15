import { SlashCommandBuilder, bold, italic, inlineCode } from "discord.js";
import { Chain } from "../../../chain/index.js";

import type { ChatInputCommandInteraction } from "discord.js";
import type { KeyringPair$Json } from "@polkadot/keyring/types";
import type { Database } from "../../../db/index.js";

// env guard
import '../../../env-guard/donate.js';
import '../../../env-guard/claim.js';
import '../../../env-guard/discord.js';

export const data = new SlashCommandBuilder()
  .setName("donate")
  .setDescription("View information about supporting this bot")

export async function execute(interaction: ChatInputCommandInteraction, db: Database) {
  const user = interaction.user;
  const channel = interaction.channel
    ? interaction.channel
    : await interaction.client.channels.fetch(interaction.channelId);
  const eph = channel ? (!channel.isDMBased() ? true : false) : false; // make the message ephemeral / visible only to user if not in dm

  const claim_wallet = Chain.init_key(JSON.parse(process.env.CLAIM_WALLET!) as KeyringPair$Json, process.env.CLAIM_PASSWORD!)

  const retrows = new Array<string>();
  retrows.push(bold('Thank you for your interest in donating.'))
  retrows.push('')
  retrows.push(`    Donate to the  🤖  developer:  💎 ${inlineCode(process.env.DONATE_WALLET!)}`)
  retrows.push('')
  retrows.push(`    Donate to the  🤖  claim wallet:  🪙 ${inlineCode(claim_wallet.address)}`)

  // send the wallet details immediately
  await interaction.reply({ content: retrows.join('\n'), ephemeral: eph });
  console.log(`User ${user.id} interaction from ${eph ? "channel" : "dm"}: /${data.name}`);

  // update with the wallet balance
  const chain = await Chain.create(process.env.CHAIN_RPC_ENDPOINT!);
  const claim_balance = chain.xx_bal_string(await chain.wallet_balance(claim_wallet))
  retrows.push(`${retrows.pop()} ${italic(`bal: ${claim_balance}`)}`)
  await interaction.editReply({ content: retrows.join('\n') });
}
