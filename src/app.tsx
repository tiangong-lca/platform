import { brandProfile } from '../config/brandProfile';
import { BrandMenuTheme, renderBrandHeaderMenu } from '@/contexts/BrandMenuTheme';
import { buildDataNavigation, resolveDataScopeLink } from '@/components/DataNavigation/navigation';
import { renderDataNavigationHeader } from '@/components/DataNavigation/header';
import { renderDataNavigationText } from '@/components/DataNavigation/menuText';
import './components/BrandPresentation/style.less';
import {
  AvatarDropdown,
  AvatarName,
  DarkMode,
  ExportTidasPackage,
  HeaderActionIcon,
  ImportTidasPackage,
  LcaTaskCenter,
  Notification,
  Question,
  SelectLangAction,
} from '@/components';
import AccessDenied from '@/components/AccessDenied';
import { renderAccessibleCollapsedButton } from '@/components/AccessibleCollapsedButton';
import { renderMobileNavigationAction } from '@/components/MobileNavigationAction';
import AccessibleSettingDrawer from '@/components/AccessibleSettingDrawer';
import LCIACacheMonitor from '@/components/LCIACacheMonitor';
import SystemMaintenance from '@/components/SystemMaintenance';
import {
  AppBootMarker,
  StaticFallbackErrorBoundary,
} from '@/components/SystemMaintenance/AppBootBoundary';
import { Link, getIntl, history } from '@umijs/max';

import { getCurrentUser as queryCurrentUser } from '@/services/auth';
import { subscribeToPasswordRecovery } from '@/services/auth/recovery';
import { LOGIN_PATH, isAnonymousAllowedPath } from '@/services/general/publicRoutePolicy';
import { resolveBrowserRuntimeLocale } from '@/services/general/runtimeLocale';
import {
  getSystemStatus,
  isSystemMaintenanceActive,
  type SystemStatus,
} from '@/services/general/systemStatus';
import { getSystemUserRoleApi } from '@/services/roles/api';
import {
  bindTaskCenterOwner,
  getTaskCenterIdentityGeneration,
  subscribeToTaskCenterAuthChanges,
} from '@/services/auth/taskCenters';
import { reloadBrowserPage } from '@/utils/browserNavigation';
import { readBrowserStorage, writeBrowserStorage } from '@/services/general/browserStorage';
import { AntdAppApiRegistrar } from '@/contexts/AntdAppContext';
import { AntdThemeSync, createAntdThemeConfig } from '@/contexts/AntdThemeSync';
import {
  DashboardOutlined,
  DatabaseOutlined,
  LinkOutlined,
  ProjectOutlined,
} from '@ant-design/icons';
import type { MenuDataItem, Settings as LayoutSettings } from '@ant-design/pro-components';
import type { RunTimeLayoutConfig, RuntimeAntdConfig } from '@umijs/max';
import { Fragment, type ReactNode } from 'react';
import { getBrandTheme } from '../config/branding';
import defaultSettings, { defaultAppTitle, getLocalizedAppTitle } from '../config/defaultSettings';
import ClassificationCacheMonitor from './components/ClassificationCacheMonitor';
import LocationCacheMonitor from './components/LocationCacheMonitor';
import { errorConfig } from './requestErrorConfig';

const isDev = process.env.NODE_ENV === 'development';
const dashboardPath = '/dashboard/national-carbon';
const dataProcessingPath = '/data-processing';
const recoveryFormPath = '/user/login/password_reset';
const systemAccessByRole = new Map<string, Auth.CurrentUser['access']>([
  ['admin', 'admin'],
  ['owner', 'admin'],
  ['data_product_manager', 'data_product_manager'],
]);

subscribeToTaskCenterAuthChanges(() => reloadBrowserPage(window.location));

subscribeToPasswordRecovery(() => {
  history.replace(recoveryFormPath);
});

export const antd: RuntimeAntdConfig = (memo) => {
  const isDarkMode = readBrowserStorage('isDarkMode') === 'true';
  const brandTheme = getBrandTheme(isDarkMode);
  const themeConfig = createAntdThemeConfig(isDarkMode, brandTheme.colorPrimary);
  return {
    ...memo,
    message: {
      ...memo.message,
      styles: (info) => {
        const styles =
          typeof memo.message?.styles === 'function'
            ? memo.message.styles(info)
            : memo.message?.styles;
        return {
          ...styles,
          // Messages are non-modal feedback. Keep their transparent full-width
          // list clear of header input; individual notices retain native hover.
          listContent: { ...styles?.listContent, pointerEvents: 'none' },
        };
      },
    },
    theme: {
      ...memo.theme,
      ...themeConfig,
      token: {
        ...memo.theme?.token,
        ...themeConfig.token,
        colorPrimary: brandTheme.colorPrimary,
      },
      components: {
        ...memo.theme?.components,
        ...themeConfig.components,
        Divider: {
          ...memo.theme?.components?.Divider,
          ...themeConfig.components?.Divider,
        },
      },
    },
  };
};

/**
 * Umi asks this runtime hook for the locale before mounting its providers, so
 * supported aliases are canonicalized before any visible app render.
 */
export const locale = {
  getLocale: resolveBrowserRuntimeLocale,
};

/**
 * Wraps every Umi route, including routes that opt out of ProLayout with
 * `layout: false`, in the shared boot-success and render-failure boundary.
 */
export function rootContainer(container: ReactNode) {
  return (
    <StaticFallbackErrorBoundary>
      <AppBootMarker>{container}</AppBootMarker>
    </StaticFallbackErrorBoundary>
  );
}

/**
 * Umi applies the Ant Design plugin's inner provider after this hook, placing
 * the registrar inside the one global `<App>` for every route shape.
 */
export function innerProvider(container: ReactNode) {
  return <AntdAppApiRegistrar>{container}</AntdAppApiRegistrar>;
}

async function getSystemAccess(): Promise<Auth.CurrentUser['access'] | undefined> {
  try {
    const systemUserRole = await getSystemUserRoleApi();
    return systemAccessByRole.get(systemUserRole?.role ?? '');
  } catch {
    return undefined;
  }
}

/**
 * @see  https://umijs.org/zh-CN/plugins/plugin-initial-state
 * */
export async function getInitialState(): Promise<{
  settings?: Partial<LayoutSettings>;
  currentUser?: Auth.CurrentUser | null;
  loading?: boolean;
  isDarkMode?: boolean;
  fetchUserInfo?: () => Promise<Auth.CurrentUser | null>;
  systemStatus?: SystemStatus;
}> {
  const fetchUserInfo = async (): Promise<Auth.CurrentUser | null> => {
    // INITIAL_SESSION can settle during the first claims lookup. Re-read once
    // against the new epoch rather than admitting a stale or ownerless user.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const identityGeneration = getTaskCenterIdentityGeneration();
      try {
        const msg = await queryCurrentUser();
        if (identityGeneration !== getTaskCenterIdentityGeneration()) continue;
        if (!msg) {
          bindTaskCenterOwner(null, identityGeneration);
          history.push(LOGIN_PATH);
          return null;
        }
        const access = await getSystemAccess();
        if (identityGeneration !== getTaskCenterIdentityGeneration()) continue;
        if (!bindTaskCenterOwner(msg.userid, identityGeneration)) return null;
        return { ...msg, access };
      } catch (error) {
        if (identityGeneration !== getTaskCenterIdentityGeneration()) continue;
        bindTaskCenterOwner(null, identityGeneration);
        history.push(LOGIN_PATH);
        return null;
      }
    }
    return null;
  };

  const isDarkMode = readBrowserStorage('isDarkMode') === 'true';
  const brandTheme = getBrandTheme(isDarkMode);
  const updatedSettings = {
    ...defaultSettings,
    ...brandTheme,
  };

  // Maintenance is intentionally checked before authentication. This is a
  // single startup read; a browser refresh is required to check it again.
  const systemStatus = await getSystemStatus();
  if (isSystemMaintenanceActive(systemStatus)) {
    bindTaskCenterOwner(null);
    return {
      fetchUserInfo,
      settings: updatedSettings as Partial<LayoutSettings>,
      isDarkMode,
      systemStatus,
    };
  }

  const { location } = history;
  if (!isAnonymousAllowedPath(location.pathname)) {
    const currentUser = await fetchUserInfo();
    return {
      fetchUserInfo,
      currentUser,
      settings: updatedSettings as Partial<LayoutSettings>,
      isDarkMode,
      systemStatus,
    };
  }
  bindTaskCenterOwner(null);
  return {
    fetchUserInfo,
    settings: updatedSettings as Partial<LayoutSettings>,
    isDarkMode,
    systemStatus,
  };
}

// ProLayout 支持的api https://procomponents.ant.design/components/layout
export const layout: RunTimeLayoutConfig = ({ initialState, setInitialState }) => {
  const { formatMessage, locale } = getIntl();
  const appTitle =
    getLocalizedAppTitle(locale) ??
    formatMessage({ id: 'pages.name', defaultMessage: defaultAppTitle });
  const canViewDashboard = initialState?.currentUser?.access === 'admin';
  const canViewDataProcessing = initialState?.currentUser?.access === 'data_product_manager';
  const maintenanceActive = isSystemMaintenanceActive(initialState?.systemStatus);
  let navigationMenuData: MenuDataItem[] = [];
  const handleClickFunction = () => {
    setInitialState((prevState: any) => {
      const newState = {
        ...prevState,
        isDarkMode: !prevState.isDarkMode,
      };
      writeBrowserStorage('isDarkMode', newState.isDarkMode.toString());
      const brandTheme = getBrandTheme(newState.isDarkMode);
      const updatedSettings = {
        ...newState.settings,
        ...brandTheme,
      };

      return { ...newState, settings: updatedSettings };
    });
  };
  return {
    className: brandProfile.id === 'atlas' ? 'atlas-app-shell' : undefined,
    actionsRender: (headerProps = {}) => {
      if (maintenanceActive) {
        return [];
      }
      const publicActions = [
        <DarkMode
          key='DarkMode'
          handleClick={handleClickFunction}
          isDarkMode={initialState?.isDarkMode}
        />,
        <SelectLangAction key='SelectLang' />,
        <Question key='doc' />,
      ];
      if (!initialState?.currentUser) {
        return publicActions;
      }

      const actions = [
        <LCIACacheMonitor key='LCIACacheMonitor' />,
        <ClassificationCacheMonitor key='ClassificationCacheMonitor' />,
        <LocationCacheMonitor key='LocaltionCacheMonitor' />,
        <ImportTidasPackage key='ImportTidasPackage' />,
        <ExportTidasPackage key='ExportTidasPackage' />,
        <LcaTaskCenter key={`LcaTaskCenter:${initialState.currentUser.userid}`} />,
        <Notification key='Notification' />,
        ...publicActions,
      ];

      if (headerProps.isMobile) {
        actions.unshift(
          renderMobileNavigationAction(
            formatMessage({
              id: 'app.setting.navigationmode',
              defaultMessage: 'Navigation Mode',
            }),
            headerProps,
          ),
        );
      }

      if (canViewDashboard) {
        actions.splice(
          5,
          0,
          <HeaderActionIcon
            aria-label={formatMessage({
              id: 'menu.dashboard.nationalCarbon',
              defaultMessage: 'Data Dashboard',
            })}
            key='NationalCarbonDashboard'
            icon={<DashboardOutlined />}
            onClick={() => history.push(dashboardPath)}
            title={formatMessage({
              id: 'menu.dashboard.nationalCarbon',
              defaultMessage: 'Data Dashboard',
            })}
          />,
        );
      }

      if (canViewDataProcessing) {
        actions.splice(
          5,
          0,
          <HeaderActionIcon
            aria-label={formatMessage({
              id: 'menu.dataProcessing',
              defaultMessage: 'Data Processing',
            })}
            key='DataProcessing'
            icon={<DatabaseOutlined />}
            onClick={() => history.push(dataProcessingPath)}
            title={formatMessage({
              id: 'menu.dataProcessing',
              defaultMessage: 'Data Processing',
            })}
          />,
        );
      }

      return actions;
    },
    avatarProps:
      !maintenanceActive && initialState?.currentUser
        ? {
            title: <AvatarName />,
            render: () => {
              return (
                <AvatarDropdown>
                  <button
                    aria-haspopup='menu'
                    aria-label={formatMessage({
                      id: 'menu.account.center',
                      defaultMessage: 'Account Center',
                    })}
                    className='tg-global-header-avatar-trigger'
                    data-testid='docs-capture-authenticated'
                    type='button'
                  >
                    <AvatarName />
                  </button>
                </AvatarDropdown>
              );
            },
          }
        : undefined,
    footerRender: false,
    onPageChange: () => {
      if (maintenanceActive) {
        return;
      }
      const { location } = history;
      // Only the login and account-recovery flow can render anonymously.
      if (!initialState?.currentUser && !isAnonymousAllowedPath(location.pathname)) {
        history.push(LOGIN_PATH);
      }
    },
    links: isDev
      ? [
          <Link key='openapi' to='/umi/plugin/openapi' target='_blank'>
            <LinkOutlined />
            <span>
              {formatMessage({
                id: 'component.globalHeader.openapiDocumentation',
                defaultMessage: 'OpenAPI documentation',
              })}
            </span>
          </Link>,
        ]
      : [],
    menuHeaderRender: undefined,
    // Route-level access checks must use the same catalog-backed boundary as page-level checks.
    unAccessible: <AccessDenied />,
    // 增加一个 loading 的状态
    childrenRender: (children) => {
      const renderedChildren = maintenanceActive ? (
        <SystemMaintenance status={initialState!.systemStatus!} />
      ) : (
        children
      );
      // 初始渲染兜底：onPageChange 只在路由变化时触发，首次进入需要再判断一次
      if (
        !maintenanceActive &&
        !initialState?.currentUser &&
        !isAnonymousAllowedPath(history.location.pathname)
      ) {
        history.push(LOGIN_PATH);
        return null;
      }
      // if (initialState?.loading) return <PageLoading />;
      return (
        <>
          <AntdThemeSync
            colorPrimary={initialState?.settings?.colorPrimary}
            isDarkMode={Boolean(initialState?.isDarkMode)}
          />
          {renderedChildren}
          {isDev && !maintenanceActive && (
            <AccessibleSettingDrawer
              closeLabel={`${formatMessage({ id: 'app.settings.close', defaultMessage: 'Close' })} ${formatMessage({ id: 'app.setting.pagestyle', defaultMessage: 'Page style setting' })}`}
              disableUrlParams
              enableDarkTheme
              openLabel={`${formatMessage({ id: 'app.settings.open', defaultMessage: 'Open' })} ${formatMessage({ id: 'app.setting.pagestyle', defaultMessage: 'Page style setting' })}`}
              settings={initialState?.settings}
              onSettingChange={(settings) => {
                setInitialState((preInitialState: any) => ({
                  ...preInitialState,
                  settings,
                }));
              }}
            />
          )}
        </>
      );
    },
    menuDataRender: (menuDataProps) => {
      if (maintenanceActive || !initialState?.currentUser) {
        navigationMenuData = [];
        return navigationMenuData;
      }
      navigationMenuData = buildDataNavigation(menuDataProps, {
        supportingLabel: formatMessage({
          id: 'menu.supportingData',
          defaultMessage: 'Supporting Data',
        }),
        supportingIcon: <ProjectOutlined />,
        search: history.location.search,
      });
      return navigationMenuData;
    },
    menuItemRender: (menuItemProps, defaultDom) => {
      if (menuItemProps.isUrl || !menuItemProps.path) {
        return defaultDom;
      }
      return (
        <Link
          to={resolveDataScopeLink(
            menuItemProps,
            history.location.pathname,
            history.location.search,
            navigationMenuData,
          )!}
          onClick={menuItemProps.isMobile ? menuItemProps.onClick : undefined}
        >
          {defaultDom}
        </Link>
      );
    },
    ...initialState?.settings,
    splitMenus:
      (initialState?.settings?.layout ?? defaultSettings.layout) === 'mix' &&
      (initialState?.settings?.splitMenus ?? defaultSettings.splitMenus),
    headerRender: renderDataNavigationHeader,
    menuTextRender: renderDataNavigationText,
    menu: { ...initialState?.settings?.menu, defaultOpenAll: true, autoClose: false },
    menuContentRender: (props, defaultDom) => {
      // Seed native expansion when entering another split scope; ordinary object
      // navigation keeps the same Menu instance and the user's open/closed state.
      const menuKey =
        props.layout === 'mix' && props.splitMenus && !props.isMobile
          ? (props.menuData?.[0]?.key ?? 'empty-data-scope')
          : 'full-menu';
      return brandProfile.id === 'atlas' ? (
        <BrandMenuTheme key={menuKey} isDarkMode={!!initialState?.isDarkMode}>
          {defaultDom}
        </BrandMenuTheme>
      ) : (
        <Fragment key={menuKey}>{defaultDom}</Fragment>
      );
    },
    headerContentRender:
      brandProfile.id === 'atlas'
        ? (_props, defaultDom) => renderBrandHeaderMenu(defaultDom, !!initialState?.isDarkMode)
        : undefined,
    collapsedButtonRender: (collapsed, defaultDom) =>
      renderAccessibleCollapsedButton(
        formatMessage({
          id: 'app.setting.navigationmode',
          defaultMessage: 'Navigation Mode',
        }),
        defaultDom,
        collapsed,
      ),
    title: brandProfile.presentation?.navigationTitle ?? appTitle,
  };
};

/**
 * @name request 配置，可以配置错误处理
 * 它基于 axios 和 ahooks 的 useRequest 提供了一套统一的网络请求和错误处理方案。
 * @doc https://umijs.org/docs/max/request#配置
 */
export const request = {
  ...errorConfig,
};
