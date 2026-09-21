import fs from 'node:fs';
import path from 'node:path';

import { SUPPORTED_CONTENT_LANGUAGES } from '@/services/general/contentLanguageRegistry';
import { getContentLanguageAwareTableParams } from '@/services/general/data';

const REPOSITORY_ROOT = path.resolve(__dirname, '../../..');

const ASYNC_EXCHANGE_TABLE_SURFACES = [
  {
    file: 'src/pages/Processes/Components/form.tsx',
    tableCount: 2,
  },
  {
    file: 'src/pages/Processes/Components/view.tsx',
    tableCount: 2,
  },
  {
    file: 'src/pages/Review/Components/reviewProcess/tabsDetail.tsx',
    tableCount: 2,
  },
  {
    file: 'src/pages/LifeCycleModels/Components/toolbar/Exchange/ioPortSelect.tsx',
    tableCount: 1,
  },
  {
    file: 'src/pages/LifeCycleModels/Components/toolbar/Exchange/ioPortView.tsx',
    tableCount: 1,
  },
  {
    file: 'src/pages/Review/Components/reviewLifeCycleModels/Components/toolbar/Exchange/ioPortSelect.tsx',
    tableCount: 1,
  },
] as const;

const ASYNC_LOCALE_MATERIALIZED_TABLE_SURFACES = [
  {
    file: 'src/components/AllVersions/index.tsx',
    requestCount: 1,
    currentLanguageRef: 'currentContentLanguageRef',
  },
  {
    file: 'src/pages/LifeCycleModels/Components/connectableProcesses/index.tsx',
    requestCount: 4,
    currentLanguageRef: 'currentContentLanguageRef',
  },
  {
    file: 'src/pages/LifeCycleModels/Components/modelResult/index.tsx',
    requestCount: 2,
    currentLanguageRef: 'currentContentLanguageRef',
  },
  {
    file: 'src/pages/LifeCycleModels/Components/toolbar/add.tsx',
    requestCount: 4,
    currentLanguageRef: 'currentContentLanguageRef',
  },
  {
    file: 'src/pages/LifeCycleModels/Components/toolbar/addThroughFlow.tsx',
    requestCount: 2,
    currentLanguageRef: 'currentContentLanguageRef',
  },
] as const;

function readSource(file: string): string {
  return fs.readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8');
}

function countOccurrences(source: string, token: string): number {
  return source.split(token).length - 1;
}

describe('locale-materialized row registry contract', () => {
  it.each(SUPPORTED_CONTENT_LANGUAGES)(
    'derives the canonical ProTable parameter for %s from the registry',
    (language) => {
      expect(getContentLanguageAwareTableParams(language)).toEqual({
        contentLanguage: language,
      });
    },
  );

  it.each(ASYNC_EXCHANGE_TABLE_SURFACES)(
    '$file refetches in place and rejects stale async rows on locale changes',
    ({ file, tableCount }) => {
      const source = readSource(file);

      expect(source).toContain('getContentLanguageAwareTableParams(lang)');
      expect(countOccurrences(source, 'params={exchangeTableParams}')).toBe(tableCount);
      expect(source).not.toMatch(/key=\{`[^`]*\$\{exchangeTableParams\.contentLanguage\}[^`]*`\}/u);
      expect(
        countOccurrences(
          source,
          'genProcessExchangeTableData(exchangeDataSource, contentLanguage)',
        ),
      ).toBe(tableCount);
      expect(countOccurrences(source, 'success: false')).toBeGreaterThanOrEqual(tableCount);
      expect(source).toContain('RequestEpochRef');
      expect(
        countOccurrences(source, 'ContentLanguageRef.current !== contentLanguage'),
      ).toBeGreaterThanOrEqual(tableCount);
    },
  );

  it.each(ASYNC_LOCALE_MATERIALIZED_TABLE_SURFACES)(
    '$file discards every request that resolves after its content language changed',
    ({ file, requestCount, currentLanguageRef }) => {
      const source = readSource(file);

      expect(countOccurrences(source, 'request={async (')).toBe(requestCount);
      expect(countOccurrences(source, 'guardLocaleMaterializedTableRequest(')).toBe(requestCount);
      expect(countOccurrences(source, `() => ${currentLanguageRef}.current`)).toBe(requestCount);
      expect(source).toContain('syncLocaleMaterializedTableRequestEpochs(');
      expect(countOccurrences(source, 'RequestEpochRef = useRef(0);')).toBe(requestCount);
      expect(source).not.toMatch(/key=\{`[^`]*contentLanguage[^`]*`\}/u);
    },
  );

  it('keeps the flow form unit materialization latest-wins and language-dependent', () => {
    const source = readSource('src/pages/Flows/Components/form.tsx');
    const clearIndex = source.indexOf('setDataSource([]);');
    const requestIndex = source.indexOf("void getUnitData('flowproperty'");

    expect(source).toContain('const propertyResolutionEpochRef = useRef(0);');
    expect(clearIndex).toBeGreaterThanOrEqual(0);
    expect(requestIndex).toBeGreaterThan(clearIndex);
    expect(source).toContain('propertyResolutionEpochRef.current !== resolutionEpoch');
    expect(source).toContain('}, [lang, propertyDataSource]);');
  });

  it('keeps the exchange selector rows as synchronous language-dependent projections', () => {
    const source = readSource('src/pages/Processes/Components/Exchange/select.tsx');

    expect(source).toContain('const exchangeDataSourceTable = useMemo(');
    expect(source).toContain('[exchangeDataSource, lang]');
    expect(source).toContain('const exchangeDataTargetTable = useMemo(');
    expect(source).toContain('[exchangeDataTarget, lang]');
  });
});
