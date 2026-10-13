import "server-only";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";

/** A fresh idempotency key per rendered form, so a retried submission never saves twice. */
export async function newRequestKey(): Promise<string> {
  await connection();
  return randomUUID();
}
