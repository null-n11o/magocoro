export const LINE_FRIEND_URL = "https://line.me/R/ti/p/%40039ijxbe";

export function lineShareUrl(letterUrl: string): string {
  return `https://line.me/R/msg/text/?${encodeURIComponent(letterUrl)}`;
}
