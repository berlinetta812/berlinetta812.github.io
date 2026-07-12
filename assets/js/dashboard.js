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
const storedLoans = readStorage('rf_loans', []);
const loans = Array.isArray(storedLoans)
  ? storedLoans.filter((loan) => loan.ownerPhone === session?.phone)
  : [];
const activeLoan = loans.find((loan) =>
  ['active', 'overdue', 'extension_pending'].includes(loan.status)
);
const firstLoanCompleted = loans.some(
  (loan) => loan.type === 'first_loan' && loan.status === 'paid'
);
const DEV_MOCK_LOAN_STATES = true;

const profile = {
  phone: session?.phone || '79991234567',
  name: session?.name || null,
  verified: session?.verified === true,
  email: null,
  loan: activeLoan || null,
  firstLoanCompleted,
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

const loanCard = document.querySelector('[data-loan-card]');
const loanTitle = document.querySelector('[data-loan-title]');
const loanText = document.querySelector('[data-loan-text]');
const loanVerificationBadge = document.querySelector(
  '[data-loan-verification-badge]'
);
const loanDevTools = document.querySelector('[data-loan-dev-tools]');
const resetFirstLoanButton = document.querySelector(
  '[data-reset-first-loan]'
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

function formatLoanDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long'
  }).format(date);
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

  if (notice.type === 'loan_issued') {
    document.querySelector(
      '[data-dashboard-notice-title]'
    ).textContent = 'Займ оформлен';
    document.querySelector(
      '[data-dashboard-notice-text]'
    ).textContent =
      `Сумма ${formatMoney(notice.amount)} отправлена на карту ${notice.cardMask}.`;
    dashboardNotice.hidden = false;
  }

  if (notice.type === 'loan_repaid') {
    document.querySelector(
      '[data-dashboard-notice-title]'
    ).textContent = 'Займ погашен';
    document.querySelector(
      '[data-dashboard-notice-text]'
    ).textContent = notice.promoApplied
      ? `Оплачено ${formatMoney(notice.amount)}. Проценты по акции составили 0 ₽.`
      : `Оплачено ${formatMoney(notice.amount)} с учетом начисленных процентов.`;
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
  if (profile.verified) {
    loanCard.classList.remove('is-locked');
    loanCard.href = profile.loan
      ? `loan-account.html?id=${encodeURIComponent(profile.loan.id)}`
      : 'first-loan.html';
    loanCard.removeAttribute('aria-disabled');
    loanCard.removeAttribute('tabindex');
    loanVerificationBadge.hidden = true;

    if (profile.loan) {
      loanTitle.textContent =
        `Активный займ на ${formatMoney(profile.loan.amount)}`;
      loanText.textContent =
        `Вернуть до ${formatLoanDate(profile.loan.dueDate)}`;
    } else if (profile.firstLoanCompleted) {
      loanCard.removeAttribute('href');
      loanCard.classList.add('is-locked');
      loanCard.setAttribute('aria-disabled', 'true');
      loanCard.tabIndex = -1;
      loanVerificationBadge.hidden = false;
      loanVerificationBadge.textContent = 'Кредитная линия скоро';
      loanTitle.textContent = 'Первый займ погашен';
      loanText.textContent =
        'Следующим этапом откроем кредитную линию';
    } else {
      loanTitle.textContent = 'Первый займ';
      loanText.textContent = 'Одобрено до 10 000 ₽ · Получить деньги';
    }
  } else {
    loanCard.removeAttribute('href');
    loanCard.classList.add('is-locked');
    loanCard.setAttribute('aria-disabled', 'true');
    loanCard.tabIndex = -1;
    loanVerificationBadge.hidden = false;
    loanVerificationBadge.textContent = 'Нужна верификация';
    loanTitle.textContent = 'Активных займов нет';
    loanText.textContent =
      'Первый займ до 10 000 ₽ после подтверждения личности';
  }

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

if (
  DEV_MOCK_LOAN_STATES &&
  profile.firstLoanCompleted &&
  !profile.loan
) {
  loanDevTools.hidden = false;
}

resetFirstLoanButton?.addEventListener('click', () => {
  const allLoans = readStorage('rf_loans', []);
  const remainingLoans = Array.isArray(allLoans)
    ? allLoans.filter(
        (item) =>
          item.ownerPhone !== session?.phone ||
          item.type !== 'first_loan'
      )
    : [];

  localStorage.setItem('rf_loans', JSON.stringify(remainingLoans));
  localStorage.removeItem('rf_dashboard_notice');
  window.location.replace('first-loan.html?devReset=1');
});

renderProfile();
renderProducts();
renderDashboardNotice();
