const { MongoClient } = require('mongodb');

// manually expand the environmental variables
var dotenv = require('dotenv').config({ path: '../.env' });
var dotenvExpand = require('dotenv-expand');
dotenvExpand.expand(dotenv);

// set mongodb uri to localhost
process.env.MONGO_URI = `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME}:${process.env.MONGO_INITDB_ROOT_PASSWORD}@localhost:${process.env.MONGO_PORT}/`

// Initialize mongodb
console.log(`Connecting to mongo at ${process.env.MONGO_URI}`)
const client = new MongoClient(process.env.MONGO_URI);
const db = client.db('xx');
const mainnet = db.collection('mainnet');


const status = Object.freeze({
    ONLINE: 'online',
    OFFLINE: 'offline',
    UNELECTED: 'unelected',
    UNKNOWN: null
});

const status_old = Object.freeze({
    ONLINE: true,
    OFFLINE: false,
    UNKNOWN: null
});


// go through each old entry and update to the new
(async function(){
    for (const s of Object.entries(status_old)) {
        const query = {status: {$eq : s[1]}};
        const update = { $set: {status: status[s[0]]}}
        await mainnet.updateMany(query, update);
        console.log('updated', s[0]);
    }
    client.close();
})();