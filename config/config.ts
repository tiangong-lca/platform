import { favicon } from './branding';
import defaultSettings from './defaultSettings';
// https://umijs.org/config/
import { defineConfig } from '@umijs/max';
import {
  DEFAULT_BROWSER_APP_LOCALE,
  LOCALE_REGISTRY,
} from '../src/services/general/localeRegistry';
import proxy from './proxy';
import routes from './routes';
import { applySupabaseFrontendEnv } from './supabaseEnv';

const { REACT_APP_ENV = 'main' } = process.env;

applySupabaseFrontendEnv(process.cwd(), REACT_APP_ENV);

const localeEnvironmentDefines = Object.fromEntries(
  LOCALE_REGISTRY.flatMap(({ environment }) =>
    [environment.titleKey, environment.loginSubtitleKey].map((key) => [
      `process.env.${key}`,
      process.env[key],
    ]),
  ),
);

export default defineConfig({
  /**
   * @name 开启 hash 模式
   * @description 让 build 之后的产物包含 hash 后缀。通常用于增量发布和避免浏览器加载缓存。
   * @doc https://umijs.org/docs/api/config#hash
   */
  hash: true,

  /**
   * @name 兼容性设置
   * @description 设置 ie11 不一定完美兼容，需要检查自己使用的所有依赖
   * @doc https://umijs.org/docs/api/config#targets
   */
  // targets: {
  //   ie: 11,
  // },
  /**
   * @name 路由的配置，不在路由中引入的文件不会编译
   * @description 只支持 path，component，routes，redirect，wrappers，title 的配置
   * @doc https://umijs.org/docs/guides/routes
   */
  // umi routes: https://umijs.org/docs/routing
  routes,
  /**
   * @name moment 的国际化配置
   * @description 如果对国际化没有要求，打开之后能减少js的包大小
   * @doc https://umijs.org/docs/api/config#ignoremomentlocale
   */
  ignoreMomentLocale: true,
  /**
   * @name 代理配置
   * @description 可以让你的本地服务器代理到你的服务器上，这样你就可以访问服务器的数据了
   * @see 要注意以下 代理只能在本地开发时使用，build 之后就无法使用了。
   * @doc 代理介绍 https://umijs.org/docs/guides/proxy
   * @doc 代理配置 https://umijs.org/docs/api/config#proxy
   */
  proxy: proxy[REACT_APP_ENV as keyof typeof proxy],
  /**
   * @name 快速热更新配置
   * @description 一个不错的热更新组件，更新时可以保留 state
   */
  fastRefresh: true,
  //============== 以下都是max的插件配置 ===============
  /**
   * @name 数据流插件
   * @@doc https://umijs.org/docs/max/data-flow
   */
  model: {},
  /**
   * 一个全局的初始数据流，可以用它在插件之间共享数据
   * @description 可以用来存放一些全局的数据，比如用户信息，或者一些全局的状态，全局初始状态在整个 Umi 项目的最开始创建。
   * @doc https://umijs.org/docs/max/data-flow#%E5%85%A8%E5%B1%80%E5%88%9D%E5%A7%8B%E7%8A%B6%E6%80%81
   */
  initialState: {},
  /**
   * @name layout 插件
   * @doc https://umijs.org/docs/max/layout-menu
   */
  layout: {
    locale: true,
    ...defaultSettings,
  },
  /**
   * @name moment2dayjs 插件
   * @description 将项目中的 moment 替换为 dayjs
   * @doc https://umijs.org/docs/max/moment2dayjs
   */
  moment2dayjs: {
    preset: 'antd',
    plugins: ['duration'],
  },
  /**
   * @name 国际化插件
   * @doc https://umijs.org/docs/max/i18n
   */
  locale: {
    default: DEFAULT_BROWSER_APP_LOCALE,
    antd: true,
    title: true,
    useLocalStorage: true,
    // default true, when it is true, will use `navigator.language` overwrite default
    baseNavigator: true,
  },
  /**
   * @name antd 插件
   * @description 内置了 babel import 插件
   * @doc https://umijs.org/docs/max/antd#antd
   */
  antd: {
    appConfig: {},
    configProvider: {},
  },
  /**
   * @name 网络请求配置
   * @description 它基于 axios 和 ahooks 的 useRequest 提供了一套统一的网络请求和错误处理方案。
   * @doc https://umijs.org/docs/max/request
   */
  request: {},
  /**
   * @name 权限插件
   * @description 基于 initialState 的权限插件，必须先打开 initialState
   * @doc https://umijs.org/docs/max/access
   */
  access: {},
  /**
   * @name <head> 中额外的 script
   * @description 配置 <head> 中额外的 script
   */
  headScripts: [{ src: '/scripts/loading.js', async: true }],
  // process.env.NODE_ENV === 'production'
  //   ? [{ src: './scripts/loading.js', async: true }]
  //   : [{ src: '/scripts/loading.js', async: true }],
  // Register the two Pro utilities directly and avoid legacy aggregate dependencies.
  plugins: ['@umijs/max-plugin-openapi', '@umijs/request-record'],
  /**
   * @name openAPI 插件的配置
   * @description 基于 openapi 的规范生成serve 和mock，能减少很多样板代码
   * @doc https://pro.ant.design/zh-cn/docs/openapi/
   */
  // openAPI: [
  //   {
  //     requestLibPath: "import { request } from '@umijs/max'",
  //     // 或者使用在线的版本
  //     // schemaPath: "https://gw.alipayobjects.com/os/antfincdn/M%24jrzTTYJN/oneapi.json"
  //     schemaPath: join(__dirname, 'oneapi.json'),
  //     mock: false,
  //   },
  //   {
  //     requestLibPath: "import { request } from '@umijs/max'",
  //     schemaPath: 'https://gw.alipayobjects.com/os/antfincdn/CA1dOm%2631B/openapi.json',
  //     projectName: 'swagger',
  //   },
  // ],
  mfsu: {
    strategy: 'normal',
  },
  favicons: [favicon],
  /**
   * @name 文档索引策略
   * @description 该地址提供的是登录后使用的应用外壳，不是公开内容；应用路由使用 hash 模式，
   * 因此所有页面都由同一份 index.html 渲染。这里统一声明 noindex，让搜索引擎抓取后不再收录；
   * robots.txt 保持允许抓取，否则爬虫无法读取该指令。公开文档与数据入口在其他站点。
   */
  metas: [{ name: 'robots', content: 'noindex' }],
  esbuildMinifyIIFE: true,
  requestRecord: {},
  // publicPath: process.env.NODE_ENV === 'production' ? './' : '/',
  publicPath: '/',
  history: { type: 'hash' },
  // history: { type: 'memory' },
  // history: { type: 'browser' },
  define: {
    'process.env.SUPABASE_URL': process.env.SUPABASE_URL,
    'process.env.SUPABASE_PUBLISHABLE_KEY': process.env.SUPABASE_PUBLISHABLE_KEY,
    'process.env.APP_LIGHT_PRIMARY': process.env.APP_LIGHT_PRIMARY,
    'process.env.APP_DARK_PRIMARY': process.env.APP_DARK_PRIMARY,
    'process.env.APP_LIGHT_LOGO': process.env.APP_LIGHT_LOGO,
    'process.env.APP_DARK_LOGO': process.env.APP_DARK_LOGO,
    'process.env.APP_LAYOUT': process.env.APP_LAYOUT,
    'process.env.APP_RUNTIME_CONFIG_ENABLED': process.env.APP_RUNTIME_CONFIG_ENABLED,
    ...localeEnvironmentDefines,
  },
});
