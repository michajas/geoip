import { Ipv6Util } from "./ipv6-util";

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
   * Delegates to Ipv6Util
   */
  static isValidIpv6(ip: string): boolean {
    return Ipv6Util.isValid(ip);
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
   * Normalize an IPv6 address to its standard form
   * Delegates to Ipv6Util
   */
  static normalizeIpv6(ip: string): string {
    return Ipv6Util.normalize(ip);
  }

  /**
   * Convert IPv6 address to its equivalent BigInt representation
   * Delegates to Ipv6Util
   */
  static ipv6ToBigInt(ip: string): bigint {
    return Ipv6Util.toBigInt(ip);
  }

  /**
   * Convert a BigInt to an IPv6 address string
   * Delegates to Ipv6Util
   */
  static bigIntToIpv6(bigint: bigint): string {
    return Ipv6Util.fromBigInt(bigint);
  }

  /**
   * Convert an unsigned 32-bit integer to signed (for storage compatibility)
   */
  static toSigned32(n: number): number {
    return n > 0x7fffffff ? n - 0x100000000 : n;
  }

  /**
   * Convert a signed 32-bit integer to unsigned (for comparison)
   */
  static toUnsigned32(n: number): number {
    return n < 0 ? n + 0x100000000 : n;
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

    // Special case for prefix 0 (entire IPv4 space)
    if (prefixLength === 0) {
      return {
        start: "0.0.0.0",
        end: "255.255.255.255",
      };
    }

    return {
      start: this.getIPv4SubnetStart(ip, prefixLength),
      end: this.getIPv4SubnetEnd(ip, prefixLength),
    };
  }

  /**
   * Parse IPv6 CIDR notation
   * Delegates to Ipv6Util
   */
  static parseIpv6Cidr(cidr: string): { start: string; end: string } | null {
    try {
      const result = Ipv6Util.parseCidr(cidr);
      return {
        start: result.startIpStr,
        end: result.endIpStr,
      };
    } catch (error) {
      return null;
    }
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
