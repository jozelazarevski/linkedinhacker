// Initialize the SQLite database (creates the file + tables if missing).
//   npm run db:init
import { getDb } from "../lib/db";

getDb();
console.log("Database initialized at ./data/studio.db");
