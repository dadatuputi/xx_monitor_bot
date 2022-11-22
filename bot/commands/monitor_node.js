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
		const eph = interaction.channel ? true : false;		// set the message to ephemeral if this is in a channel
		var reply_string = ``

		// If this is from a channel, ensure that we can send the user dms
		if (interaction.channel) {
			try {
				await user.send(`👀 Starting to monitor \`${node_id}\`. I will report status changes here.`);
			} catch (err) {
				if (err instanceof DiscordAPIError) {
					console.log(err);
					await interaction.reply({ content: '💢 Error: I cannot send you a Direct Message. Please resolve that and try again.', ephemeral: eph });
				} else 
					throw err;
			}
		}

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

		await interaction.reply({ content: reply_string, ephemeral: eph });
		console.log(`User interaction: ${node_id}: ${reply_string}`)

	},
};
