const { SlashCommandBuilder } = require('discord.js');
const { prettify_node } = require('../utils.js')


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
		const node_id = interaction.options.getString('id');
		const user = interaction.user;
		const channel = interaction.channel;
		const eph = !channel.isDMBased() ? true : false;	// make the message ephemeral / visible only to user if not in dm
		var reply_string = ''

		// Get list of users subscriptions
		const result = await db.delete_node(user.id, node_id)
		if (result.deletedCount) {
			const deleted = result.deleted[0];
			// Deleted node successfully
			reply_string = `🗑️ You are no longer monitoring node ${prettify_node(deleted.name, node_id)}.`
		} else {
			// Node wasn't monitored
			reply_string = `💢 Error: You are not monitoring node ${prettify_node(null, node_id)}.`
		}

		await interaction.reply({ content: reply_string, ephemeral: eph });
		console.log(`User ${user.id} interaction from ${eph ? 'channel' : 'dm' }: unmonitor ${node_id}: ${reply_string}`);
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
