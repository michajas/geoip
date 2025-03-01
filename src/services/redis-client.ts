import { createClient } from "redis";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Redis client wrapper for the application.
 */
export class RedisClient {
  // Class property for singleton instance
  private static instance: RedisClient | null = null;

  public client: ReturnType<typeof createClient>;
  private connected: boolean = false;
  private connecting: boolean = false;

  constructor() {
    this.client = createClient({
      url: `redis://${process.env.REDIS_HOST || "localhost"}:${
        process.env.REDIS_PORT || 6379
      }`,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return new Error("Max reconnection attempts reached");
          }
          return Math.min(Math.pow(2, retries) * 100, 3000);
        },
      },
    });

    // Set up event handlers
    this.client.on("connect", () => {
      this.connected = true;
    });

    this.client.on("error", (err) => {
      console.error("Redis error:", err);
      this.connected = false;
    });

    this.client.on("end", () => {
      this.connected = false;
    });
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static async resetInstance(): Promise<void> {
    if (RedisClient.instance) {
      // Disconnect the existing client if connected
      if (RedisClient.instance.isConnected()) {
        try {
          await RedisClient.instance.disconnect();
        } catch (e) {
          console.error("Error disconnecting Redis during reset:", e);
        }
      }
      // Clear the instance
      RedisClient.instance = null;
    }
    // Create a new instance
    RedisClient.instance = new RedisClient();
  }

  /**
   * Get or create the singleton instance
   */
  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  /**
   * Check if client is connected
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Ensure Redis connection is established
   */
  public async ensureConnection(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (this.connecting) {
      while (this.connecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    try {
      this.connecting = true;
      await this.client.connect();
      this.connected = true;
    } catch (error) {
      console.error("Failed to connect to Redis:", error);
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    if (this.connected) {
      try {
        await this.client.quit();
        this.connected = false;
      } catch (error) {
        try {
          await this.client.disconnect();
        } catch (err) {
          // Already disconnected
        }
        this.connected = false;
      }
    }
  }

  // Helper methods
  public async hSet(
    key: string,
    field: string,
    value: string | number
  ): Promise<number> {
    await this.ensureConnection();
    return this.client.hSet(key, field, value.toString());
  }

  public async hGetAll(key: string): Promise<Record<string, string>> {
    await this.ensureConnection();
    return this.client.hGetAll(key);
  }

  public async set(key: string, value: string): Promise<string> {
    await this.ensureConnection();
    return this.client.set(key, value);
  }

  public async get(key: string): Promise<string | null> {
    await this.ensureConnection();
    return this.client.get(key);
  }
}

// Export singleton instance using getInstance pattern
export const redisClient = RedisClient.getInstance();
