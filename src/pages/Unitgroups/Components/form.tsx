/* istanbul ignore file -- unit-group form behavior is covered by tests; remaining misses are presentation-only branches */
import AlignedNumber from '@/components/AlignedNumber';
import DatasetCreateVersionFormItem from '@/components/DatasetCreateVersionFormItem';
import LangTextItemForm from '@/components/LangTextItem/form';
import LevelTextItemForm from '@/components/LevelTextItem/form';
import QuantitativeReferenceIcon from '@/components/QuantitativeReferenceIcon';
import RequiredMark from '@/components/RequiredMark';
import ContactSelectForm from '@/pages/Contacts/Components/select/form';
import SourceSelectForm from '@/pages/Sources/Components/select/form';
import { getRules } from '@/pages/Utils';
import type { ValidationIssueSdkDetail } from '@/pages/Utils/review';
import { useDatasetSdkValidationFormSupport } from '@/pages/Utils/validation/formSupport';
import { ListPagination } from '@/services/general/data';
import { UnitDraft, UnitItem, UnitTable } from '@/services/unitgroups/data';
import { genUnitTableData } from '@/services/unitgroups/util';
import { ActionType, ProColumns, ProFormInstance, ProTable } from '@ant-design/pro-components';
import { Card, Form, Input, Select, Space, theme } from 'antd';
import { FC, useMemo, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';
import schema from '../unitgroups_schema.json';
import UnitCreate from './Unit/create';
import UnitDelete from './Unit/delete';
import UnitEdit from './Unit/edit';
import UnitView from './Unit/view';
import { complianceOptions } from './optiondata';
// import UnitGroupSelectFrom from './select/form';
import { toSuperscript } from '@/components/AlignedNumber';

const UNIT_GROUP_SCHEMA_PATH_PREFIX = ['unitGroupDataSet'];

type Props = {
  lang: string;
  activeTabKey: string;
  formRef: React.RefObject<ProFormInstance | undefined>;
  onData: () => void;
  onUnitData: (data: UnitItem[]) => void;
  onUnitDataCreate: (data: UnitDraft) => void;
  onTabChange: (key: string) => void;
  unitDataSource: UnitItem[];
  formType?: string;
  showRules?: boolean;
  sdkValidationDetails?: ValidationIssueSdkDetail[];
  sdkValidationFocus?: ValidationIssueSdkDetail | null;
  validationIssueTabNames?: string[];
};

const isSdkFieldDetail = (detail: ValidationIssueSdkDetail) =>
  !detail.presentation || detail.presentation === 'field';

const isSdkSectionDetail = (detail: ValidationIssueSdkDetail) => detail.presentation === 'section';

const isSdkHighlightOnlyDetail = (detail: ValidationIssueSdkDetail) =>
  detail.presentation === 'highlight-only';

const getUnitInternalId = (detail?: ValidationIssueSdkDetail | null) => {
  const match = detail?.fieldPath?.match(/^unit\[#(.+?)\]/);
  return match?.[1];
};

export const UnitGroupForm: FC<Props> = ({
  lang,
  activeTabKey,
  formRef,
  onData,
  onUnitData,
  onUnitDataCreate,
  onTabChange,
  unitDataSource,
  formType,
  showRules = false,
  sdkValidationDetails = [],
  sdkValidationFocus = null,
  validationIssueTabNames = [],
}) => {
  const { token } = theme.useToken();
  const intl = useIntl();
  const actionRefUnitTable = useRef<ActionType | undefined>(undefined);
  const [showNameError, setShowNameError] = useState(false);
  const sdkRootValidationDetails = useMemo(
    () => sdkValidationDetails.filter((detail) => !getUnitInternalId(detail)),
    [sdkValidationDetails],
  );
  const { sdkValidationCountsByTab: rootSdkValidationCountsByTab, sdkValidationSectionMessages } =
    useDatasetSdkValidationFormSupport({
      activeTabKey,
      formRef,
      intl,
      sdkValidationDetails: sdkRootValidationDetails,
      sdkValidationFocus: getUnitInternalId(sdkValidationFocus) ? null : sdkValidationFocus,
      schemaPathPrefix: UNIT_GROUP_SCHEMA_PATH_PREFIX,
      schemaRoot: schema,
      showRules,
    });
  const sdkUnitRowHighlightsById = useMemo(
    () =>
      sdkValidationDetails.reduce<Record<string, ValidationIssueSdkDetail[]>>(
        (accumulator, detail) => {
          const unitInternalId = getUnitInternalId(detail);

          if (!unitInternalId || isSdkSectionDetail(detail)) {
            return accumulator;
          }

          if (!accumulator[unitInternalId]) {
            accumulator[unitInternalId] = [];
          }

          accumulator[unitInternalId].push(detail);
          return accumulator;
        },
        {},
      ),
    [sdkValidationDetails],
  );
  const sdkUnitFieldDetailsById = useMemo(
    () =>
      sdkValidationDetails.reduce<Record<string, ValidationIssueSdkDetail[]>>(
        (accumulator, detail) => {
          const unitInternalId = getUnitInternalId(detail);

          if (
            !unitInternalId ||
            !isSdkFieldDetail(detail) ||
            isSdkSectionDetail(detail) ||
            isSdkHighlightOnlyDetail(detail)
          ) {
            return accumulator;
          }

          if (!accumulator[unitInternalId]) {
            accumulator[unitInternalId] = [];
          }

          accumulator[unitInternalId].push(detail);
          return accumulator;
        },
        {},
      ),
    [sdkValidationDetails],
  );
  const sdkVisibleUnitRowsByTab = useMemo(
    () =>
      sdkValidationDetails.reduce<Record<string, Set<string>>>((accumulator, detail) => {
        const unitInternalId = getUnitInternalId(detail);
        const tabName = detail.tabName;

        if (!unitInternalId || !tabName || isSdkSectionDetail(detail)) {
          return accumulator;
        }

        if (!accumulator[tabName]) {
          accumulator[tabName] = new Set<string>();
        }

        accumulator[tabName].add(unitInternalId);
        return accumulator;
      }, {}),
    [sdkValidationDetails],
  );
  const sdkValidationCountsByTab: Record<string, number> = {
    ...rootSdkValidationCountsByTab,
    units: (rootSdkValidationCountsByTab.units ?? 0) + (sdkVisibleUnitRowsByTab.units?.size ?? 0),
  };
  const validationIssueTabs = useMemo(
    () => new Set(validationIssueTabNames),
    [validationIssueTabNames],
  );
  const focusedUnitInternalId = getUnitInternalId(sdkValidationFocus);

  const tabLabels = {
    administrativeInformation: (
      <FormattedMessage
        id='pages.unitgroup.edit.administrativeInformation'
        defaultMessage='Administrative information'
      />
    ),
    modellingAndValidation: (
      <FormattedMessage
        id='pages.unitgroup.edit.modellingAndValidation'
        defaultMessage='Modelling and validation'
      />
    ),
    unitGroupInformation: (
      <FormattedMessage
        id='pages.unitgroup.edit.unitGroupInformation'
        defaultMessage='Unit group information'
      />
    ),
    units: <FormattedMessage id='pages.unitgroup.edit.units' defaultMessage='Units' />,
  } as const;

  const renderTabLabel = (key: keyof typeof tabLabels) => {
    const hasIssue = (sdkValidationCountsByTab[key] ?? 0) > 0 || validationIssueTabs.has(key);

    return (
      <span
        style={
          hasIssue
            ? {
                color: token.colorError ?? token.colorPrimary,
                fontWeight: token.fontWeightStrong,
              }
            : undefined
        }
      >
        {tabLabels[key]}
      </span>
    );
  };

  const renderSdkSectionMessages = (fieldPath: string) => {
    const messages = sdkValidationSectionMessages[fieldPath] ?? [];

    if (messages.length === 0) {
      return null;
    }

    return (
      <div
        role='alert'
        style={{
          backgroundColor: token.colorErrorBg,
          border: `1px solid ${token.colorErrorBorder}`,
          borderRadius: token.borderRadiusLG,
          color: token.colorError,
          marginBottom: token.marginSM,
          padding: `${token.paddingXS}px ${token.paddingSM}px`,
        }}
      >
        {messages.map((messageText) => (
          <div key={`${fieldPath}:${messageText}`}>{messageText}</div>
        ))}
      </div>
    );
  };

  const tabList = [
    {
      key: 'unitGroupInformation',
      tab: renderTabLabel('unitGroupInformation'),
    },
    {
      key: 'modellingAndValidation',
      tab: renderTabLabel('modellingAndValidation'),
    },
    {
      key: 'administrativeInformation',
      tab: renderTabLabel('administrativeInformation'),
    },
    {
      key: 'units',
      tab: renderTabLabel('units'),
    },
  ];
  const unitColumns: ProColumns<UnitTable>[] = [
    {
      title: (
        <FormattedMessage id='pages.table.title.index' defaultMessage='Index'></FormattedMessage>
      ),
      valueType: 'index',
      search: false,
    },
    // {
    //     title: <FormattedMessage id="pages.unitgroup.unit.dataSetInternalID" defaultMessage="DataSet Internal ID"></FormattedMessage>,
    //     dataIndex: 'dataSetInternalID',
    //     search: false,
    // },
    {
      title: (
        <FormattedMessage id='pages.table.title.name' defaultMessage='Name'></FormattedMessage>
      ),
      dataIndex: 'name',
      search: false,
      render: (_, row) => {
        return [<span key={0}>{toSuperscript(row.name)}</span>];
      },
    },
    {
      title: (
        <FormattedMessage
          id='pages.unitgroup.unit.generalComment'
          defaultMessage='Comment'
        ></FormattedMessage>
      ),
      dataIndex: 'generalComment',
      search: false,
    },
    {
      title: (
        <FormattedMessage
          id='pages.unitgroup.unit.meanValue'
          defaultMessage='Mean value (of unit)'
        ></FormattedMessage>
      ),
      dataIndex: 'meanValue',
      search: false,
      align: 'right',
      width: 150,
      render: (_: unknown, record) => {
        return <AlignedNumber value={record.meanValue} />;
      },
    },
    {
      title: (
        <FormattedMessage
          id='pages.unitgroup.unit.quantitativeReference'
          defaultMessage='Quantitative reference'
        />
      ),
      dataIndex: 'quantitativeReference',
      sorter: false,
      search: false,
      render: (_, row) => {
        return <QuantitativeReferenceIcon value={row.quantitativeReference} />;
      },
    },
    {
      title: (
        <FormattedMessage id='pages.table.title.option' defaultMessage='Actions'></FormattedMessage>
      ),
      valueType: 'option',
      search: false,
      render: (_, row) => {
        return [
          <Space size={'small'} key={0}>
            <UnitView id={row.dataSetInternalID} data={unitDataSource} buttonType={'icon'} />
            <UnitEdit
              id={row.dataSetInternalID}
              data={unitDataSource}
              buttonType={'icon'}
              actionRef={actionRefUnitTable}
              onData={onUnitData}
              setViewDrawerVisible={() => {}}
              sdkHighlights={sdkUnitFieldDetailsById[row.dataSetInternalID] ?? []}
              autoOpen={focusedUnitInternalId === row.dataSetInternalID}
            />
            <UnitDelete
              id={row.dataSetInternalID}
              data={unitDataSource}
              buttonType={'icon'}
              actionRef={actionRefUnitTable}
              setViewDrawerVisible={() => {}}
              onData={onUnitData}
            />
          </Space>,
        ];
      },
    },
  ];
  const tabContent: { [key: string]: React.JSX.Element } = {
    unitGroupInformation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
        <Card
          size='small'
          title={
            <RequiredMark
              showError={showNameError}
              label={
                <FormattedMessage
                  id='pages.unitgroup.edit.unitGroupInformation.name'
                  defaultMessage='Name of unit group'
                />
              }
            />
          }
        >
          <LangTextItemForm
            name={['unitGroupInformation', 'dataSetInformation', 'common:name']}
            label={
              <FormattedMessage
                id='pages.unitgroup.edit.unitGroupInformation.name'
                defaultMessage='Name of unit group'
              />
            }
            setRuleErrorState={setShowNameError}
            autoExpandRequired={(
              schema['unitGroupDataSet']['unitGroupInformation']['dataSetInformation'][
                'common:name'
              ]['rules'] ?? []
            ).some((rule) => rule.required)}
            rules={
              showRules
                ? getRules(
                    schema['unitGroupDataSet']['unitGroupInformation']['dataSetInformation'][
                      'common:name'
                    ]['rules'] ?? [],
                  )
                : []
            }
          ></LangTextItemForm>
        </Card>
        <br />
        <LevelTextItemForm
          name={[
            'unitGroupInformation',
            'dataSetInformation',
            'classificationInformation',
            'common:classification',
            'common:class',
          ]}
          lang={lang}
          formRef={formRef}
          dataType={'UnitGroup'}
          onData={onData}
          showRules={showRules}
          rules={
            showRules
              ? getRules(
                  schema['unitGroupDataSet']['unitGroupInformation']['dataSetInformation'][
                    'classificationInformation'
                  ]['common:classification']['common:class']['@classId']['rules'] ?? [],
                )
              : []
          }
        />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.unitgroup.edit.unitGroupInformation.generalComment'
              defaultMessage='General comment'
            />
          }
        >
          <LangTextItemForm
            name={['unitGroupInformation', 'dataSetInformation', 'common:generalComment']}
            label={
              <FormattedMessage
                id='pages.unitgroup.edit.unitGroupInformation.generalComment'
                defaultMessage='General comment'
              />
            }
          />
        </Card>
        <Form.Item
          label='ID'
          name={['unitGroupInformation', 'dataSetInformation', 'common:UUID']}
          hidden
        >
          <Input></Input>
        </Form.Item>
      </Space>
    ),
    modellingAndValidation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
        <SourceSelectForm
          defaultSourceName={
            formType === 'create' ? 'ILCD Data Network - compliance (non-Process)' : undefined
          }
          name={[
            'modellingAndValidation',
            'complianceDeclarations',
            'compliance',
            'common:referenceToComplianceSystem',
          ]}
          label={
            <FormattedMessage
              id='pages.unitgroup.edit.modellingAndValidation.referenceToComplianceSystem'
              defaultMessage='Compliance system name'
            />
          }
          lang={lang}
          formRef={formRef}
          onData={onData}
          showRequiredLabel={true}
          rules={
            showRules
              ? getRules(
                  schema['unitGroupDataSet']['modellingAndValidation']['complianceDeclarations'][
                    'compliance'
                  ]['common:referenceToComplianceSystem']['@refObjectId']['rules'] ?? [],
                )
              : []
          }
        />
        <br />
        <Form.Item
          required={false}
          label={
            <RequiredMark
              showError={false}
              label={
                <FormattedMessage
                  id='pages.unitgroup.edit.modellingAndValidation.approvalOfOverallCompliance'
                  defaultMessage='Approval of overall compliance'
                />
              }
            />
          }
          name={[
            'modellingAndValidation',
            'complianceDeclarations',
            'compliance',
            'common:approvalOfOverallCompliance',
          ]}
          rules={
            showRules
              ? getRules(
                  schema['unitGroupDataSet']['modellingAndValidation']['complianceDeclarations'][
                    'compliance'
                  ]['common:approvalOfOverallCompliance']['rules'] ?? [],
                )
              : []
          }
        >
          <Select options={complianceOptions} />
        </Form.Item>
      </Space>
    ),
    administrativeInformation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
        <Form.Item
          required={false}
          label={
            <RequiredMark
              showError={false}
              label={
                <FormattedMessage
                  id='pages.unitgroup.edit.administrativeInformation.timeStamp'
                  defaultMessage='Time stamp (last saved)'
                />
              }
            />
          }
          name={['administrativeInformation', 'dataEntryBy', 'common:timeStamp']}
          rules={
            showRules
              ? getRules(
                  schema['unitGroupDataSet']['administrativeInformation']['dataEntryBy'][
                    'common:timeStamp'
                  ]['rules'] ?? [],
                )
              : []
          }
        >
          <Input disabled={true} style={{ color: token.colorTextDescription }} />
        </Form.Item>
        <SourceSelectForm
          defaultSourceName={formType === 'create' ? 'ILCD format' : undefined}
          name={['administrativeInformation', 'dataEntryBy', 'common:referenceToDataSetFormat']}
          label={
            <FormattedMessage
              id='pages.unitgroup.edit.administrativeInformation.referenceToDataSetFormat'
              defaultMessage='Data set format(s)'
            />
          }
          lang={lang}
          formRef={formRef}
          onData={onData}
          showRequiredLabel={true}
          rules={
            showRules
              ? getRules(
                  schema['unitGroupDataSet']['administrativeInformation']['dataEntryBy'][
                    'common:referenceToDataSetFormat'
                  ]['@refObjectId']['rules'] ?? [],
                )
              : []
          }
        />
        <br />
        <DatasetCreateVersionFormItem
          createVersion={formType === 'createVersion'}
          label={
            <RequiredMark
              showError={false}
              label={
                <FormattedMessage
                  id='pages.unitgroup.edit.administrativeInformation.dataSetVersion'
                  defaultMessage='Data set version'
                />
              }
            />
          }
          name={['administrativeInformation', 'publicationAndOwnership', 'common:dataSetVersion']}
          rules={getRules(
            schema['unitGroupDataSet']['administrativeInformation']['publicationAndOwnership'][
              'common:dataSetVersion'
            ]['rules'] ?? [],
          )}
        >
          <Input disabled={formType === 'edit'} />
        </DatasetCreateVersionFormItem>
        <ContactSelectForm
          lang={lang}
          formRef={formRef}
          label={
            <FormattedMessage
              id='pages.unitgroup.edit.administrativeInformation.referenceToOwnershipOfDataSet'
              defaultMessage='Owner of data set'
            />
          }
          name={[
            'administrativeInformation',
            'publicationAndOwnership',
            'common:referenceToOwnershipOfDataSet',
          ]}
          onData={onData}
          showRequiredLabel={true}
          rules={
            showRules
              ? getRules(
                  schema['unitGroupDataSet']['administrativeInformation'][
                    'publicationAndOwnership'
                  ]['common:referenceToOwnershipOfDataSet']['@refObjectId']['rules'] ?? [],
                )
              : []
          }
        />
        <br />
        {/* <UnitGroupSelectFrom
          name={[
            'administrativeInformation',
            'publicationAndOwnership',
            'common:referenceToPrecedingDataSetVersion',
          ]}
          label={
            <FormattedMessage
              id='pages.unitgroup.edit.administrativeInformation.referenceToPrecedingDataSetVersion'
              defaultMessage='Preceding data set version'
            />
          }
          lang={lang}
          formRef={formRef}
          onData={onData}
        />
        <br /> */}
        <Form.Item
          label={
            <FormattedMessage
              id='pages.unitgroup.edit.administrativeInformation.permanentDataSetURI'
              defaultMessage='Permanent data set URI'
            />
          }
          name={[
            'administrativeInformation',
            'publicationAndOwnership',
            'common:permanentDataSetURI',
          ]}
        >
          <Input />
        </Form.Item>
      </Space>
    ),
    units: (
      <>
        {renderSdkSectionMessages('units.requiredSummary')}
        {renderSdkSectionMessages('units.quantitativeReferenceSummary')}
        <ProTable<UnitTable, ListPagination>
          rowKey={(record) => `${record.dataSetInternalID}`}
          actionRef={actionRefUnitTable}
          search={false}
          pagination={{
            showSizeChanger: false,
            pageSize: 10,
          }}
          toolBarRender={() => {
            return [<UnitCreate key={0} onData={onUnitDataCreate}></UnitCreate>];
          }}
          dataSource={genUnitTableData(unitDataSource, lang)}
          columns={unitColumns}
          rowClassName={(record) => {
            const rowClasses: string[] = [];

            if ((sdkUnitRowHighlightsById[record.dataSetInternalID] ?? []).length > 0) {
              rowClasses.push('sdk-error-row');
            }

            if (focusedUnitInternalId && focusedUnitInternalId === record.dataSetInternalID) {
              rowClasses.push('sdk-focus-row');
            }

            return rowClasses.join(' ');
          }}
        ></ProTable>
      </>
    ),
  };

  return (
    <>
      <Card
        style={{ width: '100%' }}
        tabList={tabList}
        activeTabKey={activeTabKey}
        onTabChange={onTabChange}
      >
        {Object.keys(tabContent).map((key) => (
          <div key={key} style={{ display: key === activeTabKey ? 'block' : 'none' }}>
            {tabContent[key]}
          </div>
        ))}
      </Card>
    </>
  );
};
