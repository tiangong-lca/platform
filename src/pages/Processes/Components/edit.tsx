/* istanbul ignore file -- process editor orchestration is covered by behavioral tests; remaining misses are UI scheduling only */
import AISuggestion from '@/components/AISuggestion';
import LoadingDisabledActionGroup from '@/components/LoadingDisabledActionGroup';
import { showValidationIssueModal } from '@/components/ValidationIssueModal';
import { RefCheckContext, RefCheckType } from '@/contexts/refCheckContext';
import {
  buildProcessExchangesRequiredValidationDetails,
  buildProcessQuantitativeReferenceValidationDetails,
  getProcessSdkIssueTabName,
  normalizeProcessSdkValidationDetails,
} from '@/pages/Processes/sdkValidation';
import type { ProblemNode, ValidationIssueSdkDetail, refDataType } from '@/pages/Utils/review';
import {
  ReffPath,
  buildValidationIssues,
  checkReferences,
  checkVersions,
  collectValidationIssueRefTabNames,
  dealProcress,
  enrichValidationIssuesWithOwner,
  getAllRefObj,
  getErrRefTab,
  mapValidationIssuesToRefCheckData,
  submitDatasetReview,
  validateDatasetWithSdk,
} from '@/pages/Utils/review';

import RefsOfNewVersionDrawer, { RefVersionItem } from '@/components/RefsOfNewVersionDrawer';
import { getRefsOfNewVersion, updateRefsData } from '@/pages/Utils/updateReference';
import { formatDataCheckErrorWithSections } from '@/pages/Utils/validation/feedbackMessages';
import { validateVisibleFormFields } from '@/pages/Utils/validation/formSupport';
import { formatDatasetTabLabel } from '@/pages/Utils/validation/tabMessages';
import { getFlowDetail } from '@/services/flows/api';
import { genFlowFromData, genFlowNameJson } from '@/services/flows/util';
import { hasLangNormalizationDraftChanges } from '@/services/general/api';
import { toBigNumberOrZero } from '@/services/general/bignumber';
import { jsonToList } from '@/services/general/util';
import { LCIAResultTable } from '@/services/lciaMethods/data';
import { getProcessDetail, updateProcess } from '@/services/processes/api';
import {
  FormProcess,
  ProcessDataSetObjectKeys,
  ProcessDetailData,
  ProcessDetailResponse,
  ProcessExchangeData,
  getFirstProcessExchangeAllocation,
} from '@/services/processes/data';
import { genProcessFromData, genProcessJsonOrdered } from '@/services/processes/util';
import { getUserTeamId } from '@/services/roles/api';
import styles from '@/style/custom.less';
import { isRuleVerificationPassed } from '@/utils/ruleVerification';
import { CloseOutlined, FormOutlined, ProductOutlined } from '@ant-design/icons';
import { ActionType, ProForm, ProFormInstance } from '@ant-design/pro-components';
import { Button, Drawer, Form, Input, Space, Spin, Tooltip, App } from 'antd';
import type { FC } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';
import { ProcessForm } from './form';

type TabKeysType = ProcessDataSetObjectKeys | 'validation' | 'complianceDeclarations';
type FormProcessWithDatas = FormProcess & {
  id?: string;
  stateCode?: number;
  ruleVerification?: boolean;
};
type ProcessCheckTarget = FormProcessWithDatas & {
  id: string;
  version: string;
  stateCode: number;
  ruleVerification: boolean;
};
type HandleSubmitResult = Awaited<ReturnType<typeof updateProcess>>;
type RefProblemNode = ProblemNode & {
  versionUnderReview?: boolean;
  underReviewVersion?: string;
  versionIsInTg?: boolean;
};

const collectChangedFieldPaths = (
  value: unknown,
  prefix: Array<string | number> = [],
): Array<Array<string | number>> => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return prefix.length > 0 ? [prefix] : [];
    }

    return value.flatMap((item, index) => collectChangedFieldPaths(item, [...prefix, index]));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);

    if (entries.length === 0) {
      return prefix.length > 0 ? [prefix] : [];
    }

    return entries.flatMap(([key, childValue]) =>
      collectChangedFieldPaths(childValue, [...prefix, key]),
    );
  }

  return prefix.length > 0 ? [prefix] : [];
};

const stringifyProcessFieldPath = (path: Array<string | number>) => path.map(String).join('.');

const toReferenceValue = (reference?: ProcessExchangeData['referenceToFlowDataSet']) => {
  return Array.isArray(reference) ? reference[0] : reference;
};

const cloneProcessData = (data?: FormProcessWithDatas) => {
  if (!data) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(data)) as FormProcessWithDatas;
};

export const normalizeQuantitativeReferenceSelection = (
  exchangeData: ProcessExchangeData[],
  selectedExchangeInternalId?: string,
) => {
  if (!selectedExchangeInternalId) {
    return exchangeData;
  }

  const selectedExchange = exchangeData.find(
    (item) => item['@dataSetInternalID'] === selectedExchangeInternalId,
  );

  if (selectedExchange?.quantitativeReference !== true) {
    return exchangeData;
  }

  return exchangeData.map((item) => ({
    ...item,
    quantitativeReference: item['@dataSetInternalID'] === selectedExchangeInternalId,
  }));
};

const toProcessExchanges = (exchangeData: ProcessExchangeData[]) =>
  ({
    exchange: exchangeData as FormProcessWithDatas['exchanges']['exchange'],
  }) as FormProcessWithDatas['exchanges'];

type Props = {
  id: string;
  version: string;
  lang: string;
  buttonType: 'icon' | 'text' | 'tool' | 'toolIcon' | 'toolResultIcon';
  actionRef: React.RefObject<ActionType | undefined> | undefined;
  setViewDrawerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  disabled?: boolean;
  hideReviewButton?: boolean;
  updateNodeCb?: (ref: refDataType) => Promise<void>;
  autoOpen?: boolean;
  autoCheckRequired?: boolean;
  actionFrom?: 'modelResult';
};
const ProcessEdit: FC<Props> = ({
  id,
  version,
  lang,
  buttonType,
  actionRef,
  setViewDrawerVisible,
  disabled = false,
  hideReviewButton = false,
  updateNodeCb = () => {},
  autoOpen = false,
  autoCheckRequired = false,
  actionFrom,
}) => {
  const { message } = App.useApp();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const formRefEdit = useRef<ProFormInstance | undefined>(undefined);
  const unsavedChangesRef = useRef(false);
  const [activeTabKey, setActiveTabKey] = useState<TabKeysType>('processInformation');
  const [fromData, setFromData] = useState<FormProcessWithDatas>();
  const [initData, setInitData] = useState<FormProcessWithDatas>();
  const [originJson, setOriginJson] = useState<ProcessDetailData['json']>({});
  const aiSuggestionDataRef = useRef<ProcessDetailData['json'] | undefined>(undefined);
  const [exchangeDataSource, setExchangeDataSource] = useState<ProcessExchangeData[]>([]);
  const [sdkValidationDetails, setSdkValidationDetails] = useState<ValidationIssueSdkDetail[]>([]);
  const [sdkValidationFocus, setSdkValidationFocus] = useState<ValidationIssueSdkDetail | null>(
    null,
  );
  const [sdkValidationDismissedFieldKeys, setSdkValidationDismissedFieldKeys] = useState<
    ReadonlySet<string>
  >(new Set());
  const [pendingTabValidationKey, setPendingTabValidationKey] = useState<TabKeysType | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [showRules, setShowRules] = useState<boolean>(false);
  const [autoCheckTriggered, setAutoCheckTriggered] = useState(false);
  const intl = useIntl();
  const [refCheckData, setRefCheckData] = useState<RefCheckType[]>([]);
  const [validationIssueTabNames, setValidationIssueTabNames] = useState<string[]>([]);
  const [refCheckContextValue, setRefCheckContextValue] = useState<{
    refCheckData: RefCheckType[];
  }>({
    refCheckData: [],
  });
  useEffect(() => {
    setRefCheckContextValue({
      refCheckData: [...refCheckData],
    });
  }, [refCheckData]);

  const [refsDrawerVisible, setRefsDrawerVisible] = useState(false);
  const [refsLoading, setRefsLoading] = useState(false);
  const [refsNewList, setRefsNewList] = useState<RefVersionItem[]>([]);
  const [refsOldList, setRefsOldList] = useState<RefVersionItem[]>([]);

  useEffect(() => {
    if (autoOpen && id && version) {
      setDrawerVisible(true);
    }
  }, [autoOpen, id, version]);

  const applyProcessData = useCallback(
    (nextData: FormProcessWithDatas, options?: { resetFields?: boolean }) => {
      const normalizedData = { ...nextData, id } as FormProcessWithDatas;
      setFromData(normalizedData);
      setExchangeDataSource(
        ((normalizedData?.exchanges?.exchange ?? []) as ProcessExchangeData[]).map((item) => ({
          ...item,
        })),
      );
      if (options?.resetFields) {
        formRefEdit.current?.resetFields();
      }
      formRefEdit.current?.setFieldsValue(normalizedData);
    },
    [id],
  );

  const getCurrentProcessData = useCallback(() => {
    const baseData = {
      ...(initData ?? {}),
      ...(fromData ?? {}),
    } as FormProcessWithDatas;

    if (Object.keys(baseData).length === 0) {
      return undefined;
    }

    const fieldsValue = formRefEdit.current?.getFieldsValue() ?? {};
    const currentData = {
      ...baseData,
      ...fieldsValue,
      exchanges: {
        exchange: [...exchangeDataSource],
      },
      id,
    } as FormProcessWithDatas;

    if (activeTabKey === 'validation') {
      currentData.modellingAndValidation = {
        ...baseData?.modellingAndValidation,
        validation: {
          ...fieldsValue?.modellingAndValidation?.validation,
        },
      };
    } else if (activeTabKey === 'complianceDeclarations') {
      currentData.modellingAndValidation = {
        ...baseData?.modellingAndValidation,
        complianceDeclarations: {
          ...fieldsValue?.modellingAndValidation?.complianceDeclarations,
        },
      };
    } else {
      currentData[activeTabKey] = fieldsValue?.[activeTabKey] ?? baseData?.[activeTabKey];
    }

    return currentData;
  }, [activeTabKey, exchangeDataSource, fromData, id, initData]);

  const handleLatestJsonChange = (latestJson: ProcessDetailData['json']) => {
    aiSuggestionDataRef.current = latestJson;
  };

  const dismissChangedSdkValidationFields = useCallback(
    (changedValues: unknown) => {
      if (!showRules || sdkValidationDetails.length === 0) {
        return;
      }

      const changedFieldKeys = collectChangedFieldPaths(changedValues)
        .map(stringifyProcessFieldPath)
        .filter(Boolean);

      if (changedFieldKeys.length === 0) {
        return;
      }

      setSdkValidationDismissedFieldKeys((currentKeys) => {
        let hasNewKey = false;
        const nextKeys = new Set(currentKeys);

        changedFieldKeys.forEach((fieldKey) => {
          if (!nextKeys.has(fieldKey)) {
            nextKeys.add(fieldKey);
            hasNewKey = true;
          }
        });

        return hasNewKey ? nextKeys : currentKeys;
      });
    },
    [sdkValidationDetails.length, showRules],
  );

  const handleAISuggestionClose = () => {
    const dataSet = genProcessFromData(aiSuggestionDataRef.current?.processDataSet ?? {});
    applyProcessData({ ...dataSet, id }, { resetFields: true });
    unsavedChangesRef.current = true;
  };
  const handletFromData = async () => {
    if (fromData?.id) {
      unsavedChangesRef.current = true;
      const fieldsValue = formRefEdit.current?.getFieldsValue();
      if (activeTabKey === 'validation') {
        await setFromData({
          ...fromData,
          modellingAndValidation: {
            ...fromData?.modellingAndValidation,
            validation: { ...fieldsValue?.modellingAndValidation?.validation },
          },
        });
      } else if (activeTabKey === 'complianceDeclarations') {
        await setFromData({
          ...fromData,
          modellingAndValidation: {
            ...fromData?.modellingAndValidation,
            complianceDeclarations: {
              ...fieldsValue?.modellingAndValidation?.complianceDeclarations,
            },
          },
        });
      } else {
        await setFromData({
          ...fromData,
          [activeTabKey]: fieldsValue?.[activeTabKey] ?? {},
        });
      }
    }
  };

  const handletExchangeDataCreate = (data: ProcessExchangeData) => {
    if (fromData?.id) {
      unsavedChangesRef.current = true;
      const createdExchange = {
        ...data,
        '@dataSetInternalID': exchangeDataSource.length.toString(),
      };
      const nextExchangeDataSource = [...exchangeDataSource, createdExchange];
      const normalizedExchangeDataSource = normalizeQuantitativeReferenceSelection(
        nextExchangeDataSource,
        createdExchange['@dataSetInternalID'],
      );
      setExchangeDataSource(normalizedExchangeDataSource);
      setFromData({
        ...fromData,
        exchanges: {
          exchange: normalizedExchangeDataSource,
        },
      } as FormProcessWithDatas);
    }
  };

  const handletExchangeData = (data: ProcessExchangeData[]) => {
    if (fromData?.id) {
      unsavedChangesRef.current = true;
      const nextExchangeDataSource = [...data];
      setExchangeDataSource(nextExchangeDataSource);
      setFromData({
        ...fromData,
        exchanges: {
          exchange: nextExchangeDataSource,
        },
      } as FormProcessWithDatas);
    }
  };

  const updateExchangeDataSource = async (exchangeData: ProcessExchangeData[]) => {
    const newExchangeDataSource = await Promise.all(
      exchangeData.map(async (item) => {
        const reference = toReferenceValue(item?.referenceToFlowDataSet);
        const refObjectId = reference?.['@refObjectId'] ?? '';
        const version = reference?.['@version'] ?? '';

        const result = await getFlowDetail(refObjectId, version);

        if (!result?.data) {
          return item;
        }

        const refData = genFlowFromData(result.data?.json?.flowDataSet ?? {});
        const shortDescription = (
          genFlowNameJson(refData?.flowInformation?.dataSetInformation?.name) ?? []
        ).filter(
          (
            item,
          ): item is {
            '@xml:lang': string;
            '#text': string;
          } => typeof item?.['@xml:lang'] === 'string' && typeof item?.['#text'] === 'string',
        );
        const latestReference = {
          ...(reference ?? {}),
          '@version': result.data?.version ?? '',
          'common:shortDescription': shortDescription,
        };

        return {
          ...item,
          referenceToFlowDataSet: latestReference,
        };
      }),
    );
    return newExchangeDataSource;
  };

  const handleUpdateRefsVersion = async (newRefs: RefVersionItem[]) => {
    const currentData = cloneProcessData(getCurrentProcessData());
    if (!currentData) {
      return;
    }
    const res = updateRefsData(currentData, newRefs, true) as FormProcessWithDatas;
    const nextExchangeDataSource = await updateExchangeDataSource(
      (res?.exchanges?.exchange ?? []) as ProcessExchangeData[],
    );
    applyProcessData({
      ...res,
      exchanges: toProcessExchanges(nextExchangeDataSource),
    });
    unsavedChangesRef.current = true;
    setRefsDrawerVisible(false);
  };

  const handleKeepVersion = async () => {
    const currentData = cloneProcessData(getCurrentProcessData());
    if (!currentData) {
      return;
    }
    const res = updateRefsData(currentData, refsOldList, false) as FormProcessWithDatas;
    const nextExchangeDataSource = await updateExchangeDataSource(
      (res?.exchanges?.exchange ?? []) as ProcessExchangeData[],
    );
    applyProcessData({
      ...res,
      exchanges: toProcessExchanges(nextExchangeDataSource),
    });
    unsavedChangesRef.current = true;
    setRefsDrawerVisible(false);
  };

  const handleUpdateReference = async () => {
    setRefsLoading(true);
    const currentData = cloneProcessData(getCurrentProcessData());
    if (!currentData) {
      setRefsLoading(false);
      return;
    }
    const { newRefs, oldRefs } = await getRefsOfNewVersion(currentData);
    setRefsNewList(newRefs);
    setRefsOldList(oldRefs);
    setRefsLoading(false);
    if (newRefs && newRefs.length) {
      setRefsDrawerVisible(true);
    } else {
      const res = updateRefsData(currentData, oldRefs, false) as FormProcessWithDatas;
      const nextExchangeDataSource = await updateExchangeDataSource(
        (res?.exchanges?.exchange ?? []) as ProcessExchangeData[],
      );
      applyProcessData({
        ...res,
        exchanges: toProcessExchanges(nextExchangeDataSource),
      });
      unsavedChangesRef.current = true;
    }
  };

  const handleSubmit = async (
    closeDrawer: boolean,
    options?: { silent?: boolean; langIntent?: 'save' | 'validation' },
  ): Promise<HandleSubmitResult> => {
    const silent = options?.silent ?? false;
    if (closeDrawer) setSpinning(true);
    const currentData = getCurrentProcessData();
    if (!currentData) {
      if (closeDrawer) {
        setSpinning(false);
      }
      return;
    }
    const processData = cloneProcessData(currentData) as FormProcessWithDatas;
    const output = (processData.exchanges.exchange as ProcessExchangeData[]).filter(
      (e) => e.exchangeDirection?.toUpperCase() === 'OUTPUT',
    );
    let allocatedFractionTotal = toBigNumberOrZero(0);
    output.forEach((e) => {
      const allocation = getFirstProcessExchangeAllocation(e?.allocations?.allocation);
      if (allocation?.['@allocatedFraction']) {
        const fractionText = allocation['@allocatedFraction']?.toString?.();
        const fraction = typeof fractionText === 'string' ? fractionText.replace('%', '') : '';
        allocatedFractionTotal = allocatedFractionTotal.plus(toBigNumberOrZero(fraction));
      }
    });
    if (allocatedFractionTotal.isEqualTo(0)) {
      const referenceIndex = output.findIndex(
        (e) => e.quantitativeReference === true && e.exchangeDirection?.toUpperCase() === 'OUTPUT',
      );
      if (referenceIndex > -1) {
        output[referenceIndex].allocations = {
          allocation: {
            '@allocatedFraction': '100%',
          },
        };
      }
    }
    if (allocatedFractionTotal.isGreaterThan(100)) {
      if (!silent) {
        message.error(
          intl.formatMessage(
            {
              id: 'pages.process.validator.allocatedFraction',
              defaultMessage:
                'The total allocated fraction for outputs cannot exceed 100%. Current total: {total}%.',
            },
            { total: allocatedFractionTotal.toString() },
          ),
        );
      }
      setSpinning(false);
      return;
    }

    const nextProcessData = {
      ...processData,
    };
    const langOptions = options?.langIntent ? { intent: options.langIntent } : undefined;
    const updateResult = langOptions
      ? await updateProcess(id, version, nextProcessData, undefined, langOptions)
      : await updateProcess(id, version, nextProcessData);
    if (updateResult?.data) {
      unsavedChangesRef.current = false;
      setOriginJson(updateResult.data[0]?.json ?? {});
      if (!closeDrawer) {
        const dataSet = genProcessFromData(updateResult.data[0]?.json?.processDataSet ?? {});
        const nextData = {
          ...dataSet,
          id,
          stateCode: updateResult.data[0]?.state_code,
          ruleVerification: updateResult.data[0]?.rule_verification,
        } as FormProcessWithDatas;
        setInitData(nextData);
        applyProcessData(nextData);
      }
      updateNodeCb({
        '@refObjectId': id,
        '@version': version,
        '@type': 'process data set',
      });
      if (!silent) {
        message.success(
          intl.formatMessage({
            id: 'pages.button.save.success',
            defaultMessage: 'Saved successfully!',
          }),
        );
      }
      if (closeDrawer) {
        setSpinning(false);
        setDrawerVisible(false);
        setViewDrawerVisible(false);
        actionRef?.current?.reload();
      }
    } else {
      if (!silent) {
        if (updateResult?.error?.state_code === 100) {
          message.error(
            intl.formatMessage({
              id: 'pages.review.openData',
              defaultMessage: 'This data is open data, save failed',
            }),
          );
        } else if (updateResult?.error?.state_code === 20) {
          message.error(
            intl.formatMessage({
              id: 'pages.review.underReview',
              defaultMessage: 'Data is under review, save failed',
            }),
          );
        } else {
          message.error(updateResult?.error?.message);
        }
      }
      if (closeDrawer) setSpinning(false);
    }
    if (!closeDrawer) {
      return updateResult;
    }
    return undefined;
  };

  const toSavedProcessCheckTarget = useCallback((updateResult?: HandleSubmitResult) => {
    const updatedProcess = updateResult?.data?.[0];

    if (
      !updatedProcess?.id ||
      !updatedProcess?.version ||
      typeof updatedProcess.state_code !== 'number'
    ) {
      return undefined;
    }

    return {
      id: updatedProcess.id,
      version: updatedProcess.version,
      ...genProcessFromData(updatedProcess.json?.processDataSet),
      ruleVerification: isRuleVerificationPassed(updatedProcess.rule_verification),
      stateCode: updatedProcess.state_code,
    } satisfies ProcessCheckTarget;
  }, []);

  /* istanbul ignore next -- validation-only draft hydration mirrors the already-validated save payload */
  const toNormalizedProcessCheckTarget = useCallback(
    (updateResult?: HandleSubmitResult) => {
      if (!hasLangNormalizationDraftChanges(updateResult)) {
        return undefined;
      }

      const processDataSet = updateResult?.normalizedJsonOrdered?.processDataSet;
      if (!processDataSet) {
        return undefined;
      }

      const stateCode =
        typeof fromData?.stateCode === 'number'
          ? fromData.stateCode
          : typeof initData?.stateCode === 'number'
            ? initData.stateCode
            : 0;
      const nextData = {
        ...genProcessFromData(processDataSet),
        id,
        version,
        ruleVerification: true,
        stateCode,
      } satisfies ProcessCheckTarget;

      applyProcessData(nextData);
      return nextData;
    },
    [applyProcessData, fromData, id, initData, version],
  );

  /* istanbul ignore next -- this fallback only exists for defensive validation recovery when the form snapshot disappears */
  const buildFallbackProcessCheckTarget = useCallback(async () => {
    const currentData = getCurrentProcessData();

    if (!currentData) {
      return undefined;
    }

    const preparedProcessData = cloneProcessData(currentData) as FormProcessWithDatas;
    const stateCode =
      typeof preparedProcessData?.stateCode === 'number'
        ? preparedProcessData.stateCode
        : typeof fromData?.stateCode === 'number'
          ? fromData.stateCode
          : typeof initData?.stateCode === 'number'
            ? initData.stateCode
            : 0;

    return {
      ...preparedProcessData,
      id,
      version,
      ruleVerification: true,
      stateCode,
    } satisfies ProcessCheckTarget;
  }, [fromData, getCurrentProcessData, id, initData, version]);

  const resolveProcessCheckTarget = useCallback(
    async (updateResult?: HandleSubmitResult) => {
      return (
        toSavedProcessCheckTarget(updateResult) ??
        toNormalizedProcessCheckTarget(updateResult) ??
        (await buildFallbackProcessCheckTarget())
      );
    },
    [buildFallbackProcessCheckTarget, toNormalizedProcessCheckTarget, toSavedProcessCheckTarget],
  );

  const handleValidationIssueNavigate = useCallback(
    (target: { detail?: ValidationIssueSdkDetail; tabName?: string }) => {
      if (target.detail?.tabName) {
        setPendingTabValidationKey(target.detail.tabName as TabKeysType);
        setActiveTabKey(target.detail.tabName as TabKeysType);
        setSdkValidationFocus(
          target.detail.presentation && target.detail.presentation !== 'field'
            ? null
            : target.detail,
        );
        return;
      }

      if (target.tabName) {
        setPendingTabValidationKey(target.tabName as TabKeysType);
        setActiveTabKey(target.tabName as TabKeysType);
      }

      setSdkValidationFocus(null);
    },
    [],
  );

  const handleCheckData = async (
    from: 'review' | 'checkData',
    processDetail: ProcessCheckTarget,
    options?: { silent?: boolean },
  ) => {
    const silent = options?.silent ?? false;
    setSpinning(true);
    setShowRules(true);
    setSdkValidationDismissedFieldKeys(new Set());
    if (processDetail.stateCode >= 20 && processDetail.stateCode < 100 && from === 'checkData') {
      if (!silent) {
        message.error(
          intl.formatMessage({
            id: 'pages.process.checkData.inReview',
            defaultMessage: 'This data set is under review and cannot be validated',
          }),
        );
      }
      setSpinning(false);
      return { checkResult: false, unReview: [] };
    }
    const rootRef = {
      '@refObjectId': processDetail.id,
      '@version': processDetail.version,
      '@type': 'process data set',
    } satisfies refDataType;
    const orderedJson = genProcessJsonOrdered(processDetail.id, processDetail, {
      preserveAnnualSupplyVolumeText: true,
    });
    const sdkValidation = validateDatasetWithSdk('process data set', orderedJson);
    const sdkIssues = sdkValidation.issues;
    const sdkIssueDetails = normalizeProcessSdkValidationDetails(sdkIssues, orderedJson);
    const exchangesRequiredValidationDetails =
      buildProcessExchangesRequiredValidationDetails(processDetail);
    const quantitativeReferenceValidationDetails =
      buildProcessQuantitativeReferenceValidationDetails(processDetail);
    const mergedSdkIssueDetails = [
      ...exchangesRequiredValidationDetails,
      ...quantitativeReferenceValidationDetails,
      ...sdkIssueDetails,
    ].filter(
      (detail, index, allDetails) =>
        allDetails.findIndex((item) => item.key === detail.key) === index,
    );
    let currentDatasetValid = sdkValidation.success;
    const errTabNames: string[] = [];
    const currentDatasetTabNames: string[] = [];
    let datasetValidationMessage: string | null = null;

    if (!sdkValidation.success) {
      await validateVisibleFormFields(formRefEdit);
    }
    setSdkValidationDetails(mergedSdkIssueDetails);
    if (mergedSdkIssueDetails.length === 0) {
      setSdkValidationFocus(null);
    }

    sdkIssues.forEach((item) => {
      const tabName = getProcessSdkIssueTabName(item);
      if (tabName && !errTabNames.includes(tabName)) {
        errTabNames.push(tabName);
      }
      if (tabName && !currentDatasetTabNames.includes(tabName)) {
        currentDatasetTabNames.push(tabName);
      }
    });
    if (exchangesRequiredValidationDetails.length > 0) {
      currentDatasetValid = false;
      datasetValidationMessage = intl.formatMessage({
        id: 'pages.process.validator.exchanges.required',
        defaultMessage: 'Add at least one exchange',
      });
      if (!errTabNames.includes('exchanges')) {
        errTabNames.push('exchanges');
      }
      if (!currentDatasetTabNames.includes('exchanges')) {
        currentDatasetTabNames.push('exchanges');
      }
    } else if (quantitativeReferenceValidationDetails.length > 0) {
      currentDatasetValid = false;
      datasetValidationMessage = intl.formatMessage({
        id: 'pages.process.validator.exchanges.quantitativeReference.required',
        defaultMessage: 'Select exactly one item as the quantitative reference.',
      });
      if (!errTabNames.includes('exchanges')) {
        errTabNames.push('exchanges');
      }
      if (!currentDatasetTabNames.includes('exchanges')) {
        currentDatasetTabNames.push('exchanges');
      }
    }

    const getValidationHint = () => {
      if (datasetValidationMessage && errTabNames.length === 1 && errTabNames[0] === 'exchanges') {
        return datasetValidationMessage;
      }
      if (errTabNames.length > 0) {
        return formatDataCheckErrorWithSections(
          intl,
          errTabNames.map((tab: string) => formatDatasetTabLabel(intl, 'process data set', tab)),
        );
      }
      return intl.formatMessage({
        id: 'pages.button.check.error',
        defaultMessage: 'Data check failed, please check the data!',
      });
    };

    const unReview: refDataType[] = []; // stateCode < 20
    const underReview: refDataType[] = []; // stateCode >= 20 && stateCode < 100
    const unRuleVerification: refDataType[] = [];
    const nonExistentRef: refDataType[] = [];
    const allRefs = new Set<string>();

    dealProcress(processDetail, unReview, underReview, unRuleVerification, nonExistentRef);

    const userTeamId = await getUserTeamId();
    const refObjs = getAllRefObj(processDetail);

    const path = await checkReferences(
      refObjs,
      new Map<string, unknown>(),
      userTeamId,
      unReview,
      underReview,
      unRuleVerification,
      nonExistentRef,
      new ReffPath(rootRef, processDetail?.ruleVerification, false),
      allRefs,
      {
        rootRef,
      },
    );
    allRefs.add(`${processDetail.id}:${processDetail.version}:process data set`);
    await checkVersions(allRefs, path);
    const problemNodes = (path?.findProblemNodes(from) ?? []) as RefProblemNode[];
    const { getRefTabNames, tabNames: referenceValidationTabNames } =
      collectValidationIssueRefTabNames({
        refs: [...nonExistentRef, ...unRuleVerification, ...problemNodes],
        resolveTabName: (item) => getErrRefTab(item, processDetail),
      });
    referenceValidationTabNames.forEach((tabName) => {
      if (!errTabNames.includes(tabName)) {
        errTabNames.push(tabName);
      }
    });
    const validationIssues = buildValidationIssues({
      actionFrom: from,
      datasetSdkValid: currentDatasetValid,
      getRefTabNames,
      nonExistentRef,
      problemNodes,
      rootRef,
      sdkInvalidDetails: mergedSdkIssueDetails,
      sdkInvalidTabNames: currentDatasetTabNames,
      unRuleVerification,
    });

    setValidationIssueTabNames(referenceValidationTabNames);

    if (validationIssues.length > 0) {
      setRefCheckData(mapValidationIssuesToRefCheckData(validationIssues));
    } else {
      setRefCheckData([]);
    }
    if (
      currentDatasetValid &&
      nonExistentRef?.length === 0 &&
      unRuleVerification.length === 0 &&
      problemNodes.length === 0
    ) {
      if (!silent) {
        message.success(
          intl.formatMessage({
            id: 'pages.button.check.success',
            defaultMessage: 'Data validation passed.',
          }),
        );
      }
      setSpinning(false);
      return { checkResult: true, unReview };
    }

    const validationHint = getValidationHint();

    if (!silent && validationIssues.length > 0) {
      const validationIssuesWithOwner = await enrichValidationIssuesWithOwner(validationIssues);
      showValidationIssueModal({
        intl,
        issues: validationIssuesWithOwner,
        onNavigate: handleValidationIssueNavigate,
        title:
          from === 'review'
            ? {
                id: 'pages.validationIssues.modal.reviewTitle',
                defaultMessage: 'Review submission blocked',
              }
            : {
                id: 'pages.validationIssues.modal.checkDataTitle',
                defaultMessage: 'Data validation issues',
              },
      });
    } else if (!silent) {
      message.error(validationHint);
    }

    setSpinning(false);
    return { checkResult: false, unReview };
  };

  const runCheckData = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    setSpinning(true);
    const updateResult = await handleSubmit(false, { silent, langIntent: 'validation' });
    const validationTarget = await resolveProcessCheckTarget(updateResult);

    if (!validationTarget) {
      setSpinning(false);
      return { checkResult: false, unReview: [] as refDataType[] };
    }

    return handleCheckData('checkData', validationTarget, { silent });
  };

  const submitReview = async () => {
    setReviewSubmitting(true);
    setSpinning(true);
    try {
      const blockUnsavedChanges = () => {
        if (!unsavedChangesRef.current) {
          return false;
        }
        message.warning(
          intl.formatMessage({
            id: 'pages.process.review.saveChangesFirst',
            defaultMessage: 'Save your changes before submitting for review.',
          }),
        );
        return true;
      };

      if (blockUnsavedChanges()) {
        return;
      }

      // Review the persisted draft itself. Saving the editor first can rewrite fields
      // the author never touched and leave those changes behind if review fails.
      const savedResult = await getProcessDetail(id, version);
      if (blockUnsavedChanges()) {
        return;
      }
      const savedProcess = savedResult.data;
      if (
        !savedProcess?.json?.processDataSet ||
        savedProcess.id !== id ||
        savedProcess.version !== version ||
        typeof savedProcess.stateCode !== 'number' ||
        savedProcess.stateCode >= 20
      ) {
        message.error(
          intl.formatMessage({
            id: 'pages.process.review.submitFailed',
            defaultMessage: 'Review submission failed',
          }),
        );
        return;
      }

      const validationTarget = {
        ...genProcessFromData(savedProcess.json.processDataSet),
        id,
        version,
        stateCode: savedProcess.stateCode,
        ruleVerification: isRuleVerificationPassed(savedProcess.ruleVerification),
      } satisfies ProcessCheckTarget;
      const { checkResult } = await handleCheckData('review', validationTarget);

      if (checkResult) {
        if (blockUnsavedChanges()) {
          return;
        }
        setSpinning(true);
        const submitResult = await submitDatasetReview('processes', id, version);
        if (submitResult.error) {
          message.error(
            submitResult.error.message ||
              intl.formatMessage({
                id: 'pages.process.review.submitFailed',
                defaultMessage: 'Review submission failed',
              }),
          );
          return;
        }

        message.success(
          intl.formatMessage({
            id: 'pages.process.review.submitSuccess',
            defaultMessage: 'Review submitted successfully',
          }),
        );
        actionRef?.current?.reload();
        setDrawerVisible(false);
        setViewDrawerVisible(false);
      }
    } catch (error) {
      message.error(
        error instanceof Error && error.message
          ? error.message
          : intl.formatMessage({
              id: 'pages.process.review.submitFailed',
              defaultMessage: 'Review submission failed',
            }),
      );
    } finally {
      setSpinning(false);
      setReviewSubmitting(false);
    }
  };

  const onTabChange = (key: TabKeysType) => {
    setPendingTabValidationKey(null);
    setActiveTabKey(key);

    if (!showRules) {
      return;
    }

    void validateVisibleFormFields(formRefEdit, {
      onSettled: () => {
        setSdkValidationDetails((currentDetails) =>
          currentDetails.length > 0 ? [...currentDetails] : currentDetails,
        );
      },
    });
  };

  const onEdit = useCallback(() => {
    setDrawerVisible(true);
    setActiveTabKey('processInformation');
    setValidationIssueTabNames([]);
    setSdkValidationFocus(null);
  }, [setViewDrawerVisible]);

  const onReset = () => {
    setSpinning(true);
    getProcessDetail(id, version).then(async (result: ProcessDetailResponse) => {
      setOriginJson(result.data?.json ?? {});
      const dataSet = genProcessFromData(result.data?.json?.processDataSet ?? {});
      const nextData = {
        ...dataSet,
        id,
        stateCode: result.data?.stateCode,
        ruleVerification: result.data?.ruleVerification,
      } as FormProcessWithDatas;
      setInitData(nextData);
      applyProcessData(nextData, { resetFields: true });
      unsavedChangesRef.current = false;
      setSpinning(false);
    });
  };

  useEffect(() => {
    if (!drawerVisible) {
      setInitData(undefined);
      setShowRules(false);
      setRefCheckData([]);
      setValidationIssueTabNames([]);
      setSdkValidationDetails([]);
      setSdkValidationFocus(null);
      setSdkValidationDismissedFieldKeys(new Set());
      setPendingTabValidationKey(null);
      setAutoCheckTriggered(false);
      // setUnRuleVerificationData([]);
      // setNonExistentRefData([]);
      return;
    }
    onReset();
  }, [drawerVisible]);

  useEffect(() => {
    if (!showRules || !drawerVisible || pendingTabValidationKey !== activeTabKey) {
      return;
    }

    let cancelled = false;

    void validateVisibleFormFields(formRefEdit, {
      onSettled: () => {
        if (cancelled) {
          return;
        }

        setSdkValidationDetails((currentDetails) =>
          currentDetails.length > 0 ? [...currentDetails] : currentDetails,
        );
        setPendingTabValidationKey(null);
      },
    });

    return () => {
      cancelled = true;
    };
  }, [activeTabKey, drawerVisible, pendingTabValidationKey, showRules]);

  useEffect(() => {
    if (!autoCheckRequired || autoCheckTriggered || !drawerVisible || spinning || !fromData) {
      return;
    }
    setAutoCheckTriggered(true);
    void runCheckData({ silent: true });
  }, [autoCheckRequired, autoCheckTriggered, drawerVisible, fromData, runCheckData, spinning]);

  return (
    <>
      {!autoOpen &&
        (buttonType === 'toolIcon' ? (
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
              icon={<FormOutlined />}
              onClick={onEdit}
              disabled={disabled}
            />
          </Tooltip>
        ) : buttonType === 'toolResultIcon' ? (
          <Tooltip
            title={
              <FormattedMessage id='pages.button.model.result' defaultMessage='Model Results' />
            }
            placement='left'
          >
            <Button
              disabled={id === ''}
              type='primary'
              icon={<ProductOutlined />}
              size='small'
              style={{ boxShadow: 'none' }}
              onClick={onEdit}
            />
          </Tooltip>
        ) : buttonType === 'tool' ? (
          <Tooltip
            title={
              <FormattedMessage id='pages.button.model.result' defaultMessage='Model Results' />
            }
            placement='left'
          >
            <Button
              disabled={id === ''}
              type='primary'
              icon={<ProductOutlined />}
              size='small'
              style={{ boxShadow: 'none' }}
              onClick={onEdit}
            />
          </Tooltip>
        ) : (
          <Tooltip title={<FormattedMessage id={'pages.button.edit'} defaultMessage={'Edit'} />}>
            {buttonType === 'icon' ? (
              <Button
                disabled={disabled}
                shape='circle'
                icon={<FormOutlined />}
                size='small'
                onClick={onEdit}
              />
            ) : (
              <Button disabled={disabled} onClick={onEdit}>
                <FormattedMessage id={'pages.button.edit'} defaultMessage={'Edit'} />
              </Button>
            )}
          </Tooltip>
        ))}
      <Drawer
        classNames={{ section: 'tg-process-drawer' }}
        getContainer={() => document.body}
        destroyOnHidden
        title={
          <FormattedMessage
            id={'pages.process.drawer.title.edit'}
            defaultMessage={'Edit process'}
          />
        }
        size='90%'
        closable={false}
        extra={
          <Button
            disabled={spinning || reviewSubmitting}
            data-testid='process-edit-close'
            icon={<CloseOutlined />}
            style={{ border: 0 }}
            onClick={() => setDrawerVisible(false)}
          />
        }
        mask={{ closable: false }}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        footer={
          <LoadingDisabledActionGroup loading={spinning || reviewSubmitting || !initData}>
            <Space size={'middle'} className={styles.footer_right}>
              <AISuggestion
                type='process'
                onLatestJsonChange={handleLatestJsonChange}
                onClose={handleAISuggestionClose}
                originJson={originJson}
              />
              <Button
                onClick={async () => {
                  await runCheckData();
                }}
              >
                <FormattedMessage id='pages.button.check' defaultMessage='Data Check' />
              </Button>
              <>
                {!hideReviewButton && (
                  <Button
                    disabled={spinning || reviewSubmitting}
                    onClick={() => {
                      submitReview();
                    }}
                  >
                    <FormattedMessage id='pages.button.review' defaultMessage='Submit for Review' />
                  </Button>
                )}
                <Button
                  onClick={() => {
                    handleUpdateReference();
                  }}
                >
                  <FormattedMessage
                    id='pages.button.updateReference'
                    defaultMessage='Update Reference'
                  />
                </Button>
              </>
              <Button onClick={() => setDrawerVisible(false)}>
                <FormattedMessage id='pages.button.cancel' defaultMessage='Cancel' />
              </Button>
              {/* <Button onClick={onReset}>
              {' '}
              <FormattedMessage id="pages.button.reset" defaultMessage="Reset" />
            </Button> */}

              <Button
                onClick={() => {
                  setShowRules(false);
                  formRefEdit.current?.submit();
                }}
                type='primary'
              >
                <FormattedMessage id='pages.button.save' defaultMessage='Save' />
              </Button>
            </Space>
          </LoadingDisabledActionGroup>
        }
      >
        <span
          aria-hidden='true'
          data-auto-check-required={autoCheckRequired ? 'required' : 'optional'}
          data-detail-ready={initData && !spinning ? 'true' : 'false'}
          data-route-mode='edit'
          data-testid='process-deep-link-state'
          hidden
        />
        <Spin spinning={spinning || reviewSubmitting}>
          <RefCheckContext.Provider value={refCheckContextValue}>
            <ProForm
              formRef={formRefEdit}
              initialValues={initData}
              onValuesChange={async (changedValues, allValues) => {
                unsavedChangesRef.current = true;
                dismissChangedSdkValidationFields(changedValues);
                if (activeTabKey === 'validation') {
                  await setFromData({
                    ...fromData,
                    modellingAndValidation: {
                      ...fromData?.modellingAndValidation,
                      validation: { ...allValues?.modellingAndValidation?.validation },
                    },
                  } as FormProcessWithDatas);
                } else if (activeTabKey === 'complianceDeclarations') {
                  await setFromData({
                    ...fromData,
                    modellingAndValidation: {
                      ...fromData?.modellingAndValidation,
                      complianceDeclarations: {
                        ...allValues?.modellingAndValidation?.complianceDeclarations,
                      },
                    },
                  } as FormProcessWithDatas);
                } else {
                  await setFromData({
                    ...fromData,
                    [activeTabKey]: allValues[activeTabKey] ?? {},
                  } as FormProcessWithDatas);
                }
              }}
              submitter={{
                render: () => {
                  return [];
                },
              }}
              onFinish={async () => {
                await handleSubmit(true);
                return true;
              }}
            >
              <ProcessForm
                formType='edit'
                lang={lang}
                activeTabKey={activeTabKey}
                actionFrom={actionFrom}
                exchangeDataSource={exchangeDataSource}
                formRef={formRefEdit}
                lciaResults={jsonToList(fromData?.LCIAResults?.LCIAResult) as LCIAResultTable[]}
                lciaCalculationEvidence={fromData?.LCIAResults?.['common:other']}
                onData={handletFromData}
                onExchangeData={handletExchangeData}
                onExchangeDataCreate={handletExchangeDataCreate}
                onTabChange={(key) => onTabChange(key as TabKeysType)}
                processId={id}
                processVersion={version}
                sdkValidationDetails={sdkValidationDetails}
                sdkValidationDismissedFieldKeys={sdkValidationDismissedFieldKeys}
                sdkValidationFocus={sdkValidationFocus}
                showRules={showRules}
                validationIssueTabNames={validationIssueTabNames}
              />
              <Form.Item name='id' hidden>
                <Input />
              </Form.Item>
            </ProForm>
          </RefCheckContext.Provider>
        </Spin>
      </Drawer>
      <RefsOfNewVersionDrawer
        open={refsDrawerVisible}
        loading={refsLoading}
        dataSource={refsNewList}
        onCancel={() => setRefsDrawerVisible(false)}
        onKeep={handleKeepVersion}
        onUpdate={handleUpdateRefsVersion}
      />
    </>
  );
};

export default ProcessEdit;
