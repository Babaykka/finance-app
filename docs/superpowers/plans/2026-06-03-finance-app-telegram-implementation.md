# Finance App Telegram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first personal finance app with a mobile PWA, Telegram Mini App entry, Telegram bot text/voice intake, AI-created drafts, explicit confirmation, audit history, import from the current Google Sheets model, and export back to Google Sheets format.

**Architecture:** Add a new TypeScript app under `apps/finance-app`. Next.js provides the PWA UI and API routes, Prisma owns SQLite locally with PostgreSQL-compatible schema choices, service modules enforce finance rules, Telegram/OpenAI/Google integrations sit behind adapters, and all writes pass through audited domain services.

**Tech Stack:** TypeScript, Next.js, React, Prisma, SQLite for local MVP, PostgreSQL-compatible schema, Vitest, Zod, raw Telegram Bot API adapter, OpenAI SDK adapter, Google Sheets export adapter, existing Python spreadsheet generator as domain reference only.

---

## Scope And Execution Notes

This plan implements the approved MVP as one cohesive product. It is split into tasks that each leave the repository in a working, testable state.

The current Python Google Sheets generator stays intact. The new app is created in `apps/finance-app` and does not replace existing workbook generation. The old workbook schema is used as a domain reference for naming and import/export mapping.

Do not commit secrets. Use `.env.local` for local values and `.env.example` for documented variable names.

Use frequent commits exactly as described in each task. If a task changes because reality differs from the plan, commit the smallest coherent working slice and update this plan with the corrected details.

---

## File Structure

Create:

- `apps/finance-app/package.json` - scripts and dependencies for the app.
- `apps/finance-app/tsconfig.json` - strict TypeScript config.
- `apps/finance-app/next.config.ts` - Next config.
- `apps/finance-app/vitest.config.ts` - Vitest config.
- `apps/finance-app/.env.example` - documented local environment variables.
- `apps/finance-app/prisma/schema.prisma` - database schema.
- `apps/finance-app/src/domain/enums.ts` - shared enum constants and Zod enums.
- `apps/finance-app/src/domain/money.ts` - money parsing, formatting, and decimal helpers.
- `apps/finance-app/src/domain/dates.ts` - date normalization and Moscow-time helpers.
- `apps/finance-app/src/server/db.ts` - Prisma client creation.
- `apps/finance-app/src/server/repositories/*.ts` - database read/write helpers.
- `apps/finance-app/src/server/services/*.ts` - audited domain services.
- `apps/finance-app/src/server/auth/telegram.ts` - Telegram identity verification.
- `apps/finance-app/src/server/ai/schema.ts` - AI action schema.
- `apps/finance-app/src/server/ai/parser.ts` - parser interface and validation.
- `apps/finance-app/src/server/ai/openai-adapter.ts` - OpenAI integration behind an interface.
- `apps/finance-app/src/server/telegram/bot.ts` - bot update handling.
- `apps/finance-app/src/server/export/google-sheets.ts` - export adapter contract and Google Sheets job boundary.
- `apps/finance-app/src/app/api/**/route.ts` - API route handlers.
- `apps/finance-app/src/app/**` - mobile UI routes and components.
- `apps/finance-app/tests/**/*.test.ts` - unit and integration tests.
- `apps/finance-app/README.md` - local runbook.

Modify:

- `.gitignore` - add Node, Next.js, Prisma local generated files, and app env files.
- `docs/finance-system-user-guide.md` - add a short note that the app becomes the source of truth once launched.

---

## Task 1: App Scaffold And Test Harness

**Files:**
- Create: `apps/finance-app/package.json`
- Create: `apps/finance-app/tsconfig.json`
- Create: `apps/finance-app/next.config.ts`
- Create: `apps/finance-app/vitest.config.ts`
- Create: `apps/finance-app/next-env.d.ts`
- Create: `apps/finance-app/src/app/layout.tsx`
- Create: `apps/finance-app/src/app/page.tsx`
- Create: `apps/finance-app/tests/smoke.test.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Create the app package manifest**

Create `apps/finance-app/package.json`:

```json
{
  "name": "finance-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "next typegen && tsc --noEmit",
    "prisma:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:reset": "prisma migrate reset --force"
  },
  "dependencies": {
    "@prisma/client": "latest",
    "clsx": "latest",
    "date-fns": "latest",
    "next": "latest",
    "openai": "latest",
    "react": "latest",
    "react-dom": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "prisma": "latest",
    "tsx": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Add TypeScript and Next config**

Create `apps/finance-app/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

Create `apps/finance-app/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true
};

export default nextConfig;
```

Create `apps/finance-app/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
```

- [ ] **Step 3: Add Next app root files and smoke test**

Create `apps/finance-app/next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

Create `apps/finance-app/src/app/layout.tsx`:

```tsx
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
```

Create `apps/finance-app/src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main>
      <h1>Финансы</h1>
      <p>Личная финансовая система запускается.</p>
    </main>
  );
}
```

Create `apps/finance-app/tests/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs TypeScript tests", () => {
    expect("finance-app").toContain("finance");
  });
});
```

- [ ] **Step 4: Update gitignore**

Append these lines to `.gitignore`:

```gitignore
apps/finance-app/node_modules/
apps/finance-app/.next/
apps/finance-app/.env
apps/finance-app/.env.local
apps/finance-app/prisma/dev.db
apps/finance-app/prisma/dev.db-journal
apps/finance-app/coverage/
apps/finance-app/tsconfig.tsbuildinfo
```

- [ ] **Step 5: Install dependencies and run the first checks**

Run:

```bash
cd apps/finance-app
npm install
npm test
npm run typecheck
npm run build
```

Expected:

```text
1 test passed
typecheck exits 0
Next build succeeds
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore apps/finance-app
git commit -m "feat: scaffold finance app"
```

---

## Task 2: Database Schema And Domain Enums

**Files:**
- Create: `apps/finance-app/prisma/schema.prisma`
- Create: `apps/finance-app/src/domain/enums.ts`
- Create: `apps/finance-app/src/domain/money.ts`
- Create: `apps/finance-app/src/domain/dates.ts`
- Create: `apps/finance-app/tests/domain/enums.test.ts`
- Create: `apps/finance-app/tests/domain/money.test.ts`
- Create: `apps/finance-app/tests/domain/dates.test.ts`

- [ ] **Step 1: Write enum tests**

Create `apps/finance-app/tests/domain/enums.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  AssetSchema,
  DebtStatusSchema,
  DebtTypeSchema,
  StorageTypeSchema
} from "@/domain/enums";

describe("domain enums", () => {
  it("accepts real MVP values", () => {
    expect(StorageTypeSchema.parse("trusted_person")).toBe("trusted_person");
    expect(DebtTypeSchema.parse("work_receivable")).toBe("work_receivable");
    expect(DebtStatusSchema.parse("scheduled")).toBe("scheduled");
    expect(AssetSchema.parse("USDT")).toBe("USDT");
  });

  it("rejects typo values", () => {
    expect(() => DebtStatusSchema.parse("платит")).toThrow();
  });
});
```

- [ ] **Step 2: Implement enums**

Create `apps/finance-app/src/domain/enums.ts`:

```ts
import { z } from "zod";

export const AssetSchema = z.enum(["RUB", "AMD", "USDT", "BTC", "ETH", "OTHER_CRYPTO"]);
export type Asset = z.infer<typeof AssetSchema>;

export const StorageTypeSchema = z.enum([
  "bank_account",
  "income_bank_product",
  "cash",
  "crypto_exchange",
  "crypto_wallet",
  "trusted_person",
  "investment",
  "other"
]);
export type StorageType = z.infer<typeof StorageTypeSchema>;

export const StorageSubtypeSchema = z.enum([
  "savings_account",
  "deposit",
  "brokerage",
  "card_account",
  "wallet",
  "not_applicable",
  "other"
]);
export type StorageSubtype = z.infer<typeof StorageSubtypeSchema>;

export const AvailabilitySchema = z.enum([
  "immediate",
  "delayed",
  "restricted",
  "locked_until_date"
]);
export type Availability = z.infer<typeof AvailabilitySchema>;

export const AttentionPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export type AttentionPriority = z.infer<typeof AttentionPrioritySchema>;

export const StorageStatusSchema = z.enum(["active", "check", "move", "closed"]);
export type StorageStatus = z.infer<typeof StorageStatusSchema>;

export const DebtTypeSchema = z.enum(["personal_debt", "work_receivable"]);
export type DebtType = z.infer<typeof DebtTypeSchema>;

export const DebtStatusSchema = z.enum([
  "no_agreement",
  "negotiating",
  "scheduled",
  "overdue",
  "closed"
]);
export type DebtStatus = z.infer<typeof DebtStatusSchema>;

export const PaymentRecordTypeSchema = z.enum(["planned", "actual"]);
export type PaymentRecordType = z.infer<typeof PaymentRecordTypeSchema>;

export const PaymentStatusSchema = z.enum([
  "expected",
  "received",
  "partial",
  "overdue",
  "canceled"
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const SourceSchema = z.enum([
  "web",
  "mini_app",
  "telegram_text",
  "telegram_voice",
  "import",
  "system"
]);
export type Source = z.infer<typeof SourceSchema>;
```

- [ ] **Step 3: Write money and date tests**

Create `apps/finance-app/tests/domain/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatMoney, normalizeAmount } from "@/domain/money";

describe("money helpers", () => {
  it("normalizes comma strings", () => {
    expect(normalizeAmount("6,5")).toBe(6.5);
    expect(normalizeAmount("804 000")).toBe(804000);
  });

  it("formats money for Russian display", () => {
    expect(formatMoney(25000, "RUB")).toBe("25 000 RUB");
    expect(formatMoney(7331, "USDT")).toBe("7 331 USDT");
  });
});
```

Create `apps/finance-app/tests/domain/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { endOfMonthIso, normalizeDateOnly } from "@/domain/dates";

describe("date helpers", () => {
  it("keeps explicit ISO dates", () => {
    expect(normalizeDateOnly("2026-06-03")).toBe("2026-06-03");
  });

  it("converts end of month for Moscow-local date context", () => {
    expect(endOfMonthIso("2026-06-03")).toBe("2026-06-30");
  });
});
```

- [ ] **Step 4: Implement money and date helpers**

Create `apps/finance-app/src/domain/money.ts`:

```ts
import type { Asset } from "./enums";

export function normalizeAmount(value: string | number): number {
  if (typeof value === "number") {
    return value;
  }
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid amount: ${value}`);
  }
  return parsed;
}

export function formatMoney(amount: number, asset: Asset): string {
  const formatted = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2
  }).format(amount);
  return `${formatted} ${asset}`;
}
```

Create `apps/finance-app/src/domain/dates.ts`:

```ts
import { endOfMonth, format, parseISO } from "date-fns";

export function normalizeDateOnly(isoDate: string): string {
  const parsed = parseISO(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${isoDate}`);
  }
  return format(parsed, "yyyy-MM-dd");
}

export function endOfMonthIso(currentIsoDate: string): string {
  return format(endOfMonth(parseISO(currentIsoDate)), "yyyy-MM-dd");
}
```

- [ ] **Step 5: Create Prisma schema**

Create `apps/finance-app/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Owner {
  id             String   @id @default(cuid())
  telegramUserId String   @unique
  displayName    String
  settings       Json     @default("{}")
  createdAt      DateTime @default(now())

  storagePlaces StoragePlace[]
  debts         Debt[]
  payments      DebtPayment[]
  aiDrafts      AiDraft[]
  auditLogs     AuditLog[]
  exportJobs    ExportJob[]
}

model StoragePlace {
  id                 String   @id @default(cuid())
  ownerId            String
  name               String
  type               String
  subtype            String
  holderContext      String
  asset              String
  amount             Decimal
  amountKind         String   @default("exact")
  availability       String
  rate               Decimal?
  interestRule       String?
  interestPaymentDay Int?
  reviewOrEndDate    DateTime?
  lastCheckedAt      DateTime?
  status             String
  attentionPriority  String
  comment            String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  owner Owner @relation(fields: [ownerId], references: [id])

  @@index([ownerId, type])
  @@index([ownerId, status])
}

model Debt {
  id                 String   @id @default(cuid())
  ownerId            String
  partyName          String
  type               String
  basis              String
  asset              String
  originalAmount     Decimal
  remainingAmount    Decimal
  status             String
  nextPaymentAmount  Decimal?
  nextPaymentDate    DateTime?
  attentionPriority  String
  comment            String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  owner    Owner         @relation(fields: [ownerId], references: [id])
  payments DebtPayment[]

  @@index([ownerId, status])
  @@index([ownerId, type])
}

model DebtPayment {
  id          String   @id @default(cuid())
  ownerId     String
  debtId      String
  recordType  String
  paymentDate DateTime
  amount      Decimal
  asset       String
  status      String
  source      String
  comment     String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  owner Owner @relation(fields: [ownerId], references: [id])
  debt  Debt  @relation(fields: [debtId], references: [id])

  @@index([ownerId, paymentDate])
  @@index([debtId, recordType])
}

model MajorMovement {
  id        String   @id @default(cuid())
  ownerId   String
  date      DateTime
  type      String
  amount    Decimal
  asset     String
  fromPlace String?
  toPlace   String?
  debtId    String?
  comment   String?
  createdAt DateTime @default(now())
}

model ExpensePlan {
  id             String   @id @default(cuid())
  ownerId        String
  period         String
  asset          String
  plannedAmount  Decimal
  actualEstimate Decimal?
  status         String
  comment        String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model Decision {
  id            String   @id @default(cuid())
  ownerId       String
  date          DateTime
  area          String
  action        String
  reason        String
  amountOrAsset String?
  priority      String
  status        String
  comment       String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model AiDraft {
  id            String   @id @default(cuid())
  ownerId       String
  source        String
  rawText       String
  transcript    String?
  parsedActions Json
  confidence    Decimal
  status        String
  error         String?
  createdAt     DateTime @default(now())
  confirmedAt   DateTime?

  owner Owner @relation(fields: [ownerId], references: [id])

  @@index([ownerId, status])
}

model AuditLog {
  id         String   @id @default(cuid())
  ownerId    String
  actor      String
  source     String
  entityType String
  entityId   String
  oldValues  Json?
  newValues  Json?
  aiDraftId  String?
  createdAt  DateTime @default(now())

  owner Owner @relation(fields: [ownerId], references: [id])

  @@index([ownerId, createdAt])
  @@index([entityType, entityId])
}

model ExportJob {
  id             String    @id @default(cuid())
  ownerId        String
  target         String
  status         String
  startedAt      DateTime  @default(now())
  finishedAt     DateTime?
  spreadsheetUrl String?
  error          String?

  owner Owner @relation(fields: [ownerId], references: [id])
}
```

- [ ] **Step 6: Add env example and migrate**

Create `apps/finance-app/.env.example`:

```env
DATABASE_URL="file:./dev.db"
OWNER_TELEGRAM_USER_ID="123456789"
OWNER_DISPLAY_NAME="Hrach"
TELEGRAM_BOT_TOKEN=""
OPENAI_API_KEY=""
APP_BASE_URL="http://localhost:3000"
```

Run:

```bash
cd apps/finance-app
cp .env.example .env.local
npm run prisma:generate
npm run db:migrate -- --name init
npm test
npm run typecheck
```

Expected:

```text
Prisma migration created
domain tests pass
typecheck exits 0
```

- [ ] **Step 7: Commit**

```bash
git add apps/finance-app
git commit -m "feat: add finance domain schema"
```

---

## Task 3: Database Client, Owner Bootstrap, Repositories, And Audit

**Files:**
- Create: `apps/finance-app/src/server/db.ts`
- Create: `apps/finance-app/src/server/services/owner-service.ts`
- Create: `apps/finance-app/src/server/services/audit-service.ts`
- Create: `apps/finance-app/src/server/repositories/storage-repository.ts`
- Create: `apps/finance-app/src/server/repositories/debt-repository.ts`
- Create: `apps/finance-app/tests/server/owner-service.test.ts`
- Create: `apps/finance-app/tests/server/audit-service.test.ts`

- [ ] **Step 1: Write owner bootstrap tests**

Create `apps/finance-app/tests/server/owner-service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ensureOwner } from "@/server/services/owner-service";

describe("ensureOwner", () => {
  it("creates the configured owner when missing", async () => {
    const db = {
      owner: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "owner-1",
          telegramUserId: "123",
          displayName: "Hrach"
        })
      }
    };

    const owner = await ensureOwner(db as never, {
      telegramUserId: "123",
      displayName: "Hrach"
    });

    expect(owner.id).toBe("owner-1");
    expect(db.owner.create).toHaveBeenCalledWith({
      data: {
        telegramUserId: "123",
        displayName: "Hrach"
      }
    });
  });
});
```

- [ ] **Step 2: Implement DB and owner service**

Create `apps/finance-app/src/server/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

Create `apps/finance-app/src/server/services/owner-service.ts`:

```ts
type OwnerDb = {
  owner: {
    findUnique(args: { where: { telegramUserId: string } }): Promise<{ id: string; telegramUserId: string; displayName: string } | null>;
    create(args: { data: { telegramUserId: string; displayName: string } }): Promise<{ id: string; telegramUserId: string; displayName: string }>;
  };
};

export async function ensureOwner(
  db: OwnerDb,
  input: { telegramUserId: string; displayName: string }
) {
  const existing = await db.owner.findUnique({
    where: { telegramUserId: input.telegramUserId }
  });
  if (existing) {
    return existing;
  }
  return db.owner.create({
    data: {
      telegramUserId: input.telegramUserId,
      displayName: input.displayName
    }
  });
}
```

- [ ] **Step 3: Write audit service tests**

Create `apps/finance-app/tests/server/audit-service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { writeAuditLog } from "@/server/services/audit-service";

describe("writeAuditLog", () => {
  it("stores source, entity, old values, and new values", async () => {
    const db = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" })
      }
    };

    await writeAuditLog(db as never, {
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
      entityType: "Debt",
      entityId: "debt-1",
      oldValues: { status: "no_agreement" },
      newValues: { status: "scheduled" },
      aiDraftId: "draft-1"
    });

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: "owner-1",
        source: "telegram_text",
        entityType: "Debt",
        entityId: "debt-1"
      })
    });
  });
});
```

- [ ] **Step 4: Implement audit and repository modules**

Create `apps/finance-app/src/server/services/audit-service.ts`:

```ts
import { SourceSchema } from "@/domain/enums";
import { z } from "zod";

const AuditInputSchema = z.object({
  ownerId: z.string(),
  actor: z.string(),
  source: SourceSchema,
  entityType: z.string(),
  entityId: z.string(),
  oldValues: z.unknown().optional(),
  newValues: z.unknown().optional(),
  aiDraftId: z.string().optional()
});

type AuditDb = {
  auditLog: {
    create(args: { data: z.infer<typeof AuditInputSchema> }): Promise<unknown>;
  };
};

export async function writeAuditLog(db: AuditDb, input: z.infer<typeof AuditInputSchema>) {
  const data = AuditInputSchema.parse(input);
  return db.auditLog.create({ data });
}
```

Create `apps/finance-app/src/server/repositories/storage-repository.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export function createStorageRepository(db: PrismaClient) {
  return {
    listByOwner(ownerId: string) {
      return db.storagePlace.findMany({
        where: { ownerId },
        orderBy: [{ attentionPriority: "desc" }, { name: "asc" }]
      });
    },
    findByName(ownerId: string, name: string) {
      return db.storagePlace.findFirst({
        where: { ownerId, name }
      });
    }
  };
}
```

Create `apps/finance-app/src/server/repositories/debt-repository.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export function createDebtRepository(db: PrismaClient) {
  return {
    listByOwner(ownerId: string) {
      return db.debt.findMany({
        where: { ownerId },
        include: { payments: true },
        orderBy: [{ nextPaymentDate: "asc" }, { partyName: "asc" }]
      });
    },
    findByParty(ownerId: string, partyName: string) {
      return db.debt.findFirst({
        where: { ownerId, partyName },
        include: { payments: true }
      });
    }
  };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
cd apps/finance-app
npm test
npm run typecheck
```

Expected:

```text
server service tests pass
typecheck exits 0
```

- [ ] **Step 6: Commit**

```bash
git add apps/finance-app
git commit -m "feat: add owner repositories and audit service"
```

---

## Task 4: Audited Finance Services

**Files:**
- Create: `apps/finance-app/src/server/services/storage-service.ts`
- Create: `apps/finance-app/src/server/services/debt-service.ts`
- Create: `apps/finance-app/src/server/services/dashboard-service.ts`
- Create: `apps/finance-app/tests/server/storage-service.test.ts`
- Create: `apps/finance-app/tests/server/debt-service.test.ts`
- Create: `apps/finance-app/tests/server/dashboard-service.test.ts`

- [ ] **Step 1: Write storage service test for trusted-person storage**

Create `apps/finance-app/tests/server/storage-service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createStoragePlace } from "@/server/services/storage-service";

describe("createStoragePlace", () => {
  it("creates Альфабанк Вероники as trusted-person RUB storage with audit", async () => {
    const db = {
      storagePlace: {
        create: vi.fn().mockResolvedValue({ id: "storage-1", name: "Альфабанк Вероники" })
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" })
      }
    };

    const result = await createStoragePlace(db as never, {
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
      name: "Альфабанк Вероники",
      type: "trusted_person",
      subtype: "not_applicable",
      holderContext: "Вероника",
      asset: "RUB",
      amount: 804000,
      amountKind: "exact",
      availability: "restricted",
      status: "check",
      attentionPriority: "high",
      comment: "Мои деньги на Альфабанк Вероники."
    });

    expect(result.id).toBe("storage-1");
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Implement storage service**

Create `apps/finance-app/src/server/services/storage-service.ts`:

```ts
import { z } from "zod";
import {
  AssetSchema,
  AttentionPrioritySchema,
  AvailabilitySchema,
  SourceSchema,
  StorageStatusSchema,
  StorageSubtypeSchema,
  StorageTypeSchema
} from "@/domain/enums";
import { writeAuditLog } from "./audit-service";

export const CreateStoragePlaceSchema = z.object({
  ownerId: z.string(),
  actor: z.string(),
  source: SourceSchema,
  name: z.string().min(1),
  type: StorageTypeSchema,
  subtype: StorageSubtypeSchema,
  holderContext: z.string().min(1),
  asset: AssetSchema,
  amount: z.number().nonnegative(),
  amountKind: z.enum(["exact", "equivalent", "estimated"]),
  availability: AvailabilitySchema,
  rate: z.number().optional(),
  interestRule: z.string().optional(),
  interestPaymentDay: z.number().int().min(1).max(31).optional(),
  reviewOrEndDate: z.date().optional(),
  lastCheckedAt: z.date().optional(),
  status: StorageStatusSchema,
  attentionPriority: AttentionPrioritySchema,
  comment: z.string().optional()
});

type StorageDb = {
  storagePlace: {
    create(args: { data: Omit<z.infer<typeof CreateStoragePlaceSchema>, "actor" | "source"> }): Promise<{ id: string; name: string }>;
  };
  auditLog: {
    create(args: { data: unknown }): Promise<unknown>;
  };
};

export async function createStoragePlace(db: StorageDb, rawInput: z.infer<typeof CreateStoragePlaceSchema>) {
  const input = CreateStoragePlaceSchema.parse(rawInput);
  const { actor, source, ...data } = input;
  const created = await db.storagePlace.create({ data });
  await writeAuditLog(db, {
    ownerId: input.ownerId,
    actor,
    source,
    entityType: "StoragePlace",
    entityId: created.id,
    newValues: data
  });
  return created;
}
```

- [ ] **Step 3: Write debt service tests**

Create `apps/finance-app/tests/server/debt-service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createDebtWithOptionalPlan, recordDebtPayment } from "@/server/services/debt-service";

describe("debt service", () => {
  it("creates work receivable with a planned payment", async () => {
    const db = {
      debt: {
        create: vi.fn().mockResolvedValue({ id: "debt-1", partyName: "Степан Гаврилюк" }),
        update: vi.fn()
      },
      debtPayment: {
        create: vi.fn().mockResolvedValue({ id: "payment-1" })
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" })
      }
    };

    await createDebtWithOptionalPlan(db as never, {
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
      partyName: "Степан Гаврилюк",
      type: "work_receivable",
      basis: "дипломная работа",
      asset: "RUB",
      originalAmount: 25000,
      status: "scheduled",
      nextPaymentAmount: 25000,
      nextPaymentDate: new Date("2026-06-03T00:00:00.000Z"),
      attentionPriority: "urgent",
      comment: "Клиент. До 3 июня 2026."
    });

    expect(db.debt.create).toHaveBeenCalledOnce();
    expect(db.debtPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordType: "planned",
        status: "expected"
      })
    });
  });

  it("records actual payment and reduces remaining amount", async () => {
    const db = {
      debt: {
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: "debt-2",
          ownerId: "owner-1",
          remainingAmount: 50000,
          asset: "RUB"
        }),
        update: vi.fn().mockResolvedValue({ id: "debt-2", remainingAmount: 40000 })
      },
      debtPayment: {
        create: vi.fn().mockResolvedValue({ id: "payment-2" })
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-2" })
      }
    };

    await recordDebtPayment(db as never, {
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
      debtId: "debt-2",
      paymentDate: new Date("2026-06-03T00:00:00.000Z"),
      amount: 10000,
      asset: "RUB",
      comment: "Геворг вернул часть."
    });

    expect(db.debt.update).toHaveBeenCalledWith({
      where: { id: "debt-2" },
      data: { remainingAmount: 40000 }
    });
  });
});
```

- [ ] **Step 4: Implement debt service**

Create `apps/finance-app/src/server/services/debt-service.ts`:

```ts
import { z } from "zod";
import {
  AssetSchema,
  AttentionPrioritySchema,
  DebtStatusSchema,
  DebtTypeSchema,
  SourceSchema
} from "@/domain/enums";
import { writeAuditLog } from "./audit-service";

const CreateDebtSchema = z.object({
  ownerId: z.string(),
  actor: z.string(),
  source: SourceSchema,
  partyName: z.string().min(1),
  type: DebtTypeSchema,
  basis: z.string().min(1),
  asset: AssetSchema,
  originalAmount: z.number().positive(),
  status: DebtStatusSchema,
  nextPaymentAmount: z.number().positive().optional(),
  nextPaymentDate: z.date().optional(),
  attentionPriority: AttentionPrioritySchema,
  comment: z.string().optional()
});

const RecordPaymentSchema = z.object({
  ownerId: z.string(),
  actor: z.string(),
  source: SourceSchema,
  debtId: z.string(),
  paymentDate: z.date(),
  amount: z.number().positive(),
  asset: AssetSchema,
  comment: z.string().optional()
});

type DebtDb = {
  debt: {
    create(args: { data: unknown }): Promise<{ id: string; partyName: string }>;
    findFirstOrThrow(args: { where: { id: string; ownerId: string } }): Promise<{ id: string; ownerId: string; remainingAmount: unknown; asset: string }>;
    update(args: { where: { id: string }; data: { remainingAmount: number } }): Promise<unknown>;
  };
  debtPayment: {
    create(args: { data: unknown }): Promise<{ id: string }>;
  };
  auditLog: {
    create(args: { data: unknown }): Promise<unknown>;
  };
};

export async function createDebtWithOptionalPlan(db: DebtDb, rawInput: z.infer<typeof CreateDebtSchema>) {
  const input = CreateDebtSchema.parse(rawInput);
  const { actor, source, ...debtFields } = input;
  const created = await db.debt.create({
    data: {
      ...debtFields,
      remainingAmount: input.originalAmount
    }
  });

  if (input.nextPaymentAmount && input.nextPaymentDate) {
    await db.debtPayment.create({
      data: {
        ownerId: input.ownerId,
        debtId: created.id,
        recordType: "planned",
        paymentDate: input.nextPaymentDate,
        amount: input.nextPaymentAmount,
        asset: input.asset,
        status: "expected",
        source,
        comment: input.comment
      }
    });
  }

  await writeAuditLog(db, {
    ownerId: input.ownerId,
    actor,
    source,
    entityType: "Debt",
    entityId: created.id,
    newValues: debtFields
  });

  return created;
}

export async function recordDebtPayment(db: DebtDb, rawInput: z.infer<typeof RecordPaymentSchema>) {
  const input = RecordPaymentSchema.parse(rawInput);
  const debt = await db.debt.findFirstOrThrow({
    where: { id: input.debtId, ownerId: input.ownerId }
  });
  if (debt.asset !== input.asset) {
    throw new Error(`Payment asset ${input.asset} does not match debt asset ${debt.asset}`);
  }

  const currentRemaining = Number(debt.remainingAmount);
  const nextRemaining = Math.max(0, currentRemaining - input.amount);

  const payment = await db.debtPayment.create({
    data: {
      ownerId: input.ownerId,
      debtId: input.debtId,
      recordType: "actual",
      paymentDate: input.paymentDate,
      amount: input.amount,
      asset: input.asset,
      status: "received",
      source: input.source,
      comment: input.comment
    }
  });

  await db.debt.update({
    where: { id: input.debtId },
    data: { remainingAmount: nextRemaining }
  });

  await writeAuditLog(db, {
    ownerId: input.ownerId,
    actor: input.actor,
    source: input.source,
    entityType: "DebtPayment",
    entityId: payment.id,
    oldValues: { debtRemainingAmount: currentRemaining },
    newValues: { debtRemainingAmount: nextRemaining, paymentAmount: input.amount }
  });

  return payment;
}
```

- [ ] **Step 5: Write and implement dashboard service**

Create `apps/finance-app/tests/server/dashboard-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDashboardSummary } from "@/server/services/dashboard-service";

describe("buildDashboardSummary", () => {
  it("summarizes assets, debts, urgent payments, and trusted-person storage", () => {
    const summary = buildDashboardSummary({
      storagePlaces: [
        { asset: "RUB", amount: 980000, type: "income_bank_product", status: "active", attentionPriority: "medium", name: "Тбанк" },
        { asset: "RUB", amount: 804000, type: "trusted_person", status: "check", attentionPriority: "high", name: "Альфабанк Вероники" },
        { asset: "USDT", amount: 7331, type: "crypto_exchange", status: "active", attentionPriority: "high", name: "Bybit" }
      ],
      debts: [
        { partyName: "Степан", remainingAmount: 25000, asset: "RUB", status: "scheduled", nextPaymentDate: new Date("2026-06-03T00:00:00.000Z") }
      ],
      drafts: [{ id: "draft-1", status: "pending" }]
    });

    expect(summary.assets.RUB).toBe(1784000);
    expect(summary.assets.USDT).toBe(7331);
    expect(summary.attentionStorage[0].name).toBe("Альфабанк Вероники");
    expect(summary.pendingDraftCount).toBe(1);
  });
});
```

Create `apps/finance-app/src/server/services/dashboard-service.ts`:

```ts
type SummaryInput = {
  storagePlaces: Array<{ asset: string; amount: number | unknown; type: string; status: string; attentionPriority: string; name: string }>;
  debts: Array<{ partyName: string; remainingAmount: number | unknown; asset: string; status: string; nextPaymentDate: Date | null }>;
  drafts: Array<{ id: string; status: string }>;
};

export function buildDashboardSummary(input: SummaryInput) {
  const assets: Record<string, number> = {};
  for (const place of input.storagePlaces) {
    assets[place.asset] = (assets[place.asset] ?? 0) + Number(place.amount);
  }

  return {
    assets,
    attentionStorage: input.storagePlaces.filter((place) =>
      place.type === "trusted_person" || place.status === "check" || place.attentionPriority === "urgent"
    ),
    upcomingDebts: input.debts.filter((debt) => debt.status !== "closed"),
    pendingDraftCount: input.drafts.filter((draft) => draft.status === "pending").length
  };
}
```

- [ ] **Step 6: Run checks and commit**

Run:

```bash
cd apps/finance-app
npm test
npm run typecheck
```

Expected:

```text
storage, debt, and dashboard tests pass
typecheck exits 0
```

Commit:

```bash
git add apps/finance-app
git commit -m "feat: add audited finance services"
```

---

## Task 5: API Routes For Dashboard, Storage, Debts, And Payments

**Files:**
- Create: `apps/finance-app/src/server/auth/local-owner.ts`
- Create: `apps/finance-app/src/app/api/dashboard/route.ts`
- Create: `apps/finance-app/src/app/api/storage-places/route.ts`
- Create: `apps/finance-app/src/app/api/debts/route.ts`
- Create: `apps/finance-app/src/app/api/debt-payments/route.ts`
- Create: `apps/finance-app/tests/api/dashboard-route.test.ts`
- Create: `apps/finance-app/tests/api/debts-route.test.ts`

- [ ] **Step 1: Add local owner resolver**

Create `apps/finance-app/src/server/auth/local-owner.ts`:

```ts
import { prisma } from "@/server/db";
import { ensureOwner } from "@/server/services/owner-service";

export async function getLocalOwner() {
  const telegramUserId = process.env.OWNER_TELEGRAM_USER_ID;
  const displayName = process.env.OWNER_DISPLAY_NAME ?? "Owner";
  if (!telegramUserId) {
    throw new Error("OWNER_TELEGRAM_USER_ID is required for local MVP");
  }
  return ensureOwner(prisma, { telegramUserId, displayName });
}
```

- [ ] **Step 2: Write API route tests for response shaping**

Create `apps/finance-app/tests/api/dashboard-route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDashboardSummary } from "@/server/services/dashboard-service";

describe("dashboard API shape", () => {
  it("returns assets, attention storage, upcoming debts, and draft count", () => {
    const payload = buildDashboardSummary({
      storagePlaces: [],
      debts: [],
      drafts: []
    });

    expect(payload).toEqual({
      assets: {},
      attentionStorage: [],
      upcomingDebts: [],
      pendingDraftCount: 0
    });
  });
});
```

Create `apps/finance-app/tests/api/debts-route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CreateDebtApiSchema } from "@/app/api/debts/route";

describe("CreateDebtApiSchema", () => {
  it("accepts Геворг personal debt payload", () => {
    expect(
      CreateDebtApiSchema.parse({
        partyName: "Геворг",
        type: "personal_debt",
        basis: "личный долг другу",
        asset: "RUB",
        originalAmount: 50000,
        status: "no_agreement",
        attentionPriority: "medium",
        comment: "Срок оплаты не согласован."
      })
    ).toMatchObject({ partyName: "Геворг" });
  });
});
```

- [ ] **Step 3: Implement dashboard route**

Create `apps/finance-app/src/app/api/dashboard/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getLocalOwner } from "@/server/auth/local-owner";
import { buildDashboardSummary } from "@/server/services/dashboard-service";

export async function GET() {
  const owner = await getLocalOwner();
  const [storagePlaces, debts, drafts] = await Promise.all([
    prisma.storagePlace.findMany({ where: { ownerId: owner.id } }),
    prisma.debt.findMany({ where: { ownerId: owner.id } }),
    prisma.aiDraft.findMany({ where: { ownerId: owner.id, status: "pending" } })
  ]);

  return NextResponse.json(
    buildDashboardSummary({
      storagePlaces: storagePlaces.map((place) => ({
        ...place,
        amount: Number(place.amount)
      })),
      debts: debts.map((debt) => ({
        ...debt,
        remainingAmount: Number(debt.remainingAmount)
      })),
      drafts
    })
  );
}
```

- [ ] **Step 4: Implement storage and debt routes**

Create `apps/finance-app/src/app/api/storage-places/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getLocalOwner } from "@/server/auth/local-owner";
import { CreateStoragePlaceSchema, createStoragePlace } from "@/server/services/storage-service";

export async function GET() {
  const owner = await getLocalOwner();
  const rows = await prisma.storagePlace.findMany({
    where: { ownerId: owner.id },
    orderBy: { name: "asc" }
  });
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const owner = await getLocalOwner();
  const body = await request.json();
  const input = CreateStoragePlaceSchema.omit({ ownerId: true, actor: true, source: true }).parse(body);
  const created = await createStoragePlace(prisma, {
    ...input,
    ownerId: owner.id,
    actor: `telegram:${owner.telegramUserId}`,
    source: "web"
  });
  return NextResponse.json(created, { status: 201 });
}
```

Create `apps/finance-app/src/app/api/debts/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { getLocalOwner } from "@/server/auth/local-owner";
import {
  AssetSchema,
  AttentionPrioritySchema,
  DebtStatusSchema,
  DebtTypeSchema
} from "@/domain/enums";
import { createDebtWithOptionalPlan } from "@/server/services/debt-service";

export const CreateDebtApiSchema = z.object({
  partyName: z.string().min(1),
  type: DebtTypeSchema,
  basis: z.string().min(1),
  asset: AssetSchema,
  originalAmount: z.number().positive(),
  status: DebtStatusSchema,
  nextPaymentAmount: z.number().positive().optional(),
  nextPaymentDate: z.string().datetime().optional(),
  attentionPriority: AttentionPrioritySchema,
  comment: z.string().optional()
});

export async function GET() {
  const owner = await getLocalOwner();
  const rows = await prisma.debt.findMany({
    where: { ownerId: owner.id },
    include: { payments: true },
    orderBy: { partyName: "asc" }
  });
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const owner = await getLocalOwner();
  const body = CreateDebtApiSchema.parse(await request.json());
  const created = await createDebtWithOptionalPlan(prisma, {
    ...body,
    ownerId: owner.id,
    actor: `telegram:${owner.telegramUserId}`,
    source: "web",
    nextPaymentDate: body.nextPaymentDate ? new Date(body.nextPaymentDate) : undefined
  });
  return NextResponse.json(created, { status: 201 });
}
```

Create `apps/finance-app/src/app/api/debt-payments/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AssetSchema } from "@/domain/enums";
import { getLocalOwner } from "@/server/auth/local-owner";
import { recordDebtPayment } from "@/server/services/debt-service";

const RecordDebtPaymentApiSchema = z.object({
  debtId: z.string(),
  paymentDate: z.string().datetime(),
  amount: z.number().positive(),
  asset: AssetSchema,
  comment: z.string().optional()
});

export async function POST(request: Request) {
  const owner = await getLocalOwner();
  const body = RecordDebtPaymentApiSchema.parse(await request.json());
  const payment = await recordDebtPayment(prisma, {
    ...body,
    paymentDate: new Date(body.paymentDate),
    ownerId: owner.id,
    actor: `telegram:${owner.telegramUserId}`,
    source: "web"
  });
  return NextResponse.json(payment, { status: 201 });
}
```

- [ ] **Step 5: Run checks and commit**

Run:

```bash
cd apps/finance-app
npm test
npm run typecheck
```

Expected:

```text
API shape tests pass
typecheck exits 0
```

Commit:

```bash
git add apps/finance-app
git commit -m "feat: add core finance API routes"
```

---

## Task 6: AI Action Schema And Draft Lifecycle

**Files:**
- Create: `apps/finance-app/src/server/ai/schema.ts`
- Create: `apps/finance-app/src/server/ai/parser.ts`
- Create: `apps/finance-app/src/server/services/draft-service.ts`
- Create: `apps/finance-app/src/app/api/ai-drafts/route.ts`
- Create: `apps/finance-app/src/app/api/ai-drafts/[id]/confirm/route.ts`
- Create: `apps/finance-app/src/app/api/ai-drafts/[id]/reject/route.ts`
- Create: `apps/finance-app/tests/ai/schema.test.ts`
- Create: `apps/finance-app/tests/server/draft-service.test.ts`

- [ ] **Step 1: Write AI schema tests**

Create `apps/finance-app/tests/ai/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AiParseResultSchema } from "@/server/ai/schema";

describe("AiParseResultSchema", () => {
  it("accepts a create debt action", () => {
    const parsed = AiParseResultSchema.parse({
      confidence: 0.86,
      summary: "Создать долг Геворга на 50 000 RUB.",
      actions: [
        {
          type: "create_debt",
          partyName: "Геворг",
          debtType: "personal_debt",
          basis: "личный долг другу",
          asset: "RUB",
          amount: 50000,
          status: "no_agreement",
          attentionPriority: "medium"
        }
      ],
      needsClarification: []
    });

    expect(parsed.actions[0].type).toBe("create_debt");
  });
});
```

- [ ] **Step 2: Implement AI action schema**

Create `apps/finance-app/src/server/ai/schema.ts`:

```ts
import { z } from "zod";
import {
  AssetSchema,
  AttentionPrioritySchema,
  DebtStatusSchema,
  DebtTypeSchema,
  StorageSubtypeSchema,
  StorageTypeSchema
} from "@/domain/enums";

const CreateStorageActionSchema = z.object({
  type: z.literal("create_storage_place"),
  name: z.string(),
  storageType: StorageTypeSchema,
  subtype: StorageSubtypeSchema,
  holderContext: z.string(),
  asset: AssetSchema,
  amount: z.number().nonnegative(),
  amountKind: z.enum(["exact", "equivalent", "estimated"]),
  availability: z.enum(["immediate", "delayed", "restricted", "locked_until_date"]),
  rate: z.number().optional(),
  interestPaymentDay: z.number().int().min(1).max(31).optional(),
  attentionPriority: AttentionPrioritySchema,
  comment: z.string().optional()
});

const CreateDebtActionSchema = z.object({
  type: z.literal("create_debt"),
  partyName: z.string(),
  debtType: DebtTypeSchema,
  basis: z.string(),
  asset: AssetSchema,
  amount: z.number().positive(),
  status: DebtStatusSchema,
  dueDate: z.string().optional(),
  nextPaymentAmount: z.number().positive().optional(),
  attentionPriority: AttentionPrioritySchema,
  comment: z.string().optional()
});

const RecordDebtPaymentActionSchema = z.object({
  type: z.literal("record_debt_payment"),
  partyName: z.string().optional(),
  debtId: z.string().optional(),
  amount: z.number().positive(),
  asset: AssetSchema,
  paymentDate: z.string(),
  comment: z.string().optional()
});

export const AiActionSchema = z.discriminatedUnion("type", [
  CreateStorageActionSchema,
  CreateDebtActionSchema,
  RecordDebtPaymentActionSchema
]);

export const AiParseResultSchema = z.object({
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  actions: z.array(AiActionSchema),
  needsClarification: z.array(z.string())
});

export type AiParseResult = z.infer<typeof AiParseResultSchema>;
export type AiAction = z.infer<typeof AiActionSchema>;
```

- [ ] **Step 3: Implement parser interface**

Create `apps/finance-app/src/server/ai/parser.ts`:

```ts
import { AiParseResultSchema, type AiParseResult } from "./schema";

export type AiParserContext = {
  todayIso: string;
  timezone: string;
  knownDebts: Array<{ id: string; partyName: string; remainingAmount: number; asset: string }>;
  knownStoragePlaces: Array<{ id: string; name: string; asset: string; amount: number }>;
};

export interface AiParser {
  parseMessage(input: { text: string; context: AiParserContext }): Promise<AiParseResult>;
}

export function parseAiJson(json: unknown): AiParseResult {
  return AiParseResultSchema.parse(json);
}
```

- [ ] **Step 4: Write and implement draft service**

Create `apps/finance-app/tests/server/draft-service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createAiDraft } from "@/server/services/draft-service";

describe("createAiDraft", () => {
  it("stores pending draft from parsed AI result", async () => {
    const db = {
      aiDraft: {
        create: vi.fn().mockResolvedValue({ id: "draft-1", status: "pending" })
      }
    };

    const draft = await createAiDraft(db as never, {
      ownerId: "owner-1",
      source: "telegram_text",
      rawText: "Геворг вернул 10000",
      parseResult: {
        confidence: 0.9,
        summary: "Записать оплату 10 000 RUB.",
        actions: [
          {
            type: "record_debt_payment",
            partyName: "Геворг",
            amount: 10000,
            asset: "RUB",
            paymentDate: "2026-06-03"
          }
        ],
        needsClarification: []
      }
    });

    expect(draft.status).toBe("pending");
    expect(db.aiDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "pending",
        confidence: 0.9
      })
    });
  });
});
```

Create `apps/finance-app/src/server/services/draft-service.ts`:

```ts
import { SourceSchema } from "@/domain/enums";
import { AiParseResultSchema, type AiParseResult } from "@/server/ai/schema";
import { z } from "zod";

const CreateAiDraftSchema = z.object({
  ownerId: z.string(),
  source: SourceSchema,
  rawText: z.string(),
  transcript: z.string().optional(),
  parseResult: AiParseResultSchema
});

type DraftDb = {
  aiDraft: {
    create(args: { data: unknown }): Promise<{ id: string; status: string }>;
  };
};

export async function createAiDraft(db: DraftDb, rawInput: z.infer<typeof CreateAiDraftSchema>) {
  const input = CreateAiDraftSchema.parse(rawInput);
  const status = input.parseResult.needsClarification.length > 0 ? "needs_clarification" : "pending";
  return db.aiDraft.create({
    data: {
      ownerId: input.ownerId,
      source: input.source,
      rawText: input.rawText,
      transcript: input.transcript,
      parsedActions: input.parseResult as AiParseResult,
      confidence: input.parseResult.confidence,
      status
    }
  });
}
```

- [ ] **Step 5: Add draft API routes**

Create `apps/finance-app/src/app/api/ai-drafts/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getLocalOwner } from "@/server/auth/local-owner";

export async function GET() {
  const owner = await getLocalOwner();
  const drafts = await prisma.aiDraft.findMany({
    where: { ownerId: owner.id, status: { in: ["pending", "needs_clarification"] } },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json(drafts);
}
```

Create confirmation/rejection routes as thin shells:

`apps/finance-app/src/app/api/ai-drafts/[id]/reject/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getLocalOwner } from "@/server/auth/local-owner";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getLocalOwner();
  const { id } = await context.params;
  const draft = await prisma.aiDraft.update({
    where: { id, ownerId: owner.id },
    data: { status: "rejected" }
  });
  return NextResponse.json(draft);
}
```

`apps/finance-app/src/app/api/ai-drafts/[id]/confirm/route.ts` initially supports a safety error until action application is added in Task 7:

```ts
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Draft confirmation is disabled until Task 7 adds action application tests." },
    { status: 501 }
  );
}
```

- [ ] **Step 6: Run checks and commit**

Run:

```bash
cd apps/finance-app
npm test
npm run typecheck
```

Expected:

```text
AI schema and draft tests pass
typecheck exits 0
```

Commit:

```bash
git add apps/finance-app
git commit -m "feat: add AI draft schema and lifecycle"
```

---

## Task 7: Apply Confirmed AI Actions

**Files:**
- Create: `apps/finance-app/src/server/services/action-application-service.ts`
- Modify: `apps/finance-app/src/app/api/ai-drafts/[id]/confirm/route.ts`
- Create: `apps/finance-app/tests/server/action-application-service.test.ts`

- [ ] **Step 1: Write action application tests**

Create `apps/finance-app/tests/server/action-application-service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { applyAiActions } from "@/server/services/action-application-service";

describe("applyAiActions", () => {
  it("applies create_storage_place action through audited service", async () => {
    const db = {
      storagePlace: {
        create: vi.fn().mockResolvedValue({ id: "storage-1", name: "Альфабанк Вероники" })
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" })
      }
    };

    const result = await applyAiActions(db as never, {
      ownerId: "owner-1",
      actor: "telegram:123",
      source: "telegram_text",
      actions: [
        {
          type: "create_storage_place",
          name: "Альфабанк Вероники",
          storageType: "trusted_person",
          subtype: "not_applicable",
          holderContext: "Вероника",
          asset: "RUB",
          amount: 804000,
          amountKind: "exact",
          availability: "restricted",
          attentionPriority: "high",
          comment: "Мои деньги на Альфабанк Вероники."
        }
      ]
    });

    expect(result).toHaveLength(1);
    expect(db.storagePlace.create).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Implement action application service**

Create `apps/finance-app/src/server/services/action-application-service.ts`:

```ts
import type { AiAction } from "@/server/ai/schema";
import { createStoragePlace } from "./storage-service";
import { createDebtWithOptionalPlan, recordDebtPayment } from "./debt-service";
import type { Source } from "@/domain/enums";

type ApplyInput = {
  ownerId: string;
  actor: string;
  source: Source;
  actions: AiAction[];
};

export async function applyAiActions(db: never, input: ApplyInput) {
  const results: unknown[] = [];

  for (const action of input.actions) {
    if (action.type === "create_storage_place") {
      results.push(
        await createStoragePlace(db, {
          ownerId: input.ownerId,
          actor: input.actor,
          source: input.source,
          name: action.name,
          type: action.storageType,
          subtype: action.subtype,
          holderContext: action.holderContext,
          asset: action.asset,
          amount: action.amount,
          amountKind: action.amountKind,
          availability: action.availability,
          rate: action.rate,
          interestPaymentDay: action.interestPaymentDay,
          status: action.storageType === "trusted_person" ? "check" : "active",
          attentionPriority: action.attentionPriority,
          comment: action.comment
        })
      );
      continue;
    }

    if (action.type === "create_debt") {
      results.push(
        await createDebtWithOptionalPlan(db, {
          ownerId: input.ownerId,
          actor: input.actor,
          source: input.source,
          partyName: action.partyName,
          type: action.debtType,
          basis: action.basis,
          asset: action.asset,
          originalAmount: action.amount,
          status: action.status,
          nextPaymentAmount: action.nextPaymentAmount ?? (action.dueDate ? action.amount : undefined),
          nextPaymentDate: action.dueDate ? new Date(`${action.dueDate}T00:00:00.000Z`) : undefined,
          attentionPriority: action.attentionPriority,
          comment: action.comment
        })
      );
      continue;
    }

    if (action.type === "record_debt_payment") {
      if (!action.debtId) {
        throw new Error("record_debt_payment requires debtId; disambiguate the debt before confirmation");
      }
      results.push(
        await recordDebtPayment(db, {
          ownerId: input.ownerId,
          actor: input.actor,
          source: input.source,
          debtId: action.debtId,
          paymentDate: new Date(`${action.paymentDate}T00:00:00.000Z`),
          amount: action.amount,
          asset: action.asset,
          comment: action.comment
        })
      );
    }
  }

  return results;
}
```

- [ ] **Step 3: Replace confirm route**

Modify `apps/finance-app/src/app/api/ai-drafts/[id]/confirm/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getLocalOwner } from "@/server/auth/local-owner";
import { AiParseResultSchema } from "@/server/ai/schema";
import { applyAiActions } from "@/server/services/action-application-service";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getLocalOwner();
  const { id } = await context.params;
  const draft = await prisma.aiDraft.findFirstOrThrow({
    where: { id, ownerId: owner.id }
  });
  const parsed = AiParseResultSchema.parse(draft.parsedActions);
  const result = await applyAiActions(prisma as never, {
    ownerId: owner.id,
    actor: `telegram:${owner.telegramUserId}`,
    source: draft.source as never,
    actions: parsed.actions
  });
  await prisma.aiDraft.update({
    where: { id },
    data: {
      status: "confirmed",
      confirmedAt: new Date()
    }
  });
  return NextResponse.json({ draftId: id, applied: result.length });
}
```

- [ ] **Step 4: Run checks and commit**

Run:

```bash
cd apps/finance-app
npm test
npm run typecheck
```

Expected:

```text
action application tests pass
typecheck exits 0
```

Commit:

```bash
git add apps/finance-app
git commit -m "feat: apply confirmed AI draft actions"
```

---

## Task 8: OpenAI Parser Adapter, Voice Transcription, And Parse Route

**Files:**
- Create: `apps/finance-app/src/server/ai/openai-adapter.ts`
- Create: `apps/finance-app/src/server/ai/transcription.ts`
- Create: `apps/finance-app/src/app/api/parse-message/route.ts`
- Create: `apps/finance-app/tests/ai/openai-adapter.test.ts`
- Create: `apps/finance-app/tests/ai/transcription.test.ts`
- Create: `apps/finance-app/tests/api/parse-message-route.test.ts`

- [ ] **Step 1: Write OpenAI adapter test with fake client**

Create `apps/finance-app/tests/ai/openai-adapter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createOpenAiParser } from "@/server/ai/openai-adapter";

describe("createOpenAiParser", () => {
  it("validates model JSON before returning it", async () => {
    const client = {
      responses: {
        create: vi.fn().mockResolvedValue({
          output_text: JSON.stringify({
            confidence: 0.9,
            summary: "Создать место хранения.",
            actions: [
              {
                type: "create_storage_place",
                name: "Альфабанк Вероники",
                storageType: "trusted_person",
                subtype: "not_applicable",
                holderContext: "Вероника",
                asset: "RUB",
                amount: 804000,
                amountKind: "exact",
                availability: "restricted",
                attentionPriority: "high"
              }
            ],
            needsClarification: []
          })
        })
      }
    };

    const parser = createOpenAiParser(client as never, "gpt-5.4-nano");
    const result = await parser.parseMessage({
      text: "на альфабанк вероники 804000 руб",
      context: {
        todayIso: "2026-06-03",
        timezone: "Europe/Moscow",
        knownDebts: [],
        knownStoragePlaces: []
      }
    });

    expect(result.actions[0].type).toBe("create_storage_place");
  });
});
```

- [ ] **Step 2: Implement adapter**

Create `apps/finance-app/src/server/ai/openai-adapter.ts`:

```ts
import OpenAI from "openai";
import { parseAiJson } from "./parser";
import type { AiParser, AiParserContext } from "./parser";

type ResponsesClient = {
  responses: {
    create(input: unknown): Promise<{ output_text?: string }>;
  };
};

export function getOpenAiClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for AI parsing");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export function createOpenAiParser(client: ResponsesClient, model: string): AiParser {
  return {
    async parseMessage(input: { text: string; context: AiParserContext }) {
      const response = await client.responses.create({
        model,
        input: [
          {
            role: "system",
            content:
              "Ты строгий парсер личных финансов. Верни только JSON: confidence, summary, actions, needsClarification. Не сохраняй данные сам."
          },
          {
            role: "user",
            content: JSON.stringify(input)
          }
        ]
      });
      if (!response.output_text) {
        throw new Error("OpenAI response did not include output_text");
      }
      return parseAiJson(JSON.parse(response.output_text));
    }
  };
}
```

- [ ] **Step 3: Write and implement voice transcription adapter**

Create `apps/finance-app/tests/ai/transcription.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { transcribeAudioFile } from "@/server/ai/transcription";

describe("transcribeAudioFile", () => {
  it("returns trimmed transcription text from injected client", async () => {
    const client = {
      audio: {
        transcriptions: {
          create: vi.fn().mockResolvedValue({ text: "  Геворг вернул 10000  " })
        }
      }
    };
    const file = new File(["voice"], "voice.ogg", { type: "audio/ogg" });

    const text = await transcribeAudioFile(client as never, {
      file,
      model: "gpt-4o-mini-transcribe",
      language: "ru"
    });

    expect(text).toBe("Геворг вернул 10000");
  });
});
```

Create `apps/finance-app/src/server/ai/transcription.ts`:

```ts
type TranscriptionClient = {
  audio: {
    transcriptions: {
      create(input: {
        file: File;
        model: string;
        language?: string;
      }): Promise<{ text?: string }>;
    };
  };
};

export async function transcribeAudioFile(
  client: TranscriptionClient,
  input: { file: File; model: string; language?: string }
) {
  const response = await client.audio.transcriptions.create(input);
  const text = response.text?.trim();
  if (!text) {
    throw new Error("Transcription response did not include text");
  }
  return text;
}
```

- [ ] **Step 4: Add parse-message route**

Create `apps/finance-app/src/app/api/parse-message/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { getLocalOwner } from "@/server/auth/local-owner";
import { createAiDraft } from "@/server/services/draft-service";
import { createOpenAiParser, getOpenAiClient } from "@/server/ai/openai-adapter";

export const ParseMessageRequestSchema = z.object({
  text: z.string().min(1),
  source: z.enum(["telegram_text", "telegram_voice", "web_text", "web_form"]).default("web_text"),
  transcript: z.string().optional()
});

export async function POST(request: Request) {
  const owner = await getLocalOwner();
  const body = ParseMessageRequestSchema.parse(await request.json());
  const [debts, storagePlaces] = await Promise.all([
    prisma.debt.findMany({ where: { ownerId: owner.id } }),
    prisma.storagePlace.findMany({ where: { ownerId: owner.id } })
  ]);
  const parser = createOpenAiParser(getOpenAiClient(), process.env.OPENAI_PARSE_MODEL ?? "gpt-5.4-nano");
  const parseResult = await parser.parseMessage({
    text: body.text,
    context: {
      todayIso: new Date().toISOString().slice(0, 10),
      timezone: "Europe/Moscow",
      knownDebts: debts.map((debt) => ({
        id: debt.id,
        partyName: debt.partyName,
        remainingAmount: Number(debt.remainingAmount),
        asset: debt.asset
      })),
      knownStoragePlaces: storagePlaces.map((place) => ({
        id: place.id,
        name: place.name,
        amount: Number(place.amount),
        asset: place.asset
      }))
    }
  });
  const draft = await createAiDraft(prisma, {
    ownerId: owner.id,
    source: body.source,
    rawText: body.text,
    transcript: body.transcript,
    parseResult
  });
  return NextResponse.json(draft, { status: 201 });
}
```

- [ ] **Step 5: Add parse-message route test**

Create `apps/finance-app/tests/api/parse-message-route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ParseMessageRequestSchema } from "@/app/api/parse-message/route";

describe("ParseMessageRequestSchema", () => {
  it("accepts text and voice sources", () => {
    expect(ParseMessageRequestSchema.parse({ text: "Геворг вернул 10000", source: "telegram_text" }).source).toBe("telegram_text");
    expect(
      ParseMessageRequestSchema.parse({
        text: "Геворг вернул 10000",
        source: "telegram_voice",
        transcript: "Геворг вернул 10000"
      }).source
    ).toBe("telegram_voice");
  });
});
```

Modify `apps/finance-app/src/app/api/parse-message/route.ts` so the request schema is exported:

```ts
export const ParseMessageRequestSchema = z.object({
  text: z.string().min(1),
  source: z.enum(["telegram_text", "telegram_voice", "web_text", "web_form"]).default("web_text"),
  transcript: z.string().optional()
});
```

- [ ] **Step 6: Run checks and commit**

Run:

```bash
cd apps/finance-app
npm test
npm run typecheck
```

Expected:

```text
OpenAI adapter and transcription tests pass with fake clients
typecheck exits 0
```

Commit:

```bash
git add apps/finance-app
git commit -m "feat: add OpenAI AI parser adapter"
```

---

## Task 9: Telegram Auth And Bot Webhook

**Files:**
- Create: `apps/finance-app/src/server/auth/telegram.ts`
- Create: `apps/finance-app/src/server/telegram/bot.ts`
- Create: `apps/finance-app/src/server/telegram/client.ts`
- Create: `apps/finance-app/src/server/telegram/voice.ts`
- Create: `apps/finance-app/src/app/api/telegram/webhook/route.ts`
- Create: `apps/finance-app/tests/server/telegram-auth.test.ts`
- Create: `apps/finance-app/tests/server/telegram-bot.test.ts`
- Create: `apps/finance-app/tests/server/telegram-client.test.ts`
- Create: `apps/finance-app/tests/server/telegram-voice.test.ts`
- Modify: `apps/finance-app/.env.example`

- [ ] **Step 1: Write Telegram Mini App auth test**

Create `apps/finance-app/tests/server/telegram-auth.test.ts`:

```ts
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTelegramInitData } from "@/server/auth/telegram";

function signInitData(data: Record<string, string>, botToken: string) {
  const pairs = Object.entries(data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secret).update(pairs).digest("hex");
  return new URLSearchParams({ ...data, hash }).toString();
}

describe("verifyTelegramInitData", () => {
  it("verifies signed Telegram init data", () => {
    const botToken = "test-token";
    const initData = signInitData(
      {
        auth_date: "1780440000",
        user: JSON.stringify({ id: 123, first_name: "Hrach" })
      },
      botToken
    );

    const result = verifyTelegramInitData(initData, botToken);
    expect(result.user.id).toBe(123);
  });
});
```

- [ ] **Step 2: Implement Telegram auth helper**

Create `apps/finance-app/src/server/auth/telegram.ts`:

```ts
import crypto from "node:crypto";
import { z } from "zod";

const TelegramUserSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional()
});

export function verifyTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("Telegram init data is missing hash");
  }
  params.delete("hash");

  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(checkString).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) {
    throw new Error("Telegram init data hash mismatch");
  }

  const userJson = params.get("user");
  if (!userJson) {
    throw new Error("Telegram init data is missing user");
  }
  return { user: TelegramUserSchema.parse(JSON.parse(userJson)) };
}
```

- [ ] **Step 3: Write bot handler test**

Create `apps/finance-app/tests/server/telegram-bot.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { handleTelegramTextMessage } from "@/server/telegram/bot";

describe("handleTelegramTextMessage", () => {
  it("creates a draft and returns confirmation text", async () => {
    const createDraftFromText = vi.fn().mockResolvedValue({
      id: "draft-1",
      parsedActions: {
        summary: "Создать долг Геворга на 50 000 RUB."
      }
    });

    const response = await handleTelegramTextMessage({
      text: "Геворг должен 50000",
      telegramUserId: "123",
      createDraftFromText
    });

    expect(response.text).toContain("Черновик");
    expect(response.buttons[0].text).toBe("Сохранить");
  });
});
```

- [ ] **Step 4: Implement bot module**

Create `apps/finance-app/src/server/telegram/bot.ts`:

```ts
type DraftResult = {
  id: string;
  parsedActions: unknown;
};

export async function handleTelegramTextMessage(input: {
  text: string;
  telegramUserId: string;
  createDraftFromText: (text: string, telegramUserId: string) => Promise<DraftResult>;
}) {
  const draft = await input.createDraftFromText(input.text, input.telegramUserId);
  const parsed = draft.parsedActions as { summary?: string };
  return {
    text: `Черновик: ${parsed.summary ?? "проверь действие перед сохранением"}`,
    buttons: [
      { text: "Сохранить", callbackData: `draft:${draft.id}:confirm` },
      { text: "Исправить", callbackData: `draft:${draft.id}:edit` },
      { text: "Отмена", callbackData: `draft:${draft.id}:reject` }
    ]
  };
}
```

- [ ] **Step 5: Write and implement Telegram send client**

Create `apps/finance-app/tests/server/telegram-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { sendTelegramMessage } from "@/server/telegram/client";

describe("sendTelegramMessage", () => {
  it("posts message and inline buttons to Telegram API", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true })
    });

    await sendTelegramMessage({
      fetcher,
      botToken: "token",
      chatId: 123,
      text: "Черновик",
      buttons: [{ text: "Сохранить", callbackData: "draft:1:confirm" }]
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.telegram.org/bottoken/sendMessage",
      expect.objectContaining({ method: "POST" })
    );
  });
});
```

Create `apps/finance-app/src/server/telegram/client.ts`:

```ts
type TelegramButton = {
  text: string;
  callbackData: string;
};

export async function sendTelegramMessage(input: {
  fetcher: typeof fetch;
  botToken: string;
  chatId: number;
  text: string;
  buttons: TelegramButton[];
}) {
  const response = await input.fetcher(`https://api.telegram.org/bot${input.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: input.chatId,
      text: input.text,
      reply_markup: {
        inline_keyboard: [
          input.buttons.map((button) => ({
            text: button.text,
            callback_data: button.callbackData
          }))
        ]
      }
    })
  });
  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with HTTP ${response.status}`);
  }
}
```

- [ ] **Step 6: Write and implement Telegram voice downloader**

Create `apps/finance-app/tests/server/telegram-voice.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { downloadTelegramVoiceFile } from "@/server/telegram/voice";

describe("downloadTelegramVoiceFile", () => {
  it("resolves Telegram file path and returns a File", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ ok: true, result: { file_path: "voice/file.ogg" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4))
      });

    const file = await downloadTelegramVoiceFile({ fetcher, botToken: "token", fileId: "file-id" });

    expect(file.name).toBe("telegram-voice.ogg");
    expect(file.type).toBe("audio/ogg");
  });
});
```

Create `apps/finance-app/src/server/telegram/voice.ts`:

```ts
export async function downloadTelegramVoiceFile(input: {
  fetcher: typeof fetch;
  botToken: string;
  fileId: string;
}) {
  const fileResponse = await input.fetcher(
    `https://api.telegram.org/bot${input.botToken}/getFile?file_id=${encodeURIComponent(input.fileId)}`
  );
  if (!fileResponse.ok) {
    throw new Error(`Telegram getFile failed with HTTP ${fileResponse.status}`);
  }
  const fileJson = (await fileResponse.json()) as { ok: boolean; result?: { file_path?: string } };
  const filePath = fileJson.result?.file_path;
  if (!fileJson.ok || !filePath) {
    throw new Error("Telegram getFile response did not include file_path");
  }

  const downloadResponse = await input.fetcher(`https://api.telegram.org/file/bot${input.botToken}/${filePath}`);
  if (!downloadResponse.ok) {
    throw new Error(`Telegram voice download failed with HTTP ${downloadResponse.status}`);
  }
  const bytes = await downloadResponse.arrayBuffer();
  return new File([bytes], "telegram-voice.ogg", { type: "audio/ogg" });
}
```

- [ ] **Step 7: Create webhook route**

Create `apps/finance-app/src/app/api/telegram/webhook/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getOpenAiClient } from "@/server/ai/openai-adapter";
import { transcribeAudioFile } from "@/server/ai/transcription";
import { handleTelegramTextMessage } from "@/server/telegram/bot";
import { sendTelegramMessage } from "@/server/telegram/client";
import { downloadTelegramVoiceFile } from "@/server/telegram/voice";

export async function POST(request: Request) {
  const update = await request.json();

  if (update.message?.text) {
    const chatId = update.message.chat.id;
    const telegramUserId = String(update.message.from.id);
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new Error("TELEGRAM_BOT_TOKEN is required");
    }

    const botResponse = await handleTelegramTextMessage({
      text: update.message.text,
      telegramUserId,
      createDraftFromText: async (text) => {
        const parseResponse = await fetch(new URL("/api/parse-message", request.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, source: "telegram_text" })
        });
        if (!parseResponse.ok) {
          throw new Error(`parse-message failed with HTTP ${parseResponse.status}`);
        }
        return parseResponse.json();
      }
    });

    await sendTelegramMessage({
      fetcher: fetch,
      botToken,
      chatId,
      text: botResponse.text,
      buttons: botResponse.buttons
    });

    return NextResponse.json({ ok: true, handled: "text" });
  }

  if (update.message?.voice) {
    const chatId = update.message.chat.id;
    const telegramUserId = String(update.message.from.id);
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new Error("TELEGRAM_BOT_TOKEN is required");
    }
    const voiceFile = await downloadTelegramVoiceFile({
      fetcher: fetch,
      botToken,
      fileId: update.message.voice.file_id
    });
    const transcript = await transcribeAudioFile(getOpenAiClient(), {
      file: voiceFile,
      model: process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
      language: "ru"
    });

    const parseResponse = await fetch(new URL("/api/parse-message", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: transcript, transcript, source: "telegram_voice" })
    });
    if (!parseResponse.ok) {
      throw new Error(`parse-message failed with HTTP ${parseResponse.status}`);
    }
    const draft = await parseResponse.json();
    const parsed = draft.parsedActions as { summary?: string };

    await sendTelegramMessage({
      fetcher: fetch,
      botToken,
      chatId,
      text: `Черновик: ${parsed.summary ?? transcript}`,
      buttons: [
        { text: "Сохранить", callbackData: `draft:${draft.id}:confirm` },
        { text: "Исправить", callbackData: `draft:${draft.id}:edit` },
        { text: "Отмена", callbackData: `draft:${draft.id}:reject` }
      ]
    });

    return NextResponse.json({ ok: true, handled: "voice", telegramUserId });
  }

  if (!update.callback_query) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  return NextResponse.json({
    ok: true,
    handled: "callback",
    callbackData: update.callback_query.data
  });
}
```

Update `apps/finance-app/.env.example`:

```env
TELEGRAM_WEBHOOK_SECRET=""
TELEGRAM_ALLOWED_USER_ID="123456789"
```

- [ ] **Step 8: Run checks and commit**

Run:

```bash
cd apps/finance-app
npm test
npm run typecheck
```

Expected:

```text
Telegram auth and bot tests pass
typecheck exits 0
```

Commit:

```bash
git add apps/finance-app
git commit -m "feat: add Telegram auth and bot webhook boundary"
```

---

## Task 10: Mobile PWA Interface

**Files:**
- Create: `apps/finance-app/src/app/layout.tsx`
- Create: `apps/finance-app/src/app/globals.css`
- Modify: `apps/finance-app/src/app/page.tsx`
- Create: `apps/finance-app/src/app/storage/page.tsx`
- Create: `apps/finance-app/src/app/debts/page.tsx`
- Create: `apps/finance-app/src/app/drafts/page.tsx`
- Create: `apps/finance-app/src/components/AppShell.tsx`
- Create: `apps/finance-app/src/components/SummaryCard.tsx`
- Create: `apps/finance-app/src/components/QuickAddPanel.tsx`
- Create: `apps/finance-app/src/components/DraftCard.tsx`
- Create: `apps/finance-app/tests/ui/formatting.test.ts`

- [ ] **Step 1: Add UI formatting test**

Create `apps/finance-app/tests/ui/formatting.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatMoney } from "@/domain/money";

describe("UI formatting", () => {
  it("renders ruble and USDT balances compactly", () => {
    expect(formatMoney(1784000, "RUB")).toBe("1 784 000 RUB");
    expect(formatMoney(8431, "USDT")).toBe("8 431 USDT");
  });
});
```

- [ ] **Step 2: Add layout and global CSS**

Create `apps/finance-app/src/app/layout.tsx`:

```tsx
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Финансы",
  description: "Личная финансовая система"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
```

Create `apps/finance-app/src/app/globals.css`:

```css
:root {
  color-scheme: light;
  --bg: #f7f8fa;
  --panel: #ffffff;
  --text: #1e2329;
  --muted: #667085;
  --line: #d9dee7;
  --accent: #176b87;
  --danger: #b42318;
  --warn: #b54708;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

a {
  color: inherit;
  text-decoration: none;
}

button,
input,
select,
textarea {
  font: inherit;
}

.shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.topbar,
.bottomnav {
  background: var(--panel);
  border-bottom: 1px solid var(--line);
  padding: 12px 16px;
}

.bottomnav {
  border-top: 1px solid var(--line);
  border-bottom: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  position: sticky;
  bottom: 0;
}

.content {
  width: min(100%, 920px);
  margin: 0 auto;
  padding: 16px;
}

.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px;
}

.grid {
  display: grid;
  gap: 12px;
}

.metric {
  font-size: 24px;
  font-weight: 700;
}

.muted {
  color: var(--muted);
}
```

- [ ] **Step 3: Add shell and cards**

Create `apps/finance-app/src/components/AppShell.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <strong>Финансы</strong>
      </header>
      <main className="content">{children}</main>
      <nav className="bottomnav" aria-label="Основная навигация">
        <Link href="/">Главная</Link>
        <Link href="/storage">Хранение</Link>
        <Link href="/debts">Долги</Link>
        <Link href="/drafts">Черновики</Link>
      </nav>
    </div>
  );
}
```

Create `apps/finance-app/src/components/SummaryCard.tsx`:

```tsx
export function SummaryCard({
  title,
  value,
  subtitle
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <section className="card">
      <div className="muted">{title}</div>
      <div className="metric">{value}</div>
      {subtitle ? <div className="muted">{subtitle}</div> : null}
    </section>
  );
}
```

Create `apps/finance-app/src/components/QuickAddPanel.tsx`:

```tsx
export function QuickAddPanel() {
  return (
    <section className="card grid">
      <strong>Быстро добавить</strong>
      <button type="button">Долг</button>
      <button type="button">Оплату</button>
      <button type="button">Место хранения</button>
      <button type="button">AI-черновик</button>
    </section>
  );
}
```

Create `apps/finance-app/src/components/DraftCard.tsx`:

```tsx
export function DraftCard({ summary }: { summary: string }) {
  return (
    <article className="card grid">
      <strong>Черновик</strong>
      <p>{summary}</p>
      <div>
        <button type="button">Сохранить</button>{" "}
        <button type="button">Исправить</button>{" "}
        <button type="button">Отмена</button>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Replace pages**

Modify `apps/finance-app/src/app/page.tsx`:

```tsx
import { AppShell } from "@/components/AppShell";
import { QuickAddPanel } from "@/components/QuickAddPanel";
import { SummaryCard } from "@/components/SummaryCard";

export default function HomePage() {
  return (
    <AppShell>
      <div className="grid">
        <SummaryCard title="RUB" value="Пока нет данных" subtitle="Будет считаться из мест хранения" />
        <SummaryCard title="USDT" value="Пока нет данных" subtitle="Bybit и MetaMask попадут сюда" />
        <SummaryCard title="Ближайшие платежи" value="0" subtitle="Степан, Даша и Грно после импорта" />
        <QuickAddPanel />
      </div>
    </AppShell>
  );
}
```

Create `apps/finance-app/src/app/storage/page.tsx`:

```tsx
import { AppShell } from "@/components/AppShell";

export default function StoragePage() {
  return (
    <AppShell>
      <section className="card">
        <h1>Места хранения</h1>
        <p className="muted">Банки, накопительные счета, крипта и доверенное хранение.</p>
      </section>
    </AppShell>
  );
}
```

Create `apps/finance-app/src/app/debts/page.tsx`:

```tsx
import { AppShell } from "@/components/AppShell";

export default function DebtsPage() {
  return (
    <AppShell>
      <section className="card">
        <h1>Долги</h1>
        <p className="muted">Личные долги и рабочая дебиторка в одном списке с разными типами.</p>
      </section>
    </AppShell>
  );
}
```

Create `apps/finance-app/src/app/drafts/page.tsx`:

```tsx
import { AppShell } from "@/components/AppShell";
import { DraftCard } from "@/components/DraftCard";

export default function DraftsPage() {
  return (
    <AppShell>
      <div className="grid">
        <DraftCard summary="Здесь появятся AI-черновики из Telegram и приложения." />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 5: Run UI checks and commit**

Run:

```bash
cd apps/finance-app
npm test
npm run typecheck
npm run build
```

Expected:

```text
tests pass
typecheck exits 0
Next build succeeds
```

Commit:

```bash
git add apps/finance-app
git commit -m "feat: add mobile finance app UI shell"
```

---

## Task 11: Import Current Data And Export Snapshot

Implementation note: review hardening keeps displayed percent values as `7` and `6.5`, makes current import idempotent through owner-scoped unique constraints, uses Moscow-local import dates, and rejects non-date-only payment strings during snapshot export.

**Files:**
- Create: `apps/finance-app/src/server/import/current-finance-seed.ts`
- Create: `apps/finance-app/src/server/export/snapshot.ts`
- Create: `apps/finance-app/src/app/api/import/current/route.ts`
- Create: `apps/finance-app/src/app/api/export/snapshot/route.ts`
- Create: `apps/finance-app/tests/import/current-finance-seed.test.ts`
- Create: `apps/finance-app/tests/export/snapshot.test.ts`

- [x] **Step 1: Write import seed tests**

Create `apps/finance-app/tests/import/current-finance-seed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCurrentFinanceSeed } from "@/server/import/current-finance-seed";

describe("buildCurrentFinanceSeed", () => {
  it("contains current real storage and debt examples", () => {
    const seed = buildCurrentFinanceSeed("2026-06-03");
    expect(seed.storagePlaces.some((place) => place.name === "Альфабанк Вероники" && place.amount === 804000)).toBe(true);
    expect(seed.debts.some((debt) => debt.partyName === "Геворг" && debt.originalAmount === 50000)).toBe(true);
    expect(seed.debts.some((debt) => debt.partyName === "Степан Гаврилюк" && debt.nextPaymentDate === "2026-06-03")).toBe(true);
  });
});
```

- [x] **Step 2: Implement current seed builder**

Create `apps/finance-app/src/server/import/current-finance-seed.ts`:

```ts
export function buildCurrentFinanceSeed(todayIso: string) {
  return {
    importedAt: todayIso,
    storagePlaces: [
      { name: "Тбанк накопительный счет", type: "income_bank_product", subtype: "savings_account", holderContext: "мой Тбанк", asset: "RUB", amount: 980000, amountKind: "exact", availability: "immediate", rate: 0.07, interestPaymentDay: 5, status: "active", attentionPriority: "medium", comment: "7%, выплата каждого 5-го числа." },
      { name: "Тбанк инвестиции", type: "investment", subtype: "brokerage", holderContext: "мой Тбанк", asset: "RUB", amount: 15000, amountKind: "exact", availability: "restricted", status: "active", attentionPriority: "low", comment: "Инвестиции в Тбанк." },
      { name: "Сбер накопительный счет", type: "income_bank_product", subtype: "savings_account", holderContext: "мой Сбер", asset: "RUB", amount: 680000, amountKind: "exact", availability: "immediate", rate: 0.065, interestPaymentDay: 19, status: "active", attentionPriority: "medium", comment: "6.5%, выплата каждого 19-го числа." },
      { name: "ВТБ счет", type: "bank_account", subtype: "card_account", holderContext: "мой ВТБ", asset: "RUB", amount: 268187, amountKind: "exact", availability: "immediate", status: "active", attentionPriority: "low", comment: "Без процентов." },
      { name: "Bybit", type: "crypto_exchange", subtype: "not_applicable", holderContext: "мой Bybit", asset: "USDT", amount: 7331, amountKind: "equivalent", availability: "restricted", status: "active", attentionPriority: "high", comment: "USDT в эквиваленте." },
      { name: "MetaMask ETH-позиция", type: "crypto_wallet", subtype: "wallet", holderContext: "мой MetaMask", asset: "USDT", amount: 1000, amountKind: "equivalent", availability: "restricted", status: "active", attentionPriority: "high", comment: "ETH-позиция, записана как USDT-эквивалент." },
      { name: "MetaMask USDT", type: "crypto_wallet", subtype: "wallet", holderContext: "мой MetaMask", asset: "USDT", amount: 100, amountKind: "exact", availability: "restricted", status: "active", attentionPriority: "high", comment: "USDT в MetaMask." },
      { name: "Альфабанк Вероники", type: "trusted_person", subtype: "not_applicable", holderContext: "Вероника", asset: "RUB", amount: 804000, amountKind: "exact", availability: "restricted", status: "check", attentionPriority: "high", comment: "Мои деньги на Альфабанк Вероники." }
    ],
    debts: [
      { partyName: "Степан Гаврилюк", type: "work_receivable", basis: "дипломная работа", asset: "RUB", originalAmount: 25000, status: "scheduled", nextPaymentAmount: 25000, nextPaymentDate: "2026-06-03", attentionPriority: "urgent", comment: "Клиент. Оплата до 3 июня 2026." },
      { partyName: "Геворг", type: "personal_debt", basis: "личный долг другу", asset: "RUB", originalAmount: 50000, status: "no_agreement", attentionPriority: "medium", comment: "Срок оплаты не согласован." },
      { partyName: "Даша Зайцева", type: "work_receivable", basis: "помощь по электричеству", asset: "RUB", originalAmount: 1500, status: "scheduled", nextPaymentAmount: 1500, nextPaymentDate: "2026-06-12", attentionPriority: "medium", comment: "Оплата до 12 июня 2026." },
      { partyName: "Грно", type: "personal_debt", basis: "личный долг другу", asset: "RUB", originalAmount: 15000, status: "scheduled", nextPaymentAmount: 15000, nextPaymentDate: "2026-06-30", attentionPriority: "medium", comment: "Дедлайн до конца месяца." }
    ]
  };
}
```

- [x] **Step 3: Write export snapshot test**

Create `apps/finance-app/tests/export/snapshot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildExportSnapshot } from "@/server/export/snapshot";

describe("buildExportSnapshot", () => {
  it("returns Google-Sheets-ready named tables", () => {
    const snapshot = buildExportSnapshot({
      storagePlaces: [{ name: "ВТБ счет", asset: "RUB", amount: 268187 }],
      debts: [{ partyName: "Геворг", asset: "RUB", remainingAmount: 50000 }],
      payments: []
    });

    expect(snapshot["02 Места хранения"][0]).toEqual(["Название места", "Валюта/актив", "Текущая сумма"]);
    expect(snapshot["03 Долги"][1]).toEqual(["Геворг", "RUB", 50000]);
  });
});
```

- [x] **Step 4: Implement export snapshot**

Create `apps/finance-app/src/server/export/snapshot.ts`:

```ts
export function buildExportSnapshot(input: {
  storagePlaces: Array<{ name: string; asset: string; amount: unknown }>;
  debts: Array<{ partyName: string; asset: string; remainingAmount: unknown }>;
  payments: Array<{ paymentDate: Date | string; amount: unknown; asset: string; status: string }>;
}) {
  return {
    "02 Места хранения": [
      ["Название места", "Валюта/актив", "Текущая сумма"],
      ...input.storagePlaces.map((place) => [place.name, place.asset, Number(place.amount)])
    ],
    "03 Долги": [
      ["Должник/клиент", "Валюта/актив", "Текущий остаток"],
      ...input.debts.map((debt) => [debt.partyName, debt.asset, Number(debt.remainingAmount)])
    ],
    "04 График и оплаты": [
      ["Дата платежа", "Сумма", "Валюта/актив", "Статус"],
      ...input.payments.map((payment) => [
        payment.paymentDate instanceof Date ? payment.paymentDate.toISOString().slice(0, 10) : payment.paymentDate,
        Number(payment.amount),
        payment.asset,
        payment.status
      ])
    ]
  };
}
```

- [x] **Step 5: Add import/export routes**

Create `apps/finance-app/src/app/api/import/current/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getLocalOwner } from "@/server/auth/local-owner";
import { prisma } from "@/server/db";
import { buildCurrentFinanceSeed } from "@/server/import/current-finance-seed";
import { createStoragePlace } from "@/server/services/storage-service";
import { createDebtWithOptionalPlan } from "@/server/services/debt-service";

export async function POST() {
  const owner = await getLocalOwner();
  const seed = buildCurrentFinanceSeed(new Date().toISOString().slice(0, 10));

  for (const place of seed.storagePlaces) {
    await createStoragePlace(prisma, {
      ...place,
      ownerId: owner.id,
      actor: "import:current-finance-seed",
      source: "import"
    } as never);
  }

  for (const debt of seed.debts) {
    await createDebtWithOptionalPlan(prisma, {
      ...debt,
      ownerId: owner.id,
      actor: "import:current-finance-seed",
      source: "import",
      nextPaymentDate: debt.nextPaymentDate ? new Date(`${debt.nextPaymentDate}T00:00:00.000Z`) : undefined
    } as never);
  }

  return NextResponse.json({
    importedStoragePlaces: seed.storagePlaces.length,
    importedDebts: seed.debts.length
  });
}
```

Create `apps/finance-app/src/app/api/export/snapshot/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getLocalOwner } from "@/server/auth/local-owner";
import { prisma } from "@/server/db";
import { buildExportSnapshot } from "@/server/export/snapshot";

export async function GET() {
  const owner = await getLocalOwner();
  const [storagePlaces, debts, payments] = await Promise.all([
    prisma.storagePlace.findMany({ where: { ownerId: owner.id } }),
    prisma.debt.findMany({ where: { ownerId: owner.id } }),
    prisma.debtPayment.findMany({ where: { ownerId: owner.id } })
  ]);
  return NextResponse.json(buildExportSnapshot({ storagePlaces, debts, payments }));
}
```

- [x] **Step 6: Run checks and commit**

Run:

```bash
cd apps/finance-app
npm test
npm run typecheck
```

Expected:

```text
import/export tests pass
typecheck exits 0
```

Commit:

```bash
git add apps/finance-app
git commit -m "feat: add current data import and export snapshot"
```

---

## Task 12: Google Sheets Export Adapter

**Files:**
- Create: `apps/finance-app/src/server/export/google-sheets.ts`
- Create: `apps/finance-app/src/app/api/export/google-sheets/route.ts`
- Create: `apps/finance-app/tests/export/google-sheets.test.ts`
- Modify: `apps/finance-app/.env.example`

- [x] **Step 1: Write Google Sheets adapter test**

Create `apps/finance-app/tests/export/google-sheets.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createGoogleSheetsExportClient } from "@/server/export/google-sheets";

describe("createGoogleSheetsExportClient", () => {
  it("creates spreadsheet and writes named tables", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          spreadsheetId: "sheet-1",
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ totalUpdatedCells: 6 })
      });

    const client = createGoogleSheetsExportClient({
      accessToken: "token",
      fetcher
    });

    const result = await client.exportTables({
      title: "Финансы export",
      tables: {
        "02 Места хранения": [["Название места"], ["ВТБ счет"]],
        "03 Долги": [["Должник"], ["Геворг"]]
      }
    });

    expect(result.spreadsheetUrl).toBe("https://docs.google.com/spreadsheets/d/sheet-1/edit");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
```

- [x] **Step 2: Implement Google Sheets adapter**

Create `apps/finance-app/src/server/export/google-sheets.ts`:

```ts
type CellValue = string | number | boolean | null;
type ExportTables = Record<string, CellValue[][]>;

export function createGoogleSheetsExportClient(input: {
  accessToken: string;
  fetcher: typeof fetch;
}) {
  return {
    async exportTables(args: { title: string; tables: ExportTables }) {
      const sheetTitles = Object.keys(args.tables);
      const createResponse = await input.fetcher("https://sheets.googleapis.com/v4/spreadsheets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          properties: { title: args.title },
          sheets: sheetTitles.map((title) => ({ properties: { title } }))
        })
      });
      if (!createResponse.ok) {
        throw new Error(`Google Sheets create failed with HTTP ${createResponse.status}`);
      }

      const created = (await createResponse.json()) as {
        spreadsheetId: string;
        spreadsheetUrl: string;
      };

      const valuesResponse = await input.fetcher(
        `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}/values:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            valueInputOption: "USER_ENTERED",
            data: Object.entries(args.tables).map(([sheetName, values]) => ({
              range: `'${sheetName.replace(/'/g, "''")}'!A1`,
              majorDimension: "ROWS",
              values
            }))
          })
        }
      );
      if (!valuesResponse.ok) {
        throw new Error(`Google Sheets values update failed with HTTP ${valuesResponse.status}`);
      }

      return {
        spreadsheetId: created.spreadsheetId,
        spreadsheetUrl: created.spreadsheetUrl
      };
    }
  };
}
```

- [x] **Step 3: Add Google Sheets export route**

Create `apps/finance-app/src/app/api/export/google-sheets/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getLocalOwner } from "@/server/auth/local-owner";
import { prisma } from "@/server/db";
import { buildExportSnapshot } from "@/server/export/snapshot";
import { createGoogleSheetsExportClient } from "@/server/export/google-sheets";

export async function POST() {
  const accessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "GOOGLE_OAUTH_ACCESS_TOKEN is required for Google Sheets export" },
      { status: 503 }
    );
  }

  const owner = await getLocalOwner();
  const [storagePlaces, debts, payments] = await Promise.all([
    prisma.storagePlace.findMany({ where: { ownerId: owner.id } }),
    prisma.debt.findMany({ where: { ownerId: owner.id } }),
    prisma.debtPayment.findMany({ where: { ownerId: owner.id } })
  ]);
  const tables = buildExportSnapshot({ storagePlaces, debts, payments });
  const client = createGoogleSheetsExportClient({ accessToken, fetcher: fetch });
  const exportResult = await client.exportTables({
    title: `Финансы export ${new Date().toISOString().slice(0, 10)}`,
    tables
  });

  await prisma.exportJob.create({
    data: {
      ownerId: owner.id,
      target: "google_sheets",
      status: "finished",
      finishedAt: new Date(),
      spreadsheetUrl: exportResult.spreadsheetUrl
    }
  });

  return NextResponse.json(exportResult);
}
```

- [x] **Step 4: Update env example**

Append to `apps/finance-app/.env.example`:

```env
GOOGLE_OAUTH_ACCESS_TOKEN=""
```

- [x] **Step 5: Run checks and commit**

Run:

```bash
cd apps/finance-app
npm test
npm run typecheck
```

Expected:

```text
Google Sheets export adapter test passes with fake fetch
typecheck exits 0
```

Commit:

```bash
git add apps/finance-app
git commit -m "feat: add Google Sheets export adapter"
```

---

## Task 13: Local Runbook, Verification, And Visual Smoke Test

**Files:**
- Create: `apps/finance-app/README.md`
- Modify: `docs/finance-system-user-guide.md`
- Create: `apps/finance-app/tests/readme-smoke.test.ts`

- [x] **Step 1: Write README smoke test**

Create `apps/finance-app/tests/readme-smoke.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("README", () => {
  it("documents local setup, env, import, and export", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("npm install");
    expect(readme).toContain("DATABASE_URL");
    expect(readme).toContain("/api/import/current");
    expect(readme).toContain("/api/export/snapshot");
    expect(readme).toContain("/api/export/google-sheets");
  });
});
```

- [x] **Step 2: Create README**

Create `apps/finance-app/README.md`:

```md
# Finance App

Локальный MVP личной финансовой системы.

## Запуск

```bash
npm install
cp .env.example .env.local
npm run prisma:generate
npm run db:migrate -- --name init
npm run dev
```

Открыть: http://localhost:3000

## Переменные окружения

- `DATABASE_URL` - локальная SQLite база, например `file:./dev.db`.
- `OWNER_TELEGRAM_USER_ID` - Telegram ID владельца.
- `OWNER_DISPLAY_NAME` - отображаемое имя владельца.
- `TELEGRAM_BOT_TOKEN` - токен бота.
- `OPENAI_API_KEY` - ключ OpenAI API для разбора текста и голоса.
- `GOOGLE_OAUTH_ACCESS_TOKEN` - OAuth access token для создания Google Sheets export.
- `APP_BASE_URL` - публичный или локальный URL приложения.

## Импорт текущих данных

```bash
curl -X POST http://localhost:3000/api/import/current
```

Импорт добавляет текущие известные места хранения и долги в базу через audited services.

## Экспорт снимка

```bash
curl http://localhost:3000/api/export/snapshot
```

Экспорт возвращает JSON с таблицами, готовыми для выгрузки в Google Sheets.

## Экспорт в Google Sheets

```bash
curl -X POST http://localhost:3000/api/export/google-sheets
```

Для этого нужен `GOOGLE_OAUTH_ACCESS_TOKEN`.

## Правила безопасности

Не хранить seed phrases, приватные ключи, пароли, полные номера карт и полные номера счетов.
AI создает только черновики. Запись в базу происходит после подтверждения.
```
```

- [x] **Step 3: Add user-guide bridge note**

Append to `docs/finance-system-user-guide.md`:

```md
## Переход к приложению

После запуска отдельного приложения база данных приложения становится источником правды. Google Sheets используется как экспорт и резервная копия по кнопке. Не редактируйте экспортированную таблицу как главный источник данных, если приложение уже запущено.
```

- [x] **Step 4: Run full local verification**

Run:

```bash
cd apps/finance-app
npm test
npm run typecheck
npm run build
npm run dev
```

Expected:

```text
tests pass
typecheck exits 0
Next build succeeds
dev server starts on http://localhost:3000
```

Open `http://localhost:3000` in the in-app browser. Verify:

- first screen loads;
- bottom navigation links work;
- text does not overlap on mobile viewport;
- storage/debts/drafts pages render;
- the app is not a landing page.

- [x] **Step 5: Stop dev server and commit**

Stop the dev server with `Ctrl-C`.

Commit:

```bash
git add apps/finance-app docs/finance-system-user-guide.md
git commit -m "docs: add finance app runbook"
```

---

## Task 14: Final Integration Review

**Files:**
- Modify only files required to fix issues found during verification.

- [x] **Step 1: Run repository-level tests**

Run existing spreadsheet tests:

```bash
/Users/hrach/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest discover -s tests
```

Expected:

```text
27 tests OK
```

Run app checks:

```bash
cd apps/finance-app
npm test
npm run typecheck
npm run build
```

Expected:

```text
all app tests pass
typecheck exits 0
Next build succeeds
```

- [x] **Step 2: Verify Git cleanliness**

Run:

```bash
git status --short
```

Expected:

```text
no output
```

If there are expected final edits, commit them:

```bash
git add <changed-files>
git commit -m "chore: finalize finance app MVP"
```

- [x] **Step 3: Prepare handoff**

Final response must include:

- what was built;
- local app URL if dev server is still running;
- commands used for verification;
- any missing real credentials needed from the user: `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, Google export credentials;
- that AI never writes without confirmation.

---

## Self-Review

Spec coverage:

- Separate app, not Sheets-first: Tasks 1-5 create a new app and API.
- Local-first with cloud-ready boundaries: Tasks 1-3 use Prisma and env-based config; Task 13 documents local run.
- Telegram identity and Mini App: Task 9 adds Telegram auth verification and bot boundary.
- Text and voice intake: Task 8 adds parser and transcription; Task 9 downloads Telegram voice files, transcribes them, and creates the same confirmation drafts as text.
- AI drafts and explicit confirmation: Tasks 6-8 implement schemas, draft creation, and confirmation.
- Audit history: Tasks 3-4 write audit logs through services.
- Mobile PWA: Task 10 builds the mobile UI shell.
- Current data import: Task 11 seeds debts, bank storage, crypto storage, and `Альфабанк Вероники`.
- Export: Task 11 provides a Sheets-ready snapshot; Task 12 creates a real Google Sheets spreadsheet through the Google Sheets API when `GOOGLE_OAUTH_ACCESS_TOKEN` is configured.

No secrets are added to the repository. No task stores card numbers, bank passwords, private keys, or crypto seed phrases.
