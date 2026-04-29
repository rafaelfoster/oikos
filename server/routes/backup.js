/**
 * Module: Database Backup
 * Purpose: Authenticated admin-only database backup and restore endpoints.
 * Dependencies: express, server/db.js
 */

import express from 'express';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { backupToFile, currentVersion, restoreFromFile } from '../db.js';
import { requireAdmin } from '../auth.js';
import { createLogger } from '../logger.js';

const router = express.Router();
const log = createLogger('Backup');
const RESTORE_LIMIT = process.env.BACKUP_UPLOAD_LIMIT || '100mb';

function backupFileName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `oikos-backup-${stamp}.db`;
}

router.get('/status', requireAdmin, (req, res) => {
  res.json({
    data: {
      schema_version: currentVersion(),
      restore_upload_limit: RESTORE_LIMIT,
    },
  });
});

router.get('/database', requireAdmin, async (req, res) => {
  let tmpPath = null;
  try {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oikos-backup-'));
    tmpPath = path.join(dir, backupFileName());
    await backupToFile(tmpPath);

    res.setHeader('Cache-Control', 'no-store');
    res.download(tmpPath, path.basename(tmpPath), async (err) => {
      try { await fs.rm(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      if (err && !res.headersSent) {
        log.error('Backup download failed:', err);
      }
    });
  } catch (err) {
    log.error('Database backup failed:', err);
    if (tmpPath) {
      try { await fs.rm(path.dirname(tmpPath), { recursive: true, force: true }); } catch { /* best effort */ }
    }
    res.status(500).json({ error: 'Database backup failed.', code: 500 });
  }
});

router.post(
  '/restore',
  requireAdmin,
  express.raw({ type: 'application/octet-stream', limit: RESTORE_LIMIT }),
  async (req, res) => {
    let dir = null;
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'Backup file is required.', code: 400 });
      }

      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oikos-restore-'));
      const uploadPath = path.join(dir, 'restore.db');
      await fs.writeFile(uploadPath, req.body);
      const result = await restoreFromFile(uploadPath);

      res.json({
        ok: true,
        data: {
          schema_version: result.schemaVersion,
        },
      });
    } catch (err) {
      log.error('Database restore failed:', err);
      const message = err?.message || 'Database restore failed.';
      res.status(400).json({ error: message, code: 400 });
    } finally {
      if (dir) {
        try { await fs.rm(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    }
  }
);

router.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: `Backup file is too large. Maximum upload size is ${RESTORE_LIMIT}.`, code: 413 });
  }
  next(err);
});

export default router;
