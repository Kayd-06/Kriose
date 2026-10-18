export function readToken(key: string): string {
  return key;
}

export function charge(amount: number): string {
  const token = readToken("pan");
  return `${token}:${amount}`;
}
