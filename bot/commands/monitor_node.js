const { SlashCommandBuilder, DiscordAPIError } = require('discord.js');
const { UpdateResult } = require('mongodb');
const { prettify_node } = require('../utils.js')


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

		const status = await db.add_node(user.id, node_id, node_name); // returns false if the user is already monitoring this node/name combination
		
		if (status) {
			// Successfully added or updated node

			if ('modifiedCount' in status) {
				// result was a record update
				reply_string = `🙌 Updated \`${node_id}\` name to \`${node_name}\`.`
			} else {
				// result was a new record
				// If this interaction came from a channel, ensure that we can send the user dms by sending them a dm
				if (interaction.channel) {
					try {
						const monitoring = `👀 Monitoring ${prettify_node(node_name, node_id)}. Reporting changes `
						await user.send(monitoring + 'here.');
						reply_string = monitoring + 'in your DMs.';
					} catch (err) {
						if (err instanceof DiscordAPIError) {
							console.log(err);
							reply_string = '💢 Error: I cannot send you a Direct Message. Please resolve that and try again.';
							
							// delete the monitor entry in the db so we don't monitor it until the user sorts out the dm issue
							await db.delete_node(user.id, node_id)
						} else 
							throw err; // this is some other kind of error
					}
				}
			}

		} else {
			// User is already monitoring this node
			reply_string = `💢 Error: You are already monitoring ${prettify_node(node_name, node_id)}.`
		}

		await interaction.reply({ content: reply_string, ephemeral: eph });
		console.log(`User ${user.id} interaction from ${interaction.channel ? 'channel' : 'dm' }: monitor ${node_id}: ${reply_string}`)
	},
};
