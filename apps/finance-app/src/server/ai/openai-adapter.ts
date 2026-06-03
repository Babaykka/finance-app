import OpenAI from "openai";
import { parseAiJson, type AiParser } from "./parser";

const SYSTEM_PROMPT = [
  "Ты финансовый парсер для личного учета.",
  "План:",
  "1. Прочитай сообщение пользователя и контекст известных долгов и мест хранения.",
  "2. Верни только JSON без Markdown и пояснений.",
  "3. Используй только поддержанные action types: create_storage_place, create_debt, record_debt_payment.",
  "4. Все даты в action должны быть строками формата yyyy-MM-dd, рассчитанными относительно todayIso и timezone.",
  "5. Не выдумывай пустые обязательные поля; если данных не хватает, добавь вопрос в needsClarification.",
  "6. Сохраняй суммы числами, валюты и enum-значения выбирай из переданного доменного смысла.",
  "7. Верхний JSON всегда должен содержать confidence, summary, actions, needsClarification.",
  "8. Для record_debt_payment всегда используй поле paymentDate, не paidAt/date.",
  "9. Для create_debt всегда заполняй debtType, basis, status и attentionPriority.",
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
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for AI parsing");
  }

  return new OpenAI({ apiKey }) as OpenAiParserClient;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const VALID_DEBT_TYPES = ["personal_debt", "work_receivable"] as const;
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

const normalizeCreateDebtAction = (action: Record<string, unknown>) => {
  const debtType = normalizeDebtType(action);

  return {
    ...action,
    debtType,
    basis: normalizeDebtBasis(action, debtType),
    status: normalizeDebtStatus(action),
    attentionPriority: normalizeAttentionPriority(action)
  };
};

function normalizeLooseParserJson(json: unknown, todayIso: string): unknown {
  if (!isRecord(json)) {
    return json;
  }

  const actions = Array.isArray(json.actions)
    ? json.actions.map((action) => {
        if (!isRecord(action)) {
          return action;
        }

        if (action.type === "create_debt") {
          return normalizeCreateDebtAction(action);
        }

        if (action.type !== "record_debt_payment") {
          return action;
        }

        return {
          ...action,
          paymentDate: action.paymentDate ?? action.paidAt ?? action.date ?? todayIso
        };
      })
    : json.actions;

  return {
    confidence: json.confidence ?? 0.7,
    summary: json.summary ?? "AI создал черновик финансового действия.",
    actions,
    needsClarification: json.needsClarification ?? []
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

      return parseAiJson(normalizeLooseParserJson(parsedJson, input.context.todayIso));
    }
  };
}
