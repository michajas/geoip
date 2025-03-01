# Testing the GeoIP Service

This directory contains tests for the GeoIP service, including unit tests and integration tests.

## Prerequisites

Before running the tests, make sure you have all the required dependencies installed:

```bash
# Install Jest and related testing dependencies
yarn install-test-deps

# Or manually install them
yarn add --dev jest ts-jest @types/jest
```

## Running the Tests

```bash
# Run all tests
yarn test

# Run tests with coverage report
yarn test:coverage

# Run tests in watch mode during development
yarn test:watch
```

## Test Structure

- **Unit Tests**: Test individual components in isolation
  - IP utilities
  - CSV import functionality
  - Redis client wrapper

- **Integration Tests**: Test components working together
  - GeoIP lookup service
  - Database interactions

## BigInt Handling

For proper BigInt support in tests:

1. The `jest-setup-serializer.js` file provides custom serializers for BigInt values
2. This allows BigInt values to be properly displayed in test output and snapshots

## Mocking

For tests that interact with Redis:
- Use Jest's mocking capabilities to mock the Redis client
- Or set up a local Redis instance for integration tests
