import { Audit, AppMetadata, Competitor, Recommendation, ScoreDimension } from './schemas.js';

const DIMENSIONS = [
  ['title', 'Title', 20],
  ['subtitle', 'Subtitle', 15],
  ['keywords', 'Keyword field', 15],
  ['description', 'Description', 10],
  ['screenshots', 'Screenshots', 15],
  ['preview', 'App preview video', 5],
  ['ratings', 'Ratings & reviews', 15],
  ['icon', 'Icon', 5],
  ['conversion', 'Conversion signals', 5],
  ['competitive', 'Competitive position', 5]
] as const;

function clampScore(score: number): number {
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

function firstSentence(text: string): string {
  return text.split(/[.!?]\s/)[0]?.slice(0, 180) || 'No public description text was available.';
}

function titleKeyword(name: string, category: string): string {
  const candidate = category.split(/\s+/).find((word) => word.length > 4);
  return candidate?.toLowerCase() ?? 'app';
}

function fitThirty(value: string): string {
  if (value.length <= 30) return value;
  const trimmed = value.slice(0, 30);
  return trimmed.includes(' ') ? trimmed.slice(0, trimmed.lastIndexOf(' ')).trim() : trimmed.trim();
}

function makeDimension(key: string, label: string, weight: number, score: number, evidence: string[], rationale: string): ScoreDimension {
  return { key, label, weight, score: clampScore(score), evidence, rationale };
}

function textRecommendation(input: {
  title: string;
  impact: 'High' | 'Medium' | 'Low';
  effort: 'Low' | 'Medium' | 'High';
  evidence: string;
  action: string;
  before?: string;
  after?: string;
}): Recommendation {
  return input;
}

export function buildDeterministicAudit(app: AppMetadata, competitors: Competitor[]): Audit {
  const nameLength = app.name.length;
  const subtitleLength = app.subtitle?.length ?? 0;
  const screenshotCount = app.screenshots.length;
  const hasReleaseNotes = Boolean(app.releaseNotes && app.releaseNotes.length > 30);
  const rating = app.rating ?? 0;
  const ratingCount = app.ratingCount ?? 0;
  const keyword = titleKeyword(app.name, app.category);
  const descriptionHook = firstSentence(app.description);
  const competitorAverageRating =
    competitors.length > 0
      ? competitors.reduce((sum, item) => sum + (item.rating ?? 0), 0) / competitors.length
      : null;

  const dimensions = [
    makeDimension(
      'title',
      'Title',
      20,
      (nameLength <= 30 ? 7 : 4) + (app.name.toLowerCase().includes(keyword) ? 1.5 : 0),
      [`Current title is "${app.name}" (${nameLength}/30 characters).`, `Category keyword signal: ${app.category}.`],
      nameLength <= 30 ? 'The title fits the App Store limit, but keyword coverage can be sharpened.' : 'The title appears too long for the visible App Store title field.'
    ),
    makeDimension(
      'subtitle',
      'Subtitle',
      15,
      app.subtitle ? (subtitleLength >= 20 && subtitleLength <= 30 ? 8 : 6) : 2,
      [app.subtitle ? `Subtitle is "${app.subtitle}" (${subtitleLength}/30 characters).` : 'Public subtitle was not found in the fetched page metadata.'],
      app.subtitle ? 'The subtitle is present and can carry secondary keywords.' : 'Missing subtitle data is a search relevance and conversion risk.'
    ),
    makeDimension(
      'keywords',
      'Keyword field',
      15,
      4,
      ['The private iOS keyword field is not exposed by public App Store metadata.'],
      'This requires App Store Connect access, so the audit flags likely keyword opportunities from visible metadata.'
    ),
    makeDimension(
      'description',
      'Description',
      10,
      Math.min(9, 4 + app.description.length / 900 + (/(try|start|get|download)/i.test(app.description) ? 1 : 0)),
      [`Description length is ${app.description.length} characters.`, `Opening hook: "${descriptionHook}".`],
      'The description should sell value in the first three visible lines before users tap more.'
    ),
    makeDimension(
      'screenshots',
      'Screenshots',
      15,
      Math.min(10, 2 + screenshotCount * 0.8),
      [`${screenshotCount}/10 iPhone screenshot slots are visible from public metadata.`],
      screenshotCount >= 8 ? 'Screenshot slot utilization is strong.' : 'More screenshot slots can communicate additional use cases and search-indexed captions.'
    ),
    makeDimension(
      'preview',
      'App preview video',
      5,
      app.previewVideos.length > 0 ? 7 : 2,
      [`${app.previewVideos.length} app preview video URL(s) detected.`],
      app.previewVideos.length > 0 ? 'A preview exists, but hook and no-sound clarity should be reviewed manually.' : 'No public app preview video was detected.'
    ),
    makeDimension(
      'ratings',
      'Ratings & reviews',
      15,
      Math.min(10, rating * 1.6 + Math.min(2, Math.log10(Math.max(1, ratingCount)) / 2)),
      [`Average rating is ${app.rating ?? 'unknown'} from ${app.ratingCount ?? 'unknown'} ratings.`],
      rating >= 4.5 ? 'Ratings are a conversion strength.' : 'Rating quality or review volume may be suppressing conversion.'
    ),
    makeDimension(
      'icon',
      'Icon',
      5,
      app.iconUrl ? 7 : 3,
      [app.iconUrl ? 'A 512px icon URL is available.' : 'No icon URL was returned by Apple lookup.'],
      'A visual inspection should confirm it stays recognizable in small search result contexts.'
    ),
    makeDimension(
      'conversion',
      'Conversion signals',
      5,
      hasReleaseNotes ? 6.5 : 3.5,
      [hasReleaseNotes ? `What's New copy is present: "${app.releaseNotes?.slice(0, 140)}".` : "What's New copy is missing or very thin."],
      'Public metadata does not expose custom product pages or in-app events consistently, so this score emphasizes visible release messaging.'
    ),
    makeDimension(
      'competitive',
      'Competitive position',
      5,
      competitorAverageRating ? (rating >= competitorAverageRating ? 7 : 5) : 4,
      [
        competitorAverageRating
          ? `Competitor average rating from fetched peers is ${competitorAverageRating.toFixed(2)}.`
          : 'No competitor set could be fetched from the public search API.'
      ],
      'The competitor sample is derived from Apple search results for the same category.'
    )
  ];

  const totalWeight = DIMENSIONS.reduce((sum, [, , weight]) => sum + weight, 0);
  const overallScore = Math.round(
    dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) / totalWeight * 10
  );

  const targetTitle = app.name.toLowerCase().includes(keyword)
    ? fitThirty(app.name.replace(/\s+and\s+/i, ', '))
    : fitThirty(`${app.name}: ${keyword}`);
  const targetSubtitle = app.subtitle && app.subtitle.length <= 30 ? app.subtitle : `Find ${app.category.toLowerCase()} faster`.slice(0, 30);

  return {
    overallScore,
    dimensions,
    quickWins: [
      textRecommendation({
        title: 'Tighten the visible title keyword',
        impact: 'High',
        effort: 'Low',
        evidence: `Title is "${app.name}" and the category is ${app.category}.`,
        action: 'Keep brand recognition but add one category/search keyword if it can fit naturally.',
        before: app.name,
        after: targetTitle
      }),
      textRecommendation({
        title: 'Make the subtitle carry a distinct benefit',
        impact: 'High',
        effort: 'Low',
        evidence: app.subtitle ? `Subtitle is "${app.subtitle}".` : 'No subtitle was detected from public metadata.',
        action: 'Use subtitle space for a user benefit and secondary keyword that does not repeat the title.',
        before: app.subtitle ?? '(empty or unavailable)',
        after: targetSubtitle
      }),
      textRecommendation({
        title: 'Rewrite the first description lines as a sharper hook',
        impact: 'Medium',
        effort: 'Low',
        evidence: `Current opening: "${descriptionHook}".`,
        action: 'Lead with the outcome users get before listing features.',
        before: descriptionHook,
        after: `${app.name} helps ${app.category.toLowerCase()} users get value faster with a simpler, clearer experience.`
      })
    ],
    highImpactChanges: [
      textRecommendation({
        title: 'Use all screenshot slots for benefit-led captions',
        impact: 'High',
        effort: 'Medium',
        evidence: `${screenshotCount}/10 iPhone screenshots are visible.`,
        action: 'Add screenshots until the first 8 to 10 slots explain core jobs, proof, and differentiators.',
        before: `Screenshot slots used: ${screenshotCount}`,
        after: '10 screenshots with captions like "Find top picks faster" and "Track progress at a glance"'
      }),
      textRecommendation({
        title: 'Build a keyword field from non-duplicated visible terms',
        impact: 'High',
        effort: 'Medium',
        evidence: 'The iOS keyword field is private, so duplicates and length cannot be verified publicly.',
        action: 'In App Store Connect, remove duplicated title/subtitle terms and use compact comma-separated singulars.',
        before: 'unknown',
        after: `${keyword},planner,tracker,discover,share,save,alerts,goals`.replace(/\s+/g, '').slice(0, 100)
      }),
      textRecommendation({
        title: 'Add or improve the app preview video',
        impact: 'Medium',
        effort: 'High',
        evidence: `${app.previewVideos.length} preview video URL(s) detected.`,
        action: 'Use a 15 to 30 second preview that shows the main value in the first three seconds and works muted.'
      })
    ],
    strategicRecommendations: [
      textRecommendation({
        title: 'Close rating and review gaps against category peers',
        impact: 'High',
        effort: 'High',
        evidence: competitorAverageRating
          ? `${app.name} rating is ${app.rating ?? 'unknown'} versus peer average ${competitorAverageRating.toFixed(2)}.`
          : `Current rating is ${app.rating ?? 'unknown'} from ${app.ratingCount ?? 'unknown'} ratings.`,
        action: 'Segment review prompts after successful moments and respond to recent negative themes before the next metadata release.'
      }),
      textRecommendation({
        title: 'Test custom product pages by intent cluster',
        impact: 'Medium',
        effort: 'High',
        evidence: `The listing category is ${app.category}; public metadata cannot confirm custom product pages.`,
        action: 'Create product pages for top intent clusters and align screenshots, subtitle, and paid traffic keywords.'
      }),
      textRecommendation({
        title: 'Refresh release messaging as conversion copy',
        impact: 'Medium',
        effort: 'Medium',
        evidence: hasReleaseNotes ? `What's New: "${app.releaseNotes?.slice(0, 160)}".` : "What's New copy is not informative in public metadata.",
        action: 'Write release notes that name user-visible improvements and reinforce trust.'
      })
    ],
    competitors,
    competitorNotes: competitors.length
      ? `Compared with the top ${competitors.length} apps returned by Apple Search for "${app.category}" in ${app.country.toUpperCase()}.`
      : 'Competitor data was unavailable from Apple Search.'
  };
}
