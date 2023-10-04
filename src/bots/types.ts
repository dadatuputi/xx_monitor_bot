export enum BotType {
    DISCORD, "user",
    TELEGRAM, "user_telegram"
}

interface CommandDefinition {
    name: string, 
    description: string
}

export class Command {   // from https://stackoverflow.com/a/51398471/1486966

    static readonly CLAIM  = new Command({name: 'claim', description: 'Claim rewards for a validator or nominator wallet'}, [
        {name: 'daily', description: 'Subscribe to daily payouts'},
        {name: 'weekly', description: 'Subscribe to weekly payouts'},
        {name: 'now', description: 'Development command'},
        {name: 'list', description: 'List subscribed claim wallets'},
    ]);
    private _map;
  
    // private to disallow creating other instances of this type
    private constructor(private readonly command: CommandDefinition, private readonly _subcommands?: CommandDefinition[]) {
        this._map = _subcommands?.reduce( (acc, subc) => acc.set(subc.name, subc.description), new Map<string, string>());
    }
  
    public get name(){
      return this.command.name;
    }

    public get description(){
        return this.command.description
    }

    public get subcommands(){
        return this._map;
    }
  
    toString() { return this.name; }
  }