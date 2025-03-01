import express from "express";
import { geoRoutes } from "./controllers/geo-controller";

export const app = express();

// Middleware
app.use(express.json());

// Routes
app.use("/api/geo", geoRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "UP" });
});

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error(err.stack);
    res.status(500).json({ error: "Internal Server Error" });
  }
);

export default app;
