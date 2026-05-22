<script lang="ts">
  import '../app.css';

  let { children } = $props();
</script>

<svelte:head>
  <title>Content to Project Compiler</title>
  <meta
    name="description"
    content="Turn daily.dev activity into tailored software project ideas, roadmaps, and architecture guidance."
  />
</svelte:head>

{@render children()}
