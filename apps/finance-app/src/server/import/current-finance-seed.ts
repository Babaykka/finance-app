import { z } from "zod";
import { CreateDebtSchema } from "@/server/services/debt-service";
import { CreateStoragePlaceSchema } from "@/server/services/storage-service";

export type CurrentStoragePlaceSeed = Omit<
  z.infer<typeof CreateStoragePlaceSchema>,
  "ownerId" | "actor" | "source" | "reviewOrEndDate" | "lastCheckedAt"
>;

export type CurrentDebtSeed = Omit<
  z.infer<typeof CreateDebtSchema>,
  "ownerId" | "actor" | "source" | "nextPaymentDate"
> & {
  nextPaymentDate?: string;
};

export type CurrentFinanceSeed = {
  importedAt: string;
  storagePlaces: CurrentStoragePlaceSeed[];
  debts: CurrentDebtSeed[];
};

export function buildCurrentFinanceSeed(todayIso: string): CurrentFinanceSeed {
  return {
    importedAt: todayIso,
    storagePlaces: [
      {
        name: "Тбанк накопительный счет",
        type: "income_bank_product",
        subtype: "savings_account",
        holderContext: "мой Тбанк",
        asset: "RUB",
        amount: 980000,
        amountKind: "exact",
        availability: "immediate",
        rate: 7,
        interestPaymentDay: 5,
        status: "active",
        attentionPriority: "medium",
        comment: "7%, выплата каждого 5-го числа."
      },
      {
        name: "Тбанк инвестиции",
        type: "investment",
        subtype: "brokerage",
        holderContext: "мой Тбанк",
        asset: "RUB",
        amount: 15000,
        amountKind: "exact",
        availability: "restricted",
        status: "active",
        attentionPriority: "low",
        comment: "Инвестиции в Тбанк."
      },
      {
        name: "Сбер накопительный счет",
        type: "income_bank_product",
        subtype: "savings_account",
        holderContext: "мой Сбер",
        asset: "RUB",
        amount: 680000,
        amountKind: "exact",
        availability: "immediate",
        rate: 6.5,
        interestPaymentDay: 19,
        status: "active",
        attentionPriority: "medium",
        comment: "6.5%, выплата каждого 19-го числа."
      },
      {
        name: "ВТБ счет",
        type: "bank_account",
        subtype: "card_account",
        holderContext: "мой ВТБ",
        asset: "RUB",
        amount: 268187,
        amountKind: "exact",
        availability: "immediate",
        status: "active",
        attentionPriority: "low",
        comment: "Без процентов."
      },
      {
        name: "Bybit",
        type: "crypto_exchange",
        subtype: "not_applicable",
        holderContext: "мой Bybit",
        asset: "USDT",
        amount: 7331,
        amountKind: "equivalent",
        availability: "restricted",
        status: "active",
        attentionPriority: "high",
        comment: "USDT в эквиваленте."
      },
      {
        name: "MetaMask ETH-позиция",
        type: "crypto_wallet",
        subtype: "wallet",
        holderContext: "мой MetaMask",
        asset: "USDT",
        amount: 1000,
        amountKind: "equivalent",
        availability: "restricted",
        status: "active",
        attentionPriority: "high",
        comment: "ETH-позиция, записана как USDT-эквивалент."
      },
      {
        name: "MetaMask USDT",
        type: "crypto_wallet",
        subtype: "wallet",
        holderContext: "мой MetaMask",
        asset: "USDT",
        amount: 100,
        amountKind: "exact",
        availability: "restricted",
        status: "active",
        attentionPriority: "high",
        comment: "USDT в MetaMask."
      },
      {
        name: "Альфабанк резервный",
        type: "trusted_person",
        subtype: "not_applicable",
        holderContext: "Другой владелец",
        asset: "RUB",
        amount: 804000,
        amountKind: "exact",
        availability: "restricted",
        status: "check",
        attentionPriority: "high",
        comment: "Мои деньги на Альфабанк резервный."
      }
    ],
    debts: [
      {
        partyName: "Контрагент Альфа",
        type: "work_receivable",
        basis: "дипломная работа",
        asset: "RUB",
        originalAmount: 25000,
        status: "scheduled",
        nextPaymentAmount: 25000,
        nextPaymentDate: "2026-06-03",
        attentionPriority: "urgent",
        comment: "Клиент. Оплата до 3 июня 2026."
      },
      {
        partyName: "Контрагент Эпсилон",
        type: "personal_debt",
        basis: "личный долг другу",
        asset: "RUB",
        originalAmount: 50000,
        status: "no_agreement",
        attentionPriority: "medium",
        comment: "Срок оплаты не согласован."
      },
      {
        partyName: "Контрагент Бета",
        type: "work_receivable",
        basis: "помощь по электричеству",
        asset: "RUB",
        originalAmount: 1500,
        status: "scheduled",
        nextPaymentAmount: 1500,
        nextPaymentDate: "2026-06-12",
        attentionPriority: "medium",
        comment: "Оплата до 12 июня 2026."
      },
      {
        partyName: "Грно",
        type: "personal_debt",
        basis: "личный долг другу",
        asset: "RUB",
        originalAmount: 15000,
        status: "scheduled",
        nextPaymentAmount: 15000,
        nextPaymentDate: "2026-06-30",
        attentionPriority: "medium",
        comment: "Дедлайн до конца месяца."
      }
    ]
  };
}
