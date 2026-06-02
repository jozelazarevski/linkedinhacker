// Initialize the database (creates tables if missing).
//   npm run db:init
import { initDb } from "../lib/db";

initDb()
  .then(() => {
    console.log("Database initialized.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("DB init failed:", err);
    process.exit(1);
  });
