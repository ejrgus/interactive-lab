export const SERVER_BUFFER = 2000 / 128;
export const CLIENT_BUFFER = 3000 / 60;
export const START_TIME = -700;
export const REACTION_VARIATION = 35;

export function calculate({ peekerPing, holderPing, peekerReaction, holderReaction }) {
  const peekerUp = peekerPing / 2;
  const holderUp = holderPing / 2;
  const holderDown = holderPing / 2;
  const peekerSees = 0;
  const holderSees = peekerUp + SERVER_BUFFER + holderDown + CLIENT_BUFFER;
  const peekerFires = peekerReaction;
  const holderFires = holderSees + holderReaction;
  const peekerProcessed = peekerFires + peekerUp + SERVER_BUFFER / 2;
  const holderProcessed = holderFires + holderUp + SERVER_BUFFER / 2;
  const peekerWins = peekerProcessed < holderProcessed;
  const simultaneous = Math.abs(peekerProcessed - holderProcessed) < 0.001;
  const peekerDeathNotice = holderProcessed + peekerPing / 2;
  const holderDeathNotice = peekerProcessed + holderPing / 2;
  const advantage = holderPing + SERVER_BUFFER + CLIENT_BUFFER;
  const endTime = Math.max(peekerProcessed, holderProcessed, peekerDeathNotice, holderDeathNotice) + 220;
  return {
    peekerSees, holderSees, peekerFires, holderFires,
    peekerProcessed, holderProcessed, peekerDeathNotice, holderDeathNotice,
    advantage, peekerWins, simultaneous, endTime,
    serverGap: holderProcessed - peekerProcessed,
  };
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function normal(random) {
  const u = Math.max(random(), Number.EPSILON);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function estimateWinChance(settings, rounds = 10000) {
  const seed = Object.values(settings).reduce((n, v) => Math.imul(n ^ v, 16777619), 2166136261);
  const random = mulberry32(seed);
  const advantage = settings.holderPing + SERVER_BUFFER + CLIENT_BUFFER;
  let peekerWins = 0;
  for (let i = 0; i < rounds; i++) {
    const peekerReaction = Math.max(0, settings.peekerReaction + normal(random) * REACTION_VARIATION);
    const holderReaction = Math.max(0, settings.holderReaction + normal(random) * REACTION_VARIATION);
    if (peekerReaction < advantage + holderReaction) peekerWins++;
  }
  return { peeker: peekerWins / rounds, holder: 1 - peekerWins / rounds, rounds };
}
