/**
 * Modul: Login-Seite
 * Zweck: Anmeldeformular mit Username/Passwort, Fehlerbehandlung, Session-Start
 * Abhängigkeiten: /api.js
 */

import { auth } from '/api.js';
import { t } from '/i18n.js';

const VERSION_URL = '/api/v1/version';

/**
 * Rendert die Login-Seite in den gegebenen Container.
 * @param {HTMLElement} container
 */
export async function render(container) {
  container.innerHTML = `
    <main class="login-page" id="main-content">
      <div class="login-hero">
        <h1 class="login-hero__title">Oikos</h1>
        <p class="login-hero__tagline">${t('login.tagline')}</p>
      </div>
      <div class="login-card card card--padded">

        <form class="login-form" id="login-form" novalidate>
          <div class="form-group">
            <label class="label" for="username">${t('login.usernameLabel')}</label>
            <input
              class="input"
              type="text"
              id="username"
              name="username"
              autocomplete="username"
              autocapitalize="none"
              autocorrect="off"
              placeholder="${t('login.usernamePlaceholder')}"
              required
            />
          </div>

          <div class="form-group">
            <label class="label" for="password">${t('login.passwordLabel')}</label>
            <input
              class="input"
              type="password"
              id="password"
              name="password"
              autocomplete="current-password"
              placeholder="${t('login.passwordPlaceholder')}"
              required
            />
          </div>

          <div class="login-error" id="login-error" role="alert" aria-live="polite" hidden></div>

          <button type="submit" class="btn btn--primary login-form__submit" id="login-btn">
            <span class="login-btn__label">${t('login.loginButton')}</span>
          </button>
        </form>
      </div>
      <p class="login-version" id="login-version"></p>
    </main>
  `;

  const form = container.querySelector('#login-form');
  const errorEl = container.querySelector('#login-error');
  const submitBtn = container.querySelector('#login-btn');
  const versionEl = container.querySelector('#login-version');

  fetch(VERSION_URL)
    .then((r) => r.json())
    .then((d) => { versionEl.textContent = t('login.version', { version: d.version }); })
    .catch(() => {});

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const username = form.username.value.trim();
    const password = form.password.value;

    if (!username || !password) {
      showError(errorEl, t('common.allFieldsRequired'));
      return;
    }

    const labelEl = submitBtn.querySelector('.login-btn__label');

    submitBtn.disabled = true;
    labelEl.textContent = t('login.loggingIn');
    const spinner = document.createElement('span');
    spinner.className = 'login-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    submitBtn.insertBefore(spinner, labelEl);

    try {
      const result = await auth.login(username, password);
      window.oikos.navigate('/', result.user);
    } catch (err) {
      showError(errorEl, err.status === 429
        ? t('login.tooManyAttempts')
        : t('login.invalidCredentials')
      );
    } finally {
      submitBtn.disabled = false;
      labelEl.textContent = t('login.loginButton');
      spinner.remove();
    }
  });
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}
