import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { REPOSITORY_ROOT } from '../i18n/contracts';

export const kinds = [
  'process',
  'flow',
  'lifecyclemodel',
  'flowproperty',
  'unitgroup',
  'source',
  'contact',
] as const;
export type Kind = (typeof kinds)[number];
const tables: Record<Kind, string> = {
  process: 'processes',
  flow: 'flows',
  lifecyclemodel: 'lifecyclemodels',
  flowproperty: 'flowproperties',
  unitgroup: 'unitgroups',
  source: 'sources',
  contact: 'contacts',
};
const labels: Record<Kind, string> = {
  process: '水泥生产；全过程数据，含原料和能源供应',
  flow: '电力；中压电，区域供应混合',
  lifecyclemodel: '建筑材料生命周期模型',
  flowproperty: '质量流属性',
  unitgroup: '质量单位组',
  source: '公开生命周期评价研究资料',
  contact: '数据编制与审核联系机构',
};
const infoNames: Record<Kind, string> = {
  process: 'processInformation',
  flow: 'flowInformation',
  lifecyclemodel: 'lifeCycleModelInformation',
  flowproperty: 'flowPropertiesInformation',
  unitgroup: 'unitGroupInformation',
  source: 'sourceInformation',
  contact: 'contactInformation',
};
const dataRoots: Record<Kind, string> = {
  process: 'processDataSet',
  flow: 'flowDataSet',
  lifecyclemodel: 'lifeCycleModelDataSet',
  flowproperty: 'flowPropertyDataSet',
  unitgroup: 'unitGroupDataSet',
  source: 'sourceDataSet',
  contact: 'contactDataSet',
};
export const routeNames: Record<Kind, string> = { ...tables, lifecyclemodel: 'models' };
export const USER_ID = '70400000-0000-4000-8000-000000000704';
export const TEAM_ID = '70400000-0000-4000-8000-000000000705';
const VERSION = '01.00.000';
export const LONG_PROCESS_NAME =
  '水泥生产；新型干法回转窑工艺；中国华东地区；包含石灰石开采、原料制备、熟料烧成、水泥粉磨及厂内运输；采用区域电网混合电力和煤炭供热；工厂大门边界；2020年代表性生产数据';
const langText = (text: string) =>
  ['zh', 'en', 'de', 'fr'].map((lang) => ({
    '@xml:lang': lang,
    '#text': lang === 'zh' ? text : `Dataset ${text}`,
  }));

export function datasetRow(kind: Kind, index: number) {
  const sourceDirectory = kind === 'lifecyclemodel' ? 'lifeCycleModels' : tables[kind];
  const fixture = JSON.parse(
    readFileSync(
      path.join(
        REPOSITORY_ROOT,
        'tests/data-workflows/fixtures/data',
        sourceDirectory,
        '001_create_view_copy.json',
      ),
      'utf8',
    ),
  );
  const json = fixture.jsonOrdered ?? fixture.payload.parent.jsonOrdered;
  const root = json[dataRoots[kind]];
  const info = root[infoNames[kind]];
  const data = info.dataSetInformation;
  const id = `12130000-0000-4000-8${kinds.indexOf(kind)}00-${String(index + 1).padStart(12, '0')}`;
  const name =
    kind === 'process' && index === 0
      ? LONG_PROCESS_NAME
      : `${labels[kind]} ${String(index + 1).padStart(3, '0')}`;
  data['common:UUID'] = id;
  data.name = { baseName: langText(name) };
  data['common:name'] = langText(name);
  data['common:shortName'] = langText(name);
  data['common:generalComment'] = langText('用于本地界面验收的合成记录');
  data.classificationInformation = {
    'common:classification': {
      'common:class': [
        { '@level': '0', '@classId': 'C', '#text': 'Manufacturing' },
        { '@level': '1', '@classId': '23', '#text': 'Manufacture of mineral products' },
      ],
    },
  };
  if (kind === 'process') {
    info.time = { 'common:referenceYear': 2020 + (index % 6) };
    info.geography = {
      locationOfOperationSupplyOrProduction: { '@location': index % 2 ? 'CN' : 'GLO' },
    };
    root.modellingAndValidation = {
      LCIMethodAndAllocation: { typeOfDataSet: 'Unit process, single operation' },
    };
  }
  if (kind === 'flow') {
    info.geography = { locationOfSupply: index % 2 ? 'CN' : 'GLO' };
    root.modellingAndValidation = { LCIMethod: { typeOfDataSet: 'Product flow' } };
  }
  return {
    id,
    json,
    json_ordered: json,
    version: VERSION,
    name,
    modified_at: '2026-10-13T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    state_code: 0,
    team_id: TEAM_ID,
    user_id: USER_ID,
    model_id: null,
    model_version: null,
    total_count: 137,
  };
}
export type QueryObservation = {
  rpc: string;
  body: Record<string, any>;
  kind: Kind | 'all';
  mode: 'list' | 'lexical' | 'smart' | 'reference';
  keyword: string;
  current: number;
};
type DatasetListFixtureOptions = {
  /** Visible evidence that a response belongs to the applied query. */
  labelSearchResults?: boolean;
  processStateCode?: number;
};
export async function installDatasetListFixture(
  page: Page,
  options: DatasetListFixtureOptions = {},
) {
  const queries: QueryObservation[] = [];
  await page.route(/\/(rest|functions)\/v1\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    expect(url.origin).toBe('https://semantic-harness.invalid');
    if (request.method() === 'OPTIONS') {
      await route.fallback();
      return;
    }
    const rpc = url.pathname.split('/').slice(-1)[0];
    const body = JSON.parse(request.postData() ?? '{}');
    if (rpc === 'qry_membership_get_mine') {
      await route.fulfill({
        json: [
          {
            role: 'data_product_manager',
            user_id: USER_ID,
            team_id: '00000000-0000-0000-0000-000000000000',
          },
          { role: 'member', user_id: USER_ID, team_id: TEAM_ID },
        ],
      });
      return;
    }
    if (rpc === 'qry_team_get') {
      await route.fulfill({ json: [{ id: TEAM_ID, json: { title: langText('示例团队') } }] });
      return;
    }
    if (rpc === 'qry_membership_get_mine' || rpc === 'qry_identity_get_mine') {
      await route.fallback();
      return;
    }
    if (request.method() === 'GET' && Object.values(tables).includes(rpc)) {
      const kind = kinds.find((k) => tables[k] === rpc)!;
      const source = datasetRow(kind, 0);
      const allVersions = url.searchParams.has('order') && url.searchParams.has('id');
      const requestedId = url.searchParams.get('id')?.replace(/^eq\./, '') ?? source.id;
      const exactRefs = Array.from(
        (url.searchParams.get('or') ?? '').matchAll(
          /id\.eq\."?([0-9a-f-]+)"?,version\.eq\."?([0-9.]+)"?/g,
        ),
        (match) => ({ id: match[1], version: match[2] }),
      );
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const analysisPage =
        kind === 'process' && !url.searchParams.has('id') && exactRefs.length === 0;
      const refs = exactRefs.length
        ? exactRefs.slice(offset, offset + limit)
        : analysisPage
          ? Array.from({ length: Math.max(0, Math.min(limit, 137 - offset)) }, (_, index) => ({
              id: datasetRow('process', offset + index).id,
              version: VERSION,
            }))
          : Array.from(
              { length: allVersions ? Math.max(0, Math.min(limit, 137 - offset)) : 1 },
              (_, index) => ({
                id: requestedId,
                version: allVersions
                  ? `01.00.${String(url.searchParams.get('order')?.includes('version.desc') ? 136 - offset - index : offset + index).padStart(3, '0')}`
                  : source.version,
              }),
            );
      const rows = refs.map((reference, index) => {
        const numbered = datasetRow(
          kind,
          Number(reference.id.split('-').slice(-1)[0]) - 1 || index,
        );
        const metadata = numbered.json[dataRoots[kind]][infoNames[kind]].dataSetInformation;
        return {
          ...numbered,
          ...(kind === 'process' && options.processStateCode !== undefined
            ? { state_code: options.processStateCode }
            : {}),
          id: reference.id,
          version: reference.version,
          ...(kind === 'lifecyclemodel'
            ? {
                json_tg: {
                  xflow: { nodes: [], edges: [] },
                  submodels: Array.from({ length: 70 }, (_, i) => ({
                    id: datasetRow('process', i + 1).id,
                    version: VERSION,
                    type: 'primary',
                  })),
                },
              }
            : {}),
          name: metadata.name,
          'common:name': metadata['common:name'],
          'common:shortName': metadata['common:shortName'],
          'common:class':
            metadata.classificationInformation['common:classification']['common:class'],
          classificationInformation: metadata.classificationInformation,
          'common:referenceYear': 2025,
          '@location': 'CN',
          locationOfSupply: 'CN',
          typeOfDataSet: kind === 'process' ? 'Unit process, single operation' : 'Product flow',
        };
      });
      await route.fulfill({
        json: request.headers().accept?.includes('pgrst.object') ? rows[0] : rows,
        headers: {
          'access-control-expose-headers': 'content-range',
          'content-range': exactRefs.length
            ? `${offset}-${offset + rows.length - 1}/${exactRefs.length}`
            : allVersions || analysisPage
              ? `${offset}-${offset + rows.length - 1}/137`
              : '0-0/1',
        },
      });
      return;
    }
    const hybrid = rpc.endsWith('_hybrid_search');
    const display = [
      'list_dataset_display_candidates_filtered',
      'list_displayed_datasets_filtered',
    ].includes(rpc);
    const kind =
      (body.p_dataset_kind as Kind | 'all' | undefined) ??
      kinds.find((k) => rpc === `${k}_hybrid_search`) ??
      kinds.find((k) => rpc.includes(tables[k])) ??
      kinds.find((k) => rpc.includes(k));
    if (!kind) {
      await route.fallback();
      return;
    }
    if (
      !display &&
      !hybrid &&
      !rpc.startsWith('get_latest_') &&
      !rpc.startsWith('search_') &&
      rpc !== 'query_dataset_catalog'
    ) {
      await route.fallback();
      return;
    }
    const mode: QueryObservation['mode'] = hybrid
      ? 'smart'
      : rpc === 'search_dataset_uuid_mentions_page' || body.p_search_mode === 'uuid'
        ? 'reference'
        : body.p_search_mode === 'lexical' || (rpc.startsWith('search_') && !body.p_search_mode)
          ? 'lexical'
          : 'list';
    const keyword = body.p_uuid ?? body.p_query_text ?? body.query_text ?? body.query ?? '';

    const filters = body.p_filter_condition ?? body.filter_condition ?? {};
    const total = filters.classification?.length ? 76 : 137;
    const pageSize = body.p_page_size ?? body.page_size ?? 50;
    const current = body.p_page_current ?? body.page_current ?? body.p_page ?? 1;
    queries.push({ rpc, body, kind, mode, keyword, current });
    const count = Math.max(0, Math.min(pageSize, total - (current - 1) * pageSize));
    const rows = Array.from({ length: count }, (_, index) => {
      const rowKind = kind === 'all' ? kinds[index % kinds.length] : kind;
      const row = datasetRow(rowKind, (current - 1) * pageSize + index);
      if (options.labelSearchResults && mode !== 'list') {
        const name = `${mode}:${keyword} ${row.name}`;
        const metadata = row.json[dataRoots[rowKind]][infoNames[rowKind]].dataSetInformation;
        metadata.name = { baseName: langText(name) };
        metadata['common:name'] = langText(name);
        metadata['common:shortName'] = langText(name);
        row.name = name;
      }
      return { ...row, total_count: total };
    });
    if (hybrid) {
      // Process/Flow reject legacy latest-version envelopes. Other catalog
      // adapters accept the shared data envelope without matched-version metadata.
      await route.fulfill({
        json: {
          data: rows,
          total_count: total,
          ...(['process', 'flow'].includes(kind) ? { versionScope: 'matched' } : {}),
        },
      });
      return;
    }
    if (display) {
      await route.fulfill({
        json: {
          total,
          data: rows.map((row, index) => {
            const rowKind = kind === 'all' ? kinds[index % kinds.length] : kind;
            return {
              dataset_kind: rowKind,
              dataset_id: row.id,
              dataset_version: row.version,
              name: ['process', 'flow', 'lifecyclemodel'].includes(rowKind)
                ? { baseName: langText(row.name) }
                : langText(row.name),
              is_visible: true,
              location: ['process', 'flow'].includes(rowKind) ? 'CN' : null,
              reference_year: rowKind === 'process' ? 2025 : null,
              type_of_data_set:
                rowKind === 'process'
                  ? 'Unit process, single operation'
                  : rowKind === 'flow'
                    ? 'Product flow'
                    : null,
            };
          }),
        },
      });
      return;
    }
    if (rpc === 'search_dataset_uuid_mentions_page') {
      await route.fulfill({
        json: rows.map((row) => ({
          source_entity_kind: kind,
          source_id: row.id,
          source_version: row.version,
          source_json: row.json,
          source_name: row.name,
          source_modified_at: row.modified_at,
          source_team_id: row.team_id,
          matched_by: 'json_reference',
          matched_entity_table: kind === 'all' ? 'all' : tables[kind],
          rank: 1,
          total_count: total,
        })),
      });
      return;
    }
    await route.fulfill({
      json: rows,
      headers: {
        'content-range': `${(current - 1) * pageSize}-${(current - 1) * pageSize + count - 1}/${total}`,
      },
    });
  });
  return queries;
}
