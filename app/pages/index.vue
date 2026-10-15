<script setup lang="ts">
import Landing from "~/components/Landing.vue";

const enter = usePageEnter();
</script>

<template>
  <div :class="{'page-enter': enter}">
    <Landing route="/"/>
  </div>
</template>
