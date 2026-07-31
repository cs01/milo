<script setup lang="ts">
import { ref } from 'vue'

const API = 'https://chadsmith.dev/milo-list'

const props = defineProps<{
  blurb?: string
}>()

const email = ref('')
const website = ref('')   // honeypot; a real person never sees this field
const state = ref<'idle' | 'sending' | 'done' | 'error'>('idle')
const message = ref('')

// The server issues a short-lived signed token and refuses submissions that arrive
// without one, less than two seconds after one, or with one that's already been
// used. Fetching it on first focus rather than on mount keeps the cost off every
// page load while still making a drive-by POST a two-request job.
let tokenPromise: Promise<string | null> | null = null

function primeToken() {
  if (tokenPromise) return
  tokenPromise = fetch(`${API}/token`, { credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => j?.token ?? null)
    .catch(() => null)
}

async function submit() {
  if (state.value === 'sending') return
  state.value = 'sending'
  message.value = ''

  primeToken()
  const token = await tokenPromise

  try {
    const res = await fetch(`${API}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({ email: email.value, website: website.value, token }),
    })
    const body = await res.json().catch(() => ({}))

    if (res.ok) {
      state.value = 'done'
      message.value = body.message ?? "You're on the list."
      email.value = ''
    } else {
      state.value = 'error'
      message.value = body.error ?? 'Something went wrong. Try again in a minute.'
      // A rejected token is spent either way; get a fresh one for the retry.
      tokenPromise = null
    }
  } catch {
    state.value = 'error'
    message.value = 'Could not reach the server. Try again in a minute.'
    tokenPromise = null
  }
}
</script>

<template>
  <div class="subscribe">
    <div class="subscribe-copy">
      <strong>Get Milo updates</strong>
      <p>{{ props.blurb ?? 'New posts, releases, and things people have built with Milo. No more than once a month. Unsubscribe in one click.' }}</p>
    </div>

    <form v-if="state !== 'done'" class="subscribe-form" @submit.prevent="submit">
      <label class="sr-only" for="subscribe-email">Email address</label>
      <input
        id="subscribe-email"
        v-model="email"
        type="email"
        required
        autocomplete="email"
        placeholder="you@example.com"
        :disabled="state === 'sending'"
        @focus="primeToken"
      />

      <!-- Honeypot. Hidden from people and from screen readers; bots fill it in. -->
      <div class="hp" aria-hidden="true">
        <label for="subscribe-website">Leave this field empty</label>
        <input id="subscribe-website" v-model="website" type="text" tabindex="-1" autocomplete="off" />
      </div>

      <button type="submit" :disabled="state === 'sending'">
        {{ state === 'sending' ? 'Sending…' : 'Subscribe' }}
      </button>
    </form>

    <p v-if="message" class="subscribe-msg" :class="state">{{ message }}</p>

    <p class="subscribe-alt">
      Prefer a feed? <a href="/milo/feed.rss">RSS</a>.
    </p>
  </div>
</template>

<style scoped>
.subscribe {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 1.5rem;
  margin: 2.5rem 0;
  background: var(--vp-c-bg-soft);
}

.subscribe-copy strong {
  display: block;
  font-size: 1.05rem;
}

.subscribe-copy p {
  margin: 0.4rem 0 1rem;
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
  line-height: 1.6;
}

.subscribe-form {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.subscribe-form input[type='email'] {
  flex: 1 1 16rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 0.9rem;
}

.subscribe-form input[type='email']:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}

.subscribe-form button {
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-bg);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}

.subscribe-form button:disabled {
  opacity: 0.6;
  cursor: default;
}

.subscribe-msg {
  margin: 0.9rem 0 0;
  font-size: 0.875rem;
}

.subscribe-msg.done {
  color: var(--vp-c-green-1);
}

.subscribe-msg.error {
  color: var(--vp-c-red-1);
}

.subscribe-alt {
  margin: 0.9rem 0 0;
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
}

/* Off-screen rather than display:none — a hidden input is a well-known bot tell,
   and display:none also drops it from some autofill heuristics. */
.hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
