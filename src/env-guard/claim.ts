// if required env vars aren't provided, throw error
if ( !process.env.CHAIN_RPC_ENDPOINT 
    || !process.env.CLAIM_CRON_REGULAR 
    || !process.env.CLAIM_BATCH 
    || !process.env.CLAIM_WALLET 
    || !process.env.CLAIM_PASSWORD ) { throw new Error('Cannot load /claim command: missing chain or claim env vars') }