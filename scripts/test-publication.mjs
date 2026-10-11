import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicationStatus, isIndexable, isListed, isRoutable } from '../src/lib/publication.ts';

test('Publication policy keeps preview routes separate from discovery', () => {
  for (const status of [undefined, 'published', 'sample', 'draft']) {
    for (const draft of [undefined, false, true]) {
      const data = { status, draft };
      const resolved = draft ? 'draft' : (status ?? 'published');
      assert.equal(publicationStatus(data), resolved);
      assert.equal(isIndexable(data), resolved === 'published');
      assert.equal(isRoutable(data), resolved !== 'draft');
      assert.equal(isListed(data), resolved === 'published');
      assert.equal(isRoutable(data, true), true);
      assert.equal(isListed(data, true), resolved !== 'sample');
    }
  }
});
