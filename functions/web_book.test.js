'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCanonicalRedirect } = require('./web_book');

test('redirects legacy public paths to the same path on bookchelin.com', () => {
  assert.equal(
    buildCanonicalRedirect('/book/abc123', '?utm_source=share'),
    'https://bookchelin.com/book/abc123?utm_source=share'
  );
});

test('normalizes an empty legacy path to the canonical homepage', () => {
  assert.equal(buildCanonicalRedirect('', ''), 'https://bookchelin.com/');
});
