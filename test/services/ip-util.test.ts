import { IpUtil } from "../../src/services/ip-util";

describe("IpUtil", () => {
  describe("IPv4 operations", () => {
    describe("ipToLong and longToIp", () => {
      const testCases = [
        { ip: "0.0.0.0", long: 0 },
        { ip: "0.0.0.1", long: 1 },
        { ip: "0.0.1.0", long: 256 },
        { ip: "1.0.0.0", long: 16777216 },
        { ip: "192.168.1.1", long: 3232235777 },
        { ip: "255.255.255.255", long: 4294967295 },
        { ip: "10.0.0.1", long: 167772161 },
      ];

      test.each(testCases)(
        "should convert $ip to $long and back",
        ({ ip, long }) => {
          expect(IpUtil.ipToLong(ip)).toBe(long);
          expect(IpUtil.longToIp(long)).toBe(ip);
        }
      );
    });

    describe("toSigned32 and toUnsigned32", () => {
      const testCases = [
        { unsigned: 0, signed: 0 },
        { unsigned: 1, signed: 1 },
        { unsigned: 2147483647, signed: 2147483647 }, // Max positive 32-bit signed integer
        { unsigned: 2147483648, signed: -2147483648 }, // One more becomes negative
        { unsigned: 4294967295, signed: -1 }, // Max 32-bit unsigned integer
        { unsigned: 3232235777, signed: -1062731519 }, // 192.168.1.1
      ];

      test.each(testCases)(
        "should convert unsigned $unsigned to signed $signed",
        ({ unsigned, signed }) => {
          expect(IpUtil.toSigned32(unsigned)).toBe(signed);
        }
      );

      test.each(testCases)(
        "should convert signed $signed back to unsigned $unsigned",
        ({ unsigned, signed }) => {
          expect(IpUtil.toUnsigned32(signed)).toBe(unsigned);
        }
      );

      test("conversion should be reversible", () => {
        const testRange = [
          0, 1, 1000, 2147483647, 2147483648, 3232235777, 4294967295,
        ];

        for (const value of testRange) {
          const signed = IpUtil.toSigned32(value);
          const unsigned = IpUtil.toUnsigned32(signed);
          expect(unsigned).toBe(value);
        }
      });
    });

    describe("IPv4 CIDR parsing", () => {
      const validCases = [
        {
          cidr: "192.168.1.0/24",
          start: "192.168.1.0",
          end: "192.168.1.255",
        },
        {
          cidr: "10.0.0.0/8",
          start: "10.0.0.0",
          end: "10.255.255.255",
        },
        {
          cidr: "172.16.0.0/16",
          start: "172.16.0.0",
          end: "172.16.255.255",
        },
        {
          cidr: "172.16.0.1/32",
          start: "172.16.0.1",
          end: "172.16.0.1", // Single IP address
        },
        {
          cidr: "0.0.0.0/0",
          start: "0.0.0.0",
          end: "255.255.255.255", // Entire IPv4 space
        },
      ];

      test.each(validCases)(
        "should parse CIDR $cidr correctly",
        ({ cidr, start, end }) => {
          const result = IpUtil.parseIpv4Cidr(cidr);
          expect(result).not.toBeNull();
          expect(result?.start).toBe(start);
          expect(result?.end).toBe(end);
        }
      );

      const invalidCases = [
        "",
        "not-an-ip/24",
        "192.168.1.0", // No prefix
        "192.168.1.0/33", // Invalid prefix
        "192.168.1.0/-1", // Negative prefix
        "192.168.1.256/24", // Invalid IP
      ];

      test.each(invalidCases)(
        "should return null for invalid CIDR %s",
        (cidr) => {
          expect(IpUtil.parseIpv4Cidr(cidr)).toBeNull();
        }
      );
    });

    describe("subnet calculations", () => {
      test("should calculate subnet start address correctly", () => {
        expect(IpUtil.getIPv4SubnetStart("192.168.1.15", 24)).toBe(
          "192.168.1.0"
        );
        expect(IpUtil.getIPv4SubnetStart("10.45.123.67", 8)).toBe("10.0.0.0");
        expect(IpUtil.getIPv4SubnetStart("172.16.24.19", 16)).toBe(
          "172.16.0.0"
        );
        expect(IpUtil.getIPv4SubnetStart("8.8.8.8", 32)).toBe("8.8.8.8");
      });

      test("should calculate subnet end address correctly", () => {
        expect(IpUtil.getIPv4SubnetEnd("192.168.1.15", 24)).toBe(
          "192.168.1.255"
        );
        expect(IpUtil.getIPv4SubnetEnd("10.45.123.67", 8)).toBe(
          "10.255.255.255"
        );
        expect(IpUtil.getIPv4SubnetEnd("172.16.24.19", 16)).toBe(
          "172.16.255.255"
        );
        expect(IpUtil.getIPv4SubnetEnd("8.8.8.8", 32)).toBe("8.8.8.8");
      });

      test("should calculate subnet size correctly", () => {
        expect(IpUtil.calculateIPv4SubnetSize(32)).toBe(1);
        expect(IpUtil.calculateIPv4SubnetSize(31)).toBe(2);
        expect(IpUtil.calculateIPv4SubnetSize(30)).toBe(4);
        expect(IpUtil.calculateIPv4SubnetSize(24)).toBe(256);
        expect(IpUtil.calculateIPv4SubnetSize(16)).toBe(65536);
        expect(IpUtil.calculateIPv4SubnetSize(8)).toBe(16777216);
        expect(IpUtil.calculateIPv4SubnetSize(0)).toBe(4294967296);
      });
    });

    describe("isValidIpv4", () => {
      const validIPs = [
        "0.0.0.0",
        "1.2.3.4",
        "192.168.0.1",
        "255.255.255.255",
        "10.0.0.1",
        "172.16.0.1",
      ];

      const invalidIPs = [
        "",
        "not-an-ip",
        "192.168.0",
        "192.168.0.1.5",
        "192.168.0.256",
        "192.168.-1.5",
        " 192.168.0.1",
        "192.168.0.1 ",
      ];

      test.each(validIPs)("should validate IP %s as valid", (ip) => {
        expect(IpUtil.isValidIpv4(ip)).toBe(true);
      });

      test.each(invalidIPs)("should validate IP %s as invalid", (ip) => {
        expect(IpUtil.isValidIpv4(ip)).toBe(false);
      });
    });

    describe("getIpVersion", () => {
      test("should identify IPv4 addresses", () => {
        expect(IpUtil.getIpVersion("192.168.1.1")).toBe(4);
        expect(IpUtil.getIpVersion("8.8.8.8")).toBe(4);
      });

      test("should identify IPv6 addresses", () => {
        expect(IpUtil.getIpVersion("2001:db8::1")).toBe(6);
        expect(IpUtil.getIpVersion("::")).toBe(6);
      });

      test("should return null for invalid IPs", () => {
        expect(IpUtil.getIpVersion("not-an-ip")).toBeNull();
        expect(IpUtil.getIpVersion("")).toBeNull();
        expect(IpUtil.getIpVersion("999.999.999.999")).toBeNull();
      });
    });
  });

  // Tests for IPv6 delegation to Ipv6Util
  describe("IPv6 delegations", () => {
    // These tests will ensure IpUtil is properly delegating to Ipv6Util
    test("isValidIpv6 should delegate to Ipv6Util", () => {
      // We can't easily mock the imported Ipv6Util here, so just test functionality
      expect(IpUtil.isValidIpv6("2001:db8::1")).toBe(true);
      expect(IpUtil.isValidIpv6("not-an-ipv6")).toBe(false);
    });

    test("normalizeIpv6 should call through to Ipv6Util", () => {
      // Test with a simple case to ensure delegation works
      const normalized = IpUtil.normalizeIpv6("::1");
      expect(normalized).toBe("0:0:0:0:0:0:0:1");
    });

    test("IPv6 CIDR parsing should use Ipv6Util under the hood", () => {
      const result = IpUtil.parseIpv6Cidr("2001:db8::/64");
      expect(result).not.toBeNull();
      // The actual value depends on Ipv6Util's implementation, which we'll test separately
    });
  });
});
