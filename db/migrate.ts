import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { db } from "./index";
import migrations from "../drizzle/migrations";

export function runMigrations() {
  return useMigrations(db, migrations);
}
