<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { registerSW } from 'virtual:pwa-register';

  onMount(() => {
    registerSW({
      immediate: true,
      onOfflineReady() {
        console.log('PWA ready for offline use');
      }
    });
  });

  export let data;
  $: title = data?.title ?? 'Magic Draft';

  $: if (typeof document !== 'undefined') {
    document.title = title;
  }
</script>

<slot />
