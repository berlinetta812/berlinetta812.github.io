if (localStorage.getItem('rf_session')) {
  window.location.replace('dashboard.html');
}

const phoneForm = document.getElementById('phone-form');
const phoneField = document.getElementById('phone-field');
const phoneInput = document.getElementById('auth-phone');
const phoneError = document.getElementById('phone-error');
const authCopy = document.querySelector('.auth-container > .auth-copy');
const authLegal = document.querySelector('.auth-legal');
const codeStep = document.getElementById('code-step');
const codeForm = document.getElementById('code-form');
const codeField = document.getElementById('code-field');
const codeInput = document.getElementById('auth-code');
const codeError = document.getElementById('code-error');
const codePhone = document.getElementById('code-phone');
const resendButton = document.getElementById('resend-code');


const MOCK_CODE = '111111';
const MOCK_USERS = {
  '79991234567': {
    id: 1,
    phone: '79991234567',
    verified: false
  }
};
let currentPhone = '';
let resendTimer;


function normalizeRussianPhone(value) {
  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  } else if (!digits.startsWith('7') && digits.length > 0) {
    digits = `7${digits}`;
  }

  return digits.slice(0, 11);
}

function formatRussianPhone(value) {
  const digits = normalizeRussianPhone(value);

  if (!digits) return '';

  const local = digits.slice(1);
  let formatted = '+7';

  if (local.length > 0) formatted += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) formatted += ')';
  if (local.length > 3) formatted += ` ${local.slice(3, 6)}`;
  if (local.length > 6) formatted += `-${local.slice(6, 8)}`;
  if (local.length > 8) formatted += `-${local.slice(8, 10)}`;

  return formatted;
}

function setPhoneError(visible) {
  phoneField.classList.toggle('is-invalid', visible);
  phoneInput.setAttribute('aria-invalid', String(visible));
  phoneError.hidden = !visible;
}

if (phoneInput && phoneForm && phoneField && phoneError) {
  phoneInput.addEventListener('input', () => {
    phoneInput.value = formatRussianPhone(phoneInput.value);
    setPhoneError(false);
  });

  phoneForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const digits = normalizeRussianPhone(phoneInput.value);
    const isValid = digits.length === 11;

    setPhoneError(!isValid);

    if (!isValid) {
      phoneInput.focus();
      return;
    }

    currentPhone = digits;
    authCopy.hidden = true;
    phoneForm.hidden = true;
    authLegal.hidden = true;
    codePhone.textContent = formatRussianPhone(digits);
    codeStep.hidden = false;
    startResendTimer();
    codeInput.focus();
  });
}

function setCodeError(visible) {
  codeField.classList.toggle('is-invalid', visible);
  codeInput.setAttribute('aria-invalid', String(visible));
  codeError.hidden = !visible;
}

function startResendTimer() {
  let seconds = 40;
  clearInterval(resendTimer);
  resendButton.disabled = true;

  resendButton.textContent = `Отправим код повторно через ${seconds} сек`;

  resendTimer = setInterval(() => {
    seconds -= 1;

    if (seconds <= 0) {
      clearInterval(resendTimer);
      resendButton.disabled = false;
      resendButton.textContent = 'Отправить еще раз';
      return;
    }

    resendButton.textContent = `Отправим код повторно через ${seconds} сек`;
  }, 1000);
}

function completeAuth() {
  const storedUsers = JSON.parse(localStorage.getItem('rf_users') || '{}');
  let user = MOCK_USERS[currentPhone] || storedUsers[currentPhone];

  if (!user) {
    user = {
      id: Date.now(),
      phone: currentPhone,
      verified: false
    };

    storedUsers[currentPhone] = user;
    localStorage.setItem('rf_users', JSON.stringify(storedUsers));
  }

  localStorage.setItem('rf_session', JSON.stringify(user));
  window.location.href = 'dashboard.html';
}

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
  setCodeError(false);

  if (codeInput.value.length === 6) {
    if (codeInput.value === MOCK_CODE) {
      completeAuth();
    } else {
      setCodeError(true);
      codeInput.select();
    }
  }
});

codeForm.addEventListener('submit', event => {
  event.preventDefault();

  if (codeInput.value === MOCK_CODE) {
    completeAuth();
  } else {
    setCodeError(true);
  }
});

resendButton.addEventListener('click', () => {
  codeInput.value = '';
  setCodeError(false);
  startResendTimer();
  codeInput.focus();
});