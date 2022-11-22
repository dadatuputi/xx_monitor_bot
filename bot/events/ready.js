const { Events, ActivityType } = require('discord.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);

		// configure client with info from env
		// Set bot username
		if (process.env.BOT_USERNAME) {
			client.user.setUsername(process.env.BOT_USERNAME);
		}

		// Set bot status
		if (process.env.BOT_STATUS) {
			client.user.setActivity(process.env.BOT_STATUS, { type: ActivityType.Listening });
		}

		// start poller now that client is ready
		require('../poller.js')(client)
	},
};
