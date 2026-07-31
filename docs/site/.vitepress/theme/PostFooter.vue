<script setup lang="ts">
// Subscribe box at the end of a post. Same trigger as PostHeader: frontmatter with
// a `date` means blog post, so no other page picks this up.
import { useData } from 'vitepress'
import Subscribe from './Subscribe.vue'

const { frontmatter } = useData()
</script>

<template>
  <div v-if="frontmatter.date" class="post-footer">
    <Subscribe blurb="Get new posts by email. No more than once a month, unsubscribe in one click." />
    <p class="post-footer-links">
      <a href="/milo/blog/">← All posts</a>
      <span class="sep">·</span>
      <a href="/milo/feed.rss">RSS</a>
      <span class="sep">·</span>
      <a href="https://github.com/milo-language/milo">GitHub</a>
    </p>
  </div>
</template>

<style scoped>
.post-footer {
  margin-top: 3rem;
}

.post-footer-links {
  font-size: 0.85rem;
  color: var(--vp-c-text-3);
}

.sep {
  margin: 0 0.5rem;
}
</style>
