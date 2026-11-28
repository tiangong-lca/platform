import {
  ANNUAL_SUPPLY_VOLUME_NUMERIC_TEXT_PATTERN,
  ANNUAL_SUPPLY_VOLUME_TEXT_PATTERN,
  buildAnnualSupplyVolumeMultiLang,
  annualSupplyVolumeSuffix,
  getAnnualSupplyVolumeDisplayNumericText,
  getAnnualSupplyVolumeLanguages,
  getAnnualSupplyVolumeStoredSuffix,
  localizeAnnualSupplyVolumeSuffix,
  normalizeAnnualSupplyVolumeMultiLang,
} from '@/services/processes/annualSupplyOrProductionVolume';
import { getAnnualSupplyVolumeUnit } from '@/services/processes/annualSupplyVolumeUnit';
import type { ProcessExchangeData } from '@/services/processes/data';
import type { ProFormInstance } from '@ant-design/pro-components';
import { Form, Input, InputNumber, Space, theme } from 'antd';
import type { FC, ReactNode } from 'react';
import { useEffect, useState } from 'react';
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
  const [resolved, setResolved] = useState<{ source: ProcessExchangeData[]; unit?: string }>();
  const referenceUnit = resolved?.source === exchangeDataSource ? resolved.unit : undefined;
  const formValues = formRef.current?.getFieldValue(name);
  const normalizedValues = normalizeAnnualSupplyVolumeMultiLang(
    formValues,
    (item) => annualSupplyVolumeSuffix(referenceUnit, item['@xml:lang']),
    { useDefaultSuffix: false },
  );
  const annualSupplyVolumeLangs = getAnnualSupplyVolumeLanguages(formValues, lang);
  const currentSuffix =
    localizeAnnualSupplyVolumeSuffix(
      getAnnualSupplyVolumeStoredSuffix(normalizedValues, lang),
      lang,
    ) || annualSupplyVolumeSuffix(referenceUnit, lang);
  // Numeric edits are in the displayed unit across all generated locales.
  const getSuffixForLang = (language: string) =>
    localizeAnnualSupplyVolumeSuffix(currentSuffix, language);

  const isRequired = rules.some((rule) => rule.required);
  const requiredRule = rules.find((rule) => rule.required);

  useEffect(() => {
    let active = true;
    void getAnnualSupplyVolumeUnit(exchangeDataSource).then((unit) => {
      if (active) setResolved({ source: exchangeDataSource, unit });
    });
    return () => {
      active = false;
    };
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
            value: getAnnualSupplyVolumeDisplayNumericText(
              normalizeAnnualSupplyVolumeMultiLang(
                value,
                (item) => annualSupplyVolumeSuffix(referenceUnit, item['@xml:lang']),
                { useDefaultSuffix: false },
              ),
              lang,
            ),
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
