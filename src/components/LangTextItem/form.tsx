import {
  getAuthoringLanguageOptions,
  getLanguageDisplayName,
  REQUIRED_CONTENT_LANGUAGES,
} from '@/services/general/contentLanguageRegistry';
import { useAntdAppApi } from '@/contexts/AntdAppContext';
import { CloseOutlined } from '@ant-design/icons';
import { Button, Col, Form, Input, Row, Select } from 'antd';
import { FC, ReactNode, useCallback, useEffect, useRef } from 'react';
import { FormattedMessage, useIntl } from 'umi';
import { addDefaultLanguageEntries, getDefaultLanguagesForLocale } from './defaults';

const { TextArea } = Input;
const authoringLanguageOptions = getAuthoringLanguageOptions();

type Props = {
  name: any;
  label: ReactNode | string;
  rules?: any[];
  fieldErrorMessages?: Record<number, string[]>;
  setRuleErrorState?: (showError: boolean) => void;
  formRef?: any;
  listName?: string[];
  defaultLanguages?: readonly string[];
  /** Intrinsic field requiredness for display defaults; never enables validation. */
  autoExpandRequired?: boolean;
};

type ListEntryGuardProps = {
  add: () => void;
  enabled: boolean;
  itemCount: number;
  onReset: () => void;
};

const ListEntryGuard: FC<ListEntryGuardProps> = ({ add, enabled, itemCount, onReset }) => {
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;
  // Ant Design remounts list descendants on reset; restore defaults for the new
  // editing session while respecting deliberate removals during normal typing.
  useEffect(() => onResetRef.current(), []);
  useEffect(() => {
    if (enabled && itemCount === 0) {
      add();
    }
  }, [add, enabled, itemCount]);

  return null;
};

const LangTextItemForm: FC<Props> = ({
  name,
  label,
  rules = [],
  fieldErrorMessages,
  setRuleErrorState,
  formRef,
  listName,
  defaultLanguages,
  autoExpandRequired,
}) => {
  const { message } = useAntdAppApi();
  const intl = useIntl();
  const isRequired = rules?.some((rule) => rule.required);

  const formContext = Form.useFormInstance();
  const form = formRef?.current || formContext;

  const formValuePath = listName ? [...listName, ...(Array.isArray(name) ? name : [name])] : name;
  const watchedFormValues = Form.useWatch(formValuePath, form);
  const effectiveDefaultLanguages =
    (autoExpandRequired ?? isRequired)
      ? (defaultLanguages ?? getDefaultLanguagesForLocale(intl.locale))
      : [];
  const defaultLanguageKey = effectiveDefaultLanguages.join('|');
  const formValuePathKey = JSON.stringify(formValuePath);
  const removedDefaultLanguages = useRef(new Set<string>());

  // Seed only missing languages. Stored indexes stay stable for SDK field errors;
  // current-language-first ordering is applied to the rendered rows below.
  const applyDefaultLanguages = useCallback(() => {
    if (!defaultLanguageKey || !form) return;
    const path = JSON.parse(formValuePathKey);
    const stored = form.getFieldValue(path);
    if (stored !== null && stored !== undefined && !Array.isArray(stored)) return;
    const current: Record<string, unknown>[] = stored ?? [];
    const next = addDefaultLanguageEntries(
      current,
      defaultLanguageKey
        .split('|')
        .filter((language) => !removedDefaultLanguages.current.has(language)),
    );
    if (next !== current) {
      form.setFieldValue(path, next);
    }
  }, [defaultLanguageKey, formValuePathKey, form]);

  useEffect(applyDefaultLanguages, [applyDefaultLanguages, watchedFormValues]);

  const resetDefaultLanguages = useCallback(() => {
    removedDefaultLanguages.current.clear();
    applyDefaultLanguages();
  }, [applyDefaultLanguages]);

  const normalizeTextValue = (value: unknown) => {
    return typeof value === 'string' ? value.trim() : '';
  };

  const rawFormValues = watchedFormValues ?? form?.getFieldValue(formValuePath);
  const formValues = Array.isArray(rawFormValues) ? rawFormValues : [];

  const selectedLangValues = formValues
    .filter((item: any) => item && item['@xml:lang'])
    .map((item: any) => item['@xml:lang']);

  return (
    <Form.Item>
      <Form.List
        name={name}
        initialValue={
          effectiveDefaultLanguages.length
            ? effectiveDefaultLanguages.map((language) => ({ '@xml:lang': language }))
            : isRequired
              ? [{}]
              : undefined
        }
        rules={
          isRequired
            ? [
                {
                  // When adding or deleting items, check whether the language meets the requirements
                  validator: async (_, value) => {
                    const normalizedValue = Array.isArray(value) ? value : [];
                    const hasAnyMeaningfulValue = normalizedValue.some((item: any) => {
                      return (
                        !!item &&
                        (!!item['@xml:lang'] || normalizeTextValue(item['#text']).length > 0)
                      );
                    });

                    if (normalizedValue.length === 0) {
                      if (setRuleErrorState) setRuleErrorState(false);
                      return Promise.reject(
                        new Error(
                          intl.formatMessage({
                            id: 'validator.lang.text.required',
                            defaultMessage: 'Please input this field',
                          }),
                        ),
                      );
                    }

                    if (!hasAnyMeaningfulValue) {
                      if (setRuleErrorState) setRuleErrorState(false);
                      return Promise.resolve();
                    }

                    const lists = normalizedValue.filter(
                      (item: any) => item && item.hasOwnProperty('@xml:lang'),
                    );
                    const langs = lists.map((item: any) => item['@xml:lang']);
                    const hasAllRequiredLanguages = REQUIRED_CONTENT_LANGUAGES.every(
                      (requiredLanguage) => langs.includes(requiredLanguage),
                    );
                    if (langs && langs.length && !hasAllRequiredLanguages) {
                      if (setRuleErrorState) {
                        setRuleErrorState(true);
                      } else {
                        message.error(
                          intl.formatMessage({
                            id: 'validator.lang.mustBeEnglish',
                            defaultMessage: 'English is a required language',
                          }),
                        );
                      }
                      return Promise.reject(new Error());
                    }
                    if (setRuleErrorState) setRuleErrorState(false);
                    return Promise.resolve();
                  },
                },
              ]
            : []
        }
      >
        {(subFields, subOpt) => {
          const languageOrder = (index: number) => {
            const order = effectiveDefaultLanguages.indexOf(formValues?.[index]?.['@xml:lang']);
            return order < 0 ? effectiveDefaultLanguages.length : order;
          };
          const orderedFields = [...subFields].sort(
            (left, right) =>
              languageOrder(left.name) - languageOrder(right.name) || left.name - right.name,
          );
          return (
            <div style={{ display: 'flex', flexDirection: 'column', rowGap: 16 }}>
              <ListEntryGuard
                add={subOpt.add}
                enabled={isRequired && !effectiveDefaultLanguages.length}
                itemCount={subFields.length}
                onReset={resetDefaultLanguages}
              />
              {orderedFields.map((subField) => {
                const currentLang = formValues?.[subField.name]?.['@xml:lang'];
                const fieldErrors = fieldErrorMessages?.[subField.name] ?? [];
                const isOptionalLanguage =
                  !!currentLang && !REQUIRED_CONTENT_LANGUAGES.includes(currentLang);
                const textRules = isRequired
                  ? [
                      {
                        validator: async (_: unknown, value: unknown) => {
                          if (normalizeTextValue(value).length > 0 || isOptionalLanguage) {
                            return Promise.resolve();
                          }

                          return Promise.reject(
                            new Error(
                              intl.formatMessage({
                                id: 'validator.lang.text.required',
                                defaultMessage: 'Please input this field',
                              }),
                            ),
                          );
                        },
                      },
                      ...rules.filter((rule) => !rule?.required),
                    ]
                  : rules;

                const declaredOptions = authoringLanguageOptions.map((option) => ({
                  ...option,
                  disabled:
                    selectedLangValues.includes(option.value) && option.value !== currentLang,
                }));
                const optionsWithDisabled =
                  currentLang && !declaredOptions.some((option) => option.value === currentLang)
                    ? [
                        ...declaredOptions,
                        {
                          value: currentLang,
                          label: getLanguageDisplayName(currentLang, intl.locale),
                          disabled: true,
                        },
                      ]
                    : declaredOptions;

                return (
                  <Row
                    className='lang-text-item-row'
                    key={subField.key}
                    gutter={[10, 0]}
                    align='top'
                    data-content-language={currentLang || undefined}
                  >
                    <Col flex='180px'>
                      <Form.Item
                        name={[subField.name, '@xml:lang']}
                        rules={
                          isRequired
                            ? [
                                {
                                  validator: async (_, value) => {
                                    if (!value) {
                                      return Promise.reject(
                                        new Error(
                                          intl.formatMessage({
                                            id: 'validator.lang.select',
                                            defaultMessage: 'Please select a language',
                                          }),
                                        ),
                                      );
                                    }

                                    if (
                                      REQUIRED_CONTENT_LANGUAGES.includes(value) &&
                                      setRuleErrorState
                                    ) {
                                      setRuleErrorState(false);
                                    }
                                    return Promise.resolve();
                                  },
                                },
                              ]
                            : []
                        }
                        style={{ marginBottom: 0 }}
                      >
                        <Select
                          placeholder={
                            <FormattedMessage
                              id='pages.lang.select'
                              defaultMessage='Select a language'
                            />
                          }
                          showSearch={{ optionFilterProp: 'label' }}
                          options={optionsWithDisabled}
                          onChange={(language) => {
                            if (
                              currentLang !== language &&
                              effectiveDefaultLanguages.includes(currentLang)
                            ) {
                              removedDefaultLanguages.current.add(currentLang);
                            }
                          }}
                          // The four registry options stay mounted for deterministic
                          // Form.List validation, keyboard navigation, and browser proof.
                          virtual={false}
                        />
                      </Form.Item>
                    </Col>
                    <Col flex='auto'>
                      <Form.Item
                        name={[subField.name, '#text']}
                        rules={textRules}
                        validateStatus={fieldErrors.length > 0 ? 'error' : undefined}
                        help={
                          fieldErrors.length > 0
                            ? fieldErrors.map((errorMessage, index) => (
                                <div key={`${subField.key}-sdk-error-${index}`}>{errorMessage}</div>
                              ))
                            : undefined
                        }
                        style={{ marginBottom: 0 }}
                      >
                        <TextArea rows={1} />
                      </Form.Item>
                    </Col>
                    <Col flex='20px' style={{ paddingTop: '8px' }}>
                      <CloseOutlined
                        style={{
                          cursor: isRequired && subFields.length === 1 ? 'not-allowed' : 'pointer',
                        }}
                        onClick={() => {
                          if (isRequired && subFields.length === 1) {
                            return;
                          }
                          if (currentLang && effectiveDefaultLanguages.includes(currentLang)) {
                            removedDefaultLanguages.current.add(currentLang);
                          }
                          subOpt.remove(subField.name);
                        }}
                      />
                    </Col>
                  </Row>
                );
              })}
              <Button type='dashed' onClick={() => subOpt.add()} block style={{ marginTop: '8px' }}>
                + <FormattedMessage id='pages.button.item.add' defaultMessage='Add' /> {label}{' '}
                <FormattedMessage id='pages.button.item.label' defaultMessage='Item' />
              </Button>
            </div>
          );
        }}
      </Form.List>
    </Form.Item>
  );
};

export default LangTextItemForm;
