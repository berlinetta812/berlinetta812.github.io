function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

const session = readStorage('rf_session', null);

if (!session) {
  window.location.replace('login.html');
}

const accountParams = new URLSearchParams(window.location.search);
const accountId = accountParams.get('id');
const isArchiveView = accountParams.get('archive') === 'closed';
const isNewlyOpened = accountParams.get('opened') === '1';
const accountStorageKey = isArchiveView
  ? 'rf_closed_savings_accounts'
  : 'rf_savings_accounts';
let storedAccounts = readStorage(accountStorageKey, []);

let account = Array.isArray(storedAccounts)
  ? storedAccounts.find(
      (item) =>
        item.id === accountId &&
        item.ownerPhone === session?.phone
    )
  : null;

const accountContent = document.querySelector('[data-account-content]');
const accountError = document.querySelector('[data-account-error]');
const DEV_MOCK_CLOSURE_PROCESSING = true;
const DEV_MOCK_MATURITY = true;
const SAVINGS_PAYOUT_PROCESSING_LABEL = 'до 7 рабочих дней';
let pendingFundingTerms = null;
let pendingRenewalTerms = null;
let pendingMaturityPayout = null;

function formatMoney(value) {
  const amount = Math.round(Number(value) || 0);
  return `${amount.toLocaleString('ru-RU')} ₽`;
}

function formatMoneyPrecise(value) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function formatMonths(months) {
  const value = Number(months);
  const lastTwo = value % 100;
  const lastOne = value % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${value} месяцев`;
  }

  if (lastOne === 1) {
    return `${value} месяц`;
  }

  if (lastOne >= 2 && lastOne <= 4) {
    return `${value} месяца`;
  }

  return `${value} месяцев`;
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('ru-RU').format(date);
}

function formatLongDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function addMonths(value, months) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const originalDay = date.getDate();

  date.setDate(1);
  date.setMonth(date.getMonth() + Number(months || 0));

  const lastDayOfTargetMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0
  ).getDate();

  date.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  return date;
}

function calculateAccruedInterest() {
  const fundedAt = new Date(account?.fundedAt);

  if (
    Number.isNaN(fundedAt.getTime()) ||
    Number(account?.balance) <= 0
  ) {
    return 0;
  }

  const now = new Date();
  const maturityDate = new Date(
    account.maturityDate ||
    addMonths(fundedAt, account.termMonths)
  );
  const calculationEnd =
    !Number.isNaN(maturityDate.getTime()) && maturityDate < now
      ? maturityDate
      : now;
  const elapsedDays = Math.max(
    0,
    (calculationEnd - fundedAt) / (1000 * 60 * 60 * 24)
  );
  const rate = Number(
    account.fixedRate ?? account.previewRate
  ) || 0;

  return Number(account.balance) * (rate / 100) * (elapsedDays / 365);
}

function hasContractMatured(targetAccount = account) {
  const fundedAt =
    targetAccount?.fundedAt || targetAccount?.openedAt;
  const maturityDate = new Date(
    targetAccount?.maturityDate ||
    addMonths(fundedAt, targetAccount?.termMonths)
  );

  return (
    !Number.isNaN(maturityDate.getTime()) &&
    maturityDate <= new Date()
  );
}

function calculateMaturityAmounts(targetAccount) {
  const principal = Number(
    targetAccount?.principalAmount ??
    targetAccount?.plannedAmount ??
    targetAccount?.balance
  ) || 0;
  const rate = Number(
    targetAccount?.fixedRate ?? targetAccount?.previewRate
  ) || 0;
  const months = Number(targetAccount?.termMonths) || 0;
  const calculation = window.RFSavingsCalculator.calculate(
    principal,
    months,
    rate
  );

  return {
    principal: Number(principal.toFixed(2)),
    interest: calculation.income,
    total: calculation.finalAmount
  };
}

function createMaturedAccount(targetAccount) {
  const amounts = calculateMaturityAmounts(targetAccount);
  const maturedAt =
    targetAccount.maturityDate || new Date().toISOString();
  const interestOperationId =
    typeof crypto.randomUUID === 'function'
      ? `operation-${crypto.randomUUID()}`
      : `operation-${Date.now()}-interest`;

  return {
    ...targetAccount,
    principalAmount: amounts.principal,
    balance: amounts.total,
    earnedInterest: amounts.interest,
    status: 'matured',
    maturedAt,
    operations: [
      ...(Array.isArray(targetAccount.operations)
        ? targetAccount.operations
        : []),
      {
        id: interestOperationId,
        type: 'interest',
        amount: amounts.interest,
        status: 'completed',
        createdAt: maturedAt
      }
    ]
  };
}

function synchronizeMaturity() {
  if (
    !account ||
    account.status !== 'active' ||
    !hasContractMatured(account)
  ) {
    return;
  }

  const maturedAccount = createMaturedAccount(account);

  storedAccounts = storedAccounts.map((item) =>
    item.id === account.id &&
    item.ownerPhone === session.phone
      ? maturedAccount
      : item
  );
  account = maturedAccount;

  localStorage.setItem(
    'rf_savings_accounts',
    JSON.stringify(storedAccounts)
  );
}

function synchronizeAwaitingFundingRate() {
  if (!account || account.status !== 'awaiting_funding') {
    return;
  }

  const currentRate = window.RFSavingsCalculator.getRate(
    account.termMonths
  );
  const calculation = window.RFSavingsCalculator.calculate(
    account.plannedAmount,
    account.termMonths,
    currentRate
  );

  if (
    Number(account.previewRate) === currentRate &&
    Number(account.projectedIncome) === calculation.income &&
    Number(account.projectedFinalAmount) === calculation.finalAmount
  ) {
    return;
  }

  const updatedAccount = {
    ...account,
    previewRate: currentRate,
    projectedIncome: calculation.income,
    projectedFinalAmount: calculation.finalAmount
  };

  storedAccounts = storedAccounts.map((item) =>
    item.id === account.id &&
    item.ownerPhone === session.phone
      ? updatedAccount
      : item
  );
  account = updatedAccount;

  localStorage.setItem(
    'rf_savings_accounts',
    JSON.stringify(storedAccounts)
  );
}

function formatDayMonth(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long'
  }).format(date);
}

function createContractNumber(accountId, openedAt) {
  const date = new Date(openedAt);
  const validDate = !Number.isNaN(date.getTime());
  const datePart = validDate
    ? [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
      ].join('')
    : '00000000';

  const idPart = String(accountId)
    .replace(/[^a-z0-9]/gi, '')
    .slice(-6)
    .toUpperCase()
    .padStart(6, '0');

  return `P-C-${datePart}-${idPart}`;
}

function synchronizeSavingsContractNumber() {
  if (!account) {
    return;
  }

  const currentNumber =
    account.contractNumber ||
    createContractNumber(account.id, account.openedAt);
  const normalizedNumber = String(currentNumber).replace(
    /^RF-S-/,
    'P-C-'
  );

  if (account.contractNumber === normalizedNumber) {
    return;
  }

  account = {
    ...account,
    contractNumber: normalizedNumber
  };
  storedAccounts = storedAccounts.map((item) =>
    item.id === account.id &&
    item.ownerPhone === session.phone
      ? account
      : item
  );
  localStorage.setItem(
    accountStorageKey,
    JSON.stringify(storedAccounts)
  );
}

function createActivityItem(title, date, amount, type = 'neutral') {
  const item = document.createElement('li');
  item.className = 'savings-activity__item';

  const description = document.createElement('div');
  const titleElement = document.createElement('strong');
  const dateElement = document.createElement('time');
  const amountElement = document.createElement('span');
  const activityDate = new Date(date);

  titleElement.textContent = title;
  dateElement.textContent = formatDate(date);

  if (!Number.isNaN(activityDate.getTime())) {
    dateElement.dateTime = activityDate.toISOString();
  }

  amountElement.className = 'savings-activity__amount';
  amountElement.textContent = formatMoneyPrecise(amount);

  if (type === 'positive') {
    amountElement.classList.add('is-positive');
    amountElement.textContent = `+${formatMoneyPrecise(amount)}`;
  }

  if (type === 'negative') {
    amountElement.classList.add('is-negative');
    amountElement.textContent = `−${formatMoneyPrecise(Math.abs(amount))}`;
  }

  description.append(titleElement, dateElement);
  item.append(description, amountElement);

  return item;
}

function buildInterestSchedule() {
  const schedulePrincipal = Number(
    account?.principalAmount ??
    account?.closurePrincipal ??
    account?.plannedAmount ??
    account?.balance
  );

  if (
    !account ||
    !account.fundedAt ||
    schedulePrincipal <= 0
  ) {
    return [];
  }

  const months = Number(account.termMonths) || 0;
  const rate = Number(account.fixedRate ?? account.previewRate) || 0;
  const monthlyRate = rate / 100 / 12;
  let runningBalance = Number(
    account.principalAmount ?? account.balance
  );

  return Array.from({ length: months }, (_, index) => {
    const date = addMonths(account.fundedAt, index + 1);
    const amount = runningBalance * monthlyRate;
    runningBalance += amount;

    return {
      date,
      amount,
      year: date?.getFullYear()
    };
  }).filter((item) => item.date && item.year);
}

function renderInterestSchedule(schedule) {
  const yearSelect = document.querySelector('[data-interest-year]');
  const list = document.querySelector('[data-interest-list]');
  const empty = document.querySelector('[data-interest-empty]');
  const years = [...new Set(schedule.map((item) => item.year))];

  yearSelect.replaceChildren();

  if (!years.length) {
    const option = document.createElement('option');
    option.value = String(new Date().getFullYear());
    option.textContent = `${option.value} год`;
    yearSelect.append(option);
  } else {
    years.forEach((year) => {
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = `${year} год`;
      yearSelect.append(option);
    });
  }

  function updateList() {
    const selectedYear = Number(yearSelect.value);
    const filtered = schedule.filter(
      (item) => item.year === selectedYear
    );

    list.replaceChildren();
    empty.hidden = filtered.length > 0;
    empty.textContent = schedule.length
      ? 'Расчетные начисления за выбранный год не найдены'
      : 'График появится после первого пополнения';

    filtered.forEach((item) => {
      list.append(
        createActivityItem(
          `Выплата процентов ${formatDayMonth(item.date)}`,
          item.date,
          item.amount,
          'neutral'
        )
      );
    });
  }

  yearSelect.addEventListener('change', updateList);
  updateList();
}

function renderOperations() {
  const typeSelect = document.querySelector('[data-operation-type]');
  const periodSelect = document.querySelector('[data-operation-period]');
  const list = document.querySelector('[data-operation-list]');
  const empty = document.querySelector('[data-operation-empty]');
  const operations = Array.isArray(account?.operations)
    ? account.operations
    : [];

  const operationTitles = {
    deposit: 'Пополнение счета',
    withdrawal: 'Вывод средств',
    interest: 'Начисление процентов',
    renewal: 'Пролонгация договора'
  };

  function getPeriodStart(period) {
    const date = new Date();

    if (period === 'week') {
      date.setDate(date.getDate() - 7);
    } else if (period === 'month') {
      date.setMonth(date.getMonth() - 1);
    } else if (period === 'year') {
      date.setFullYear(date.getFullYear() - 1);
    } else {
      return null;
    }

    return date;
  }

  function updateList() {
    const selectedType = typeSelect.value;
    const periodStart = getPeriodStart(periodSelect.value);

    const filtered = operations
      .filter((operation) => {
        const matchesType =
          selectedType === 'all' ||
          operation.type === selectedType;

        const operationDate = new Date(operation.createdAt);
        const matchesPeriod =
          !periodStart ||
          (
            !Number.isNaN(operationDate.getTime()) &&
            operationDate >= periodStart
          );

        return matchesType && matchesPeriod;
      })
      .sort(
        (left, right) =>
          new Date(right.createdAt) - new Date(left.createdAt)
      );

    list.replaceChildren();
    empty.hidden = filtered.length > 0;

    filtered.forEach((operation) => {
      const isWithdrawal = operation.type === 'withdrawal';
      const isIncome = ['deposit', 'interest'].includes(
        operation.type
      );

      list.append(
        createActivityItem(
          operationTitles[operation.type] || 'Операция',
          operation.createdAt,
          operation.amount,
          isWithdrawal
            ? 'negative'
            : isIncome
              ? 'positive'
              : 'neutral'
        )
      );
    });
  }

  typeSelect.addEventListener('change', updateList);
  periodSelect.addEventListener('change', updateList);
  updateList();
}

function initActivity() {
  const tabs = document.querySelectorAll('[data-activity-tab]');
  const panels = document.querySelectorAll('[data-activity-panel]');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.activityTab;

      tabs.forEach((item) => {
        const isActive = item === tab;
        item.classList.toggle('is-active', isActive);
        item.setAttribute('aria-selected', String(isActive));
      });

      panels.forEach((panel) => {
        panel.hidden = panel.dataset.activityPanel !== target;
      });
    });
  });

  renderInterestSchedule(buildInterestSchedule());
  renderOperations();
}

function renderAccount() {
  if (!account) {
    accountError.hidden = false;
    return;
  }

  const months = formatMonths(account.termMonths);
  const isFunded =
    account.status === 'active' ||
    Number(account.balance) > 0 ||
    Boolean(account.fundedAt);

  const activeRate = Number(
    account.fixedRate ?? account.previewRate
  ) || 0;

  document.querySelector('[data-account-title]').textContent =
    account.title || 'Сберегательный счет';

  document.querySelector('[data-account-balance]').textContent =
    formatMoney(
      account.status === 'closed'
        ? account.returnedAmount
        : account.balance
    );

  document.querySelector('[data-account-term]').textContent =
    `На ${months}`;

  document.querySelector('[data-account-rate]').textContent =
    `${Number(account.previewRate) || 0}%`;

  if (isNewlyOpened && account.status === 'awaiting_funding') {
    document.querySelector('[data-funding-title]').textContent =
      'Счет открыт. Пополните его, чтобы зафиксировать ставку';
  }

  if (isFunded) {
    const fundedAt = account.fundedAt || account.openedAt;
    const maturityDate =
      account.maturityDate ||
      addMonths(fundedAt, account.termMonths);

    const fixedRateLine = document.querySelector(
      '[data-account-fixed-rate]'
    );

    fixedRateLine.textContent = `Ставка ${activeRate}% годовых`;
    fixedRateLine.hidden = false;

    document.querySelector('[data-account-term]').textContent =
      `На ${months}, до ${formatLongDate(maturityDate)}`;

    document.querySelector('[data-funding-card]').hidden = true;
  }

  if (account.status === 'closure_pending') {
    const closeButton = document.querySelector('[data-close-account]');
    const processButton = document.querySelector('[data-process-closure]');

    document.querySelector('[data-closure-status]').hidden = false;
    document.querySelector('[data-pending-return]').textContent =
      formatMoneyPrecise(
        account.closurePrincipal ?? account.balance
      );
    document.querySelector('[data-closure-requested]').textContent =
      formatDate(account.closureRequestedAt);
    closeButton.disabled = true;
    closeButton.textContent = 'Заявка на закрытие подана';

    if (DEV_MOCK_CLOSURE_PROCESSING) {
      document.querySelector('[data-dev-tools]').hidden = false;
      processButton.hidden = false;
      document.querySelector(
        '[data-fail-closure-payout]'
      ).hidden = false;
    }
  }

  if (
    account.status === 'payout_failed' &&
    account.payoutReason === 'early_closure'
  ) {
    document.querySelector('[data-closure-status]').hidden = false;
    document.querySelector('[data-closure-title]').textContent =
      'Не удалось вернуть деньги';
    document.querySelector('[data-closure-message]').textContent =
      'Платеж был отклонен. Деньги остаются на счете — повторите заявку.';
    document.querySelector('[data-pending-return]').textContent =
      formatMoneyPrecise(account.payoutAmount);
    document.querySelector('[data-closure-requested]').textContent =
      formatDate(account.payoutFailedAt);
    document.querySelector(
      '[data-retry-closure-payout]'
    ).hidden = false;
    document.querySelector('[data-close-account]').hidden = true;
  }

  if (
    account.status === 'matured' ||
    account.status === 'payout_pending' ||
    (
      account.status === 'payout_failed' &&
      account.payoutReason === 'maturity'
    )
  ) {
    const maturityStatus = document.querySelector(
      '[data-maturity-status]'
    );
    const requestPayoutButton = document.querySelector(
      '[data-request-maturity-payout]'
    );
    const renewButton = document.querySelector(
      '[data-renew-savings]'
    );
    const principal = Number(
      account.principalAmount ??
      account.plannedAmount
    ) || 0;
    const interest = Number(account.earnedInterest) || 0;

    maturityStatus.hidden = false;
    document.querySelector('[data-maturity-principal]').textContent =
      formatMoneyPrecise(principal);
    document.querySelector('[data-maturity-interest]').textContent =
      formatMoneyPrecise(interest);
    document.querySelector('[data-maturity-total]').textContent =
      formatMoneyPrecise(account.balance);
    document.querySelector('[data-close-account]').hidden = true;
    document.querySelector('[data-account-term]').textContent =
      `Срок завершен ${formatLongDate(account.maturedAt)}`;
    renewButton.hidden = account.status !== 'matured';
    requestPayoutButton.hidden = account.status === 'payout_pending';

    if (account.status === 'payout_pending') {
      const destinationMask =
        account.payoutDestinationMask ||
        account.fundingCardMask ||
        'карта пополнения';

      document.querySelector('[data-maturity-title]').textContent =
        'Заявка на выплату принята';
      document.querySelector('[data-maturity-message]').textContent =
        `Выплата будет отправлена на карту ${destinationMask}. ` +
        `Срок обработки — ${account.payoutProcessingEstimate || SAVINGS_PAYOUT_PROCESSING_LABEL}.`;
      requestPayoutButton.hidden = true;
      renewButton.hidden = true;

      if (DEV_MOCK_MATURITY) {
        document.querySelector('[data-dev-tools]').hidden = false;
        document.querySelector(
          '[data-process-maturity-payout]'
        ).hidden = false;
        document.querySelector(
          '[data-fail-maturity-payout]'
        ).hidden = false;
      }
    }

    if (account.status === 'payout_failed') {
      document.querySelector('[data-maturity-title]').textContent =
        'Не удалось выполнить выплату';
      document.querySelector('[data-maturity-message]').textContent =
        'Платеж был отклонен. Деньги остаются на счете — повторите заявку.';
      requestPayoutButton.textContent = 'Повторить заявку';
      renewButton.hidden = true;
    }
  }

  if (
    DEV_MOCK_MATURITY &&
    account.status === 'active'
  ) {
    document.querySelector('[data-dev-tools]').hidden = false;
    document.querySelector('[data-simulate-maturity]').hidden = false;
  }

  if (account.status === 'closed') {
    const closeReasons = {
      early_closure: 'Досрочное закрытие',
      maturity: 'Окончание срока'
    };

    document.querySelector('[data-closed-status]').hidden = false;
    document.querySelector('[data-account-closed]').textContent =
      formatDate(account.closedAt);
    document.querySelector('[data-account-returned]').textContent =
      formatMoneyPrecise(account.returnedAmount);
    document.querySelector('[data-account-close-reason]').textContent =
      closeReasons[account.closeReason] ||
      (
        account.closureType === 'early'
          ? closeReasons.early_closure
          : 'Закрытие счета'
      );
    document.querySelector('[data-close-account]').hidden = true;
    document.querySelector('[data-funding-card]').hidden = true;
    document.querySelector('[data-account-term]').textContent =
      `Закрыт ${formatLongDate(account.closedAt)}`;
  }

  document.querySelector('[data-contract-number]').textContent =
    account.contractNumber ||
    createContractNumber(account.id, account.openedAt);

  document.querySelector('[data-account-opened]').textContent =
    formatDate(account.openedAt);

  document.title = `${account.title || 'Сберегательный счет'} — Р-Финанс`;
  accountContent.hidden = false;
  initActivity();
}

document.querySelector('[data-fund-account]')?.addEventListener('click', () => {
  if (!account || account.status !== 'awaiting_funding') {
    return;
  }

  const fundingAmount = Number(account.plannedAmount) || 50000;
  const fundedAt = new Date();
  const maturityDate = addMonths(fundedAt, account.termMonths);
  const currentRate = window.RFSavingsCalculator.getRate(
    account.termMonths
  );
  const calculation = window.RFSavingsCalculator.calculate(
    fundingAmount,
    account.termMonths,
    currentRate
  );
  const dialog = document.querySelector('[data-funding-dialog]');
  const consent = document.querySelector(
    '[data-funding-dialog-consent]'
  );
  const confirmButton = document.querySelector(
    '[data-confirm-funding]'
  );

  if (!maturityDate || !dialog || !consent || !confirmButton) {
    return;
  }

  pendingFundingTerms = {
    amount: fundingAmount,
    termMonths: Number(account.termMonths) || 0,
    rate: currentRate,
    calculation,
    fundedAt,
    maturityDate
  };

  document.querySelector('[data-funding-dialog-amount]').textContent =
    formatMoneyPrecise(fundingAmount);
  document.querySelector('[data-funding-dialog-term]').textContent =
    formatMonths(account.termMonths);
  document.querySelector('[data-funding-dialog-rate]').textContent =
    `${currentRate}% годовых`;
  document.querySelector('[data-funding-dialog-maturity]').textContent =
    formatLongDate(maturityDate);
  document.querySelector('[data-funding-dialog-total]').textContent =
    formatMoneyPrecise(calculation.finalAmount);

  consent.checked = false;
  confirmButton.disabled = true;
  dialog.showModal();
});

document.querySelector('[data-funding-dialog-consent]')?.addEventListener(
  'change',
  (event) => {
    const confirmButton = document.querySelector(
      '[data-confirm-funding]'
    );

    confirmButton.disabled = !event.currentTarget.checked;
  }
);

document.querySelector('[data-confirm-funding]')?.addEventListener('click', () => {
  const consent = document.querySelector(
    '[data-funding-dialog-consent]'
  );

  if (
    !account ||
    account.status !== 'awaiting_funding' ||
    !pendingFundingTerms ||
    !consent?.checked
  ) {
    return;
  }

  const {
    amount: fundingAmount,
    termMonths,
    rate: currentRate,
    calculation: currentCalculation,
    fundedAt,
    maturityDate
  } = pendingFundingTerms;
  const acceptedAt = fundedAt.toISOString();
  const operationId =
    typeof crypto.randomUUID === 'function'
      ? `operation-${crypto.randomUUID()}`
      : `operation-${Date.now()}`;
  const fundingTransactionId =
    typeof crypto.randomUUID === 'function'
      ? `funding-${crypto.randomUUID()}`
      : `funding-${Date.now()}`;

  const updatedAccounts = storedAccounts.map((item) => {
    if (
      item.id !== account.id ||
      item.ownerPhone !== session.phone
    ) {
      return item;
    }

    return {
      ...item,
      balance: fundingAmount,
      principalAmount: fundingAmount,
      fundingTransactionId,
      fundingProvider: 'mock-payments',
      fundingMethod: 'bank_card',
      fundingCardMask: '•••• 0000',
      previewRate: currentRate,
      fixedRate: currentRate,
      rateFixedAt: acceptedAt,
      projectedIncome: currentCalculation.income,
      projectedFinalAmount: currentCalculation.finalAmount,
      initialTermsAcceptedAt: item.initialTermsAcceptedAt ||
        item.preliminaryTermsAcceptedAt ||
        item.termsAcceptedAt ||
        null,
      termsAcceptedAt: acceptedAt,
      finalTermsAcceptedAt: acceptedAt,
      consentMethod: 'checkbox_funding_confirmation_mock',
      contractSnapshot: {
        ...(item.previewSnapshot || item.contractSnapshot || {}),
        amount: fundingAmount,
        termMonths,
        annualRate: currentRate,
        projectedIncome: currentCalculation.income,
        projectedFinalAmount: currentCalculation.finalAmount,
        finalizedAt: acceptedAt
      },
      status: 'active',
      fundedAt: acceptedAt,
      maturityDate: maturityDate.toISOString(),
      operations: [
        ...(Array.isArray(item.operations) ? item.operations : []),
        {
          id: operationId,
          type: 'deposit',
          amount: fundingAmount,
          status: 'completed',
          createdAt: acceptedAt
        }
      ]
    };
  });

  localStorage.setItem(
    'rf_savings_accounts',
    JSON.stringify(updatedAccounts)
  );
  const fundingPayments = readStorage('rf_savings_payments', []);

  localStorage.setItem(
    'rf_savings_payments',
    JSON.stringify([
      ...(Array.isArray(fundingPayments) ? fundingPayments : []),
      {
        id: fundingTransactionId,
        ownerPhone: session.phone,
        accountId: account.id,
        direction: 'incoming',
        amount: fundingAmount,
        provider: 'mock-payments',
        method: 'bank_card',
        maskedCard: '•••• 0000',
        status: 'completed',
        createdAt: acceptedAt
      }
    ])
  );

  pendingFundingTerms = null;
  window.location.reload();
});

document.querySelector('[data-close-account]')?.addEventListener('click', () => {
  if (!account) {
    return;
  }

  const hasFirstFunding =
    Number(account.balance) > 0 || Boolean(account.fundedAt);

  if (hasFirstFunding) {
    if (hasContractMatured()) {
      window.alert(
        'Срок счета завершен. Закрытие с выплатой процентов добавим отдельным сценарием.'
      );
      return;
    }

    const closeDialog = document.querySelector('[data-close-dialog]');

    document.querySelector('[data-close-return]').textContent =
      formatMoneyPrecise(account.balance);
    document.querySelector('[data-close-interest]').textContent =
      formatMoneyPrecise(calculateAccruedInterest());
    closeDialog.showModal();
    return;
  }

  const shouldClose = window.confirm(
    'Закрыть счет? Это действие нельзя отменить.'
  );

  if (!shouldClose) {
    return;
  }

  const remainingAccounts = storedAccounts.filter(
    (item) =>
      item.id !== account.id ||
      item.ownerPhone !== session.phone
  );

  localStorage.setItem(
    'rf_savings_accounts',
    JSON.stringify(remainingAccounts)
  );

  window.location.replace('dashboard.html?accountClosed=savings');
});

document.querySelector('[data-confirm-close]')?.addEventListener('click', () => {
  if (!account || account.status === 'closure_pending') {
    return;
  }

  const requestedAt = new Date().toISOString();
  const updatedAccounts = storedAccounts.map((item) => {
    if (
      item.id !== account.id ||
      item.ownerPhone !== session.phone
    ) {
      return item;
    }

    return {
      ...item,
      status: 'closure_pending',
      closureType: 'early',
      closureRequestedAt: requestedAt,
      closurePrincipal: Number(item.balance) || 0,
      forfeitedInterest: calculateAccruedInterest()
    };
  });

  localStorage.setItem(
    'rf_savings_accounts',
    JSON.stringify(updatedAccounts)
  );

  window.location.reload();
});

function finalizeAccountPayout(reason, returnAmount) {
  const processedAt = new Date().toISOString();
  const payoutId =
    typeof crypto.randomUUID === 'function'
      ? `payout-${crypto.randomUUID()}`
      : `payout-${Date.now()}`;
  const payoutOperationId =
    typeof crypto.randomUUID === 'function'
      ? `operation-${crypto.randomUUID()}`
      : `operation-${Date.now()}-payout`;
  const closedAccount = {
    ...account,
    balance: 0,
    status: 'closed',
    closedAt: processedAt,
    closeReason: reason,
    payoutProcessedAt: processedAt,
    ...(reason === 'early_closure'
      ? { closureProcessedAt: processedAt }
      : {}),
    returnedAmount: returnAmount,
    payoutId,
    operations: [
      ...(Array.isArray(account.operations) ? account.operations : []),
      {
        id: payoutOperationId,
        type: 'withdrawal',
        amount: returnAmount,
        status: 'completed',
        createdAt: processedAt
      }
    ]
  };
  const remainingAccounts = storedAccounts.filter(
    (item) =>
      item.id !== account.id ||
      item.ownerPhone !== session.phone
  );
  const closedAccounts = readStorage(
    'rf_closed_savings_accounts',
    []
  );
  const payouts = readStorage('rf_savings_payouts', []);

  localStorage.setItem(
    'rf_savings_accounts',
    JSON.stringify(remainingAccounts)
  );
  localStorage.setItem(
    'rf_closed_savings_accounts',
    JSON.stringify([
      ...(Array.isArray(closedAccounts) ? closedAccounts : []),
      closedAccount
    ])
  );
  localStorage.setItem(
    'rf_savings_payouts',
    JSON.stringify([
      ...(Array.isArray(payouts) ? payouts : []),
      {
        id: payoutId,
        ownerPhone: session.phone,
        accountId: account.id,
        contractNumber: account.contractNumber,
        amount: returnAmount,
        reason,
        sourceTransactionId: account.fundingTransactionId || null,
        provider: account.fundingProvider || 'mock-payments',
        destinationMethod: account.fundingMethod || 'bank_card',
        destinationMask: account.fundingCardMask || null,
        status: 'completed',
        createdAt: processedAt
      }
    ])
  );
  localStorage.setItem(
    'rf_dashboard_notice',
    JSON.stringify({
      ownerPhone: session.phone,
      type: 'savings_closed',
      amount: returnAmount
    })
  );

  window.location.replace('dashboard.html');
}

function markPayoutFailed(reason, returnAmount) {
  const failedAt = new Date().toISOString();
  const payoutAttemptId =
    typeof crypto.randomUUID === 'function'
      ? `payout-${crypto.randomUUID()}`
      : `payout-${Date.now()}-failed`;
  const updatedAccounts = storedAccounts.map((item) => {
    if (
      item.id !== account.id ||
      item.ownerPhone !== session.phone
    ) {
      return item;
    }

    return {
      ...item,
      status: 'payout_failed',
      payoutReason: reason,
      payoutAmount: returnAmount,
      payoutFailedAt: failedAt,
      payoutErrorCode: 'MOCK_PROVIDER_REJECTED'
    };
  });

  localStorage.setItem(
    'rf_savings_accounts',
    JSON.stringify(updatedAccounts)
  );
  const payouts = readStorage('rf_savings_payouts', []);

  localStorage.setItem(
    'rf_savings_payouts',
    JSON.stringify([
      ...(Array.isArray(payouts) ? payouts : []),
      {
        id: payoutAttemptId,
        ownerPhone: session.phone,
        accountId: account.id,
        contractNumber: account.contractNumber,
        amount: returnAmount,
        reason,
        sourceTransactionId: account.fundingTransactionId || null,
        provider: account.fundingProvider || 'mock-payments',
        destinationMethod: account.fundingMethod || 'bank_card',
        destinationMask: account.fundingCardMask || null,
        status: 'failed',
        errorCode: 'MOCK_PROVIDER_REJECTED',
        createdAt: failedAt
      }
    ])
  );
  window.location.reload();
}

document.querySelector('[data-simulate-maturity]')?.addEventListener('click', () => {
  if (
    !DEV_MOCK_MATURITY ||
    !account ||
    account.status !== 'active'
  ) {
    return;
  }

  const shouldSimulate = window.confirm(
    'Имитировать наступление даты окончания срока счета?'
  );

  if (!shouldSimulate) {
    return;
  }

  const maturedAt = new Date().toISOString();
  const simulatedAccount = createMaturedAccount({
    ...account,
    originalMaturityDate: account.maturityDate,
    maturityDate: maturedAt
  });
  const updatedAccounts = storedAccounts.map((item) =>
    item.id === account.id &&
    item.ownerPhone === session.phone
      ? simulatedAccount
      : item
  );

  localStorage.setItem(
    'rf_savings_accounts',
    JSON.stringify(updatedAccounts)
  );
  window.location.reload();
});

document.querySelector('[data-renew-savings]')?.addEventListener('click', () => {
  if (!account || account.status !== 'matured') {
    return;
  }

  const principal = Number(account.balance) || 0;
  const termMonths = Number(account.termMonths) || 0;
  const currentRate = window.RFSavingsCalculator.getRate(
    termMonths
  );
  const calculation = window.RFSavingsCalculator.calculate(
    principal,
    termMonths,
    currentRate
  );
  const maturityDate = addMonths(new Date(), termMonths);
  const dialog = document.querySelector('[data-renewal-dialog]');
  const consent = document.querySelector(
    '[data-renewal-dialog-consent]'
  );
  const confirmButton = document.querySelector(
    '[data-confirm-renewal]'
  );

  if (!maturityDate || !dialog || !consent || !confirmButton) {
    return;
  }

  pendingRenewalTerms = {
    principal,
    termMonths,
    currentRate,
    calculation
  };

  document.querySelector('[data-renewal-dialog-amount]').textContent =
    formatMoneyPrecise(principal);
  document.querySelector('[data-renewal-dialog-term]').textContent =
    formatMonths(termMonths);
  document.querySelector('[data-renewal-dialog-rate]').textContent =
    `${currentRate}% годовых`;
  document.querySelector('[data-renewal-dialog-maturity]').textContent =
    formatLongDate(maturityDate);
  document.querySelector('[data-renewal-dialog-total]').textContent =
    formatMoneyPrecise(calculation.finalAmount);

  consent.checked = false;
  confirmButton.disabled = true;
  dialog.showModal();
});

document.querySelector('[data-renewal-dialog-consent]')?.addEventListener(
  'change',
  (event) => {
    const confirmButton = document.querySelector(
      '[data-confirm-renewal]'
    );

    confirmButton.disabled = !event.currentTarget.checked;
  }
);

document.querySelector('[data-confirm-renewal]')?.addEventListener('click', () => {
  const consent = document.querySelector(
    '[data-renewal-dialog-consent]'
  );

  if (
    !account ||
    account.status !== 'matured' ||
    !pendingRenewalTerms ||
    !consent?.checked
  ) {
    return;
  }

  const {
    principal,
    termMonths,
    currentRate,
    calculation
  } = pendingRenewalTerms;
  const renewedAt = new Date();
  const maturityDate = addMonths(renewedAt, termMonths);

  if (!maturityDate) {
    return;
  }

  const renewedAtIso = renewedAt.toISOString();
  const renewalOperationId =
    typeof crypto.randomUUID === 'function'
      ? `operation-${crypto.randomUUID()}`
      : `operation-${Date.now()}-renewal`;
  const renewalRecord = {
    sequence: Number(account.renewalCount || 0) + 1,
    renewedAt: renewedAtIso,
    previousMaturityDate:
      account.maturedAt || account.maturityDate,
    amount: Number(principal.toFixed(2)),
    termMonths,
    annualRate: currentRate,
    projectedIncome: calculation.income,
    projectedFinalAmount: calculation.finalAmount,
    consentMethod: 'checkbox_renewal_confirmation_mock',
    previousContractSnapshot:
      account.contractSnapshot || null
  };
  const renewedContractSnapshot = {
    productCode: 'savings-fixed-term',
    productName: 'Сберегательный счет',
    amount: Number(principal.toFixed(2)),
    termMonths,
    annualRate: currentRate,
    projectedIncome: calculation.income,
    projectedFinalAmount: calculation.finalAmount,
    capitalization: 'monthly',
    interestPayout: 'at_maturity',
    additionalFunding: false,
    partialWithdrawal: false,
    earlyClosureInterest: 'forfeited',
    calculationVersion:
      account.contractSnapshot?.calculationVersion ||
      'monthly-capitalization-v1'
  };
  const renewedAccount = {
    ...account,
    plannedAmount: Number(principal.toFixed(2)),
    principalAmount: Number(principal.toFixed(2)),
    balance: Number(principal.toFixed(2)),
    fixedRate: currentRate,
    previewRate: currentRate,
    projectedIncome: calculation.income,
    projectedFinalAmount: calculation.finalAmount,
    contractSnapshot: renewedContractSnapshot,
    status: 'active',
    fundedAt: renewedAtIso,
    maturityDate: maturityDate.toISOString(),
    maturedAt: null,
    earnedInterest: 0,
    renewalCount: renewalRecord.sequence,
    lastRenewedAt: renewedAtIso,
    renewalTermsAcceptedAt: renewedAtIso,
    renewalConsentMethod: 'checkbox_renewal_confirmation_mock',
    renewals: [
      ...(Array.isArray(account.renewals)
        ? account.renewals
        : []),
      renewalRecord
    ],
    operations: [
      ...(Array.isArray(account.operations)
        ? account.operations
        : []),
      {
        id: renewalOperationId,
        type: 'renewal',
        amount: Number(principal.toFixed(2)),
        status: 'completed',
        createdAt: renewedAtIso
      }
    ],
    payoutReason: null,
    payoutRequestedAt: null,
    payoutAmount: null,
    payoutFailedAt: null,
    payoutErrorCode: null
  };

  storedAccounts = storedAccounts.map((item) =>
    item.id === account.id &&
    item.ownerPhone === session.phone
      ? renewedAccount
      : item
  );
  account = renewedAccount;

  localStorage.setItem(
    'rf_savings_accounts',
    JSON.stringify(storedAccounts)
  );
  localStorage.setItem(
    'rf_dashboard_notice',
    JSON.stringify({
      ownerPhone: session.phone,
      type: 'savings_renewed',
      amount: principal,
      rate: currentRate,
      termMonths
    })
  );
  pendingRenewalTerms = null;
  window.location.reload();
});

document.querySelector('[data-request-maturity-payout]')?.addEventListener('click', () => {
  if (
    !account ||
    !(
      account.status === 'matured' ||
      (
        account.status === 'payout_failed' &&
        account.payoutReason === 'maturity'
      )
    )
  ) {
    return;
  }

  const payoutAmount = Number(account.balance) || 0;
  const destinationMask = account.fundingCardMask || '•••• 0000';
  const dialog = document.querySelector('[data-payout-dialog]');

  if (!dialog) {
    return;
  }

  pendingMaturityPayout = {
    amount: payoutAmount,
    destinationMask
  };

  document.querySelector('[data-payout-dialog-amount]').textContent =
    formatMoneyPrecise(payoutAmount);
  document.querySelector('[data-payout-dialog-card]').textContent =
    destinationMask;
  document.querySelector('[data-payout-dialog-time]').textContent =
    SAVINGS_PAYOUT_PROCESSING_LABEL;
  dialog.showModal();
});

document.querySelector('[data-confirm-maturity-payout]')?.addEventListener(
  'click',
  () => {
    if (
      !account ||
      !pendingMaturityPayout ||
      !(
        account.status === 'matured' ||
        (
          account.status === 'payout_failed' &&
          account.payoutReason === 'maturity'
        )
      )
    ) {
      return;
    }

    const {
      amount: payoutAmount,
      destinationMask
    } = pendingMaturityPayout;
    const requestedAt = new Date().toISOString();
    const updatedAccounts = storedAccounts.map((item) => {
      if (
        item.id !== account.id ||
        item.ownerPhone !== session.phone
      ) {
        return item;
      }

      return {
        ...item,
        status: 'payout_pending',
        payoutReason: 'maturity',
        payoutRequestedAt: requestedAt,
        payoutAmount,
        payoutDestinationMask: destinationMask,
        payoutProcessingEstimate: SAVINGS_PAYOUT_PROCESSING_LABEL,
        payoutFailedAt: null,
        payoutErrorCode: null
      };
    });

    localStorage.setItem(
      'rf_savings_accounts',
      JSON.stringify(updatedAccounts)
    );
    pendingMaturityPayout = null;
    window.location.reload();
  }
);

document.querySelector('[data-process-closure]')?.addEventListener('click', () => {
  const processButton = document.querySelector('[data-process-closure]');

  if (
    !DEV_MOCK_CLOSURE_PROCESSING ||
    !account ||
    account.status !== 'closure_pending' ||
    processButton.disabled
  ) {
    return;
  }

  const returnAmount = Number(
    account.closurePrincipal ?? account.balance
  ) || 0;
  const shouldProcess = window.confirm(
    `Имитировать возврат ${formatMoney(returnAmount)} и окончательно закрыть счет?`
  );

  if (!shouldProcess) {
    return;
  }

  processButton.disabled = true;
  processButton.textContent = 'Обрабатываем заявку...';
  finalizeAccountPayout('early_closure', returnAmount);
});

document.querySelector('[data-fail-closure-payout]')?.addEventListener('click', () => {
  if (!account || account.status !== 'closure_pending') {
    return;
  }

  const returnAmount = Number(
    account.closurePrincipal ?? account.balance
  ) || 0;

  markPayoutFailed('early_closure', returnAmount);
});

document.querySelector('[data-retry-closure-payout]')?.addEventListener('click', () => {
  if (
    !account ||
    account.status !== 'payout_failed' ||
    account.payoutReason !== 'early_closure'
  ) {
    return;
  }

  const requestedAt = new Date().toISOString();
  const updatedAccounts = storedAccounts.map((item) => {
    if (
      item.id !== account.id ||
      item.ownerPhone !== session.phone
    ) {
      return item;
    }

    return {
      ...item,
      status: 'closure_pending',
      closureRequestedAt: requestedAt,
      payoutFailedAt: null,
      payoutErrorCode: null
    };
  });

  localStorage.setItem(
    'rf_savings_accounts',
    JSON.stringify(updatedAccounts)
  );
  window.location.reload();
});

document.querySelector('[data-process-maturity-payout]')?.addEventListener('click', () => {
  const processButton = document.querySelector(
    '[data-process-maturity-payout]'
  );

  if (
    !DEV_MOCK_MATURITY ||
    !account ||
    account.status !== 'payout_pending' ||
    processButton.disabled
  ) {
    return;
  }

  const returnAmount = Number(
    account.payoutAmount ?? account.balance
  ) || 0;
  const shouldProcess = window.confirm(
    `Имитировать выплату ${formatMoney(returnAmount)} и закрыть счет?`
  );

  if (!shouldProcess) {
    return;
  }

  processButton.disabled = true;
  processButton.textContent = 'Выполняем выплату...';
  finalizeAccountPayout('maturity', returnAmount);
});

document.querySelector('[data-fail-maturity-payout]')?.addEventListener('click', () => {
  if (!account || account.status !== 'payout_pending') {
    return;
  }

  const returnAmount = Number(
    account.payoutAmount ?? account.balance
  ) || 0;

  markPayoutFailed('maturity', returnAmount);
});

synchronizeSavingsContractNumber();
synchronizeMaturity();
synchronizeAwaitingFundingRate();
renderAccount();
