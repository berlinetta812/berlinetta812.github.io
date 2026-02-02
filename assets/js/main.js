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

// ===== Bottom sheet: late info =====
const sheet = document.getElementById('late-info-sheet');
const sheetOverlay = document.querySelector('[data-sheet-overlay]');
const sheetCloseBtn = document.querySelector('[data-sheet-close]');
const openLateBtns = document.querySelectorAll('[data-action="open-late-info"], .hero-text-link');

function openSheet(triggerBtn) {
  if (!sheet || !sheetOverlay) return;

  document.body.classList.add('sheet-open');
  sheet.setAttribute('aria-hidden', 'false');
  sheetOverlay.setAttribute('aria-hidden', 'false');

  if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'true');
}

function closeSheet() {
  if (!sheet || !sheetOverlay) return;

  document.body.classList.remove('sheet-open');
  sheet.setAttribute('aria-hidden', 'true');
  sheetOverlay.setAttribute('aria-hidden', 'true');

  openLateBtns.forEach(btn => btn.setAttribute('aria-expanded', 'false'));
}

openLateBtns.forEach(btn => {
  btn.addEventListener('click', () => openSheet(btn));
});

if (sheetOverlay) sheetOverlay.addEventListener('click', closeSheet);
if (sheetCloseBtn) sheetCloseBtn.addEventListener('click', closeSheet);

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