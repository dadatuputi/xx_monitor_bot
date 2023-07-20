import { guard } from "./index.js"

const vars = [
  'CHAIN_RPC_ENDPOINT',
  'CLAIM_CRON_DAILY',
  'CLAIM_BATCH',
  'CLAIM_WALLET',
  'CLAIM_PASSWORD',
  'EXPLORER_URL',
]

guard(vars, 'claims');
