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
      '🟢 Без замечаний.',
      '',
      'SUPPORT',
      '🟡 Есть замечания.',
      '↳ Оперативно поменяли расстановку мебели.',
      '',
      'CLEANING',
      '🟢 Без замечаний.',
      '',
      'DEVELOPMENT',
      '🟢 Без замечаний.',
      '',
      'SECURITY',
      '🔴 Критично.',
      '↳ Некорректная коммуникация.',
      '',
      'MAG',
      '🟢 Без замечаний.',
      '',
      'KITCHEN',
      '🟢 Без замечаний.',
      '',
      'BAR',
      'Не заказывали.',
      '',
      'HOOKAH',
      'Не заказывали.',
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
      'Фото отправлены выше: 18 шт.',
      '',
      '#Бешимова',
      '#Харзиани',
      '#Grace'
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
  assert.match(formatEventReport(payload, 0), /Фото будут отправлены отдельно в группу\./);
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
      'Фото отправлены выше: 5 шт.',
      '',
      '#Иванова',
      '#Петрова',
      '#Grace',
      '#Sky'
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
  assert.match(text, /#Иванова\n#Петрова\n#BACKYARD\n#RtsRcs/);
});

test('formats manager hashtags from multiple names', () => {
  const payload = structuredClone(eventPayload);
  payload.event.opManager = 'Осотина/Середа';
  payload.event.orManager = 'Беляченко и Симаненко';
  payload.event.loft = 'LOFT#4';
  assert.match(formatEventReport(payload, 1), /#Осотина\n#Середа\n#Беляченко\n#Симаненко\n#Grace$/);
});

test('formats full loft hashtag safely', () => {
  const payload = structuredClone(eventPayload);
  payload.event.loft = 'LOFT#1';
  payload.event.hall = 'LOFT#1 полностью';
  assert.match(formatEventReport(payload, 1), /Зал: LOFT#1 полностью/);
  assert.match(formatEventReport(payload, 1), /#Бешимова\n#Харзиани$/);
});

test('formats combined full loft 2 and 3 hashtag', () => {
  const payload = structuredClone(eventPayload);
  payload.event.loft = 'LOFT#2/3';
  payload.event.hall = 'LOFT#2 полностью, LOFT#3 полностью';
  payload.event.halls = ['LOFT#2 полностью', 'LOFT#3 полностью'];
  payload.event.selection = {
    'LOFT#2': { full: true, halls: [] },
    'LOFT#3': { full: true, halls: [] }
  };
  assert.match(formatEventReport(payload, 1), /Лофт: LOFT#2\/3/);
  assert.match(formatEventReport(payload, 1), /#Бешимова\n#Харзиани$/);
});

test('formats mixed full loft and partial hall hashtags', () => {
  const payload = structuredClone(eventPayload);
  payload.event.loft = 'LOFT#3, LOFT#2';
  payload.event.hall = 'LOFT#3 полностью, BACKYARD';
  payload.event.halls = ['LOFT#3 полностью', 'BACKYARD'];
  payload.event.selection = {
    'LOFT#3': { full: true, halls: [] },
    'LOFT#2': { full: false, halls: ['BACKYARD'] }
  };
  assert.match(formatEventReport(payload, 1), /#Бешимова\n#Харзиани\n#BACKYARD$/);
});

test('formats named venue loft hashtag in title case', () => {
  const payload = structuredClone(eventPayload);
  payload.event.loft = 'Вишневый сад';
  assert.match(formatEventReport(payload, 1), /#Бешимова\n#Харзиани\n#Grace$/);
});

test('formats whole non-loft venue hashtag', () => {
  const payload = structuredClone(eventPayload);
  payload.event.loft = 'ZORKA';
  payload.event.hall = 'ZORKA';
  payload.event.halls = ['ZORKA'];
  payload.event.selection = {
    ZORKA: { full: true, halls: [] }
  };
  assert.match(formatEventReport(payload, 1), /Лофт: ZORKA/);
  assert.match(formatEventReport(payload, 1), /#Бешимова\n#Харзиани\n#ZORKA$/);
});
