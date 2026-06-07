import OpenAI from "openai";
import { getOpenAiApiKey } from "./api-key";
import { parseAiJson, type AiParser, type AiParserContext } from "./parser";

const SYSTEM_PROMPT = [
  "Ты финансовый парсер для личного учета.",
  "План:",
  "1. Прочитай сообщение пользователя и контекст известных долгов и мест хранения.",
  "2. Верни только JSON без Markdown и пояснений.",
  "3. Используй только поддержанные action types: create_storage_place, update_storage_place, create_debt, record_debt_payment.",
  "4. Все даты в action должны быть строками формата yyyy-MM-dd, рассчитанными относительно todayIso и timezone.",
  "5. Не выдумывай пустые обязательные поля; если данных не хватает, добавь вопрос в needsClarification.",
  "6. Сохраняй суммы числами, валюты и enum-значения выбирай из переданного доменного смысла.",
  "7. Верхний JSON всегда должен содержать confidence, summary, actions, needsClarification.",
  "8. Для record_debt_payment всегда используй поле paymentDate, не paidAt/date.",
  "9. Для create_debt всегда заполняй debtType, basis, status и attentionPriority.",
  "10. Если пользователь пишет, что его деньги есть/лежат/хранятся у другого человека, это create_storage_place со storageType trusted_person, а не create_debt.",
  "11. Создавай create_debt только когда явно сказано, что человек должен пользователю, обязан вернуть/оплатить, есть долг, заказ, работа или рассрочка.",
  "12. Если пользователь просит переименовать или изменить существующее место хранения, используй update_storage_place: currentName или storagePlaceId для старого места, name для нового названия.",
  "Формат ответа:",
  JSON.stringify({
    confidence: 0.9,
    summary: "Короткое описание черновика.",
    actions: [
      {
        type: "record_debt_payment",
        partyName: "Геворг",
        amount: 10000,
        asset: "RUB",
        paymentDate: "2026-06-03",
        comment: "Частичный возврат долга."
      }
    ],
    needsClarification: []
  })
].join("\n");

type OpenAiParserMessage = {
  role: "system" | "user";
  content: string;
};

type OpenAiParserRequest = {
  model: string;
  input: OpenAiParserMessage[];
};

type OpenAiParserResponse = {
  output_text?: string | null;
};

export type OpenAiParserClient = {
  responses: {
    create(input: OpenAiParserRequest): PromiseLike<OpenAiParserResponse>;
  };
};

export function getOpenAiClient(): OpenAiParserClient {
  return new OpenAI({ apiKey: getOpenAiApiKey() }) as OpenAiParserClient;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const VALID_DEBT_TYPES = ["personal_debt", "work_receivable"] as const;
const VALID_ASSETS = ["RUB", "AMD", "USDT", "BTC", "ETH", "OTHER_CRYPTO"] as const;
const VALID_STORAGE_TYPES = [
  "bank_account",
  "income_bank_product",
  "cash",
  "crypto_exchange",
  "crypto_wallet",
  "trusted_person",
  "investment",
  "other"
] as const;
const VALID_STORAGE_SUBTYPES = [
  "savings_account",
  "deposit",
  "brokerage",
  "card_account",
  "wallet",
  "not_applicable",
  "other"
] as const;
const VALID_AMOUNT_KINDS = ["exact", "equivalent", "estimated"] as const;
const VALID_AVAILABILITY = ["immediate", "delayed", "restricted", "locked_until_date"] as const;
const VALID_DEBT_STATUSES = [
  "no_agreement",
  "negotiating",
  "scheduled",
  "overdue",
  "closed"
] as const;
const VALID_ATTENTION_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === "string" && values.includes(value as T);

const getStringValues = (action: Record<string, unknown>) =>
  Object.values(action)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLocaleLowerCase("ru-RU"));

const hasAny = (values: string[], needles: string[]) =>
  values.some((value) => needles.some((needle) => value.includes(needle)));

const normalizeIntentText = (value: string) =>
  value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();

const normalizeLookupText = (value: string) =>
  normalizeIntentText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const hasExplicitDebtIntent = (text: string) =>
  hasAny([normalizeIntentText(text)], [
    "долг",
    "долж",
    "вернуть",
    "вернул",
    "возврат",
    "оплат",
    "заказ",
    "клиент",
    "диплом",
    "работ",
    "займ",
    "заем",
    "занял",
    "одолж",
    "рассроч"
  ]);

const hasTrustedPersonStorageIntent = (text: string) => {
  const normalized = normalizeIntentText(text);

  return [
    /(?:^|[\s,.;:!?])у\s+[a-zа-я0-9][^,.;:!?]{0,60}\s+у\s+меня\s+(?:есть|лежит|лежат|хранится|хранятся|находится|находятся)?(?:\s|$)/u,
    /(?:^|[\s,.;:!?])у\s+[a-zа-я][^,.;:!?]{0,40}\s+\d[\d\s.,]*(?:k|к|тыс|руб|р|₽|usdt|usd|amd|драм|btc|eth)?(?:$|[\s,.;:!?])/u,
    /(?:^|[\s,.;:!?])у\s+[a-zа-я][^,.;:!?]{0,40}\s+на\s+[a-zа-я][^,.;:!?]{0,40}\s+\d[\d\s.,]*(?:k|к|тыс|руб|р|₽|usdt|usd|amd|драм|btc|eth)?(?:$|[\s,.;:!?])/u,
    /\bмои\s+деньги\s+(?:у|на\s+(?:карте|счете|счету)\s+у)\s+/u,
    /\b(?:лежит|лежат|хранится|хранятся|находится|находятся)\s+у\s+[a-zа-я]/u,
    /\bна\s+(?:карте|счете|счету|банковском\s+счете)\s+у\s+[a-zа-я]/u
  ].some((pattern) => pattern.test(normalized));
};

const shouldTreatAsTrustedPersonStorage = (text: string, action: Record<string, unknown>) =>
  action.type === "create_debt" &&
  hasTrustedPersonStorageIntent(text) &&
  !hasExplicitDebtIntent(text);

const normalizeDebtType = (action: Record<string, unknown>) => {
  if (isOneOf(action.debtType, VALID_DEBT_TYPES)) {
    return action.debtType;
  }

  const values = getStringValues(action);
  if (hasAny(values, ["заказ", "работ", "клиент", "диплом", "проект", "услуг"])) {
    return "work_receivable";
  }

  return "personal_debt";
};

const normalizeDebtBasis = (
  action: Record<string, unknown>,
  debtType: ReturnType<typeof normalizeDebtType>
) => {
  if (typeof action.basis === "string" && action.basis.trim().length > 0) {
    return action.basis.trim();
  }

  const values = getStringValues(action);
  if (hasAny(values, ["заказ"])) {
    return "заказ";
  }

  if (hasAny(values, ["диплом"])) {
    return "дипломная работа";
  }

  if (debtType === "work_receivable") {
    return "заказ/работа";
  }

  if (hasAny(values, ["друг"])) {
    return "личный долг другу";
  }

  return "личный долг";
};

const normalizeDebtStatus = (action: Record<string, unknown>) => {
  if (isOneOf(action.status, VALID_DEBT_STATUSES)) {
    return action.status;
  }

  const values = getStringValues(action);
  if (hasAny(values, ["закры", "оплачен", "вернул", "paid", "closed"])) {
    return "closed";
  }

  if (hasAny(values, ["просроч", "overdue"])) {
    return "overdue";
  }

  if (hasAny(values, ["договор", "обсуд", "negotiat"])) {
    return "negotiating";
  }

  if (typeof action.dueDate === "string" || action.nextPaymentAmount !== undefined) {
    return "scheduled";
  }

  return "no_agreement";
};

const normalizeAttentionPriority = (action: Record<string, unknown>) => {
  if (isOneOf(action.attentionPriority, VALID_ATTENTION_PRIORITIES)) {
    return action.attentionPriority;
  }

  const values = getStringValues(action);
  if (hasAny(values, ["сроч", "urgent"])) {
    return "urgent";
  }

  if (hasAny(values, ["важ", "high"])) {
    return "high";
  }

  if (hasAny(values, ["низ", "low"])) {
    return "low";
  }

  return "medium";
};

const normalizeCreateDebtAction = (action: Record<string, unknown>, rawText: string) => {
  const debtType = normalizeDebtType(action);
  const normalizedAction: Record<string, unknown> = {
    ...action,
    asset: inferAsset(action, rawText),
    amount: parseLooseNumber(action.amount)
  };
  withOptionalLooseNumber(normalizedAction, "nextPaymentAmount", action.nextPaymentAmount);

  return {
    ...normalizedAction,
    debtType,
    basis: normalizeDebtBasis(action, debtType),
    status: normalizeDebtStatus(action),
    attentionPriority: normalizeAttentionPriority(action)
  };
};

const firstNonEmptyString = (...values: unknown[]) =>
  values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();

const CANONICAL_CASH_STORAGE_NAME = "Наличные";

const parseLooseNumber = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  if (typeof value !== "string") {
    return NaN;
  }

  const normalized = value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .trim();
  const multiplier = /(?:k|к|тыс)$/u.test(normalized.replace(/[%₽р]+$/gu, ""));
  const numericText = normalized.replace(/(?:k|к|тыс|%|₽|руб|р)+$/gu, "");
  const amount = Number(numericText);

  if (!Number.isFinite(amount)) {
    return NaN;
  }

  return multiplier ? amount * 1000 : amount;
};

const withOptionalLooseNumber = (
  target: Record<string, unknown>,
  key: string,
  value: unknown
) => {
  if (value === undefined) {
    return target;
  }

  const parsed = parseLooseNumber(value);
  if (Number.isFinite(parsed)) {
    target[key] = parsed;
  }

  return target;
};

const inferAsset = (action: Record<string, unknown>, rawText: string) => {
  if (isOneOf(action.asset, VALID_ASSETS)) {
    return action.asset;
  }

  const text = normalizeIntentText(rawText);
  if (text.includes("usdt")) {
    return "USDT";
  }
  if (text.includes("btc") || text.includes("битко")) {
    return "BTC";
  }
  if (text.includes("eth") || text.includes("эфир")) {
    return "ETH";
  }
  if (text.includes("драм") || text.includes("amd")) {
    return "AMD";
  }

  return "RUB";
};

const normalizeStorageName = (
  actionName: string,
  storageType: ReturnType<typeof normalizeStorageType>
) => {
  if (storageType === "cash") {
    return CANONICAL_CASH_STORAGE_NAME;
  }

  return actionName;
};

const normalizeStorageType = (action: Record<string, unknown>, rawText: string) => {
  const values = getStringValues(action);
  const text = normalizeIntentText(rawText);

  if (hasAny(values, ["налич", "нал cash", "наличка"]) || text.includes("налич")) {
    return "cash";
  }

  if (hasTrustedPersonStorageIntent(rawText) || typeof action.partyName === "string") {
    return "trusted_person";
  }

  if (isOneOf(action.storageType, VALID_STORAGE_TYPES)) {
    return action.storageType;
  }

  if (hasAny(values, ["bybit", "binance", "бирж"])) {
    return "crypto_exchange";
  }
  if (hasAny(values, ["metamask", "wallet", "кошелек", "кошел"])) {
    return "crypto_wallet";
  }
  if (hasAny(values, ["инвест", "брокер"])) {
    return "investment";
  }
  if (hasAny(values, ["накоп", "вклад"])) {
    return "income_bank_product";
  }
  if (hasAny(values, ["банк", "карта", "счет", "счёт"])) {
    return "bank_account";
  }

  return "other";
};

const normalizeStorageSubtype = (
  action: Record<string, unknown>,
  storageType: ReturnType<typeof normalizeStorageType>
) => {
  if (storageType === "cash") {
    return "not_applicable";
  }

  if (isOneOf(action.subtype, VALID_STORAGE_SUBTYPES)) {
    return action.subtype;
  }

  const values = getStringValues(action);
  if (storageType === "investment" || hasAny(values, ["инвест", "брокер"])) {
    return "brokerage";
  }
  if (storageType === "crypto_wallet" || hasAny(values, ["wallet", "кошелек", "кошел"])) {
    return "wallet";
  }
  if (hasAny(values, ["накоп"])) {
    return "savings_account";
  }
  if (hasAny(values, ["вклад", "депозит"])) {
    return "deposit";
  }
  if (hasAny(values, ["карта", "карточ"])) {
    return "card_account";
  }

  return "not_applicable";
};

const normalizeAvailability = (
  action: Record<string, unknown>,
  storageType: ReturnType<typeof normalizeStorageType>
) => {
  if (isOneOf(action.availability, VALID_AVAILABILITY)) {
    return action.availability;
  }

  if (storageType === "trusted_person" || storageType === "income_bank_product") {
    return "restricted";
  }

  return "immediate";
};

const normalizeCreateStorageAction = (action: Record<string, unknown>, rawText: string) => {
  const storageType = normalizeStorageType(action, rawText);
  const rawHolderContext =
    firstNonEmptyString(action.holderContext, action.partyName, action.name) ?? "Не указано";
  const rawName =
    firstNonEmptyString(action.name, action.partyName, action.holderContext) ?? rawHolderContext;
  const name = normalizeStorageName(rawName, storageType);
  const holderContext =
    storageType === "cash" ? CANONICAL_CASH_STORAGE_NAME : rawHolderContext;
  const amount = parseLooseNumber(action.amount);
  const normalizedAction: Record<string, unknown> = {
    ...action
  };
  withOptionalLooseNumber(normalizedAction, "rate", action.rate);
  withOptionalLooseNumber(
    normalizedAction,
    "interestPaymentDay",
    action.interestPaymentDay
  );
  const comment =
    typeof action.comment === "string" && action.comment.trim().length > 0
      ? action.comment.trim()
      : storageType === "trusted_person"
        ? `Мои деньги находятся у этого человека; хранитель: ${holderContext}.`
        : undefined;

  return {
    ...normalizedAction,
    name,
    storageType,
    subtype: normalizeStorageSubtype(action, storageType),
    holderContext,
    asset: inferAsset(action, rawText),
    amount,
    amountKind: isOneOf(action.amountKind, VALID_AMOUNT_KINDS) ? action.amountKind : "exact",
    availability: normalizeAvailability(action, storageType),
    attentionPriority: normalizeAttentionPriority(action),
    ...(comment !== undefined ? { comment } : {})
  };
};

const normalizeUpdateStorageAction = (action: Record<string, unknown>) => {
  const currentName = firstNonEmptyString(
    action.currentName,
    action.oldName,
    action.fromName,
    action.sourceName,
    action.originalName,
    action.storageName,
    action.placeName,
    action.nameBefore
  );
  const name = firstNonEmptyString(
    action.name,
    action.newName,
    action.toName,
    action.targetName,
    action.nameAfter
  );

  return {
    ...action,
    type: "update_storage_place",
    ...(currentName !== undefined ? { currentName } : {}),
    ...(name !== undefined ? { name } : {})
  };
};

const toTrustedPersonStorageAction = (action: Record<string, unknown>) => {
  const partyName = typeof action.partyName === "string" ? action.partyName.trim() : "";
  const amount = parseLooseNumber(action.amount);

  if (
    partyName.length === 0 ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    !isOneOf(action.asset, VALID_ASSETS)
  ) {
    return action;
  }

  return {
    type: "create_storage_place",
    name: partyName,
    storageType: "trusted_person",
    subtype: "not_applicable",
    holderContext: partyName,
    asset: action.asset,
    amount,
    amountKind: "exact",
    availability: "restricted",
    attentionPriority: normalizeAttentionPriority(action),
    comment:
      typeof action.comment === "string" && action.comment.trim().length > 0
        ? action.comment.trim()
        : `Мои деньги находятся у этого человека; хранитель: ${partyName}.`
  };
};

const buildTrustedPersonStorageSummary = (action: Record<string, unknown>) => {
  const name = typeof action.name === "string" ? action.name : "человек";
  const amount = typeof action.amount === "number" ? action.amount : "сумма";
  const asset = typeof action.asset === "string" ? action.asset : "актив";

  return `Добавить место хранения: ${name}, ${amount} ${asset}.`;
};

const matchesKnownDebtParty = (knownPartyName: string, actionPartyName: string) => {
  const known = normalizeLookupText(knownPartyName);
  const action = normalizeLookupText(actionPartyName);

  return known === action || known.includes(action) || action.includes(known);
};

const formatMoney = (amount: unknown, asset: unknown) =>
  `${typeof amount === "number" ? amount : Number(amount)} ${typeof asset === "string" ? asset : "актив"}`;

const buildPaymentClarification = (
  action: Record<string, unknown>,
  matches: AiParserContext["knownDebts"]
) => {
  const partyName = firstNonEmptyString(action.partyName) ?? "этому человеку";
  const asset = isOneOf(action.asset, VALID_ASSETS) ? action.asset : "RUB";
  const amount = Number(action.amount);

  if (matches.length === 0) {
    return `Не нашел открытый долг для «${partyName}» в ${asset}. Укажи, к какому долгу относится оплата ${formatMoney(amount, asset)}.`;
  }

  return `По имени «${partyName}» найдено несколько долгов в ${asset}. Укажи, к какому долгу относится оплата ${formatMoney(amount, asset)}.`;
};

const normalizeRecordDebtPaymentAction = (
  action: Record<string, unknown>,
  context: AiParserContext,
  todayIso: string,
  rawText: string,
  assignedDebtIds: Set<string>
): { action?: Record<string, unknown>; clarification?: string } => {
  const paymentDate = action.paymentDate ?? action.paidAt ?? action.date ?? todayIso;
  const normalizedAction: Record<string, unknown> = {
    ...action,
    asset: inferAsset(action, rawText),
    amount: parseLooseNumber(action.amount),
    paymentDate
  };

  if (typeof normalizedAction.debtId === "string" && normalizedAction.debtId.trim().length > 0) {
    return { action: normalizedAction };
  }

  const partyName = firstNonEmptyString(normalizedAction.partyName);
  if (!partyName) {
    return {
      clarification: "Укажи, к какому долгу относится оплата."
    };
  }

  const asset = isOneOf(normalizedAction.asset, VALID_ASSETS) ? normalizedAction.asset : "RUB";
  const allMatchingDebts = context.knownDebts.filter(
    (debt) => debt.asset === asset && matchesKnownDebtParty(debt.partyName, partyName)
  );
  const matchingDebts = allMatchingDebts.filter(
    (debt) =>
      !assignedDebtIds.has(debt.id)
  );
  const amount = Number(normalizedAction.amount);
  if (!Number.isFinite(amount)) {
    return {
      clarification: `Не понял сумму оплаты для «${partyName}». Напиши сумму числом.`
    };
  }

  const exactAmountDebts = Number.isFinite(amount)
    ? matchingDebts.filter((debt) => debt.remainingAmount === amount)
    : [];
  const payableDebts = Number.isFinite(amount)
    ? matchingDebts.filter((debt) => amount <= debt.remainingAmount)
    : matchingDebts;
  const selectedDebt =
    allMatchingDebts.length === 1
      ? allMatchingDebts[0]
      : exactAmountDebts.length === 1
      ? exactAmountDebts[0]
      : payableDebts.length === 1
        ? payableDebts[0]
        : undefined;

  if (selectedDebt) {
    assignedDebtIds.add(selectedDebt.id);

    return {
      action: {
        ...normalizedAction,
        partyName,
        debtId: selectedDebt.id
      }
    };
  }

  if (matchingDebts.length === 1 && matchingDebts[0] && Number.isFinite(amount)) {
    return {
      clarification: `Оплата ${formatMoney(amount, asset)} больше остатка долга «${matchingDebts[0].partyName}» (${matchingDebts[0].remainingAmount} ${asset}). Уточни сумму или долг.`
    };
  }

  return {
    clarification: buildPaymentClarification(normalizedAction, matchingDebts)
  };
};

function normalizeLooseParserJson(
  json: unknown,
  context: AiParserContext,
  rawText: string
): unknown {
  if (!isRecord(json)) {
    return json;
  }

  let firstTrustedPersonStorageAction: Record<string, unknown> | null = null;
  const generatedClarifications: string[] = [];
  const assignedDebtIds = new Set<string>();
  const actions = Array.isArray(json.actions)
    ? json.actions.flatMap((action) => {
        if (!isRecord(action)) {
          return [action];
        }

        if (shouldTreatAsTrustedPersonStorage(rawText, action)) {
          const storageAction = toTrustedPersonStorageAction(action);
          if (isRecord(storageAction) && storageAction.type === "create_storage_place") {
            firstTrustedPersonStorageAction ??= storageAction;
          }
          return [storageAction];
        }

        if (action.type === "create_storage_place") {
          return [normalizeCreateStorageAction(action, rawText)];
        }

        if (
          action.type === "update_storage_place" ||
          action.type === "rename_storage_place"
        ) {
          return [normalizeUpdateStorageAction(action)];
        }

        if (action.type === "create_debt") {
          return [normalizeCreateDebtAction(action, rawText)];
        }

        if (action.type !== "record_debt_payment") {
          return [action];
        }

        const normalizedPayment = normalizeRecordDebtPaymentAction(
          action,
          context,
          context.todayIso,
          rawText,
          assignedDebtIds
        );
        if (normalizedPayment.clarification) {
          generatedClarifications.push(normalizedPayment.clarification);
        }

        return normalizedPayment.action ? [normalizedPayment.action] : [];
      })
    : json.actions;
  const existingClarifications = Array.isArray(json.needsClarification)
    ? json.needsClarification.filter(
        (clarification): clarification is string =>
          typeof clarification === "string" && clarification.trim().length > 0
      )
    : [];

  return {
    confidence: json.confidence ?? 0.7,
    summary:
      firstTrustedPersonStorageAction !== null
        ? buildTrustedPersonStorageSummary(firstTrustedPersonStorageAction)
        : (json.summary ?? "AI создал черновик финансового действия."),
    actions,
    needsClarification: [...existingClarifications, ...generatedClarifications]
  };
}

export function createOpenAiParser(client: OpenAiParserClient, model: string): AiParser {
  return {
    async parseMessage(input) {
      const response = await client.responses.create({
        model,
        input: [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          {
            role: "user",
            content: JSON.stringify(input)
          }
        ]
      });

      if (!response.output_text) {
        throw new Error("OpenAI parser response output_text is required");
      }

      let parsedJson: unknown;

      try {
        parsedJson = JSON.parse(response.output_text);
      } catch (error) {
        throw new Error("OpenAI parser response must be valid JSON", { cause: error });
      }

      return parseAiJson(normalizeLooseParserJson(parsedJson, input.context, input.text));
    }
  };
}
