const FIRST_LOAN_DAILY_RATE = 0.0065;
const FIRST_LOAN_ANNUAL_RATE = 237.3;
const FIRST_LOAN_MIN_AMOUNT = 2000;
const FIRST_LOAN_MAX_AMOUNT = 10000;
const FIRST_LOAN_MAX_TERM_DAYS = 30;
const FIRST_LOAN_MOCK_CODE = '111111';
const FIRST_LOAN_TERMS_VERSION = 'first-loan-2026-07-v1';
const FIRST_LOAN_TERMS_DOCUMENT = 'assets/docs/first-loan-terms.pdf';

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

const loanSession = readStorage('rf_session', null);

if (!loanSession) {
  window.location.replace('login.html');
}

if (loanSession && loanSession.verified !== true) {
  window.location.replace('dashboard.html');
}

const existingLoans = readStorage('rf_loans', []);
const hasUnavailableFirstLoan = Array.isArray(existingLoans) &&
  existingLoans.some((loan) =>
    loan.ownerPhone === loanSession?.phone &&
    loan.type === 'first_loan' &&
    ['active', 'overdue', 'extension_pending', 'paid'].includes(loan.status)
  );

if (hasUnavailableFirstLoan) {
  window.location.replace('dashboard.html');
}

const loanForm = document.querySelector('[data-loan-form]');
const smsSection = document.querySelector('[data-loan-sms]');

if (loanForm && smsSection) {
  const amountInput = loanForm.querySelector('[data-loan-amount]');
  const amountRange = loanForm.querySelector('[data-loan-amount-range]');
  const termRange = loanForm.querySelector('[data-loan-term]');
  const termOutput = loanForm.querySelector('[data-loan-term-output]');
  const promoReturnOutput = loanForm.querySelector(
    '[data-loan-promo-return]'
  );
  const contractReturnOutput = loanForm.querySelector(
    '[data-loan-contract-return]'
  );
  const helpButton = loanForm.querySelector('[data-loan-help]');
  const helpPopover = loanForm.querySelector(
    '[data-loan-help-popover]'
  );
  const cardText = loanForm.querySelector('[data-loan-card-text]');
  const bindCardButton = loanForm.querySelector('[data-loan-bind-card]');
  const consentInput = loanForm.querySelector('[data-loan-consent]');
  const submitButton = loanForm.querySelector('[data-loan-submit]');
  const codeInput = smsSection.querySelector('[data-loan-code]');
  const codeError = smsSection.querySelector('[data-loan-code-error]');
  const confirmButton = smsSection.querySelector('[data-loan-confirm]');
  const editButton = smsSection.querySelector('[data-loan-edit]');

  let linkedCard = null;
  let currentCalculation = null;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function parseAmount(value) {
    return Number(String(value).replace(/\D/g, '')) || 0;
  }

  function formatNumber(value) {
    return Math.round(value).toLocaleString('ru-RU');
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  function formatDays(days) {
    const value = Number(days);
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

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + Number(days));
    return result;
  }

  function createLoanId() {
    return typeof crypto.randomUUID === 'function'
      ? `loan-${crypto.randomUUID()}`
      : `loan-${Date.now()}`;
  }

  function createContractNumber(loanId, issuedAt) {
    const date = new Date(issuedAt);
    const datePart = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('');

    const idPart = String(loanId)
      .replace(/[^a-z0-9]/gi, '')
      .slice(-6)
      .toUpperCase()
      .padStart(6, '0');

    return `RF-L-${datePart}-${idPart}`;
  }

  function normalizeAmount(value) {
    const min = Number(amountRange.min);
    const max = Number(amountRange.max);
    const step = Number(amountRange.step) || 1;
    const clamped = clamp(parseAmount(value), min, max);

    return clamp(
      min + Math.round((clamped - min) / step) * step,
      min,
      max
    );
  }

  function updateRangeFill(range) {
    const min = Number(range.min);
    const max = Number(range.max);
    const value = Number(range.value);
    const progress = ((value - min) / (max - min)) * 100;

    range.style.setProperty('--range-progress', `${progress}%`);
  }

  function calculateLoan(syncAmountInput = true) {
    const amount = Number(amountRange.value);
    const termDays = Number(termRange.value);
    const interest = amount * FIRST_LOAN_DAILY_RATE * termDays;
    const contractReturn = amount + interest;

    currentCalculation = {
      amount,
      termDays,
      dailyRate: FIRST_LOAN_DAILY_RATE,
      annualRate: FIRST_LOAN_ANNUAL_RATE,
      promoReturnAmount: amount,
      contractReturnAmount: Number(contractReturn.toFixed(2)),
      promoInterestAmount: 0,
      contractualInterestAmount: Number(interest.toFixed(2))
    };

    if (syncAmountInput) {
      amountInput.value = formatNumber(amount);
    }

    termOutput.textContent = formatDays(termDays);
    promoReturnOutput.textContent = formatMoney(amount);
    contractReturnOutput.textContent = formatMoney(contractReturn);

    updateRangeFill(amountRange);
    updateRangeFill(termRange);
  }

  function updateSubmitState() {
    submitButton.disabled = !consentInput.checked || !linkedCard;
  }

  amountRange.addEventListener('input', () => {
    calculateLoan(true);
  });

  amountInput.addEventListener('input', () => {
    const value = parseAmount(amountInput.value);

    if (!amountInput.value || value < FIRST_LOAN_MIN_AMOUNT) {
      amountRange.value = FIRST_LOAN_MIN_AMOUNT;
      calculateLoan(false);
      return;
    }

    amountRange.value = normalizeAmount(
      clamp(value, FIRST_LOAN_MIN_AMOUNT, FIRST_LOAN_MAX_AMOUNT)
    );
    calculateLoan(false);
  });

  amountInput.addEventListener('blur', () => {
    amountRange.value = normalizeAmount(amountInput.value);
    calculateLoan(true);
  });

  termRange.addEventListener('input', () => {
    calculateLoan(true);
  });

  helpButton.addEventListener('click', () => {
    const isOpen = helpPopover.hidden;

    helpPopover.hidden = !isOpen;
    helpButton.setAttribute('aria-expanded', String(isOpen));
  });

  function closeHelpPopover() {
    helpPopover.hidden = true;
    helpButton.setAttribute('aria-expanded', 'false');
  }

  document.addEventListener('click', (event) => {
    if (
      helpPopover.hidden ||
      helpButton.contains(event.target) ||
      helpPopover.contains(event.target)
    ) {
      return;
    }

    closeHelpPopover();
  });

  bindCardButton.addEventListener('click', () => {
    linkedCard = {
      provider: 'mock-card-binding',
      paymentToken: 'mock-card-token',
      network: 'МИР',
      mask: '•• 0000'
    };

    cardText.textContent = `${linkedCard.network} ${linkedCard.mask}`;
    bindCardButton.textContent = 'Изменить';
    updateSubmitState();
  });

  consentInput.addEventListener('change', updateSubmitState);

  loanForm.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!currentCalculation || !linkedCard || !consentInput.checked) {
      updateSubmitState();
      return;
    }

    loanForm.hidden = true;
    smsSection.hidden = false;
    codeInput.focus();
  });

  editButton.addEventListener('click', () => {
    smsSection.hidden = true;
    loanForm.hidden = false;
    codeError.hidden = true;
  });

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
    codeError.hidden = true;
  });

  confirmButton.addEventListener('click', () => {
    if (codeInput.value !== FIRST_LOAN_MOCK_CODE) {
      codeError.hidden = false;
      return;
    }

    const loans = readStorage('rf_loans', []);
    const issuedAt = new Date();
    const dueDate = addDays(issuedAt, currentCalculation.termDays);
    const loanId = createLoanId();

    const loan = {
      id: loanId,
      type: 'first_loan',
      productName: 'Первый займ',
      ownerPhone: loanSession.phone,
      status: 'active',
      amount: currentCalculation.amount,
      termDays: currentCalculation.termDays,
      dailyRate: currentCalculation.dailyRate,
      annualRate: currentCalculation.annualRate,
      promoReturnAmount: currentCalculation.promoReturnAmount,
      contractReturnAmount: currentCalculation.contractReturnAmount,
      contractualInterestAmount:
        currentCalculation.contractualInterestAmount,
      dueAmount: currentCalculation.promoReturnAmount,
      issuedAt: issuedAt.toISOString(),
      dueDate: dueDate.toISOString(),
      cardProvider: linkedCard.provider,
      cardToken: linkedCard.paymentToken,
      cardNetwork: linkedCard.network,
      cardMask: linkedCard.mask,
      contractNumber: createContractNumber(loanId, issuedAt),
      termsVersion: FIRST_LOAN_TERMS_VERSION,
      termsDocument: FIRST_LOAN_TERMS_DOCUMENT,
      termsAcceptedAt: issuedAt.toISOString(),
      signatureType: 'simple_electronic_signature',
      signatureChannel: 'sms',
      signatureMockCode: FIRST_LOAN_MOCK_CODE,
      disbursementProvider: 'mock-disbursement',
      disbursementStatus: 'completed',
      extensionUsedDays: 0,
      extensionCount: 0,
      maxExtensionDays: 30,
      maxExtensions: 5,
      promoEligible: true,
      extensions: [],
      operations: [
        {
          id: `operation-${Date.now()}-disbursement`,
          type: 'loan_disbursement',
          amount: currentCalculation.amount,
          status: 'completed',
          createdAt: issuedAt.toISOString()
        }
      ]
    };

    loans.push(loan);
    localStorage.setItem('rf_loans', JSON.stringify(loans));
    localStorage.setItem(
      'rf_dashboard_notice',
      JSON.stringify({
        type: 'loan_issued',
        ownerPhone: loanSession.phone,
        amount: loan.amount,
        cardMask: `${loan.cardNetwork} ${loan.cardMask}`,
        loanId: loan.id
      })
    );
    window.location.replace('dashboard.html?loanIssued=first');
  });

  calculateLoan();
  updateSubmitState();
}
