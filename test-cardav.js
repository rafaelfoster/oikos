/**
 * Test: CardDAV Contacts Schema
 * Purpose: Verify Migration 30 - CardDAV multi-account contacts sync tables
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const TEST_DB = ':memory:';

describe('CardDAV Contacts Schema (Migration 30)', () => {
  let db;

  before(() => {
    // Create in-memory DB
    db = new DatabaseSync(TEST_DB);
    db.exec('PRAGMA foreign_keys = ON;');

    // Create base contacts table (from Migration 1) and family_user_id (Migration 23)
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

    // Apply Migration 30
    db.exec(`
      -- CardDAV Accounts
      CREATE TABLE cardav_accounts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        cardav_url TEXT NOT NULL,
        username   TEXT NOT NULL,
        password   TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        last_sync  TEXT,
        UNIQUE(cardav_url, username)
      );

      -- CardDAV Addressbook Selection
      CREATE TABLE cardav_addressbook_selection (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id      INTEGER NOT NULL,
        addressbook_url TEXT NOT NULL,
        addressbook_name TEXT NOT NULL,
        enabled         INTEGER NOT NULL DEFAULT 1,
        created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        UNIQUE(account_id, addressbook_url),
        FOREIGN KEY(account_id) REFERENCES cardav_accounts(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_cardav_addressbook_account
        ON cardav_addressbook_selection(account_id, enabled);

      -- Extend Contacts Table
      ALTER TABLE contacts ADD COLUMN organization TEXT;
      ALTER TABLE contacts ADD COLUMN job_title TEXT;
      ALTER TABLE contacts ADD COLUMN birthday TEXT;
      ALTER TABLE contacts ADD COLUMN website TEXT;
      ALTER TABLE contacts ADD COLUMN photo TEXT;
      ALTER TABLE contacts ADD COLUMN nickname TEXT;
      ALTER TABLE contacts ADD COLUMN cardav_account_id INTEGER
        REFERENCES cardav_accounts(id) ON DELETE SET NULL;
      ALTER TABLE contacts ADD COLUMN cardav_uid TEXT;
      ALTER TABLE contacts ADD COLUMN cardav_addressbook_url TEXT;

      CREATE INDEX idx_contacts_cardav_uid ON contacts(cardav_uid);
      CREATE INDEX idx_contacts_email ON contacts(email);

      -- Contact Phones
      CREATE TABLE contact_phones (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL,
        label      TEXT,
        value      TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_contact_phones_contact ON contact_phones(contact_id);
      CREATE INDEX idx_contact_phones_value ON contact_phones(value);

      -- Contact Emails
      CREATE TABLE contact_emails (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL,
        label      TEXT,
        value      TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_contact_emails_contact ON contact_emails(contact_id);
      CREATE INDEX idx_contact_emails_value ON contact_emails(value);

      -- Contact Addresses
      CREATE TABLE contact_addresses (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id  INTEGER NOT NULL,
        label       TEXT,
        street      TEXT,
        city        TEXT,
        state       TEXT,
        postal_code TEXT,
        country     TEXT,
        is_primary  INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_contact_addresses_contact ON contact_addresses(contact_id);
    `);
  });

  // ========================================
  // Table Existence Tests
  // ========================================

  it('should create cardav_accounts table', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cardav_accounts'").get();
    assert.ok(result, 'cardav_accounts table should exist');
  });

  it('should create cardav_addressbook_selection table', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cardav_addressbook_selection'").get();
    assert.ok(result, 'cardav_addressbook_selection table should exist');
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
    assert.ok(colNames.includes('cardav_account_id'), 'Should have cardav_account_id column');
    assert.ok(colNames.includes('cardav_uid'), 'Should have cardav_uid column');
    assert.ok(colNames.includes('cardav_addressbook_url'), 'Should have cardav_addressbook_url column');
  });

  // ========================================
  // Index Tests
  // ========================================

  it('should create index on contacts.cardav_uid', () => {
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_contacts_cardav_uid'").get();
    assert.ok(result, 'Index on cardav_uid should exist');
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

  // ========================================
  // UNIQUE Constraint Tests
  // ========================================

  it('should enforce UNIQUE(cardav_url, username) on cardav_accounts', () => {
    db.prepare(`
      INSERT INTO cardav_accounts (name, cardav_url, username, password)
      VALUES (?, ?, ?, ?)
    `).run('Test Account', 'https://cardav.example.com', 'user1', 'pass1');

    const account = db.prepare('SELECT * FROM cardav_accounts WHERE name = ?').get('Test Account');
    assert.ok(account, 'Account should be inserted');

    // Duplicate should fail
    assert.throws(() => {
      db.prepare(`
        INSERT INTO cardav_accounts (name, cardav_url, username, password)
        VALUES (?, ?, ?, ?)
      `).run('Duplicate', 'https://cardav.example.com', 'user1', 'pass2');
    }, 'UNIQUE constraint should prevent duplicate cardav_url+username');
  });

  it('should enforce UNIQUE(account_id, addressbook_url) on addressbook_selection', () => {
    const accountId = db.prepare('SELECT id FROM cardav_accounts WHERE name = ?').get('Test Account').id;

    db.prepare(`
      INSERT INTO cardav_addressbook_selection (account_id, addressbook_url, addressbook_name)
      VALUES (?, ?, ?)
    `).run(accountId, 'https://cardav.example.com/addressbooks/main', 'Main Addressbook');

    // Duplicate should fail
    assert.throws(() => {
      db.prepare(`
        INSERT INTO cardav_addressbook_selection (account_id, addressbook_url, addressbook_name)
        VALUES (?, ?, ?)
      `).run(accountId, 'https://cardav.example.com/addressbooks/main', 'Duplicate');
    }, 'UNIQUE constraint should prevent duplicate account_id+addressbook_url');
  });

  // ========================================
  // Foreign Key Cascade Tests
  // ========================================

  it('should CASCADE delete addressbook_selection when account deleted', () => {
    const accountId = db.prepare('SELECT id FROM cardav_accounts WHERE name = ?').get('Test Account').id;

    // Verify addressbook exists
    const beforeDelete = db.prepare('SELECT * FROM cardav_addressbook_selection WHERE account_id = ?').get(accountId);
    assert.ok(beforeDelete, 'Addressbook selection should exist before delete');

    // Delete account
    db.prepare('DELETE FROM cardav_accounts WHERE id = ?').run(accountId);

    // Addressbook selection should be deleted
    const afterDelete = db.prepare('SELECT * FROM cardav_addressbook_selection WHERE account_id = ?').get(accountId);
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

  it('should SET NULL on contacts.cardav_account_id when account deleted', () => {
    // Create new account
    db.prepare(`
      INSERT INTO cardav_accounts (name, cardav_url, username, password)
      VALUES (?, ?, ?, ?)
    `).run('iCloud', 'https://contacts.icloud.com', 'user@icloud.com', 'pass');

    const accountId = db.prepare('SELECT id FROM cardav_accounts WHERE name = ?').get('iCloud').id;

    // Create contact linked to account
    db.prepare(`
      INSERT INTO contacts (name, category, cardav_account_id, cardav_uid)
      VALUES (?, ?, ?, ?)
    `).run('Alice Cooper', 'Sonstiges', accountId, 'urn:uuid:12345');

    const contactId = db.prepare('SELECT id FROM contacts WHERE name = ?').get('Alice Cooper').id;

    // Verify link
    const beforeDelete = db.prepare('SELECT cardav_account_id FROM contacts WHERE id = ?').get(contactId);
    assert.strictEqual(beforeDelete.cardav_account_id, accountId, 'Contact should be linked to account');

    // Delete account
    db.prepare('DELETE FROM cardav_accounts WHERE id = ?').run(accountId);

    // Contact should remain but link should be NULL
    const afterDelete = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    assert.ok(afterDelete, 'Contact should still exist');
    assert.strictEqual(afterDelete.cardav_account_id, null, 'cardav_account_id should be SET NULL');
  });

  // ========================================
  // Data Integrity Tests
  // ========================================

  it('should handle enabled/disabled addressbook selection', () => {
    // Create account
    db.prepare(`
      INSERT INTO cardav_accounts (name, cardav_url, username, password)
      VALUES (?, ?, ?, ?)
    `).run('Nextcloud', 'https://nextcloud.example.com/dav', 'user@example.com', 'pass');

    const accountId = db.prepare('SELECT id FROM cardav_accounts WHERE name = ?').get('Nextcloud').id;

    // Add addressbooks
    db.prepare(`
      INSERT INTO cardav_addressbook_selection (account_id, addressbook_url, addressbook_name, enabled)
      VALUES (?, ?, ?, ?), (?, ?, ?, ?)
    `).run(
      accountId, 'https://nextcloud.example.com/dav/contacts/private', 'Private', 1,
      accountId, 'https://nextcloud.example.com/dav/contacts/work', 'Work', 0
    );

    // Query enabled only
    const enabled = db.prepare('SELECT * FROM cardav_addressbook_selection WHERE account_id = ? AND enabled = 1').all(accountId);
    assert.strictEqual(enabled.length, 1, 'Should have 1 enabled addressbook');
    assert.strictEqual(enabled[0].addressbook_name, 'Private');

    // Query all
    const all = db.prepare('SELECT * FROM cardav_addressbook_selection WHERE account_id = ?').all(accountId);
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

  it('should allow manual contacts (NULL cardav_account_id)', () => {
    db.prepare(`
      INSERT INTO contacts (name, category, phone, email, cardav_account_id)
      VALUES (?, ?, ?, ?, ?)
    `).run('Manual Contact', 'Sonstiges', '+9999999999', 'manual@example.com', null);

    const contact = db.prepare('SELECT * FROM contacts WHERE name = ?').get('Manual Contact');
    assert.ok(contact, 'Manual contact should be created');
    assert.strictEqual(contact.cardav_account_id, null, 'Manual contact should have NULL cardav_account_id');
  });
});
