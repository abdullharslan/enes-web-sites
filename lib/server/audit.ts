import type { Executor } from "@/db/connection";
import { auditEvents } from "@/db/schema";

export interface AuditInput {
  actorId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  /** Never put secrets (passwords, tokens) in here. */
  details?: Record<string, unknown>;
}

export async function recordAudit(db: Executor, input: AuditInput): Promise<void> {
  await db.insert(auditEvents).values({
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    details: input.details ?? {},
  });
}
