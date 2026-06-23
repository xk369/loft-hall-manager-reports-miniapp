import crypto from 'node:crypto';

export class TelegramAuthError extends Error {
  constructor(message, code = 'INVALID_TELEGRAM_DATA') {
    super(message);
    this.name = 'TelegramAuthError';
    this.code = code;
  }
}

export function validateTelegramInitData({
  initData,
  botToken,
  maxAgeSeconds = 86_400,
  nowSeconds = Math.floor(Date.now() / 1000)
}) {
  if (typeof initData !== 'string' || initData.length === 0) {
    throw new TelegramAuthError('Приложение должно быть открыто через Telegram.', 'INIT_DATA_MISSING');
  }
  if (typeof botToken !== 'string' || botToken.length < 20) {
    throw new Error('BOT_TOKEN is not configured correctly.');
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new TelegramAuthError('Некорректная подпись Telegram.', 'HASH_MISSING');
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const receivedBuffer = Buffer.from(receivedHash, 'hex');
  const calculatedBuffer = Buffer.from(calculatedHash, 'hex');

  if (
    receivedBuffer.length !== calculatedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, calculatedBuffer)
  ) {
    throw new TelegramAuthError('Не удалось подтвердить запуск через Telegram.', 'HASH_MISMATCH');
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) {
    throw new TelegramAuthError('В данных Telegram отсутствует время запуска.', 'AUTH_DATE_MISSING');
  }
  if (authDate > nowSeconds + 300) {
    throw new TelegramAuthError('Некорректное время запуска Telegram.', 'AUTH_DATE_IN_FUTURE');
  }
  if (maxAgeSeconds > 0 && nowSeconds - authDate > maxAgeSeconds) {
    throw new TelegramAuthError(
      'Сессия Telegram устарела. Закройте приложение и откройте его заново из бота.',
      'INIT_DATA_EXPIRED'
    );
  }

  let user = null;
  const rawUser = params.get('user');
  if (rawUser) {
    try {
      user = JSON.parse(rawUser);
    } catch {
      throw new TelegramAuthError('Не удалось прочитать данные пользователя Telegram.', 'USER_INVALID');
    }
  }
  if (!user || !Number.isSafeInteger(Number(user.id))) {
    throw new TelegramAuthError('Telegram не передал данные пользователя.', 'USER_MISSING');
  }

  return {
    user: { ...user, id: Number(user.id) },
    authDate,
    queryId: params.get('query_id') || null
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callTelegram({ botToken, method, body, retries = 2 }) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    body
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Keep the Telegram status as the useful diagnostic.
  }

  if ((!response.ok || !payload?.ok) && retries > 0) {
    const retryAfterSeconds = Number(payload?.parameters?.retry_after || 0);
    if (response.status === 429 || retryAfterSeconds > 0) {
      await sleep(Math.max(900, retryAfterSeconds * 1000));
      return callTelegram({ botToken, method, body, retries: retries - 1 });
    }
  }

  if (!response.ok || !payload?.ok) {
    const description = payload?.description || `Telegram API returned HTTP ${response.status}`;
    throw new Error(description);
  }

  return payload.result;
}

export async function sendTelegramMessage({ botToken, chatId, text }) {
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('text', text);
  return callTelegram({ botToken, method: 'sendMessage', body: form });
}

export async function sendTelegramPhoto({ botToken, chatId, photo }) {
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('photo', new Blob([photo.buffer], { type: photo.mimeType }), photo.filename);
  return callTelegram({ botToken, method: 'sendPhoto', body: form });
}

export async function sendTelegramMediaGroup({ botToken, chatId, photos }) {
  const form = new FormData();
  const media = photos.map((photo, index) => {
    const fieldName = `photo${index}`;
    form.set(fieldName, new Blob([photo.buffer], { type: photo.mimeType }), photo.filename);
    return { type: 'photo', media: `attach://${fieldName}` };
  });

  form.set('chat_id', chatId);
  form.set('media', JSON.stringify(media));
  return callTelegram({ botToken, method: 'sendMediaGroup', body: form });
}

export async function sendPhotosBeforeReport({
  botToken,
  chatId,
  photos,
  continueOnError = false,
  batchDelayMs = 700
}) {
  if (!Array.isArray(photos) || photos.length === 0) {
    throw new Error('Добавьте хотя бы одно фото.');
  }

  const result = {
    attemptedCount: photos.length,
    sentCount: 0,
    failedBatches: []
  };

  if (photos.length === 1) {
    try {
      await sendTelegramPhoto({ botToken, chatId, photo: photos[0] });
      result.sentCount = 1;
      return result;
    } catch (error) {
      if (!continueOnError) throw error;
      result.failedBatches.push({ from: 0, to: 0, error: error.message });
      return result;
    }
  }

  for (let index = 0; index < photos.length; index += 10) {
    const batch = photos.slice(index, index + 10);
    try {
      await sendTelegramMediaGroup({
        botToken,
        chatId,
        photos: batch
      });
      result.sentCount += batch.length;
    } catch (error) {
      if (!continueOnError) throw error;
      result.failedBatches.push({
        from: index,
        to: index + batch.length - 1,
        error: error.message
      });
    }

    if (index + 10 < photos.length && batchDelayMs > 0) {
      await sleep(batchDelayMs);
    }
  }

  return result;
}
