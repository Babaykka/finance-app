import { NextResponse } from "next/server";
export { ParseMessageRequestSchema } from "@/server/services/parse-message-service";

const getRouteDependencies = async () => {
  const { createDraftFromParsedMessage } = await import("@/server/services/parse-message-service");

  return { createDraftFromParsedMessage };
};

export async function POST(request: Request) {
  const { createDraftFromParsedMessage } = await getRouteDependencies();
  const draft = await createDraftFromParsedMessage(await request.json());

  return NextResponse.json(draft, { status: 201 });
}
