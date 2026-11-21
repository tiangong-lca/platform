/* istanbul ignore file -- modal rendering is covered by behavioral tests; branch coverage is mostly UI-only formatting */
import { resolveBrandMessage } from '@/locales/brandMessages';
import type { ValidationIssue, ValidationIssueSdkDetail } from '@/pages/Utils/review';
import { dispatchAntdAppAction } from '@/contexts/AntdAppContext';
import { getSdkSuggestedFixMessage } from '@/pages/Utils/validation/messages';
import { formatDatasetTabLabel } from '@/pages/Utils/validation/tabMessages';
import { getLocaleDefinition } from '@/services/general/localeRegistry';
import {
  DEFAULT_BROWSER_APP_LOCALE,
  normalizeRuntimeLocale,
  subscribeRuntimeIntlChange,
  type RuntimeIntlShapeLike,
} from '@/services/general/runtimeLocale';
import { formatLocaleList, getLocaleListSeparator } from '@/utils/localeFormatting';
import { CloseOutlined } from '@ant-design/icons';
import { Button, ConfigProvider, Modal, Space, Table, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getBrandTheme } from '../../../config/branding';

type IntlShapeLike = RuntimeIntlShapeLike;

export type ValidationIssueModalTitleDescriptor =
  | {
      defaultMessage?: 'Validation issues';
      id: 'pages.validationIssues.modal.title';
    }
  | {
      defaultMessage?: 'Data validation issues';
      id: 'pages.validationIssues.modal.checkDataTitle';
    }
  | {
      defaultMessage?: 'Review submission blocked';
      id: 'pages.validationIssues.modal.reviewTitle';
    };

export type ValidationIssueModalTitleInput =
  string | ValidationIssueModalTitleDescriptor | ((intl: RuntimeIntlShapeLike) => string);

const resolveValidationIssueModalTitle = (
  intl: IntlShapeLike,
  title?: ValidationIssueModalTitleInput,
): string => {
  if (typeof title === 'function') {
    return title(intl);
  }
  if (typeof title === 'string') {
    return title;
  }

  switch (title?.id) {
    case 'pages.validationIssues.modal.checkDataTitle':
      return intl.formatMessage({
        id: 'pages.validationIssues.modal.checkDataTitle',
        defaultMessage: 'Data validation issues',
      });
    case 'pages.validationIssues.modal.reviewTitle':
      return intl.formatMessage({
        id: 'pages.validationIssues.modal.reviewTitle',
        defaultMessage: 'Review submission blocked',
      });
    case 'pages.validationIssues.modal.title':
    default:
      return intl.formatMessage({
        id: 'pages.validationIssues.modal.title',
        defaultMessage: 'Validation issues',
      });
  }
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getValidationIssueTabLabel = (
  intl: IntlShapeLike,
  issue: Pick<ValidationIssue, 'ref'>,
  tabName: string,
) => formatDatasetTabLabel(intl, issue.ref['@type'], tabName);

const getValidationIssueTabLabels = (intl: IntlShapeLike, issue: ValidationIssue) => {
  const tabNames = (issue.tabNames ?? []).filter(
    (tabName, index, allTabNames) => tabName && allTabNames.indexOf(tabName) === index,
  );

  return formatLocaleList(
    tabNames.map((tabName) => getValidationIssueTabLabel(intl, issue, tabName)),
    intl.locale,
  );
};

const getSdkInvalidIssueLabel = (intl: IntlShapeLike) =>
  intl.formatMessage({
    id: 'pages.validationIssues.issue.sdkInvalid',
    defaultMessage: 'Current dataset validation failed',
  });

const getIssueDescription = (intl: IntlShapeLike, issue: ValidationIssue) => {
  switch (issue.code) {
    case 'sdkInvalid': {
      const description = getSdkInvalidIssueLabel(intl);
      const tabLabels = getValidationIssueTabLabels(intl, issue);

      return tabLabels ? `${description}(${tabLabels})` : description;
    }
    case 'ruleVerificationFailed':
      return intl.formatMessage({
        id: 'pages.validationIssues.issue.ruleVerificationFailed',
        defaultMessage: 'Dataset validation did not pass',
      });
    case 'nonExistentRef':
      return intl.formatMessage({
        id: 'pages.validationIssues.issue.nonExistentRef',
        defaultMessage: 'Dataset does not exist',
      });
    case 'underReview':
      return intl.formatMessage({
        id: 'pages.validationIssues.issue.underReview',
        defaultMessage: 'Dataset is under review',
      });
    case 'versionUnderReview':
      return intl.formatMessage(
        {
          id: 'pages.validationIssues.issue.versionUnderReview',
          defaultMessage:
            'Another version {underReviewVersion} of this dataset is already under review',
        },
        {
          underReviewVersion: issue.underReviewVersion ?? '-',
        },
      );
    case 'versionIsInTg':
      return intl.formatMessage({
        id: 'pages.validationIssues.issue.versionIsInTg',
        defaultMessage: 'Current version is lower than the published version',
      });
    default:
      return issue.code;
  }
};

export type ValidationIssueNavigationTarget = {
  detail?: ValidationIssueSdkDetail;
  tabName?: string;
};

type ValidationIssueNavigateHandler = (target: ValidationIssueNavigationTarget) => void;

const getValidationIssueInteractiveTabNames = (issue: ValidationIssue) => {
  const tabNames = [
    ...((issue.sdkDetails ?? [])
      .filter((detail) => detail.presentation !== 'highlight-only')
      .map((detail) => detail.tabName)
      .filter(Boolean) as string[]),
    ...(issue.tabNames ?? []),
    ...(issue.tabName ? [issue.tabName] : []),
  ];

  return tabNames.filter(
    (tabName, index, allTabNames) => tabName && allTabNames.indexOf(tabName) === index,
  );
};

const getValidationIssueInteractiveDetails = (issue: ValidationIssue) => {
  return (issue.sdkDetails ?? []).filter(
    (detail, index, allDetails) =>
      detail?.key && allDetails.findIndex((item) => item.key === detail.key) === index,
  );
};

const getSdkNavigationHint = (intl: IntlShapeLike) =>
  intl.formatMessage({
    id: 'pages.validationIssues.issue.sdkInvalid.navigateHint',
    defaultMessage:
      'The invalid data in the corresponding tab will be highlighted. Complete it and try again.',
  });

const MULTIPLICATION_FACTOR_FIELD_TOKEN = '@multiplicationFactor';
const PROCESS_INSTANCE_FIELD_PATH_PREFIX = 'processInstance[#';
const VALIDATION_ISSUE_TABLE_SCROLL_X = 1164;

const validationIssueCellTextStyle: CSSProperties = {
  overflowWrap: 'anywhere',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
};

/* istanbul ignore next -- process-instance detail text fallbacks are UI-only formatting branches */
const getSdkDetailFieldToken = (detail?: ValidationIssueSdkDetail) => {
  if (Array.isArray(detail?.formName) && detail.formName.length > 0) {
    return detail.formName.map(String).join('.');
  }

  const fieldPath = detail?.fieldPath?.replace(/^processInstance\[#.+?\]\.?/, '').trim();
  return fieldPath || detail?.fieldPath || detail?.fieldLabel || '';
};

const getSdkProcessInstanceLabel = (intl: IntlShapeLike, detail: ValidationIssueSdkDetail) =>
  detail.processInstanceLabel?.trim() ||
  detail.processInstanceInternalId?.trim() ||
  intl.formatMessage({
    id: 'pages.validationIssues.issue.sdkInvalid.processInstanceFallback',
    defaultMessage: 'Unknown process',
  });

const isMultiplicationFactorMissingDetail = (detail?: ValidationIssueSdkDetail) =>
  detail?.presentation === 'highlight-only' &&
  detail.validationCode === 'required_missing' &&
  getSdkDetailFieldToken(detail) === MULTIPLICATION_FACTOR_FIELD_TOKEN;

const isLifecycleModelProcessInstanceDetail = (detail?: ValidationIssueSdkDetail) =>
  detail?.presentation === 'highlight-only' &&
  (detail.fieldPath?.startsWith(PROCESS_INSTANCE_FIELD_PATH_PREFIX) ||
    !!detail.processInstanceInternalId?.trim() ||
    !!detail.processInstanceLabel?.trim());

const getSdkInvalidIsolatedNodeHintText = (
  intl: IntlShapeLike,
  details: ValidationIssueSdkDetail[],
) => {
  const nodeNames = details
    .map((detail) => getSdkProcessInstanceLabel(intl, detail))
    .filter((label, index, labels) => label && labels.indexOf(label) === index);

  return intl.formatMessage(
    {
      id: 'pages.validationIssues.issue.sdkInvalid.processInstanceIsolatedNodeHint',
      defaultMessage: 'Please check whether these nodes are isolated ({nodeNames})',
    },
    {
      nodeNames: formatLocaleList(nodeNames, intl.locale),
    },
  );
};

/* istanbul ignore next -- process-instance detail text fallbacks are UI-only formatting branches */
const getSdkInvalidProcessInstanceDetailText = (
  intl: IntlShapeLike,
  detail: ValidationIssueSdkDetail,
) => {
  const processLabel = getSdkProcessInstanceLabel(intl, detail);
  const fieldName = getSdkDetailFieldToken(detail) || detail.fieldLabel;
  const suggestedFix = getSdkSuggestedFixMessage(intl, detail);

  if (detail.validationCode === 'required_missing') {
    return intl.formatMessage(
      {
        id: 'pages.validationIssues.issue.sdkInvalid.processInstanceRequiredField',
        defaultMessage: 'Process {processLabel} ({fieldName} missing)',
      },
      {
        processLabel,
        fieldName,
      },
    );
  }

  if (suggestedFix) {
    return intl.formatMessage(
      {
        id: 'pages.validationIssues.issue.sdkInvalid.processInstanceFieldWithFix',
        defaultMessage: 'Process {processLabel} ({fieldName}: {suggestedFix})',
      },
      {
        processLabel,
        fieldName,
        suggestedFix,
      },
    );
  }

  return intl.formatMessage(
    {
      id: 'pages.validationIssues.issue.sdkInvalid.processInstanceField',
      defaultMessage: 'Process {processLabel} ({fieldName})',
    },
    {
      processLabel,
      fieldName,
    },
  );
};

const getSdkInvalidProcessInstanceDetailActionItems = (
  intl: IntlShapeLike,
  issue: ValidationIssue,
) => {
  if (issue.ref['@type'] !== 'lifeCycleModel data set') {
    return [];
  }

  const interactiveDetails = getValidationIssueInteractiveDetails(issue).filter(
    (detail) => isLifecycleModelProcessInstanceDetail(detail) && !!detail.fieldPath,
  );
  const multiplicationFactorDetails = interactiveDetails.filter(
    isMultiplicationFactorMissingDetail,
  );
  const regularDetails = interactiveDetails.filter(
    (detail) => !isMultiplicationFactorMissingDetail(detail),
  );
  const actionItems: Array<{
    detail: ValidationIssueSdkDetail;
    key: string;
    text: string;
  }> = [];

  if (multiplicationFactorDetails.length > 0) {
    actionItems.push({
      detail: multiplicationFactorDetails[0],
      key: `isolated-node-hint:${multiplicationFactorDetails.map((detail) => detail.key).join('|')}`,
      text: getSdkInvalidIsolatedNodeHintText(intl, multiplicationFactorDetails),
    });
  }

  regularDetails.forEach((detail) => {
    actionItems.push({
      detail,
      key: detail.key,
      text: getSdkInvalidProcessInstanceDetailText(intl, detail),
    });
  });

  return actionItems;
};

type GroupedValidationIssue = {
  ref: ValidationIssue['ref'];
  link: string;
  issues: ValidationIssue[];
  ownerName: string;
  ownerUserId?: string;
  isOwnedByCurrentUser?: boolean;
  order: number;
};

const getValidationIssueGroupKey = (issue: Pick<ValidationIssue, 'ref'>) =>
  `${issue.ref['@type']}:${issue.ref['@refObjectId']}:${issue.ref['@version']}`;

const VALIDATION_ISSUE_DATASET_TYPE_ORDER = [
  'contact data set',
  'source data set',
  'unit group data set',
  'flow property data set',
  'flow data set',
  'process data set',
  'lifeCycleModel data set',
] as const;

const VALIDATION_ISSUE_DATASET_TYPE_ORDER_MAP = VALIDATION_ISSUE_DATASET_TYPE_ORDER.reduce<
  Record<string, number>
>((accumulator, type, index) => {
  accumulator[type] = index;
  return accumulator;
}, {});

const getValidationIssueDatasetTypeOrder = (type: string) =>
  VALIDATION_ISSUE_DATASET_TYPE_ORDER_MAP[type] ?? VALIDATION_ISSUE_DATASET_TYPE_ORDER.length;

const sortGroupedValidationIssues = (groupedIssues: GroupedValidationIssue[]) =>
  [...groupedIssues].sort((leftIssue, rightIssue) => {
    const typeOrderDiff =
      getValidationIssueDatasetTypeOrder(leftIssue.ref['@type']) -
      getValidationIssueDatasetTypeOrder(rightIssue.ref['@type']);

    if (typeOrderDiff !== 0) {
      return typeOrderDiff;
    }

    return leftIssue.order - rightIssue.order;
  });

const groupValidationIssues = (issues: ValidationIssue[]): GroupedValidationIssue[] => {
  const groupedIssues = new Map<string, GroupedValidationIssue>();

  issues.forEach((issue) => {
    const key = getValidationIssueGroupKey(issue);
    const existingGroup = groupedIssues.get(key);

    if (!existingGroup) {
      const ownerUserId = issue.ownerUserId?.trim();

      groupedIssues.set(key, {
        ref: issue.ref,
        link: issue.link,
        issues: [issue],
        ownerName: issue.ownerName?.trim() || '-',
        ownerUserId: ownerUserId || undefined,
        isOwnedByCurrentUser: issue.isOwnedByCurrentUser,
        order: groupedIssues.size,
      });
      return;
    }

    const duplicatedIssue = existingGroup.issues.some(
      (existingIssue) =>
        existingIssue.code === issue.code &&
        existingIssue.underReviewVersion === issue.underReviewVersion,
    );

    if (!duplicatedIssue) {
      existingGroup.issues.push(issue);
    }

    if (!existingGroup.link && issue.link) {
      existingGroup.link = issue.link;
    }

    if (existingGroup.ownerName === '-' && issue.ownerName?.trim()) {
      existingGroup.ownerName = issue.ownerName.trim();
    }

    if (!existingGroup.ownerUserId && issue.ownerUserId?.trim()) {
      existingGroup.ownerUserId = issue.ownerUserId.trim();
    }

    if (issue.isOwnedByCurrentUser === false) {
      existingGroup.isOwnedByCurrentUser = false;
    } else if (
      existingGroup.isOwnedByCurrentUser === undefined &&
      typeof issue.isOwnedByCurrentUser === 'boolean'
    ) {
      existingGroup.isOwnedByCurrentUser = issue.isOwnedByCurrentUser;
    }
  });

  return sortGroupedValidationIssues(Array.from(groupedIssues.values()));
};

const getGroupedIssueDescriptions = (
  intl: IntlShapeLike,
  groupedIssue: GroupedValidationIssue,
): string[] => {
  const descriptions = groupedIssue.issues.map((issue) => getIssueDescription(intl, issue));

  return descriptions.filter((description, index) => descriptions.indexOf(description) === index);
};

const isValidationIssueLinkDisabled = (groupedIssue: GroupedValidationIssue) =>
  groupedIssue.issues.some((issue) => issue.code === 'nonExistentRef');

const getValidationIssueActionLabel = (
  intl: IntlShapeLike,
  groupedIssue: GroupedValidationIssue,
  options?: {
    notified?: boolean;
  },
) => {
  const shouldNotifyDataOwner = groupedIssue.isOwnedByCurrentUser === false;

  if (shouldNotifyDataOwner && options?.notified) {
    return intl.formatMessage({
      id: 'pages.validationIssues.dataOwnerNotified',
      defaultMessage: 'Notified',
    });
  }

  return intl.formatMessage({
    id: shouldNotifyDataOwner
      ? 'pages.validationIssues.notifyDataOwner'
      : 'pages.validationIssues.fixIssue',
    defaultMessage: shouldNotifyDataOwner ? 'Notify data owner' : 'Fix issue',
  });
};

const getDatasetTypeLabel = (intl: IntlShapeLike, type: string) => {
  switch (type) {
    case 'contact data set':
      return intl.formatMessage({
        id: 'pages.validationIssues.datasetType.contact',
        defaultMessage: 'Contact',
      });
    case 'source data set':
      return intl.formatMessage({
        id: 'pages.validationIssues.datasetType.source',
        defaultMessage: 'Source',
      });
    case 'unit group data set':
      return intl.formatMessage({
        id: 'pages.validationIssues.datasetType.unitgroup',
        defaultMessage: 'Unit group',
      });
    case 'flow property data set':
      return intl.formatMessage({
        id: 'pages.validationIssues.datasetType.flowproperty',
        defaultMessage: 'Flow property',
      });
    case 'flow data set':
      return intl.formatMessage({
        id: 'pages.validationIssues.datasetType.flow',
        defaultMessage: 'Flow',
      });
    case 'process data set':
      return intl.formatMessage({
        id: 'pages.validationIssues.datasetType.process',
        defaultMessage: 'Process',
      });
    case 'lifeCycleModel data set':
      return intl.formatMessage({
        id: 'pages.validationIssues.datasetType.lifecyclemodel',
        defaultMessage: 'Life cycle model',
      });
    default:
      return type;
  }
};

function getValidationIssueBrandTheme() {
  return getBrandTheme(
    typeof window !== 'undefined' && localStorage.getItem('isDarkMode') === 'true',
  );
}

const buildValidationIssueHtml = (
  intl: IntlShapeLike,
  issues: ValidationIssue[],
  title: string,
) => {
  const brandTheme = getValidationIssueBrandTheme();
  const reportLocale = normalizeRuntimeLocale(intl.locale) ?? DEFAULT_BROWSER_APP_LOCALE;
  const reportLocaleDefinition = getLocaleDefinition(reportLocale);
  const tableRows = groupValidationIssues(issues)
    .map((groupedIssue) => {
      const typeLabel = getDatasetTypeLabel(intl, groupedIssue.ref['@type']);
      const descriptions = getGroupedIssueDescriptions(intl, groupedIssue);
      const description = descriptions.map((item) => escapeHtml(item)).join('<br />');
      const shouldNotifyDataOwner = groupedIssue.isOwnedByCurrentUser === false;
      const actionLabel = getValidationIssueActionLabel(intl, groupedIssue);
      const action = shouldNotifyDataOwner
        ? '-'
        : groupedIssue.link
          ? isValidationIssueLinkDisabled(groupedIssue)
            ? `<span class="action-link-disabled">${escapeHtml(actionLabel)}</span>`
            : `<a class="action-link" href="${escapeHtml(
                groupedIssue.link,
              )}" target="_blank" rel="noreferrer">${escapeHtml(actionLabel)}</a>`
          : '-';

      return `<tr>
  <td>${escapeHtml(typeLabel)}</td>
  <td>${escapeHtml(groupedIssue.ref['@refObjectId'])}</td>
  <td>${escapeHtml(groupedIssue.ref['@version'])}</td>
  <td>${description}</td>
  <td>${escapeHtml(groupedIssue.ownerName)}</td>
  <td>${action}</td>
</tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(reportLocaleDefinition.canonicalLocale)}" dir="${escapeHtml(
    reportLocaleDefinition.direction,
  )}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #1f1f1f; }
      h1 { font-size: 20px; margin-bottom: 8px; }
      p { color: #595959; margin-bottom: 16px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #d9d9d9; padding: 8px 10px; text-align: start; vertical-align: top; }
      th { background: #fafafa; }
      .action-link { color: ${escapeHtml(brandTheme.colorPrimary)}; font-weight: 600; text-decoration: none; }
      .action-link-disabled { color: #bfbfbf; cursor: not-allowed; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(
      resolveBrandMessage(
        intl.locale,
        'pages.validationIssues.report.generated',
        intl.formatMessage({
          id: 'pages.validationIssues.report.generated',
          defaultMessage: 'Generated from TianGong LCA data validation.',
        }),
      ),
    )}</p>
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(
            intl.formatMessage({
              id: 'pages.validationIssues.table.datasetType',
              defaultMessage: 'Dataset type',
            }),
          )}</th>
          <th>${escapeHtml(
            intl.formatMessage({
              id: 'pages.validationIssues.table.id',
              defaultMessage: 'ID',
            }),
          )}</th>
          <th>${escapeHtml(
            intl.formatMessage({
              id: 'pages.validationIssues.table.version',
              defaultMessage: 'Version',
            }),
          )}</th>
          <th>${escapeHtml(
            intl.formatMessage({
              id: 'pages.validationIssues.table.issue',
              defaultMessage: 'Issue',
            }),
          )}</th>
          <th>${escapeHtml(
            intl.formatMessage({
              id: 'pages.validationIssues.table.user',
              defaultMessage: 'Data owner',
            }),
          )}</th>
          <th>${escapeHtml(
            intl.formatMessage({
              id: 'pages.validationIssues.table.action',
              defaultMessage: 'Action',
            }),
          )}</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </body>
</html>`;
};

const downloadValidationIssueHtml = (
  intl: IntlShapeLike,
  issues: ValidationIssue[],
  title: string,
) => {
  const report = buildValidationIssueHtml(intl, issues, title);
  const blob = new Blob([report], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const isJsdomEnvironment = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);

  link.href = url;
  link.download = `validation-issues-${timestamp}.html`;
  document.body.appendChild(link);
  if (!isJsdomEnvironment) {
    link.click();
  }
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const openValidationIssueLink = (link: string) => {
  window.open(link, '_blank', 'noopener,noreferrer');
};

const ValidationIssueModalTitle = ({ title }: { title: string }) => {
  const { token } = theme.useToken();

  return (
    <span
      style={{
        color: token.colorTextHeading,
        fontSize: token.fontSizeHeading4,
        fontWeight: token.fontWeightStrong,
        lineHeight: 1.4,
      }}
    >
      {title}
    </span>
  );
};

const ValidationIssueCloseIcon = () => {
  const { token } = theme.useToken();

  return (
    <CloseOutlined
      style={{
        color: token.colorTextSecondary,
        fontSize: token.fontSizeLG,
      }}
    />
  );
};

const ValidationIssueFooter = ({
  intl,
  issues,
  onConfirm,
  title,
}: {
  intl: IntlShapeLike;
  issues: ValidationIssue[];
  onConfirm: () => void;
  title: string;
}) => {
  const { token } = theme.useToken();

  return (
    <Space size={token.marginSM}>
      <Button onClick={() => downloadValidationIssueHtml(intl, issues, title)}>
        {intl.formatMessage({
          id: 'pages.validationIssues.downloadHtml',
          defaultMessage: 'Download Data Validation Report',
        })}
      </Button>
      <Button type='primary' onClick={onConfirm}>
        {intl.formatMessage({
          id: 'pages.validationIssues.confirm',
          defaultMessage: 'Got it',
        })}
      </Button>
    </Space>
  );
};

type ValidationIssueModalContentProps = {
  intl: IntlShapeLike;
  issues: ValidationIssue[];
  onNavigate?: ValidationIssueNavigateHandler;
};

const ValidationIssueModalContent = ({
  intl,
  issues,
  onNavigate,
}: ValidationIssueModalContentProps) => {
  const { token } = theme.useToken();
  const groupedIssues = useMemo(() => groupValidationIssues(issues), [issues]);
  const [loadingIssueKey, setLoadingIssueKey] = useState<string | null>(null);
  const [notifiedIssueKeys, setNotifiedIssueKeys] = useState<Record<string, boolean>>({});

  const renderInteractiveTabs = (issue: ValidationIssue) => {
    const interactiveTabNames = getValidationIssueInteractiveTabNames(issue);
    const interactiveDetails = getValidationIssueInteractiveDetails(issue);

    if (interactiveTabNames.length === 0 || !onNavigate) {
      return null;
    }

    return (
      <span>
        {interactiveTabNames.map((tabName, index) => {
          const tabLabel = getValidationIssueTabLabel(intl, issue, tabName);
          const matchedDetail =
            interactiveDetails.find((detail) => detail.tabName === tabName) ??
            interactiveDetails[0];

          return (
            <span key={tabName}>
              <span title={getSdkNavigationHint(intl)}>
                <Button
                  type='link'
                  style={{
                    color: token.colorPrimary,
                    fontWeight: token.fontWeightStrong,
                    height: 'auto',
                    padding: 0,
                  }}
                  onClick={() => onNavigate({ detail: matchedDetail, tabName })}
                >
                  {tabLabel}
                </Button>
              </span>
              {getLocaleListSeparator(index, interactiveTabNames.length, intl.locale)}
            </span>
          );
        })}
      </span>
    );
  };

  const renderInteractiveProcessInstanceDetails = (issue: ValidationIssue) => {
    const interactiveDetails = getSdkInvalidProcessInstanceDetailActionItems(intl, issue);

    if (interactiveDetails.length === 0 || !onNavigate) {
      return null;
    }

    return (
      <div
        style={{
          marginTop: token.marginXS ?? 8,
        }}
      >
        {interactiveDetails.map((detailItem, index) => (
          <div key={detailItem.key}>
            <Button
              type='link'
              style={{
                color: token.colorPrimary,
                fontWeight: token.fontWeightStrong,
                height: 'auto',
                maxWidth: '100%',
                padding: 0,
                textAlign: 'left',
                ...validationIssueCellTextStyle,
              }}
              onClick={() =>
                onNavigate({ detail: detailItem.detail, tabName: detailItem.detail.tabName })
              }
            >
              {detailItem.text}
            </Button>
            {index < interactiveDetails.length - 1 ? (
              <div style={{ height: token.marginXXS ?? 4 }} />
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  const renderIssueCell = (issue: ValidationIssue) => {
    if (issue.code !== 'sdkInvalid' || !onNavigate) {
      return getIssueDescription(intl, issue);
    }

    const interactiveTabs = renderInteractiveTabs(issue);
    const interactiveProcessInstanceDetails = renderInteractiveProcessInstanceDetails(issue);

    if (!interactiveTabs && !interactiveProcessInstanceDetails) {
      return getIssueDescription(intl, issue);
    }

    return (
      <div>
        <div
          style={{
            color: token.colorText,
            lineHeight: token.lineHeight,
          }}
        >
          <span>{getSdkInvalidIssueLabel(intl)}</span>
          {interactiveTabs ? (
            <>
              <span>(</span>
              {interactiveTabs}
              <span>)</span>
            </>
          ) : null}
        </div>
        {interactiveProcessInstanceDetails}
      </div>
    );
  };

  const handleNotifyDataOwner = async (groupedIssue: GroupedValidationIssue) => {
    const issueKey = getValidationIssueGroupKey(groupedIssue);

    if (!groupedIssue.ownerUserId) {
      dispatchAntdAppAction(({ message }) =>
        message.error(
          intl.formatMessage({
            id: 'pages.validationIssues.notifyDataOwner.ownerMissing',
            defaultMessage: 'Unable to identify the data owner.',
          }),
        ),
      );
      return;
    }

    setLoadingIssueKey(issueKey);
    try {
      const { upsertValidationIssueNotification } =
        require('@/services/notifications/api') as typeof import('@/services/notifications/api');
      const result = await upsertValidationIssueNotification({
        recipientUserId: groupedIssue.ownerUserId,
        ref: groupedIssue.ref,
        link: groupedIssue.link,
        issues: groupedIssue.issues.map((issue) => ({
          code: issue.code,
          tabName: issue.tabName,
          tabNames: issue.tabNames,
          underReviewVersion: issue.underReviewVersion,
        })),
      });

      if (!result.success) {
        throw result.error ?? new Error('notify_data_owner_failed');
      }

      setNotifiedIssueKeys((prev) => ({
        ...prev,
        [issueKey]: true,
      }));
      dispatchAntdAppAction(({ message }) =>
        message.success(
          intl.formatMessage({
            id: 'pages.validationIssues.notifyDataOwner.success',
            defaultMessage: 'Notification sent to the data owner.',
          }),
        ),
      );
    } catch (error) {
      dispatchAntdAppAction(({ message }) =>
        message.error(
          intl.formatMessage({
            id: 'pages.validationIssues.notifyDataOwner.error',
            defaultMessage: 'Failed to notify the data owner.',
          }),
        ),
      );
    } finally {
      setLoadingIssueKey(null);
    }
  };

  const columns: ColumnsType<GroupedValidationIssue> = [
    {
      title: intl.formatMessage({
        id: 'pages.validationIssues.table.datasetType',
        defaultMessage: 'Dataset type',
      }),
      dataIndex: 'ref',
      key: 'datasetType',
      width: 148,
      render: (_, groupedIssue) => getDatasetTypeLabel(intl, groupedIssue.ref['@type']),
    },
    {
      title: intl.formatMessage({
        id: 'pages.validationIssues.table.id',
        defaultMessage: 'ID',
      }),
      key: 'id',
      width: 220,
      onCell: () => ({
        style: validationIssueCellTextStyle,
      }),
      render: (_, groupedIssue) => groupedIssue.ref['@refObjectId'],
    },
    {
      title: intl.formatMessage({
        id: 'pages.validationIssues.table.version',
        defaultMessage: 'Version',
      }),
      key: 'version',
      width: 128,
      render: (_, groupedIssue) => groupedIssue.ref['@version'],
    },
    {
      title: intl.formatMessage({
        id: 'pages.validationIssues.table.issue',
        defaultMessage: 'Issue',
      }),
      key: 'issue',
      width: 380,
      onCell: () => ({
        style: validationIssueCellTextStyle,
      }),
      render: (_, groupedIssue) => {
        if (groupedIssue.issues.length <= 1) {
          return renderIssueCell(groupedIssue.issues[0]);
        }

        return groupedIssue.issues.map((issue, index) => (
          <div
            key={`${issue.code ?? 'unknown'}:${issue.underReviewVersion ?? '-'}:${index}`}
            style={{
              color: token.colorText,
              lineHeight: token.lineHeight,
            }}
          >
            {renderIssueCell(issue)}
          </div>
        ));
      },
    },
    {
      title: intl.formatMessage({
        id: 'pages.validationIssues.table.user',
        defaultMessage: 'Data owner',
      }),
      key: 'ownerName',
      width: 160,
      onCell: () => ({
        style: validationIssueCellTextStyle,
      }),
      render: (_, groupedIssue) => groupedIssue.ownerName,
    },
    {
      title: intl.formatMessage({
        id: 'pages.validationIssues.table.action',
        defaultMessage: 'Action',
      }),
      key: 'action',
      width: 128,
      render: (_, groupedIssue) => {
        const issueKey = getValidationIssueGroupKey(groupedIssue);
        const shouldNotifyDataOwner = groupedIssue.isOwnedByCurrentUser === false;
        const actionLabel = getValidationIssueActionLabel(intl, groupedIssue, {
          notified: notifiedIssueKeys[issueKey],
        });
        const isNotifyActionDisabled = notifiedIssueKeys[issueKey] || loadingIssueKey === issueKey;
        const isOpenActionDisabled = isValidationIssueLinkDisabled(groupedIssue);
        const isDisabled = shouldNotifyDataOwner ? isNotifyActionDisabled : isOpenActionDisabled;
        // Only sdkInvalid describes the current dataset. Reference rows must
        // keep their own dataset link even when the editor supplies onNavigate.
        const sdkIssue = groupedIssue.issues.find((issue) => issue.code === 'sdkInvalid');
        const detail = sdkIssue
          ? getValidationIssueInteractiveDetails(sdkIssue).find((item) => item.tabName)
          : undefined;
        const tabName =
          detail?.tabName ??
          (sdkIssue ? getValidationIssueInteractiveTabNames(sdkIssue)[0] : undefined);
        const canNavigateLocally = !shouldNotifyDataOwner && !!onNavigate && !!tabName;

        return groupedIssue.link || canNavigateLocally ? (
          <Button
            type='link'
            disabled={isDisabled}
            loading={loadingIssueKey === issueKey}
            style={{
              color: isDisabled ? token.colorTextDisabled : token.colorPrimary,
              fontWeight: token.fontWeightStrong,
              paddingInline: 0,
            }}
            onClick={() => {
              if (shouldNotifyDataOwner) {
                void handleNotifyDataOwner(groupedIssue);
                return;
              }

              if (canNavigateLocally) {
                onNavigate?.({ detail, tabName });
                return;
              }

              openValidationIssueLink(groupedIssue.link ?? '');
            }}
          >
            {actionLabel}
          </Button>
        ) : (
          '-'
        );
      },
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={groupedIssues}
      pagination={false}
      rowKey={(groupedIssue) => getValidationIssueGroupKey(groupedIssue)}
      scroll={{ x: VALIDATION_ISSUE_TABLE_SCROLL_X, y: 360 }}
      sticky
      size='small'
      style={{
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        overflow: 'hidden',
      }}
      tableLayout='fixed'
    />
  );
};

const ValidationIssueModalRenderer = ({
  intl,
  issues,
  onNavigate,
  onDestroy,
  title,
}: {
  intl: IntlShapeLike;
  issues: ValidationIssue[];
  onNavigate?: ValidationIssueNavigateHandler;
  onDestroy: () => void;
  title?: ValidationIssueModalTitleInput;
}) => {
  const [open, setOpen] = useState(true);
  const [activeIntl, setActiveIntl] = useState(intl);
  const brandTheme = useMemo(() => getValidationIssueBrandTheme(), []);
  const { token } = theme.useToken();
  const modalZIndex = (token as typeof token & { zIndexPopupBase?: number }).zIndexPopupBase
    ? ((token as typeof token & { zIndexPopupBase?: number }).zIndexPopupBase ?? 1000) + 1000
    : 2000;

  useEffect(() => {
    setActiveIntl(intl);
    return subscribeRuntimeIntlChange(setActiveIntl);
  }, [intl]);

  useEffect(() => {
    if (!open) {
      const timer = window.setTimeout(() => {
        onDestroy();
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }
  }, [onDestroy, open]);

  const handleNavigate = (target: ValidationIssueNavigationTarget) => {
    onNavigate?.(target);
    setOpen(false);
  };
  const resolvedTitle = resolveValidationIssueModalTitle(activeIntl, title);

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: brandTheme.colorPrimary,
        },
      }}
    >
      <Modal
        centered
        closable
        closeIcon={<ValidationIssueCloseIcon />}
        destroyOnHidden
        footer={
          <ValidationIssueFooter
            intl={activeIntl}
            issues={issues}
            onConfirm={() => setOpen(false)}
            title={resolvedTitle}
          />
        }
        open={open}
        title={<ValidationIssueModalTitle title={resolvedTitle} />}
        width={1000}
        zIndex={modalZIndex}
        onCancel={() => setOpen(false)}
      >
        <ValidationIssueModalContent
          intl={activeIntl}
          issues={issues}
          onNavigate={onNavigate ? handleNavigate : undefined}
        />
      </Modal>
    </ConfigProvider>
  );
};

export const showValidationIssueModal = ({
  intl,
  issues,
  onNavigate,
  title,
}: {
  intl: IntlShapeLike;
  issues: ValidationIssue[];
  onNavigate?: ValidationIssueNavigateHandler;
  title?: ValidationIssueModalTitleInput;
}) => {
  if (!issues.length) {
    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let destroyed = false;

  const destroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    root.unmount();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  };

  root.render(
    <ValidationIssueModalRenderer
      intl={intl}
      issues={issues}
      onNavigate={onNavigate}
      onDestroy={destroy}
      title={title}
    />,
  );

  return { destroy };
};
