const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const moment = require('moment');
const base64url = require('base64url');

function build_response_fancy(db, nodes, unmonitor_buttons = true) {
	var rows = [];
	
	nodes.forEach( (node) => {
		// node id button (disabled, just used to show node id)
		const row = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId(`${node.node}-text`)
					.setDisabled(true)
					.setLabel(node.name? `${node.name} - ${node.node}` : node.node)
					.setStyle(ButtonStyle.Primary),
			);
		// node status - disabled
		button_style = node.status === db.status.UNKNOWN ? ButtonStyle.Secondary : (node.status === db.status.ONLINE ? ButtonStyle.Success : ButtonStyle.Danger );
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

	return rows
}

function build_response_simple(db, nodes) {
	var reply_string = ''

	// Print a list of nodes
	nodes.forEach((node) => {
		var status_string = ''
		if (node.status !== db.status.UNKNOWN) {
			since_string = node.changed? ` since ${moment(node.changed).fromNow()}`: '';
			status_string = ` _(${db.sutats[node.status]}${since_string})_`
		}
		url = `${process.env.DASHBOARD_URL}/${base64url.fromBase64(node.node)}`
		reply_string += `${node.name? `\`${node.name}\` - ` : ''}\`${node.node}\` ${status_string}  [Link to Dashboard](${url})\n`
	});
	
	return reply_string;
}

async function build_response(db, user_id, fancy = true, unmonitor_buttons = true) {

	// Get a list of user's monitored nodes
	const nodes = await db.list_user_nodes(user_id)

	// User isn't monitoring any nodes
	if (nodes.length <= 0) {
		return {text: `💢 You aren't monitoring any nodes.`, components: []}
	}

	const reply_string = `You are monitoring ${nodes.length} node${nodes.length > 1? 's': ''}:\n`;


	// User is monitoring 1-5 nodes AND the fancy flag is set - show buttons
	if (nodes.length > 0 && nodes.length <= 5 && fancy) {
		return {text: reply_string, components: build_response_fancy(db, nodes, unmonitor_buttons)};
	} 
	// Build a codeblock if we have results > 5 or fancy flag is unset
	else {
		return {text: `${reply_string}${build_response_simple(db, nodes)}`, components: []};
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('list_monitored_nodes')
		.setDescription('Display a list of validator nodes that you are monitoring'),
	async execute(interaction, db) {
		const user = interaction.user;
		const eph = interaction.channel ? true : false;		// set the message to ephemeral if this is in a channel

		console.log(`User interaction: ${user.id}: listed nodes`)

		// if this is in a channel (not dms), use fancy
		if (interaction.channel) {
			var { text, components } = await build_response(db, user.id);		// build fancy list
		} else {
			var { text, components } = await build_response(db, user.id, false);		// build simple list
		}

		await interaction.reply({ content: text, components: components, ephemeral: eph, flags: MessageFlags.SuppressEmbeds });

		// if we have button components, make sure we have the right callback
		if (components.length) {

			// button event handling - https://discordjs.guide/interactions/buttons.html#updating-the-button-message

			const filter = i => i.user.id === user.id;
			const collector = interaction.channel.createMessageComponentCollector({ filter, time: 45000, dispose: true });

			collector.on('collect', async i => {
				// if button was clicked, delete it from user and update message
				const num_deleted = await db.delete_node(user.id, i.customId)
				if (num_deleted) {
					// Deleted node successfully
					var reply_string = `🗑️ You are no longer monitoring node \`${i.customId}\`.`
					var { text, components } = await build_response(db, user.id);
					await i.update({ content: text, components: components });
					await interaction.followUp({ content: reply_string, ephemeral: eph });
				}
			});

			collector.on('end', async () => {
				// Disable the unmonitor buttons because we're done listening for them
				var { text, components } = await build_response(db, user.id, true, false);
				await interaction.editReply({ content: text, components: components });
			});
		}
	},
};
