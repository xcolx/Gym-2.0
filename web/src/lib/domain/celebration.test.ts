import { describe, expect, it } from "vitest";

import { CELEBRATION_DURATION, CELEBRATION_TIMING, celebrationEmojiCount, celebrationParticles } from "./celebration";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

describe("celebrationEmojiCount", () => {
  it("is one per two minutes, at least one and at most 150", () => {
    expect(celebrationEmojiCount(0)).toBe(1);
    expect(celebrationEmojiCount(3)).toBe(1);
    expect(celebrationEmojiCount(61)).toBe(30);
    expect(celebrationEmojiCount(300)).toBe(150);
    expect(celebrationEmojiCount(10_000)).toBe(150);
  });
});

describe("celebrationParticles", () => {
  it("spreads the particles in a circle of 42 % of the shorter side", () => {
    const particles = celebrationParticles(100, 400, 800, seeded(3));
    expect(particles).toHaveLength(100);
    for (const particle of particles) {
      const radius = Math.hypot(particle.dx, particle.dy);
      expect(radius).toBeLessThanOrEqual(400 * 0.42 + 1e-9);
      expect(radius).toBeGreaterThanOrEqual(400 * 0.42 * Math.sqrt(0.05) - 1e-9);
      expect(particle.size).toBeGreaterThanOrEqual(28);
      expect(particle.size).toBeLessThanOrEqual(46);
      expect(Math.abs(particle.rotation)).toBeLessThanOrEqual(50);
    }
  });

  it("staggers the flights evenly over maxStagger in a random order", () => {
    const particles = celebrationParticles(5, 400, 400, seeded(7));
    expect(particles.map((particle) => particle.stagger).sort()).toEqual([0, 0.125, 0.25, 0.375, 0.5]);
    expect(particles.map((particle) => particle.id).sort()).toEqual([0, 1, 2, 3, 4]);
    for (const particle of particles) expect(particle.stagger).toBe(particle.id * 0.125);
    // shuffled: the random order isn't the order of the ids
    expect(particles.map((particle) => particle.id)).not.toEqual([0, 1, 2, 3, 4]);
  });

  it("doesn't stagger a single particle", () => {
    expect(celebrationParticles(1, 400, 400, seeded(1))[0].stagger).toBe(0);
  });

  it("lasts the explosion, the hold, the stagger and the flight", () => {
    const { explosion, hold, maxStagger, flight } = CELEBRATION_TIMING;
    expect(CELEBRATION_DURATION).toBeCloseTo(explosion + hold + maxStagger + flight);
  });
});

describe("celebration with a fixed seed", () => {
  it("has one emoji per two minutes, at least one and at most 150", () => {
    expect(celebrationEmojiCount(0)).toBe(1);
    expect(celebrationEmojiCount(61)).toBe(30);
    expect(celebrationEmojiCount(600)).toBe(150);
  });

  it("spreads the particles in a circle", () => {
    let seed = 1;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const particles = celebrationParticles(20, 400, 800, random);
    expect(particles).toHaveLength(20);
    expect(new Set(particles.map((particle) => particle.id)).size).toBe(20);
    for (const particle of particles) {
      expect(Math.hypot(particle.dx, particle.dy)).toBeLessThanOrEqual(168);
      expect(particle.size).toBeGreaterThanOrEqual(28);
      expect(particle.stagger).toBeLessThanOrEqual(0.5);
    }
  });
});
