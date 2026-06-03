import { NextResponse } from "next/server";
import { dateToMoscowDateIso } from "@/domain/dates";
import { buildExportSnapshot } from "@/server/export/snapshot";
import { createGoogleSheetsExportClient } from "@/server/export/google-sheets";

const getRouteDependencies = async () => {
  const [{ prisma }, { getLocalOwner }] = await Promise.all([
    import("@/server/db"),
    import("@/server/auth/local-owner")
  ]);

  return { prisma, getLocalOwner };
};

type RouteDependencies = Awaited<ReturnType<typeof getRouteDependencies>>;

const readExportRows = async (prisma: RouteDependencies["prisma"], ownerId: string) => {
  return Promise.all([
    prisma.storagePlace.findMany({
      where: { ownerId },
      select: {
        name: true,
        asset: true,
        amount: true
      },
      orderBy: { name: "asc" }
    }),
    prisma.debt.findMany({
      where: { ownerId },
      select: {
        partyName: true,
        asset: true,
        remainingAmount: true
      },
      orderBy: { partyName: "asc" }
    }),
    prisma.debtPayment.findMany({
      where: { ownerId },
      select: {
        paymentDate: true,
        amount: true,
        asset: true,
        status: true
      },
      orderBy: { paymentDate: "asc" }
    })
  ]);
};

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown Google Sheets export error";

export async function POST() {
  const accessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

  if (!accessToken) {
    return NextResponse.json(
      { error: "GOOGLE_OAUTH_ACCESS_TOKEN is required for Google Sheets export" },
      { status: 503 }
    );
  }

  const { prisma, getLocalOwner } = await getRouteDependencies();
  const owner = await getLocalOwner();
  const [storagePlaces, debts, payments] = await readExportRows(prisma, owner.id);
  const tables = buildExportSnapshot({ storagePlaces, debts, payments });
  const exportJob = await prisma.exportJob.create({
    data: {
      ownerId: owner.id,
      target: "google_sheets",
      status: "running"
    }
  });
  const client = createGoogleSheetsExportClient({ accessToken, fetcher: fetch });

  try {
    const exportResult = await client.exportTables({
      title: `Финансы export ${dateToMoscowDateIso()}`,
      tables
    });

    await prisma.exportJob.update({
      where: { id: exportJob.id },
      data: {
        status: "finished",
        finishedAt: new Date(),
        spreadsheetUrl: exportResult.spreadsheetUrl
      }
    });

    return NextResponse.json(exportResult);
  } catch (error) {
    await prisma.exportJob.update({
      where: { id: exportJob.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: toErrorMessage(error)
      }
    });

    return NextResponse.json({ error: "Google Sheets export failed" }, { status: 502 });
  }
}
