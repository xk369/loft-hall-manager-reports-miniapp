import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { MultipartError, parseMultipartRequest } from './multipart.js';
import {
  TelegramAuthError,
  sendPhotosBeforeReport,
  sendTelegramMessage,
  validateTelegramInitData
} from './telegram.js';
import { buildReportText, normalizeReportText, parseReportPayload, validatePhotos } from './report.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

const config = {
  port: Number(process.env.PORT || 3000),
  botToken: String(process.env.BOT_TOKEN || '').trim(),
  eventReportsChatId: String(process.env.EVENT_REPORTS_CHAT_ID || '').trim(),
  initDataTtlSeconds: Number(process.env.INIT_DATA_TTL_SECONDS || 86_400),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 220) * 1024 * 1024
};

function assertConfig() {
  const missing = [];
  if (!config.botToken) missing.push('BOT_TOKEN');
  if (!config.eventReportsChatId) missing.push('EVENT_REPORTS_CHAT_ID');
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  if (!Number.isInteger(config.port) || config.port <= 0) throw new Error('PORT must be a positive integer.');
  if (!Number.isInteger(config.initDataTtlSeconds) || config.initDataTtlSeconds <= 0) {
    throw new Error('INIT_DATA_TTL_SECONDS must be a positive integer.');
  }
}

function validateRequestInitData(initData) {
  return validateTelegramInitData({
    initData,
    botToken: config.botToken,
    maxAgeSeconds: config.initDataTtlSeconds
  });
}

function serializeTelegramUser(user) {
  return {
    id: user.id,
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    username: user.username || '',
    languageCode: user.language_code || '',
    isPremium: Boolean(user.is_premium),
    allowsWriteToPm: Boolean(user.allows_write_to_pm)
  };
}

assertConfig();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://telegram.org'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    }
  })
);
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'loft-hall-manager-reports' });
});

app.post('/api/auth/telegram', (request, response) => {
  try {
    const telegram = validateRequestInitData(request.body?.initData);
    response.json({ ok: true, user: serializeTelegramUser(telegram.user) });
  } catch (error) {
    if (error instanceof TelegramAuthError) {
      response.status(401).json({ ok: false, error: error.message, code: error.code });
      return;
    }
    console.error('Telegram auth error:', error);
    response.status(500).json({ ok: false, error: 'Ошибка проверки запуска приложения.' });
  }
});

app.post('/api/reports', async (request, response) => {
  try {
    const { fields, files } = await parseMultipartRequest(request, { maxBytes: config.maxUploadBytes });
    const telegram = validateRequestInitData(fields.initData);
    const payload = parseReportPayload(fields.reportPayload);
    const photos = validatePhotos(files, payload);
    const reportText = normalizeReportText(buildReportText(payload, photos.length));
    const message = await sendTelegramMessage({
      botToken: config.botToken,
      chatId: config.eventReportsChatId,
      text: reportText
    });

    let photoDelivery = { sentCount: 0, failedBatches: [] };
    if (photos.length > 0) {
      photoDelivery = await sendPhotosBeforeReport({
        botToken: config.botToken,
        chatId: config.eventReportsChatId,
        photos,
        continueOnError: true
      });
    }

    console.info(
      JSON.stringify({
        event: 'manager_report_sent',
        reportType: payload.type,
        telegramUserId: telegram.user.id,
        telegramMessageId: message.message_id,
        photos: photos.length,
        sentPhotos: photoDelivery.sentCount,
        failedPhotoBatches: photoDelivery.failedBatches.length,
        timestamp: new Date().toISOString()
      })
    );

    response.json({
      ok: true,
      messageId: message.message_id,
      photoCount: photoDelivery.sentCount,
      requestedPhotoCount: photos.length,
      photoWarnings: photoDelivery.failedBatches
    });
  } catch (error) {
    if (error instanceof TelegramAuthError) {
      response.status(401).json({ ok: false, error: error.message, code: error.code });
      return;
    }
    if (error instanceof MultipartError) {
      response.status(error.status).json({ ok: false, error: error.message });
      return;
    }

    const clientErrors = [
      'Не удалось прочитать данные отчёта.',
      'Добавьте хотя бы одно фото с мероприятия.',
      'Можно загрузить не больше 30 фото.',
      'Фото должны быть в формате jpg, jpeg, png, webp, heic или heif.',
      'Одно из фото пустое. Удалите его и загрузите заново.',
      'Одно из фото больше 20 МБ. Сожмите его или выберите другое.',
      'Выберите тип отчёта.',
      'Укажите дату отчёта.',
      'Укажите зал.',
      'Укажите тип мероприятия.',
      'Укажите название мероприятия.',
      'Укажите количество гостей.',
      'Выберите формат мероприятия.',
      'Укажите менеджера ОП.',
      'Укажите менеджера ОР.',
      'Укажите организатора / заказчика.',
      'Заполните комментарий по мероприятию.',
      'Укажите ОП.',
      'Укажите ОР.',
      'Укажите дату мероприятия.',
      'Укажите зал мероприятия.',
      'Текст отчёта пуст.',
      'Отчёт превышает допустимый размер Telegram.'
    ];

    if (clientErrors.includes(error?.message) || /^Выберите статус службы /.test(error?.message || '') || /^Добавьте комментарий к службе /.test(error?.message || '')) {
      response.status(400).json({ ok: false, error: error.message });
      return;
    }

    console.error('Report delivery error:', error);
    response.status(502).json({
      ok: false,
      error: 'Не удалось отправить фото и отчёт в Telegram. Повторите попытку.'
    });
  }
});

app.use(
  express.static(publicDir, {
    index: 'index.html',
    setHeaders(response, filePath) {
      if (filePath.endsWith('index.html')) response.setHeader('Cache-Control', 'no-store');
    }
  })
);

app.get(/.*/, (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.sendFile(path.join(publicDir, 'index.html'));
});

app.use((error, _request, response, _next) => {
  console.error('Unhandled server error:', error);
  response.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера.' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`LOFT HALL manager reports Mini App is listening on port ${config.port}`);
});
