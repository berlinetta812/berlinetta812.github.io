(function initSavingsCalculator(global) {
  const SAVINGS_RATE_TIERS = Object.freeze([
    Object.freeze({ maxMonths: 3, rate: 15 }),
    Object.freeze({ maxMonths: 6, rate: 19 }),
    Object.freeze({ maxMonths: 11, rate: 24 }),
    Object.freeze({ maxMonths: 12, rate: 28 })
  ]);

  function getRate(months) {
    const term = Number(months);
    const tier = SAVINGS_RATE_TIERS.find(
      (item) => term <= item.maxMonths
    );

    return tier?.rate ?? SAVINGS_RATE_TIERS.at(-1).rate;
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

  function calculate(amount, months, fixedRate) {
    const principal = Number(amount) || 0;
    const term = Number(months) || 0;
    const parsedFixedRate = Number(fixedRate);
    const rate = Number.isFinite(parsedFixedRate)
      ? parsedFixedRate
      : getRate(term);
    const monthlyRate = rate / 100 / 12;
    const exactFinalAmount =
      principal * Math.pow(1 + monthlyRate, term);

    return {
      amount: principal,
      months: term,
      rate,
      income: Math.round(exactFinalAmount - principal),
      finalAmount: Math.round(exactFinalAmount)
    };
  }

  global.RFSavingsCalculator = Object.freeze({
    SAVINGS_RATE_TIERS,
    calculate,
    formatMonths,
    getRate
  });
})(window);
