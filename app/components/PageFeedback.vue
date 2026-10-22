<script lang="ts">
// The pages answered, for all pages shown until the site is loaded again
const ANSWERED = new Set<string>();
</script>

<script setup lang="ts">
import {track} from "~/utils/analytics";

// "Was this page helpful?" under a page: the answer is an event for the site's
// analytics (utils/analytics.ts), so it is asked only where they count events
// ("analytics" in clay.yaml, unless "feedback" is false) and the reader's browser
// allows them. A page is answered once while the site is open; nothing is stored
// on the reader's device, so the analytics stay free of consent (see their docs).
const props = defineProps<{ url: string }>();
const t = useMessages();

const counted = ref(false);
const answered = ref(false);

function check() {
  const services = window as unknown as { clayAnalyticsEvents?: boolean, clayFeedback?: boolean };
  counted.value = Boolean(services.clayAnalyticsEvents && services.clayFeedback);
  answered.value = ANSWERED.has(props.url);
}

function answer(helpful: boolean) {
  track("Page feedback", {page: props.url, helpful: helpful ? "yes" : "no"});
  ANSWERED.add(props.url);
  answered.value = true;
}

onMounted(check);
watch(() => props.url, check);
</script>

<template>
  <!-- Screen readers say the thanks that take the buttons' place -->
  <div v-if="counted" class="clay-feedback" role="group" :aria-label="t.feedbackQuestion" aria-live="polite">
    <p v-if="answered">{{t.feedbackThanks}}</p>
    <template v-else>
      <span>{{t.feedbackQuestion}}</span>
      <button type="button" class="btn btn-sm btn-ghost" @click="answer(true)">
        <i class="fa-regular fa-thumbs-up" aria-hidden="true"></i>{{t.feedbackYes}}
      </button>
      <button type="button" class="btn btn-sm btn-ghost" @click="answer(false)">
        <i class="fa-regular fa-thumbs-down" aria-hidden="true"></i>{{t.feedbackNo}}
      </button>
    </template>
  </div>
</template>
