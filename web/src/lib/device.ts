import { UAParser } from "ua-parser-js";

const ID_KEY = "cs.device.id";
const NICK_KEY = "cs.device.nickname";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. — the device just gets a fresh id next time */
  }
}

/** Stable per-browser id, created once and kept in localStorage. */
export function getDeviceId(): string {
  let id = safeGet(ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    safeSet(ID_KEY, id);
  }
  return id;
}

export function getDeviceNickname(): string | null {
  return safeGet(NICK_KEY);
}
export function setDeviceNickname(name: string) {
  safeSet(NICK_KEY, name.trim());
}

/**
 * Human label from the user agent, e.g. "iPhone · Safari 26" or "Samsung SM-S938B · Chrome 140".
 * iOS never reveals the exact iPhone model to the browser; Android usually does.
 */
export function describeDevice(): { label: string; userAgent: string } {
  const ua = navigator.userAgent;
  const r = new UAParser(ua).getResult();
  const vendor = r.device.vendor ?? "";
  const model = r.device.model ?? "";
  const os = [r.os.name, r.os.version].filter(Boolean).join(" ");
  const browser = [r.browser.name, r.browser.version?.split(".")[0]].filter(Boolean).join(" ");
  const device = [vendor, model].filter(Boolean).join(" ") || os || "Device";
  return { label: [device, browser].filter(Boolean).join(" · "), userAgent: ua };
}
