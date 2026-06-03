type DecimalLike = {
  toString(): string;
};

type SnapshotStoragePlace = {
  name: string;
  asset: string;
  amount: unknown;
};

type SnapshotDebt = {
  partyName: string;
  asset: string;
  remainingAmount: unknown;
};

type SnapshotPayment = {
  paymentDate: Date | string;
  amount: unknown;
  asset: string;
  status: string;
};

export type ExportSnapshotInput = {
  storagePlaces: SnapshotStoragePlace[];
  debts: SnapshotDebt[];
  payments: SnapshotPayment[];
};

export type ExportSnapshot = Record<string, Array<Array<string | number>>>;

const isDecimalLike = (value: unknown): value is DecimalLike =>
  typeof value === "object" &&
  value !== null &&
  "toString" in value &&
  typeof value.toString === "function";

export function toFiniteSheetNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return value;
    }

    throw new Error(`${fieldName} must be a finite number`);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      throw new Error(`${fieldName} must not be blank`);
    }

    const parsed = Number(trimmed);

    if (Number.isFinite(parsed)) {
      return parsed;
    }

    throw new Error(`${fieldName} must be numeric`);
  }

  if (isDecimalLike(value)) {
    return toFiniteSheetNumber(value.toString(), fieldName);
  }

  throw new Error(`${fieldName} must be numeric`);
}

const toDateIso = (value: Date | string): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

export function buildExportSnapshot(input: ExportSnapshotInput): ExportSnapshot {
  return {
    "02 Места хранения": [
      ["Название места", "Валюта/актив", "Текущая сумма"],
      ...input.storagePlaces.map((place) => [
        place.name,
        place.asset,
        toFiniteSheetNumber(place.amount, `storagePlaces.${place.name}.amount`)
      ])
    ],
    "03 Долги": [
      ["Должник/клиент", "Валюта/актив", "Текущий остаток"],
      ...input.debts.map((debt) => [
        debt.partyName,
        debt.asset,
        toFiniteSheetNumber(debt.remainingAmount, `debts.${debt.partyName}.remainingAmount`)
      ])
    ],
    "04 График и оплаты": [
      ["Дата платежа", "Сумма", "Валюта/актив", "Статус"],
      ...input.payments.map((payment) => [
        toDateIso(payment.paymentDate),
        toFiniteSheetNumber(payment.amount, `payments.${toDateIso(payment.paymentDate)}.amount`),
        payment.asset,
        payment.status
      ])
    ]
  };
}
