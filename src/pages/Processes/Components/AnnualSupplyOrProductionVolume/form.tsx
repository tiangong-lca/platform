import { normalizeSupportedContentLanguage } from '@/services/general/contentLanguageRegistry';
import { getExactLangText } from '@/services/general/util';
import {
  ANNUAL_SUPPLY_VOLUME_NUMERIC_TEXT_PATTERN,
  ANNUAL_SUPPLY_VOLUME_TEXT_PATTERN,
  buildAnnualSupplyVolumeMultiLang,
  deriveAnnualSupplyVolumeSuffix,
  getAnnualSupplyVolumeDisplayNumericText,
  getAnnualSupplyVolumeLanguages,
  getAnnualSupplyVolumeStoredSuffix,
  getQuantitativeReferenceExchange,
  mergeAnnualSupplyVolumeUnitRows,
} from '@/services/processes/annualSupplyOrProductionVolume';
import { getAnnualSupplyVolumeUnitRows } from '@/services/processes/annualSupplyVolumeUnit';
import type { ProcessExchangeData } from '@/services/processes/data';
import type { ProFormInstance } from '@ant-design/pro-components';
import { Form, Input, InputNumber, Space, theme } from 'antd';
import type { FC, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'umi';

type Props = {
  exchangeDataSource: ProcessExchangeData[];
  formRef: React.RefObject<ProFormInstance | undefined>;
  label: ReactNode | string;
  lang: string;
  name: Array<string | number>;
  onData: () => void;
  contextErrorMessage?: string;
  rules?: any[];
  setRuleErrorState?: (showError: boolean) => void;
};

const AnnualSupplyOrProductionVolumeForm: FC<Props> = ({
  exchangeDataSource,
  formRef,
  lang,
  name,
  onData,
  contextErrorMessage,
  rules = [],
  setRuleErrorState,
}) => {
  const intl = useIntl();
  const { token } = theme.useToken();
  const [resolvedUnits, setResolvedUnits] = useState<{
    source: ProcessExchangeData[];
    exchanges: ProcessExchangeData[];
  }>();
  // Table display caches have no exact Flow identity; only this lookup proves their unit.
  const exchangesWithoutCachedUnits = useMemo(
    () =>
      exchangeDataSource.map((exchange) => {
        const { refUnitRes: _cachedUnit, ...withoutUnit } = exchange;
        void _cachedUnit;
        return withoutUnit;
      }),
    [exchangeDataSource],
  );
  const exchangeDataSourceWithUnits =
    resolvedUnits?.source === exchangeDataSource
      ? resolvedUnits.exchanges
      : exchangesWithoutCachedUnits;
  const form = formRef?.current;
  const formValues = typeof form?.getFieldValue === 'function' ? form.getFieldValue(name) : [];
  const hasStoredFormValue = Array.isArray(formValues)
    ? formValues.length > 0
    : formValues !== undefined && formValues !== null;
  const isRequired = rules?.some((rule) => rule.required);
  const requiredRule = rules?.find((rule) => rule.required);
  const annualSupplyVolumeLangs = useMemo(
    () => getAnnualSupplyVolumeLanguages(formValues, lang),
    [formValues, lang],
  );

  const suffixByLang = useMemo(() => {
    return annualSupplyVolumeLangs.reduce<Record<string, string>>((accumulator, language) => {
      accumulator[language] =
        deriveAnnualSupplyVolumeSuffix({
          exchangeDataSource: exchangeDataSourceWithUnits,
          getLangText: getExactLangText,
          lang: language,
        }) || getAnnualSupplyVolumeStoredSuffix(formValues, language);
      return accumulator;
    }, {});
  }, [annualSupplyVolumeLangs, exchangeDataSourceWithUnits, formValues]);

  const getSuffixForLang = useCallback(
    (value: string) => {
      const language =
        normalizeSupportedContentLanguage(value) ??
        value.trim().toLowerCase().replace('_', '-').split('-')[0];
      return suffixByLang[language] ?? '';
    },
    [suffixByLang],
  );
  const currentSuffix = getSuffixForLang(lang);

  useEffect(() => {
    const exchange = getQuantitativeReferenceExchange(exchangeDataSource);
    const reference = Array.isArray(exchange?.referenceToFlowDataSet)
      ? exchange.referenceToFlowDataSet[0]
      : exchange?.referenceToFlowDataSet;
    if (!reference?.['@refObjectId'] || !reference?.['@version']) return;
    let ignore = false;
    getAnnualSupplyVolumeUnitRows(exchangeDataSource).then(
      (unitRows) => {
        if (!ignore) {
          setResolvedUnits({
            source: exchangeDataSource,
            exchanges: mergeAnnualSupplyVolumeUnitRows(exchangesWithoutCachedUnits, unitRows),
          });
        }
      },
      () => {
        if (!ignore) {
          setResolvedUnits({ source: exchangeDataSource, exchanges: exchangesWithoutCachedUnits });
        }
      },
    );
    return () => {
      ignore = true;
    };
  }, [exchangeDataSource, exchangesWithoutCachedUnits]);

  useEffect(() => {
    if (!form || typeof form.setFieldValue !== 'function' || !hasStoredFormValue) {
      return;
    }

    const numericText = getAnnualSupplyVolumeDisplayNumericText(formValues, lang);
    const normalizedValues = buildAnnualSupplyVolumeMultiLang(
      numericText,
      getSuffixForLang,
      annualSupplyVolumeLangs,
    );

    if (JSON.stringify(normalizedValues) !== JSON.stringify(formValues)) {
      form.setFieldValue(name, normalizedValues);
      onData();
    }
  }, [form, formValues, getSuffixForLang, hasStoredFormValue, lang, name, onData]);

  const fieldRules = isRequired
    ? [
        {
          validator: async (_: unknown, value: unknown) => {
            const numericText = getAnnualSupplyVolumeDisplayNumericText(value, lang);

            if (numericText.trim().length === 0) {
              setRuleErrorState?.(true);
              return Promise.reject(
                new Error(
                  intl.formatMessage({
                    id: requiredRule?.messageKey ?? 'validator.lang.text.required',
                    defaultMessage: requiredRule?.defaultMessage ?? 'Please input this field!',
                  }),
                ),
              );
            }

            const normalizedValues = buildAnnualSupplyVolumeMultiLang(
              numericText,
              getSuffixForLang,
              annualSupplyVolumeLangs,
            );
            const isAnnualSupplyVolumeValid =
              normalizedValues.length > 0 &&
              normalizedValues.every((item) => {
                const pattern = getSuffixForLang(item['@xml:lang']).trim()
                  ? ANNUAL_SUPPLY_VOLUME_TEXT_PATTERN
                  : ANNUAL_SUPPLY_VOLUME_NUMERIC_TEXT_PATTERN;

                return pattern.test(String(item['#text']).trim());
              });

            if (!isAnnualSupplyVolumeValid) {
              setRuleErrorState?.(true);
              return Promise.reject(
                new Error(
                  intl.formatMessage({
                    id: 'pages.process.validator.annualSupplyOrProductionVolume.pattern',
                    defaultMessage: 'Please enter a number.',
                  }),
                ),
              );
            }

            setRuleErrorState?.(false);
            return Promise.resolve();
          },
        },
      ]
    : [];

  return (
    <Form.Item style={{ marginBottom: 0 }}>
      <Space.Compact block>
        <Form.Item
          name={name}
          getValueProps={(value) => ({
            value: getAnnualSupplyVolumeDisplayNumericText(value, lang),
          })}
          normalize={(value) =>
            buildAnnualSupplyVolumeMultiLang(value, getSuffixForLang, annualSupplyVolumeLangs)
          }
          noStyle
          rules={fieldRules}
        >
          <InputNumber
            controls={false}
            inputMode='decimal'
            onChange={() => onData()}
            stringMode
            style={{ width: '50%' }}
          />
        </Form.Item>
        <Input
          aria-label='annual-supply-volume-context'
          disabled
          status={contextErrorMessage ? 'error' : undefined}
          style={{ width: '50%' }}
          value={currentSuffix}
        />
      </Space.Compact>
      {contextErrorMessage ? (
        <div
          role='alert'
          style={{
            color: token.colorError,
            fontSize: token.fontSizeSM ?? 12,
            lineHeight: token.lineHeightSM ?? 1.5,
            marginLeft: '50%',
            marginTop: token.marginXXS ?? 4,
          }}
        >
          {contextErrorMessage}
        </div>
      ) : null}
    </Form.Item>
  );
};

export default AnnualSupplyOrProductionVolumeForm;
