const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../db.js');
const moment = require('moment');
const base64url = require('base64url');

async function build_response(user_id, unmonitor_buttons = true) {

	// Get a list of user's monitored nodes
	const user_nodes = await db.list_user_nodes(user_id)

	// User isn't monitoring any nodes
	if (user_nodes.length <= 0) {
		return {text: `💢 You aren't monitoring any nodes.`, components: []}
	} 
	// User is monitoring 1-5 nodes - show buttons <= DISABLED FOR NOW, UNTIL I CAN MANAGE THE UNMONITOR BUTTON BETTER
	else if (user_nodes.length > 0 && user_nodes.length <= 5) {
		var rows = [];
	
		user_nodes.forEach( (node) => {
			// node id button (disabled, just used to show node id)
			const row = new ActionRowBuilder()
				.addComponents(
					new ButtonBuilder()
						.setCustomId(`${node.node}-text`)
						.setDisabled(true)
						.setLabel(node.node)
						.setStyle(ButtonStyle.Primary),
				);
			// node status - disabled
			button_style = node.status === db.status.UNKNOWN ? ButtonStyle.Secondary : (node.status === db.status.OFFLINE ? ButtonStyle.Danger : ButtonStyle.Success);
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(`${node.node}-status`)
					.setDisabled(true)
					.setLabel(db.sutats[node.status])
					.setStyle(button_style),
			);
			// unmonitor button
			if (unmonitor_buttons) {
				row.addComponents(
					new ButtonBuilder()
						.setCustomId(node.node)
						.setLabel('Unmonitor')
						.setStyle(ButtonStyle.Danger),
				);					
			}
			// dashboard link
			url = `${process.env.DASHBOARD_URL}/${base64url.fromBase64(node.node)}`
			row.addComponents(
				new ButtonBuilder()
					.setURL(url)
					.setLabel('Dashboard')
					.setStyle(ButtonStyle.Link),
			);	

			rows.push(row);
		});

		reply_string = `You are monitoring ${user_nodes.length} node${user_nodes.length > 1? 's': ''}:\n`
		return {text: reply_string, components: rows}
	} 
	// Build a codeblock if we have results > 5
	else {
		reply_string = `You are monitoring ${user_nodes.length} node${user_nodes.length > 1? 's': ''}:`

		// Print a list of nodes
		user_nodes.forEach((node) => {
			var status_string = ''
			if (node.status !== db.status.UNKNOWN) {
				since_string = node.changed? ` since ${moment(node.changed).fromNow()}`: '';
				status_string = ` _(${db.sutats[node.status]}${since_string})_`
			}
			url = `${process.env.DASHBOARD_URL}/${base64url.fromBase64(node.node)}`
			reply_string = `${reply_string}\n\`${node.node}\` ${status_string}  [Link to Dashboard](${url})`
		});
		
		return {text: reply_string, components: []}
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('list_monitored_nodes')
		.setDescription('Display a list of validator nodes that you are monitoring'),
	async execute(interaction) {
		const user = interaction.user;
		console.log(`User interaction: ${user.id}: listed nodes`)

		var { text, components } = await build_response(user.id);

		// if we have button components, make sure we have the right callback
		if (components.length) {
			await interaction.reply({ content: text, components: components, ephemeral: true, flags: MessageFlags.SuppressEmbeds });

			// button event handling - https://discordjs.guide/interactions/buttons.html#updating-the-button-message
			const filter = i => i.user.id === user.id;
			const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000, dispose: true });

			collector.on('collect', async i => {
				// if button was clicked, delete it from user and update message
				const num_deleted = await db.delete_node(user.id, i.customId)
				if (num_deleted) {
					// Deleted node successfully
					var reply_string = `🗑️ You are no longer monitoring node \`${i.customId}\`.`
					var { text, components } = await build_response(user.id);
					await i.update({ content: text, components: components });
					await interaction.followUp({ content: reply_string, ephemeral: true });
				}
			});

			collector.on('end', async () => {
				// Disable the unmonitor buttons because we're done listening for them
				var { text, components } = await build_response(user.id, false);
				await interaction.editReply({ content: text, components: components });
			});

		} else {
			await interaction.reply({ content: text, ephemeral: true, flags: MessageFlags.SuppressEmbeds });
		}

	},
};
