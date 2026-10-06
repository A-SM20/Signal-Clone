"use client";

import { type ReactNode, useEffect, useState } from "react";
import { waitForApi } from "@/lib/health";
import { SplashScreen } from "./SplashScreen";

/** Renders children only once the backend answers /api/health. */
export function ApiGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    waitForApi({ onAttempt: setAttempts, signal: controller.signal })
      .then(() => setReady(true))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return ready ? <>{children}</> : <SplashScreen attempts={attempts} />;
}
