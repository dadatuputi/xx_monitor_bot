const db = require('./db.js')

async function send_dm(client, user_id, message) {
    client.users.fetch(user_id).then( dm => {
        dm.send(message);
    })
}

async function dm_status_change(client, user_id, node_id, status_old, status_new){
    var message = (status_new === db.status.OFFLINE || status_new === db.status.UNKNOWN ) ? '💢': '🟢'
    message = `${message} node \`${node_id}\` status changed from ${db.sutats[status_old]} to ${db.sutats[status_new]}`;

    send_dm(client, user_id, message)
}

module.exports = { send_dm, dm_status_change }