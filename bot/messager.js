const db = require('./db.js')

async function send_dm(client, user_id, message) {
    client.users.fetch(user_id).then( dm => {
        dm.send(message);
    })
}

async function dm_status_change(client, node, status_new){    
    var message = (status_new === db.status.ONLINE) ? '🟢': '🔴';                                               // set the status icon by status
    message += node.name? ` \`${node.name}\` -`: '';                                                             // if node_name is provided, use that first
    message += ` \`${node.node}\` is ${db.sutats[status_new]} (was ${db.sutats[node.status]})`;                // print new status

    send_dm(client, node.user, message)
}

module.exports = { send_dm, dm_status_change }