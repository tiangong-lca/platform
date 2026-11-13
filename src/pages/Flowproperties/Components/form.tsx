import DatasetCreateVersionFormItem from '@/components/DatasetCreateVersionFormItem';
import LangTextItemForm from '@/components/LangTextItem/form';
import LevelTextItemForm from '@/components/LevelTextItem/form';
import { Card, Form, Input, Select, Space, theme } from 'antd';
import type { FC } from 'react';
import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';

import RequiredMark from '@/components/RequiredMark';
import ContactSelectForm from '@/pages/Contacts/Components/select/form';
import SourceSelectForm from '@/pages/Sources/Components/select/form';
import UnitGroupSelectFrom from '@/pages/Unitgroups/Components/select/form';
import { getRules } from '@/pages/Utils';
import type { ValidationIssueSdkDetail } from '@/pages/Utils/review';
import { useDatasetSdkValidationFormSupport } from '@/pages/Utils/validation/formSupport';
import { ProFormInstance } from '@ant-design/pro-components';
import schema from '../flowproperties_schema.json';
import { complianceOptions } from './optiondata';
// import FlowpropertiesSelectForm from './select/form';

const FLOW_PROPERTY_DATASET_SCHEMA_PATH_PREFIX = ['flowPropertyDataSet'];

type Props = {
  lang: string;
  activeTabKey: string;
  drawerVisible: boolean;
  formRef: React.RefObject<ProFormInstance | undefined>;
  onData: () => void;
  onTabChange: (key: string) => void;
  formType?: string;
  showRules?: boolean;
  sdkValidationDetails?: ValidationIssueSdkDetail[];
  sdkValidationFocus?: ValidationIssueSdkDetail | null;
  validationIssueTabNames?: string[];
};
export const FlowpropertyForm: FC<Props> = ({
  lang,
  activeTabKey,
  // drawerVisible,
  formRef,
  onData,
  onTabChange,
  formType,
  showRules = false,
  sdkValidationDetails = [],
  sdkValidationFocus = null,
  validationIssueTabNames = [],
}) => {
  const { token } = theme.useToken();
  const intl = useIntl();
  const [nameErrorState, setNameErrorState] = useState(false);
  const { sdkValidationCountsByTab } = useDatasetSdkValidationFormSupport({
    activeTabKey,
    formRef,
    intl,
    sdkValidationDetails,
    sdkValidationFocus,
    schemaPathPrefix: FLOW_PROPERTY_DATASET_SCHEMA_PATH_PREFIX,
    schemaRoot: schema,
    showRules,
  });
  const validationIssueTabs = useMemo(
    () => new Set(validationIssueTabNames),
    [validationIssueTabNames],
  );

  const tabLabels = {
    administrativeInformation: (
      <FormattedMessage
        id='pages.FlowProperties.view.administrativeInformation'
        defaultMessage='Administrative information'
      />
    ),
    flowPropertiesInformation: (
      <FormattedMessage
        id='pages.FlowProperties.view.flowPropertiesInformation'
        defaultMessage='Flow property information'
      />
    ),
    modellingAndValidation: (
      <FormattedMessage
        id='pages.FlowProperties.view.modellingAndValidation'
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
  const tabList = [
    {
      key: 'flowPropertiesInformation',
      tab: renderTabLabel('flowPropertiesInformation'),
    },
    {
      key: 'modellingAndValidation',
      tab: renderTabLabel('modellingAndValidation'),
    },
    {
      key: 'administrativeInformation',
      tab: renderTabLabel('administrativeInformation'),
    },
  ];

  const tabContent: { [key: string]: React.JSX.Element } = {
    flowPropertiesInformation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.FlowProperties.view.flowPropertiesInformation.dataSetInformation'
              defaultMessage='Data set information'
            />
          }
        >
          <Card
            size='small'
            title={
              <RequiredMark
                label={
                  <FormattedMessage
                    id='pages.FlowProperties.view.flowPropertiesInformation.name'
                    defaultMessage='Name of flow property'
                  />
                }
                showError={nameErrorState}
              />
            }
          >
            <LangTextItemForm
              name={['flowPropertiesInformation', 'dataSetInformation', 'common:name']}
              label={
                <FormattedMessage
                  id='pages.FlowProperties.view.flowPropertiesInformation.name'
                  defaultMessage='Name of flow property'
                />
              }
              setRuleErrorState={setNameErrorState}
              autoExpandRequired={schema['flowPropertyDataSet']['flowPropertiesInformation'][
                'dataSetInformation'
              ]['common:name']['rules'].some((rule) => rule.required)}
              rules={
                showRules
                  ? getRules(
                      schema['flowPropertyDataSet']['flowPropertiesInformation'][
                        'dataSetInformation'
                      ]['common:name']['rules'],
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
                id='pages.FlowProperties.view.flowPropertiesInformation.synonyms'
                defaultMessage='Synonyms'
              />
            }
          >
            <LangTextItemForm
              name={['flowPropertiesInformation', 'dataSetInformation', 'common:synonyms']}
              label={
                <FormattedMessage
                  id='pages.FlowProperties.view.flowPropertiesInformation.synonyms'
                  defaultMessage='Synonyms'
                />
              }
            />
          </Card>
          <br />
          <LevelTextItemForm
            dataType={'FlowProperty'}
            onData={onData}
            name={[
              'flowPropertiesInformation',
              'dataSetInformation',
              'classificationInformation',
              'common:classification',
              'common:class',
            ]}
            formRef={formRef}
            lang={lang}
            showRules={showRules}
            rules={
              showRules
                ? getRules(
                    schema['flowPropertyDataSet']['flowPropertiesInformation'][
                      'dataSetInformation'
                    ]['classificationInformation']['common:classification']['common:class'][
                      '@classId'
                    ]['rules'],
                  )
                : []
            }
          />
          <Card
            size='small'
            title={
              <FormattedMessage
                id='pages.FlowProperties.view.flowPropertiesInformation.generalComment'
                defaultMessage='General comment on data set'
              />
            }
          >
            <LangTextItemForm
              name={['flowPropertiesInformation', 'dataSetInformation', 'common:generalComment']}
              label={
                <FormattedMessage
                  id='pages.FlowProperties.view.flowPropertiesInformation.generalComment'
                  defaultMessage='General comment on data set'
                />
              }
            />
          </Card>
        </Card>
        <br />
        <UnitGroupSelectFrom
          name={[
            'flowPropertiesInformation',
            'quantitativeReference',
            'referenceToReferenceUnitGroup',
          ]}
          label={
            <FormattedMessage
              id='pages.FlowProperties.view.flowPropertiesInformation.referenceToReferenceUnitGroup'
              defaultMessage='Reference unit'
            />
          }
          showRequiredLabel={true}
          rules={
            showRules
              ? getRules(
                  schema['flowPropertyDataSet']['flowPropertiesInformation'][
                    'quantitativeReference'
                  ]['referenceToReferenceUnitGroup']['@refObjectId']['rules'],
                )
              : []
          }
          lang={lang}
          formRef={formRef}
          onData={onData}
        />
      </Space>
    ),
    modellingAndValidation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
        <SourceSelectForm
          name={[
            'modellingAndValidation',
            'dataSourcesTreatmentAndRepresentativeness',
            'referenceToDataSource',
          ]}
          label={
            <FormattedMessage
              id='pages.FlowProperties.view.modellingAndValidation.referenceToDataSource'
              defaultMessage='Data source'
            />
          }
          lang={lang}
          formRef={formRef}
          onData={onData}
        />
        <br />
        <SourceSelectForm
          defaultSourceName={
            formType === 'create' ? 'ILCD Data Network - compliance (non-Process)' : ''
          }
          name={[
            'modellingAndValidation',
            'complianceDeclarations',
            'compliance',
            'common:referenceToComplianceSystem',
          ]}
          lang={lang}
          label={
            <FormattedMessage
              id='pages.FlowProperties.view.modellingAndValidation.referenceToComplianceSystem'
              defaultMessage='Compliance system name'
            />
          }
          formRef={formRef}
          onData={onData}
          showRequiredLabel={true}
          rules={
            showRules
              ? getRules(
                  schema['flowPropertyDataSet']['modellingAndValidation']['complianceDeclarations'][
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
                  id='pages.FlowProperties.view.modellingAndValidation.approvalOfOverallCompliance'
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
                  schema['flowPropertyDataSet']['modellingAndValidation']['complianceDeclarations'][
                    'compliance'
                  ]['common:approvalOfOverallCompliance']['rules'],
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
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.FlowProperties.view.modellingAndValidation.dataEntryBy'
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
                    id='pages.FlowProperties.view.modellingAndValidation.timeStamp'
                    defaultMessage='Time stamp (last saved)'
                  />
                }
              />
            }
            name={['administrativeInformation', 'dataEntryBy', 'common:timeStamp']}
            rules={
              showRules
                ? getRules(
                    schema['flowPropertyDataSet']['administrativeInformation']['dataEntryBy'][
                      'common:timeStamp'
                    ]['rules'],
                  )
                : []
            }
          >
            <Input disabled={true} style={{ color: token.colorTextDescription }} />
          </Form.Item>
          <SourceSelectForm
            defaultSourceName={formType === 'create' ? 'ILCD format' : ''}
            name={['administrativeInformation', 'dataEntryBy', 'common:referenceToDataSetFormat']}
            lang={lang}
            label={
              <FormattedMessage
                id='pages.FlowProperties.view.modellingAndValidation.referenceToDataSetFormat'
                defaultMessage='Data set format(s)'
              />
            }
            formRef={formRef}
            onData={onData}
            showRequiredLabel={true}
            rules={
              showRules
                ? getRules(
                    schema['flowPropertyDataSet']['administrativeInformation']['dataEntryBy'][
                      'common:referenceToDataSetFormat'
                    ]['@refObjectId']['rules'],
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
              id='pages.FlowProperties.view.modellingAndValidation.publicationAndOwnership'
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
                    id='pages.FlowProperties.view.modellingAndValidation.dataSetVersion'
                    defaultMessage='Data set version'
                  />
                }
              />
            }
            name={['administrativeInformation', 'publicationAndOwnership', 'common:dataSetVersion']}
            rules={getRules(
              schema['flowPropertyDataSet']['administrativeInformation']['publicationAndOwnership'][
                'common:dataSetVersion'
              ]['rules'],
            )}
          >
            <Input disabled={formType === 'edit'} />
          </DatasetCreateVersionFormItem>
          {/* <FlowpropertiesSelectForm
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:referenceToPrecedingDataSetVersion',
            ]}
            lang={lang}
            label={
              <FormattedMessage
                id='pages.FlowProperties.view.administrativeInformation.referenceToPrecedingDataSetVersion'
                defaultMessage='Preceding data set version'
              />
            }
            drawerVisible={drawerVisible}
            formRef={formRef}
            onData={onData}
          />
          <br /> */}
          <ContactSelectForm
            label={
              <FormattedMessage
                id='pages.FlowProperties.view.administrativeInformation.referenceToOwnershipOfDataSet'
                defaultMessage='Owner of data set'
              />
            }
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:referenceToOwnershipOfDataSet',
            ]}
            lang={lang}
            formRef={formRef}
            onData={onData}
            showRequiredLabel={true}
            rules={
              showRules
                ? getRules(
                    schema['flowPropertyDataSet']['administrativeInformation'][
                      'publicationAndOwnership'
                    ]['common:referenceToOwnershipOfDataSet']['@refObjectId']['rules'],
                  )
                : []
            }
          />
          <br />
          <Form.Item
            label={
              <FormattedMessage
                id='pages.FlowProperties.view.administrativeInformation.permanentDataSetURI'
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
