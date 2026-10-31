"use client";

import { useEffect } from "react";
import { toast } from "@/components/toast";
import { finishGoogleReturn } from "@/lib/google-auth";

/** On every page: finishes a Google sign-in that came back from the platform address (?hh_code=…). */
export function GoogleReturn() {
  useEffect(() => {
    finishGoogleReturn().catch((err: Error) => toast(err.message, "info"));
  }, []);
  return null;
}
