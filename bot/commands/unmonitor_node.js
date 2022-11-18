const { SlashCommandBuilder } = require('discord.js');
const db = require('../db.js')

module.exports = {
	data: new SlashCommandBuilder()
		.setName('unmonitor_node')
		.setDescription('Stop monitoring a validator')
		.addStringOption(option =>
			option.setName('id')
				.setDescription('The Node ID to stop monitoring')
				.setRequired(true)
				.setMaxLength(44)
				.setMinLength(44)
				.setAutocomplete(true)),
	async execute(interaction) {
		const id = interaction.options.getString('id');
		const user = interaction.user;
		var reply_string = ''

		// Get list of users subscriptions
		const num_deleted = await db.delete_node(user.id, id)
		if (num_deleted) {
			// Deleted node successfully
			reply_string = `🗑️ You are no longer monitoring node \`${id}\`.`
		} else {
			// Node wasn't monitored
			reply_string = `💢 Error: You are not monitoring node \`${id}\`.`
		}

		await interaction.reply({ content: reply_string, ephemeral: true });
		console.log(`User interaction: ${id}: ${reply_string}`)
	},
	async autocomplete(interaction) {
		const user = interaction.user;
		const focusedValue = interaction.options.getFocused();

		// Get list of nodes monitored from db
		const monitored_nodes = await db.list_user_nodes(user.id)
		const choices = monitored_nodes.map(entry => entry.node);
		const filtered = choices.filter(choice => choice.startsWith(focusedValue));
		await interaction.respond(
			filtered.map(choice => ({ name: choice, value: choice })),
		);	
	},
};
