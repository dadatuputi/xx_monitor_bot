const { SlashCommandBuilder } = require('discord.js');

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
	async execute(interaction, db) {
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
	async autocomplete(interaction, db) {
		const user = interaction.user;
		const focusedValue = interaction.options.getFocused();

		// Get list of nodes monitored from db
		const monitored_nodes = await db.list_user_nodes(user.id)
		const choices = monitored_nodes.map( entry => ({id: entry.node, text: `${entry.name} (${entry.node})`}));
		const filtered = choices.filter(choice => choice.text.toLowerCase().includes(focusedValue.toLowerCase()));

		await interaction.respond(
			filtered.map(choice => ({ name: choice.id, value: choice.id })), // setting name: choice.text should work, but it doesn't. Asked on SO: https://stackoverflow.com/q/74532512/1486966
		);
	},
};
