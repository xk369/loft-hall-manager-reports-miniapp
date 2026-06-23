import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { TelegramAuthError, validateTelegramInitData } from '../src/telegram.js';

const BOT_TOKEN = '123456789:TEST_TOKEN_FOR_UNIT_TESTS_ONLY';

function createInitData({ authDate = 1_800_000_000, userId = 12345 } = {}) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'AAEAAAE',
    user: JSON.stringify({ id: userId, first_name: 'Test', username: 'tester' })
  });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

test('accepts valid Telegram initData', () => {
  const result = validateTelegramInitData({
    initData: createInitData(),
    botToken: BOT_TOKEN,
    nowSeconds: 1_800_000_100,
    maxAgeSeconds: 3600
  });
  assert.equal(result.user.id, 12345);
  assert.equal(result.user.username, 'tester');
});

test('rejects missing Telegram initData', () => {
  assert.throws(
    () =>
      validateTelegramInitData({
        initData: '',
        botToken: BOT_TOKEN,
        nowSeconds: 1_800_000_100,
        maxAgeSeconds: 3600
      }),
    error => error instanceof TelegramAuthError && error.code === 'INIT_DATA_MISSING'
  );
});

test('rejects tampered Telegram initData', () => {
  assert.throws(
    () =>
      validateTelegramInitData({
        initData: createInitData().replace('tester', 'attacker'),
        botToken: BOT_TOKEN,
        nowSeconds: 1_800_000_100,
        maxAgeSeconds: 3600
      }),
    TelegramAuthError
  );
});
