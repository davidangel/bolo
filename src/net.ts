// Bolo uses two WebSocket connections during play. The first is the lobby connection, which is
// always open, and is also used for in-game chat. The second is used for world synchronization.

// Server message identifiers. The server sends binary data.
export const SYNC_MESSAGE        = 's'.charCodeAt(0);
export const WELCOME_MESSAGE     = 'W'.charCodeAt(0);
export const CREATE_MESSAGE      = 'C'.charCodeAt(0);
export const DESTROY_MESSAGE     = 'D'.charCodeAt(0);
export const MAPCHANGE_MESSAGE   = 'M'.charCodeAt(0);
export const UPDATE_MESSAGE      = 'U'.charCodeAt(0);
export const TINY_UPDATE_MESSAGE = 'u'.charCodeAt(0);
export const SOUNDEFFECT_MESSAGE = 'S'.charCodeAt(0);
export const MINEOWNER_MESSAGE   = 'm'.charCodeAt(0);
export const TEAMSCORES_MESSAGE  = 'T'.charCodeAt(0);

// Client messages. The client sends one-character ASCII messages.
export const START_TURNING_CCW  = 'L'; export const STOP_TURNING_CCW  = 'l';
export const START_TURNING_CW   = 'R'; export const STOP_TURNING_CW   = 'r';
export const START_ACCELERATING = 'A'; export const STOP_ACCELERATING = 'a';
export const START_BRAKING      = 'B'; export const STOP_BRAKING      = 'b';
export const START_SHOOTING     = 'S'; export const STOP_SHOOTING     = 's';
export const INC_RANGE          = 'I'; export const DEC_RANGE         = 'D';
export const BUILD_ORDER        = 'O';
