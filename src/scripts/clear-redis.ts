import { redisClient } from "../services/redis-client";

async function clearRedisData() {
  try {
    console.log("Connecting to Redis...");
    await redisClient.ensureConnection();

    console.log("Clearing all Redis data...");
    await redisClient.client.flushAll();

    console.log("Redis data cleared successfully");

    // Or to clear only GeoIP data:
    /*
    console.log('Clearing GeoIP data...');
    let cursor = 0;
    let keysDeleted = 0;
    
    do {
      const result = await redisClient.client.scan(cursor, {
        MATCH: 'geoip:*',
        COUNT: 1000
      });
      
      cursor = result.cursor;
      if (result.keys.length > 0) {
        await redisClient.client.del(result.keys);
        keysDeleted += result.keys.length;
        console.log(`Deleted ${keysDeleted} keys so far...`);
      }
    } while (cursor !== 0);
    
    console.log(`GeoIP data cleared: ${keysDeleted} keys deleted`);
    */
  } catch (error) {
    console.error("Error clearing Redis data:", error);
  } finally {
    await redisClient.disconnect();
  }
}

clearRedisData().catch(console.error);
