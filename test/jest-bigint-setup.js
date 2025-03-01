/**
 * This file fixes BigInt serialization in Jest
 * It needs to run before any tests that use BigInt values
 */

// Save the original BigInt prototype methods
const originalToString = BigInt.prototype.toString;
const originalValueOf = BigInt.prototype.valueOf;

// Add toJSON method to BigInt prototype if it doesn't exist
if (!BigInt.prototype.toJSON) {
  BigInt.prototype.toJSON = function () {
    return { __bigint__: this.toString() };
  };
}

// Override JSON.stringify to handle BigInt values
const originalStringify = JSON.stringify;
JSON.stringify = function (...args) {
  return originalStringify(...args, (_, value) =>
    typeof value === "bigint" ? { __bigint__: value.toString() } : value
  );
};

// Override JSON.parse to restore BigInt values
const originalParse = JSON.parse;
JSON.parse = function (text, ...rest) {
  return originalParse(text, function reviveBigInt(key, value) {
    if (value && typeof value === "object" && value.__bigint__ !== undefined) {
      return BigInt(value.__bigint__);
    }
    // Apply the original reviver if provided
    if (rest.length > 0 && typeof rest[0] === "function") {
      return rest[0](key, value);
    }
    return value;
  });
};

// Add custom serializer for Jest snapshots
expect.addSnapshotSerializer({
  test: (val) => typeof val === "bigint",
  print: (val) => `BigInt("${val.toString()}")`,
});

console.log("BigInt serialization support registered for Jest");
