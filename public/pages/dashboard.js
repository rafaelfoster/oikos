/**
 * Modul: Dashboard
 * Zweck: Startseite mit Begrüßung, Terminen, Aufgaben, Essen, Notizen und FAB
 * Abhängigkeiten: /api.js
 */

import { api } from '/api.js';
import { t, formatDate, formatTime, getLocale } from '/i18n.js';
import { esc, fmtLocation } from '/utils/html.js';
import { openModal, closeModal } from '/components/modal.js';

// Hält den AbortController des aktuellen FAB-Listeners - wird bei jedem render() erneuert.
let _fabController = null;

// --------------------------------------------------------
// Widget-Definitionen (Reihenfolge = Standard-Layout)
// --------------------------------------------------------

const WIDGET_IDS = ['tasks', 'calendar', 'birthdays', 'budget', 'family', 'weather', 'shopping', 'meals', 'notes'];

const DEFAULT_WIDGET_CONFIG = WIDGET_IDS.map((id) => ({ id, visible: true }));

function widgetLabel(id) {
  const map = {
    tasks:    () => t('nav.tasks'),
    calendar: () => t('nav.calendar'),
    shopping: () => t('nav.shopping'),
    meals:    () => t('nav.meals'),
    notes:    () => t('nav.notes'),
    weather:  () => t('dashboard.weather'),
    birthdays: () => t('nav.birthdays'),
    budget:   () => t('nav.budget'),
    family:   () => t('dashboard.familyMembers'),
  };
  return (map[id] ?? (() => id))();
}

function widgetIcon(id) {
  const map = { tasks: 'check-square', calendar: 'calendar', birthdays: 'cake', budget: 'wallet', family: 'users', shopping: 'shopping-cart', meals: 'utensils', notes: 'pin', weather: 'cloud-sun' };
  return map[id] ?? 'layout-dashboard';
}

const BUDGET_CATEGORY_LABEL_KEYS = {
  housing: 'catHousing',
  food: 'catFood',
  transport: 'catTransport',
  personal_health: 'catPersonalHealth',
  leisure: 'catLeisure',
  shopping_clothing: 'catShoppingClothing',
  education: 'catEducation',
  financial_other: 'catFinancialOther',
  'Erwerbseinkommen': 'catEarnedIncome',
  'Kapitalerträge': 'catInvestmentIncome',
  'Geschenke & Transfers': 'catTransferGiftIncome',
  'Sozialleistungen': 'catGovernmentBenefits',
  'Sonstiges Einkommen': 'catOtherIncome',
};

// --------------------------------------------------------
// Hilfsfunktionen
// --------------------------------------------------------

function greeting(displayName) {
  const h = new Date().getHours();
  if (h < 12) return t('dashboard.greetingMorning', { name: esc(displayName) });
  if (h < 18) return t('dashboard.greetingDay',     { name: esc(displayName) });
  return t('dashboard.greetingEvening', { name: esc(displayName) });
}

function formatDateTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const dateStr = d.toDateString() === today.toDateString()
    ? t('common.today')
    : d.toDateString() === tomorrow.toDateString()
    ? t('common.tomorrow')
    : formatDate(d);

  const timeStr = formatTime(d);
  const suffix = t('calendar.timeSuffix');
  return `${dateStr}, ${timeStr}${suffix ? ' ' + suffix : ''}`.trim();
}

function formatDueDate(dateStr, timeStr) {
  if (!dateStr) return null;

  const dueDate = timeStr
    ? new Date(`${dateStr}T${timeStr}`)
    : new Date(`${dateStr}T23:59:59`);

  if (isNaN(dueDate)) return null;

  const now = new Date();
  const diffMs = dueDate - now;
  const diffH = diffMs / (1000 * 60 * 60);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const calDayDiff = Math.round((dueDay - today) / (1000 * 60 * 60 * 24));

  const fullLabel = timeStr
    ? `${formatDate(dueDate)}, ${formatTime(dueDate)}` // beide aus i18n.js
    : formatDate(dueDate);

  if (diffMs < 0) {
    return { text: `${t('dashboard.overdue')} – ${fullLabel}`, overdue: true };
  }

  if (calDayDiff === 1 && dueDate.getHours() >= 22 && diffH < 24) {
    return { text: `${t('dashboard.dueSoon')} – ${fullLabel}`, overdue: false, soon: true };
  }

  if (calDayDiff === 0) {
    return { text: timeStr ? `${t('dashboard.dueToday')} – ${formatTime(dueDate)}` : t('dashboard.dueToday'), overdue: false, soon: true };
  }

  if (calDayDiff === 1) {
    return { text: `${t('dashboard.dueTomorrow')} – ${formatTime(dueDate)}`, overdue: false };
  }

  return { text: fullLabel, overdue: false };
}

const PRIORITY_LABELS = () => ({
  urgent: t('tasks.priorityUrgent'),
  high:   t('tasks.priorityHigh'),
  medium: t('tasks.priorityMedium'),
  low:    t('tasks.priorityLow'),
});

const MEAL_LABELS = () => ({
  breakfast: t('meals.typeBreakfast'),
  lunch:     t('meals.typeLunch'),
  dinner:    t('meals.typeDinner'),
  snack:     t('meals.typeSnack'),
});

const MEAL_ICONS = {
  breakfast: 'sunrise',
  lunch:     'sun',
  dinner:    'moon',
  snack:     'apple',
};

function initials(name = '') {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function budgetCategoryLabel(category) {
  const key = BUDGET_CATEGORY_LABEL_KEYS[category];
  return key ? t(`budget.${key}`) : (category || '-');
}

function formatCurrency(amount, currency = 'EUR') {
  return new Intl.NumberFormat(getLocale(), {
    style: 'currency',
    currency,
    maximumFractionDigits: Math.abs(amount) >= 1000 ? 0 : 2,
  }).format(amount || 0);
}

function widgetHeader(icon, title, count, linkHref, linkLabel) {
  linkLabel = linkLabel ?? t('dashboard.allLink');
  const badge = count != null
    ? `<span class="widget__badge">${count}</span>`
    : '';
  return `
    <div class="widget__header">
      <span class="widget__title">
        <i data-lucide="${icon}" class="widget__title-icon" aria-hidden="true"></i>
        ${title}
        ${badge}
      </span>
      <button type="button" data-route="${linkHref}" class="widget__link">
        ${linkLabel}
      </button>
    </div>
  `;
}

// --------------------------------------------------------
// Skeleton
// --------------------------------------------------------

function skeletonWidget(lines = 3) {
  const lineHtml = Array.from({ length: lines }, (_, i) => `
    <div class="skeleton skeleton-line ${i % 2 === 0 ? 'skeleton-line--full' : 'skeleton-line--medium'}"></div>
  `).join('');
  return `
    <div class="widget-skeleton">
      <div class="skeleton skeleton-line skeleton-line--short"></div>
      ${lineHtml}
    </div>
  `;
}

// --------------------------------------------------------
// Widget-Renderer
// --------------------------------------------------------

function renderUrgentTasks(tasks) {
  if (!tasks.length) {
    return `<div class="widget widget--tasks">
      ${widgetHeader('check-square', t('nav.tasks'), 0, '/tasks')}
      <div class="widget__empty">
        <i data-lucide="check-circle" class="empty-state__icon" style="color:var(--color-success)" aria-hidden="true"></i>
        <div>${t('dashboard.allDone')}</div>
      </div>
    </div>`;
  }

  const items = tasks.map((t) => {
    const due = formatDueDate(t.due_date, t.due_time);
    return `
      <div class="task-item" data-task-id="${t.id}" data-task-title="${esc(t.title)}" role="button" tabindex="0">
        ${t.priority !== 'none' ? `<div class="task-item__priority task-item__priority--${t.priority}" aria-hidden="true"></div>` : ''}
        <span class="sr-only">${PRIORITY_LABELS()[t.priority] ?? t.priority}</span>
        <div class="task-item__content">
          <div class="task-item__title">${esc(t.title)}</div>
          ${due ? `<div class="task-item__meta ${due.overdue ? 'task-item__meta--overdue' : ''} ${due.soon ? 'task-item__meta--soon' : ''}">${due.text}</div>` : ''}
        </div>
        ${t.assigned_color ? `
          <div class="task-item__avatar" style="background-color:${esc(t.assigned_color)}"
               title="${esc(t.assigned_name)}">${esc(initials(t.assigned_name || ''))}</div>` : ''}
      </div>
    `;
  }).join('');

  return `<div class="widget widget--tasks">
    ${widgetHeader('check-square', t('nav.tasks'), tasks.length, '/tasks')}
    <div class="widget__body">${items}</div>
  </div>`;
}

function renderUpcomingEvents(events) {
  if (!events.length) {
    return `<div class="widget widget--calendar">
      ${widgetHeader('calendar', t('nav.calendar'), 0, '/calendar')}
      <div class="widget__empty">
        <i data-lucide="calendar-check" class="empty-state__icon" aria-hidden="true"></i>
        <div>${t('dashboard.noEvents')}</div>
      </div>
    </div>`;
  }

  const today = new Date().toDateString();
  const items = events.map((e) => {
    const d = new Date(e.start_datetime);
    const isToday = d.toDateString() === today;
    const _suffix = t('calendar.timeSuffix');
    const timeStr = e.all_day ? t('dashboard.allDay') : `${formatTime(d)}${_suffix ? ' ' + _suffix : ''}`.trim();
    return `
      <div class="event-item" data-route="/calendar" role="button" tabindex="0">
        <div class="event-item__bar" style="background-color:${esc(e.cal_color || e.color) || 'var(--color-accent)'}"></div>
        <div class="event-item__content">
          <div class="event-item__title">${esc(e.title)}</div>
          <div class="event-item__time">
            <span class="event-time-badge ${isToday ? 'event-time-badge--today' : ''}">${isToday ? t('common.today') : formatDateTime(e.start_datetime).split(',')[0]}</span>
            ${timeStr}
            ${e.location ? ` · ${esc(fmtLocation(e.location))}` : ''}
            ${e.cal_name ? `<span class="event-item__cal">${esc(e.cal_name)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<div class="widget widget--calendar">
    ${widgetHeader('calendar', t('nav.calendar'), events.length, '/calendar')}
    <div class="widget__body">${items}</div>
  </div>`;
}

function renderUpcomingBirthdays(birthdays) {
  if (!birthdays.length) {
    return `<div class="widget widget--birthdays">
      ${widgetHeader('cake', t('nav.birthdays'), 0, '/birthdays')}
      <div class="widget__empty">
        <i data-lucide="cake" class="empty-state__icon" aria-hidden="true"></i>
        <div>${t('dashboard.noBirthdays')}</div>
      </div>
    </div>`;
  }

  const items = birthdays.map((b) => {
    const daysLabel = b.days_until === 0
      ? t('common.today')
      : b.days_until === 1
        ? t('common.tomorrow')
        : t('dashboard.daysLeft', { count: b.days_until });
    return `
      <div class="birthday-widget-item" data-route="/birthdays" role="button" tabindex="0">
        <div class="birthday-widget-item__avatar">
          ${b.photo_data ? `<img src="${esc(b.photo_data)}" alt="" loading="lazy">` : `<span>${esc(initials(b.name))}</span>`}
        </div>
        <div class="birthday-widget-item__body">
          <div class="birthday-widget-item__name">${esc(b.name)}</div>
          <div class="birthday-widget-item__meta">${formatDate(b.next_birthday)} · ${daysLabel}</div>
        </div>
        <div class="birthday-widget-item__age">${esc(String(b.next_age ?? ''))}</div>
      </div>
    `;
  }).join('');

  return `<div class="widget widget--birthdays">
    ${widgetHeader('cake', t('nav.birthdays'), birthdays.length, '/birthdays')}
    <div class="widget__body">${items}</div>
  </div>`;
}

function renderTodayMeals(meals) {
  const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

  const mealLabels = MEAL_LABELS();
  const slots = MEAL_ORDER.map((type) => {
    const meal = meals.find((m) => m.meal_type === type);
    return `
      <div class="meal-slot ${meal ? 'meal-slot--filled' : ''}" data-type="${type}" data-route="/meals" role="button" tabindex="0">
        <i data-lucide="${MEAL_ICONS[type]}" class="meal-slot__icon" aria-hidden="true"></i>
        <div class="meal-slot__type">${mealLabels[type]}</div>
        <div class="meal-slot__title">${meal ? esc(meal.title) : '-'}</div>
      </div>
    `;
  }).join('');

  return `<div class="widget widget--meals">
    ${widgetHeader('utensils', t('dashboard.todayMeals'), null, '/meals', t('dashboard.weekLink'))}
    <div class="meal-slots">${slots}</div>
  </div>`;
}

function renderPinnedNotes(notes) {
  if (!notes.length) {
    return `<div class="widget widget--notes">
      ${widgetHeader('pin', t('nav.notes'), 0, '/notes')}
      <div class="widget__empty">
        <i data-lucide="sticky-note" class="empty-state__icon" aria-hidden="true"></i>
        <div>${t('dashboard.noPinnedNotes')}</div>
      </div>
    </div>`;
  }

  const items = notes.map((n) => `
    <div class="note-item" data-route="/notes" role="button" tabindex="0"
         style="--note-color:${esc(n.color)};">
      ${n.title ? `<div class="note-item__title">${esc(n.title)}</div>` : ''}
      <div class="note-item__content">${esc(n.content)}</div>
    </div>
  `).join('');

  return `<div class="widget widget--notes widget--wide">
    ${widgetHeader('pin', t('nav.notes'), notes.length, '/notes')}
    <div class="notes-grid-widget">${items}</div>
  </div>`;
}

function renderFamilyWidget(users) {
  const visible = users.slice(0, 6);
  const avatars = visible.map((u) => `
    <span class="family-widget-avatar" style="background:${esc(u.avatar_color || '#64748b')}" title="${esc(u.display_name)}">
      ${esc(initials(u.display_name))}
    </span>
  `).join('');

  return `<div class="widget widget--family">
    ${widgetHeader('users', t('dashboard.familyMembers'), users.length, '/settings')}
    <div class="family-widget">
      <div class="family-widget__count">${users.length}</div>
      <div class="family-widget__meta">${t('dashboard.participantsAdded')}</div>
      <div class="family-widget__avatars">${avatars}</div>
    </div>
  </div>`;
}

function renderBudgetWidget(budget, currency) {
  const income = budget?.income || 0;
  const expenses = budget?.expenses || 0;
  const balance = budget?.balance || 0;
  const savingsRate = income > 0 ? Math.round((balance / income) * 100) : 0;
  const balanceTone = balance >= 0 ? 'positive' : 'negative';
  const hasData = (budget?.entryCount || 0) > 0;

  return `<div class="widget widget--budget">
    ${widgetHeader('wallet', t('dashboard.budgetOverview'), null, '/budget')}
    <div class="budget-widget">
      <div class="budget-widget__headline">
        <span>${t('dashboard.monthlyBalance')}</span>
        <strong class="budget-widget__balance budget-widget__balance--${balanceTone}">${formatCurrency(balance, currency)}</strong>
      </div>
      <div class="budget-widget__grid">
        <div class="budget-widget-metric budget-widget-metric--income">
          <span>${t('dashboard.monthlyIncome')}</span>
          <strong>${formatCurrency(income, currency)}</strong>
        </div>
        <div class="budget-widget-metric budget-widget-metric--expense">
          <span>${t('dashboard.monthlyExpenses')}</span>
          <strong>${formatCurrency(expenses, currency)}</strong>
        </div>
        <div class="budget-widget-metric">
          <span>${t('dashboard.savingsRate')}</span>
          <strong>${income > 0 ? `${savingsRate}%` : '-'}</strong>
        </div>
        <div class="budget-widget-metric">
          <span>${t('dashboard.budgetEntries')}</span>
          <strong>${budget?.entryCount || 0}</strong>
        </div>
      </div>
      <div class="budget-widget__footer">
        ${hasData && budget?.topExpenseCategory
          ? `${t('dashboard.topExpense')}: <strong>${esc(budgetCategoryLabel(budget.topExpenseCategory))}</strong> · ${formatCurrency(budget.topExpenseAmount, currency)}`
          : t('dashboard.noBudgetData')}
      </div>
    </div>
  </div>`;
}

function renderQuickAction({ route, label, icon, tone = '' }) {
  return `
    <button type="button" class="dashboard-action ${tone ? `dashboard-action--${tone}` : ''}" data-route="${route}">
      <span class="dashboard-action__icon"><i data-lucide="${icon}" aria-hidden="true"></i></span>
      <span class="dashboard-action__label">${label}</span>
    </button>
  `;
}

function renderKpiTile({ title, value, meta, icon, route, tone = '' }) {
  return `
    <button type="button" class="dashboard-kpi ${tone ? `dashboard-kpi--${tone}` : ''}" data-route="${route}">
      <span class="dashboard-kpi__icon"><i data-lucide="${icon}" aria-hidden="true"></i></span>
      <span class="dashboard-kpi__body">
        <span class="dashboard-kpi__label">${title}</span>
        <span class="dashboard-kpi__value">${value}</span>
        <span class="dashboard-kpi__meta">${meta}</span>
      </span>
    </button>
  `;
}

function renderDashboardOverview(user, stats = null, weather = null) {
  const dateLabel = formatDate(new Date());
  const weatherLabel = weather
    ? `${esc(weather.city)} · ${esc(weather.current?.temp)}${weather.units === 'imperial' ? '°F' : weather.units === 'standard' ? 'K' : '°C'}`
    : t('dashboard.weather');

  const actions = [
    { route: '/tasks', label: t('nav.tasks'), icon: 'check-square', tone: 'blue' },
    { route: '/calendar', label: t('nav.calendar'), icon: 'calendar', tone: 'violet' },
    { route: '/shopping', label: t('nav.shopping'), icon: 'shopping-cart', tone: 'green' },
    { route: '/notes', label: t('nav.notes'), icon: 'sticky-note', tone: 'amber' },
  ].map(renderQuickAction).join('');

  const kpis = stats ? [
    renderKpiTile({
      title: t('tasks.title'),
      value: String(stats.overdueCount ?? 0),
      meta: t('dashboard.overdue'),
      icon: 'alert-circle',
      route: '/tasks',
      tone: 'danger',
    }),
    renderKpiTile({
      title: t('nav.calendar'),
      value: String(stats.todayEventCount ?? 0),
      meta: t('common.today'),
      icon: 'calendar-days',
      route: '/calendar',
      tone: 'calendar',
    }),
    renderKpiTile({
      title: t('nav.meals'),
      value: stats.todayMealTitle ? esc(stats.todayMealTitle) : '-',
      meta: t('dashboard.todayMeals'),
      icon: 'utensils',
      route: '/meals',
      tone: 'meals',
    }),
    renderKpiTile({
      title: t('dashboard.weather'),
      value: weatherLabel,
      meta: t('dashboard.weatherRefreshTitle'),
      icon: 'cloud-sun',
      route: '/',
      tone: 'weather',
    }),
    renderKpiTile({
      title: t('nav.birthdays'),
      value: String(stats.birthdayCount ?? 0),
      meta: t('dashboard.upcomingBirthdays'),
      icon: 'cake',
      route: '/birthdays',
      tone: 'birthdays',
    }),
    renderKpiTile({
      title: t('dashboard.familyMembers'),
      value: String(stats.familyCount ?? 0),
      meta: t('dashboard.participantsAdded'),
      icon: 'users',
      route: '/settings',
      tone: 'family',
    }),
  ].join('') : `
    <div class="dashboard-kpi dashboard-kpi--skeleton"></div>
    <div class="dashboard-kpi dashboard-kpi--skeleton"></div>
    <div class="dashboard-kpi dashboard-kpi--skeleton"></div>
    <div class="dashboard-kpi dashboard-kpi--skeleton"></div>
    <div class="dashboard-kpi dashboard-kpi--skeleton"></div>
    <div class="dashboard-kpi dashboard-kpi--skeleton"></div>
  `;

  return `
    <section class="dashboard-overview">
      <div class="dashboard-overview__header">
        <div class="dashboard-overview__heading">
          <span class="dashboard-overview__date">${dateLabel}</span>
          <h1 class="dashboard-overview__title">${greeting(user.display_name)}</h1>
        </div>
        <div class="dashboard-overview__tools">
          <div class="dashboard-overview__actions">${actions}</div>
          <button class="dashboard-icon-btn" id="dashboard-customize-btn"
                  aria-label="${t('dashboard.customize')}" title="${t('dashboard.customize')}">
            <i data-lucide="settings-2" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div class="dashboard-kpi-grid">
        ${kpis}
      </div>
    </section>
  `;
}

function widgetRegion(id) {
  return ['budget', 'family', 'weather', 'shopping', 'meals'].includes(id) ? 'side' : 'main';
}

function widgetTileClass(id) {
  const map = {
    tasks: 'dashboard-tile--wide',
    calendar: 'dashboard-tile--compact',
    birthdays: 'dashboard-tile--compact',
    budget: 'dashboard-tile--wide',
    family: 'dashboard-tile--compact',
    meals: 'dashboard-tile--compact',
    notes: 'dashboard-tile--wide',
    shopping: 'dashboard-tile--compact',
    weather: 'dashboard-tile--wide',
  };
  return map[id] || 'dashboard-tile--compact';
}

function renderDashboardTile(id, html) {
  if (!html) return '';
  return `<section class="dashboard-tile dashboard-tile--${id} ${widgetTileClass(id)}">${html}</section>`;
}

function renderDashboardLayout(cfg, data, weather, currency) {
  const widgetById = {
    tasks: () => renderUrgentTasks(data.urgentTasks ?? []),
    calendar: () => renderUpcomingEvents(data.upcomingEvents ?? []),
    birthdays: () => renderUpcomingBirthdays(data.birthdays ?? []),
    budget: () => renderBudgetWidget(data.budget ?? {}, currency),
    family: () => renderFamilyWidget(data.users ?? []),
    meals: () => renderTodayMeals(data.todayMeals ?? []),
    notes: () => renderPinnedNotes(data.pinnedNotes ?? []),
    shopping: () => renderShoppingLists(data.shoppingLists ?? []),
    weather: () => (weather ? renderWeatherWidget(weather) : ''),
  };

  const visible = cfg.filter((w) => w.visible && widgetById[w.id]);
  const mainTiles = visible
    .filter((w) => widgetRegion(w.id) === 'main')
    .map((w) => renderDashboardTile(w.id, widgetById[w.id]()))
    .join('');

  const sideTiles = visible
    .filter((w) => widgetRegion(w.id) === 'side')
    .map((w) => renderDashboardTile(w.id, widgetById[w.id]()))
    .join('');

  return `
    <section class="dashboard-workspace">
      <div class="dashboard-workspace__main">
        <div class="dashboard-widget-grid">
          ${mainTiles}
        </div>
      </div>
      <aside class="dashboard-workspace__side">
        <div class="dashboard-side-stack">
          ${sideTiles}
        </div>
      </aside>
    </section>
  `;
}

function renderDashboardSkeleton() {
  return `
    <section class="dashboard-overview">
      <div class="dashboard-overview__header">
        <div class="dashboard-overview__heading">
          <div class="skeleton skeleton-line skeleton-line--short"></div>
          <div class="skeleton skeleton-line skeleton-line--medium"></div>
        </div>
      </div>
      <div class="dashboard-kpi-grid">
        <div class="dashboard-kpi dashboard-kpi--skeleton"></div>
        <div class="dashboard-kpi dashboard-kpi--skeleton"></div>
        <div class="dashboard-kpi dashboard-kpi--skeleton"></div>
        <div class="dashboard-kpi dashboard-kpi--skeleton"></div>
        <div class="dashboard-kpi dashboard-kpi--skeleton"></div>
        <div class="dashboard-kpi dashboard-kpi--skeleton"></div>
      </div>
    </section>
    <section class="dashboard-workspace">
      <div class="dashboard-workspace__main">
        <div class="dashboard-widget-grid">
          ${skeletonWidget(3)}
          ${skeletonWidget(3)}
          ${skeletonWidget(2)}
          ${skeletonWidget(3)}
        </div>
      </div>
      <aside class="dashboard-workspace__side">
        <div class="dashboard-side-stack">
          ${skeletonWidget(3)}
          ${skeletonWidget(3)}
          ${skeletonWidget(2)}
        </div>
      </aside>
    </section>
  `;
}

// --------------------------------------------------------
// Shopping-Widget
// --------------------------------------------------------

function renderShoppingLists(lists) {
  if (!lists.length) return '';

  const totalOpen = lists.reduce((sum, l) => sum + l.open_count, 0);

  const listsHtml = lists.map((list) => {
    const progress = list.total_count > 0
      ? Math.round(((list.total_count - list.open_count) / list.total_count) * 100)
      : 0;

    const itemsHtml = list.items.map((item) => `
      <div class="shopping-widget-item">
        <span class="shopping-widget-item__dot"></span>
        <span class="shopping-widget-item__name">${esc(item.name)}</span>
        ${item.quantity ? `<span class="shopping-widget-item__qty">${esc(item.quantity)}</span>` : ''}
      </div>
    `).join('');

    const moreCount = list.open_count - list.items.length;

    return `
      <div class="shopping-widget-list" data-route="/shopping" role="button" tabindex="0">
        <div class="shopping-widget-list__header">
          <span class="shopping-widget-list__name">${esc(list.name)}</span>
          <span class="shopping-widget-list__count">${list.total_count - list.open_count}/${list.total_count}</span>
        </div>
        <div class="shopping-widget-list__progress">
          <div class="shopping-widget-list__bar" style="width:${progress}%"></div>
        </div>
        <div class="shopping-widget-list__items">
          ${itemsHtml}
          ${moreCount > 0 ? `<div class="shopping-widget-item shopping-widget-item--more">${t('dashboard.shoppingMore', { count: moreCount })}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `<div class="widget widget--shopping">
    ${widgetHeader('shopping-cart', t('nav.shopping'), totalOpen, '/shopping')}
    <div class="widget__body">${listsHtml}</div>
  </div>`;
}

// --------------------------------------------------------
// Wetter-Widget
// --------------------------------------------------------

const WEATHER_ICON_BASE = '/api/v1/weather/icon/';

function renderWeatherWidget(weather) {
  if (!weather) return '';

  const { city, current, forecast, units } = weather;
  const unitSymbol = units === 'imperial' ? '°F' : units === 'standard' ? 'K' : '°C';
  const windUnit   = units === 'imperial' ? 'mph' : 'km/h';

  const forecastHtml = forecast.map((d, i) => {
    const date = new Date(d.date + 'T12:00:00');
    const label = new Intl.DateTimeFormat(getLocale(), { weekday: 'short' }).format(date);
    const extraCls = i >= 3 ? ' weather-forecast__day--extended' : '';
    return `
      <div class="weather-forecast__day${extraCls}">
        <div class="weather-forecast__label">${label}</div>
        <img class="weather-forecast__icon" src="${WEATHER_ICON_BASE}${d.icon}"
             alt="${esc(d.desc)}" width="32" height="32" loading="lazy">
        <div class="weather-forecast__temps">
          <span class="weather-forecast__high">${d.temp_max}°</span>
          <span class="weather-forecast__low">${d.temp_min}°</span>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="widget widget--weather weather-widget" id="weather-widget">
      <button class="weather-widget__refresh" id="weather-refresh-btn" aria-label="${t('dashboard.weatherRefresh')}" title="${t('dashboard.weatherRefreshTitle')}">
        <i data-lucide="refresh-cw" class="icon-md" aria-hidden="true"></i>
      </button>
      <div class="weather-widget__inner">
        <div class="weather-widget__main">
          <div class="weather-widget__left">
            <div class="weather-widget__temp">${esc(current.temp)}${unitSymbol}</div>
            <div class="weather-widget__desc">${esc(current.desc)}</div>
            <div class="weather-widget__city">${esc(city)}</div>
            <div class="weather-widget__meta">
              ${t('dashboard.weatherFeelsLike', { temp: current.feels_like, humidity: current.humidity, wind: current.wind_speed, windUnit })}
            </div>
          </div>
          <img class="weather-widget__icon" src="${WEATHER_ICON_BASE}${current.icon}"
               alt="${esc(current.desc)}" width="80" height="80" loading="lazy">
        </div>
        ${forecast.length ? `<div class="weather-forecast">${forecastHtml}</div>` : ''}
      </div>
    </div>`;
}

// --------------------------------------------------------
// FAB Speed-Dial
// --------------------------------------------------------

const FAB_ACTIONS = () => [
  { route: '/tasks',    label: t('dashboard.fabTask'),     icon: 'check-square'   },
  { route: '/calendar', label: t('dashboard.fabCalendar'), icon: 'calendar-plus'  },
  { route: '/shopping', label: t('dashboard.fabShopping'), icon: 'shopping-cart'  },
  { route: '/notes',    label: t('dashboard.fabNote'),     icon: 'sticky-note'    },
];

function renderFab() {
  const actionsHtml = FAB_ACTIONS().map((a) => `
    <div class="fab-action" data-route="${a.route}" role="button" tabindex="-1"
         aria-label="${a.label}">
      <span class="fab-action__label">${a.label}</span>
      <button class="fab-action__btn" tabindex="-1" aria-hidden="true">
        <i data-lucide="${a.icon}" aria-hidden="true"></i>
      </button>
    </div>
  `).join('');

  return `
    <div class="fab-backdrop" id="fab-backdrop"></div>
    <div class="fab-container" id="fab-container">
      <button class="fab-main" id="fab-main" aria-label="${t('nav.quickActions')}" aria-expanded="false">
        <i data-lucide="plus" aria-hidden="true"></i>
      </button>
      <div class="fab-actions" id="fab-actions" aria-hidden="true">
        ${actionsHtml}
      </div>
    </div>
  `;
}

function initFab(container, signal) {
  const fabMain     = container.querySelector('#fab-main');
  const fabActions  = container.querySelector('#fab-actions');
  const fabBackdrop = container.querySelector('#fab-backdrop');
  if (!fabMain) return;

  // "Neu"-Button-Selector auf der jeweiligen Zielseite
  const FAB_NEW_BTN = {
    '/tasks':    '#btn-new-task',
    '/calendar': '#fab-new-event',
    '/shopping': '#fab-new-item',
    '/notes':    '#fab-new-note',
  };

  let open = false;

  function toggleFab(force) {
    open = force !== undefined ? force : !open;
    fabMain.classList.toggle('fab-main--open', open);
    fabMain.setAttribute('aria-expanded', String(open));
    fabActions.classList.toggle('fab-actions--visible', open);
    fabActions.setAttribute('aria-hidden', String(!open));
    fabBackdrop?.classList.toggle('fab-backdrop--visible', open);
    fabActions.querySelectorAll('[role="button"]').forEach((el) => {
      el.tabIndex = open ? 0 : -1;
    });
    if (window.lucide) window.lucide.createIcons();
  }

  fabMain.addEventListener('click', (e) => { e.stopPropagation(); toggleFab(); });

  fabActions.querySelectorAll('[data-route]').forEach((el) => {
    const go = async () => {
      toggleFab(false);
      await window.oikos.navigate(el.dataset.route);
      const btnSelector = FAB_NEW_BTN[el.dataset.route];
      if (btnSelector) document.querySelector(btnSelector)?.click();
    };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });

  document.addEventListener('click', () => { if (open) toggleFab(false); }, { signal });
}

// --------------------------------------------------------
// Customize-Modal
// --------------------------------------------------------

function openCustomizeModal(currentConfig, onSave) {
  let draft = currentConfig.map((w) => ({ ...w }));

  function buildRows() {
    return draft.map((w, i) => {
      const isFirst = i === 0;
      const isLast  = i === draft.length - 1;
      return `
        <div class="customize-row" data-id="${esc(w.id)}" style="view-transition-name: widget-row-${esc(w.id)}">
          <label class="customize-row__toggle">
            <input type="checkbox" class="customize-row__check" data-id="${w.id}"
                   ${w.visible ? 'checked' : ''} aria-label="${widgetLabel(w.id)}">
            <span class="customize-row__slider" aria-hidden="true"></span>
          </label>
          <i data-lucide="${widgetIcon(w.id)}" class="customize-row__icon" aria-hidden="true"></i>
          <span class="customize-row__name">${widgetLabel(w.id)}</span>
          <div class="customize-row__actions">
            <button class="customize-row__btn" data-move="up" data-id="${w.id}"
                    ${isFirst ? 'disabled' : ''} aria-label="${t('dashboard.customizeMoveUp')}">
              <i data-lucide="chevron-up" class="icon-md" aria-hidden="true"></i>
            </button>
            <button class="customize-row__btn" data-move="down" data-id="${w.id}"
                    ${isLast ? 'disabled' : ''} aria-label="${t('dashboard.customizeMoveDown')}">
              <i data-lucide="chevron-down" class="icon-md" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  openModal({
    title:  t('dashboard.customizeTitle'),
    size:   'sm',
    content: `
      <div class="customize-list" id="customize-list">${buildRows()}</div>
      <div class="modal-actions" style="margin-top:var(--space-4)">
        <button type="button" class="btn btn--ghost" id="customize-reset">${t('dashboard.customizeReset')}</button>
        <button type="button" class="btn btn--primary" id="customize-save">${t('common.save')}</button>
      </div>`,
    onSave(panel) {
      if (window.lucide) window.lucide.createIcons({ el: panel });

      function rebuildList() {
        const list = panel.querySelector('#customize-list');
        if (!list) return;
        const doRebuild = () => {
          list.replaceChildren();
          list.insertAdjacentHTML('beforeend', buildRows());
          if (window.lucide) window.lucide.createIcons({ el: list });
          wireRows();
        };
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (document.startViewTransition && !reducedMotion) {
          document.startViewTransition(doRebuild);
        } else {
          doRebuild();
        }
      }

      function wireRows() {
        const list = panel.querySelector('#customize-list');
        if (!list) return;

        list.querySelectorAll('.customize-row__check').forEach((cb) => {
          cb.addEventListener('change', () => {
            const id = cb.dataset.id;
            const entry = draft.find((w) => w.id === id);
            if (entry) entry.visible = cb.checked;
          });
        });

        list.querySelectorAll('[data-move]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id  = btn.dataset.id;
            const dir = btn.dataset.move;
            const idx = draft.findIndex((w) => w.id === id);
            if (dir === 'up' && idx > 0) {
              [draft[idx - 1], draft[idx]] = [draft[idx], draft[idx - 1]];
            } else if (dir === 'down' && idx < draft.length - 1) {
              [draft[idx], draft[idx + 1]] = [draft[idx + 1], draft[idx]];
            }
            rebuildList();
          });
        });
      }

      wireRows();

      panel.querySelector('#customize-reset')?.addEventListener('click', () => {
        draft = DEFAULT_WIDGET_CONFIG.map((w) => ({ ...w }));
        rebuildList();
      });

      panel.querySelector('#customize-save')?.addEventListener('click', async () => {
        const saveBtn = panel.querySelector('#customize-save');
        saveBtn.disabled = true;
        try {
          await api.put('/preferences', { dashboard_widgets: draft });
          closeModal();
          onSave(draft);
          window.oikos?.showToast(t('dashboard.customizeSaved'), 'success', 1500);
        } catch {
          window.oikos?.showToast(t('common.errorGeneric'), 'error');
        } finally {
          saveBtn.disabled = false;
        }
      });
    },
  });
}

// --------------------------------------------------------
// Task Quick-Action Modal
// --------------------------------------------------------

function openTaskQuickAction(taskId, taskTitle, rerender) {
  openModal({
    title: taskTitle,
    size: 'sm',
    content: `
      <div class="modal-actions">
        <button type="button" class="btn btn--ghost" data-action="edit">
          <i data-lucide="edit-2" style="width:16px;height:16px;" aria-hidden="true"></i>
          ${t('common.edit')}
        </button>
        <button type="button" class="btn btn--primary" data-action="done">
          <i data-lucide="check-circle" style="width:16px;height:16px;" aria-hidden="true"></i>
          ${t('tasks.kanbanMoveToDone')}
        </button>
      </div>
    `,
    onSave: (panel) => {
      panel.querySelector('[data-action="done"]').addEventListener('click', async () => {
        try {
          await api.patch(`/tasks/${taskId}/status`, { status: 'done' });
          closeModal();
          window.oikos?.showToast(t('tasks.swipedDoneToast'), 'success');
          rerender();
        } catch (err) {
          window.oikos?.showToast(err.message, 'danger');
        }
      });
      panel.querySelector('[data-action="edit"]').addEventListener('click', () => {
        closeModal();
        window.oikos.navigate(`/tasks?open=${taskId}`);
      });
    },
  });
}

// --------------------------------------------------------
// Navigations-Links verdrahten
// --------------------------------------------------------

function wireLinks(container, rerender) {
  container.querySelectorAll('[data-route]').forEach((el) => {
    if (el.id === 'fab-main' || el.closest('#fab-actions')) return;
    const go = () => window.oikos.navigate(el.dataset.route);
    if (el.tagName === 'A') {
      el.addEventListener('click', (e) => { e.preventDefault(); go(); });
    } else {
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    }
  });

  // Task-Items öffnen Quick-Action-Modal statt direkt zu navigieren
  container.querySelectorAll('.task-item[data-task-id]').forEach((el) => {
    const show = () => openTaskQuickAction(el.dataset.taskId, el.dataset.taskTitle, rerender);
    el.addEventListener('click', show);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); }
    });
  });
}

// --------------------------------------------------------
// Haupt-Render
// --------------------------------------------------------

export async function render(container, { user }) {
  _fabController?.abort();
  _fabController = new AbortController();

  container.innerHTML = `
    <div class="dashboard">
      <h1 class="sr-only">${t('dashboard.title')}</h1>
      <div class="dashboard-shell" id="dashboard-shell">
        ${renderDashboardSkeleton()}
      </div>
    </div>
    ${renderFab()}
  `;

  let data         = { upcomingEvents: [], urgentTasks: [], todayMeals: [], pinnedNotes: [], shoppingLists: [], birthdays: [], users: [], budget: {} };
  let weather      = null;
  let widgetConfig = DEFAULT_WIDGET_CONFIG;
  let currency     = 'EUR';
  try {
    const [dashRes, weatherRes, prefsRes] = await Promise.all([
      api.get('/dashboard'),
      api.get('/weather').catch(() => ({ data: null })),
      api.get('/preferences').catch(() => ({ data: {} })),
    ]);
    data         = dashRes;
    weather      = weatherRes.data ?? null;
    widgetConfig = prefsRes.data?.dashboard_widgets ?? DEFAULT_WIDGET_CONFIG;
    currency     = prefsRes.data?.currency ?? 'EUR';
  } catch (err) {
    console.error('[Dashboard] Ladefehler:', err.message, 'Status:', err.status ?? 'network');
    window.oikos?.showToast(t('dashboard.loadError'), 'warning');
  }

  const today = new Date().toDateString();
  const stats = {
    overdueCount: (data.urgentTasks ?? []).filter((t) => {
      const due = formatDueDate(t.due_date, t.due_time);
      return due?.overdue === true;
    }).length,
    dueSoonCount: (data.urgentTasks ?? []).filter((t) => {
      const due = formatDueDate(t.due_date, t.due_time);
      return due?.soon === true;
    }).length,
    todayEventCount: (data.upcomingEvents ?? []).filter((e) =>
      new Date(e.start_datetime).toDateString() === today
    ).length,
    todayMealTitle: (data.todayMeals ?? []).find((m) => m.meal_type === 'lunch')?.title
      ?? (data.todayMeals ?? [])[0]?.title
      ?? null,
    birthdayCount: data.birthdayCount ?? (data.birthdays ?? []).length,
    familyCount: (data.users ?? []).length,
  };

  const rerender = () => render(container, { user });

  function rebuildDashboard(cfg) {
    const shell = container.querySelector('#dashboard-shell');
    if (!shell) return;
    shell.replaceChildren();
    shell.insertAdjacentHTML('beforeend', `
      ${renderDashboardOverview(user, stats, weather)}
      ${renderDashboardLayout(cfg, data, weather, currency)}
    `);
    wireLinks(container, rerender);
    if (window.lucide) window.lucide.createIcons();
    wireWeatherRefresh(container, (updatedWeather) => {
      weather = updatedWeather;
      rebuildDashboard(cfg);
    });
    container.querySelector('#dashboard-customize-btn')?.addEventListener('click', () => {
      openCustomizeModal(widgetConfig, (newConfig) => {
        widgetConfig = newConfig;
        rebuildDashboard(widgetConfig);
      });
    }, { signal: _fabController.signal });
  }

  rebuildDashboard(widgetConfig);

  initFab(container, _fabController.signal);

  // 30-Minuten Auto-Refresh für Wetter
  const refreshBtn = container.querySelector('#weather-refresh-btn');
  if (refreshBtn) {
    const doAutoRefresh = async () => {
      try {
        const res = await api.get('/weather').catch(() => ({ data: null }));
        weather = res.data ?? null;
        rebuildDashboard(widgetConfig);
      } catch { /* silently ignore */ }
    };
    const timerId = setInterval(doAutoRefresh, 30 * 60 * 1000);
    _fabController.signal.addEventListener('abort', () => clearInterval(timerId));
  }
}

function wireWeatherRefresh(container, onUpdated = null) {
  const refreshBtn = container.querySelector('#weather-refresh-btn');
  if (!refreshBtn) return;
  const doWeatherRefresh = async () => {
    refreshBtn.disabled = true;
    refreshBtn.classList.add('weather-widget__refresh--spinning');
    try {
      const res = await api.get('/weather').catch(() => ({ data: null }));
      const wWidget = container.querySelector('#weather-widget');
      if (wWidget) {
        wWidget.outerHTML = renderWeatherWidget(res.data ?? null);
        const newWidget = container.querySelector('#weather-widget');
        if (newWidget && window.lucide) window.lucide.createIcons({ el: newWidget });
        onUpdated?.(res.data ?? null);
        window.oikos?.showToast(t('dashboard.weatherUpdated'), 'success', 1500);
      }
    } catch { /* silently ignore */ }
  };
  refreshBtn.addEventListener('click', doWeatherRefresh, { signal: _fabController.signal });
}
