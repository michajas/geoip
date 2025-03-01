import dotenv from "dotenv";
import { app } from "./app";
import { setupDataImport } from "./services/csv-parser";

dotenv.config();

const PORT = process.env.PORT || 3000;

// Start the periodic CSV import
setupDataImport();

// Start the Express server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
