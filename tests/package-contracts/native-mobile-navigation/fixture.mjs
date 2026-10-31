// Controlled shell, not the authenticated application or canonical qualification.
// ProLayout owns collapse state, matching Umi's generated layout composition.
import routes from '../../../config/routes';
import menuMessages from '../../../src/locales/fr-FR/menu';
import settingMessages from '../../../src/locales/fr-FR/settingDrawer';
import { brandProfile } from '../../../config/brandProfile';
import { getBrandTheme } from '../../../config/branding';
import { createAntdThemeConfig } from '../../../src/contexts/AntdThemeSync';
import { buildDataNavigation } from '../../../src/components/DataNavigation/navigation';
import { renderDataNavigationText } from '../../../src/components/DataNavigation/menuText';
import {
  AppstoreAddOutlined, ControlOutlined, FolderOpenOutlined, FolderOutlined,
  NodeExpandOutlined, PaperClipOutlined, ProjectOutlined, RetweetOutlined,
  ShareAltOutlined, TeamOutlined, UserOutlined,
} from '@ant-design/icons';

export function mountFixture({
  React,
  createRoot,
  flushSync,
  ProLayout,
  ConfigProvider,
  Popover,
  frenchLocale,
  renderMobileNavigationAction,
  renderDataNavigationHeader,
}) {
  const h = React.createElement;
  const brandTheme = getBrandTheme(true);
  const antdTheme = createAntdThemeConfig(true, brandTheme.colorPrimary);
  const icons = { AppstoreAddOutlined, ControlOutlined, FolderOpenOutlined, FolderOutlined,
    NodeExpandOutlined, PaperClipOutlined, RetweetOutlined, ShareAltOutlined, TeamOutlined, UserOutlined };
  const mapRoute = (item, parent = '') => {
    const name = parent ? `${parent}.${item.name}` : item.name;
    return { ...item, name: menuMessages[`menu.${name}`] || item.name,
      icon: icons[item.icon] ? h(icons[item.icon]) : undefined,
      routes: item.routes?.map((child) => mapRoute(child, name)) };
  };
  // Representative scope tree from product sources, without evaluating user access.
  const menuRoutes = routes.filter((item) =>
    ['/tgdata', '/codata', '/mydata', '/tedata'].includes(item.path),
  ).map((item) => mapRoute(item));
  const originalAdd = window.addEventListener.bind(window);
  const originalRemove = window.removeEventListener.bind(window);
  const listeners = new Map([['keydown', new Map()], ['compositionend', new Map()]]);
  const captureValue = (options) => typeof options === 'boolean' ? options : Boolean(options?.capture);
  window.addEventListener = (type, listener, options) => {
    const entries = listeners.get(type);
    if (entries) {
      if (!entries.has(listener)) entries.set(listener, new Set());
      entries.get(listener).add(captureValue(options));
    }
    return originalAdd(type, listener, options);
  };
  window.removeEventListener = (type, listener, options) => {
    const entries = listeners.get(type);
    entries?.get(listener)?.delete(captureValue(options));
    if (!entries?.get(listener)?.size) entries?.delete(listener);
    return originalRemove(type, listener, options);
  };
  const host = document.getElementById('root');
  const limit = 32;
  let root;
  let scenario = 'navigation-only';
  let events = [];
  let collapseCalls = [];
  let overflow = false;
  let committed = false;
  let opener = null;
  let popupOpen = false;
  let changePopup;
  let started = performance.now();
  let compositionEndCount = 0;
  let lastCompositionEnd = null;
  let animationVisits = 0;
  const record = (array, item) => {
    if (array.length === limit) overflow = true;
    else array.push(item);
  };
  const count = (selector, predicate = () => true) => {
    const found = document.querySelectorAll(selector);
    if (found.length > limit) overflow = true;
    return Array.from(found).slice(0, limit).filter(predicate).length;
  };
  const visible = (element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.visibility === 'visible' && box.width > 0 && box.height > 0;
  };
  const moving = (element) => {
    const animations = element.getAnimations({ subtree: true });
    if (animationVisits + animations.length > limit) overflow = true;
    const inspected = animations.slice(0, Math.max(0, limit - animationVisits));
    animationVisits += inspected.length;
    return inspected.some((animation) =>
      animation.playState === 'running' || animation.pending,
    );
  };
  const focus = () => {
    const active = document.activeElement;
    if (active === opener) return 'opener';
    if (active?.closest('.fixture-competing-popup')) return 'controlled-popup';
    if (active?.closest('.ant-pro-drawer-sider,.ant-drawer')) return 'navigation';
    if (active === document.body || active === document.documentElement) return 'body';
    return 'other';
  };
  const state = () => {
    animationVisits = 0;
    return {
    navigationVisibleCount: count('.ant-pro-drawer-sider', visible),
    navigationOpenCount: count('.ant-pro-drawer-sider', (node) =>
      node.closest('.ant-drawer')?.classList.contains('ant-drawer-open'),
    ),
    navigationMotionCount: count('.ant-pro-drawer-sider', (node) =>
      moving(node.closest('.ant-drawer-content-wrapper') || node),
    ),
    popupVisibleCount: count('.fixture-competing-popup', visible),
    popupMotionCount: count('.fixture-competing-popup', moving),
    popupClosingCount: count('.fixture-competing-popup', (node) =>
      node.classList.contains('ant-zoom-big-leave-active'),
    ),
    otherPopoverVisibleCount: count('.ant-popover:not(.fixture-competing-popup)', visible),
    otherTooltipVisibleCount: count('.ant-tooltip:not(.fixture-competing-popup)', visible),
    menuActionHovered: Boolean(document.querySelector('.tg-pro-layout-mobile-menu-action')?.matches(':hover')),
    popupOpen,
    focus: focus(),
    };
  };
  const keydown = (event) => {
    if (!['Enter', 'Escape'].includes(event.key)) return;
    if (event.key === 'Enter' && event.target.closest('.tg-pro-layout-mobile-menu-action'))
      opener = event.target;
    record(events, {
      key: event.key === 'Enter' ? 'enter' : 'escape',
      trusted: event.isTrusted,
      composing: event.isComposing,
      elapsedMs: Math.min(300000, Math.floor(performance.now() - started)),
      recentCompositionEnd: lastCompositionEnd !== null && Date.now() - lastCompositionEnd < 200,
      ...state(),
    });
  };
  document.addEventListener('keydown', keydown, true);
  const compositionend = () => {
    if (compositionEndCount === limit) overflow = true;
    else compositionEndCount++;
    lastCompositionEnd = Date.now();
  };
  document.addEventListener('compositionend', compositionend, true);
  function ControlledPopup() {
    const [open, setOpen] = React.useState(false);
    React.useLayoutEffect(() => {
      changePopup = setOpen;
      popupOpen = open;
      return () => { changePopup = undefined; };
    }, [open]);
    return h(Popover, {
      open,
      onOpenChange: setOpen,
      trigger: 'click',
      content: h('span', null, 'Controlled popup'),
      classNames: { root: 'fixture-competing-popup' },
    }, h('button', { type: 'button' }, 'Controlled popup anchor'));
  }
  function Shell() {
    React.useLayoutEffect(() => { committed = true; return () => { committed = false; }; }, []);
    return h(ConfigProvider, { theme: antdTheme, locale: frenchLocale },
      h(ProLayout, {
        ...brandTheme,
        // Generated Umi Layout.tsx adds no collapsed prop or state-owning onCollapse.
        // This callback observes the native microtask; its return does not control state.
        onCollapse: (value) => record(collapseCalls, value),
        layout: 'mix',
        splitMenus: true,
        fixSiderbar: true,
        fixedHeader: false,
        siderWidth: 256,
        title: brandProfile.title['fr-FR'],
        location: { pathname: '/mydata/processes' },
        route: { routes: menuRoutes },
        menu: { defaultOpenAll: true, autoClose: false, locale: false },
        menuDataRender: (data) => buildDataNavigation(data, {
          supportingLabel: menuMessages['menu.supportingData'],
          supportingIcon: h(ProjectOutlined), search: '',
        }),
        menuTextRender: renderDataNavigationText,
        headerRender: renderDataNavigationHeader,
        actionsRender: (props) => props.isMobile
          ? [renderMobileNavigationAction(settingMessages['app.setting.navigationmode'], props)] : [],
        menuExtraRender: scenario === 'descendant-popup-closing'
          ? () => h(ControlledPopup) : undefined,
      }, h('main', null, 'Controlled process list')),
    );
  }
  function configure(next) {
    if (!['navigation-only', 'descendant-popup-closing'].includes(next))
      throw Error('Unknown controlled scenario');
    if (root) flushSync(() => root.unmount());
    scenario = next;
    events = [];
    collapseCalls = [];
    committed = false;
    opener = null;
    popupOpen = false;
    overflow = false;
    started = performance.now();
    compositionEndCount = 0;
    lastCompositionEnd = null;
    root = createRoot(host);
    flushSync(() => root.render(h(Shell)));
  }
  function setPopup(open) {
    if (scenario !== 'descendant-popup-closing' || !changePopup)
      throw Error('Controlled popup not ready');
    flushSync(() => changePopup(open));
  }
  function snapshot() {
    return {
      scenario,
      committed,
      overflow,
      openerConnected: Boolean(opener?.isConnected),
      restoredOpener: Boolean(opener) && opener === document.activeElement,
      events: events.slice(),
      collapseCalls: collapseCalls.slice(),
      compositionEndCount,
      ...state(),
    };
  }
  function dispose() {
    if (root) flushSync(() => root.unmount());
    root = null;
    document.removeEventListener('keydown', keydown, true);
    document.removeEventListener('compositionend', compositionend, true);
    const remaining = Object.fromEntries([...listeners].map(([type, entries]) =>
      [type, [...entries.values()].reduce((sum, values) => sum + values.size, 0)],
    ));
    window.addEventListener = originalAdd;
    window.removeEventListener = originalRemove;
    return { componentDisposed: !committed, observerDisposed: true, remaining, overflow };
  }
  window.mobileNavigationControl = Object.freeze({ configure, setPopup, snapshot, dispose });
  configure('navigation-only');
}
