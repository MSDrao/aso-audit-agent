import { AppMetadata, Competitor, appMetadataSchema } from './schemas.js';

type LookupResult = Record<string, unknown>;

const APP_ID_PATTERN = /\/id(\d+)/;

export function parseAppStoreUrl(rawUrl: string): { appId: string; country: string; url: string } {
  const url = new URL(rawUrl);
  if (url.hostname !== 'apps.apple.com') {
    throw new Error('Please paste a URL from apps.apple.com.');
  }

  const appId = url.pathname.match(APP_ID_PATTERN)?.[1];
  if (!appId) {
    throw new Error('Could not find an Apple app id in that URL.');
  }

  const country = url.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? 'us';
  return { appId, country, url: url.toString() };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function appStoreUrl(country: string, appId: string): string {
  return `https://apps.apple.com/${country}/app/id${appId}`;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'ASOAuditAgent/0.1 (+https://example.local)'
    }
  });

  if (!response.ok) {
    throw new Error(`Apple request failed with ${response.status}`);
  }

  return response.text();
}

function extractSubtitle(html: string): string | null {
  const match = html.match(/<h2[^>]*class="[^"]*product-header__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
  return match?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;
}

function extractPreviewVideos(html: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/https:\/\/[^"'\\]+?\.m3u8[^"'\\]*/g)) {
    urls.add(match[0].replace(/\\u002F/g, '/'));
  }
  for (const match of html.matchAll(/"videoUrl"\s*:\s*"([^"]+)"/g)) {
    urls.add(match[1].replace(/\\u002F/g, '/'));
  }
  return [...urls];
}

function normalizeLookup(result: LookupResult, country: string, sourceUrl: string): AppMetadata {
  const appId = String(result.trackId ?? parseAppStoreUrl(sourceUrl).appId);
  return appMetadataSchema.parse({
    appId,
    url: typeof result.trackViewUrl === 'string' ? result.trackViewUrl : appStoreUrl(country, appId),
    country,
    name: String(result.trackName ?? 'Unknown app'),
    developer: String(result.artistName ?? result.sellerName ?? 'Unknown developer'),
    iconUrl: typeof result.artworkUrl512 === 'string' ? result.artworkUrl512 : undefined,
    category: String(result.primaryGenreName ?? 'Unknown'),
    genres: stringArray(result.genres),
    subtitle: null,
    description: typeof result.description === 'string' ? result.description : '',
    releaseNotes: stringOrNull(result.releaseNotes),
    version: stringOrNull(result.version),
    rating: numberOrNull(result.averageUserRating),
    ratingCount: numberOrNull(result.userRatingCount),
    screenshots: stringArray(result.screenshotUrls),
    ipadScreenshots: stringArray(result.ipadScreenshotUrls),
    previewVideos: [],
    contentRating: stringOrNull(result.contentAdvisoryRating),
    price: numberOrNull(result.price),
    currency: stringOrNull(result.currency)
  });
}

export async function fetchAppMetadata(rawUrl: string): Promise<AppMetadata> {
  const parsed = parseAppStoreUrl(rawUrl);
  const lookupUrl = `https://itunes.apple.com/lookup?id=${parsed.appId}&country=${parsed.country}`;
  const lookup = JSON.parse(await fetchText(lookupUrl)) as { resultCount: number; results: LookupResult[] };

  if (!lookup.resultCount || !lookup.results[0]) {
    throw new Error('Apple did not return a listing for that app id and country.');
  }

  const metadata = normalizeLookup(lookup.results[0], parsed.country, parsed.url);

  try {
    const html = await fetchText(parsed.url);
    return {
      ...metadata,
      subtitle: extractSubtitle(html),
      previewVideos: extractPreviewVideos(html)
    };
  } catch {
    return metadata;
  }
}

export async function fetchCompetitors(app: AppMetadata): Promise<Competitor[]> {
  const term = encodeURIComponent(app.category);
  const url = `https://itunes.apple.com/search?term=${term}&entity=software&country=${app.country}&limit=12`;
  const payload = JSON.parse(await fetchText(url)) as { results: LookupResult[] };

  return payload.results
    .filter((item) => String(item.trackId) !== app.appId)
    .slice(0, 3)
    .map((item) => ({
      appId: String(item.trackId),
      name: String(item.trackName ?? 'Unknown app'),
      developer: String(item.artistName ?? item.sellerName ?? 'Unknown developer'),
      category: String(item.primaryGenreName ?? 'Unknown'),
      rating: numberOrNull(item.averageUserRating),
      ratingCount: numberOrNull(item.userRatingCount),
      screenshots: stringArray(item.screenshotUrls).length,
      iconUrl: typeof item.artworkUrl100 === 'string' ? item.artworkUrl100 : undefined,
      url: typeof item.trackViewUrl === 'string' ? item.trackViewUrl : undefined
    }));
}
