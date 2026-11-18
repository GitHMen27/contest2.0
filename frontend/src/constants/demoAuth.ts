/**
 * Резервные демо-учётные записи для случая, когда сервер авторизации ещё не задеплоен
 * (старый бэкенд без /auth/login, 503 «вход не настроен» или нет сети).
 *
 * Основной путь — сервер: он сам проверяет пароль и подписывает токен, поэтому роль нельзя подделать.
 * Этот файл нужен только чтобы статическая демо-сборка не оставалась запертой на экране входа.
 * Пароли не хранятся в открытом виде — только SHA-256.
 */
export type DemoRole = 'admin' | 'user';

interface DemoAccount {
  username: string;
  /** SHA-256 от пароля в hex. */
  passwordHash: string;
  role: DemoRole;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: 'demo',
    passwordHash: '2a97516c354b68848cdbd8f54a226a0a55b21ed138e207ad6c5cbb9c00aa5aea',
    role: 'user',
  },
  {
    username: 'admin',
    passwordHash: 'a58f3a2687a0e374ae59e4c934ed98a15c53c884764029a00deabbe4d2cf44e2',
    role: 'admin',
  },
];

/** Публичная подсказка на экране входа: пароль администратора в интерфейсе не показывается. */
export const DEMO_USER_HINT = { username: 'demo', password: 'demo' } as const;

async function sha256(value: string): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

/** Проверяет логин и пароль по резервному списку. Возвращает роль или null. */
export async function verifyDemoCredentials(
  username: string,
  password: string,
): Promise<DemoRole | null> {
  const account = DEMO_ACCOUNTS.find((item) => item.username === username.trim());
  if (!account) return null;
  const hash = await sha256(password);
  if (!hash) return null;
  return hash === account.passwordHash ? account.role : null;
}
