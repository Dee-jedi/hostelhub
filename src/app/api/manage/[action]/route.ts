import { MANAGE, type ManageAction } from "@/lib/server/manage";

/** Manager actions for the hostel this address belongs to; see src/lib/server/manage.ts. */
export async function POST(req: Request, ctx: RouteContext<"/api/manage/[action]">) {
  const { action } = await ctx.params;
  const handler = Object.hasOwn(MANAGE, action) ? MANAGE[action as ManageAction] : null;
  if (!handler) return Response.json({ error: "Unknown action." }, { status: 404 });
  return handler(req);
}
