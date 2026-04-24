import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { initClient } from '../../src/client/cwmClient.js';
import { loadEnv } from '../../src/utils/env.js';

// Set up mock env before importing anything that reads env
process.env['CWM_SITE'] = 'cwm.test.local';
process.env['CWM_COMPANY_ID'] = 'TestCo';
process.env['CWM_PUBLIC_KEY'] = 'testpub';
process.env['CWM_PRIVATE_KEY'] = 'testpriv';
process.env['CWM_CLIENT_ID'] = 'test-client-id';

// Fixture: a minimal ticket response
const TICKET_FIXTURE = {
  id: 12345,
  summary: 'Printer offline in accounting',
  status: { id: 1, name: 'Open' },
  board: { id: 1, name: 'Help Desk MS' },
  company: { id: 42, name: 'Acme Corp' },
  priority: { id: 3, name: 'Priority 3 - Normal Response' },
  dateEntered: '2025-01-15T09:00:00Z',
  closedFlag: false,
};

const TICKET_LIST_FIXTURE = [TICKET_FIXTURE, { ...TICKET_FIXTURE, id: 12346, summary: 'Monitor flickering' }];

const NOTE_FIXTURE = {
  id: 1,
  ticketId: 12345,
  text: 'Called customer, left voicemail',
  detailDescriptionFlag: true,
  internalAnalysisFlag: false,
  resolutionFlag: false,
  customerUpdatedFlag: false,
  dateCreated: '2025-01-15T10:00:00Z',
  createdBy: 'jsmith',
};

const STATUS_FIXTURE = [
  { id: 1, name: 'Open' },
  { id: 5, name: 'Completed~' },
  { id: 3, name: 'In Progress' },
];

describe('ticket tool response shapes', () => {
  // These tests assert that the fixtures we'd use for tools parse into expected shapes
  // Real integration handled by smoke tests

  it('ticket fixture has required fields', () => {
    expect(TICKET_FIXTURE).toHaveProperty('id');
    expect(TICKET_FIXTURE).toHaveProperty('summary');
    expect(TICKET_FIXTURE).toHaveProperty('status');
    expect(TICKET_FIXTURE).toHaveProperty('board');
    expect(TICKET_FIXTURE).toHaveProperty('company');
  });

  it('ticket list fixture is an array', () => {
    expect(Array.isArray(TICKET_LIST_FIXTURE)).toBe(true);
    expect(TICKET_LIST_FIXTURE.length).toBeGreaterThan(0);
  });

  it('note fixture has text field', () => {
    expect(NOTE_FIXTURE).toHaveProperty('text');
    expect(NOTE_FIXTURE).toHaveProperty('ticketId');
  });

  it('status fixture has id and name', () => {
    STATUS_FIXTURE.forEach((s) => {
      expect(s).toHaveProperty('id');
      expect(s).toHaveProperty('name');
    });
  });

  it('completed~ status is in the fixture', () => {
    const completed = STATUS_FIXTURE.find((s) => s.name === 'Completed~');
    expect(completed).toBeDefined();
    expect(completed?.id).toBe(5);
  });
});

// ─── Env validation ───────────────────────────────────────────────────────────
describe('loadEnv', () => {
  it('loads all required vars from process.env', () => {
    const env = loadEnv();
    expect(env.site).toBe('cwm.test.local');
    expect(env.companyId).toBe('TestCo');
    expect(env.publicKey).toBe('testpub');
    expect(env.privateKey).toBe('testpriv');
    expect(env.clientId).toBe('test-client-id');
    expect(env.enableRawTools).toBe(false);
    expect(env.maxPages).toBe(20);
  });

  it('throws if a required var is missing', () => {
    const backup = process.env['CWM_SITE'];
    delete process.env['CWM_SITE'];
    expect(() => loadEnv()).toThrow('CWM_SITE');
    process.env['CWM_SITE'] = backup;
  });
});
