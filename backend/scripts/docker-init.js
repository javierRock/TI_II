import { provisionDatabases } from './provision-db.js';
import { migrateDatabase } from './migrate.js';
import { databaseUrls } from '../src/config/env.js';

const demo = {
  migration: process.env.DEMO_MIGRATION_DATABASE_URL,
  application: process.env.DEMO_DATABASE_URL,
};
await provisionDatabases({ additionalDatabases: [demo] });
await migrateDatabase(databaseUrls());
await migrateDatabase(databaseUrls({ test: true }));
await migrateDatabase(demo);
