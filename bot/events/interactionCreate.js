const { Events } = require('discord.js');
const db = require('../db.js')

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		
		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {

			// fetch the channel if it isn't cached (dms are not usually cached)
			if (!interaction.channel) {
				await interaction.client.channels.fetch(interaction.channelId);
			}

			if (interaction.isChatInputCommand()) {
				// log action in db
				const user_id = interaction.user.id;
				await db.log_action(user_id, interaction.commandName, interaction.options.data);
				await command.execute(interaction, db);
			}
			else if (interaction.isAutocomplete()) {
				await command.autocomplete(interaction, db);
			}
		} catch (error) {
			console.error(`Error executing ${interaction.commandName}`);
			console.error(error);
		}
	},
};
