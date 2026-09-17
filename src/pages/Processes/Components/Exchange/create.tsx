import LangTextItemForm from '@/components/LangTextItem/form';
import LocationCodeSelect from '@/components/LocationTextItem/codeSelect';
import ToolBarButton from '@/components/ToolBarButton';
import UnitConvert from '@/components/UnitConvert';
import { UnitsContext } from '@/contexts/unitContext';
import FlowsSelectForm from '@/pages/Flows/Components/select/form';
import SourceSelectForm from '@/pages/Sources/Components/select/form';
import { getRules } from '@/pages/Utils';
import { ProcessExchangeData } from '@/services/processes/data';
import { normalizeExchangeLocationCode } from '@/services/processes/exchangeLocation';
import styles from '@/style/custom.less';
import { CaretRightOutlined, CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { ProForm, ProFormInstance } from '@ant-design/pro-components';
import {
  Button,
  Card,
  Collapse,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
} from 'antd';
import type { FC } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage } from 'umi';
import schema from '../../processes_schema.json';
import {
  DataDerivationTypeStatusOptions,
  dataSourceTypeOptions,
  functionTypeOptions,
} from '../optiondata';

type Props = {
  direction: string;
  lang: string;
  onData: (data: ProcessExchangeData) => void;
  showRules?: boolean;
  disabled?: boolean;
};

const normalizeExchangeFormData = (exchangeData: ProcessExchangeData): ProcessExchangeData => {
  const { location, ...rest } = exchangeData;
  const normalizedLocation = normalizeExchangeLocationCode(location);

  return normalizedLocation ? { ...rest, location: normalizedLocation } : rest;
};

const ProcessExchangeCreate: FC<Props> = ({
  direction,
  lang,
  onData,
  showRules = false,
  disabled = false,
}) => {
  const initialValues = useMemo(
    () => ({
      exchangeDirection: direction.charAt(0).toUpperCase() + direction.slice(1).toLowerCase(),
    }),
    [direction],
  );
  const [drawerVisible, setDrawerVisible] = useState(false);
  const formRefCreate = useRef<ProFormInstance | undefined>(undefined);
  const [fromData, setFromData] = useState<ProcessExchangeData>({});
  const [asInput, setAsInput] = useState(initialValues.exchangeDirection === 'Input');
  const [functionalUnitOrOther, setFunctionalUnitOrOther] = useState(false);
  const [units, setUnits] = useState<{ name: string; meanValue: number }[]>([]);
  const [unitConvertVisible, setUnitConvertVisible] = useState(false);
  const [unitConvertName, setUnitConvertName] = useState('');
  const [targetUnit, setTargetUnit] = useState('');
  useEffect(() => {
    if (!unitConvertVisible) {
      setUnitConvertName('');
    }
  }, [unitConvertVisible]);

  const handletFromData = () => {
    setFromData(formRefCreate.current?.getFieldsValue(true) ?? {});
  };

  useEffect(() => {
    if (!drawerVisible) return;
    formRefCreate.current?.resetFields();
    setAsInput(initialValues.exchangeDirection === 'Input');
    setFunctionalUnitOrOther(false);
    setFromData(initialValues);
  }, [drawerVisible, initialValues]);

  return (
    <>
      <ToolBarButton
        disabled={disabled}
        icon={<PlusOutlined />}
        tooltip={<FormattedMessage id='pages.button.create' defaultMessage='Create' />}
        onClick={() => {
          setDrawerVisible(true);
        }}
      />
      {/* <Tooltip title={<FormattedMessage id='pages.button.create' defaultMessage='Create' />}>
        <Button
          size={'middle'}
          type='text'
          icon={<PlusOutlined />}
          onClick={() => {
            setDrawerVisible(true);
          }}
        />
      </Tooltip> */}
      <UnitConvert
        visible={unitConvertVisible}
        onCancel={() => setUnitConvertVisible(false)}
        onOk={(result) => {
          formRefCreate.current?.setFieldValue(unitConvertName, `${result}`);
          setFromData({ ...fromData, [unitConvertName]: result });
        }}
        units={units}
        value={undefined}
        targetUnit={targetUnit}
      />
      <Drawer
        getContainer={() => document.body}
        destroyOnHidden
        title={
          <FormattedMessage
            id='pages.process.exchange.drawer.title.create'
            defaultMessage='Create Exchange'
          />
        }
        size='90%'
        closable={false}
        extra={
          <Button
            icon={<CloseOutlined />}
            style={{ border: 0 }}
            onClick={() => setDrawerVisible(false)}
          />
        }
        mask={{ closable: false }}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        footer={
          <Space size={'middle'} className={styles.footer_right}>
            <Button onClick={() => setDrawerVisible(false)}>
              <FormattedMessage id='pages.button.cancel' defaultMessage='Cancel' />
            </Button>
            <Button onClick={() => formRefCreate.current?.submit()} type='primary'>
              <FormattedMessage id='pages.button.save' defaultMessage='Save' />
            </Button>
          </Space>
        }
      >
        <ProForm
          formRef={formRefCreate}
          initialValues={initialValues}
          onValuesChange={(_, allValues) => {
            setFromData(allValues ?? {});
            setFunctionalUnitOrOther(allValues?.quantitativeReference ?? false);
          }}
          submitter={{
            render: () => {
              return [];
            },
          }}
          onFinish={async () => {
            // Reference selectors can update Form.List before its fields finish registering.
            onData(normalizeExchangeFormData(formRefCreate.current?.getFieldsValue(true) ?? {}));
            formRefCreate.current?.resetFields();
            setDrawerVisible(false);
            return true;
          }}
        >
          <Space orientation='vertical' style={{ width: '100%' }}>
            <Form.Item
              label={
                <FormattedMessage
                  id='pages.process.view.exchange.exchangeDirection'
                  defaultMessage='Exchange direction'
                />
              }
              name={'exchangeDirection'}
              rules={
                showRules
                  ? getRules(
                      schema['processDataSet']['exchanges']['exchange'][0]['exchangeDirection'][
                        'rules'
                      ],
                    )
                  : []
              }
            >
              <Select
                // placeholder="Select a direction"
                options={[
                  {
                    value: 'Input',
                    label: (
                      <FormattedMessage id='pages.process.exchange.input' defaultMessage='Input' />
                    ),
                  },
                  {
                    value: 'Output',
                    label: (
                      <FormattedMessage
                        id='pages.process.exchange.output'
                        defaultMessage='Output'
                      />
                    ),
                  },
                ]}
                onChange={(value) => {
                  setAsInput(value.toLowerCase() === 'input');
                }}
              />
            </Form.Item>
            <UnitsContext.Provider value={{ units, setUnits, setTargetUnit }}>
              <FlowsSelectForm
                name={['referenceToFlowDataSet']}
                label={
                  <FormattedMessage
                    id='pages.process.view.exchange.referenceToFlowDataSet'
                    defaultMessage='Flow'
                  />
                }
                lang={lang}
                drawerVisible={drawerVisible}
                formRef={formRefCreate}
                asInput={asInput}
                onData={handletFromData}
                rules={
                  showRules
                    ? getRules(
                        schema['processDataSet']['exchanges']['exchange'][0][
                          'referenceToFlowDataSet'
                        ]['@refObjectId']['rules'],
                      )
                    : []
                }
              />
            </UnitsContext.Provider>
            <Form.Item
              label={
                <FormattedMessage
                  id='pages.process.view.exchange.location'
                  defaultMessage='Location'
                />
              }
              name={'location'}
            >
              <LocationCodeSelect lang={lang} />
            </Form.Item>
            <Form.Item
              label={
                <FormattedMessage
                  id='pages.process.view.exchange.functionType'
                  defaultMessage='Function type'
                />
              }
              name={'functionType'}
            >
              <Select options={functionTypeOptions} />
            </Form.Item>
            <Form.Item
              label={
                <FormattedMessage
                  id='pages.process.view.exchange.referenceToVariable'
                  defaultMessage='Variable'
                />
              }
              name={'referenceToVariable'}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={
                <FormattedMessage
                  id='pages.process.view.exchange.meanAmount'
                  defaultMessage='Mean amount'
                />
              }
              name={'meanAmount'}
              rules={
                showRules
                  ? getRules(
                      schema['processDataSet']['exchanges']['exchange'][0]['meanAmount']['rules'],
                    )
                  : []
              }
            >
              <Input
                onClick={() => {
                  setUnitConvertVisible(true);
                  setUnitConvertName('meanAmount');
                }}
              />
            </Form.Item>
            <Form.Item
              label={
                <FormattedMessage
                  id='pages.process.view.exchange.resultingAmount'
                  defaultMessage='Resulting amount'
                />
              }
              name={'resultingAmount'}
              rules={
                showRules
                  ? getRules(
                      schema['processDataSet']['exchanges']['exchange'][0]['resultingAmount'][
                        'rules'
                      ],
                    )
                  : []
              }
            >
              <Input
                onClick={() => {
                  setUnitConvertVisible(true);
                  setUnitConvertName('resultingAmount');
                }}
              />
            </Form.Item>
            <Form.Item
              label={
                <FormattedMessage
                  id='processExchange.uncertaintyDistributionType'
                  defaultMessage='Uncertainty distribution type'
                />
              }
              name={'uncertaintyDistributionType'}
            >
              <Select
                options={[
                  {
                    value: 'undefined',
                    label: (
                      <FormattedMessage
                        id='pages.process.view.modellingAndValidation.uncertaintyDistributionType.undefined'
                        defaultMessage='Undefined'
                      />
                    ),
                  },
                  {
                    value: 'log-normal',
                    label: (
                      <FormattedMessage
                        id='pages.process.view.modellingAndValidation.uncertaintyDistributionType.logNormal'
                        defaultMessage='Log-normal'
                      />
                    ),
                  },
                  {
                    value: 'normal',
                    label: (
                      <FormattedMessage
                        id='pages.process.view.modellingAndValidation.uncertaintyDistributionType.normal'
                        defaultMessage='Normal'
                      />
                    ),
                  },
                  {
                    value: 'triangular',
                    label: (
                      <FormattedMessage
                        id='pages.process.view.modellingAndValidation.uncertaintyDistributionType.triangular'
                        defaultMessage='Triangular'
                      />
                    ),
                  },
                  {
                    value: 'uniform',
                    label: (
                      <FormattedMessage
                        id='pages.process.view.modellingAndValidation.uncertaintyDistributionType.uniform'
                        defaultMessage='Uniform'
                      />
                    ),
                  },
                ]}
              />
            </Form.Item>
            {formRefCreate.current?.getFieldValue('uncertaintyDistributionType') === 'triangular' ||
            formRefCreate.current?.getFieldValue('uncertaintyDistributionType') === 'uniform' ? (
              <>
                <Form.Item
                  label={
                    <FormattedMessage
                      id='processExchange.minimumAmount'
                      defaultMessage='Minimum amount'
                    />
                  }
                  name={'minimumAmount'}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label={
                    <FormattedMessage
                      id='processExchange.maximumAmount'
                      defaultMessage='Maximum amount'
                    />
                  }
                  name={'maximumAmount'}
                >
                  <Input />
                </Form.Item>
              </>
            ) : (
              <></>
            )}

            {formRefCreate.current?.getFieldValue('uncertaintyDistributionType') === 'log-normal' ||
            formRefCreate.current?.getFieldValue('uncertaintyDistributionType') === 'log-normal' ? (
              <>
                <Form.Item
                  label={
                    <FormattedMessage
                      id='processExchange.relativeStandardDeviation95In'
                      defaultMessage='Relative StdDev in %'
                    />
                  }
                  name={'relativeStandardDeviation95In'}
                >
                  <Input />
                </Form.Item>
              </>
            ) : (
              <></>
            )}
            <Card
              size='small'
              title={
                <FormattedMessage
                  id='pages.process.view.exchange.allocation'
                  defaultMessage='Allocation'
                />
              }
            >
              <Form.Item
                label={
                  <FormattedMessage
                    id='pages.process.view.exchange.internalReferenceToCoProduct'
                    defaultMessage='Internal reference to co-product'
                  />
                }
                name={['allocations', 'allocation', '@internalReferenceToCoProduct']}
              >
                <Input />
              </Form.Item>
              <Form.Item
                label={
                  <FormattedMessage
                    id='pages.process.view.exchange.allocatedFraction'
                    defaultMessage='Allocated fraction'
                  />
                }
                name={['allocations', 'allocation', '@allocatedFraction']}
              >
                <InputNumber
                  min={0}
                  max={100}
                  precision={3}
                  stringMode
                  suffix='%'
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Card>
            <br />
            <Form.Item
              label={
                <FormattedMessage
                  id='pages.process.view.exchange.dataSourceType'
                  defaultMessage='Data source type'
                />
              }
              name={'dataSourceType'}
            >
              <Select options={dataSourceTypeOptions} />
            </Form.Item>
            <Form.Item
              label={
                <FormattedMessage
                  id='pages.process.view.exchange.dataDerivationTypeStatus'
                  defaultMessage='Data derivation type / status'
                />
              }
              name={'dataDerivationTypeStatus'}
              rules={
                showRules
                  ? getRules(
                      schema['processDataSet']['exchanges']['exchange'][0][
                        'dataDerivationTypeStatus'
                      ]['rules'],
                    )
                  : []
              }
            >
              <Select options={DataDerivationTypeStatusOptions} />
            </Form.Item>

            <Collapse
              defaultActiveKey={['data-sources']}
              expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} />}
              style={{ marginBottom: 16 }}
              items={[
                {
                  key: 'data-sources',
                  label: (
                    <FormattedMessage
                      id='pages.process.view.exchange.referenceToDataSource'
                      defaultMessage='Data source(s)'
                    />
                  ),
                  children: (
                    <Form.List
                      name={['referencesToDataSource', 'referenceToDataSource']}
                      initialValue={[{}]}
                    >
                      {(fields, { add, remove }) => (
                        <Space orientation='vertical' style={{ width: '100%' }}>
                          {fields.map((field, index) => (
                            <div key={field.key} style={{ position: 'relative' }}>
                              <SourceSelectForm
                                parentName={['referencesToDataSource', 'referenceToDataSource']}
                                name={[field.name]}
                                label={
                                  <Space>
                                    <FormattedMessage
                                      id='pages.process.view.exchange.referenceToDataSource'
                                      defaultMessage='Data source(s)'
                                    />
                                    {index + 1}
                                  </Space>
                                }
                                lang={lang}
                                formRef={formRefCreate}
                                onData={handletFromData}
                              />
                              {fields.length > 1 && (
                                <CloseOutlined
                                  onClick={() => {
                                    remove(field.name);
                                    handletFromData();
                                  }}
                                  style={{ position: 'absolute', right: 8, top: 8 }}
                                />
                              )}
                            </div>
                          ))}
                          <Button
                            type='dashed'
                            block
                            onClick={() => {
                              add({});
                              handletFromData();
                            }}
                            style={{ marginTop: 8 }}
                          >
                            + <FormattedMessage id='pages.button.add' defaultMessage='Add' />{' '}
                            <FormattedMessage
                              id='pages.process.view.exchange.referenceToDataSource'
                              defaultMessage='Data source(s)'
                            />{' '}
                            <FormattedMessage id='pages.button.item.label' defaultMessage='Item' />
                          </Button>
                        </Space>
                      )}
                    </Form.List>
                  ),
                },
              ]}
            />
            <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
              <FormattedMessage
                id='pages.process.view.exchange.generalComment'
                defaultMessage='Comment'
              />
            </Divider>
            <LangTextItemForm
              name='generalComment'
              label={
                <FormattedMessage
                  id='pages.process.view.exchange.generalComment'
                  defaultMessage='Comment'
                />
              }
            />

            <Card
              size='small'
              title={
                <FormattedMessage
                  id='pages.process.view.exchange.quantitativeReference'
                  defaultMessage='Quantitative reference'
                />
              }
            >
              <Form.Item
                label={
                  <FormattedMessage
                    id='pages.process.view.exchange.referenceToReferenceFlow'
                    defaultMessage='Reference flow(s)'
                  />
                }
                name={'quantitativeReference'}
              >
                <Switch />
              </Form.Item>
              {functionalUnitOrOther ? (
                <>
                  <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
                    <FormattedMessage
                      id='pages.process.view.exchange.functionalUnitOrOther'
                      defaultMessage='Functional unit, Production period, or Other parameter'
                    />
                  </Divider>
                  <LangTextItemForm
                    name='functionalUnitOrOther'
                    label={
                      <FormattedMessage
                        id='pages.process.view.exchange.functionalUnitOrOther'
                        defaultMessage='Functional unit, Production period, or Other parameter'
                      />
                    }
                  />
                </>
              ) : (
                <></>
              )}
            </Card>
          </Space>
        </ProForm>
      </Drawer>
    </>
  );
};

export default ProcessExchangeCreate;
