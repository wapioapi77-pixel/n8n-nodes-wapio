import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_TOLERANCE_SECONDS = 300;

export function verifyWapioWebhookSignature(
  secret: string,
  signatureHeader: string | undefined,
  rawBody: Buffer,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const timestamp = Number(signatureHeader?.match(/(?:^|,)t=(\d+)(?:,|$)/)?.[1]);
  const signature = signatureHeader?.match(/(?:^|,)v1=([a-f0-9]+)(?:,|$)/)?.[1];
  if (!signature || !Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBody]);
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');
  const supplied = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return supplied.length === expectedBuffer.length && timingSafeEqual(supplied, expectedBuffer);
}
