// The pure part of ios/Gym 2.0/Features/Workout/ActiveWorkout/WorkoutCelebrationView.swift

export const CELEBRATION_TIMING = {
  /** Seconds of the explosion (a spring) */
  explosion: 0.45,
  /** Seconds the emojis stay scattered before they fly to the stats tab */
  hold: 0.5,
  /** Seconds of the flight */
  flight: 0.6,
  /** Spread over all emojis, so that they arrive one after the other */
  maxStagger: 0.5,
} as const;

/** The whole animation in seconds */
export const CELEBRATION_DURATION =
  CELEBRATION_TIMING.explosion + CELEBRATION_TIMING.hold + CELEBRATION_TIMING.maxStagger + CELEBRATION_TIMING.flight;

/**
 * One emoji per two minutes of the workout. At least one, so that short workouts also get one, and limited, so that a
 * workout that wasn't ended for hours doesn't make the animation stutter.
 */
export function celebrationEmojiCount(durationMinutes: number): number {
  return Math.min(Math.max(Math.trunc(durationMinutes / 2), 1), 150);
}

interface CelebrationParticle {
  id: number;
  /** Where it lands from the middle of the screen, in px */
  dx: number;
  dy: number;
  /** Degrees */
  rotation: number;
  /** Font size in px */
  size: number;
  /** Seconds it waits longer before it flies to the stats tab */
  stagger: number;
}

/** Random particles in a circle of 42 % of the shorter side of the screen, in random order */
export function celebrationParticles(count: number, width: number, height: number, random: () => number = Math.random): CelebrationParticle[] {
  const maxRadius = Math.min(width, height) * 0.42;
  const between = (min: number, max: number) => min + random() * (max - min);
  const particles = Array.from({ length: count }, (_, index): CelebrationParticle => {
    const angle = between(0, 2 * Math.PI);
    // the square root spreads them evenly over the circle instead of crowding the middle
    const radius = maxRadius * Math.sqrt(between(0.05, 1));
    return {
      id: index,
      dx: Math.cos(angle) * radius,
      dy: Math.sin(angle) * radius,
      rotation: between(-50, 50),
      size: between(28, 46),
      stagger: count > 1 ? (CELEBRATION_TIMING.maxStagger * index) / (count - 1) : 0,
    };
  });
  for (let i = particles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [particles[i], particles[j]] = [particles[j], particles[i]];
  }
  return particles;
}
