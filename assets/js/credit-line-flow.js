function readCreditStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

const creditSession = readCreditStorage('rf_session', null);
const MOCK_SMS_CODE = '111111';
const CREDIT_LINE_TERMS_VERSION = 'credit-line-2026-07-v1';
const CREDIT_LINE_DOCUMENT = 'assets/docs/credit-line-terms.pdf';

if (!creditSession) {
  window.location.replace('login.html');
}

if (creditSession && creditSession.verified !== true) {
  window.location.replace('dashboard.html');
}

if (creditSession?.creditRestricted === true) {
  window.location.replace('dashboard.html');
}

const existingCreditLines = readCreditStorage(
  'rf_credit_lines',
  []
);
const existingCreditLine = Array.isArray(existingCreditLines)
  ? existingCreditLines.find(
      (line) => line.ownerPhone === creditSession?.phone
    )
  : null;
const existingOpenDrawdowns = existingCreditLine?.drawdowns?.filter(
  (drawdown) => ['active', 'overdue'].includes(drawdown.status)
) || [];
const existingOverdueDrawdown = existingOpenDrawdowns.find(
  (drawdown) => drawdown.status === 'overdue'
);
const isRepeatDrawdown = Boolean(
  existingCreditLine &&
  Number(existingCreditLine.level) >= 2 &&
  !existingOverdueDrawdown &&
  Number(existingCreditLine.availableLimit) >= 2000
);
const repeatMaxAmount = Math.floor(
  Number(existingCreditLine?.availableLimit || 0) / 100
) * 100;

if (existingCreditLine && !isRepeatDrawdown) {
  window.location.replace(
    `credit-line-account.html?id=${encodeURIComponent(existingCreditLine.id)}`
  );
}

const creditForm = document.querySelector('[data-credit-line-form]');
const smsSection = document.querySelector('[data-credit-sms]');

if (creditForm && smsSection) {
  const productConfig = isRepeatDrawdown
    ? {
        minAmount: 2000,
        maxAmount: repeatMaxAmount,
        defaultAmount: Math.min(
          10000,
          repeatMaxAmount
        ),
        amountStep: 100,
        minWeeks: 4,
        maxWeeks: 25,
        termStep: 1,
        defaultWeeks: 4,
        dailyRate: window.RFCreditLineCalculator.STANDARD_DAILY_RATE,
        promoEligible: false
      }
    : {
        minAmount: 2000,
        maxAmount: 10000,
        defaultAmount: 5000,
        amountStep: 100,
        minWeeks: 2,
        maxWeeks: 4,
        termStep: 2,
        defaultWeeks: 4,
        dailyRate: window.RFCreditLineCalculator.DAILY_RATE,
        promoEligible: true
      };
  const amountInput = creditForm.querySelector('[data-credit-amount]');
  const amountRange = creditForm.querySelector(
    '[data-credit-amount-range]'
  );
  const termRange = creditForm.querySelector('[data-credit-term]');
  const termOutput = creditForm.querySelector(
    '[data-credit-term-output]'
  );
  const paymentCountOutput = creditForm.querySelector(
    '[data-credit-payment-count]'
  );
  const maxPaymentOutput = creditForm.querySelector(
    '[data-credit-max-payment]'
  );
  const lastPaymentOutput = creditForm.querySelector(
    '[data-credit-last-payment]'
  );
  const cardText = creditForm.querySelector(
    '[data-credit-card-text]'
  );
  const bindCardButton = creditForm.querySelector(
    '[data-credit-bind-card]'
  );
  const cardEditor = creditForm.querySelector(
    '[data-credit-card-editor]'
  );
  const cardLastFourInput = creditForm.querySelector(
    '[data-credit-card-last-four]'
  );
  const cardError = creditForm.querySelector(
    '[data-credit-card-error]'
  );
  const saveCardButton = creditForm.querySelector(
    '[data-credit-save-card]'
  );
  const cancelCardButton = creditForm.querySelector(
    '[data-credit-cancel-card]'
  );
  const consentInput = creditForm.querySelector(
    '[data-credit-consent]'
  );
  const submitButton = creditForm.querySelector(
    '[data-credit-submit]'
  );
  const codeInput = smsSection.querySelector('[data-credit-code]');
  const codeError = smsSection.querySelector(
    '[data-credit-code-error]'
  );
  const confirmButton = smsSection.querySelector(
    '[data-credit-confirm]'
  );
  const editButton = smsSection.querySelector('[data-credit-edit]');
  const previewScheduleList = creditForm.querySelector(
    '[data-credit-preview-schedule]'
  );
  const previewScheduleToggle = creditForm.querySelector(
    '[data-credit-preview-toggle]'
  );
  const previewScheduleCaption = creditForm.querySelector(
    '[data-credit-schedule-caption]'
  );
  let cardIsBound = false;
  let cardLastFour = '';
  let pendingCalculation = null;
  let previewScheduleExpanded = false;

  function configureProduct() {
    amountRange.min = String(productConfig.minAmount);
    amountRange.max = String(productConfig.maxAmount);
    amountRange.step = String(productConfig.amountStep);
    amountRange.value = String(productConfig.defaultAmount);
    termRange.min = String(productConfig.minWeeks);
    termRange.max = String(productConfig.maxWeeks);
    termRange.step = String(productConfig.termStep);
    termRange.value = String(productConfig.defaultWeeks);

    document.querySelector('[data-credit-amount-min]').textContent =
      formatMoney(productConfig.minAmount);
    document.querySelector('[data-credit-amount-max]').textContent =
      formatMoney(productConfig.maxAmount);
    document.querySelector('[data-credit-term-min]').textContent =
      formatWeeks(productConfig.minWeeks);
    document.querySelector('[data-credit-term-max]').textContent =
      formatWeeks(productConfig.maxWeeks);

    if (!isRepeatDrawdown) {
      return;
    }

    document.title = 'Новый транш | Р-Финанс';
    document.querySelector('[data-credit-audience]').textContent =
      `Доступно по линии ${formatMoney(existingCreditLine.availableLimit)}`;
    document.querySelector('[data-credit-heading]').textContent =
      'Новый займ';
    document.querySelector('[data-credit-description]').textContent =
      'Выберите сумму и срок нового транша в рамках действующего кредитного лимита.';
    document.querySelector('[data-credit-promo-note]').textContent =
      'Платежи вносятся каждые 2 недели по индивидуальному графику.';
    document.querySelector('[data-credit-conditions]').innerHTML =
      `<li>Лимит кредитной линии — до ${formatMoney(existingCreditLine.limit)}</li>` +
      '<li>Срок займа — от 4 до 25 недель</li>' +
      '<li>Погашение каждые 14 дней</li>';
    document.querySelector('[data-credit-consent-copy]').textContent =
      'Ознакомьтесь с';
    document.querySelector('[data-credit-consent-link]').textContent =
      'индивидуальными условиями нового займа';
    consentInput.hidden = true;
    consentInput.closest('.savings-consent')?.classList.add(
      'is-information-only'
    );
    document.querySelector('[data-credit-sms-heading]').textContent =
      'Подтвердите индивидуальные условия займа';

    const lastCard = existingCreditLine.drawdowns
      .slice()
      .reverse()
      .find((drawdown) => drawdown.card)?.card;

    if (lastCard?.maskedNumber) {
      cardLastFour = lastCard.maskedNumber.slice(-4);
      cardIsBound = true;
      cardText.textContent =
        `${lastCard.network || 'МИР'} ${lastCard.maskedNumber}`;
      bindCardButton.textContent = 'Изменить';
    }
  }

  function createId(prefix) {
    return typeof crypto.randomUUID === 'function'
      ? `${prefix}-${crypto.randomUUID()}`
      : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function formatNumber(value) {
    return Math.round(Number(value) || 0).toLocaleString('ru-RU');
  }

  function formatMoney(value) {
    return `${Number(value).toLocaleString('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })} ₽`;
  }

  function formatWeeks(value) {
    const weeks = Number(value);
    const lastTwo = weeks % 100;
    const lastOne = weeks % 10;

    if (lastTwo >= 11 && lastTwo <= 14) {
      return `${weeks} недель`;
    }
    if (lastOne === 1) {
      return `${weeks} неделя`;
    }
    if (lastOne >= 2 && lastOne <= 4) {
      return `${weeks} недели`;
    }
    return `${weeks} недель`;
  }

  function formatPaymentCount(value) {
    const count = Number(value);
    const lastTwo = count % 100;
    const lastOne = count % 10;

    if (lastTwo >= 11 && lastTwo <= 14) {
      return `${count} платежей`;
    }
    if (lastOne === 1) {
      return `${count} платеж`;
    }
    if (lastOne >= 2 && lastOne <= 4) {
      return `${count} платежа`;
    }
    return `${count} платежей`;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(value));
  }

  function getLocalDateKey(value) {
    const date = new Date(value);

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function getPlannedPaymentAmount(drawdown, payment) {
    return Number(
      drawdown?.promoEligible
        ? payment.promoAmount
        : payment.contractualAmount
    ) || 0;
  }

  function buildPreviewSchedule(schedule) {
    const entries = schedule.map((payment) => ({
      dueAt: payment.dueAt,
      amount: productConfig.promoEligible
        ? payment.promoAmount
        : payment.contractualAmount,
      isNew: true
    }));

    if (isRepeatDrawdown) {
      existingOpenDrawdowns.forEach((drawdown) => {
        if (!Array.isArray(drawdown.schedule)) {
          return;
        }

        drawdown.schedule
          .filter((payment) => ['pending', 'overdue'].includes(payment.status))
          .forEach((payment) => {
            entries.push({
              dueAt: payment.dueAt,
              amount: getPlannedPaymentAmount(drawdown, payment),
              isNew: false
            });
          });
      });
    }

    const groups = new Map();

    entries.forEach((entry) => {
      const key = getLocalDateKey(entry.dueAt);
      const group = groups.get(key) || {
        key,
        dueAt: entry.dueAt,
        amount: 0,
        includesNewPayment: false
      };

      group.amount = window.RFCreditLineCalculator.roundMoney(
        group.amount + Number(entry.amount || 0)
      );
      group.includesNewPayment ||= entry.isNew;
      groups.set(key, group);
    });

    return [...groups.values()].sort(
      (left, right) => new Date(left.dueAt) - new Date(right.dueAt)
    );
  }

  function renderPreviewSchedule(groups) {
    const previewLimit = 3;
    const visibleGroups = previewScheduleExpanded
      ? groups
      : groups.slice(0, previewLimit);

    previewScheduleList.replaceChildren();

    visibleGroups.forEach((group) => {
      const item = document.createElement('li');
      const date = document.createElement('time');
      const amount = document.createElement('strong');

      date.dateTime = group.dueAt;
      date.textContent = formatDate(group.dueAt);
      amount.textContent = formatMoney(group.amount);
      item.append(date, amount);
      previewScheduleList.append(item);
    });

    previewScheduleCaption.textContent = isRepeatDrawdown &&
      existingOpenDrawdowns.length
      ? 'Общая нагрузка с учетом действующих займов'
      : 'Платежи по оформляемому займу';
    previewScheduleToggle.hidden = groups.length <= previewLimit;
    previewScheduleToggle.textContent = previewScheduleExpanded
      ? 'Свернуть'
      : 'Весь график';
    previewScheduleToggle.setAttribute(
      'aria-expanded',
      String(previewScheduleExpanded)
    );
  }

  function parseAmount(value) {
    return Number(String(value).replace(/\D/g, '')) || 0;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeAmount(value) {
    const min = Number(amountRange.min);
    const max = Number(amountRange.max);
    const step = Number(amountRange.step);
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

  function updateSubmitState() {
    submitButton.disabled = !(
      cardIsBound && (isRepeatDrawdown || consentInput.checked)
    );
  }

  function calculate(syncAmount = true) {
    const amount = Number(amountRange.value);
    const weeks = Number(termRange.value);
    const previewDate = new Date();
    const schedule = window.RFCreditLineCalculator.createSchedule(
      amount,
      weeks,
      previewDate,
      productConfig.dailyRate
    );
    const summary =
      window.RFCreditLineCalculator.summarizeSchedule(schedule);
    const previewSchedule = buildPreviewSchedule(schedule);
    const newLastPayment = schedule.at(-1);
    const newLastPaymentKey = getLocalDateKey(newLastPayment.dueAt);
    const lastPaymentGroup = previewSchedule.find(
      (group) => group.key === newLastPaymentKey
    );
    const maxPayment = Math.max(
      ...previewSchedule.map((group) => group.amount)
    );

    pendingCalculation = {
      amount,
      weeks,
      schedule,
      summary
    };

    if (syncAmount) {
      amountInput.value = formatNumber(amount);
    }
    termOutput.textContent = formatWeeks(weeks);
    paymentCountOutput.textContent =
      formatPaymentCount(schedule.length);
    maxPaymentOutput.textContent = formatMoney(maxPayment);
    lastPaymentOutput.textContent = formatMoney(
      lastPaymentGroup?.amount || 0
    );
    renderPreviewSchedule(previewSchedule);
    updateRangeFill(amountRange);
    updateRangeFill(termRange);
  }

  previewScheduleToggle.addEventListener('click', () => {
    previewScheduleExpanded = !previewScheduleExpanded;
    calculate(false);
  });

  function createContractNumber(lineId, signedAt) {
    const date = new Date(signedAt);
    const datePart = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('');
    const idPart = lineId
      .replace(/[^a-z0-9]/gi, '')
      .slice(-6)
      .toUpperCase()
      .padStart(6, '0');
    return `P-K-${datePart}-${idPart}`;
  }

  amountRange.addEventListener('input', () => calculate(true));
  termRange.addEventListener('input', () => calculate(true));

  amountInput.addEventListener('input', () => {
    const value = parseAmount(amountInput.value);
    const min = Number(amountRange.min);
    const max = Number(amountRange.max);

    amountRange.value = value < min
      ? min
      : normalizeAmount(clamp(value, min, max));
    calculate(false);
  });

  amountInput.addEventListener('blur', () => {
    amountRange.value = normalizeAmount(amountInput.value);
    calculate(true);
  });

  bindCardButton.addEventListener('click', () => {
    cardLastFourInput.value = cardLastFour;
    cardError.hidden = true;
    cardEditor.hidden = false;
    cardLastFourInput.focus();
  });

  cardLastFourInput.addEventListener('input', () => {
    cardLastFourInput.value = cardLastFourInput.value
      .replace(/\D/g, '')
      .slice(0, 4);
    cardError.hidden = true;
  });

  saveCardButton.addEventListener('click', () => {
    const value = cardLastFourInput.value;

    if (value.length !== 4) {
      cardError.hidden = false;
      cardLastFourInput.focus();
      return;
    }

    cardLastFour = value;
    cardIsBound = true;
    cardText.textContent = `МИР •••• ${cardLastFour}`;
    bindCardButton.textContent = 'Изменить';
    cardEditor.hidden = true;
    updateSubmitState();
  });

  cancelCardButton.addEventListener('click', () => {
    cardEditor.hidden = true;
    cardError.hidden = true;
  });

  consentInput.addEventListener('change', updateSubmitState);

  creditForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (
      !pendingCalculation ||
      !cardIsBound ||
      (!isRepeatDrawdown && !consentInput.checked)
    ) {
      return;
    }

    if (isRepeatDrawdown) {
      submitButton.disabled = true;
      submitButton.textContent = 'Оформляем...';
      completeCreditLineOpening();
      return;
    }

    creditForm.hidden = true;
    smsSection.hidden = false;
    codeInput.focus();
  });

  editButton.addEventListener('click', () => {
    smsSection.hidden = true;
    creditForm.hidden = false;
    codeInput.value = '';
    codeError.hidden = true;
  });

  function completeCreditLineOpening() {
    if (!pendingCalculation) {
      return;
    }

    const signedAt = new Date();
    const agreementExpiresAt = new Date(signedAt);
    agreementExpiresAt.setFullYear(
      agreementExpiresAt.getFullYear() + 5
    );
    const lineId = isRepeatDrawdown
      ? existingCreditLine.id
      : createId('credit-line');
    const drawdownId = createId('drawdown');
    const sequence = isRepeatDrawdown
      ? existingCreditLine.drawdowns.length + 1
      : 1;
    const schedule = window.RFCreditLineCalculator.createSchedule(
      pendingCalculation.amount,
      pendingCalculation.weeks,
      signedAt,
      productConfig.dailyRate
    );
    const summary =
      window.RFCreditLineCalculator.summarizeSchedule(schedule);
    const drawdown = {
      id: drawdownId,
      sequence,
      productCode: isRepeatDrawdown
        ? 'standard-drawdown'
        : 'first-drawdown',
      amount: pendingCalculation.amount,
      outstandingPrincipal: pendingCalculation.amount,
      termWeeks: pendingCalculation.weeks,
      paymentIntervalDays: 14,
      dailyRate: productConfig.dailyRate,
      penaltyAnnualRate:
        window.RFCreditLineCalculator.PENALTY_ANNUAL_RATE,
      maxChargeMultiplier:
        window.RFCreditLineCalculator.MAX_CHARGE_MULTIPLIER,
      promoRate: productConfig.promoEligible ? 0 : null,
      promoEligible: productConfig.promoEligible,
      promoLostAt: null,
      contractualInterest: summary.contractualInterest,
      contractualAmount: summary.contractualAmount,
      promoAmount: summary.promoAmount,
      status: 'active',
      issuedAt: signedAt.toISOString(),
      dueAt: schedule.at(-1).dueAt,
      repaidAt: null,
      termsVersion: CREDIT_LINE_TERMS_VERSION,
      termsDocument: CREDIT_LINE_DOCUMENT,
      consentMethod: isRepeatDrawdown
        ? 'existing_credit_line_agreement'
        : 'sms_mock',
      schedule,
      operations: [
        {
          id: createId('operation'),
          sourceId: `issuance-${drawdownId}`,
          type: 'issuance',
          title: 'Выдача займа',
          amount: pendingCalculation.amount,
          direction: 'incoming',
          status: 'completed',
          createdAt: signedAt.toISOString()
        }
      ],
      card: {
        network: 'МИР',
        maskedNumber: `•••• ${cardLastFour}`
      }
    };
    const contractSnapshot = {
      productCode: 'revolving-credit-line',
      agreementYears: 5,
      initialLimit: isRepeatDrawdown
        ? existingCreditLine.limit
        : 10000,
      amount: pendingCalculation.amount,
      termWeeks: pendingCalculation.weeks,
      dailyRate: productConfig.dailyRate,
      penaltyAnnualRate:
        window.RFCreditLineCalculator.PENALTY_ANNUAL_RATE,
      maxChargeMultiplier:
        window.RFCreditLineCalculator.MAX_CHARGE_MULTIPLIER,
      paymentIntervalDays: 14,
      promoCondition: productConfig.promoEligible
        ? 'all_payments_on_time'
        : null,
      promoRate: productConfig.promoEligible ? 0 : null,
      paymentCount: schedule.length,
      contractualInterest: summary.contractualInterest,
      contractualAmount: summary.contractualAmount,
      promoAmount: summary.promoAmount
    };
    const creditLine = {
      id: lineId,
      contractNumber: createContractNumber(lineId, signedAt),
      ownerPhone: creditSession.phone,
      status: 'active',
      level: 1,
      limit: 10000,
      availableLimit: window.RFCreditLineCalculator.roundMoney(
        10000 - pendingCalculation.amount
      ),
      completedDrawdowns: 0,
      agreementSignedAt: signedAt.toISOString(),
      agreementExpiresAt: agreementExpiresAt.toISOString(),
      termsVersion: CREDIT_LINE_TERMS_VERSION,
      termsDocument: CREDIT_LINE_DOCUMENT,
      consentMethod: 'sms_mock',
      contractSnapshot,
      drawdowns: [drawdown]
    };
    const lines = readCreditStorage('rf_credit_lines', []);
    let noticeType = 'credit_line_opened';

    if (isRepeatDrawdown) {
      const lineIndex = lines.findIndex(
        (line) => line.id === existingCreditLine.id
      );

      if (lineIndex < 0) {
        window.location.replace('dashboard.html');
        return;
      }

      drawdown.conditionsSnapshot = contractSnapshot;
      lines[lineIndex].drawdowns.push(drawdown);
      const outstandingPrincipal = lines[lineIndex].drawdowns.reduce(
        (total, storedDrawdown) =>
          ['active', 'overdue'].includes(storedDrawdown.status)
            ? total + Number(storedDrawdown.outstandingPrincipal || 0)
            : total,
        0
      );
      lines[lineIndex].availableLimit =
        window.RFCreditLineCalculator.roundMoney(
          Math.max(
            0,
            Number(lines[lineIndex].limit) - outstandingPrincipal
          )
        );
      noticeType = 'credit_drawdown_opened';
    } else {
      lines.push(creditLine);
    }

    localStorage.setItem('rf_credit_lines', JSON.stringify(lines));
    localStorage.setItem(
      'rf_dashboard_notice',
      JSON.stringify({
        type: noticeType,
        ownerPhone: creditSession.phone,
        amount: pendingCalculation.amount
      })
    );
    window.location.replace(
      `credit-line-account.html?id=${encodeURIComponent(lineId)}`
    );
  }

  function verifyCode() {
    if (codeInput.value !== MOCK_SMS_CODE) {
      codeError.hidden = false;
      codeInput.select();
      return;
    }

    confirmButton.disabled = true;
    confirmButton.textContent = 'Оформляем...';
    completeCreditLineOpening();
  }

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
    codeError.hidden = true;
  });
  confirmButton.addEventListener('click', verifyCode);

  configureProduct();
  updateSubmitState();
  calculate();
}
