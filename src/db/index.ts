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
import type { LogActionRecord, MonitorRecord } from "./types.js";
import { Status } from "./types.js";
import { MongoClient } from "mongodb";

export { Status, StatusIcon, StatusCmix } from "./types.js";

export class Database {
  private client: MongoClient;
  private db: Db;
  private mainnet: Collection<Document>;
  private stats: Db;
  private actions: Collection<Document>;

  constructor(client: MongoClient) {
    // Initialize mongodb
    this.client = client;
    this.db = this.client.db("xx");
    this.mainnet = this.db.collection("mainnet");
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
  ): Promise<InsertOneResult<Document>> {
    // Add a record for an action taken by a user

    const new_doc: LogActionRecord = {
      user: user_id,
      time: new Date(),
      action: action,
      data: data,
    };
    const options: FindOptions<Document> = {};
    const result: InsertOneResult<Document> = await this.actions.insertOne(
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
    const query: Filter<Document> = {
      user: user_id,
      node: node_id,
    };
    const options: FindOptions<Document> = {};
    const result: WithId<Document> | null = await this.mainnet.findOne(
      query,
      options
    );
    if (result) {
      // User is already monitoring this node
      // check if node name is set and the same
      if (node_name && node_name !== result.name) {
        // update node name
        const update: Partial<Document> = {
          $set: {
            name: node_name,
            user_set_name: true,
          },
        };
        return await this.mainnet.updateOne(query, update);
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
      return await this.mainnet.insertOne(new_doc);
    }
  }

  public async updateNodeStatus(
    node_id: string,
    status: string,
    changed: Date
  ): Promise<MonitorRecord[] | undefined> {
    // notify any users monitoring the provided node of a status change

    const query: Filter<Document> = {
      node: node_id,
      status: {
        $ne: status,
      },
    };
    const options: FindOptions<Document> = {
      projection: {
        _id: false,
      },
    };
    const result: WithId<Document>[] = await this.mainnet
      .find(query, options)
      .toArray();

    if (result.length) {
      // update the value in the database
      const update: UpdateFilter<Document> = {
        $set: {
          status: status,
          changed: changed,
        },
      };
      this.mainnet.updateMany(query, update);

      return result as MonitorRecord[];
    }
  }

  public async updateNodeName(node_id: string, new_name: string): Promise<any> {
    // update all nodes with the new name, where user_set_name = false

    const query: Filter<Document> = {
      node: node_id,
      user_set_name: {
        $ne: true,
      },
    };
    const update: UpdateFilter<Document> = {
      $set: {
        name: new_name,
        user_set_name: false,
      },
    };
    return this.mainnet.updateMany(query, update);
  }

  public async listUserNodes(user_id: string): Promise<WithId<Document>[]> {
    // Get list of user's subscriptions

    const query: Filter<Document> = {
      user: user_id,
    };
    const options: FindOptions<Document> = {
      projection: {
        _id: false,
      },
    };
    return await this.mainnet.find(query, options).toArray();
  }

  public async deleteNode(
    user_id: string,
    node_id: string
  ): Promise<[DeleteResult, WithId<Document>[]]> {
    // Delete the given node from the user record.

    const query: Filter<Document> = {
      user: user_id,
      node: node_id,
    };
    const options: FindOptions<Document> = {};
    const deleted: WithId<Document>[] = await this.mainnet
      .find(query, options)
      .toArray();
    const result: DeleteResult = await this.mainnet.deleteMany(query, options);
    return [result, deleted];
  }
}
