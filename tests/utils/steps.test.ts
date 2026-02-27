/**
 * Tests for the step creation utilities
 */
import { createStep, wrapStepWithErrorHandling } from '../../src/utils/steps';
import { BaseResearchError, NetworkError } from '../../src/types/errors';
import { createMockState } from '../test-utils';

describe('createStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console output during tests
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create a step with the given name', () => {
    const executor = jest.fn().mockResolvedValue(createMockState());
    const step = createStep('myStep', executor);

    expect(step.name).toBe('myStep');
  });

  it('should execute the executor function', async () => {
    const initialState = createMockState();
    const resultState = createMockState({ query: 'result query' });
    const executor = jest.fn().mockResolvedValue(resultState);

    const step = createStep('testStep', executor);
    const result = await step.execute(initialState);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(result).toBe(resultState);
  });

  it('should update metadata.currentStep during execution', async () => {
    const initialState = createMockState();
    let capturedState: typeof initialState | null = null;

    const executor = jest.fn().mockImplementation(async (state) => {
      capturedState = state;
      return state;
    });

    const step = createStep('myStep', executor);
    await step.execute(initialState);

    expect(capturedState).not.toBeNull();
    expect(capturedState!.metadata.currentStep).toBe('myStep');
  });

  it('should wrap non-ResearchError in BaseResearchError', async () => {
    const initialState = createMockState();
    const executor = jest.fn().mockRejectedValue(new Error('plain error'));

    const step = createStep('testStep', executor);

    await expect(step.execute(initialState)).rejects.toBeInstanceOf(BaseResearchError);
  });

  it('should pass through ResearchError unchanged', async () => {
    const initialState = createMockState();
    const researchError = new NetworkError({ message: 'network failure', retry: true });
    const executor = jest.fn().mockRejectedValue(researchError);

    const step = createStep('testStep', executor);

    await expect(step.execute(initialState)).rejects.toBe(researchError);
  });

  it('should retry when retryable is true', async () => {
    jest.useFakeTimers();

    const initialState = createMockState();
    const resultState = createMockState({ query: 'success' });
    const executor = jest
      .fn()
      .mockRejectedValueOnce(new NetworkError({ message: 'temporary error', retry: true }))
      .mockResolvedValueOnce(resultState);

    const step = createStep('retryStep', executor, {}, { retryable: true, maxRetries: 3, retryDelay: 100 });

    const promise = step.execute(initialState);

    // Advance timers to allow retry
    jest.runAllTimers();

    const result = await promise;

    expect(executor).toHaveBeenCalledTimes(2);
    expect(result).toBe(resultState);

    jest.useRealTimers();
  });

  it('should not retry when retryable is false', async () => {
    const initialState = createMockState();
    const executor = jest
      .fn()
      .mockRejectedValue(new NetworkError({ message: 'error', retry: true }));

    const step = createStep('nonRetryStep', executor, {}, { retryable: false });

    await expect(step.execute(initialState)).rejects.toBeInstanceOf(BaseResearchError);
    expect(executor).toHaveBeenCalledTimes(1);
  });
});

describe('wrapStepWithErrorHandling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should wrap an existing step', async () => {
    const initialState = createMockState();
    const resultState = createMockState({ query: 'wrapped result' });
    const originalExecute = jest.fn().mockResolvedValue(resultState);

    const originalStep = {
      name: 'originalStep',
      execute: originalExecute,
    };

    const wrappedStep = wrapStepWithErrorHandling(originalStep);

    expect(wrappedStep.name).toBe('originalStep');

    const result = await wrappedStep.execute(initialState);
    expect(result).toBe(resultState);
    expect(originalExecute).toHaveBeenCalledTimes(1);
  });

  it('should add retry behavior', async () => {
    jest.useFakeTimers();

    const initialState = createMockState();
    const resultState = createMockState({ query: 'retry success' });
    const originalExecute = jest
      .fn()
      .mockRejectedValueOnce(new NetworkError({ message: 'temp error', retry: true }))
      .mockResolvedValueOnce(resultState);

    const originalStep = {
      name: 'retryableStep',
      execute: originalExecute,
    };

    const wrappedStep = wrapStepWithErrorHandling(originalStep, {
      retryable: true,
      maxRetries: 3,
      retryDelay: 100,
    });

    const promise = wrappedStep.execute(initialState);

    jest.runAllTimers();

    const result = await promise;

    expect(originalExecute).toHaveBeenCalledTimes(2);
    expect(result).toBe(resultState);

    jest.useRealTimers();
  });

  it('should include rollback when original has rollback', async () => {
    const initialState = createMockState();
    const rollbackState = createMockState({ query: 'rolled back' });
    const originalRollback = jest.fn().mockResolvedValue(rollbackState);

    const originalStep = {
      name: 'rollbackStep',
      execute: jest.fn().mockResolvedValue(initialState),
      rollback: originalRollback,
    };

    const wrappedStep = wrapStepWithErrorHandling(originalStep);

    expect(wrappedStep.rollback).toBeDefined();

    const result = await wrappedStep.rollback!(initialState);
    expect(result).toBe(rollbackState);
    expect(originalRollback).toHaveBeenCalledTimes(1);
  });

  it('should handle rollback errors', async () => {
    const initialState = createMockState();
    const rollbackError = new Error('rollback failed');
    const originalRollback = jest.fn().mockRejectedValue(rollbackError);

    const originalStep = {
      name: 'rollbackErrorStep',
      execute: jest.fn().mockResolvedValue(initialState),
      rollback: originalRollback,
    };

    const wrappedStep = wrapStepWithErrorHandling(originalStep);

    expect(wrappedStep.rollback).toBeDefined();
    await expect(wrappedStep.rollback!(initialState)).rejects.toThrow('rollback failed');
  });
});
