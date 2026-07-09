function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

const flowSession = readStorage('rf_session', null);
const SAVINGS_TERMS_VERSION = 'savings-2026-07-06-v1';
const SAVINGS_CALCULATION_VERSION = 'monthly-capitalization-v1';
const SAVINGS_TERMS_DOCUMENT = 'assets/docs/individual-terms.pdf';

if (!flowSession) {
  window.location.replace('login.html');
}

if (flowSession && flowSession.verified !== true) {
  window.location.replace('dashboard.html');
}

const savingsForm = document.querySelector('[data-savings-form]');

if (savingsForm) {
  const amountInput = savingsForm.querySelector('[data-savings-amount]');
  const amountRange = savingsForm.querySelector('[data-savings-range]');
  const termRange = savingsForm.querySelector('[data-savings-term]');
  const termOutput = savingsForm.querySelector(
    '[data-savings-term-output]'
  );

  const conditionTerm = savingsForm.querySelector(
    '[data-condition-term]'
  );

  const incomeOutput = savingsForm.querySelector(
    '[data-savings-income]'
  );

  const rateOutput = savingsForm.querySelector(
    '[data-savings-rate]'
  );

  const consentInput = savingsForm.querySelector(
    '[data-savings-consent]'
  );

  const submitButton = savingsForm.querySelector(
    '[data-savings-submit]'
  );

  let currentCalculation = null;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function formatNumber(value) {
    return Math.round(value).toLocaleString('ru-RU');
  }

  function formatMoney(value) {
    return `${formatNumber(value)} ₽`;
  }

  function createContractNumber(accountId, openedAt) {
    const date = new Date(openedAt);
    const datePart = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('');

    const idPart = String(accountId)
      .replace(/[^a-z0-9]/gi, '')
      .slice(-6)
      .toUpperCase()
      .padStart(6, '0');

    return `RF-S-${datePart}-${idPart}`;
  }

  function parseAmount(value) {
    return Number(String(value).replace(/\D/g, '')) || 0;
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

    range.style.setProperty(
      '--range-progress',
      `${progress}%`
    );
  }

  function calculateSavings(syncAmountInput = true) {
    const amount = Number(amountRange.value);
    const months = Number(termRange.value);
    currentCalculation =
      window.RFSavingsCalculator.calculate(amount, months);

    if (syncAmountInput) {
      amountInput.value = formatNumber(amount);
    }
    termOutput.textContent =
      window.RFSavingsCalculator.formatMonths(months);
    conditionTerm.textContent =
      window.RFSavingsCalculator.formatMonths(months);
    incomeOutput.textContent =
      formatMoney(currentCalculation.income);
    rateOutput.textContent = `${currentCalculation.rate}%`;

    updateRangeFill(amountRange);
    updateRangeFill(termRange);
  }

  amountRange.addEventListener('input', () => {
    calculateSavings(true);
  });

  termRange.addEventListener('input', () => {
    calculateSavings(true);
  });

  amountInput.addEventListener('input', () => {
    const value = parseAmount(amountInput.value);
    const min = Number(amountRange.min);
    const max = Number(amountRange.max);

    if (!amountInput.value || value < min) {
      amountRange.value = min;
      calculateSavings(false);
      return;
    }

    amountRange.value = normalizeAmount(
      clamp(value, min, max)
    );

    calculateSavings(false);
  });

  amountInput.addEventListener('blur', () => {
    amountRange.value = normalizeAmount(amountInput.value);
    calculateSavings(true);
  });

  consentInput.addEventListener('change', () => {
    submitButton.disabled = !consentInput.checked;
  });

  savingsForm.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!consentInput.checked || !currentCalculation) {
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Открываем счет...';

    const accounts = readStorage('rf_savings_accounts', []);

    const accountId =
      typeof crypto.randomUUID === 'function'
        ? `savings-${crypto.randomUUID()}`
        : `savings-${Date.now()}`;
    const openedAt = new Date().toISOString();
    const acceptedAt = openedAt;
    const contractSnapshot = {
      productCode: 'savings-fixed-term',
      productName: 'Сберегательный счет',
      amount: currentCalculation.amount,
      termMonths: currentCalculation.months,
      annualRate: currentCalculation.rate,
      projectedIncome: currentCalculation.income,
      projectedFinalAmount: currentCalculation.finalAmount,
      capitalization: 'monthly',
      interestPayout: 'at_maturity',
      additionalFunding: false,
      partialWithdrawal: false,
      earlyClosureInterest: 'forfeited',
      calculationVersion: SAVINGS_CALCULATION_VERSION
    };

    const account = {
      id: accountId,
      contractNumber: createContractNumber(accountId, openedAt),
      ownerPhone: flowSession.phone,
      title: 'Сберегательный счет',

      plannedAmount: currentCalculation.amount,
      balance: 0,

      termMonths: currentCalculation.months,

      previewRate: currentCalculation.rate,
      fixedRate: null,

      projectedIncome: currentCalculation.income,
      projectedFinalAmount: currentCalculation.finalAmount,

      termsVersion: SAVINGS_TERMS_VERSION,
      termsDocument: SAVINGS_TERMS_DOCUMENT,
      termsAcceptedAt: acceptedAt,
      consentMethod: 'checkbox',
      contractSnapshot,

      status: 'awaiting_funding',
      openedAt,
      fundedAt: null
    };

    accounts.push(account);

    localStorage.setItem(
      'rf_savings_accounts',
      JSON.stringify(accounts)
    );

    window.location.replace(
      'dashboard.html?accountOpened=savings'
    );
  });

  calculateSavings();
}
