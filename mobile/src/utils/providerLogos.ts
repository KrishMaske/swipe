const LOGO_BASE_URL = 'https://raw.githubusercontent.com/College-Canine/financial/main/logos/bank';

const PROVIDER_ALIAS_TO_SLUG: Array<{ aliases: string[]; slug: string }> = [
  { aliases: ['bank of america', 'bofa'], slug: 'bofa' },
  { aliases: ['chase', 'jpmorgan', 'jp morgan'], slug: 'chase' },
  { aliases: ['capital one', 'capitalone'], slug: 'capital-one' },
  { aliases: ['citi', 'citibank'], slug: 'citibank' },
  { aliases: ['discover'], slug: 'discover' },
  { aliases: ['american express', 'amex'], slug: 'amex' },
  { aliases: ['wells fargo', 'wellsfargo'], slug: 'wellsfargo' },
  { aliases: ['pnc'], slug: 'pnc' },
  { aliases: ['us bank', 'u.s. bank', 'usbank'], slug: 'usbank' },
  { aliases: ['td bank', 'toronto dominion', 'td'], slug: 'td' },
  { aliases: ['chime'], slug: 'chime' },
  { aliases: ['ally'], slug: 'ally' },
  { aliases: ['fidelity'], slug: 'fidelity' },
  { aliases: ['huntington'], slug: 'huntington' },
  { aliases: ['citizens bank', 'citizens'], slug: 'citizensbank' },
  { aliases: ['first horizon'], slug: 'firsthorizon' },
];

export function normalizeProviderKey(provider: string | null | undefined): string {
  return (provider || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getProviderLogoUrl(provider: string | null | undefined): string | null {
  const normalized = normalizeProviderKey(provider);
  if (!normalized) {
    return null;
  }

  const explicitMatch = PROVIDER_ALIAS_TO_SLUG.find((entry) =>
    entry.aliases.some((alias) => normalized.includes(alias))
  );

  const slug = explicitMatch ? explicitMatch.slug : toSlug(normalized);
  if (!slug) {
    return null;
  }

  return `${LOGO_BASE_URL}/${slug}.svg`;
}
