var env = process.env.NODE_ENV || 'development';

// If in development, load & expand variables manually
if (env === 'development') {
    var dotenv = require('dotenv').config({ path: '../.env' });
    var dotenvExpand = require('dotenv-expand');
    dotenvExpand.expand(dotenv);
    console.log(process.env)

    // set mongodb uri to localhost
    process.env.MONGO_URI = `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME}:${process.env.MONGO_INITDB_ROOT_PASSWORD}@localhost:${process.env.MONGO_PORT}/`

}


// start discord.js
require('./client.js')
const db = require('./db.js');

// client.js:		loads all the event handlers for discord
// 					once discord.js client is ready, magic starts in events/ready.js
//
// events/ready.js:	fires off the poller that downloads the current nodes list, 
// 					compares it to the database of monitored nodes, and sends dms when
//					node status changes have happened.