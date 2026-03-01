import crypto from "crypto";

const LAMPORTS = 1_000_000_000;

export function getUserReward(bonus: boolean) {

// 0.02 – 0.1 SOL
const min = 0.02;
const max = 0.1;

const rand = crypto.randomInt(0, 1_000_000) / 1_000_000;
let reward = min + (max - min) * rand;

if (bonus) reward *= 1.25;

// cap at 0.125 SOL
reward = Math.min(reward, 0.125);

return Math.floor(reward * LAMPORTS);
}
