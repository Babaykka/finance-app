export type TelegramInlineButton = {
  text: string;
  callbackData: string;
};

type DraftResult = {
  id: string;
  parsedActions: unknown;
};

const buildDraftButtons = (draftId: string): TelegramInlineButton[] => [
  { text: "Сохранить", callbackData: `draft:${draftId}:confirm` },
  { text: "Исправить", callbackData: `draft:${draftId}:edit` },
  { text: "Отмена", callbackData: `draft:${draftId}:reject` }
];

const getDraftSummary = (parsedActions: unknown) => {
  if (
    typeof parsedActions === "object" &&
    parsedActions !== null &&
    "summary" in parsedActions &&
    typeof parsedActions.summary === "string" &&
    parsedActions.summary.trim().length > 0
  ) {
    return parsedActions.summary;
  }

  return "проверь действие перед сохранением";
};

export function buildTelegramDraftConfirmation(draft: DraftResult) {
  return {
    text: `Черновик: ${getDraftSummary(draft.parsedActions)}`,
    buttons: buildDraftButtons(draft.id)
  };
}

export async function handleTelegramTextMessage(input: {
  text: string;
  telegramUserId: string;
  createDraftFromText: (text: string, telegramUserId: string) => Promise<DraftResult>;
}) {
  const draft = await input.createDraftFromText(input.text, input.telegramUserId);
  return buildTelegramDraftConfirmation(draft);
}
