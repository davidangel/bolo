// This module contains just a list of team colours and descriptive names.

export interface TeamColor {
  r: number;
  g: number;
  b: number;
  name: string;
}

export const MAX_SELECTABLE_TEAMS = 8;

const TEAM_COLORS: TeamColor[] = [
  // Primaries:
  { r: 255, g:   0, b:   0, name: 'red'     },
  { r:   0, g:   0, b: 255, name: 'blue'    },
  { r:   0, g: 255, b:   0, name: 'green'   },

  // Secondaries:
  { r:   0, g: 255, b: 255, name: 'cyan'    },
  { r: 255, g: 255, b:   0, name: 'yellow'  },
  { r: 255, g:   0, b: 255, name: 'magenta' },

  // Tertiary:
  { r: 255, g: 165, b:   0, name: 'orange'  },
  { r: 150, g:  95, b:  42, name: 'brown'   }

  // FIXME: Need some more here, probably at least 16 total.
];

export const SELECTABLE_TEAM_COLORS = TEAM_COLORS.slice(0, MAX_SELECTABLE_TEAMS);

export default TEAM_COLORS;
