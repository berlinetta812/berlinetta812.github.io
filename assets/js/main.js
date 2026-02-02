function updateViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

document.addEventListener('DOMContentLoaded', updateViewportHeight);
window.addEventListener('resize', updateViewportHeight);
window.addEventListener('orientationchange', updateViewportHeight);

const burgerBtn = document.querySelector('.btn-burger');
const mobileNav = document.querySelector('.mobile-nav');

if (burgerBtn && mobileNav) {
  burgerBtn.addEventListener('click', () => {
    const isOpen = burgerBtn.classList.toggle('menu-open');

    burgerBtn.setAttribute('aria-expanded', isOpen);
    mobileNav.setAttribute('aria-hidden', !isOpen);
    document.body.classList.toggle('menu-open', isOpen);
  });
}

const overlay = document.querySelector('.menu-overlay');

if (overlay && burgerBtn) {
  overlay.addEventListener('click', () => {
    burgerBtn.classList.remove('menu-open');
    burgerBtn.setAttribute('aria-expanded', false);

    document.body.classList.remove('menu-open');
    mobileNav.setAttribute('aria-hidden', true);
  });
}

const range = document.getElementById('loan-range');
const loanAmountEl = document.getElementById('loan-amount');
const returnNewEl = document.getElementById('return-new');
const returnOldEl = document.getElementById('return-old');

const INTEREST_RATE = 1.24;

function formatRub(value) {
  return value.toLocaleString('ru-RU');
}

function updateRangeFill(el) {
  const min = Number(el.min) || 0;
  const max = Number(el.max) || 100;
  const val = Number(el.value) || 0;

  const percent = ((val - min) * 100) / (max - min);
  el.style.setProperty('--p', `${percent}%`);
}

function updateCalculator(value) {
  const amount = Number(value);
  const oldAmount = Math.round(amount * INTEREST_RATE);

  loanAmountEl.textContent = formatRub(amount);
  returnNewEl.textContent = formatRub(amount);
  returnOldEl.textContent = formatRub(oldAmount);
  updateRangeFill(range);
}

range.addEventListener('input', (e) => {
  updateCalculator(e.target.value);
});

updateCalculator(range.value);

// ===== Bottom sheets (универсально) =====
const sheetOverlay = document.querySelector('[data-sheet-overlay]');
const sheetCloseBtns = document.querySelectorAll('[data-sheet-close]');

function openSheetById(sheetId, triggerBtn) {
  const sheet = document.getElementById(sheetId);
  if (!sheet || !sheetOverlay) return;

  // 1) Закрываем все другие bottom-sheet
  document.querySelectorAll('.bottom-sheet').forEach(s => {
    s.setAttribute('aria-hidden', 'true');
  });

  // 2) Сбрасываем aria-expanded у всех триггеров
  document.querySelectorAll('[data-sheet-target]').forEach(btn => {
    btn.setAttribute('aria-expanded', 'false');
  });

  // 3) Открываем нужный
  document.body.classList.add('sheet-open');
  sheet.setAttribute('aria-hidden', 'false');
  sheetOverlay.setAttribute('aria-hidden', 'false');

  if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'true');
}

function closeAllSheets() {
  document.body.classList.remove('sheet-open');

  document.querySelectorAll('.bottom-sheet[aria-hidden="false"]').forEach(s => {
    s.setAttribute('aria-hidden', 'true');
  });

  if (sheetOverlay) sheetOverlay.setAttribute('aria-hidden', 'true');

  // сбрасываем aria-expanded у всех триггеров
  document.querySelectorAll('[aria-controls]').forEach(btn => {
    btn.setAttribute('aria-expanded', 'false');
  });
}

// Открытие по data-sheet-target (надежнее)
document.querySelectorAll('[data-sheet-target]').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-sheet-target');
    openSheetById(id, btn);
  });
});

if (sheetOverlay) sheetOverlay.addEventListener('click', closeAllSheets);
sheetCloseBtns.forEach(b => b.addEventListener('click', closeAllSheets));

// ===== Features slider dots (optional) =====
const featuresTrack = document.querySelector('.features--slider');
const dots = document.querySelectorAll('.features-dots .dot');

if (featuresTrack && dots.length) {
  const items = Array.from(featuresTrack.querySelectorAll('.feature'));

  function setActiveDot(index) {
    dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
  }

  function nearestIndex() {
    const left = featuresTrack.scrollLeft;
    let best = 0;
    let bestDist = Infinity;

    items.forEach((item, i) => {
      const dist = Math.abs(item.offsetLeft - left);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });

    return best;
  }

  let raf = null;
  featuresTrack.addEventListener('scroll', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => setActiveDot(nearestIndex()));
  });

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      items[i].scrollIntoView({ behavior: 'smooth', inline: 'start' });
    });
  });
}

// ===== Sticky CTA (появляется когда основная CTA исчезает) =====
const mainCtaBtn = document.querySelector('.hero .btn-primary[data-action="open-telegram"]');
const stickyCta = document.querySelector('.sticky-cta');

if (mainCtaBtn && stickyCta) {
  const setStickyVisible = (visible) => {
    document.body.classList.toggle('sticky-cta-visible', visible);
    stickyCta.setAttribute('aria-hidden', visible ? 'false' : 'true');
  };

  // По умолчанию скрыта
  setStickyVisible(false);

  const observer = new IntersectionObserver(
    ([entry]) => {
      // Если основная кнопка НЕ видна — показываем нижнюю
      setStickyVisible(!entry.isIntersecting);
    },
    {
      root: null,
      // небольшая “зона”, чтобы нижняя кнопка появлялась чуть раньше/позже — можно подстроить
      threshold: 0.1,
    }
  );

  observer.observe(mainCtaBtn);
}