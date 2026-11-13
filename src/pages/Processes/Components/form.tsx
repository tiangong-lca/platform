import { toTidasMultiSelectValue } from '@/services/general/tidasRepeatedFields';
import TidasRepeatedField from '@/components/TidasRepeatedField';
import AllocationBatch from './Exchange/allocationBatch';
import DatasetCreateVersionFormItem from '@/components/DatasetCreateVersionFormItem';
import LangTextItemForm from '@/components/LangTextItem/form';
import LevelTextItemForm from '@/components/LevelTextItem/form';
import LocationTextItemForm from '@/components/LocationTextItem/form';
import ContactSelectForm from '@/pages/Contacts/Components/select/form';
import SourceSelectForm from '@/pages/Sources/Components/select/form';
// import ReferenceUnit from '@/pages/Unitgroups/Components/Unit/reference';
import RequiredMark from '@/components/RequiredMark';
import { RefCheckType, useRefCheckContext } from '@/contexts/refCheckContext';
import { getRules } from '@/pages/Utils';
import type { ValidationIssueSdkDetail } from '@/pages/Utils/review';
import { getFlowStateCodeByIdsAndVersions } from '@/services/flows/api';
import {
  ContentLanguageAwareTableParams,
  getContentLanguageAwareTableParams,
} from '@/services/general/data';
import { getUnitData } from '@/services/general/util';
import { LCIAResultTable } from '@/services/lciaMethods/data';
import { getProcessExchange } from '@/services/processes/api';
import { ProcessExchangeData, ProcessExchangeTable } from '@/services/processes/data';
import { genProcessExchangeTableData } from '@/services/processes/util';
import { CloseOutlined } from '@ant-design/icons';
import { ActionType, ProColumns, ProFormInstance, ProTable } from '@ant-design/pro-components';
import {
  Button,
  Card,
  Collapse,
  Divider,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  theme,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import { FormattedMessage, useIntl } from 'umi';
import schema from '../processes_schema.json';
import {
  getSdkSuggestedFixMessage,
  isAnnualSupplyVolumeReferenceContextSdkDetail,
  resolveRequiredValidationMessage,
} from '../sdkValidationUi';
import AnnualSupplyOrProductionVolumeForm from './AnnualSupplyOrProductionVolume/form';
import ComplianceItemForm from './Compliance/form';
import { getExchangeColumns, PROCESS_EXCHANGE_TABLE_SCROLL } from './Exchange/column';
import ProcessExchangeCreate from './Exchange/create';
import ProcessExchangeDelete from './Exchange/delete';
import ProcessExchangeEdit from './Exchange/edit';
import ProcessExchangeView from './Exchange/view';
import {
  completenessElementaryFlowsTypeOptions,
  completenessElementaryFlowsValueOptions,
  completenessProductModelOptions,
  copyrightOptions,
  LCIMethodApproachOptions,
  LCIMethodPrincipleOptions,
  licenseTypeOptions,
  processtypeOfDataSetOptions,
  uncertaintyDistributionTypeOptions,
  workflowAndPublicationStatusOptions,
} from './optiondata';
import ProcessLciaResultsPanel from './processLciaResultsPanel';
import ReveiwItemForm from './Review/form';

type Props = {
  lang: string;
  activeTabKey: string;
  formRef: React.RefObject<ProFormInstance | undefined>;
  onData: () => void;
  onExchangeData: (data: ProcessExchangeData[]) => void;
  onExchangeDataCreate: (data: ProcessExchangeData) => void;
  onTabChange: (key: string) => void;
  exchangeDataSource: ProcessExchangeData[];
  lciaResults: LCIAResultTable[];
  lciaCalculationEvidence?: unknown;
  formType?: string;
  processId?: string;
  processVersion?: string;
  showRules?: boolean;
  actionFrom?: 'modelResult';
  sdkValidationDetails?: ValidationIssueSdkDetail[];
  sdkValidationDismissedFieldKeys?: ReadonlySet<string>;
  sdkValidationFocus?: ValidationIssueSdkDetail | null;
  validationIssueTabNames?: string[];
};

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

type SdkFieldMessageEntry = {
  text: string;
  validationCode?: string;
};

const EMPTY_SDK_DISMISSED_FIELD_KEYS = new Set<string>();

const isSdkFieldDetail = (detail: ValidationIssueSdkDetail) =>
  !detail.presentation || detail.presentation === 'field';

const isSdkSectionDetail = (detail: ValidationIssueSdkDetail) => detail.presentation === 'section';

const isSdkHighlightOnlyDetail = (detail: ValidationIssueSdkDetail) =>
  detail.presentation === 'highlight-only';

const toReferenceValue = (reference?: ProcessExchangeData['referenceToFlowDataSet']) => {
  return Array.isArray(reference) ? reference[0] : reference;
};

const hasSelectedQuantitativeReferenceExchange = (exchangeDataSource: ProcessExchangeData[]) =>
  exchangeDataSource.some((exchange) => exchange?.quantitativeReference === true);

const parseSdkDetailFormName = (detail: ValidationIssueSdkDetail) => {
  if (Array.isArray(detail.formName) && detail.formName.length > 0) {
    return detail.formName;
  }

  if (!detail.fieldPath) {
    return undefined;
  }

  const fieldPath = detail.exchangeInternalId
    ? detail.fieldPath.replace(/^exchange\[#.+?\]\.?/, '')
    : detail.fieldPath;
  const segments = fieldPath.split('.').filter(Boolean);

  if (segments.length === 0) {
    return undefined;
  }

  return segments.map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
};

const stringifySdkFormName = (name?: Array<string | number>) => {
  if (!name || name.length === 0) {
    return '';
  }

  return name.map(String).join('.');
};

const isDismissedSdkFieldKey = (dismissedFieldKeys: ReadonlySet<string>, fieldKey: string) => {
  if (!fieldKey || dismissedFieldKeys.size === 0) {
    return false;
  }

  return Array.from(dismissedFieldKeys).some((dismissedFieldKey) => {
    if (
      dismissedFieldKey === fieldKey ||
      dismissedFieldKey.startsWith(`${fieldKey}.`) ||
      fieldKey.startsWith(`${dismissedFieldKey}.`)
    ) {
      return true;
    }

    return false;
  });
};

const isDismissedRootSdkFieldDetail = (
  detail: ValidationIssueSdkDetail,
  dismissedFieldKeys: ReadonlySet<string>,
) => {
  if (
    detail.exchangeInternalId ||
    !isSdkFieldDetail(detail) ||
    isSdkSectionDetail(detail) ||
    isSdkHighlightOnlyDetail(detail)
  ) {
    return false;
  }

  return isDismissedSdkFieldKey(
    dismissedFieldKeys,
    stringifySdkFormName(parseSdkDetailFormName(detail)),
  );
};

const PROCESS_VALIDATION_REVIEW_FIELD_PATH = 'modellingAndValidation.validation.review';
const PROCESS_COMPLIANCE_DECLARATIONS_FIELD_PATH =
  'modellingAndValidation.complianceDeclarations.compliance';

const normalizeSdkFieldPath = (fieldPath?: string) =>
  typeof fieldPath === 'string' ? fieldPath.replace(/^processDataSet\./, '').trim() : '';

const getSdkVisibleTabNameFromFieldPath = (fieldPath?: string) => {
  const normalizedFieldPath = normalizeSdkFieldPath(fieldPath);

  if (!normalizedFieldPath) {
    return undefined;
  }

  if (
    normalizedFieldPath === PROCESS_VALIDATION_REVIEW_FIELD_PATH ||
    normalizedFieldPath.startsWith(`${PROCESS_VALIDATION_REVIEW_FIELD_PATH}.`)
  ) {
    return 'validation';
  }

  if (
    normalizedFieldPath === PROCESS_COMPLIANCE_DECLARATIONS_FIELD_PATH ||
    normalizedFieldPath.startsWith(`${PROCESS_COMPLIANCE_DECLARATIONS_FIELD_PATH}.`)
  ) {
    return 'complianceDeclarations';
  }

  return undefined;
};

const getSdkVisibleTabName = (detail: ValidationIssueSdkDetail) => {
  const visibleTabNameFromFieldPath = getSdkVisibleTabNameFromFieldPath(detail.fieldPath);

  if (visibleTabNameFromFieldPath) {
    return visibleTabNameFromFieldPath;
  }

  const serializedFormName = stringifySdkFormName(parseSdkDetailFormName(detail));
  const visibleTabNameFromFormName = getSdkVisibleTabNameFromFieldPath(serializedFormName);

  if (visibleTabNameFromFormName) {
    return visibleTabNameFromFormName;
  }

  return detail.tabName;
};

const getSdkSectionAnchorPath = (detail: ValidationIssueSdkDetail) => {
  if (detail.exchangeInternalId || isSdkHighlightOnlyDetail(detail)) {
    return undefined;
  }

  if (isSdkSectionDetail(detail)) {
    return normalizeSdkFieldPath(detail.fieldPath) || detail.key;
  }

  const serializedFormName = stringifySdkFormName(parseSdkDetailFormName(detail));

  if (
    serializedFormName === PROCESS_VALIDATION_REVIEW_FIELD_PATH ||
    serializedFormName === PROCESS_COMPLIANCE_DECLARATIONS_FIELD_PATH
  ) {
    return serializedFormName;
  }

  return undefined;
};

const getOrCreateTabKeySet = (collection: Record<string, Set<string>>, tabName: string) => {
  if (!collection[tabName]) {
    collection[tabName] = new Set<string>();
  }

  return collection[tabName];
};

export const ProcessForm: FC<Props> = ({
  lang,
  activeTabKey,
  formRef,
  onData,
  onExchangeData,
  onExchangeDataCreate,
  onTabChange,
  exchangeDataSource,
  formType,
  processId,
  processVersion,
  showRules = false,
  lciaResults,
  lciaCalculationEvidence,
  actionFrom,
  sdkValidationDetails = [],
  sdkValidationDismissedFieldKeys = EMPTY_SDK_DISMISSED_FIELD_KEYS,
  sdkValidationFocus,
  validationIssueTabNames = [],
}) => {
  const intl = useIntl();
  const intlRef = useRef(intl);
  intlRef.current = intl;
  const refCheckContext = useRefCheckContext();
  const actionRefExchangeTableInput = useRef<ActionType | undefined>(undefined);
  const actionRefExchangeTableOutput = useRef<ActionType | undefined>(undefined);
  const inputExchangeRequestEpochRef = useRef(0);
  const outputExchangeRequestEpochRef = useRef(0);
  const exchangeTableParams = useMemo(() => getContentLanguageAwareTableParams(lang), [lang]);
  const currentExchangeContentLanguageRef = useRef(exchangeTableParams.contentLanguage);
  currentExchangeContentLanguageRef.current = exchangeTableParams.contentLanguage;
  const rootSdkFieldMessagesRef = useRef<
    Map<string, { entries: SdkFieldMessageEntry[]; name: Array<string | number> }>
  >(new Map());
  const [baseNameError, setBaseNameError] = useState(false);
  const [treatmentStandardsRoutesError, setTreatmentStandardsRoutesError] = useState(false);
  const [mixAndLocationTypesError, setMixAndLocationTypesError] = useState(false);
  const [
    technologyDescriptionAndIncludedProcessesError,
    setTechnologyDescriptionAndIncludedProcessesError,
  ] = useState(false);
  const [dataCutOffAndCompletenessPrinciplesError, setDataCutOffAndCompletenessPrinciplesError] =
    useState(false);
  const [intendedApplicationsError, setIntendedApplicationsError] = useState(false);
  const [generalCommentError, setGeneralCommentError] = useState(false);

  const { token } = theme.useToken();

  const formatSdkDetailMessage = useCallback(
    (detail: ValidationIssueSdkDetail) => getSdkSuggestedFixMessage(intlRef.current, detail),
    [],
  );
  const visibleSdkValidationDetails = useMemo(() => {
    if (sdkValidationDismissedFieldKeys.size === 0) {
      return sdkValidationDetails;
    }

    return sdkValidationDetails.filter(
      (detail) => !isDismissedRootSdkFieldDetail(detail, sdkValidationDismissedFieldKeys),
    );
  }, [sdkValidationDetails, sdkValidationDismissedFieldKeys]);
  const hasAnnualSupplyVolumeReferenceContextError = useMemo(
    () =>
      !hasSelectedQuantitativeReferenceExchange(exchangeDataSource) &&
      visibleSdkValidationDetails.some(isAnnualSupplyVolumeReferenceContextSdkDetail),
    [exchangeDataSource, visibleSdkValidationDetails],
  );
  const annualSupplyVolumeReferenceContextErrorMessage = hasAnnualSupplyVolumeReferenceContextError
    ? intl.formatMessage({
        id: 'pages.process.validator.annualSupplyOrProductionVolume.referenceContext.required',
        defaultMessage: 'Please select one input/output as the reference',
      })
    : undefined;
  const fieldMessageSdkValidationDetails = useMemo(
    () =>
      hasAnnualSupplyVolumeReferenceContextError
        ? visibleSdkValidationDetails.filter(
            (detail) => !isAnnualSupplyVolumeReferenceContextSdkDetail(detail),
          )
        : visibleSdkValidationDetails,
    [hasAnnualSupplyVolumeReferenceContextError, visibleSdkValidationDetails],
  );

  const sdkVisibleSectionAnchorsByTab = sdkValidationDetails.reduce<Record<string, Set<string>>>(
    (accumulator, detail) => {
      const tabName = getSdkVisibleTabName(detail);
      const sectionAnchorPath = getSdkSectionAnchorPath(detail);

      if (!tabName || !sectionAnchorPath || !formatSdkDetailMessage(detail)) {
        return accumulator;
      }

      getOrCreateTabKeySet(accumulator, tabName).add(sectionAnchorPath);
      return accumulator;
    },
    {},
  );
  const sdkVisibleRootFieldAnchorsByTab = sdkValidationDetails.reduce<Record<string, Set<string>>>(
    (accumulator, detail) => {
      if (
        detail.exchangeInternalId ||
        !isSdkFieldDetail(detail) ||
        getSdkSectionAnchorPath(detail)
      ) {
        return accumulator;
      }

      const tabName = getSdkVisibleTabName(detail);
      const formName = parseSdkDetailFormName(detail);
      const serializedFormName = stringifySdkFormName(formName);
      const rootFieldAnchorPath = serializedFormName || normalizeSdkFieldPath(detail.fieldPath);

      if (!tabName || !rootFieldAnchorPath || !formatSdkDetailMessage(detail)) {
        return accumulator;
      }

      getOrCreateTabKeySet(accumulator, tabName).add(rootFieldAnchorPath);
      return accumulator;
    },
    {},
  );
  const sdkExchangeRowHighlightsByExchangeId = sdkValidationDetails.reduce<
    Record<string, ValidationIssueSdkDetail[]>
  >((accumulator, detail) => {
    if (!detail.exchangeInternalId || isSdkSectionDetail(detail)) {
      return accumulator;
    }

    if (!accumulator[detail.exchangeInternalId]) {
      accumulator[detail.exchangeInternalId] = [];
    }

    accumulator[detail.exchangeInternalId].push(detail);
    return accumulator;
  }, {});
  const sdkVisibleExchangeRowsByTab = sdkValidationDetails.reduce<Record<string, Set<string>>>(
    (accumulator, detail) => {
      const tabName = getSdkVisibleTabName(detail);

      if (!tabName || !detail.exchangeInternalId || isSdkSectionDetail(detail)) {
        return accumulator;
      }

      getOrCreateTabKeySet(accumulator, tabName).add(detail.exchangeInternalId);
      return accumulator;
    },
    {},
  );
  const sdkExchangeFieldDetailsByExchangeId = useMemo(
    () =>
      sdkValidationDetails.reduce<Record<string, ValidationIssueSdkDetail[]>>(
        (accumulator, detail) => {
          if (
            !detail.exchangeInternalId ||
            !isSdkFieldDetail(detail) ||
            isSdkSectionDetail(detail) ||
            isSdkHighlightOnlyDetail(detail)
          ) {
            return accumulator;
          }

          if (!accumulator[detail.exchangeInternalId]) {
            accumulator[detail.exchangeInternalId] = [];
          }

          accumulator[detail.exchangeInternalId].push(detail);
          return accumulator;
        },
        {},
      ),
    [sdkValidationDetails],
  );
  const sdkRootFieldMessages = useMemo(
    () =>
      fieldMessageSdkValidationDetails.reduce<
        Map<string, { entries: SdkFieldMessageEntry[]; name: Array<string | number> }>
      >((accumulator, detail) => {
        if (detail.exchangeInternalId || !isSdkFieldDetail(detail)) {
          return accumulator;
        }

        const formName = parseSdkDetailFormName(detail);
        const serializedFormName = stringifySdkFormName(formName);

        if (
          !formName ||
          !serializedFormName ||
          serializedFormName === 'modellingAndValidation.validation.review' ||
          serializedFormName === 'modellingAndValidation.complianceDeclarations.compliance'
        ) {
          return accumulator;
        }

        const formattedMessage = formatSdkDetailMessage(detail);
        if (!formattedMessage) {
          return accumulator;
        }
        const messageEntry: SdkFieldMessageEntry = {
          text: formattedMessage,
          validationCode: detail.validationCode,
        };

        const currentEntry = accumulator.get(serializedFormName);
        if (currentEntry) {
          if (
            !currentEntry.entries.some(
              (entry) =>
                entry.text === messageEntry.text &&
                entry.validationCode === messageEntry.validationCode,
            )
          ) {
            currentEntry.entries.push(messageEntry);
          }
          return accumulator;
        }

        accumulator.set(serializedFormName, {
          entries: [messageEntry],
          name: formName,
        });
        return accumulator;
      }, new Map()),
    [fieldMessageSdkValidationDetails, formatSdkDetailMessage],
  );
  const sdkValidationSectionMessages = fieldMessageSdkValidationDetails.reduce<
    Record<string, string[]>
  >((accumulator, detail) => {
    if (detail.exchangeInternalId || isSdkHighlightOnlyDetail(detail)) {
      return accumulator;
    }

    if (isSdkSectionDetail(detail)) {
      const formattedMessage = formatSdkDetailMessage(detail);
      if (!formattedMessage) {
        return accumulator;
      }

      if (!accumulator[detail.fieldPath]) {
        accumulator[detail.fieldPath] = [];
      }

      if (!accumulator[detail.fieldPath].includes(formattedMessage)) {
        accumulator[detail.fieldPath].push(formattedMessage);
      }

      return accumulator;
    }

    const formName = parseSdkDetailFormName(detail);
    const serializedFormName = stringifySdkFormName(formName);

    if (
      serializedFormName !== 'modellingAndValidation.validation.review' &&
      serializedFormName !== 'modellingAndValidation.complianceDeclarations.compliance'
    ) {
      return accumulator;
    }

    const formattedMessage = formatSdkDetailMessage(detail);
    if (!formattedMessage) {
      return accumulator;
    }

    if (!accumulator[serializedFormName]) {
      accumulator[serializedFormName] = [];
    }

    if (!accumulator[serializedFormName].includes(formattedMessage)) {
      accumulator[serializedFormName].push(formattedMessage);
    }

    return accumulator;
  }, {});
  const sdkValidationCountsByTab = [
    ...new Set([
      ...Object.keys(sdkVisibleSectionAnchorsByTab),
      ...Object.keys(sdkVisibleRootFieldAnchorsByTab),
      ...Object.keys(sdkVisibleExchangeRowsByTab),
    ]),
  ].reduce<Record<string, number>>((accumulator, tabName) => {
    accumulator[tabName] =
      (sdkVisibleSectionAnchorsByTab[tabName]?.size ?? 0) +
      (sdkVisibleRootFieldAnchorsByTab[tabName]?.size ?? 0) +
      (sdkVisibleExchangeRowsByTab[tabName]?.size ?? 0);

    return accumulator;
  }, {});
  const validationIssueTabs = useMemo(
    () =>
      new Set(
        validationIssueTabNames.filter(
          (tabName): tabName is string => typeof tabName === 'string' && tabName.length > 0,
        ),
      ),
    [validationIssueTabNames],
  );

  useEffect(() => {
    const formInstance = formRef.current;
    if (
      !formInstance ||
      typeof formInstance.setFields !== 'function' ||
      typeof formInstance.getFieldError !== 'function'
    ) {
      return;
    }

    const previousEntries = rootSdkFieldMessagesRef.current;
    const nextEntries = sdkRootFieldMessages;
    const changedFieldData = new Set<string>();
    const fieldStates: Array<{ errors: string[]; name: Array<string | number> }> = [];
    const appliedEntries = new Map<
      string,
      { entries: SdkFieldMessageEntry[]; name: Array<string | number> }
    >();

    [...previousEntries.keys(), ...nextEntries.keys()].forEach((key) => {
      if (changedFieldData.has(key)) {
        return;
      }

      changedFieldData.add(key);

      const previousEntry = previousEntries.get(key);
      const nextEntry = nextEntries.get(key);
      const fieldName = (nextEntry?.name ?? previousEntry?.name)!;

      const existingErrors = [formInstance.getFieldError(fieldName)]
        .flat()
        .filter((errorMessage): errorMessage is string => typeof errorMessage === 'string');
      const previousSdkMessages = previousEntry?.entries.map((entry) => entry.text) ?? [];
      const retainedErrors = existingErrors.filter(
        (errorMessage: string) => !previousSdkMessages.includes(errorMessage),
      );
      const nextErrors = [...retainedErrors];
      const nextAppliedFieldEntries: SdkFieldMessageEntry[] = [];

      (nextEntry?.entries ?? []).forEach((entry) => {
        const requiredResolution = resolveRequiredValidationMessage({
          context: 'process',
          fieldName,
          frontendRulesEnabled: showRules,
          intl: intlRef.current,
          retainedErrors,
          schemaRoot: schema,
          validationCode: entry.validationCode,
        });

        if (requiredResolution.suppressSdkMessage) {
          return;
        }

        const resolvedEntry = {
          ...entry,
          text: requiredResolution.replacementMessage ?? entry.text,
        };

        if (!nextErrors.includes(resolvedEntry.text)) {
          nextErrors.push(resolvedEntry.text);
        }

        nextAppliedFieldEntries.push(resolvedEntry);
      });

      if (nextAppliedFieldEntries.length > 0) {
        appliedEntries.set(key, {
          entries: nextAppliedFieldEntries,
          name: fieldName,
        });
      }

      if (
        existingErrors.length === nextErrors.length &&
        existingErrors.every(
          (errorMessage: string, index: number) => errorMessage === nextErrors[index],
        )
      ) {
        return;
      }

      fieldStates.push({
        errors: nextErrors,
        name: fieldName,
      });
    });

    if (fieldStates.length > 0) {
      formInstance.setFields(fieldStates);
    }

    rootSdkFieldMessagesRef.current = appliedEntries;
  }, [formRef, showRules, sdkRootFieldMessages]);

  useEffect(() => {
    if (
      !sdkValidationFocus ||
      sdkValidationFocus.exchangeInternalId ||
      !isSdkFieldDetail(sdkValidationFocus) ||
      sdkValidationFocus.tabName !== activeTabKey ||
      isDismissedRootSdkFieldDetail(sdkValidationFocus, sdkValidationDismissedFieldKeys)
    ) {
      return;
    }

    const fieldName = parseSdkDetailFormName(sdkValidationFocus);
    const formInstance = formRef.current;

    if (!fieldName || !formInstance || typeof formInstance.scrollToField !== 'function') {
      return;
    }

    const timer = window.setTimeout(() => {
      formInstance.scrollToField(fieldName, { focus: true });
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeTabKey, formRef, sdkValidationDismissedFieldKeys, sdkValidationFocus]);

  const renderSdkSectionMessages = (fieldPath: string) => {
    const messages = sdkValidationSectionMessages[fieldPath] ?? [];

    if (messages.length === 0) {
      return null;
    }

    return (
      <div
        style={{
          alignItems: 'flex-start',
          columnGap: 8,
          display: 'flex',
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        {/* <span
          style={{
            fontWeight: token.fontWeightStrong ?? 600,
          }}
        >
          {label}
        </span> */}
        <span
          style={{
            color: token.colorError,
          }}
        >
          {messages.map((messageText, index) => (
            <span key={`${fieldPath}-${index}`}>
              {index > 0 ? ' ' : null}
              {messageText}
            </span>
          ))}
        </span>
      </div>
    );
  };

  const tabLabels = {
    administrativeInformation: (
      <FormattedMessage
        id='pages.process.view.administrativeInformation'
        defaultMessage='Administrative information'
      />
    ),
    complianceDeclarations: (
      <FormattedMessage
        id='pages.process.complianceDeclarations'
        defaultMessage='Compliance declarations'
      />
    ),
    exchanges: (
      <FormattedMessage id='pages.process.view.exchanges' defaultMessage='Inputs and Outputs' />
    ),
    lciaResults: (
      <FormattedMessage id='pages.process.view.lciaresults' defaultMessage='LCIA Results' />
    ),
    modellingAndValidation: (
      <FormattedMessage
        id='pages.process.view.modellingAndValidation'
        defaultMessage='Modelling and validation'
      />
    ),
    processInformation: (
      <FormattedMessage
        id='pages.process.view.processInformation'
        defaultMessage='Process information'
      />
    ),
    validation: <FormattedMessage id='pages.process.validation' defaultMessage='Validation' />,
  } as const;

  const renderTabLabel = (key: keyof typeof tabLabels) => {
    const issueCount = sdkValidationCountsByTab[key] ?? 0;
    const hasIssue = issueCount > 0 || validationIssueTabs.has(key);

    return (
      <span
        style={
          hasIssue
            ? {
                color: token.colorError,
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
      key: 'processInformation',
      tab: renderTabLabel('processInformation'),
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
      key: 'exchanges',
      tab: renderTabLabel('exchanges'),
    },
    {
      key: 'lciaResults',
      tab: renderTabLabel('lciaResults'),
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
  const baseProcessExchangeColumns = getExchangeColumns(lang);
  const processExchangeColumns: ProColumns<ProcessExchangeTable>[] = [
    ...baseProcessExchangeColumns,
    {
      title: <FormattedMessage id='pages.table.title.option' defaultMessage='Actions' />,
      dataIndex: 'option',
      search: false,
      width: 128,
      render: (_, row) => {
        const rowSdkHighlights = sdkExchangeFieldDetailsByExchangeId[row.dataSetInternalID] ?? [];

        return [
          <Space size={'small'} key={0}>
            <ProcessExchangeView
              id={row.dataSetInternalID}
              data={exchangeDataSource}
              lang={lang}
              buttonType={'icon'}
            />
            <ProcessExchangeEdit
              id={row.dataSetInternalID}
              data={exchangeDataSource}
              lang={lang}
              buttonType={'icon'}
              onData={onExchangeData}
              setViewDrawerVisible={() => {}}
              showRules={showRules}
              sdkHighlights={rowSdkHighlights}
              disabled={actionFrom === 'modelResult'}
            />
            <ProcessExchangeDelete
              lang={lang}
              disabled={actionFrom === 'modelResult'}
              id={row.dataSetInternalID}
              data={exchangeDataSource}
              buttonType={'icon'}
              setViewDrawerVisible={() => {}}
              onData={onExchangeData}
            />
          </Space>,
        ];
      },
    },
  ];
  const tabContent: { [key: string]: React.JSX.Element } = {
    processInformation: (
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
                    id='pages.process.view.processInformation.baseName'
                    defaultMessage='Base name'
                  />
                }
                showError={baseNameError}
              />
            }
          >
            <LangTextItemForm
              name={['processInformation', 'dataSetInformation', 'name', 'baseName']}
              label={
                <FormattedMessage
                  id='pages.process.view.processInformation.baseName'
                  defaultMessage='Base name'
                />
              }
              setRuleErrorState={setBaseNameError}
              autoExpandRequired={schema['processDataSet']['processInformation'][
                'dataSetInformation'
              ]['name']['baseName']['rules'].some((rule) => rule.required)}
              rules={
                showRules
                  ? getRules(
                      schema['processDataSet']['processInformation']['dataSetInformation']['name'][
                        'baseName'
                      ]['rules'],
                    )
                  : []
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
                    id='pages.process.view.processInformation.treatmentStandardsRoutes'
                    defaultMessage='Treatment, standards, routes'
                  />
                }
                showError={treatmentStandardsRoutesError}
              />
            }
          >
            <LangTextItemForm
              name={[
                'processInformation',
                'dataSetInformation',
                'name',
                'treatmentStandardsRoutes',
              ]}
              label={
                <FormattedMessage
                  id='pages.process.view.processInformation.treatmentStandardsRoutes'
                  defaultMessage='Treatment, standards, routes'
                />
              }
              setRuleErrorState={setTreatmentStandardsRoutesError}
              autoExpandRequired={schema['processDataSet']['processInformation'][
                'dataSetInformation'
              ]['name']['treatmentStandardsRoutes']['rules'].some((rule) => rule.required)}
              rules={
                showRules
                  ? getRules(
                      schema['processDataSet']['processInformation']['dataSetInformation']['name'][
                        'treatmentStandardsRoutes'
                      ]['rules'],
                    )
                  : []
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
                    id='pages.process.view.processInformation.mixAndLocationTypes'
                    defaultMessage='Mix and location types'
                  />
                }
                showError={mixAndLocationTypesError}
              />
            }
          >
            <LangTextItemForm
              name={['processInformation', 'dataSetInformation', 'name', 'mixAndLocationTypes']}
              label={
                <FormattedMessage
                  id='pages.process.view.processInformation.mixAndLocationTypes'
                  defaultMessage='Mix and location types'
                />
              }
              setRuleErrorState={setMixAndLocationTypesError}
              autoExpandRequired={schema['processDataSet']['processInformation'][
                'dataSetInformation'
              ]['name']['mixAndLocationTypes']['rules'].some((rule) => rule.required)}
              rules={
                showRules
                  ? getRules(
                      schema['processDataSet']['processInformation']['dataSetInformation']['name'][
                        'mixAndLocationTypes'
                      ]['rules'],
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
                id='pages.process.view.processInformation.functionalUnitFlowProperties'
                defaultMessage='Quantitative product or process properties'
              />
            }
          >
            <LangTextItemForm
              name={[
                'processInformation',
                'dataSetInformation',
                'name',
                'functionalUnitFlowProperties',
              ]}
              label={
                <FormattedMessage
                  id='pages.process.view.processInformation.functionalUnitFlowProperties'
                  defaultMessage='Quantitative product or process properties'
                />
              }
            />
          </Card>
        </Card>
        <br />
        <Form.Item
          label={
            <FormattedMessage
              id='pages.process.view.processInformation.identifierOfSubDataSet'
              defaultMessage='Identifier of sub-data set'
            />
          }
          name={['processInformation', 'dataSetInformation', 'identifierOfSubDataSet']}
        >
          <Input />
        </Form.Item>
        <Card
          data-testid='process-synonyms-card'
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.processInformation.synonyms'
              defaultMessage='Synonyms'
            />
          }
        >
          <LangTextItemForm
            name={['processInformation', 'dataSetInformation', 'common:synonyms']}
            label={
              <FormattedMessage
                id='pages.process.view.processInformation.synonyms'
                defaultMessage='Synonyms'
              />
            }
          />
        </Card>
        <br />
        <LevelTextItemForm
          name={[
            'processInformation',
            'dataSetInformation',
            'classificationInformation',
            'common:classification',
            'common:class',
          ]}
          formRef={formRef}
          lang={lang}
          dataType={'Process'}
          onData={onData}
          showRules={showRules}
          rules={
            showRules
              ? getRules(
                  schema['processDataSet']['processInformation']['dataSetInformation'][
                    'classificationInformation'
                  ]['common:classification']['common:class'][0]['@classId']['rules'],
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
                  id='pages.process.view.processInformation.generalComment'
                  defaultMessage='General comment on data set'
                />
              }
              showError={generalCommentError}
            />
          }
        >
          <LangTextItemForm
            name={['processInformation', 'dataSetInformation', 'common:generalComment']}
            label={
              <FormattedMessage
                id='pages.process.view.processInformation.generalComment'
                defaultMessage='General comment on data set'
              />
            }
            setRuleErrorState={setGeneralCommentError}
            autoExpandRequired={schema['processDataSet']['processInformation'][
              'dataSetInformation'
            ]['common:generalComment']['rules'].some((rule) => rule.required)}
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['processInformation']['dataSetInformation'][
                      'common:generalComment'
                    ]['rules'],
                  )
                : []
            }
          />
        </Card>

        <SourceSelectForm
          name={['processInformation', 'dataSetInformation', 'referenceToExternalDocumentation']}
          label={
            <FormattedMessage
              id='pages.process.view.processInformation.referenceToExternalDocumentation'
              defaultMessage='Data set LCA report, background info'
            />
          }
          lang={lang}
          formRef={formRef}
          onData={onData}
        />

        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.processInformation.time'
              defaultMessage='Time representativeness'
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
                    id='pages.process.view.processInformation.referenceYear'
                    defaultMessage='Reference year'
                  />
                }
              />
            }
            name={['processInformation', 'time', 'common:referenceYear']}
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['processInformation']['time']['common:referenceYear'][
                      'rules'
                    ],
                  )
                : []
            }
          >
            <InputNumber min={1000} max={9999} precision={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={
              <FormattedMessage
                id='pages.process.view.processInformation.dataSetValidUntil'
                defaultMessage='Data set valid until:'
              />
            }
            name={['processInformation', 'time', 'common:dataSetValidUntil']}
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['processInformation']['time'][
                      'common:dataSetValidUntil'
                    ]['rules'],
                  )
                : []
            }
          >
            <InputNumber min={1000} max={9999} precision={0} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.processInformation.timeRepresentativenessDescription'
              defaultMessage='Time representativeness description'
            />
          </Divider>
          <LangTextItemForm
            name={['processInformation', 'time', 'common:timeRepresentativenessDescription']}
            label={
              <FormattedMessage
                id='pages.process.view.processInformation.timeRepresentativenessDescription'
                defaultMessage='Time representativeness description'
              />
            }
          />
        </Card>

        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.processInformation.locationOfOperationSupplyOrProduction'
              defaultMessage='Location'
            />
          }
        >
          <LocationTextItemForm
            label={
              <RequiredMark
                showError={false}
                label={
                  <FormattedMessage
                    id='pages.process.view.processInformation.location'
                    defaultMessage='Location'
                  />
                }
              />
            }
            name={[
              'processInformation',
              'geography',
              'locationOfOperationSupplyOrProduction',
              '@location',
            ]}
            lang={lang}
            onData={onData}
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['processInformation']['geography'][
                      'locationOfOperationSupplyOrProduction'
                    ]['@location']['rules'],
                  )
                : []
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.processInformation.descriptionOfRestrictions'
              defaultMessage='Geographical representativeness description'
            />
          </Divider>
          <LangTextItemForm
            name={[
              'processInformation',
              'geography',
              'locationOfOperationSupplyOrProduction',
              'descriptionOfRestrictions',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.processInformation.descriptionOfRestrictions'
                defaultMessage='Geographical representativeness description'
              />
            }
          />
        </Card>

        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.processInformation.subLocationOfOperationSupplyOrProduction'
              defaultMessage='Sub-location(s)'
            />
          }
        >
          <TidasRepeatedField
            name={['processInformation', 'geography', 'subLocationOfOperationSupplyOrProduction']}
            onChange={onData}
          >
            {(itemPath) => (
              <>
                <LocationTextItemForm
                  label={
                    <FormattedMessage
                      id='pages.process.view.processInformation.subLocationOfOperationSupplyOrProduction'
                      defaultMessage='Sub-location(s)'
                    />
                  }
                  name={[...itemPath, '@subLocation']}
                  lang={lang}
                  onData={onData}
                />
                <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
                  <FormattedMessage
                    id='pages.process.view.processInformation.descriptionOfRestrictions'
                    defaultMessage='Geographical representativeness description'
                  />
                </Divider>
                <LangTextItemForm
                  name={[...itemPath, 'descriptionOfRestrictions']}
                  label={
                    <FormattedMessage
                      id='pages.process.view.processInformation.descriptionOfRestrictions'
                      defaultMessage='Geographical representativeness description'
                    />
                  }
                />
              </>
            )}
          </TidasRepeatedField>
        </Card>

        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.processInformation.technology'
              defaultMessage='Technological representativeness'
            />
          }
        >
          <Divider titlePlacement='start' styles={{ content: { flexShrink: 0, margin: 0 } }} plain>
            <RequiredMark
              label={
                <FormattedMessage
                  id='pages.process.view.processInformation.technologyDescriptionAndIncludedProcesses'
                  defaultMessage='Technology description including background system'
                />
              }
              showError={technologyDescriptionAndIncludedProcessesError}
            />
          </Divider>
          <LangTextItemForm
            name={['processInformation', 'technology', 'technologyDescriptionAndIncludedProcesses']}
            label={
              <FormattedMessage
                id='pages.process.view.processInformation.technologyDescriptionAndIncludedProcesses'
                defaultMessage='Technology description including background system'
              />
            }
            autoExpandRequired={schema['processDataSet']['processInformation']['technology'][
              'technologyDescriptionAndIncludedProcesses'
            ]['rules'].some((rule) => rule.required)}
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['processInformation']['technology'][
                      'technologyDescriptionAndIncludedProcesses'
                    ]['rules'],
                  )
                : []
            }
            setRuleErrorState={setTechnologyDescriptionAndIncludedProcessesError}
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.processInformation.technologicalApplicability'
              defaultMessage='Technical purpose of product or process'
            />
          </Divider>
          <LangTextItemForm
            name={['processInformation', 'technology', 'technologicalApplicability']}
            label={
              <FormattedMessage
                id='pages.process.view.processInformation.technologicalApplicability'
                defaultMessage='Technical purpose of product or process'
              />
            }
          />
          <SourceSelectForm
            name={['processInformation', 'technology', 'referenceToTechnologyPictogramme']}
            label={
              <FormattedMessage
                id='pages.process.view.processInformation.referenceToTechnologyPictogramme'
                defaultMessage='Technology pictogram'
              />
            }
            lang={lang}
            formRef={formRef}
            onData={onData}
          />
          <br />
          <SourceSelectForm
            name={[
              'processInformation',
              'technology',
              'referenceToTechnologyFlowDiagrammOrPicture',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.processInformation.referenceToTechnologyFlowDiagrammOrPicture'
                defaultMessage='Flow diagram(s) or picture(s)'
              />
            }
            lang={lang}
            formRef={formRef}
            onData={onData}
          />
        </Card>

        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.processInformation.modelDescription'
              defaultMessage='Model description'
            />
          }
        >
          <LangTextItemForm
            name={['processInformation', 'mathematicalRelations', 'modelDescription']}
            label={
              <FormattedMessage
                id='pages.process.view.processInformation.modelDescription'
                defaultMessage='Model description'
              />
            }
          />
        </Card>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.processInformation.variableParameter'
              defaultMessage='Variable / parameter'
            />
          }
        >
          <TidasRepeatedField
            name={['processInformation', 'mathematicalRelations', 'variableParameter']}
            onChange={onData}
          >
            {(itemPath) => (
              <>
                <Form.Item
                  label={
                    <FormattedMessage
                      id='pages.process.view.processInformation.variableParameter.name'
                      defaultMessage='Name of variable'
                    />
                  }
                  name={[...itemPath, '@name']}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label={
                    <FormattedMessage
                      id='pages.process.view.processInformation.variableParameter.formula'
                      defaultMessage='Formula'
                    />
                  }
                  name={[...itemPath, 'formula']}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label={
                    <FormattedMessage
                      id='pages.process.view.processInformation.variableParameter.meanValue'
                      defaultMessage='Mean value'
                    />
                  }
                  name={[...itemPath, 'meanValue']}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label={
                    <FormattedMessage
                      id='pages.process.view.processInformation.variableParameter.minimumValue'
                      defaultMessage='Minimum value'
                    />
                  }
                  name={[...itemPath, 'minimumValue']}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label={
                    <FormattedMessage
                      id='pages.process.view.processInformation.variableParameter.maximumValue'
                      defaultMessage='Maximum value'
                    />
                  }
                  name={[...itemPath, 'maximumValue']}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label={
                    <FormattedMessage
                      id='pages.process.view.processInformation.variableParameter.uncertaintyDistributionType'
                      defaultMessage='Uncertainty distribution type'
                    />
                  }
                  name={[...itemPath, 'uncertaintyDistributionType']}
                >
                  <Select options={uncertaintyDistributionTypeOptions} />
                </Form.Item>
                <Form.Item
                  label={
                    <FormattedMessage
                      id='pages.process.view.processInformation.variableParameter.relativeStandardDeviation95In'
                      defaultMessage='Relative standard deviation (95%) in %'
                    />
                  }
                  name={[...itemPath, 'relativeStandardDeviation95In']}
                >
                  <Input />
                </Form.Item>
                <Card
                  size='small'
                  title={
                    <FormattedMessage
                      id='pages.process.view.processInformation.variableParameter.comment'
                      defaultMessage='Comment, units, defaults'
                    />
                  }
                >
                  <LangTextItemForm
                    name={[...itemPath, 'comment']}
                    label={
                      <FormattedMessage
                        id='pages.process.view.processInformation.variableParameter.comment'
                        defaultMessage='Comment, units, defaults'
                      />
                    }
                  />
                </Card>
              </>
            )}
          </TidasRepeatedField>
        </Card>
      </Space>
    ),
    modellingAndValidation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.lCIMethodAndAllocation'
              defaultMessage='LCI method and allocation'
            />
          }
        >
          <Form.Item
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.typeOfDataSet'
                defaultMessage='Dataset type'
              />
            }
            required
            name={['modellingAndValidation', 'LCIMethodAndAllocation', 'typeOfDataSet']}
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['modellingAndValidation']['LCIMethodAndAllocation'][
                      'typeOfDataSet'
                    ]['rules'],
                  )
                : []
            }
          >
            <Select options={processtypeOfDataSetOptions} />
          </Form.Item>
          <Form.Item
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.lCIMethodPrinciple'
                defaultMessage='LCI method principle'
              />
            }
            name={['modellingAndValidation', 'LCIMethodAndAllocation', 'LCIMethodPrinciple']}
          >
            <Select options={LCIMethodPrincipleOptions} />
          </Form.Item>
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.deviationsFromLCIMethodPrinciple'
              defaultMessage='Deviation from LCI method principle / explanations'
            />
          </Divider>
          <LangTextItemForm
            name={[
              'modellingAndValidation',
              'LCIMethodAndAllocation',
              'deviationsFromLCIMethodPrinciple',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.deviationsFromLCIMethodPrinciple'
                defaultMessage='Deviation from LCI method principle / explanations'
              />
            }
          />
          <Form.Item
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.lCIMethodApproaches'
                defaultMessage='LCI method approaches'
              />
            }
            name={['modellingAndValidation', 'LCIMethodAndAllocation', 'LCIMethodApproaches']}
            getValueProps={(value) => ({
              value: toTidasMultiSelectValue(value),
            })}
          >
            <Select mode='multiple' options={LCIMethodApproachOptions} />
          </Form.Item>
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.deviationsFromLCIMethodApproaches'
              defaultMessage='Deviations from LCI method approaches / explanations'
            />
          </Divider>
          <LangTextItemForm
            name={[
              'modellingAndValidation',
              'LCIMethodAndAllocation',
              'deviationsFromLCIMethodApproaches',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.deviationsFromLCIMethodApproaches'
                defaultMessage='Deviations from LCI method approaches / explanations'
              />
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.modellingConstants'
              defaultMessage='Modelling constants'
            />
          </Divider>
          <LangTextItemForm
            name={['modellingAndValidation', 'LCIMethodAndAllocation', 'modellingConstants']}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.modellingConstants'
                defaultMessage='Modelling constants'
              />
            }
          />

          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.deviationsFromModellingConstants'
              defaultMessage='Deviation from modelling constants / explanations'
            />
          </Divider>
          <LangTextItemForm
            name={[
              'modellingAndValidation',
              'LCIMethodAndAllocation',
              'deviationsFromModellingConstants',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.deviationsFromModellingConstants'
                defaultMessage='Deviation from modelling constants / explanations'
              />
            }
          />
          <SourceSelectForm
            name={[
              'modellingAndValidation',
              'LCIMethodAndAllocation',
              'referenceToLCAMethodDetails',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.referenceToLCAMethodDetails'
                defaultMessage='LCA methodology report'
              />
            }
            lang={lang}
            formRef={formRef}
            onData={onData}
          />
        </Card>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.dataSourcesTreatmentAndRepresentativeness'
              defaultMessage='Data sources, treatment, and representativeness'
            />
          }
        >
          <Divider titlePlacement='start' styles={{ content: { flexShrink: 0, margin: 0 } }} plain>
            <RequiredMark
              label={
                <FormattedMessage
                  id='pages.process.view.modellingAndValidation.dataCutOffAndCompletenessPrinciples'
                  defaultMessage='Data cut-off and completeness principles'
                />
              }
              showError={dataCutOffAndCompletenessPrinciplesError}
            />
          </Divider>
          <LangTextItemForm
            name={[
              'modellingAndValidation',
              'dataSourcesTreatmentAndRepresentativeness',
              'dataCutOffAndCompletenessPrinciples',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.dataCutOffAndCompletenessPrinciples'
                defaultMessage='Data cut-off and completeness principles'
              />
            }
            autoExpandRequired={schema['processDataSet']['modellingAndValidation'][
              'dataSourcesTreatmentAndRepresentativeness'
            ]['dataCutOffAndCompletenessPrinciples']['rules'].some((rule) => rule.required)}
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['modellingAndValidation'][
                      'dataSourcesTreatmentAndRepresentativeness'
                    ]['dataCutOffAndCompletenessPrinciples']['rules'],
                  )
                : []
            }
            setRuleErrorState={setDataCutOffAndCompletenessPrinciplesError}
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.deviationsFromCutOffAndCompletenessPrinciples'
              defaultMessage='Deviation from data cut-off and completeness principles / explanations'
            />
          </Divider>
          <LangTextItemForm
            name={[
              'modellingAndValidation',
              'dataSourcesTreatmentAndRepresentativeness',
              'deviationsFromCutOffAndCompletenessPrinciples',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.deviationsFromCutOffAndCompletenessPrinciples'
                defaultMessage='Deviation from data cut-off and completeness principles / explanations'
              />
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.dataSelectionAndCombinationPrinciples'
              defaultMessage='Data selection and combination principles'
            />
          </Divider>
          <LangTextItemForm
            name={[
              'modellingAndValidation',
              'dataSourcesTreatmentAndRepresentativeness',
              'dataSelectionAndCombinationPrinciples',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.dataSelectionAndCombinationPrinciples'
                defaultMessage='Data selection and combination principles'
              />
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.deviationsFromSelectionAndCombinationPrinciples'
              defaultMessage='Deviation from data selection and combination principles / explanations'
            />
          </Divider>
          <LangTextItemForm
            name={[
              'modellingAndValidation',
              'dataSourcesTreatmentAndRepresentativeness',
              'deviationsFromSelectionAndCombinationPrinciples',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.deviationsFromSelectionAndCombinationPrinciples'
                defaultMessage='Deviation from data selection and combination principles / explanations'
              />
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.dataTreatmentAndExtrapolationsPrinciples'
              defaultMessage='Data treatment and extrapolations principles'
            />
          </Divider>
          <LangTextItemForm
            name={[
              'modellingAndValidation',
              'dataSourcesTreatmentAndRepresentativeness',
              'dataTreatmentAndExtrapolationsPrinciples',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.dataTreatmentAndExtrapolationsPrinciples'
                defaultMessage='Data treatment and extrapolations principles'
              />
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.deviationsFromTreatmentAndExtrapolationPrinciples'
              defaultMessage='Deviation from data treatment and extrapolations principles / explanations'
            />
          </Divider>
          <LangTextItemForm
            name={[
              'modellingAndValidation',
              'dataSourcesTreatmentAndRepresentativeness',
              'deviationsFromTreatmentAndExtrapolationPrinciples',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.deviationsFromTreatmentAndExtrapolationPrinciples'
                defaultMessage='Deviation from data treatment and extrapolations principles / explanations'
              />
            }
          />
          <SourceSelectForm
            name={[
              'modellingAndValidation',
              'dataSourcesTreatmentAndRepresentativeness',
              'referenceToDataHandlingPrinciples',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.referenceToDataHandlingPrinciples'
                defaultMessage='Data handling report'
              />
            }
            lang={lang}
            formRef={formRef}
            onData={onData}
          />
          <br />
          <Form.List
            name={[
              'modellingAndValidation',
              'dataSourcesTreatmentAndRepresentativeness',
              'referenceToDataSource',
            ]}
            initialValue={[{}]}
            rules={
              showRules
                ? [
                    {
                      validator: async (_, value) => {
                        if (!value || value.length < 1) {
                          throw new Error();
                        }
                      },
                    },
                  ]
                : []
            }
          >
            {(fields, { add, remove }) => (
              <Space orientation='vertical' style={{ width: '100%' }}>
                {fields.map((field) => (
                  <div key={field.key} style={{ position: 'relative', marginBottom: 16 }}>
                    <SourceSelectForm
                      parentName={[
                        'modellingAndValidation',
                        'dataSourcesTreatmentAndRepresentativeness',
                        'referenceToDataSource',
                      ]}
                      name={[field.name]}
                      showRequiredLabel
                      label={
                        <FormattedMessage
                          id='pages.process.view.modellingAndValidation.referenceToDataSource'
                          defaultMessage='Data source(s) used for this data set'
                        />
                      }
                      lang={lang}
                      formRef={formRef}
                      onData={onData}
                      rules={
                        showRules
                          ? getRules(
                              schema['processDataSet']['modellingAndValidation'][
                                'dataSourcesTreatmentAndRepresentativeness'
                              ]['referenceToDataSource']['@refObjectId']['rules'],
                            )
                          : []
                      }
                    />
                    {fields.length > 1 && (
                      <Button
                        type='text'
                        shape='circle'
                        icon={<CloseOutlined />}
                        onClick={() => {
                          remove(field.name);
                          onData();
                        }}
                        style={{ position: 'absolute', right: 8, top: 8 }}
                      />
                    )}
                  </div>
                ))}
                <Form.Item colon={false} style={{ margin: '8px 0 24px 0' }}>
                  <Button
                    type='dashed'
                    block
                    onClick={() => {
                      add({});
                      onData();
                    }}
                    style={{ width: '100%' }}
                  >
                    + <FormattedMessage id='pages.button.add' defaultMessage='Add' />{' '}
                    <FormattedMessage
                      id='pages.process.view.modellingAndValidation.referenceToDataSource'
                      defaultMessage='Data source(s) used for this data set'
                    />{' '}
                    <FormattedMessage id='pages.button.item.label' defaultMessage='Item' />
                  </Button>
                </Form.Item>
              </Space>
            )}
          </Form.List>
          <br />
          <Form.Item
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.percentageSupplyOrProductionCovered'
                defaultMessage='Percentage supply or production covered'
              />
            }
            name={[
              'modellingAndValidation',
              'dataSourcesTreatmentAndRepresentativeness',
              'percentageSupplyOrProductionCovered',
            ]}
          >
            <Input />
          </Form.Item>
          <Divider titlePlacement='start' styles={{ content: { flexShrink: 0, margin: 0 } }} plain>
            <RequiredMark
              label={
                <FormattedMessage
                  id='pages.process.view.modellingAndValidation.annualSupplyOrProductionVolume'
                  defaultMessage='Annual supply or production volume'
                />
              }
              showError={false}
            />
          </Divider>
          <AnnualSupplyOrProductionVolumeForm
            name={[
              'modellingAndValidation',
              'dataSourcesTreatmentAndRepresentativeness',
              'annualSupplyOrProductionVolume',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.annualSupplyOrProductionVolume'
                defaultMessage='Annual supply or production volume'
              />
            }
            lang={lang}
            formRef={formRef}
            onData={onData}
            exchangeDataSource={exchangeDataSource}
            contextErrorMessage={annualSupplyVolumeReferenceContextErrorMessage}
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['modellingAndValidation'][
                      'dataSourcesTreatmentAndRepresentativeness'
                    ]['annualSupplyOrProductionVolume']['rules'],
                  )
                : []
            }
          />

          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.samplingProcedure'
              defaultMessage='Sampling procedure'
            />
          </Divider>
          <LangTextItemForm
            name={[
              'modellingAndValidation',
              'dataSourcesTreatmentAndRepresentativeness',
              'samplingProcedure',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.samplingProcedure'
                defaultMessage='Sampling procedure'
              />
            }
          />

          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.dataCollectionPeriod'
              defaultMessage='Data collection period'
            />
          </Divider>
          <LangTextItemForm
            name={[
              'modellingAndValidation',
              'dataSourcesTreatmentAndRepresentativeness',
              'dataCollectionPeriod',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.dataCollectionPeriod'
                defaultMessage='Data collection period'
              />
            }
          />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.uncertaintyAdjustments'
              defaultMessage='Uncertainty adjustments'
            />
          </Divider>
          <LangTextItemForm
            name={[
              'modellingAndValidation',
              'dataSourcesTreatmentAndRepresentativeness',
              'uncertaintyAdjustments',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.uncertaintyAdjustments'
                defaultMessage='Uncertainty adjustments'
              />
            }
          />

          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.useAdviceForDataSet'
              defaultMessage='Use advice for data set'
            />
          </Divider>
          <LangTextItemForm
            name={[
              'modellingAndValidation',
              'dataSourcesTreatmentAndRepresentativeness',
              'useAdviceForDataSet',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.useAdviceForDataSet'
                defaultMessage='Use advice for data set'
              />
            }
          />
        </Card>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.completeness'
              defaultMessage='Completeness'
            />
          }
        >
          <Form.Item
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.completeness.completenessProductModel'
                defaultMessage='Completeness product model'
              />
            }
            name={['modellingAndValidation', 'completeness', 'completenessProductModel']}
          >
            <Select options={completenessProductModelOptions} />
          </Form.Item>
          <Card
            size='small'
            title={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.completeness.completenessElementaryFlows'
                defaultMessage='Completeness elementary flows, per topic'
              />
            }
          >
            <TidasRepeatedField
              name={['modellingAndValidation', 'completeness', 'completenessElementaryFlows']}
              keepFirst
              onChange={onData}
            >
              {(itemPath) => (
                <>
                  <Form.Item
                    label={
                      <FormattedMessage
                        id='pages.process.view.modellingAndValidation.completeness.completenessElementaryFlows.type'
                        defaultMessage='completeness type'
                      />
                    }
                    name={[...itemPath, '@type']}
                  >
                    <Select options={completenessElementaryFlowsTypeOptions} />
                  </Form.Item>
                  <Form.Item
                    label={
                      <FormattedMessage
                        id='pages.process.view.modellingAndValidation.completeness.completenessElementaryFlows.value'
                        defaultMessage='value'
                      />
                    }
                    name={[...itemPath, '@value']}
                  >
                    <Select options={completenessElementaryFlowsValueOptions} />
                  </Form.Item>
                </>
              )}
            </TidasRepeatedField>
          </Card>
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.completeness.completenessOtherProblemField'
              defaultMessage='Completeness other problem field(s)'
            />
          </Divider>
          <LangTextItemForm
            name={['modellingAndValidation', 'completeness', 'completenessOtherProblemField']}
            label={
              <FormattedMessage
                id='pages.process.view.modellingAndValidation.completeness.completenessOtherProblemField'
                defaultMessage='Completeness other problem field(s)'
              />
            }
          />
        </Card>

        {/* <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.process.view.modellingAndValidation.completeness'
            defaultMessage='Completeness'
          />
        </Divider>
        <LangTextItemForm
          name={['modellingAndValidation', 'completeness']}
          label={
            <FormattedMessage
              id='pages.process.view.modellingAndValidation.completeness'
              defaultMessage='Completeness'
            />
          }
        /> */}
      </Space>
    ),
    administrativeInformation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
        <ContactSelectForm
          name={[
            'administrativeInformation',
            'common:commissionerAndGoal',
            'common:referenceToCommissioner',
          ]}
          showRequiredLabel
          label={
            <FormattedMessage
              id='pages.process.view.administrativeInformation.referenceToCommissioner'
              defaultMessage='Commissioner of data set'
            />
          }
          lang={lang}
          formRef={formRef}
          onData={onData}
          rules={
            showRules
              ? getRules(
                  schema['processDataSet']['administrativeInformation'][
                    'common:commissionerAndGoal'
                  ]['common:referenceToCommissioner']['@refObjectId']['rules'],
                )
              : []
          }
        />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.administrativeInformation.project'
              defaultMessage='Project'
            />
          }
        >
          <LangTextItemForm
            name={['administrativeInformation', 'common:commissionerAndGoal', 'common:project']}
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.project'
                defaultMessage='Project'
              />
            }
          />
        </Card>
        <Card
          size='small'
          title={
            <RequiredMark
              label={
                <FormattedMessage
                  id='pages.process.view.administrativeInformation.intendedApplications'
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
                id='pages.process.view.administrativeInformation.intendedApplications'
                defaultMessage='Intended applications'
              />
            }
            setRuleErrorState={setIntendedApplicationsError}
            autoExpandRequired={schema['processDataSet']['administrativeInformation'][
              'common:commissionerAndGoal'
            ]['common:intendedApplications']['rules'].some((rule) => rule.required)}
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['administrativeInformation'][
                      'common:commissionerAndGoal'
                    ]['common:intendedApplications']['rules'],
                  )
                : []
            }
          />
        </Card>

        <ContactSelectForm
          name={[
            'administrativeInformation',
            'dataGenerator',
            'common:referenceToPersonOrEntityGeneratingTheDataSet',
          ]}
          label={
            <FormattedMessage
              id='pages.process.view.administrativeInformation.RreferenceToPersonOrEntityGeneratingTheDataSet'
              defaultMessage='Data set generator / modeller'
            />
          }
          lang={lang}
          formRef={formRef}
          onData={onData}
        />

        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.process.view.administrativeInformation.dataEntryBy'
              defaultMessage='Data entry by'
            />
          }
        >
          <Form.Item
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.timeStamp'
                defaultMessage='Time stamp (last saved)'
              />
            }
            name={['administrativeInformation', 'dataEntryBy', 'common:timeStamp']}
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['administrativeInformation']['dataEntryBy'][
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
            lang={lang}
            formRef={formRef}
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToDataSetFormat'
                defaultMessage='Data set format(s)'
              />
            }
            name={['administrativeInformation', 'dataEntryBy', 'common:referenceToDataSetFormat']}
            onData={onData}
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['administrativeInformation']['dataEntryBy'][
                      'common:referenceToDataSetFormat'
                    ]['@refObjectId']['rules'],
                  )
                : []
            }
          />
          <br />
          <SourceSelectForm
            lang={lang}
            formRef={formRef}
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToConvertedOriginalDataSetFrom'
                defaultMessage='Converted original data set from:'
              />
            }
            name={[
              'administrativeInformation',
              'dataEntryBy',
              'common:referenceToConvertedOriginalDataSetFrom',
            ]}
            onData={onData}
          />
          <br />
          <ContactSelectForm
            lang={lang}
            formRef={formRef}
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToPersonOrEntityEnteringTheData'
                defaultMessage='Data entry by:'
              />
            }
            name={[
              'administrativeInformation',
              'dataEntryBy',
              'common:referenceToPersonOrEntityEnteringTheData',
            ]}
            showRequiredLabel
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['administrativeInformation']['dataEntryBy'][
                      'common:referenceToPersonOrEntityEnteringTheData'
                    ]['@refObjectId']['rules'],
                  )
                : []
            }
            onData={onData}
          />
          <br />
          <SourceSelectForm
            lang={lang}
            formRef={formRef}
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToDataSetUseApproval'
                defaultMessage='Official approval of data set by producer/operator:'
              />
            }
            name={[
              'administrativeInformation',
              'dataEntryBy',
              'common:referenceToDataSetUseApproval',
            ]}
            onData={onData}
          />
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
          <Form.Item
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.dateOfLastRevision'
                defaultMessage='Date of last revision'
              />
            }
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:dateOfLastRevision',
            ]}
          >
            <Input />
          </Form.Item>

          <DatasetCreateVersionFormItem
            createVersion={formType === 'createVersion'}
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.dataSetVersion'
                defaultMessage='Data set version'
              />
            }
            name={['administrativeInformation', 'publicationAndOwnership', 'common:dataSetVersion']}
            rules={getRules(
              schema['processDataSet']['administrativeInformation']['publicationAndOwnership'][
                'common:dataSetVersion'
              ]['rules'],
            )}
          >
            <Input disabled={formType === 'edit' || actionFrom === 'modelResult'} />
          </DatasetCreateVersionFormItem>

          <Form.Item
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.permanentDataSetURI'
                defaultMessage='Permanent data set URI'
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
                    schema['processDataSet']['administrativeInformation'][
                      'publicationAndOwnership'
                    ]['common:permanentDataSetURI']['rules'],
                  )
                : []
            }
          >
            <Input disabled={true} />
          </Form.Item>

          <Form.Item
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.workflowAndPublicationStatus'
                defaultMessage='Workflow and publication status'
              />
            }
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:workflowAndPublicationStatus',
            ]}
          >
            <Select options={workflowAndPublicationStatusOptions} />
          </Form.Item>

          <SourceSelectForm
            lang={lang}
            formRef={formRef}
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToUnchangedRepublication'
                defaultMessage='Unchanged re-publication of:'
              />
            }
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:referenceToUnchangedRepublication',
            ]}
            onData={onData}
          />
          <br />
          <ContactSelectForm
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:referenceToRegistrationAuthority',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToRegistrationAuthority'
                defaultMessage='Registration authority'
              />
            }
            lang={lang}
            formRef={formRef}
            onData={onData}
          />
          <br />
          <Form.Item
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.registrationNumber'
                defaultMessage='Registration number'
              />
            }
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:registrationNumber',
            ]}
          >
            <Input />
          </Form.Item>

          <ContactSelectForm
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:referenceToOwnershipOfDataSet',
            ]}
            showRequiredLabel
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToOwnershipOfDataSet'
                defaultMessage='Owner of data set'
              />
            }
            lang={lang}
            formRef={formRef}
            onData={onData}
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['administrativeInformation'][
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
                id='pages.process.view.administrativeInformation.copyright'
                defaultMessage='Copyright?'
              />
            }
            required
            name={['administrativeInformation', 'publicationAndOwnership', 'common:copyright']}
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['administrativeInformation'][
                      'publicationAndOwnership'
                    ]['common:copyright']['rules'],
                  )
                : []
            }
          >
            <Select options={copyrightOptions} />
          </Form.Item>
          <ContactSelectForm
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:referenceToEntitiesWithExclusiveAccess',
            ]}
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.referenceToEntitiesWithExclusiveAccess'
                defaultMessage='Entities or persons with exclusive access to this data set'
              />
            }
            lang={lang}
            formRef={formRef}
            onData={onData}
          />
          <br />
          <Form.Item
            label={
              <FormattedMessage
                id='pages.process.view.administrativeInformation.licenseType'
                defaultMessage='License type'
              />
            }
            required
            name={['administrativeInformation', 'publicationAndOwnership', 'common:licenseType']}
            rules={
              showRules
                ? getRules(
                    schema['processDataSet']['administrativeInformation'][
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
                id='pages.process.view.administrativeInformation.accessRestrictions'
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
                  id='pages.process.view.administrativeInformation.accessRestrictions'
                  defaultMessage='Access and use restrictions'
                />
              }
            />
          </Card>
        </Card>
      </Space>
    ),
    exchanges: (
      <>
        <AllocationBatch
          exchanges={exchangeDataSource}
          lang={lang}
          onData={onExchangeData}
          disabled={actionFrom === 'modelResult'}
        />
        {renderSdkSectionMessages('exchanges.requiredSummary')}
        {renderSdkSectionMessages('exchanges.quantitativeReferenceSummary')}
        <Collapse
          defaultActiveKey={['1']}
          items={[
            {
              key: '1',
              label: <FormattedMessage id='pages.process.exchange.input' defaultMessage='Input' />,
              children: (
                <ProTable<ProcessExchangeTable, ContentLanguageAwareTableParams>
                  actionRef={actionRefExchangeTableInput}
                  params={exchangeTableParams}
                  search={false}
                  pagination={{
                    showSizeChanger: false,
                    pageSize: 10,
                  }}
                  rowClassName={(record) => {
                    const isInRefCheck = refCheckContext?.refCheckData?.some(
                      (item: RefCheckType) =>
                        item.id === record.referenceToFlowDataSetId &&
                        item.version === record.referenceToFlowDataSetVersion,
                    );
                    const isFormComplete =
                      record.meanAmount &&
                      record.meanAmount !== '-' &&
                      record.resultingAmount &&
                      record.resultingAmount !== '-' &&
                      record.dataDerivationTypeStatus &&
                      record.dataDerivationTypeStatus !== '-';
                    const rowClasses = [];

                    if (showRules && (isInRefCheck || !isFormComplete)) {
                      rowClasses.push('error-row');
                    }

                    if (
                      (sdkExchangeRowHighlightsByExchangeId[record.dataSetInternalID] ?? [])
                        .length > 0
                    ) {
                      rowClasses.push('sdk-error-row');
                    }

                    if (
                      sdkValidationFocus?.exchangeInternalId &&
                      sdkValidationFocus.exchangeInternalId === record.dataSetInternalID
                    ) {
                      rowClasses.push('sdk-focus-row');
                    }

                    return rowClasses.join(' ').trim();
                  }}
                  className='process-exchange-table'
                  scroll={PROCESS_EXCHANGE_TABLE_SCROLL}
                  toolBarRender={() => {
                    return [
                      <ProcessExchangeCreate
                        data={exchangeDataSource}
                        disabled={actionFrom === 'modelResult'}
                        showRules={showRules}
                        key={0}
                        direction={'input'}
                        lang={lang}
                        onData={onExchangeDataCreate}
                      />,
                    ];
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
                  actionRef={actionRefExchangeTableOutput}
                  params={exchangeTableParams}
                  search={false}
                  pagination={{
                    showSizeChanger: false,
                    pageSize: 10,
                  }}
                  rowClassName={(record) => {
                    const isInRefCheck = refCheckContext?.refCheckData?.some(
                      (item: RefCheckType) =>
                        item.id === record.referenceToFlowDataSetId &&
                        item.version === record.referenceToFlowDataSetVersion,
                    );
                    const isFormComplete =
                      record.meanAmount &&
                      record.meanAmount !== '-' &&
                      record.resultingAmount &&
                      record.resultingAmount !== '-' &&
                      record.dataDerivationTypeStatus &&
                      record.dataDerivationTypeStatus !== '-';
                    const rowClasses = [];

                    if (showRules && (isInRefCheck || !isFormComplete)) {
                      rowClasses.push('error-row');
                    }

                    if (
                      (sdkExchangeRowHighlightsByExchangeId[record.dataSetInternalID] ?? [])
                        .length > 0
                    ) {
                      rowClasses.push('sdk-error-row');
                    }

                    if (
                      sdkValidationFocus?.exchangeInternalId &&
                      sdkValidationFocus.exchangeInternalId === record.dataSetInternalID
                    ) {
                      rowClasses.push('sdk-focus-row');
                    }

                    return rowClasses.join(' ').trim();
                  }}
                  className='process-exchange-table'
                  scroll={PROCESS_EXCHANGE_TABLE_SCROLL}
                  toolBarRender={() => {
                    return [
                      <ProcessExchangeCreate
                        data={exchangeDataSource}
                        disabled={actionFrom === 'modelResult'}
                        showRules={showRules}
                        key={0}
                        direction={'output'}
                        lang={lang}
                        onData={onExchangeDataCreate}
                      />,
                    ];
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
      </>
    ),
    lciaResults: (
      <ProcessLciaResultsPanel
        baseCalculationEvidence={lciaCalculationEvidence}
        baseRows={lciaResults}
        lang={lang}
        processId={processId}
        processVersion={processVersion}
      />
    ),
    validation: (
      <>
        {renderSdkSectionMessages('modellingAndValidation.validation.review')}
        <ReveiwItemForm
          type='reviewReport'
          showRules={showRules}
          name={['modellingAndValidation', 'validation', 'review']}
          lang={lang}
          formRef={formRef}
          onData={onData}
        />
      </>
    ),
    complianceDeclarations: (
      <>
        {renderSdkSectionMessages('modellingAndValidation.complianceDeclarations.compliance')}
        <ComplianceItemForm
          showRules={showRules}
          name={['modellingAndValidation', 'complianceDeclarations', 'compliance']}
          lang={lang}
          formRef={formRef}
          onData={onData}
        />
      </>
    ),
  };

  useEffect(() => {
    actionRefExchangeTableInput.current?.reload();
    actionRefExchangeTableOutput.current?.reload();
  }, [exchangeDataSource]);

  return (
    <Card
      style={{ width: '100%' }}
      tabList={tabList}
      activeTabKey={activeTabKey}
      onTabChange={onTabChange}
    >
      {tabContent[activeTabKey]}
    </Card>
  );
};
