#!/usr/bin/env node
// Tests for the @durable/runtime integration in lib/durable.ts. No added test
// framework: node:test + a local mock npm registry, run with
// `node scripts/test-durable.mjs` (pnpm test:durable). Requires Node >= 22.6
// for TS type-stripping of the module under test.
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { clearAll, registerSha256, sha256 } from '@durable/runtime';
import {
  createDurableScanInstance,
  durableFetchJson,
} from '../lib/durable.ts';

// --- Mock npm registry -------------------------------------------------------
// Behaves like registry.npmjs.org: the /-/v1/search endpoint plus per-package
// metadata. Each endpoint can be told to fail the first N calls to simulate
// transient network errors.

const SEARCH_RESULT = {
  objects: [
    {
      package: {
        name: 'lodash',
        version: '4.17.21',
        links: { npm: 'https://www.npmjs.com/package/lodash' },
        publisher: { username: 'jdalton', email: 'j@d.com' },
        maintainers: [{ username: 'jdalton', email: 'j@d.com' }],
        keywords: ['utility', 'functional'],
        license: 'MIT',
        date: '2021-02-20T02:05:01.223Z',
      },
      score: { final: 0.99, detail: { popularity: 1, quality: 1, maintenance: 0.97 } },
      searchScore: 0.9,
      downloads: { weekly: 100, monthly: 400 },
      dependents: 15000,
      updated: '2023-01-01',
      flags: { insecure: 0 },
    },
  ],
  total: 1,
  time: '2023-01-01T00:00:00.000Z',
};

const PACKAGE_TIME = {
  created: '2012-04-23T00:00:00.000Z',
  modified: '2023-01-01T00:00:00.000Z',
  '0.1.0': '2012-04-23T00:00:00.000Z',
  '4.17.21': '2021-02-20T02:05:01.223Z',
};

let server;
let hits;

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

before(async () => {
  hits = { search: 0, metadata: 0 };
  server = createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/-/v1/search') {
      hits.search += 1;
      if (hits.search <= hits.searchFailures) {
        json(res, 503, { error: 'temporarily unavailable' });
        return;
      }
      json(res, 200, SEARCH_RESULT);
      return;
    }
    if (pathname.startsWith('/metadata/')) {
      hits.metadata += 1;
      if (hits.metadata <= hits.metadataFailures) {
        json(res, 500, { error: 'boom' });
        return;
      }
      json(res, 200, { name: pathname.split('/').pop(), time: PACKAGE_TIME });
      return;
    }
    json(res, 404, { error: 'not found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
});

after(() => server.close());

beforeEach(() => {
  clearAll();
  hits.search = 0;
  hits.metadata = 0;
  hits.searchFailures = 0;
  hits.metadataFailures = 0;
});

const searchUrl = () =>
  `http://127.0.0.1:${server.address().port}/-/v1/search?text=author:user`;
const metadataUrl = (id) =>
  `http://127.0.0.1:${server.address().port}/metadata/${id}`;

describe('durableFetchJson (WebCrypto path)', () => {
  it('retries transient 5xx responses with exponential backoff, then succeeds', async () => {
    hits.searchFailures = 2;
    const result = await durableFetchJson(
      searchUrl(),
      'scan.search',
      ['author', 'user'],
      createDurableScanInstance(),
      'npm search for "user"',
    );
    assert.deepEqual(result.objects, SEARCH_RESULT.objects);
    assert.equal(hits.search, 3);
  });

  it('propagates the failure after the retry budget is exhausted', async () => {
    hits.searchFailures = 99;
    await assert.rejects(
      durableFetchJson(
        searchUrl(),
        'scan.search',
        ['author', 'user'],
        createDurableScanInstance(),
        'npm search for "user"',
      ),
      /npm search for "user" failed with status 503/,
    );
    assert.equal(hits.search, 4); // 1 + NETWORK_RETRY.retries
  });

  it('replays a cached step without hitting the network', async () => {
    const instance = createDurableScanInstance();
    await durableFetchJson(searchUrl(), 'scan.search', ['author', 'user'], instance, 'search');
    const before = hits.search;
    const second = await durableFetchJson(
      searchUrl(),
      'scan.search',
      ['author', 'user'],
      instance,
      'search',
    );
    assert.equal(hits.search, before);
    assert.deepEqual(second, SEARCH_RESULT);
  });

  it('isolates instances: the same query on a fresh instance refetches', async () => {
    const instance = createDurableScanInstance();
    await durableFetchJson(searchUrl(), 'scan.search', ['author', 'user'], instance, 'search');
    const before = hits.search;
    await durableFetchJson(
      searchUrl(),
      'scan.search',
      ['author', 'user'],
      createDurableScanInstance(),
      'search',
    );
    assert.equal(hits.search, before + 1);
  });

  it('distinguishes queries by args, so distinct packages never share a cache key', async () => {
    const instance = createDurableScanInstance();
    const first = await durableFetchJson(
      metadataUrl('lodash'),
      'registry.metadata',
      ['lodash'],
      instance,
      'metadata',
    );
    const second = await durableFetchJson(
      metadataUrl('react'),
      'registry.metadata',
      ['react'],
      instance,
      'metadata',
    );
    assert.notEqual(first.name, second.name);
    assert.equal(hits.metadata, 2);
  });

  it('distinguishes author vs maintainer scans for the same username', async () => {
    const instance = createDurableScanInstance();
    const urlOf = (type) =>
      `http://127.0.0.1:${server.address().port}/-/v1/search?text=${type}:user`;
    await durableFetchJson(urlOf('author'), 'scan.search', ['author', 'user'], instance, 'search');
    await durableFetchJson(urlOf('maintainer'), 'scan.search', ['maintainer', 'user'], instance, 'search');
    assert.equal(hits.search, 2);
  });
});

describe('no-WebCrypto environments (Hermes JS fallback)', () => {
  // Hermes does not expose WebCrypto. Since the runtime fix (registerSha256 +
  // bundled pure-JS sha256), hashing falls back internally so __step retains
  // full retry AND content-addressed caching without any app-side adapter.
  async function withoutCryptoSubtle(run) {
    const real = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => 'no-subtle-uuid' },
      configurable: true,
      writable: true,
    });
    try {
      return await run();
    } finally {
      Object.defineProperty(globalThis, 'crypto', real);
    }
  }

  it('the JS sha256 fallback matches WebCrypto byte-for-byte', async () => {
    const inputs = ['parity-check-123', 'unicode-✓-emoji-🎉', 'a'.repeat(1024)];
    for (const input of inputs) {
      const withCrypto = await sha256(input);
      const withoutCrypto = await withoutCryptoSubtle(() => sha256(input));
      assert.equal(withoutCrypto, withCrypto, `parity for ${input.slice(0, 20)}`);
    }
  });

  it('still retries transient failures and succeeds via __step', async () => {
    hits.searchFailures = 2;
    const result = await withoutCryptoSubtle(() =>
      durableFetchJson(
        searchUrl(),
        'scan.search',
        ['author', 'user'],
        createDurableScanInstance(),
        'npm search for "user"',
      ),
    );
    assert.deepEqual(result, SEARCH_RESULT);
    assert.equal(hits.search, 3);
  });

  it('now caches across calls without WebCrypto (no network replay)', async () => {
    const instance = createDurableScanInstance();
    await withoutCryptoSubtle(() =>
      durableFetchJson(
        searchUrl(),
        'scan.search',
        ['author', 'user'],
        instance,
        'npm search for "user"',
      ),
    );
    const before = hits.search;
    const second = await withoutCryptoSubtle(() =>
      durableFetchJson(
        searchUrl(),
        'scan.search',
        ['author', 'user'],
        instance,
        'npm search for "user"',
      ),
    );
    assert.equal(hits.search, before);
    assert.deepEqual(second, SEARCH_RESULT);
  });

  it('propagates failures after the retry budget is exhausted', async () => {
    hits.metadataFailures = 99;
    await assert.rejects(
      withoutCryptoSubtle(() =>
        durableFetchJson(
          metadataUrl('react'),
          'registry.metadata',
          ['react'],
          createDurableScanInstance(),
          'metadata',
        ),
      ),
      /metadata failed with status 500/,
    );
    assert.equal(hits.metadata, 4);
  });
});

describe('registerSha256 hook', () => {
  it('overrides the hash implementation, and resets via null', async () => {
    const before = await sha256('hello');
    const fixed = 'ab'.repeat(32); // valid lowercase hex

    registerSha256(async () => fixed);
    try {
      assert.equal(await sha256('hello'), fixed);
    } finally {
      registerSha256(null);
    }
    assert.equal(await sha256('hello'), before);
  });

  it('a registered implementation is used by durable steps', async () => {
    const instance = createDurableScanInstance();
    const fixed = 'cd'.repeat(32);
    registerSha256(async () => fixed);
    try {
      await durableFetchJson(
        searchUrl(),
        'scan.search',
        ['author', 'user'],
        instance,
        'npm search for "user"',
      );
      const afterFirst = hits.search;
      // Same args under the same step key hash to the same value, so the second
      // call replays even though the custom hash is just a constant.
      await durableFetchJson(
        searchUrl(),
        'scan.search',
        ['author', 'user'],
        instance,
        'npm search for "user"',
      );
      assert.equal(hits.search, afterFirst);
    } finally {
      registerSha256(null);
    }
  });
});