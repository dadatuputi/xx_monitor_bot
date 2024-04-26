import { vars_in_env } from "./index.js"

const vars = [
  'CHAIN_RPC_ENDPOINT',
  'CLAIM_CRON_DAILY',
  'CLAIM_BATCH',
  'EXPLORER_URL',
]

vars_in_env(vars, 'chain');
