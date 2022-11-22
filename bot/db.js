const { MongoClient } = require('mongodb');

// Initialize mongodb
console.log(`Connecting to mongo at ${process.env.MONGO_URI}`)
const client = new MongoClient(process.env.MONGO_URI);
const db = client.db('xx');
const mainnet = db.collection('mainnet');
const stats = client.db('stats');
const actions = stats.collection('actions');

// Record formats: 
// xx monitor record - one row for each node monitored
// {    user: discord_id, 
//      node: node_id,
//      name: node_name,
//      user_set_name: bool - true if user set the name, false otherwise
//      status: bool - Online=true, Offline=false, Unknown=null (this is initial status until the poller updates it),
//      changed: timestamp of last state change,
// }
//
// user action record - one row for each user action taken
// {    user: discord_id,
//      time: timestamp,
//      action: usually the command name,
//      data: data for action
// }


const status = Object.freeze({
    ONLINE: true,
    OFFLINE: false,
    UNKNOWN: null
});
const sutats = Object.freeze(Object.entries(status).reduce((acc, [key, value]) => (acc[value] = key, acc), {}))
const status_xx = Object.freeze({
    'online': status.ONLINE,
    'not currently a validator': status.OFFLINE
});


async function log_action(user_id, action, data) {
    // Add a record for an action taken by a user

    const new_doc = {user: user_id, time: new Date(), action: action, data: data}
    const options = {};
    const result = await actions.insertOne(new_doc);
    return result;
}


async function add_node(user_id, node_id, node_name=null) {
    // Add a node to the monitered node list
    
    // check if user is already monitoring this node
    const query = {user: user_id, node: node_id};
    const options = {};
    const result = await mainnet.findOne(query, options);
    if (result) {
        // User is already monitoring this node
        // check if node name is set and the same
        if (node_name && node_name !== result.name) {
            // update node name
            const update = { $set: {name: node_name, user_set_name: true}}
            return await mainnet.updateOne(query, update);
        }
        return false;
    } else {
        const new_doc = {user: user_id, node: node_id, name: node_name, user_set_name: Boolean(node_name), status: status.UNKNOWN, changed: null}
        const result = await mainnet.insertOne(new_doc);
        return result;
    }
};

async function update_node_status(node_id, status, changed) {
    // notify any users monitoring the provided node of a status change
    
    const query = {node: node_id, status: {$ne : status}};
    const options = { projection: { _id: false }};
    const result = await mainnet.find(query, options).toArray();

    if (result.length) {
        // update the value in the database
        const update = { $set: {status: status, changed: changed}}
        mainnet.updateMany(query, update);

        return result;
    }
}

async function update_node_name(node_id, new_name){
    // update all nodes with the new name, where user_set_name = false

    const query = {node: node_id, user_set_name: {$ne: true}};
    const update = { $set: {name: new_name, user_set_name: false}};
    mainnet.updateMany(query, update);

}

async function list_user_nodes(user_id) {
    // Get list of user's subscriptions

    const query = {user: user_id};
    const options = { projection: { _id: false }};
    const result = await mainnet.find(query, options).toArray();
    return result;
}

async function delete_node(user_id, node_id) {
    // Delete the given node from the user record.

    const query = {user: user_id, node: node_id};
    const options = {};
    const result = await mainnet.deleteMany(query, options);
    return result.deletedCount;
}


module.exports = { log_action, add_node, update_node_status, update_node_name, list_user_nodes, delete_node, status, sutats, status_xx }