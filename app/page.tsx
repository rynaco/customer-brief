'use client';

import { useState } from 'react';
import type { Brief } from '@/lib/analyze';

type AnalyzeResponse = {
  brief: Brief;
  meta: {
    domain: string;
    homeUrl: string;
    pagesScraped: { url: string; title: string }[];
  };
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const [csmName, setCsmName] = useState('');
  const [notes, setNotes] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setEmail(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Analyze failed');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDraftEmail() {
    if (!result) return;
    setEmailLoading(true);
    setEmailError(null);
    setEmail(null);
    try {
      const res = await fetch('/api/draft-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: result.brief, csmName, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Draft failed');
      setEmail(data.email);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setEmailLoading(false);
    }
  }

  return (
    <div className="flex-1 w-full bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Customer Brief
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Drop in a customer&apos;s URL and get a quick brief on their org, people,
            and some ideas to engage them.
          </p>
        </header>

        <form onSubmit={handleAnalyze} className="flex gap-2">
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="acme.com"
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {loading ? 'Analyzing…' : 'Generate brief'}
          </button>
        </form>

        {loading && (
          <p className="mt-6 text-sm text-zinc-500">
            Scraping the site and analyzing with Claude. This can take 20–40 seconds.
          </p>
        )}

        {error && (
          <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {result && <BriefView data={result} />}

        {result && (
          <section className="mt-10 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              Draft a re-engagement email
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Claude will match this customer&apos;s voice and reference a conversation hook.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={csmName}
                onChange={e => setCsmName(e.target.value)}
                placeholder="Your name (CSM)"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Extra context (e.g., last touched in Feb)"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </div>
            <button
              type="button"
              onClick={handleDraftEmail}
              disabled={emailLoading}
              className="mt-4 rounded-md bg-zinc-900 px-4 py-2 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {emailLoading ? 'Drafting…' : 'Draft email'}
            </button>
            {emailError && (
              <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                {emailError}
              </div>
            )}
            {email && (
              <pre className="mt-4 whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 p-4 font-sans text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                {email}
              </pre>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function BriefView({ data }: { data: AnalyzeResponse }) {
  const { brief, meta } = data;
  return (
    <section className="mt-8 space-y-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start gap-4">
          {brief.visual.logo_url && (
            <img
              src={brief.visual.logo_url}
              alt=""
              className="h-12 w-12 rounded object-contain"
            />
          )}
          <div className="flex-1">
            <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {brief.company_name}
            </h2>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">{brief.one_line_pitch}</p>
            <p className="mt-2 text-xs text-zinc-500">
              {meta.domain} · {meta.pagesScraped.length} pages scraped
            </p>
          </div>
        </div>
      </div>

      {(brief.products.length > 0 || brief.customers.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          {brief.products.length > 0 && (
            <Card title="Products">
              <div className="flex flex-wrap gap-1.5">
                {brief.products.map(p => (
                  <span
                    key={p}
                    className="rounded-md bg-blue-50 px-2 py-0.5 text-sm text-blue-900 dark:bg-blue-950/40 dark:text-blue-100"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </Card>
          )}
          {brief.customers.length > 0 && (
            <Card title="Customers">
              <div className="flex flex-wrap gap-1.5">
                {brief.customers.map(c => (
                  <span
                    key={c}
                    className="rounded-md bg-emerald-50 px-2 py-0.5 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {brief.conversation_hooks.length > 0 && (
        <Card title="Conversation hooks">
          <ul className="space-y-2">
            {brief.conversation_hooks.map((h, i) => (
              <li
                key={i}
                className="rounded-md bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
              >
                {h}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {brief.people.length > 0 && (
          <Card title="People">
            <ul className="space-y-3">
              {brief.people.map((p, i) => (
                <li key={i}>
                  <div className="font-medium text-zinc-900 dark:text-zinc-50">
                    {p.name}
                    {p.title && (
                      <span className="ml-2 font-normal text-zinc-500">— {p.title}</span>
                    )}
                  </div>
                  {p.context && (
                    <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                      {p.context}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {brief.recent_news.length > 0 && (
          <Card title="Recent news">
            <ul className="space-y-3">
              {brief.recent_news.map((n, i) => (
                <li key={i}>
                  <div className="font-medium text-zinc-900 dark:text-zinc-50">
                    {n.url ? (
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {n.headline}
                      </a>
                    ) : (
                      n.headline
                    )}
                  </div>
                  {n.date && <div className="text-xs text-zinc-500">{n.date}</div>}
                  {n.summary && (
                    <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                      {n.summary}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Card title="Brand voice">
        {brief.voice.tone.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {brief.voice.tone.map(t => (
              <span
                key={t}
                className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        {brief.voice.vocabulary_notes && (
          <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
            {brief.voice.vocabulary_notes}
          </p>
        )}
        {brief.voice.signature_phrases.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Signature phrases
            </div>
            <ul className="mt-1 list-disc pl-5 text-sm text-zinc-700 dark:text-zinc-300">
              {brief.voice.signature_phrases.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {brief.voice.sample_paragraph && (
          <blockquote className="mt-3 border-l-2 border-zinc-300 pl-3 text-sm italic text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
            {brief.voice.sample_paragraph}
          </blockquote>
        )}
      </Card>

      <details className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
          Pages scraped ({meta.pagesScraped.length})
        </summary>
        <ul className="mt-2 space-y-1 text-xs">
          {meta.pagesScraped.map(p => (
            <li key={p.url}>
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-700 hover:underline dark:text-zinc-300"
              >
                {p.title} — {p.url}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h3>
      {children}
    </div>
  );
}
