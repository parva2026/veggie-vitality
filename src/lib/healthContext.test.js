import { describe, expect, it } from 'vitest';

import { buildHealthContext } from './healthContext.js';

/**
 * The Medicines panel tells the user, in as many words, that their medicine
 * list stays on the device and is never sent to the AI service. That promise is
 * only as good as this function, which builds the single block of user data
 * that leaves for the model — so it is asserted here rather than left to the
 * fact that today's caller happens not to pass medicines.
 *
 * A medicine list is the most sensitive thing the app stores: it names
 * conditions the user never typed anywhere.
 */
describe('buildHealthContext never carries the medicine list', () => {
  const args = {
    profile: { name: 'Parva Patel', age: 30, gender: 'male', height: 170, weight: 100 },
    goals: { calories: 2000, protein: 60, fiber: 30, water: 3000 },
    logs: {},
    waterLogs: {},
    weightHistory: [],
    currentDate: '2026-08-27',
  };

  it('drops medicines and dose history even when handed them', () => {
    const context = buildHealthContext({
      ...args,
      medicines: [
        { id: 'med_1', name: 'Sertraline', dose: '50mg', note: 'morning', times: ['08:00'] },
        { id: 'med_2', name: 'Levothyroxine', dose: '75mcg', times: ['06:30'] },
      ],
      medLogs: { '2026-08-27': { med_1: ['08:00'] } },
      waterReminder: { enabled: true, startHour: 9, endHour: 21, everyMinutes: 120 },
    });

    for (const secret of ['Sertraline', 'Levothyroxine', '50mg', '75mcg', 'med_1', 'med_2']) {
      expect(context, `${secret} reached the model prompt`).not.toContain(secret);
    }
    expect(context.toLowerCase()).not.toContain('medicine');
  });

  it('still builds the profile block it is supposed to', () => {
    expect(buildHealthContext(args)).toContain('Parva Patel');
  });
});
