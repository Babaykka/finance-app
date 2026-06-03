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
  "6. Сохраняй суммы числами, валюты и enum-значения выбирай из переданного доменного смысла."
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

      return parseAiJson(JSON.parse(response.output_text));
    }
  };
}
