import app from "./app";
import { redisClient } from "./services/redis-client";
import dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

const PORT = parseInt(process.env.PORT || "3001", 10);

// Initialize Redis connection
redisClient.ensureConnection().catch((err) => {
  console.error("Failed to connect to Redis:", err);
  process.exit(1);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`API endpoints:`);
  console.log(`- GET http://localhost:${PORT}/api/geo?ip={ip_address}`);
  console.log(`- GET http://localhost:${PORT}/api/geo/debug`);
  console.log(`- GET http://localhost:${PORT}/health`);
});

// Listen for termination signals to close connections
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Clean shutdown function
async function shutdown() {
  console.log("Shutting down gracefully...");

  try {
    await redisClient.disconnect();
    console.log("Redis connection closed");
  } catch (err) {
    console.error("Error during shutdown:", err);
  }

  process.exit(0);
}
