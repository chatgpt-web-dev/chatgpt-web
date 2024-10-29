<script setup lang="ts">
const gitCommitSha = (import.meta.env.VITE_GIT_COMMIT_HASH || '0').slice(0, 7)
const releaseVersion = import.meta.env.VITE_RELEASE_VERSION || 'v0.0.0'
</script>

<template>
  <div class="text-center text-xs">
    <img src="https://img.zje.cc/i/2024/05/05/1dvsz-0.webp" alt="造价e星球" style="width: 20px; height: 20px; display: inline-block;"> <a href="https://www.zje.cc" class="text-blue-500" target="_blank" style="display: inline-block;">造价e星球</a>
    <span v-text="`${releaseVersion}-${gitCommitSha}`" />
  </div>
</template>

