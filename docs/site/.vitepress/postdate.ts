// Shared date handling for blog posts.
//
// A post's `date:` frontmatter arrives in three different shapes depending on who
// is reading it: YAML parses a bare `2026-07-30` into a Date, the client bundle
// gets that Date serialized to an ISO string, and a quoted `"2026-07-30"` stays a
// plain date-only string. Normalizing in one place keeps the index, the byline and
// the RSS feed from disagreeing about what day a post came out.

export type RawDate = string | Date | undefined | null

export function toDate(raw: RawDate): Date | null {
  if (!raw) return null
  // A date-only string is anchored to UTC on purpose: parsed as local time it
  // renders a day early everywhere west of Greenwich.
  const d = raw instanceof Date ? raw : new Date(/T/.test(raw) ? raw : `${raw}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function isoDate(raw: RawDate): string {
  const d = toDate(raw)
  return d ? d.toISOString().slice(0, 10) : ''
}

export function displayDate(raw: RawDate): string {
  const d = toDate(raw)
  if (!d) return ''
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
