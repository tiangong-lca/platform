import { MenuOutlined } from '@ant-design/icons';
import type { ProLayoutProps } from '@ant-design/pro-components';

type HeaderProps = Parameters<Exclude<ProLayoutProps['actionsRender'], boolean | undefined>>[0];

/** Keep the native mobile collapse path, including its supported callback fallback. */
export const renderMobileNavigationAction = (label: string, headerProps: HeaderProps) => (
  <button
    aria-label={label}
    className='tg-pro-layout-mobile-menu-action'
    key='mobile-navigation'
    type='button'
    onClick={(event) => {
      const nativeTrigger = event.currentTarget
        .closest('[data-testid="pro-layout-global-header"]')
        ?.querySelector<HTMLElement>('.ant-pro-global-header-collapsed-button');
      if (nativeTrigger) {
        nativeTrigger.click();
        return;
      }
      headerProps.onCollapse?.(!headerProps.collapsed);
    }}
  >
    <MenuOutlined aria-hidden />
  </button>
);
