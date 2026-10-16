'use strict';

// Integer division with round-half-even (banker's rounding). All money math
// in Atlas stays in integer minor units; whenever a division is needed
// (rate conversion, percentage discounts) it goes through this helper so the
// exact-half case rounds to the even neighbour instead of always up.

function divideRoundedHalfEven(numerator, denominator) {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new Error('divideRoundedHalfEven requires integer operands');
  }
  if (denominator === 0) {
    throw new Error('divideRoundedHalfEven: division by zero');
  }
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  const negative = n < 0n !== d < 0n;
  const absN = n < 0n ? -n : n;
  const absD = d < 0n ? -d : d;
  let quotient = absN / absD;
  const remainder = absN % absD;
  const twice = remainder * 2n;
  if (twice > absD) {
    quotient += 1n;
  } else if (twice === absD) {
    // Exactly halfway: round to the even neighbour.
    if (quotient % 2n === 1n) quotient += 1n;
  }
  const result = negative ? -quotient : quotient;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('divideRoundedHalfEven: result exceeds safe integer');
  }
  return Number(result);
}

module.exports = { divideRoundedHalfEven };
