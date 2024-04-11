import type { CallbackQueryContext, CommandContext, CommandMiddleware, Context } from "grammy";
import { Database } from "../../db";
import { Conversation, ConversationFlavor } from "@grammyjs/conversations";

export interface TelegramCommand {
    name: string,
    description: string,
    execute: (ctx: CommandContext<Context>, db: Database) => Promise<void>,
    callbacks?:  { [key: string]: (ctx: XXContext, db: Database) => Promise<void> },
    conversations?: { [key: string]: (conversation: XXConversation, ctx: XXContext, db: Database) => Promise<void> },
}

export type XXContext = Context & ConversationFlavor;
export type XXConversation = Conversation<XXContext>;