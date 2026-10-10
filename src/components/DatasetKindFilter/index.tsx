import { Select } from 'antd';
import { useIntl } from 'umi';
import { DATASET_KINDS, type DatasetKindFilter as Kind } from '@/services/datasetDisplay/api';
import type { OpenDataDatasetKind } from '@/services/openDataCatalog/types';
const typeMessages = {
  lifecyclemodel: {
    id: 'pages.validationIssues.datasetType.lifecyclemodel',
    defaultMessage: 'Life cycle model',
  },
  process: { id: 'pages.validationIssues.datasetType.process', defaultMessage: 'Process' },
  flow: { id: 'pages.validationIssues.datasetType.flow', defaultMessage: 'Flow' },
  flowproperty: {
    id: 'pages.validationIssues.datasetType.flowproperty',
    defaultMessage: 'Flow property',
  },
  unitgroup: { id: 'pages.validationIssues.datasetType.unitgroup', defaultMessage: 'Unit group' },
  source: { id: 'pages.validationIssues.datasetType.source', defaultMessage: 'Source' },
  contact: { id: 'pages.validationIssues.datasetType.contact', defaultMessage: 'Contact' },
};
export const datasetKindMessage = (kind: OpenDataDatasetKind) => typeMessages[kind];
export default function DatasetKindFilter({
  value,
  onChange,
  disabled = false,
}: {
  value: Kind;
  onChange: (kind: Kind) => void;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const all = intl.formatMessage({
    id: 'pages.table.filter.all.datasetType',
    defaultMessage: 'Type of data set',
  });
  return (
    <Select<Kind>
      aria-label={all}
      value={value}
      disabled={disabled}
      style={{ minWidth: 150 }}
      options={[
        { value: 'all', label: all },
        ...DATASET_KINDS.map((kind) => ({
          value: kind,
          label: intl.formatMessage(datasetKindMessage(kind)),
        })),
      ]}
      onChange={onChange}
    />
  );
}
