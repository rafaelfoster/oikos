/**
 * Test: CardDAV Contacts Schema
 * Purpose: Verify Migration 30 - CardDAV multi-account contacts sync tables
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { MIGRATIONS } from './server/db.js';

const TEST_DB = ':memory:';

describe('CardDAV Contacts Schema (Migration 30)', () => {
  let db;

  before(() => {
    // Create in-memory DB with better-sqlite3 to apply migrations
    db = new Database(TEST_DB);
    db.pragma('foreign_keys = ON');

    // Create minimal schema to satisfy Migration 30 dependencies
    // Migration 30 expects: users table and contacts table to exist
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL
      );

      CREATE TABLE contacts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        category   TEXT NOT NULL DEFAULT 'Sonstiges',
        phone      TEXT,
        email      TEXT,
        address    TEXT,
        notes      TEXT,
        family_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      INSERT INTO users (username) VALUES ('testuser');
    `);

    // Find and apply Migration 30 from the MIGRATIONS array
    const migration30 = MIGRATIONS.find(m => m.version === 30);
    if (!migration30) {
      throw new Error('Migration 30 not found in MIGRATIONS array');
    }

    // Apply Migration 30 (it's a string, not a function)
    db.exec(migration30.up);
  });

  // ========================================
  // Table Existence Tests
  // ========================================

  it('should create carddav_accounts table', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='carddav_accounts'").get();
    assert.ok(result, 'carddav_accounts table should exist');
  });

  it('should create carddav_addressbook_selection table', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='carddav_addressbook_selection'").get();
    assert.ok(result, 'carddav_addressbook_selection table should exist');
  });

  it('should create contact_phones table', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_phones'").get();
    assert.ok(result, 'contact_phones table should exist');
  });

  it('should create contact_emails table', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_emails'").get();
    assert.ok(result, 'contact_emails table should exist');
  });

  it('should create contact_addresses table', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_addresses'").get();
    assert.ok(result, 'contact_addresses table should exist');
  });

  // ========================================
  // Contacts Table Extension Tests
  // ========================================

  it('should extend contacts table with CardDAV columns', () => {
    const cols = db.prepare("PRAGMA table_info(contacts)").all();
    const colNames = cols.map(c => c.name);

    assert.ok(colNames.includes('organization'), 'Should have organization column');
    assert.ok(colNames.includes('job_title'), 'Should have job_title column');
    assert.ok(colNames.includes('birthday'), 'Should have birthday column');
    assert.ok(colNames.includes('website'), 'Should have website column');
    assert.ok(colNames.includes('photo'), 'Should have photo column');
    assert.ok(colNames.includes('nickname'), 'Should have nickname column');
    assert.ok(colNames.includes('carddav_account_id'), 'Should have carddav_account_id column');
    assert.ok(colNames.includes('carddav_uid'), 'Should have carddav_uid column');
    assert.ok(colNames.includes('carddav_addressbook_url'), 'Should have carddav_addressbook_url column');
  });

  // ========================================
  // Index Tests
  // ========================================

  it('should create index on contacts.carddav_uid', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_contacts_carddav_uid'").get();
    assert.ok(result, 'Index on carddav_uid should exist');
  });

  it('should create index on contacts.email', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_contacts_email'").get();
    assert.ok(result, 'Index on email should exist');
  });

  it('should create index on contact_phones.contact_id', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_contact_phones_contact'").get();
    assert.ok(result, 'Index on contact_phones.contact_id should exist');
  });

  it('should create index on contact_phones.value', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_contact_phones_value'").get();
    assert.ok(result, 'Index on contact_phones.value should exist');
  });

  it('should create index on contact_emails.contact_id', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_contact_emails_contact'").get();
    assert.ok(result, 'Index on contact_emails.contact_id should exist');
  });

  it('should create index on contact_emails.value', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_contact_emails_value'").get();
    assert.ok(result, 'Index on contact_emails.value should exist');
  });

  it('should create index on contact_addresses.contact_id', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_contact_addresses_contact'").get();
    assert.ok(result, 'Index on contact_addresses.contact_id should exist');
  });

  it('should create unique index on carddav_uid per account+addressbook', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_contacts_carddav_uid_unique'").get();
    assert.ok(result, 'Unique index on carddav_uid should exist');
  });

  // ========================================
  // UNIQUE Constraint Tests
  // ========================================

  it('should enforce UNIQUE(carddav_url, username) on carddav_accounts', () => {
    db.prepare(`
      INSERT INTO carddav_accounts (name, carddav_url, username, password)
      VALUES (?, ?, ?, ?)
    `).run('Test Account', 'https://carddav.example.com', 'user1', 'pass1');

    const account = db.prepare('SELECT * FROM carddav_accounts WHERE name = ?').get('Test Account');
    assert.ok(account, 'Account should be inserted');

    // Duplicate should fail
    assert.throws(() => {
      db.prepare(`
        INSERT INTO carddav_accounts (name, carddav_url, username, password)
        VALUES (?, ?, ?, ?)
      `).run('Duplicate', 'https://carddav.example.com', 'user1', 'pass2');
    }, 'UNIQUE constraint should prevent duplicate carddav_url+username');
  });

  it('should enforce UNIQUE(account_id, addressbook_url) on addressbook_selection', () => {
    const accountId = db.prepare('SELECT id FROM carddav_accounts WHERE name = ?').get('Test Account').id;

    db.prepare(`
      INSERT INTO carddav_addressbook_selection (account_id, addressbook_url, addressbook_name)
      VALUES (?, ?, ?)
    `).run(accountId, 'https://carddav.example.com/addressbooks/main', 'Main Addressbook');

    // Duplicate should fail
    assert.throws(() => {
      db.prepare(`
        INSERT INTO carddav_addressbook_selection (account_id, addressbook_url, addressbook_name)
        VALUES (?, ?, ?)
      `).run(accountId, 'https://carddav.example.com/addressbooks/main', 'Duplicate');
    }, 'UNIQUE constraint should prevent duplicate account_id+addressbook_url');
  });

  // ========================================
  // Foreign Key Cascade Tests
  // ========================================

  it('should CASCADE delete addressbook_selection when account deleted', () => {
    const accountId = db.prepare('SELECT id FROM carddav_accounts WHERE name = ?').get('Test Account').id;

    // Verify addressbook exists
    const beforeDelete = db.prepare('SELECT * FROM carddav_addressbook_selection WHERE account_id = ?').get(accountId);
    assert.ok(beforeDelete, 'Addressbook selection should exist before delete');

    // Delete account
    db.prepare('DELETE FROM carddav_accounts WHERE id = ?').run(accountId);

    // Addressbook selection should be deleted
    const afterDelete = db.prepare('SELECT * FROM carddav_addressbook_selection WHERE account_id = ?').get(accountId);
    assert.strictEqual(afterDelete, undefined, 'Addressbook selection should CASCADE delete');
  });

  it('should CASCADE delete contact_phones when contact deleted', () => {
    // Create contact
    db.prepare(`
      INSERT INTO contacts (name, category)
      VALUES (?, ?)
    `).run('John Doe', 'Sonstiges');

    const contactId = db.prepare('SELECT id FROM contacts WHERE name = ?').get('John Doe').id;

    // Add phones
    db.prepare(`
      INSERT INTO contact_phones (contact_id, label, value, is_primary)
      VALUES (?, ?, ?, ?)
    `).run(contactId, 'mobile', '+1234567890', 1);

    db.prepare(`
      INSERT INTO contact_phones (contact_id, label, value)
      VALUES (?, ?, ?)
    `).run(contactId, 'work', '+0987654321');

    // Verify phones exist
    const phonesBefore = db.prepare('SELECT * FROM contact_phones WHERE contact_id = ?').all(contactId);
    assert.strictEqual(phonesBefore.length, 2, 'Should have 2 phone numbers');

    // Delete contact
    db.prepare('DELETE FROM contacts WHERE id = ?').run(contactId);

    // Phones should be deleted
    const phonesAfter = db.prepare('SELECT * FROM contact_phones WHERE contact_id = ?').all(contactId);
    assert.strictEqual(phonesAfter.length, 0, 'Phone numbers should CASCADE delete');
  });

  it('should CASCADE delete contact_emails when contact deleted', () => {
    // Create contact
    db.prepare(`
      INSERT INTO contacts (name, category)
      VALUES (?, ?)
    `).run('Jane Smith', 'Sonstiges');

    const contactId = db.prepare('SELECT id FROM contacts WHERE name = ?').get('Jane Smith').id;

    // Add emails
    db.prepare(`
      INSERT INTO contact_emails (contact_id, label, value, is_primary)
      VALUES (?, ?, ?, ?)
    `).run(contactId, 'work', 'jane@work.com', 1);

    db.prepare(`
      INSERT INTO contact_emails (contact_id, label, value)
      VALUES (?, ?, ?)
    `).run(contactId, 'home', 'jane@home.com');

    // Verify emails exist
    const emailsBefore = db.prepare('SELECT * FROM contact_emails WHERE contact_id = ?').all(contactId);
    assert.strictEqual(emailsBefore.length, 2, 'Should have 2 email addresses');

    // Delete contact
    db.prepare('DELETE FROM contacts WHERE id = ?').run(contactId);

    // Emails should be deleted
    const emailsAfter = db.prepare('SELECT * FROM contact_emails WHERE contact_id = ?').all(contactId);
    assert.strictEqual(emailsAfter.length, 0, 'Email addresses should CASCADE delete');
  });

  it('should CASCADE delete contact_addresses when contact deleted', () => {
    // Create contact
    db.prepare(`
      INSERT INTO contacts (name, category)
      VALUES (?, ?)
    `).run('Bob Johnson', 'Sonstiges');

    const contactId = db.prepare('SELECT id FROM contacts WHERE name = ?').get('Bob Johnson').id;

    // Add addresses
    db.prepare(`
      INSERT INTO contact_addresses (contact_id, label, street, city, is_primary)
      VALUES (?, ?, ?, ?, ?)
    `).run(contactId, 'home', '123 Main St', 'Springfield', 1);

    db.prepare(`
      INSERT INTO contact_addresses (contact_id, label, street, city)
      VALUES (?, ?, ?, ?)
    `).run(contactId, 'work', '456 Office Blvd', 'Metropolis');

    // Verify addresses exist
    const addressesBefore = db.prepare('SELECT * FROM contact_addresses WHERE contact_id = ?').all(contactId);
    assert.strictEqual(addressesBefore.length, 2, 'Should have 2 addresses');

    // Delete contact
    db.prepare('DELETE FROM contacts WHERE id = ?').run(contactId);

    // Addresses should be deleted
    const addressesAfter = db.prepare('SELECT * FROM contact_addresses WHERE contact_id = ?').all(contactId);
    assert.strictEqual(addressesAfter.length, 0, 'Addresses should CASCADE delete');
  });

  it('should SET NULL on contacts.carddav_account_id when account deleted', () => {
    // Create new account
    db.prepare(`
      INSERT INTO carddav_accounts (name, carddav_url, username, password)
      VALUES (?, ?, ?, ?)
    `).run('iCloud', 'https://contacts.icloud.com', 'user@icloud.com', 'pass');

    const accountId = db.prepare('SELECT id FROM carddav_accounts WHERE name = ?').get('iCloud').id;

    // Create contact linked to account
    db.prepare(`
      INSERT INTO contacts (name, category, carddav_account_id, carddav_uid)
      VALUES (?, ?, ?, ?)
    `).run('Alice Cooper', 'Sonstiges', accountId, 'urn:uuid:12345');

    const contactId = db.prepare('SELECT id FROM contacts WHERE name = ?').get('Alice Cooper').id;

    // Verify link
    const beforeDelete = db.prepare('SELECT carddav_account_id FROM contacts WHERE id = ?').get(contactId);
    assert.strictEqual(beforeDelete.carddav_account_id, accountId, 'Contact should be linked to account');

    // Delete account
    db.prepare('DELETE FROM carddav_accounts WHERE id = ?').run(accountId);

    // Contact should remain but link should be NULL
    const afterDelete = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    assert.ok(afterDelete, 'Contact should still exist');
    assert.strictEqual(afterDelete.carddav_account_id, null, 'carddav_account_id should be SET NULL');
  });

  // ========================================
  // Data Integrity Tests
  // ========================================

  it('should handle enabled/disabled addressbook selection', () => {
    // Create account
    db.prepare(`
      INSERT INTO carddav_accounts (name, carddav_url, username, password)
      VALUES (?, ?, ?, ?)
    `).run('Nextcloud', 'https://nextcloud.example.com/dav', 'user@example.com', 'pass');

    const accountId = db.prepare('SELECT id FROM carddav_accounts WHERE name = ?').get('Nextcloud').id;

    // Add addressbooks
    db.prepare(`
      INSERT INTO carddav_addressbook_selection (account_id, addressbook_url, addressbook_name, enabled)
      VALUES (?, ?, ?, ?), (?, ?, ?, ?)
    `).run(
      accountId, 'https://nextcloud.example.com/dav/contacts/private', 'Private', 1,
      accountId, 'https://nextcloud.example.com/dav/contacts/work', 'Work', 0
    );

    // Query enabled only
    const enabled = db.prepare('SELECT * FROM carddav_addressbook_selection WHERE account_id = ? AND enabled = 1').all(accountId);
    assert.strictEqual(enabled.length, 1, 'Should have 1 enabled addressbook');
    assert.strictEqual(enabled[0].addressbook_name, 'Private');

    // Query all
    const all = db.prepare('SELECT * FROM carddav_addressbook_selection WHERE account_id = ?').all(accountId);
    assert.strictEqual(all.length, 2, 'Should have 2 total addressbooks');
  });

  it('should handle is_primary flag on contact phones', () => {
    // Create contact
    db.prepare(`
      INSERT INTO contacts (name, category)
      VALUES (?, ?)
    `).run('Test Primary', 'Sonstiges');

    const contactId = db.prepare('SELECT id FROM contacts WHERE name = ?').get('Test Primary').id;

    // Add multiple phones with one primary
    db.prepare(`
      INSERT INTO contact_phones (contact_id, label, value, is_primary)
      VALUES (?, ?, ?, ?), (?, ?, ?, ?)
    `).run(
      contactId, 'mobile', '+1111111111', 1,
      contactId, 'home', '+2222222222', 0
    );

    // Query primary
    const primary = db.prepare('SELECT * FROM contact_phones WHERE contact_id = ? AND is_primary = 1').get(contactId);
    assert.ok(primary, 'Should have a primary phone');
    assert.strictEqual(primary.value, '+1111111111');
    assert.strictEqual(primary.label, 'mobile');
  });

  it('should allow manual contacts (NULL carddav_account_id)', () => {
    db.prepare(`
      INSERT INTO contacts (name, category, phone, email, carddav_account_id)
      VALUES (?, ?, ?, ?, ?)
    `).run('Manual Contact', 'Sonstiges', '+9999999999', 'manual@example.com', null);

    const contact = db.prepare('SELECT * FROM contacts WHERE name = ?').get('Manual Contact');
    assert.ok(contact, 'Manual contact should be created');
    assert.strictEqual(contact.carddav_account_id, null, 'Manual contact should have NULL carddav_account_id');
  });

  it('should enforce UNIQUE constraint on carddav_uid per account+addressbook', () => {
    // Create account
    db.prepare(`
      INSERT INTO carddav_accounts (name, carddav_url, username, password)
      VALUES (?, ?, ?, ?)
    `).run('Test Sync Account', 'https://carddav.test.com', 'sync@test.com', 'pass');

    const accountId = db.prepare('SELECT id FROM carddav_accounts WHERE name = ?').get('Test Sync Account').id;

    // Create first contact with CardDAV UID
    db.prepare(`
      INSERT INTO contacts (name, category, carddav_account_id, carddav_uid, carddav_addressbook_url)
      VALUES (?, ?, ?, ?, ?)
    `).run('Contact A', 'Sonstiges', accountId, 'urn:uuid:12345', 'https://carddav.test.com/addressbooks/main');

    const firstContact = db.prepare('SELECT * FROM contacts WHERE name = ?').get('Contact A');
    assert.ok(firstContact, 'First contact should be created');

    // Attempt to create duplicate with same account_id, addressbook_url, and uid should fail
    assert.throws(() => {
      db.prepare(`
        INSERT INTO contacts (name, category, carddav_account_id, carddav_uid, carddav_addressbook_url)
        VALUES (?, ?, ?, ?, ?)
      `).run('Contact B', 'Sonstiges', accountId, 'urn:uuid:12345', 'https://carddav.test.com/addressbooks/main');
    }, 'UNIQUE constraint should prevent duplicate carddav_uid in same account+addressbook');

    // But same UID in different addressbook should work
    db.prepare(`
      INSERT INTO contacts (name, category, carddav_account_id, carddav_uid, carddav_addressbook_url)
      VALUES (?, ?, ?, ?, ?)
    `).run('Contact C', 'Sonstiges', accountId, 'urn:uuid:12345', 'https://carddav.test.com/addressbooks/work');

    const differentAddressbook = db.prepare('SELECT * FROM contacts WHERE name = ?').get('Contact C');
    assert.ok(differentAddressbook, 'Same UID in different addressbook should be allowed');

    // Create another account
    db.prepare(`
      INSERT INTO carddav_accounts (name, carddav_url, username, password)
      VALUES (?, ?, ?, ?)
    `).run('Another Account', 'https://other.carddav.com', 'user@other.com', 'pass');

    const otherAccountId = db.prepare('SELECT id FROM carddav_accounts WHERE name = ?').get('Another Account').id;

    // Same UID in different account should work
    db.prepare(`
      INSERT INTO contacts (name, category, carddav_account_id, carddav_uid, carddav_addressbook_url)
      VALUES (?, ?, ?, ?, ?)
    `).run('Contact D', 'Sonstiges', otherAccountId, 'urn:uuid:12345', 'https://other.carddav.com/addressbooks/main');

    const differentAccount = db.prepare('SELECT * FROM contacts WHERE name = ?').get('Contact D');
    assert.ok(differentAccount, 'Same UID in different account should be allowed');
  });
});
