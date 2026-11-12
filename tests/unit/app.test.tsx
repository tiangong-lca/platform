// @ts-nocheck
import { fireEvent, render, screen } from '@testing-library/react';
let mockBrand = 'tiangong';
jest.mock('../../config/brandProfile', () => ({
  ...jest.requireActual('../../config/brandProfile'),
  get brandProfile() {
    return jest.requireActual('../../config/brandProfile').resolveBrandProfile(mockBrand);
  },
}));

const mockQueryCurrentUser = jest.fn();
const mockGetSystemUserRoleApi = jest.fn();
const mockGetLocalizedAppTitle = jest.fn(() => 'Localized TianGong');
const mockResolveBrowserRuntimeLocale = jest.fn(() => 'de-DE');
const mockBindTidasPackageTaskCenterOwner = jest.fn();
const mockGetSystemStatus = jest.fn();
const mockSubscribeToPasswordRecovery = jest.fn();
let mockPasswordRecoveryCallback: (() => void) | undefined;
const mockHistory = {
  location: {
    pathname: '/tgdata',
    search: '',
  },
  push: jest.fn(),
  replace: jest.fn(),
};
const mockGetIntl = jest.fn(() => ({
  locale: 'en-US',
  formatMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
}));

jest.mock('@/components', () => ({
  __esModule: true,
  AvatarDropdown: ({ children }: any) => <div data-testid='avatar-dropdown'>{children}</div>,
  AvatarName: () => <span data-testid='avatar-name'>Avatar Name</span>,
  DarkMode: 'dark-mode',
  ExportTidasPackage: 'export-tidas-package',
  Footer: () => <div data-testid='footer'>Footer</div>,
  HeaderActionIcon: ({ title, onClick }: any) => (
    <button data-testid='header-action-icon' onClick={onClick} type='button'>
      {title}
    </button>
  ),
  ImportTidasPackage: 'import-tidas-package',
  LcaTaskCenter: 'lca-task-center',
  Notification: 'notification-center',
  Question: 'question-link',
  SelectLang: 'select-lang',
  SelectLangAction: 'select-lang',
}));

jest.mock('@/components/LCIACacheMonitor', () => ({
  __esModule: true,
  default: 'lcia-cache-monitor',
}));

jest.mock('@/components/SystemMaintenance', () => ({
  __esModule: true,
  default: ({ status }: any) => <div data-testid='system-maintenance'>{status.phase}</div>,
}));

jest.mock('@/components/SystemMaintenance/AppBootBoundary', () => ({
  __esModule: true,
  AppBootMarker: ({ children }: any) => <div data-testid='app-boot-marker'>{children}</div>,
  StaticFallbackErrorBoundary: ({ children }: any) => (
    <div data-testid='static-fallback-error-boundary'>{children}</div>
  ),
}));

jest.mock('@/components/AccessDenied', () => ({
  __esModule: true,
  default: () => <div data-testid='access-denied'>Localized access denied</div>,
}));

jest.mock('@/components/AccessibleSettingDrawer', () => ({
  __esModule: true,
  default: ({ openLabel, onSettingChange, settings }: any) => {
    const { SettingDrawer } = require('@ant-design/pro-components');
    return (
      <>
        <button aria-label={openLabel} type='button'>
          open settings
        </button>
        <SettingDrawer
          collapse={false}
          prefixCls='tg-pro'
          settings={settings}
          onSettingChange={onSettingChange}
        />
      </>
    );
  },
}));

jest.mock('@/components/ClassificationCacheMonitor', () => ({
  __esModule: true,
  default: 'classification-cache-monitor',
}));

jest.mock('@/components/LocationCacheMonitor', () => ({
  __esModule: true,
  default: 'location-cache-monitor',
}));

jest.mock('@/components/TidasPackageActions', () => ({
  __esModule: true,
  default: 'tidas-package-actions',
}));

jest.mock('@/services/auth', () => ({
  __esModule: true,
  getCurrentUser: (...args: any[]) => mockQueryCurrentUser(...args),
}));

jest.mock('@/services/auth/recovery', () => ({
  __esModule: true,
  subscribeToPasswordRecovery: (callback: () => void) => {
    mockPasswordRecoveryCallback = callback;
    return mockSubscribeToPasswordRecovery(callback);
  },
}));

jest.mock('@/services/roles/api', () => ({
  __esModule: true,
  getSystemUserRoleApi: (...args: any[]) => mockGetSystemUserRoleApi(...args),
}));

const mockReloadBrowserPage = jest.fn();
jest.mock('@/utils/browserNavigation', () => ({
  reloadBrowserPage: (...args: any[]) => mockReloadBrowserPage(...args),
}));
let mockTaskAuthCallback: any;
jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (callback: any) => {
        mockTaskAuthCallback = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
      getClaims: jest.fn(),
    },
  },
}));
const mockBindLcaTaskCenterOwner = jest.fn();
const mockBindDataProductTaskCenterOwner = jest.fn();
jest.mock('@/services/lca/taskCenter', () => ({
  bindLcaTaskCenterOwner: (...args: any[]) => mockBindLcaTaskCenterOwner(...args),
}));
jest.mock('@/services/dataProducts/taskCenter', () => ({
  bindDataProductTaskCenterOwner: (...args: any[]) => mockBindDataProductTaskCenterOwner(...args),
}));

jest.mock('@/services/tidasPackage/taskCenter', () => ({
  __esModule: true,
  bindTidasPackageTaskCenterOwner: (...args: any[]) => mockBindTidasPackageTaskCenterOwner(...args),
}));

jest.mock('@/services/general/runtimeLocale', () => ({
  __esModule: true,
  resolveBrowserRuntimeLocale: () => mockResolveBrowserRuntimeLocale(),
}));

jest.mock('@/services/general/systemStatus', () => ({
  __esModule: true,
  getSystemStatus: () => mockGetSystemStatus(),
  isSystemMaintenanceActive: (status: any) =>
    status?.phase === 'maintenance' || status?.phase === 'verifying',
}));

jest.mock('../../config/defaultSettings', () => ({
  __esModule: true,
  default: {
    navTheme: 'light',
    colorPrimary: '#1677ff',
    layout: 'mix',
    splitMenus: true,
  },
  defaultAppTitle: 'Tiangong LCA',
  getLocalizedAppTitle: (...args: any[]) => mockGetLocalizedAppTitle(...args),
}));

jest.mock('@/requestErrorConfig', () => ({
  __esModule: true,
  errorConfig: {
    errorConfig: {
      errorHandler: jest.fn(),
    },
  },
}));

jest.mock('@/contexts/AntdAppContext', () => ({
  __esModule: true,
  AntdAppApiRegistrar: ({ children }: any) => <div data-testid='antd-app-provider'>{children}</div>,
}));

jest.mock('@/contexts/AntdThemeSync', () => ({
  __esModule: true,
  AntdThemeSync: ({ colorPrimary, isDarkMode }: any) => (
    <div
      data-testid='antd-theme-sync'
      data-color-primary={colorPrimary ?? ''}
      data-algorithm={isDarkMode ? 'dark-algorithm' : 'default-algorithm'}
    />
  ),
  createAntdThemeConfig: (isDarkMode: boolean, colorPrimary?: string) => ({
    cssVar: { key: 'tiangong-lca' },
    components: { Divider: { orientationMargin: 0 } },
    token: { colorPrimary },
    algorithm: isDarkMode ? 'dark-algorithm' : 'default-algorithm',
  }),
}));

jest.mock('@umijs/max', () => ({
  __esModule: true,
  Link: ({ to, children, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  getIntl: () => mockGetIntl(),
  history: mockHistory,
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  DashboardOutlined: () => <span data-testid='dashboard-icon'>dashboard-icon</span>,
  DatabaseOutlined: () => <span data-testid='database-icon'>database-icon</span>,
  LinkOutlined: () => <span data-testid='link-icon'>link-icon</span>,
  MenuOutlined: () => <span data-testid='menu-icon'>menu-icon</span>,
  ProjectOutlined: () => <span data-testid='read-icon'>read-icon</span>,
}));

jest.mock('antd', () => ({
  __esModule: true,
  ConfigProvider: ({ children, theme }: any) => (
    <div
      data-testid='config-provider'
      data-css-var={String(theme?.cssVar)}
      data-color-primary={theme?.token?.colorPrimary ?? ''}
      data-algorithm={theme?.algorithm ?? ''}
    >
      {children}
    </div>
  ),
  theme: {
    darkAlgorithm: 'dark-algorithm',
    defaultAlgorithm: 'default-algorithm',
  },
}));

jest.mock('@ant-design/pro-components', () => ({
  __esModule: true,
  SettingDrawer: ({ collapse, prefixCls, settings, onCollapseChange, onSettingChange }: any) => (
    <button
      data-collapse={String(collapse)}
      data-prefix-cls={prefixCls}
      type='button'
      data-testid='setting-drawer'
      onClick={() => {
        onCollapseChange?.(false);
        onSettingChange?.({ navTheme: 'dark' });
      }}
    >
      {JSON.stringify(settings)}
    </button>
  ),
}));

describe('app runtime config', () => {
  it('routes Supabase password-recovery events to the reset form', () => {
    require('@/app');

    expect(mockPasswordRecoveryCallback).toEqual(expect.any(Function));
    mockPasswordRecoveryCallback?.();

    expect(mockHistory.replace).toHaveBeenCalledWith('/user/login/password_reset');
  });

  beforeEach(() => {
    mockBrand = 'tiangong';
    jest.resetModules();
    jest.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('isDarkMode', 'false');
    mockHistory.location.pathname = '/tgdata';
    mockHistory.location.search = '';
    mockQueryCurrentUser.mockResolvedValue({ name: 'Current User', access: 'admin' });
    mockGetSystemUserRoleApi.mockResolvedValue({ role: 'admin' });
    mockGetLocalizedAppTitle.mockReturnValue('Localized TianGong');
    mockResolveBrowserRuntimeLocale.mockReturnValue('de-DE');
    mockGetSystemStatus.mockResolvedValue({ schemaVersion: 1, phase: 'normal' });
  });

  it('exposes the canonical browser locale to Umi before provider render', () => {
    const { locale } = require('@/app');

    expect(locale.getLocale()).toBe('de-DE');
    expect(mockResolveBrowserRuntimeLocale).toHaveBeenCalledTimes(1);
  });

  it('builds the native global theme without dropping existing component tokens', () => {
    const { antd } = require('@/app');

    const result = antd({
      appConfig: {},
      theme: {
        components: {
          Button: { primaryShadow: 'none' },
          Divider: { colorSplit: '#abcdef' },
        },
        token: { borderRadius: 12 },
      },
    });

    expect(result.theme).toMatchObject({
      cssVar: { key: 'tiangong-lca' },
      components: {
        Button: { primaryShadow: 'none' },
        Divider: { colorSplit: '#abcdef', orientationMargin: 0 },
      },
      token: { borderRadius: 12, colorPrimary: '#5C246A' },
    });
    expect(result.message.styles({ props: {} })).toEqual({
      listContent: { pointerEvents: 'none' },
    });
  });

  it('keeps message content interactive and preserves unrelated feedback configuration', () => {
    const { antd } = require('@/app');
    const notification = { styles: { listContent: { pointerEvents: 'auto' } } };
    const appConfig = { message: { duration: 5 }, notification: { duration: 8 } };
    const incomingStyles = {
      listContent: { gap: 9, pointerEvents: 'auto' },
      root: { pointerEvents: 'auto', color: 'red' },
    };
    const objectResult = antd({
      appConfig,
      notification,
      message: { className: 'existing-message', styles: incomingStyles },
    });
    expect(objectResult.message.className).toBe('existing-message');
    expect(objectResult.message.styles({ props: {} })).toEqual({
      ...incomingStyles,
      listContent: { gap: 9, pointerEvents: 'none' },
    });
    expect(objectResult.appConfig).toBe(appConfig);
    expect(objectResult.notification).toBe(notification);

    const styleCallback = jest.fn(() => incomingStyles);
    const functionResult = antd({ appConfig: {}, message: { styles: styleCallback } });
    const info = { props: { content: 'notice' } };
    expect(functionResult.message.styles(info)).toEqual(objectResult.message.styles(info));
    expect(styleCallback).toHaveBeenCalledWith(info);
    expect(antd({ appConfig: {}, message: {} }).message.styles(info)).toEqual({
      listContent: { pointerEvents: 'none' },
    });
  });

  it('wraps every Umi route in the global boot and render-failure boundary', () => {
    const { rootContainer } = require('@/app');

    render(rootContainer(<div data-testid='root-route'>layout-free route</div>));

    expect(screen.getByTestId('static-fallback-error-boundary')).toContainElement(
      screen.getByTestId('app-boot-marker'),
    );
    expect(screen.getByTestId('app-boot-marker')).toContainElement(
      screen.getByTestId('root-route'),
    );
  });

  it('registers the global Ant Design App API through Umi innerProvider', () => {
    const { innerProvider } = require('@/app');

    render(innerProvider(<div data-testid='inner-route'>route</div>));

    expect(screen.getByTestId('antd-app-provider')).toContainElement(
      screen.getByTestId('inner-route'),
    );
  });

  it('getInitialState returns current user and merged settings on protected routes', async () => {
    const { getInitialState } = require('@/app');
    window.localStorage.setItem('isDarkMode', 'true');

    const state = await getInitialState();

    expect(mockQueryCurrentUser).toHaveBeenCalledTimes(1);
    expect(mockGetSystemUserRoleApi).toHaveBeenCalledTimes(1);
    expect(state.currentUser).toEqual({ name: 'Current User', access: 'admin' });
    expect(state.isDarkMode).toBe(true);
    expect(state.settings).toMatchObject({
      navTheme: 'realDark',
      colorPrimary: '#9e3ffd',
      logo: '/logo_dark.svg',
    });
  });

  it('checks maintenance before authentication and stops protected startup while active', async () => {
    const { getInitialState } = require('@/app');
    mockGetSystemStatus.mockResolvedValueOnce({
      schemaVersion: 1,
      phase: 'maintenance',
      reason: 'release_upgrade',
      targetVersion: '0.0.71',
    });

    const state = await getInitialState();

    expect(mockGetSystemStatus).toHaveBeenCalledTimes(1);
    expect(mockQueryCurrentUser).not.toHaveBeenCalled();
    expect(mockGetSystemUserRoleApi).not.toHaveBeenCalled();
    expect(mockHistory.push).not.toHaveBeenCalled();
    expect(mockBindTidasPackageTaskCenterOwner).toHaveBeenCalledWith(null);
    expect(mockBindLcaTaskCenterOwner).toHaveBeenCalledWith(null);
    expect(mockBindDataProductTaskCenterOwner).toHaveBeenCalledWith(null);
    expect(state.systemStatus.phase).toBe('maintenance');
  });

  it('renders maintenance ahead of auth guards and hides application chrome', () => {
    const { layout } = require('@/app');
    const runtimeLayout = layout({
      initialState: {
        currentUser: undefined,
        isDarkMode: false,
        settings: { navTheme: 'light' },
        systemStatus: { schemaVersion: 1, phase: 'verifying' },
      },
      setInitialState: jest.fn(),
    });

    runtimeLayout.onPageChange?.();
    render(runtimeLayout.childrenRender?.(<div data-testid='protected-child'>private</div>));

    expect(mockHistory.push).not.toHaveBeenCalled();
    expect(screen.getByTestId('system-maintenance')).toHaveTextContent('verifying');
    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
    expect(runtimeLayout.actionsRender?.()).toEqual([]);
    expect(runtimeLayout.avatarProps).toBeUndefined();
    expect(runtimeLayout.footerRender).toBe(false);
    expect(runtimeLayout.menuDataRender?.([{ path: '/tgdata' }])).toEqual([]);
  });

  it('binds every task center to the authenticated user before rendering', async () => {
    const { getInitialState } = require('@/app');
    mockQueryCurrentUser.mockResolvedValueOnce({ name: 'Current User', userid: 'user-a' });

    await getInitialState();

    expect(mockBindTidasPackageTaskCenterOwner).toHaveBeenCalledWith('user-a');
    expect(mockBindLcaTaskCenterOwner).toHaveBeenCalledWith('user-a');
    expect(mockBindDataProductTaskCenterOwner).toHaveBeenCalledWith('user-a');
  });

  it('re-reads a lookup superseded by a new identity instead of admitting the old user', async () => {
    const { getInitialState } = require('@/app');
    const centers = require('@/services/auth/taskCenters');
    let finish: (value: any) => void = () => undefined;
    mockQueryCurrentUser
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce({ name: 'New user', userid: 'owner-b' });
    const initial = getInitialState();
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    centers.bindTaskCenterOwner('owner-b');
    finish({ name: 'Previous user', userid: 'owner-a' });
    const state = await initial;
    expect(state.currentUser?.userid).toBe('owner-b');
    expect(mockBindLcaTaskCenterOwner).toHaveBeenLastCalledWith('owner-b');
    expect(mockBindDataProductTaskCenterOwner).toHaveBeenLastCalledWith('owner-b');
    expect(mockBindTidasPackageTaskCenterOwner).toHaveBeenLastCalledWith('owner-b');
  });

  it('admits a valid startup identity when INITIAL_SESSION settles during its first claims lookup', async () => {
    const { getInitialState } = require('@/app');
    let finish: (value: any) => void = () => undefined;
    const user = { name: 'Current user', userid: 'owner-a' };
    mockQueryCurrentUser
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce(user);
    const initial = getInitialState();
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    mockTaskAuthCallback('INITIAL_SESSION', { user: { id: 'owner-a' } });
    finish(user);
    const state = await initial;
    expect(state.currentUser?.userid).toBe('owner-a');
    expect(mockQueryCurrentUser).toHaveBeenCalledTimes(2);
    expect(mockBindLcaTaskCenterOwner).toHaveBeenLastCalledWith('owner-a');
    expect(mockBindDataProductTaskCenterOwner).toHaveBeenLastCalledWith('owner-a');
  });

  it('revalidates identity when a role lookup finishes for an earlier owner', async () => {
    const { getInitialState } = require('@/app');
    const centers = require('@/services/auth/taskCenters');
    let finish: (value: any) => void = () => undefined;
    mockQueryCurrentUser
      .mockResolvedValueOnce({ name: 'Previous', userid: 'owner-a' })
      .mockResolvedValueOnce({ name: 'Current', userid: 'owner-b' });
    mockGetSystemUserRoleApi
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce({ role: 'member' });
    const initial = getInitialState();
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    centers.bindTaskCenterOwner('owner-b');
    finish({ role: 'admin' });
    const state = await initial;
    expect(state.currentUser).toMatchObject({ userid: 'owner-b', access: undefined });
    expect(mockQueryCurrentUser).toHaveBeenCalledTimes(2);
  });

  it('ignores an old identity lookup failure after a newer owner was admitted', async () => {
    const { getInitialState } = require('@/app');
    const centers = require('@/services/auth/taskCenters');
    let reject: (value: any) => void = () => undefined;
    mockQueryCurrentUser
      .mockReturnValueOnce(
        new Promise((_, fail) => {
          reject = fail;
        }),
      )
      .mockResolvedValueOnce({ name: 'Current', userid: 'owner-b' });
    const initial = getInitialState();
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    centers.bindTaskCenterOwner('owner-b');
    reject(new Error('Old claims failed'));
    const state = await initial;
    expect(state.currentUser?.userid).toBe('owner-b');
    expect(mockHistory.push).not.toHaveBeenCalled();
  });

  it('bounds revalidation and fails closed if identity changes during both startup attempts', async () => {
    const { getInitialState } = require('@/app');
    mockQueryCurrentUser.mockImplementation(async () => {
      mockTaskAuthCallback('INITIAL_SESSION', { user: { id: 'changing-owner' } });
      return { name: 'Superseded', userid: 'changing-owner' };
    });
    const state = await getInitialState();
    expect(state.currentUser).toBeNull();
    expect(mockQueryCurrentUser).toHaveBeenCalledTimes(2);
    expect(mockBindLcaTaskCenterOwner).not.toHaveBeenCalledWith('changing-owner');
  });

  it('reloads cross-tab signout through full app admission while keeping tasks ownerless', async () => {
    jest.useFakeTimers();
    const { getInitialState } = require('@/app');
    mockQueryCurrentUser.mockResolvedValueOnce({ name: 'Previous', userid: 'owner-a' });
    await getInitialState();
    mockTaskAuthCallback('SIGNED_OUT', null);
    expect(mockReloadBrowserPage).not.toHaveBeenCalled();
    expect(mockBindLcaTaskCenterOwner).toHaveBeenLastCalledWith(null);
    jest.runOnlyPendingTimers();
    expect(mockReloadBrowserPage).toHaveBeenCalledWith(window.location);
    jest.useRealTimers();
  });

  it('keeps foreign tasks unbound when same-document Login lookup waits for roles and cannot cancel reload', async () => {
    jest.useFakeTimers();
    const { getInitialState } = require('@/app');
    mockQueryCurrentUser.mockResolvedValueOnce({ name: 'Previous', userid: 'owner-a' });
    const current = await getInitialState();
    let finish: (value: any) => void = () => undefined;
    mockQueryCurrentUser.mockResolvedValueOnce({ name: 'New user', userid: 'owner-b' });
    mockGetSystemUserRoleApi.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    mockTaskAuthCallback('SIGNED_IN', { user: { id: 'owner-b' } });
    const lookup = current.fetchUserInfo();
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    const boundWhileRolesPending = mockBindLcaTaskCenterOwner.mock.calls.at(-1)?.[0];
    jest.runOnlyPendingTimers();
    const reloadCount = mockReloadBrowserPage.mock.calls.length;
    finish({ role: 'data_product_manager' });
    const user = await lookup;
    expect(boundWhileRolesPending).toBeNull();
    expect(reloadCount).toBe(1);
    expect(mockBindLcaTaskCenterOwner).toHaveBeenLastCalledWith(null);
    expect(mockBindDataProductTaskCenterOwner).toHaveBeenLastCalledWith(null);
    expect(user).toBeNull();
    jest.useRealTimers();
  });

  it('getInitialState loads dashboard users so admin route access can gate the page', async () => {
    const { getInitialState } = require('@/app');
    mockHistory.location.pathname = '/dashboard/national-carbon';

    const state = await getInitialState();

    expect(mockQueryCurrentUser).toHaveBeenCalledTimes(1);
    expect(mockGetSystemUserRoleApi).toHaveBeenCalledTimes(1);
    expect(state.currentUser).toEqual({ name: 'Current User', access: 'admin' });
  });

  it('getInitialState does not grant admin access to non-admin system roles', async () => {
    const { getInitialState } = require('@/app');
    mockGetSystemUserRoleApi.mockResolvedValueOnce({ role: 'member' });

    const state = await getInitialState();

    expect(state.currentUser).toEqual({ name: 'Current User', access: undefined });
  });

  it('getInitialState grants data product manager access without admin access', async () => {
    const { getInitialState } = require('@/app');
    mockGetSystemUserRoleApi.mockResolvedValueOnce({ role: 'data_product_manager' });

    const state = await getInitialState();

    expect(state.currentUser).toEqual({
      name: 'Current User',
      access: 'data_product_manager',
    });
  });

  it('getInitialState does not grant admin access when the system role response is empty', async () => {
    const { getInitialState } = require('@/app');
    mockGetSystemUserRoleApi.mockResolvedValueOnce({});

    const state = await getInitialState();

    expect(state.currentUser).toEqual({ name: 'Current User', access: undefined });
  });

  it('getInitialState keeps the user signed in when the system role lookup fails', async () => {
    const { getInitialState } = require('@/app');
    mockGetSystemUserRoleApi.mockRejectedValueOnce(new Error('role lookup failed'));

    const state = await getInitialState();

    expect(mockHistory.push).not.toHaveBeenCalled();
    expect(state.currentUser).toEqual({ name: 'Current User', access: undefined });
  });

  it('getInitialState redirects to login when fetching the current user fails', async () => {
    const { getInitialState } = require('@/app');
    mockQueryCurrentUser.mockRejectedValueOnce(new Error('unauthorized'));

    const state = await getInitialState();

    expect(mockHistory.push).toHaveBeenCalledWith('/user/login');
    expect(mockBindTidasPackageTaskCenterOwner).toHaveBeenCalledWith(null);
    expect(mockBindLcaTaskCenterOwner).toHaveBeenCalledWith(null);
    expect(mockBindDataProductTaskCenterOwner).toHaveBeenCalledWith(null);
    expect(state.currentUser).toBeNull();
  });

  it('getInitialState redirects to login when the current user lookup returns null', async () => {
    const { getInitialState } = require('@/app');
    mockQueryCurrentUser.mockResolvedValueOnce(null);

    const state = await getInitialState();

    expect(mockHistory.push).toHaveBeenCalledWith('/user/login');
    expect(state.currentUser).toBeNull();
  });

  it.each(['/', '/welcome', '/welcome/'])(
    'getInitialState hydrates an existing session on protected landing route %s',
    async (pathname) => {
      const { getInitialState } = require('@/app');
      mockHistory.location.pathname = pathname;

      const state = await getInitialState();

      expect(mockQueryCurrentUser).toHaveBeenCalledTimes(1);
      expect(mockGetSystemUserRoleApi).toHaveBeenCalledTimes(1);
      expect(mockHistory.push).not.toHaveBeenCalled();
      expect(state.currentUser).toEqual({ name: 'Current User', access: 'admin' });
    },
  );

  it.each([
    '/user/login',
    '/user/login/password_forgot',
    '/user/login/password_reset',
    '/oauth/consent',
  ])(
    'getInitialState skips global user loading on the self-authenticating entry route %s',
    async (pathname) => {
      const { getInitialState } = require('@/app');
      mockHistory.location.pathname = pathname;

      const state = await getInitialState();

      expect(mockQueryCurrentUser).not.toHaveBeenCalled();
      expect(mockBindTidasPackageTaskCenterOwner).toHaveBeenCalledWith(null);
      expect(mockBindLcaTaskCenterOwner).toHaveBeenCalledWith(null);
      expect(mockBindDataProductTaskCenterOwner).toHaveBeenCalledWith(null);
      expect(state.currentUser).toBeUndefined();
      expect(typeof state.fetchUserInfo).toBe('function');
    },
  );

  it.each(['/', '/welcome', '/missing-page', '/Review', '/Tgdata/processes'])(
    'getInitialState redirects anonymous protected entry %s to login',
    async (pathname) => {
      const { getInitialState } = require('@/app');
      mockHistory.location.pathname = pathname;
      mockQueryCurrentUser.mockResolvedValueOnce(null);

      const state = await getInitialState();

      expect(mockQueryCurrentUser).toHaveBeenCalledTimes(1);
      expect(mockGetSystemUserRoleApi).not.toHaveBeenCalled();
      expect(mockHistory.push).toHaveBeenCalledWith('/user/login');
      expect(state.currentUser).toBeNull();
    },
  );

  it.each(['/', '/welcome', '/missing-page', '/Review'])(
    'layout blocks anonymous protected route %s before rendering children',
    (pathname) => {
      const { layout } = require('@/app');
      const setInitialState = jest.fn();
      mockHistory.location.pathname = pathname;

      const runtimeLayout = layout({
        initialState: {
          currentUser: undefined,
          isDarkMode: false,
          settings: { navTheme: 'light' },
        },
        setInitialState,
      });

      runtimeLayout.onPageChange?.();
      const children = runtimeLayout.childrenRender?.(
        <div data-testid='protected-child'>child</div>,
      );

      expect(mockHistory.push).toHaveBeenCalledWith('/user/login');
      expect(children).toBeNull();
      expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
    },
  );

  it('blocks an anonymous welcome query view without rendering protected content', async () => {
    const { getInitialState, layout } = require('@/app');
    const setInitialState = jest.fn();
    mockHistory.location.pathname = '/welcome';
    mockHistory.location.search = '?view=carbon-footprint';
    mockQueryCurrentUser.mockResolvedValueOnce(null);

    const state = await getInitialState();
    const runtimeLayout = layout({ initialState: state, setInitialState });
    runtimeLayout.onPageChange?.();
    const children = runtimeLayout.childrenRender?.(<div data-testid='guide-child'>guide</div>);

    expect(mockQueryCurrentUser).toHaveBeenCalledTimes(1);
    expect(mockHistory.push).toHaveBeenCalledWith('/user/login');
    expect(mockHistory.location.search).toBe('?view=carbon-footprint');
    expect(children).toBeNull();
    expect(screen.queryByTestId('guide-child')).not.toBeInTheDocument();
  });

  it('selects the Atlas navigation identity without changing the shared login guard', () => {
    mockBrand = 'atlas';
    const { layout } = require('@/app');
    const runtimeLayout = layout({
      initialState: { currentUser: undefined, isDarkMode: false, settings: {} },
      setInitialState: jest.fn(),
    });
    expect(runtimeLayout.className).toBe('atlas-app-shell');
    expect(runtimeLayout.title).toBe('ATLAS');
    runtimeLayout.onPageChange();
    expect(mockHistory.push).toHaveBeenCalledWith('/user/login');
  });

  it.each([
    { brand: 'atlas', isDarkMode: false },
    { brand: 'atlas', isDarkMode: true },
    { brand: 'tiangong', isDarkMode: false },
    { brand: 'tiangong', isDarkMode: true },
  ])('retains the native menu and each brand theme boundary: %p', ({ brand, isDarkMode }) => {
    mockBrand = brand;
    const { layout } = require('@/app');
    const { Fragment } = require('react');
    const { BrandMenuTheme } = require('@/contexts/BrandMenuTheme');
    const nativeMenu = <div>Native menu</div>;
    const runtimeLayout = layout({
      initialState: {
        currentUser: { name: 'Alice' },
        isDarkMode,
        settings: { navTheme: isDarkMode ? 'realDark' : 'light', menuProps: { theme: 'dark' } },
      },
      setInitialState: jest.fn(),
    });
    const wrappedMenu = runtimeLayout.menuContentRender({}, nativeMenu);

    expect(wrappedMenu.type).toBe(brand === 'atlas' ? BrandMenuTheme : Fragment);
    expect(wrappedMenu.key).toBe('full-menu');
    expect(wrappedMenu.props.isDarkMode).toBe(brand === 'atlas' ? isDarkMode : undefined);
    expect(wrappedMenu.props.children).toBe(nativeMenu);
    expect(runtimeLayout.navTheme).toBe(isDarkMode ? 'realDark' : 'light');
    expect(runtimeLayout.menuProps).toEqual({ theme: 'dark' });
  });

  it.each(['atlas', 'tiangong'])(
    'resets native submenu state only when the desktop data scope changes for %s',
    (brand) => {
      mockBrand = brand;
      const { layout } = require('@/app');
      const React = require('react');
      class NativeMenuProbe extends React.Component {
        state = { open: false };
        render() {
          return (
            <button onClick={() => this.setState({ open: !this.state.open })} type='button'>
              {this.state.open ? 'Native submenu open' : 'Native submenu closed'}
            </button>
          );
        }
      }
      const runtimeLayout = layout({ initialState: {}, setInitialState: jest.fn() });
      const nativeMenu = <NativeMenuProbe />;
      const props = { layout: 'mix', splitMenus: true, isMobile: false };
      const menu = (scope, path) =>
        runtimeLayout.menuContentRender(
          {
            ...props,
            location: { pathname: `/${scope}/${path}` },
            menuData: [{ key: `/${scope}/models` }, { key: `/${scope}/processes` }],
          },
          nativeMenu,
        );
      const { rerender } = render(menu('tgdata', 'models'));
      fireEvent.click(screen.getByRole('button', { name: 'Native submenu closed' }));
      rerender(menu('tgdata', 'processes'));
      expect(screen.getByRole('button', { name: 'Native submenu open' })).toBeInTheDocument();
      rerender(menu('codata', 'models'));
      expect(screen.getByRole('button', { name: 'Native submenu closed' })).toBeInTheDocument();
    },
  );

  it.each([
    {
      props: {
        layout: 'mix',
        splitMenus: true,
        isMobile: false,
        menuData: [{ key: '/tgdata/models' }],
      },
      key: '/tgdata/models',
    },
    { props: { layout: 'mix', splitMenus: true, isMobile: false }, key: 'empty-data-scope' },
    {
      props: { layout: 'mix', splitMenus: true, isMobile: false, menuData: [] },
      key: 'empty-data-scope',
    },
    {
      props: { layout: 'mix', splitMenus: true, isMobile: false, menuData: [{}] },
      key: 'empty-data-scope',
    },
    {
      props: { layout: 'mix', splitMenus: true, isMobile: true, menuData: [{ key: '/tgdata' }] },
      key: 'full-menu',
    },
    { props: { layout: 'mix', splitMenus: false, isMobile: false }, key: 'full-menu' },
    { props: { layout: 'side', splitMenus: true, isMobile: false }, key: 'full-menu' },
    { props: { layout: 'top', splitMenus: true, isMobile: false }, key: 'full-menu' },
  ])(
    'keeps full/mobile menu identity stable and handles an empty split scope: %p',
    ({ props, key }) => {
      const { layout } = require('@/app');
      const runtimeLayout = layout({ initialState: {}, setInitialState: jest.fn() });
      const nativeMenu = <div>Native menu</div>;
      const wrappedMenu = runtimeLayout.menuContentRender(props, nativeMenu);

      expect(wrappedMenu.key).toBe(key);
      expect(wrappedMenu.props.children).toBe(nativeMenu);
    },
  );

  it.each([undefined, {}, { settings: {} }, { settings: { menu: {} } }])(
    'opens native supporting submenus by default when prior menu settings are absent: %p',
    (initialState) => {
      const { layout } = require('@/app');
      const runtimeLayout = layout({ initialState, setInitialState: jest.fn() });

      expect(runtimeLayout.menu).toMatchObject({ defaultOpenAll: true, autoClose: false });
    },
  );

  it('keeps existing native menu settings while opening supporting data and retaining open scopes', () => {
    const { layout } = require('@/app');
    const request = jest.fn();
    const params = { language: 'en-US' };
    const menu = { locale: false, request, params, defaultOpenAll: false, autoClose: true };
    const runtimeLayout = layout({
      initialState: { settings: { menu } },
      setInitialState: jest.fn(),
    });

    expect(runtimeLayout.menu).toEqual({ ...menu, defaultOpenAll: true, autoClose: false });
    expect(runtimeLayout.menu.request).toBe(request);
    expect(runtimeLayout.menu.params).toBe(params);
    expect(menu).toMatchObject({ defaultOpenAll: false, autoClose: true });
  });

  it.each([false, true])(
    'preserves the native Atlas header provider and menu while applying menu tokens in dark mode %s',
    (isDarkMode) => {
      mockBrand = 'atlas';
      const { layout } = require('@/app');
      const { ConfigProvider } = require('antd');
      const { BrandMenuTheme } = require('@/contexts/BrandMenuTheme');
      const { brandProfile } = require('../../config/brandProfile');
      const nativeMenu = <nav aria-label='Native data scopes'>Native scope menu</nav>;
      const nativeTheme = {
        token: { colorBgElevated: 'native-header-surface' },
        components: { Menu: { popupBg: 'native-popup-surface' } },
      };
      const nativeProvider = <ConfigProvider theme={nativeTheme}>{nativeMenu}</ConfigProvider>;
      const runtimeLayout = layout({
        initialState: { currentUser: { name: 'Alice' }, isDarkMode, settings: {} },
        setInitialState: jest.fn(),
      });

      const wrappedHeader = runtimeLayout.headerContentRender({}, nativeProvider);
      expect(wrappedHeader.type).toBe(ConfigProvider);
      expect(wrappedHeader.props.theme).toBe(nativeTheme);
      const brandBoundary = wrappedHeader.props.children;
      expect(brandBoundary.type).toBe(BrandMenuTheme);
      expect(brandBoundary.props.isDarkMode).toBe(isDarkMode);
      expect(brandBoundary.props.children).toBe(nativeMenu);
      const menuProvider = BrandMenuTheme(brandBoundary.props);
      expect(menuProvider.props.theme).toEqual({
        components: { Menu: brandProfile.theme[isDarkMode ? 'dark' : 'light'].components.Menu },
      });
      render(wrappedHeader);
      expect(screen.getAllByRole('navigation', { name: 'Native data scopes' })).toHaveLength(1);

      mockBrand = 'tiangong';
      expect(
        layout({ initialState: {}, setInitialState: jest.fn() }).headerContentRender,
      ).toBeUndefined();
    },
  );

  it.each([
    { settings: { layout: 'mix', splitMenus: true }, splitMenus: true },
    { settings: { layout: 'mix', splitMenus: false }, splitMenus: false },
    { settings: { layout: 'mix' }, splitMenus: true },
    { settings: { layout: 'side', splitMenus: true }, splitMenus: false },
    { settings: { layout: 'top', splitMenus: true }, splitMenus: false },
    { settings: { splitMenus: false }, splitMenus: false },
    { settings: {}, splitMenus: true },
    { settings: undefined, splitMenus: true },
  ])('enables split menus only for an enabled mixed layout: %p', ({ settings, splitMenus }) => {
    const { layout } = require('@/app');
    const runtimeLayout = layout({
      initialState: { currentUser: { name: 'Alice' }, settings },
      setInitialState: jest.fn(),
    });

    expect(runtimeLayout.splitMenus).toBe(splitMenus);
  });

  it('layout redirects on page change, transforms menu data, and wraps menu items with links', () => {
    const { layout } = require('@/app');
    const setInitialState = jest.fn();
    mockHistory.location.pathname = '/tgdata';
    mockHistory.location.search = '?tid=team-1';

    const runtimeLayout = layout({
      initialState: {
        currentUser: undefined,
        isDarkMode: false,
        settings: { navTheme: 'light' },
      },
      setInitialState,
    });

    expect(runtimeLayout.title).toBe('Localized TianGong');
    runtimeLayout.onPageChange?.();
    expect(mockHistory.push).toHaveBeenCalledWith('/user/login');

    expect(
      runtimeLayout.menuDataRender?.([
        {
          path: '/tgdata',
          children: [{ path: '/tgdata/processes' }],
        },
      ]),
    ).toEqual([]);

    const authenticatedRuntimeLayout = layout({
      initialState: {
        currentUser: { name: 'Alice' },
        isDarkMode: false,
        settings: { navTheme: 'light' },
      },
      setInitialState,
    });

    const transformedMenu = authenticatedRuntimeLayout.menuDataRender?.([
      {
        path: '/tgdata',
        children: [{ path: '/tgdata/processes' }],
      },
      {
        path: '/codata',
        children: [{ path: '/codata/flows' }],
      },
      {
        path: '/mydata',
        children: [{ path: '/mydata/contacts' }],
      },
    ]);

    expect(transformedMenu).toEqual([
      {
        path: '/tgdata',
        children: [{ path: '/tgdata/processes?tid=team-1' }],
      },
      {
        path: '/codata',
        children: [{ path: '/codata/flows?tid=team-1' }],
      },
    ]);

    expect(
      authenticatedRuntimeLayout.menuDataRender?.([
        {
          path: '/tgdata',
        },
      ]),
    ).toEqual([{ path: '/tgdata' }]);

    expect(
      runtimeLayout.menuDataRender?.([
        {
          path: '/mydata',
          children: [{ path: '/mydata/contacts' }],
        },
      ]),
    ).toEqual([]);

    mockHistory.location.search = '';
    const originalMenu = [{ path: '/mydata', children: [{ path: '/mydata/contacts' }] }];
    const [personalMenu] = authenticatedRuntimeLayout.menuDataRender?.(originalMenu);
    expect(personalMenu.path).toBe('/mydata');
    expect(personalMenu.children[0]).toMatchObject({
      key: 'data-navigation:mydata:supporting',
      children: [{ path: '/mydata/contacts' }],
    });
    expect(personalMenu.children[0]).not.toHaveProperty('path');
    expect(originalMenu[0].children).toEqual([{ path: '/mydata/contacts' }]);

    const nativeMenuItem = <span>Native team menu item</span>;
    const renderedMenuItem = authenticatedRuntimeLayout.menuItemRender?.(
      { path: '/team', icon: <span>icon</span>, name: 'Team' },
      nativeMenuItem,
    );

    expect(renderedMenuItem.props.to).toBe('/team');
    expect(renderedMenuItem.props.children).toBe(nativeMenuItem);
    expect(
      authenticatedRuntimeLayout.menuItemRender?.({ isUrl: true }, <span>fallback</span>)?.props
        .children,
    ).toBe('fallback');
  });

  it.each(['tgdata', 'codata', 'mydata', 'tedata'])(
    'switches to the same dataset object in %s using the full menu behind header copies',
    (destination) => {
      const { layout } = require('@/app');
      mockHistory.location.pathname = '/mydata/sources';
      mockHistory.location.search = '?id=old-record&version=1&mode=edit';
      const runtimeLayout = layout({
        initialState: { currentUser: { name: 'Alice' }, settings: {} },
        setInitialState: jest.fn(),
      });
      const input = ['tgdata', 'codata', 'mydata', 'tedata'].map((scope) => ({
        key: `/${scope}`,
        path: `/${scope}`,
        children: ['models', 'processes', 'flows', 'sources'].map((kind) => ({
          path: `/${scope}/${kind}`,
        })),
      }));
      runtimeLayout.menuDataRender(input);
      const nativeScope = <span>Native scope label and icon</span>;
      const link = runtimeLayout.menuItemRender({ path: `/${destination}` }, nativeScope);

      expect(link.props.to).toBe(`/${destination}/sources`);
      expect(link.props.children).toBe(nativeScope);
      expect(mockHistory.push).not.toHaveBeenCalled();
      expect(mockHistory.replace).not.toHaveBeenCalled();
      expect(mockHistory.location.search).toBe('?id=old-record&version=1&mode=edit');
    },
  );

  it.each([false, true])(
    'closes native mobile navigation only for a mobile menu link (isMobile=%s)',
    (isMobile) => {
      const { layout } = require('@/app');
      const onClick = jest.fn();
      const runtimeLayout = layout({
        initialState: { currentUser: { name: 'Alice' }, settings: {} },
        setInitialState: jest.fn(),
      });
      const link = runtimeLayout.menuItemRender(
        { path: '/tgdata/processes', isMobile, onClick },
        <span>Native process label</span>,
      );
      render(link);
      fireEvent.click(screen.getByRole('link', { name: 'Native process label' }));

      expect(onClick).toHaveBeenCalledTimes(isMobile ? 1 : 0);
    },
  );

  it('preserves nested supporting links and restricts scope switches to open/commercial data with tid', () => {
    const { layout } = require('@/app');
    mockHistory.location.pathname = '/tgdata/contacts';
    mockHistory.location.search = '?tid=team%2B1&id=record&mode=view';
    const runtimeLayout = layout({
      initialState: { currentUser: { name: 'Alice' }, settings: {} },
      setInitialState: jest.fn(),
    });
    const input = ['tgdata', 'codata', 'mydata', 'tedata'].map((scope) => ({
      key: `/${scope}`,
      path: `/${scope}`,
      children: [
        'models',
        'processes',
        'flows',
        'flowproperties',
        'unitgroups',
        'sources',
        'contacts',
      ].map((kind) => ({ path: `/${scope}/${kind}` })),
    }));
    const menu = runtimeLayout.menuDataRender([...input, { path: '/data-processing' }]);

    expect(menu.map((item) => item.path)).toEqual(['/tgdata', '/codata']);
    for (const scope of menu) {
      const supporting = scope.children.find((child) => child.key?.endsWith(':supporting'));
      expect(supporting).not.toHaveProperty('path');
      expect(supporting.children.map((child) => child.path)).toEqual(
        ['flowproperties', 'unitgroups', 'sources', 'contacts'].map(
          (kind) => `${scope.path}/${kind}?tid=team%2B1`,
        ),
      );
    }
    expect(
      runtimeLayout.menuItemRender({ path: '/codata' }, <span>Commercial</span>).props.to,
    ).toBe('/codata/contacts?tid=team%2B1');
    expect(input[0].children[0].path).toBe('/tgdata/models');
  });

  it('retains hidden routes and nondata destinations while grouping only native data menus', () => {
    const { layout } = require('@/app');
    mockHistory.location.pathname = '/mydata/processes/analysis';
    const runtimeLayout = layout({
      initialState: { currentUser: { name: 'Alice' }, settings: {} },
      setInitialState: jest.fn(),
    });
    const hiddenExample = { path: '/exampledata', hideInMenu: true };
    const analysis = { path: '/mydata/processes/analysis', hideInMenu: true };
    const managerMenu = { path: '/data-processing', access: 'canDataProductManager' };
    const menu = runtimeLayout.menuDataRender([
      { path: '/mydata', children: [{ path: '/mydata/processes' }, analysis] },
      { path: '/codata', children: [{ path: '/codata/models' }, { path: '/codata/processes' }] },
      hiddenExample,
      managerMenu,
    ]);

    expect(menu[0].children).toContain(analysis);
    expect(menu).toContain(hiddenExample);
    expect(menu).toContain(managerMenu);
    expect(
      runtimeLayout.menuItemRender({ path: '/codata' }, <span>Commercial</span>).props.to,
    ).toBe('/codata/processes');
    const nativeGroup = <span>Supporting Data</span>;
    expect(runtimeLayout.menuItemRender({ key: 'supporting' }, nativeGroup)).toBe(nativeGroup);
    expect(
      runtimeLayout.menuItemRender({ path: '/account?tab=connected-apps' }, <span>Account</span>)
        .props.to,
    ).toBe('/account?tab=connected-apps');
  });

  it.each([
    { currentUser: null, systemStatus: { schemaVersion: 1, phase: 'normal' } },
    {
      currentUser: { name: 'Alice', access: 'admin' },
      systemStatus: { schemaVersion: 1, phase: 'maintenance' },
    },
    {
      currentUser: { name: 'Alice', access: 'data_product_manager' },
      systemStatus: { schemaVersion: 1, phase: 'verifying' },
    },
  ])(
    'does not expose transformed scopes while authentication or maintenance blocks navigation: %p',
    (state) => {
      const { layout } = require('@/app');
      mockHistory.location.search = '?tid=team-1';
      const runtimeLayout = layout({
        initialState: { ...state, settings: {} },
        setInitialState: jest.fn(),
      });

      expect(
        runtimeLayout.menuDataRender([
          { path: '/tgdata', children: [{ path: '/tgdata/contacts' }] },
          { path: '/codata', children: [{ path: '/codata/models' }] },
        ]),
      ).toEqual([]);
      expect(runtimeLayout.avatarProps).toBeUndefined();
      expect(runtimeLayout.actionsRender().map((action) => action.type)).toEqual(
        state.systemStatus.phase === 'normal' ? ['dark-mode', 'select-lang', 'question-link'] : [],
      );
    },
  );

  it.each([
    ['admin', ['Data Dashboard']],
    ['data_product_manager', ['Data Processing']],
    [undefined, []],
    ['member', []],
  ])('keeps exact role shortcut availability for %s', (access, expectedTitles) => {
    const { layout } = require('@/app');
    const runtimeLayout = layout({
      initialState: { currentUser: { access, name: 'Alice' }, settings: {} },
      setInitialState: jest.fn(),
    });
    const shortcuts = runtimeLayout
      .actionsRender()
      .filter((action) => ['NationalCarbonDashboard', 'DataProcessing'].includes(action.key));

    expect(shortcuts.map((action) => action.props.title)).toEqual(expectedTitles);
  });

  it('limits anonymous login header actions and hides the private avatar and menu', () => {
    const { layout } = require('@/app');
    mockHistory.location.pathname = '/user/login';
    const runtimeLayout = layout({
      initialState: {
        currentUser: null,
        isDarkMode: false,
        settings: { navTheme: 'light' },
      },
      setInitialState: jest.fn(),
    });

    const actions = runtimeLayout.actionsRender?.();
    expect(actions).toHaveLength(3);
    expect(actions.map((action: any) => action.type)).toEqual([
      'dark-mode',
      'select-lang',
      'question-link',
    ]);
    expect(runtimeLayout.avatarProps).toBeUndefined();
    expect(runtimeLayout.menuDataRender?.([{ path: '/tgdata' }])).toEqual([]);
  });

  it('falls back to the default formatted app title when no localized title is available', () => {
    mockGetLocalizedAppTitle.mockReturnValueOnce(undefined);
    const { layout } = require('@/app');
    const setInitialState = jest.fn();

    const runtimeLayout = layout({
      initialState: {
        currentUser: { name: 'Alice' },
        isDarkMode: false,
        settings: { navTheme: 'light' },
      },
      setInitialState,
    });

    expect(runtimeLayout.title).toBe('Tiangong LCA');
  });

  it('layout exposes action items, toggles dark mode, and guards children rendering', () => {
    const { layout } = require('@/app');
    const setInitialState = jest.fn();
    mockHistory.location.pathname = '/review';
    mockHistory.location.search = '';

    const runtimeLayout = layout({
      initialState: {
        currentUser: { name: 'Alice' },
        isDarkMode: false,
        settings: { navTheme: 'light', colorPrimary: '#0C246A' },
      },
      setInitialState,
    });

    const actions = runtimeLayout.actionsRender?.();
    expect(actions).toHaveLength(8);
    expect(actions[0].type).toBe('lcia-cache-monitor');
    expect(actions[1].type).toBe('classification-cache-monitor');
    expect(actions[2].type).toBe('location-cache-monitor');
    expect(actions[3].type).toBe('lca-task-center');
    expect(actions[4].type).toBe('notification-center');
    expect(actions[5].type).toBe('dark-mode');
    expect(actions[6].type).toBe('select-lang');
    expect(actions[7].type).toBe('question-link');

    actions[5].props.handleClick();
    expect(setInitialState).toHaveBeenCalledTimes(1);
    const updater = setInitialState.mock.calls[0][0];
    const nextState = updater({
      isDarkMode: false,
      settings: { navTheme: 'light' },
    });
    expect(nextState.isDarkMode).toBe(true);
    expect(nextState.settings).toMatchObject({
      navTheme: 'realDark',
      colorPrimary: '#9e3ffd',
      logo: '/logo_dark.svg',
    });
    expect(window.localStorage.getItem('isDarkMode')).toBe('true');

    expect(runtimeLayout.avatarProps?.title.type()).toEqual(
      <span data-testid='avatar-name'>Avatar Name</span>,
    );
    const avatarTrigger = runtimeLayout.avatarProps?.render?.().props.children;
    expect(avatarTrigger.type).toBe('button');
    expect(avatarTrigger.props.type).toBe('button');
    expect(avatarTrigger.props['aria-haspopup']).toBe('menu');
    expect(runtimeLayout.footerRender).toBe(false);
    expect(runtimeLayout.bgLayoutImgList).toBeUndefined();
    render(runtimeLayout.unAccessible);
    expect(screen.getByTestId('access-denied')).toHaveTextContent('Localized access denied');

    const children = runtimeLayout.childrenRender?.(<div data-testid='child'>child</div>);
    render(children);
    expect(screen.getByTestId('antd-theme-sync')).toHaveAttribute('data-color-primary', '#0C246A');
    expect(screen.getByTestId('antd-theme-sync')).toHaveAttribute(
      'data-algorithm',
      'default-algorithm',
    );
    expect(screen.getByTestId('child')).toHaveTextContent('child');

    mockHistory.location.pathname = '/tgdata/processes';
    const guardedLayout = layout({
      initialState: {
        currentUser: undefined,
        isDarkMode: false,
        settings: { navTheme: 'light' },
      },
      setInitialState,
    });
    expect(guardedLayout.childrenRender?.(<div>child</div>)).toBeNull();
    expect(mockHistory.push).toHaveBeenCalledWith('/user/login');
  });

  it('exposes the mobile menu as one semantic action', () => {
    const { layout } = require('@/app');
    const onCollapse = jest.fn();
    const runtimeLayout = layout({
      initialState: {
        currentUser: { name: 'Alice' },
        isDarkMode: false,
        settings: { navTheme: 'light' },
      },
      setInitialState: jest.fn(),
    });

    const actions = runtimeLayout.actionsRender?.({
      collapsed: false,
      isMobile: true,
      onCollapse,
    });
    const menuAction = actions[0];
    const nativeTriggerClick = jest.fn();

    expect(menuAction.type).toBe('button');
    expect(menuAction.props['aria-label']).toBe('Navigation Mode');

    const nativeTriggerView = render(
      <div data-testid='pro-layout-global-header'>
        <button
          aria-label='Upstream navigation'
          className='ant-pro-global-header-collapsed-button'
          type='button'
          onClick={nativeTriggerClick}
        />
        {menuAction}
      </div>,
    );
    fireEvent.click(nativeTriggerView.getByRole('button', { name: 'Navigation Mode' }));
    expect(nativeTriggerClick).toHaveBeenCalledTimes(1);
    expect(onCollapse).not.toHaveBeenCalled();
    nativeTriggerView.unmount();

    const fallbackView = render(menuAction);
    fireEvent.click(fallbackView.getByRole('button', { name: 'Navigation Mode' }));
    expect(onCollapse).toHaveBeenCalledWith(true);
    fallbackView.unmount();

    render(
      runtimeLayout.collapsedButtonRender?.(
        false,
        <div className='runtime-collapse'>runtime menu</div>,
      ),
    );
    expect(screen.getByRole('button', { name: 'Navigation Mode' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('adds a national carbon dashboard shortcut for admin users', () => {
    const { layout } = require('@/app');
    const setInitialState = jest.fn();

    const runtimeLayout = layout({
      initialState: {
        currentUser: { access: 'admin', name: 'Admin User' },
        isDarkMode: false,
        settings: { navTheme: 'light' },
      },
      setInitialState,
    });

    const actions = runtimeLayout.actionsRender?.();
    expect(actions).toHaveLength(9);
    expect(actions[5].props.title).toBe('Data Dashboard');

    fireEvent.click(render(actions[5]).getByTestId('header-action-icon'));
    expect(mockHistory.push).toHaveBeenCalledWith('/dashboard/national-carbon');
  });

  it('adds a data processing shortcut for data product manager users', () => {
    const { layout } = require('@/app');
    const setInitialState = jest.fn();

    const runtimeLayout = layout({
      initialState: {
        currentUser: { access: 'data_product_manager', name: 'Manager User' },
        isDarkMode: false,
        settings: { navTheme: 'light' },
      },
      setInitialState,
    });

    const actions = runtimeLayout.actionsRender?.();
    const dataProcessingAction = actions.find(
      (action: any) => action.props?.title === 'Data Processing',
    );

    expect(actions).toHaveLength(9);
    expect(dataProcessingAction).toBeTruthy();
    fireEvent.click(render(dataProcessingAction).getByTestId('header-action-icon'));
    expect(mockHistory.push).toHaveBeenCalledWith('/data-processing');
  });

  it('uses the dark theme algorithm when dark mode is enabled', () => {
    const { layout } = require('@/app');
    const setInitialState = jest.fn();
    mockHistory.location.pathname = '/review';

    const runtimeLayout = layout({
      initialState: {
        currentUser: { name: 'Alice' },
        isDarkMode: true,
        settings: { navTheme: 'realDark', colorPrimary: '#9e3ffd' },
      },
      setInitialState,
    });

    render(runtimeLayout.childrenRender?.(<div data-testid='child'>child</div>));

    expect(screen.getByTestId('antd-theme-sync')).toHaveAttribute(
      'data-algorithm',
      'dark-algorithm',
    );
  });

  it('renders the development setting drawer and applies settings changes', () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    jest.resetModules();
    const { layout } = require('@/app');
    const setInitialState = jest.fn();

    const runtimeLayout = layout({
      initialState: {
        currentUser: { name: 'Alice' },
        isDarkMode: false,
        settings: { navTheme: 'light' },
      },
      setInitialState,
    });

    expect(runtimeLayout.links?.[0].props.children[1].props.children).toBe('OpenAPI documentation');

    const rendered = runtimeLayout.childrenRender?.(<div data-testid='child'>child</div>);
    render(rendered);

    expect(screen.getByRole('button', { name: 'Open Page style setting' })).toBeInTheDocument();
    expect(screen.getByTestId('setting-drawer')).toHaveAttribute('data-prefix-cls', 'tg-pro');

    fireEvent.click(screen.getByTestId('setting-drawer'));

    expect(setInitialState).toHaveBeenCalledWith(expect.any(Function));
    const updater = setInitialState.mock.calls[0][0];
    expect(updater({ currentUser: { name: 'Alice' } })).toEqual({
      currentUser: { name: 'Alice' },
      settings: { navTheme: 'dark' },
    });

    process.env.NODE_ENV = previousEnv;
  });
});
