const { SlashCommandBuilder, DiscordAPIError } = require('discord.js');
const { UpdateResult } = require('mongodb');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('monitor_node')
		.setDescription('Register a new validator node to monitor')
		.addStringOption(option =>
			option.setName('id')
				.setDescription('The Node ID to monitor')
				.setRequired(true)
				.setMaxLength(44)
				.setMinLength(44))
		.addStringOption(option =>
			option.setName('name')
				.setDescription('A friendly name for the node')),
	async execute(interaction, db) {
		const node_id = interaction.options.getString('id');
		const node_name = interaction.options.getString('name');
		const user = interaction.user;
		const dm_string = `👀 Starting to monitor \`${node_id}\`. I will report status changes here.`
		var reply_string = ``

		try {
			// Before adding a monitor record, ensure that we can send the user dms
			await user.send(dm_string);

			const status = await db.add_node(user.id, node_id, node_name); // returns false if the user is already monitoring this node/name combination
			const name_string = node_name? ` as \`${node_name}\``:'';
			
			if (status) {
				// Successfully added or updated node
				if ('modifiedCount' in status) {
					// result was a record update
					reply_string = `🙌 Updated \`${node_id}\` name to \`${node_name}\`.`
				} else {
					// result was a new record
					reply_string = `👀 Monitoring \`${node_id}\`${name_string}. I will report status changes in your DMs.`
				}

			} else {
				// User is already monitoring this node
				reply_string = `💢 Error: You are already monitoring \`${node_id}\`${name_string}.`
			}

			await interaction.reply({ content: reply_string, ephemeral: true });
			console.log(`User interaction: ${node_id}: ${reply_string}`)

		} catch (err) {
			if (err instanceof DiscordAPIError) {
				console.log(err);
				await interaction.reply({ content: '💢 Error: I cannot send you a Direct Message. Please resolve that and try again.', ephemeral: true });
			} else 
				throw err;
		};
	},
};
