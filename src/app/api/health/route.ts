/**
 * Deployment check: which settings are present (yes/no only, never the values) and whether the
 * server can reach Firebase. Open /api/health after deploying to spot a missing variable.
 */
export async function GET() {
  const has = (name: string) => !!process.env[name]?.trim();
  const config = {
    PAYSTACK_SECRET_KEY: has("PAYSTACK_SECRET_KEY"),
    NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: has("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY"),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: has("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: has("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    // On Vercel this must be FIREBASE_SERVICE_ACCOUNT_BASE64; locally the file path is fine.
    // Firebase App Hosting needs neither (it sets FIREBASE_CONFIG and uses its own service account).
    FIREBASE_SERVICE_ACCOUNT:
      has("FIREBASE_SERVICE_ACCOUNT_BASE64") || has("FIREBASE_SERVICE_ACCOUNT") || has("FIREBASE_SERVICE_ACCOUNT_PATH") || has("FIREBASE_CONFIG"),
    ID_CARD_SECRET: has("ID_CARD_SECRET"),
  };
  let firebase = "ok";
  try {
    const { adminDb } = await import("@/lib/server/admin");
    await adminDb.doc("public/booking").get();
  } catch (err) {
    firebase = err instanceof Error ? err.message : "failed";
  }
  return Response.json({ ok: firebase === "ok" && Object.values(config).every(Boolean), firebase, config });
}
