export const PRO_COMPONENT_RUNTIME_TAGS = [
  'ProTable',
  'DragSortTable',
  'ProForm',
  'PageContainer',
  'ProLayout',
  'LoginForm',
  'TableDropdown',
  'SettingDrawer',
] as const;

export type ProComponentRuntimeTag = (typeof PRO_COMPONENT_RUNTIME_TAGS)[number];

export type ProComponentSurfaceFamily = {
  componentTags: readonly ProComponentRuntimeTag[];
  evidencePaths: readonly string[];
  id: string;
  sourcePaths: readonly string[];
  visualStates: readonly (
    'desktop' | 'narrow' | 'light' | 'dark' | 'hover-focus' | 'overlay' | 'read-only'
  )[];
};

const DATASET_MAIN_PAGE_PATHS = [
  'src/pages/Contacts/index.tsx',
  'src/pages/Flowproperties/index.tsx',
  'src/pages/Flows/index.tsx',
  'src/pages/LifeCycleModels/index.tsx',
  'src/pages/PublishedProcesses/index.tsx',
  'src/pages/Processes/index.tsx',
  'src/pages/Sources/index.tsx',
  'src/pages/Unitgroups/index.tsx',
] as const;

export const PRO_COMPONENT_SURFACE_FAMILIES = [
  {
    id: 'dataset-main-tables',
    componentTags: ['ProTable'],
    sourcePaths: DATASET_MAIN_PAGE_PATHS,
    evidencePaths: [
      'tests/e2e/i18n/route-inventory.spec.ts',
      'tests/e2e/i18n/responsive-surfaces.spec.ts',
    ],
    visualStates: ['desktop', 'narrow', 'light', 'dark', 'hover-focus'],
  },
  {
    id: 'dataset-selector-tables',
    componentTags: ['ProTable'],
    sourcePaths: [
      'src/pages/Contacts/Components/select/drawer.tsx',
      'src/pages/Flowproperties/Components/select/drawer.tsx',
      'src/pages/Flows/Components/select/drawer.tsx',
      'src/pages/Sources/Components/select/drawer.tsx',
      'src/pages/Unitgroups/Components/select/drawer.tsx',
    ],
    evidencePaths: [
      'tests/e2e/i18n/runtime/lexical-search-workflows.spec.ts',
      'tests/e2e/i18n/typed-view-variants.spec.ts',
    ],
    visualStates: ['desktop', 'narrow', 'overlay', 'hover-focus'],
  },
  {
    id: 'process-nested-tables',
    componentTags: ['ProTable'],
    sourcePaths: [
      'src/pages/Processes/Components/Exchange/select.tsx',
      'src/pages/Processes/Components/ReviewDetail/index.tsx',
      'src/pages/Processes/Components/form.tsx',
      'src/pages/Processes/Components/processLciaResultsPanel.tsx',
      'src/pages/Processes/Components/view.tsx',
      'src/pages/Review/Components/reviewProcess/tabsDetail.tsx',
    ],
    evidencePaths: [
      'tests/e2e/i18n/typed-view-variants.spec.ts',
      'tests/e2e/i18n/process-lifecycle.spec.ts',
    ],
    visualStates: ['desktop', 'narrow', 'overlay', 'read-only'],
  },
  {
    id: 'life-cycle-model-nested-tables',
    componentTags: ['ProTable'],
    sourcePaths: [
      'src/pages/LifeCycleModels/Components/connectableProcesses/index.tsx',
      'src/pages/LifeCycleModels/Components/modelResult/index.tsx',
      'src/pages/LifeCycleModels/Components/toolbar/Exchange/ioPortSelect.tsx',
      'src/pages/LifeCycleModels/Components/toolbar/Exchange/ioPortView.tsx',
      'src/pages/LifeCycleModels/Components/toolbar/add.tsx',
      'src/pages/LifeCycleModels/Components/toolbar/addThroughFlow.tsx',
      'src/pages/Review/Components/reviewLifeCycleModels/Components/toolbar/Exchange/ioPortSelect.tsx',
    ],
    evidencePaths: ['tests/e2e/i18n/responsive-surfaces.spec.ts'],
    visualStates: ['desktop', 'narrow', 'overlay', 'read-only'],
  },
  {
    id: 'flow-and-unit-group-nested-tables',
    componentTags: ['ProTable'],
    sourcePaths: [
      'src/pages/Flows/Components/form.tsx',
      'src/pages/Flows/Components/view.tsx',
      'src/pages/Unitgroups/Components/form.tsx',
      'src/pages/Unitgroups/Components/view.tsx',
    ],
    evidencePaths: ['tests/e2e/i18n/runtime/lexical-search-workflows.spec.ts'],
    visualStates: ['desktop', 'narrow', 'overlay', 'read-only'],
  },
  {
    id: 'team-system-review-and-version-tables',
    componentTags: ['ProTable', 'DragSortTable'],
    sourcePaths: [
      'src/components/AllTeams/index.tsx',
      'src/components/AllTeams/select.tsx',
      'src/components/AllVersions/index.tsx',
      'src/components/RefsOfNewVersionDrawer/index.tsx',
      'src/pages/ManageSystem/index.tsx',
      'src/pages/Review/Components/AssignmentReview.tsx',
      'src/pages/Review/Components/ReviewMember.tsx',
      'src/pages/Review/Components/ReviewProgress.tsx',
      'src/pages/Review/Components/SelectReviewer.tsx',
      'src/pages/Teams/index.tsx',
    ],
    evidencePaths: [
      'tests/e2e/i18n/route-inventory.spec.ts',
      'tests/e2e/i18n/responsive-layout.spec.ts',
    ],
    visualStates: ['desktop', 'narrow', 'overlay', 'hover-focus'],
  },
  {
    id: 'dataset-editor-forms',
    componentTags: ['ProForm'],
    sourcePaths: [
      'src/pages/Contacts/Components/create.tsx',
      'src/pages/Contacts/Components/edit.tsx',
      'src/pages/Flowproperties/Components/create.tsx',
      'src/pages/Flowproperties/Components/edit.tsx',
      'src/pages/Flows/Components/Property/create.tsx',
      'src/pages/Flows/Components/Property/edit.tsx',
      'src/pages/Flows/Components/create.tsx',
      'src/pages/Flows/Components/edit.tsx',
      'src/pages/Processes/Components/Exchange/create.tsx',
      'src/pages/Processes/Components/Exchange/edit.tsx',
      'src/pages/Processes/Components/create.tsx',
      'src/pages/Processes/Components/edit.tsx',
      'src/pages/Sources/Components/create.tsx',
      'src/pages/Sources/Components/edit.tsx',
      'src/pages/Unitgroups/Components/Unit/create.tsx',
      'src/pages/Unitgroups/Components/Unit/edit.tsx',
      'src/pages/Unitgroups/Components/create.tsx',
      'src/pages/Unitgroups/Components/edit.tsx',
    ],
    evidencePaths: [
      'tests/e2e/i18n/typed-view-variants.spec.ts',
      'tests/e2e/i18n/process-persisted-authoring.spec.ts',
    ],
    visualStates: ['desktop', 'narrow', 'overlay', 'hover-focus'],
  },
  {
    id: 'life-cycle-model-and-review-forms',
    componentTags: ['ProForm'],
    sourcePaths: [
      'src/pages/LifeCycleModels/Components/toolbar/editTargetAmount.tsx',
      'src/pages/LifeCycleModels/Components/toolbar/eidtInfo.tsx',
      'src/pages/Review/Components/ReviewerProfile.tsx',
      'src/pages/Review/Components/reviewLifeCycleModels/Components/toolbar/viewInfo.tsx',
      'src/pages/Review/Components/reviewProcess/index.tsx',
    ],
    evidencePaths: [
      'tests/e2e/i18n/responsive-surfaces.spec.ts',
      'tests/e2e/i18n/typed-view-variants.spec.ts',
    ],
    visualStates: ['desktop', 'narrow', 'overlay'],
  },
  {
    id: 'account-profile-forms',
    componentTags: ['ProForm'],
    sourcePaths: ['src/pages/Account/index.tsx'],
    evidencePaths: ['tests/e2e/i18n/route-inventory.spec.ts'],
    visualStates: ['desktop', 'narrow', 'light', 'dark'],
  },
  {
    id: 'team-forms',
    componentTags: ['ProForm'],
    sourcePaths: ['src/components/AllTeams/edit.tsx', 'src/pages/Teams/index.tsx'],
    evidencePaths: ['tests/e2e/i18n/responsive-layout.spec.ts'],
    visualStates: ['desktop', 'narrow', 'light', 'dark', 'hover-focus'],
  },
  {
    id: 'route-page-containers',
    componentTags: ['PageContainer'],
    sourcePaths: [
      'src/pages/Account/index.tsx',
      'src/pages/Admin.tsx',
      'src/pages/Contacts/index.tsx',
      'src/pages/DataProcessing/index.tsx',
      'src/pages/Flowproperties/index.tsx',
      'src/pages/Flows/index.tsx',
      'src/pages/LifeCycleModels/index.tsx',
      'src/pages/ManageSystem/index.tsx',
      'src/pages/PublishedProcesses/index.tsx',
      'src/pages/Processes/Analysis/index.tsx',
      'src/pages/Processes/index.tsx',
      'src/pages/Review/index.tsx',
      'src/pages/Sources/index.tsx',
      'src/pages/Teams/index.tsx',
      'src/pages/Unitgroups/index.tsx',
      'src/pages/Welcome.tsx',
    ],
    evidencePaths: [
      'tests/e2e/i18n/route-inventory.spec.ts',
      'tests/e2e/i18n/responsive-layout.spec.ts',
    ],
    visualStates: ['desktop', 'narrow', 'light', 'dark'],
  },
  {
    id: 'anonymous-login-layouts',
    componentTags: ['ProLayout', 'LoginForm'],
    sourcePaths: [
      'src/pages/User/Login/index.tsx',
      'src/pages/User/Login/password_forgot.tsx',
      'src/pages/User/Login/password_reset.tsx',
    ],
    evidencePaths: [
      'tests/e2e/i18n/semantic-critical.spec.ts',
      'tests/e2e/i18n/query-responsive.spec.ts',
    ],
    visualStates: ['desktop', 'narrow', 'light', 'dark', 'hover-focus'],
  },
  {
    id: 'responsive-table-dropdowns',
    componentTags: ['TableDropdown'],
    sourcePaths: ['src/components/ResponsiveDataList/index.tsx'],
    evidencePaths: ['tests/e2e/i18n/responsive-surfaces.spec.ts'],
    visualStates: ['desktop', 'narrow', 'overlay', 'hover-focus'],
  },
  {
    id: 'development-setting-drawer',
    componentTags: ['SettingDrawer'],
    sourcePaths: ['src/components/AccessibleSettingDrawer/index.tsx'],
    evidencePaths: ['tests/unit/components/AccessibleSettingDrawer.test.tsx'],
    visualStates: ['desktop', 'overlay', 'hover-focus'],
  },
] as const satisfies readonly ProComponentSurfaceFamily[];

export const EXPECTED_PRO_COMPONENT_RUNTIME_COUNTS = {
  DragSortTable: 1,
  LoginForm: 3,
  PageContainer: 16,
  ProForm: 28,
  ProLayout: 3,
  ProTable: 68,
  SettingDrawer: 1,
  TableDropdown: 3,
} as const satisfies Record<ProComponentRuntimeTag, number>;
