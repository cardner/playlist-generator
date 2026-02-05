# WASM Metadata Parsing Evaluation

**Status:** Deferred  
**Date:** 2025-02-04

## Context

As part of the scan processing performance improvements, we evaluated whether WASM-based metadata parsing could provide additional speed gains over the current `music-metadata` library.

## Baseline (Post Phase A–C)

- **Parser:** `music-metadata` v11.10.3
- **Execution:** Web Worker pool (sized by `navigator.hardwareConcurrency`)
- **Concurrency:** Adaptive (1–8 workers based on hardware)
- **Bundling:** esbuild bundles worker with music-metadata for offline PWA support

## WASM Alternative: taglib-wasm

- **Library:** [taglib-wasm](https://github.com/CharlesWiltgen/taglib-wasm)
- **Pros:** WASM-based, potentially faster for raw parsing; supports browsers, Node, Deno
- **Cons:** Different API; format support may differ; requires evaluation of duration/codec extraction

## Decision: Defer

We defer adopting taglib-wasm because:

1. **Worker parallelization (Phase A)** already provides substantial improvement by moving CPU work off the main thread.
2. **Adaptive concurrency (Phase C)** uses hardware cores effectively.
3. **music-metadata** has mature format support and is already integrated.
4. A full benchmark and migration would require non-trivial effort with uncertain payoff.

## Future Evaluation Criteria

If we revisit WASM metadata parsing:

1. Benchmark `music-metadata` parse time per file (e.g. 1000-file sample) to establish baseline.
2. Benchmark taglib-wasm for the same files; compare parse time and memory.
3. Verify taglib-wasm supports: MP3, FLAC, M4A, Ogg, WAV; duration; codec/container.
4. Assess bundle size impact.
5. Test in PWA/offline context.

## References

- [music-metadata](https://borewit.github.io/music-metadata/)
- [taglib-wasm](https://github.com/CharlesWiltgen/taglib-wasm)
