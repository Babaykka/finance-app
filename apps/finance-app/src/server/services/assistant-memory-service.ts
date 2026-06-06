type AssistantMemoryCandidate = {
  kind: "preference";
  text: string;
};

type AssistantMemoryDb = {
  assistantMessage: {
    createMany(input: {
      data: Array<{
        ownerId: string;
        role: "user" | "assistant";
        source: string;
        text: string;
      }>;
    }): Promise<unknown>;
  };
  assistantMemory: {
    upsert(input: {
      where: { ownerId_kind_text: { ownerId: string; kind: string; text: string } };
      create: {
        ownerId: string;
        kind: string;
        text: string;
        source: string;
        status: "active";
      };
      update: { source: string; status: "active" };
    }): Promise<unknown>;
  };
};

const REMEMBER_PREFIX_PATTERN =
  /^(?:пожалуйста,?\s*)?(?:запомни|запиши\s+в\s+память|сохрани\s+в\s+памяти|remember)(?:,|:)?\s+/iu;

const normalizeMemoryText = (text: string) =>
  text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/u, "")
    .trim();

export function extractAssistantMemoryCandidates(text: string): AssistantMemoryCandidate[] {
  if (!REMEMBER_PREFIX_PATTERN.test(text)) {
    return [];
  }

  const memoryText = normalizeMemoryText(text.replace(REMEMBER_PREFIX_PATTERN, ""));
  if (!memoryText) {
    return [];
  }

  return [{ kind: "preference", text: memoryText }];
}

export async function rememberAssistantExchange(
  db: AssistantMemoryDb,
  input: {
    ownerId: string;
    source: string;
    userText: string;
    assistantText: string;
  }
) {
  await db.assistantMessage.createMany({
    data: [
      {
        ownerId: input.ownerId,
        role: "user",
        source: input.source,
        text: input.userText
      },
      {
        ownerId: input.ownerId,
        role: "assistant",
        source: input.source,
        text: input.assistantText
      }
    ]
  });

  await Promise.all(
    extractAssistantMemoryCandidates(input.userText).map((candidate) =>
      db.assistantMemory.upsert({
        where: {
          ownerId_kind_text: {
            ownerId: input.ownerId,
            kind: candidate.kind,
            text: candidate.text
          }
        },
        create: {
          ownerId: input.ownerId,
          kind: candidate.kind,
          text: candidate.text,
          source: input.source,
          status: "active"
        },
        update: {
          source: input.source,
          status: "active"
        }
      })
    )
  );
}
