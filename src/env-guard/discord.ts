import { guard } from "./index.js"

const vars = [
  'DISCORD_TOKEN',
  'APP_ID',
  'DEV_GUILD_ID'
]

guard(vars, 'discord');