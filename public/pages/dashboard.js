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

const WIDGET_IDS = ['weather', 'tasks', 'calendar', 'shopping', 'meals', 'notes'];

const DEFAULT_WIDGET_CONFIG = WIDGET_IDS.map((id) => ({ id, visible: true }));

function widgetLabel(id) {
  const map = {
    tasks:    () => t('nav.tasks'),
    calendar: () => t('nav.calendar'),
    shopping: () => t('nav.shopping'),
    meals:    () => t('nav.meals'),
    notes:    () => t('nav.notes'),
    weather:  () => t('dashboard.weather'),
  };
  return (map[id] ?? (() => id))();
}

function widgetIcon(id) {
  const map = { tasks: 'check-square', calendar: 'calendar', shopping: 'shopping-cart', meals: 'utensils', notes: 'pin', weather: 'cloud-sun' };
  return map[id] ?? 'layout-dashboard';
}

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
    return { text: `${t('dashboard.dueToday')} – ${formatTime(dueDate)}`, overdue: false, soon: true };
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

function renderGreeting(user, stats = {}) {
  const { overdueCount = 0, dueSoonCount = 0, todayEventCount = 0, todayMealTitle = null } = stats;

  const statChips = [];
  if (overdueCount > 0)
    statChips.push(`<span class="greeting-chip greeting-chip--warn">
      <i data-lucide="alert-circle" class="icon-sm" style="flex-shrink:0" aria-hidden="true"></i>
      ${overdueCount > 1 ? t('dashboard.overdueTasksChipPlural', { count: overdueCount }) : t('dashboard.overdueTasksChip', { count: overdueCount })}
    </span>`);
  if (dueSoonCount > 0)
    statChips.push(`<span class="greeting-chip greeting-chip--due">
      <i data-lucide="clock" class="icon-sm" style="flex-shrink:0" aria-hidden="true"></i>
      ${dueSoonCount > 1 ? t('dashboard.urgentTasksChipPlural', { count: dueSoonCount }) : t('dashboard.urgentTasksChip', { count: dueSoonCount })}
    </span>`);
  if (todayEventCount > 0)
    statChips.push(`<span class="greeting-chip">
      <i data-lucide="calendar" class="icon-sm" style="flex-shrink:0" aria-hidden="true"></i>
      ${todayEventCount > 1 ? t('dashboard.eventsChipPlural', { count: todayEventCount }) : t('dashboard.eventsChip', { count: todayEventCount })}
    </span>`);
  if (todayMealTitle)
    statChips.push(`<span class="greeting-chip">
      <i data-lucide="utensils" class="icon-sm" style="flex-shrink:0" aria-hidden="true"></i>
      ${t('dashboard.todayMealChip', { title: esc(todayMealTitle) })}
    </span>`);

  let time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  return `
    <div class="widget-greeting">
      <div class="widget-greeting__inner">
        <div class="widget-greeting__content">
          <div class="widget-greeting__title">${formatDate(new Date())} - ${time}</div>
          ${statChips.length ? `<div class="widget-greeting__chips">${statChips.join('')}</div>` : ''}
        </div>
        <button class="widget-customize-btn" id="dashboard-customize-btn"
                aria-label="${t('dashboard.customize')}" title="${t('dashboard.customize')}">
          <i data-lucide="settings-2" class="icon-base" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  `;
}

function renderUrgentTasks(tasks) {
  if (!tasks.length) {
    return `<div class="widget">
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

  return `<div class="widget">
    ${widgetHeader('check-square', t('nav.tasks'), tasks.length, '/tasks')}
    <div class="widget__body">${items}</div>
  </div>`;
}

function renderUpcomingEvents(events) {
  if (!events.length) {
    return `<div class="widget">
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

  return `<div class="widget">
    ${widgetHeader('calendar', t('nav.calendar'), events.length, '/calendar')}
    <div class="widget__body">${items}</div>
  </div>`;
}

function renderTodayMeals(meals) {
  const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

  const mealLabels = MEAL_LABELS();
  const slots = MEAL_ORDER.map((type) => {
    const meal = meals.find((m) => m.meal_type === type);
    return `
      <div class="meal-slot ${meal ? 'meal-slot--filled' : ''}" data-route="/meals" role="button" tabindex="0">
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
    return `<div class="widget">
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

  return `<div class="widget widget--wide">
    ${widgetHeader('pin', t('nav.notes'), notes.length, '/notes')}
    <div class="notes-grid-widget">${items}</div>
  </div>`;
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

  return `<div class="widget">
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
    <div class="widget weather-widget" id="weather-widget">
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
              ${t('dashboard.weatherFeelsLike', { temp: current.feels_like, humidity: current.humidity, wind: current.wind_speed })}
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
    const go = () => { toggleFab(false); window.oikos.navigate(el.dataset.route); };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });

  document.addEventListener('click', () => { if (open) toggleFab(false); }, { signal });
}

// --------------------------------------------------------
// Widget-Rendering nach Konfiguration
// --------------------------------------------------------

function renderWidgets(cfg, data, weather) {
  const renderers = {
    tasks:    () => renderUrgentTasks(data.urgentTasks ?? []),
    calendar: () => renderUpcomingEvents(data.upcomingEvents ?? []),
    shopping: () => renderShoppingLists(data.shoppingLists ?? []),
    meals:    () => renderTodayMeals(data.todayMeals ?? []),
    notes:    () => renderPinnedNotes(data.pinnedNotes ?? []),
    weather:  () => (weather ? renderWeatherWidget(weather) : ''),
  };
  return cfg
    .filter((w) => w.visible)
    .map((w) => (renderers[w.id] ? renderers[w.id]() : ''))
    .join('');
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
        <div class="customize-row" data-id="${w.id}">
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
        list.replaceChildren();
        list.insertAdjacentHTML('beforeend', buildRows());
        if (window.lucide) window.lucide.createIcons({ el: list });
        wireRows();
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
// Navigations-Links verdrahten
// --------------------------------------------------------

function wireLinks(container) {
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
      <div class="dashboard__grid">
        ${renderGreeting(user, {})}
        ${skeletonWidget(3)}
        ${skeletonWidget(3)}
        ${skeletonWidget(2)}
        ${skeletonWidget(3)}
      </div>
    </div>
    ${renderFab()}
  `;

  let data         = { upcomingEvents: [], urgentTasks: [], todayMeals: [], pinnedNotes: [], shoppingLists: [] };
  let weather      = null;
  let widgetConfig = DEFAULT_WIDGET_CONFIG;
  try {
    const [dashRes, weatherRes, prefsRes] = await Promise.all([
      api.get('/dashboard'),
      api.get('/weather').catch(() => ({ data: null })),
      api.get('/preferences').catch(() => ({ data: {} })),
    ]);
    data         = dashRes;
    weather      = weatherRes.data ?? null;
    widgetConfig = prefsRes.data?.dashboard_widgets ?? DEFAULT_WIDGET_CONFIG;
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
  };

  const rerender = () => render(container, { user });

  function rebuildGrid(cfg) {
    const grid = container.querySelector('.dashboard__grid');
    if (!grid) return;
    const greeting = grid.querySelector('.widget-greeting');
    grid.replaceChildren(...(greeting ? [greeting] : []));
    grid.insertAdjacentHTML('beforeend', renderWidgets(cfg, data, weather));
    wireLinks(container, rerender);
    if (window.lucide) window.lucide.createIcons();
    wireWeatherRefresh(container);
  }

  // Greeting in-place aktualisieren (Stats-Chips hinzufügen), kein Gesamt-Reset
  const greetingEl = container.querySelector('.widget-greeting');
  if (greetingEl) greetingEl.outerHTML = renderGreeting(user, stats);

  // Skeletons durch echte Widgets ersetzen
  rebuildGrid(widgetConfig);

  initFab(container, _fabController.signal);

  container.querySelector('#dashboard-customize-btn')?.addEventListener(
    'click',
    () => openCustomizeModal(widgetConfig, (newConfig) => {
      widgetConfig = newConfig;
      rebuildGrid(widgetConfig);
    }),
    { signal: _fabController.signal },
  );

  // 30-Minuten Auto-Refresh für Wetter
  const refreshBtn = container.querySelector('#weather-refresh-btn');
  if (refreshBtn) {
    const doAutoRefresh = async () => {
      try {
        const res = await api.get('/weather').catch(() => ({ data: null }));
        const wWidget = container.querySelector('#weather-widget');
        if (wWidget) {
          wWidget.outerHTML = renderWeatherWidget(res.data ?? null);
          const newWidget = container.querySelector('#weather-widget');
          if (newWidget && window.lucide) window.lucide.createIcons({ el: newWidget });
          wireWeatherRefresh(container);
        }
      } catch { /* silently ignore */ }
    };
    const timerId = setInterval(doAutoRefresh, 30 * 60 * 1000);
    _fabController.signal.addEventListener('abort', () => clearInterval(timerId));
  }
}

function wireWeatherRefresh(container) {
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
        wireWeatherRefresh(container);
        window.oikos?.showToast(t('dashboard.weatherUpdated'), 'success', 1500);
      }
    } catch { /* silently ignore */ }
  };
  refreshBtn.addEventListener('click', doWeatherRefresh, { signal: _fabController.signal });
}
