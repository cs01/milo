<script setup lang="ts">
// Byline for a blog post. Rendered by the theme's doc-before slot on any page whose
// frontmatter carries a `date`, so posts don't repeat the same block by hand.
import { computed } from 'vue'
import { useData } from 'vitepress'
import { displayDate, isoDate } from '../postdate'

const { frontmatter } = useData()

const dateDisplay = computed(() => displayDate(frontmatter.value.date))
const dateIso = computed(() => isoDate(frontmatter.value.date))
</script>

<template>
  <div v-if="frontmatter.date" class="post-header">
    <a class="post-back" href="/milo/blog/">← All posts</a>
    <!-- The title lives here rather than as an `#` heading in each post, so a post
         file is nothing but prose and the byline can sit under the title. -->
    <h1 class="post-title">{{ frontmatter.title }}</h1>
    <div class="post-byline">
      <time :datetime="dateIso">{{ dateDisplay }}</time>
      <span class="sep">·</span>
      <span>{{ frontmatter.author || 'The Milo team' }}</span>
    </div>
  </div>
</template>

<style scoped>
.post-header {
  margin-bottom: 1.5rem;
}

.post-back {
  font-size: 0.8rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-3);
  text-decoration: none;
}

.post-back:hover {
  color: var(--vp-c-brand-1);
}

.post-title {
  margin: 0.9rem 0 0;
  font-size: 2.1rem;
  line-height: 1.25;
  letter-spacing: -0.02em;
  font-weight: 600;
}

.post-byline {
  margin-top: 0.6rem;
  font-size: 0.8rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-3);
}

.sep {
  margin: 0 0.4rem;
}
</style>
