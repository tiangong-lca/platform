/**
 * @name umi 的路由配置
 * @description 只支持 path,component,routes,redirect,wrappers,name,icon 的配置
 * @param path  path 只支持两种占位符配置，第一种是动态参数 :id 的形式，第二种是 * 通配符，通配符只能出现路由字符串的最后。
 * @param component 配置 location 和 path 匹配后用于渲染的 React 组件路径。可以是绝对路径，也可以是相对路径，如果是相对路径，会从 src/pages 开始找起。
 * @param routes 配置子路由，通常在需要为多个路径增加 layout 组件时使用。
 * @param redirect 配置路由跳转
 * @param wrappers 配置路由组件的包装组件，通过包装组件可以为当前的路由组件组合进更多的功能。 比如，可以用于路由级别的权限校验
 * @param name 配置路由的标题，默认读取国际化文件 menu.ts 中 menu.xxxx 的值，如配置 name 为 login，则读取 menu.ts 中 menu.login 的取值作为标题
 * @param icon 配置路由的图标，取值参考 https://ant.design/components/icon-cn， 注意去除风格后缀和大小写，如想要配置图标为 <StepBackwardOutlined /> 则取值应为 stepBackward 或 StepBackward，如想要配置图标为 <UserOutlined /> 则取值应为 user 或者 User
 * @doc https://umijs.org/docs/guides/routes
 */
export default [
  {
    path: '/dashboard/national-carbon',
    access: 'canAdmin',
    layout: false,
    menu: false,
    wrappers: ['@/wrappers/AuthGuard'],
    component: './NationalCarbonDashboard',
  },
  {
    path: '/manageSystem',
    name: 'manageSystem',
    icon: 'TeamOutlined',
    component: './ManageSystem',
    hideInMenu: true,
  },
  {
    path: '/review',
    name: 'review',
    component: './Review',
    icon: 'TeamOutlined',
    hideInMenu: true,
  },
  {
    path: '/tgdata',
    name: 'tgdata',
    icon: 'FolderOpenOutlined',
    routes: [
      {
        path: '/tgdata',
        redirect: '/tgdata/models',
      },
      {
        name: 'models',
        path: '/tgdata/models',
        icon: 'AppstoreAddOutlined',
        component: './LifeCycleModels',
      },
      {
        name: 'processes',
        icon: 'ShareAltOutlined',
        path: '/tgdata/processes',
        component: './Processes',
      },
      {
        name: 'flows',
        icon: 'NodeExpandOutlined',
        path: '/tgdata/flows',
        component: './Flows',
      },
      {
        name: 'flowproperties',
        icon: 'ControlOutlined',
        path: '/tgdata/flowproperties',
        component: './Flowproperties',
      },
      {
        name: 'unitgroups',
        icon: 'RetweetOutlined',
        path: '/tgdata/unitgroups',
        component: './Unitgroups',
      },
      {
        name: 'sources',
        icon: 'PaperClipOutlined',
        path: '/tgdata/sources',
        component: './Sources',
      },
      {
        name: 'contacts',
        icon: 'TeamOutlined',
        path: '/tgdata/contacts',
        component: './Contacts',
      },
    ],
  },
  {
    path: '/exampledata',
    name: 'exampledata',
    hideInMenu: true,
    icon: 'FolderOpenOutlined',
    routes: [
      {
        path: '/exampledata',
        redirect: '/exampledata/models',
      },
      {
        name: 'models',
        path: '/exampledata/models',
        icon: 'AppstoreAddOutlined',
        component: './LifeCycleModels',
      },
      {
        name: 'processes',
        icon: 'ShareAltOutlined',
        path: '/exampledata/processes',
        component: './Processes',
      },
      {
        name: 'flows',
        icon: 'NodeExpandOutlined',
        path: '/exampledata/flows',
        component: './Flows',
      },
      {
        name: 'flowproperties',
        icon: 'ControlOutlined',
        path: '/exampledata/flowproperties',
        component: './Flowproperties',
      },
      {
        name: 'unitgroups',
        icon: 'RetweetOutlined',
        path: '/exampledata/unitgroups',
        component: './Unitgroups',
      },
      {
        name: 'sources',
        icon: 'PaperClipOutlined',
        path: '/exampledata/sources',
        component: './Sources',
      },
      {
        name: 'contacts',
        icon: 'TeamOutlined',
        path: '/exampledata/contacts',
        component: './Contacts',
      },
    ],
  },
  {
    path: '/codata',
    name: 'codata',
    icon: 'FolderOutlined',
    routes: [
      {
        path: '/codata',
        redirect: '/codata/models',
      },
      {
        name: 'models',
        path: '/codata/models',
        icon: 'AppstoreAddOutlined',
        component: './LifeCycleModels',
      },
      {
        name: 'processes',
        icon: 'ShareAltOutlined',
        path: '/codata/processes',
        component: './Processes',
      },
      {
        name: 'flows',
        icon: 'NodeExpandOutlined',
        path: '/codata/flows',
        component: './Flows',
      },
      {
        name: 'flowproperties',
        icon: 'ControlOutlined',
        path: '/codata/flowproperties',
        component: './Flowproperties',
      },
      {
        name: 'unitgroups',
        icon: 'RetweetOutlined',
        path: '/codata/unitgroups',
        component: './Unitgroups',
      },
      {
        name: 'sources',
        icon: 'PaperClipOutlined',
        path: '/codata/sources',
        component: './Sources',
      },
      {
        name: 'contacts',
        icon: 'TeamOutlined',
        path: '/codata/contacts',
        component: './Contacts',
      },
    ],
  },
  {
    path: '/mydata',
    name: 'mydata',
    icon: 'UserOutlined',
    routes: [
      {
        path: '/mydata',
        redirect: '/mydata/models',
      },
      {
        name: 'models',
        path: '/mydata/models',
        icon: 'AppstoreAddOutlined',
        component: './LifeCycleModels',
      },
      {
        name: 'processAnalysis',
        icon: 'BarChartOutlined',
        path: '/mydata/processes/analysis',
        component: './Processes/Analysis',
        hideInMenu: true,
      },
      {
        name: 'processes',
        icon: 'ShareAltOutlined',
        path: '/mydata/processes',
        component: './Processes',
      },
      {
        name: 'flows',
        icon: 'NodeExpandOutlined',
        path: '/mydata/flows',
        component: './Flows',
      },
      {
        name: 'flowproperties',
        icon: 'ControlOutlined',
        path: '/mydata/flowproperties',
        component: './Flowproperties',
      },
      {
        name: 'unitgroups',
        icon: 'RetweetOutlined',
        path: '/mydata/unitgroups',
        component: './Unitgroups',
      },
      {
        name: 'sources',
        icon: 'PaperClipOutlined',
        path: '/mydata/sources',
        component: './Sources',
      },
      {
        name: 'contacts',
        icon: 'TeamOutlined',
        path: '/mydata/contacts',
        component: './Contacts',
      },
    ],
  },
  {
    path: '/tedata',
    name: 'tedata',
    icon: 'TeamOutlined',
    routes: [
      {
        path: '/tedata',
        redirect: '/tedata/models',
      },
      {
        name: 'models',
        path: '/tedata/models',
        icon: 'AppstoreAddOutlined',
        component: './LifeCycleModels',
      },
      {
        name: 'processes',
        icon: 'ShareAltOutlined',
        path: '/tedata/processes',
        component: './Processes',
      },
      {
        name: 'flows',
        icon: 'NodeExpandOutlined',
        path: '/tedata/flows',
        component: './Flows',
      },
      {
        name: 'flowproperties',
        icon: 'ControlOutlined',
        path: '/tedata/flowproperties',
        component: './Flowproperties',
      },
      {
        name: 'unitgroups',
        icon: 'RetweetOutlined',
        path: '/tedata/unitgroups',
        component: './Unitgroups',
      },
      {
        name: 'sources',
        icon: 'PaperClipOutlined',
        path: '/tedata/sources',
        component: './Sources',
      },
      {
        name: 'contacts',
        icon: 'TeamOutlined',
        path: '/tedata/contacts',
        component: './Contacts',
      },
    ],
  },
  {
    path: '/data-processing',
    name: 'dataProcessing',
    access: 'canDataProductManager',
    icon: 'DatabaseOutlined',
    component: './DataProcessing',
  },
  {
    path: '/dataset-display-settings',
    name: 'datasetDisplaySettings',
    icon: 'SettingOutlined',
    access: 'canDataProductManager',
    component: './DatasetDisplaySettings',
  },
  {
    name: 'displayedDatasets',
    path: '/displayed-datasets',
    component: './DisplayedDatasets',
    hideInMenu: true,
  },
  {
    path: '/account',
    name: 'account',
    menu: false,
    icon: 'UserOutlined',
    component: './Account',
  },
  {
    path: '/team',
    name: 'team',
    menu: false,
    icon: 'UserOutlined',
    component: './Teams',
  },
  {
    path: '/oauth/consent',
    layout: false,
    menu: false,
    component: './OAuth/Consent',
  },
  {
    path: '/user',
    layout: false,
    routes: [
      {
        path: '/user',
        redirect: '/user/login',
      },
      {
        name: 'login',
        path: '/user/login',
        wrappers: ['@/wrappers/LoginFlowGuard'],
        component: './User/Login',
      },
      {
        name: 'passwordForget',
        path: '/user/login/password_forgot',
        wrappers: ['@/wrappers/LoginFlowGuard'],
        component: './User/Login/password_forgot',
      },
      {
        name: 'passwordReset',
        path: '/user/login/password_reset',
        wrappers: ['@/wrappers/LoginFlowGuard'],
        component: './User/Login/password_reset',
      },
    ],
  },
  {
    path: '/welcome',
    menu: false,
    name: 'welcome',
    component: './Welcome',
  },
  {
    path: '/',
    redirect: '/welcome',
    keepQuery: true,
  },
  {
    path: '*',
    layout: false,
    wrappers: ['@/wrappers/AuthGuard'],
    component: './404',
  },
];
