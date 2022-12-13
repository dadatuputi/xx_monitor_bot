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
		const channel = interaction.channel;
		const eph = !channel.isDMBased() ? true : false;	// make the message ephemeral / visible only to user if not in dm
		var reply_string = ``
		
		const status = await db.add_node(user.id, node_id, node_name); // returns false if the user is already monitoring this node/name combination
		
		if (status) {
			// Successfully added or updated node

			if ('modifiedCount' in status) {
				// result was a record update
				reply_string = `🙌 Updated \`${node_id}\` name to \`${node_name}\`.`
			} else {
				// result was a new record
				const monitoring = `👀 Monitoring ${prettify_node(node_name, node_id)}. Reporting changes `

				try {
					// if this interaction is from a channel, verify their dms are open by sending one
					if (eph) {
						await user.send(monitoring + 'here.');
					}
				} catch (err) {		// when the bot can't send a dm, an exception is thrown
					if (err instanceof DiscordAPIError) {
						console.log(err);

						// delete the db entry
						await db.delete_node(user.id, node_id)
						
						reply_string = '💢 Error: I cannot send you a Direct Message. Please resolve that and try again.';

					} else 
						throw err; // this is some other kind of error, pass it on
				}

				reply_string = monitoring + (eph ? 'in your DMs.' : 'here');
			}

		} else {
			// User is already monitoring this node
			reply_string = `💢 Error: You are already monitoring ${prettify_node(node_name, node_id)}.`
		}

		await interaction.reply({ content: reply_string, ephemeral: eph });
		console.log(`User ${user.id} interaction from ${eph ? 'channel' : 'dm' }: monitor ${node_id}: ${reply_string}`)
	},
};
