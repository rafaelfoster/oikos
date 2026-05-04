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

// ========================================
// CardDAV Sync Service Tests
// ========================================

describe('CardDAV Sync Service', () => {
  let testDb;
  let parseVCard;

  before(async () => {
    // Create in-memory test database
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');

    // Create minimal schema
    testDb.exec(`
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
    const migration30 = MIGRATIONS.find(m => m.version === 30);
    if (!migration30) {
      throw new Error('Migration 30 not found');
    }
    testDb.exec(migration30.up);

    // Import parseVCard helper for testing
    const cardavSync = await import('./server/services/cardav-sync.js');
    parseVCard = cardavSync.parseVCard;
  });

  // ========================================
  // vCard Parsing Tests
  // ========================================

  describe('parseVCard', () => {
    it('should parse basic vCard with FN and UID', () => {
      const vCardText = `BEGIN:VCARD
VERSION:3.0
UID:urn:uuid:12345
FN:John Doe
END:VCARD`;

      const result = parseVCard(vCardText);
      assert.strictEqual(result.uid, 'urn:uuid:12345');
      assert.strictEqual(result.name, 'John Doe');
    });

    it('should parse N as fallback when FN missing', () => {
      const vCardText = `BEGIN:VCARD
VERSION:3.0
UID:urn:uuid:12345
N:Doe;John;Middle;Mr.;Jr.
END:VCARD`;

      const result = parseVCard(vCardText);
      assert.strictEqual(result.uid, 'urn:uuid:12345');
      assert.ok(result.name.includes('Doe'));
      assert.ok(result.name.includes('John'));
    });

    it('should parse TEL fields with types', () => {
      const vCardText = `BEGIN:VCARD
VERSION:3.0
UID:urn:uuid:12345
FN:John Doe
TEL;TYPE=CELL:+1234567890
TEL;TYPE=WORK:+0987654321
TEL;TYPE=HOME:+1111111111
END:VCARD`;

      const result = parseVCard(vCardText);
      assert.strictEqual(result.phones.length, 3);

      const cellPhone = result.phones.find(p => p.label === 'cell');
      assert.ok(cellPhone);
      assert.strictEqual(cellPhone.value, '+1234567890');

      const workPhone = result.phones.find(p => p.label === 'work');
      assert.ok(workPhone);
      assert.strictEqual(workPhone.value, '+0987654321');
    });

    it('should parse EMAIL fields with types', () => {
      const vCardText = `BEGIN:VCARD
VERSION:3.0
UID:urn:uuid:12345
FN:John Doe
EMAIL;TYPE=HOME:john@home.com
EMAIL;TYPE=WORK:john@work.com
END:VCARD`;

      const result = parseVCard(vCardText);
      assert.strictEqual(result.emails.length, 2);

      const homeEmail = result.emails.find(e => e.label === 'home');
      assert.ok(homeEmail);
      assert.strictEqual(homeEmail.value, 'john@home.com');
    });

    it('should parse ADR fields', () => {
      const vCardText = `BEGIN:VCARD
VERSION:3.0
UID:urn:uuid:12345
FN:John Doe
ADR;TYPE=HOME:;;123 Main St;Springfield;IL;62701;USA
ADR;TYPE=WORK:;;456 Office Blvd;Metropolis;NY;10001;USA
END:VCARD`;

      const result = parseVCard(vCardText);
      assert.strictEqual(result.addresses.length, 2);

      const homeAddr = result.addresses.find(a => a.label === 'home');
      assert.ok(homeAddr);
      assert.strictEqual(homeAddr.street, '123 Main St');
      assert.strictEqual(homeAddr.city, 'Springfield');
      assert.strictEqual(homeAddr.state, 'IL');
      assert.strictEqual(homeAddr.postalCode, '62701');
      assert.strictEqual(homeAddr.country, 'USA');
    });

    it('should parse organization and job title', () => {
      const vCardText = `BEGIN:VCARD
VERSION:3.0
UID:urn:uuid:12345
FN:John Doe
ORG:Acme Corporation
TITLE:Senior Engineer
END:VCARD`;

      const result = parseVCard(vCardText);
      assert.strictEqual(result.organization, 'Acme Corporation');
      assert.strictEqual(result.jobTitle, 'Senior Engineer');
    });

    it('should parse birthday in various formats', () => {
      const vCardText1 = `BEGIN:VCARD
VERSION:3.0
UID:urn:uuid:12345
FN:John Doe
BDAY:1990-05-15
END:VCARD`;

      const result1 = parseVCard(vCardText1);
      assert.strictEqual(result1.birthday, '1990-05-15');

      const vCardText2 = `BEGIN:VCARD
VERSION:3.0
UID:urn:uuid:12345
FN:Jane Doe
BDAY:19850312
END:VCARD`;

      const result2 = parseVCard(vCardText2);
      assert.strictEqual(result2.birthday, '1985-03-12');
    });

    it('should parse URL, NICKNAME, NOTE, CATEGORIES', () => {
      const vCardText = `BEGIN:VCARD
VERSION:3.0
UID:urn:uuid:12345
FN:John Doe
URL:https://example.com
NICKNAME:Johnny
NOTE:Important contact
CATEGORIES:Friends
END:VCARD`;

      const result = parseVCard(vCardText);
      assert.strictEqual(result.website, 'https://example.com');
      assert.strictEqual(result.nickname, 'Johnny');
      assert.strictEqual(result.notes, 'Important contact');
      assert.strictEqual(result.categories, 'Friends');
    });

    it('should handle line folding', () => {
      const vCardText = `BEGIN:VCARD
VERSION:3.0
UID:urn:uuid:12345
FN:John Doe
NOTE:This is a very long note that spans
 multiple lines and should be
 concatenated properly
END:VCARD`;

      const result = parseVCard(vCardText);
      assert.ok(result.notes.includes('very long note'));
      assert.ok(result.notes.includes('multiple lines'));
      assert.ok(result.notes.includes('concatenated properly'));
    });

    it('should handle vCards with minimal data', () => {
      const vCardText = `BEGIN:VCARD
VERSION:3.0
UID:urn:uuid:minimal
FN:Minimal Contact
END:VCARD`;

      const result = parseVCard(vCardText);
      assert.strictEqual(result.uid, 'urn:uuid:minimal');
      assert.strictEqual(result.name, 'Minimal Contact');
      assert.strictEqual(result.phones.length, 0);
      assert.strictEqual(result.emails.length, 0);
      assert.strictEqual(result.addresses.length, 0);
    });

    it('should handle TEL without TYPE parameter', () => {
      const vCardText = `BEGIN:VCARD
VERSION:3.0
UID:urn:uuid:12345
FN:John Doe
TEL;CELL:+1234567890
TEL;VOICE;WORK:+0987654321
END:VCARD`;

      const result = parseVCard(vCardText);
      assert.strictEqual(result.phones.length, 2);

      // Should extract CELL and WORK from parameter names
      const cellPhone = result.phones.find(p => p.label === 'cell');
      assert.ok(cellPhone);

      const workPhone = result.phones.find(p => p.label === 'work');
      assert.ok(workPhone);
    });
  });

  // ========================================
  // Database Integration Tests
  // ========================================

  describe('Account Management (DB)', () => {
    it('should store and retrieve account correctly', () => {
      testDb.prepare(`
        INSERT INTO carddav_accounts (name, carddav_url, username, password)
        VALUES (?, ?, ?, ?)
      `).run('Test Account', 'https://carddav.example.com', 'user@example.com', 'password123');

      const account = testDb.prepare('SELECT * FROM carddav_accounts WHERE name = ?').get('Test Account');
      assert.ok(account);
      assert.strictEqual(account.name, 'Test Account');
      assert.strictEqual(account.carddav_url, 'https://carddav.example.com');
      assert.strictEqual(account.username, 'user@example.com');
      assert.strictEqual(account.password, 'password123');
    });

    it('should create addressbook selections for account', () => {
      // Create own account first
      testDb.prepare(`
        INSERT INTO carddav_accounts (name, carddav_url, username, password)
        VALUES (?, ?, ?, ?)
      `).run('Account For Addressbooks', 'https://example.com/dav', 'user1@example.com', 'pass');

      const accountId = testDb.prepare('SELECT id FROM carddav_accounts WHERE name = ?').get('Account For Addressbooks').id;

      testDb.prepare(`
        INSERT INTO carddav_addressbook_selection (account_id, addressbook_url, addressbook_name, enabled)
        VALUES (?, ?, ?, ?), (?, ?, ?, ?)
      `).run(
        accountId, 'https://example.com/dav/addressbooks/personal', 'Personal', 1,
        accountId, 'https://example.com/dav/addressbooks/work', 'Work', 0
      );

      const enabled = testDb.prepare(`
        SELECT * FROM carddav_addressbook_selection
        WHERE account_id = ? AND enabled = 1
      `).all(accountId);

      assert.strictEqual(enabled.length, 1);
      assert.strictEqual(enabled[0].addressbook_name, 'Personal');

      const all = testDb.prepare(`
        SELECT * FROM carddav_addressbook_selection
        WHERE account_id = ?
      `).all(accountId);

      assert.strictEqual(all.length, 2);
    });

    it('should reject duplicate accounts (same URL + username)', () => {
      testDb.prepare(`
        INSERT INTO carddav_accounts (name, carddav_url, username, password)
        VALUES (?, ?, ?, ?)
      `).run('Nextcloud Test', 'https://nextcloud.test.com/dav', 'user@nextcloud.com', 'pass1');

      // Attempt to insert duplicate
      assert.throws(() => {
        testDb.prepare(`
          INSERT INTO carddav_accounts (name, carddav_url, username, password)
          VALUES (?, ?, ?, ?)
        `).run('Nextcloud Test 2', 'https://nextcloud.test.com/dav', 'user@nextcloud.com', 'pass2');
      }, 'UNIQUE constraint should prevent duplicate carddav_url+username');
    });

    it('should delete account and set carddav_account_id = NULL on contacts', () => {
      // Create own account first
      testDb.prepare(`
        INSERT INTO carddav_accounts (name, carddav_url, username, password)
        VALUES (?, ?, ?, ?)
      `).run('Account For Deletion', 'https://delete.example.com', 'user@delete.com', 'pass');

      const accountId = testDb.prepare('SELECT id FROM carddav_accounts WHERE name = ?').get('Account For Deletion').id;

      // Create contact linked to this account
      testDb.prepare(`
        INSERT INTO contacts (name, category, carddav_account_id, carddav_uid)
        VALUES (?, ?, ?, ?)
      `).run('Test Contact For Deletion', 'Sonstiges', accountId, 'urn:uuid:test-contact-delete');

      const contactId = testDb.prepare('SELECT id FROM contacts WHERE name = ?').get('Test Contact For Deletion').id;

      // Verify contact is linked
      const beforeDelete = testDb.prepare('SELECT carddav_account_id FROM contacts WHERE id = ?').get(contactId);
      assert.strictEqual(beforeDelete.carddav_account_id, accountId);

      // Delete account
      testDb.prepare('DELETE FROM carddav_accounts WHERE id = ?').run(accountId);

      // Contact should remain but carddav_account_id should be NULL
      const afterDelete = testDb.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
      assert.ok(afterDelete, 'Contact should still exist');
      assert.strictEqual(afterDelete.carddav_account_id, null, 'carddav_account_id should be SET NULL');
    });

    it('should retrieve password correctly from database', () => {
      // Create own account first
      testDb.prepare(`
        INSERT INTO carddav_accounts (name, carddav_url, username, password)
        VALUES (?, ?, ?, ?)
      `).run('iCloud Password Test', 'https://contacts.icloud.com', 'test@icloud.com', 'my-secret-password');

      const account = testDb.prepare('SELECT * FROM carddav_accounts WHERE name = ?').get('iCloud Password Test');
      assert.strictEqual(account.password, 'my-secret-password', 'Password should be retrievable');
    });
  });

  describe('Addressbook Discovery UPSERT', () => {
    it('should insert new addressbook for account', () => {
      // Create own account first
      testDb.prepare(`
        INSERT INTO carddav_accounts (name, carddav_url, username, password)
        VALUES (?, ?, ?, ?)
      `).run('iCloud UPSERT', 'https://contacts.upsert.icloud.com', 'test@upsert.com', 'pass');

      const accountId = testDb.prepare('SELECT id FROM carddav_accounts WHERE name = ?').get('iCloud UPSERT').id;

      testDb.prepare(`
        INSERT INTO carddav_addressbook_selection (account_id, addressbook_url, addressbook_name, enabled)
        VALUES (?, ?, ?, ?)
      `).run(accountId, 'https://contacts.upsert.icloud.com/123456/personal', 'Personal', 1);

      const addressbook = testDb.prepare(`
        SELECT * FROM carddav_addressbook_selection
        WHERE account_id = ? AND addressbook_url = ?
      `).get(accountId, 'https://contacts.upsert.icloud.com/123456/personal');

      assert.ok(addressbook);
      assert.strictEqual(addressbook.addressbook_name, 'Personal');
      assert.strictEqual(addressbook.enabled, 1);
    });

    it('should update existing addressbook name while preserving enabled state', () => {
      // Create own account first
      testDb.prepare(`
        INSERT INTO carddav_accounts (name, carddav_url, username, password)
        VALUES (?, ?, ?, ?)
      `).run('iCloud Update', 'https://contacts.update.icloud.com', 'test@update.com', 'pass');

      const accountId = testDb.prepare('SELECT id FROM carddav_accounts WHERE name = ?').get('iCloud Update').id;

      // Create initial addressbook
      testDb.prepare(`
        INSERT INTO carddav_addressbook_selection (account_id, addressbook_url, addressbook_name, enabled)
        VALUES (?, ?, ?, ?)
      `).run(accountId, 'https://contacts.update.icloud.com/123456/personal', 'Personal', 1);

      const existing = testDb.prepare(`
        SELECT id, enabled FROM carddav_addressbook_selection
        WHERE account_id = ? AND addressbook_url = ?
      `).get(accountId, 'https://contacts.update.icloud.com/123456/personal');

      // Disable it
      testDb.prepare('UPDATE carddav_addressbook_selection SET enabled = 0 WHERE id = ?').run(existing.id);

      // Update name (simulating rediscovery)
      testDb.prepare(`
        UPDATE carddav_addressbook_selection
        SET addressbook_name = ?
        WHERE id = ?
      `).run('Personal Contacts', existing.id);

      const updated = testDb.prepare('SELECT * FROM carddav_addressbook_selection WHERE id = ?').get(existing.id);
      assert.strictEqual(updated.addressbook_name, 'Personal Contacts', 'Name should be updated');
      assert.strictEqual(updated.enabled, 0, 'Enabled state should be preserved');
    });

    it('should not insert duplicate addressbook for same account+url', () => {
      // Create own account first
      testDb.prepare(`
        INSERT INTO carddav_accounts (name, carddav_url, username, password)
        VALUES (?, ?, ?, ?)
      `).run('iCloud Duplicate', 'https://contacts.duplicate.icloud.com', 'test@dup.com', 'pass');

      const accountId = testDb.prepare('SELECT id FROM carddav_accounts WHERE name = ?').get('iCloud Duplicate').id;

      // Create first addressbook
      testDb.prepare(`
        INSERT INTO carddav_addressbook_selection (account_id, addressbook_url, addressbook_name, enabled)
        VALUES (?, ?, ?, ?)
      `).run(accountId, 'https://contacts.duplicate.icloud.com/123456/personal', 'Personal', 1);

      assert.throws(() => {
        testDb.prepare(`
          INSERT INTO carddav_addressbook_selection (account_id, addressbook_url, addressbook_name, enabled)
          VALUES (?, ?, ?, ?)
        `).run(accountId, 'https://contacts.duplicate.icloud.com/123456/personal', 'Duplicate', 1);
      }, 'UNIQUE constraint should prevent duplicate account_id+addressbook_url');
    });
  });

  describe('Addressbook Toggle', () => {
    it('should toggle addressbook enabled state', () => {
      // Create own account first
      testDb.prepare(`
        INSERT INTO carddav_accounts (name, carddav_url, username, password)
        VALUES (?, ?, ?, ?)
      `).run('iCloud Toggle', 'https://contacts.toggle.icloud.com', 'test@toggle.com', 'pass');

      const accountId = testDb.prepare('SELECT id FROM carddav_accounts WHERE name = ?').get('iCloud Toggle').id;

      // Create addressbook with enabled=0
      testDb.prepare(`
        INSERT INTO carddav_addressbook_selection (account_id, addressbook_url, addressbook_name, enabled)
        VALUES (?, ?, ?, ?)
      `).run(accountId, 'https://contacts.toggle.icloud.com/123456/personal', 'Personal', 0);

      const addressbook = testDb.prepare(`
        SELECT * FROM carddav_addressbook_selection
        WHERE account_id = ? AND addressbook_url = ?
      `).get(accountId, 'https://contacts.toggle.icloud.com/123456/personal');

      // Initially disabled
      assert.strictEqual(addressbook.enabled, 0);

      // Enable it
      testDb.prepare('UPDATE carddav_addressbook_selection SET enabled = 1 WHERE id = ?').run(addressbook.id);

      const enabled = testDb.prepare('SELECT * FROM carddav_addressbook_selection WHERE id = ?').get(addressbook.id);
      assert.strictEqual(enabled.enabled, 1);

      // Disable it again
      testDb.prepare('UPDATE carddav_addressbook_selection SET enabled = 0 WHERE id = ?').run(addressbook.id);

      const disabled = testDb.prepare('SELECT * FROM carddav_addressbook_selection WHERE id = ?').get(addressbook.id);
      assert.strictEqual(disabled.enabled, 0);
    });
  });

  describe('Contact Merge Logic (DB)', () => {
    let aliceContact;
    let accountId;

    before(() => {
      // Create account
      testDb.prepare(`
        INSERT INTO carddav_accounts (name, carddav_url, username, password)
        VALUES (?, ?, ?, ?)
      `).run('Account For vCard', 'https://vcard.example.com', 'user@vcard.com', 'pass');

      accountId = testDb.prepare('SELECT id FROM carddav_accounts WHERE name = ?').get('Account For vCard').id;

      // Create Alice Smith
      testDb.prepare(`
        INSERT INTO contacts (
          name, category, organization, job_title, birthday, website,
          nickname, notes,
          carddav_account_id, carddav_uid, carddav_addressbook_url
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'Alice Smith',
        'Sonstiges',
        'Tech Corp',
        'Developer',
        '1990-01-15',
        'https://alice.dev',
        'Ali',
        'Great developer',
        accountId,
        'urn:uuid:alice-123',
        'https://vcard.example.com/addressbooks/personal'
      );

      aliceContact = testDb.prepare('SELECT * FROM contacts WHERE name = ?').get('Alice Smith');
    });

    it('should create new contact from vCard', () => {
      assert.ok(aliceContact);
      assert.strictEqual(aliceContact.organization, 'Tech Corp');
      assert.strictEqual(aliceContact.job_title, 'Developer');
      assert.strictEqual(aliceContact.birthday, '1990-01-15');
      assert.strictEqual(aliceContact.carddav_uid, 'urn:uuid:alice-123');
    });

    it('should add multiple phones to contact', () => {
      testDb.prepare(`
        INSERT INTO contact_phones (contact_id, label, value, is_primary)
        VALUES (?, ?, ?, ?), (?, ?, ?, ?)
      `).run(
        aliceContact.id, 'mobile', '+1234567890', 1,
        aliceContact.id, 'work', '+0987654321', 0
      );

      const phones = testDb.prepare('SELECT * FROM contact_phones WHERE contact_id = ?').all(aliceContact.id);
      assert.strictEqual(phones.length, 2);

      const primary = phones.find(p => p.is_primary === 1);
      assert.ok(primary);
      assert.strictEqual(primary.value, '+1234567890');
    });

    it('should add multiple emails to contact', () => {
      testDb.prepare(`
        INSERT INTO contact_emails (contact_id, label, value, is_primary)
        VALUES (?, ?, ?, ?), (?, ?, ?, ?)
      `).run(
        aliceContact.id, 'home', 'alice@home.com', 1,
        aliceContact.id, 'work', 'alice@work.com', 0
      );

      const emails = testDb.prepare('SELECT * FROM contact_emails WHERE contact_id = ?').all(aliceContact.id);
      assert.strictEqual(emails.length, 2);

      const primary = emails.find(e => e.is_primary === 1);
      assert.ok(primary);
      assert.strictEqual(primary.value, 'alice@home.com');
    });

    it('should add multiple addresses to contact', () => {
      testDb.prepare(`
        INSERT INTO contact_addresses (contact_id, label, street, city, state, postal_code, country, is_primary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        aliceContact.id, 'home', '123 Main St', 'Springfield', 'IL', '62701', 'USA', 1
      );

      const addresses = testDb.prepare('SELECT * FROM contact_addresses WHERE contact_id = ?').all(aliceContact.id);
      assert.strictEqual(addresses.length, 1);
      assert.strictEqual(addresses[0].street, '123 Main St');
      assert.strictEqual(addresses[0].is_primary, 1);
    });

    it('should preserve primary entries when updating multi-values', () => {
      // Mark first phone as primary (manually set)
      testDb.prepare('UPDATE contact_phones SET is_primary = 1 WHERE contact_id = ? AND label = ?')
        .run(aliceContact.id, 'mobile');

      // Delete non-primary phones (simulating sync update)
      testDb.prepare('DELETE FROM contact_phones WHERE contact_id = ? AND is_primary = 0')
        .run(aliceContact.id);

      // Add new phones from vCard
      testDb.prepare(`
        INSERT INTO contact_phones (contact_id, label, value, is_primary)
        VALUES (?, ?, ?, ?)
      `).run(aliceContact.id, 'home', '+9999999999', 0);

      const phones = testDb.prepare('SELECT * FROM contact_phones WHERE contact_id = ?').all(aliceContact.id);

      // Should have primary mobile + new home phone
      assert.strictEqual(phones.length, 2);

      const primaryPhone = phones.find(p => p.is_primary === 1);
      assert.ok(primaryPhone);
      assert.strictEqual(primaryPhone.label, 'mobile');
    });

    it('should find contact by email match', () => {
      // Create manual contact with email
      testDb.prepare(`
        INSERT INTO contacts (name, category, email)
        VALUES (?, ?, ?)
      `).run('Bob Jones', 'Sonstiges', 'bob@example.com');

      const contactId = testDb.prepare('SELECT id FROM contacts WHERE name = ?').get('Bob Jones').id;

      // Also add to contact_emails
      testDb.prepare(`
        INSERT INTO contact_emails (contact_id, label, value, is_primary)
        VALUES (?, ?, ?, ?)
      `).run(contactId, 'work', 'bob@work.com', 0);

      // Search by email (simulating merge logic)
      const foundByOldEmail = testDb.prepare(`
        SELECT c.* FROM contacts c
        WHERE c.email = ?
      `).get('bob@example.com');

      assert.ok(foundByOldEmail);
      assert.strictEqual(foundByOldEmail.name, 'Bob Jones');

      const foundByNewEmail = testDb.prepare(`
        SELECT c.* FROM contacts c
        LEFT JOIN contact_emails ce ON c.id = ce.contact_id
        WHERE ce.value = ?
      `).get('bob@work.com');

      assert.ok(foundByNewEmail);
      assert.strictEqual(foundByNewEmail.name, 'Bob Jones');
    });

    it('should find contact by phone match', () => {
      // Create manual contact with phone
      testDb.prepare(`
        INSERT INTO contacts (name, category, phone)
        VALUES (?, ?, ?)
      `).run('Carol White', 'Sonstiges', '+5555555555');

      const contactId = testDb.prepare('SELECT id FROM contacts WHERE name = ?').get('Carol White').id;

      // Also add to contact_phones
      testDb.prepare(`
        INSERT INTO contact_phones (contact_id, label, value, is_primary)
        VALUES (?, ?, ?, ?)
      `).run(contactId, 'mobile', '+6666666666', 0);

      // Search by phone (simulating merge logic)
      const foundByOldPhone = testDb.prepare(`
        SELECT c.* FROM contacts c
        WHERE c.phone = ?
      `).get('+5555555555');

      assert.ok(foundByOldPhone);
      assert.strictEqual(foundByOldPhone.name, 'Carol White');

      const foundByNewPhone = testDb.prepare(`
        SELECT c.* FROM contacts c
        LEFT JOIN contact_phones cp ON c.id = cp.contact_id
        WHERE cp.value = ?
      `).get('+6666666666');

      assert.ok(foundByNewPhone);
      assert.strictEqual(foundByNewPhone.name, 'Carol White');
    });

    it('should only update NULL fields when merging', () => {
      // Create contact with some fields filled
      testDb.prepare(`
        INSERT INTO contacts (name, category, organization, job_title)
        VALUES (?, ?, ?, ?)
      `).run('Dave Brown', 'Sonstiges', 'Local Company', 'Manager');

      const contactId = testDb.prepare('SELECT id FROM contacts WHERE name = ?').get('Dave Brown').id;

      // Simulate merge: only update NULL fields
      const updates = [];
      const values = [];

      const contact = testDb.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);

      // birthday is NULL, should update
      if (contact.birthday === null) {
        updates.push('birthday = ?');
        values.push('1985-07-20');
      }

      // organization is NOT NULL, should not update
      if (contact.organization === null) {
        updates.push('organization = ?');
        values.push('New Company');
      }

      values.push(contactId);

      if (updates.length > 0) {
        testDb.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      }

      const updated = testDb.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);

      // birthday should be updated
      assert.strictEqual(updated.birthday, '1985-07-20');

      // organization should remain unchanged
      assert.strictEqual(updated.organization, 'Local Company');
    });

    it('should update existing contact when cardav_uid matches', () => {
      // Create own account first
      testDb.prepare(`
        INSERT INTO carddav_accounts (name, carddav_url, username, password)
        VALUES (?, ?, ?, ?)
      `).run('iCloud Sync Account', 'https://contacts.sync.icloud.com', 'test@sync.com', 'pass');

      const accountId = testDb.prepare('SELECT id FROM carddav_accounts WHERE name = ?').get('iCloud Sync Account').id;

      // Create initial contact from CardDAV
      testDb.prepare(`
        INSERT INTO contacts (
          name, category, organization, job_title,
          carddav_account_id, carddav_uid, carddav_addressbook_url
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'John Sync',
        'Sonstiges',
        'SyncCorp',
        'Engineer',
        accountId,
        'urn:uuid:sync-test-123',
        'https://contacts.sync.icloud.com/123456/personal'
      );

      const contactId = testDb.prepare('SELECT id FROM contacts WHERE name = ?').get('John Sync').id;

      // User manually sets birthday
      testDb.prepare('UPDATE contacts SET birthday = ? WHERE id = ?').run('1990-05-15', contactId);

      // Simulate sync update (only update NULL fields)
      const contact = testDb.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);

      const updates = [];
      const values = [];

      // website is NULL, should update
      if (contact.website === null) {
        updates.push('website = ?');
        values.push('https://john.example.com');
      }

      // birthday is NOT NULL (user set it), should not update
      if (contact.birthday === null) {
        updates.push('birthday = ?');
        values.push('1985-01-01');
      }

      // organization is NOT NULL, should not update
      if (contact.organization === null) {
        updates.push('organization = ?');
        values.push('Different Corp');
      }

      if (updates.length > 0) {
        values.push(contactId);
        testDb.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      }

      const updated = testDb.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);

      // website should be updated (was NULL)
      assert.strictEqual(updated.website, 'https://john.example.com');

      // birthday should remain unchanged (user's manual value)
      assert.strictEqual(updated.birthday, '1990-05-15');

      // organization should remain unchanged
      assert.strictEqual(updated.organization, 'SyncCorp');
    });
  });
});
