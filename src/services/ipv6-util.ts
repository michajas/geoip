/**
 * Dedicated utility class for IPv6 address processing
 * Handles the complex edge cases and calculations for IPv6 addresses
 */
export class Ipv6Util {
  /**
   * Comprehensive IPv6 address validation regex
   * Handles standard, compressed, and IPv4-mapped formats
   */
  private static readonly IPV6_REGEX =
    /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))$/;

  /**
   * Known problematic IPv6 prefixes that may cause processing issues
   */
  public static readonly PROBLEMATIC_PREFIXES = [
    "2a02:ffc0",
    "2a02:e680",
    "2a05:",
    "2a06:",
    "2a07:",
  ];

  /**
   * Validate if a string is a valid IPv6 address
   */
  public static isValid(ip: string): boolean {
    try {
      return this.IPV6_REGEX.test(ip);
    } catch (e) {
      // Fallback validation if regex fails
      if (ip.includes(":")) {
        const parts = ip.split(":");
        // Basic checks for IPv6
        return (
          parts.length <= 8 &&
          parts.every(
            (part) =>
              part === "" ||
              /^[0-9a-fA-F]{1,4}$/.test(part) ||
              // Allow IPv4-mapped segments
              (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(part) &&
                parts.length <= 7)
          )
        );
      }
      return false;
    }
  }

  /**
   * Check if an IPv6 address is potentially problematic for processing
   */
  public static isProblematic(ip: string): boolean {
    return (
      ip.includes("::::") || // Invalid format with too many colons
      this.PROBLEMATIC_PREFIXES.some((prefix) => ip.startsWith(prefix)) || // Known problematic prefix
      ip.length > 45 || // Suspiciously long
      ip.split(":").length > 8 // Too many segments
    );
  }

  /**
   * Normalize an IPv6 address to its standard form
   */
  public static normalize(ip: string): string {
    if (!ip) {
      throw new Error("IPv6 address cannot be empty");
    }

    // Remove potential leading/trailing whitespace
    ip = ip.trim();

    // Handle excessive colons (triple or more)
    if (ip.includes(":::")) {
      ip = ip.replace(/:{3,}/g, "::");
    }

    // Special handling for IPv4-mapped IPv6 addresses like ::ffff:192.168.1.1
    if (ip.includes(".")) {
      const parts = ip.split(":");
      const ipv4Part = parts[parts.length - 1];

      // Check if last part is an IPv4 address
      if (ipv4Part && ipv4Part.split(".").length === 4) {
        // Handle the special case of ::ffff:IPv4 which is an IPv4-mapped address
        if (
          ip.toLowerCase().includes("::ffff:") ||
          ip.toLowerCase().includes(":ffff:")
        ) {
          // Normalize to standard IPv4-mapped format: 0:0:0:0:0:ffff:IPv4
          return "0:0:0:0:0:ffff:" + ipv4Part;
        } else {
          // For other IPv6 addresses with IPv4 part, normalize normally but preserve IPv4 part
          let ipv6Part = ip.substring(0, ip.lastIndexOf(":"));
          if (ipv6Part.endsWith(":")) ipv6Part = ipv6Part.slice(0, -1);

          const normalizedIpV6 = this.normalizeNonMapped(ipv6Part);
          const segments = normalizedIpV6.split(":");

          // Ensure we only have 7 IPv6 segments (the 8th is the IPv4 part)
          while (segments.length >= 7) segments.pop();

          return segments.join(":") + ":" + ipv4Part;
        }
      }
    }

    // Standard IPv6 normalization without IPv4 parts
    return this.normalizeNonMapped(ip);
  }

  /**
   * Helper method to normalize a standard IPv6 address (without IPv4 parts)
   */
  private static normalizeNonMapped(ip: string): string {
    // Double colon special handling - the crux of IPv6 compression
    if (ip.includes("::")) {
      // Split the address at the double colon
      const parts = ip.split("::");

      if (parts.length !== 2) {
        throw new Error(
          `Invalid IPv6 address: ${ip} (multiple :: compression markers)`
        );
      }

      // Split the left and right parts by single colons
      let leftSegments = parts[0] ? parts[0].split(":") : [];
      let rightSegments = parts[1] ? parts[1].split(":") : [];

      // Handle special case where :: is at the beginning or end
      if (leftSegments.length === 1 && leftSegments[0] === "")
        leftSegments = [];
      if (rightSegments.length === 1 && rightSegments[0] === "")
        rightSegments = [];

      // Calculate how many zeros we need to insert
      const missingSegments = 8 - (leftSegments.length + rightSegments.length);
      if (missingSegments < 0) {
        throw new Error(`Invalid IPv6 address: ${ip} (too many segments)`);
      }

      // Fill in the zeros
      const zerosArray = Array(missingSegments).fill("0");

      // Combine the parts
      const allSegments = [...leftSegments, ...zerosArray, ...rightSegments];

      // Normalize each segment (remove leading zeros)
      return allSegments
        .map((segment) => {
          // Preserve IPv4-mapped segments
          if (segment.includes(".")) return segment;
          // Remove leading zeros but ensure there's at least one digit
          const normalized = segment
            ? segment.toLowerCase().replace(/^0+(?=[\da-f]+$)/, "")
            : "0";
          return normalized || "0";
        })
        .join(":");
    } else {
      // No compression - just split by colon and normalize each segment
      const segments = ip.split(":");

      if (segments.length !== 8) {
        throw new Error(
          `Invalid IPv6 address: ${ip} (expected 8 segments, got ${segments.length})`
        );
      }

      return segments
        .map((segment) => {
          // Preserve IPv4-mapped segments
          if (segment.includes(".")) return segment;
          // Remove leading zeros
          const normalized = segment
            ? segment.toLowerCase().replace(/^0+(?=[\da-f]+$)/, "")
            : "0";
          return normalized || "0";
        })
        .join(":");
    }
  }

  /**
   * Convert an IPv6 address to BigInt for calculations
   */
  public static toBigInt(ip: string): bigint {
    try {
      // First normalize the address
      const normalizedIp = this.normalize(ip);

      // Split into segments
      const segments = normalizedIp.split(":");

      if (segments.length !== 8) {
        throw new Error(
          `Normalized IPv6 should have 8 segments, but got ${segments.length}`
        );
      }

      let result = BigInt(0);

      // Process each segment
      for (let i = 0; i < 8; i++) {
        let segment = segments[i];

        // Handle IPv4-mapped segments (e.g., ::ffff:192.168.0.1)
        if (segment.includes(".")) {
          const ipv4Parts = segment.split(".").map((p) => parseInt(p, 10));
          if (
            ipv4Parts.length !== 4 ||
            ipv4Parts.some((p) => isNaN(p) || p < 0 || p > 255)
          ) {
            throw new Error(`Invalid IPv4-mapped segment in IPv6: ${segment}`);
          }

          // Convert IPv4 to two 16-bit segments
          const value = (ipv4Parts[0] << 8) + ipv4Parts[1];
          const nextValue = (ipv4Parts[2] << 8) + ipv4Parts[3];

          // Shift and add both values
          result = (result << BigInt(16)) | BigInt(value);
          result = (result << BigInt(16)) | BigInt(nextValue);

          // Skip next segment as we've consumed it
          i++;
          continue;
        }

        // Regular hexadecimal segment - parse value
        let value: number;
        try {
          value = parseInt(segment, 16);
        } catch (err) {
          throw new Error(`Cannot parse IPv6 segment as hex: ${segment}`);
        }

        if (isNaN(value) || value < 0 || value > 0xffff) {
          throw new Error(`IPv6 segment out of range: ${segment}`);
        }

        // Shift and add
        result = (result << BigInt(16)) | BigInt(value);
      }

      return result;
    } catch (error: unknown) {
      // Properly handle unknown error type
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      throw new Error(
        `Failed to convert IPv6 to BigInt (${ip}): ${errorMessage}`
      );
    }
  }

  /**
   * Convert a BigInt back to an IPv6 address string
   */
  public static fromBigInt(bigint: bigint): string {
    const maxIpv6 = BigInt("340282366920938463463374607431768211455"); // 2^128 - 1

    if (bigint < BigInt(0) || bigint > maxIpv6) {
      throw new Error(`BigInt value out of range for IPv6: ${bigint}`);
    }

    const groups = [];
    let tempValue = bigint;

    // Extract 16 bits at a time
    for (let i = 0; i < 8; i++) {
      // Get top 16 bits
      const group = (tempValue >> BigInt(112)) & BigInt(0xffff);
      groups.push(group.toString(16));
      // Shift left to get next 16 bits next time
      tempValue = tempValue << BigInt(16);
    }

    // Join with colons
    return groups.join(":");
  }

  /**
   * Calculate the start and end IPs of an IPv6 CIDR range
   */
  public static calculateRange(
    ip: string,
    prefix: number
  ): {
    startIp: bigint;
    endIp: bigint;
    startIpStr: string;
    endIpStr: string;
  } {
    // Validate prefix
    if (prefix < 0 || prefix > 128) {
      throw new Error(`IPv6 prefix must be between 0 and 128: ${prefix}`);
    }

    // Special case for prefix 0 (entire IPv6 address space)
    if (prefix === 0) {
      const startIp = BigInt(0);
      const endIp = BigInt("340282366920938463463374607431768211455"); // 2^128 - 1
      return {
        startIp,
        endIp,
        startIpStr: "0:0:0:0:0:0:0:0",
        endIpStr: "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
      };
    }

    // Convert IP to BigInt
    const ipBigInt = this.toBigInt(ip);
    const maxBits = BigInt(128);
    const prefixBigInt = BigInt(prefix);

    // Create a properly calculated mask
    let mask: bigint;
    if (prefixBigInt === maxBits) {
      // Special case for /128 (single IP)
      mask = BigInt(0);
    } else {
      const shiftAmount = maxBits - prefixBigInt;

      // Choose method based on shift amount size
      if (shiftAmount <= BigInt(63)) {
        // For smaller shifts that are safe with bitwise operations
        mask = (BigInt(1) << shiftAmount) - BigInt(1);
      } else {
        // For larger shifts, build the mask differently
        // Split the calculation into manageable chunks
        const chunkSize = BigInt(60); // Safe size for shifts

        // Calculate how many full chunks and remaining bits
        const fullChunks = shiftAmount / chunkSize;
        const remainingBits = shiftAmount % chunkSize;

        // Start with a mask for the remaining bits
        mask =
          remainingBits > BigInt(0)
            ? (BigInt(1) << remainingBits) - BigInt(1)
            : BigInt(0);

        // Add each chunk
        let chunkMask = (BigInt(1) << chunkSize) - BigInt(1);
        for (let i = BigInt(0); i < fullChunks; i++) {
          mask = mask | (chunkMask << (chunkSize * i + remainingBits));
        }
      }
    }

    // Calculate start and end addresses
    const startIp = ipBigInt & ~mask;
    const endIp = ipBigInt | mask;

    // Convert back to string representation
    return {
      startIp,
      endIp,
      startIpStr: this.fromBigInt(startIp),
      endIpStr: this.fromBigInt(endIp),
    };
  }

  /**
   * Parse IPv6 CIDR notation (e.g., 2001:db8::/32)
   */
  public static parseCidr(cidr: string): {
    startIp: bigint;
    endIp: bigint;
    prefix: number;
    startIpStr: string;
    endIpStr: string;
  } {
    // Split IP and prefix
    const parts = cidr.split("/");
    if (parts.length !== 2) {
      throw new Error(`Invalid IPv6 CIDR format: ${cidr}`);
    }

    const ip = parts[0];
    const prefix = parseInt(parts[1], 10);

    // Validate IP and prefix
    if (!this.isValid(ip) || isNaN(prefix) || prefix < 0 || prefix > 128) {
      throw new Error(`Invalid IPv6 CIDR: ${cidr}`);
    }

    // Calculate range
    const range = this.calculateRange(ip, prefix);
    return {
      ...range,
      prefix,
    };
  }

  /**
   * Check if an IPv6 address is within a range
   */
  public static isInRange(ip: string, startIp: bigint, endIp: bigint): boolean {
    try {
      // Convert IP to BigInt
      const ipBigInt = this.toBigInt(ip);
      // Check range containment
      return ipBigInt >= startIp && ipBigInt <= endIp;
    } catch (error) {
      // If conversion fails, it's not in range
      return false;
    }
  }
}
