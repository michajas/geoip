import { Router, Request, Response } from "express";
import { GeoService } from "../services/geo-service";
import { IpUtil } from "../services/ip-util";
import { redisClient } from "../services/redis-client";

export const geoRoutes = Router();

// GET /api/geo?ip=x.x.x.x or /api/geo?ip=2001:db8::1
geoRoutes.get("/", async (req: Request, res: Response) => {
  try {
    const ip = req.query.ip as string;

    if (!ip) {
      return res.status(400).json({
        error: "Missing required query parameter: ip",
      });
    }

    if (!IpUtil.isValidIp(ip)) {
      return res.status(400).json({
        error: "Invalid IP address format",
      });
    }

    // Log the lookup attempt
    console.log(`Looking up geolocation for IP: ${ip}`);
    const ipVersion = IpUtil.getIpVersion(ip);
    if (ipVersion === 4) {
      console.log(`IP numeric value: ${IpUtil.ipToLong(ip)}`);
    } else {
      console.log(`IPv6 address detected`);
    }

    const geoData = await GeoService.lookupIp(ip);

    if (!geoData) {
      return res.status(404).json({
        message: "No geolocation data found for the provided IP address",
        ip,
      });
    }

    return res.status(200).json(geoData);
  } catch (error) {
    console.error("Error processing geolocation request:", error);
    return res
      .status(500)
      .json({ error: "Failed to process geolocation request" });
  }
});

// Add a debug endpoint to check Redis data
geoRoutes.get("/debug", async (req: Request, res: Response) => {
  try {
    // Get access to Redis client
    const client = redisClient.client;

    // Updated scan operation for Redis client v4
    const scanResult = await client.scan(0, {
      MATCH: "geoip:*",
      COUNT: 10,
    });

    const keys = scanResult.keys;

    // Get sample data for each key
    const samples: { [key: string]: any } = {};
    for (const key of keys) {
      if (key.includes("range")) {
        samples[key] = await redisClient.hGetAll(key);
      } else {
        samples[key] = await client.get(key);
      }
    }

    return res.status(200).json({
      message: "Redis data sample",
      keys: keys.length,
      samples,
    });
  } catch (error) {
    console.error("Error in debug endpoint:", error);
    return res.status(500).json({ error: "Failed to retrieve debug data" });
  }
});
