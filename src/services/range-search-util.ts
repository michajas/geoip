import { IpUtil } from "./ip-util";
import { Ipv6Util } from "./ipv6-util";

/**
 * Range representation for binary search
 */
export interface IpRange<T> {
  startIp: T; // number for IPv4, bigint for IPv6
  endIp: T; // number for IPv4, bigint for IPv6
  key: string; // Redis key or other identifier
}

/**
 * Utility class for efficient IP range lookups using binary search
 */
export class RangeSearchUtil {
  /**
   * Find the IPv4 range containing the specified IP using binary search
   *
   * @param ip - The IPv4 address to look up
   * @param ranges - Sorted array of IPv4 ranges (must be sorted by startIp)
   * @returns The matching range or null if not found
   */
  static findIpv4Range(
    ip: string,
    ranges: IpRange<number>[]
  ): IpRange<number> | null {
    // Convert IP to numeric form
    const ipNum = IpUtil.ipToLong(ip);

    // Binary search
    let left = 0;
    let right = ranges.length - 1;
    let result: IpRange<number> | null = null;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const range = ranges[mid];

      if (ipNum >= range.startIp && ipNum <= range.endIp) {
        // Found a match
        return range;
      } else if (ipNum < range.startIp) {
        // Look in left half
        right = mid - 1;
      } else {
        // Look in right half
        left = mid + 1;
      }
    }

    return null;
  }

  /**
   * Find the IPv6 range containing the specified IP using binary search
   *
   * @param ip - The IPv6 address to look up
   * @param ranges - Sorted array of IPv6 ranges (must be sorted by startIp)
   * @returns The matching range or null if not found
   */
  static findIpv6Range(
    ip: string,
    ranges: IpRange<bigint>[]
  ): IpRange<bigint> | null {
    try {
      // Convert IP to BigInt form
      const ipBigInt = Ipv6Util.toBigInt(ip);

      // Binary search
      let left = 0;
      let right = ranges.length - 1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const range = ranges[mid];

        if (ipBigInt >= range.startIp && ipBigInt <= range.endIp) {
          // Found a match
          return range;
        } else if (ipBigInt < range.startIp) {
          // Look in left half
          right = mid - 1;
        } else {
          // Look in right half
          left = mid + 1;
        }
      }
    } catch (error: unknown) {
      // Handle IPv6 parsing errors - properly handle unknown error type
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error searching IPv6 range: ${errorMessage}`);
    }

    return null;
  }

  /**
   * Sort IPv4 ranges by start address (ascending)
   * Required for binary search to work correctly
   */
  static sortIpv4Ranges(ranges: IpRange<number>[]): IpRange<number>[] {
    return [...ranges].sort((a, b) => a.startIp - b.startIp);
  }

  /**
   * Sort IPv6 ranges by start address (ascending)
   * Required for binary search to work correctly
   */
  static sortIpv6Ranges(ranges: IpRange<bigint>[]): IpRange<bigint>[] {
    return [...ranges].sort((a, b) => {
      if (a.startIp < b.startIp) return -1;
      if (a.startIp > b.startIp) return 1;
      return 0;
    });
  }

  /**
   * Load IPv4 ranges from Redis keys and prepare for binary search
   * @param keys - Array of Redis keys in format "geoip:v4:range:{startIp}:{endIp}"
   */
  static parseIpv4RangesFromKeys(keys: string[]): IpRange<number>[] {
    return keys
      .filter((key) => key.startsWith("geoip:v4:range:"))
      .map((key) => {
        const parts = key.split(":");
        // Extract startIp and endIp from key
        if (parts.length >= 5) {
          const startIpSigned = parseInt(parts[3], 10);
          const endIpSigned = parseInt(parts[4], 10);
          // Convert to unsigned for comparison
          const startIp = IpUtil.toUnsigned32(startIpSigned);
          const endIp = IpUtil.toUnsigned32(endIpSigned);
          return { startIp, endIp, key };
        }
        return null;
      })
      .filter((range): range is IpRange<number> => range !== null);
  }

  /**
   * Load IPv6 ranges from Redis keys and prepare for binary search
   * @param keys - Array of Redis keys in format "geoip:v6:range:{startIp}:{endIp}"
   */
  static parseIpv6RangesFromKeys(keys: string[]): IpRange<bigint>[] {
    return keys
      .filter((key) => key.startsWith("geoip:v6:range:"))
      .map((key) => {
        try {
          const parts = key.split(":");
          // Extract indices of start/end in the key
          // Format is complex because IPv6 itself contains colons
          let endIndex = parts.length - 1;
          let startIndex = -1;

          // Find where the startIp begins in the key
          // This is tricky because the key contains "geoip:v6:range:" followed by IPv6 addresses
          // which themselves contain colons
          for (let i = 0; i < parts.length - 1; i++) {
            if (parts[i] === "range") {
              startIndex = i + 1;
              break;
            }
          }

          if (startIndex >= 0 && endIndex > startIndex) {
            // Reconstruct the IPv6 addresses from the parts
            const startIpStr = parts.slice(startIndex, endIndex).join(":");
            const endIpStr = parts.slice(endIndex).join(":");

            // Convert to BigInt
            const startIp = BigInt(startIpStr);
            const endIp = BigInt(endIpStr);

            return { startIp, endIp, key };
          }
        } catch (error: unknown) {
          // Properly handle unknown error type
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `Failed to parse IPv6 range from key ${key}: ${errorMessage}`
          );
        }
        return null;
      })
      .filter((range): range is IpRange<bigint> => range !== null);
  }
}
