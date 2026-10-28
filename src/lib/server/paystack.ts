import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://api.paystack.co";

function secret() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = (await res.json()) as { status: boolean; message: string; data: T };
  if (!res.ok || !body.status) throw new Error(`Paystack: ${body.message ?? res.statusText}`);
  return body.data;
}

export function initializeTransaction(input: {
  email: string;
  /** naira */
  amount: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
  /**
   * Splits the payment: `mainShareNaira` settles to HostelHub's own account and the rest, less
   * Paystack's charge, to the hostel's subaccount (see fees.ts platformShare).
   */
  split?: { subaccount: string; mainShareNaira: number };
}) {
  return call<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: Math.round(input.amount * 100),
      currency: "NGN",
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
      ...(input.split ? { subaccount: input.split.subaccount, transaction_charge: Math.round(input.split.mainShareNaira * 100) } : {}),
    }),
  });
}

export interface VerifiedTransaction {
  status: "success" | "failed" | "abandoned" | "ongoing" | "pending" | "reversed" | string;
  reference: string;
  /** kobo */
  amount: number;
  currency: string;
  paid_at: string | null;
  channel: string;
}

export function verifyTransaction(reference: string) {
  return call<VerifiedTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

// ---------------------------------------------------------------- payouts (subaccounts)

/**
 * With test keys (checked 2026-10-28): Paystack's test bank (001, account 0000000000) resolves
 * without limit, but is refused for subaccounts; real banks resolve only 3 times a day; and
 * Zenith (057) with 0000000000 is accepted for a subaccount. So test sites offer the test bank,
 * and its subaccount is created against Zenith's test account.
 */
export const isTestMode = () => secret().startsWith("sk_test_");
export const TEST_BANK = { name: "Paystack Test Bank", code: "001", testAccount: "0000000000", payoutBankCode: "057" };

export interface Bank {
  name: string;
  code: string;
}

let bankCache: { at: number; banks: Bank[] } | null = null;

/** Nigerian banks (and microfinance banks) that can receive payouts, cached for a day. */
export async function listBanks(): Promise<Bank[]> {
  if (bankCache && Date.now() - bankCache.at < 24 * 3_600_000) return bankCache.banks;
  const data = await call<{ name: string; code: string; active: boolean; currency: string }[]>("/bank?country=nigeria&perPage=500");
  const seen = new Set<string>();
  const banks = data
    .filter((b) => b.active && b.currency === "NGN" && !seen.has(b.code) && seen.add(b.code))
    .map((b) => ({ name: b.name.trim(), code: b.code }))
    .sort((a, b) => a.name.localeCompare(b.name));
  bankCache = { at: Date.now(), banks };
  return banks;
}

/** The name on a bank account, as the bank holds it. Throws when the number doesn't exist at that bank. */
export async function resolveAccount(accountNumber: string, bankCode: string) {
  const data = await call<{ account_number: string; account_name: string }>(`/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);
  return data.account_name;
}

export interface SubaccountInput {
  businessName: string;
  bankCode: string;
  accountNumber: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  hostelId: string;
}

/**
 * A hostel's payout account. Rent paid online is split at checkout: the hostel's share settles
 * to this account; HostelHub's service fee is added per transaction (percentage_charge stays 0).
 */
export async function saveSubaccount(input: SubaccountInput, existingCode?: string) {
  const body = JSON.stringify({
    business_name: input.businessName,
    settlement_bank: input.bankCode,
    account_number: input.accountNumber,
    percentage_charge: 0,
    description: `HostelHub payouts for ${input.hostelId}`,
    primary_contact_name: input.contactName,
    primary_contact_phone: input.contactPhone,
    ...(input.contactEmail ? { primary_contact_email: input.contactEmail } : {}),
    metadata: JSON.stringify({ hostelId: input.hostelId }),
  });
  const data = existingCode
    ? await call<{ subaccount_code: string }>(`/subaccount/${encodeURIComponent(existingCode)}`, { method: "PUT", body })
    : await call<{ subaccount_code: string }>("/subaccount", { method: "POST", body });
  return data.subaccount_code;
}

/** Paystack signs webhook bodies with HMAC-SHA512 of the raw body using the secret key. */
export function isValidWebhook(rawBody: string, signature: string | null) {
  if (!signature) return false;
  const expected = createHmac("sha512", secret()).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
