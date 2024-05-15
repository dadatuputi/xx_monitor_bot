import { bold, italic, inlineCode } from "discord.js";
import { Chain } from "../../../chain/index.js";
import { vars_in_env } from "../../../env-guard/index.js";

import type { KeyringPair$Json } from "@polkadot/keyring/types";
import type { Database } from "../../../db/index.js";
import type { XXContext } from "../types.js";

// env guard
import '../../../env-guard/donate.js';
import '../../../env-guard/chain.js';
import '../../../env-guard/telegram.js';

export const name = "donate"
export const description = "View information about supporting this bot"

export async function execute(ctx: XXContext, db: Database) {
    const retrows = new Array<string>();
    retrows.push(bold('Thank you for your interest in donating\\.'))
    retrows.push('')
    retrows.push(`🤖  Developer address:  💎 ${inlineCode(process.env.DONATE_WALLET!)}`)

    if (vars_in_env(['CLAIM_WALLET', 'CLAIM_PASSWORD'], 'claims', false, true)) {
        const claim_wallet = Chain.init_key(JSON.parse(process.env.CLAIM_WALLET!) as KeyringPair$Json, process.env.CLAIM_PASSWORD!)

        retrows.push(`🤖  Claim wallet address:  🪙 ${inlineCode(claim_wallet.address)}`)
    }

    // First display a list of monitored nodes, if any
    await ctx.reply(
        retrows.join('\n'),
        {
            parse_mode: "MarkdownV2",
        },
    );

}
