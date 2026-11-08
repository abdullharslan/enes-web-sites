/** Runs once when the server starts (see the Next.js instrumentation guide). */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    process.env.RETENTION_TIMER !== "off"
  ) {
    try {
      const { startRetentionTimer } = await import("@/lib/server/retention-timer");
      startRetentionTimer();
    } catch {
      // Housekeeping must never keep the site from starting.
      console.error("Retention timer could not start");
    }
  }
}
