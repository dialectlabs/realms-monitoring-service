const toPrecise3 = new Intl.NumberFormat('en-US', {
  maximumSignificantDigits: 3,
});
function removeTrailingZeros(value: string): string {
  return value.replace(/\.?0+$/, '');
}

export function amountToShortString(num: number): string {
  if (num < 1) {
    return toPrecise3.format(num);
  }
  if (num >= 1 && num < 1e3) {
    return removeTrailingZeros(num.toFixed(2));
  }
  if (num >= 1e3 && num < 1e6) {
    return removeTrailingZeros((num / 1e3).toFixed(1)) + 'K';
  }
  if (num >= 1e6 && num < 1e9) {
    return removeTrailingZeros((num / 1e6).toFixed(1)) + 'M';
  }
  if (num >= 1e9 && num < 1e12) {
    return removeTrailingZeros((num / 1e9).toFixed(1)) + 'B';
  }
  if (num >= 1e12) {
    return removeTrailingZeros((num / 1e12).toFixed(1)) + 'T';
  }
  return num.toFixed(2);
}
