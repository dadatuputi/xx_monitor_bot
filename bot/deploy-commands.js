// Script from https://discordjs.guide/creating-your-bot/command-deployment.html#command-registration

const { REST, Routes } = require('discord.js');
const fs = require('node:fs');

var dotenv = require('dotenv').config({ path: '../.env' });
var dotenvExpand = require('dotenv-expand');
dotenvExpand.expand(dotenv);

const clientId = process.env.APP_ID;
const guildId = process.env.DEV_GUILD_ID;
const token = process.env.DISCORD_TOKEN;

const commands = [];
// Grab all the command files from the commands directory you created earlier
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	commands.push(command.data.toJSON());
}

// Construct and prepare an instance of the REST module
const rest = new REST({ version: '10' }).setToken(token);

// and deploy your commands!
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// Choose 1 or 2 below - 1 for deploying to a specific guild (server), 2 for global deployment

		// 1. The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationGuildCommands(clientId, guildId),
			{ body: commands },
		);

		// 2. Deploy globally - see https://discordjs.guide/creating-your-bot/command-deployment.html#global-commands
		// await rest.put(
		// 	Routes.applicationCommands(clientId),
		// 	{ body: commands },
		// );
		

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();