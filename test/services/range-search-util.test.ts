import { RangeSearchUtil, IpRange } from "../../src/services/range-search-util";
import { IpUtil } from "../../src/services/ip-util";
import { Ipv6Util } from "../../src/services/ipv6-util";

describe("RangeSearchUtil", () => {
  describe("IPv4 binary search", () => {
    const ranges: IpRange<number>[] = [
      {
        startIp: IpUtil.ipToLong("1.0.0.0"),
        endIp: IpUtil.ipToLong("1.0.0.255"),
        key: "range1",
      },
      {
        startIp: IpUtil.ipToLong("1.0.1.0"),
        endIp: IpUtil.ipToLong("1.0.1.255"),
        key: "range2",
      },
      {
        startIp: IpUtil.ipToLong("192.168.0.0"),
        endIp: IpUtil.ipToLong("192.168.0.255"),
        key: "range3",
      },
      {
        startIp: IpUtil.ipToLong("192.168.1.0"),
        endIp: IpUtil.ipToLong("192.168.1.255"),
        key: "range4",
      },
      {
        startIp: IpUtil.ipToLong("200.200.200.0"),
        endIp: IpUtil.ipToLong("200.200.200.255"),
        key: "range5",
      },
    ];

    const sortedRanges = RangeSearchUtil.sortIpv4Ranges(ranges);

    test("should find range for IP in the middle of a range", () => {
      const result = RangeSearchUtil.findIpv4Range(
        "192.168.0.123",
        sortedRanges
      );
      expect(result).not.toBeNull();
      expect(result?.key).toBe("range3");
    });

    test("should find range for IP at the start of a range", () => {
      const result = RangeSearchUtil.findIpv4Range("192.168.1.0", sortedRanges);
      expect(result).not.toBeNull();
      expect(result?.key).toBe("range4");
    });

    test("should find range for IP at the end of a range", () => {
      const result = RangeSearchUtil.findIpv4Range(
        "200.200.200.255",
        sortedRanges
      );
      expect(result).not.toBeNull();
      expect(result?.key).toBe("range5");
    });

    test("should return null for IP not in any range", () => {
      const result = RangeSearchUtil.findIpv4Range("8.8.8.8", sortedRanges);
      expect(result).toBeNull();
    });
  });

  describe("IPv6 binary search", () => {
    const ranges: IpRange<bigint>[] = [
      {
        startIp: Ipv6Util.toBigInt("2001:db8::"),
        endIp: Ipv6Util.toBigInt("2001:db8:0:0:ffff:ffff:ffff:ffff"),
        key: "range1",
      },
      {
        startIp: Ipv6Util.toBigInt("2001:db9::"),
        endIp: Ipv6Util.toBigInt("2001:db9:0:0:ffff:ffff:ffff:ffff"),
        key: "range2",
      },
      {
        startIp: Ipv6Util.toBigInt("fe80::"),
        endIp: Ipv6Util.toBigInt("fe80:0:0:0:ffff:ffff:ffff:ffff"),
        key: "range3",
      },
    ];

    const sortedRanges = RangeSearchUtil.sortIpv6Ranges(ranges);

    test("should find range for IPv6 in the middle of a range", () => {
      const result = RangeSearchUtil.findIpv6Range(
        "2001:db8::1234",
        sortedRanges
      );
      expect(result).not.toBeNull();
      expect(result?.key).toBe("range1");
    });

    test("should find range for IPv6 at the start of a range", () => {
      const result = RangeSearchUtil.findIpv6Range("2001:db9::", sortedRanges);
      expect(result).not.toBeNull();
      expect(result?.key).toBe("range2");
    });

    test("should return null for IPv6 not in any range", () => {
      const result = RangeSearchUtil.findIpv6Range("2001:db7::", sortedRanges);
      expect(result).toBeNull();
    });

    test("should handle malformed IPv6 properly", () => {
      const result = RangeSearchUtil.findIpv6Range("not-an-ipv6", sortedRanges);
      expect(result).toBeNull();
    });
  });

  describe("Key parsing", () => {
    test("should parse IPv4 range keys correctly", () => {
      const keys = [
        "geoip:v4:range:16777216:16777471", // 1.0.0.0/24
        "geoip:v4:range:3232235776:3232236031", // 192.168.0.0/24
        "other:key:not-a-range",
      ];

      const ranges = RangeSearchUtil.parseIpv4RangesFromKeys(keys);
      expect(ranges.length).toBe(2);
      expect(ranges[0].key).toBe("geoip:v4:range:16777216:16777471");
      expect(ranges[1].key).toBe("geoip:v4:range:3232235776:3232236031");

      // Verify number conversion
      expect(ranges[0].startIp).toBe(IpUtil.toUnsigned32(16777216));
      expect(ranges[0].endIp).toBe(IpUtil.toUnsigned32(16777471));
    });

    test("should parse IPv6 range keys correctly", () => {
      const keys = [
        "geoip:v6:range:42540766411282592856903984951653826560:42540766411282592875350729025363378175",
        "other:key:not-a-range",
      ];

      const ranges = RangeSearchUtil.parseIpv6RangesFromKeys(keys);
      expect(ranges.length).toBe(1);
      expect(ranges[0].key).toBe(
        "geoip:v6:range:42540766411282592856903984951653826560:42540766411282592875350729025363378175"
      );

      // Verify BigInt values
      expect(ranges[0].startIp.toString()).toBe(
        "42540766411282592856903984951653826560"
      );
      expect(ranges[0].endIp.toString()).toBe(
        "42540766411282592875350729025363378175"
      );
    });
  });
});
