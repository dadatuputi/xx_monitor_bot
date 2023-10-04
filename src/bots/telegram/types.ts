import type { CommandMiddleware, Context } from "grammy";

export interface TelegramCommand {
    name: string,
    description: string,
    execute: CommandMiddleware<Context>,
}