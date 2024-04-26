import { vars_in_env } from "./index.js"

const vars = [
  'DISCORD_TOKEN',
  'APP_ID',
  'DEV_GUILD_ID'
]

vars_in_env(vars, 'discord');