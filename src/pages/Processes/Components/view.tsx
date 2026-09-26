import LangTextItemDescription from '@/components/LangTextItem/description';
import LevelTextItemDescription from '@/components/LevelTextItem/description';
import LocationTextItemDescription from '@/components/LocationTextItem/description';
import ContactSelectDescription from '@/pages/Contacts/Components/select/description';
import SourceSelectDescription from '@/pages/Sources/Components/select/description';
// import ReferenceUnit from '@/pages/Unitgroups/Components/Unit/reference';
import { getFlowStateCodeByIdsAndVersions } from '@/services/flows/api';
import {
  ContentLanguageAwareTableParams,
  getContentLanguageAwareTableParams,
} from '@/services/general/data';
import { getUnitData, jsonToList } from '@/services/general/util';
import type { LCIAResultTable } from '@/services/lciaMethods/data';
import { getProcessDetail, getProcessExchange } from '@/services/processes/api';
import {
  FormProcess,
  ProcessDetailResponse,
  ProcessExchangeData,
  ProcessExchangeTable,
} from '@/services/processes/data';
import { genProcessExchangeTableData, genProcessFromData } from '@/services/processes/util';

import { getClassificationValues } from '@/pages/Utils';
import { getRejectedComments, mergeCommentsToData } from '@/pages/Utils/review';
import { CloseOutlined, ProductOutlined, ProfileOutlined } from '@ant-design/icons';
import { ActionType, ProColumns, ProTable } from '@ant-design/pro-components';
import {
  Button,
  Card,
  Collapse,
  Descriptions,
  Divider,
  Drawer,
  Space,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
import type { ButtonType } from 'antd/es/button';
import type { FC, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, useLocation } from 'umi';
import ComplianceItemView from './Compliance/view';
import ProcessExchangeView from './Exchange/view';
import {
  completenessElementaryFlowsTypeOptions,
  completenessElementaryFlowsValueOptions,
  completenessProductModelOptions,
  uncertaintyDistributionTypeOptions,
} from './optiondata';
import ReviewItemView from './Review/view';

import { getExchangeColumns, PROCESS_EXCHANGE_TABLE_SCROLL } from './Exchange/column';
import {
  buildMergedLcaRows as buildMergedLciaRows,
  getDefaultLcaDataScopeForPath,
  getLcaMethodMetaMap,
} from './lcaAnalysisShared';
import {
  copyrightOptions,
  LCIMethodApproachOptions,
  LCIMethodPrincipleOptions,
  licenseTypeOptions,
  processtypeOfDataSetOptions,
} from './optiondata';
import ProcessLciaResultsPanel from './processLciaResultsPanel';
import { shouldUsePublishedLciaResults } from './publishedLciaResults';

type Props = {
  id: string;
  version: string;
  lang: string;
  buttonType: string;
  disabled: boolean;
  actionRef?: React.RefObject<ActionType | undefined>;
  buttonTypeProp?: ButtonType;
  tooltipTitle?: string;
  triggerLabel?: ReactNode;
  autoOpen?: boolean;
  onDrawerClose?: () => void;
};

type ProcessFormWithId = FormProcess & { id?: string };

type FlowStateCodeItem = {
  id?: string;
  version?: string;
  stateCode?: number;
  classification?: string;
};

type FlowStateCodeResponse = {
  error: unknown;
  data: FlowStateCodeItem[];
};

type ProcessExchangeResponse = {
  data: ProcessExchangeTable[];
  page?: number;
  success?: boolean;
  total?: number;
};

const toReferenceValue = (reference?: ProcessExchangeData['referenceToFlowDataSet']) => {
  return Array.isArray(reference) ? reference[0] : reference;
};

const getProcesstypeOfDataSetOptions = (value: string) => {
  const option = processtypeOfDataSetOptions.find((opt) => opt.value === value);
  return option ? option.label : '-';
};
const getLCIMethodPrincipleOptions = (value: string) => {
  const option = LCIMethodPrincipleOptions.find((opt) => opt.value === value);
  return option ? option.label : '-';
};
const getLCIMethodApproachOptions = (value: string) => {
  const option = LCIMethodApproachOptions.find((opt) => opt.value === value);
  return option ? option.label : '-';
};
const getCopyrightOptions = (value: string) => {
  const option = copyrightOptions.find((opt) => opt.value === value);
  return option ? option.label : '-';
};
const getLicenseTypeOptions = (value: string) => {
  const option = licenseTypeOptions.find((opt) => opt.value === value);
  return option ? option.label : '-';
};

const getComplianceLabel = (value: string) => {
  const option = uncertaintyDistributionTypeOptions.find((opt) => opt.value === value);
  return option ? option.label : '-';
};

const getCompletenessProductModelOptions = (value: string) => {
  const option = completenessProductModelOptions.find((opt) => opt.value === value);
  return option ? option.label : '-';
};

const getCompletenessElementaryFlowsTypeOptions = (value: string) => {
  const option = completenessElementaryFlowsTypeOptions.find((opt) => opt.value === value);
  return option ? option.label : '-';
};

const getCompletenessElementaryFlowsValueOptions = (value: string) => {
  const option = completenessElementaryFlowsValueOptions.find((opt) => opt.value === value);
  return option ? option.label : '-';
};

const ProcessView: FC<Props> = ({
  id,
  version,
  buttonType,
  lang,
  disabled,
  buttonTypeProp = 'default',
  tooltipTitle,
  triggerLabel,
  autoOpen = false,
  onDrawerClose,
}) => {
  const location = useLocation();
  const defaultLcaDataScope = getDefaultLcaDataScopeForPath(location.pathname);
  const [drawerVisible, setDrawerVisible] = useState(false);
  // const [footerButtons, setFooterButtons] = useState<JSX.Element>();
  const [activeTabKey, setActiveTabKey] = useState<string>('processInformation');
  const [exchangeDataSource, setExchangeDataSource] = useState<ProcessExchangeData[]>([]);
  const inputExchangeRequestEpochRef = useRef(0);
  const outputExchangeRequestEpochRef = useRef(0);
  const exchangeTableParams = useMemo(() => getContentLanguageAwareTableParams(lang), [lang]);
  const currentExchangeContentLanguageRef = useRef(exchangeTableParams.contentLanguage);
  currentExchangeContentLanguageRef.current = exchangeTableParams.contentLanguage;
  const [spinning, setSpinning] = useState(false);
  const [initData, setInitData] = useState<Partial<ProcessFormWithId>>({});
  const processClassification =
    initData.processInformation?.dataSetInformation?.classificationInformation?.[
      'common:classification'
    ];
  const [lciaResultDataSource, setLciaResultDataSource] = useState<LCIAResultTable[]>([]);
  const tabList = [
    {
      key: 'processInformation',
      tab: (
        <FormattedMessage
          id='pages.process.view.processInformation'
          defaultMessage='Process information'
        />
      ),
    },
    {
      key: 'modellingAndValidation',
      tab: (
        <FormattedMessage
          id='pages.process.view.modellingAndValidation'
          defaultMessage='Modelling and validation'
        />
      ),
    },
    {
      key: 'administrativeInformation',
      tab: (
        <FormattedMessage
          id='pages.process.view.administrativeInformation'
          defaultMessage='Administrative information'
        />
      ),
    },
    {
      key: 'exchanges',
      tab: (
        <FormattedMessage id='pages.process.view.exchanges' defaultMessage='Inputs and Outputs' />
      ),
    },
    {
      key: 'lciaResults',
      tab: <FormattedMessage id='pages.process.view.lciaresults' defaultMessage='LCIA Results' />,
    },
    {
      key: 'validation',
      tab: <FormattedMessage id='pages.process.validation' defaultMessage='Validation' />,
    },
    {
      key: 'complianceDeclarations',
      tab: (
        <FormattedMessage
          id='pages.process.complianceDeclarations'
          defaultMessage='Compliance declarations'
        />
      ),
    },
  ];

  const onTabChange = (key: string) => {
    setActiveTabKey(key);
  };
  const baseProcessExchangeColumns = getExchangeColumns(lang);
  const processExchangeColumns: ProColumns<ProcessExchangeTable>[] = [
    ...baseProcessExchangeColumns,
    {
      title: <FormattedMessage id='pages.table.title.option' defaultMessage='Actions' />,
      dataIndex: 'option',
      search: false,
      width: 80,
      render: (_, row) => {
        return [
          <Space size={'small'} key={0}>
            <ProcessExchangeView
              id={row.dataSetInternalID}
              data={exchangeDataSource}
              buttonType={'icon'}
              lang={lang}
            />
          </Space>,
        ];
      },
    },
  ];

  const contentList: Record<string, React.ReactNode> = {
    processInformation: (
      <>
        <Descriptions
          bordered
          size={'small'}
          column={1}
          items={[
            {
              key: 0,
              label: (
                <FormattedMessage
                  id='pages.process.view.processInformation.id'
                  defaultMessage='ID'
                />
              ),
              styles: {
                label: {
                  width: '100px',
                },
              },
              children: initData.processInformation?.dataSetInformation?.['common:UUID'] ?? '-',
            },
          ]}
        />

        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.processInformation.name'
              defaultMessage='Name'
            />
          }
        >
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            {
              <FormattedMessage
                id='pages.process.view.processInformation.baseName'
                defaultMessage='Base name'
              />
            }
          </Divider>
          <LangTextItemDescription
            data={initData.processInformation?.dataSetInformation?.name?.baseName}
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.processInformation.treatmentStandardsRoutes'
              defaultMessage='Treatment, standards, routes'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData?.processInformation?.dataSetInformation?.name?.treatmentStandardsRoutes ??
              '-'
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.processInformation.mixAndLocationTypes'
              defaultMessage='Mix and location types'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData?.processInformation?.dataSetInformation?.name?.mixAndLocationTypes ?? '-'
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.processInformation.functionalUnitFlowProperties'
              defaultMessage='Quantitative product or process properties'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData?.processInformation?.dataSetInformation?.name
                ?.functionalUnitFlowProperties ?? '-'
            }
          />
        </Card>
        <br />
        <Descriptions
          bordered
          size={'small'}
          column={1}
          items={[
            {
              key: 0,
              label: (
                <FormattedMessage
                  id='pages.process.view.processInformation.identifierOfSubDataSet'
                  defaultMessage='Identifier of sub-data set'
                />
              ),
              styles: {
                label: {
                  width: '140px',
                },
              },
              children:
                initData.processInformation?.dataSetInformation?.identifierOfSubDataSet ?? '-',
            },
          ]}
        />
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.process.view.processInformation.synonyms'
            defaultMessage='Synonyms'
          />
        </Divider>
        <LangTextItemDescription
          data={initData?.processInformation?.dataSetInformation?.['common:synonyms']}
        />
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.process.view.processInformation.generalComment'
            defaultMessage='General comment on data set'
          />
        </Divider>
        <LangTextItemDescription
          data={initData.processInformation?.dataSetInformation?.['common:generalComment']}
        />
        <br />
        <LevelTextItemDescription
          data={getClassificationValues(
            Array.isArray(processClassification)
              ? processClassification[0]?.['common:class']
              : processClassification?.['common:class'],
          )}
          lang={lang}
          categoryType={'Process'}
        />
        <br />
        <SourceSelectDescription
          title={
            <FormattedMessage
              id='pages.process.view.processInformation.referenceToExternalDocumentation'
              defaultMessage='Data set LCA report, background info'
            />
          }
          data={initData.processInformation?.dataSetInformation?.referenceToExternalDocumentation}
          lang={lang}
        />
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.processInformation.time'
              defaultMessage='Time representativeness'
            />
          }
        >
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.processInformation.referenceYear'
                    defaultMessage='Reference year'
                  />
                ),
                styles: {
                  label: {
                    width: '140px',
                  },
                },
                children: initData.processInformation?.time?.['common:referenceYear'] ?? '-',
              },
            ]}
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.processInformation.dataSetValidUntil'
                    defaultMessage='Data set valid until:'
                  />
                ),
                styles: {
                  label: {
                    width: '140px',
                  },
                },
                children: initData.processInformation?.time?.['common:dataSetValidUntil'] ?? '-',
              },
            ]}
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.processInformation.timeRepresentativenessDescription'
              defaultMessage='Time representativeness description'
            />
          </Divider>
          <LangTextItemDescription
            data={initData.processInformation?.time?.['common:timeRepresentativenessDescription']}
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.processInformation.locationOfOperationSupplyOrProduction'
              defaultMessage='Location'
            />
          }
        >
          <LocationTextItemDescription
            lang={lang}
            data={
              initData.processInformation?.geography?.locationOfOperationSupplyOrProduction?.[
                '@location'
              ] ?? '-'
            }
            label={
              <FormattedMessage
                id='pages.process.view.processInformation.location'
                defaultMessage='Location'
              />
            }
            styles={{ label: { width: '100px' } }}
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.processInformation.descriptionOfRestrictions'
              defaultMessage='Geographical representativeness description'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.processInformation?.geography?.locationOfOperationSupplyOrProduction
                ?.descriptionOfRestrictions
            }
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.processInformation.subLocationOfOperationSupplyOrProduction'
              defaultMessage='Sub-location(s)'
            />
          }
        >
          <LocationTextItemDescription
            lang={lang}
            data={
              initData.processInformation?.geography?.subLocationOfOperationSupplyOrProduction?.[
                '@subLocation'
              ] ?? '-'
            }
            label={
              <FormattedMessage
                id='pages.process.view.processInformation.subLocationOfOperationSupplyOrProduction'
                defaultMessage='Sub-location(s)'
              />
            }
            styles={{ label: { width: '100px' } }}
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.processInformation.descriptionOfRestrictions'
              defaultMessage='Geographical representativeness description'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.processInformation?.geography?.subLocationOfOperationSupplyOrProduction
                ?.descriptionOfRestrictions
            }
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.processInformation.technology'
              defaultMessage='Technological representativeness'
            />
          }
        >
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.processInformation.technologyDescriptionAndIncludedProcesses'
              defaultMessage='Technology description including background system'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.processInformation?.technology?.technologyDescriptionAndIncludedProcesses
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.processInformation.technologicalApplicability'
              defaultMessage='Technical purpose of product or process'
            />
          </Divider>
          <LangTextItemDescription
            data={initData.processInformation?.technology?.technologicalApplicability}
          />
          <br />
          <SourceSelectDescription
            title={
              <FormattedMessage
                id='pages.process.view.processInformation.referenceToTechnologyPictogramme'
                defaultMessage='Technology pictogram'
              />
            }
            data={initData.processInformation?.technology?.referenceToTechnologyPictogramme ?? {}}
            lang={lang}
          />
          <br />
          <SourceSelectDescription
            title={
              <FormattedMessage
                id='pages.process.view.processInformation.referenceToTechnologyFlowDiagrammOrPicture'
                defaultMessage='Flow diagram(s) or picture(s)'
              />
            }
            data={
              initData.processInformation?.technology?.referenceToTechnologyFlowDiagrammOrPicture ??
              {}
            }
            lang={lang}
          />
        </Card>
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.process.view.processInformation.modelDescription'
            defaultMessage='Model description'
          />
        </Divider>
        <LangTextItemDescription
          data={initData.processInformation?.mathematicalRelations?.modelDescription}
        />
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.processInformation.variableParameter'
              defaultMessage='Variable / parameter'
            />
          }
        >
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.processInformation.variableParameter.name'
                    defaultMessage='Name of variable'
                  />
                ),
                styles: {
                  label: {
                    width: '120px',
                  },
                },
                children:
                  initData.processInformation?.mathematicalRelations?.variableParameter?.[
                    '@name'
                  ] ?? '-',
              },
            ]}
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.processInformation.variableParameter.formula'
                    defaultMessage='Formula'
                  />
                ),
                styles: {
                  label: {
                    width: '120px',
                  },
                },
                children:
                  initData.processInformation?.mathematicalRelations?.variableParameter?.formula ??
                  '-',
              },
            ]}
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.processInformation.variableParameter.meanValue'
                    defaultMessage='Mean value'
                  />
                ),
                styles: {
                  label: {
                    width: '120px',
                  },
                },
                children:
                  initData.processInformation?.mathematicalRelations?.variableParameter
                    ?.meanValue ?? '-',
              },
            ]}
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.processInformation.variableParameter.minimumValue'
                    defaultMessage='Minimum value'
                  />
                ),
                styles: {
                  label: {
                    width: '120px',
                  },
                },
                children:
                  initData.processInformation?.mathematicalRelations?.variableParameter
                    ?.minimumValue ?? '-',
              },
            ]}
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.processInformation.variableParameter.maximumValue'
                    defaultMessage='Maximum value'
                  />
                ),
                styles: {
                  label: {
                    width: '120px',
                  },
                },
                children:
                  initData.processInformation?.mathematicalRelations?.variableParameter
                    ?.maximumValue ?? '-',
              },
            ]}
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.processInformation.variableParameter.uncertaintyDistributionType'
                    defaultMessage='Uncertainty distribution type'
                  />
                ),
                styles: {
                  label: {
                    width: '180px',
                  },
                },
                children: getComplianceLabel(
                  initData.processInformation?.mathematicalRelations?.variableParameter
                    ?.uncertaintyDistributionType ?? '-',
                ),
              },
            ]}
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.processInformation.variableParameter.relativeStandardDeviation95In'
                    defaultMessage='Relative standard deviation (95%) in %'
                  />
                ),
                styles: {
                  label: {
                    width: '180px',
                  },
                },
                children:
                  initData.processInformation?.mathematicalRelations?.variableParameter
                    ?.relativeStandardDeviation95In ?? '-',
              },
            ]}
          />

          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            {
              <FormattedMessage
                id='pages.process.view.processInformation.variableParameter.comment'
                defaultMessage='Comment, units, defaults'
              />
            }
          </Divider>
          <LangTextItemDescription
            data={initData.processInformation?.mathematicalRelations?.variableParameter?.comment}
          />
        </Card>
      </>
    ),
    modellingAndValidation: (
      <>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.lCIMethodAndAllocation'
              defaultMessage='LCI method and allocation'
            />
          }
        >
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.modellingAndValidation.typeOfDataSet'
                    defaultMessage='Dataset type'
                  />
                ),
                styles: {
                  label: {
                    width: '220px',
                  },
                },
                children: getProcesstypeOfDataSetOptions(
                  initData.modellingAndValidation?.LCIMethodAndAllocation?.typeOfDataSet ?? '-',
                ),
              },
            ]}
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.modellingAndValidation.lCIMethodPrinciple'
                    defaultMessage='LCI method principle'
                  />
                ),
                styles: {
                  label: {
                    width: '220px',
                  },
                },
                children: getLCIMethodPrincipleOptions(
                  initData.modellingAndValidation?.LCIMethodAndAllocation?.LCIMethodPrinciple ??
                    '-',
                ),
              },
            ]}
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.deviationsFromLCIMethodPrinciple'
              defaultMessage='Deviation from LCI method principle / explanations'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.modellingAndValidation?.LCIMethodAndAllocation
                ?.deviationsFromLCIMethodPrinciple
            }
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.modellingAndValidation.lCIMethodApproaches'
                    defaultMessage='LCI method approaches'
                  />
                ),
                styles: {
                  label: {
                    width: '220px',
                  },
                },
                children: getLCIMethodApproachOptions(
                  initData.modellingAndValidation?.LCIMethodAndAllocation?.LCIMethodApproaches ??
                    '-',
                ),
              },
            ]}
          />

          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.deviationsFromLCIMethodApproaches'
              defaultMessage='Deviations from LCI method approaches / explanations'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.modellingAndValidation?.LCIMethodAndAllocation
                ?.deviationsFromLCIMethodApproaches
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.modellingConstants'
              defaultMessage='Modelling constants'
            />
          </Divider>
          <LangTextItemDescription
            data={initData.modellingAndValidation?.LCIMethodAndAllocation?.modellingConstants}
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.deviationsFromModellingConstants'
              defaultMessage='Deviation from modelling constants / explanations'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.modellingAndValidation?.LCIMethodAndAllocation
                ?.deviationsFromModellingConstants
            }
          />
          <br />
          <SourceSelectDescription
            title={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.referenceToLCAMethodDetails'
                defaultMessage='LCA methodology report'
              />
            }
            data={
              initData.modellingAndValidation?.LCIMethodAndAllocation
                ?.referenceToLCAMethodDetails ?? {}
            }
            lang={lang}
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness'
              defaultMessage='Data sources, treatment, and representativeness'
            />
          }
        >
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.dataCutOffAndCompletenessPrinciples'
              defaultMessage='Data cut-off and completeness principles'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.dataCutOffAndCompletenessPrinciples
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.deviationsFromCutOffAndCompletenessPrinciples'
              defaultMessage='Deviation from data cut-off and completeness principles / explanations'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.deviationsFromCutOffAndCompletenessPrinciples
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.dataSelectionAndCombinationPrinciples'
              defaultMessage='Data selection and combination principles'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.dataSelectionAndCombinationPrinciples
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.deviationsFromSelectionAndCombinationPrinciples'
              defaultMessage='Deviation from data selection and combination principles / explanations'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.deviationsFromSelectionAndCombinationPrinciples
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.dataTreatmentAndExtrapolationsPrinciples'
              defaultMessage='Data treatment and extrapolations principles'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.dataTreatmentAndExtrapolationsPrinciples
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.deviationsFromTreatmentAndExtrapolationPrinciples'
              defaultMessage='Deviation from data treatment and extrapolations principles / explanations'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.deviationsFromTreatmentAndExtrapolationPrinciples
            }
          />
          <br />
          <SourceSelectDescription
            title={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.referenceToDataHandlingPrinciples'
                defaultMessage='Data handling report'
              />
            }
            data={
              initData.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataHandlingPrinciples ?? {}
            }
            lang={lang}
          />
          <br />
          <SourceSelectDescription
            title={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.referenceToDataSource'
                defaultMessage='Data source(s) used for this data set'
              />
            }
            data={
              initData.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataSource ?? {}
            }
            lang={lang}
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.modellingAndValidation.percentageSupplyOrProductionCovered'
                    defaultMessage='Percentage supply or production covered'
                  />
                ),
                styles: {
                  label: {
                    width: '220px',
                  },
                },
                children:
                  initData.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                    ?.percentageSupplyOrProductionCovered ?? '-',
              },
            ]}
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.annualSupplyOrProductionVolume'
              defaultMessage='Annual supply or production volume'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.annualSupplyOrProductionVolume
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.samplingProcedure'
              defaultMessage='Sampling procedure'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.samplingProcedure
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.dataCollectionPeriod'
              defaultMessage='Data collection period'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.dataCollectionPeriod
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.uncertaintyAdjustments'
              defaultMessage='Uncertainty adjustments'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.uncertaintyAdjustments
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.useAdviceForDataSet'
              defaultMessage='Use advice for data set'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.useAdviceForDataSet
            }
          />
        </Card>
        <br />
        {/* <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.process.view.modellingAndValidation.completenessOtherProblemField'
            defaultMessage='Completeness other problem field(s)'
          />
        </Divider>
        <LangTextItemDescription
          data={initData.modellingAndValidation?.completeness?.completenessOtherProblemField}
        /> */}
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.completeness'
              defaultMessage='Completeness'
            />
          }
        >
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.modellingAndValidation.completeness.completenessProductModel'
                    defaultMessage='Completeness product model'
                  />
                ),
                styles: {
                  label: {
                    width: '140px',
                  },
                },
                children: getCompletenessProductModelOptions(
                  initData.modellingAndValidation?.completeness?.completenessProductModel ?? '-',
                ),
              },
            ]}
          />
          <br />
          <Card
            size='small'
            title={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.completeness.completenessElementaryFlows'
                defaultMessage='Completeness elementary flows, per topic'
              />
            }
          >
            <Descriptions
              bordered
              size={'small'}
              column={1}
              items={[
                {
                  key: 0,
                  label: (
                    <FormattedMessage
                      id='pages.process.view.modellingAndValidation.completeness.completenessElementaryFlows.type'
                      defaultMessage='completeness type'
                    />
                  ),
                  styles: {
                    label: {
                      width: '140px',
                    },
                  },
                  children: getCompletenessElementaryFlowsTypeOptions(
                    initData.modellingAndValidation?.completeness?.completenessElementaryFlows?.[
                      '@type'
                    ] ?? '-',
                  ),
                },
              ]}
            />
            <br />
            <Descriptions
              bordered
              size={'small'}
              column={1}
              items={[
                {
                  key: 0,
                  label: (
                    <FormattedMessage
                      id='pages.process.view.modellingAndValidation.completeness.completenessElementaryFlows.value'
                      defaultMessage='value'
                    />
                  ),
                  styles: {
                    label: {
                      width: '140px',
                    },
                  },
                  children: getCompletenessElementaryFlowsValueOptions(
                    initData.modellingAndValidation?.completeness?.completenessElementaryFlows?.[
                      '@value'
                    ] ?? '-',
                  ),
                },
              ]}
            />
          </Card>
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.completeness.completenessOtherProblemField'
              defaultMessage='Completeness other problem field(s)'
            />
          </Divider>
          <LangTextItemDescription
            data={initData.modellingAndValidation?.completeness?.completenessOtherProblemField}
          />
        </Card>
        <br />
      </>
    ),
    administrativeInformation: (
      <>
        <ContactSelectDescription
          title={
            <FormattedMessage
              id='pages.process.view.administrativeInformation.referenceToCommissioner'
              defaultMessage='Commissioner of data set'
            />
          }
          lang={lang}
          data={
            initData.administrativeInformation?.['common:commissionerAndGoal']?.[
              'common:referenceToCommissioner'
            ]
          }
        />
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.process.view.administrativeInformation.project'
            defaultMessage='Project'
          />
        </Divider>
        <LangTextItemDescription
          data={
            initData.administrativeInformation?.['common:commissionerAndGoal']?.['common:project']
          }
        />
        <br />
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.process.view.administrativeInformation.intendedApplications'
            defaultMessage='Intended applications'
          />
        </Divider>
        <LangTextItemDescription
          data={
            initData.administrativeInformation?.['common:commissionerAndGoal']?.[
              'common:intendedApplications'
            ]
          }
        />
        <br />

        <ContactSelectDescription
          title={
            <FormattedMessage
              id='pages.process.view.administrativeInformation.RreferenceToPersonOrEntityGeneratingTheDataSet'
              defaultMessage='Data set generator / modeller'
            />
          }
          lang={lang}
          data={
            initData.administrativeInformation?.dataGenerator?.[
              'common:referenceToPersonOrEntityGeneratingTheDataSet'
            ]
          }
        />
        <br />

        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.administrativeInformation.dataEntryBy'
              defaultMessage='Data entry by'
            />
          }
        >
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.administrativeInformation.timeStamp'
                    defaultMessage='Time stamp (last saved)'
                  />
                ),
                styles: {
                  label: {
                    width: '200px',
                  },
                },
                children:
                  initData?.administrativeInformation?.dataEntryBy?.['common:timeStamp'] ?? '-',
              },
            ]}
          />
          <br />
          <SourceSelectDescription
            data={
              initData?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']
            }
            title={
              <FormattedMessage
                id='pages.flow.process.administrativeInformation.referenceToDataSetFormat'
                defaultMessage='Data set format(s)'
              />
            }
            lang={lang}
          />
          <br />
          <SourceSelectDescription
            data={
              initData?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToConvertedOriginalDataSetFrom'
              ]
            }
            title={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToConvertedOriginalDataSetFrom'
                defaultMessage='Converted original data set from:'
              />
            }
            lang={lang}
          />
          <br />
          <ContactSelectDescription
            data={
              initData?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]
            }
            title={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToPersonOrEntityEnteringTheData'
                defaultMessage='Data entry by:'
              />
            }
            lang={lang}
          />
          <br />
          <SourceSelectDescription
            data={
              initData?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToDataSetUseApproval'
              ]
            }
            title={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToDataSetUseApproval'
                defaultMessage='Official approval of data set by producer/operator:'
              />
            }
            lang={lang}
          />
          <br />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.administrativeInformation.publicationAndOwnership'
              defaultMessage='Publication and ownership'
            />
          }
        >
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.administrativeInformation.dateOfLastRevision'
                    defaultMessage='Date of last revision'
                  />
                ),
                styles: {
                  label: {
                    width: '180px',
                  },
                },
                children:
                  initData.administrativeInformation?.publicationAndOwnership?.[
                    'common:dateOfLastRevision'
                  ] ?? '-',
              },
            ]}
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.administrativeInformation.dataSetVersion'
                    defaultMessage='Data set version'
                  />
                ),
                styles: {
                  label: {
                    width: '180px',
                  },
                },
                children: (
                  <Space>
                    {initData.administrativeInformation?.publicationAndOwnership?.[
                      'common:dataSetVersion'
                    ] ?? '-'}
                  </Space>
                ),
              },
            ]}
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.administrativeInformation.permanentDataSetURI'
                    defaultMessage='Permanent data set URI'
                  />
                ),
                styles: {
                  label: {
                    width: '220px',
                  },
                },
                children:
                  initData.administrativeInformation?.publicationAndOwnership?.[
                    'common:permanentDataSetURI'
                  ] ?? '-',
              },
            ]}
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.administrativeInformation.workflowAndPublicationStatus'
                    defaultMessage='Workflow and publication status'
                  />
                ),
                styles: {
                  label: {
                    width: '240px',
                  },
                },
                children:
                  initData.administrativeInformation?.publicationAndOwnership?.[
                    'common:workflowAndPublicationStatus'
                  ] ?? '-',
              },
            ]}
          />
          <br />
          <SourceSelectDescription
            title={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToUnchangedRepublication'
                defaultMessage='Unchanged re-publication of:'
              />
            }
            data={
              initData.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToUnchangedRepublication'
              ] ?? {}
            }
            lang={lang}
          />
          <br />
          <ContactSelectDescription
            title={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToRegistrationAuthority'
                defaultMessage='Registration authority'
              />
            }
            lang={lang}
            data={
              initData.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToRegistrationAuthority'
              ]
            }
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.administrativeInformation.registrationNumber'
                    defaultMessage='Registration number'
                  />
                ),
                styles: {
                  label: {
                    width: '140px',
                  },
                },
                children:
                  initData.administrativeInformation?.publicationAndOwnership?.[
                    'common:registrationNumber'
                  ] ?? '-',
              },
            ]}
          />
          <br />
          <ContactSelectDescription
            title={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToOwnershipOfDataSet'
                defaultMessage='Owner of data set'
              />
            }
            lang={lang}
            data={
              initData.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]
            }
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.administrativeInformation.copyright'
                    defaultMessage='Copyright?'
                  />
                ),
                styles: {
                  label: {
                    width: '180px',
                  },
                },
                children: getCopyrightOptions(
                  initData.administrativeInformation?.publicationAndOwnership?.[
                    'common:copyright'
                  ] ?? '-',
                ),
              },
            ]}
          />
          <br />
          <ContactSelectDescription
            title={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToEntitiesWithExclusiveAccess'
                defaultMessage='Entities or persons with exclusive access to this data set'
              />
            }
            lang={lang}
            data={
              initData.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToEntitiesWithExclusiveAccess'
              ]
            }
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.process.view.administrativeInformation.licenseType'
                    defaultMessage='License type'
                  />
                ),
                styles: {
                  label: {
                    width: '180px',
                  },
                },
                children: getLicenseTypeOptions(
                  initData.administrativeInformation?.publicationAndOwnership?.[
                    'common:licenseType'
                  ] ?? '-',
                ),
              },
            ]}
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.administrativeInformation.accessRestrictions'
              defaultMessage='Access and use restrictions'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData.administrativeInformation?.publicationAndOwnership?.[
                'common:accessRestrictions'
              ]
            }
          />
        </Card>
      </>
    ),
    exchanges: (
      <>
        <Collapse
          defaultActiveKey={['1']}
          items={[
            {
              key: '1',
              label: <FormattedMessage id='pages.process.exchange.input' defaultMessage='Input' />,
              children: (
                <ProTable<ProcessExchangeTable, ContentLanguageAwareTableParams>
                  className='tg-process-view-input-table'
                  params={exchangeTableParams}
                  search={false}
                  scroll={PROCESS_EXCHANGE_TABLE_SCROLL}
                  pagination={{
                    showSizeChanger: false,
                    pageSize: 10,
                  }}
                  request={async (params) => {
                    const requestEpoch = inputExchangeRequestEpochRef.current + 1;
                    inputExchangeRequestEpochRef.current = requestEpoch;
                    const contentLanguage =
                      params.contentLanguage ?? exchangeTableParams.contentLanguage;

                    return getProcessExchange(
                      genProcessExchangeTableData(exchangeDataSource, contentLanguage),
                      'Input',
                      params,
                    ).then((res) => {
                      const processExchangeRes = res as ProcessExchangeResponse;
                      return getUnitData('flow', processExchangeRes?.data).then((unitRes) => {
                        const normalizedUnitRes = (unitRes ?? []) as ProcessExchangeTable[];
                        const flows = exchangeDataSource.map((item) => {
                          const ref = toReferenceValue(item?.referenceToFlowDataSet);
                          return {
                            id: ref?.['@refObjectId'] ?? '',
                            version: ref?.['@version'] ?? '',
                          };
                        });
                        return getFlowStateCodeByIdsAndVersions(flows, contentLanguage).then(
                          (flowRes) => {
                            if (
                              inputExchangeRequestEpochRef.current !== requestEpoch ||
                              currentExchangeContentLanguageRef.current !== contentLanguage
                            ) {
                              return {
                                ...processExchangeRes,
                                data: [],
                                success: false,
                              };
                            }

                            const { error, data: flowsResp } = flowRes as FlowStateCodeResponse;
                            if (!error) {
                              normalizedUnitRes.forEach((item) => {
                                const flow = flowsResp.find(
                                  (flowItem) =>
                                    flowItem.id === item?.referenceToFlowDataSetId &&
                                    flowItem.version === item?.referenceToFlowDataSetVersion,
                                );
                                if (flow) {
                                  item.stateCode = flow.stateCode;
                                  item['classification'] = flow.classification ?? '';
                                }
                              });
                            }
                            return {
                              ...processExchangeRes,
                              data: normalizedUnitRes,
                              success: true,
                            };
                          },
                        );
                      });
                    });
                  }}
                  columns={processExchangeColumns}
                />
              ),
            },
          ]}
        />
        <Collapse
          defaultActiveKey={['1']}
          items={[
            {
              key: '1',
              label: (
                <FormattedMessage id='pages.process.exchange.output' defaultMessage='Output' />
              ),
              children: (
                <ProTable<ProcessExchangeTable, ContentLanguageAwareTableParams>
                  className='tg-process-view-output-table'
                  params={exchangeTableParams}
                  search={false}
                  scroll={PROCESS_EXCHANGE_TABLE_SCROLL}
                  pagination={{
                    showSizeChanger: false,
                    pageSize: 10,
                  }}
                  request={async (params) => {
                    const requestEpoch = outputExchangeRequestEpochRef.current + 1;
                    outputExchangeRequestEpochRef.current = requestEpoch;
                    const contentLanguage =
                      params.contentLanguage ?? exchangeTableParams.contentLanguage;

                    return getProcessExchange(
                      genProcessExchangeTableData(exchangeDataSource, contentLanguage),
                      'Output',
                      params,
                    ).then((res) => {
                      const processExchangeRes = res as ProcessExchangeResponse;
                      return getUnitData('flow', processExchangeRes?.data).then((unitRes) => {
                        const normalizedUnitRes = (unitRes ?? []) as ProcessExchangeTable[];
                        const flows = exchangeDataSource.map((item) => {
                          const ref = toReferenceValue(item?.referenceToFlowDataSet);
                          return {
                            id: ref?.['@refObjectId'] ?? '',
                            version: ref?.['@version'] ?? '',
                          };
                        });
                        return getFlowStateCodeByIdsAndVersions(flows, contentLanguage).then(
                          (flowRes) => {
                            if (
                              outputExchangeRequestEpochRef.current !== requestEpoch ||
                              currentExchangeContentLanguageRef.current !== contentLanguage
                            ) {
                              return {
                                ...processExchangeRes,
                                data: [],
                                success: false,
                              };
                            }

                            const { error, data: flowsResp } = flowRes;
                            if (!error) {
                              normalizedUnitRes.forEach((item) => {
                                const flow = flowsResp.find(
                                  (flowItem) =>
                                    flowItem.id === item?.referenceToFlowDataSetId &&
                                    flowItem.version === item?.referenceToFlowDataSetVersion,
                                );
                                if (flow) {
                                  item.stateCode = flow.stateCode;
                                  item['classification'] = flow.classification ?? '';
                                }
                              });
                            }
                            return {
                              ...processExchangeRes,
                              data: normalizedUnitRes,
                              success: true,
                            };
                          },
                        );
                      });
                    });
                  }}
                  columns={processExchangeColumns}
                />
              ),
            },
          ]}
        />
      </>
    ),
    lciaResults: (
      <ProcessLciaResultsPanel
        baseCalculationEvidence={initData?.LCIAResults?.['common:other']}
        baseRows={lciaResultDataSource}
        enablePublishedPackageReader={shouldUsePublishedLciaResults(defaultLcaDataScope)}
        lang={lang}
        processId={id}
        processVersion={version}
      />
    ),
    validation: (
      <ReviewItemView data={initData?.modellingAndValidation?.validation?.review ?? []} />
    ),
    complianceDeclarations: (
      <ComplianceItemView
        data={initData?.modellingAndValidation?.complianceDeclarations?.compliance ?? []}
      />
    ),
  };

  const closeDrawer = useCallback(() => {
    setDrawerVisible(false);
    onDrawerClose?.();
  }, [onDrawerClose]);

  const onView = useCallback(async () => {
    setDrawerVisible(true);
    setActiveTabKey('processInformation');
    setSpinning(true);
    setLciaResultDataSource([]);
    getProcessDetail(id, version).then(async (result: ProcessDetailResponse) => {
      const formData = genProcessFromData(result.data?.json?.processDataSet ?? {});
      if ((result?.data?.stateCode ?? 100) < 100) {
        const rejectedCommentsRes = await getRejectedComments(id, version);
        mergeCommentsToData(rejectedCommentsRes, formData);
      }
      setInitData({ ...formData, id: id });
      setExchangeDataSource([...(formData?.exchanges?.exchange ?? [])]);
      const sourceData = jsonToList(formData?.LCIAResults?.LCIAResult) as LCIAResultTable[];
      setLciaResultDataSource(sourceData);
      // if (dataSource === 'my') {
      //   setFooterButtons(
      //     <>
      //       {/* <ContactDelete
      //         id={id}
      //         buttonType={'text'}
      //         actionRef={actionRef}
      //         setViewDrawerVisible={setDrawerVisible}
      //       />
      //       <ContactEdit
      //         id={id}
      //         buttonType={'text'}
      //         actionRef={actionRef}
      //         setViewDrawerVisible={setDrawerVisible}
      //       /> */}
      //     </>,
      //   );
      // } else {
      //   setFooterButtons(<></>);
      // }
      setSpinning(false);
    });
  }, [id, version]);

  useEffect(() => {
    if (autoOpen && id && version) {
      void onView();
    }
  }, [autoOpen, id, onView, version]);

  return (
    <>
      {!autoOpen && buttonType === 'toolIcon' ? (
        <Tooltip
          title={
            <FormattedMessage
              id='pages.button.model.process'
              defaultMessage='Process information'
            ></FormattedMessage>
          }
          placement='left'
        >
          <Button
            type='primary'
            size='small'
            style={{ boxShadow: 'none' }}
            icon={<ProfileOutlined />}
            onClick={onView}
            disabled={disabled}
          />
        </Tooltip>
      ) : !autoOpen && buttonType === 'toolResultIcon' ? (
        <Tooltip
          title={<FormattedMessage id='pages.button.model.result' defaultMessage='Model Results' />}
          placement='left'
        >
          <Button
            disabled={id === ''}
            type='primary'
            icon={<ProductOutlined />}
            size='small'
            style={{ boxShadow: 'none' }}
            onClick={onView}
          />
        </Tooltip>
      ) : !autoOpen && buttonType === 'icon' ? (
        <Tooltip
          title={tooltipTitle ?? <FormattedMessage id='pages.button.view' defaultMessage='View' />}
        >
          <Button
            shape='circle'
            type={buttonTypeProp}
            icon={<ProfileOutlined />}
            size='small'
            onClick={onView}
          />
        </Tooltip>
      ) : !autoOpen && buttonType === 'link' ? (
        disabled || id === '' ? (
          <Typography.Text type='secondary'>
            {triggerLabel ?? <FormattedMessage id='pages.button.view' defaultMessage='View' />}
          </Typography.Text>
        ) : (
          <Typography.Link onClick={onView}>
            {triggerLabel ?? <FormattedMessage id='pages.button.view' defaultMessage='View' />}
          </Typography.Link>
        )
      ) : !autoOpen ? (
        <Button onClick={onView}>
          <FormattedMessage id='pages.button.view' defaultMessage='View' />
        </Button>
      ) : null}

      <Drawer
        classNames={{ section: 'tg-dataset-view-drawer tg-process-drawer' }}
        getContainer={() => document.body}
        title={
          <FormattedMessage id='pages.process.drawer.title.view' defaultMessage='View process' />
        }
        size='90%'
        closable={false}
        extra={<Button icon={<CloseOutlined />} style={{ border: 0 }} onClick={closeDrawer} />}
        // footer={
        //   <Space size={'middle'} className={styles.footer_right}>
        //     {footerButtons}
        //   </Space>
        // }
        mask={{ closable: true }}
        open={drawerVisible}
        onClose={closeDrawer}
      >
        <span
          aria-hidden='true'
          data-detail-ready={initData.id === id && !spinning ? 'true' : 'false'}
          data-route-mode='view'
          data-testid='process-deep-link-state'
          hidden
        />
        <Spin spinning={spinning}>
          <Card
            style={{ width: '100%' }}
            tabList={tabList}
            activeTabKey={activeTabKey}
            onTabChange={onTabChange}
          >
            {contentList[activeTabKey]}
          </Card>
        </Spin>
      </Drawer>
    </>
  );
};

export default ProcessView;

export { buildMergedLciaRows, getLcaMethodMetaMap as getLciaMethodMetaMap, toReferenceValue };
