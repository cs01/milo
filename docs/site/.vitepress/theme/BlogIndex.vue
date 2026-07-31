<script setup lang="ts">
import { data as posts } from '../../blog/posts.data'
</script>

<template>
  <div class="blog-index">
    <article v-for="post in posts" :key="post.url" class="post-card">
      <div class="post-meta">
        <time :datetime="post.date">{{ post.dateDisplay }}</time>
        <span v-if="post.tags.length" class="post-tags">
          <span v-for="tag in post.tags" :key="tag" class="post-tag">{{ tag }}</span>
        </span>
      </div>
      <h2><a :href="post.url">{{ post.title }}</a></h2>
      <p class="post-desc">{{ post.description }}</p>
      <a class="post-more" :href="post.url">Read →</a>
    </article>

    <p v-if="!posts.length" class="post-empty">No posts yet.</p>
  </div>
</template>

<style scoped>
.blog-index {
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  margin-top: 2rem;
}

.post-card {
  border-bottom: 1px solid var(--vp-c-divider);
  padding-bottom: 2.5rem;
}

.post-card:last-child {
  border-bottom: none;
}

.post-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
}

.post-tags {
  display: flex;
  gap: 0.4rem;
}

.post-tag {
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 0 0.4rem;
  color: var(--vp-c-text-2);
}

.post-card h2 {
  margin: 0.4rem 0 0.5rem;
  font-size: 1.5rem;
  line-height: 1.3;
  border-top: none;
  padding-top: 0;
  letter-spacing: -0.01em;
}

.post-card h2 a {
  color: var(--vp-c-text-1);
  text-decoration: none;
  font-weight: 600;
}

.post-card h2 a:hover {
  color: var(--vp-c-brand-1);
}

.post-desc {
  margin: 0 0 0.75rem;
  color: var(--vp-c-text-2);
  line-height: 1.7;
}

.post-more {
  font-size: 0.875rem;
  font-weight: 500;
}

.post-empty {
  color: var(--vp-c-text-3);
}
</style>
