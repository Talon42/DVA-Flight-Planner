use serde_json::json;

use crate::deltava_auth::{DeltaVirtualAuthContext, DeltaVirtualRememberMode};

pub fn build_deltava_login_automation_script(auth: &DeltaVirtualAuthContext) -> String {
    let auth_json = serde_json::to_string(&json!({
        "firstName": auth.settings.first_name,
        "lastName": auth.settings.last_name,
        "rememberMode": auth.settings.remember_mode,
        "password": auth.password.as_deref().unwrap_or_default()
    }))
    .unwrap_or_else(|_| "{}".to_string());

    let auth_message_prefix = serde_json::to_string(crate::DELTAVA_AUTH_MESSAGE_PREFIX)
        .unwrap_or_else(|_| "\"__FLIGHT_PLANNER_DVA_AUTH__\"".to_string());
    let debug_prefix = serde_json::to_string(crate::DELTAVA_DEBUG_MESSAGE_PREFIX)
        .unwrap_or_else(|_| "\"__FLIGHT_PLANNER_SYNC_DEBUG__\"".to_string());
    let login_url = serde_json::to_string(crate::DELTAVA_LOGIN_URL)
        .unwrap_or_else(|_| "\"https://www.deltava.org/login.do\"".to_string());
    let target_url = serde_json::to_string("https://www.deltava.org/pfpxsched.ws")
        .unwrap_or_else(|_| "\"https://www.deltava.org/pfpxsched.ws\"".to_string());
    let full_mode = serde_json::to_string(&DeltaVirtualRememberMode::Full)
        .unwrap_or_else(|_| "\"full\"".to_string());

    const TEMPLATE: &str = r#"
(() => {
  const auth = __AUTH_DATA__;
  const authMessagePrefix = __AUTH_MESSAGE_PREFIX__;
  const debugPrefix = __DEBUG_PREFIX__;
  const loginUrl = __LOGIN_URL__;
  const targetUrl = __TARGET_URL__;
  const fullRememberMode = __FULL_REMEMBER_MODE__;
  const submittedKey = 'flightPlannerDeltaLoginSubmitted';
  const pendingPasswordKey = 'flightPlannerDeltaLoginPendingPassword';

  const emitDebug = (message) => {
    if (window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage(debugPrefix + message);
    }
  };

  const postAuthMessage = (payload) => {
    if (window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage(authMessagePrefix + JSON.stringify(payload));
    }
  };

  const getSessionValue = (key) => {
    try {
      return window.sessionStorage.getItem(key) || '';
    } catch (_) {
      return '';
    }
  };

  const setSessionValue = (key, value) => {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (_) {}
  };

  const clearSessionValues = () => {
    try {
      window.sessionStorage.removeItem(submittedKey);
      window.sessionStorage.removeItem(pendingPasswordKey);
    } catch (_) {}
  };

  const setFieldValue = (selector, value) => {
    const field = document.querySelector(selector);
    if (!field || value === undefined || value === null) {
      return false;
    }

    const nextValue = String(value);
    if (field.value !== nextValue) {
      field.value = nextValue;
    }

    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };

  const getPasswordField = () => document.querySelector('input[name="pwd"]');
  const getLoginForm = () => {
    const passwordField = getPasswordField();
    return passwordField?.form || document.querySelector('form');
  };
  const isLoginPage = () => Boolean(
    window.location.href.includes('/login.do') ||
      document.querySelector('input[name="firstName"]') ||
      document.querySelector('input[name="lastName"]') ||
      getPasswordField()
  );

  const markSubmitted = () => {
    setSessionValue(submittedKey, '1');
    if (auth.rememberMode === fullRememberMode) {
      const passwordField = getPasswordField();
      const pendingPassword = passwordField?.value || auth.password || '';
      setSessionValue(pendingPasswordKey, pendingPassword);
    }
  };

  const updatePendingPassword = () => {
    if (auth.rememberMode !== fullRememberMode) {
      return;
    }

    const passwordField = getPasswordField();
    const passwordValue = passwordField?.value || '';
    setSessionValue(pendingPasswordKey, passwordValue);
  };

  const submitLogin = () => {
    const form = getLoginForm();
    const passwordField = getPasswordField();

    if (!form) {
      emitDebug('auth:failed:no-login-form');
      postAuthMessage({
        kind: 'loginFailed',
        reason: 'Delta Virtual login form was not found.'
      });
      clearSessionValues();
      return false;
    }

    markSubmitted();
    emitDebug('auth:submit');

    if (form.requestSubmit) {
      form.requestSubmit();
      return true;
    }

    if (typeof form.submit === 'function') {
      form.submit();
      return true;
    }

    const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submitButton) {
      submitButton.click();
      return true;
    }

    if (passwordField) {
      passwordField.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    }

    return false;
  };

  const maybeCaptureSuccess = () => {
    if (isLoginPage()) {
      return false;
    }

    const submitted = getSessionValue(submittedKey) === '1';
    if (!submitted) {
      return false;
    }

    const logoutMarker = document.querySelector(
      'a[href*="logout"], a[href*="logoff"], button[name*="logout"], input[value*="logout"]'
    );
    if (window.location.href !== targetUrl && !logoutMarker) {
      return false;
    }

    emitDebug('auth:success');
    postAuthMessage({
      kind: 'loginSuccess'
    });

    const pendingPassword = getSessionValue(pendingPasswordKey);
    if (auth.rememberMode === fullRememberMode && pendingPassword) {
      postAuthMessage({
        kind: 'storePassword',
        password: pendingPassword
      });
    }

    clearSessionValues();
    return true;
  };

  const maybeReportFailure = () => {
    if (!isLoginPage()) {
      return false;
    }

    if (getSessionValue(submittedKey) !== '1') {
      return false;
    }

    const errorNode = document.querySelector('[role="alert"], .alert, .error, .errors, .login-error');
    if (!errorNode) {
      return false;
    }

    const message = String(errorNode.textContent || '').trim().slice(0, 120);
    emitDebug(`auth:failed:${message || 'login-error'}`);
    postAuthMessage({
      kind: 'loginFailed',
      reason: message || 'Delta Virtual rejected the login.'
    });
    clearSessionValues();
    return true;
  };

  if (maybeCaptureSuccess()) {
    return;
  }

  if (!isLoginPage()) {
    return;
  }

  if (!window.__flightPlannerDeltaLoginListenersBound) {
    window.__flightPlannerDeltaLoginListenersBound = true;

    document.addEventListener('submit', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLFormElement)) {
        return;
      }

      if (target.querySelector('input[name="firstName"], input[name="lastName"], input[name="pwd"]')) {
        markSubmitted();
        updatePendingPassword();
        emitDebug('auth:event:submit');
      }
    }, true);

    document.addEventListener('click', (event) => {
      const element = event.target && event.target.closest
        ? event.target.closest('button, input[type="submit"], a')
        : null;
      if (!element) {
        return;
      }

      const label = (element.innerText || element.value || element.textContent || '').toLowerCase();
      const idName = `${element.id || ''} ${element.name || ''}`.toLowerCase();
      if (label.includes('login') || idName.includes('login') || idName.includes('submit')) {
        markSubmitted();
        updatePendingPassword();
        emitDebug('auth:event:click');
      }
    }, true);
  }

  const firstNameApplied = setFieldValue('input[name="firstName"]', auth.firstName);
  const lastNameApplied = setFieldValue('input[name="lastName"]', auth.lastName);
  const passwordField = getPasswordField();
  const passwordApplied =
    auth.rememberMode === fullRememberMode && auth.password
      ? setFieldValue('input[name="pwd"]', auth.password)
      : false;

  if (auth.rememberMode === fullRememberMode) {
    updatePendingPassword();
  }

  if (firstNameApplied || lastNameApplied || passwordApplied) {
    emitDebug(`auth:filled:${firstNameApplied ? 'first' : ''}${lastNameApplied ? 'last' : ''}${passwordApplied ? ':password' : ''}`);
  }

  if (auth.rememberMode === fullRememberMode && auth.password) {
    window.setTimeout(() => {
      if (submitLogin()) {
        window.setTimeout(() => {
          if (maybeCaptureSuccess()) {
            return;
          }
          if (maybeReportFailure()) {
            return;
          }
          if (isLoginPage() && getSessionValue(submittedKey) === '1') {
            emitDebug('auth:failed:login-still-visible');
            postAuthMessage({
              kind: 'loginFailed',
              reason: 'Delta Virtual login did not advance past the login page.'
            });
            clearSessionValues();
          }
        }, 1500);
      }
    }, 125);
    return;
  }

  if (passwordField) {
    passwordField.focus();
  }
  emitDebug('auth:waiting-manual-password');

  window.setTimeout(() => {
    if (maybeReportFailure()) {
      return;
    }
    if (getSessionValue(submittedKey) === '1' && isLoginPage()) {
      emitDebug('auth:failed:login-still-visible');
      postAuthMessage({
        kind: 'loginFailed',
        reason: 'Delta Virtual login did not advance past the login page.'
      });
      clearSessionValues();
    }
  }, 1600);
})();
"#;

    TEMPLATE
        .replace("__AUTH_DATA__", &auth_json)
        .replace("__AUTH_MESSAGE_PREFIX__", &auth_message_prefix)
        .replace("__DEBUG_PREFIX__", &debug_prefix)
        .replace("__LOGIN_URL__", &login_url)
        .replace("__TARGET_URL__", &target_url)
        .replace("__FULL_REMEMBER_MODE__", &full_mode)
}
