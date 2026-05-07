// Global lock ensuring only one TelnyxRTC client connects per browser tab.
// Two simultaneous clients with the same SIP user cause mutual eviction
// (each connect kicks the other), producing an endless WEBSOCKET_ERROR loop.

let owner: string | null = null;

export function acquireTelnyxLock(name: string): boolean {
  if (owner && owner !== name) {
    console.warn(`[Telnyx] Lock held by "${owner}", "${name}" will not connect.`);
    return false;
  }
  owner = name;
  return true;
}

export function releaseTelnyxLock(name: string) {
  if (owner === name) owner = null;
}

export function getTelnyxLockOwner(): string | null {
  return owner;
}