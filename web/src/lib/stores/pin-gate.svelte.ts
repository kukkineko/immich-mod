/**
 * Lives only in memory, so a reload (F5) or a new tab starts locked again
 * and the PIN is asked for before anything else is shown.
 */
class PinGate {
  unlocked = $state(false);
}

export const pinGate = new PinGate();
