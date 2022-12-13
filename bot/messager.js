const base64url = require('base64url');
const db = require('./db.js')
const { prettify_node, icons } = require('./utils.js')

async function send_dm(client, user_id, message) {
    client.users.fetch(user_id).then( dm => {
        dm.send(message);
    })
}

async function dm_status_change(client, node, status_new){
    var message = db.status_icon[db.sutats[node.status]] + ` ${icons.TRANSIT} ` + db.status_icon[db.sutats[status_new]];    // old -> new status icon
    message += `  ${prettify_node(node.name, node.node)} `                                                                  // pretty node name
    message += `is now ${status_new == db.status.ERROR ? 'in ' : ''}${db.sutats[status_new]}`;                              // new status

    send_dm(client, node.user, message)
}

module.exports = { send_dm, dm_status_change }