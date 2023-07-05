import type {
  Document,
  Filter,
  FindOptions,
  InsertOneResult,
  UpdateResult,
  WithId,
  OptionalId,
  UpdateFilter,
  DeleteResult,
  Db,
  Collection,
} from "mongodb";
import type { ClaimRecord, LogActionRecord, MonitorRecord, RecordUpdate } from "./types.js";
import { Status } from "./types.js";
import { MongoClient } from "mongodb";
import { ClaimFrequency, Staker } from "../chain/types.js";

export { Status, StatusIcon, StatusCmix } from "./types.js";

export class Database {
  private client: MongoClient;
  private db: Db;
  private monitor_state: Collection<MonitorRecord>;
  private claims: Collection<ClaimRecord>;
  private stats: Db;
  private actions: Collection<LogActionRecord>;

  constructor(client: MongoClient) {
    // Initialize mongodb
    this.client = client;
    this.db = this.client.db("xx");
    this.monitor_state = this.db.collection("mainnet");
    this.claims = this.db.collection("claims");
    this.stats = this.client.db("stats");
    this.actions = this.stats.collection("actions");
  }

  public static async connect(uri: string): Promise<Database> {
    const client = await MongoClient.connect(uri);
    console.log(`Connected to mongo at ${uri}`);
    return new Database(client);
  }

  public async logAction(
    user_id: string,
    action: string,
    data: string
  ): Promise<InsertOneResult<LogActionRecord>> {
    // Add a record for an action taken by a user

    const new_doc: LogActionRecord = {
      user: user_id,
      time: new Date(),
      action: action,
      data: data,
    };
    const options: FindOptions<LogActionRecord> = {};
    const result: InsertOneResult<LogActionRecord> = await this.actions.insertOne(
      new_doc
    );
    return result;
  }

  public async addNode(
    user_id: string,
    node_id: string,
    node_name: string | null
  ): Promise<any> {
    // Add a node to the monitered node list

    // check if user is already monitoring this node
    const query: Filter<MonitorRecord> = {
      user: user_id,
      node: node_id,
    };
    const options: FindOptions<MonitorRecord> = {};
    const result: WithId<MonitorRecord> | null = await this.monitor_state.findOne(
      query,
      options
    );
    if (result) {
      // User is already monitoring this node
      // check if node name is set and the same
      if (node_name && node_name !== result.name) {
        // update node name
        const update: Partial<MonitorRecord> = {
          $set: {
            name: node_name,
            user_set_name: true,
          },
        };
        return await this.monitor_state.updateOne(query, update);
      }
      return false;
    } else {
      const new_doc: MonitorRecord = {
        user: user_id,
        node: node_id,
        name: node_name,
        user_set_name: Boolean(node_name),
        status: Status.UNKNOWN,
        changed: null,
      };
      return await this.monitor_state.insertOne(new_doc);
    }
  }

  public async addClaim(user_id: string, frequency: string, wallet: string, wallet_name: string | null): Promise<Array<RecordUpdate> | null> {
    // Add a node to the monitered node list
    const updates = new Array<RecordUpdate>();

    // check if user is already subscribed to claims for this
    const query: Filter<ClaimRecord> = {
      user: user_id,
      wallet: wallet,
    };
    const options: FindOptions<ClaimRecord> = {};
    const result: WithId<ClaimRecord> | null = await this.claims.findOne(
      query,
      options
    );
    if (result) {
      // User is already subscribed for this wallet

      const update: Partial<ClaimRecord> = {
        $set: {},
      };
      // check if node name is set and the same
      if (wallet_name && wallet_name !== result.alias) {
        // update node name
        update.$set.alias = wallet_name;
        updates.push({
          key: "name",
          old: result.alias ? result.alias : "empty",
          new: wallet_name
        })
      } 
      if (frequency !== result.frequency) {
        // update interval
        update.$set.frequency = frequency;
        updates.push({
          key: "interval",
          old: result.frequency,
          new: frequency,
        })
      }

      if (updates.length) {
        console.log(update)
        console.log(updates)
        if (!await this.claims.updateOne(query, update)) throw new Error(`Could not update: query (${query}), update (${update})`);
        return updates;
      } else {
        return null;    // record already exists in its current state
      }

    } else {
      const new_doc: ClaimRecord = {
        user: user_id,
        frequency: frequency,
        wallet: wallet,
        alias: wallet_name
      };
      if (!await this.claims.insertOne(new_doc)) throw new Error(`Could not update: doc (${new_doc})`);
      return updates;
    }
  }

  public async updateNodeStatus(
    node_id: string,
    status: string,
    changed: Date
  ): Promise<MonitorRecord[] | undefined> {
    // notify any users monitoring the provided node of a status change

    const query: Filter<MonitorRecord> = {
      node: node_id,
      status: {
        $ne: status,
      },
    };
    const options: FindOptions<MonitorRecord> = {
      projection: {
        _id: false,
      },
    };
    const result: WithId<MonitorRecord>[] = await this.monitor_state
      .find(query, options)
      .toArray();

    if (result.length) {
      // update the value in the database
      const update: UpdateFilter<MonitorRecord> = {
        $set: {
          status: status,
          changed: changed,
        },
      };
      this.monitor_state.updateMany(query, update);

      return result as MonitorRecord[];
    }
  }

  public async updateNodeName(node_id: string, new_name: string): Promise<any> {
    // update all nodes with the new name, where user_set_name = false

    const query: Filter<MonitorRecord> = {
      node: node_id,
      user_set_name: {
        $ne: true,
      },
    };
    const update: UpdateFilter<MonitorRecord> = {
      $set: {
        name: new_name,
        user_set_name: false,
      },
    };
    return this.monitor_state.updateMany(query, update);
  }

  public async listUserNodes(user_id: string): Promise<WithId<MonitorRecord>[]> {
    // Get list of user's subscriptions

    const query: Filter<MonitorRecord> = {
      user: user_id,
    };
    const options: FindOptions<MonitorRecord> = {
      projection: {
        _id: false,
      },
    };
    return await this.monitor_state.find(query, options).toArray();
  }

  public async listUserClaimsFlat(user_id: string): Promise<WithId<ClaimRecord>[]> {
    // Get list of user's subscriptions

    const query: Filter<ClaimRecord> = {
      user: user_id,
    };
    const options: FindOptions<ClaimRecord> = {
      projection: {
        _id: false,
      },
    };
    return await this.claims.find(query, options).toArray();
  }

  public async listUserClaims(user_id: string): Promise<Map<string, ClaimRecord[]>> {
    // Get list of user's subscriptions

    const claims_map = new Map<string, ClaimRecord[]>();

    for(const frequency of Object.values(ClaimFrequency)){
      const query: Filter<ClaimRecord> = {
        user: user_id,
        frequency: frequency
      };
      const options: FindOptions<ClaimRecord> = {
        projection: {
          _id: false,
        },
      };
      const results = await this.claims.find(query, options).toArray();
      if (results.length) claims_map.set(frequency, results);
    }
    return claims_map;
  }

  public async deleteNode(
    user_id: string,
    node_id: string
  ): Promise<[DeleteResult, WithId<MonitorRecord>[]]> {
    // Delete the given node from the user record.

    const query: Filter<MonitorRecord> = {
      user: user_id,
      node: node_id,
    };
    const options: FindOptions<MonitorRecord> = {};
    const deleted: WithId<MonitorRecord>[] = await this.monitor_state
      .find(query, options)
      .toArray();
    const result: DeleteResult = await this.monitor_state.deleteMany(query, options);
    return [result, deleted];
  }

  public async deleteClaim(
    user_id: string,
    wallet: string
  ): Promise<[DeleteResult, WithId<ClaimRecord>[]]> {
    // Delete the given node from the user record.

    const query: Filter<ClaimRecord> = {
      user: user_id,
      wallet: wallet,
    };
    const options: FindOptions<ClaimRecord> = {};
    const deleted: WithId<ClaimRecord>[] = await this.claims
      .find(query, options)
      .toArray();
    const result: DeleteResult = await this.claims.deleteMany(query, options);
    return [result, deleted];
  }

  public async getClaimers(claim_frequency: ClaimFrequency): Promise<Staker[]> {
    // Get all claimers for a certain frequency

    const query: Filter<ClaimRecord> = claim_frequency !== ClaimFrequency.NOW ? {
      frequency: claim_frequency,
    } : {};
    const options: FindOptions<ClaimRecord> = {
      projection: {
        _id: false,
      },
    };
    const db_claimers = await this.claims.find(query, options).toArray();
    return db_claimers.map<Staker>( (value): Staker => ({ 
      user_id: value.user,
      wallet: value.wallet,
      alias: value.alias
    }));
  }
}