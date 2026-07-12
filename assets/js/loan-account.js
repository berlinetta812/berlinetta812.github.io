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

const params = new URLSearchParams(window.location.search);
const loanId = params.get('id');
const storedLoans = readStorage('rf_loans', []);
const loan = Array.isArray(storedLoans)
  ? storedLoans.find(
      (item) =>
        item.id === loanId &&
        item.ownerPhone === session?.phone
    )
  : null;

const content = document.querySelector('[data-loan-content]');
const error = document.querySelector('[data-loan-error]');
const DEV_MOCK_LOAN_STATES = true;
const LOAN_EXTENSION_MOCK_CODE = '111111';
const LOAN_EXTENSION_MAX_DAYS = 30;
const LOAN_EXTENSION_MAX_COUNT = 5;

function formatMoney(value) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
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

function formatDays(days) {
  const value = Number(days) || 0;
  const lastTwo = value % 100;
  const lastOne = value % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${value} дней`;
  }

  if (lastOne === 1) {
    return `${value} день`;
  }

  if (lastOne >= 2 && lastOne <= 4) {
    return `${value} дня`;
  }

  return `${value} дней`;
}

function addDays(value, days) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setDate(date.getDate() + Number(days || 0));
  return date;
}

function calculateCalendarDays(startValue, endValue, minimum = 0) {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return minimum;
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  return Math.max(minimum, Math.round((end - start) / 86400000));
}

function calculateInterest(targetLoan, days) {
  return (
    Number(targetLoan.amount || 0) *
    Number(targetLoan.dailyRate || 0) *
    Number(days || 0)
  );
}

function getExtensions(targetLoan) {
  return Array.isArray(targetLoan.extensions)
    ? targetLoan.extensions
    : [];
}

function getExtensionCount(targetLoan) {
  return Math.max(
    Number(targetLoan.extensionCount) || 0,
    getExtensions(targetLoan).length
  );
}

function getLoanView(targetLoan) {
  const now = new Date();
  const issuedAt = new Date(targetLoan.issuedAt);
  const dueDate = new Date(targetLoan.dueDate);
  const hasExtension =
    targetLoan.promoEligible === false ||
    getExtensionCount(targetLoan) > 0;

  if (targetLoan.status === 'paid') {
    return {
      isPaid: true,
      isOverdue: false,
      promoActive: false,
      status: 'Погашен',
      dueAmount: 0,
      promoTitle: 'Займ погашен',
      promoText: targetLoan.promoApplied
        ? 'Займ возвращен в срок. Проценты по акции составили 0 ₽.'
        : `Займ погашен. Оплачено ${formatMoney(targetLoan.paidAmount)}.`
    };
  }

  if (targetLoan.pendingExtensionPayment) {
    return {
      isPaid: false,
      isOverdue: false,
      promoActive: false,
      isExtensionPending: true,
      status: 'Ожидает подписи',
      dueAmount: Number(targetLoan.amount),
      promoTitle: 'Проценты оплачены',
      promoText:
        'Подпишите дополнительное соглашение по СМС, чтобы новая дата возврата вступила в силу.'
    };
  }

  const isOverdue =
    targetLoan.status === 'overdue' ||
    (!Number.isNaN(dueDate.getTime()) && dueDate < now);

  if (!isOverdue) {
    if (hasExtension) {
      const interestStart =
        targetLoan.interestPaidThrough || targetLoan.issuedAt;
      const unpaidDays = calculateCalendarDays(
        interestStart,
        now,
        0
      );
      const unpaidInterest = calculateInterest(targetLoan, unpaidDays);

      return {
        isPaid: false,
        isOverdue: false,
        promoActive: false,
        status: 'Продлен',
        dueAmount: Number(targetLoan.amount) + unpaidInterest,
        promoTitle: 'Срок займа продлен',
        promoText:
          `Акция 0% завершена. После последней оплаты процентов прошло ${formatDays(unpaidDays)}.`
      };
    }

    return {
      isPaid: false,
      isOverdue: false,
      promoActive: true,
      status: 'Активен',
      dueAmount: Number(targetLoan.promoReturnAmount ?? targetLoan.amount),
      promoTitle: 'Займ без процентов',
      promoText:
        'Верните займ полностью в срок или раньше, и проценты по акции составят 0 ₽.'
    };
  }

  const interestStart = hasExtension
    ? targetLoan.interestPaidThrough || targetLoan.issuedAt
    : targetLoan.issuedAt;
  const elapsedDays = hasExtension
    ? calculateCalendarDays(interestStart, now, 0)
    : Math.max(
        Number(targetLoan.termDays) || 0,
        calculateCalendarDays(issuedAt, now, 0)
      );
  const interest = calculateInterest(targetLoan, elapsedDays);

  return {
    isPaid: false,
    isOverdue: true,
    promoActive: false,
    status: 'Просрочен',
    dueAmount: Number(targetLoan.amount) + interest,
    promoTitle: 'Срок возврата пропущен',
    promoText:
      hasExtension
        ? `Проценты рассчитаны за ${formatDays(elapsedDays)} после последнего продления.`
        : `Акция 0% больше не действует. Проценты рассчитаны за ${formatDays(elapsedDays)} фактического пользования займом.`
  };
}

function renderOperations(targetLoan) {
  const list = document.querySelector('[data-loan-operations]');
  const operations = Array.isArray(targetLoan.operations)
    ? targetLoan.operations
    : [];

  list.replaceChildren();

  operations.forEach((operation) => {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    const date = document.createElement('time');
    const amount = document.createElement('span');

    item.className = 'loan-account-operation';
    const operationTitles = {
      loan_disbursement: 'Займ выдан',
      loan_repayment: 'Займ погашен',
      loan_extension_interest_payment: 'Проценты при продлении'
    };
    title.textContent = operationTitles[operation.type] ||
      'Операция по займу';
    date.dateTime = operation.createdAt || '';
    date.textContent = formatDate(operation.createdAt);
    amount.textContent = formatMoney(operation.amount);

    item.append(title, date, amount);
    list.append(item);
  });
}

function renderLoan(targetLoan) {
  const view = getLoanView(targetLoan);
  const status = document.querySelector('[data-loan-status]');
  const promo = document.querySelector('[data-loan-promo]');
  const repayButton = document.querySelector('[data-repay-loan]');
  const extendButton = document.querySelector('[data-extend-loan]');

  document.querySelector('[data-loan-amount]').textContent =
    formatMoney(targetLoan.amount);
  document.querySelector('[data-loan-due-amount]').textContent =
    formatMoney(view.dueAmount);
  document.querySelector('[data-loan-due-date]').textContent =
    formatDate(targetLoan.dueDate);
  document.querySelector('[data-loan-term]').textContent =
    formatDays(targetLoan.termDays);
  document.querySelector('[data-loan-rate]').textContent =
    `${Number(targetLoan.dailyRate || 0) * 100}% в день`;
  document.querySelector('[data-loan-contract-amount]').textContent =
    formatMoney(
      targetLoan.promoEligible === false
        ? view.dueAmount
        : targetLoan.contractReturnAmount
    );
  document.querySelector(
    '[data-loan-contract-amount-label]'
  ).textContent = targetLoan.promoEligible === false
    ? 'К возврату сейчас'
    : 'Без акции к возврату';
  document.querySelector('[data-loan-card]').textContent =
    `${targetLoan.cardNetwork || ''} ${targetLoan.cardMask || ''}`.trim() || '—';
  document.querySelector('[data-loan-contract]').textContent =
    targetLoan.contractNumber || '—';
  document.querySelector('[data-loan-issued]').textContent =
    formatDate(targetLoan.issuedAt);
  document.querySelector('[data-loan-document]').href =
    targetLoan.termsDocument || 'assets/docs/first-loan-terms.pdf';

  status.textContent = view.status;
  promo.querySelector('h2').textContent = view.promoTitle;
  document.querySelector('[data-loan-promo-text]').textContent =
    view.promoText;
  promo.hidden =
    targetLoan.promoEligible === false ||
    view.isExtensionPending === true;

  if (view.isOverdue) {
    status.classList.add('is-overdue');
    promo.classList.add('is-overdue');
  }

  if (view.isPaid || view.isExtensionPending) {
    repayButton.hidden = true;
  }

  extendButton.hidden = !(
    view.isExtensionPending ||
    (
      !view.isPaid &&
      !view.isOverdue &&
      targetLoan.status === 'active' &&
      getExtensionCount(targetLoan) < LOAN_EXTENSION_MAX_COUNT
    )
  );
  extendButton.textContent = view.isExtensionPending
    ? 'Подписать дополнительное соглашение'
    : 'Продлить срок займа';

  renderOperations(targetLoan);
  content.hidden = false;
}

if (loan) {
  renderLoan(loan);
} else {
  error.hidden = false;
}

const devTools = document.querySelector('[data-loan-dev-tools]');
const simulateOverdueButton = document.querySelector(
  '[data-simulate-overdue]'
);

if (
  DEV_MOCK_LOAN_STATES &&
  loan &&
  loan.status !== 'paid'
) {
  devTools.hidden = false;
}

if (loan?.status === 'overdue') {
  simulateOverdueButton.hidden = true;
}

simulateOverdueButton?.addEventListener('click', () => {
  const loans = readStorage('rf_loans', []);
  const loanIndex = Array.isArray(loans)
    ? loans.findIndex(
        (item) =>
          item.id === loan?.id &&
          item.ownerPhone === session?.phone
      )
    : -1;

  if (loanIndex === -1 || loans[loanIndex].status === 'paid') {
    return;
  }

  const termDays = Number(loans[loanIndex].termDays) || 1;
  const overdueDays = 3;
  const issuedAt = new Date();
  issuedAt.setDate(issuedAt.getDate() - termDays - overdueDays);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() - overdueDays);
  const hasExtension = loans[loanIndex].promoEligible === false;
  const extensions = getExtensions(loans[loanIndex]);
  const lastExtension = extensions[extensions.length - 1];
  const interestPaidThrough = new Date();

  if (hasExtension) {
    interestPaidThrough.setDate(
      interestPaidThrough.getDate() -
      Number(lastExtension?.days || 1) -
      overdueDays
    );
  }

  loans[loanIndex] = {
    ...loans[loanIndex],
    status: 'overdue',
    issuedAt: issuedAt.toISOString(),
    dueDate: dueDate.toISOString(),
    overdueSince: dueDate.toISOString(),
    interestPaidThrough: hasExtension
      ? interestPaidThrough.toISOString()
      : loans[loanIndex].interestPaidThrough,
    mockOverdueDays: overdueDays,
    operations: Array.isArray(loans[loanIndex].operations)
      ? loans[loanIndex].operations.map((operation) =>
          operation.type === 'loan_disbursement'
            ? {
                ...operation,
                createdAt: issuedAt.toISOString()
              }
            : hasExtension &&
              operation.type === 'loan_extension_interest_payment' &&
              operation.extensionId === lastExtension?.id
              ? {
                  ...operation,
                  createdAt: interestPaidThrough.toISOString()
                }
            : operation
        )
      : [],
    extensions: hasExtension
      ? extensions.map((extension) =>
          extension.id === lastExtension?.id
            ? {
                ...extension,
                signedAt: interestPaidThrough.toISOString(),
                termsAcceptedAt: interestPaidThrough.toISOString()
              }
            : extension
        )
      : extensions
  };

  localStorage.setItem('rf_loans', JSON.stringify(loans));
  window.location.reload();
});

const extensionDialog = document.querySelector('[data-extension-dialog]');
const extensionSettings = document.querySelector(
  '[data-extension-settings]'
);
const extensionPayment = document.querySelector(
  '[data-extension-payment]'
);
const extensionSms = document.querySelector('[data-extension-sms]');
const extensionDaysInput = document.querySelector(
  '[data-extension-days]'
);
const extensionCodeInput = document.querySelector(
  '[data-extension-code]'
);
const extensionCodeError = document.querySelector(
  '[data-extension-code-error]'
);
let pendingExtensionPayment = loan?.pendingExtensionPayment || null;

function getExtensionPreview(targetLoan, extensionDays, now = new Date()) {
  const interestStart =
    targetLoan.interestPaidThrough || targetLoan.issuedAt;
  const minimumDays = targetLoan.interestPaidThrough ? 0 : 1;
  const accruedDays = calculateCalendarDays(
    interestStart,
    now,
    minimumDays
  );

  return {
    extensionDays: Number(extensionDays),
    accruedDays,
    interestAmount: calculateInterest(targetLoan, accruedDays),
    newDueDate: addDays(targetLoan.dueDate, extensionDays),
    extensionNumber: getExtensionCount(targetLoan) + 1
  };
}

function renderExtensionPreview() {
  if (!loan) {
    return;
  }

  const extensionDays = Number(extensionDaysInput.value) || 1;
  const preview = getExtensionPreview(loan, extensionDays);

  document.querySelector('[data-extension-days-output]').textContent =
    formatDays(extensionDays);
  document.querySelector('[data-extension-interest]').textContent =
    `${formatMoney(preview.interestAmount)} за ${formatDays(preview.accruedDays)}`;
  document.querySelector('[data-extension-due-date]').textContent =
    formatDate(preview.newDueDate);
  document.querySelector('[data-extension-count]').textContent =
    `${preview.extensionNumber} из ${LOAN_EXTENSION_MAX_COUNT}`;
}

function resetExtensionDialog() {
  extensionSettings.hidden = Boolean(pendingExtensionPayment);
  extensionPayment.hidden = true;
  extensionSms.hidden = !pendingExtensionPayment;
  extensionCodeInput.value = '';
  extensionCodeError.hidden = true;
}

document.querySelector('[data-extend-loan]')?.addEventListener('click', () => {
  if (!loan) {
    return;
  }

  const view = getLoanView(loan);
  const canExtend =
    loan.status === 'active' &&
    !view.isOverdue &&
    getExtensionCount(loan) < LOAN_EXTENSION_MAX_COUNT;

  if (!canExtend) {
    return;
  }

  extensionDaysInput.max = String(LOAN_EXTENSION_MAX_DAYS);
  if (!pendingExtensionPayment) {
    extensionDaysInput.value = '7';
  }
  resetExtensionDialog();
  if (!pendingExtensionPayment) {
    renderExtensionPreview();
  }
  extensionDialog.showModal();

  if (pendingExtensionPayment) {
    extensionCodeInput.focus();
  }
});

extensionDaysInput?.addEventListener('input', renderExtensionPreview);

document.querySelector('[data-cancel-extension]')?.addEventListener(
  'click',
  () => extensionDialog.close()
);

document.querySelector('[data-start-extension]')?.addEventListener(
  'click',
  () => {
    const preview = getExtensionPreview(
      loan,
      Number(extensionDaysInput.value) || 1
    );

    document.querySelector(
      '[data-extension-payment-amount]'
    ).textContent = formatMoney(preview.interestAmount);
    document.querySelector(
      '[data-extension-payment-card]'
    ).textContent =
      `${loan.cardNetwork || ''} ${loan.cardMask || ''}`.trim() || '—';
    extensionSettings.hidden = true;
    extensionPayment.hidden = false;
  }
);

document.querySelector('[data-back-extension-payment]')?.addEventListener(
  'click',
  () => {
    extensionPayment.hidden = true;
    extensionSettings.hidden = false;
  }
);

document.querySelector('[data-back-extension]')?.addEventListener(
  'click',
  () => extensionDialog.close()
);

document.querySelector(
  '[data-confirm-extension-payment]'
)?.addEventListener('click', () => {
  if (!loan || pendingExtensionPayment) {
    return;
  }

  const loans = readStorage('rf_loans', []);
  const loanIndex = Array.isArray(loans)
    ? loans.findIndex(
        (item) =>
          item.id === loan.id &&
          item.ownerPhone === session?.phone
      )
    : -1;

  if (loanIndex === -1) {
    return;
  }

  const currentLoan = loans[loanIndex];
  const currentView = getLoanView(currentLoan);

  if (
    currentLoan.status !== 'active' ||
    currentView.isOverdue ||
    getExtensionCount(currentLoan) >= LOAN_EXTENSION_MAX_COUNT
  ) {
    extensionDialog.close();
    window.location.reload();
    return;
  }

  const extensionDays = Math.min(
    LOAN_EXTENSION_MAX_DAYS,
    Math.max(1, Number(extensionDaysInput.value) || 1)
  );
  const paidAt = new Date();
  const preview = getExtensionPreview(
    currentLoan,
    extensionDays,
    paidAt
  );
  const paymentId = typeof crypto.randomUUID === 'function'
    ? `extension-payment-${crypto.randomUUID()}`
    : `extension-payment-${Date.now()}`;
  const extensionId = typeof crypto.randomUUID === 'function'
    ? `extension-${crypto.randomUUID()}`
    : `extension-${Date.now()}`;

  pendingExtensionPayment = {
    id: extensionId,
    number: preview.extensionNumber,
    days: extensionDays,
    previousDueDate: currentLoan.dueDate,
    newDueDate: preview.newDueDate.toISOString(),
    accruedDays: preview.accruedDays,
    interestPaid: Number(preview.interestAmount.toFixed(2)),
    paymentId,
    paidAt: paidAt.toISOString(),
    paymentProvider: 'mock-card-payment',
    paymentStatus: 'completed'
  };

  const extensionPaymentOperation = {
    id: paymentId,
    type: 'loan_extension_interest_payment',
    amount: pendingExtensionPayment.interestPaid,
    status: 'completed',
    createdAt: pendingExtensionPayment.paidAt,
    extensionId
  };

  loans[loanIndex] = {
    ...currentLoan,
    pendingExtensionPayment,
    operations: [
      ...(Array.isArray(currentLoan.operations)
        ? currentLoan.operations
        : []),
      extensionPaymentOperation
    ]
  };

  localStorage.setItem('rf_loans', JSON.stringify(loans));
  extensionPayment.hidden = true;
  extensionSms.hidden = false;
  extensionCodeInput.focus();
});

extensionCodeInput?.addEventListener('input', () => {
  extensionCodeInput.value = extensionCodeInput.value.replace(/\D/g, '');
  extensionCodeError.hidden = true;
});

document.querySelector('[data-confirm-extension]')?.addEventListener(
  'click',
  () => {
    if (extensionCodeInput.value !== LOAN_EXTENSION_MOCK_CODE) {
      extensionCodeError.hidden = false;
      return;
    }

    const loans = readStorage('rf_loans', []);
    const loanIndex = Array.isArray(loans)
      ? loans.findIndex(
          (item) =>
            item.id === loan?.id &&
            item.ownerPhone === session?.phone
        )
      : -1;

    if (loanIndex === -1) {
      return;
    }

    const currentLoan = loans[loanIndex];
    const currentExtensionCount = getExtensionCount(currentLoan);
    const paidExtension = currentLoan.pendingExtensionPayment;

    if (
      currentLoan.status !== 'active' ||
      currentExtensionCount >= LOAN_EXTENSION_MAX_COUNT ||
      !paidExtension ||
      paidExtension.paymentStatus !== 'completed'
    ) {
      extensionDialog.close();
      window.location.reload();
      return;
    }

    const signedAt = new Date();
    const agreementNumber =
      `${currentLoan.contractNumber || currentLoan.id}-ДC-${paidExtension.number}`;
    const extension = {
      ...paidExtension,
      agreementNumber,
      termsDocument: 'assets/docs/loan-extension-terms.pdf',
      termsAcceptedAt: signedAt.toISOString(),
      signedAt: signedAt.toISOString(),
      signatureType: 'simple_electronic_signature',
      signatureChannel: 'sms',
      signatureMockCode: LOAN_EXTENSION_MOCK_CODE
    };
    const newTermDays =
      Number(currentLoan.termDays || 0) + extension.days;
    const {
      pendingExtensionPayment: _completedPayment,
      ...loanWithoutPendingExtension
    } = currentLoan;

    loans[loanIndex] = {
      ...loanWithoutPendingExtension,
      status: 'active',
      dueDate: extension.newDueDate,
      termDays: newTermDays,
      contractReturnAmount: Number(
        (
          Number(currentLoan.amount) +
          calculateInterest(currentLoan, newTermDays)
        ).toFixed(2)
      ),
      promoEligible: false,
      promoEndedAt: currentLoan.promoEndedAt || signedAt.toISOString(),
      interestPaidThrough: extension.paidAt,
      extensionInterestPaid: Number(
        (
          Number(currentLoan.extensionInterestPaid || 0) +
          extension.interestPaid
        ).toFixed(2)
      ),
      extensionUsedDays:
        Number(currentLoan.extensionUsedDays || 0) + extension.days,
      extensionCount: extension.number,
      maxExtensionDays: LOAN_EXTENSION_MAX_DAYS,
      maxExtensions: LOAN_EXTENSION_MAX_COUNT,
      maxTotalTermDays: null,
      extensions: [...getExtensions(currentLoan), extension],
      operations: Array.isArray(currentLoan.operations)
        ? currentLoan.operations
        : []
    };

    localStorage.setItem('rf_loans', JSON.stringify(loans));
    window.location.replace(
      `loan-account.html?id=${encodeURIComponent(currentLoan.id)}&extended=1`
    );
  }
);

document.querySelector('[data-repay-loan]')?.addEventListener('click', () => {
  if (!loan || loan.status === 'paid') {
    return;
  }

  const view = getLoanView(loan);
  const dialog = document.querySelector('[data-repay-dialog]');

  document.querySelector('[data-repay-amount]').textContent =
    formatMoney(view.dueAmount);
  document.querySelector('[data-repay-card]').textContent =
    `${loan.cardNetwork || ''} ${loan.cardMask || ''}`.trim() || '—';
  dialog.showModal();
});

document.querySelector('[data-confirm-repayment]')?.addEventListener(
  'click',
  () => {
    if (!loan || loan.status === 'paid') {
      return;
    }

    const confirmButton = document.querySelector(
      '[data-confirm-repayment]'
    );
    const loans = readStorage('rf_loans', []);
    const loanIndex = Array.isArray(loans)
      ? loans.findIndex(
          (item) =>
            item.id === loan.id &&
            item.ownerPhone === session?.phone
        )
      : -1;

    if (loanIndex === -1) {
      return;
    }

    confirmButton.disabled = true;

    const paidAt = new Date().toISOString();
    const view = getLoanView(loans[loanIndex]);
    const paidAmount = Number(view.dueAmount.toFixed(2));
    const repaymentOperation = {
      id: typeof crypto.randomUUID === 'function'
        ? `operation-${crypto.randomUUID()}`
        : `operation-${Date.now()}-repayment`,
      type: 'loan_repayment',
      amount: paidAmount,
      status: 'completed',
      createdAt: paidAt
    };

    loans[loanIndex] = {
      ...loans[loanIndex],
      status: 'paid',
      dueAmount: 0,
      paidAt,
      paidAmount,
      repaymentInterestAmount: Number(
        Math.max(0, paidAmount - Number(loan.amount)).toFixed(2)
      ),
      promoApplied: view.promoActive === true,
      repaymentProvider: 'mock-card-payment',
      repaymentStatus: 'completed',
      operations: [
        ...(Array.isArray(loans[loanIndex].operations)
          ? loans[loanIndex].operations
          : []),
        repaymentOperation
      ]
    };

    localStorage.setItem('rf_loans', JSON.stringify(loans));
    localStorage.setItem(
      'rf_dashboard_notice',
      JSON.stringify({
        type: 'loan_repaid',
        ownerPhone: session.phone,
        amount: paidAmount,
        promoApplied: view.promoActive === true,
        loanId: loan.id
      })
    );

    window.location.replace('dashboard.html?loanRepaid=first');
  }
);
