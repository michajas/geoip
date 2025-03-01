/**
 * Custom serializer for handling BigInt values in Jest tests
 */

// Add BigInt serialization support
expect.addSnapshotSerializer({
  test: (val) => typeof val === "bigint",
  print: (val) => `BigInt(${val.toString()})`,
});

// Add a toJSON method to BigInt.prototype for JSON serialization
if (!BigInt.prototype.toJSON) {
  BigInt.prototype.toJSON = function () {
    return this.toString();
  };
}

// Log setup completion
console.log("Custom serializers registered for BigInt values");
