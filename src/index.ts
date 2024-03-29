import { startAllClaiming } from "./chain/claim.js";
import { startListeningCommission, testChain } from "./chain/index.js";
import { startPolling } from "./cmix/index.js";
import { Database } from "./db/index.js";
import { initDiscord } from "./discord/index.js";

var env = process.env.NODE_ENV || "development";
console.log(`NODE_ENV: ${env}`);
if (env === "development") {
  console.log(process.env);
}

// // initialize database
if (!process.env.MONGO_URI) { throw new Error('Missing env var MONGO_URI, exiting') }
const db: Database = await Database.connect(process.env.MONGO_URI);

// start cmix cron
// todo - consolidate /monitor commands into single command, then handle command loading like claim i.e. throw error when env vars aren't available. 
(async () => {
    await import('./env-guard/monitor.js')
    startPolling(db, process.env.CMIX_API_ENDPOINT!, process.env.CMIX_API_CRON!);
  }
)();

// start chain listener
(async () => {
    await import('./env-guard/claim.js')
    await testChain()
    startAllClaiming(db, process.env.CHAIN_RPC_ENDPOINT!);
    startListeningCommission(process.env.CHAIN_RPC_ENDPOINT!);
  }
)();


// start bots
(async () => {
    //  start discord.js
    (async () => {
      await import('./env-guard/discord.js')
      initDiscord(db, process.env.DISCORD_TOKEN!); 
    })();

    // todo: start telegram

  }
)();  

// discord/index.js: loads all the event handlers for discord
//  once discord.js client is ready, magic starts in events/ready.js
//
// discord/events/ready.js:	fires off the poller that downloads the current nodes list,
//  compares it to the database of monitored nodes, and sends dms when
//  node status changes have happened.

