import { NextRequest } from 'next/server';
import { draftOutreachEmail, type Brief } from '@/lib/analyze';
import { BudgetExceededError } from '@/lib/budget';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let body: { brief?: Brief; csmName?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.brief) return Response.json({ error: 'Missing brief' }, { status: 400 });

  try {
    const email = await draftOutreachEmail(
      body.brief,
      body.csmName ?? '',
      body.notes ?? '',
    );
    return Response.json({ email });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return Response.json({ error: err.message }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
