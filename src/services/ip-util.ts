/**
 * Utility functions for working with IP addresses
 */
export class IpUtil {
  /**
   * Convert an IPv4 address to its numeric representation
   * Example: "192.168.1.1" -> 3232235777
   */
  static ipToLong(ip: string): number {
    return (
      ip
        .split(".")
        .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
    );
  }

  /**
   * Convert a numeric representation back to an IPv4 address string
   * Example: 3232235777 -> "192.168.1.1"
   */
  static longToIp(long: number): string {
    return [
      (long >>> 24) & 255,
      (long >>> 16) & 255,
      (long >>> 8) & 255,
      long & 255,
    ].join(".");
  }

  /**
   * Validate if the given string is a valid IPv4 address
   */
  static isValidIpv4(ip: string): boolean {
    const pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    if (!pattern.test(ip)) return false;

    return ip
      .split(".")
      .map(Number)
      .every((num) => num >= 0 && num <= 255);
  }

  /**
   * Validate if the given string is a valid IPv6 address
   */
  static isValidIpv6(ip: string): boolean {
    try {
      // Simplified IPv6 regex that is still effective
      // This handles standard, compressed, and mixed IPv6 formats
      const pattern =
        /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))$/;

      return pattern.test(ip);
    } catch (e) {
      // If there's any issue with the regex (which shouldn't happen with this fixed version),
      // fallback to a more basic validation approach
      if (ip.includes(":")) {
        const parts = ip.split(":");
        // Basic length check: IPv6 has a maximum of 8 segments
        return (
          parts.length <= 8 &&
          parts.every(
            (part) =>
              part === "" ||
              /^[0-9a-fA-F]{1,4}$/.test(part) ||
              // Allow IPv4-mapped segments (e.g., ::ffff:192.168.1.1)
              (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(part) &&
                parts.length <= 7)
          )
        );
      }
      return false;
    }
  }

  /**
   * Determine if an IP address is IPv4 or IPv6
   */
  static getIpVersion(ip: string): 4 | 6 | null {
    if (this.isValidIpv4(ip)) return 4;
    if (this.isValidIpv6(ip)) return 6;
    return null;
  }

  /**
   * Convert IPv6 to normalized form (expand abbreviations)
   */
  static normalizeIpv6(ip: string): string {
    // Handle IPv4-mapped IPv6 addresses
    if (ip.includes(".")) {
      const lastColon = ip.lastIndexOf(":");
      const ipv4Part = ip.substring(lastColon + 1);

      if (this.isValidIpv4(ipv4Part)) {
        const ipv4Binary = this.ipToLong(ipv4Part);
        const ipv4Hex = ipv4Binary.toString(16).padStart(8, "0");
        ip = `${ip.substring(0, lastColon)}:${ipv4Hex.substring(
          0,
          4
        )}:${ipv4Hex.substring(4)}`;
      }
    }

    // Handle :: abbreviation
    if (ip.includes("::")) {
      const parts = ip.split("::");
      const left = parts[0] ? parts[0].split(":") : [];
      const right = parts[1] ? parts[1].split(":") : [];
      const missing = 8 - left.length - right.length;
      const middle = Array(missing).fill("0");

      const expanded = [...left, ...middle, ...right]
        .map((part) => part.padStart(4, "0"))
        .join(":");

      return expanded;
    }

    // Handle normal case - just make sure all parts are 4 digits
    return ip
      .split(":")
      .map((part) => part.padStart(4, "0"))
      .join(":");
  }

  /**
   * Convert IPv6 address to its equivalent BigInt representation
   * for range comparison and storage
   */
  static ipv6ToBigInt(ip: string): bigint {
    const normalized = this.normalizeIpv6(ip);
    const hex = normalized.replace(/:/g, "");
    return BigInt(`0x${hex}`);
  }

  /**
   * Convert BigInt back to IPv6 string format
   */
  static bigIntToIpv6(value: bigint): string {
    // Convert to hex, ensure it's 32 characters (16 bytes)
    const hex = value.toString(16).padStart(32, "0");

    // Split into 8 parts of 4 characters each
    const parts: string[] = [];
    for (let i = 0; i < 32; i += 4) {
      parts.push(hex.slice(i, i + 4));
    }

    return parts.join(":");
  }

  /**
   * Check if an IP address is valid (either IPv4 or IPv6)
   */
  static isValidIp(ip: string): boolean {
    return this.isValidIpv4(ip) || this.isValidIpv6(ip);
  }

  /**
   * Calculate the number of IP addresses in a subnet mask (IPv4 only)
   */
  static calculateIPv4SubnetSize(prefixLength: number): number {
    // For a /24 subnet, we get 2^(32-24) = 2^8 = 256 addresses
    return Math.pow(2, 32 - prefixLength);
  }

  /**
   * Calculate the first IP address in a subnet (IPv4)
   */
  static getIPv4SubnetStart(ip: string, prefixLength: number): string {
    const ipLong = this.ipToLong(ip);
    const mask = ~((1 << (32 - prefixLength)) - 1);
    return this.longToIp(ipLong & mask);
  }

  /**
   * Calculate the last IP address in a subnet (IPv4)
   */
  static getIPv4SubnetEnd(ip: string, prefixLength: number): string {
    const ipLong = this.ipToLong(ip);
    const mask = ~((1 << (32 - prefixLength)) - 1);
    return this.longToIp((ipLong & mask) | ~mask);
  }

  /**
   * Parse CIDR notation (e.g., "192.168.1.0/24") to get start and end IPs
   */
  static parseIpv4Cidr(cidr: string): { start: string; end: string } | null {
    const parts = cidr.split("/");
    if (parts.length !== 2) return null;

    const ip = parts[0];
    const prefixLength = parseInt(parts[1], 10);

    if (
      !this.isValidIpv4(ip) ||
      isNaN(prefixLength) ||
      prefixLength < 0 ||
      prefixLength > 32
    ) {
      return null;
    }

    return {
      start: this.getIPv4SubnetStart(ip, prefixLength),
      end: this.getIPv4SubnetEnd(ip, prefixLength),
    };
  }

  /**
   * Parse IPv6 CIDR notation
   */
  static parseIpv6Cidr(cidr: string): { start: string; end: string } | null {
    const parts = cidr.split("/");
    if (parts.length !== 2) return null;

    const ip = parts[0];
    const prefixLength = parseInt(parts[1], 10);

    if (
      !this.isValidIpv6(ip) ||
      isNaN(prefixLength) ||
      prefixLength < 0 ||
      prefixLength > 128
    ) {
      return null;
    }

    // Convert to BigInt for bit manipulations
    const ipBigInt = this.ipv6ToBigInt(ip);
    const prefixBigInt = BigInt(prefixLength);
    const maxBits = BigInt(128);

    // Calculate subnet mask
    // For a /64 prefix, we want to keep the first 64 bits and zero the rest
    const mask = (BigInt(1) << (maxBits - prefixBigInt)) - BigInt(1);

    // Calculate start and end addresses
    const startAddress = ipBigInt & ~mask;
    const endAddress = ipBigInt | mask;

    return {
      start: this.bigIntToIpv6(startAddress),
      end: this.bigIntToIpv6(endAddress),
    };
  }

  /**
   * Parse any CIDR notation (IPv4 or IPv6)
   */
  static parseCidr(
    cidr: string
  ): { start: string; end: string; version: 4 | 6 } | null {
    if (cidr.includes(".")) {
      const result = this.parseIpv4Cidr(cidr);
      return result ? { ...result, version: 4 } : null;
    } else {
      const result = this.parseIpv6Cidr(cidr);
      return result ? { ...result, version: 6 } : null;
    }
  }
}
