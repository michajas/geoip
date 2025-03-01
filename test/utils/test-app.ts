/**
 * Test utility to create a properly configured Express app for testing
 */
import express from "express";
import { geoRoutes } from "../../src/routes/geo-routes";
import { redisClient } from "../../src/services/redis-client";

/**
 * Create a test app instance that's properly configured
 */
export function createTestApp() {
  const app = express();

  // Add middleware
  app.use(express.json());

  // Add routes
  app.use("/api/geo", geoRoutes);

  // Health check
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "OK" });
  });

  return app;
}

/**
 * Setup and teardown functions for tests
 */
export async function setupRedis() {
  try {
    await redisClient.ensureConnection();
  } catch (error) {
    console.error("Failed to connect to Redis for tests:", error);
    throw error;
  }
}

export async function teardownRedis() {
  await redisClient.disconnect();
}
