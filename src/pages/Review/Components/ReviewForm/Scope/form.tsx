import RequiredMark from '@/components/RequiredMark';
import { methodNameOptions, scopeNameOptions } from '@/pages/Processes/Components/optiondata';
import schema from '@/pages/Processes/processes_schema.json';
import { getRules } from '@/pages/Utils';
import { CloseOutlined } from '@ant-design/icons';
import { Button, Col, Form, Row, Select } from 'antd';
import { FC } from 'react';
import { FormattedMessage } from 'umi';
type Props = {
  name: any;
};

const ScopeItemForm: FC<Props> = ({ name }) => {
  return (
    <Form.Item>
      <Form.List name={[...name]}>
        {(subFields, subOpt) => (
          <div style={{ display: 'flex', flexDirection: 'column', rowGap: 16 }}>
            {subFields.map((subField, index) => (
              <Row key={subField.key}>
                <Col flex='50' style={{ marginRight: '10px' }}>
                  {index === 0 && (
                    <RequiredMark
                      label={
                        <FormattedMessage
                          id='pages.process.modellingAndValidation.validation.review.scope.name'
                          defaultMessage='Scope name'
                        />
                      }
                      showError={false}
                    />
                  )}
                  <Form.Item
                    name={[subField.name, '@name']}
                    rules={getRules(
                      schema['processDataSet']['modellingAndValidation']['validation']['review'][
                        'common:scope'
                      ]['@name']['rules'],
                    )}
                  >
                    <Select options={scopeNameOptions} />
                  </Form.Item>
                </Col>
                <Col flex='50' style={{ marginRight: '10px' }}>
                  {index === 0 && (
                    <RequiredMark
                      label={
                        <FormattedMessage
                          id='pages.process.modellingAndValidation.validation.review.scope.method.name'
                          defaultMessage='Method name'
                        />
                      }
                      showError={false}
                    />
                  )}
                  <Form.Item
                    name={[subField.name, 'common:method', '@name']}
                    rules={getRules(
                      schema['processDataSet']['modellingAndValidation']['validation']['review'][
                        'common:scope'
                      ]['common:method']['@name']['rules'],
                    )}
                  >
                    <Select options={methodNameOptions} />
                  </Form.Item>
                </Col>
                <Col flex='20px'>
                  {index === 0 && <br />}
                  <CloseOutlined
                    style={{ marginTop: '10px' }}
                    onClick={() => {
                      if (subFields.length === 1) {
                        return;
                      }
                      subOpt.remove(subField.name);
                    }}
                  />
                </Col>
              </Row>
            ))}
            <Button type='dashed' onClick={() => subOpt.add()} block>
              + <FormattedMessage id='pages.button.item.add' defaultMessage='Add' />{' '}
              <FormattedMessage
                id='pages.process.modellingAndValidation.validation.review.scope'
                defaultMessage='Scope'
              />{' '}
              <FormattedMessage id='pages.button.item.label' defaultMessage='Item' />
            </Button>
          </div>
        )}
      </Form.List>
    </Form.Item>
  );
};

export default ScopeItemForm;
