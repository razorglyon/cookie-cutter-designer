<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CookieCutterParams } from '../../lib/types/CookieCutter';
  import type { Group } from 'three';
  import { createBatchFixture } from './batchFixtureState';

  export let currentSvg: string | null = null;
  export let currentParams: Readonly<CookieCutterParams>;
  export let buildPlateSize: number;

  const dispatch = createEventDispatcher<{ batchCreated: Group }>();

  function publishBatch(): void {
    dispatch('batchCreated', createBatchFixture());
  }
</script>

<button type="button" data-testid="publish-batch" on:click={publishBatch}>
  Publier le batch test
</button>

<span data-testid="batch-inputs">
  {currentSvg?.length ?? 0}:{currentParams.mode}:{buildPlateSize}
</span>
