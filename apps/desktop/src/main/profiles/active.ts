/** Active profile id for the current session. Persistence comes later. */
let activeProfileId: string | null = null;

export function setActiveProfileId(id: string) {
  activeProfileId = id;
}

export function getActiveProfileId() {
  return activeProfileId;
}
