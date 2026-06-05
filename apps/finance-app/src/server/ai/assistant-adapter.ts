type OpenAiAssistantMessage = {
  role: "system" | "user";
  content: string;
};

type OpenAiAssistantRequest = {
  model: string;
  input: OpenAiAssistantMessage[];
};

type OpenAiAssistantResponse = {
  output_text?: string | null;
};

export type OpenAiAssistantClient = {
  responses: {
    create(input: OpenAiAssistantRequest): PromiseLike<OpenAiAssistantResponse>;
  };
};

export type FinanceAssistantContext = {
  todayIso: string;
  timezone: string;
  assetTotals: Array<{ asset: string; amount: number }>;
  storagePlaces: Array<{
    name: string;
    type: string;
    subtype: string;
    holderContext: string;
    asset: string;
    amount: number;
    rate: number | null;
    availability: string;
    interestPaymentDay: number | null;
    comment: string | null;
  }>;
  debts: Array<{
    partyName: string;
    type: string;
    basis: string;
    asset: string;
    remainingAmount: number;
    status: string;
    nextPaymentAmount: number | null;
    nextPaymentDate: string | null;
    comment: string | null;
  }>;
  pendingDraftCount: number;
};

export type FinanceAssistantResponder = {
  answerMessage(input: { text: string; context: FinanceAssistantContext }): Promise<{ text: string }>;
};

const SYSTEM_PROMPT = [
  "Ты личный финансовый помощник пользователя в Telegram.",
  "Отвечай по-русски, спокойно, коротко и по делу.",
  "Ты можешь отвечать на вопросы по финансам на основе переданного JSON-контекста, а также поддерживать обычный разговор.",
  "Не выдумывай суммы, валюты, даты и договоренности, которых нет в контексте.",
  "Не конвертируй валюты без курса; если валют несколько, перечисляй отдельно.",
  "Если пользователь просит изменить финансы, скажи, что для изменений нужен черновик с кнопкой сохранения.",
  "Не давай юридических, налоговых или инвестиционных гарантий. Можно предлагать аккуратные следующие шаги.",
  "Верни только текст ответа без Markdown-таблиц и без JSON. Максимум 1200 символов."
].join("\n");

const TELEGRAM_REPLY_LIMIT = 3500;

export function createOpenAiAssistantResponder(
  client: OpenAiAssistantClient,
  model: string
): FinanceAssistantResponder {
  return {
    async answerMessage(input) {
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
      const text = response.output_text?.trim();

      if (!text) {
        throw new Error("OpenAI assistant response output_text is required");
      }

      return { text: text.slice(0, TELEGRAM_REPLY_LIMIT) };
    }
  };
}
