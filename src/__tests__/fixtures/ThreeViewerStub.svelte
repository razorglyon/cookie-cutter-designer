<script lang="ts">
  import type { Group, Mesh } from 'three';

  export let mesh: Mesh | Group | null = null;
  export let buildPlateSize = 200;
</script>

<div data-testid="viewer-stub" data-build-plate-size={buildPlateSize}>
  {mesh?.uuid ?? 'empty'}
</div>
