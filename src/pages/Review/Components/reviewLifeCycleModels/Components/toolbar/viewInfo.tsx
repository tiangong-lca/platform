import TidasRepeatedField from '@/components/TidasRepeatedField';
import { mapTidasRepeated } from '@/services/general/tidasRepeatedFields';
import LangTextItemDescription from '@/components/LangTextItem/description';
import LevelTextItemDescription from '@/components/LevelTextItem/description';
import LocationTextItemDescription from '@/components/LocationTextItem/description';
import ContactSelectDescription from '@/pages/Contacts/Components/select/description';
import {
  LCIMethodApproachOptions,
  LCIMethodPrincipleOptions,
  completenessElementaryFlowsTypeOptions,
  completenessElementaryFlowsValueOptions,
  completenessProductModelOptions,
  copyrightOptions,
  licenseTypeOptions,
  processtypeOfDataSetOptions,
  uncertaintyDistributionTypeOptions,
  workflowAndPublicationStatusOptions,
} from '@/pages/Processes/Components/optiondata';
import SourceSelectDescription from '@/pages/Sources/Components/select/description';
import { saveReviewCommentDraftApi, submitReviewCommentApi } from '@/services/comments/api';
import { getUserDetail } from '@/services/users/api';
import styles from '@/style/custom.less';
import { CloseOutlined, InfoOutlined } from '@ant-design/icons';
import { ProForm, ProFormInstance } from '@ant-design/pro-components';
import { App, Button, Card, Descriptions, Divider, Drawer, Space, Spin, Tooltip } from 'antd';
import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';

import ComplianceItemForm from '../../../Compliance/form';
import ComplianceItemView from '../../../Compliance/view';

import ReveiwItemForm from '../../../ReviewForm/form';
import ReviewItemView from '../../../ReviewForm/view';
import RejectReview from '../../../RejectReview';
import { validateCommentApproval } from '../../../validateComment';

import { RefCheckContext, RefCheckType } from '@/contexts/refCheckContext';
import { ReffPath, checkReferences, getAllRefObj, refDataType } from '@/pages/Utils/review';
import { getUserTeamId } from '@/services/roles/api';

type Props = {
  lang: string;
  data: any;
  type: 'edit' | 'view';
  reviewId: string;
  tabType: 'assigned' | 'review' | 'reviewer-rejected' | 'admin-rejected';
  actionRef?: any;
  onReviewComplete?: () => void;
};

const getWorkflowAndPublicationStatusOptions = (value: string) => {
  const option = workflowAndPublicationStatusOptions.find((opt) => opt.value === value);
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
const getCompletenessProductModelOptions = (value: string) => {
  const option = completenessProductModelOptions.find((opt) => opt.value === value);
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

const ToolbarViewInfo: FC<Props> = ({
  lang,
  data,
  type,
  reviewId,
  tabType,
  actionRef,
  onReviewComplete,
}) => {
  const intl = useIntl();
  const { message } = App.useApp();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState<string>('lifeCycleModelInformation');
  const [spinning, setSpinning] = useState(false);
  const [refCheckData, setRefCheckData] = useState<RefCheckType[]>([]);
  const formRef = useRef<ProFormInstance>(undefined);
  const mutationPendingRef = useRef(false);
  const onTabChange = (key: string) => {
    setActiveTabKey(key);
  };
  useEffect(() => {
    if (activeTabKey === 'validation' && type === 'edit') {
      const fieldPath = ['modellingAndValidation', 'validation', 'review'];
      const currentValue = formRef.current?.getFieldValue(fieldPath);
      if (!currentValue || currentValue.length === 0) {
        formRef.current?.setFieldValue(fieldPath, [{ 'common:scope': [{}] }]);
      }
      getUserDetail().then((res) => {
        if (res.data?.contact) {
          const contact = res.data?.contact;
          formRef.current?.setFieldValue(
            [
              'modellingAndValidation',
              'validation',
              'review',
              0,
              'common:referenceToNameOfReviewerAndInstitution',
            ],
            contact,
          );
        }
      });
    }
  }, [activeTabKey]);
  const tabList = [
    {
      key: 'lifeCycleModelInformation',
      tab: (
        <FormattedMessage
          id='pages.lifeCycleModel.view.lifeCycleModelInformation'
          defaultMessage='Life cycle model information'
        />
      ),
    },
    {
      key: 'modellingAndValidation',
      tab: (
        <FormattedMessage
          id='pages.lifeCycleModel.view.modellingAndValidation'
          defaultMessage='Modelling and validation'
        />
      ),
    },
    {
      key: 'administrativeInformation',
      tab: (
        <FormattedMessage
          id='pages.lifeCycleModel.view.administrativeInformation'
          defaultMessage='Administrative information'
        />
      ),
    },
    {
      key: 'validation',
      tab: (
        <FormattedMessage id='pages.lifeCycleModel.view.validation' defaultMessage='Validation' />
      ),
    },
    {
      key: 'complianceDeclarations',
      tab: (
        <FormattedMessage
          id='pages.lifeCycleModel.view.complianceDeclarations'
          defaultMessage='Compliance declarations'
        />
      ),
    },
  ];

  const defaultTabContent: Record<string, React.ReactNode> = {
    lifeCycleModelInformation: (
      <>
        <Descriptions
          bordered
          size={'small'}
          column={1}
          items={[
            {
              key: 0,
              label: (
                <FormattedMessage id='pages.source.view.sourceInformation.id' defaultMessage='ID' />
              ),
              styles: { label: { width: '100px' } },
              children: data.lifeCycleModelInformation?.dataSetInformation?.['common:UUID'] ?? '-',
            },
          ]}
        />
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage id='pages.lifeCycleModel.information.name' defaultMessage='Name' />
          }
        >
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.information.baseName'
              defaultMessage='Base name'
            />
          </Divider>
          <LangTextItemDescription
            data={data.lifeCycleModelInformation?.dataSetInformation?.name?.baseName ?? '-'}
          />
          <br />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.information.treatmentStandardsRoutes'
              defaultMessage='Treatment, standards, routes'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.lifeCycleModelInformation?.dataSetInformation?.name?.treatmentStandardsRoutes ??
              '-'
            }
          />
          <br />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.information.mixAndLocationTypes'
              defaultMessage='Mix and location types'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.lifeCycleModelInformation?.dataSetInformation?.name?.mixAndLocationTypes ?? '-'
            }
          />
          <br />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.information.functionalUnitFlowProperties'
              defaultMessage='Quantitative product or process properties'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.lifeCycleModelInformation?.dataSetInformation?.name
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
                  id='pages.lifeCycleModel.information.identifierOfSubDataSet'
                  defaultMessage='Identifier of sub-data set'
                />
              ),
              styles: { label: { width: '140px' } },
              children:
                data.lifeCycleModelInformation?.dataSetInformation?.identifierOfSubDataSet ?? '-',
            },
          ]}
        />
        <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
          <FormattedMessage
            id='pages.lifeCycleModel.information.synonyms'
            defaultMessage='Synonyms'
          />
        </Divider>
        <LangTextItemDescription
          data={data.lifeCycleModelInformation?.dataSetInformation?.['common:synonyms']}
        />
        <br />
        <LevelTextItemDescription
          systems={
            data?.lifeCycleModelInformation?.dataSetInformation?.classificationInformation?.[
              'common:classification'
            ]
          }
          data={
            data.lifeCycleModelInformation?.dataSetInformation?.classificationInformation?.[
              'common:classification'
            ]?.['common:class']?.['value']
          }
          lang={lang}
          categoryType={'LifeCycleModel'}
        />
        <br />
        <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
          <FormattedMessage
            id='pages.lifeCycleModel.information.generalComment'
            defaultMessage='General comment'
          />
        </Divider>
        <LangTextItemDescription
          data={
            data.lifeCycleModelInformation?.dataSetInformation?.['common:generalComment'] ?? '-'
          }
        />
        <br />
        <SourceSelectDescription
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.information.referenceToExternalDocumentation'
              defaultMessage='Data set report, background info'
            />
          }
          data={
            data.lifeCycleModelInformation?.dataSetInformation?.referenceToExternalDocumentation ??
            {}
          }
          lang={lang}
        />
        <br />
        <SourceSelectDescription
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.information.technology.referenceToDiagram'
              defaultMessage='Life cycle model diagram(s) or screenshot(s)'
            />
          }
          data={data.lifeCycleModelInformation?.technology?.referenceToDiagram ?? {}}
          lang={lang}
        />
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.information.time'
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
                    id='pages.lifeCycleModel.information.referenceYear'
                    defaultMessage='Reference year'
                  />
                ),
                styles: { label: { width: '140px' } },
                children: data.lifeCycleModelInformation?.time?.['common:referenceYear'] ?? '-',
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
                    id='pages.lifeCycleModel.information.dataSetValidUntil'
                    defaultMessage='Data set valid until:'
                  />
                ),
                styles: { label: { width: '140px' } },
                children: data.lifeCycleModelInformation?.time?.['common:dataSetValidUntil'] ?? '-',
              },
            ]}
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.information.timeRepresentativenessDescription'
              defaultMessage='Time representativeness description'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.lifeCycleModelInformation?.time?.['common:timeRepresentativenessDescription']
            }
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.information.locationOfOperationSupplyOrProduction'
              defaultMessage='Location'
            />
          }
        >
          <LocationTextItemDescription
            lang={lang}
            data={
              data.lifeCycleModelInformation?.geography?.locationOfOperationSupplyOrProduction?.[
                '@location'
              ] ?? '-'
            }
            label={
              <FormattedMessage
                id='pages.lifeCycleModel.information.location'
                defaultMessage='Location'
              />
            }
            styles={{ label: { width: '100px' } }}
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.information.descriptionOfRestrictions'
              defaultMessage='Geographical representativeness description'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.lifeCycleModelInformation?.geography?.locationOfOperationSupplyOrProduction
                ?.descriptionOfRestrictions
            }
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.information.subLocationOfOperationSupplyOrProduction'
              defaultMessage='Sub-location(s)'
            />
          }
        >
          <LocationTextItemDescription
            lang={lang}
            data={
              data.lifeCycleModelInformation?.geography?.subLocationOfOperationSupplyOrProduction?.[
                '@subLocation'
              ] ?? '-'
            }
            label={
              <FormattedMessage
                id='pages.lifeCycleModel.information.subLocationOfOperationSupplyOrProduction'
                defaultMessage='Sub-location(s)'
              />
            }
            styles={{ label: { width: '100px' } }}
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.information.descriptionOfRestrictions'
              defaultMessage='Geographical representativeness description'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.lifeCycleModelInformation?.geography?.subLocationOfOperationSupplyOrProduction
                ?.descriptionOfRestrictions
            }
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.information.technology'
              defaultMessage='Technological representativeness'
            />
          }
        >
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.information.technologyDescriptionAndIncludedProcesses'
              defaultMessage='Technology description including background system'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.lifeCycleModelInformation?.technology?.technologyDescriptionAndIncludedProcesses
            }
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.information.technologicalApplicability'
              defaultMessage='Technical purpose of product or process'
            />
          </Divider>
          <LangTextItemDescription
            data={data.lifeCycleModelInformation?.technology?.technologicalApplicability}
          />
          <br />
          <SourceSelectDescription
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.information.referenceToTechnologyPictogramme'
                defaultMessage='Technology pictogram'
              />
            }
            data={
              data.lifeCycleModelInformation?.technology?.referenceToTechnologyPictogramme ?? {}
            }
            lang={lang}
          />
          <br />
          <SourceSelectDescription
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.information.referenceToTechnologyFlowDiagrammOrPicture'
                defaultMessage='Flow diagram(s) or picture(s)'
              />
            }
            data={
              data.lifeCycleModelInformation?.technology
                ?.referenceToTechnologyFlowDiagrammOrPicture ?? {}
            }
            lang={lang}
          />
        </Card>
        <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
          <FormattedMessage
            id='pages.lifeCycleModel.information.modelDescription'
            defaultMessage='Model description'
          />
        </Divider>
        <LangTextItemDescription
          data={data.lifeCycleModelInformation?.mathematicalRelations?.modelDescription}
        />
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.information.variableParameter'
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
                    id='pages.lifeCycleModel.information.variableParameter.name'
                    defaultMessage='Name of variable'
                  />
                ),
                styles: { label: { width: '120px' } },
                children:
                  data.lifeCycleModelInformation?.mathematicalRelations?.variableParameter?.[
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
                    id='pages.lifeCycleModel.information.variableParameter.formula'
                    defaultMessage='Formula'
                  />
                ),
                styles: { label: { width: '120px' } },
                children:
                  data.lifeCycleModelInformation?.mathematicalRelations?.variableParameter
                    ?.formula ?? '-',
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
                    id='pages.lifeCycleModel.information.variableParameter.meanValue'
                    defaultMessage='Mean value'
                  />
                ),
                styles: { label: { width: '120px' } },
                children:
                  data.lifeCycleModelInformation?.mathematicalRelations?.variableParameter
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
                    id='pages.lifeCycleModel.information.variableParameter.minimumValue'
                    defaultMessage='Minimum value'
                  />
                ),
                styles: { label: { width: '120px' } },
                children:
                  data.lifeCycleModelInformation?.mathematicalRelations?.variableParameter
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
                    id='pages.lifeCycleModel.information.variableParameter.maximumValue'
                    defaultMessage='Maximum value'
                  />
                ),
                styles: { label: { width: '120px' } },
                children:
                  data.lifeCycleModelInformation?.mathematicalRelations?.variableParameter
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
                    id='pages.lifeCycleModel.information.variableParameter.uncertaintyDistributionType'
                    defaultMessage='Uncertainty distribution type'
                  />
                ),
                styles: { label: { width: '180px' } },
                children: getComplianceLabel(
                  data.lifeCycleModelInformation?.mathematicalRelations?.variableParameter
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
                    id='pages.lifeCycleModel.information.variableParameter.relativeStandardDeviation95In'
                    defaultMessage='Relative standard deviation (95%) in %'
                  />
                ),
                styles: { label: { width: '180px' } },
                children:
                  data.lifeCycleModelInformation?.mathematicalRelations?.variableParameter
                    ?.relativeStandardDeviation95In ?? '-',
              },
            ]}
          />

          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            {
              <FormattedMessage
                id='pages.lifeCycleModel.information.variableParameter.comment'
                defaultMessage='Comment, units, defaults'
              />
            }
          </Divider>
          <LangTextItemDescription
            data={data.lifeCycleModelInformation?.mathematicalRelations?.variableParameter?.comment}
          />
        </Card>
      </>
    ),
    modellingAndValidation: (
      <>
        <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
          <FormattedMessage
            id='pages.lifeCycleModel.modellingAndValidation.useAdviceForDataSet'
            defaultMessage='Use advice for data set'
          />
        </Divider>
        <LangTextItemDescription
          data={data.modellingAndValidation?.dataSourcesTreatmentEtc?.useAdviceForDataSet ?? '-'}
        />
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.lCIMethodAndAllocation'
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
                    id='pages.lifeCycleModel.modellingAndValidation.typeOfDataSet'
                    defaultMessage='Type of data set'
                  />
                ),
                styles: { label: { width: '220px' } },
                children: getProcesstypeOfDataSetOptions(
                  data.modellingAndValidation?.LCIMethodAndAllocation?.typeOfDataSet ?? '-',
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
                    id='pages.lifeCycleModel.modellingAndValidation.lCIMethodPrinciple'
                    defaultMessage='LCI method principle'
                  />
                ),
                styles: { label: { width: '220px' } },
                children: getLCIMethodPrincipleOptions(
                  data.modellingAndValidation?.LCIMethodAndAllocation?.LCIMethodPrinciple ?? '-',
                ),
              },
            ]}
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.deviationsFromLCIMethodPrinciple'
              defaultMessage='Deviation from LCI method principle / explanations'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.modellingAndValidation?.LCIMethodAndAllocation?.deviationsFromLCIMethodPrinciple
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
                    id='pages.lifeCycleModel.modellingAndValidation.lCIMethodApproaches'
                    defaultMessage='LCI method approaches'
                  />
                ),
                styles: { label: { width: '220px' } },
                children: getLCIMethodApproachOptions(
                  data.modellingAndValidation?.LCIMethodAndAllocation?.LCIMethodApproaches ?? '-',
                ),
              },
            ]}
          />

          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.deviationsFromLCIMethodApproaches'
              defaultMessage='Deviations from LCI method approaches / explanations'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.modellingAndValidation?.LCIMethodAndAllocation?.deviationsFromLCIMethodApproaches
            }
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.modellingConstants'
              defaultMessage='Modelling constants'
            />
          </Divider>
          <LangTextItemDescription
            data={data.modellingAndValidation?.LCIMethodAndAllocation?.modellingConstants}
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.deviationsFromModellingConstants'
              defaultMessage='Deviation from modelling constants / explanations'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.modellingAndValidation?.LCIMethodAndAllocation?.deviationsFromModellingConstants
            }
          />
          <br />
          <SourceSelectDescription
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.modellingAndValidation.referenceToLCAMethodDetails'
                defaultMessage='LCA methodology report'
              />
            }
            data={
              data.modellingAndValidation?.LCIMethodAndAllocation?.referenceToLCAMethodDetails ?? {}
            }
            lang={lang}
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness'
              defaultMessage='Data sources, treatment, and representativeness'
            />
          }
        >
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.dataCutOffAndCompletenessPrinciples'
              defaultMessage='Data cut-off and completeness principles'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.dataCutOffAndCompletenessPrinciples
            }
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.deviationsFromCutOffAndCompletenessPrinciples'
              defaultMessage='Deviation from data cut-off and completeness principles / explanations'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.deviationsFromCutOffAndCompletenessPrinciples
            }
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.dataSelectionAndCombinationPrinciples'
              defaultMessage='Data selection and combination principles'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.dataSelectionAndCombinationPrinciples
            }
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.deviationsFromSelectionAndCombinationPrinciples'
              defaultMessage='Deviation from data selection and combination principles / explanations'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.deviationsFromSelectionAndCombinationPrinciples
            }
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.dataTreatmentAndExtrapolationsPrinciples'
              defaultMessage='Data treatment and extrapolations principles'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.dataTreatmentAndExtrapolationsPrinciples
            }
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.deviationsFromTreatmentAndExtrapolationPrinciples'
              defaultMessage='Deviation from data treatment and extrapolations principles / explanations'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.deviationsFromTreatmentAndExtrapolationPrinciples
            }
          />
          <br />
          <SourceSelectDescription
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.modellingAndValidation.referenceToDataHandlingPrinciples'
                defaultMessage='Data handling report'
              />
            }
            data={
              data.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.referenceToDataHandlingPrinciples ?? {}
            }
            lang={lang}
          />
          <br />
          <SourceSelectDescription
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.modellingAndValidation.referenceToDataSource'
                defaultMessage='Data source(s) used for this data set'
              />
            }
            data={
              data.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
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
                    id='pages.lifeCycleModel.modellingAndValidation.percentageSupplyOrProductionCovered'
                    defaultMessage='Percentage supply or production covered'
                  />
                ),
                styles: { label: { width: '220px' } },
                children:
                  data.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                    ?.percentageSupplyOrProductionCovered ?? '-',
              },
            ]}
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.annualSupplyOrProductionVolume'
              defaultMessage='Annual supply or production volume'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.annualSupplyOrProductionVolume
            }
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.samplingProcedure'
              defaultMessage='Sampling procedure'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.samplingProcedure
            }
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.dataCollectionPeriod'
              defaultMessage='Data collection period'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.dataCollectionPeriod
            }
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.uncertaintyAdjustments'
              defaultMessage='Uncertainty adjustments'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.uncertaintyAdjustments
            }
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.useAdviceForDataSet'
              defaultMessage='Use advice for data set'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
                ?.useAdviceForDataSet
            }
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.completeness'
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
                    id='pages.lifeCycleModel.modellingAndValidation.completeness.completenessProductModel'
                    defaultMessage='Completeness product model'
                  />
                ),
                styles: { label: { width: '140px' } },
                children: getCompletenessProductModelOptions(
                  data.modellingAndValidation?.completeness?.completenessProductModel ?? '-',
                ),
              },
            ]}
          />
          <br />
          <Card
            size='small'
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.modellingAndValidation.completeness.completenessElementaryFlows'
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
                      id='pages.lifeCycleModel.modellingAndValidation.completeness.completenessElementaryFlows.type'
                      defaultMessage='completeness type'
                    />
                  ),
                  styles: { label: { width: '140px' } },
                  children: getCompletenessElementaryFlowsTypeOptions(
                    data.modellingAndValidation?.completeness?.completenessElementaryFlows?.[
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
                      id='pages.lifeCycleModel.modellingAndValidation.completeness.completenessElementaryFlows.value'
                      defaultMessage='value'
                    />
                  ),
                  styles: { label: { width: '140px' } },
                  children: getCompletenessElementaryFlowsValueOptions(
                    data.modellingAndValidation?.completeness?.completenessElementaryFlows?.[
                      '@value'
                    ] ?? '-',
                  ),
                },
              ]}
            />
          </Card>
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.completeness.completenessOtherProblemField'
              defaultMessage='Completeness other problem field(s)'
            />
          </Divider>
          <LangTextItemDescription
            data={data.modellingAndValidation?.completeness?.completenessOtherProblemField}
          />
        </Card>
        {/* <ContactSelectDescription
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.information.referenceToCompleteReviewReport'
              defaultMessage='Data set report, background info'
            />
          }
          lang={lang}
          data={
            data.modellingAndValidation?.validation?.review?.[
              'common:referenceToNameOfReviewerAndInstitution'
            ]
          }
        />
        <br /> */}
        {/* <SourceSelectDescription
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.information.referenceToCompleteReviewReport'
              defaultMessage='Reference to Complete Review Report'
            />
          }
          data={
            data.modellingAndValidation?.validation?.review?.[
              'common:referenceToCompleteReviewReport'
            ] ?? {}
          }
          lang={lang}
        />
        <br />
        <SourceSelectDescription
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.referenceToComplianceSystem'
              defaultMessage='Reference to Compliance System'
            />
          }
          data={
            data.modellingAndValidation?.complianceDeclarations?.compliance?.[
              'common:referenceToComplianceSystem'
            ] ?? {}
          }
          lang={lang}
        />
        <br /> */}
      </>
    ),
    administrativeInformation: (
      <>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.administrativeInformation.commissionerAndGoal'
              defaultMessage='Commissioner and goal'
            />
          }
        >
          <ContactSelectDescription
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.referenceToCommissioner'
                defaultMessage='Commissioner of data set'
              />
            }
            lang={lang}
            data={
              data.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:referenceToCommissioner'
              ]
            }
          />
          <br />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.administrativeInformation.project'
              defaultMessage='Project'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.administrativeInformation?.['common:commissionerAndGoal']?.['common:project']
            }
          />
          <br />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.administrativeInformation.intendedApplications'
              defaultMessage='Intended applications'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.administrativeInformation?.['common:commissionerAndGoal']?.[
                'common:intendedApplications'
              ]
            }
          />
        </Card>
        <br />
        <ContactSelectDescription
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.administrativeInformation.referenceToPersonOrEntityGeneratingTheDataSet'
              defaultMessage='Data set generator / modeller'
            />
          }
          lang={lang}
          data={
            data.administrativeInformation?.dataGenerator?.[
              'common:referenceToPersonOrEntityGeneratingTheDataSet'
            ]
          }
        />
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.administrativeInformation.dataEntryBy'
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
                    id='pages.lifeCycleModel.administrativeInformation.timeStamp'
                    defaultMessage='Time stamp (last saved)'
                  />
                ),
                styles: { label: { width: '200px' } },
                children: data?.administrativeInformation?.dataEntryBy?.['common:timeStamp'] ?? '-',
              },
            ]}
          />
          <br />
          <SourceSelectDescription
            data={data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']}
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.referenceToDataSetFormat'
                defaultMessage='Data set format(s)'
              />
            }
            lang={lang}
          />
          <br />
          <SourceSelectDescription
            data={
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToConvertedOriginalDataSetFrom'
              ]
            }
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.referenceToConvertedOriginalDataSetFrom'
                defaultMessage='Converted original data set from:'
              />
            }
            lang={lang}
          />
          <br />
          <ContactSelectDescription
            data={
              data?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]
            }
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.referenceToPersonOrEntityEnteringTheData'
                defaultMessage='Data entry by:'
              />
            }
            lang={lang}
          />
          <br />
          <SourceSelectDescription
            data={
              data?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetUseApproval']
            }
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.referenceToDataSetUseApproval'
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
              id='pages.lifeCycleModel.administrativeInformation.publicationAndOwnership'
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
                    id='pages.lifeCycleModel.administrativeInformation.dateOfLastRevision'
                    defaultMessage='Date of last revision'
                  />
                ),
                styles: { label: { width: '180px' } },
                children:
                  data.administrativeInformation?.publicationAndOwnership?.[
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
                    id='pages.flow.view.administrativeInformation.dataSetVersion'
                    defaultMessage='Data set version'
                  />
                ),
                styles: { label: { width: '180px' } },
                children: (
                  <Space>
                    {data.administrativeInformation?.publicationAndOwnership?.[
                      'common:dataSetVersion'
                    ] ?? '-'}
                  </Space>
                ),
              },
            ]}
          />
          {/* <Divider styles={{ content: { margin: 0 } }} titlePlacement="start" plain>
            <FormattedMessage
              id="pages.flow.view.administrativeInformation.dataSetVersion"
              defaultMessage="Data set version"
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion']
            }
          /> */}
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
                    id='pages.flow.view.administrativeInformation.permanentDataSetURI'
                    defaultMessage='Permanent data set URI'
                  />
                ),
                styles: { label: { width: '220px' } },
                children:
                  data.administrativeInformation?.publicationAndOwnership?.[
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
                    id='pages.lifeCycleModel.administrativeInformation.workflowAndPublicationStatus'
                    defaultMessage='Workflow and publication status'
                  />
                ),
                styles: { label: { width: '240px' } },
                children: getWorkflowAndPublicationStatusOptions(
                  data.administrativeInformation?.publicationAndOwnership?.[
                    'common:workflowAndPublicationStatus'
                  ] ?? '-',
                ),
              },
            ]}
          />
          <br />
          <SourceSelectDescription
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.referenceToUnchangedRepublication'
                defaultMessage='Unchanged re-publication of:'
              />
            }
            data={
              data.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToUnchangedRepublication'
              ] ?? {}
            }
            lang={lang}
          />
          <br />
          <ContactSelectDescription
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.referenceToRegistrationAuthority'
                defaultMessage='Registration authority'
              />
            }
            lang={lang}
            data={
              data.administrativeInformation?.publicationAndOwnership?.[
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
                    id='pages.lifeCycleModel.administrativeInformation.registrationNumber'
                    defaultMessage='Registration number'
                  />
                ),
                styles: { label: { width: '140px' } },
                children:
                  data.administrativeInformation?.publicationAndOwnership?.[
                    'common:registrationNumber'
                  ] ?? '-',
              },
            ]}
          />
          <br />
          <ContactSelectDescription
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.referenceToOwnershipOfDataSet'
                defaultMessage='Owner of data set'
              />
            }
            lang={lang}
            data={
              data.administrativeInformation?.publicationAndOwnership?.[
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
                    id='pages.lifeCycleModel.administrativeInformation.copyright'
                    defaultMessage='Copyright?'
                  />
                ),
                styles: { label: { width: '180px' } },
                children: getCopyrightOptions(
                  data.administrativeInformation?.publicationAndOwnership?.['common:copyright'] ??
                    '-',
                ),
              },
            ]}
          />
          <br />

          <br />
          <ContactSelectDescription
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.referenceToEntitiesWithExclusiveAccess'
                defaultMessage='Entities or persons with exclusive access to this data set'
              />
            }
            lang={lang}
            data={
              data.administrativeInformation?.publicationAndOwnership?.[
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
                    id='pages.lifeCycleModel.administrativeInformation.licenseType'
                    defaultMessage='License type'
                  />
                ),
                styles: { label: { width: '180px' } },
                children: getLicenseTypeOptions(
                  data.administrativeInformation?.publicationAndOwnership?.['common:licenseType'] ??
                    '-',
                ),
              },
            ]}
          />
          <br />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.administrativeInformation.accessRestrictions'
              defaultMessage='Access and use restrictions'
            />
          </Divider>
          <LangTextItemDescription
            data={
              data.administrativeInformation?.['publicationAndOwnership']?.[
                'common:accessRestrictions'
              ]
            }
          />
        </Card>
      </>
    ),
  };
  const tabContent: { [key: string]: React.JSX.Element } =
    type === 'edit'
      ? {
          ...defaultTabContent,
          validation: (
            <ReveiwItemForm
              name={['modellingAndValidation', 'validation', 'review']}
              lang={lang}
              formRef={formRef}
              onData={() => {}}
              disabled={true}
            />
          ),
          complianceDeclarations: (
            <TidasRepeatedField
              name={['modellingAndValidation', 'complianceDeclarations']}
              onChange={() => {}}
            >
              {(itemPath) => (
                <ComplianceItemForm
                  name={[...itemPath, 'compliance']}
                  lang={lang}
                  formRef={formRef}
                  onData={() => {}}
                />
              )}
            </TidasRepeatedField>
          ),
        }
      : {
          ...defaultTabContent,
          validation: <ReviewItemView data={data?.modellingAndValidation?.validation?.review} />,
          complianceDeclarations: mapTidasRepeated(
            data?.modellingAndValidation?.complianceDeclarations,
            (item, index) => <ComplianceItemView key={index} data={item?.compliance} />,
          ),
        };
  const temporarySave = async () => {
    if (mutationPendingRef.current) return;
    mutationPendingRef.current = true;
    try {
      const fieldsValue = formRef.current?.getFieldsValue(true);
      const submitData = {
        modellingAndValidation: {
          complianceDeclarations: fieldsValue?.modellingAndValidation?.complianceDeclarations,
          validation: fieldsValue?.modellingAndValidation?.validation,
        },
      };

      setSpinning(true);
      const result = await saveReviewCommentDraftApi(reviewId, submitData);
      if (result.error) throw result.error;
      message.success(
        intl.formatMessage({
          id: 'pages.review.temporarySaveSuccess',
          defaultMessage: 'Temporarily saved successfully.',
        }),
      );
      setDrawerVisible(false);
      onReviewComplete?.();
      actionRef?.current?.reload();
    } catch {
      message.error(
        intl.formatMessage({ id: 'pages.action.error', defaultMessage: 'Action failed' }),
      );
    } finally {
      mutationPendingRef.current = false;
      setSpinning(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (mutationPendingRef.current) return false;
    mutationPendingRef.current = true;
    setSpinning(true);
    try {
      const fieldsValue = formRef.current?.getFieldsValue(true);
      const result = await submitReviewCommentApi(
        reviewId,
        {
          modellingAndValidation: {
            complianceDeclarations: fieldsValue?.modellingAndValidation?.complianceDeclarations,
            validation: fieldsValue?.modellingAndValidation?.validation,
          },
          comment: { message: reason },
        },
        -3,
      );
      if (result.error) throw result.error;
      message.success(
        intl.formatMessage({
          id: 'component.rejectReview.success',
          defaultMessage: 'Rejected successfully!',
        }),
      );
      setDrawerVisible(false);
      onReviewComplete?.();
      actionRef?.current?.reload();
      return true;
    } catch {
      message.error(
        intl.formatMessage({
          id: 'component.rejectReview.error',
          defaultMessage: 'Failed to reject, please try again!',
        }),
      );
      return false;
    } finally {
      mutationPendingRef.current = false;
      setSpinning(false);
    }
  };

  const updateCommentJsonRefsToUnderReview = async (data: any) => {
    const refObjs = getAllRefObj(data);
    const unReview: refDataType[] = []; //stateCode < 20
    const underReview: refDataType[] = []; //stateCode >= 20 && stateCode < 100
    const unRuleVerification: refDataType[] = [];
    const nonExistentRef: refDataType[] = [];
    const userTeamId = await getUserTeamId();
    const path = await checkReferences(
      refObjs,
      new Map<string, any>(),
      userTeamId,
      unReview,
      underReview,
      unRuleVerification,
      nonExistentRef,
      new ReffPath(
        {
          '@refObjectId': '',
          '@version': '',
          '@type': '',
        },
        true,
        false,
      ),
    );
    const problemNodes = path?.findProblemNodes() ?? [];
    const refCheckDataValue: RefCheckType[] = [];

    if (underReview.length > 0) {
      refCheckDataValue.push(
        ...underReview.map((item: any) => {
          return {
            id: item['@refObjectId'],
            version: item['@version'],
            ruleVerification: true,
            nonExistent: false,
            stateCode: item.state_code,
          };
        }),
      );
    } else if (problemNodes && problemNodes.length > 0) {
      let result = problemNodes.map((item: any) => {
        return {
          id: item['@refObjectId'],
          version: item['@version'],
          ruleVerification: item.ruleVerification,
          nonExistent: item.nonExistent,
        };
      });
      refCheckDataValue.push(...result);
    }

    if (refCheckDataValue.length) {
      setRefCheckData(refCheckDataValue);
      setSpinning(false);
      return false;
    } else {
      setRefCheckData([]);
      return true;
    }
  };

  return (
    <>
      <Tooltip
        title={<FormattedMessage id='pages.button.model.info' defaultMessage='Basic information' />}
        placement='left'
      >
        <Button
          type='primary'
          size='small'
          icon={<InfoOutlined />}
          onClick={() => {
            setDrawerVisible(true);
          }}
        />
      </Tooltip>
      <Drawer
        getContainer={() => document.body}
        title={
          <FormattedMessage
            id='pages.flow.model.drawer.title.info'
            defaultMessage='Model base information'
          ></FormattedMessage>
        }
        size='90%'
        closable={false}
        extra={
          <Button
            icon={<CloseOutlined />}
            style={{ border: 0 }}
            onClick={() => {
              setDrawerVisible(false);
            }}
          ></Button>
        }
        mask={{ closable: false }}
        open={drawerVisible}
        onClose={() => {
          setDrawerVisible(false);
        }}
        footer={
          tabType === 'review' && type === 'edit' ? (
            <Space className={styles.footer_right}>
              <RejectReview
                buttonType='text'
                isModel
                dataId={data.id}
                dataVersion={data.version}
                reviewId={reviewId}
                actionRef={actionRef}
                onOk={handleReject}
                disabled={spinning}
              />
              <Button onClick={temporarySave} disabled={spinning}>
                <FormattedMessage id='pages.button.temporarySave' defaultMessage='Temporary Save' />
              </Button>
              <Button onClick={() => formRef.current?.submit()} type='primary' disabled={spinning}>
                <FormattedMessage id='pages.button.save' defaultMessage='Save' />
              </Button>
            </Space>
          ) : null
        }
      >
        <Spin spinning={spinning}>
          <Card
            style={{ width: '100%' }}
            tabList={tabList}
            activeTabKey={activeTabKey}
            onTabChange={onTabChange}
          >
            <RefCheckContext.Provider value={{ refCheckData: refCheckData }}>
              <ProForm
                initialValues={data}
                formRef={formRef}
                submitter={{
                  render: () => {
                    return [];
                  },
                }}
                onFinish={async () => {
                  if (mutationPendingRef.current) return false;
                  mutationPendingRef.current = true;
                  try {
                    const fieldsValue = formRef.current?.getFieldsValue(true);
                    const submitData = {
                      modellingAndValidation: {
                        complianceDeclarations:
                          fieldsValue?.modellingAndValidation?.complianceDeclarations,
                        validation: fieldsValue?.modellingAndValidation?.validation,
                      },
                    };
                    setSpinning(true);
                    const prepared = validateCommentApproval(
                      submitData,
                      'lifeCycleModel',
                      {
                        '@type': 'lifeCycleModel data set',
                        '@refObjectId':
                          data.lifeCycleModelInformation?.dataSetInformation?.['common:UUID'],
                        '@version':
                          data.administrativeInformation?.publicationAndOwnership?.[
                            'common:dataSetVersion'
                          ],
                      },
                      intl,
                      (tabName, fields) => {
                        setActiveTabKey(tabName);
                        formRef.current?.setFields(fields);
                      },
                    );
                    if (!prepared.valid) return false;
                    const isRefCheck = await updateCommentJsonRefsToUnderReview(prepared.json);
                    if (!isRefCheck) return false;

                    const result = await submitReviewCommentApi(
                      reviewId,
                      prepared.json,
                      1,
                      'lifeCycleModel',
                    );
                    if (result.error) throw result.error;
                    message.success(
                      intl.formatMessage({
                        id: 'pages.review.ReviewProcessDetail.edit.success',
                        defaultMessage: 'Review submitted successfully',
                      }),
                    );
                    setDrawerVisible(false);
                    onReviewComplete?.();
                    actionRef?.current?.reload();
                    return true;
                  } catch {
                    message.error(
                      intl.formatMessage({
                        id: 'pages.action.error',
                        defaultMessage: 'Action failed',
                      }),
                    );
                    return false;
                  } finally {
                    mutationPendingRef.current = false;
                    setSpinning(false);
                  }
                }}
              >
                {Object.keys(tabContent).map((key) => (
                  <div key={key} style={{ display: key === activeTabKey ? 'block' : 'none' }}>
                    {tabContent[key]}
                  </div>
                ))}
              </ProForm>
            </RefCheckContext.Provider>
          </Card>
        </Spin>
      </Drawer>
    </>
  );
};

export default ToolbarViewInfo;
