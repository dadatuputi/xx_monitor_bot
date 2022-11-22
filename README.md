# Getting Started

Clone this repo into your linux environment. 

### Requirements

* `docker`

### Development Requirements

If you want to change the code and test it outside docker, install:

* `nodejs`
* `npm`

## Step 1: Create a Discord Application on the Discord Developer Portal

Visit the [Discord Developer Portal](https://discord.com/developers/applications) and create an application. 

Make note of your:

1. `Application ID` found under `General Information`
2. `Bot Token` found under `Bot`

## Optional: Create a Discord Server for Testing / Development

Create a private discord server to test the bot on.

## Step 2: Authorize the Bot on your Server

To authorize the bot with the necessary permissions (`Create commands in a server`) to join your server, build the url as follows (taken from the [`discord.js` guide](https://discordjs.guide/preparations/adding-your-bot-to-servers.html)):

```
https://discord.com/api/oauth2/authorize?client_id=<APPLICATION_ID>&permissions=0&scope=bot%20applications.commands
```

## Step 3: Set up environmental variables

Copy `.env.template` to `.env`:

```bash
$ cp .env.template .env
$ vi .env
```

Fill in missing variables in `.env`, such as the Discord Token and App ID. Edit any others as desired. If you are using a test server, copy the server id to the `DEV_GUILD_ID` variable. The server id is found in Discord through these steps:

1. Enable `Developer Mode` in the Discord App
2. Right click on the server and select `Copy ID`

## Step 4: Build the Docker Image

Run the following command to build an image from source:

```bash
$ docker compose build
```

## Step 5: Publish the commands to your server

Use the `bot-utils.js` script to deploy the bot commands to your dev server or globally to all servers. You can either run the script in a container, or locally if you have `node.js` installed. 

### Using `bot-utils.js` in docker

Run this command to view the script options:

```
$ docker run --env-file .env -it xx_monitor_bot-bot node bot-utils.js
```

* #### **Required:** Deploy commands to server
```
$ docker run --env-file .env -it xx_monitor_bot-bot node bot-utils.js deploy
```

* #### Update username
```
$ docker run --env-file .env -it xx_monitor_bot-bot node bot-utils.js username "xx monitor bot"
```

* #### Update avatar
```
$ docker run --env-file .env --volume <image path>:/image -it xx_monitor_bot-bot node bot-utils.js avatar /image
```

### Using `bot-utils.js` locally

Use the following commands to install the required packages and publish the slash commands to your server:

```bash
$ cd bot
$ npm install
$ node bot-utils.js help
$ [... command output ...]
$ cd ..
```

You can also set the bot username and status with the `BOT_USERNAME` and `BOT_STATUS` variables in `.env` and they will be set each time the bot starts.


## Step 6: Start the Bot

Run the following command to start the bot in the background:

```bash
$ docker compose up -d
```

To view the logs of the running containers, try the following commands:

```bash
$ docker compose logs           # shows most recent logs from all containers
$ docker compose logs -f        # follows the log output of all containers continuously
$ docker compose logs -f bot    # follows the bot console continuously
```

## Step 7: Interact with the bot

The slash commands are self-documenting. In your server, start typing `/` and a list of available slash commands will display.

### Commands

#### `/monitor_node id`

Enter this command to monitor a node of the given id. Because node status changes are made over DM, the bot will try to send you a DM. If it is successful, it will start monitoring the node for future status changes.

#### `/list_monitored_nodes`

This command will show a list of nodes that you are monitoring.

#### `/unmonitor_node id`

This command will instruct the bot to stop monitor the given node for you.

# Development & Testing

## Running bot in development mode

To run the bot outside docker for testing or development, first start up an ephemeral mongodb service:

```bash
$ cd bot
$ docker compose -f mongo-only-compose.yml --env-file ../.env up -V
```

From another terminal, run:

```bash
$ cd bot
$ npm install       # if it hasn't been run before
$ node index.js
```

Now you can run the app without building a docker image for each test run.
 
