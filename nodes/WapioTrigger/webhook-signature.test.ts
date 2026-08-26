import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { verifyWapioWebhookSignature } from './webhook-signature';

const secret = 'a-strong-wapio-webhook-secret';
const timestamp = 1_700_000_000;
const body = Buffer.from('{"event":"messages.received","data":{"id":"message-1"}}');

function signatureFor(rawBody = body, signedAt = timestamp): string {
  const payload = Buffer.concat([Buffer.from(`${signedAt}.`, 'utf8'), rawBody]);
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${signedAt},v1=${signature}`;
}

describe('verifyWapioWebhookSignature', () => {
  it('accepts a valid Wapio HMAC signature', () => {
    expect(verifyWapioWebhookSignature(secret, signatureFor(), body, timestamp + 60)).toBe(true);
  });

  it('rejects a signature for a changed payload', () => {
    const changedBody = Buffer.from('{"event":"messages.received","data":{"id":"message-2"}}');
    expect(verifyWapioWebhookSignature(secret, signatureFor(), changedBody, timestamp + 60)).toBe(false);
  });

  it('rejects a stale timestamp', () => {
    expect(verifyWapioWebhookSignature(secret, signatureFor(), body, timestamp + 301)).toBe(false);
  });

  it('rejects a malformed signature header', () => {
    expect(verifyWapioWebhookSignature(secret, 'v1=not-a-wapio-signature', body, timestamp)).toBe(false);
  });
});
