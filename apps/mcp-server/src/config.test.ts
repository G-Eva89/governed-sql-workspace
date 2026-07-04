import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  const originalApiKey = process.env.API_KEY;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalDefaultConnectionId = process.env.DEFAULT_CONNECTION_ID;

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = originalApiKey;
    }
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalDefaultConnectionId === undefined) {
      delete process.env.DEFAULT_CONNECTION_ID;
    } else {
      process.env.DEFAULT_CONNECTION_ID = originalDefaultConnectionId;
    }
  });

  it('requires API_KEY', () => {
    delete process.env.API_KEY;
    expect(() => loadConfig()).toThrow(/API_KEY environment variable is required/);
  });

  it('loads database URL and optional default connection', () => {
    process.env.API_KEY = 'gsw_test_key_value';
    process.env.DATABASE_URL = 'postgresql://app:app@localhost:5433/workspace_app';
    process.env.DEFAULT_CONNECTION_ID = '11111111-1111-1111-1111-111111111111';

    const config = loadConfig();
    expect(config.apiKey).toBe('gsw_test_key_value');
    expect(config.databaseUrl).toContain('workspace_app');
    expect(config.defaultConnectionId).toBe('11111111-1111-1111-1111-111111111111');
  });
});
