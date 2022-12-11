const base64url = require('base64url');
const db = require('./db.js')
const { prettify_node } = require('./utils.js')

async function send_dm(client, user_id, message) {
    client.users.fetch(user_id).then( dm => {
        dm.send(message);
    })
}

async function dm_status_change(client, node, status_new){
    var message = (status_new === db.status.ONLINE) ? '🟢': '🔴';                                           // set the status icon by status
    message += ` ${prettify_node(node.name, node.node)} entered ${db.sutats[status_new]} state`;             // print new status

    send_dm(client, node.user, message)
}

module.exports = { send_dm, dm_status_change }