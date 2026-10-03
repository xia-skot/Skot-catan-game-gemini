import type { CAPTAIN_EMOTES } from '../shared/social';

// Original PNGs from xia-skot/Catan_Pics; blob hashes invalidate cached images.
export const REACTION_IMAGES: Record<typeof CAPTAIN_EMOTES[number], string> = {
  please: '/assets/images/拜托.png?v=58b25aee253d',
  laugh: '/assets/images/大笑.png?v=9574133f7900',
  smug: '/assets/images/得意.png?v=3aa65cd1c024',
  cry: '/assets/images/哭泣.png?v=c6c167398e2d',
  angry: '/assets/images/生气.png?v=db7049787b08',
  tongue: '/assets/images/吐舌头.png?v=70f8433f659d',
  bored: '/assets/images/无语.png?v=278a66b7c591',
  giggle: '/assets/images/捂嘴笑.png?v=ab60e74d2734',
};
