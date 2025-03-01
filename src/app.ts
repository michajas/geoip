import express from "express";
// Import routes
import { geoRoutes } from "./routes/geo-routes";

// Create Express application
const app = express();

// Add middleware
app.use(express.json());

// Add routes
app.use("/api/geo", geoRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

export default app;
