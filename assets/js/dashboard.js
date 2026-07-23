const session = JSON.parse(localStorage.getItem('rf_session') || 'null');

if (!session) {
  window.location.replace('login.html');
}

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

let storedSavingsAccounts = readStorage(
  'rf_savings_accounts',
  []
);

function synchronizeSavingsMaturity(accounts) {
  if (!Array.isArray(accounts)) {
    return [];
  }

  let hasChanges = false;
  const now = new Date();
  const updatedAccounts = accounts.map((account) => {
    const maturityDate = new Date(account.maturityDate);

    if (
      account.ownerPhone !== session?.phone ||
      account.status !== 'active' ||
      Number.isNaN(maturityDate.getTime()) ||
      maturityDate > now
    ) {
      return account;
    }

    const principal = Number(
      account.principalAmount ??
      account.plannedAmount ??
      account.balance
    ) || 0;
    const rate = Number(
      account.fixedRate ?? account.previewRate
    ) || 0;
    const months = Number(account.termMonths) || 0;
    const calculation = window.RFSavingsCalculator.calculate(
      principal,
      months,
      rate
    );
    const total = calculation.finalAmount;
    const interest = calculation.income;
    const operationId =
      typeof crypto.randomUUID === 'function'
        ? `operation-${crypto.randomUUID()}`
        : `operation-${Date.now()}-interest`;

    hasChanges = true;

    return {
      ...account,
      principalAmount: Number(principal.toFixed(2)),
      balance: Number(total.toFixed(2)),
      earnedInterest: Number(interest.toFixed(2)),
      status: 'matured',
      maturedAt: account.maturityDate,
      operations: [
        ...(Array.isArray(account.operations)
          ? account.operations
          : []),
        {
          id: operationId,
          type: 'interest',
          amount: Number(interest.toFixed(2)),
          status: 'completed',
          createdAt: account.maturityDate
        }
      ]
    };
  });

  if (hasChanges) {
    localStorage.setItem(
      'rf_savings_accounts',
      JSON.stringify(updatedAccounts)
    );
  }

  return updatedAccounts;
}

storedSavingsAccounts = synchronizeSavingsMaturity(
  storedSavingsAccounts
);

const savingsAccounts = Array.isArray(storedSavingsAccounts)
  ? storedSavingsAccounts.filter(
      (account) => account.ownerPhone === session?.phone
    )
  : [];
const storedClosedSavingsAccounts = readStorage(
  'rf_closed_savings_accounts',
  []
);
const closedSavingsAccounts = Array.isArray(
  storedClosedSavingsAccounts
)
  ? storedClosedSavingsAccounts.filter(
      (account) => account.ownerPhone === session?.phone
    )
  : [];
let storedCreditLines = readStorage('rf_credit_lines', []);
const THIRD_STAGE_REPAID_PRINCIPAL = 30000;
const THIRD_STAGE_CREDIT_LIMIT = 50000;

function synchronizeCreditLineStatus(lines) {
  if (!Array.isArray(lines)) {
    return [];
  }

  let hasChanges = false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  lines.forEach((line) => {
    if (
      line.ownerPhone !== session?.phone ||
      !Array.isArray(line.drawdowns)
    ) {
      return;
    }

    line.drawdowns.forEach((drawdown) => {
      if (drawdown.status !== 'active') {
        return;
      }

      const overduePayment = drawdown.schedule?.find(
        (payment) => {
          const dueAt = new Date(payment.dueAt);
          dueAt.setHours(0, 0, 0, 0);

          return payment.status === 'pending' && dueAt < today;
        }
      );

      if (!overduePayment) {
        return;
      }

      drawdown.status = 'overdue';
      drawdown.promoEligible = false;
      drawdown.promoLostAt ||= new Date().toISOString();
      overduePayment.status = 'overdue';
      hasChanges = true;
    });

    const openDrawdowns = line.drawdowns.filter((drawdown) =>
      ['active', 'overdue'].includes(drawdown.status)
    );
    const repaidStandardPrincipal = line.drawdowns.reduce(
      (drawdownsTotal, drawdown) => {
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
      },
      0
    );

    if (
      Number(line.level) === 2 &&
      openDrawdowns.length === 0 &&
      repaidStandardPrincipal >= THIRD_STAGE_REPAID_PRINCIPAL
    ) {
      line.level = 3;
      line.limit = THIRD_STAGE_CREDIT_LIMIT;
      line.availableLimit = THIRD_STAGE_CREDIT_LIMIT;
      line.limitIncreasedAt = new Date().toISOString();
      localStorage.setItem(
        'rf_dashboard_notice',
        JSON.stringify({
          type: 'credit_limit_increased',
          ownerPhone: session.phone
        })
      );
      hasChanges = true;
    }
  });

  if (hasChanges) {
    localStorage.setItem('rf_credit_lines', JSON.stringify(lines));
  }

  return lines;
}

storedCreditLines = synchronizeCreditLineStatus(storedCreditLines);
const creditLine = Array.isArray(storedCreditLines)
  ? storedCreditLines.find(
      (line) => line.ownerPhone === session?.phone
    ) || null
  : null;
const profile = {
  phone: session?.phone || '79991234567',
  name: session?.name || null,
  verified: session?.verified === true,
  creditRestricted: session?.creditRestricted === true,
  creditRestrictionReason:
    session?.creditRestrictionReason || null,
  email: null,
  creditLine,
  savings: savingsAccounts,
  closedSavings: closedSavingsAccounts
};

const body = document.body;
const burgerButton = document.querySelector('.dashboard-burger');
const overlay = document.querySelector('.dashboard-overlay');
const logoutButton = document.querySelector('.dashboard-logout');

const userName = document.querySelector('[data-user-name]');
const userStatus = document.querySelector('[data-user-status]');
const verifyCard = document.querySelector('[data-verify-card]');
const creditLineCard = document.querySelector(
  '[data-credit-line-card]'
);
const creditLineTitle = document.querySelector(
  '[data-credit-line-title]'
);
const creditLineText = document.querySelector(
  '[data-credit-line-text]'
);
const creditLineBadge = document.querySelector(
  '[data-credit-line-badge]'
);

const savingsList = document.querySelector('[data-savings-list]');
const emptySavingsCard = document.querySelector(
  '[data-empty-savings-card]'
);
const savingsVerificationBadge = document.querySelector(
  '[data-savings-verification-badge]'
);
const newProductButton = document.querySelector('[data-new-product]');
const dashboardNotice = document.querySelector('[data-dashboard-notice]');
const resetCreditLineButton = document.querySelector(
  '[data-reset-credit-line]'
);
const savingsArchive = document.querySelector('[data-savings-archive]');
const closedSavingsList = document.querySelector(
  '[data-closed-savings-list]'
);
let menuScrollPosition = 0;

function formatRussianPhone(value) {
  const digits = String(value).replace(/\D/g, '').slice(0, 11);
  const local = digits.startsWith('7') ? digits.slice(1) : digits;

  if (local.length !== 10) return value;

  return `+7 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6, 8)}-${local.slice(8, 10)}`;
}

function lockPageScroll() {
  menuScrollPosition = window.scrollY;
  body.style.top = `-${menuScrollPosition}px`;
  body.style.setProperty('--menu-scroll-position', `${menuScrollPosition}px`);
  document.documentElement.classList.add('menu-open');
  body.classList.add('menu-open');
}

function unlockPageScroll() {
  document.documentElement.classList.remove('menu-open');
  body.classList.remove('menu-open');
  body.style.removeProperty('top');
  body.style.removeProperty('--menu-scroll-position');
  window.scrollTo(0, menuScrollPosition);
}

function openMenu() {
  lockPageScroll();
  overlay.hidden = false;
  burgerButton.classList.add('menu-open');
  burgerButton.setAttribute('aria-expanded', 'true');
  document.querySelector('.dashboard-menu').setAttribute('aria-hidden', 'false');
}

function closeMenu() {
  unlockPageScroll();
  overlay.hidden = true;
  burgerButton.classList.remove('menu-open');
  burgerButton.setAttribute('aria-expanded', 'false');
  document.querySelector('.dashboard-menu').setAttribute('aria-hidden', 'true');
}

function toggleMenu() {
  if (body.classList.contains('menu-open')) {
    closeMenu();
  } else {
    openMenu();
  }
}

function renderProfile() {
  const phone = formatRussianPhone(profile.phone);

  if (profile.verified) {
    userName.textContent = profile.name || phone;
    userStatus.textContent = 'Подтвержденная учетная запись';
    verifyCard.hidden = true;
  } else {
    userName.textContent = phone;
    userStatus.textContent = 'Неподтвержденная учетная запись';
    verifyCard.hidden = false;
  }
}

function formatMoney(value) {
  const amount = Math.round(Number(value) || 0);
  return `${amount.toLocaleString('ru-RU')} ₽`;
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('ru-RU').format(date);
}

function getActiveDrawdowns(line) {
  if (!line || !Array.isArray(line.drawdowns)) {
    return [];
  }

  return line.drawdowns.filter((drawdown) =>
    ['active', 'overdue'].includes(drawdown.status)
  );
}

function getNextLoanPayment(drawdowns) {
  if (!drawdowns.length) {
    return null;
  }

  const payments = drawdowns.flatMap((drawdown) =>
    drawdown.schedule
      .filter((payment) =>
        ['pending', 'overdue'].includes(payment.status)
      )
      .map((payment) => ({ drawdown, payment }))
  ).sort(
    (left, right) =>
      new Date(left.payment.dueAt) - new Date(right.payment.dueAt)
  );

  return payments[0] || null;
}

function renderDashboardNotice() {
  const notice = readStorage('rf_dashboard_notice', null);

  if (!notice || notice.ownerPhone !== session?.phone) {
    return;
  }

  if (notice.type === 'savings_closed') {
    document.querySelector(
      '[data-dashboard-notice-title]'
    ).textContent = 'Счет закрыт';
    document.querySelector(
      '[data-dashboard-notice-text]'
    ).textContent =
      `Сумма ${formatMoney(notice.amount)} возвращена клиенту.`;
    dashboardNotice.hidden = false;
  }

  if (notice.type === 'savings_renewed') {
    document.querySelector(
      '[data-dashboard-notice-title]'
    ).textContent = 'Договор пролонгирован';
    document.querySelector(
      '[data-dashboard-notice-text]'
    ).textContent =
      `Сумма ${formatMoney(notice.amount)} размещена повторно ` +
      `по ставке ${Number(notice.rate) || 0}% годовых.`;
    dashboardNotice.hidden = false;
  }

  if (notice.type === 'credit_line_opened') {
    document.querySelector(
      '[data-dashboard-notice-title]'
    ).textContent = 'Деньги отправлены';
    document.querySelector(
      '[data-dashboard-notice-text]'
    ).textContent =
      `Первый транш ${formatMoney(notice.amount)} оформлен.`;
    dashboardNotice.hidden = false;
  }

  if (notice.type === 'first_drawdown_repaid') {
    document.querySelector(
      '[data-dashboard-notice-title]'
    ).textContent = 'Задолженность успешно погашена';
    document.querySelector(
      '[data-dashboard-notice-text]'
    ).textContent =
      'Ваш кредитный лимит увеличен до 30 000 ₽.';
    dashboardNotice.hidden = false;
  }

  if (notice.type === 'credit_drawdown_opened') {
    document.querySelector(
      '[data-dashboard-notice-title]'
    ).textContent = 'Деньги отправлены';
    document.querySelector(
      '[data-dashboard-notice-text]'
    ).textContent =
      `Новый займ ${formatMoney(notice.amount)} оформлен.`;
    dashboardNotice.hidden = false;
  }

  if (notice.type === 'credit_drawdown_repaid') {
    document.querySelector(
      '[data-dashboard-notice-title]'
    ).textContent = 'Задолженность успешно погашена';
    document.querySelector(
      '[data-dashboard-notice-text]'
    ).textContent =
      `Вам снова доступно до ${formatMoney(profile.creditLine?.limit)}.`;
    dashboardNotice.hidden = false;
  }

  if (notice.type === 'credit_limit_increased') {
    document.querySelector(
      '[data-dashboard-notice-title]'
    ).textContent = 'Задолженность успешно погашена';
    document.querySelector(
      '[data-dashboard-notice-text]'
    ).textContent =
      'Ваш кредитный лимит увеличен до 50 000 ₽.';
    dashboardNotice.hidden = false;
  }

  localStorage.removeItem('rf_dashboard_notice');
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

function createSavingsCard(account) {
  const card = document.createElement('a');
  card.className = 'dashboard-product-card';
  card.href = `savings-account.html?id=${encodeURIComponent(account.id)}`;

  const content = document.createElement('div');

  const balance = document.createElement('p');
  balance.className = 'dashboard-product-card__title';
  balance.textContent = formatMoney(account.balance);

  const description = document.createElement('p');
  description.className = 'dashboard-product-card__text';
  description.textContent =
    `${account.title} · ${formatMonths(account.termMonths)}`;

  content.append(balance, description);

  if (account.status === 'awaiting_funding') {
    const status = document.createElement('span');
    status.className = 'dashboard-product-card__badge';
    status.textContent = 'Ожидает пополнения';
    content.append(status);
  }

  if (account.status === 'closure_pending') {
    const status = document.createElement('span');
    status.className = 'dashboard-product-card__badge';
    status.textContent = 'Закрытие счета';
    content.append(status);
  }

  if (account.status === 'matured') {
    const status = document.createElement('span');
    status.className = 'dashboard-product-card__badge';
    status.textContent = 'Срок завершен';
    content.append(status);
  }

  if (account.status === 'payout_pending') {
    const status = document.createElement('span');
    status.className = 'dashboard-product-card__badge';
    status.textContent = 'Ожидает выплаты';
    content.append(status);
  }

  if (account.status === 'payout_failed') {
    const status = document.createElement('span');
    status.className = 'dashboard-product-card__badge';
    status.textContent = 'Ошибка выплаты';
    content.append(status);
  }

  const arrow = document.createElement('img');
  arrow.className = 'dashboard-product-card__arrow';
  arrow.src = 'assets/svg/arrow-right.svg';
  arrow.alt = '';
  arrow.width = 20;
  arrow.height = 20;
  arrow.setAttribute('aria-hidden', 'true');

  card.append(content, arrow);

  return card;
}

function renderSavingsAccounts() {
  if (!profile.savings.length) {
    return;
  }

  savingsList.replaceChildren();

  profile.savings.forEach((account) => {
    savingsList.append(createSavingsCard(account));
  });
}

function renderClosedSavingsAccounts() {
  if (!profile.closedSavings.length) {
    return;
  }

  document.querySelector('[data-closed-savings-count]').textContent =
    String(profile.closedSavings.length);
  closedSavingsList.replaceChildren();

  profile.closedSavings
    .slice()
    .sort(
      (left, right) =>
        new Date(right.closedAt) - new Date(left.closedAt)
    )
    .forEach((account) => {
      const card = document.createElement('a');
      const content = document.createElement('div');
      const amount = document.createElement('p');
      const description = document.createElement('p');
      const status = document.createElement('span');
      const arrow = document.createElement('img');

      card.className = 'dashboard-product-card';
      card.href =
        `savings-account.html?id=${encodeURIComponent(account.id)}` +
        '&archive=closed';

      amount.className = 'dashboard-product-card__title';
      amount.textContent = formatMoney(account.returnedAmount);

      description.className = 'dashboard-product-card__text';
      description.textContent =
        `Закрыт ${formatDate(account.closedAt)}`;

      status.className = 'dashboard-product-card__badge';
      status.textContent = 'Архив';

      arrow.className = 'dashboard-product-card__arrow';
      arrow.src = 'assets/svg/arrow-right.svg';
      arrow.alt = '';
      arrow.width = 20;
      arrow.height = 20;
      arrow.setAttribute('aria-hidden', 'true');

      content.append(amount, description, status);
      card.append(content, arrow);
      closedSavingsList.append(card);
    });

  savingsArchive.hidden = false;
}

function renderCreditLine() {
  if (!creditLineCard) {
    return;
  }

  if (!profile.verified) {
    creditLineBadge.hidden = false;
    creditLineBadge.classList.remove('is-active');
    creditLineCard.removeAttribute('href');
    creditLineCard.classList.add('is-locked');
    creditLineCard.setAttribute('aria-disabled', 'true');
    creditLineCard.tabIndex = -1;
    return;
  }

  const restrictedActiveDrawdowns = profile.creditLine
    ? getActiveDrawdowns(profile.creditLine)
    : [];

  if (
    profile.creditRestricted &&
    restrictedActiveDrawdowns.length === 0
  ) {
    creditLineTitle.textContent = 'Кредитная линия недоступна';
    creditLineText.textContent =
      'Обратитесь в техническую поддержку';
    creditLineBadge.textContent = 'Недоступно';
    creditLineBadge.hidden = false;
    creditLineBadge.classList.remove('is-active');
    creditLineCard.removeAttribute('href');
    creditLineCard.classList.add('is-locked');
    creditLineCard.setAttribute('aria-disabled', 'true');
    creditLineCard.tabIndex = -1;
    return;
  }

  creditLineCard.classList.remove('is-locked');
  creditLineCard.removeAttribute('aria-disabled');
  creditLineCard.removeAttribute('tabindex');

  if (!profile.creditLine) {
    creditLineBadge.hidden = false;
    creditLineBadge.classList.remove('is-active');
    creditLineCard.href = 'credit-line.html';
    creditLineTitle.textContent = 'До 10 000 ₽';
    creditLineText.textContent =
      'Первый займ на срок от 2 до 4 недель';
    creditLineBadge.textContent =
      '0% при соблюдении графика';
    return;
  }

  const activeDrawdowns = getActiveDrawdowns(profile.creditLine);

  if (activeDrawdowns.length) {
    creditLineBadge.hidden = false;
    const nextPayment = getNextLoanPayment(activeDrawdowns);
    const hasOverdue = activeDrawdowns.some(
      (drawdown) => drawdown.status === 'overdue'
    );
    creditLineCard.href =
      `credit-line-account.html?id=${encodeURIComponent(profile.creditLine.id)}`;
    creditLineTitle.textContent =
      `Кредитный лимит ${formatMoney(profile.creditLine.limit)}`;
    creditLineText.textContent = nextPayment
      ? `Ближайший платеж ${formatDate(nextPayment.payment.dueAt)}`
      : 'Платежи выполнены';
    creditLineBadge.textContent =
      hasOverdue
        ? 'Есть просрочка'
        : 'Активен';
    creditLineBadge.classList.toggle(
      'is-active',
      !hasOverdue
    );
    return;
  }

  creditLineBadge.classList.remove('is-active');
  creditLineBadge.hidden = true;
  creditLineCard.href = 'credit-line.html';
  creditLineTitle.textContent =
    `Доступно до ${formatMoney(profile.creditLine.availableLimit)}`;
  creditLineText.textContent =
    'Новый займ на срок от 4 до 25 недель';
}

function renderProductAccess() {
  if (profile.verified) {
    if (emptySavingsCard) {
      emptySavingsCard.href = 'products.html';
      emptySavingsCard.classList.remove('is-locked');
      emptySavingsCard.removeAttribute('aria-disabled');
      emptySavingsCard.removeAttribute('tabindex');
    }

    if (savingsVerificationBadge) {
      savingsVerificationBadge.hidden = true;
    }

    newProductButton.href = 'products.html';
    newProductButton.classList.remove('is-disabled');
    newProductButton.removeAttribute('aria-disabled');
    newProductButton.removeAttribute('tabindex');
  } else {
    if (emptySavingsCard) {
      emptySavingsCard.removeAttribute('href');
      emptySavingsCard.classList.add('is-locked');
      emptySavingsCard.setAttribute('aria-disabled', 'true');
      emptySavingsCard.tabIndex = -1;
    }

    if (savingsVerificationBadge) {
      savingsVerificationBadge.hidden = false;
    }

    newProductButton.removeAttribute('href');
    newProductButton.classList.add('is-disabled');
    newProductButton.setAttribute('aria-disabled', 'true');
    newProductButton.tabIndex = -1;
  }
}

function renderProducts() {
  renderCreditLine();
  renderSavingsAccounts();
  renderClosedSavingsAccounts();
  renderProductAccess();
}

burgerButton.addEventListener('click', toggleMenu);
overlay.addEventListener('click', closeMenu);

logoutButton.addEventListener('click', () => {
  localStorage.removeItem('rf_session');
  window.location.replace('index.html');
});

resetCreditLineButton?.addEventListener('click', () => {
  const shouldReset = window.confirm(
    'Удалить кредитную линию и всю историю займов текущего mock-пользователя?'
  );

  if (!shouldReset) {
    return;
  }

  const creditLines = readStorage('rf_credit_lines', []);
  const remainingCreditLines = Array.isArray(creditLines)
    ? creditLines.filter(
        (line) => line.ownerPhone !== session?.phone
      )
    : [];
  const notice = readStorage('rf_dashboard_notice', null);

  localStorage.setItem(
    'rf_credit_lines',
    JSON.stringify(remainingCreditLines)
  );

  if (notice?.ownerPhone === session?.phone) {
    localStorage.removeItem('rf_dashboard_notice');
  }

  window.location.reload();
});

renderProfile();
renderProducts();
renderDashboardNotice();
