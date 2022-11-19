// Polls the dashboard API and gets the entire list of nodes every ENDPOINT_POLLING seconds
let request = require('request');
const async = require('async');
const db = require('./db.js');
const { dm_status_change } = require('./messager.js');

const endpoint = process.env.ENDPOINT;
const endpoint_retries = process.env.ENDPOINT_RETRIES;
const endpoint_polling = process.env.ENDPOINT_POLLING * 1000;

request = request.defaults({
    endpoint,
    headers: {
        'accept': 'application/json; charset=utf-8'
    }
});

console.log("*** API Polling Startred ***")

module.exports = function(client) {

    async.forever( // https://caolan.github.io/async/v3/docs.html#forever
        function(next) {
            poll(next);
        },
        function(err) {
            if (err) {
                console.log(err);
            } else {
                console.log("*** API Polling Stopped ***");
            }
        }
    )

    function poll(next) {
        const start_time = new Date()
        request({
            method: 'GET',
            uri: endpoint
        }, async function (error, response, body) {
            if (error) {
                return whilstCallback(error)
            } else if (response.statusCode !== 200) {
                return whilstCallback(`non-200 response:\nresponse: ${response}\nbody: ${body}`)
            } else {
                // Process the results
                const json_body = JSON.parse(body)
                parse_nodes(json_body.nodes)
            
                // wait for the rest of the polling interval
                const time_to_wait = endpoint_polling - (new Date() - start_time)
                console.log(`downloaded node data: ${json_body.nodes.length} nodes (${body.length} bytes), waiting ${time_to_wait/1000}s until next poll`)
                await new Promise(resolve => setTimeout(resolve, time_to_wait)); 
                next()
            }
        });
    }

    async function parse_nodes(nodes) {
        // take a list of nodes from the API and notify on changes
        
        // step through each node result and send its status to the monitoring db
        nodes.forEach( async (xx_node) => {
            
            // udpate database with new status
            var new_status = db.status_xx[xx_node.status]
            var node_id = xx_node.id
            var changed = new Date();
            var result = await db.update_node_status(xx_node.id, new_status, changed)

            // notify users of status change
            if (result) {             
                console.log(`notifying ${result.length} users of node ${node_id} status change to ${new_status} at ${changed}`)
                result.forEach( async (entry) => {
                    // Send a notification to the user
                    dm_status_change(client, entry.user, node_id, entry.status, new_status)
                });
            }
        });
    }
}
