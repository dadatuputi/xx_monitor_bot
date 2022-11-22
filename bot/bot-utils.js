// Script from https://discordjs.guide/creating-your-bot/command-deployment.html#command-registration, modified

// manually expand the environmental variables
var dotenv = require('dotenv').config({ path: '../.env' });
var dotenvExpand = require('dotenv-expand');
dotenvExpand.expand(dotenv);


// Discord token & application id are required.
if (!process.env.DISCORD_TOKEN) {
    throw new Error("DISCORD_TOKEN environment variable missing.");
}
if (!process.env.APP_ID) {
    throw new Error("APP_ID environment variable missing.");
}
const clientId = process.env.APP_ID;
const token = process.env.DISCORD_TOKEN;


// client commands
async function init_client() {
	const { Client, GatewayIntentBits, Events } = require('discord.js');
	const client = new Client({ intents: [GatewayIntentBits.Guilds] });
	client.once(Events.ClientReady, (...args) => {
		console.log(`Ready! Logged in as ${client.user.tag}`);
	});

	await client.login(process.env.DISCORD_TOKEN);
	return client;
}


// deploy commands
async function deploy(guildId=null) {
	const { REST, Routes } = require('discord.js');
	const fs = require('node:fs');
	const rest = new REST({ version: '10' }).setToken(token);

	const commands = [];
	// Grab all the command files from the commands directory
	const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
	
	// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
	for (const file of commandFiles) {
		const command = require(`./commands/${file}`);
		commands.push(command.data.toJSON());
	}
	
	console.log(`Prepared ${commands.length} application (/) commands for deployment.`);
	
	(async () => {
		try {
			// Deploying commands
			const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);
			const data = await rest.put(
				route,
				{ body: commands },
			);

			console.log(`Successfully reloaded ${data.length} application (/) commands.`);
		} catch (error) {
			// And of course, make sure you catch and log any errors!
			console.error(error);
		}
	})();
}


// command parsing
(async function(){
	const { Command, Option, Argument } = require('commander');
	const program = new Command();

	program
		.name('bot-utils')
		.description('Utilities to deploy the xx monitor bot to discord servers');

	program
		.command('deploy')
		.description('Deploy commands to server(s)')
		.addOption(new Option('--server <id>', 'Deploy to the given server id').default(process.env.DEV_GUILD_ID, 'env DEV_GUILD_ID'))
		.addOption(new Option('--global', 'Deploy to all bot-joined servers - this will duplicate guild-issued commands! see https://stackoverflow.com/a/70167704/1486966').conflicts(['server', 'reset']))
		.addOption(new Option('--reset', 'Resets the global and guild commands if you have deployed to both'))
		.action( async (options) => {
			if (options.reset) 
			{
				// reset the commands in server and globally; see https://stackoverflow.com/a/70167704/1486966
				console.log('Resetting commands...');
				const client = await init_client();
				console.log('Resetting commands globally (may take ~1 hour to update)...');
				client.application.commands.set([]);
				console.log(`Resetting commands in server # ${process.env.DEV_GUILD_ID} (takes effect immediately)...`);
				const guild = client.guilds.cache.get(process.env.DEV_GUILD_ID);
				guild.commands.set([]);
				client.destroy();
			} 
			else if (options.global) 
			{
				// deploy commands globally
				console.log('Deploying commands globally');
				await deploy();
			} 
			else 
			{
				// deploy commands to a single server
				console.log(`Deploying commands to server id ${options.server}`)
				await deploy(options.server);
			}
			console.log("Complete");
		});

	program
		.command('username')
		.description('Set bot username (rate limited to 2x/hour)')
		.addArgument(new Argument('<username>'))
		.action( async (username) => {
			console.log(`Setting username to ${username}`);
			const client = await init_client();
			const result = await client.user.setUsername(username);
			console.log("Complete");
			client.destroy();
		});

	program
		.command('avatar')
		.description('Set bot avatar')
		.addArgument(new Argument('<path>'))
		.action( async (path) => {
			console.log(`Setting avatar to ${path}`);
			const client = await init_client();
			await client.user.setAvatar(path);
			console.log("Complete");
			client.destroy();
		});

	program.parse();
})();
