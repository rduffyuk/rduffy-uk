import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = async (path) => readFile(new URL(`../dist/${path}/index.html`, import.meta.url), 'utf8');

test('published research and benchmark pages are discoverable and indexable', async () => {
  const research = await page('research/benchmarking/strata-memory-pools');
  const benchmark = await page('benchmarks/strata');
  const index = await page('research');
  assert.match(index, /research\/benchmarking\/strata-memory-pools/);
  assert.match(research, /memory-explainer\//);
  assert.match(benchmark, /https:\/\/github\.com\/rduffyuk\/strata-context-benchmark/);
  for (const html of [index, research, benchmark]) {
    assert.doesNotMatch(html, /name=["']robots["'][^>]*noindex/i);
    assert.doesNotMatch(html, /Unpublished review candidate|Review draft|Publication is pending review/i);
  }
});
