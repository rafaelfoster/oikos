/**
 * Modul: CardDAV Management
 * Zweck: REST-API-Routen für CardDAV Account Management, Addressbook Discovery, Sync
 * Abhängigkeiten: express, server/db.js, server/services/cardav-sync.js
 */

import { createLogger } from '../logger.js';
import express from 'express';
import * as db from '../db.js';
import * as CardDAVSync from '../services/cardav-sync.js';
import { str, collectErrors, MAX_TITLE } from '../middleware/validate.js';

const log = createLogger('CardDAV');
const MAX_URL = 500;
const router = express.Router();

/**
 * GET /api/v1/contacts/cardav/accounts
 * Liste aller CardDAV Accounts.
 * Response: { data: Account[] }
 */
router.get('/accounts', async (req, res) => {
  try {
    const accounts = await CardDAVSync.getAllAccounts();
    res.json({ data: accounts });
  } catch (err) {
    log.error('Error fetching accounts:', err);
    res.status(500).json({ error: 'Interner Fehler', code: 500 });
  }
});

/**
 * POST /api/v1/contacts/cardav/accounts
 * Neuen CardDAV Account erstellen und Addressbooks discovern.
 * Body: { name, cardavUrl, username, password }
 * Response: { data: { account, addressbooks } }
 */
router.post('/accounts', async (req, res) => {
  try {
    const vName     = str(req.body.name, 'Name', { max: MAX_TITLE });
    const vUrl      = str(req.body.cardavUrl, 'CardDAV URL', { max: MAX_URL });
    const vUsername = str(req.body.username, 'Username', { max: MAX_TITLE });
    const vPassword = str(req.body.password, 'Password', { max: MAX_TITLE });
    const errors = collectErrors([vName, vUrl, vUsername, vPassword]);
    if (errors.length) return res.status(400).json({ error: errors.join(' '), code: 400 });

    const result = await CardDAVSync.addAccount(
      vName.value,
      vUrl.value,
      vUsername.value,
      vPassword.value
    );

    res.status(201).json({ data: result });
  } catch (err) {
    log.error('Error adding CardDAV account:', err);
    res.status(500).json({ error: 'Interner Fehler', code: 500 });
  }
});

/**
 * DELETE /api/v1/contacts/cardav/accounts/:id
 * CardDAV Account löschen (CASCADE löscht addressbooks + contacts).
 * Response: { data: { deleted: true } }
 */
router.delete('/accounts/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || id < 1) return res.status(400).json({ error: 'Invalid ID', code: 400 });

    await CardDAVSync.deleteAccount(id);

    res.json({ data: { deleted: true } });
  } catch (err) {
    log.error('Error deleting CardDAV account:', err);
    res.status(500).json({ error: 'Interner Fehler', code: 500 });
  }
});

/**
 * POST /api/v1/contacts/cardav/accounts/:id/test
 * Connection testen (ohne Account zu speichern).
 * Response: { data: { ok, addressbooks } }
 */
router.post('/accounts/:id/test', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || id < 1) return res.status(400).json({ error: 'Invalid ID', code: 400 });

    const account = db.get().prepare('SELECT * FROM carddav_accounts WHERE id = ?').get(id);
    if (!account) return res.status(404).json({ error: 'Account nicht gefunden', code: 404 });

    const result = await CardDAVSync.testConnection(
      account.carddav_url,
      account.username,
      account.password
    );

    res.json({ data: result });
  } catch (err) {
    log.error('Error testing CardDAV connection:', err);
    res.status(500).json({ error: 'Interner Fehler', code: 500 });
  }
});

export default router;
