// ABOUTME: Node.js-only entry point for the platform package.
// ABOUTME: Imports db/client to auto-register the pg Pool with the database context.

export { pool } from './db/client';
