function readAccountStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

const accountSession = readAccountStorage('rf_session', null);

if (!accountSession) {
  window.location.replace('login.html');
}

const query = new URLSearchParams(window.location.search);
const requestedLineId = query.get('id');
let creditLines = readAccountStorage('rf_credit_lines', []);
let creditLineIndex = Array.isArray(creditLines)
  ? creditLines.findIndex(
      (line) =>
        line.id === requestedLineId &&
        line.ownerPhone === accountSession?.phone
    )
  : -1;
let creditLine = creditLineIndex >= 0
  ? creditLines[creditLineIndex]
  : null;

const content = document.querySelector('[data-credit-account-content]');
const errorSection = document.querySelector('[data-credit-account-error]');
const SCHEDULE_PREVIEW_LIMIT = 3;
const OPERATIONS_PREVIEW_LIMIT = 3;
const THIRD_STAGE_REPAID_PRINCIPAL = 30000;
const THIRD_STAGE_CREDIT_LIMIT = 50000;
let scheduleExpanded = false;
let operationsExpanded = false;

function formatMoney(value) {
  return `${Number(value).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })} ₽`;
}

function formatDate(value) {
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

function createCreditContractNumber(line) {
  const signedAt = new Date(
    line?.agreementSignedAt ||
    line?.drawdowns?.[0]?.issuedAt
  );
  const validDate = !Number.isNaN(signedAt.getTime());
  const datePart = validDate
    ? [
        signedAt.getFullYear(),
        String(signedAt.getMonth() + 1).padStart(2, '0'),
        String(signedAt.getDate()).padStart(2, '0')
      ].join('')
    : '00000000';
  const idPart = String(line?.id || '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(-6)
    .toUpperCase()
    .padStart(6, '0');

  return `P-K-${datePart}-${idPart}`;
}

function synchronizeCreditContractNumber() {
  if (!creditLine) {
    return;
  }

  const currentNumber =
    creditLine.contractNumber ||
    createCreditContractNumber(creditLine);
  const normalizedNumber = String(currentNumber).replace(
    /^RF-CL-/,
    'P-K-'
  );

  if (creditLine.contractNumber === normalizedNumber) {
    return;
  }

  creditLine.contractNumber = normalizedNumber;
  saveCreditLine();
}

function getDayStart(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getEffectiveNow(drawdown) {
  const simulatedNow = new Date(drawdown?.devNow);

  return drawdown?.devNow && !Number.isNaN(simulatedNow.getTime())
    ? simulatedNow
    : new Date();
}

function getCalendarDayDifference(laterValue, earlierValue) {
  const later = getDayStart(laterValue);
  const earlier = getDayStart(earlierValue);

  return Math.max(
    0,
    Math.round((later - earlier) / 86400000)
  );
}

function isPaymentDue(payment, drawdown) {
  if (!payment) {
    return false;
  }

  return payment.status === 'overdue' ||
    getDayStart(payment.dueAt) <= getDayStart(
      getEffectiveNow(drawdown)
    );
}

function calculateAccruedInterest(drawdown, asOfValue) {
  const asOf = new Date(asOfValue);
  const rate = Number(drawdown.dailyRate) || 0;
  let outstandingPrincipal = Number(drawdown.amount) || 0;
  let cursor = new Date(drawdown.issuedAt);
  let accruedInterest = 0;

  const paidPayments = drawdown.schedule
    .filter((payment) => payment.status === 'paid' && payment.paidAt)
    .slice()
    .sort((left, right) => new Date(left.paidAt) - new Date(right.paidAt));

  paidPayments.forEach((payment) => {
    const paidAt = new Date(payment.paidAt);

    if (paidAt > asOf) {
      return;
    }

    accruedInterest += outstandingPrincipal * rate *
      getCalendarDayDifference(paidAt, cursor);
    outstandingPrincipal = Math.max(
      0,
      outstandingPrincipal - Number(
        payment.principalPaid ?? payment.principal
      )
    );
    cursor = paidAt;
  });

  accruedInterest += outstandingPrincipal * rate *
    getCalendarDayDifference(asOf, cursor);

  return window.RFCreditLineCalculator.roundMoney(accruedInterest);
}

function getPaidInterest(drawdown) {
  return window.RFCreditLineCalculator.roundMoney(
    drawdown.schedule.reduce(
      (total, payment) =>
        total + Number(payment.interestPaidAmount || 0),
      0
    )
  );
}

function getPaidPenalty(drawdown) {
  return window.RFCreditLineCalculator.roundMoney(
    drawdown.schedule.reduce(
      (total, payment) =>
        total + Number(payment.penaltyPaidAmount || 0),
      0
    )
  );
}

function getChargeCap(drawdown) {
  const multiplier = Number(drawdown.maxChargeMultiplier) ||
    window.RFCreditLineCalculator.MAX_CHARGE_MULTIPLIER;

  return window.RFCreditLineCalculator.roundMoney(
    (Number(drawdown.amount) || 0) * multiplier
  );
}

function getCappedAccruedInterest(drawdown, asOfValue) {
  const availableForInterest = Math.max(
    0,
    getChargeCap(drawdown) - getPaidPenalty(drawdown)
  );

  return Math.min(
    calculateAccruedInterest(drawdown, asOfValue),
    availableForInterest
  );
}

function calculatePaymentPenalty(drawdown, payment, asOfValue) {
  const overdueDays = getCalendarDayDifference(
    asOfValue,
    payment.dueAt
  );

  if (overdueDays <= 0) {
    return 0;
  }

  const annualRate = Number(drawdown.penaltyAnnualRate) ||
    window.RFCreditLineCalculator.PENALTY_ANNUAL_RATE;
  const rawPenalty = (Number(payment.principal) || 0) *
    annualRate / 365 * overdueDays;
  const availableForPenalty = Math.max(
    0,
    getChargeCap(drawdown) -
      getCappedAccruedInterest(drawdown, asOfValue) -
      getPaidPenalty(drawdown)
  );

  return window.RFCreditLineCalculator.roundMoney(
    Math.min(rawPenalty, availableForPenalty)
  );
}

function hasPromoBeenLost(drawdown) {
  return Boolean(drawdown.promoLostAt) || drawdown.schedule.some(
    (payment) => Number(payment.interestPaidAmount) > 0
  );
}

function supportsZeroPercentPromo(drawdown) {
  return drawdown.productCode === 'first-drawdown' ||
    (
      Number(drawdown.sequence) === 1 &&
      drawdown.productCode !== 'standard-drawdown'
    );
}

function synchronizePromoEligibility(drawdown) {
  const shouldBeEligible = supportsZeroPercentPromo(drawdown) &&
    !hasPromoBeenLost(drawdown);

  if (drawdown.promoEligible === shouldBeEligible) {
    return;
  }

  drawdown.promoEligible = shouldBeEligible;
  saveCreditLine();
}

function getPaymentBreakdown(drawdown, payment, asOfValue) {
  const principal = Number(payment.principal) || 0;
  const accruedInterest = getCappedAccruedInterest(
    drawdown,
    asOfValue
  );
  const interest = drawdown.promoEligible
    ? 0
    : Math.max(0, accruedInterest - getPaidInterest(drawdown));
  const penalty = calculatePaymentPenalty(
    drawdown,
    payment,
    asOfValue
  );

  return {
    principal: window.RFCreditLineCalculator.roundMoney(principal),
    interest: window.RFCreditLineCalculator.roundMoney(interest),
    penalty,
    total: window.RFCreditLineCalculator.roundMoney(
      principal + interest + penalty
    )
  };
}

function createOperationId() {
  return typeof crypto.randomUUID === 'function'
    ? `operation-${crypto.randomUUID()}`
    : `operation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function recordOperation(drawdown, operation) {
  if (!Array.isArray(drawdown.operations)) {
    drawdown.operations = [];
  }

  drawdown.operations.push({
    id: createOperationId(),
    createdAt: getEffectiveNow(drawdown).toISOString(),
    ...operation
  });
}

function ensureOperations(drawdown) {
  let hasChanges = false;

  if (!Array.isArray(drawdown.operations)) {
    drawdown.operations = [];
    hasChanges = true;
  }

  const issuanceSourceId = `issuance-${drawdown.id}`;
  if (!drawdown.operations.some(
    (operation) => operation.sourceId === issuanceSourceId
  )) {
    drawdown.operations.push({
      id: createOperationId(),
      sourceId: issuanceSourceId,
      type: 'issuance',
      title: 'Выдача займа',
      amount: Number(drawdown.amount) || 0,
      direction: 'incoming',
      status: 'completed',
      createdAt: drawdown.issuedAt
    });
    hasChanges = true;
  }

  drawdown.schedule.forEach((payment) => {
    if (
      payment.status !== 'paid' ||
      drawdown.operations.some(
        (operation) => operation.sourceId === payment.id
      )
    ) {
      return;
    }

    drawdown.operations.push({
      id: createOperationId(),
      sourceId: payment.id,
      type: payment.isEarlyRepayment
        ? 'early_repayment'
        : 'payment',
      title: payment.isEarlyRepayment
        ? 'Досрочное погашение'
        : 'Платеж по графику',
      amount: Number(payment.paidAmount) || 0,
      direction: 'outgoing',
      status: 'completed',
      createdAt: payment.paidAt
    });
    hasChanges = true;
  });

  return hasChanges;
}

function renderOperations(line) {
  const list = document.querySelector('[data-credit-operations]');
  const toggleButton = document.querySelector(
    '[data-credit-operations-toggle]'
  );
  const operationTitles = {
    issuance: 'Выдача займа',
    payment: 'Платеж по графику',
    early_repayment: 'Досрочное погашение'
  };
  const storedOperations = line.drawdowns.flatMap((drawdown) =>
    Array.isArray(drawdown.operations)
      ? drawdown.operations
      : []
  ).filter((operation) => operation.type in operationTitles);
  const groupedScheduledPayments = new Map();
  const operations = [];

  storedOperations.forEach((operation) => {
    if (operation.type !== 'payment' || operation.status !== 'completed') {
      operations.push(operation);
      return;
    }

    const operationDate = new Date(operation.createdAt);
    const dateKey = [
      operationDate.getFullYear(),
      String(operationDate.getMonth() + 1).padStart(2, '0'),
      String(operationDate.getDate()).padStart(2, '0')
    ].join('-');
    const existingGroup = groupedScheduledPayments.get(dateKey);

    if (existingGroup) {
      existingGroup.amount = window.RFCreditLineCalculator.roundMoney(
        Number(existingGroup.amount) + Number(operation.amount)
      );
      return;
    }

    const groupedOperation = { ...operation };
    groupedScheduledPayments.set(dateKey, groupedOperation);
    operations.push(groupedOperation);
  });

  list.replaceChildren();

  operations.sort(
    (left, right) =>
      new Date(right.createdAt) - new Date(left.createdAt)
  );
  const visibleOperations = operationsExpanded
    ? operations
    : operations.slice(0, OPERATIONS_PREVIEW_LIMIT);

  visibleOperations.forEach((operation) => {
    const item = document.createElement('li');
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const date = document.createElement('time');
    const amount = document.createElement('span');

    item.className = 'credit-operation';
    item.classList.add(`is-${operation.status}`);
    item.classList.add(`is-${operation.direction}`);
    title.textContent = operationTitles[operation.type];
    date.dateTime = operation.createdAt;
    date.textContent = formatDate(operation.createdAt);

    if (operation.status === 'failed') {
      amount.textContent = 'Не выполнено';
    } else {
      const sign = operation.direction === 'incoming' ? '+' : '−';
      amount.textContent = `${sign}${formatMoney(operation.amount)}`;
    }

    copy.append(title, date);
    item.append(copy, amount);
    list.append(item);
  });

  toggleButton.hidden = operations.length <= OPERATIONS_PREVIEW_LIMIT;
  toggleButton.textContent = operationsExpanded
    ? 'Свернуть'
    : 'Все операции';
  toggleButton.setAttribute(
    'aria-expanded',
    String(operationsExpanded)
  );
}

function toggleOperations() {
  operationsExpanded = !operationsExpanded;
  renderOperations(creditLine);
}

function saveCreditLine() {
  creditLines[creditLineIndex] = creditLine;
  localStorage.setItem('rf_credit_lines', JSON.stringify(creditLines));
}

function getOpenDrawdowns() {
  if (!creditLine || !Array.isArray(creditLine.drawdowns)) {
    return [];
  }

  return creditLine.drawdowns.filter((drawdown) =>
    ['active', 'overdue'].includes(drawdown.status)
  );
}

function getOutstandingPrincipal() {
  return window.RFCreditLineCalculator.roundMoney(
    getOpenDrawdowns().reduce(
      (total, drawdown) =>
        total + Number(drawdown.outstandingPrincipal || 0),
      0
    )
  );
}

function getRepaidStandardPrincipal() {
  if (!creditLine || !Array.isArray(creditLine.drawdowns)) {
    return 0;
  }

  return window.RFCreditLineCalculator.roundMoney(
    creditLine.drawdowns.reduce((drawdownsTotal, drawdown) => {
      if (Number(drawdown.sequence) <= 1 || !Array.isArray(drawdown.schedule)) {
        return drawdownsTotal;
      }

      return drawdownsTotal + drawdown.schedule.reduce(
        (paymentsTotal, payment) =>
          paymentsTotal + (
            payment.status === 'paid'
              ? Number(
                  payment.principalPaid ??
                  payment.principal ??
                  0
                )
              : 0
          ),
        0
      );
    }, 0)
  );
}

function promoteCreditLineIfEligible() {
  const canPromote = Number(creditLine.level) === 2 &&
    getOpenDrawdowns().length === 0 &&
    getRepaidStandardPrincipal() >= THIRD_STAGE_REPAID_PRINCIPAL;

  if (!canPromote) {
    return false;
  }

  creditLine.level = 3;
  creditLine.limit = THIRD_STAGE_CREDIT_LIMIT;
  creditLine.limitIncreasedAt = new Date().toISOString();
  return true;
}

function recalculateAvailableLimit() {
  creditLine.availableLimit = window.RFCreditLineCalculator.roundMoney(
    Math.max(0, Number(creditLine.limit) - getOutstandingPrincipal())
  );
}

function getCurrentDrawdown() {
  return getOpenDrawdowns().sort(
    (left, right) => new Date(left.issuedAt) - new Date(right.issuedAt)
  )[0] || creditLine?.drawdowns?.at(-1) || null;
}

function synchronizeOverdue(drawdown) {
  if (!drawdown || drawdown.status !== 'active') {
    return;
  }

  const today = getDayStart(getEffectiveNow(drawdown));
  const overduePayment = drawdown.schedule.find(
    (payment) =>
      payment.status === 'pending' &&
      getDayStart(payment.dueAt) < today
  );

  if (!overduePayment) {
    return;
  }

  drawdown.status = 'overdue';
  drawdown.promoEligible = false;
  drawdown.promoLostAt ||= getEffectiveNow(drawdown).toISOString();
  overduePayment.status = 'overdue';
  saveCreditLine();
}

function getNextPayment(drawdown) {
  return drawdown?.schedule.find((payment) =>
    ['pending', 'overdue'].includes(payment.status)
  ) || null;
}

function getPaymentEntries(drawdowns = getOpenDrawdowns()) {
  return drawdowns.flatMap((drawdown) =>
    drawdown.schedule.map((payment) => ({ drawdown, payment }))
  );
}

function getPaymentDateKey(payment) {
  const date = new Date(payment.dueAt);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function groupPaymentEntries(entries) {
  const groups = new Map();

  entries.forEach((entry) => {
    const key = getPaymentDateKey(entry.payment);
    const group = groups.get(key) || {
      key,
      dueAt: entry.payment.dueAt,
      entries: []
    };

    group.entries.push(entry);
    groups.set(key, group);
  });

  return [...groups.values()].sort(
    (left, right) => new Date(left.dueAt) - new Date(right.dueAt)
  );
}

function getNextPaymentGroup() {
  const outstandingEntries = getPaymentEntries().filter(({ payment }) =>
    ['pending', 'overdue'].includes(payment.status)
  );

  return groupPaymentEntries(outstandingEntries)[0] || null;
}

function getPaymentGroupAmount(group) {
  if (!group) {
    return 0;
  }

  return window.RFCreditLineCalculator.roundMoney(
    group.entries.reduce(
      (total, { drawdown, payment }) =>
        total + getPaymentAmount(drawdown, payment),
      0
    )
  );
}

function getPaymentAmount(drawdown, payment) {
  if (!drawdown || !payment) {
    return 0;
  }

  if (payment.status === 'paid') {
    return Number(payment.paidAmount) || 0;
  }

  if (payment.status === 'cancelled') {
    return 0;
  }

  if (drawdown.promoEligible) {
    return payment.promoAmount;
  }

  if (isPaymentDue(payment, drawdown)) {
    return getPaymentBreakdown(
      drawdown,
      payment,
      getEffectiveNow(drawdown)
    ).total;
  }

  return payment.contractualAmount;
}

function renderSchedule() {
  const list = document.querySelector('[data-credit-schedule]');
  const toggleButton = document.querySelector(
    '[data-credit-schedule-toggle]'
  );
  const groups = groupPaymentEntries(getPaymentEntries());

  list.replaceChildren();
  const visibleGroups = scheduleExpanded
    ? groups
    : groups.slice(0, SCHEDULE_PREVIEW_LIMIT);

  visibleGroups.forEach((group) => {
    const item = document.createElement('li');
    const copy = document.createElement('div');
    const date = document.createElement('time');
    const amount = document.createElement('span');
    const state = document.createElement('small');
    const statuses = group.entries.map(({ payment }) => payment.status);
    const allPaid = statuses.every((status) => status === 'paid');
    const allCancelled = statuses.every((status) => status === 'cancelled');
    const hasOverdue = statuses.includes('overdue');
    const hasPaid = statuses.includes('paid');
    const hasOutstanding = statuses.some((status) =>
      ['pending', 'overdue'].includes(status)
    );
    const paidEarly = group.entries.some(
      ({ payment }) => payment.isEarlyRepayment
    );

    item.className = 'credit-schedule__item';
    if (allPaid) {
      item.classList.add('is-paid');
    }
    if (hasOverdue) {
      item.classList.add('is-overdue');
    }
    if (allCancelled) {
      item.classList.add('is-cancelled');
    }

    date.dateTime = group.dueAt;
    date.textContent = formatDate(group.dueAt);
    amount.textContent = formatMoney(window.RFCreditLineCalculator.roundMoney(
      group.entries.reduce((total, { drawdown, payment }) => {
        if (payment.status === 'cancelled') {
          return total;
        }
        if (hasOutstanding && payment.status === 'paid') {
          return total;
        }
        return total + getPaymentAmount(drawdown, payment);
      }, 0)
    ));
    state.textContent = paidEarly
      ? `Досрочно погашен ${formatDate(
          group.entries.find(({ payment }) =>
            payment.isEarlyRepayment
          ).payment.paidAt
        )}`
      : allPaid
        ? `Оплачен ${formatDate(
            group.entries.find(({ payment }) => payment.paidAt)
              ?.payment.paidAt
          )}`
        : hasOverdue
          ? 'Просрочен'
          : allCancelled
            ? 'Отменен после досрочного погашения'
            : hasPaid
              ? 'Осталось оплатить'
              : group.entries.length > 1
                ? 'Общий платеж по линии'
                : 'По графику';

    copy.append(date);
    item.append(copy, amount, state);
    list.append(item);
  });

  toggleButton.hidden = groups.length <= SCHEDULE_PREVIEW_LIMIT;
  toggleButton.textContent = scheduleExpanded
    ? 'Свернуть'
    : 'Весь график';
  toggleButton.setAttribute(
    'aria-expanded',
    String(scheduleExpanded)
  );
}

function toggleSchedule() {
  scheduleExpanded = !scheduleExpanded;
  renderSchedule();
}

function renderAccount() {
  if (!creditLine) {
    errorSection.hidden = false;
    return;
  }

  const drawdown = getCurrentDrawdown();

  if (!drawdown) {
    errorSection.hidden = false;
    return;
  }

  let operationsChanged = false;
  creditLine.drawdowns.forEach((storedDrawdown) => {
    operationsChanged = ensureOperations(storedDrawdown) ||
      operationsChanged;
  });

  if (operationsChanged) {
    saveCreditLine();
  }
  const openDrawdowns = getOpenDrawdowns();
  openDrawdowns.forEach((storedDrawdown) => {
    synchronizeOverdue(storedDrawdown);
    synchronizePromoEligibility(storedDrawdown);
  });
  recalculateAvailableLimit();
  saveCreditLine();
  const nextPaymentGroup = getNextPaymentGroup();
  const paymentCard = document.querySelector(
    '[data-credit-payment-card]'
  );
  const status = document.querySelector('[data-credit-status]');
  const promoCard = document.querySelector('[data-credit-promo-card]');
  const payButton = document.querySelector('[data-credit-pay]');
  const earlyRepayButton = document.querySelector(
    '[data-credit-early-repay]'
  );
  const devTools = document.querySelector(
    '.credit-account-dev-tools'
  );
  const paymentErrorDevButton = document.querySelector(
    '[data-credit-simulate-payment-error]'
  );
  const availability = document.querySelector(
    '[data-credit-availability]'
  );
  const addDrawdownButton = document.querySelector(
    '[data-credit-add-drawdown]'
  );
  const hasOverdueDrawdown = openDrawdowns.some(
    (storedDrawdown) => storedDrawdown.status === 'overdue'
  );
  const latestDrawdown = openDrawdowns.at(-1) || drawdown;
  const paymentActionDrawdown = nextPaymentGroup?.entries[0]?.drawdown ||
    drawdown;

  document.querySelector('[data-credit-balance]').textContent =
    formatMoney(getOutstandingPrincipal());
  availability.hidden = Number(creditLine.level) < 2;
  document.querySelector('[data-credit-available]').textContent =
    `${formatMoney(creditLine.availableLimit)} / ` +
    formatMoney(creditLine.limit);
  document.querySelector('[data-credit-contract]').textContent =
    creditLine.contractNumber;
  document.querySelector('[data-credit-card]').textContent =
    `${latestDrawdown.card.network} ${latestDrawdown.card.maskedNumber}`;
  document.querySelector('[data-credit-document]').href =
    creditLine.termsDocument;

  status.textContent = openDrawdowns.length === 0
    ? 'Погашен'
    : hasOverdueDrawdown
      ? 'Просрочен'
      : 'Активен';
  status.classList.toggle(
    'is-overdue',
    hasOverdueDrawdown
  );

  promoCard.hidden = !openDrawdowns.some(
    (storedDrawdown) => storedDrawdown.promoEligible
  );
  addDrawdownButton.hidden = !(
    Number(creditLine.level) >= 2 &&
    Number(creditLine.availableLimit) >= 2000 &&
    !hasOverdueDrawdown
  );
  paymentErrorDevButton.classList.toggle(
    'is-active',
    paymentActionDrawdown.devNextPaymentFails === true
  );
  paymentErrorDevButton.textContent = paymentActionDrawdown.devNextPaymentFails
    ? 'Ошибка следующей оплаты включена'
    : 'Следующая оплата: ошибка';

  if (nextPaymentGroup) {
    const paymentIsDue = nextPaymentGroup.entries.some(
      (entry) => isPaymentDue(entry.payment, entry.drawdown)
    );

    paymentCard.hidden = false;
    payButton.hidden = !paymentIsDue;
    earlyRepayButton.hidden = paymentIsDue;
    devTools.hidden = false;
    document.querySelector(
      '[data-credit-next-payment]'
    ).textContent = formatMoney(
      getPaymentGroupAmount(nextPaymentGroup)
    );
    document.querySelector(
      '[data-credit-next-date]'
    ).textContent = formatDate(nextPaymentGroup.dueAt);
  } else {
    paymentCard.hidden = true;
    earlyRepayButton.hidden = true;
    devTools.hidden = true;
  }

  renderSchedule();
  renderOperations(creditLine);
  content.hidden = false;
}

let paymentInProgress = false;

function finishDrawdown(drawdown, paidAt) {
  drawdown.status = 'repaid';
  drawdown.repaidAt = paidAt;
  drawdown.outstandingPrincipal = 0;
  creditLine.completedDrawdowns = Math.max(
    Number(creditLine.completedDrawdowns) || 0,
    Number(drawdown.sequence) || 1
  );

  if (Number(drawdown.sequence) === 1) {
    creditLine.level = 2;
    creditLine.limit = 30000;
  }
}

function processMockPayment({
  drawdown,
  button,
  errorElement,
  amount,
  onSuccess
}) {
  if (paymentInProgress) {
    return;
  }

  paymentInProgress = true;
  const buttonText = button.textContent;
  button.disabled = true;
  button.textContent = 'Обрабатываем...';
  errorElement.hidden = true;

  window.setTimeout(() => {
    paymentInProgress = false;
    button.disabled = false;
    button.textContent = buttonText;

    if (drawdown.devNextPaymentFails === true) {
      drawdown.devNextPaymentFails = false;
      recordOperation(drawdown, {
        type: 'payment_failed',
        title: 'Платеж отклонен',
        amount,
        direction: 'outgoing',
        status: 'failed'
      });
      saveCreditLine();
      renderAccount();
      errorElement.hidden = false;
      return;
    }

    onSuccess();
  }, 700);
}

function completeScheduledPayments(paymentItems) {
  let firstDrawdownRepaid = false;

  paymentItems.forEach(({ drawdown, payment, breakdown }) => {
    const paidAt = getEffectiveNow(drawdown).toISOString();

    payment.status = 'paid';
    payment.paidAt = paidAt;
    payment.paidAmount = breakdown.total;
    payment.principalPaid = breakdown.principal;
    payment.interestPaidAmount = breakdown.interest;
    payment.penaltyPaidAmount = breakdown.penalty;
    drawdown.outstandingPrincipal =
      window.RFCreditLineCalculator.roundMoney(
        drawdown.outstandingPrincipal - breakdown.principal
      );

    recordOperation(drawdown, {
      sourceId: payment.id,
      type: 'payment',
      title: 'Платеж по графику',
      amount: breakdown.total,
      principal: breakdown.principal,
      interest: breakdown.interest,
      penalty: breakdown.penalty,
      direction: 'outgoing',
      status: 'completed',
      createdAt: paidAt
    });

    const hasPendingPayments = drawdown.schedule.some(
      (item) => ['pending', 'overdue'].includes(item.status)
    );

    if (!hasPendingPayments) {
      finishDrawdown(drawdown, paidAt);
      firstDrawdownRepaid ||= Number(drawdown.sequence) === 1;
    } else {
      drawdown.status = 'active';
    }
  });

  const limitIncreased = promoteCreditLineIfEligible();
  recalculateAvailableLimit();
  saveCreditLine();

  if (firstDrawdownRepaid || getOpenDrawdowns().length === 0) {
    localStorage.setItem(
      'rf_dashboard_notice',
      JSON.stringify({
        type: limitIncreased
          ? 'credit_limit_increased'
          : firstDrawdownRepaid
            ? 'first_drawdown_repaid'
            : 'credit_drawdown_repaid',
        ownerPhone: accountSession.phone
      })
    );
    window.location.replace('dashboard.html');
    return;
  }

  renderAccount();
}

function payNextPayment() {
  const group = getNextPaymentGroup();

  if (!group || !group.entries.some(
    ({ drawdown, payment }) => isPaymentDue(payment, drawdown)
  )) {
    return;
  }

  const paymentItems = group.entries.map(({ drawdown, payment }) => ({
    drawdown,
    payment,
    breakdown: getPaymentBreakdown(
      drawdown,
      payment,
      getEffectiveNow(drawdown)
    )
  }));
  const amount = window.RFCreditLineCalculator.roundMoney(
    paymentItems.reduce(
      (total, item) => total + item.breakdown.total,
      0
    )
  );
  const drawdown = paymentItems[0].drawdown;

  processMockPayment({
    drawdown,
    button: document.querySelector('[data-credit-pay]'),
    errorElement: document.querySelector('[data-credit-payment-error]'),
    amount,
    onSuccess: () => completeScheduledPayments(paymentItems)
  });
}

function completeEarlyRepayment(drawdown, breakdown) {
  const paidAt = getEffectiveNow(drawdown).toISOString();
  let paymentRecorded = false;

  drawdown.schedule.forEach((item) => {
    if (!['pending', 'overdue'].includes(item.status)) {
      return;
    }

    if (!paymentRecorded) {
      item.status = 'paid';
      item.paidAt = paidAt;
      item.paidAmount = breakdown.total;
      item.principalPaid = breakdown.principal;
      item.interestPaidAmount = breakdown.interest;
      item.penaltyPaidAmount = breakdown.penalty;
      item.isEarlyRepayment = true;
      paymentRecorded = true;
      recordOperation(drawdown, {
        sourceId: item.id,
        type: 'early_repayment',
        title: 'Досрочное погашение',
        amount: breakdown.total,
        principal: breakdown.principal,
        interest: breakdown.interest,
        penalty: breakdown.penalty,
        direction: 'outgoing',
        status: 'completed',
        createdAt: paidAt
      });
      return;
    }

    item.status = 'cancelled';
    item.cancelledAt = paidAt;
  });

  drawdown.earlyRepaid = true;
  finishDrawdown(drawdown, paidAt);
}

function repayEarly() {
  const drawdowns = getOpenDrawdowns();
  const nextPaymentGroup = getNextPaymentGroup();

  if (!drawdowns.length || !nextPaymentGroup ||
    nextPaymentGroup.entries.some(
      ({ drawdown, payment }) => isPaymentDue(payment, drawdown)
    )) {
    return;
  }

  const repaymentItems = drawdowns.map((drawdown) => {
    const principal = Number(drawdown.outstandingPrincipal) || 0;
    const accruedInterest = getCappedAccruedInterest(
      drawdown,
      getEffectiveNow(drawdown)
    );
    const interest = drawdown.promoEligible
      ? 0
      : Math.max(0, accruedInterest - getPaidInterest(drawdown));

    return {
      drawdown,
      breakdown: {
        principal: window.RFCreditLineCalculator.roundMoney(principal),
        interest: window.RFCreditLineCalculator.roundMoney(interest),
        penalty: 0,
        total: window.RFCreditLineCalculator.roundMoney(
          principal + interest
        )
      }
    };
  });
  const total = window.RFCreditLineCalculator.roundMoney(
    repaymentItems.reduce(
      (sum, item) => sum + item.breakdown.total,
      0
    )
  );
  const shouldRepay = window.confirm(
    `Погасить всю задолженность досрочно? К оплате ${formatMoney(total)}.`
  );

  if (!shouldRepay) {
    return;
  }

  processMockPayment({
    drawdown: repaymentItems[0].drawdown,
    button: document.querySelector('[data-credit-early-repay]'),
    errorElement: document.querySelector('[data-credit-early-error]'),
    amount: total,
    onSuccess: () => {
      const firstDrawdownRepaid = repaymentItems.some(
        (item) => Number(item.drawdown.sequence) === 1
      );
      repaymentItems.forEach((item) =>
        completeEarlyRepayment(item.drawdown, item.breakdown)
      );
      const limitIncreased = promoteCreditLineIfEligible();
      recalculateAvailableLimit();
      saveCreditLine();
      localStorage.setItem(
        'rf_dashboard_notice',
        JSON.stringify({
          type: limitIncreased
            ? 'credit_limit_increased'
            : firstDrawdownRepaid
              ? 'first_drawdown_repaid'
              : 'credit_drawdown_repaid',
          ownerPhone: accountSession.phone
        })
      );
      window.location.replace('dashboard.html');
    }
  });
}

function simulatePaymentDate(overdue = false) {
  const group = getNextPaymentGroup();

  if (!group) {
    return;
  }

  const simulatedNow = getDayStart(group.dueAt);
  if (overdue) {
    simulatedNow.setDate(simulatedNow.getDate() + 1);
  }

  getOpenDrawdowns().forEach((drawdown) => {
    drawdown.devNow = simulatedNow.toISOString();
  });
  group.entries.forEach(({ drawdown, payment }) => {
    payment.status = 'pending';
    drawdown.status = 'active';
    drawdown.promoEligible = supportsZeroPercentPromo(drawdown) &&
      !hasPromoBeenLost(drawdown);
  });
  saveCreditLine();
  renderAccount();
}

function toggleNextPaymentError() {
  const drawdown = getNextPaymentGroup()?.entries[0]?.drawdown;

  if (!drawdown) {
    return;
  }

  drawdown.devNextPaymentFails =
    drawdown.devNextPaymentFails !== true;
  saveCreditLine();
  renderAccount();
}

document.querySelector('[data-credit-pay]')?.addEventListener(
  'click',
  payNextPayment
);
document.querySelector('[data-credit-early-repay]')?.addEventListener(
  'click',
  repayEarly
);
document.querySelector('[data-credit-simulate-due]')?.addEventListener(
  'click',
  () => simulatePaymentDate(false)
);
document.querySelector('[data-credit-simulate-overdue]')?.addEventListener(
  'click',
  () => simulatePaymentDate(true)
);
document.querySelector(
  '[data-credit-simulate-payment-error]'
)?.addEventListener(
  'click',
  toggleNextPaymentError
);
document.querySelector(
  '[data-credit-operations-toggle]'
)?.addEventListener('click', toggleOperations);
document.querySelector(
  '[data-credit-schedule-toggle]'
)?.addEventListener('click', toggleSchedule);
synchronizeCreditContractNumber();
renderAccount();
