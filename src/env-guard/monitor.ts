import { guard } from "./index.js"

const vars = [
  'CMIX_API_ENDPOINT',
  'CMIX_API_CRON',
  'CMIX_DASH_URL',
  'CHAIN_RPC_ENDPOINT',
]

guard(vars, 'monitor');
