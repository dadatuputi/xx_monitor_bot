import { startAllClaiming } from "./chain/claim.js";
import { startListeningCommission, testChain } from "./chain/index.js";
import { startPolling } from "./cmix/index.js";
import { Database } from "./db/index.js";
import { initDiscord } from "./bots/discord/index.js";
import { initTelegram } from "./bots/telegram/index.js";
import { vars_in_env } from "./env-guard/index.js";

var env = process.env.NODE_ENV || "development";
console.log(`NODE_ENV: ${env}`);
if (env === "development") {
  console.log(process.env);
}

// // initialize database
if (!process.env.MONGO_URI) { throw new Error('Missing env var MONGO_URI, exiting') }
const db: Database = await Database.connect(process.env.MONGO_URI);
db.update_bot_column(); // add bot column to old dbs - will eventually remove

// start cmix cron
// todo - consolidate /monitor commands into single command, then handle command loading like claim i.e. throw error when env vars aren't available. 
(async () => {
    await import('./env-guard/monitor.js')
    startPolling(db, process.env.CMIX_API_ENDPOINT!, process.env.CMIX_API_CRON!);
  }
)();

// start chain listener
(async () => {
    await import('./env-guard/chain.js')
    await testChain()
    startListeningCommission(process.env.CHAIN_RPC_ENDPOINT!);

    if (vars_in_env(['CLAIM_WALLET', 'CLAIM_PASSWORD'], 'claims', false, true)){
      startAllClaiming(db, process.env.CHAIN_RPC_ENDPOINT!);
    } else {
      console.log("Claiming disabled due to missing env vars.")
    }
  }
)();


// start bots
(async () => {
    //  start discord.js
    (async () => {
      await import('./env-guard/discord.js')
      initDiscord(db, process.env.DISCORD_TOKEN!); 

      // discord/index.js: loads all the event handlers for discord
      //  once discord.js client is ready, magic starts in events/ready.js
      //
      // discord/events/ready.js:	fires off the poller that downloads the current nodes list,
      //  compares it to the database of monitored nodes, and sends dms when
      //  node status changes have happened.
    })();

    // start telegram
    initTelegram(db, process.env.TELEGRAM_TOKEN!);
  }
)();  




