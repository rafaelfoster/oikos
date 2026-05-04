/**
 * Settings Navigation Utility
 * Zweck: Zweistufige Sidebar-Navigation für Settings
 * Pattern: Hauptkategorien (links) + Unterkategorien (Content-Bereich)
 */

import { t } from '/i18n.js';

export const SETTINGS_STORAGE_KEY = 'oikos-settings-section';

/**
 * Hauptkategorien mit ihren Unterkategorien
 */
export const SETTINGS_SECTIONS = (user) => [
  {
    id: 'personal',
    labelKey: 'settings.sectionPersonal',
    icon: 'user',
    pages: [
      { id: 'account', labelKey: 'settings.tabAccount', icon: 'user-circle' },
    ]
  },
  {
    id: 'modules',
    labelKey: 'settings.sectionModules',
    icon: 'layout-grid',
    pages: [
      { id: 'general', labelKey: 'settings.tabGeneral', icon: 'settings' },
      { id: 'meals', labelKey: 'settings.tabMeals', icon: 'utensils' },
      { id: 'budget', labelKey: 'settings.tabBudget', icon: 'wallet' },
      { id: 'shopping', labelKey: 'settings.tabShopping', icon: 'shopping-cart' },
    ]
  },
  {
    id: 'sync',
    labelKey: 'settings.sectionSync',
    icon: 'refresh-cw',
    pages: [
      { id: 'sync-calendar', labelKey: 'settings.tabSyncCalendar', icon: 'calendar' },
      { id: 'sync-contacts', labelKey: 'settings.tabSyncContacts', icon: 'users' },
    ]
  },
  ...(user?.role === 'admin' ? [{
    id: 'admin',
    labelKey: 'settings.sectionAdmin',
    icon: 'shield',
    pages: [
      { id: 'family', labelKey: 'settings.tabFamily', icon: 'users' },
      { id: 'api-tokens', labelKey: 'settings.tabApiTokens', icon: 'key' },
      { id: 'backup', labelKey: 'settings.tabBackup', icon: 'database' },
    ]
  }] : [])
];

/**
 * Findet Sektion und Seite für gegebene Page-ID
 */
export function findSectionAndPage(pageId, user) {
  const sections = SETTINGS_SECTIONS(user);
  for (const section of sections) {
    const page = section.pages.find(p => p.id === pageId);
    if (page) return { section, page };
  }
  return null;
}

/**
 * Gibt letzte aktive Seite zurück (aus sessionStorage)
 */
export function getLastActivePage(user) {
  try {
    const stored = sessionStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      const found = findSectionAndPage(stored, user);
      if (found) return stored;
    }
  } catch { /* ignore */ }
  return 'general';
}

/**
 * Speichert aktive Seite
 */
export function setActivePage(pageId) {
  try {
    sessionStorage.setItem(SETTINGS_STORAGE_KEY, pageId);
  } catch { /* ignore */ }
}

/**
 * Rendert die Sidebar-Navigation
 */
export function renderSettingsSidebar(container, activePage, user) {
  const sections = SETTINGS_SECTIONS(user);
  const activeInfo = findSectionAndPage(activePage, user);
  const activeSectionId = activeInfo?.section.id;

  const sidebar = document.createElement('nav');
  sidebar.className = 'settings-sidebar';
  sidebar.setAttribute('role', 'navigation');
  sidebar.setAttribute('aria-label', t('settings.navigationLabel'));

  sections.forEach(section => {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'settings-sidebar-section';
    if (section.id === activeSectionId) {
      sectionEl.classList.add('settings-sidebar-section--active');
    }

    // Section Header
    const header = document.createElement('div');
    header.className = 'settings-sidebar-section__header';

    const headerIcon = document.createElement('i');
    headerIcon.dataset.lucide = section.icon;
    headerIcon.className = 'settings-sidebar-section__icon';
    headerIcon.setAttribute('aria-hidden', 'true');

    const headerLabel = document.createElement('span');
    headerLabel.className = 'settings-sidebar-section__label';
    headerLabel.textContent = t(section.labelKey);

    header.appendChild(headerIcon);
    header.appendChild(headerLabel);
    sectionEl.appendChild(header);

    // Pages List
    const pagesList = document.createElement('div');
    pagesList.className = 'settings-sidebar-pages';

    section.pages.forEach(page => {
      const pageBtn = document.createElement('button');
      pageBtn.className = 'settings-sidebar-page';
      pageBtn.type = 'button';
      pageBtn.dataset.pageId = page.id;
      if (page.id === activePage) {
        pageBtn.classList.add('settings-sidebar-page--active');
        pageBtn.setAttribute('aria-current', 'page');
      }

      const pageIcon = document.createElement('i');
      pageIcon.dataset.lucide = page.icon;
      pageIcon.className = 'settings-sidebar-page__icon';
      pageIcon.setAttribute('aria-hidden', 'true');

      const pageLabel = document.createElement('span');
      pageLabel.className = 'settings-sidebar-page__label';
      pageLabel.textContent = t(page.labelKey);

      pageBtn.appendChild(pageIcon);
      pageBtn.appendChild(pageLabel);
      pagesList.appendChild(pageBtn);
    });

    sectionEl.appendChild(pagesList);
    sidebar.appendChild(sectionEl);
  });

  // Event Delegation
  sidebar.addEventListener('click', (e) => {
    const pageBtn = e.target.closest('[data-page-id]');
    if (!pageBtn) return;

    const pageId = pageBtn.dataset.pageId;
    if (pageId === activePage) return;

    setActivePage(pageId);

    // Trigger custom event für Page-Switch
    container.dispatchEvent(new CustomEvent('settings-page-change', {
      detail: { pageId },
      bubbles: true
    }));
  });

  container.appendChild(sidebar);

  // Hydrate Lucide Icons
  if (window.lucide) window.lucide.createIcons({ el: sidebar });
}

/**
 * Rendert Breadcrumb für aktive Seite
 */
export function renderBreadcrumb(container, activePage, user) {
  const info = findSectionAndPage(activePage, user);
  if (!info) return;

  const breadcrumb = document.createElement('nav');
  breadcrumb.className = 'settings-breadcrumb';
  breadcrumb.setAttribute('aria-label', t('settings.breadcrumbLabel'));

  const ol = document.createElement('ol');
  ol.className = 'settings-breadcrumb__list';

  // Home
  const homeItem = document.createElement('li');
  homeItem.className = 'settings-breadcrumb__item';
  homeItem.textContent = t('settings.title');
  ol.appendChild(homeItem);

  // Separator
  const sep1 = document.createElement('li');
  sep1.className = 'settings-breadcrumb__separator';
  sep1.setAttribute('aria-hidden', 'true');
  sep1.textContent = '›';
  ol.appendChild(sep1);

  // Section
  const sectionItem = document.createElement('li');
  sectionItem.className = 'settings-breadcrumb__item';
  sectionItem.textContent = t(info.section.labelKey);
  ol.appendChild(sectionItem);

  // Separator
  const sep2 = document.createElement('li');
  sep2.className = 'settings-breadcrumb__separator';
  sep2.setAttribute('aria-hidden', 'true');
  sep2.textContent = '›';
  ol.appendChild(sep2);

  // Page
  const pageItem = document.createElement('li');
  pageItem.className = 'settings-breadcrumb__item settings-breadcrumb__item--current';
  pageItem.setAttribute('aria-current', 'page');
  pageItem.textContent = t(info.page.labelKey);
  ol.appendChild(pageItem);

  breadcrumb.appendChild(ol);
  container.insertBefore(breadcrumb, container.firstChild);
}
