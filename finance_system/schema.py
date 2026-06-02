from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Column:
    key: str
    title: str
    kind: str = "text"
    dropdown: str | None = None
    width: int = 18


@dataclass(frozen=True)
class SheetSpec:
    name: str
    purpose: str
    columns: tuple[Column, ...] = ()
    frozen_rows: int = 1


LISTS: dict[str, list[str]] = {
    "ВалютыАктивы": ["RUB", "AMD", "USDT", "BTC", "ETH", "Другая криптовалюта"],
    "ТипыМест": [
        "карта/обычный банковский счет",
        "доходное банковское хранение",
        "наличные",
        "криптобиржа",
        "криптокошелек",
        "у доверенного лица",
    ],
    "ПодтипыМест": ["не применимо", "накопительный счет", "вклад", "другой банковский продукт"],
    "Доступность": ["сразу", "с задержкой", "с ограничениями", "до даты окончания продукта"],
    "ПравилаПроцентов": [
        "не применимо",
        "ежедневный остаток",
        "минимальный остаток за расчетный период",
        "фиксированный срок",
        "другое",
    ],
    "ВлияниеСнятия": [
        "не влияет",
        "снижает базу расчета",
        "приводит к потере процентов",
        "другое",
    ],
    "СтатусыМест": ["активно", "проверить", "перевести", "закрыто"],
    "Приоритеты": ["низкий", "средний", "высокий", "срочно"],
    "ТипыДолгов": ["личный долг", "рабочая дебиторка"],
    "СтатусыДолгов": [
        "нет договоренности",
        "договариваемся",
        "платит по графику",
        "просрочено",
        "закрыт",
    ],
    "ТипыПлатежей": ["план", "факт"],
    "СтатусыПлатежей": ["ожидается", "получено", "частично", "просрочено", "отменено"],
    "ТипыДвижений": [
        "доход",
        "крупный расход",
        "перевод между своими местами",
        "возврат долга",
        "выдача долга",
        "коррекция",
        "другое",
    ],
    "СтатусыРасходов": ["план", "идет", "завершено"],
    "ОбластиРешений": ["хранение", "долг", "доход", "расходы", "безопасность", "другое"],
    "СтатусыРешений": ["идея", "к проверке", "принято", "в работе", "сделано", "отложено"],
}


SHEETS: tuple[SheetSpec, ...] = (
    SheetSpec("01 Главная", "Dashboard with summaries, attention, expected payments, and decisions."),
    SheetSpec(
        "02 Места хранения",
        "Detailed inventory of every place where money or assets are stored.",
        (
            Column("id_storage", "ID места хранения", width=20),
            Column("name", "Название места", width=28),
            Column("storage_type", "Тип места", dropdown="ТипыМест", width=28),
            Column("storage_subtype", "Подтип места", dropdown="ПодтипыМест", width=24),
            Column("owner_context", "Владелец/контекст", width=24),
            Column("asset", "Валюта/актив", dropdown="ВалютыАктивы", width=16),
            Column("amount", "Текущая сумма", kind="number", width=18),
            Column("availability", "Доступность", dropdown="Доступность", width=24),
            Column("rate", "Ставка/доходность", kind="number", width=18),
            Column("interest_rule", "Правило расчета процентов", dropdown="ПравилаПроцентов", width=32),
            Column("interest_period", "Расчетный период", width=22),
            Column("interest_payment_day", "День выплаты процентов", width=24),
            Column(
                "withdrawal_interest_effect",
                "Влияние снятия на проценты",
                dropdown="ВлияниеСнятия",
                width=30,
            ),
            Column("early_withdrawal_terms", "Условия досрочного снятия", width=30),
            Column("review_or_end_date", "Дата окончания/пересмотра", kind="date", width=24),
            Column("checked_at", "Дата последней проверки", kind="date", width=24),
            Column("status", "Статус", dropdown="СтатусыМест", width=18),
            Column("attention_priority", "Приоритет внимания", dropdown="Приоритеты", width=22),
            Column("comment", "Комментарий", width=36),
        ),
    ),
    SheetSpec(
        "03 Долги",
        "Debt and accounts receivable state.",
        (
            Column("id_debt", "ID долга", width=18),
            Column("party", "Должник/клиент", width=26),
            Column("debt_type", "Тип долга", dropdown="ТипыДолгов", width=22),
            Column("basis", "Основание", width=32),
            Column("asset", "Валюта/актив", dropdown="ВалютыАктивы", width=16),
            Column("original_amount", "Исходная сумма", kind="number", width=18),
            Column("remaining_amount", "Текущий остаток", kind="number", width=18),
            Column("status", "Статус", dropdown="СтатусыДолгов", width=24),
            Column("next_payment_amount", "Следующий платеж", kind="number", width=18),
            Column("next_payment_date", "Дата следующего платежа", kind="date", width=24),
            Column("attention_priority", "Приоритет внимания", dropdown="Приоритеты", width=22),
            Column("comment", "Комментарий", width=36),
        ),
    ),
    SheetSpec(
        "04 График и оплаты",
        "Planned and actual payments for debts.",
        (
            Column("id_payment", "ID платежа", width=18),
            Column("id_debt", "ID долга", width=18),
            Column("party", "Должник/клиент", width=26),
            Column("record_type", "Тип записи", dropdown="ТипыПлатежей", width=16),
            Column("payment_date", "Дата платежа", kind="date", width=18),
            Column("amount", "Сумма", kind="number", width=16),
            Column("asset", "Валюта/актив", dropdown="ВалютыАктивы", width=16),
            Column("status", "Статус", dropdown="СтатусыПлатежей", width=18),
            Column("comment", "Комментарий", width=36),
        ),
    ),
    SheetSpec(
        "05 Крупные движения",
        "Journal explaining major changes in the financial picture.",
        (
            Column("id_movement", "ID движения", width=18),
            Column("date", "Дата", kind="date", width=16),
            Column("event_type", "Тип события", dropdown="ТипыДвижений", width=30),
            Column("amount", "Сумма", kind="number", width=16),
            Column("asset", "Валюта/актив", dropdown="ВалютыАктивы", width=16),
            Column("from_place", "Откуда", width=24),
            Column("to_place", "Куда", width=24),
            Column("id_debt", "ID долга", width=18),
            Column("comment", "Комментарий", width=36),
        ),
    ),
    SheetSpec("06 Справочники", "Dropdown values and service reference data."),
    SheetSpec(
        "07 Расходы-план",
        "Personal expense plan by period, not per receipt.",
        (
            Column("id_expense_period", "ID периода", width=18),
            Column("period", "Период", width=18),
            Column("asset", "Валюта/актив", dropdown="ВалютыАктивы", width=16),
            Column("planned_amount", "Плановая сумма", kind="number", width=18),
            Column("actual_estimate", "Фактическая оценка", kind="number", width=20),
            Column("status", "Статус", dropdown="СтатусыРасходов", width=18),
            Column("comment", "Комментарий", width=36),
        ),
    ),
    SheetSpec(
        "08 Решения",
        "Decision and recommendation journal.",
        (
            Column("id_decision", "ID решения", width=18),
            Column("date", "Дата", kind="date", width=16),
            Column("area", "Область", dropdown="ОбластиРешений", width=18),
            Column("action", "Действие", width=36),
            Column("reason", "Причина", width=36),
            Column("amount_or_asset", "Сумма/актив", width=18),
            Column("priority", "Приоритет", dropdown="Приоритеты", width=18),
            Column("status", "Статус", dropdown="СтатусыРешений", width=18),
            Column("comment", "Комментарий", width=36),
        ),
    ),
)


def sheet_by_name(name: str) -> SheetSpec:
    for sheet in SHEETS:
        if sheet.name == name:
            return sheet
    raise KeyError(f"Unknown sheet: {name}")
