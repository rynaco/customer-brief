import Anthropic from '@anthropic-ai/sdk';
import type { ScrapeResult } from './scrape';
import { consumeBudget } from './budget';

export type Person = {
  name: string;
  title: string | null;
  context: string | null;
};

export type NewsItem = {
  headline: string;
  date: string | null;
  url: string | null;
  summary: string | null;
};

export type VoiceProfile = {
  tone: string[];
  signature_phrases: string[];
  vocabulary_notes: string;
  sample_paragraph: string;
};

export type Visual = {
  primary_colors: string[];
  font_families: string[];
  logo_url: string | null;
};

export type Brief = {
  company_name: string;
  one_line_pitch: string;
  products: string[];
  customers: string[];
  people: Person[];
  recent_news: NewsItem[];
  voice: VoiceProfile;
  visual: Visual;
  conversation_hooks: string[];
};

const MODEL = 'claude-haiku-4-5-20251001';

const briefTool: Anthropic.Messages.Tool = {
  name: 'submit_brief',
  description: 'Submit the structured engagement brief for the company.',
  input_schema: {
    type: 'object',
    properties: {
      company_name: { type: 'string' },
      one_line_pitch: {
        type: 'string',
        description: "A single sentence describing what the company does, in the company's own voice.",
      },
      products: {
        type: 'array',
        items: { type: 'string' },
        description: 'Distinct products, modules, or product lines the company offers (e.g., "Session Replay", "Feature Flags"). Empty if not clearly listed.',
      },
      customers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Notable customers, logos, or case study subjects mentioned on the site. Just the company/brand names (e.g., "Airbus", "Y Combinator"). Empty if none surface in the scrape.',
      },
      people: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            title: { type: ['string', 'null'] },
            context: {
              type: ['string', 'null'],
              description: 'Brief note about why this person is relevant (e.g., recent hire, public quote, decision-maker).',
            },
          },
          required: ['name', 'title', 'context'],
        },
      },
      recent_news: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            headline: { type: 'string' },
            date: { type: ['string', 'null'] },
            url: { type: ['string', 'null'] },
            summary: { type: ['string', 'null'] },
          },
          required: ['headline', 'date', 'url', 'summary'],
        },
      },
      voice: {
        type: 'object',
        properties: {
          tone: {
            type: 'array',
            items: { type: 'string' },
            description: 'Adjectives describing the brand tone (e.g., playful, technical, formal).',
          },
          signature_phrases: {
            type: 'array',
            items: { type: 'string' },
            description: 'Distinctive phrases or vocabulary the company uses repeatedly.',
          },
          vocabulary_notes: {
            type: 'string',
            description: 'Short paragraph on word choices, sentence length, formality.',
          },
          sample_paragraph: {
            type: 'string',
            description: 'A 2-3 sentence paragraph written in the company\'s voice — original, not copied.',
          },
        },
        required: ['tone', 'signature_phrases', 'vocabulary_notes', 'sample_paragraph'],
      },
      visual: {
        type: 'object',
        properties: {
          primary_colors: {
            type: 'array',
            items: { type: 'string' },
            description: 'Hex codes of the 2-4 most prominent brand colors.',
          },
          font_families: {
            type: 'array',
            items: { type: 'string' },
          },
          logo_url: { type: ['string', 'null'] },
        },
        required: ['primary_colors', 'font_families', 'logo_url'],
      },
      conversation_hooks: {
        type: 'array',
        items: { type: 'string' },
        description: '3-5 specific, concrete openings a CSM could use in outreach. Each should reference something specific (a person, news item, customer, or product detail).',
      },
    },
    required: [
      'company_name',
      'one_line_pitch',
      'products',
      'customers',
      'people',
      'recent_news',
      'voice',
      'visual',
      'conversation_hooks',
    ],
  },
};

const POSTHOG_PRODUCTS = `
- **Product Analytics**: funnels, retention, dashboards, user paths, cohorts
- **Session Replay**: watch real user sessions to debug bugs and UX friction
- **Feature Flags**: gate features by user/segment, safe rollouts, kill switches
- **Experiments**: A/B tests with proper statistics, multivariate
- **Error Tracking**: catch frontend & backend exceptions, group by impact
- **Surveys**: in-product feedback, NPS, targeted by behavior
- **Web Analytics**: simpler page/traffic view alongside product analytics
- **Data Warehouse / SQL**: unify product events with CRM, billing, support data
- **LLM Observability**: traces, evals, generations for AI products
- **Heatmaps**: click/scroll maps on top of session replay`;

function buildPrompt(scrape: ScrapeResult): string {
  const pageBlocks = scrape.pages
    .map(p => `## Page: ${p.title}\nURL: ${p.url}\n\n${p.text}`)
    .join('\n\n---\n\n');

  return `You are analyzing the website of a **PostHog customer** to help a PostHog Customer Success Manager re-engage them. This customer signed up for PostHog but has gone quiet — they may not have onboarded fully, may not realize what's possible, or may be using a competitor for some of what PostHog covers.

Your job: extract a structured engagement brief from the scraped content below. The brief should help the CSM speak the customer's language and connect PostHog's products to the customer's actual business.

**PostHog's product catalog** (use this to ground conversation_hooks):
${POSTHOG_PRODUCTS}

**Target company domain**: ${scrape.domain}
**Detected CSS colors** (raw, may be irrelevant — pick the ones that look like brand colors): ${scrape.cssColors.slice(0, 12).join(', ') || 'none detected'}
**Detected font families**: ${scrape.fontFamilies.slice(0, 5).join(', ') || 'none detected'}
**Detected logo URL**: ${scrape.logo ?? scrape.ogImage ?? 'none'}

**Guidance**:
- For products: extract THIS COMPANY's own product lines or modules (not PostHog's). Skip generic features. Empty if it's a single-product company.
- For customers: pull THIS COMPANY's customers/logos — case studies, logo walls, testimonials. Just brand names, deduped.
- For people: prioritize founders, execs, heads of engineering/product/data — anyone a CSM might address or reference. Skip generic team-page lists.
- For news: product launches, funding, hiring, customer announcements, blog posts with dates.
- For voice: this is critical. Be specific. "Friendly" is useless; "uses second-person, contractions, and short sentences punctuated by aerospace jargon" is useful.
- For sample_paragraph: write a NEW paragraph in THEIR voice, as if it could appear on their site. Do not copy existing text.
- For conversation_hooks: the most valuable output. Each hook should reference something specific about this company (a product they ship, a customer they serve, recent news, a stated focus) and tie it to a specific PostHog product, with a clear reason why it would help. Produce 4-6 hooks, each tied to a different PostHog product when possible.
  TONE RULES (apply to every hook):
  - Talk like a human, not a salesperson. Conversational and direct. Never call them "leads", "stakeholders", or "decision-makers". Avoid "touch base", "circle back", "leverage", "synergy", "unlock value", "drive outcomes".
  - Do not use em-dashes (—), en-dashes (–), or colons inside the hook. Use periods and commas. Break compound thoughts into two short sentences instead of joining with punctuation.
  Good hook: "You're shipping safety-critical cockpit software for the 737 MAX. Session Replay would let your training team watch exactly where pilots stumble in simulator runs, before any change reaches a real aircraft."
  Bad hook (too generic): "Have you tried Session Replay?"
  Bad hook (sales-y / dashy): "Boeing's 737 MAX work — high stakes for any UI change — is the perfect leverage point for Session Replay to drive outcomes."
- For visual.primary_colors: pick 2-4 hex codes that look like *brand* colors (not generic grays, blacks, or whites). Empty if none stand out.
- If a section has no signal in the scrape, return an empty array — do not fabricate.

Call the \`submit_brief\` tool with your analysis.

---SCRAPED CONTENT---

${pageBlocks}`;
}

export async function analyzeWithClaude(scrape: ScrapeResult): Promise<Brief> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  consumeBudget();
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    tools: [briefTool],
    tool_choice: { type: 'tool', name: 'submit_brief' },
    messages: [{ role: 'user', content: buildPrompt(scrape) }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
  );
  if (!toolUse) throw new Error('Claude did not return a tool_use block');
  return toolUse.input as Brief;
}

export async function draftOutreachEmail(
  brief: Brief,
  csmName: string,
  notes: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  consumeBudget();
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are drafting a re-engagement email from a PostHog Customer Success Manager to a disengaged PostHog customer. They signed up for PostHog but haven't been actively using it. The email should feel personal and match the customer's brand voice — like the CSM has actually been paying attention to their world.

**Customer brief**:
${JSON.stringify(brief, null, 2)}

**CSM name**: ${csmName || 'the CSM'}
**Additional context**: ${notes || '(none)'}

Write a short re-engagement email (max 120 words). Requirements:
- Match the customer's voice (see brief.voice). Mirror their tone, sentence length, and word choices.
- Open with something specific. A conversation hook, a recent news item, or a named customer or product of theirs. Never "hope you're well" or any similar filler opener.
- Name ONE specific PostHog product (Session Replay, Feature Flags, Product Analytics, Experiments, Error Tracking, Surveys, LLM Observability, etc.) and tie it to something this company actually does.
- Acknowledge they're already on PostHog. This is re-engagement, not a cold pitch. Frame the ask around what they could be doing with it.
- End with one easy ask. Something like "Got 15 minutes next week to walk through how a team like yours is using it?"
- TONE RULES:
  - Talk like a human. Conversational and direct. Never call them a "lead", "stakeholder", or "decision-maker". Avoid "touch base", "circle back", "leverage", "synergy", "unlock value", "drive outcomes", "align".
  - Do not use em-dashes (—), en-dashes (–), or colons in the body. Use periods and commas. Break compound thoughts into two short sentences.
- Return ONLY the email body. No subject line, no signature placeholders like [Your Name], no preamble.`,
      },
    ],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
  );
  return textBlock?.text.trim() ?? '';
}
