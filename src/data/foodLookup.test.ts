import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupFoods } from './foodLookup';

const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

describe('lookupFoods', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('tries again when the USDA gateway has a hiccup (502)', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply(502))
      .mockResolvedValueOnce(reply(200, { foods: [{ fdcId: 1, description: 'BROWN GRAVY' }] }));
    vi.stubGlobal('fetch', fetch);
    const p = lookupFoods('gravy');
    await vi.runAllTimersAsync();
    expect((await p).map((r) => r.name)).toEqual(['Brown Gravy']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('explains a gateway that stays down, and the hourly limit', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(502)));
    const p = lookupFoods('gravy');
    const check = expect(p).rejects.toThrow(/having trouble right now \(error 502\)/);
    await vi.runAllTimersAsync();
    await check;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(429)));
    await expect(lookupFoods('gravy')).rejects.toThrow(/used up for now/);
  });
});
