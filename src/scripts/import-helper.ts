import { RedisClient } from "../services/redis-client";
import { IpUtil } from "../services/ip-util";
import { RangeSearchUtil } from "../services/range-search-util";

// ...existing code...

/**
 * Helper class for importing GeoIP data into Redis
 */
export class ImportHelper {
  // ...existing code...

  /**
   * After import, create binary search indices for faster lookups
   */
  async createBinarySearchIndices(): Promise<void> {
    console.log("Creating binary search indices for faster lookups...");

    // Get all range keys
    let allKeys: string[] = [];
    let cursor = 0;

    do {
      const result = await this.redisClient.client.scan(cursor, {
        MATCH: "geoip:*:range:*",
        COUNT: 1000,
      });

      cursor = result.cursor;
      allKeys = allKeys.concat(result.keys);
    } while (cursor !== 0);

    // Parse keys into range objects
    const ipv4Ranges = RangeSearchUtil.parseIpv4RangesFromKeys(allKeys);
    const ipv6Ranges = RangeSearchUtil.parseIpv6RangesFromKeys(allKeys);

    // Sort ranges
    const sortedIpv4 = RangeSearchUtil.sortIpv4Ranges(ipv4Ranges);
    const sortedIpv6 = RangeSearchUtil.sortIpv6Ranges(ipv6Ranges);

    // Store the sorted indices in Redis
    const ipv4RangesList = sortedIpv4.map((range) => range.key);
    const ipv6RangesList = sortedIpv6.map((range) => range.key);

    // Store as Redis lists for efficient loading
    if (ipv4RangesList.length > 0) {
      await this.redisClient.client.del("geoip:index:v4:ranges");
      await this.redisClient.client.rPush(
        "geoip:index:v4:ranges",
        ipv4RangesList
      );
    }

    if (ipv6RangesList.length > 0) {
      await this.redisClient.client.del("geoip:index:v6:ranges");
      await this.redisClient.client.rPush(
        "geoip:index:v6:ranges",
        ipv6RangesList
      );
    }

    console.log(
      `Binary search indices created: ${ipv4RangesList.length} IPv4 ranges, ${ipv6RangesList.length} IPv6 ranges`
    );
  }

  // ...existing code...
}
