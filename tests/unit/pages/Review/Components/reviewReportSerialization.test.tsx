import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { Form, Input } from 'antd';
import { prepareReviewCommentApproval } from '@/services/comments/reviewPayload';
import SourceSelectForm from '@/pages/Sources/Components/select/form';
jest.mock('@umijs/max', () => ({
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  useIntl: () => ({ formatMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id }),
  useModel: () => ({ initialState: {} }),
}));
jest.mock('@/components/RequiredSelectFormTitle', () => ({
  __esModule: true,
  default: () => null,
  ErrRefTipMessage: () => null,
}));
jest.mock('@/contexts/refCheckContext', () => ({
  useRefCheckContext: () => ({ refCheckData: [] }),
}));
jest.mock('@/pages/Utils', () => ({
  getLocalValueProps: (value: any) => ({ value }),
  validateRefObjectId: () => {},
}));
jest.mock('@/services/general/api', () => ({ getRefData: jest.fn() }));
jest.mock('@/services/sources/api', () => ({ getSourceDetail: jest.fn() }));
jest.mock('@/services/sources/util', () => ({ genSourceFromData: jest.fn() }));
jest.mock('@/pages/Sources/Components/edit', () => ({ __esModule: true, default: () => null }));
jest.mock('@/pages/Sources/Components/view', () => ({ __esModule: true, default: () => null }));
jest.mock('@/pages/Sources/Components/select/drawer', () => ({
  __esModule: true,
  default: () => null,
}));
test('cleans the actual untouched optional report form before review submission', async () => {
  const onFinish = jest.fn();
  render(
    <Form initialValues={{ review: [{ '@type': 'Not reviewed' }] }} onFinish={onFinish}>
      <Form.List name={['review']}>
        {(fields) => (
          <>
            {fields.map((field) => (
              <React.Fragment key={field.key}>
                <Form.Item name={[field.name, '@type']}>
                  <Input />
                </Form.Item>
                <SourceSelectForm
                  type='reviewReport'
                  parentName={['review']}
                  name={[field.name, 'common:referenceToCompleteReviewReport']}
                  label='Report'
                  lang='en'
                  formRef={{ current: undefined }}
                  onData={() => {}}
                />
              </React.Fragment>
            ))}
          </>
        )}
      </Form.List>
      <button type='submit'>submit-diagnosis</button>
    </Form>,
  );
  fireEvent.click(screen.getByText('submit-diagnosis'));
  await waitFor(() => expect(onFinish).toHaveBeenCalled());
  const serialized = JSON.parse(JSON.stringify(onFinish.mock.calls[0][0]));
  expect(
    prepareReviewCommentApproval({ modellingAndValidation: { validation: serialized } }),
  ).toEqual({ modellingAndValidation: { validation: { review: [{ '@type': 'Not reviewed' }] } } });
  expect(serialized.review[0]['common:referenceToCompleteReviewReport']).toEqual({
    'common:shortDescription': [],
  });
});
