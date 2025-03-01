import { Router, Request, Response } from "express";
import { geoController } from "../controllers/geo-controller";
import { redisClient } from "../services/redis-client";

// Create router
const router = Router();

// GET /api/geo?ip=x.x.x.x
router.get("/", geoController.lookup);

// Add a debug endpoint to check Redis data
router.get("/debug", async (req: Request, res: Response) => {
  try {
    // Get access to Redis client
    const client = redisClient.client;

    // Updated scan operation for Redis client v4
    const scanResult = await client.scan(0, {
      MATCH: "geoip:*",
      COUNT: 100,
    });

    const keys = scanResult.keys;

    // Get sample data for each key
    const samples: { [key: string]: any } = {};
    for (const key of keys.slice(0, 10)) {
      // Limit to 10 samples
      if (key.includes("range")) {
        samples[key] = await redisClient.client.hGetAll(key);
      } else {
        samples[key] = await client.get(key);
      }
    }

    return res.status(200).json({
      message: "Redis data sample",
      totalKeys: keys.length,
      sampleSize: Object.keys(samples).length,
      samples,
    });
  } catch (error) {
    console.error("Error in debug endpoint:", error);
    return res.status(500).json({ error: "Failed to retrieve debug data" });
  }
});

// Export router
export const geoRoutes = router;
