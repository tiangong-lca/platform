import routes from '../../../config/routes';

describe('route access config', () => {
  it('protects the national carbon dashboard with admin access', () => {
    const dashboardRoute = routes.find((route) => route.path === '/dashboard/national-carbon');

    expect(dashboardRoute).toMatchObject({
      access: 'canAdmin',
      component: './NationalCarbonDashboard',
      layout: false,
      menu: false,
      wrappers: ['@/wrappers/AuthGuard'],
    });
  });

  it('protects data processing with data product manager access', () => {
    const dataProcessingRoute = routes.find((route) => route.path === '/data-processing');

    expect(dataProcessingRoute).toMatchObject({
      access: 'canDataProductManager',
      component: './DataProcessing',
      name: 'dataProcessing',
    });
  });

  it('places data processing after the user and team data modules', () => {
    const routePaths = routes.map((route) => route.path);

    expect(routePaths.indexOf('/data-processing')).toBeGreaterThan(routePaths.indexOf('/tedata'));
    expect(routePaths.indexOf('/data-processing')).toBeLessThan(routePaths.indexOf('/account'));
  });

  it('wraps every protected layout-free content route with the session guard', () => {
    const protectedLayoutFreeRoutes = routes.filter(
      (route) =>
        route.layout === false && route.path !== '/user' && route.path !== '/oauth/consent',
    );

    expect(protectedLayoutFreeRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/dashboard/national-carbon' }),
        expect.objectContaining({ path: '*' }),
      ]),
    );
    expect(protectedLayoutFreeRoutes).toHaveLength(2);
    expect(
      protectedLayoutFreeRoutes.every((route) => route.wrappers?.includes('@/wrappers/AuthGuard')),
    ).toBe(true);
  });

  it('exposes the OAuth consent page outside ProLayout without the generic auth wrapper', () => {
    expect(routes.find((route) => route.path === '/oauth/consent')).toEqual(
      expect.objectContaining({
        path: '/oauth/consent',
        component: './OAuth/Consent',
        layout: false,
        menu: false,
      }),
    );
  });

  it('canonicalizes the user parent and guards every anonymous login-flow leaf', () => {
    const userRoute = routes.find((route) => route.path === '/user');
    const loginFlowRoutes = userRoute?.routes?.filter((route) => route.component);

    expect(userRoute?.routes?.map((route) => route.path)).toEqual([
      '/user',
      '/user/login',
      '/user/login/password_forgot',
      '/user/login/password_reset',
    ]);
    expect(userRoute?.routes?.[0]).toEqual(
      expect.objectContaining({ path: '/user', redirect: '/user/login' }),
    );
    expect(
      loginFlowRoutes?.every(
        (route) => 'wrappers' in route && route.wrappers?.includes('@/wrappers/LoginFlowGuard'),
      ),
    ).toBe(true);
  });
});

describe('example data routes', () => {
  it('reuses all seven open-data pages under a separate scope', () => {
    const open = routes.find((route) => route.path === '/tgdata')!;
    const example = routes.find((route) => route.path === '/exampledata')!;
    const reusableOpenRoutes = open.routes?.filter(
      (route) => !('hideInMenu' in route && route.hideInMenu),
    );
    expect(example.name).toBe('exampledata');
    expect(example.routes).toEqual(
      reusableOpenRoutes?.map((route) => ({
        ...route,
        path: route.path.replace('/tgdata', '/exampledata'),
        ...('redirect' in route
          ? { redirect: route.redirect?.replace('/tgdata', '/exampledata') }
          : {}),
      })),
    );
    expect(example.routes?.filter((route) => route.component)).toHaveLength(7);
    expect(routes.indexOf(example)).toBe(routes.indexOf(open) + 1);
  });

  it('keeps displayed datasets outside Open Data and places the manager menu after Data Processing', () => {
    const open = routes.find((route) => route.path === '/tgdata')!;
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/dataset-display-settings',
        component: './DatasetDisplaySettings',
        access: 'canDataProductManager',
        name: 'datasetDisplaySettings',
      }),
    );
    expect(JSON.stringify(routes)).not.toContain('/tgdata/published-processes');
    expect(routes).toContainEqual(
      expect.objectContaining({
        component: './DisplayedDatasets',
        path: '/displayed-datasets',
        hideInMenu: true,
      }),
    );
    expect(JSON.stringify(open.routes)).not.toContain('DisplayedDatasets');
    expect(JSON.stringify(routes)).not.toContain('/tgdata/displayed-datasets');
    const dataProcessingIndex = routes.findIndex((route) => route.path === '/data-processing');
    expect(routes[dataProcessingIndex + 1].path).toBe('/dataset-display-settings');
  });
});
