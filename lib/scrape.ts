import * as cheerio from 'cheerio';

export type ScrapedPage = {
  url: string;
  title: string;
  text: string;
};

export type ScrapeResult = {
  domain: string;
  homeUrl: string;
  pages: ScrapedPage[];
  cssColors: string[];
  fontFamilies: string[];
  ogImage: string | null;
  favicon: string | null;
  logo: string | null;
};

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36 CustomerBriefBot/0.1';

const PAGE_KEYWORDS = [
  'about',
  'team',
  'people',
  'leadership',
  'company',
  'news',
  'press',
  'newsroom',
  'blog',
  'changelog',
  'product',
  'customers',
  'case-stud',
];

const MAX_PAGES = 7;
const MAX_TEXT_PER_PAGE = 3500;
const MAX_CSS_FILES = 3;
const MAX_CSS_BYTES = 200_000;
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return null;
    return res;
  } catch {
    return null;
  }
}

function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function extractText($: cheerio.CheerioAPI): string {
  $('script, style, noscript, svg, nav, footer header').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  return text.slice(0, MAX_TEXT_PER_PAGE);
}

function discoverLinks(
  $: cheerio.CheerioAPI,
  baseUrl: URL,
): { url: string; score: number }[] {
  const seen = new Map<string, number>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    let abs: URL;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (abs.hostname !== baseUrl.hostname) return;
    if (abs.pathname === baseUrl.pathname || abs.pathname === '/') return;
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|mp4)$/i.test(abs.pathname)) return;

    abs.hash = '';
    abs.search = '';
    const key = abs.toString();
    const path = abs.pathname.toLowerCase();
    const linkText = ($(el).text() || '').toLowerCase();
    let score = 0;
    for (const kw of PAGE_KEYWORDS) {
      if (path.includes(kw)) score += 3;
      if (linkText.includes(kw)) score += 2;
    }
    if (score === 0) return;
    seen.set(key, Math.max(seen.get(key) ?? 0, score));
  });
  return [...seen.entries()]
    .map(([url, score]) => ({ url, score }))
    .sort((a, b) => b.score - a.score);
}

function absolutize(u: string | undefined, baseUrl: URL): string | null {
  if (!u) return null;
  try {
    return new URL(u, baseUrl).toString();
  } catch {
    return null;
  }
}

async function fetchStylesheet(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/css,*/*' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, MAX_CSS_BYTES);
  } catch {
    return null;
  }
}

async function extractBrand(
  $: cheerio.CheerioAPI,
  baseUrl: URL,
): Promise<{
  ogImage: string | null;
  favicon: string | null;
  logo: string | null;
  cssColors: string[];
  fontFamilies: string[];
}> {
  const ogImage = absolutize($('meta[property="og:image"]').attr('content'), baseUrl);
  const themeColor = $('meta[name="theme-color"]').attr('content');
  const appleTouch = absolutize($('link[rel*="apple-touch-icon"]').attr('href'), baseUrl);
  const favicon =
    absolutize($('link[rel*="icon"]').attr('href'), baseUrl) ??
    absolutize('/favicon.ico', baseUrl);

  let logo: string | null = null;
  $('header img, nav img').each((_, el) => {
    if (logo) return;
    const src = $(el).attr('src');
    if (src) logo = absolutize(src, baseUrl);
  });
  if (!logo) {
    $('img').each((_, el) => {
      if (logo) return;
      const $el = $(el);
      const alt = ($el.attr('alt') ?? '').toLowerCase();
      const cls = ($el.attr('class') ?? '').toLowerCase();
      if (alt.includes('logo') || cls.includes('logo')) {
        logo = absolutize($el.attr('src'), baseUrl);
      }
    });
  }
  logo = logo ?? appleTouch ?? ogImage;

  const stylesheetUrls = $('link[rel="stylesheet"]')
    .map((_, el) => absolutize($(el).attr('href'), baseUrl))
    .get()
    .filter((u): u is string => Boolean(u))
    .slice(0, MAX_CSS_FILES);

  const externalCss = (
    await Promise.all(stylesheetUrls.map(fetchStylesheet))
  )
    .filter((s): s is string => Boolean(s))
    .join('\n');

  const inlineStyles =
    $('style').text() +
    ' ' +
    $('[style]').map((_, e) => $(e).attr('style')).get().join(' ');

  const allCss = inlineStyles + '\n' + externalCss;

  const hexColors = [...allCss.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
  const rgbColors = [...allCss.matchAll(/rgba?\([^)]+\)/g)].map(m => m[0]);
  const cssColors = [
    ...new Set([...(themeColor ? [themeColor] : []), ...hexColors, ...rgbColors]),
  ].slice(0, 30);

  const fontMatches = [...allCss.matchAll(/font-family:\s*([^;}"']+)/gi)].map(m =>
    m[1].trim(),
  );
  const fontFamilies = [...new Set(fontMatches)].slice(0, 15);

  return { ogImage, favicon, logo, cssColors, fontFamilies };
}

export async function scrapeSite(input: string): Promise<ScrapeResult> {
  const homeUrl = normalizeUrl(input);
  const homeRes = await fetchWithTimeout(homeUrl);
  if (!homeRes) {
    throw new Error(`Could not fetch ${homeUrl}. The site may be blocking bots or unreachable.`);
  }
  const homeHtml = await homeRes.text();
  const finalUrl = new URL(homeRes.url || homeUrl);
  const $home = cheerio.load(homeHtml);

  const homeTitle = $home('title').first().text().trim() || finalUrl.hostname;
  const homeText = extractText($home);
  const brand = await extractBrand($home, finalUrl);

  const candidates = discoverLinks(cheerio.load(homeHtml), finalUrl).slice(0, MAX_PAGES - 1);

  const pages: ScrapedPage[] = [
    { url: finalUrl.toString(), title: homeTitle, text: homeText },
  ];

  const results = await Promise.all(
    candidates.map(async ({ url }) => {
      const res = await fetchWithTimeout(url);
      if (!res) return null;
      const html = await res.text();
      const $ = cheerio.load(html);
      const title = $('title').first().text().trim() || url;
      const text = extractText($);
      if (!text || text.length < 100) return null;
      return { url, title, text };
    }),
  );
  for (const p of results) if (p) pages.push(p);

  return {
    domain: finalUrl.hostname,
    homeUrl: finalUrl.toString(),
    pages,
    ...brand,
  };
}
