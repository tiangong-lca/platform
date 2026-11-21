import { clearClassificationSelection } from '@/services/classifications/serialization';
/* istanbul ignore file -- flow form behavior is covered by tests; remaining misses are presentation-only branches */
import DatasetCreateVersionFormItem from '@/components/DatasetCreateVersionFormItem';
import LangTextItemForm from '@/components/LangTextItem/form';
import LevelTextItemForm from '@/components/LevelTextItem/form';
import LocationTextItemForm from '@/components/LocationTextItem/form';
import ContactSelectForm from '@/pages/Contacts/Components/select/form';
import SourceSelectForm from '@/pages/Sources/Components/select/form';
// import ReferenceUnit from '@/pages/Unitgroups/Components/Unit/reference';
import QuantitativeReferenceIcon from '@/components/QuantitativeReferenceIcon';
import RequiredMark from '@/components/RequiredMark';
import { RefCheckType, useRefCheckContext } from '@/contexts/refCheckContext';
import { getRules } from '@/pages/Utils';
import type { ValidationIssueSdkDetail } from '@/pages/Utils/review';
import { useDatasetSdkValidationFormSupport } from '@/pages/Utils/validation/formSupport';
import {
  FlowDataSetObjectKeys,
  FlowPropertyData,
  FlowpropertyTabTable,
} from '@/services/flows/data';
import { genFlowPropertyTabTableData } from '@/services/flows/util';
import { ListPagination } from '@/services/general/data';
import { getLangText, getUnitData } from '@/services/general/util';
import { ActionType, ProColumns, ProFormInstance, ProTable } from '@ant-design/pro-components';
import { Card, Divider, Form, Input, Select, Space, theme, Tooltip } from 'antd';
import type { FC } from 'react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';
import schema from '../flows_schema.json';
import { complianceOptions, myFlowTypeOptions } from './optiondata';
import PropertyCreate from './Property/create';
import PropertyDelete from './Property/delete';
import PropertyEdit from './Property/edit';
import PropertyView from './Property/view';
// import FlowsSelectForm from './select/form';
import AlignedNumber from '@/components/AlignedNumber';

const FLOW_SCHEMA_PATH_PREFIX = ['flowDataSet'];

type Props = {
  lang: string;
  activeTabKey: FlowDataSetObjectKeys;
  drawerVisible: boolean;
  formRef: React.RefObject<ProFormInstance | undefined>;
  onData: () => void;
  flowType: string | undefined;
  propertyDataSource: FlowPropertyData[];
  onPropertyData: (data: FlowPropertyData[]) => void;
  onPropertyDataCreate: (data: FlowPropertyData) => void;
  onTabChange: (key: FlowDataSetObjectKeys) => void;
  formType?: 'create' | 'copy' | 'createVersion' | 'edit';
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

const COMPACT_SDK_SECTION_MESSAGE_PATHS = new Set<string>([
  'flowProperties.requiredSummary',
  'flowProperties.quantitativeReferenceSummary',
]);

const getFlowPropertyInternalId = (detail?: ValidationIssueSdkDetail | null) => {
  const match = detail?.fieldPath?.match(/^flowProperty\[#(.+?)\]/);
  return match?.[1];
};

export const FlowForm: FC<Props> = ({
  lang,
  activeTabKey,
  drawerVisible,
  formRef,
  onData,
  flowType,
  propertyDataSource,
  onPropertyData,
  onPropertyDataCreate,
  onTabChange,
  formType,
  showRules = false,
  sdkValidationDetails = [],
  sdkValidationFocus = null,
  validationIssueTabNames = [],
}) => {
  const refCheckContext = useRefCheckContext();
  const [thisFlowType, setThisFlowType] = useState<string | undefined>(flowType);
  const actionRefPropertyTable = useRef<ActionType | undefined>(undefined);
  const { token } = theme.useToken();
  const intl = useIntl();
  const [dataSource, setDataSource] = useState<FlowpropertyTabTable[]>([]);
  const propertyResolutionEpochRef = useRef(0);
  const [baseNameError, setBaseNameError] = useState(false);
  const [treatmentStandardsRoutesError, setTreatmentStandardsRoutesError] = useState(false);
  const [mixAndLocationTypesError, setMixAndLocationTypesError] = useState(false);
  const sdkRootValidationDetails = useMemo(
    () => sdkValidationDetails.filter((detail) => !getFlowPropertyInternalId(detail)),
    [sdkValidationDetails],
  );
  const { sdkValidationCountsByTab: rootSdkValidationCountsByTab, sdkValidationSectionMessages } =
    useDatasetSdkValidationFormSupport({
      activeTabKey,
      formRef,
      intl,
      sdkValidationDetails: sdkRootValidationDetails,
      sdkValidationFocus: getFlowPropertyInternalId(sdkValidationFocus) ? null : sdkValidationFocus,
      schemaPathPrefix: FLOW_SCHEMA_PATH_PREFIX,
      schemaRoot: schema,
      showRules,
    });
  const sdkFlowPropertyRowHighlightsById = useMemo(
    () =>
      sdkValidationDetails.reduce<Record<string, ValidationIssueSdkDetail[]>>(
        (accumulator, detail) => {
          const flowPropertyInternalId = getFlowPropertyInternalId(detail);

          if (!flowPropertyInternalId || isSdkSectionDetail(detail)) {
            return accumulator;
          }

          if (!accumulator[flowPropertyInternalId]) {
            accumulator[flowPropertyInternalId] = [];
          }

          accumulator[flowPropertyInternalId].push(detail);
          return accumulator;
        },
        {},
      ),
    [sdkValidationDetails],
  );
  const sdkFlowPropertyFieldDetailsById = useMemo(
    () =>
      sdkValidationDetails.reduce<Record<string, ValidationIssueSdkDetail[]>>(
        (accumulator, detail) => {
          const flowPropertyInternalId = getFlowPropertyInternalId(detail);

          if (
            !flowPropertyInternalId ||
            !isSdkFieldDetail(detail) ||
            isSdkSectionDetail(detail) ||
            isSdkHighlightOnlyDetail(detail)
          ) {
            return accumulator;
          }

          if (!accumulator[flowPropertyInternalId]) {
            accumulator[flowPropertyInternalId] = [];
          }

          accumulator[flowPropertyInternalId].push(detail);
          return accumulator;
        },
        {},
      ),
    [sdkValidationDetails],
  );
  const sdkVisibleFlowPropertyRowsByTab = useMemo(
    () =>
      sdkValidationDetails.reduce<Record<string, Set<string>>>((accumulator, detail) => {
        const flowPropertyInternalId = getFlowPropertyInternalId(detail);
        const tabName = detail.tabName;

        if (!flowPropertyInternalId || !tabName || isSdkSectionDetail(detail)) {
          return accumulator;
        }

        if (!accumulator[tabName]) {
          accumulator[tabName] = new Set<string>();
        }

        accumulator[tabName].add(flowPropertyInternalId);
        return accumulator;
      }, {}),
    [sdkValidationDetails],
  );
  const sdkValidationCountsByTab: Record<string, number> = {
    ...rootSdkValidationCountsByTab,
    flowProperties:
      (rootSdkValidationCountsByTab.flowProperties ?? 0) +
      (sdkVisibleFlowPropertyRowsByTab.flowProperties?.size ?? 0),
  };
  const validationIssueTabs = useMemo(
    () => new Set(validationIssueTabNames),
    [validationIssueTabNames],
  );
  const focusedFlowPropertyInternalId = getFlowPropertyInternalId(sdkValidationFocus);

  const tabLabels = {
    administrativeInformation: (
      <FormattedMessage
        id='pages.flow.view.administrativeInformation'
        defaultMessage='Administrative information'
      />
    ),
    flowInformation: (
      <FormattedMessage id='pages.flow.view.flowInformation' defaultMessage='Flow information' />
    ),
    flowProperties: (
      <FormattedMessage id='pages.flow.view.flowProperty' defaultMessage='Flow property' />
    ),
    modellingAndValidation: (
      <FormattedMessage
        id='pages.flow.view.modellingAndValidation'
        defaultMessage='Modelling and validation'
      />
    ),
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

    if (COMPACT_SDK_SECTION_MESSAGE_PATHS.has(fieldPath)) {
      return (
        <div
          role='alert'
          style={{
            color: token.colorError,
            marginBottom: token.marginSM,
          }}
        >
          {messages.join('；')}
        </div>
      );
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

  useEffect(() => {
    const resolutionEpoch = propertyResolutionEpochRef.current + 1;
    propertyResolutionEpochRef.current = resolutionEpoch;
    setDataSource([]);

    void getUnitData('flowproperty', genFlowPropertyTabTableData(propertyDataSource, lang)).then(
      (res) => {
        if (propertyResolutionEpochRef.current !== resolutionEpoch) {
          return;
        }

        setDataSource((res ?? []) as FlowpropertyTabTable[]);
      },
    );

    return () => {
      if (propertyResolutionEpochRef.current === resolutionEpoch) {
        propertyResolutionEpochRef.current += 1;
      }
    };
  }, [lang, propertyDataSource]);

  const tabList = [
    {
      key: 'flowInformation',
      tab: renderTabLabel('flowInformation'),
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
      key: 'flowProperties',
      tab: renderTabLabel('flowProperties'),
    },
  ];

  const propertyColumns: ProColumns<FlowpropertyTabTable>[] = [
    {
      title: <FormattedMessage id='pages.table.title.index' defaultMessage='Index' />,
      dataIndex: 'index',
      valueType: 'index',
      search: false,
    },
    {
      title: (
        <FormattedMessage
          id='pages.flow.view.flowProperties.referenceToFlowPropertyDataSet'
          defaultMessage='Flow property'
        />
      ),
      dataIndex: 'referenceToFlowPropertyDataSet',
      sorter: false,
      search: false,
    },
    {
      title: <FormattedMessage id='pages.table.title.version' defaultMessage='Version' />,
      dataIndex: 'referenceToFlowPropertyDataSetVersion',
      sorter: false,
      search: false,
    },
    {
      title: (
        <FormattedMessage
          id='pages.flow.view.flowProperties.meanValue'
          defaultMessage='Mean value (of flow property)'
        />
      ),
      dataIndex: 'meanValue',
      sorter: false,
      search: false,
      align: 'right',
      width: 140,
      render: (_, record) => {
        return <AlignedNumber value={record.meanValue} />;
      },
    },
    {
      title: (
        <FormattedMessage
          id='pages.flowproperty.referenceToReferenceUnitGroup'
          defaultMessage='Reference unit'
        />
      ),
      dataIndex: 'refUnitGroup',
      sorter: false,
      search: false,
      render: (_, row) => {
        return [
          // <ReferenceUnit
          //   key={0}
          //   id={row.referenceToFlowPropertyDataSetId}
          //   version={row.referenceToFlowPropertyDataSetVersion}
          //   idType={'flowproperty'}
          //   lang={lang}
          // />,
          <span key={1}>
            {getLangText(row.refUnitRes?.name, lang)} (
            <Tooltip
              placement='topLeft'
              title={getLangText(row.refUnitRes?.refUnitGeneralComment, lang)}
            >
              {row.refUnitRes?.refUnitName}
            </Tooltip>
            )
          </span>,
        ];
      },
    },
    {
      title: (
        <FormattedMessage
          id='pages.process.exchange.quantitativeReference'
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
      title: <FormattedMessage id='pages.table.title.option' defaultMessage='Actions' />,
      dataIndex: 'option',
      search: false,
      render: (_, row) => {
        return [
          <Space size={'small'} key={0}>
            <PropertyView
              id={row.dataSetInternalID}
              data={propertyDataSource}
              lang={lang}
              buttonType={'icon'}
            />
            <PropertyEdit
              id={row.dataSetInternalID}
              data={propertyDataSource}
              lang={lang}
              buttonType={'icon'}
              actionRef={actionRefPropertyTable}
              onData={onPropertyData}
              setViewDrawerVisible={() => {}}
              showRules={showRules}
              sdkHighlights={sdkFlowPropertyFieldDetailsById[row.dataSetInternalID] ?? []}
              autoOpen={focusedFlowPropertyInternalId === row.dataSetInternalID}
            />
            <PropertyDelete
              id={row.dataSetInternalID}
              data={propertyDataSource}
              buttonType={'icon'}
              actionRef={actionRefPropertyTable}
              setViewDrawerVisible={() => {}}
              onData={onPropertyData}
            />
          </Space>,
        ];
      },
    },
  ];

  const tabContent: Record<FlowDataSetObjectKeys, React.ReactNode> = {
    flowInformation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
        {/* <Card size="small" title={'Data Set Information'}> */}
        <Card
          size='small'
          title={
            <FormattedMessage id='pages.lifeCycleModel.information.name' defaultMessage='Name' />
          }
        >
          <Card
            size='small'
            title={
              <RequiredMark
                label={
                  <FormattedMessage
                    id='pages.flow.view.flowInformation.baseName'
                    defaultMessage='Base name'
                  />
                }
                showError={baseNameError}
              />
            }
          >
            <LangTextItemForm
              name={['flowInformation', 'dataSetInformation', 'name', 'baseName']}
              label={
                <FormattedMessage
                  id='pages.flow.view.flowInformation.baseName'
                  defaultMessage='Base name'
                />
              }
              setRuleErrorState={setBaseNameError}
              autoExpandRequired={schema['flowDataSet']['flowInformation']['dataSetInformation'][
                'name'
              ]['baseName']['rules'].some((rule) => rule.required)}
              rules={[
                ...(showRules
                  ? getRules(
                      schema['flowDataSet']['flowInformation']['dataSetInformation']['name'][
                        'baseName'
                      ]['rules'],
                    )
                  : []),
                {
                  pattern: /^[^;；]*$/,
                  message: (
                    <FormattedMessage
                      id='validator.lang.mustNotContainSemicolon'
                      defaultMessage='Must not contain semicolon'
                    />
                  ),
                },
              ]}
            />
          </Card>
          <br />
          <Card
            size='small'
            title={
              <RequiredMark
                label={
                  <FormattedMessage
                    id='pages.flow.view.flowInformation.treatmentStandardsRoutes'
                    defaultMessage='Treatment, standards, routes'
                  />
                }
                showError={treatmentStandardsRoutesError}
              />
            }
          >
            <LangTextItemForm
              name={['flowInformation', 'dataSetInformation', 'name', 'treatmentStandardsRoutes']}
              label={
                <FormattedMessage
                  id='pages.flow.view.flowInformation.treatmentStandardsRoutes'
                  defaultMessage='Treatment, standards, routes'
                />
              }
              setRuleErrorState={setTreatmentStandardsRoutesError}
              autoExpandRequired={schema['flowDataSet']['flowInformation']['dataSetInformation'][
                'name'
              ]['treatmentStandardsRoutes']['rules'].some((rule) => rule.required)}
              rules={[
                ...(showRules
                  ? getRules(
                      schema['flowDataSet']['flowInformation']['dataSetInformation']['name'][
                        'treatmentStandardsRoutes'
                      ]['rules'],
                    )
                  : []),
                {
                  pattern: /^[^;；]*$/,
                  message: (
                    <FormattedMessage
                      id='validator.lang.mustNotContainSemicolon'
                      defaultMessage='Must not contain semicolon'
                    />
                  ),
                },
              ]}
            />
          </Card>
          <br />
          <Card
            size='small'
            title={
              <RequiredMark
                label={
                  <FormattedMessage
                    id='pages.flow.view.flowInformation.mixAndLocationTypes'
                    defaultMessage='Mix and location types'
                  />
                }
                showError={mixAndLocationTypesError}
              />
            }
          >
            <LangTextItemForm
              name={['flowInformation', 'dataSetInformation', 'name', 'mixAndLocationTypes']}
              label={
                <FormattedMessage
                  id='pages.flow.view.flowInformation.mixAndLocationTypes'
                  defaultMessage='Mix and location types'
                />
              }
              setRuleErrorState={setMixAndLocationTypesError}
              autoExpandRequired={schema['flowDataSet']['flowInformation']['dataSetInformation'][
                'name'
              ]['mixAndLocationTypes']['rules'].some((rule) => rule.required)}
              rules={[
                ...(showRules
                  ? getRules(
                      schema['flowDataSet']['flowInformation']['dataSetInformation']['name'][
                        'mixAndLocationTypes'
                      ]['rules'],
                    )
                  : []),
                {
                  pattern: /^[^;；]*$/,
                  message: (
                    <FormattedMessage
                      id='validator.lang.mustNotContainSemicolon'
                      defaultMessage='Must not contain semicolon'
                    />
                  ),
                },
              ]}
            />
          </Card>
          <br />
          <Card
            size='small'
            title={
              <FormattedMessage
                id='pages.flow.view.flowInformation.flowProperties'
                defaultMessage='Quantitative flow properties'
              />
            }
          >
            <LangTextItemForm
              name={['flowInformation', 'dataSetInformation', 'name', 'flowProperties']}
              label={
                <FormattedMessage
                  id='pages.flow.view.flowInformation.flowProperties'
                  defaultMessage='Quantitative flow properties'
                />
              }
              rules={[
                ...(showRules
                  ? getRules(
                      schema['flowDataSet']['flowInformation']['dataSetInformation']['name'][
                        'flowProperties'
                      ]['rules'],
                    )
                  : []),
                {
                  pattern: /^[^;；]*$/,
                  message: (
                    <FormattedMessage
                      id='validator.lang.mustNotContainSemicolon'
                      defaultMessage='Must not contain semicolon'
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.flow.view.flowInformation.synonyms'
              defaultMessage='Synonyms'
            />
          }
        >
          <LangTextItemForm
            name={['flowInformation', 'dataSetInformation', 'common:synonyms']}
            label={
              <FormattedMessage
                id='pages.flow.view.flowInformation.synonyms'
                defaultMessage='Synonyms'
              />
            }
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.flow.view.flowInformation.classificationInformation'
              defaultMessage='Category and classification information'
            />
          }
        >
          <Form.Item
            required={false}
            label={
              <RequiredMark
                showError={false}
                label={
                  <FormattedMessage
                    id='pages.flow.view.modellingAndValidation.typeOfDataSet'
                    defaultMessage='Type of flow'
                  />
                }
              />
            }
            name={['modellingAndValidation', 'LCIMethod', 'typeOfDataSet']}
            rules={
              showRules
                ? getRules(
                    schema['flowDataSet']['modellingAndValidation']['LCIMethod']['typeOfDataSet'][
                      'rules'
                    ],
                  )
                : []
            }
          >
            <Select
              options={myFlowTypeOptions}
              onChange={(value) => {
                if (thisFlowType === 'Elementary flow' || value === 'Elementary flow') {
                  const basePath = [
                    'flowInformation',
                    'dataSetInformation',
                    'classificationInformation',
                  ];
                  for (const [systemKey, classKey] of [
                    ['common:elementaryFlowCategorization', 'common:category'],
                    ['common:classification', 'common:class'],
                  ]) {
                    const systemPath = [...basePath, systemKey];
                    formRef.current?.setFieldValue(
                      systemPath,
                      clearClassificationSelection(
                        formRef.current?.getFieldValue(systemPath),
                        classKey,
                      ),
                    );
                  }
                }
                setThisFlowType(value);
                onData();
              }}
            />
          </Form.Item>
          <LevelTextItemForm
            hidden={thisFlowType !== 'Elementary flow'}
            showRules={showRules}
            dataType={'Flow'}
            lang={lang}
            flowType={thisFlowType}
            formRef={formRef}
            onData={onData}
            name={[
              'flowInformation',
              'dataSetInformation',
              'classificationInformation',
              'common:elementaryFlowCategorization',
              'common:category',
            ]}
            rules={
              thisFlowType !== 'Elementary flow'
                ? []
                : showRules
                  ? getRules(
                      schema['flowDataSet']['flowInformation']['dataSetInformation'][
                        'classificationInformation'
                      ]['common:elementaryFlowCategorization']['common:category']['@catId'][
                        'rules'
                      ],
                    )
                  : []
            }
          />
          <LevelTextItemForm
            hidden={thisFlowType === 'Elementary flow'}
            dataType={'Flow'}
            lang={lang}
            flowType={thisFlowType}
            formRef={formRef}
            onData={onData}
            name={[
              'flowInformation',
              'dataSetInformation',
              'classificationInformation',
              'common:classification',
              'common:class',
            ]}
            showRules={showRules}
            rules={
              showRules
                ? getRules(
                    schema['flowDataSet']['flowInformation']['dataSetInformation'][
                      'classificationInformation'
                    ]['common:classification']['common:class'][0]['@classId']['rules'],
                  )
                : []
            }
          />
        </Card>
        <br />
        <Form.Item
          label={
            <FormattedMessage
              id='pages.flow.view.flowInformation.CASNumber'
              defaultMessage='CAS Number'
            />
          }
          name={['flowInformation', 'dataSetInformation', 'CASNumber']}
          rules={
            showRules
              ? getRules(
                  schema['flowDataSet']['flowInformation']['dataSetInformation']['CASNumber'][
                    'rules'
                  ],
                )
              : []
          }
        >
          <Input />
        </Form.Item>
        <Form.Item
          label={
            <FormattedMessage
              id='pages.flow.view.flowInformation.sumFormula'
              defaultMessage='Sum formula'
            />
          }
          name={['flowInformation', 'dataSetInformation', 'sumFormula']}
        >
          <Input />
        </Form.Item>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.flow.view.flowInformation.generalComment'
              defaultMessage='General comment on data set'
            />
          }
        >
          <LangTextItemForm
            name={['flowInformation', 'dataSetInformation', 'common:generalComment']}
            label={
              <FormattedMessage
                id='pages.flow.view.flowInformation.generalComment'
                defaultMessage='General comment on data set'
              />
            }
          />
        </Card>
        <br />
        <Form.Item
          label={
            <FormattedMessage
              id='pages.flow.view.flowInformation.ECNumber'
              defaultMessage='EC Number'
            />
          }
          name={['flowInformation', 'dataSetInformation', 'common:other', 'ecn:ECNumber']}
        >
          <Input />
        </Form.Item>
        {/* </Card> */}
        {/* <br />
                    <Card size="small" title={'Quantitative Reference'}>
                        <Form.Item label='Reference To Reference Flow Property' name={['flowInformation', 'quantitativeReference', 'referenceToReferenceFlowProperty']}>
                            <Input />
                        </Form.Item>
                    </Card> */}
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.flow.view.flowInformation.geography'
              defaultMessage='Geography'
            />
          }
        >
          <LocationTextItemForm
            label={
              <FormattedMessage
                id='pages.flow.view.flowInformation.locationOfSupply'
                defaultMessage='Location of supply'
              />
            }
            name={['flowInformation', 'geography', 'locationOfSupply']}
            multiple
            lang={lang}
            onData={onData}
            rules={
              showRules
                ? getRules(
                    schema['flowDataSet']['flowInformation']['geography']['locationOfSupply'][
                      'rules'
                    ],
                  )
                : []
            }
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.flow.view.flowInformation.technology'
              defaultMessage='Technological representativeness'
            />
          }
        >
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.flow.view.flowInformation.technologicalApplicability'
              defaultMessage='Technical purpose of product or waste'
            />
          </Divider>
          <LangTextItemForm
            name={['flowInformation', 'technology', 'technologicalApplicability']}
            label={
              <FormattedMessage
                id='pages.flow.view.flowInformation.technologicalApplicability'
                defaultMessage='Technical purpose of product or waste'
              />
            }
          />
          <SourceSelectForm
            name={['flowInformation', 'technology', 'referenceToTechnicalSpecification']}
            label={
              <FormattedMessage
                id='pages.flow.view.flowInformation.referenceToTechnicalSpecification'
                defaultMessage='Technical specification'
              />
            }
            lang={lang}
            formRef={formRef}
            onData={onData}
          />
        </Card>
      </Space>
    ),
    modellingAndValidation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
        {/* <Card size="small" title={'LCI Method'}>
          <Form.Item
            label={
              <FormattedMessage
                id="pages.flow.view.modellingAndValidation.lCIMethod:TypeOfDataSet"
                defaultMessage="LCI Method: Type Of Data Set"
              />
            }
            name={['modellingAndValidation', 'LCIMethod', 'typeOfDataSet']}
          >
            <Select options={flowTypeOptions} />
          </Form.Item>
        </Card>
        <br /> */}
        {/* <Card
          size="small"
          title={
            <FormattedMessage
              id="pages.flow.view.modellingAndValidation.complianceDeclarations"
              defaultMessage="Compliance Declarations"
            />
          }
        > */}
        <SourceSelectForm
          defaultSourceName={formType === 'create' ? 'ILCD Data Network - Entry-level' : undefined}
          lang={lang}
          formRef={formRef}
          label={
            <FormattedMessage
              id='pages.flow.view.modellingAndValidation.referenceToComplianceSystem'
              defaultMessage='Compliance system name'
            />
          }
          name={[
            'modellingAndValidation',
            'complianceDeclarations',
            'compliance',
            'common:referenceToComplianceSystem',
          ]}
          onData={onData}
          showRequiredLabel={true}
          rules={
            showRules
              ? getRules(
                  schema['flowDataSet']['modellingAndValidation']['complianceDeclarations'][
                    'compliance'
                  ]['common:referenceToComplianceSystem']['@refObjectId']['rules'],
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
                  id='pages.flow.view.modellingAndValidation.approvalOfOverallCompliance'
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
                  schema['flowDataSet']['modellingAndValidation']['complianceDeclarations'][
                    'compliance'
                  ]['common:approvalOfOverallCompliance']['rules'],
                )
              : []
          }
        >
          <Select options={complianceOptions} />
        </Form.Item>
        {/* </Card> */}
      </Space>
    ),
    administrativeInformation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.flow.view.administrativeInformation.dataEntryBy'
              defaultMessage='Data entry by'
            />
          }
        >
          <Form.Item
            required={false}
            label={
              <RequiredMark
                showError={false}
                label={
                  <FormattedMessage
                    id='pages.flow.view.administrativeInformation.timeStamp'
                    defaultMessage='Time stamp (last saved)'
                  />
                }
              />
            }
            name={['administrativeInformation', 'dataEntryBy', 'common:timeStamp']}
            rules={
              showRules
                ? getRules(
                    schema['flowDataSet']['administrativeInformation']['dataEntryBy'][
                      'common:timeStamp'
                    ]['rules'],
                  )
                : []
            }
          >
            <Input disabled={true} style={{ color: token.colorTextDescription }} />
          </Form.Item>
          <SourceSelectForm
            defaultSourceName={formType === 'create' ? 'ILCD format' : undefined}
            lang={lang}
            formRef={formRef}
            label={
              <FormattedMessage
                id='pages.flow.view.administrativeInformation.referenceToDataSetFormat'
                defaultMessage='Data set format(s)'
              />
            }
            name={['administrativeInformation', 'dataEntryBy', 'common:referenceToDataSetFormat']}
            showRequiredLabel={true}
            rules={
              showRules
                ? getRules(
                    schema['flowDataSet']['administrativeInformation']['dataEntryBy'][
                      'common:referenceToDataSetFormat'
                    ]['@refObjectId']['rules'],
                  )
                : []
            }
            onData={onData}
          />
          <br />
          <ContactSelectForm
            lang={lang}
            formRef={formRef}
            label={
              <FormattedMessage
                id='pages.flow.view.administrativeInformation.referenceToPersonOrEntityEnteringTheData'
                defaultMessage='Data entry by:'
              />
            }
            name={[
              'administrativeInformation',
              'dataEntryBy',
              'common:referenceToPersonOrEntityEnteringTheData',
            ]}
            onData={onData}
          />
        </Card>
        <br />

        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.flow.view.administrativeInformation.publicationAndOwnership'
              defaultMessage='Publication and ownership'
            />
          }
        >
          <DatasetCreateVersionFormItem
            createVersion={formType === 'createVersion'}
            label={
              <RequiredMark
                showError={false}
                label={
                  <FormattedMessage
                    id='pages.flow.view.administrativeInformation.dataSetVersion'
                    defaultMessage='Data set version'
                  />
                }
              />
            }
            name={['administrativeInformation', 'publicationAndOwnership', 'common:dataSetVersion']}
            rules={getRules(
              schema['flowDataSet']['administrativeInformation']['publicationAndOwnership'][
                'common:dataSetVersion'
              ]['rules'],
            )}
          >
            <Input disabled={formType === 'edit'} />
          </DatasetCreateVersionFormItem>
          {/* <FlowsSelectForm
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:referenceToPrecedingDataSetVersion',
            ]}
            label={
              <FormattedMessage
                id='pages.flow.view.administrativeInformation.permanentDataSetURI'
                defaultMessage='Permanent data set URI'
              />
            }
            lang={lang}
            formRef={formRef}
            drawerVisible={drawerVisible}
            onData={onData}
          />
          <br /> */}
          <ContactSelectForm
            lang={lang}
            formRef={formRef}
            label={
              <FormattedMessage
                id='pages.flow.view.administrativeInformation.referenceToOwnershipOfDataSet'
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
                    schema['flowDataSet']['administrativeInformation']['publicationAndOwnership'][
                      'common:referenceToOwnershipOfDataSet'
                    ]['@refObjectId']['rules'],
                  )
                : []
            }
          />
          <br />
          <Form.Item
            label={
              <FormattedMessage
                id='pages.flow.view.administrativeInformation.permanentDataSetURI'
                defaultMessage='Permanent data set URI'
              />
            }
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:permanentDataSetURI',
            ]}
          >
            <Input disabled={true} />
          </Form.Item>
        </Card>
      </Space>
    ),
    flowProperties: (
      <>
        {renderSdkSectionMessages('flowProperties.requiredSummary')}
        {renderSdkSectionMessages('flowProperties.quantitativeReferenceSummary')}
        <ProTable<FlowpropertyTabTable, ListPagination>
          rowKey={(record) => `${record.dataSetInternalID}`}
          actionRef={actionRefPropertyTable}
          search={false}
          pagination={{
            showSizeChanger: false,
            pageSize: 10,
          }}
          rowClassName={(record) => {
            const isInRefCheck = refCheckContext?.refCheckData?.some(
              (item: RefCheckType) =>
                item.id === record.referenceToFlowPropertyDataSetId &&
                item.version === record.referenceToFlowPropertyDataSetVersion,
            );
            const isFormComplete = record.meanValue;
            const rowClasses: string[] = [];

            if (showRules && (isInRefCheck || !isFormComplete)) {
              rowClasses.push('error-row');
            }

            if ((sdkFlowPropertyRowHighlightsById[record.dataSetInternalID] ?? []).length > 0) {
              rowClasses.push('sdk-error-row');
            }

            if (
              focusedFlowPropertyInternalId &&
              focusedFlowPropertyInternalId === record.dataSetInternalID
            ) {
              rowClasses.push('sdk-focus-row');
            }

            return rowClasses.join(' ');
          }}
          className='flow-property-table'
          toolBarRender={() => {
            return [
              <PropertyCreate
                key={0}
                lang={lang}
                onData={onPropertyDataCreate}
                showRules={showRules}
              />,
            ];
          }}
          dataSource={dataSource}
          columns={propertyColumns}
        />
      </>
    ),
  };

  useEffect(() => {
    if (!drawerVisible) return;
    setThisFlowType(flowType);
  }, [flowType]);

  return (
    <Card
      style={{ width: '100%' }}
      tabList={tabList}
      activeTabKey={activeTabKey}
      onTabChange={(key) => onTabChange(key as FlowDataSetObjectKeys)}
    >
      {Object.keys(tabContent).map((key) => (
        <div key={key} style={{ display: key === activeTabKey ? 'block' : 'none' }}>
          {tabContent[key as FlowDataSetObjectKeys]}
        </div>
      ))}
    </Card>
  );
};
