/**
 * Module: Family Documents
 * Purpose: Grid/list document management with local uploads and member visibility.
 * Dependencies: /api.js, shared modal, i18n
 */

import { api } from '/api.js';
import { openModal as openSharedModal, closeModal } from '/components/modal.js';
import { t, formatDate } from '/i18n.js';
import { esc } from '/utils/html.js';
import { stagger } from '/utils/ux.js';

const CATEGORIES = ['medical', 'school', 'identity', 'insurance', 'finance', 'home', 'vehicle', 'legal', 'travel', 'pets', 'warranty', 'taxes', 'work', 'other'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const CATEGORY_ICONS = {
  medical: 'heart-pulse',
  school: 'graduation-cap',
  identity: 'badge-check',
  insurance: 'shield-check',
  finance: 'landmark',
  home: 'home',
  vehicle: 'car',
  legal: 'scale',
  travel: 'plane',
  pets: 'paw-print',
  warranty: 'receipt',
  taxes: 'file-spreadsheet',
  work: 'briefcase-business',
  other: 'folder',
};

function categoryLabels() {
  return Object.fromEntries(CATEGORIES.map((category) => [category, t(`documents.category.${category}`)]));
}

let state = {
  documents: [],
  members: [],
  view: localStorage.getItem('oikos-documents-view') || 'grid',
  status: 'active',
  category: '',
  query: '',
};
let _container = null;

export async function render(container) {
  _container = container;
  container.innerHTML = `
    <div class="documents-page">
      <div class="documents-toolbar">
        <h1 class="documents-toolbar__title">${t('documents.title')}</h1>
        <div class="documents-toolbar__search">
          <i data-lucide="search" class="documents-toolbar__search-icon" aria-hidden="true"></i>
          <input class="documents-toolbar__search-input" id="documents-search" type="search" placeholder="${t('documents.searchPlaceholder')}" autocomplete="off">
        </div>
        <div class="documents-view-toggle" role="group" aria-label="${t('documents.viewToggle')}">
          <button class="documents-view-toggle__btn ${state.view === 'grid' ? 'documents-view-toggle__btn--active' : ''}" data-view="grid" aria-label="${t('documents.gridView')}">
            <i data-lucide="layout-grid" aria-hidden="true"></i>
          </button>
          <button class="documents-view-toggle__btn ${state.view === 'list' ? 'documents-view-toggle__btn--active' : ''}" data-view="list" aria-label="${t('documents.listView')}">
            <i data-lucide="list" aria-hidden="true"></i>
          </button>
        </div>
        <button class="btn btn--primary" id="documents-add-btn">
          <i data-lucide="upload" class="icon-base" aria-hidden="true"></i>
          ${t('documents.addButton')}
        </button>
      </div>
      <div class="documents-filters">
        <select class="input documents-filter-select" id="documents-status">
          <option value="active">${t('documents.statusActive')}</option>
          <option value="archived">${t('documents.statusArchived')}</option>
        </select>
        <select class="input documents-filter-select" id="documents-category">
          <option value="">${t('documents.allCategories')}</option>
          ${CATEGORIES.map((category) => `<option value="${category}">${categoryLabels()[category]}</option>`).join('')}
        </select>
      </div>
      <div id="documents-list" class="documents-list documents-list--${state.view}"></div>
      <button class="page-fab" id="fab-new-document" aria-label="${t('documents.addButton')}">
        <i data-lucide="upload" class="icon-2xl" aria-hidden="true"></i>
      </button>
    </div>
  `;

  if (window.lucide) lucide.createIcons();

  await Promise.all([loadMembers(), loadDocuments()]);
  bindPageEvents();
  renderDocuments();
}

async function loadMembers() {
  const res = await api.get('/family/members');
  state.members = res.data || [];
}

async function loadDocuments() {
  const params = new URLSearchParams();
  params.set('status', state.status);
  if (state.category) params.set('category', state.category);
  const res = await api.get(`/documents?${params.toString()}`);
  state.documents = res.data || [];
}

function bindPageEvents() {
  _container.querySelector('#documents-add-btn')?.addEventListener('click', () => openDocumentModal());
  _container.querySelector('#fab-new-document')?.addEventListener('click', () => openDocumentModal());
  _container.querySelector('#documents-search')?.addEventListener('input', (e) => {
    state.query = e.target.value.trim().toLowerCase();
    renderDocuments();
  });
  _container.querySelector('#documents-status')?.addEventListener('change', async (e) => {
    state.status = e.target.value;
    await loadDocuments();
    renderDocuments();
  });
  _container.querySelector('#documents-category')?.addEventListener('change', async (e) => {
    state.category = e.target.value;
    await loadDocuments();
    renderDocuments();
  });
  _container.querySelector('.documents-view-toggle')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    state.view = btn.dataset.view;
    localStorage.setItem('oikos-documents-view', state.view);
    _container.querySelectorAll('.documents-view-toggle__btn').forEach((el) =>
      el.classList.toggle('documents-view-toggle__btn--active', el === btn)
    );
    renderDocuments();
  });
  _container.querySelector('#documents-list')?.addEventListener('click', handleDocumentAction);
}

function filteredDocuments() {
  if (!state.query) return state.documents;
  return state.documents.filter((doc) =>
    doc.name.toLowerCase().includes(state.query) ||
    (doc.description || '').toLowerCase().includes(state.query) ||
    doc.original_name.toLowerCase().includes(state.query)
  );
}

function renderDocuments() {
  const list = _container.querySelector('#documents-list');
  if (!list) return;
  const docs = filteredDocuments();
  list.className = `documents-list documents-list--${state.view}`;
  if (!docs.length) {
    list.innerHTML = `
      <div class="empty-state">
        <i data-lucide="folder-open" class="empty-state__icon" aria-hidden="true"></i>
        <div class="empty-state__title">${t('documents.emptyTitle')}</div>
        <div class="empty-state__description">${t('documents.emptyDescription')}</div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }
  list.innerHTML = docs.map((doc) => state.view === 'list' ? renderListItem(doc) : renderGridCard(doc)).join('');
  if (window.lucide) lucide.createIcons();
  stagger(list.querySelectorAll('.document-card, .document-row'));
}

function renderMeta(doc) {
  const labels = categoryLabels();
  return `
    <span><i data-lucide="${CATEGORY_ICONS[doc.category] || 'folder'}" aria-hidden="true"></i>${labels[doc.category] || doc.category}</span>
    <span><i data-lucide="${doc.visibility === 'family' ? 'users' : doc.visibility === 'private' ? 'lock' : 'user-check'}" aria-hidden="true"></i>${t(`documents.visibility.${doc.visibility}`)}</span>
    <span>${formatFileSize(doc.file_size)}</span>
  `;
}

function renderActions(doc) {
  return `
    <a class="btn btn--ghost btn--icon btn--icon-sm" href="/api/v1/documents/${doc.id}/download" download title="${t('documents.downloadAction')}" aria-label="${t('documents.downloadAction')}">
      <i data-lucide="download" class="icon-base" aria-hidden="true"></i>
    </a>
    <button class="btn btn--ghost btn--icon btn--icon-sm" data-action="edit" data-id="${doc.id}" title="${t('documents.editAction')}" aria-label="${t('documents.editAction')}">
      <i data-lucide="settings" class="icon-base" aria-hidden="true"></i>
    </button>
    <button class="btn btn--ghost btn--icon btn--icon-sm" data-action="archive" data-id="${doc.id}" data-archived="${doc.status === 'archived'}" title="${doc.status === 'archived' ? t('documents.restoreAction') : t('documents.archiveAction')}" aria-label="${doc.status === 'archived' ? t('documents.restoreAction') : t('documents.archiveAction')}">
      <i data-lucide="${doc.status === 'archived' ? 'archive-restore' : 'archive'}" class="icon-base" aria-hidden="true"></i>
    </button>
    <button class="btn btn--ghost btn--icon btn--icon-sm documents-danger" data-action="delete" data-id="${doc.id}" title="${t('common.delete')}" aria-label="${t('common.delete')}">
      <i data-lucide="trash-2" class="icon-base" aria-hidden="true"></i>
    </button>
  `;
}

function renderGridCard(doc) {
  return `
    <article class="document-card" data-id="${doc.id}">
      <div class="document-card__icon"><i data-lucide="${CATEGORY_ICONS[doc.category] || 'file'}" aria-hidden="true"></i></div>
      <div class="document-card__body">
        <h2 class="document-card__title">${esc(doc.name)}</h2>
        <p class="document-card__description">${esc(doc.description || doc.original_name)}</p>
        <div class="document-card__meta">${renderMeta(doc)}</div>
      </div>
      <div class="document-card__footer">
        <span>${formatDate(doc.updated_at)}</span>
        <div class="document-card__actions">${renderActions(doc)}</div>
      </div>
    </article>
  `;
}

function renderListItem(doc) {
  return `
    <article class="document-row" data-id="${doc.id}">
      <div class="document-row__icon"><i data-lucide="${CATEGORY_ICONS[doc.category] || 'file'}" aria-hidden="true"></i></div>
      <div class="document-row__body">
        <h2 class="document-row__title">${esc(doc.name)}</h2>
        <div class="document-row__meta">${renderMeta(doc)}</div>
      </div>
      <div class="document-row__actions">${renderActions(doc)}</div>
    </article>
  `;
}

async function handleDocumentAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const doc = state.documents.find((item) => String(item.id) === String(btn.dataset.id));
  if (!doc) return;
  if (btn.dataset.action === 'edit') openDocumentModal(doc);
  if (btn.dataset.action === 'archive') {
    await api.patch(`/documents/${doc.id}/archive`, { archived: doc.status !== 'archived' });
    window.oikos?.showToast(doc.status === 'archived' ? t('documents.restoredToast') : t('documents.archivedToast'), 'success');
    await loadDocuments();
    renderDocuments();
  }
  if (btn.dataset.action === 'delete') {
    if (!confirm(t('documents.deleteConfirm', { name: doc.name }))) return;
    await api.delete(`/documents/${doc.id}`);
    window.oikos?.showToast(t('documents.deletedToast'), 'success');
    await loadDocuments();
    renderDocuments();
  }
}

function memberOptions(selected = []) {
  const selectedSet = new Set(selected.map(String));
  return state.members.map((member) => `
    <label class="document-member-option">
      <input type="checkbox" value="${member.id}" ${selectedSet.has(String(member.id)) ? 'checked' : ''}>
      <span>${esc(member.display_name)}</span>
    </label>
  `).join('');
}

function openDocumentModal(doc = null) {
  const isEdit = !!doc;
  openSharedModal({
    title: isEdit ? t('documents.editTitle') : t('documents.newTitle'),
    size: 'lg',
    content: `
      <form id="document-form" class="document-form">
        <div class="modal-grid modal-grid--2">
          <div class="form-group">
            <label class="label" for="document-name">${t('documents.nameLabel')}</label>
            <input class="input" id="document-name" name="name" required maxlength="200" value="${esc(doc?.name || '')}">
          </div>
          <div class="form-group">
            <label class="label" for="document-category">${t('documents.categoryLabel')}</label>
            <select class="input" id="document-category">
              ${CATEGORIES.map((category) => `<option value="${category}" ${doc?.category === category ? 'selected' : ''}>${categoryLabels()[category]}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="label" for="document-description">${t('documents.descriptionLabel')}</label>
          <textarea class="input" id="document-description" rows="3" maxlength="5000">${esc(doc?.description || '')}</textarea>
        </div>
        ${!isEdit ? `
        <div class="form-group">
          <label class="label" for="document-file">${t('documents.fileLabel')}</label>
          <label class="document-dropzone" id="document-dropzone" for="document-file">
            <input class="sr-only" id="document-file" type="file" required>
            <span class="document-dropzone__icon">
              <i data-lucide="file-up" aria-hidden="true"></i>
            </span>
            <span class="document-dropzone__title">${t('documents.dropzoneTitle')}</span>
            <span class="document-dropzone__hint">${t('documents.dropzoneHint')}</span>
            <span class="document-dropzone__file" id="document-selected-file" hidden></span>
          </label>
          <p class="document-form__hint">${t('documents.fileHint')}</p>
        </div>` : ''}
        <div class="modal-grid modal-grid--2">
          <div class="form-group">
            <label class="label" for="document-visibility">${t('documents.visibilityLabel')}</label>
            <select class="input" id="document-visibility">
              <option value="family" ${doc?.visibility === 'family' ? 'selected' : ''}>${t('documents.visibility.family')}</option>
              <option value="restricted" ${doc?.visibility === 'restricted' ? 'selected' : ''}>${t('documents.visibility.restricted')}</option>
              <option value="private" ${doc?.visibility === 'private' ? 'selected' : ''}>${t('documents.visibility.private')}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="label" for="document-status">${t('documents.statusLabel')}</label>
            <select class="input" id="document-status">
              <option value="active" ${doc?.status !== 'archived' ? 'selected' : ''}>${t('documents.statusActive')}</option>
              <option value="archived" ${doc?.status === 'archived' ? 'selected' : ''}>${t('documents.statusArchived')}</option>
            </select>
          </div>
        </div>
        <div class="document-member-picker" id="document-member-picker">
          <div class="label">${t('documents.allowedMembersLabel')}</div>
          <div class="document-member-picker__grid">${memberOptions(doc?.allowed_member_ids || [])}</div>
        </div>
        <div id="document-error" class="login-error" hidden></div>
        <div class="modal-panel__footer" style="padding:0;border:none;margin-top:var(--space-5)">
          <button type="submit" class="btn btn--primary" id="document-submit">${isEdit ? t('common.save') : t('documents.uploadAction')}</button>
        </div>
      </form>
    `,
    onSave(panel) {
      const form = panel.querySelector('#document-form');
      const visibility = panel.querySelector('#document-visibility');
      const picker = panel.querySelector('#document-member-picker');
      const syncVisibility = () => { picker.hidden = visibility.value !== 'restricted'; };
      visibility.addEventListener('change', syncVisibility);
      syncVisibility();
      bindDropzone(panel);
      form.addEventListener('submit', (event) => saveDocument(event, doc));
    },
  });
}

function bindDropzone(panel) {
  const dropzone = panel.querySelector('#document-dropzone');
  const input = panel.querySelector('#document-file');
  const selected = panel.querySelector('#document-selected-file');
  if (!dropzone || !input || !selected) return;

  const syncSelectedFile = () => {
    const file = input.files?.[0];
    selected.hidden = !file;
    selected.textContent = file ? t('documents.selectedFileLabel', { name: file.name }) : '';
  };

  input.addEventListener('change', syncSelectedFile);
  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add('document-dropzone--active');
    });
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove('document-dropzone--active');
    });
  });
  dropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    syncSelectedFile();
  });
}

async function saveDocument(event, doc) {
  event.preventDefault();
  const form = event.target;
  const error = form.querySelector('#document-error');
  const submit = form.querySelector('#document-submit');
  error.hidden = true;
  submit.disabled = true;
  try {
    const visibility = form.querySelector('#document-visibility').value;
    const payload = {
      name: form.querySelector('#document-name').value.trim(),
      description: form.querySelector('#document-description').value.trim() || null,
      category: form.querySelector('#document-category').value,
      visibility,
      status: form.querySelector('#document-status').value,
      allowed_member_ids: visibility === 'restricted'
        ? Array.from(form.querySelectorAll('.document-member-picker input:checked')).map((input) => Number(input.value))
        : [],
    };
    if (!doc) {
      const file = form.querySelector('#document-file').files?.[0];
      if (!file) throw new Error(t('documents.fileRequired'));
      if (file.size > MAX_FILE_SIZE) throw new Error(t('documents.fileTooLarge'));
      payload.original_name = file.name;
      payload.content_data = await readFileAsDataUrl(file);
      if (!payload.name) payload.name = file.name.replace(/\.[^.]+$/, '');
    }
    if (!payload.name) throw new Error(t('common.required'));
    if (doc) await api.put(`/documents/${doc.id}`, payload);
    else await api.post('/documents', payload);
    window.oikos?.showToast(doc ? t('documents.savedToast') : t('documents.uploadedToast'), 'success');
    closeModal({ force: true });
    await loadDocuments();
    renderDocuments();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    submit.disabled = false;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(t('documents.fileReadError')));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
