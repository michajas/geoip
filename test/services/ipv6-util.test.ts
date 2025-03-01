import { Ipv6Util } from "../../src/services/ipv6-util";
import { BigIntHelper } from "../utils/bigint-helper";

describe("Ipv6Util", () => {
  describe("isValid", () => {
    const validIPs = [
      "2001:db8::1",
      "::1",
      "fe80::1",
      "2001:db8:0:0:0:0:0:1",
      "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
      "::ffff:192.0.2.128", // IPv4-mapped IPv6
      "::", // All zeros
      "2001:db8::", // Ends with ::
      "::1:2:3:4:5:6:7", // Starts with ::
      "fe80::dead:beef", // Common format with hexadecimal
    ];

    const invalidIPs = [
      "", // Empty string
      "not-an-ip", // Not an IP
      "192.168.0.1", // IPv4 address
      "2001:db8:::1", // Too many consecutive colons
      "12345::1", // Group out of range
      "2001:db8:1:2:3:4:5", // Too few groups without compression
      "g001::1", // Invalid characters
      "2001:db8::1::2", // Multiple :: groups
      "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", // Too many groups
    ];

    test.each(validIPs)("should validate IPv6 address %s as valid", (ip) => {
      expect(Ipv6Util.isValid(ip)).toBe(true);
    });

    test.each(invalidIPs)(
      "should validate IPv6 address %s as invalid",
      (ip) => {
        expect(Ipv6Util.isValid(ip)).toBe(false);
      }
    );
  });

  describe("normalize", () => {
    const normalizationTests = [
      { input: "2001:db8::1", expected: "2001:db8:0:0:0:0:0:1" },
      { input: "::", expected: "0:0:0:0:0:0:0:0" },
      { input: "::1", expected: "0:0:0:0:0:0:0:1" },
      { input: "2001:db8::", expected: "2001:db8:0:0:0:0:0:0" },

      // IPv4-mapped addresses should always have the standard format 0:0:0:0:0:ffff:IPv4
      { input: "::ffff:192.0.2.1", expected: "0:0:0:0:0:ffff:192.0.2.1" },
      { input: "::FFFF:192.0.2.1", expected: "0:0:0:0:0:ffff:192.0.2.1" },
      {
        input: "0:0:0:0:0:ffff:192.0.2.1",
        expected: "0:0:0:0:0:ffff:192.0.2.1",
      },

      // Regular IPv6 tests
      { input: "2001:0db8::1", expected: "2001:db8:0:0:0:0:0:1" }, // Leading zeros are parsed correctly
      { input: "2001:db8::0:1", expected: "2001:db8:0:0:0:0:0:1" }, // Multiple zeros are handled
      { input: "::ffff", expected: "0:0:0:0:0:0:0:ffff" },
      { input: "fe80::", expected: "fe80:0:0:0:0:0:0:0" },

      // Special case - fix malformed triple-colon which technically is invalid but we handle it
      { input: "2001:db8:::1", expected: "2001:db8:0:0:0:0:0:1" },
    ];

    test.each(normalizationTests)(
      "should normalize IPv6 $input to $expected",
      ({ input, expected }) => {
        expect(Ipv6Util.normalize(input)).toBe(expected);
      }
    );

    test("should throw for empty input", () => {
      expect(() => Ipv6Util.normalize("")).toThrow();
    });

    test("should throw for invalid IPv6 with too many segments", () => {
      expect(() => Ipv6Util.normalize("1:2:3:4:5:6:7:8:9")).toThrow();
    });
  });

  describe("toBigInt and fromBigInt", () => {
    test("should correctly convert IPv6 to BigInt and back", () => {
      const testCases = [
        {
          ip: "2001:db8::1",
          expectedBigInt: "42540766411282592856903984951653826561",
        },
        { ip: "::1", expectedBigInt: "1" },
        {
          ip: "fe80::",
          expectedBigInt: "338288524927261089654018896841347694592",
        },
      ];

      for (const { ip, expectedBigInt } of testCases) {
        const result = Ipv6Util.toBigInt(ip);
        expect(result.toString()).toBe(expectedBigInt);

        // Test roundtrip conversion
        const backToIp = Ipv6Util.fromBigInt(result);
        const normalizedOriginal = Ipv6Util.normalize(ip);
        const normalizedResult = Ipv6Util.normalize(backToIp);
        expect(normalizedResult).toBe(normalizedOriginal);
      }
    });

    // ...other test cases...
  });

  describe("isProblematic", () => {
    const problematicIPs = [
      "2a02:ffc0::1", // Known problematic prefix
      "2a02:e680:1:2::3", // Known problematic prefix
      "2a05:1:2:3::4", // Known problematic prefix
      "2a06:abc::", // Known problematic prefix
      "2a07:1234:5678::", // Known problematic prefix
      "2001:db8::::1", // Invalid format with too many colons
      "1:2:3:4:5:6:7:8:9", // Too many segments
    ];

    const nonProblematicIPs = [
      "2001:db8::1",
      "::1",
      "fe80::1",
      "2001:4860:4860::8888", // Google DNS
      "fe80::dead:beef",
    ];

    test.each(problematicIPs)("should identify %s as problematic", (ip) => {
      expect(Ipv6Util.isProblematic(ip)).toBe(true);
    });

    test.each(nonProblematicIPs)(
      "should identify %s as non-problematic",
      (ip) => {
        expect(Ipv6Util.isProblematic(ip)).toBe(false);
      }
    );
  });

  describe("calculateRange", () => {
    describe("standard ranges", () => {
      const testCases = [
        {
          ip: "2001:db8::1",
          prefix: 128,
          expectedStart: "2001:db8::1",
          expectedEnd: "2001:db8::1",
        },
        {
          ip: "2001:db8::1",
          prefix: 120,
          expectedStart: "2001:db8::0",
          expectedEnd: "2001:db8::ff",
        },
        {
          ip: "2001:db8::1",
          prefix: 112,
          expectedStart: "2001:db8::0",
          expectedEnd: "2001:db8::ffff",
        },
        {
          ip: "2001:db8::1",
          prefix: 64,
          expectedStart: "2001:db8::",
          expectedEnd: "2001:db8::ffff:ffff:ffff:ffff",
        },
        {
          ip: "2001:db8:1:2:3:4:5:6",
          prefix: 64,
          expectedStart: "2001:db8:1:2::",
          expectedEnd: "2001:db8:1:2:ffff:ffff:ffff:ffff",
        },
        {
          ip: "2001:db8::",
          prefix: 32,
          expectedStart: "2001:db8::",
          expectedEnd: "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff",
        },
        {
          ip: "::",
          prefix: 0, // All IPv6 space
          expectedStart: "::",
          expectedEnd: "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
        },
      ];

      test.each(testCases)(
        "should calculate range for $ip/$prefix",
        ({ ip, prefix, expectedStart, expectedEnd }) => {
          const range = Ipv6Util.calculateRange(ip, prefix);

          // Test returned BigInt values by converting back to IP strings
          expect(Ipv6Util.fromBigInt(range.startIp)).toEqual(
            Ipv6Util.normalize(expectedStart)
          );
          expect(Ipv6Util.fromBigInt(range.endIp)).toEqual(
            Ipv6Util.normalize(expectedEnd)
          );

          // Test returned string values
          expect(range.startIpStr).toEqual(Ipv6Util.normalize(expectedStart));
          expect(range.endIpStr).toEqual(Ipv6Util.normalize(expectedEnd));
        }
      );
    });

    describe("special cases", () => {
      test("should handle small prefixes that require special math", () => {
        // The /16 case triggers the special "large shift" logic
        const range = Ipv6Util.calculateRange("2001::", 16);

        // Test that the range starts with the correct prefix
        expect(range.startIp.toString().startsWith("4254")).toBeTruthy();

        // Verify these are different values
        expect(range.startIp.toString()).not.toEqual(range.endIp.toString());

        // Check that the difference between start and end is appropriate for a /16
        const difference = range.endIp - range.startIp;
        expect(difference > 0n).toBeTruthy();

        // Verify start IP is what we expect
        expect(range.startIpStr).toBe("2001:0:0:0:0:0:0:0");

        // Verify that the end IP has the same prefix but all trailing bits set
        expect(range.endIpStr.startsWith("2001:ffff:")).toBeTruthy();
      });

      test("should handle prefix = 0 (entire IPv6 space)", () => {
        const range = Ipv6Util.calculateRange("::", 0);
        expect(range.startIp.toString()).toBe("0");
        expect(range.endIp.toString()).toBe(
          "340282366920938463463374607431768211455"
        ); // 2^128 - 1
        expect(range.startIpStr).toBe("0:0:0:0:0:0:0:0");
        expect(range.endIpStr).toBe("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff");
      });

      test("should throw for invalid prefix values", () => {
        expect(() => Ipv6Util.calculateRange("2001:db8::", -1)).toThrow();
        expect(() => Ipv6Util.calculateRange("2001:db8::", 129)).toThrow();
      });
    });
  });

  describe("parseCidr", () => {
    test("should parse valid CIDR notations", () => {
      const result = Ipv6Util.parseCidr("2001:db8::/64");
      expect(result.prefix).toBe(64);
      expect(result.startIpStr).toBe("2001:db8:0:0:0:0:0:0");
      expect(result.endIpStr).toBe("2001:db8:0:0:ffff:ffff:ffff:ffff");
    });

    test("should handle compressed notations", () => {
      const result = Ipv6Util.parseCidr("::1/128");
      expect(result.prefix).toBe(128);
      expect(result.startIpStr).toBe("0:0:0:0:0:0:0:1");
      expect(result.endIpStr).toBe("0:0:0:0:0:0:0:1");
    });

    test("should throw for malformed CIDR", () => {
      expect(() => Ipv6Util.parseCidr("2001:db8::")).toThrow(); // Missing prefix
      expect(() => Ipv6Util.parseCidr("/64")).toThrow(); // Missing IP
      expect(() => Ipv6Util.parseCidr("2001:db8::/999")).toThrow(); // Invalid prefix
      expect(() => Ipv6Util.parseCidr("invalid/64")).toThrow(); // Invalid IP
    });
  });

  describe("isInRange", () => {
    test("should correctly detect IPs within a range", () => {
      // Set up a /64 test range
      const rangeResult = Ipv6Util.calculateRange("2001:db8::", 64);
      const startIp = rangeResult.startIp;
      const endIp = rangeResult.endIp;

      // Test IPs in the range
      expect(Ipv6Util.isInRange("2001:db8::", startIp, endIp)).toBe(true);
      expect(Ipv6Util.isInRange("2001:db8::1", startIp, endIp)).toBe(true);
      expect(Ipv6Util.isInRange("2001:db8::dead:beef", startIp, endIp)).toBe(
        true
      );
      expect(
        Ipv6Util.isInRange("2001:db8:0:0:ffff:ffff:ffff:ffff", startIp, endIp)
      ).toBe(true);

      // Test IPs outside the range
      expect(Ipv6Util.isInRange("2001:db9::", startIp, endIp)).toBe(false);
      expect(
        Ipv6Util.isInRange(
          "2001:db7:ffff:ffff:ffff:ffff:ffff:ffff",
          startIp,
          endIp
        )
      ).toBe(false);
      expect(Ipv6Util.isInRange("2001:db8:1::", startIp, endIp)).toBe(false);
    });

    test("should handle edge cases", () => {
      // Test with single IP range (/128)
      const singleIpRange = Ipv6Util.calculateRange("2001:db8::1", 128);
      expect(
        Ipv6Util.isInRange(
          "2001:db8::1",
          singleIpRange.startIp,
          singleIpRange.endIp
        )
      ).toBe(true);
      expect(
        Ipv6Util.isInRange(
          "2001:db8::2",
          singleIpRange.startIp,
          singleIpRange.endIp
        )
      ).toBe(false);

      // Test with entire IPv6 space (/0)
      const entireSpaceRange = Ipv6Util.calculateRange("::", 0);
      expect(
        Ipv6Util.isInRange(
          "::",
          entireSpaceRange.startIp,
          entireSpaceRange.endIp
        )
      ).toBe(true);
      expect(
        Ipv6Util.isInRange(
          "2001:db8::1",
          entireSpaceRange.startIp,
          entireSpaceRange.endIp
        )
      ).toBe(true);
      expect(
        Ipv6Util.isInRange(
          "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
          entireSpaceRange.startIp,
          entireSpaceRange.endIp
        )
      ).toBe(true);
    });

    test("should handle invalid inputs", () => {
      const range = Ipv6Util.calculateRange("2001:db8::", 64);
      expect(Ipv6Util.isInRange("invalid-ip", range.startIp, range.endIp)).toBe(
        false
      );
      expect(Ipv6Util.isInRange("", range.startIp, range.endIp)).toBe(false);
    });

    test("should properly handle equivalent IPs in different formats", () => {
      const range = Ipv6Util.calculateRange("2001:db8::", 64);

      // These are all the same IP in different formats
      const formats = [
        "2001:db8::1",
        "2001:db8:0:0:0:0:0:1",
        "2001:db8:0000:0000:0000:0000:0000:0001",
      ];

      for (const format of formats) {
        expect(Ipv6Util.isInRange(format, range.startIp, range.endIp)).toBe(
          true
        );
      }
    });
  });
});
