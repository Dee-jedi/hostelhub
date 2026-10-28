import type { Hostel } from "@/lib/model";
import { command, CommandError } from "@/lib/server/command";
import { hostelRefs } from "@/lib/server/hostel-data";
import { isTestMode, listBanks, resolveAccount, saveSubaccount, TEST_BANK, type Bank } from "@/lib/server/paystack";

/** The banks offered: Nigeria's, plus Paystack's test bank first on a test site. */
async function banksOffered(): Promise<Bank[]> {
  const banks = await listBanks();
  return isTestMode() ? [{ name: TEST_BANK.name, code: TEST_BANK.code }, ...banks] : banks;
}

/** GET: the banks a hostel can be paid into, and on a test site, the account to use there. */
export async function GET() {
  try {
    const test = isTestMode();
    return Response.json({ banks: await banksOffered(), test, testBank: test ? { name: TEST_BANK.name, account: TEST_BANK.testAccount } : null });
  } catch (err) {
    console.error("onboarding/payout GET", err);
    return Response.json({ error: "Couldn't load the list of banks. Check your connection and try again." }, { status: 502 });
  }
}

interface Body {
  hostelId: string;
  bankCode: string;
  accountNumber: string;
  /** false: just look up the account name; true: make it the hostel's payout account */
  confirm?: boolean;
}

/**
 * Sign-up, part three: where rent goes. First call looks the account up and returns the name the
 * bank holds; the confirming call creates (or updates) the hostel's Paystack subaccount.
 */
export const POST = command<Body, { accountName: string; bankName: string; saved: boolean }>({ access: "manager", hostelFromBody: true }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const accountNumber = String(body.accountNumber ?? "").replace(/\D/g, "");
  const bankCode = String(body.bankCode ?? "");
  if (accountNumber.length !== 10) throw new CommandError("Account numbers have 10 digits.");
  const bank = (await banksOffered()).find((b) => b.code === bankCode);
  if (!bank) throw new CommandError("Pick your bank from the list.");
  const testing = isTestMode();

  let accountName: string;
  try {
    accountName = await resolveAccount(accountNumber, bank.code);
  } catch {
    throw new CommandError(
      testing && bank.code !== TEST_BANK.code
        ? `This is a test site: real accounts can't be checked here. Pick ${TEST_BANK.name} and enter ${TEST_BANK.testAccount}.`
        : `We couldn't find account ${accountNumber} at ${bank.name}. Check the number and the bank.`,
      422,
    );
  }
  if (!body.confirm) return { accountName, bankName: bank.name, saved: false };

  const r = hostelRefs(h);
  const hostel = (await r.hostel.get()).data() as Hostel | undefined;
  if (!hostel) throw new CommandError("Hostel not found.", 404);
  if (hostel.status !== "draft") throw new CommandError("This hostel is live. Change the payout account from your dashboard.", 409);

  // Paystack's test bank can't hold a subaccount; on a test site it stands for Zenith's test account
  const payoutBankCode = testing && bank.code === TEST_BANK.code ? TEST_BANK.payoutBankCode : bank.code;
  let subaccountCode: string;
  try {
    subaccountCode = await saveSubaccount(
      {
        businessName: hostel.name,
        bankCode: payoutBankCode,
        accountNumber,
        contactName: hostel.manager.name,
        contactPhone: hostel.manager.phone,
        contactEmail: ctx.user?.email ?? undefined,
        hostelId: h,
      },
      hostel.payout?.subaccountCode,
    );
  } catch (err) {
    console.error("onboarding/payout subaccount", err);
    throw new CommandError("Paystack couldn't set up payouts to that account just now. Please try again in a minute.", 502);
  }

  const now = new Date().toISOString();
  await r.hostel.update({
    bank: { bankName: bank.name, accountName, accountNumber },
    payout: { subaccountCode, bankCode: payoutBankCode, verifiedAt: now, mode: testing ? "test" : "live" },
    "onboarding.step": "golive",
  });
  // Online payments now go through the payout account, with the service fee on top
  if ((await r.listing.get()).exists) await r.listing.update({ "info.serviceFee": true });
  await ctx.audit("hostel.payout_set", { bank: bank.name, accountEnding: accountNumber.slice(-4), subaccountCode });
  return { accountName, bankName: bank.name, saved: true };
});
