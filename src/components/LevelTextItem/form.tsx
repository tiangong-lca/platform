import {
  classificationClassesToForm,
  classificationClassesToJson,
} from '@/services/classifications/serialization';
import {
  getClassificationSource,
  isClassificationPath,
  usesBuiltInClassification,
} from '@/services/classifications/system';
import TidasRepeatedField from '@/components/TidasRepeatedField';
import RequiredMark from '@/components/RequiredMark';
import { getILCDClassification, getILCDFlowCategorization } from '@/services/classifications/api';
import { Cascader, Form, Input, TreeSelect } from 'antd';
import { ClassificationCollectionField } from './collection';
import type { ReactNode } from 'react';
import { FC, useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';
type Props = {
  name: any;
  lang: string;
  dataType: string;
  flowType?: string;
  formRef: React.RefObject<any | undefined>;
  hidden?: boolean;
  onData: () => void;
  rules?: any[];
  required?: boolean;
  showRules?: boolean;
  validationHelp?: ReactNode;
  validationStatus?: 'success' | 'warning' | 'error' | 'validating';
};

export const LevelTextItemForm: FC<Props> = ({
  name,
  lang,
  dataType,
  flowType,
  formRef,
  hidden,
  onData,
  rules = [],
  showRules = false,
  validationHelp,
  validationStatus,
}) => {
  const [selectOptions, setSelectOptions] = useState<any>([]);
  const [hasClassId, setHasClassId] = useState<boolean>(false);
  const hasRequiredRuleError = showRules && !hasClassId;

  const getNodePath = (
    targetId: string,
    nodes: any[],
  ): { ids: string[]; values: string[]; labels: string[] } => {
    const findPath = (
      currentNodes: any[],
      pathIds: string[],
      pathValues: string[],
      pathLabels: string[],
    ): { ids: string[]; values: string[]; labels: string[] } | null => {
      for (const node of currentNodes) {
        const currentId = node.id;
        const currentValue = node.value || node.title;
        const currentLabel = node.label || node.title;

        if (node.id === targetId) {
          return {
            ids: [...pathIds, currentId],
            values: [...pathValues, currentValue],
            labels: [...pathLabels, currentLabel],
          };
        }

        if (node.children && node.children.length > 0) {
          const result = findPath(
            node.children,
            [...pathIds, currentId],
            [...pathValues, currentValue],
            [...pathLabels, currentLabel],
          );
          if (result) {
            return result;
          }
        }
      }
      return null;
    };

    const result = findPath(nodes, [], [], []);
    return result || { ids: [], values: [], labels: [] };
  };

  const getIdByValue = (value: string, nodes: any[]): string => {
    const findId = (currentNodes: any[]): string | null => {
      for (const node of currentNodes) {
        if (!node.children && (node.value === value || node.title === value)) {
          return node.id;
        }
        if (node.children && node.children.length > 0) {
          const result = findId(node.children);
          if (result) {
            return result;
          }
        }
      }
      return null;
    };
    return findId(nodes) || '';
  };

  const processTreeData = (treeData: any[]): any[] => {
    const addFullPath = (nodes: any[], parentPath: string[] = []): any[] => {
      return nodes.map((node) => {
        const newNode = { ...node };
        const currentPath = [...parentPath, node.label];
        newNode.title = currentPath.join('/');

        if (node.children && node.children.length > 0) {
          newNode.selectable = false;
          newNode.children = addFullPath(node.children, currentPath);
        } else {
          newNode.selectable = true;
        }
        return newNode;
      });
    };
    return addFullPath(treeData);
  };

  const setShowValue = async () => {
    const field = formRef.current?.getFieldValue(name);
    if (
      field &&
      field.id &&
      field.id?.length &&
      field.id.every((item: string) => typeof item === 'string' && item.length !== 0)
    ) {
      const id = field.id[field.id.length - 1];
      setHasClassId(true);
      await formRef.current?.setFieldValue([...name, 'showValue'], id);
    } else if (
      field &&
      field.value &&
      field.value?.length &&
      field.value.every((item: any) => item)
    ) {
      const value = field.value[field.value.length - 1];
      const id = getIdByValue(value, selectOptions);
      await formRef.current?.setFieldValue([...name, 'showValue'], id);
      setHasClassId(true);
    } else {
      setHasClassId(false);
    }
  };

  useEffect(() => {
    let active = true;

    const fetchClassification = async (dt: string, ft: string | undefined) => {
      if (dt === 'Flow' && !ft) {
        setSelectOptions([]);
        return;
      }

      setSelectOptions([]);
      try {
        const result =
          dt === 'Flow' && ft === 'Elementary flow'
            ? await getILCDFlowCategorization(lang, ['all'])
            : await getILCDClassification(dt, lang, ['all']);
        if (active) {
          setSelectOptions(processTreeData(result?.data ?? []));
        }
      } catch {
        if (active) {
          setSelectOptions([]);
        }
      }
    };

    fetchClassification(dataType, flowType);
    return () => {
      active = false;
    };
  }, [dataType, flowType, lang]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void setShowValue();
    });
    return () => window.clearTimeout(timer);
  });

  const handleValueChange = async (item: any) => {
    const fullPath = getNodePath(item, selectOptions);
    await formRef.current?.setFieldValue([...name, 'id'], fullPath.ids);
    await formRef.current?.setFieldValue([...name, 'value'], fullPath.values);
    await formRef.current?.setFieldValue(
      [...name, 'showValue'],
      fullPath.ids[fullPath.ids.length - 1],
    );
    if (fullPath?.ids?.length > 0) {
      setHasClassId(true);
    } else {
      setHasClassId(false);
    }
    onData();
  };

  return (
    <>
      <Form.Item
        hidden={hidden}
        required={false}
        label={
          <RequiredMark
            showError={false}
            label={
              <FormattedMessage id='pages.contact.classification' defaultMessage='Classification' />
            }
          />
        }
        name={[...name, 'showValue']}
        rules={rules}
        validateStatus={hasRequiredRuleError ? 'error' : validationStatus}
        help={
          hasRequiredRuleError ? (
            <FormattedMessage
              id='pages.contact.validator.classification.required'
              defaultMessage='Please input classification'
            />
          ) : (
            validationHelp
          )
        }
      >
        <TreeSelect
          allowClear
          classNames={{
            root: 'tg-classification-reference-select',
            popup: {
              root: 'tg-classification-reference-popup',
              itemTitle: 'tg-classification-reference-node-title',
            },
          }}
          treeDefaultExpandedKeys={
            formRef.current?.getFieldValue([...name, 'showValue'])
              ? [formRef.current?.getFieldValue([...name, 'showValue'])]
              : []
          }
          onChange={handleValueChange}
          fieldNames={{ label: 'label', value: 'id', children: 'children' }}
          style={{ width: '100%' }}
          treeData={selectOptions}
          showSearch={{
            filterTreeNode: (inputValue, treeNode) => {
              return (treeNode?.title as string)?.toLowerCase().includes(inputValue.toLowerCase());
            },
            treeNodeFilterProp: 'title',
          }}
          treeExpandAction='click'
          // labelInValue={true}
          treeNodeLabelProp='title'
        />
      </Form.Item>
      <Form.Item name={[...name, 'id']} hidden={true}>
        <Input />
      </Form.Item>
      <Form.Item name={[...name, 'value']} hidden={true}>
        <Cascader options={selectOptions} />
      </Form.Item>
    </>
  );
};

const ClassificationSystemsForm: FC<Props> = (props) => {
  const form = Form.useFormInstance();
  const intl = useIntl();
  const required = props.required ?? true;
  const validationEnabled = props.showRules || (props.rules?.length ?? 0) > 0;
  const systemPath = props.name.slice(0, -1);
  const classKey = props.name[props.name.length - 1];
  const value =
    Form.useWatch(systemPath, { form, preserve: true }) ?? form.getFieldValue(systemPath);
  useEffect(() => {
    if (
      props.hidden ||
      classKey === 'common:category' ||
      (props.dataType === 'Flow' && (!props.flowType || props.flowType === 'Elementary flow'))
    )
      return;
    const current = form.getFieldValue(systemPath);
    const items = Array.isArray(current) ? current : [current];
    const source = getClassificationSource(props.dataType);
    let changed = false;
    items.forEach((item, index) => {
      if (usesBuiltInClassification(item, props.dataType)) {
        const path = Array.isArray(current) ? [...systemPath, index] : systemPath;
        if (!item?.['@name']) {
          form.setFieldValue([...path, '@name'], source.name);
          changed = true;
        }
        if (!item?.['@classes'] && source.uri) {
          form.setFieldValue([...path, '@classes'], source.uri);
          changed = true;
        }
      }
    });
    if (changed) props.onData();
  }, [
    classKey,
    form,
    props.dataType,
    props.flowType,
    props.hidden,
    props.onData,
    systemPath,
    value,
  ]);

  const updateIdentity = (itemPath: (string | number)[], key: string, value: string) => {
    const system = { ...form.getFieldValue(itemPath), [key]: value };
    const classes = system[classKey];
    form.setFieldValue(
      [...itemPath, classKey],
      usesBuiltInClassification(system, props.dataType)
        ? classificationClassesToForm(system, props.dataType)
        : isClassificationPath(classes)
          ? classificationClassesToJson(system)
          : classes,
    );
    props.onData();
  };
  if (props.hidden) return null;
  const classRules = validationEnabled
    ? [
        {
          required: true,
          whitespace: true,
          message: intl.formatMessage({
            id: 'pages.classification.requiredValue',
            defaultMessage: 'Please fill in this required classification field.',
          }),
        },
      ]
    : [];
  const collectionMessage = intl.formatMessage({
    id: 'pages.contact.validator.classification.required',
    defaultMessage: 'Please input classification',
  });
  return (
    <ClassificationCollectionField
      name={systemPath}
      required={required}
      enabled={!!validationEnabled}
      message={collectionMessage}
    >
      <TidasRepeatedField name={systemPath} onChange={props.onData} keepFirst>
        {(itemPath) => {
          const item =
            itemPath.length === systemPath.length ? value : value?.[itemPath[itemPath.length - 1]];
          return (
            <>
              {classKey !== 'common:category' && (
                <>
                  <Form.Item
                    name={[...itemPath, '@name']}
                    required={Array.isArray(value)}
                    rules={Array.isArray(value) ? classRules : []}
                    label={
                      <FormattedMessage
                        id='pages.classification.systemName'
                        defaultMessage='Classification system'
                      />
                    }
                  >
                    <Input
                      onChange={(event) => updateIdentity(itemPath, '@name', event.target.value)}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[...itemPath, '@classes']}
                    label={
                      <FormattedMessage
                        id='pages.classification.systemUri'
                        defaultMessage='Classification system URI'
                      />
                    }
                  >
                    <Input
                      onChange={(event) => updateIdentity(itemPath, '@classes', event.target.value)}
                    />
                  </Form.Item>
                </>
              )}
              {classKey !== 'common:category' &&
              !usesBuiltInClassification(item, props.dataType) ? (
                <ClassificationCollectionField
                  name={[...itemPath, classKey]}
                  required
                  enabled={!!validationEnabled}
                  message={collectionMessage}
                >
                  <TidasRepeatedField
                    name={[...itemPath, classKey]}
                    onChange={props.onData}
                    arrayOnly={Array.isArray(value)}
                    keepFirst
                  >
                    {(classPath) => (
                      <>
                        <Form.Item
                          name={[...classPath, '@level']}
                          required
                          rules={classRules}
                          label={
                            <FormattedMessage
                              id='pages.classification.level'
                              defaultMessage='Level'
                            />
                          }
                        >
                          <Input />
                        </Form.Item>
                        <Form.Item
                          name={[...classPath, '@classId']}
                          required
                          rules={classRules}
                          label={
                            <FormattedMessage
                              id='pages.classification.code'
                              defaultMessage='Code'
                            />
                          }
                        >
                          <Input />
                        </Form.Item>
                        <Form.Item
                          name={[...classPath, '#text']}
                          required
                          rules={classRules}
                          label={
                            <FormattedMessage
                              id='pages.classification.label'
                              defaultMessage='Class name'
                            />
                          }
                        >
                          <Input />
                        </Form.Item>
                      </>
                    )}
                  </TidasRepeatedField>
                </ClassificationCollectionField>
              ) : (
                <LevelTextItemForm
                  {...props}
                  name={[...itemPath, classKey]}
                  rules={
                    validationEnabled && required && !props.rules?.length
                      ? [{ required: true, message: collectionMessage }]
                      : props.rules
                  }
                />
              )}
            </>
          );
        }}
      </TidasRepeatedField>
    </ClassificationCollectionField>
  );
};

export default ClassificationSystemsForm;
