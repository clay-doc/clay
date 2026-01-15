<script setup lang="ts">
const props = defineProps(["message", "code"])
</script>

<template>
  <div class="hero h-[80vh]">
    <div class="hero-content text-center">
      <div class="max-w-md">
        <h1 class="text-5xl font-bold">
          <i class="fa-solid fa-bolt-lightning"/>
          {{props.code}}</h1>
        <p class="py-6">
          <span>There was a problem while fetching your resource:</span>
          <br>
          <span class="font-bold">{{props.message}}</span>
        </p>
        <NuxtLink to="/" class="btn btn-primary no-underline!">
          <i class="fa-solid fa-arrow-left mr-2"/>
          Go back
        </NuxtLink>
      </div>
    </div>
  </div>
</template>