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

function buildPrompt(scrape: ScrapeResult): string {
  const pageBlocks = scrape.pages
    .map(p => `## Page: ${p.title}\nURL: ${p.url}\n\n${p.text}`)
    .join('\n\n---\n\n');

  return `You are analyzing a company's website to help a Customer Success Manager (CSM) at Float (a resource management SaaS) prepare personalized outreach to a customer who has been disengaged.

Your job: extract a structured engagement brief from the scraped content below.

**Domain**: ${scrape.domain}
**Detected CSS colors** (raw, may be irrelevant — pick the ones that look like brand colors): ${scrape.cssColors.slice(0, 12).join(', ') || 'none detected'}
**Detected font families**: ${scrape.fontFamilies.slice(0, 5).join(', ') || 'none detected'}
**Detected logo URL**: ${scrape.logo ?? scrape.ogImage ?? 'none'}

**Guidance**:
- For products: extract distinct product lines or modules (e.g. "Product Analytics", "Session Replay"). Skip generic features. Empty if it's a single-product company.
- For customers: pull customer/logo names mentioned anywhere — case studies, logo walls, testimonials. Just the company names, deduped. This is high value for outreach.
- For people: prioritize founders, execs, and anyone quoted recently. Skip generic team-page lists if you can find more contextual mentions.
- For news: look for product launches, funding, hiring, customer announcements, blog posts with dates.
- For voice: this is the most important section. Be specific. "Friendly" is useless; "uses second-person, contractions, and short sentences punctuated by industry jargon" is useful.
- For sample_paragraph: write a NEW paragraph in their voice, as if it could appear on their site. Do not copy existing text.
- For conversation_hooks: each should be concrete enough that the CSM could literally paste it into an email. "Congrats on the Series B" not "mention their recent news". Reference specific customers, products, or news when possible.
- For visual.primary_colors: pick 2-4 hex codes from the detected CSS that look like *brand* colors (not generic grays, blacks, or whites). If none look brand-y, return empty.
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
        content: `You are drafting a re-engagement email from a Float CSM to a disengaged customer. The email should feel personal and match the customer's brand voice — like the CSM has actually been paying attention to their world.

**Customer brief**:
${JSON.stringify(brief, null, 2)}

**CSM name**: ${csmName || 'the CSM'}
**Additional context**: ${notes || '(none)'}

Write a short re-engagement email (max 120 words). Requirements:
- Match the customer's voice (see brief.voice).
- Open with a specific reference to one of the conversation_hooks or a recent_news item — never a generic "hope you're well".
- Mention Float briefly and naturally; the goal is to start a conversation, not pitch.
- End with one low-friction ask (e.g., "15 min next week?").
- Return ONLY the email body. No subject line, no signature placeholders like [Your Name], no preamble.`,
      },
    ],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
  );
  return textBlock?.text.trim() ?? '';
}
