import RequiredSelectFormTitle, { ErrRefTipMessage } from '@/components/RequiredSelectFormTitle';
import { RefCheckType, useRefCheckContext } from '@/contexts/refCheckContext';
import UnitGroupFromMini from '@/pages/Unitgroups/Components/select/formMini';
import { getLocalValueProps, validateRefObjectId } from '@/pages/Utils';
import { getFlowDetail } from '@/services/flows/api';
import { FlowDetailData, FlowDetailResponse } from '@/services/flows/data';
import { genFlowFromData, genFlowNameJson } from '@/services/flows/util';
import { getRefData } from '@/services/general/api';
import {
  RESPONSIVE_REFERENCE_SELECTOR_FORM_ITEM_STYLE,
  RESPONSIVE_REFERENCE_SELECTOR_INPUT_STYLE,
  RESPONSIVE_REFERENCE_SELECTOR_SPACE_PROPS,
} from '@/style/responsiveForm';
import { ProFormInstance } from '@ant-design/pro-components';
import { Button, Card, Col, Divider, Form, Input, Row, Space, theme } from 'antd';
import type { Rule } from 'antd/es/form';
import React, { FC, ReactNode, useEffect, useState } from 'react';
import { FormattedMessage, useIntl, useModel } from 'umi';
import FlowsEdit from '../edit';
import FlowsView from '../view';
import FlowsSelectDrawer from './drawer';
const { TextArea } = Input;

type Props = {
  name: Array<string | number>;
  label: ReactNode | string;
  lang: string;
  formRef: React.RefObject<ProFormInstance | undefined>;
  drawerVisible: boolean;
  asInput?: boolean;
  onData: () => void;
  rules?: Rule[];
  showRequiredLabel?: boolean;
};

type RefDataResponse = {
  data?: FlowDetailData | null;
  success?: boolean;
};

const FlowsSelectForm: FC<Props> = ({
  name,
  label,
  lang,
  formRef,
  drawerVisible,
  asInput,
  onData,
  rules = [],
  showRequiredLabel = false,
}) => {
  const intl = useIntl();
  const [id, setId] = useState<string | undefined>(undefined);
  const [version, setVersion] = useState<string | undefined>(undefined);
  const [dataUserId, setDataUserId] = useState<string | undefined>(undefined);
  const { token } = theme.useToken();
  const [ruleErrorState, setRuleErrorState] = useState(false);
  const [refData, setRefData] = useState<FlowDetailData | null>(null);
  const [errRef, setErrRef] = useState<RefCheckType | null>(null);
  const refCheckContext = useRefCheckContext();
  const refCheckData = refCheckContext?.refCheckData;
  const { initialState } = useModel('@@initialState');
  const updateErrRefByDetail = (data: FlowDetailData | null | undefined) => {
    const resolvedId = data?.id;
    const resolvedVersion = data?.version;
    if (
      data?.ruleVerification === false &&
      data?.stateCode !== 100 &&
      data?.stateCode !== 200 &&
      rules?.length &&
      resolvedId &&
      resolvedVersion
    ) {
      setErrRef({
        id: resolvedId,
        version: resolvedVersion,
        ruleVerification: data?.ruleVerification,
        nonExistent: false,
      });
    } else {
      setErrRef(null);
    }
  };
  useEffect(() => {
    if (id && version && !refData) {
      getRefData(id, version, 'flows', '').then((result: RefDataResponse) => {
        const nextRefData = result.data ? { ...result.data } : null;
        setDataUserId(result?.data?.userId);
        setRefData(nextRefData);
        if (nextRefData) {
          updateErrRefByDetail(nextRefData);
        }
      });
    }
  }, [id, version]);
  useEffect(() => {
    setErrRef((currentErrRef) => {
      if (refCheckData?.length) {
        const ref = refCheckData.find(
          (item) =>
            (item.id === id && item.version === version) ||
            (item.id === refData?.id && item.version === refData?.version),
        );
        if (ref) {
          return ref;
        }
        if (refData && refData?.id !== currentErrRef?.id) {
          return null;
        }
        return currentErrRef;
      }

      return null;
    });
  }, [id, refCheckData, refData, version]);

  const handletFlowsData = (rowId: string, rowVersion: string) => {
    getFlowDetail(rowId, rowVersion).then(async (result: FlowDetailResponse) => {
      setDataUserId(result?.data?.userId);
      updateErrRefByDetail(result?.data);
      const selectedData = genFlowFromData(result.data?.json?.flowDataSet ?? {});
      await formRef.current?.setFieldValue(name, {
        '@refObjectId': rowId,
        '@type': 'flow data set',
        '@uri': `../flows/${rowId}.xml`,
        '@version': result.data?.version ?? '',
        'common:shortDescription': genFlowNameJson(
          selectedData?.flowInformation?.dataSetInformation?.name,
        ),
      });
      setId(rowId);
      setVersion(result.data?.version);
      validateRefObjectId(formRef, name);
      onData();
    });
  };

  useEffect(() => {
    setId(undefined);
    if (drawerVisible) {
      if (formRef.current?.getFieldValue([...name, '@refObjectId'])) {
        setId(formRef.current?.getFieldValue([...name, '@refObjectId']));
        setVersion(formRef.current?.getFieldValue([...name, '@version']));
      }
    }
  });

  const isRequiredRule = (rule: Rule): rule is Rule & { required: true } => {
    return (
      typeof rule === 'object' &&
      rule !== null &&
      'required' in rule &&
      Boolean((rule as { required?: boolean }).required)
    );
  };

  const requiredRules = rules.filter(isRequiredRule);
  const isRequired = requiredRules.length > 0;
  const notRequiredRules = rules.filter((rule) => !isRequiredRule(rule));
  return (
    <Card
      size='small'
      style={errRef ? { border: `1px solid ${token.colorError}` } : {}}
      title={
        isRequired || showRequiredLabel ? (
          <RequiredSelectFormTitle
            label={label}
            ruleErrorState={isRequired && ruleErrorState}
            requiredRules={requiredRules}
            errRef={errRef}
          />
        ) : (
          <>
            {label}{' '}
            {errRef && (
              <span style={{ color: token.colorError, marginLeft: '5px', fontWeight: 'normal' }}>
                <ErrRefTipMessage errRef={errRef} />
              </span>
            )}
          </>
        )
      }
    >
      <Space {...RESPONSIVE_REFERENCE_SELECTOR_SPACE_PROPS}>
        <Form.Item
          label={
            <FormattedMessage
              id='pages.process.view.exchange.refObjectId'
              defaultMessage='Reference flow dataset identifier'
            />
          }
          name={[...name, '@refObjectId']}
          style={RESPONSIVE_REFERENCE_SELECTOR_FORM_ITEM_STYLE}
          rules={[
            ...notRequiredRules,
            ...(isRequired
              ? [
                  {
                    validator: (_: Rule, value: unknown) => {
                      if (!value) {
                        setRuleErrorState(true);
                        console.log('form rules check error');
                        return Promise.reject(new Error());
                      }
                      setRuleErrorState(false);
                      return Promise.resolve();
                    },
                  },
                ]
              : []),
          ]}
        >
          <Input
            disabled={true}
            style={{
              ...RESPONSIVE_REFERENCE_SELECTOR_INPUT_STYLE,
              color: token.colorTextDescription,
            }}
          />
        </Form.Item>
        <Space orientation='horizontal' style={{ marginTop: '6px' }}>
          {!id && (
            <FlowsSelectDrawer
              buttonType='text'
              lang={lang}
              asInput={asInput}
              onData={handletFlowsData}
            />
          )}
          {id && (
            <FlowsSelectDrawer
              buttonType='text'
              buttonText={<FormattedMessage id='pages.button.reselect' defaultMessage='Reselect' />}
              lang={lang}
              asInput={asInput}
              onData={handletFlowsData}
            />
          )}
          {id && (
            <Button
              onClick={() => {
                handletFlowsData(id, version ?? '');
              }}
            >
              <FormattedMessage
                id='pages.button.updateReference'
                defaultMessage='Update Reference'
              />
            </Button>
          )}
          {id && <FlowsView lang={lang} id={id} version={version ?? ''} buttonType='text' />}
          {id && dataUserId === initialState?.currentUser?.userid && (
            <FlowsEdit
              updateErrRef={(data) => setErrRef(data)}
              lang={lang}
              id={id}
              version={version ?? ''}
              buttonType='text'
            />
          )}
          {id && (
            <Button
              onClick={() => {
                formRef.current?.setFieldValue([...name], {});
                validateRefObjectId(formRef, name);
                onData();
              }}
            >
              <FormattedMessage id='pages.button.clear' defaultMessage='Clear' />
            </Button>
          )}
        </Space>
      </Space>
      <Form.Item
        hidden
        label={<FormattedMessage id='pages.process.view.exchange.type' defaultMessage='Type' />}
        name={[...name, '@type']}
      >
        <Input disabled={true} style={{ color: token.colorTextDescription }} />
      </Form.Item>
      <Form.Item
        hidden
        label={<FormattedMessage id='pages.process.view.exchange.uri' defaultMessage='URI' />}
        name={[...name, '@uri']}
      >
        <Input disabled={true} style={{ color: token.colorTextDescription }} />
      </Form.Item>
      <Form.Item
        label={
          <FormattedMessage id='pages.process.veiw.exchange.version' defaultMessage='Version' />
        }
        name={[...name, '@version']}
      >
        <Input disabled={true} style={{ color: token.colorTextDescription }} />
      </Form.Item>
      <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
        <FormattedMessage
          id='pages.process.view.exchange.shortDescription'
          defaultMessage='Short description'
        />
      </Divider>
      <Form.Item>
        <Form.List name={[...name, 'common:shortDescription']}>
          {(subFields) => (
            <div style={{ display: 'flex', flexDirection: 'column', rowGap: 16 }}>
              {subFields.map((subField) => (
                <Row key={subField.key}>
                  <Col flex='100px' style={{ marginRight: '10px' }}>
                    <Form.Item
                      getValueProps={(value) => getLocalValueProps(value)}
                      noStyle
                      name={[subField.name, '@xml:lang']}
                    >
                      <Input
                        disabled={true}
                        style={{ width: '100px', color: token.colorTextDescription }}
                      />
                    </Form.Item>
                  </Col>
                  <Col flex='auto' style={{ marginRight: '10px' }}>
                    <Form.Item noStyle name={[subField.name, '#text']}>
                      <TextArea
                        placeholder={intl.formatMessage({
                          id: 'pages.lang.text.placeholder',
                          defaultMessage: 'Text',
                        })}
                        rows={1}
                        disabled={true}
                        style={{ color: token.colorTextDescription }}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              ))}
              {subFields.length < 1 && <Input disabled={true} />}
            </div>
          )}
        </Form.List>
      </Form.Item>

      <UnitGroupFromMini
        id={id}
        version={version}
        idType={'flow'}
        name={name}
        formRef={formRef}
        drawerVisible={drawerVisible}
      />
    </Card>
  );
};

export default FlowsSelectForm;
