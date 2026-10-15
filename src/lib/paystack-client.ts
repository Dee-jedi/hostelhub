"use client";

/** POSTs JSON to one of our API routes and throws the server's friendly message on failure. */
export async function postJSON<T>(url: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}

/** Opens the Paystack checkout for a transaction our server already initialised. */
export async function openPaystack(accessCode: string, on: { success: (reference: string) => void; cancel?: () => void; error?: (message: string) => void }) {
  const { default: PaystackPop } = await import("@paystack/inline-js");
  new PaystackPop().resumeTransaction(accessCode, {
    onSuccess: (tx) => on.success(tx.reference),
    onCancel: () => on.cancel?.(),
    onError: (e) => on.error?.(e.message || "Couldn't open the payment window"),
  });
}

/** Asks the server to confirm with Paystack, retrying briefly because confirmation can lag a few seconds. */
export async function confirmWithRetry<T extends { status: string }>(url: string, reference: string): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await postJSON<T>(url, { reference });
    if (r.status !== "pending") return r;
    await new Promise((ok) => setTimeout(ok, 2500));
  }
  return { status: "pending" } as T;
}
