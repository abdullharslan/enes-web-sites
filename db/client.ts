import "server-only";
import { connect, type Connection } from "./connection";

// Reuse one pool across dev hot reloads instead of leaking a pool per reload.
const globalForDb = globalThis as typeof globalThis & { __maisonVaultDb?: Connection };

export const db = (globalForDb.__maisonVaultDb ??= connect(process.env.DATABASE_URL)).db;
