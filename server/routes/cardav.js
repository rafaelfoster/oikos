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
    res.status(500).json({ error: err.message || 'Interner Fehler', code: 500 });
  }
});

export default router;
