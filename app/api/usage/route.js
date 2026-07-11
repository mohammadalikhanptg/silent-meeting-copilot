import { NextResponse } from 'next/server';
import { getSessionPayload } from '../../lib/auth';
import { getSql } from '../../lib/db';
import { planFor, periodFor, ensureUsageSchema } from '../../lib/entitlements';

export const dynamic = 'force-dynamic';

// GET /api/usage
// Cookie-authenticated. Returns the logged-in user's usage for the current
// billing period: minutes used, session count, plan, the plan's included
// minutes, and remaining minutes. Read-only and non-enforcing (display only in
// this slice); limit enforcement is added with the pricing decision.
export async function GET() {
  const session = await getSessionPayload();
  if (!session?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sql = getSql();
  const period = periodFor();

  try {
    await ensureUsageSchema(sql);
  } catch {
    // If schema provisioning races on a cold start, fall through; the queries
    // below tolerate an empty result and the next call self-heals.
  }

  const [usage] = await sql`
    SELECT seconds_used, sessions FROM account_usage
    WHERE user_email = ${session.email} AND period = ${period}`;
  const [user] = await sql`SELECT plan FROM auth_users WHERE email = ${session.email}`;

  const planName = user?.plan || 'trial';
  const plan = planFor(planName);
  const secondsUsed = Number(usage?.seconds_used || 0);
  const minutesUsed = Math.round(secondsUsed / 60);

  return NextResponse.json({
    period,
    plan: planName,
    planLabel: plan.label,
    includedMinutes: plan.includedMinutes,
    minutesUsed,
    remainingMinutes: Math.max(0, plan.includedMinutes - minutesUsed),
    sessions: usage?.sessions || 0,
  });
}
