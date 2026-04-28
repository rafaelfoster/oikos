/**
 * Modul: Budget-Tracker (Budget)
 * Zweck: Monatsübersicht, Kategorie-Balkendiagramm (Canvas), Transaktionsliste,
 *        CRUD, CSV-Export
 * Abhängigkeiten: /api.js, /router.js (window.oikos)
 */

import { api } from '/api.js';
import { openModal as openSharedModal, closeModal } from '/components/modal.js';
import { stagger, vibrate } from '/utils/ux.js';
import { t, formatDate, getLocale, dateInputPlaceholder, formatDateInput, parseDateInput, isDateInputValid } from '/i18n.js';
import { esc } from '/utils/html.js';

// --------------------------------------------------------
// Konstanten
// --------------------------------------------------------

const CATEGORY_I18N = () => ({
  // Expense categories
  housing:            t('budget.catHousing'),
  food:               t('budget.catFood'),
  transport:          t('budget.catTransport'),
  personal_health:    t('budget.catPersonalHealth'),
  leisure:            t('budget.catLeisure'),
  shopping_clothing:  t('budget.catShoppingClothing'),
  education:          t('budget.catEducation'),
  financial_other:    t('budget.catFinancialOther'),
  // Income categories
  'Erwerbseinkommen':      t('budget.catEarnedIncome'),
  'Kapitalerträge':        t('budget.catInvestmentIncome'),
  'Geschenke & Transfers': t('budget.catTransferGiftIncome'),
  'Sozialleistungen':      t('budget.catGovernmentBenefits'),
  'Sonstiges Einkommen':   t('budget.catOtherIncome'),
});

const SUBCATEGORY_I18N = () => ({
  rent_mortgage:            t('budget.subcatRentMortgage'),
  condominium:              t('budget.subcatCondominium'),
  utilities:                t('budget.subcatUtilities'),
  internet_tv_phone:        t('budget.subcatInternetTvPhone'),
  renovation_maintenance:   t('budget.subcatRenovationMaintenance'),
  cleaning:                 t('budget.subcatCleaning'),
  groceries:                t('budget.subcatGroceries'),
  restaurants_bars:         t('budget.subcatRestaurantsBars'),
  snacks_fast_food:         t('budget.subcatSnacksFastFood'),
  bakery:                   t('budget.subcatBakery'),
  fuel:                     t('budget.subcatFuel'),
  parking_tolls:            t('budget.subcatParkingTolls'),
  public_transport:         t('budget.subcatPublicTransport'),
  apps_taxi:                t('budget.subcatAppsTaxi'),
  maintenance_insurance:    t('budget.subcatMaintenanceInsurance'),
  pharmacy:                 t('budget.subcatPharmacy'),
  health_insurance:         t('budget.subcatHealthInsurance'),
  gym_sports:               t('budget.subcatGymSports'),
  beauty_cosmetics:         t('budget.subcatBeautyCosmetics'),
  travel:                   t('budget.subcatTravel'),
  streaming:                t('budget.subcatStreaming'),
  events:                   t('budget.subcatEvents'),
  hobbies:                  t('budget.subcatHobbies'),
  clothes_shoes:            t('budget.subcatClothesShoes'),
  electronics:              t('budget.subcatElectronics'),
  gifts:                    t('budget.subcatGifts'),
  courses_college:          t('budget.subcatCoursesCollege'),
  school_supplies:          t('budget.subcatSchoolSupplies'),
  languages:                t('budget.subcatLanguages'),
  loans_interest:           t('budget.subcatLoansInterest'),
  bank_fees:                t('budget.subcatBankFees'),
  insurance_other:          t('budget.subcatInsuranceOther'),
  investments:              t('budget.subcatInvestments'),
  taxes:                    t('budget.subcatTaxes'),
});

function categoryLabel(category) {
  const item = typeof category === 'object'
    ? category
    : [...expenseCategories(), ...incomeCategories()].find((c) => c.key === category);
  const key = item?.key ?? category;
  const name = item?.name ?? category;
  return CATEGORY_I18N()[key] ?? name;
}

function subcategoryLabel(subcategory) {
  const item = typeof subcategory === 'object'
    ? subcategory
    : Object.values(state.meta.expenseSubcategories ?? {}).flat().find((s) => s.key === subcategory);
  const key = item?.key ?? subcategory;
  const name = item?.name ?? subcategory;
  return SUBCATEGORY_I18N()[key] ?? name;
}

function expenseCategories() {
  return state.meta.expenseCategories ?? [];
}

function incomeCategories() {
  return state.meta.incomeCategories ?? [];
}

function getSubcategories(category) {
  return state.meta.expenseSubcategories?.[category] || [];
}

function defaultSubcategory(category) {
  return getSubcategories(category)[0]?.key || '';
}

function defaultCategory(type) {
  const cats = type === 'income' ? incomeCategories() : expenseCategories();
  return cats[0]?.key || '';
}

function getMonthName(monthIndex) {
  // monthIndex: 0-based (0=Januar, 11=Dezember)
  const date = new Date(2000, monthIndex, 1);
  return new Intl.DateTimeFormat(getLocale(), { month: 'long' }).format(date);
}

// --------------------------------------------------------
// State
// --------------------------------------------------------

let state = {
  month:       '',   // YYYY-MM
  entries:     [],
  summary:     null,
  prevSummary: null, // Vormonat für Monatsvergleich
  currency:    'EUR',
  meta:        { expenseCategories: [], incomeCategories: [], expenseSubcategories: {} },
};
let _container = null;

// --------------------------------------------------------
// Formatierung
// --------------------------------------------------------

function formatAmount(n) {
  return new Intl.NumberFormat(getLocale(), { style: 'currency', currency: state.currency }).format(n);
}

function formatMonthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${getMonthName(parseInt(m, 10) - 1)} ${y}`;
}

function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// --------------------------------------------------------
// API
// --------------------------------------------------------

async function loadMonth(month) {
  const prevMonth = addMonths(month, -1);
  try {
    const [entriesRes, summaryRes, prevSummaryRes] = await Promise.all([
      api.get(`/budget?month=${month}`),
      api.get(`/budget/summary?month=${month}`),
      api.get(`/budget/summary?month=${prevMonth}`),
    ]);
    state.month       = month;
    state.entries     = entriesRes.data;
    state.summary     = summaryRes.data;
    state.prevSummary = prevSummaryRes.data;
  } catch (err) {
    console.error('[Budget] loadMonth Fehler:', err);
    state.month       = month;
    state.entries     = [];
    state.summary     = { income: 0, expenses: 0, balance: 0, byCategory: [] };
    state.prevSummary = null;
    window.oikos?.showToast(t('budget.loadError'), 'danger');
  }
}

async function loadBudgetMeta() {
  try {
    const res = await api.get('/budget/meta');
    state.meta = {
      expenseCategories: res.data?.expenseCategories ?? [],
      incomeCategories: res.data?.incomeCategories ?? [],
      expenseSubcategories: res.data?.expenseSubcategories ?? {},
    };
  } catch (err) {
    console.error('[Budget] meta Fehler:', err);
    state.meta = { expenseCategories: [], incomeCategories: [], expenseSubcategories: {} };
    window.oikos?.showToast(t('budget.metaLoadError'), 'danger');
  }
}

// --------------------------------------------------------
// Entry Point
// --------------------------------------------------------

export async function render(container, { user }) {
  _container = container;
  const today = new Date();
  state.month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  try {
    const [prefsRes] = await Promise.all([
      api.get('/preferences'),
      loadBudgetMeta(),
    ]);
    state.currency = prefsRes.data?.currency ?? 'EUR';
  } catch (_) { /* Fallback auf EUR */ }

  container.innerHTML = `
    <div class="budget-page">
      <h1 class="sr-only">${t('budget.title')}</h1>
      <div class="budget-nav">
        <button class="btn btn--icon" id="budget-prev" aria-label="${t('budget.prevMonth')}">
          <i data-lucide="chevron-left" aria-hidden="true"></i>
        </button>
        <button class="budget-nav__today" id="budget-today">${t('budget.currentMonth')}</button>
        <span class="budget-nav__label" id="budget-label"></span>
        <button class="btn btn--primary btn--icon" id="budget-add" aria-label="${t('budget.addEntryLabel')}">
          <i data-lucide="plus" aria-hidden="true"></i>
        </button>
        <button class="btn btn--icon" id="budget-next" aria-label="${t('budget.nextMonth')}">
          <i data-lucide="chevron-right" aria-hidden="true"></i>
        </button>
      </div>
      <div id="budget-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:2rem;text-align:center;color:var(--color-text-disabled);">${t('budget.loadingIndicator')}</div>
      </div>
      <button class="page-fab" id="fab-new-budget" aria-label="${t('budget.newEntryFabLabel')}">
        <i data-lucide="plus" style="width:24px;height:24px" aria-hidden="true"></i>
      </button>
    </div>
  `;

  if (window.lucide) lucide.createIcons();

  await loadMonth(state.month);
  renderBody();
  wireNav();
}

// --------------------------------------------------------
// Navigation
// --------------------------------------------------------

function wireNav() {
  _container.querySelector('#budget-prev').addEventListener('click', async () => {
    await loadMonth(addMonths(state.month, -1));
    renderBody();
    updateLabel();
  });
  _container.querySelector('#budget-next').addEventListener('click', async () => {
    await loadMonth(addMonths(state.month, 1));
    renderBody();
    updateLabel();
  });
  _container.querySelector('#budget-today').addEventListener('click', async () => {
    const today = new Date();
    const m = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    if (m === state.month) return;
    await loadMonth(m);
    renderBody();
    updateLabel();
  });
  const addHandler = () => openBudgetModal({ mode: 'create' });
  _container.querySelector('#budget-add').addEventListener('click', addHandler);
  _container.querySelector('#fab-new-budget').addEventListener('click', addHandler);
  updateLabel();
}

function updateLabel() {
  const lbl = _container.querySelector('#budget-label');
  if (lbl) lbl.textContent = formatMonthLabel(state.month);
}

// --------------------------------------------------------
// Body
// --------------------------------------------------------

function renderBody() {
  const body = _container.querySelector('#budget-body');
  if (!body) return;
  updateLabel();

  const s    = state.summary;
  const p    = state.prevSummary;
  const balanceClass = s.balance >= 0 ? 'budget-summary-card--balance-positive' : 'budget-summary-card--balance-negative';
  const prevLabel = p ? formatMonthLabel(p.month).split(' ')[0].slice(0, 3) : '';

  body.innerHTML = `
    <!-- Zusammenfassung -->
    <div class="budget-summary">
      <div class="budget-summary-card budget-summary-card--income">
        <div class="budget-summary-card__label">${t('budget.income')}</div>
        <div class="budget-summary-card__amount">${formatAmount(s.income)}</div>
        ${p ? renderTrend(s.income, p.income, prevLabel) : ''}
      </div>
      <div class="budget-summary-card budget-summary-card--expenses">
        <div class="budget-summary-card__label">${t('budget.expenses')}</div>
        <div class="budget-summary-card__amount">${formatAmount(Math.abs(s.expenses))}</div>
        ${p ? renderTrend(s.expenses, p.expenses, prevLabel) : ''}
      </div>
      <div class="budget-summary-card ${balanceClass}">
        <div class="budget-summary-card__label">${t('budget.balance')}</div>
        <div class="budget-summary-card__amount">${formatAmount(s.balance)}</div>
        ${p ? renderTrend(s.balance, p.balance, prevLabel) : ''}
      </div>
    </div>

    <!-- Kategorie-Balken -->
    ${s.byCategory.length ? `
    <div class="budget-chart-section">
      <div class="budget-chart-section__title">${t('budget.byCategory')}</div>
      <div class="budget-chart">
        ${renderCategoryBars(s.byCategory)}
      </div>
    </div>` : ''}

    <!-- Transaktionsliste -->
    <div class="budget-list-section">
      <div class="budget-list-header">
        <span class="budget-list-header__title">${t('budget.transactions')}</span>
        ${state.entries.length ? `
        <a href="/api/v1/budget/export?month=${state.month}" class="btn btn--secondary"
           style="font-size:var(--text-sm);padding:var(--space-1) var(--space-3);">
          <i data-lucide="download" style="width:14px;height:14px;margin-right:4px;" aria-hidden="true"></i>CSV
        </a>` : ''}
      </div>
      <div class="budget-list" id="budget-list">
        ${renderEntries()}
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
  stagger(_container.querySelector('#budget-list')?.querySelectorAll('.budget-entry') ?? []);

  _container.querySelector('#budget-list')?.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-action="delete"]');
    if (delBtn) { await deleteEntry(parseInt(delBtn.dataset.id, 10)); return; }

    const item = e.target.closest('.budget-entry[data-id]');
    if (item && !e.target.closest('[data-action]')) {
      const entry = state.entries.find((e) => e.id === parseInt(item.dataset.id, 10));
      if (entry) openBudgetModal({ mode: 'edit', entry });
    }
  });
}

function renderCategoryBars(byCategory) {
  const maxAbs = Math.max(...byCategory.map((c) => Math.abs(c.total)), 1);

  return byCategory.map((c) => {
    const isExpense = c.total < 0;
    const pct       = Math.round((Math.abs(c.total) / maxAbs) * 100);
    const cls       = isExpense ? 'budget-bar-row__fill--expenses' : 'budget-bar-row__fill--income';

    return `
      <div class="budget-bar-row">
        <div class="budget-bar-row__label" title="${esc(categoryLabel(c.category))}">${esc(categoryLabel(c.category))}</div>
        <div class="budget-bar-row__track">
          <div class="budget-bar-row__fill ${cls}" style="width:${pct}%;"></div>
        </div>
        <div class="budget-bar-row__amount" style="color:${isExpense ? 'var(--color-danger)' : 'var(--color-success)'};">
          ${formatAmount(c.total)}
        </div>
      </div>
    `;
  }).join('');
}

function renderEntries() {
  if (!state.entries.length) {
    return `<div class="empty-state">
      <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
      <div class="empty-state__title">${t('budget.emptyTitle')}</div>
      <div class="empty-state__description">${t('budget.emptyDescription')}</div>
      <p class="empty-state__hint">${t('emptyHint.budget')}</p>
    </div>`;
  }

  return state.entries.map((e) => {
    const isIncome  = e.amount > 0;
    const amtClass  = isIncome ? 'budget-entry__amount--income' : 'budget-entry__amount--expenses';
    const indClass  = isIncome ? 'budget-entry__indicator--income' : 'budget-entry__indicator--expenses';
    const sign      = isIncome ? '+' : '';
    const date      = formatEntryDate(e.date);
    const recurTag  = e.is_recurring ? ' 🔁' : (e.recurrence_parent_id ? ' ↩' : '');
    const categoryMeta = isIncome || !e.subcategory
      ? categoryLabel(e.category)
      : `${categoryLabel(e.category)} · ${subcategoryLabel(e.subcategory)}`;

    return `
      <div class="budget-entry" data-id="${e.id}">
        <div class="budget-entry__indicator ${indClass}"></div>
        <div class="budget-entry__body">
          <div class="budget-entry__title">${esc(e.title)}</div>
          <div class="budget-entry__meta">${date} · ${esc(categoryMeta)}${recurTag}</div>
        </div>
        <div class="budget-entry__amount ${amtClass}">${sign}${formatAmount(e.amount)}</div>
        <button class="budget-entry__delete" data-action="delete" data-id="${e.id}" aria-label="${t('budget.deleteLabel')}">
          <i data-lucide="trash-2" style="width:14px;height:14px;" aria-hidden="true"></i>
        </button>
      </div>
    `;
  }).join('');
}

/**
 * Rendert eine Trend-Zeile im Vergleich zum Vormonat.
 * Alle drei Metriken (income, expenses, balance) nutzen dieselbe Logik:
 *   delta > 0 → positiver Trend (▲ grün), delta < 0 → negativer Trend (▼ rot).
 * Ausgaben werden als negative Zahlen übergeben, daher gilt:
 *   weniger Ausgaben ↔ delta > 0 ↔ gut.
 * @param {number} current   Aktueller Wert
 * @param {number} prev      Vormonatswert
 * @param {string} prevLabel Kurzname des Vormonats (z.B. "Mär")
 */
function renderTrend(current, prev, prevLabel) {
  const delta = current - prev;
  if (Math.abs(delta) < 0.005) {
    return `<div class="budget-summary-card__trend budget-summary-card__trend--neutral">${t('budget.trendNeutral', { month: prevLabel })}</div>`;
  }
  const positive = delta > 0;
  const arrow    = positive ? '▲' : '▼';
  const sign     = positive ? '+' : '';
  const cls      = positive ? 'budget-summary-card__trend--positive' : 'budget-summary-card__trend--negative';
  return `<div class="budget-summary-card__trend ${cls}">${arrow} ${sign}${formatAmount(delta)} vs. ${prevLabel}</div>`;
}

function formatEntryDate(dateStr) {
  return formatDate(new Date(dateStr + 'T00:00:00'));
}

// --------------------------------------------------------
// Modal
// --------------------------------------------------------

function openBudgetModal({ mode, entry = null }) {
  const isEdit = mode === 'edit';
  const today  = new Date().toISOString().slice(0, 10);

  const isExpense  = isEdit ? entry.amount < 0 : true;
  const absAmount  = isEdit ? Math.abs(entry.amount).toFixed(2) : '';

  const initialCats = isExpense ? expenseCategories() : incomeCategories();
  const catOpts     = initialCats.map((c) =>
    `<option value="${esc(c.key)}" ${isEdit && entry.category === c.key ? 'selected' : ''}>${esc(categoryLabel(c))}</option>`
  ).join('');
  const initialCategory = isEdit ? entry.category : initialCats[0]?.key;
  const initialSubcategory = isEdit ? entry.subcategory : defaultSubcategory(initialCategory);
  const subcatOpts = getSubcategories(initialCategory).map((s) =>
    `<option value="${esc(s.key)}" ${initialSubcategory === s.key ? 'selected' : ''}>${esc(subcategoryLabel(s))}</option>`
  ).join('');

  const content = `
    <div class="amount-type-toggle">
      <button class="amount-type-btn amount-type-btn--expenses ${isExpense ? 'amount-type-btn--active' : ''}"
              id="type-expense" type="button">${t('budget.typeExpense')}</button>
      <button class="amount-type-btn amount-type-btn--income ${!isExpense ? 'amount-type-btn--active' : ''}"
              id="type-income" type="button">${t('budget.typeIncome')}</button>
    </div>

    <div class="form-group">
      <label class="form-label" for="bm-title">${t('budget.titleLabel')}</label>
      <input type="text" class="form-input" id="bm-title"
             placeholder="${t('budget.titlePlaceholder')}" value="${esc(isEdit ? entry.title : '')}">
    </div>

    <div class="form-group">
      <label class="form-label" for="bm-amount">${t('budget.amountLabel')}</label>
      <input type="number" class="form-input" id="bm-amount"
             placeholder="${t('budget.amountPlaceholder')}" step="0.01" min="0"
             inputmode="decimal" value="${absAmount}">
    </div>

    <div class="form-group">
      <div class="budget-field-header">
        <label class="form-label" for="bm-category">${t('budget.categoryLabel')}</label>
        <button class="btn btn--secondary budget-inline-add" type="button" id="bm-add-category">${t('budget.addCategory')}</button>
      </div>
      <select class="form-input" id="bm-category">${catOpts}</select>
    </div>

    <div class="form-group" id="bm-subcategory-group" ${isExpense ? '' : 'hidden'}>
      <div class="budget-field-header">
        <label class="form-label" for="bm-subcategory">${t('budget.subcategoryLabel')}</label>
        <button class="btn btn--secondary budget-inline-add" type="button" id="bm-add-subcategory">${t('budget.addSubcategory')}</button>
      </div>
      <select class="form-input" id="bm-subcategory">${subcatOpts}</select>
    </div>

    <div class="form-group">
      <label class="form-label" for="bm-date">${t('budget.dateLabel')}</label>
      <input type="text" class="form-input js-date-input" id="bm-date"
             value="${formatDateInput(isEdit ? entry.date : today)}" placeholder="${dateInputPlaceholder()}" inputmode="numeric">
    </div>

    <div class="form-group">
      <label class="toggle">
        <input type="checkbox" id="bm-recurring" ${isEdit && entry.is_recurring ? 'checked' : ''}>
        <span class="toggle__track"></span>
        <span>${t('budget.recurringLabel')}</span>
      </label>
    </div>

    <div class="modal-panel__footer" style="border:none;padding:0;margin-top:var(--space-4)">
      ${isEdit ? `<button class="btn btn--danger btn--icon" id="bm-delete" aria-label="${t('budget.deleteLabel')}">
        <i data-lucide="trash-2" style="width:16px;height:16px;" aria-hidden="true"></i>
      </button>` : '<div></div>'}
      <div style="display:flex;gap:var(--space-3)">
        <button class="btn btn--secondary" id="bm-cancel">${t('common.cancel')}</button>
        <button class="btn btn--primary" id="bm-save">${isEdit ? t('common.save') : t('common.add')}</button>
      </div>
    </div>`;

  openSharedModal({
    title: isEdit ? t('budget.editEntry') : t('budget.newEntry'),
    content,
    size: 'sm',
    onSave(panel) {
      let currentType = isExpense ? 'expense' : 'income';

      const updateCategoryOptions = (preferredCategory = '') => {
        const cats = currentType === 'income' ? incomeCategories() : expenseCategories();
        const catSelect = panel.querySelector('#bm-category');
        const currentValue = preferredCategory || catSelect.value;

        const options = cats.map((c) => {
          const opt = document.createElement('option');
          opt.value = c.key;
          opt.textContent = categoryLabel(c);
          opt.selected = currentValue === c.key;
          return opt;
        });
        catSelect.replaceChildren(...options);
        if (!cats.some((c) => c.key === catSelect.value)) catSelect.value = cats[0]?.key || '';
        updateSubcategoryOptions();
      };

      const updateSubcategoryOptions = (preferredSubcategory = '') => {
        const catSelect = panel.querySelector('#bm-category');
        const subcatGroup = panel.querySelector('#bm-subcategory-group');
        const subcatSelect = panel.querySelector('#bm-subcategory');
        const subcategories = currentType === 'expense' ? getSubcategories(catSelect.value) : [];
        const currentValue = preferredSubcategory || subcatSelect.value;

        subcatGroup.hidden = currentType !== 'expense';
        subcatSelect.replaceChildren(...subcategories.map((s) => {
          const opt = document.createElement('option');
          opt.value = s.key;
          opt.textContent = subcategoryLabel(s);
          opt.selected = currentValue === s.key;
          return opt;
        }));
        if (subcategories.length && !subcategories.some((s) => s.key === subcatSelect.value)) {
          subcatSelect.value = subcategories[0].key;
        }
      };

      const addCategory = async () => {
        const name = window.prompt(t('budget.newCategoryPrompt'));
        if (!name?.trim()) return;
        try {
          const res = await api.post('/budget/categories', { name: name.trim(), type: currentType });
          await loadBudgetMeta();
          updateCategoryOptions(res.data.key);
          window.oikos?.showToast(t('budget.categoryAddedToast'), 'success');
        } catch (err) {
          window.oikos?.showToast(err.data?.error ?? t('common.unknownError'), 'error');
        }
      };

      const addSubcategory = async () => {
        if (currentType !== 'expense') return;
        const category = panel.querySelector('#bm-category').value;
        if (!category) return;
        const name = window.prompt(t('budget.newSubcategoryPrompt'));
        if (!name?.trim()) return;
        try {
          const res = await api.post(`/budget/categories/${encodeURIComponent(category)}/subcategories`, { name: name.trim() });
          await loadBudgetMeta();
          updateSubcategoryOptions(res.data.key);
          window.oikos?.showToast(t('budget.subcategoryAddedToast'), 'success');
        } catch (err) {
          window.oikos?.showToast(err.data?.error ?? t('common.unknownError'), 'error');
        }
      };

      panel.querySelector('#type-expense').addEventListener('click', () => {
        currentType = 'expense';
        panel.querySelector('#type-expense').classList.add('amount-type-btn--active');
        panel.querySelector('#type-income').classList.remove('amount-type-btn--active');
        updateCategoryOptions();
      });
      panel.querySelector('#type-income').addEventListener('click', () => {
        currentType = 'income';
        panel.querySelector('#type-income').classList.add('amount-type-btn--active');
        panel.querySelector('#type-expense').classList.remove('amount-type-btn--active');
        updateCategoryOptions();
      });
      panel.querySelector('#bm-category').addEventListener('change', () => updateSubcategoryOptions());
      panel.querySelector('#bm-add-category').addEventListener('click', addCategory);
      panel.querySelector('#bm-add-subcategory').addEventListener('click', addSubcategory);
      panel.querySelectorAll('.js-date-input').forEach((input) => {
        input.addEventListener('blur', () => {
          const parsed = parseDateInput(input.value);
          if (parsed) input.value = formatDateInput(parsed);
        });
      });

      panel.querySelector('#bm-cancel').addEventListener('click', closeModal);

      panel.querySelector('#bm-delete')?.addEventListener('click', async () => {
        closeModal({ force: true });
        await deleteEntry(entry.id);
      });

      panel.querySelector('#bm-save').addEventListener('click', async () => {
        const saveBtn    = panel.querySelector('#bm-save');
        const title      = panel.querySelector('#bm-title').value.trim();
        const absVal     = parseFloat(panel.querySelector('#bm-amount').value);
        const category   = panel.querySelector('#bm-category').value;
        const subcategory = currentType === 'expense' ? panel.querySelector('#bm-subcategory').value : '';
        const dateRaw    = panel.querySelector('#bm-date').value;
        const date       = parseDateInput(dateRaw);
        const recurring  = panel.querySelector('#bm-recurring').checked ? 1 : 0;

        if (!title)           { window.oikos?.showToast(t('common.titleRequired'), 'error'); return; }
        if (isNaN(absVal) || absVal <= 0) { window.oikos?.showToast(t('budget.validAmountRequired'), 'error'); return; }
        if (!date || !isDateInputValid(dateRaw)) { window.oikos?.showToast(t('calendar.invalidDate'), 'error'); return; }

        const amount = currentType === 'expense' ? -absVal : absVal;

        saveBtn.disabled    = true;
        saveBtn.textContent = '…';

        try {
          const body = { title, amount, category, subcategory, date, is_recurring: recurring };
          if (mode === 'create') {
            const res = await api.post('/budget', body);
            state.entries.unshift(res.data);
          } else {
            const res = await api.put(`/budget/${entry.id}`, body);
            const idx = state.entries.findIndex((e) => e.id === entry.id);
            if (idx !== -1) state.entries[idx] = res.data;
          }
          const sumRes  = await api.get(`/budget/summary?month=${state.month}`);
          state.summary = sumRes.data;

          closeModal({ force: true });
          renderBody();
          window.oikos?.showToast(mode === 'create' ? t('budget.addedToast') : t('budget.savedToast'), 'success');
        } catch (err) {
          window.oikos?.showToast(err.data?.error ?? t('common.unknownError'), 'error');
          saveBtn.disabled    = false;
          saveBtn.textContent = isEdit ? t('common.save') : t('common.add');
        }
      });
    },
  });
}

// --------------------------------------------------------
// Eintrag löschen
// --------------------------------------------------------

async function deleteEntry(id) {
  const entry = state.entries.find((e) => e.id === id);
  state.entries = state.entries.filter((e) => e.id !== id);
  renderBody();
  vibrate([30, 50, 30]);

  let undone = false;
  window.oikos?.showToast(t('budget.deletedToast'), 'default', 5000, () => {
    undone = true;
    if (entry) {
      state.entries = [...state.entries, entry].sort((a, b) => new Date(b.date) - new Date(a.date));
      renderBody();
    }
  });

  setTimeout(async () => {
    if (undone) return;
    try {
      await api.delete(`/budget/${id}`);
      const sumRes  = await api.get(`/budget/summary?month=${state.month}`);
      state.summary = sumRes.data;
      renderBody();
    } catch (err) {
      if (entry) {
        state.entries = [...state.entries, entry].sort((a, b) => new Date(b.date) - new Date(a.date));
        renderBody();
      }
      window.oikos?.showToast(err.data?.error ?? t('common.unknownError'), 'danger');
    }
  }, 5000);
}

// --------------------------------------------------------
// Hilfsfunktion
// --------------------------------------------------------
