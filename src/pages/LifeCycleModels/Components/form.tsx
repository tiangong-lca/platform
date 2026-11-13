import TidasRepeatedField from '@/components/TidasRepeatedField';
import DatasetCreateVersionFormItem from '@/components/DatasetCreateVersionFormItem';
import LangTextItemForm from '@/components/LangTextItem/form';
import LevelTextItemForm from '@/components/LevelTextItem/form';
import RequiredMark from '@/components/RequiredMark';
import ContactSelectForm from '@/pages/Contacts/Components/select/form';
import ComplianceItemForm from '@/pages/Processes/Components/Compliance/form';
import { copyrightOptions } from '@/pages/Processes/Components/optiondata';
import ReveiwItemForm from '@/pages/Processes/Components/Review/form';
import processSchema from '@/pages/Processes/processes_schema.json';
import SourceSelectForm from '@/pages/Sources/Components/select/form';
import { getRules } from '@/pages/Utils';
import type { ValidationIssueSdkDetail } from '@/pages/Utils/review';
import { useDatasetSdkValidationFormSupport } from '@/pages/Utils/validation/formSupport';
import { ProFormInstance } from '@ant-design/pro-components';
import { Card, Form, Input, Select, Space, theme } from 'antd';
import type { FC } from 'react';
import React, { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';
import schema from '../lifecyclemodels.json';
import { licenseTypeOptions } from './optiondata';

const LIFE_CYCLE_MODEL_SCHEMA_PATH_PREFIX = ['lifeCycleModelDataSet'];
const LIFE_CYCLE_MODEL_CLASSIFICATION_FORM_NAME = [
  'lifeCycleModelInformation',
  'dataSetInformation',
  'classificationInformation',
  'common:classification',
  'common:class',
  'showValue',
] as const;

const isSameFormName = (left?: Array<string | number>, right?: readonly (string | number)[]) =>
  !!left &&
  !!right &&
  left.length === right.length &&
  left.every((segment, index) => segment === right[index]);

type Props = {
  lang: string;
  activeTabKey: string;
  formRef: React.RefObject<ProFormInstance | undefined>;
  onData: () => void;
  onTabChange: (key: string) => void;
  formType?: string;
  showRules?: boolean;
  actionType?: 'create' | 'copy' | 'createVersion';
  sdkValidationDetails?: ValidationIssueSdkDetail[];
  sdkValidationFocus?: ValidationIssueSdkDetail | null;
  validationIssueTabNames?: string[];
};
export const LifeCycleModelForm: FC<Props> = ({
  lang,
  activeTabKey,
  formRef,
  onData,
  onTabChange,
  formType,
  showRules = false,
  actionType,
  sdkValidationDetails = [],
  sdkValidationFocus = null,
  validationIssueTabNames = [],
}) => {
  const { token } = theme.useToken();
  const intl = useIntl();
  const [baseNameError, setBaseNameError] = useState(false);
  const [treatmentStandardsRoutesError, setTreatmentStandardsRoutesError] = useState(false);
  const [mixAndLocationTypesError, setMixAndLocationTypesError] = useState(false);
  const [generalCommentError, setGeneralCommentError] = useState(false);
  const [intendedApplicationsError, setIntendedApplicationsError] = useState(false);
  const { sdkValidationCountsByTab } = useDatasetSdkValidationFormSupport({
    activeTabKey,
    formRef,
    intl,
    sdkValidationDetails,
    sdkValidationFocus,
    schemaPathPrefix: LIFE_CYCLE_MODEL_SCHEMA_PATH_PREFIX,
    schemaRoot: schema,
    showRules,
  });
  const validationIssueTabs = useMemo(
    () => new Set(validationIssueTabNames),
    [validationIssueTabNames],
  );
  const classificationSdkValidationDetail = useMemo(
    () =>
      sdkValidationDetails.find(
        (detail) =>
          detail.presentation !== 'highlight-only' &&
          (isSameFormName(detail.formName, LIFE_CYCLE_MODEL_CLASSIFICATION_FORM_NAME) ||
            detail.fieldPath === LIFE_CYCLE_MODEL_CLASSIFICATION_FORM_NAME.join('.')),
      ),
    [sdkValidationDetails],
  );
  const classificationSdkValidationHelp = useMemo(() => {
    if (!classificationSdkValidationDetail) {
      return undefined;
    }

    return intl.formatMessage({
      id: 'pages.contact.validator.classification.required',
      defaultMessage: 'Please input classification',
    });
  }, [classificationSdkValidationDetail, intl]);

  const tabLabels = {
    administrativeInformation: (
      <FormattedMessage
        id='pages.lifeCycleModel.view.administrativeInformation'
        defaultMessage='Administrative information'
      />
    ),
    complianceDeclarations: (
      <FormattedMessage
        id='pages.lifeCycleModel.complianceDeclarations'
        defaultMessage='Compliance declarations'
      />
    ),
    lifeCycleModelInformation: (
      <FormattedMessage
        id='pages.lifeCycleModel.view.lifeCycleModelInformation'
        defaultMessage='Life cycle model information'
      />
    ),
    modellingAndValidation: (
      <FormattedMessage
        id='pages.lifeCycleModel.view.modellingAndValidation'
        defaultMessage='Modelling and validation'
      />
    ),
    validation: (
      <FormattedMessage id='pages.lifeCycleModel.validation' defaultMessage='Validation' />
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
      key: 'lifeCycleModelInformation',
      tab: renderTabLabel('lifeCycleModelInformation'),
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
      key: 'validation',
      tab: renderTabLabel('validation'),
    },
    {
      key: 'complianceDeclarations',
      tab: renderTabLabel('complianceDeclarations'),
    },
  ];

  const tabContent: { [key: string]: React.JSX.Element } = {
    lifeCycleModelInformation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
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
                    id='pages.lifeCycleModel.information.baseName'
                    defaultMessage='Base name'
                  />
                }
                showError={baseNameError}
              />
            }
          >
            <LangTextItemForm
              name={['lifeCycleModelInformation', 'dataSetInformation', 'name', 'baseName']}
              label={
                <FormattedMessage
                  id='pages.lifeCycleModel.information.baseName'
                  defaultMessage='Base name'
                />
              }
              setRuleErrorState={setBaseNameError}
              autoExpandRequired={schema['lifeCycleModelDataSet']['lifeCycleModelInformation'][
                'dataSetInformation'
              ]['name']['baseName']['rules'].some((rule) => rule.required)}
              rules={[
                ...(showRules
                  ? getRules(
                      schema['lifeCycleModelDataSet']['lifeCycleModelInformation'][
                        'dataSetInformation'
                      ]['name']['baseName']['rules'],
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
                    id='pages.lifeCycleModel.information.treatmentStandardsRoutes'
                    defaultMessage='Treatment, standards, routes'
                  />
                }
                showError={treatmentStandardsRoutesError}
              />
            }
          >
            <LangTextItemForm
              name={[
                'lifeCycleModelInformation',
                'dataSetInformation',
                'name',
                'treatmentStandardsRoutes',
              ]}
              label={
                <FormattedMessage
                  id='pages.lifeCycleModel.information.treatmentStandardsRoutes'
                  defaultMessage='Treatment, standards, routes'
                />
              }
              setRuleErrorState={setTreatmentStandardsRoutesError}
              autoExpandRequired={schema['lifeCycleModelDataSet']['lifeCycleModelInformation'][
                'dataSetInformation'
              ]['name']['treatmentStandardsRoutes']['rules'].some((rule) => rule.required)}
              rules={[
                ...(showRules
                  ? getRules(
                      schema['lifeCycleModelDataSet']['lifeCycleModelInformation'][
                        'dataSetInformation'
                      ]['name']['treatmentStandardsRoutes']['rules'],
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
                    id='pages.lifeCycleModel.information.mixAndLocationTypes'
                    defaultMessage='Mix and location types'
                  />
                }
                showError={mixAndLocationTypesError}
              />
            }
          >
            <LangTextItemForm
              name={[
                'lifeCycleModelInformation',
                'dataSetInformation',
                'name',
                'mixAndLocationTypes',
              ]}
              label={
                <FormattedMessage
                  id='pages.lifeCycleModel.information.mixAndLocationTypes'
                  defaultMessage='Mix and location types'
                />
              }
              setRuleErrorState={setMixAndLocationTypesError}
              autoExpandRequired={schema['lifeCycleModelDataSet']['lifeCycleModelInformation'][
                'dataSetInformation'
              ]['name']['mixAndLocationTypes']['rules'].some((rule) => rule.required)}
              rules={[
                ...(showRules
                  ? getRules(
                      schema['lifeCycleModelDataSet']['lifeCycleModelInformation'][
                        'dataSetInformation'
                      ]['name']['mixAndLocationTypes']['rules'],
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
                id='pages.lifeCycleModel.information.functionalUnitFlowProperties'
                defaultMessage='Quantitative product or process properties'
              />
            }
          >
            <LangTextItemForm
              name={[
                'lifeCycleModelInformation',
                'dataSetInformation',
                'name',
                'functionalUnitFlowProperties',
              ]}
              label={
                <FormattedMessage
                  id='pages.lifeCycleModel.information.functionalUnitFlowProperties'
                  defaultMessage='Quantitative product or process properties'
                />
              }
              rules={[
                ...(showRules
                  ? getRules(
                      schema['lifeCycleModelDataSet']['lifeCycleModelInformation'][
                        'dataSetInformation'
                      ]['name']['functionalUnitFlowProperties']['rules'],
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
        <LevelTextItemForm
          name={[
            'lifeCycleModelInformation',
            'dataSetInformation',
            'classificationInformation',
            'common:classification',
            'common:class',
          ]}
          formRef={formRef}
          lang={lang}
          dataType={'LifeCycleModel'}
          onData={onData}
          showRules={showRules}
          validationHelp={classificationSdkValidationHelp}
          validationStatus={classificationSdkValidationHelp ? 'error' : undefined}
          rules={
            showRules
              ? getRules(
                  schema['lifeCycleModelDataSet']['lifeCycleModelInformation'][
                    'dataSetInformation'
                  ]['classificationInformation']['common:classification']['common:class'][0][
                    '@classId'
                  ]['rules'],
                )
              : []
          }
        />
        <Card
          size='small'
          title={
            <RequiredMark
              label={
                <FormattedMessage
                  id='pages.lifeCycleModel.information.generalComment'
                  defaultMessage='General comment'
                />
              }
              showError={generalCommentError}
            />
          }
        >
          <LangTextItemForm
            name={['lifeCycleModelInformation', 'dataSetInformation', 'common:generalComment']}
            label={
              <FormattedMessage
                id='pages.lifeCycleModel.information.generalComment'
                defaultMessage='General comment'
              />
            }
            autoExpandRequired={processSchema['processDataSet']['processInformation'][
              'dataSetInformation'
            ]['common:generalComment']['rules'].some((rule) => rule.required)}
            rules={
              showRules
                ? getRules(
                    processSchema['processDataSet']['processInformation']['dataSetInformation'][
                      'common:generalComment'
                    ]['rules'],
                  )
                : []
            }
            setRuleErrorState={setGeneralCommentError}
          />
        </Card>
        <br />
        <SourceSelectForm
          lang={lang}
          formRef={formRef}
          label={
            <FormattedMessage
              id='pages.lifeCycleModel.information.referenceToExternalDocumentation'
              defaultMessage='Data set report, background info'
            />
          }
          name={[
            'lifeCycleModelInformation',
            'dataSetInformation',
            'referenceToExternalDocumentation',
          ]}
          onData={onData}
        />
        <br />
        <SourceSelectForm
          lang={lang}
          formRef={formRef}
          label={
            <FormattedMessage
              id='pages.lifeCycleModel.information.technology.referenceToDiagram'
              defaultMessage='Life cycle model diagram(s) or screenshot(s)'
            />
          }
          name={['lifeCycleModelInformation', 'technology', 'referenceToDiagram']}
          onData={onData}
        />
      </Space>
    ),
    modellingAndValidation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.modellingAndValidation.useAdviceForDataSet'
              defaultMessage='Use advice for data set'
            />
          }
        >
          <LangTextItemForm
            name={['modellingAndValidation', 'dataSourcesTreatmentEtc', 'useAdviceForDataSet']}
            label={
              <FormattedMessage
                id='pages.lifeCycleModel.modellingAndValidation.useAdviceForDataSet'
                defaultMessage='Use advice for data set'
              />
            }
          />
        </Card>
      </Space>
    ),
    administrativeInformation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.administrativeInformation.commissionerAndGoal'
              defaultMessage='Commissioner and goal'
            />
          }
        >
          <ContactSelectForm
            lang={lang}
            formRef={formRef}
            label={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.referenceToCommissioner'
                defaultMessage='Commissioner of data set'
              />
            }
            name={[
              'administrativeInformation',
              'common:commissionerAndGoal',
              'common:referenceToCommissioner',
            ]}
            onData={onData}
            showRequiredLabel={true}
            rules={
              showRules
                ? getRules(
                    schema['lifeCycleModelDataSet']['administrativeInformation'][
                      'common:commissionerAndGoal'
                    ]['common:referenceToCommissioner']['@refObjectId']['rules'],
                  )
                : []
            }
          />
          <br />
          <Card
            size='small'
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.project'
                defaultMessage='Project'
              />
            }
          >
            <LangTextItemForm
              name={['administrativeInformation', 'common:commissionerAndGoal', 'common:project']}
              label={
                <FormattedMessage
                  id='pages.lifeCycleModel.administrativeInformation.project'
                  defaultMessage='Project'
                />
              }
            />
          </Card>
          <br />
          <Card
            size='small'
            title={
              <RequiredMark
                label={
                  <FormattedMessage
                    id='pages.lifeCycleModel.administrativeInformation.intendedApplications'
                    defaultMessage='Intended applications'
                  />
                }
                showError={intendedApplicationsError}
              />
            }
          >
            <LangTextItemForm
              name={[
                'administrativeInformation',
                'common:commissionerAndGoal',
                'common:intendedApplications',
              ]}
              label={
                <FormattedMessage
                  id='pages.lifeCycleModel.administrativeInformation.intendedApplications'
                  defaultMessage='Intended applications'
                />
              }
              setRuleErrorState={setIntendedApplicationsError}
              autoExpandRequired={processSchema['processDataSet']['administrativeInformation'][
                'common:commissionerAndGoal'
              ]['common:intendedApplications']['rules'].some((rule) => rule.required)}
              rules={
                showRules
                  ? getRules(
                      processSchema['processDataSet']['administrativeInformation'][
                        'common:commissionerAndGoal'
                      ]['common:intendedApplications']['rules'],
                    )
                  : []
              }
            />
          </Card>
        </Card>
        <br />
        <ContactSelectForm
          lang={lang}
          formRef={formRef}
          label={
            <FormattedMessage
              id='pages.lifeCycleModel.administrativeInformation.referenceToPersonOrEntityGeneratingTheDataSet'
              defaultMessage='Data set generator / modeller'
            />
          }
          name={[
            'administrativeInformation',
            'dataGenerator',
            'common:referenceToPersonOrEntityGeneratingTheDataSet',
          ]}
          onData={onData}
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
          <Form.Item
            required={false}
            label={
              <RequiredMark
                label={
                  <FormattedMessage
                    id='pages.lifeCycleModel.administrativeInformation.timeStamp'
                    defaultMessage='Time stamp (last saved)'
                  />
                }
                showError={false}
              />
            }
            name={['administrativeInformation', 'dataEntryBy', 'common:timeStamp']}
            rules={
              showRules
                ? getRules(
                    schema['lifeCycleModelDataSet']['administrativeInformation']['dataEntryBy'][
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
                id='pages.lifeCycleModel.administrativeInformation.referenceToDataSetFormat'
                defaultMessage='Data set format(s)'
              />
            }
            name={['administrativeInformation', 'dataEntryBy', 'common:referenceToDataSetFormat']}
            onData={onData}
            showRequiredLabel={true}
            rules={
              showRules
                ? getRules(
                    schema['lifeCycleModelDataSet']['administrativeInformation']['dataEntryBy'][
                      'common:referenceToDataSetFormat'
                    ]['@refObjectId']['rules'],
                  )
                : []
            }
          />
          <br />
          <ContactSelectForm
            lang={lang}
            formRef={formRef}
            label={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.referenceToPersonOrEntityEnteringTheData'
                defaultMessage='Data entry by:'
              />
            }
            name={[
              'administrativeInformation',
              'dataEntryBy',
              'common:referenceToPersonOrEntityEnteringTheData',
            ]}
            onData={onData}
            showRequiredLabel={true}
            rules={
              showRules
                ? getRules(
                    schema['lifeCycleModelDataSet']['administrativeInformation']['dataEntryBy'][
                      'common:referenceToPersonOrEntityEnteringTheData'
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
              id='pages.lifeCycleModel.administrativeInformation.publicationAndOwnership'
              defaultMessage='Publication and ownership'
            />
          }
        >
          <DatasetCreateVersionFormItem
            createVersion={actionType === 'createVersion'}
            label={
              <RequiredMark
                label={
                  <FormattedMessage
                    id='pages.flow.view.administrativeInformation.dataSetVersion'
                    defaultMessage='Data set version'
                  />
                }
                showError={false}
              />
            }
            name={['administrativeInformation', 'publicationAndOwnership', 'common:dataSetVersion']}
            rules={getRules(
              schema['lifeCycleModelDataSet']['administrativeInformation'][
                'publicationAndOwnership'
              ]['common:dataSetVersion']['rules'],
            )}
          >
            <Input disabled={formType === 'edit'} />
          </DatasetCreateVersionFormItem>
          <Form.Item
            required={false}
            label={
              <RequiredMark
                label={
                  <FormattedMessage
                    id='pages.flow.view.administrativeInformation.permanentDataSetURI'
                    defaultMessage='Permanent data set URI'
                  />
                }
                showError={false}
              />
            }
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:permanentDataSetURI',
            ]}
            rules={
              showRules
                ? getRules(
                    schema['lifeCycleModelDataSet']['administrativeInformation'][
                      'publicationAndOwnership'
                    ]['common:permanentDataSetURI']['rules'],
                  )
                : []
            }
          >
            <Input disabled={true} />
          </Form.Item>
          <ContactSelectForm
            lang={lang}
            formRef={formRef}
            label={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.referenceToOwnershipOfDataSet'
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
                    schema['lifeCycleModelDataSet']['administrativeInformation'][
                      'publicationAndOwnership'
                    ]['common:referenceToOwnershipOfDataSet']['@refObjectId']['rules'],
                  )
                : []
            }
          />
          <br />
          <Form.Item
            required={false}
            label={
              <RequiredMark
                label={
                  <FormattedMessage
                    id='pages.lifeCycleModel.administrativeInformation.copyright'
                    defaultMessage='Copyright?'
                  />
                }
                showError={false}
              />
            }
            name={['administrativeInformation', 'publicationAndOwnership', 'common:copyright']}
            rules={
              showRules
                ? getRules(
                    schema['lifeCycleModelDataSet']['administrativeInformation'][
                      'publicationAndOwnership'
                    ]['common:copyright']['rules'],
                  )
                : []
            }
          >
            <Select options={copyrightOptions} />
          </Form.Item>
          <ContactSelectForm
            lang={lang}
            formRef={formRef}
            label={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.referenceToEntitiesWithExclusiveAccess'
                defaultMessage='Entities or persons with exclusive access to this data set'
              />
            }
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:referenceToEntitiesWithExclusiveAccess',
            ]}
            onData={onData}
          />
          <br />
          <Form.Item
            required={false}
            label={
              <RequiredMark
                showError={false}
                label={
                  <FormattedMessage
                    id='pages.lifeCycleModel.administrativeInformation.licenseType'
                    defaultMessage='License type'
                  />
                }
              />
            }
            name={['administrativeInformation', 'publicationAndOwnership', 'common:licenseType']}
            rules={
              showRules
                ? getRules(
                    schema['lifeCycleModelDataSet']['administrativeInformation'][
                      'publicationAndOwnership'
                    ]['common:licenseType']['rules'],
                  )
                : []
            }
          >
            <Select options={licenseTypeOptions} />
          </Form.Item>
          <Card
            size='small'
            title={
              <FormattedMessage
                id='pages.lifeCycleModel.administrativeInformation.accessRestrictions'
                defaultMessage='Access and use restrictions'
              />
            }
          >
            <LangTextItemForm
              name={[
                'administrativeInformation',
                'publicationAndOwnership',
                'common:accessRestrictions',
              ]}
              label={
                <FormattedMessage
                  id='pages.lifeCycleModel.administrativeInformation.accessRestrictions'
                  defaultMessage='Access and use restrictions'
                />
              }
            />
          </Card>
        </Card>
      </Space>
    ),
    validation: (
      <ReveiwItemForm
        type='reviewReport'
        name={['modellingAndValidation', 'validation', 'review']}
        lang={lang}
        formRef={formRef}
        onData={onData}
        showRules={showRules}
      />
    ),
    complianceDeclarations: (
      <TidasRepeatedField
        name={['modellingAndValidation', 'complianceDeclarations']}
        onChange={onData}
      >
        {(itemPath) => (
          <ComplianceItemForm
            name={[...itemPath, 'compliance']}
            lang={lang}
            formRef={formRef}
            onData={onData}
            showRules={showRules}
          />
        )}
      </TidasRepeatedField>
    ),
  };

  return (
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
      {/* {tabContent[activeTabKey]} */}
    </Card>
  );
};
