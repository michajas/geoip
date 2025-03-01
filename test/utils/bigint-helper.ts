/**
 * Utility functions for testing with BigInt values
 */
export class BigIntHelper {
  /**
   * Compare two BigInt values for equality (serialization-safe)
   */
  static equal(a: bigint, b: bigint): boolean {
    return a.toString() === b.toString();
  }

  /**
   * Create a serializable representation of a BigInt
   */
  static serialize(value: bigint): string {
    return value.toString();
  }

  /**
   * Deserialize a BigInt from string format
   */
  static deserialize(value: string): bigint {
    return BigInt(value);
  }

  /**
   * Create a safe deep clone of an object that may contain BigInt values
   */
  static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Compare objects that may contain BigInt values
   */
  static objectsEqual(a: any, b: any): boolean {
    // Handle primitives
    if (a === b) return true;
    if (typeof a === "bigint" && typeof b === "bigint") return this.equal(a, b);

    // Handle different types or null/undefined
    if (
      a == null ||
      b == null ||
      typeof a !== "object" ||
      typeof b !== "object"
    )
      return false;

    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, idx) => this.objectsEqual(val, b[idx]));
    }

    // Handle objects
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    return keysA.every(
      (key) => keysB.includes(key) && this.objectsEqual(a[key], b[key])
    );
  }
}
