/**
 * Tests for the merge utilities
 */
import { ResultMerger } from '../../src/utils/merge';
import { TrackResult } from '../../src/steps/track';
import { createMockState } from '../test-utils';

/**
 * Helper to create a minimal TrackResult for testing
 */
function createTrackResult(
  name: string,
  data: Record<string, unknown>,
  results: Record<string, unknown>[] = [],
  confidence = 0.5
): TrackResult {
  return {
    name,
    results,
    data,
    metadata: {
      confidence,
      completedAt: new Date().toISOString(),
    },
    errors: [],
    completed: true,
  };
}

describe('mergeTrackData', () => {
  it('should merge data from multiple tracks', () => {
    const tracks = {
      track1: createTrackResult('track1', { key1: 'value1', key2: 'a' }),
      track2: createTrackResult('track2', { key1: 'value2', key3: 'value3' }),
    };

    const merged = ResultMerger.mergeTrackData(tracks, { strategy: 'last' });

    // key1 should be resolved (last strategy picks track2's value)
    expect(merged.key1).toBe('value2');
    // key2 only in track1
    expect(merged.key2).toBe('a');
    // key3 only in track2
    expect(merged.key3).toBe('value3');
  });

  it('should use first strategy', () => {
    const tracks = {
      track1: createTrackResult('track1', { key: 'first' }),
      track2: createTrackResult('track2', { key: 'second' }),
    };

    const merged = ResultMerger.mergeTrackData(tracks, { strategy: 'first' });

    expect(merged.key).toBe('first');
  });

  it('should use last strategy', () => {
    const tracks = {
      track1: createTrackResult('track1', { key: 'first' }),
      track2: createTrackResult('track2', { key: 'second' }),
    };

    const merged = ResultMerger.mergeTrackData(tracks, { strategy: 'last' });

    expect(merged.key).toBe('second');
  });

  it('should use mostConfident strategy', () => {
    const tracks = {
      lowConf: createTrackResult('lowConf', { key: 'low confidence value' }, [], 0.3),
      highConf: createTrackResult('highConf', { key: 'high confidence value' }, [], 0.9),
    };

    const merged = ResultMerger.mergeTrackData(tracks, { strategy: 'mostConfident' });

    expect(merged.key).toBe('high confidence value');
  });

  it('should use majority strategy', () => {
    const tracks = {
      track1: createTrackResult('track1', { key: 'majority' }),
      track2: createTrackResult('track2', { key: 'majority' }),
      track3: createTrackResult('track3', { key: 'minority' }),
    };

    const merged = ResultMerger.mergeTrackData(tracks, { strategy: 'majority' });

    expect(merged.key).toBe('majority');
  });

  it('should use weighted strategy for numeric values', () => {
    const tracks = {
      track1: createTrackResult('track1', { score: 10 }),
      track2: createTrackResult('track2', { score: 20 }),
    };

    const merged = ResultMerger.mergeTrackData(tracks, {
      strategy: 'weighted',
      weights: { track1: 1, track2: 3 },
    });

    // Weighted average: (10*1 + 20*3) / (1+3) = 70/4 = 17.5
    expect(merged.score).toBe(17.5);
  });

  it('should use weighted strategy for non-numeric values', () => {
    const tracks = {
      track1: createTrackResult('track1', { key: 'low weight value' }),
      track2: createTrackResult('track2', { key: 'high weight value' }),
    };

    const merged = ResultMerger.mergeTrackData(tracks, {
      strategy: 'weighted',
      weights: { track1: 1, track2: 5 },
    });

    // For non-numeric, picks the value with the highest weight
    expect(merged.key).toBe('high weight value');
  });

  it('should use custom strategy', () => {
    const tracks = {
      track1: createTrackResult('track1', { key: 'value1' }),
      track2: createTrackResult('track2', { key: 'value2' }),
    };

    const customResolver = jest.fn().mockReturnValue('custom resolved');

    const merged = ResultMerger.mergeTrackData(tracks, {
      strategy: 'custom',
      customResolver,
    });

    expect(merged.key).toBe('custom resolved');
    expect(customResolver).toHaveBeenCalledTimes(1);
  });

  it('should throw when weighted strategy has no weights', () => {
    const tracks = {
      track1: createTrackResult('track1', { key: 'value1' }),
      track2: createTrackResult('track2', { key: 'value2' }),
    };

    expect(() => {
      ResultMerger.mergeTrackData(tracks, { strategy: 'weighted' });
    }).toThrow('Weights required for weighted conflict resolution strategy');
  });

  it('should throw when custom strategy has no resolver', () => {
    const tracks = {
      track1: createTrackResult('track1', { key: 'value1' }),
      track2: createTrackResult('track2', { key: 'value2' }),
    };

    expect(() => {
      ResultMerger.mergeTrackData(tracks, { strategy: 'custom' });
    }).toThrow('Custom resolver required for custom conflict resolution strategy');
  });

  it('should skip tracks key', () => {
    const tracks = {
      track1: createTrackResult('track1', {
        key: 'value1',
        tracks: { nested: 'should be skipped' },
      }),
    };

    const merged = ResultMerger.mergeTrackData(tracks, { strategy: 'last' });

    // 'tracks' key should be skipped
    expect(merged.tracks).toBeUndefined();
    // Other keys should be present
    expect(merged.key).toBe('value1');
  });
});

describe('mergeTrackResults', () => {
  it('should merge results from multiple tracks', () => {
    const state = createMockState();
    const tracks = {
      track1: createTrackResult('track1', {}, [{ summary: 'Summary from track 1' }], 0.7),
      track2: createTrackResult('track2', {}, [{ summary: 'Summary from track 2' }], 0.9),
    };

    const merged = ResultMerger.mergeTrackResults(tracks, state, { strategy: 'mostConfident' });

    // Should have merged the 'summary' type results
    expect(merged).toHaveProperty('summary');
  });

  it('should handle tracks with no results', () => {
    const state = createMockState();
    const tracks = {
      track1: createTrackResult('track1', {}, []),
      track2: createTrackResult('track2', {}, []),
    };

    const merged = ResultMerger.mergeTrackResults(tracks, state);

    // No results to merge, should return empty object
    expect(merged).toEqual({});
  });
});

describe('createMergeFunction', () => {
  it('should return a callable merge function', () => {
    const mergeFunction = ResultMerger.createMergeFunction({ strategy: 'last' });

    expect(typeof mergeFunction).toBe('function');
  });

  it('should produce correct metadata', () => {
    const state = createMockState();
    const tracks = {
      track1: createTrackResult('track1', { key: 'value1' }),
      track2: createTrackResult('track2', { key: 'value2' }),
    };

    const mergeFunction = ResultMerger.createMergeFunction({ strategy: 'last' });
    const result = mergeFunction(tracks, state);

    expect(result.metadata).toBeDefined();
    expect(result.metadata.mergeStrategy).toBe('last');
    expect(result.metadata.tracksCount).toBe(2);
    expect(result.metadata.mergedAt).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.results).toBeDefined();
  });
});
