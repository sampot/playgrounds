/**
 * Consume `#pg_provision=` as early as possible (before layout onMount / HMR
 * races that can strip the hash or hit `/v1/field/me` with a rotated key).
 */
import { goAuth } from "$lib/goAuth.svelte";

void goAuth.initFromLocation();
