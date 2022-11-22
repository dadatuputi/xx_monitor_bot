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
			if (interaction.isChatInputCommand()) {
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
