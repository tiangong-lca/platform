import { normalizeSupportedContentLanguage } from '@/services/general/contentLanguageRegistry';
import { getExactLangText, getUnitData } from '@/services/general/util';
import {
  ANNUAL_SUPPLY_VOLUME_NUMERIC_TEXT_PATTERN,
  ANNUAL_SUPPLY_VOLUME_TEXT_PATTERN,
  buildAnnualSupplyVolumeUnitLookupRows,
  deriveAnnualSupplyVolumeSuffix,
  getAnnualSupplyVolumeDisplayNumericText,
  getAnnualSupplyVolumeLanguages,
  mergeAnnualSupplyVolumeUnitRows,
  replaceAnnualSupplyVolumeNumericText,
} from '@/services/processes/annualSupplyOrProductionVolume';
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
  const [exchangeDataSourceWithUnits, setExchangeDataSourceWithUnits] =
    useState(exchangeDataSource);
  const form = formRef?.current;
  const formValues = typeof form?.getFieldValue === 'function' ? form.getFieldValue(name) : [];
  const isRequired = rules?.some((rule) => rule.required);
  const requiredRule = rules?.find((rule) => rule.required);
  const annualSupplyVolumeLangs = useMemo(
    () => getAnnualSupplyVolumeLanguages(formValues, lang),
    [formValues, lang],
  );

  const suffixByLang = useMemo(() => {
    return annualSupplyVolumeLangs.reduce<Record<string, string>>((accumulator, language) => {
      accumulator[language] = deriveAnnualSupplyVolumeSuffix({
        exchangeDataSource: exchangeDataSourceWithUnits,
        getLangText: getExactLangText,
        lang: language,
      });
      return accumulator;
    }, {});
  }, [annualSupplyVolumeLangs, exchangeDataSourceWithUnits]);

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
    setExchangeDataSourceWithUnits(exchangeDataSource);

    const unitLookupRows = buildAnnualSupplyVolumeUnitLookupRows(exchangeDataSource);
    const hasReferenceFlow = unitLookupRows.some((row) => row.referenceToFlowDataSetId);

    if (!hasReferenceFlow) {
      return;
    }

    getUnitData('flow', unitLookupRows).then(
      (unitRows) => {
        setExchangeDataSourceWithUnits(
          mergeAnnualSupplyVolumeUnitRows(exchangeDataSource, unitRows),
        );
      },
      () => {
        setExchangeDataSourceWithUnits(exchangeDataSource);
      },
    );
  }, [exchangeDataSource]);

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

            const normalizedValues = replaceAnnualSupplyVolumeNumericText(
              value,
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
          normalize={(value, previousValue) =>
            replaceAnnualSupplyVolumeNumericText(
              previousValue,
              value,
              getSuffixForLang,
              annualSupplyVolumeLangs,
            )
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
