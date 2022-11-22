const { SlashCommandBuilder, DiscordAPIError } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('monitor_node')
		.setDescription('Register a new validator node to monitor')
		.addStringOption(option =>
			option.setName('id')
				.setDescription('The Node ID to monitor')
				.setRequired(true)
				.setMaxLength(44)
				.setMinLength(44)),
	async execute(interaction, db) {
		const id = interaction.options.getString('id');
		const user = interaction.user;
		var reply_string = `👀 Monitoring \`${id}\`; I will report any node issues`

		try {
			await user.send(`${reply_string} here`)

			const status = await db.add_node(user.id, id); // returns false if the user is already monitoring this node

			if (status) {
				// Successfully added node to list of monitored nodes
				reply_string = `${reply_string} in your DMs.`
			} else {
				// User is already monitoring this node
				reply_string = `💢 Error: You are already monitoring ${id}.`
			}

			await interaction.reply({ content: reply_string, ephemeral: true });
			console.log(`User interaction: ${id}: ${reply_string}`)

		} catch (err) {
			if (err instanceof DiscordAPIError) {
				console.log(err);
				await interaction.reply({ content: '💢 Error: I cannot send you a Direct Message. Please resolve that and try again.', ephemeral: true });
			} else 
				throw err;
		};
	},
};
