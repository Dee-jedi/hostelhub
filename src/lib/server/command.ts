import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import type { AccessClaims } from "../access";
import { accessFrom, isManagerOf, isPlatformAdmin, isTenantOf, roleIn } from "../access";
import { requestHost, resolveHost, type ResolvedHost } from "../hostel-host";
import { adminDb, verifyRequest } from "./admin";

/*
 * Every server action that changes money, occupancy or access goes through `command()`:
 *  1. works out the hostel from the address (or an explicit hostelId for platform tools),
 *  2. checks the login against the access the command needs,
 *  3. runs the handler and turns errors into a JSON reply the browser can show,
 *  4. records what happened in hostels/{id}/audit when the handler calls ctx.audit().
 */

/** An error whose message is safe to show the user; `details` go to the browser alongside it. */
export class CommandError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/**
 * public:    anyone, signed in or not (e.g. the booking page)
 * signed-in: any login
 * tenant:    a tenant of this hostel (managers may also call it, e.g. to act for a tenant)
 * manager:   a manager of this hostel
 * platform:  the platform admin; the hostel, if any, comes from the request body
 */
export type Access = "public" | "signed-in" | "tenant" | "manager" | "platform";

export interface CommandContext {
  /** The hostel this request is for, or null on platform addresses */
  hostelId: string | null;
  host: ResolvedHost;
  user: DecodedIdToken | null;
  access: AccessClaims;
  db: typeof adminDb;
  /** Records an action in the hostel's audit log (outside any transaction). */
  audit(action: string, details?: Record<string, unknown>): Promise<void>;
  /** Same, as part of a transaction, so the log entry commits with the change it describes. */
  auditIn(tx: Transaction, action: string, details?: Record<string, unknown>): void;
}

function auditEntry(ctx: Pick<CommandContext, "user" | "access" | "hostelId">, action: string, details?: Record<string, unknown>) {
  return {
    action,
    at: FieldValue.serverTimestamp(),
    by: ctx.user ? { uid: ctx.user.uid, email: ctx.user.email ?? null, role: ctx.hostelId ? roleIn(ctx.access, ctx.hostelId) : null } : null,
    ...(details ? { details } : {}),
  };
}

function auditRef(hostelId: string | null): DocumentReference {
  if (!hostelId) throw new Error("Audit entries need a hostel");
  return adminDb.collection(`hostels/${hostelId}/audit`).doc();
}

export function command<Body, Result>(
  options: { access: Access; /** platform commands: read the hostel from body.hostelId */ hostelFromBody?: boolean },
  handler: (ctx: CommandContext, body: Body) => Promise<Result>,
) {
  return async function route(req: Request): Promise<Response> {
    try {
      const host = resolveHost(requestHost(req));
      const body = (req.method === "GET" || req.method === "HEAD" ? {} : await req.json().catch(() => null)) as Body | null;
      if (body === null) throw new CommandError("The request body isn't valid JSON.");

      const user = await verifyRequest(req);
      const access = accessFrom(user as Record<string, unknown> | null);
      let hostelId = host.kind === "hostel" ? host.slug : null;
      if (options.hostelFromBody) {
        const fromBody = (body as { hostelId?: unknown }).hostelId;
        hostelId = typeof fromBody === "string" ? fromBody : null;
      }

      const needsLogin = options.access !== "public";
      if (needsLogin && !user) throw new CommandError("Please sign in again.", 401);
      const allowed =
        options.access === "public" ||
        options.access === "signed-in" ||
        (options.access === "platform" && isPlatformAdmin(access)) ||
        (options.access === "manager" && !!hostelId && isManagerOf(access, hostelId)) ||
        (options.access === "tenant" && !!hostelId && (isTenantOf(access, hostelId) || isManagerOf(access, hostelId)));
      if (!allowed) throw new CommandError("You don't have access to this.", 403);
      if ((options.access === "manager" || options.access === "tenant") && !hostelId) throw new CommandError("Unknown hostel.", 404);

      const ctx: CommandContext = {
        hostelId,
        host,
        user,
        access,
        db: adminDb,
        audit: async (action, details) => void (await auditRef(hostelId).set(auditEntry(ctx, action, details))),
        auditIn: (tx, action, details) => void tx.set(auditRef(hostelId), auditEntry(ctx, action, details)),
      };
      const result = await handler(ctx, body);
      return Response.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof CommandError) return Response.json({ error: err.message, ...(err.details ? { details: err.details } : {}) }, { status: err.status });
      console.error(`command ${new URL(req.url).pathname}`, err);
      return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
