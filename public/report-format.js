export const REQUIRED_DEPARTMENTS = [
  'SALES',
  'SUPPORT',
  'CLEANING',
  'DEVELOPMENT',
  'SECURITY',
  'MAG',
  'KITCHEN',
  'SERVICE'
];

export const OPTIONAL_DEPARTMENTS = ['BAR', 'HOOKAH'];
export const ALL_DEPARTMENTS = [...REQUIRED_DEPARTMENTS, ...OPTIONAL_DEPARTMENTS];

export const STATUS_LABELS = {
  ok: 'Проверено, замечаний нет.',
  warning: 'Есть замечания.',
  critical: 'Серьёзные замечания.',
  na: 'Не заказывали.'
};

export function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function cleanMultilineText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => cleanText(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatDate(dateValue) {
  const value = cleanText(dateValue);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function formatContact(type, comment) {
  const typeText = cleanText(type);
  const commentText = cleanText(comment);
  if (typeText && commentText) return `${typeText} — ${commentText}`;
  return typeText || commentText;
}

export function joinList(values) {
  return (Array.isArray(values) ? values : [])
    .map(cleanText)
    .filter(Boolean)
    .join(', ');
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function hashtagToken(value) {
  const token = cleanText(value)
    .replace(/#/g, '')
    .replace(/№/g, '')
    .replace(/[^\p{L}\p{N}_]+/gu, '');
  return token ? `#${token}` : '';
}

function managerHashtags(value) {
  return cleanText(value)
    .split(/\s*(?:\/|,|;|\+|&|\s+и\s+)\s*/iu)
    .map(part => cleanText(part).split(/\s+/)[0])
    .map(hashtagToken)
    .filter(Boolean);
}

function loftHashtag(value) {
  const text = cleanText(value).replace(/\s*полностью$/i, '');
  const loftMatch = text.match(/^LOFT#?(\d+(?:[-–]\d+)?)$/i);
  if (loftMatch) return `#LOFT${loftMatch[1].replace(/[-–]/g, '_')}`;
  const token = text
    .replace(/#/g, '')
    .replace(/№/g, '')
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return hashtagToken(token);
}

export function buildReportHashtags({ opManager, orManager, loft } = {}) {
  return uniq([
    ...managerHashtags(opManager),
    ...managerHashtags(orManager),
    loftHashtag(loft)
  ]).join(' ');
}

export function formatPhotoStatus(photoCount = 0, photosLater = false) {
  if (photosLater) return 'Фото будут отправлены отдельно в группу.';
  return `Фото отправлены выше: ${photoCount} шт.`;
}

export function getDepartmentStatusText(entry = {}) {
  return STATUS_LABELS[entry.status] || '';
}

export function buildAboutText(about = {}) {
  const summary = cleanMultilineText(about.summary);
  if (summary) return summary;

  return [
    about.communication,
    about.eventFlow,
    about.feedback,
    about.leftovers,
    about.futureNotes
  ]
    .map(cleanText)
    .filter(Boolean)
    .join('\n\n');
}

export function formatEventReport(payload, photoCount = 0) {
  const event = payload?.event || {};
  const departments = payload?.departments || {};
  const aboutText = buildAboutText(payload?.about);
  const lines = [
    `Дата: ${formatDate(event.date)}`,
    `Лофт: ${cleanText(event.loft)}`,
    `Зал: ${cleanText(event.hall) || joinList(event.halls)}`,
    `Мероприятие: ${cleanText(event.eventName)}`,
    `Тип: ${cleanText(event.eventType)}`,
    `Формат: ${joinList(event.formats)}`,
    `Количество гостей: ${cleanText(event.guestCount)}`,
    '',
    `Менеджер ОП: ${cleanText(event.opManager)}`,
    `Менеджер ОР: ${cleanText(event.orManager)}`,
    `Организатор / заказчик: ${formatContact(event.contactType, event.contactComment)}`
  ];

  const serviceStaff = cleanText(event.serviceStaff);
  if (serviceStaff) lines.push(`Персонал сервиса: ${serviceStaff}`);

  lines.push('', '━━━━━━━━━━━━━━━', 'ОЦЕНКА СЛУЖБ', '');
  for (const department of ALL_DEPARTMENTS) {
    const entry = departments[department] || {};
    lines.push(department);
    lines.push(getDepartmentStatusText(entry));
    const comment = cleanText(entry.comment);
    if ((entry.status === 'warning' || entry.status === 'critical') && comment) {
      lines.push(`↳ ${comment}`);
    }
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━', 'ABOUT THE EVENT', '', aboutText || 'Не заполнено.');
  lines.push('', '━━━━━━━━━━━━━━━', 'ФОТООТЧЁТ', '', formatPhotoStatus(photoCount, payload?.photosLater));
  const hashtags = buildReportHashtags(event);
  if (hashtags) lines.push('', hashtags);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formatTastingReport(payload, photoCount = 0) {
  const tasting = payload?.tasting || {};
  const eventDate = formatDate(tasting.eventDate);
  const eventHall = cleanText(tasting.eventHall || tasting.hall) || joinList(tasting.halls);
  const eventDescription = eventDate || eventHall
    ? cleanText(`Дегустация по мероприятию ${eventDate} ${eventHall}`)
    : cleanText(tasting.eventName);
  const lines = [
    `Дата: ${formatDate(tasting.date)}`,
    `ОП: ${cleanText(tasting.opManager)}`,
    `ОР: ${cleanText(tasting.orManager)}`,
    `Лофт: ${cleanText(tasting.loft)}`,
    `Зал: ${eventHall}`,
    eventDescription,
    `Комментарии: ${cleanText(tasting.comments) || 'Без комментариев.'}`,
    '',
    '━━━━━━━━━━━━━━━',
    'ФОТООТЧЁТ',
    '',
    formatPhotoStatus(photoCount, payload?.photosLater)
  ];
  const hashtags = buildReportHashtags({
    opManager: tasting.opManager,
    orManager: tasting.orManager,
    loft: tasting.loft
  });
  if (hashtags) lines.push('', hashtags);
  return lines.join('\n');
}
