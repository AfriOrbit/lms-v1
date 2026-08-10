import { COURSES, courseLessons } from './curriculum';

/**
 * The public simulator index.
 *
 * `key` matches the `simulationKey` a lesson sets and the case registered in
 * `src/components/sandbox/sandbox-mount.tsx`. `scripts/check-content.ts`
 * asserts the three stay in agreement at build time.
 *
 * Two of these — the link budget and the beacon decoder — predate the written
 * curriculum and are not yet referenced by any lesson. That is fine: they still
 * belong in the public index, they just have no lesson to link to.
 */
export interface SimulatorEntry {
  key: string;
  title: string;
  /** The question this sandbox settles, in one line. */
  settles: string;
}

export const SIMULATORS: SimulatorEntry[] = [
  {
    key: 'power-budget',
    title: 'Power budget',
    settles:
      'Whether the spacecraft survives eclipse: array sizing, battery depth of discharge and duty cycle until the orbit-average energy balance closes.',
  },
  {
    key: 'data-budget',
    title: 'Data budget',
    settles:
      'Whether the passes are long enough: bytes generated per orbit against bytes actually downlinked at the chosen rate.',
  },
  {
    key: 'link-budget',
    title: 'Link budget',
    settles:
      'Whether the radio link closes: EIRP, free-space path loss, G/T, C/N0 and the margin left at ten degrees elevation.',
  },
  {
    key: 'lora-airtime',
    title: 'LoRa airtime and duty cycle',
    settles:
      'How long a LoRa frame occupies the channel at each spreading factor, and whether the 1% duty-cycle rule still allows the traffic you planned.',
  },
  {
    key: 'beacon-decoder',
    title: 'Beacon decoder',
    settles:
      'What a raw telemetry frame actually says: sync word, CRC-16/X.25 integrity and every field decoded byte by byte.',
  },
  {
    key: 'flight',
    title: 'Rocket flight profile',
    settles:
      'How high the airframe goes and how hard it comes back: burn, coast to apogee, stability margin and descent rate under canopy.',
  },
];

export interface SimulatorUsage {
  courseSlug: string;
  courseTitle: string;
  lessonSlug: string;
  lessonTitle: string;
}

/** The first lesson that mounts this sandbox, if the curriculum uses it yet. */
export function simulatorUsage(key: string): SimulatorUsage | null {
  for (const course of COURSES) {
    for (const { lesson } of courseLessons(course)) {
      if (lesson.simulationKey === key) {
        return {
          courseSlug: course.slug,
          courseTitle: course.title,
          lessonSlug: lesson.slug,
          lessonTitle: lesson.title,
        };
      }
    }
  }
  return null;
}
