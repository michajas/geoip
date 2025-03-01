import { IpUtil } from "../src/services/ip-util";

describe("IpUtil", () => {
  describe("ipToLong and longToIp", () => {
    it("should convert IP address to long integer correctly", () => {
      expect(IpUtil.ipToLong("192.168.1.1")).toBe(3232235777);
      expect(IpUtil.ipToLong("127.0.0.1")).toBe(2130706433);
      expect(IpUtil.ipToLong("8.8.8.8")).toBe(134744072);
    });

    it("should convert long integer to IP address correctly", () => {
      expect(IpUtil.longToIp(3232235777)).toBe("192.168.1.1");
      expect(IpUtil.longToIp(2130706433)).toBe("127.0.0.1");
      expect(IpUtil.longToIp(134744072)).toBe("8.8.8.8");
    });
  });

  describe("isValidIpv4", () => {
    it("should validate correct IPv4 addresses", () => {
      expect(IpUtil.isValidIpv4("192.168.1.1")).toBe(true);
      expect(IpUtil.isValidIpv4("127.0.0.1")).toBe(true);
      expect(IpUtil.isValidIpv4("8.8.8.8")).toBe(true);
    });

    it("should reject invalid IPv4 addresses", () => {
      expect(IpUtil.isValidIpv4("256.0.0.1")).toBe(false);
      expect(IpUtil.isValidIpv4("192.168.1")).toBe(false);
      expect(IpUtil.isValidIpv4("192.168.1.1.1")).toBe(false);
      expect(IpUtil.isValidIpv4("not-an-ip")).toBe(false);
    });
  });

  describe("isValidIpv6", () => {
    it("should validate correct IPv6 addresses", () => {
      expect(IpUtil.isValidIpv6("2001:db8::1")).toBe(true);
      expect(IpUtil.isValidIpv6("::1")).toBe(true);
      expect(IpUtil.isValidIpv6("fe80::1ff:fe23:4567:890a")).toBe(true);
      expect(IpUtil.isValidIpv6("2001:db8:3333:4444:5555:6666:7777:8888")).toBe(
        true
      );
    });

    it("should reject invalid IPv6 addresses", () => {
      expect(IpUtil.isValidIpv6(":::1")).toBe(false);
      expect(
        IpUtil.isValidIpv6("2001:db8:3333:4444:5555:6666:7777:88888")
      ).toBe(false);
      expect(IpUtil.isValidIpv6("not-an-ip")).toBe(false);
      expect(IpUtil.isValidIpv6("192.168.1.1")).toBe(false);
    });
  });

  describe("ipv6ToBigInt and bigIntToIpv6", () => {
    it("should convert IPv6 to BigInt and back correctly", () => {
      const testIp = "2001:db8::1";
      const bigIntValue = IpUtil.ipv6ToBigInt(testIp);
      const convertedBack = IpUtil.bigIntToIpv6(bigIntValue);

      // Note: The format may be different due to normalization
      expect(IpUtil.ipv6ToBigInt(convertedBack)).toEqual(bigIntValue);
    });
  });

  describe("normalizeIpv6", () => {
    it("should normalize abbreviated IPv6 addresses", () => {
      expect(IpUtil.normalizeIpv6("::1")).toBe(
        "0000:0000:0000:0000:0000:0000:0000:0001"
      );

      expect(IpUtil.normalizeIpv6("2001:db8::1")).toBe(
        "2001:0db8:0000:0000:0000:0000:0000:0001"
      );
    });
  });

  describe("getIpVersion", () => {
    it("should correctly identify IP versions", () => {
      expect(IpUtil.getIpVersion("192.168.1.1")).toBe(4);
      expect(IpUtil.getIpVersion("2001:db8::1")).toBe(6);
      expect(IpUtil.getIpVersion("not-an-ip")).toBe(null);
    });
  });
});
