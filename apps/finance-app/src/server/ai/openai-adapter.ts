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

function normalizeLooseParserJson(json: unknown, todayIso: string): unknown {
  if (!isRecord(json)) {
    return json;
  }

  const actions = Array.isArray(json.actions)
    ? json.actions.map((action) => {
        if (!isRecord(action) || action.type !== "record_debt_payment") {
          return action;
        }

        const paymentDate = action.paymentDate ?? action.paidAt ?? action.date ?? todayIso;

        return {
          ...action,
          paymentDate
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
