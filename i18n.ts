type LocalizedString = { en: string; ru?: string; uk?: string };

export const t = (strings: LocalizedString): string =>
  strings[LANG.current] || strings.en;

export const authMessages = {
  authorizationFailed: (error: string) =>
    t({
      en: `Kick authorization failed: ${error}`,
      ru: `Ошибка авторизации Kick: ${error}`,
      uk: `Помилка авторизації Kick: ${error}`,
    }),
  missingAuthorizationCode: () =>
    t({
      en: 'Missing authorization code',
      ru: 'Отсутствует код авторизации',
      uk: 'Відсутній код авторизації',
    }),
  invalidOAuthState: () =>
    t({
      en: 'Invalid OAuth state',
      ru: 'Неверное состояние OAuth',
      uk: 'Невірний стан OAuth',
    }),
  missingPkceVerifier: () =>
    t({
      en: 'Missing PKCE verifier',
      ru: 'Отсутствует PKCE verifier',
      uk: 'Відсутній PKCE verifier',
    }),
  tokenExchangeFailed: () =>
    t({
      en: 'Token exchange failed',
      ru: 'Не удалось обменять токен',
      uk: 'Не вдалося обміняти токен',
    }),
  authorizationSuccessful: () =>
    t({
      en: 'Authorization successful. You can close this window.',
      ru: 'Авторизация успешна. Можно закрыть это окно.',
      uk: 'Авторизацію успішно завершено. Можна закрити це вікно.',
    }),
};

export const logoutButtonLabel = (username: string) => {
  const handle = username.trim();
  if (!handle) {
    return {
      en: 'Logout',
      ru: 'Выйти',
      uk: 'Вийти',
    };
  }

  return {
    en: `Logout @${handle}`,
    ru: `Выйти @${handle}`,
    uk: `Вийти @${handle}`,
  };
};
