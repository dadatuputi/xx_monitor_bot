const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const moment = require('moment');
const base64url = require('base64url');
const { prettify_node, icons } = require('../utils.js')


function build_response_buttons(db, nodes, unmonitor_buttons = true) {
	var rows = [];
	const MAX_BUTTON_TEXT_LEN = 80; 		// 80 is value from exception thrown when string is too long
	
	nodes.forEach( (node) => {
		const row = new ActionRowBuilder(); // let's build on this puppy

		// node status - disabled (just used to show node id)
		const button_style = node.status === db.status.UNKNOWN ? ButtonStyle.Secondary : (node.status === db.status.ONLINE ? ButtonStyle.Success : ButtonStyle.Danger );
		row.addComponents(
			new ButtonBuilder()
				.setCustomId(`${node.node}-status`)
				.setDisabled(true)
				.setLabel(db.sutats[node.status])
				.setStyle(button_style),
		);

		// node id button - disabled
		row.addComponents(
			new ButtonBuilder()
				.setCustomId(`${node.node}-text`)
				.setDisabled(true)
				.setLabel(prettify_node(node.name, node.node, MAX_BUTTON_TEXT_LEN, false))
				.setStyle(ButtonStyle.Primary),
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
		const url = `${process.env.DASHBOARD_URL}/${base64url.fromBase64(node.node)}`
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

function build_response_text(db, nodes) {
	var reply_string = ''

	// Print a list of nodes
	nodes.forEach((node) => {
		const url = `${process.env.DASHBOARD_URL}/${base64url.fromBase64(node.node)}`
		const changed = node.changed ? ` since ${moment(node.changed).fromNow()}`: ''


		var line = db.status_icon[db.sutats[node.status]]		// node status icon
		line += `  ${prettify_node(node.name, node.node)}`		// node name & id
		line += ` _(${db.sutats[node.status]}${changed})_`		// status text & time since change
		line += `  [${icons.LINK}](${url})`;					// link to dashboard page for node
		
		reply_string += line + '\n';
	});
	
	return reply_string;
}

async function build_response(db, user_id, fancy = true, unmonitor_buttons = true) {

	// Get a list of user's monitored nodes
	const nodes = await db.list_user_nodes(user_id)

	// User isn't monitoring any nodes
	if (nodes.length <= 0) {
		return {text: `${icons.ERROR}  You aren't monitoring any nodes.`, components: []}
	}

	const reply_string = `You are monitoring ${nodes.length} node${nodes.length > 1? 's': ''}:\n`;


	// User is monitoring 1-5 nodes AND the fancy flag is set - show buttons
	if (nodes.length > 0 && nodes.length <= 5 && fancy) {
		return {text: reply_string, components: build_response_buttons(db, nodes, unmonitor_buttons)};
	} 
	// Build a codeblock if we have results > 5 or fancy flag is unset
	else {
		return {text: `${reply_string}${build_response_text(db, nodes)}`, components: []};
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('list_monitored_nodes')
		.setDescription('Display a list of validators that you are monitoring')
		.addStringOption(option =>
			option.setName('format')
				.setDescription('Choose the format of the validator list. Default is Text.')
				.addChoices(
					{ name: 'Text', value: 'text' },
					{ name: 'Buttons', value: 'buttons' },
				)),
	async execute(interaction, db) {
		const user = interaction.user;
		const format = interaction.options.getString('format');
		const fancy = (format == 'buttons') ? true : false;
		const channel = interaction.channel ? interaction.channel : await interaction.client.channels.fetch(interaction.channelId);
		const eph = !channel.isDMBased() ? true : false;	// make the message ephemeral / visible only to user if not in dm		
		
		var { text, components } = await build_response(db, user.id, fancy);		// build fancy list (if plain not set by user)
		await interaction.reply({ content: text, components: components, ephemeral: eph, flags: MessageFlags.SuppressEmbeds });

		// if we have button components, make sure we have the right callback
		if (components.length) {

			// button event handling - https://discordjs.guide/interactions/buttons.html#updating-the-button-message

			const filter = i => i.user.id === user.id;
			const collector = channel.createMessageComponentCollector({ filter, time: 45000, dispose: true });

			collector.on('collect', async i => {

				// if button was clicked, delete it from user and update message
				const result = await db.delete_node(user.id, i.customId)
				if (result.deletedCount) {
					const deleted = result.deleted[0];
					// Deleted node successfully
					var reply_string = `${icons.DELETE}  You are no longer monitoring ${prettify_node(deleted.name, i.customId)}.`
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

		console.log(`User ${user.id} interaction from ${eph ? 'channel' : 'dm' }: listed nodes`);
	},
};
