import assert from 'node:assert/strict';
import test from 'node:test';
import { formatEventReport, formatTastingReport } from '../public/report-format.js';
import { buildReportText, validatePhotos } from '../src/report.js';

const eventPayload = {
  type: 'event',
  event: {
    date: '2026-06-11',
    loft: 'LOFT#3',
    hall: 'Grace',
    eventType: 'Свадьба',
    eventName: 'Свадьба Александра и Марины',
    guestCount: 39,
    formats: ['Банкет'],
    opManager: 'Бешимова',
    orManager: 'Харзиани',
    contactType: 'Организатор',
    contactComment: 'Вера, Анастасия',
    serviceStaff: '4 официанта'
  },
  departments: {
    SALES: { status: 'ok', comment: '' },
    SUPPORT: { status: 'warning', comment: 'Оперативно поменяли расстановку мебели.' },
    CLEANING: { status: 'ok', comment: '' },
    DEVELOPMENT: { status: 'ok', comment: '' },
    SECURITY: { status: 'critical', comment: 'Некорректная коммуникация.' },
    MAG: { status: 'ok', comment: '' },
    KITCHEN: { status: 'ok', comment: '' },
    SERVICE: { status: 'ok', comment: '' },
    BAR: { status: 'na', comment: '' },
    HOOKAH: { status: 'na', comment: '' }
  },
  about: {
    summary: 'Коммуникация велась с координаторами.\n\nМероприятие прошло штатно.\n\nЕду и алкоголь передали паре.',
    communication: '',
    eventFlow: '',
    feedback: '',
    leftovers: '',
    futureNotes: ''
  }
};

test('formats event report for Telegram', () => {
  assert.equal(
    formatEventReport(eventPayload, 18),
    [
      'LOFT HALL · ОТЧЁТ ПО МЕРОПРИЯТИЮ',
      '',
      'Дата: 11.06.2026',
      'Лофт: LOFT#3',
      'Зал: Grace',
      'Мероприятие: Свадьба Александра и Марины',
      'Тип: Свадьба',
      'Формат: Банкет',
      'Количество гостей: 39',
      '',
      'Менеджер ОП: Бешимова',
      'Менеджер ОР: Харзиани',
      'Организатор / заказчик: Организатор — Вера, Анастасия',
      'Персонал сервиса: 4 официанта',
      '',
      '━━━━━━━━━━━━━━━',
      'ОЦЕНКА СЛУЖБ',
      '',
      'SALES',
      '✅ Замечаний нет.',
      '',
      'SUPPORT',
      '🟡 Есть замечания.',
      '↳ Оперативно поменяли расстановку мебели.',
      '',
      'CLEANING',
      '✅ Замечаний нет.',
      '',
      'DEVELOPMENT',
      '✅ Замечаний нет.',
      '',
      'SECURITY',
      '🔴 Серьёзные замечания.',
      '↳ Некорректная коммуникация.',
      '',
      'MAG',
      '✅ Замечаний нет.',
      '',
      'KITCHEN',
      '✅ Замечаний нет.',
      '',
      'SERVICE',
      '✅ Замечаний нет.',
      '',
      'BAR',
      'Не применимо.',
      '',
      'HOOKAH',
      'Не применимо.',
      '',
      '━━━━━━━━━━━━━━━',
      'ABOUT THE EVENT',
      '',
      'Коммуникация велась с координаторами.',
      '',
      'Мероприятие прошло штатно.',
      '',
      'Еду и алкоголь передали паре.',
      '',
      '━━━━━━━━━━━━━━━',
      'ФОТООТЧЁТ',
      '',
      'Фото отправлены выше: 18 шт.'
    ].join('\n')
  );
});

test('validates required service comments', () => {
  const payload = structuredClone(eventPayload);
  payload.departments.SUPPORT.comment = '';
  assert.throws(() => buildReportText(payload, 1), /SUPPORT/);
});

test('formats deferred photo status', () => {
  const payload = structuredClone(eventPayload);
  payload.photosLater = true;
  assert.match(formatEventReport(payload, 0), /Фото будут отправлены позже\./);
});

test('allows reports without photos only when photos are deferred', () => {
  assert.throws(() => validatePhotos([], { photosLater: false }), /Добавьте хотя бы одно фото/);
  assert.deepEqual(validatePhotos([], { photosLater: true }), []);
});

test('formats tasting report', () => {
  assert.equal(
    formatTastingReport(
      {
        tasting: {
          date: '2026-06-12',
          opManager: 'Иванова',
          orManager: 'Петрова',
          eventDate: '2026-07-20',
          loft: 'LOFT#3',
          halls: ['Grace', 'Sky'],
          eventHall: 'Grace, Sky',
          hall: 'Grace, Sky',
          comments: 'Гости согласовали меню.'
        }
      },
      5
    ),
    [
      'LOFT HALL · ОТЧЁТ ПО ДЕГУСТАЦИИ',
      '',
      'Дата: 12.06.2026',
      'ОП: Иванова',
      'ОР: Петрова',
      'Лофт: LOFT#3',
      'Зал: Grace, Sky',
      'Дегустация по мероприятию 20.07.2026 Grace, Sky',
      'Комментарии: Гости согласовали меню.',
      '',
      '━━━━━━━━━━━━━━━',
      'ФОТООТЧЁТ',
      '',
      'Фото отправлены выше: 5 шт.'
    ].join('\n')
  );
});

test('builds tasting report with loft and multiple halls', () => {
  const text = buildReportText(
    {
      type: 'tasting',
      tasting: {
        date: '2026-06-12',
        opManager: 'Иванова',
        orManager: 'Петрова',
        eventDate: '2026-07-20',
        loft: 'LOFT#2',
        halls: ['BACKYARD', "Rt’s&Rc’s"],
        comments: ''
      }
    },
    0
  );

  assert.match(text, /Лофт: LOFT#2/);
  assert.match(text, /Зал: BACKYARD, Rt’s&Rc’s/);
  assert.match(text, /Дегустация по мероприятию 20\.07\.2026 BACKYARD, Rt’s&Rc’s/);
});
