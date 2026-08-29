import type { LoggerService, LogLevel } from '@nestjs/common';

const levels: Record<LogLevel, number> = {
  verbose: 10,
  debug: 20,
  log: 30,
  warn: 40,
  error: 50,
  fatal: 60
};

export class JsonLogger implements LoggerService {
  constructor(private readonly minimumLevel: LogLevel = 'log') {}

  log(message: unknown, ...optional: unknown[]) {
    this.write('log', message, optional);
  }
  fatal(message: unknown, ...optional: unknown[]) {
    this.write('fatal', message, optional);
  }
  error(message: unknown, ...optional: unknown[]) {
    this.write('error', message, optional);
  }
  warn(message: unknown, ...optional: unknown[]) {
    this.write('warn', message, optional);
  }
  debug(message: unknown, ...optional: unknown[]) {
    this.write('debug', message, optional);
  }
  verbose(message: unknown, ...optional: unknown[]) {
    this.write('verbose', message, optional);
  }

  private write(level: LogLevel, message: unknown, optional: unknown[]) {
    if (levels[level] < levels[this.minimumLevel]) return;
    const context = optional.find((value) => typeof value === 'string');
    const trace = level === 'error' ? optional.find((value) => isErrorTrace(value)) : undefined;
    const output = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: level === 'log' ? 'info' : level,
      message: serialize(message),
      ...(context ? { context } : {}),
      ...(trace ? { trace } : {})
    });
    if (level === 'error' || level === 'fatal') process.stderr.write(`${output}\n`);
    else process.stdout.write(`${output}\n`);
  }
}

function isErrorTrace(value: unknown): value is string {
  return typeof value === 'string' && (value.includes('\n') || value.startsWith('Error:'));
}

function serialize(value: unknown) {
  if (value instanceof Error)
    return { name: value.name, message: value.message, stack: value.stack };
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}
