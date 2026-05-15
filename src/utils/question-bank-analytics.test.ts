import { describe, expect, it } from 'vitest';
import { getQuestionBankAnalyticsSnapshot } from './question-bank-analytics';

describe('getQuestionBankAnalyticsSnapshot', () => {
  it('builds ewma series from the deduplicated attempt list', async () => {
    const plugin = {
      questionBankStorage: {
        loadBankQuestionRefs: async () => [
          { cardUuid: 'card-1' },
          { cardUuid: 'card-2' }
        ],
        loadGlobalQuestionStats: async () => ({
          'card-1': {
            attempts: [
              {
                isCorrect: true,
                timestamp: '2026-04-10T08:00:00.000Z',
                score: 100,
                timeSpent: 12
              }
            ]
          },
          'card-2': {
            attempts: [
              {
                isCorrect: false,
                timestamp: '2026-04-11T08:00:00.000Z',
                score: 0,
                timeSpent: 15
              }
            ]
          }
        }),
        loadBankQuestionStats: async () => ({
          'card-1': {
            attempts: [
              {
                isCorrect: true,
                timestamp: '2026-04-10T08:00:00.000Z',
                score: 100,
                timeSpent: 12
              }
            ]
          }
        })
      }
    } as any;

    const snapshot = await getQuestionBankAnalyticsSnapshot(plugin, 'bank-1');

    expect(snapshot.ewmaSeries.dates).toEqual(['04/10', '04/11']);
    expect(snapshot.ewmaSeries.ewmaData).toHaveLength(2);
    expect(snapshot.ewmaSeries.historicalData).toEqual([100, 50]);
    expect(snapshot.ewmaSeries.confidenceData).toHaveLength(2);
  });
});
