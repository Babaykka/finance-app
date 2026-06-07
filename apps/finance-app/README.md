# Finance App

Локальный MVP личной финансовой системы: места хранения, долги, платежи, черновики из сообщений, Telegram-вход и экспорт в Google Sheets.

## Запуск

```bash
npm install
cp .env.example .env.local
npm run prisma:generate
npm run db:migrate
npm run dev
```

Открыть: http://localhost:3000

## Переменные окружения

- `DATABASE_URL` - локальная SQLite база, например `file:./dev.db`.
- `OWNER_TELEGRAM_USER_ID` - Telegram ID владельца.
- `OWNER_DISPLAY_NAME` - отображаемое имя владельца.
- `TELEGRAM_BOT_TOKEN` - токен Telegram-бота.
- `TELEGRAM_WEBHOOK_SECRET` - секрет для проверки webhook-запросов Telegram.
- `TELEGRAM_ALLOWED_USER_ID` - Telegram ID, которому разрешено писать боту.
- `OPENAI_API_KEY` - ключ OpenAI API для разбора текста и голоса.
- `OPENAI_PARSE_MODEL` - модель для разбора текстовых финансовых сообщений; в Render сейчас стоит экономный режим `gpt-5-mini`.
- `OPENAI_ASSISTANT_MODEL` - модель для разговоров с ботом и ответов по финансам; в Render сейчас стоит экономный режим `gpt-5-mini`.
- `APP_BASE_URL` - публичный или локальный URL приложения.
- `GOOGLE_OAUTH_ACCESS_TOKEN` - OAuth access token для создания Google Sheets export.

## Импорт текущих данных

```bash
curl -X POST http://localhost:3000/api/import/current
```

Импорт добавляет текущие известные места хранения и долги в базу через audited services. Повторный запуск не должен дублировать уже импортированные места хранения и долги.

## Экспорт снимка

```bash
curl http://localhost:3000/api/export/snapshot
```

Экспорт возвращает JSON с таблицами, готовыми для выгрузки в Google Sheets.

## Экспорт в Google Sheets

```bash
curl -X POST http://localhost:3000/api/export/google-sheets
```

Для этого нужен `GOOGLE_OAUTH_ACCESS_TOKEN`. Приложение создает новую Google Sheet, записывает туда текущий снимок и сохраняет запись об экспорте в `ExportJob`.

## Telegram

Webhook route: `/api/telegram/webhook`.

Бот принимает текст и voice-сообщения от разрешенного Telegram ID. Автоматический разбор создает только черновики; запись в базу происходит после подтверждения.

## Доступ

В production все страницы и обычные API закрыты Next proxy. Доступ к интерфейсу выдается через Telegram Mini App: `/login` проверяет Telegram WebApp init data, сверяет пользователя с `TELEGRAM_ALLOWED_USER_ID` и ставит httpOnly-сессию.

Публичными остаются только `/api/health`, `/login`, `/api/auth/telegram` и `/api/telegram/webhook`. Webhook дополнительно проверяет `TELEGRAM_WEBHOOK_SECRET`; его внутренние запросы к API проходят по `X-Finance-Internal-Secret`.

### Локальный режим бота

Telegram не может открыть локальный `http://localhost:3000` как Mini App и не может слать webhook в локальный URL. Для разработки с локальным сайтом запусти два процесса:

```bash
npm run dev
```

```bash
npm run bot:poll
```

`bot:poll` отключает webhook для бота и забирает сообщения через Telegram long polling. Сообщения обрабатываются локальным приложением через `APP_BASE_URL`, по умолчанию `http://localhost:3000`.

Для единичной проверки без постоянного процесса:

```bash
npm run bot:poll:once
```

Если нужно отбросить старые накопившиеся Telegram updates:

```bash
npm run bot:poll -- --drop-pending
```

### Mini App и webhook

Для кнопки Telegram Mini App нужен публичный HTTPS URL в `APP_BASE_URL`. После деплоя или HTTPS-туннеля:

```bash
npm run telegram:setup
```

Команда обновляет команды бота, ставит кнопку Mini App и настраивает webhook, если заполнен `TELEGRAM_WEBHOOK_SECRET`.

## Деплой на Render

В корне репозитория есть `render.yaml` для Render Blueprint:

- сервис: Next.js web service;
- база: SQLite-файл на постоянном диске `/var/data/finance.db`;
- миграции: запускаются в `start:render` перед стартом Next;
- Telegram: `initialDeployHook` запускает `telegram:setup`, ставит Mini App кнопку и webhook.

При создании Blueprint в Render нужно заполнить секреты:

- `OWNER_TELEGRAM_USER_ID`
- `TELEGRAM_ALLOWED_USER_ID`
- `TELEGRAM_BOT_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_PARSE_MODEL` - сейчас стоит `gpt-5-mini`; для качества можно вернуть `gpt-5.2`.
- `OPENAI_ASSISTANT_MODEL` - сейчас стоит `gpt-5-mini`; для более умного бота можно вернуть `gpt-5.2`.

`TELEGRAM_WEBHOOK_SECRET` генерируется Render автоматически. `APP_BASE_URL` можно не задавать на Render: `telegram:setup` использует `RENDER_EXTERNAL_URL`.

## Правила безопасности

Не хранить seed phrases, приватные ключи, пароли, полные номера карт, полные номера счетов, точные адреса криптокошельков, паспортные данные и лишние персональные данные.

## Проверки

```bash
npm test
npm run typecheck
npm run build
```
