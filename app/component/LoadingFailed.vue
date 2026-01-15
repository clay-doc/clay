<script setup lang="ts">
const props = defineProps(["message"]);
</script>

<template>
  <div class="hero bg-base-200 min-h-screen">
    <div class="hero-content text-center">
      <div class="max-w-md">
        <h1 class="text-5xl font-bold text-primary">
          <svg xmlns="http://www.w3.org/2000/svg" class="inline-block w-10 h-10 mr-2 stroke-current" fill="none" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          Fatal Error
        </h1>
        <p class="py-6">
          {{props.message}}
        </p>
        <a class="btn btn-primary" href="/">Reload</a>
      </div>
    </div>
  </div>
</template>