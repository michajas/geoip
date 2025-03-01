import { createClient, RedisClientType } from "redis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

export class RedisClient {
  private _client: RedisClientType;
  private static instance: RedisClient | null;

  private constructor() {
    console.log(`Creating Redis client for ${REDIS_HOST}:${REDIS_PORT}`);

    this._client = createClient({
      url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
      socket: {
        reconnectStrategy: (retries) => {
          // Exponential backoff with max 3 seconds
          const delay = Math.min(retries * 50, 3000);
          console.log(`Redis reconnect attempt ${retries}, delay: ${delay}ms`);
          return delay;
        },
      },
    });

    this._client.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });

    this._client.on("connect", () => {
      console.log(`Redis client connected to ${REDIS_HOST}:${REDIS_PORT}`);
    });

    this._client.on("reconnecting", () => {
      console.log("Redis client reconnecting...");
    });
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  /**
   * Reset the Redis client instance - used for testing when connection parameters change
   */
  public static async resetInstance(): Promise<void> {
    console.log("Resetting Redis client instance...");

    if (RedisClient.instance) {
      // Disconnect the existing client if it exists
      try {
        if (RedisClient.instance._client.isOpen) {
          console.log("Disconnecting existing Redis client...");
          await RedisClient.instance._client.disconnect();
        }
      } catch (err) {
        console.error("Error disconnecting Redis client:", err);
      }

      // Reset the instance
      RedisClient.instance = null;
    }

    // Force a reload of environment variables
    dotenv.config();

    // Create a new instance with updated config
    const newInstance = RedisClient.getInstance();

    // Ensure the new instance is connected
    await newInstance.ensureConnection();

    console.log("Redis client instance reset completed");
  }

  /**
   * Ensure the Redis client is connected
   */
  public async ensureConnection(): Promise<void> {
    try {
      if (!this._client.isOpen) {
        console.log("Connecting to Redis...");
        await this._client.connect();
        console.log("Redis connection established");
      }
    } catch (err) {
      console.error("Failed to connect to Redis:", err);
      throw err;
    }
  }

  public async get(key: string): Promise<string | null> {
    await this.ensureConnection();
    return await this._client.get(key);
  }

  public async set(key: string, value: string): Promise<void> {
    await this.ensureConnection();
    await this._client.set(key, value);
  }

  public async hSet(
    key: string,
    field: string,
    value: string
  ): Promise<number> {
    await this.ensureConnection();
    return await this._client.hSet(key, field, value);
  }

  public async hGetAll(key: string): Promise<Record<string, string>> {
    await this.ensureConnection();
    return await this._client.hGetAll(key);
  }

  public async disconnect(): Promise<void> {
    if (this._client.isOpen) {
      await this._client.disconnect();
    }
  }

  // Expose the Redis client instance for direct access
  get client(): RedisClientType {
    return this._client;
  }
}

export const redisClient = RedisClient.getInstance();
