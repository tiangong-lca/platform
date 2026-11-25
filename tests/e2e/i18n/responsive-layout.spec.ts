import { expect, test, type Locator, type Page } from './fixtures';

import {
  CANONICAL_CONTENT_LANGUAGE,
  getAuthoringLanguageOptions,
} from '../../../src/services/general/contentLanguageRegistry';
import { getLocaleCapability } from '../../../src/services/general/localeCapabilities';
import { signInViaUi } from './auth';
import {
  annotateEvidence,
  APP_LOCALES,
  findRouteAssertion,
  getLocaleMessage,
  PLAYWRIGHT_BROWSER_PROJECTS,
  readStoredAppLocale,
  selectAppLocaleThroughUi,
} from './contracts';
import { resolveLocaleContentE2EScenario } from './locale-capability-scenarios';
import { withMobileNavigationDiagnostics } from './mobile-navigation-observer';
import {
  assertResponsiveSurfaceClosure,
  RESPONSIVE_SURFACE_SCENARIO,
  RESPONSIVE_THEMES,
  RESPONSIVE_VIEWPORTS,
  type ResponsiveSurfaceId,
} from './responsive-surface-registry';

const teamAssertion = findRouteAssertion('/team');

const TARGET_LOCALES = APP_LOCALES.map((locale) => ({
  locale,
  scenario: resolveLocaleContentE2EScenario(getLocaleCapability(locale)),
}));
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

type Rect = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

async function expectElementInsideViewport(
  locator: Locator,
  viewportWidth: number,
  viewportHeight: number,
): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewportHeight + 1);
}

async function expectTextNotHorizontallyClipped(
  locator: Locator,
  viewportWidth: number,
): Promise<void> {
  await expect(locator).toBeVisible();
  const metrics = await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const fragments = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect): Rect => ({
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top,
      }));
    return {
      bounds: {
        bottom: bounds.bottom,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
      } satisfies Rect,
      fragments,
    };
  });

  expect(metrics.fragments.length).toBeGreaterThan(0);
  expect(metrics.bounds.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.bounds.right).toBeLessThanOrEqual(viewportWidth + 1);
  for (const fragment of metrics.fragments) {
    expect(fragment.left).toBeGreaterThanOrEqual(Math.max(0, metrics.bounds.left) - 1);
    expect(fragment.right).toBeLessThanOrEqual(Math.min(viewportWidth, metrics.bounds.right) + 1);
  }
}

async function configureThemeAndReload(page: Page, dark: boolean): Promise<void> {
  await page.evaluate((nextDarkMode) => {
    localStorage.setItem('isDarkMode', String(nextDarkMode));
  }, dark);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('isDarkMode')))
    .toBe(String(dark));
}

test('Every registry locale keeps the team layout operable across responsive themes', async ({
  browserName,
  page,
}, testInfo) => {
  test.skip(
    browserName !== PLAYWRIGHT_BROWSER_PROJECTS[0],
    'Responsive layout semantics run in Chromium only.',
  );
  test.skip(
    process.env.E2E_AUTHENTICATED !== 'true',
    'Responsive team semantics require explicitly supplied runtime credentials.',
  );
  test.setTimeout(10 * 60_000);
  annotateEvidence(testInfo, teamAssertion, 'responsive-layout');
  annotateEvidence(testInfo, teamAssertion, RESPONSIVE_SURFACE_SCENARIO);
  const observedSurfaces = new Set<ResponsiveSurfaceId>();

  await signInViaUi(page);

  for (const { locale, scenario } of TARGET_LOCALES) {
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      let lightSurfaceColor: string | undefined;
      for (const theme of RESPONSIVE_THEMES) {
        const surfaceColor = await test.step(`${locale} ${viewport.id} ${theme.id}`, async () => {
          await page.setViewportSize({ height: viewport.height, width: viewport.width });
          await page.goto('/#/team?action=create', { waitUntil: 'domcontentloaded' });
          await selectAppLocaleThroughUi(page, locale);
          // Mount a fresh create form in this locale, without rows from the previous locale.
          await configureThemeAndReload(page, theme.dark);
          await expect.poll(() => readStoredAppLocale(page)).toBe(locale);

          const themeToggle = page.getByRole('button', {
            name: getLocaleMessage(locale, 'pages.theme.toggleDarkMode'),
            exact: true,
          });
          await expect(themeToggle).toBeVisible();
          await expect(themeToggle).toBeEnabled();

          const form = page.locator('form.team-info-form');
          await expect(form).toBeVisible();
          const longSectionTitle = page.getByText(
            getLocaleMessage(locale, 'pages.team.info.section.visibility'),
            { exact: true },
          );
          const longLogoHelper = page.getByText(
            getLocaleMessage(locale, 'pages.team.info.logo.helper'),
            { exact: true },
          );
          await expectTextNotHorizontallyClipped(longSectionTitle, viewport.width);
          await expectTextNotHorizontallyClipped(longLogoHelper, viewport.width);

          const documentWidth = await page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          }));
          expect(documentWidth.scrollWidth).toBeLessThanOrEqual(documentWidth.clientWidth + 1);

          switch (scenario.status) {
            case 'native': {
              const title = form.locator('.team-lang-field').filter({
                hasText: getLocaleMessage(locale, 'pages.team.info.title'),
              });
              const rows = title.locator('.lang-text-item-row');
              const languageRow = (language: string) =>
                title.locator(`.lang-text-item-row[data-content-language="${language}"]`);
              const defaults = new Set([scenario.contentLanguage, CANONICAL_CONTENT_LANGUAGE]);
              await expect(rows).toHaveCount(defaults.size);
              for (const language of defaults) {
                await expect(languageRow(language).getByRole('textbox')).toBeEditable();
              }

              let editedLanguage = scenario.contentLanguage;
              const editedSelector = () => languageRow(editedLanguage).getByRole('combobox');
              await expectElementInsideViewport(editedSelector(), viewport.width, viewport.height);
              const options = getAuthoringLanguageOptions();
              for (const { value, label } of [
                ...options.filter((option) => option.value !== scenario.contentLanguage),
                ...options.filter((option) => option.value === scenario.contentLanguage),
              ]) {
                const selector = editedSelector();
                await expect(selector).toBeEnabled();
                await selector.press('ArrowDown');
                await expect(selector).toHaveAttribute('aria-expanded', 'true');
                const listboxId = await selector.getAttribute('aria-controls');
                expect(listboxId).toBeTruthy();
                const activeLanguageListbox = page.locator(`[id="${listboxId}"]`);
                await expect(activeLanguageListbox).toHaveAttribute('role', 'listbox');
                const option = activeLanguageListbox.getByRole('option', {
                  name: label,
                  exact: true,
                });
                await expect(option).toHaveCount(1);
                await option.scrollIntoViewIfNeeded();
                await expectElementInsideViewport(option, viewport.width, viewport.height);
                if (value === CANONICAL_CONTENT_LANGUAGE && value !== scenario.contentLanguage) {
                  // The canonical translation already owns a separate title row.
                  await expect(option).toBeDisabled();
                  await selector.press('Escape');
                } else {
                  await expect(option).toBeEnabled();
                  await option.click();
                  editedLanguage = value;
                }
                await expect(editedSelector()).toHaveAttribute('aria-expanded', 'false');
                await expect(activeLanguageListbox).toBeHidden();
              }
              await expect(
                languageRow(scenario.contentLanguage).getByRole('textbox'),
              ).toBeEditable();
              observedSurfaces.add('authoring-language-dropdown');
              break;
            }
            case 'declared-fallback': {
              // A future UI locale may read a declared fallback, but this test
              // must not exercise that locale as native content authoring.
              const firstLanguageSelector = form.getByRole('combobox').first();
              await expectElementInsideViewport(
                firstLanguageSelector,
                viewport.width,
                viewport.height,
              );
              await firstLanguageSelector.press('ArrowDown');
              const fallbackListboxId = await firstLanguageSelector.getAttribute('aria-controls');
              expect(fallbackListboxId).toBeTruthy();
              const fallbackListbox = page.locator(`[id="${fallbackListboxId}"]`);
              await expect(
                fallbackListbox.getByRole('option', {
                  name: scenario.contentLanguageDefinition.nativeLabel,
                  exact: true,
                }),
              ).toHaveCount(1);
              await page.keyboard.press('Escape');
              await expect(firstLanguageSelector).toHaveAttribute('aria-expanded', 'false');
              await expect(fallbackListbox).toBeHidden();
              break;
            }
            case 'unsupported':
              // Common localized layout assertions above remain valid. No
              // typed-content authoring claim is made for this capability.
              break;
          }

          const renderedSurfaceColor = await form
            .locator('.team-info-card')
            .first()
            .evaluate((element) => getComputedStyle(element).backgroundColor);
          return renderedSurfaceColor;
        });
        if (theme.dark) {
          expect(surfaceColor).not.toBe(lightSurfaceColor);
        } else {
          lightSurfaceColor = surfaceColor;
        }
      }
    }
  }
  assertResponsiveSurfaceClosure('/team', observedSurfaces);

  await test.step('narrow process table exposes an internal horizontal scroll affordance', async () => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto('/#/mydata/processes', { waitUntil: 'domcontentloaded' });
    const tableRoot = page.locator('.responsive-data-list-table').filter({ visible: true }).first();
    const table = tableRoot.getByRole('table').filter({ visible: true }).first();
    await expect(table).toBeVisible();
    const horizontalScroller = tableRoot.locator('.ant-table-body').filter({ visible: true });
    await expect(horizontalScroller).toHaveCount(1);
    await expect
      .poll(() =>
        horizontalScroller.evaluate(
          (element) => element.scrollWidth > element.clientWidth && element.clientWidth > 0,
        ),
      )
      .toBe(true);

    await horizontalScroller.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect
      .poll(() => horizontalScroller.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
  });

  await test.step('mobile ProLayout actions stay aligned and keyboard-operable', async () => {
    await withMobileNavigationDiagnostics(page, async () => {
      const header = page.getByTestId('pro-layout-global-header');
      const menuButton = header.locator('.tg-pro-layout-mobile-menu-action');
      const languageButton = header.locator('.tg-global-language-action');
      const avatarButton = header.locator('.tg-global-header-avatar-trigger');

      await expect(header).toBeVisible();
      for (const action of [menuButton, languageButton, avatarButton]) {
        await expect(action).toBeVisible();
        await expect(action).toHaveAttribute('aria-label', /\S/u);
        await expectElementInsideViewport(action, 390, 844);
      }

      const logo = header.locator('.ant-pro-global-header-logo-mobile');
      const [menuBox, logoBox] = await Promise.all([menuButton.boundingBox(), logo.boundingBox()]);
      expect(menuBox).not.toBeNull();
      expect(logoBox).not.toBeNull();
      expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(logoBox!.x + 1);

      const backgroundBeforeHover = await menuButton.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      await menuButton.hover();
      await expect
        .poll(() => menuButton.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe(backgroundBeforeHover);

      await menuButton.press('Enter');
      const navigationDialog = page.getByRole('dialog').filter({ visible: true });
      await expect(navigationDialog).toHaveCount(1);
      await expect(navigationDialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(navigationDialog).toBeHidden();

      await avatarButton.hover();
      const avatarMenu = page.getByRole('menu').filter({ visible: true });
      await expect(avatarMenu).toHaveCount(1);
      await expect.poll(() => avatarMenu.getByRole('menuitem').count()).toBeGreaterThan(0);
      await page.mouse.move(0, 0);
      await expect(avatarMenu).toBeHidden();

      await avatarButton.press('Enter');
      await expect(avatarMenu).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(avatarMenu).toBeHidden();
    });
  });
});
