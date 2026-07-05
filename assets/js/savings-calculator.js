(function initSavingsCalculator(global) {
  function getRate(months) {
    const term = Number(months);

    if (term <= 3) {
      return 20;
    }

    if (term <= 6) {
      return 24;
    }

    if (term < 12) {
      return 27;
    }

    return 30;
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
    calculate,
    formatMonths,
    getRate
  });
})(window);
