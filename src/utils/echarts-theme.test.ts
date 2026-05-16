import { applyAlphaToColor, createGradient } from './echarts-theme';

describe('echarts theme color helpers', () => {
  it('converts hsl calc theme colors into rgba safely', () => {
    const color = 'hsl(calc(258 - 1), calc(88% * 1.01), calc(66% * 1.075))';

    expect(applyAlphaToColor(color, 0.33)).toMatch(/^rgba\(\d+, \d+, \d+, 0\.33\)$/);
  });

  it('builds gradient stops from hsl calc theme colors without leaking raw css expressions', () => {
    const color = 'hsl(calc(258 - 1), calc(88% * 1.01), calc(66% * 1.075))';
    const gradient = createGradient(color, 0.33, 0.03);

    expect(gradient.colorStops).toEqual([
      expect.objectContaining({ color: expect.stringMatching(/^rgba\(\d+, \d+, \d+, 0\.33\)$/) }),
      expect.objectContaining({ color: expect.stringMatching(/^rgba\(\d+, \d+, \d+, 0\.03\)$/) })
    ]);
  });
});
