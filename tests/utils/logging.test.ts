/**
 * Tests for the logging infrastructure
 */
import { Logger, createStepLogger, logger } from '../../src/utils/logging';

describe('Logger', () => {
  let consoleDebugSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log messages at or above the configured level', () => {
    const testLogger = new Logger({ level: 'warn', includeTimestamp: false, includeStepName: false });

    testLogger.warn('warn message');
    testLogger.error('error message');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('should not log messages below the configured level', () => {
    const testLogger = new Logger({ level: 'warn', includeTimestamp: false, includeStepName: false });

    testLogger.debug('debug message');
    testLogger.info('info message');

    expect(consoleDebugSpy).not.toHaveBeenCalled();
    expect(consoleInfoSpy).not.toHaveBeenCalled();
  });

  it('should include timestamp when includeTimestamp is true', () => {
    const testLogger = new Logger({ level: 'info', includeTimestamp: true, includeStepName: false });

    testLogger.info('test message');

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    const loggedMessage = consoleInfoSpy.mock.calls[0][0] as string;
    // Timestamp format: [2024-01-01T00:00:00.000Z]
    expect(loggedMessage).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
  });

  it('should not include timestamp when includeTimestamp is false', () => {
    const testLogger = new Logger({ level: 'info', includeTimestamp: false, includeStepName: false });

    testLogger.info('test message');

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    const loggedMessage = consoleInfoSpy.mock.calls[0][0] as string;
    // Should not contain a timestamp pattern
    expect(loggedMessage).not.toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
  });

  it('should include step name when set', () => {
    const testLogger = new Logger({ level: 'info', includeTimestamp: false, includeStepName: true });
    testLogger.setCurrentStep('myStep');

    testLogger.info('test message');

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    const loggedMessage = consoleInfoSpy.mock.calls[0][0] as string;
    expect(loggedMessage).toContain('[myStep]');
  });

  it('should call custom loggers when provided', () => {
    const customLogger = jest.fn();
    const testLogger = new Logger({
      level: 'info',
      includeTimestamp: false,
      includeStepName: false,
      customLoggers: [customLogger],
    });

    testLogger.info('custom logger test');

    expect(customLogger).toHaveBeenCalledTimes(1);
    expect(customLogger).toHaveBeenCalledWith('info', expect.stringContaining('custom logger test'));
  });

  it('should use correct console method for each level', () => {
    const testLogger = new Logger({ level: 'debug', includeTimestamp: false, includeStepName: false });

    testLogger.debug('debug msg');
    testLogger.info('info msg');
    testLogger.warn('warn msg');
    testLogger.error('error msg');

    expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('createStepLogger', () => {
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Reset global logger step after each test
    logger.setCurrentStep(undefined);
  });

  it('should create a step-specific logger', () => {
    const stepLogger = createStepLogger('testStep');

    expect(stepLogger).toBeDefined();
    expect(typeof stepLogger.info).toBe('function');
    expect(typeof stepLogger.debug).toBe('function');
    expect(typeof stepLogger.warn).toBe('function');
    expect(typeof stepLogger.error).toBe('function');
  });

  it('should restore previous step name after logging', () => {
    // Set an initial step name on the global logger
    logger.setCurrentStep('previousStep');

    const stepLogger = createStepLogger('newStep');
    stepLogger.info('test message');

    // After logging, the global logger should have the previous step name restored
    expect(logger.getCurrentStep()).toBe('previousStep');
  });
});

describe('setLogLevel', () => {
  let consoleInfoSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Reset global logger level after each test
    logger.setLogLevel('info');
  });

  it('should update the minimum log level', () => {
    const testLogger = new Logger({ level: 'info', includeTimestamp: false, includeStepName: false });

    // Initially at 'info', debug should not log
    testLogger.debug('debug before change');
    expect(consoleDebugSpy).not.toHaveBeenCalled();

    // Change to 'debug' level
    testLogger.setLogLevel('debug');

    // Now debug should log
    testLogger.debug('debug after change');
    expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
  });
});
