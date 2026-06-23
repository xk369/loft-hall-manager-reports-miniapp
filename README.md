# LOFT HALL — отчёты менеджеров

Telegram Mini App для отчётов менеджеров по ивентам и дегустациям.

Поток:

```text
Telegram Mini App
→ менеджер заполняет форму
→ загружает 1-30 фото
→ backend проверяет Telegram.WebApp.initData
→ backend отправляет фото в рабочую группу
→ backend отправляет текстовый отчёт ниже фото
```

## Что реализовано

- выбор на главном экране: `Ивент` или `Дегустация`;
- полная форма ивента: паспорт мероприятия, службы, ABOUT THE EVENT, фото, проверка;
- короткая форма дегустации: дата, ОП, ОР, название мероприятия, зал, комментарии, фото;
- обязательная загрузка фото, максимум 30 штук;
- предпросмотр фото, удаление фото, счётчик;
- клиентское сжатие jpg/png/webp до разумного размера перед отправкой;
- автосохранение черновика формы в `localStorage`;
- backend без секретов во frontend;
- проверка подписи Telegram на `/api/auth/telegram` и `/api/reports`;
- отправка 1 фото через `sendPhoto`, 2-30 фото через `sendMediaGroup` пачками по 10;
- отдельное сообщение с отчётом после фото;
- тесты форматирования отчётов и Telegram initData.

## Переменные окружения

```bash
cp .env.example .env
```

Заполните:

```env
BOT_TOKEN=токен_бота_из_BotFather
EVENT_REPORTS_CHAT_ID=-100...
INIT_DATA_TTL_SECONDS=86400
PORT=3000
MAX_UPLOAD_MB=220
```

Бот должен быть добавлен в рабочую группу и иметь право отправлять сообщения.

`EVENT_REPORTS_CHAT_ID` — это не ссылка на группу, а числовой id чата Telegram.
Для закрытой группы invite-ссылка вида `https://t.me/+...` не подходит для отправки через Bot API.

Как получить `EVENT_REPORTS_CHAT_ID`:

1. Добавьте бота в нужную закрытую группу.
2. Напишите в группе любое сообщение, лучше команду с упоминанием бота, например `/chatid@username_бота`.
3. Выполните запрос:

```bash
curl "https://api.telegram.org/bot<БОТ_ТОКЕН>/getUpdates"
```

4. В ответе найдите блок `chat`:

```json
"chat":{"id":-1001234567890,"title":"...","type":"supergroup"}
```

5. Скопируйте значение `id` в `.env`:

```env
EVENT_REPORTS_CHAT_ID=-1001234567890
```

Если `getUpdates` возвращает пустой список, проверьте, что бот действительно добавлен в группу, и отправьте в группу команду с упоминанием бота. Для стабильной работы в рабочей группе лучше выдать боту право отправлять сообщения.

## Локальная проверка

```bash
npm install
npm test
npm start
```

Health endpoint:

```bash
curl http://127.0.0.1:3000/api/health
```

Ожидаемо:

```json
{"ok":true,"service":"loft-hall-manager-reports"}
```

При прямом открытии URL в браузере рабочая форма не показывается. Mini App должен быть открыт из Telegram, чтобы появился `Telegram.WebApp.initData`.

## API

### `POST /api/auth/telegram`

```json
{"initData":"query_id=...&user=...&auth_date=...&hash=..."}
```

### `POST /api/reports`

`multipart/form-data`:

```text
initData
reportPayload
photos
```

`reportPayload` содержит JSON формы. `chat_id` frontend не передаёт.

## Docker

```bash
docker compose up -d --build
docker compose logs -f loft-manager-reports
```

По умолчанию контейнер публикуется локально:

```text
127.0.0.1:3200
```

Для reverse proxy есть примеры:

- `nginx.example.conf`
- `deploy/Caddyfile`

Для Nginx важно оставить `client_max_body_size 240m`, иначе большие фотоотчёты будут отрезаться прокси.
