import {
  ALL_DEPARTMENTS,
  OPTIONAL_DEPARTMENTS,
  REQUIRED_DEPARTMENTS,
  buildAboutText,
  cleanText,
  formatEventReport,
  formatTastingReport
} from '../public/report-format.js';

const ALLOWED_STATUSES = new Set(['ok', 'warning', 'critical', 'na']);
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

export function parseReportPayload(value) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    throw new Error('Не удалось прочитать данные отчёта.');
  }
}

function assertRequired(value, message) {
  if (!cleanText(value)) throw new Error(message);
}

function assertValidDate(value) {
  const text = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Укажите дату отчёта.');
}

function assertPhotoFiles(photos) {
  if (!Array.isArray(photos) || photos.length < 1) {
    throw new Error('Добавьте хотя бы одно фото с мероприятия.');
  }
  if (photos.length > 30) {
    throw new Error('Можно загрузить не больше 30 фото.');
  }

  for (const photo of photos) {
    if (photo.fieldName !== 'photos') continue;
    if (!ALLOWED_IMAGE_TYPES.has(String(photo.mimeType).toLowerCase()) && !ALLOWED_EXTENSIONS.test(photo.filename)) {
      throw new Error('Фото должны быть в формате jpg, jpeg, png, webp, heic или heif.');
    }
    if (photo.size <= 0) {
      throw new Error('Одно из фото пустое. Удалите его и загрузите заново.');
    }
    if (photo.size > 20 * 1024 * 1024) {
      throw new Error('Одно из фото больше 20 МБ. Сожмите его или выберите другое.');
    }
  }
}

export function validatePhotos(files, payload = {}) {
  const photos = (files || []).filter(file => file.fieldName === 'photos');
  if (payload.photosLater === true && photos.length === 0) return photos;
  assertPhotoFiles(photos);
  return photos;
}

export function validateEventPayload(payload) {
  const event = payload?.event || {};
  assertValidDate(event.date);
  if (!cleanText(event.hall) && (!Array.isArray(event.halls) || event.halls.map(cleanText).filter(Boolean).length === 0)) {
    throw new Error('Укажите зал.');
  }
  assertRequired(event.eventType, 'Укажите тип мероприятия.');
  assertRequired(event.eventName, 'Укажите название мероприятия.');
  assertRequired(event.guestCount, 'Укажите количество гостей.');
  if (!Array.isArray(event.formats) || event.formats.map(cleanText).filter(Boolean).length === 0) {
    throw new Error('Выберите формат мероприятия.');
  }
  assertRequired(event.opManager, 'Укажите менеджера ОП.');
  assertRequired(event.orManager, 'Укажите менеджера ОР.');
  assertRequired(event.contactType, 'Укажите организатора / заказчика.');

  const departments = payload?.departments || {};
  for (const department of REQUIRED_DEPARTMENTS) {
    const entry = departments[department] || {};
    if (!ALLOWED_STATUSES.has(entry.status) || entry.status === 'na') {
      throw new Error(`Выберите статус службы ${department}.`);
    }
    if ((entry.status === 'warning' || entry.status === 'critical') && !cleanText(entry.comment)) {
      throw new Error(`Добавьте комментарий к службе ${department}.`);
    }
  }

  for (const department of OPTIONAL_DEPARTMENTS) {
    const entry = departments[department] || {};
    if (!ALLOWED_STATUSES.has(entry.status)) {
      throw new Error(`Выберите статус службы ${department}.`);
    }
    if ((entry.status === 'warning' || entry.status === 'critical') && !cleanText(entry.comment)) {
      throw new Error(`Добавьте комментарий к службе ${department}.`);
    }
  }

  for (const department of Object.keys(departments)) {
    if (!ALL_DEPARTMENTS.includes(department)) delete departments[department];
  }

  if (!buildAboutText(payload.about)) {
    throw new Error('Заполните комментарий по мероприятию.');
  }
}

export function validateTastingPayload(payload) {
  const tasting = payload?.tasting || {};
  assertValidDate(tasting.date);
  assertRequired(tasting.opManager, 'Укажите ОП.');
  assertRequired(tasting.orManager, 'Укажите ОР.');
  assertRequired(tasting.eventName, 'Укажите название мероприятия.');
  assertRequired(tasting.hall, 'Укажите зал.');
}

export function buildReportText(payload, photoCount) {
  const type = cleanText(payload?.type);
  if (type === 'event') {
    validateEventPayload(payload);
    return formatEventReport(payload, photoCount);
  }
  if (type === 'tasting') {
    validateTastingPayload(payload);
    return formatTastingReport(payload, photoCount);
  }
  throw new Error('Выберите тип отчёта.');
}

export function normalizeReportText(text) {
  const value = String(text || '').trim();
  if (!value) throw new Error('Текст отчёта пуст.');
  if (value.length > 3900) throw new Error('Отчёт превышает допустимый размер Telegram.');
  return value;
}
