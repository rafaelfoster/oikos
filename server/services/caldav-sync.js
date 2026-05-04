/**
 * Modul: Generic CalDAV Sync
 * Zweck: Multi-Account CalDAV synchronization with calendar selection
 * Abhängigkeiten: tsdav, server/db.js, server/services/ics-parser.js
 */

import { createLogger } from '../logger.js';
const log = createLogger('CalDAV');

import * as db from '../db.js';

// Reused functions from apple-calendar.js
import {
  parseICS,
  formatICSDate,
  tzLocalToUTC,
  applyDuration
} from './ics-parser.js';

// --------------------------------------------------------
// Helper Functions
// --------------------------------------------------------

function normalizeCalColor(c) {
  if (!c) return null;
  if (/^#[0-9a-fA-F]{8}$/.test(c)) return c.slice(0, 7); // strip alpha
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  return null;
}

function upsertExternalCalendar(source, externalId, name, color) {
  const row = db.get().prepare(`
    INSERT INTO external_calendars (source, external_id, name, color)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(source, external_id) DO UPDATE SET
      name  = excluded.name,
      color = excluded.color
    RETURNING id
  `).get(source, externalId, name, color);
  return row.id;
}

// --------------------------------------------------------
// Credentials Helpers
// --------------------------------------------------------

function getAccountById(accountId) {
  return db.get().prepare('SELECT * FROM caldav_accounts WHERE id = ?').get(accountId);
}

function getAllAccounts() {
  return db.get().prepare('SELECT * FROM caldav_accounts').all();
}

// --------------------------------------------------------
// Account CRUD Operations
// --------------------------------------------------------

/**
 * Create a new CalDAV account
 * @param {string} label - User-friendly label
 * @param {string} url - CalDAV server URL
 * @param {string} username - Account username
 * @param {string} password - Account password
 * @returns {number} Account ID
 */
function createAccount(label, url, username, password) {
  if (!label || !url || !username || !password) {
    throw new Error('All fields required: label, url, username, password');
  }

  const result = db.get().prepare(`
    INSERT INTO caldav_accounts (label, url, username, password)
    VALUES (?, ?, ?, ?)
  `).run(label, url, username, password);

  log.info('CalDAV account created', { id: result.lastInsertRowid, label });
  return result.lastInsertRowid;
}

/**
 * Update an existing CalDAV account
 * @param {number} accountId - Account ID
 * @param {object} updates - Fields to update
 * @returns {void}
 */
function updateAccount(accountId, updates) {
  const account = getAccountById(accountId);
  if (!account) {
    throw new Error(`CalDAV account not found: ${accountId}`);
  }

  const { label, url, username, password } = updates;
  const fields = [];
  const values = [];

  if (label !== undefined) {
    fields.push('label = ?');
    values.push(label);
  }
  if (url !== undefined) {
    fields.push('url = ?');
    values.push(url);
  }
  if (username !== undefined) {
    fields.push('username = ?');
    values.push(username);
  }
  if (password !== undefined) {
    fields.push('password = ?');
    values.push(password);
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(accountId);

  db.get().prepare(`
    UPDATE caldav_accounts
    SET ${fields.join(', ')}
    WHERE id = ?
  `).run(...values);

  log.info('CalDAV account updated', { id: accountId, fields: Object.keys(updates) });
}

/**
 * Delete a CalDAV account and all associated data
 * @param {number} accountId - Account ID
 * @returns {void}
 */
function deleteAccount(accountId) {
  const account = getAccountById(accountId);
  if (!account) {
    throw new Error(`CalDAV account not found: ${accountId}`);
  }

  // Foreign key constraints will cascade delete:
  // - caldav_selected_calendars
  // - external_calendars (via source)
  // - calendar_events (via external_calendar_id)

  db.get().prepare('DELETE FROM caldav_accounts WHERE id = ?').run(accountId);

  log.info('CalDAV account deleted', { id: accountId, label: account.label });
}

// --------------------------------------------------------
// Exports
// --------------------------------------------------------

export {
  createAccount,
  updateAccount,
  deleteAccount,
  getAccountById,
  getAllAccounts
};
