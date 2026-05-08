export function cx(...classes: Array<string | undefined | null | false>) {
  return classes.filter(Boolean).join(" ");
}

export function shortKey(key: string, head = 4, tail = 4) {
  if (key.length <= head + tail + 3) return key;
  return `${key.slice(0, head)}…${key.slice(-tail)}`;
}

export async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

export function solscanTxUrl(signature: string) {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

export function solscanAccountUrl(pubkey: string) {
  return `https://solscan.io/account/${pubkey}?cluster=devnet`;
}

