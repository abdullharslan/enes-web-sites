"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

interface PrivacyNavigator extends Navigator {
  globalPrivacyControl?: boolean;
}

/**
 * Reports a page view without cookies or identifiers (see lib/analytics/track.ts).
 * Visitors who ask not to be tracked (DNT / GPC) send nothing at all.
 */
export function PageViewBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    const nav = navigator as PrivacyNavigator;
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;
    const payload = new Blob([JSON.stringify({ path: pathname })], {
      type: "application/json",
    });
    nav.sendBeacon?.("/api/views", payload);
  }, [pathname]);
  return null;
}
