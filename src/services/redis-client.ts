import { createClient } from "redis";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Redis client wrapper for the application.
 * Provides connection management and convenience methods for Redis operations.
 */
export class RedisClient {
  public client: ReturnType<typeof createClient>;
  private connected: boolean = false;
  private connecting: boolean = false;

  constructor() {
    console.log(
      `Creating Redis client for ${process.env.REDIS_HOST || "localhost"}:${
        process.env.REDIS_PORT || 6379
      }`
    );

    this.client = createClient({
      url: `redis://${process.env.REDIS_HOST || "localhost"}:${
        process.env.REDIS_PORT || 6379
      }`,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error(
              `Redis: Max reconnection attempts reached. Giving up.`
            );
            return new Error("Max reconnection attempts reached");
          }
          // Exponential backoff with max of 3 seconds
          const delay = Math.min(Math.pow(2, retries) * 100, 3000);
          console.log(`Redis: Reconnecting in ${delay}ms...`);
          return delay;
        },
      },
    });

    // Set up event handlers
    this.client.on("connect", () => {
      console.log("Redis connection established");
      this.connected = true;
    });

    this.client.on("error", (err) => {
      console.error("Redis error:", err);
      this.connected = false;
    });

    this.client.on("end", () => {
      console.log("Redis connection closed");
      this.connected = false;
    });
  }

  /**
   * Check if client is connected
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Ensure Redis connection is established.
   * If already connected, does nothing.
   */
  public async ensureConnection(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (this.connecting) {
      // Wait for connection to complete
      while (this.connecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    try {
      this.connecting = true;
      await this.client.connect();
      this.connected = true;
      console.log("Redis connection established");
    } catch (error) {
      console.error("Failed to connect to Redis:", error);
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Disconnect from Redis.
   * Safe to call multiple times.
   */
  public async disconnect(): Promise<void> {
    if (this.connected) {
      try {
        await this.client.quit();
        this.connected = false;
        console.log("Redis connection closed gracefully");
      } catch (error) {
        console.error("Error disconnecting from Redis:", error);
        // Force disconnect if quit fails
        try {
          await this.client.disconnect();
        } catch (err) {
          // Already disconnected or other error, just log
          console.error("Error during force disconnect:", err);
        }
        this.connected = false;
      }
    }
  }

  /**
   * Helper method to set a hash field
   */
  public async hSet(
    key: string,
    field: string,
    value: string | number
  ): Promise<number> {
    await this.ensureConnection();
    return this.client.hSet(key, field, value.toString());
  }

  /**
   * Helper method to get all hash fields
   */
  public async hGetAll(key: string): Promise<Record<string, string>> {
    await this.ensureConnection();
    return this.client.hGetAll(key);
  }

  /**
   * Helper method to set a key
   */
  public async set(key: string, value: string): Promise<string> {
    await this.ensureConnection();
    return this.client.set(key, value);
  }

  /**
   * Helper method to get a key
   */
  public async get(key: string): Promise<string | null> {
    await this.ensureConnection();
    return this.client.get(key);
  }
}

// Export a singleton instance
export const redisClient = new RedisClient();
