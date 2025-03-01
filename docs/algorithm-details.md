# GeoIP Range Calculation and Storage Algorithm

This document explains the technical implementation of IP range calculations, storage, and lookups in our GeoIP service. It covers both IPv4 and IPv6 handling and details the specific algorithms used.

## 1. IP Range Calculation

### IPv4 Range Calculation

For IPv4 addresses, we use 32-bit integer representation. Given a CIDR notation like `192.168.1.0/24`:

1. **Convert IP to numeric form** - The IP address is converted to a 32-bit unsigned integer:
   ```typescript
   static ipToLong(ip: string): number {
     return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
   }
   ```

2. **Calculate subnet mask** - Based on the prefix length:
   ```typescript
   const mask = ~((1 << (32 - prefix)) - 1);
   ```

3. **Calculate range bounds**:
   ```typescript
   const startIp = ipLong & mask;      // First IP in range
   const endIp = startIp | ~mask;      // Last IP in range
   ```

4. **Conversion to signed integers** - For Redis storage compatibility:
   ```typescript
   const startIpSigned = IpUtil.toSigned32(startIp);
   const endIpSigned = IpUtil.toSigned32(endIp);
   ```

### IPv6 Range Calculation

IPv6 calculation is significantly more complex due to the 128-bit address space, which exceeds JavaScript's standard number type capabilities:

1. **Parse and normalize IPv6 address**:
   ```typescript
   const normalizedIp = IpUtil.normalizeIpv6(ip); // Handle compressed forms like ::1
   ```

2. **Convert to BigInt** - Required for 128-bit arithmetic:
   ```typescript
   const ipBigInt = IpUtil.ipv6ToBigInt(normalizedIp);
   ```

3. **Calculate mask using BigInt operations**:
   ```typescript
   // Special handling for large bit shifts
   const shiftAmount = maxBits - prefixBigInt;
   let mask;
   if (shiftAmount > 100) {
     mask = BigInt(2) ** shiftAmount - BigInt(1);  // For very large shifts
   } else {
     mask = (BigInt(1) << shiftAmount) - BigInt(1); // For smaller shifts
   }
   ```

4. **Calculate range**:
   ```typescript
   const startIp = ipBigInt & ~mask;
   const endIp = ipBigInt | mask;
   ```

## 2. Redis Storage Strategy

### Key Structure

We use structured Redis keys to store IP ranges:

1. **IPv4 ranges**: `geoip:v4:range:{startIp}:{endIp}`
   - Example: `geoip:v4:range:-1788517376:-1788517361` 
   - The negative numbers represent signed 32-bit integers

2. **IPv6 ranges**: `geoip:v6:range:{startIp}:{endIp}`
   - Example: `geoip:v6:range:42540766411282592856903984951653826560:42540766411282592856903984951653826815`
   - Uses decimal string representation of BigInt values

3. **Index entries** for direct lookups:
   - IPv4: `geoip:v4:idx:{ipLong}` → Points to the range key
   - IPv6: `geoip:v6:idx:{ipBigInt}` → Points to the range key

### Hash Storage

Each range key stores a Redis hash containing location data:
```
countryCode: "US"
country: "United States"
state: "California"
city: "San Francisco"
startIp: "192.168.1.0"   // Human-readable format
endIp: "192.168.1.255"   // Human-readable format
latitude: "37.7749"      // Optional
longitude: "-122.4194"   // Optional
```

## 3. Lookup Algorithm

### Two-Phase Lookup Process

1. **Direct Index Lookup** - Fast path for exact matches:
   ```typescript
   const exactIndexKey = `geoip:v4:idx:${ipLongSigned}`;
   const exactRangeKey = await redisClient.client.get(exactIndexKey);
   if (exactRangeKey) {
     const data = await redisClient.client.hGetAll(exactRangeKey);
     // Return result...
   }
   ```

2. **Range Scan** - For IPs without direct index:
   ```typescript
   // Scan keys with pattern matching
   let cursor = 0;
   do {
     const result = await redisClient.client.scan(cursor, {
       MATCH: "geoip:v4:range:*",
       COUNT: 1000,
     });
     cursor = result.cursor;
     
     // Check each range to see if it contains the target IP
     for (const key of result.keys) {
       const parts = key.split(":");
       const startIpSigned = parseInt(parts[3], 10);
       const endIpSigned = parseInt(parts[4], 10);
       
       // Convert to unsigned for comparison
       const startIpUnsigned = IpUtil.toUnsigned32(startIpSigned);
       const endIpUnsigned = IpUtil.toUnsigned32(endIpSigned);
       
       if (ipLong >= startIpUnsigned && ipLong <= endIpUnsigned) {
         // IP is in this range!
         const data = await redisClient.client.hGetAll(key);
         // Return result...
       }
     }
   } while (cursor !== 0);
   ```

## 4. Signed vs. Unsigned Integer Conversion

A critical aspect of our implementation is handling signed vs. unsigned integers:

```typescript
// Convert unsigned to signed 32-bit integer
static toSigned32(n: number): number {
  return n > 0x7FFFFFFF ? n - 0x100000000 : n;
}

// Convert signed to unsigned 32-bit integer  
static toUnsigned32(n: number): number {
  return n < 0 ? n + 0x100000000 : n;
}
```

This conversion is necessary because:
1. JavaScript treats numbers as signed values
2. Redis keys are stored as strings, so the sign is preserved
3. But conceptually, IP addresses are unsigned integers

## 5. Performance Optimizations

### Memory Efficiency

- We store human-readable IPs as hash fields but use numeric forms in keys
- Only essential location data is stored, not the entire GeoIP record
- Index keys are created only for network start addresses, not every IP

### Lookup Speed Optimizations

- Direct index lookup for /32 networks (single IP addresses)
- SCAN command with COUNT parameter to batch Redis operations
- Early termination in range lookups once a match is found
- Limits on maximum keys scanned to prevent runaway queries

### Import Optimizations

- Batch Redis operations using multi/exec pipelines
- Skip known problematic IPv6 ranges that cause calculation issues
- Progress tracking and reporting for long-running imports

## 6. Challenges and Edge Cases

### IPv6 BigInt Limitations

The BigInt operations for IPv6 can be resource-intensive:

```typescript
// Potentially resource-intensive calculation for large IPv6 ranges
const shiftAmount = maxBits - prefixBigInt;
if (shiftAmount > 100) {
  mask = BigInt(2) ** shiftAmount - BigInt(1);
} else {
  mask = (BigInt(1) << shiftAmount) - BigInt(1);
}
```

For large IPv6 ranges (small prefix lengths like /8), these calculations can consume excessive memory. We skip certain problematic prefixes to maintain system stability.

### Redis SCAN Performance

The SCAN operation's performance can degrade with large datasets. While it doesn't block Redis, it can take longer to complete as your dataset grows. Our algorithm:

1. Uses a reasonable COUNT value (1000) to balance memory and speed
2. Sets a maximum scan limit to prevent excessive resource usage
3. Implements early termination on match

## 7. Why This Approach?

### Benefits of Our Implementation

1. **Balance of memory and speed**: Direct indexes for common lookups, scanning for edge cases
2. **Handles both IPv4 and IPv6** with a unified approach
3. **Accommodates complex range arithmetics** without specialized dependencies
4. **Resilient to edge cases** in IPv6 handling
5. **Optimized for typical lookup patterns** (more direct lookups, fewer scans)

### Alternatives Considered

1. **Sorted Sets**: Would enable range queries but increase memory usage
2. **Full Indexing**: Creating an index for every possible IP would be too memory-intensive
3. **Third-party IP libraries**: Would add dependencies but might be more efficient

Our approach prioritizes maintainability, flexibility, and reasonable performance characteristics across both IP versions.

## 8. Future Improvements

1. Implement a true binary search algorithm for range lookups
2. Use Redis Lua scripts to push more computation to the Redis server
3. Consider using Redis modules like RedisBloom to enable probabilistic lookups
4. Batch key loading with Redis streams or Lua scripts
