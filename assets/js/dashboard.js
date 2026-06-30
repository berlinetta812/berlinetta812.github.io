const session = JSON.parse(localStorage.getItem('rf_session') || 'null');

if (!session) {
  window.location.replace('login.html');
}

const profile = {
  phone: session?.phone || '79991234567',
  name: null,
  verified: false,
  email: null,
  loan: null,
  savings: null
};

const body = document.body;
const burgerButton = document.querySelector('.dashboard-burger');
const closeButton = document.querySelector('.dashboard-menu__close');
const overlay = document.querySelector('.dashboard-overlay');
const logoutButton = document.querySelector('.dashboard-logout');

const userName = document.querySelector('[data-user-name]');
const userStatus = document.querySelector('[data-user-status]');
const verifyCard = document.querySelector('[data-verify-card]');

const loanCard = document.querySelector('[data-loan-card]');
const loanTitle = document.querySelector('[data-loan-title]');
const loanText = document.querySelector('[data-loan-text]');

const savingsTitle = document.querySelector('[data-savings-title]');
const savingsText = document.querySelector('[data-savings-text]');
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
  body.classList.add('menu-open');
}

function unlockPageScroll() {
  body.classList.remove('menu-open');
  body.style.removeProperty('top');
  window.scrollTo(0, menuScrollPosition);
}

function openMenu() {
  lockPageScroll();
  overlay.hidden = false;
  burgerButton.setAttribute('aria-expanded', 'true');
  document.querySelector('.dashboard-menu').setAttribute('aria-hidden', 'false');
}

function closeMenu() {
  unlockPageScroll();
  overlay.hidden = true;
  burgerButton.setAttribute('aria-expanded', 'false');
  document.querySelector('.dashboard-menu').setAttribute('aria-hidden', 'true');
}

function renderProfile() {
  const phone = formatRussianPhone(profile.phone);

  if (profile.verified && profile.name) {
    userName.textContent = profile.name;
    userStatus.textContent = 'Подтвержденная учетная запись';
    verifyCard.hidden = true;
  } else {
    userName.textContent = phone;
    userStatus.textContent = 'Неподтвержденная учетная запись';
    verifyCard.hidden = false;
  }
}

function renderProducts() {
  if (profile.verified) {
    loanCard.classList.remove('is-locked');
    loanCard.setAttribute('role', 'link');
    loanCard.tabIndex = 0;
    loanTitle.textContent = profile.loan ? `Активный займ на ${profile.loan.amount} ₽` : 'Активных займов нет';
    loanText.textContent = profile.loan ? 'Перейти к деталям займа' : 'Доступно до 100 000 ₽';
  } else {
    loanCard.classList.add('is-locked');
    loanCard.removeAttribute('role');
    loanCard.removeAttribute('tabindex');
    loanTitle.textContent = 'Активных займов нет';
    loanText.textContent = 'Доступно до 100 000 ₽ после подтверждения личности';
  }

  if (profile.savings) {
    savingsTitle.textContent = `${profile.savings.amount} ₽ на сберегательном счете`;
    savingsText.textContent = 'Перейти к деталям счета';
  } else {
    savingsTitle.textContent = 'Нет открытых счетов';
    savingsText.textContent = 'Открыть сберегательный счет';
  }
}

burgerButton.addEventListener('click', openMenu);
closeButton.addEventListener('click', closeMenu);
overlay.addEventListener('click', closeMenu);

logoutButton.addEventListener('click', () => {
  localStorage.removeItem('rf_session');
  window.location.replace('index.html');
});

renderProfile();
renderProducts();
