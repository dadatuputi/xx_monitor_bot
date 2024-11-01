import moment from "moment";
import { SlashCommandBuilder, DiscordAPIError } from "discord.js";
import { prettify_address_alias, Icons, engulph_fetch_claimers, pluralize, XX_ID_LEN, XX_WALLET_LEN_MIN, XX_WALLET_LEN_MAX, code } from "../../../utils.js";
import { Chain, isValidXXAddress } from "../../../chain/index.js";
import { ClaimRecord } from "../../../db/types.js";
import { ClaimConfig, ClaimFrequency, ExternalStakerConfig } from "../../../chain/types.js";
import { Claim } from "../../../chain/claim.js";
import { BotType, Command } from "../../types.js";

import type { DeleteResult, WithId } from "mongodb";
import type { Database } from "../../../db/index.js";
import type { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";
import type { KeyringPair$Json } from "@polkadot/keyring/types";

// env guard
import '../../../env-guard/chain.js';
import '../../../env-guard/telegram.js';
import { InlineKeyboard, Keyboard } from "grammy";
import { XXContext, XXConversation } from "../types.js";
import { Other } from "grammy/out/core/api.js";
import { StatusIcon } from "../../../cmix/types.js";

export const name = "claim"
export const description = "Subscribe to regular payouts"

export async function execute(ctx: XXContext, db: Database) {
    const user = ctx.from;

    // Build inline keyboard with additional options - https://grammy.dev/plugins/keyboard#inline-keyboards
    let inlineKeyboard = new InlineKeyboard()
        .text(`${Icons.ADD} Add / Edit Claim`, `${name}-add`)

    const [response, num_claims] = await list_text(db, user!.id.toString())

    // Add remove button if monitoring nodes
    if (num_claims > 0)
        inlineKeyboard.text(`${Icons.DELETE} Remove Claim`, `${name}-remove`)
    // Add 'claim all' button if in dev mode
    if (process.env.NODE_ENV === "development") {
        inlineKeyboard.text(`${Icons.DEV} All`, `${name}-all`)
    }

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
                // REMOVE CLAIM
                const wallet = data.split('-').at(-1)
                // validate node id
                if (wallet && isValidXXAddress(wallet)) {
                    console.log(`Deleting ${wallet}`)

                    const user = ctx.from!.id;
                    let reply_string = "";

                    // Get list of users subscriptions
                    const [_, deleted] = await db.deleteClaim(user.toString(), BotType.TELEGRAM, wallet);
                    if (deleted.length) {
                        // Deleted claim successfully
                        reply_string = `${Icons.DELETE}  You are no longer subscribed to ${deleted[0].frequency} payouts for ${prettify_address_alias(deleted[0].alias, wallet)}.`;
                    } else {
                        // Wallet wasn't being claimed by user
                        reply_string = `${Icons.ERROR}  Error: You are not subscribed to payouts for ${prettify_address_alias(null, wallet)}.`;
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
                    await ctx.reply(`Error - can't delete claim for ${wallet}`)
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
    all: async (ctx: XXContext, db: Database) => {
        await ctx.conversation.enter(`${name}-all`);
        await ctx.answerCallbackQuery(); // clean up loading animation
    }
};

export const conversations = {
    add: async (conversation: XXConversation, ctx: XXContext, db: Database) => {

        // Weekly or Daily Chooser
        let frequencies = ["Daily", "Weekly"]
        const freq_keyboard = new Keyboard()
            .text("Daily").row()
            .text("Weekly")
        if (process.env.NODE_ENV === "development") { // add a claim now subcommand when in dev mode
            freq_keyboard.row().text("Now")
            frequencies.push("Now")
        }
        freq_keyboard.resized().oneTime();

        ctx.reply(
            "Please select how often you want your claim to run\\.",
            {
                parse_mode: "MarkdownV2",
                reply_markup: freq_keyboard
            }
        )

        let frequency = await conversation.form.text()
        while (!frequencies.includes(frequency)) {
            ctx.reply(
                `${code(frequency)} is invalid\\.\nPlease select a valid frequency from ${code(frequencies.join(', '))}\\.`,
                {
                    parse_mode: "MarkdownV2",
                    reply_markup: freq_keyboard
                })
            frequency = await conversation.form.text();
        }
        
        // Get Wallet
        ctx.reply(
            "Please provide a wallet to initiate rewards payouts\\.",
            {
                parse_mode: "MarkdownV2"
            })
        let wallet = await conversation.form.text()
        while (!isValidXXAddress(wallet)) {
            ctx.reply(
                `${code(wallet)} is not a valid substrate wallet\\.\nPlease provide a valid wallet address\\.`,
                {
                    parse_mode: "MarkdownV2"
                })
            wallet = await conversation.form.text();
        }

        if (frequency === "Now") {
            async function doit(): Promise<void> {
                const cfg: ClaimConfig = {
                    frequency: ClaimFrequency.IMMEDIATE,
                    batch: +process.env.CLAIM_BATCH!,
                    wallet: Chain.init_key(JSON.parse(process.env.CLAIM_WALLET!) as KeyringPair$Json, process.env.CLAIM_PASSWORD!),
                    stakers: [{
                        user_id: ctx.from!.id.toString(),
                        wallet: wallet,
                        bot_type: BotType.TELEGRAM
                    }],
                    dry_run: true
                };

                const chain = await Chain.create(process.env.CHAIN_RPC_ENDPOINT!);

                await (await Claim.create(db, chain, cfg)).submit();
                await chain.api.disconnect();
            }

            doit()
            ctx.reply(
                `${Icons.ERROR}  Executing claim now, please standby\\.`,
                {
                    parse_mode: "MarkdownV2"
                }
            );

        } else {

            // get friendly name
            const name_keyboard = new InlineKeyboard()
                .text(`${Icons.HASH} Use wallet address as name`, 'add-no-name')
            await ctx.reply("Please provide a friendly name for the wallet\\.\n_Optional \\- leave blank for none\\._",
                {
                    parse_mode: "MarkdownV2",
                    reply_markup: name_keyboard,
                })
            let wallet_name: string | null = null;
            const response = await conversation.waitForCallbackQuery(["add-no-name"], {
                otherwise: async (ctx) => {
                    wallet_name = await conversation.form.text();
                    await ctx.answerCallbackQuery();
                }
            });
            console.log(`friendly name is: ${wallet_name}`)
            // TODO check if empty button works

            // returns false if the user is already monitoring this wallet/frequency combination
            const status = await conversation.external(() => db.addClaim(ctx.from!.id.toString(), BotType.TELEGRAM, frequency.toLowerCase(), wallet, wallet_name));
            if (status !== null) {
                // Successfully added or updated node
                if ("modifiedCount" in status) {
                    // result was a record update
                    ctx.reply(
                        `${Icons.SUCCESS}  Updated \`${code(wallet)}\` to ${prettify_address_alias(wallet_name, frequency, true)}\\.`,
                        {
                            parse_mode: "MarkdownV2"
                        });
                } else {
                    // result was a new record
                    ctx.reply(
                        `${Icons.WATCH}  Claiming ${prettify_address_alias(wallet_name, wallet)} ${frequency.toLowerCase()}\\. Reporting changes here\\.`,
                        {
                            parse_mode: "MarkdownV2"
                        });
                }
            } else {
                // User is already claiming this wallet
                ctx.reply(
                    `${Icons.ERROR}  Error: You are already claiming ${prettify_address_alias(wallet_name, wallet)}\\.`,
                    {
                        parse_mode: "MarkdownV2"
                    });
            }
        }
    },
    remove: async (conversation: XXConversation, ctx: XXContext, db: Database) => {
        const claims = await conversation.external(() => db.listUserClaims(ctx.from!.id.toString(), BotType.TELEGRAM));

        // Build inline keyboard with additional options - https://grammy.dev/plugins/keyboard#inline-keyboards
        let inlineKeyboard = new InlineKeyboard()
        for (const wallet of claims) {
            inlineKeyboard = inlineKeyboard.row()
                .text(`${Icons.DELETE} ${Icons.WALLET} _${wallet.frequency.toUpperCase()}_ ${prettify_address_alias(wallet.name, wallet.node, false)}`, `${name}-remove-${wallet.node}`)
        }
        // First display a list of monitored nodes, if any
        await ctx.reply(
            "Select a claim to remove:",
            {
                parse_mode: "MarkdownV2",
                reply_markup: inlineKeyboard,
            },
        );
    },
    all: async (conversation: XXConversation, ctx: XXContext, db: Database) => {
        async function doit(): Promise<void> {
            const cfg: ClaimConfig = {
                frequency: ClaimFrequency.IMMEDIATE,
                batch: +process.env.CLAIM_BATCH!,
                wallet: Chain.init_key(JSON.parse(process.env.CLAIM_WALLET!) as KeyringPair$Json, process.env.CLAIM_PASSWORD!),
                dry_run: true
            };

            const chain = await Chain.create(process.env.CHAIN_RPC_ENDPOINT!);

            await (await Claim.create(db, chain, cfg)).submit();
            await chain.api.disconnect();
        }

        doit()
        ctx.reply(
            `${Icons.ERROR}  Executing claim now, please standby\\.`,
            {
                parse_mode: "MarkdownV2"
            }
        );
    }
}

async function list_text(db: Database, id: string): Promise<[string, number]> {
    // Get a list of user's monitored nodes
    const claims = await db.listUserClaims(id, BotType.TELEGRAM);

    // User isn't monitoring any nodes
    if (claims.length <= 0) return [`${Icons.ERROR}  You aren't subscribed to payouts for any wallet\\.`, claims.length]

    const retrows = new Array<string>();
    const freqs = claims.reduce((acc, claim) => acc.add(claim.frequency), new Set<string>());
    const wallets = Array.from(freqs).reduce<Map<string, ClaimRecord[]>>((acc, freq) => acc.set(freq, claims.filter((claim) => claim.frequency === freq)), new Map<string, ClaimRecord[]>());


    // Print a list of nodes
    wallets.forEach((wallet, frequency) => {
        retrows.push(`You are subscribed to _${frequency}_ payouts for ${pluralize(claims, 'wallet')}:`)

        claims.forEach((claim) => {
            const url = `${process.env.EXPLORER_URL}/${claim.wallet}`;
            const amount = claim.last_amount ? ` ${claim.last_amount} ` : ' ';
            const changed = claim.last_claim
                ? ` _(claimed${amount}${moment(claim.last_claim).fromNow()})_ `
                : " ";

            let line = `${Icons.WALLET}`; // node status icon
            line += `  ${prettify_address_alias(claim.alias, claim.wallet, true, 24)}`; // node name & id
            line += `${changed}`; // status text & time since change
            line += ` [${Icons.LINK}](<${url}>)`; // link to dashboard page for node

            retrows.push(line);
        });

    });

    return [retrows.join('\n'), claims.length];
}
