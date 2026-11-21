// @ts-nocheck
import userEvent from '@testing-library/user-event';
import { act, renderWithProviders, screen, waitFor } from '../../../../../helpers/testUtils';

const toText = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node?.props?.defaultMessage) return node.props.defaultMessage;
  if (node?.props?.id) return node.props.id;
  if (node?.props?.children) return toText(node.props.children);
  return '';
};

const mockRefCheckContextValue = { refCheckData: [] as any[] };
let mockCurrentUserId = 'user-1';
let mockRefDataUserId = 'user-1';
let mockRefObjectIdRules: any[] = [];
const mockFormState: Record<string, any> = {};

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  useIntl: () => ({
    formatMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  }),
  useModel: () => ({ initialState: { currentUser: { userid: mockCurrentUserId } } }),
}));

jest.mock('antd', () => {
  const React = require('react');

  const ConfigProvider = ({ children }: any) => <div>{children}</div>;
  const Button = ({ children, onClick, disabled }: any) => (
    <button type='button' onClick={disabled ? undefined : onClick} disabled={disabled}>
      {toText(children)}
    </button>
  );
  const Card = ({ title, children }: any) => (
    <div>
      <div>{title}</div>
      <div>{children}</div>
    </div>
  );
  const Form = ({ children }: any) => <form>{children}</form>;
  const getMockValueAtPath = (path: any[]) => {
    let cursor: any = mockFormState;
    for (let index = 0; index < path.length; index += 1) {
      cursor = cursor?.[path[index]];
      if (cursor === undefined) return undefined;
    }
    return cursor;
  };
  Form.Item = ({ label, children, getValueProps, name, rules }: any) => {
    const normalizedName = Array.isArray(name) ? name.flat() : name;
    if (Array.isArray(normalizedName) && normalizedName.join('.') === 'reference.@refObjectId') {
      mockRefObjectIdRules = rules ?? [];
    }
    const content = React.Children.only(children);
    const value = Array.isArray(normalizedName)
      ? getMockValueAtPath(normalizedName)
      : content?.props?.value;
    if (content && React.isValidElement(content) && getValueProps) {
      return (
        <label>
          <span>{toText(label)}</span>
          {React.cloneElement(content, getValueProps(value))}
        </label>
      );
    }
    if (content && React.isValidElement(content) && Array.isArray(normalizedName)) {
      return (
        <label>
          <span>{toText(label)}</span>
          {React.cloneElement(content, { value })}
        </label>
      );
    }
    return (
      <label>
        <span>{toText(label)}</span>
        {children}
      </label>
    );
  };
  Form.List = ({ children, name }: any) => {
    const path = Array.isArray(name) ? name : [name];
    const values = getMockValueAtPath(path);
    const fields = Array.isArray(values)
      ? values.map((_: any, index: number) => ({ key: index, name: [...path, index] }))
      : [];
    return (
      <div>
        {typeof children === 'function'
          ? children(fields, { add: () => {}, remove: () => {} })
          : children}
      </div>
    );
  };
  const Input = ({ value = '', onChange, disabled, placeholder }: any) => (
    <input
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={disabled}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
    />
  );
  Input.TextArea = ({ value = '', onChange, disabled, ...rest }: any) => (
    <textarea
      value={value}
      disabled={disabled}
      readOnly={disabled}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
      {...rest}
    />
  );
  const Row = ({ children }: any) => <div>{children}</div>;
  const Col = ({ children }: any) => <div>{children}</div>;
  const Divider = ({ children }: any) => <div>{toText(children)}</div>;
  const Space = ({ children }: any) => <div>{children}</div>;
  const theme = {
    useToken: () => ({
      token: {
        colorError: '#ff4d4f',
        colorTextDescription: '#8c8c8c',
      },
    }),
  };

  return {
    __esModule: true,
    Button,
    Card,
    Form,
    Input,
    Row,
    Col,
    Divider,
    Space,
    theme,
    ConfigProvider,
  };
});

jest.mock('@/components/RequiredSelectFormTitle', () => ({
  __esModule: true,
  default: ({ label }: any) => <span data-testid='required-title'>{toText(label)}</span>,
  ErrRefTipMessage: () => <span>err-ref</span>,
}));

jest.mock('@/pages/Flows/Components/select/drawer', () => ({
  __esModule: true,
  default: ({ onData, buttonText }: any) => (
    <button type='button' onClick={() => onData?.('flow-1', '1.0.0')}>
      {toText(buttonText) || 'open drawer'}
    </button>
  ),
}));

jest.mock('@/pages/Flows/Components/view', () => ({
  __esModule: true,
  default: ({ id, version }: any) => <span>{`view ${id}:${version}`}</span>,
}));

jest.mock('@/pages/Flows/Components/edit', () => ({
  __esModule: true,
  default: ({ id, version, updateErrRef }: any) => (
    <button
      type='button'
      onClick={() =>
        updateErrRef?.({
          id,
          version,
          ruleVerification: false,
          nonExistent: false,
        })
      }
    >
      {`edit ${id}:${version}`}
    </button>
  ),
}));

jest.mock('@/pages/Unitgroups/Components/select/formMini', () => ({
  __esModule: true,
  default: ({ id, version, idType }: any) => (
    <span data-testid='unit-group-mini'>{`${idType}:${id}:${version}`}</span>
  ),
}));

const mockGetFlowDetail = jest.fn(async () => ({
  data: {
    id: 'flow-1',
    version: '1.0.0',
    userId: mockRefDataUserId,
    stateCode: 10,
    ruleVerification: false,
    json: {
      flowDataSet: {
        flowInformation: {
          dataSetInformation: {
            name: { baseName: [{ '@xml:lang': 'en', '#text': 'Flow short name' }] },
          },
        },
      },
    },
  },
}));

jest.mock('@/services/flows/api', () => ({
  __esModule: true,
  getFlowDetail: (...args: any[]) => mockGetFlowDetail(...args),
}));

jest.mock('@/services/flows/util', () => ({
  __esModule: true,
  genFlowFromData: jest.fn((payload: any) => payload ?? {}),
  genFlowNameJson: jest.fn(() => [{ '@xml:lang': 'en', '#text': 'Flow short name' }]),
}));

const mockGetRefData = jest.fn(async () => ({
  data: {
    id: 'flow-1',
    version: '1.0.0',
    userId: mockRefDataUserId,
    stateCode: 10,
    ruleVerification: false,
  },
}));

jest.mock('@/services/general/api', () => ({
  __esModule: true,
  getRefData: (...args: any[]) => mockGetRefData(...args),
}));

const mockValidateRefObjectId = jest.fn();
const mockGetLocalValueProps = jest.fn((value: string) => ({
  value: value === 'en' ? 'English' : value,
}));

jest.mock('@/pages/Utils', () => ({
  __esModule: true,
  getLocalValueProps: (...args: any[]) => mockGetLocalValueProps(...args),
  validateRefObjectId: (...args: any[]) => mockValidateRefObjectId(...args),
}));

jest.mock('@/contexts/refCheckContext', () => {
  const React = require('react');
  const RefCheckContext = React.createContext(mockRefCheckContextValue);
  return {
    __esModule: true,
    RefCheckContext,
    useRefCheckContext: () => mockRefCheckContextValue,
  };
});

const setValueAtPath = (path: any[], value: any) => {
  let cursor = mockFormState;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    cursor[key] = cursor[key] ? { ...cursor[key] } : {};
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
};

const getValueAtPath = (path: any[]) => {
  let cursor: any = mockFormState;
  for (let index = 0; index < path.length; index += 1) {
    cursor = cursor?.[path[index]];
    if (cursor === undefined) return undefined;
  }
  return cursor;
};

describe('FlowsSelectForm', () => {
  const FlowsSelectForm = require('@/pages/Flows/Components/select/form').default;

  beforeEach(() => {
    Object.keys(mockFormState).forEach((key) => delete mockFormState[key]);
    mockRefCheckContextValue.refCheckData = [];
    mockCurrentUserId = 'user-1';
    mockRefDataUserId = 'user-1';
    mockRefObjectIdRules = [];
    jest.clearAllMocks();
  });

  it('shows the required label without activating reference validation', () => {
    const formRef = {
      current: { getFieldValue: jest.fn(), setFieldValue: jest.fn() },
    };
    renderWithProviders(
      <FlowsSelectForm
        name={['reference']}
        label='Flow'
        lang='en'
        formRef={formRef}
        drawerVisible
        onData={jest.fn()}
        rules={[]}
        showRequiredLabel
      />,
    );
    expect(screen.getByTestId('required-title')).toHaveTextContent('Flow');
    expect(mockRefObjectIdRules).toEqual([]);
    expect(formRef.current.setFieldValue).not.toHaveBeenCalled();
  });

  it('handles flow selection, renders related actions, and clears the selected ref', async () => {
    const onData = jest.fn();
    const formRef = {
      current: {
        setFieldValue: (path: any[], value: any) => setValueAtPath(path, value),
        getFieldValue: (path: any[]) => getValueAtPath(path),
      },
    };

    await act(async () => {
      renderWithProviders(
        <FlowsSelectForm
          name={['reference']}
          label='Flow'
          lang='en'
          formRef={formRef as any}
          drawerVisible={true}
          onData={onData}
          rules={[{ required: true, message: 'Flow is required' }]}
        />,
      );
    });

    expect(screen.getByTestId('required-title')).toHaveTextContent('Flow');

    await userEvent.click(screen.getByRole('button', { name: /open drawer/i }));

    await waitFor(() => expect(mockFormState.reference['@refObjectId']).toBe('flow-1'));
    expect(mockFormState.reference['@type']).toBe('flow data set');
    expect(mockFormState.reference['@uri']).toBe('../flows/flow-1.xml');
    expect(mockFormState.reference['common:shortDescription'][0]['#text']).toBe('Flow short name');
    expect(mockValidateRefObjectId).toHaveBeenCalledWith(formRef, ['reference']);
    expect(onData).toHaveBeenCalledTimes(1);

    expect(await screen.findByText('view flow-1:1.0.0')).toBeInTheDocument();
    expect(screen.getByText('edit flow-1:1.0.0')).toBeInTheDocument();
    expect(screen.getByTestId('unit-group-mini')).toHaveTextContent('flow:flow-1:1.0.0');

    await userEvent.click(screen.getByRole('button', { name: 'edit flow-1:1.0.0' }));

    await userEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect(mockFormState.reference).toEqual({});
    expect(mockValidateRefObjectId).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenCalledTimes(2);
  });

  it('only restores existing selections when the parent drawer is open', async () => {
    setValueAtPath(['reference', '@refObjectId'], 'flow-1');
    setValueAtPath(['reference', '@version'], '1.0.0');
    mockRefCheckContextValue.refCheckData = [
      {
        id: 'flow-1',
        version: '1.0.0',
        ruleVerification: true,
        nonExistent: true,
      },
    ];
    mockRefDataUserId = 'other-user';

    const formRef = {
      current: {
        setFieldValue: (path: any[], value: any) => setValueAtPath(path, value),
        getFieldValue: (path: any[]) => getValueAtPath(path),
      },
    };

    const { rerender } = renderWithProviders(
      <FlowsSelectForm
        name={['reference']}
        label='Flow'
        lang='en'
        formRef={formRef as any}
        drawerVisible={false}
        onData={jest.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /reselect/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /update reference/i })).not.toBeInTheDocument();

    rerender(
      <FlowsSelectForm
        name={['reference']}
        label='Flow'
        lang='en'
        formRef={formRef as any}
        drawerVisible={true}
        onData={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockGetRefData).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /reselect/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update reference/i })).toBeInTheDocument();
    expect(screen.getByText('view flow-1:1.0.0')).toBeInTheDocument();
    expect(screen.queryByText('edit flow-1:1.0.0')).not.toBeInTheDocument();
    expect(await screen.findByText('err-ref')).toBeInTheDocument();
  });

  it('clears stale err refs when the current ref data no longer matches ref-check results', async () => {
    setValueAtPath(['reference', '@refObjectId'], 'flow-1');
    setValueAtPath(['reference', '@version'], '1.0.0');
    mockRefCheckContextValue.refCheckData = [
      {
        id: 'different-flow',
        version: '9.9.9',
        ruleVerification: true,
        nonExistent: true,
      },
    ];

    const formRef = {
      current: {
        setFieldValue: (path: any[], value: any) => setValueAtPath(path, value),
        getFieldValue: (path: any[]) => getValueAtPath(path),
      },
    };

    renderWithProviders(
      <FlowsSelectForm
        name={['reference']}
        label='Flow'
        lang='en'
        formRef={formRef as any}
        drawerVisible={true}
        onData={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockGetRefData).toHaveBeenCalled());
    expect(screen.queryByText('err-ref')).not.toBeInTheDocument();
  });

  it('stores null ref details when getRefData returns no dataset and evaluates ref-check version mismatches against refData', async () => {
    setValueAtPath(['reference', '@refObjectId'], 'flow-1');
    setValueAtPath(['reference', '@version'], '1.0.0');
    mockRefCheckContextValue.refCheckData = [
      {
        id: 'flow-1',
        version: '9.9.9',
        ruleVerification: true,
        nonExistent: true,
      },
    ];
    mockGetRefData.mockResolvedValueOnce({ data: null });

    const formRef = {
      current: {
        setFieldValue: (path: any[], value: any) => setValueAtPath(path, value),
        getFieldValue: (path: any[]) => getValueAtPath(path),
      },
    };

    renderWithProviders(
      <FlowsSelectForm
        name={['reference']}
        label='Flow'
        lang='en'
        formRef={formRef as any}
        drawerVisible={true}
        onData={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(mockGetRefData).toHaveBeenCalledWith('flow-1', '1.0.0', 'flows', ''),
    );
    expect(screen.queryByText('err-ref')).not.toBeInTheDocument();
  });

  it('checks mismatched ref-check versions against loaded refData when ids still match', async () => {
    setValueAtPath(['reference', '@refObjectId'], 'flow-1');
    setValueAtPath(['reference', '@version'], '1.0.0');
    mockRefCheckContextValue.refCheckData = [
      {
        id: 'flow-1',
        version: '9.9.9',
        ruleVerification: true,
        nonExistent: true,
      },
    ];

    const formRef = {
      current: {
        setFieldValue: (path: any[], value: any) => setValueAtPath(path, value),
        getFieldValue: (path: any[]) => getValueAtPath(path),
      },
    };

    renderWithProviders(
      <FlowsSelectForm
        name={['reference']}
        label='Flow'
        lang='en'
        formRef={formRef as any}
        drawerVisible={true}
        onData={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(mockGetRefData).toHaveBeenCalledWith('flow-1', '1.0.0', 'flows', ''),
    );
    expect(screen.queryByText('err-ref')).not.toBeInTheDocument();
  });

  it('falls back to empty flow payloads and empty versions when flow details are sparse', async () => {
    mockGetFlowDetail.mockResolvedValue({
      data: {
        id: 'flow-sparse',
        userId: mockRefDataUserId,
        json: {},
      },
    });

    const onData = jest.fn();
    const formRef = {
      current: {
        setFieldValue: (path: any[], value: any) => setValueAtPath(path, value),
        getFieldValue: (path: any[]) => getValueAtPath(path),
      },
    };

    renderWithProviders(
      <FlowsSelectForm
        name={['reference']}
        label='Flow'
        lang='en'
        formRef={formRef as any}
        drawerVisible={true}
        onData={onData}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /open drawer/i }));
    await waitFor(() => expect(mockFormState.reference['@refObjectId']).toBe('flow-1'));

    expect(mockFormState.reference['@version']).toBe('');
    expect(screen.getByText('view flow-1:')).toBeInTheDocument();
    expect(screen.getByText('edit flow-1:')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /update reference/i }));

    await waitFor(() => expect(mockGetFlowDetail).toHaveBeenLastCalledWith('flow-1', ''));
    expect(onData).toHaveBeenCalledTimes(2);
  });

  it('runs the required validator and renders localized short-description rows', async () => {
    setValueAtPath(
      ['reference', 'common:shortDescription'],
      [
        {
          '@xml:lang': 'en',
          '#text': 'Localized flow short description',
        },
      ],
    );

    const formRef = {
      current: {
        setFieldValue: (path: any[], value: any) => setValueAtPath(path, value),
        getFieldValue: (path: any[]) => getValueAtPath(path),
      },
    };

    renderWithProviders(
      <FlowsSelectForm
        name={['reference']}
        label='Flow'
        lang='en'
        formRef={formRef as any}
        drawerVisible={true}
        onData={jest.fn()}
        rules={[{ required: true, message: 'Flow is required' }]}
      />,
    );

    const validatorRule = mockRefObjectIdRules.find(
      (rule) => typeof rule?.validator === 'function',
    );
    await act(async () => {
      await expect(validatorRule.validator({}, undefined)).rejects.toThrow();
    });
    await act(async () => {
      await expect(validatorRule.validator({}, 'flow-1')).resolves.toBeUndefined();
    });

    expect(mockGetLocalValueProps).toHaveBeenCalledWith('en');
    expect(screen.getByDisplayValue('English')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Localized flow short description')).toBeInTheDocument();
  });

  it('updates existing references with an empty version fallback when the form only stores the ref object id', async () => {
    setValueAtPath(['reference', '@refObjectId'], 'flow-legacy');
    mockGetFlowDetail.mockResolvedValue({
      data: {
        id: 'flow-legacy',
        version: '2.0.0',
        userId: mockRefDataUserId,
        stateCode: 10,
        ruleVerification: false,
        json: {
          flowDataSet: {
            flowInformation: {
              dataSetInformation: {
                name: { baseName: [{ '@xml:lang': 'en', '#text': 'Legacy flow name' }] },
              },
            },
          },
        },
      },
    });

    const onData = jest.fn();
    const formRef = {
      current: {
        setFieldValue: (path: any[], value: any) => setValueAtPath(path, value),
        getFieldValue: (path: any[]) => getValueAtPath(path),
      },
    };

    renderWithProviders(
      <FlowsSelectForm
        name={['reference']}
        label='Flow'
        lang='en'
        formRef={formRef as any}
        drawerVisible={true}
        onData={onData}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /update reference/i }));

    await waitFor(() => expect(mockGetFlowDetail).toHaveBeenCalledWith('flow-legacy', ''));
    expect(onData).toHaveBeenCalledTimes(1);
  });

  it('matches ref checks against resolved detail identity and clears a stale edit result', async () => {
    setValueAtPath(['reference', '@refObjectId'], 'local-flow');
    setValueAtPath(['reference', '@version'], '9.9.9');
    mockGetRefData.mockResolvedValueOnce({
      data: {
        id: 'resolved-flow',
        version: '1.0.0',
        userId: 'user-1',
        stateCode: 10,
        ruleVerification: true,
      },
    });
    mockRefCheckContextValue.refCheckData = [
      {
        id: 'resolved-flow',
        version: '1.0.0',
        ruleVerification: true,
        nonExistent: true,
      },
    ];

    const formRef = {
      current: {
        setFieldValue: (path: any[], value: any) => setValueAtPath(path, value),
        getFieldValue: (path: any[]) => getValueAtPath(path),
      },
    };

    const { rerender } = renderWithProviders(
      <FlowsSelectForm
        name={['reference']}
        label='Flow'
        lang='en'
        formRef={formRef as any}
        drawerVisible={true}
        onData={jest.fn()}
      />,
    );

    expect(await screen.findByText('err-ref')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'edit local-flow:9.9.9' }));

    mockRefCheckContextValue.refCheckData = [
      {
        id: 'different-flow',
        version: '2.0.0',
        ruleVerification: true,
        nonExistent: true,
      },
    ];
    rerender(
      <FlowsSelectForm
        name={['reference']}
        label='Flow'
        lang='en'
        formRef={formRef as any}
        drawerVisible={true}
        onData={jest.fn()}
      />,
    );

    await waitFor(() => expect(screen.queryByText('err-ref')).not.toBeInTheDocument());
  });
});
