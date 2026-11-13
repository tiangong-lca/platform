/**
 * Tests for LangTextItemForm component
 * Path: src/components/LangTextItem/form.tsx
 */

import LangTextItemForm from '@/components/LangTextItem/form';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from 'antd';

const listRulesByPath: Record<string, any[]> = {};
const fieldRulesByPath: Record<string, any[]> = {};
let mockLocale = 'en-US';

jest.mock('umi', () => ({
  FormattedMessage: ({ id, defaultMessage }: { id: string; defaultMessage?: string }) => (
    <span>{defaultMessage ?? id}</span>
  ),
  useIntl: () => ({
    locale: mockLocale,
    formatMessage: (
      { id, defaultMessage }: { id: string; defaultMessage?: string },
      values?: Record<string, string | number>,
    ) =>
      Object.entries(values ?? {}).reduce((message, [key, value]) => {
        return message.split(`{${key}}`).join(String(value));
      }, defaultMessage ?? id),
  }),
}));

jest.mock('@ant-design/icons', () => ({
  CloseOutlined: ({ onClick, style }: any) => (
    <button type='button' aria-label='remove-entry' onClick={onClick} style={style}>
      ×
    </button>
  ),
}));

jest.mock('antd', () => {
  const React = require('react') as typeof import('react');

  const FormContext = React.createContext<any>(null);

  const normalizePath = (path: any): (string | number)[] =>
    Array.isArray(path) ? path : path !== undefined ? [path] : [];

  const Form = ({ children, formRef }: any) => {
    const contextValue = React.useMemo(
      () => ({ form: formRef?.current ?? {}, prefix: [] as Path }),
      [formRef],
    );

    return <FormContext.Provider value={contextValue}>{children}</FormContext.Provider>;
  };

  Form.useFormInstance = () => React.useContext(FormContext).form;

  const useFormSubscription = (form: any) => {
    const [, forceUpdate] = React.useReducer((count: number) => count + 1, 0);

    React.useEffect(() => {
      if (!form?.subscribe) {
        return;
      }

      // Ant Design useWatch also reads the value at subscription time, including
      // initial values registered by a child Form.List during the same commit.
      forceUpdate();
      return form.subscribe(() => {
        forceUpdate();
      });
    }, [form]);
  };

  Form.useWatch = (name: any, formInstance?: any) => {
    const context = React.useContext(FormContext);
    const form = formInstance ?? context.form;
    useFormSubscription(form);
    return form?.getFieldValue(name);
  };

  const FormItem = ({ name, children, style, rules = [], help, validateStatus }: any) => {
    const { form, prefix } = React.useContext(FormContext);
    useFormSubscription(form);
    const path = [...prefix, ...normalizePath(name)];
    fieldRulesByPath[path.join('.')] = rules;

    if (path.length === 0) {
      return <div style={style}>{children}</div>;
    }

    const value = form.getFieldValue(path);

    const handleChange = (next: any) => {
      const resolvedValue = next && next.target !== undefined ? next.target.value : next;
      form.setFieldValue(path, resolvedValue);
      children?.props?.onChange?.(resolvedValue);
      rules.forEach((rule: any) => {
        if (typeof rule?.validator === 'function') {
          Promise.resolve(rule.validator(null, resolvedValue)).catch(() => {});
        }
      });
    };

    const content = React.isValidElement(children)
      ? React.cloneElement(
          children as React.ReactElement<any>,
          {
            value,
            onChange: handleChange,
          } as any,
        )
      : typeof children === 'function'
        ? children({ value, onChange: handleChange })
        : children;

    return (
      <div data-validate-status={validateStatus} style={style}>
        {content}
        {help}
      </div>
    );
  };

  const FormList = ({ name, children, rules = [], initialValue }: any) => {
    const context = React.useContext(FormContext);
    const form = context.form;
    const prefixArray = Array.isArray(context.prefix) ? context.prefix : [];
    const nameArray = normalizePath(name);
    const prefixKey = prefixArray.join('|');
    const nameKey = nameArray.join('|');

    const path = React.useMemo(() => {
      return [...prefixArray, ...nameArray];
    }, [prefixKey, nameKey]);

    const pathKey = React.useMemo(() => path.join('|'), [path]);
    const rulesRef = React.useRef(rules);
    rulesRef.current = rules;
    listRulesByPath[pathKey] = rulesRef.current;

    const [fields, setFields] = React.useState<Array<{ key: number; name: number }>>([]);

    React.useEffect(() => {
      if (form.getFieldValue(path) === undefined && initialValue !== undefined) {
        form.setFieldValue(path, JSON.parse(JSON.stringify(initialValue)));
      }

      const handleValuesChange = (values: any[]) => {
        const nextFields: Array<{ key: number; name: number }> = Array.isArray(values)
          ? values.map((_: any, index: number) => ({ key: index, name: index }))
          : [];

        setFields((prev: Array<{ key: number; name: number }>) => {
          if (
            prev.length === nextFields.length &&
            prev.every(
              (field: { key: number; name: number }, index: number) =>
                field.name === nextFields[index]?.name,
            )
          ) {
            return prev;
          }
          return nextFields;
        });

        if (Array.isArray(values)) {
          rulesRef.current.forEach((rule: any) => {
            if (typeof rule?.validator === 'function') {
              Promise.resolve(rule.validator(null, values)).catch(() => {});
            }
          });
        }
      };

      form.registerList(path, handleValuesChange);
    }, [form, path, pathKey]);

    const add = () => {
      const current = form.getFieldValue(path) ?? [];
      const next = Array.isArray(current) ? [...current, {}] : [{}];
      form.setFieldValue(path, next);
    };

    const remove = (nameIndex: number) => {
      const current = form.getFieldValue(path) ?? [];
      const next = Array.isArray(current)
        ? current.filter((_: any, index: number) => index !== nameIndex)
        : [];
      form.setFieldValue(path, next);
    };

    const renderedChildren = children(fields, { add, remove });

    return (
      <FormContext.Provider value={{ form, prefix: path }}>{renderedChildren}</FormContext.Provider>
    );
  };

  const Select = ({ value, onChange, options = [], placeholder }: any) => {
    const resolvedPlaceholder =
      typeof placeholder === 'string'
        ? placeholder
        : typeof placeholder?.props?.defaultMessage === 'string'
          ? placeholder.props.defaultMessage
          : 'Select';

    return (
      <label>
        <span className='sr-only'>{resolvedPlaceholder}</span>
        <select
          aria-label={resolvedPlaceholder}
          value={value ?? ''}
          onChange={(event) => onChange?.(event.target.value)}
        >
          <option value='' disabled>
            {resolvedPlaceholder}
          </option>
          {options.map((option: any) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  };

  const TextArea = ({ value, onChange }: any) => (
    <textarea value={value ?? ''} onChange={(event) => onChange?.(event)} />
  );

  const Input = { TextArea };

  const Button = ({ children, onClick, style }: any) => (
    <button type='button' style={style} onClick={onClick}>
      {children}
    </button>
  );

  const Row = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  const Col = ({ children }: any) => <div>{children}</div>;

  const message = {
    error: jest.fn(),
  };

  Form.Item = FormItem;
  Form.List = FormList;
  const App = require('../../mocks/antdApp').createAntdAppMock({ message });

  return {
    App,
    Form,
    Button,
    Select,
    Input,
    Row,
    Col,
    message,
  };
});

type ReactNode = import('react').ReactNode;

type RenderOptions = {
  name?: (string | number)[];
  label?: ReactNode;
  rules?: any[];
  fieldErrorMessages?: Record<number, string[]>;
  listName?: string[];
  setRuleErrorState?: jest.Mock;
  initialValues?: Record<string, unknown>;
  defaultLanguages?: readonly string[];
  autoExpandRequired?: boolean;
};

type Path = (string | number)[];

const normalizePath = (path: any): Path => (Array.isArray(path) ? path : [path]);

const getNestedValue = (target: any, path: Path) =>
  path.reduce(
    (acc: any, key) => (acc === null || acc === undefined ? undefined : acc[key]),
    target,
  );

const setNestedValue = (target: any, path: Path, value: any) => {
  let cursor = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (cursor[key] === undefined || cursor[key] === null) {
      cursor[key] = typeof path[i + 1] === 'number' ? [] : {};
    }
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
};

const createFormRef = (initialValues: Record<string, unknown>) => {
  const store: Record<string, unknown> = JSON.parse(JSON.stringify(initialValues));
  const validators = new Map<string, (values: any[]) => void>();
  const listeners = new Set<() => void>();

  const buildKey = (path: Path) => path.join('|');

  const registerList = (path: Path, callback: (values: any[]) => void) => {
    const key = buildKey(path);
    validators.set(key, callback);
    const current = getNestedValue(store, path) ?? [];
    callback(Array.isArray(current) ? current : []);
  };

  const notifyValidators = (path: Path) => {
    for (let i = path.length; i >= 0; i -= 1) {
      const slice = path.slice(0, i);
      const key = buildKey(slice);
      if (validators.has(key)) {
        const callback = validators.get(key)!;
        const current = getNestedValue(store, slice) ?? [];
        callback(Array.isArray(current) ? current : []);
      }
    }
  };

  return {
    current: {
      getFieldValue: (path: any) => getNestedValue(store, normalizePath(path)),
      setFieldValue: (path: any, value: any) => {
        const normalized = normalizePath(path);
        setNestedValue(store, normalized, value);
        notifyValidators(normalized);
        listeners.forEach((listener) => listener());
      },
      registerList: (path: Path, callback: (values: any[]) => void) => {
        registerList(path, callback);
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    store,
  };
};

const renderLangTextItemForm = (options: RenderOptions = {}) => {
  const {
    name = ['translations'],
    label = 'Translation',
    rules = [],
    fieldErrorMessages,
    listName,
    setRuleErrorState,
    initialValues = {},
    autoExpandRequired,
  } = options;

  const formRef = createFormRef(initialValues);
  // Existing tests explicitly exercise manual-entry mode; the locale-default
  // scenarios below pass an undefined override to use the product default.
  const defaultLanguages = Object.prototype.hasOwnProperty.call(options, 'defaultLanguages')
    ? options.defaultLanguages
    : [];

  const Wrapper = () => (
    <Form {...({ formRef } as any)}>
      <LangTextItemForm
        name={name}
        label={label}
        rules={rules}
        fieldErrorMessages={fieldErrorMessages}
        listName={listName}
        setRuleErrorState={setRuleErrorState}
        formRef={formRef}
        defaultLanguages={defaultLanguages}
        autoExpandRequired={autoExpandRequired}
      />
    </Form>
  );

  return { ...render(<Wrapper />), formRef };
};

const originalRequestAnimationFrame = global.requestAnimationFrame;
const originalWindowRequestAnimationFrame =
  typeof window !== 'undefined' ? window.requestAnimationFrame : undefined;

beforeAll(() => {
  const raf = (callback: FrameRequestCallback) => {
    act(() => {
      callback(performance.now());
    });
    return 0;
  };

  global.requestAnimationFrame = raf as typeof global.requestAnimationFrame;
  if (typeof window !== 'undefined') {
    window.requestAnimationFrame = raf as typeof window.requestAnimationFrame;
  }
});

afterAll(() => {
  if (originalRequestAnimationFrame) {
    global.requestAnimationFrame = originalRequestAnimationFrame;
  } else {
    // @ts-expect-error cleanup fallback
    delete global.requestAnimationFrame;
  }

  if (typeof window !== 'undefined') {
    if (originalWindowRequestAnimationFrame) {
      window.requestAnimationFrame = originalWindowRequestAnimationFrame;
    } else {
      // @ts-expect-error cleanup fallback
      delete window.requestAnimationFrame;
    }
  }
});

describe('LangTextItemForm', () => {
  const { message } = jest.requireMock('antd') as { message: { error: jest.Mock } };

  afterEach(() => {
    jest.clearAllMocks();
    mockLocale = 'en-US';
    Object.keys(listRulesByPath).forEach((key) => delete listRulesByPath[key]);
    Object.keys(fieldRulesByPath).forEach((key) => delete fieldRulesByPath[key]);
  });

  it.each<[string, string[]]>([
    ['en-US', ['en']],
    ['zh-CN', ['zh', 'en']],
    ['de-DE', ['de', 'en']],
    ['fr-FR', ['fr', 'en']],
    ['unsupported-locale', ['en']],
  ])('opens the current UI language before English for %s', async (locale, expected) => {
    mockLocale = locale;
    const { formRef } = renderLangTextItemForm({
      defaultLanguages: undefined,
      autoExpandRequired: true,
    });

    await waitFor(() => {
      expect(
        screen.getAllByRole('combobox').map((select) => (select as HTMLSelectElement).value),
      ).toEqual(expected);
    });
    expect(formRef.current.getFieldValue(['translations'])).toEqual(
      expected.map((language) => ({ '@xml:lang': language })),
    );
    expect(
      screen.getAllByRole('textbox').every((input) => !(input as HTMLTextAreaElement).value),
    ).toBe(true);
  });

  it('keeps stored text and SDK error indexes while displaying Chinese first', async () => {
    mockLocale = 'zh-CN';
    const stored = [
      { '@xml:lang': 'en', '#text': 'English text' },
      { '@xml:lang': 'fr', '#text': 'Texte français' },
      { '@xml:lang': 'en', '#text': 'Another English paragraph' },
    ];
    const { formRef } = renderLangTextItemForm({
      defaultLanguages: undefined,
      autoExpandRequired: true,
      initialValues: { translations: stored },
      fieldErrorMessages: { 1: ['French field error'] },
    });

    await waitFor(() => {
      expect(
        screen.getAllByRole('combobox').map((select) => (select as HTMLSelectElement).value),
      ).toEqual(['zh', 'en', 'en', 'fr']);
    });
    expect(formRef.current.getFieldValue(['translations'])).toEqual([
      ...stored,
      { '@xml:lang': 'zh' },
    ]);
    expect(
      screen.getByDisplayValue('Texte français').closest('[data-validate-status]'),
    ).toHaveAttribute('data-validate-status', 'error');
  });

  it('allows a blank optional default language while still requiring English text', async () => {
    mockLocale = 'zh-CN';
    renderLangTextItemForm({ defaultLanguages: undefined, rules: [{ required: true }] });
    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(2));

    await expect(
      fieldRulesByPath['translations.0.#text'][0].validator(null, ''),
    ).resolves.toBeUndefined();
    await expect(fieldRulesByPath['translations.1.#text'][0].validator(null, '')).rejects.toThrow(
      'Please input this field',
    );
    await expect(
      fieldRulesByPath['translations.1.#text'][0].validator(null, 'English text'),
    ).resolves.toBeUndefined();
  });

  it('reuses an empty row without overwriting an entry whose language is missing', async () => {
    mockLocale = 'zh-CN';
    const { formRef } = renderLangTextItemForm({
      defaultLanguages: undefined,
      autoExpandRequired: true,
      initialValues: { translations: [{}, { '#text': 'Keep unassigned text' }] },
    });
    await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(3));
    expect(formRef.current.getFieldValue(['translations'])).toEqual([
      { '@xml:lang': 'zh' },
      { '#text': 'Keep unassigned text' },
      { '@xml:lang': 'en' },
    ]);
  });

  it('respects an explicit language change instead of continually recreating the default row', async () => {
    const { formRef } = renderLangTextItemForm({
      defaultLanguages: undefined,
      autoExpandRequired: true,
    });
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('en'));
    await userEvent.setup().selectOptions(screen.getByRole('combobox'), 'fr');
    await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(1));
    expect(formRef.current.getFieldValue(['translations'])).toEqual([{ '@xml:lang': 'fr' }]);
  });

  it('prevents removing the final required entry', async () => {
    renderLangTextItemForm({
      rules: [{ required: true }],
      initialValues: {},
    });

    const user = userEvent.setup();

    const [languageSelect] = await screen.findAllByRole('combobox');
    expect(languageSelect).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'remove-entry' }));

    await waitFor(() => {
      expect(screen.getAllByRole('combobox')).toHaveLength(1);
    });
  });

  it('allows adding and removing optional language entries', async () => {
    renderLangTextItemForm({ rules: [] });

    const user = userEvent.setup();

    const addButton = screen.getByRole('button', { name: /Add Translation Item/i });

    await user.click(addButton);
    await waitFor(() => {
      expect(screen.getAllByRole('combobox')).toHaveLength(1);
    });

    await user.selectOptions(screen.getByRole('combobox'), 'en');

    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getAllByRole('combobox')).toHaveLength(2);
    });

    const removeButtons = screen.getAllByRole('button', { name: 'remove-entry' });
    await user.click(removeButtons[1]);

    await waitFor(() => {
      expect(screen.getAllByRole('combobox')).toHaveLength(1);
    });
  });

  it('offers every registry authoring language and preserves unknown stored language codes', async () => {
    const { unmount } = renderLangTextItemForm({
      initialValues: {
        translations: [{ '@xml:lang': 'de', '#text': 'Deutsch' }],
      },
    });

    const declaredSelect = screen.getByRole('combobox');
    expect(
      Array.from(declaredSelect.querySelectorAll('option')).map((option) => option.value),
    ).toEqual(['', 'en', 'zh', 'de', 'fr']);
    expect(declaredSelect).toHaveValue('de');

    unmount();
    renderLangTextItemForm({
      initialValues: {
        translations: [{ '@xml:lang': 'ja', '#text': '日本語' }],
      },
    });

    const legacySelect = screen.getByRole('combobox');
    expect(legacySelect).toHaveValue('ja');
    expect(screen.getByRole('option', { name: 'Japanese' })).toBeDisabled();
  });

  it('exposes the hydrated content-language code on each authoring row', async () => {
    renderLangTextItemForm({
      initialValues: {
        translations: [
          { '@xml:lang': 'en', '#text': 'English value' },
          { '@xml:lang': 'de', '#text': 'Deutscher Wert' },
        ],
      },
    });

    await waitFor(() => {
      expect(document.querySelector('[data-content-language="en"]')).toBeInTheDocument();
      expect(document.querySelector('[data-content-language="de"]')).toBeInTheDocument();
    });
  });

  it('updates the content-language code when an empty row selects a language', async () => {
    renderLangTextItemForm({
      initialValues: {
        translations: [{}],
      },
    });

    expect(document.querySelector('[data-content-language]')).not.toBeInTheDocument();

    await userEvent.setup().selectOptions(screen.getByRole('combobox'), 'en');

    await waitFor(() => {
      expect(document.querySelector('[data-content-language="en"]')).toBeInTheDocument();
    });
  });

  it('disables selecting duplicate languages across entries', async () => {
    renderLangTextItemForm({ rules: [] });

    const user = userEvent.setup();

    const addButton = screen.getByRole('button', { name: /Add Translation Item/i });

    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getAllByRole('combobox')).toHaveLength(1);
    });

    await user.selectOptions(screen.getByRole('combobox'), 'en');

    await user.click(addButton);

    await waitFor(() => {
      expect(screen.getAllByRole('combobox')).toHaveLength(2);
    });

    const selects = screen.getAllByRole('combobox');
    const duplicateOption = selects[1].querySelector(
      "option[value='en']",
    ) as HTMLOptionElement | null;

    expect(duplicateOption).not.toBeNull();
    expect(duplicateOption).toBeDisabled();
  });

  it('invokes setRuleErrorState based on validator results', async () => {
    const setRuleErrorState = jest.fn();

    const { formRef } = renderLangTextItemForm({
      rules: [{ required: true }],
      setRuleErrorState,
      initialValues: {
        translations: [{ '@xml:lang': 'zh', '#text': '你好' }],
      },
    });

    await waitFor(() => {
      expect(setRuleErrorState).toHaveBeenCalledWith(true);
    });

    const [select] = screen.getAllByRole('combobox');
    const user = userEvent.setup();

    await user.selectOptions(select, 'en');

    const currentValues = formRef.current.getFieldValue(['translations']);
    await act(async () => {
      formRef.current.setFieldValue(['translations'], currentValues);
    });

    await waitFor(() => {
      expect(setRuleErrorState).toHaveBeenLastCalledWith(false);
    });
  });

  it('shows a validation message when required English translation is missing', async () => {
    const { formRef } = renderLangTextItemForm({
      rules: [{ required: true }],
    });

    const user = userEvent.setup();

    const [select] = await screen.findAllByRole('combobox');
    await user.selectOptions(select, 'zh');

    const currentValues = formRef.current.getFieldValue(['translations']);
    await act(async () => {
      formRef.current.setFieldValue(['translations'], currentValues);
    });

    await waitFor(() => {
      expect(message.error).toHaveBeenCalledWith('English is a required language');
    });
  });

  it('repairs an explicit empty required list and rejects an empty submit payload', async () => {
    const setRuleErrorState = jest.fn();
    renderLangTextItemForm({
      label: 'Treatment, standards, routes',
      rules: [{ required: true }],
      initialValues: { translations: [] },
      setRuleErrorState,
    });

    await waitFor(() => {
      expect(screen.getAllByRole('combobox')).toHaveLength(1);
    });

    const listRule = listRulesByPath.translations?.[0];
    await expect(listRule.validator(null, [])).rejects.toThrow('Please input this field');
    await expect(listRule.validator(null, [{}])).resolves.toBeUndefined();

    await waitFor(() => {
      expect(setRuleErrorState).toHaveBeenLastCalledWith(false);
    });

    expect(setRuleErrorState).not.toHaveBeenCalledWith(true);
    expect(
      screen.queryByText('Please complete Treatment, standards, routes.'),
    ).not.toBeInTheDocument();
    expect(message.error).not.toHaveBeenCalled();
  });

  it('uses the surrounding form context and locale defaults when formRef is omitted', async () => {
    const wrapperFormRef = createFormRef({});

    render(
      <Form {...({ formRef: wrapperFormRef } as any)}>
        <LangTextItemForm
          name={['translations']}
          label='Translation'
          autoExpandRequired
          rules={[]}
        />
      </Form>,
    );

    await userEvent.click(screen.getByRole('button', { name: /add translation item/i }));

    expect(wrapperFormRef.store).toEqual({ translations: [{ '@xml:lang': 'en' }, {}] });
  });

  it('reads initial values when using listName for nested lists', async () => {
    const initialValues = {
      review: [
        {
          'common:otherReviewDetails': [{ '@xml:lang': 'en', '#text': 'Review notes' }],
        },
      ],
    };

    const formRef = createFormRef(initialValues);

    const NestedWrapper = () => (
      <Form {...({ formRef } as any)}>
        <Form.List name={['review']}>
          {(fields: Array<{ key: number; name: number }>) => (
            <>
              {fields.map((field) => (
                <LangTextItemForm
                  key={field.key}
                  name={[field.name, 'common:otherReviewDetails']}
                  listName={['review']}
                  formRef={formRef}
                  label='Review details'
                />
              ))}
            </>
          )}
        </Form.List>
      </Form>
    );

    render(<NestedWrapper />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Review notes')).toBeInTheDocument();
    });
  });

  it('resolves a scalar field name with an explicitly declared list path', async () => {
    const formRef = createFormRef({
      details: [{ '@xml:lang': 'fr', '#text': 'Notes de revue' }],
    });

    render(
      <Form {...({ formRef } as any)}>
        <LangTextItemForm name='details' listName={[]} formRef={formRef} label='Review details' />
      </Form>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Notes de revue')).toBeInTheDocument();
      expect(document.querySelector('[data-content-language="fr"]')).toBeInTheDocument();
    });
  });

  it('subscribes to the correct nested list row when its language changes', async () => {
    const initialValues = {
      review: [
        {
          'common:otherReviewDetails': [{ '@xml:lang': 'zh', '#text': '首条评论' }],
        },
        {
          'common:otherReviewDetails': [{ '@xml:lang': 'en', '#text': 'Second review' }],
        },
      ],
    };

    const formRef = createFormRef(initialValues);

    const NestedWrapper = () => (
      <Form {...({ formRef } as any)}>
        <Form.List name={['review']}>
          {(fields: Array<{ key: number; name: number }>) => (
            <>
              {fields.map((field) => (
                <LangTextItemForm
                  key={field.key}
                  name={[field.name, 'common:otherReviewDetails']}
                  listName={['review']}
                  defaultLanguages={[]}
                  formRef={formRef}
                  label='Review details'
                />
              ))}
            </>
          )}
        </Form.List>
      </Form>
    );

    render(<NestedWrapper />);

    await waitFor(() => {
      expect(document.querySelector('[data-content-language="zh"]')).toBeInTheDocument();
      expect(document.querySelector('[data-content-language="en"]')).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    await userEvent.setup().selectOptions(selects[1], 'de');

    await waitFor(() => {
      expect(document.querySelector('[data-content-language="en"]')).not.toBeInTheDocument();
      expect(document.querySelector('[data-content-language="de"]')).toBeInTheDocument();
    });
  });

  it('renders sdk field errors on the matching localized text row', async () => {
    renderLangTextItemForm({
      fieldErrorMessages: {
        0: ['Current length is 1542 characters', 'Keep this within 500 characters'],
      },
      initialValues: {
        translations: [{ '@xml:lang': 'en', '#text': 'Long note' }],
      },
    });

    expect(await screen.findByText('Current length is 1542 characters')).toBeInTheDocument();
    expect(screen.getByText('Keep this within 500 characters')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Long note').closest('[data-validate-status]')).toHaveAttribute(
      'data-validate-status',
      'error',
    );
  });

  it('runs required child validators for text and language inputs', async () => {
    renderLangTextItemForm({
      rules: [{ required: true }],
      initialValues: {},
    });

    const [languageSelect] = await screen.findAllByRole('combobox');
    const [textArea] = screen.getAllByRole('textbox');

    await act(async () => {
      fireEvent.change(textArea, { target: { value: 'Updated text' } });
      fireEvent.change(textArea, { target: { value: '' } });
      fireEvent.change(languageSelect, { target: { value: '' } });
    });

    expect(textArea).toHaveValue('');
    expect(languageSelect).toHaveValue('');
  });

  it('treats text-only entries as meaningful values before the english-language validator runs', async () => {
    const setRuleErrorState = jest.fn();
    const { formRef } = renderLangTextItemForm({
      rules: [{ required: true }],
      setRuleErrorState,
      initialValues: {
        translations: [{ '#text': 'Only text' }],
      },
    });

    await act(async () => {
      formRef.current.setFieldValue(['translations'], [{ '#text': 'Only text' }]);
    });

    await waitFor(() => {
      expect(setRuleErrorState).toHaveBeenLastCalledWith(false);
    });

    expect(message.error).not.toHaveBeenCalled();
  });

  it('normalizes non-array required input to an invalid empty list', async () => {
    renderLangTextItemForm({
      rules: [{ required: true }],
      setRuleErrorState: jest.fn(),
    });

    const listRule = listRulesByPath.translations?.[0];

    await expect(listRule.validator(null, undefined)).rejects.toThrow('Please input this field');
    expect(message.error).not.toHaveBeenCalled();
  });

  it('preserves malformed stored values instead of replacing them with defaults', () => {
    const { formRef } = renderLangTextItemForm({
      defaultLanguages: undefined,
      autoExpandRequired: true,
      initialValues: { translations: 'unparsed legacy value' },
    });
    expect(formRef.current.getFieldValue(['translations'])).toBe('unparsed legacy value');
  });

  it('rejects an empty required list without a parent rule-error callback', async () => {
    renderLangTextItemForm({ rules: [{ required: true }] });
    await expect(listRulesByPath.translations[0].validator(null, [])).rejects.toThrow(
      'Please input this field',
    );
  });
});
