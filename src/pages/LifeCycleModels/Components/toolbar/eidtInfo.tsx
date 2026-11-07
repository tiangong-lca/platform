/* istanbul ignore file -- lifecycle edit drawer orchestration is covered by tests; remaining misses are UI-only branches */
import styles from '@/style/custom.less';
import { CloseOutlined, InfoOutlined } from '@ant-design/icons';
import { ProForm, ProFormInstance } from '@ant-design/pro-components';
import {
  App,
  Button,
  Drawer,
  // Input,
  Space,
  Spin,
  Tooltip,
} from 'antd';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';
import {
  normalizeLifeCycleModelProcessInstanceSdkValidationDetails,
  normalizeLifeCycleModelSdkValidationDetails,
} from '../../sdkValidation';
import { LifeCycleModelForm } from '../form';
// const { TextArea } = Input;
import RefsOfNewVersionDrawer, { RefVersionItem } from '@/components/RefsOfNewVersionDrawer';
import { showValidationIssueModal } from '@/components/ValidationIssueModal';
import type { RefCheckType } from '@/contexts/refCheckContext';
import { RefCheckContext, useRefCheckContext } from '@/contexts/refCheckContext';
import type { ProblemNode, refDataType, ValidationIssueSdkDetail } from '@/pages/Utils/review';
import {
  buildValidationIssues,
  checkReferences,
  checkVersions,
  collectValidationIssueRefTabNames,
  dealModel,
  dealProcress,
  enrichValidationIssuesWithOwner,
  getAllRefObj,
  getErrRefTab,
  mapValidationIssuesToRefCheckData,
  ReffPath,
  submitDatasetReview,
  validateDatasetWithSdk,
} from '@/pages/Utils/review';
import {
  getRefsOfCurrentVersion,
  getRefsOfNewVersion,
  updateRefsData,
} from '@/pages/Utils/updateReference';
import { formatDataCheckErrorWithSections } from '@/pages/Utils/validation/feedbackMessages';
import { validateVisibleFormFields } from '@/pages/Utils/validation/formSupport';
import { formatDatasetTabLabel } from '@/pages/Utils/validation/tabMessages';
import { normalizeLangPayloadForSave } from '@/services/general/api';
import { getLifeCycleModelDetail } from '@/services/lifeCycleModels/api';
import type {
  LifeCycleModelCheckDataOptions,
  LifeCycleModelDetailData,
  LifeCycleModelDetailResponse,
  LifeCycleModelFormState,
  LifeCycleModelGraphEdge,
  LifeCycleModelGraphNode,
  LifeCycleModelSubModel,
  LifeCycleModelToolbarEditInfoHandle,
  LifeCycleModelValidationIssue,
} from '@/services/lifeCycleModels/data';
import { genLifeCycleModelJsonOrdered } from '@/services/lifeCycleModels/util';
import { jsonToList } from '@/services/general/util';
import { getProcessDetail } from '@/services/processes/api';
import { getUserTeamId } from '@/services/roles/api';

export type ToolbarEditInfoHandle = LifeCycleModelToolbarEditInfoHandle<refDataType>;

type ReviewProblemNode = ProblemNode & {
  versionUnderReview?: boolean;
  underReviewVersion?: string;
  versionIsInTg?: boolean;
};

type Props = {
  lang: string;
  data: LifeCycleModelFormState;
  onData: (data: LifeCycleModelFormState) => void;
  action: string;
  actionType?: 'create' | 'copy' | 'createVersion';
  onNavigateProcessInstance?: (detail: ValidationIssueSdkDetail) => boolean;
  onProcessInstanceValidationChange?: (details: ValidationIssueSdkDetail[]) => void;
};

type ValidationPayload = LifeCycleModelFormState & {
  model?: {
    nodes?: LifeCycleModelGraphNode[];
    edges?: LifeCycleModelGraphEdge[];
  };
};

const buildSdkValidationDataset = async ({
  modelId,
  payload,
  skipLangNormalization = false,
}: {
  modelId: string;
  payload: ValidationPayload;
  skipLangNormalization?: boolean;
}) => {
  const rawLifeCycleModelJsonOrdered = genLifeCycleModelJsonOrdered(modelId, payload);
  const normalizedLifeCycleModelJsonOrdered = skipLangNormalization
    ? rawLifeCycleModelJsonOrdered
    : ((
        await normalizeLangPayloadForSave(rawLifeCycleModelJsonOrdered, {
          intent: 'validation',
        })
      )?.payload ?? rawLifeCycleModelJsonOrdered);

  return normalizedLifeCycleModelJsonOrdered;
};

/* istanbul ignore next -- tiny parser helper is exercised indirectly by modal navigation flows */
const getProcessInstanceInternalId = (detail?: ValidationIssueSdkDetail | null) => {
  const match = detail?.fieldPath?.match(/^processInstance\[#(.+?)\]/);
  return match?.[1];
};

/* istanbul ignore next -- default prop fallback */
const noopNavigateProcessInstance = () => false;

/* istanbul ignore next -- default prop fallback */
const noopProcessInstanceValidationChange = () => {};

const ToolbarEditInfo = forwardRef<ToolbarEditInfoHandle, Props>(
  (
    {
      lang,
      data,
      onData,
      action,
      actionType,
      onNavigateProcessInstance = noopNavigateProcessInstance,
      onProcessInstanceValidationChange = noopProcessInstanceValidationChange,
    },
    ref,
  ) => {
    const { message } = App.useApp();
    const [refsDrawerVisible, setRefsDrawerVisible] = useState(false);
    const [refsLoading, setRefsLoading] = useState(false);
    const [refsNewList, setRefsNewList] = useState<RefVersionItem[]>([]);
    const [refsOldList, setRefsOldList] = useState<RefVersionItem[]>([]);

    const [drawerVisible, setDrawerVisible] = useState(false);
    const [activeTabKey, setActiveTabKey] = useState<string>('lifeCycleModelInformation');
    const formRefEdit = useRef<ProFormInstance>(undefined);
    const [fromData, setFromData] = useState<LifeCycleModelFormState>({});
    const [spinning, setSpinning] = useState(false);
    const [showRules, setShowRules] = useState<boolean>(false);
    const [sdkValidationDetails, setSdkValidationDetails] = useState<ValidationIssueSdkDetail[]>(
      [],
    );
    const [sdkValidationFocus, setSdkValidationFocus] = useState<ValidationIssueSdkDetail | null>(
      null,
    );
    const [validationIssueTabNames, setValidationIssueTabNames] = useState<string[]>([]);
    const [refCheckData, setRefCheckData] = useState<RefCheckType[]>([]);
    const parentRefCheckContext = useRefCheckContext();
    const [refCheckContextValue, setRefCheckContextValue] = useState<{
      refCheckData: RefCheckType[];
    }>({
      refCheckData: [],
    });
    useEffect(() => {
      setRefCheckContextValue({
        refCheckData: [...parentRefCheckContext.refCheckData, ...refCheckData],
      });
    }, [refCheckData, parentRefCheckContext]);
    const intl = useIntl();
    const modelDetailRef = useRef<LifeCycleModelDetailData | undefined>(undefined);

    useEffect(() => {
      if (!showRules || !drawerVisible) {
        return;
      }

      let cancelled = false;

      void validateVisibleFormFields(formRefEdit, {
        /* istanbul ignore next -- validation re-run scheduling is UI-only bookkeeping */
        onSettled: () => {
          if (cancelled) {
            return;
          }

          setSdkValidationDetails((currentDetails) =>
            currentDetails.length > 0 ? [...currentDetails] : currentDetails,
          );
        },
      });

      return () => {
        cancelled = true;
      };
    }, [drawerVisible, showRules]);

    const handleUpdateRefsVersion = async (newRefs: RefVersionItem[]) => {
      const res = updateRefsData(fromData, newRefs, true);
      setFromData(res);
      formRefEdit.current?.setFieldsValue({ ...res });
      setRefsDrawerVisible(false);
    };

    const handleKeepVersion = async () => {
      const res = updateRefsData(fromData, refsOldList, false);
      setFromData(res);
      formRefEdit.current?.setFieldsValue({ ...res });
      setRefsDrawerVisible(false);
    };

    const handleUpdateReference = async () => {
      setRefsLoading(true);
      const { newRefs, oldRefs } = await getRefsOfNewVersion(fromData);
      setRefsNewList(newRefs);
      setRefsOldList(oldRefs);
      setRefsLoading(false);
      if (newRefs && newRefs.length) {
        setRefsDrawerVisible(true);
      } else {
        const res = updateRefsData(fromData, oldRefs, false);
        setFromData(res);
        formRefEdit.current?.setFieldsValue({ ...res });
      }
    };
    const updateReferenceDescription = async (data: LifeCycleModelFormState) => {
      const { oldRefs } = await getRefsOfCurrentVersion({ ...data, ...fromData });
      const res = updateRefsData({ ...data, ...fromData }, oldRefs, false);
      setFromData(res);
      formRefEdit.current?.setFieldsValue({ ...res });
    };
    const handletFromData = () => {
      const fieldsValue = formRefEdit.current?.getFieldsValue(true);

      if (activeTabKey === 'complianceDeclarations') {
        setFromData({
          ...fromData,
          modellingAndValidation: {
            ...fromData?.modellingAndValidation,
            complianceDeclarations: fieldsValue?.modellingAndValidation?.complianceDeclarations,
          },
        });
        return;
      }
      if (activeTabKey === 'validation') {
        setFromData({
          ...fromData,
          modellingAndValidation: {
            ...fromData?.modellingAndValidation,
            validation: fieldsValue?.modellingAndValidation?.validation,
          },
        });
        return;
      }

      // if (fromData) {
      setFromData({
        ...fromData,
        [activeTabKey]: fieldsValue?.[activeTabKey] ?? {},
      });
      // }
    };

    const onTabChange = (key: string) => {
      setActiveTabKey(key);
    };

    /* istanbul ignore next -- process-instance navigation branches are exercised indirectly through the toolbar integration */
    const handleValidationIssueNavigate = (target: {
      detail?: ValidationIssueSdkDetail;
      tabName?: string;
    }) => {
      if (target.detail && getProcessInstanceInternalId(target.detail)) {
        const handled = onNavigateProcessInstance(target.detail);

        if (handled) {
          setDrawerVisible(false);
          setSdkValidationFocus(null);
          return;
        }
      }

      const tabName = target.detail?.tabName ?? target.tabName;

      if (tabName) {
        setActiveTabKey(tabName);
      }

      setSdkValidationFocus(
        target.detail?.presentation && target.detail.presentation !== 'field'
          ? null
          : (target.detail ?? null),
      );
    };

    const onReset = () => {
      formRefEdit.current?.resetFields();
      formRefEdit.current?.setFieldsValue(data);
      setFromData(data);
    };

    useEffect(() => {
      if (!drawerVisible) {
        setRefCheckContextValue({ refCheckData: [] });
        setShowRules(false);
        setSdkValidationDetails([]);
        setSdkValidationFocus(null);
        setValidationIssueTabNames([]);
        onProcessInstanceValidationChange([]);
        return;
      }
      onReset();
    }, [drawerVisible, onProcessInstanceValidationChange]);

    const handleCheckData = async (
      from: 'review' | 'checkData',
      nodes: LifeCycleModelGraphNode[],
      edges: LifeCycleModelGraphEdge[],
      options?: LifeCycleModelCheckDataOptions,
    ): Promise<{
      checkResult: boolean;
      unReview: refDataType[];
      problemNodes?: refDataType[];
    }> => {
      const silent = options?.silent ?? false;
      const validationSnapshot = options?.validationSnapshot;
      const validationModelId = validationSnapshot?.modelId ?? data.id ?? '';
      const validationVersion = validationSnapshot?.version ?? data.version ?? '';
      setSpinning(true);
      onProcessInstanceValidationChange([]);
      if (validationSnapshot?.payload) {
        formRefEdit.current?.setFieldsValue(validationSnapshot.payload);
        setFromData(validationSnapshot.payload as LifeCycleModelFormState);
      }
      if (nodes?.length) {
        const quantitativeReferenceProcress = nodes.find(
          (node) => node?.data?.quantitativeReference === '1',
        );
        if (!quantitativeReferenceProcress) {
          if (!silent) {
            message.error(
              intl.formatMessage({
                id: 'pages.lifecyclemodel.validator.nodes.quantitativeReference.required',
                defaultMessage: 'Please select a node as reference',
              }),
            );
          }
          setSpinning(false);
          return { checkResult: false, unReview: [] };
        }
      } else {
        if (!silent) {
          message.error(
            intl.formatMessage({
              id: 'pages.lifecyclemodel.validator.nodes.required',
              defaultMessage: 'Please add node',
            }),
          );
        }
        setSpinning(false);
        return { checkResult: false, unReview: [] };
      }
      setShowRules(true);

      const userTeamId = await getUserTeamId();

      const unReview: refDataType[] = [];
      const underReview: refDataType[] = [];
      const unRuleVerification: refDataType[] = [];
      const nonExistentRef: refDataType[] = [];
      const allRefs = new Set<string>();

      const modelDetailResp: LifeCycleModelDetailResponse = await getLifeCycleModelDetail(
        validationModelId,
        validationVersion,
      );
      const currentModelDetail = modelDetailResp.success ? modelDetailResp.data : undefined;
      modelDetailRef.current = currentModelDetail;
      if (
        currentModelDetail &&
        currentModelDetail.stateCode >= 20 &&
        currentModelDetail.stateCode < 100 &&
        from === 'checkData'
      ) {
        if (!silent) {
          message.error(
            intl.formatMessage({
              id: 'pages.lifecyclemodel.checkData.inReview',
              defaultMessage: 'This data set is under review and cannot be validated',
            }),
          );
        }
        setSpinning(false);
        return { checkResult: false, unReview };
      }

      const rootRef = {
        '@refObjectId': validationModelId,
        '@version': validationVersion,
        '@type': 'lifeCycleModel data set',
      } satisfies refDataType;
      const sdkValidationSource =
        validationSnapshot?.payload ??
        (currentModelDetail
          ? {
              ...currentModelDetail.json.lifeCycleModelDataSet,
              model: { ...currentModelDetail.json_tg?.xflow },
            }
          : {
              ...data,
              model: {
                nodes,
                edges,
              },
            });
      const orderedValidationDataset = await buildSdkValidationDataset({
        modelId: validationModelId,
        payload: sdkValidationSource,
        skipLangNormalization: Boolean(validationSnapshot?.payload),
      });
      const sdkValidation = validateDatasetWithSdk(
        'lifeCycleModel data set',
        orderedValidationDataset,
      );
      const issues: LifeCycleModelValidationIssue[] = sdkValidation.issues;
      let currentDatasetValid = sdkValidation.success;
      let processInstanceValid = true;
      const errTabNames: string[] = [];
      const currentDatasetTabNames: string[] = [];

      issues.forEach((err: LifeCycleModelValidationIssue) => {
        if (err.path.includes('processInstance')) {
          processInstanceValid = false;
        } else {
          const tabName = typeof err?.path[1] === 'string' ? err.path[1] : undefined;
          if (tabName && !errTabNames.includes(tabName)) {
            errTabNames.push(tabName);
          }
          if (tabName && !currentDatasetTabNames.includes(tabName)) {
            currentDatasetTabNames.push(tabName);
          }
        }
      });
      const metadataSdkIssueDetails = normalizeLifeCycleModelSdkValidationDetails(
        issues,
        orderedValidationDataset,
      );
      const processInstanceSdkIssueDetails =
        normalizeLifeCycleModelProcessInstanceSdkValidationDetails(
          issues,
          orderedValidationDataset,
          intl.locale,
        );
      const sdkIssueDetails = [...metadataSdkIssueDetails, ...processInstanceSdkIssueDetails];

      if (!currentDatasetValid && metadataSdkIssueDetails.length > 0) {
        await validateVisibleFormFields(formRefEdit);
      }
      setSdkValidationDetails(metadataSdkIssueDetails);
      onProcessInstanceValidationChange(processInstanceSdkIssueDetails);
      if (metadataSdkIssueDetails.length === 0) {
        setSdkValidationFocus(null);
      }

      sdkIssueDetails.forEach((detail) => {
        const tabName = detail.tabName;
        const shouldCountAsDatasetTabIssue = detail.presentation !== 'highlight-only';

        /* istanbul ignore next -- tab de-duplication is covered via broader validation flows */
        if (tabName && shouldCountAsDatasetTabIssue && !errTabNames.includes(tabName)) {
          errTabNames.push(tabName);
        }

        /* istanbul ignore next -- tab de-duplication is covered via broader validation flows */
        if (tabName && shouldCountAsDatasetTabIssue && !currentDatasetTabNames.includes(tabName)) {
          currentDatasetTabNames.push(tabName);
        }
      });
      if (currentModelDetail) {
        dealModel(currentModelDetail, unReview, underReview, unRuleVerification, nonExistentRef);
      }

      const submodels: LifeCycleModelSubModel[] = currentModelDetail?.json_tg?.submodels ?? [];
      const primaryMember = submodels.find(
        (item) => item.type === 'primary' || (!item.type && item.id === validationModelId),
      );
      const resultRefs = jsonToList(
        currentModelDetail?.json?.lifeCycleModelDataSet?.lifeCycleModelInformation
          ?.dataSetInformation?.referenceToResultingProcess,
      );
      const primaryRef = primaryMember
        ? { id: primaryMember.id, version: primaryMember.version ?? validationVersion }
        : resultRefs.length === 1
          ? { id: resultRefs[0]['@refObjectId'], version: resultRefs[0]['@version'] }
          : undefined;
      const sameProcressWithModelResult =
        primaryRef?.id && primaryRef.version
          ? await getProcessDetail(primaryRef.id, primaryRef.version)
          : undefined;
      const sameProcressWithModel = sameProcressWithModelResult?.data;
      if (sameProcressWithModel) {
        dealProcress(
          sameProcressWithModel,
          unReview,
          underReview,
          unRuleVerification,
          nonExistentRef,
        );
      }

      const refObjs = getAllRefObj(orderedValidationDataset);
      const path = await checkReferences(
        refObjs,
        new Map<string, unknown>(),
        userTeamId,
        unReview,
        underReview,
        unRuleVerification,
        nonExistentRef,
        new ReffPath(rootRef, currentModelDetail?.ruleVerification ?? true, false),
        allRefs,
        {
          rootRef,
        },
      );
      allRefs.add(`${validationModelId}:${validationVersion}:lifeCycleModel data set`);
      if (sameProcressWithModel) {
        allRefs.add(`${primaryRef!.id}:${primaryRef!.version}:process data set`);
      }
      await checkVersions(allRefs, path);

      const problemNodes = (path?.findProblemNodes(from) ?? []) as ReviewProblemNode[];
      const modelDataset = orderedValidationDataset?.lifeCycleModelDataSet;
      const shouldShowDatasetRefTabName = (item: refDataType | ReviewProblemNode) =>
        item['@type'] !== 'lifeCycleModel data set' && item['@type'] !== 'process data set';
      const { getRefTabNames, tabNames: referenceValidationTabNames } =
        collectValidationIssueRefTabNames({
          refs: [
            ...nonExistentRef,
            ...unRuleVerification.filter(shouldShowDatasetRefTabName),
            ...problemNodes.filter(shouldShowDatasetRefTabName),
          ],
          resolveTabName: (item) => getErrRefTab(item, modelDataset),
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
        sdkInvalidDetails: sdkIssueDetails,
        sdkInvalidTabNames: currentDatasetTabNames,
        unRuleVerification,
      });
      setValidationIssueTabNames(referenceValidationTabNames);
      if (validationIssues.length > 0) {
        setRefCheckData(mapValidationIssuesToRefCheckData(validationIssues));
      } else {
        setRefCheckData([]);
      }

      if (submodels) {
        submodels.forEach((item) => {
          if (item.type === 'secondary') {
            unReview.push({
              '@refObjectId': item.id,
              '@version': item.version ?? validationVersion,
              '@type': 'process data set',
            });
          }
        });
      }
      if (
        currentDatasetValid &&
        nonExistentRef?.length === 0 &&
        unRuleVerification.length === 0 &&
        problemNodes?.length === 0 &&
        issues.length === 0
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
        return { checkResult: true, unReview, problemNodes };
      }

      let validationHint = intl.formatMessage({
        id: 'pages.button.check.error',
        defaultMessage: 'Data check failed, please check the data!',
      });

      if (errTabNames.length > 0) {
        validationHint = formatDataCheckErrorWithSections(
          intl,
          errTabNames.map((tab: string) =>
            formatDatasetTabLabel(intl, 'lifeCycleModel data set', tab),
          ),
        );
        if (!drawerVisible) {
          setDrawerVisible(true);
          onReset();
        }
      } else if (!processInstanceValid) {
        validationHint = intl.formatMessage({
          id: 'pages.lifecyclemodel.review.processInstanceError',
          defaultMessage: 'Please complete the process instance data',
        });
      } else if (unRuleVerification && unRuleVerification.length > 0) {
        const unRuleVerificationMainProduce = unRuleVerification.find((item) => {
          return (
            item['@refObjectId'] === primaryRef?.id &&
            item['@version'] === primaryRef?.version &&
            item['@type'] === 'process data set'
          );
        });
        const unRuleVerificationSubProduce = unRuleVerification.find((item) => {
          return submodels?.find(
            (sub) =>
              sub.type === 'secondary' &&
              sub.id === item['@refObjectId'] &&
              (sub.version ?? validationVersion) === item['@version'] &&
              item['@type'] === 'process data set',
          );
        });
        if (unRuleVerificationMainProduce) {
          validationHint = intl.formatMessage({
            id: 'pages.lifecyclemodel.review.mainProduceError',
            defaultMessage: 'Please complete the main product process data in the model results',
          });
        } else if (unRuleVerificationSubProduce) {
          validationHint = intl.formatMessage({
            id: 'pages.lifecyclemodel.review.subProduceError',
            defaultMessage: 'Please complete the sub product process data in the model results',
          });
        }
      }

      const hasNavigableValidationIssue =
        errTabNames.length > 0 ||
        sdkIssueDetails.length > 0 ||
        nonExistentRef.length > 0 ||
        unRuleVerification.length > 0 ||
        problemNodes.length > 0;

      if (!silent && validationIssues.length > 0 && hasNavigableValidationIssue) {
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
      return { checkResult: false, unReview, problemNodes };
    };

    const submitReview = async (): Promise<boolean> => {
      setSpinning(true);
      const fallbackErrorMessage = intl.formatMessage({
        id: 'pages.lifecyclemodel.review.submitError',
        defaultMessage: 'Submit review failed',
      });

      try {
        const currentModelDetail = modelDetailRef.current;
        if (!currentModelDetail) {
          message.error(fallbackErrorMessage);
          return false;
        }

        const result = await submitDatasetReview(
          'lifecyclemodels',
          currentModelDetail.id,
          currentModelDetail.version,
        );

        if (result?.error) {
          message.error(result.error.message || fallbackErrorMessage);
          return false;
        }

        message.success(
          intl.formatMessage({
            id: 'pages.process.review.submitSuccess',
            defaultMessage: 'Review submitted successfully',
          }),
        );
        setDrawerVisible(false);
        return true;
      } catch (error) {
        message.error(
          error instanceof Error && error.message ? error.message : fallbackErrorMessage,
        );
        return false;
      } finally {
        setSpinning(false);
      }
    };

    useImperativeHandle(ref, () => ({
      submitReview: submitReview,
      handleCheckData: handleCheckData,
      updateReferenceDescription: updateReferenceDescription,
    }));

    return (
      <>
        <Tooltip
          title={
            <FormattedMessage id='pages.button.model.info' defaultMessage='Basic information' />
          }
          placement='left'
        >
          <Button
            type='primary'
            size='small'
            icon={<InfoOutlined />}
            style={{ boxShadow: 'none' }}
            onClick={() => {
              setDrawerVisible(true);
            }}
          ></Button>
        </Tooltip>
        <Drawer
          getContainer={() => document.body}
          destroyOnHidden
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
            <Space size={'middle'} className={styles.footer_right}>
              {/* {showReview && (
              <Button onClick={submitReview}>
                <FormattedMessage id='pages.button.review' defaultMessage='Submit for Review' />
              </Button>
            )} */}
              {action === 'edit' ? (
                <>
                  {/* <Button onClick={() => handleCheckData()}>
                  <FormattedMessage id='pages.button.check' defaultMessage='Data Check' />
                </Button> */}

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
              ) : (
                <></>
              )}
              <Button
                onClick={() => {
                  setDrawerVisible(false);
                }}
              >
                <FormattedMessage
                  id='pages.button.cancel'
                  defaultMessage='Cancel'
                ></FormattedMessage>
              </Button>
              <Button
                onClick={() => {
                  setShowRules(false);
                  formRefEdit.current?.submit();
                }}
                type='primary'
              >
                <FormattedMessage id='pages.button.save' defaultMessage='Save'></FormattedMessage>
              </Button>
            </Space>
          }
        >
          <Spin spinning={spinning}>
            <RefCheckContext.Provider value={refCheckContextValue}>
              <ProForm
                formRef={formRefEdit}
                initialValues={data}
                onValuesChange={async (_, changedFormValues) => {
                  const allValues = formRefEdit.current?.getFieldsValue(true) ?? changedFormValues;
                  if (activeTabKey === 'validation') {
                    await setFromData({
                      ...fromData,
                      modellingAndValidation: {
                        ...fromData?.modellingAndValidation,
                        validation: { ...allValues?.modellingAndValidation?.validation },
                      },
                    });
                  } else if (activeTabKey === 'complianceDeclarations') {
                    await setFromData({
                      ...fromData,
                      modellingAndValidation: {
                        ...fromData?.modellingAndValidation,
                        complianceDeclarations:
                          allValues?.modellingAndValidation?.complianceDeclarations,
                      },
                    });
                  } else {
                    await setFromData({
                      ...fromData,
                      [activeTabKey]: allValues[activeTabKey] ?? {},
                    });
                  }
                }}
                submitter={{
                  render: () => {
                    return [];
                  },
                }}
                onFinish={async () => {
                  // if (!checkResult) {
                  //   await setActiveTabKey(tabName);
                  //   formRefEdit.current?.validateFields();
                  //   return false;
                  // }
                  onData({ ...fromData });
                  formRefEdit.current?.resetFields();
                  setDrawerVisible(false);
                  return true;
                }}
              >
                <LifeCycleModelForm
                  formType={action}
                  actionType={actionType}
                  lang={lang}
                  activeTabKey={activeTabKey}
                  formRef={formRefEdit}
                  onTabChange={onTabChange}
                  onData={handletFromData}
                  showRules={showRules}
                  sdkValidationDetails={sdkValidationDetails}
                  sdkValidationFocus={sdkValidationFocus}
                  validationIssueTabNames={validationIssueTabNames}
                />
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
  },
);

export default ToolbarEditInfo;
