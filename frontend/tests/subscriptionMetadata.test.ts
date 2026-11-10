import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readSubscriptionMetadata } from '../src/utils/subscriptionMetadata.ts'

test('preserves provided subscription metadata regardless of header capitalization', () => {
  assert.deepEqual(readSubscriptionMetadata({
    'Profile-Title': 'base64:RXhhbXBsZQ==',
    'profile-update-interval': '24',
    'Support-URL': 'https://example.invalid/',
    Announce: 'base64:bm90aWNl',
  }), {
    profileTitle: 'base64:RXhhbXBsZQ==',
    profileUpdateInterval: '24',
    supportUrl: 'https://example.invalid/',
    announce: 'base64:bm90aWNl',
  })
  assert.deepEqual(readSubscriptionMetadata({}), {})
})
