import { NextRequest } from 'next/server';
import { scrapeSite } from '@/lib/scrape';
import { analyzeWithClaude } from '@/lib/analyze';
import { BudgetExceededError } from '@/lib/budget';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) return Response.json({ error: 'Missing url' }, { status: 400 });

  try {
    const scrape = await scrapeSite(url);
    if (scrape.pages.length === 0) {
      return Response.json(
        { error: 'No pages could be scraped from this site.' },
        { status: 422 },
      );
    }
    const brief = await analyzeWithClaude(scrape);
    return Response.json({
      brief,
      meta: {
        domain: scrape.domain,
        homeUrl: scrape.homeUrl,
        pagesScraped: scrape.pages.map(p => ({ url: p.url, title: p.title })),
      },
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return Response.json({ error: err.message }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
