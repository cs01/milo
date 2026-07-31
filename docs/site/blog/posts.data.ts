// Build-time index of every blog post. VitePress resolves this at build and hands
// the result to <BlogIndex />.

import { createContentLoader } from 'vitepress'
import { isoDate, displayDate, toDate } from '../.vitepress/postdate'

export interface Post {
  url: string
  title: string
  description: string
  date: string        // YYYY-MM-DD
  dateDisplay: string
  author: string
  tags: string[]
}

declare const data: Post[]
export { data }

export default createContentLoader('blog/posts/*.md', {
  transform(raw): Post[] {
    return raw
      // A post with no valid `date:` is a draft: it stays in the tree and off the
      // index, so half-written work can be committed without shipping.
      .filter(({ frontmatter }) => toDate(frontmatter.date) !== null)
      .map(({ url, frontmatter }) => ({
        url,
        title: frontmatter.title ?? url,
        description: frontmatter.description ?? '',
        date: isoDate(frontmatter.date),
        dateDisplay: displayDate(frontmatter.date),
        author: frontmatter.author ?? 'The Milo team',
        tags: frontmatter.tags ?? [],
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  },
})
