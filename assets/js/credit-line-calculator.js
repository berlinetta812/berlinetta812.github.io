(function initializeCreditLineCalculator(global) {
  const DAILY_RATE = 0.0065;
  const STANDARD_DAILY_RATE = 0.005;
  const PAYMENT_INTERVAL_DAYS = 14;
  const PENALTY_ANNUAL_RATE = 0.2;
  const MAX_CHARGE_MULTIPLIER = 1;

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function addDays(value, days) {
    const date = new Date(value);
    date.setDate(date.getDate() + days);
    return date;
  }

  function splitPrincipal(amount, paymentCount) {
    const totalKopecks = Math.round(Number(amount) * 100);
    const baseKopecks = Math.floor(totalKopecks / paymentCount);
    let remainder = totalKopecks - baseKopecks * paymentCount;

    return Array.from({ length: paymentCount }, () => {
      const value = baseKopecks + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      return value / 100;
    });
  }

  function createSchedule(
    amount,
    termWeeks,
    issuedAt,
    dailyRate = DAILY_RATE
  ) {
    const principal = roundMoney(amount);
    const totalDays = Number(termWeeks) * 7;
    const paymentCount = Math.ceil(
      totalDays / PAYMENT_INTERVAL_DAYS
    );
    const principalParts = splitPrincipal(
      principal,
      paymentCount
    );
    const startDate = new Date(issuedAt);
    let outstandingPrincipal = principal;
    let elapsedDays = 0;

    return principalParts.map((principalPart, index) => {
      const remainingDays = totalDays - elapsedDays;
      const periodDays = Math.min(
        PAYMENT_INTERVAL_DAYS,
        remainingDays
      );
      elapsedDays += periodDays;

      const contractualInterest = roundMoney(
        outstandingPrincipal * dailyRate * periodDays
      );
      const dueAt = addDays(startDate, elapsedDays);
      const payment = {
        id: `payment-${index + 1}`,
        number: index + 1,
        dueAt: dueAt.toISOString(),
        periodDays,
        principal: roundMoney(principalPart),
        contractualInterest,
        contractualInterestPaid: false,
        promoDiscount: contractualInterest,
        promoAmount: roundMoney(principalPart),
        contractualAmount: roundMoney(
          principalPart + contractualInterest
        ),
        status: 'pending',
        paidAt: null,
        paidAmount: 0
      };

      outstandingPrincipal = roundMoney(
        outstandingPrincipal - principalPart
      );
      return payment;
    });
  }

  function summarizeSchedule(schedule) {
    return schedule.reduce(
      (summary, payment) => ({
        principal: roundMoney(
          summary.principal + payment.principal
        ),
        contractualInterest: roundMoney(
          summary.contractualInterest +
            payment.contractualInterest
        ),
        promoAmount: roundMoney(
          summary.promoAmount + payment.promoAmount
        ),
        contractualAmount: roundMoney(
          summary.contractualAmount +
            payment.contractualAmount
        )
      }),
      {
        principal: 0,
        contractualInterest: 0,
        promoAmount: 0,
        contractualAmount: 0
      }
    );
  }

  global.RFCreditLineCalculator = Object.freeze({
    DAILY_RATE,
    STANDARD_DAILY_RATE,
    PAYMENT_INTERVAL_DAYS,
    PENALTY_ANNUAL_RATE,
    MAX_CHARGE_MULTIPLIER,
    addDays,
    createSchedule,
    roundMoney,
    summarizeSchedule
  });
})(window);
