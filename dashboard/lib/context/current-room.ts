let currentRoomId: string | null = null;

export function getCurrentRoomId(): string | null {
  return currentRoomId;
}

export function setCurrentRoomId(roomId: string | null): void {
  currentRoomId = roomId;
}
