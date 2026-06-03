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

## Правила безопасности

Не хранить seed phrases, приватные ключи, пароли, полные номера карт, полные номера счетов, точные адреса криптокошельков, паспортные данные и лишние персональные данные.

## Проверки

```bash
npm test
npm run typecheck
npm run build
```
