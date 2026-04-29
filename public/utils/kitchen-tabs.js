import { t } from '/i18n.js';

export const KITCHEN_ROUTES = ['/meals', '/recipes', '/shopping'];
export const KITCHEN_STORAGE_KEY = 'oikos-kitchen-tab';

const TABS = () => [
  { route: '/meals',    labelKey: 'nav.meals',    icon: 'utensils'       },
  { route: '/recipes',  labelKey: 'nav.recipes',  icon: 'book-text'      },
  { route: '/shopping', labelKey: 'nav.shopping', icon: 'shopping-cart'  },
];

export function getLastKitchenRoute() {
  try {
    const stored = sessionStorage.getItem(KITCHEN_STORAGE_KEY);
    return KITCHEN_ROUTES.includes(stored) ? stored : '/meals';
  } catch {
    return '/meals';
  }
}

export function isKitchenRoute(path) {
  return KITCHEN_ROUTES.includes(path);
}

export function renderKitchenTabsBar(container, activeRoute) {
  try {
    sessionStorage.setItem(KITCHEN_STORAGE_KEY, activeRoute);
  } catch { /* ignore */ }

  container.classList.add('has-kitchen-tabs');

  const bar = document.createElement('div');
  bar.className = 'kitchen-tabs-bar';
  bar.setAttribute('role', 'tablist');
  bar.setAttribute('aria-label', t('nav.kitchen'));

  TABS().forEach(({ route, labelKey, icon }) => {
    const btn = document.createElement('button');
    btn.className = 'kitchen-tab' + (route === activeRoute ? ' kitchen-tab--active' : '');
    btn.dataset.route = route;
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', route === activeRoute ? 'true' : 'false');

    const i = document.createElement('i');
    i.dataset.lucide = icon;
    i.className = 'kitchen-tab__icon';
    i.setAttribute('aria-hidden', 'true');

    const span = document.createElement('span');
    span.className = 'kitchen-tab__label';
    span.textContent = t(labelKey);

    btn.appendChild(i);
    btn.appendChild(span);
    bar.appendChild(btn);
  });

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-route]');
    if (!btn || btn.dataset.route === activeRoute) return;
    window.oikos?.navigate(btn.dataset.route);
  });

  container.insertAdjacentElement('afterbegin', bar);

  if (window.lucide) window.lucide.createIcons({ el: bar });
}
