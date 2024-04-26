import { vars_in_env } from "./index.js"

const vars = [
  'CMIX_API_ENDPOINT',
  'CMIX_API_CRON',
  'CMIX_DASH_URL',
  'CHAIN_RPC_ENDPOINT',
]

vars_in_env(vars, 'monitor');
