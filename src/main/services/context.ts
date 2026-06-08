import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type * as schema from "../db/schema";

export type ServiceContext = {
  profileId: string;
  db: LibSQLDatabase<typeof schema>;
};
