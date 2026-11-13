import { Button, Form, Space } from 'antd';
import { useEffect, type ReactNode } from 'react';
import { FormattedMessage } from 'umi';

type Props = {
  name: (string | number)[];
  onChange: () => void;
  arrayOnly?: boolean;
  /** Keep the first editable block even when this field is optional. */
  keepFirst?: boolean;
  children: (path: (string | number)[]) => ReactNode;
};

/** Use absolute field paths so existing nested editors retain their Form contract. */
export default function TidasRepeatedField({
  name,
  onChange,
  children,
  arrayOnly = false,
  keepFirst = false,
}: Props) {
  const form = Form.useFormInstance();
  const watched = Form.useWatch(name, { form, preserve: true });
  const value = watched ?? form.getFieldValue(name);
  useEffect(() => {
    const current = form.getFieldValue(name);
    if (arrayOnly || Array.isArray(current)) {
      const items = Array.isArray(current)
        ? current
        : current === null || current === undefined
          ? []
          : [current];
      if (!Array.isArray(current) || (keepFirst && items.length === 0)) {
        form.setFieldValue(name, keepFirst && items.length === 0 ? [{}] : items);
        onChange();
      }
    } else if (keepFirst && (current === undefined || current === null)) {
      // Materialize the visible first block so Add appends rather than replaces it.
      form.setFieldValue(name, {});
      onChange();
    }
  }, [arrayOnly, form, keepFirst, name, onChange, value]);
  const repeated = Array.isArray(value);
  const items = repeated ? value : [value];
  const update = (change: (current: any[]) => any[]) => {
    const current = form.getFieldValue(name);
    form.setFieldValue(name, change(Array.isArray(current) ? current : [current]));
    onChange();
  };
  if (arrayOnly && !repeated) return null;
  return (
    <Space orientation='vertical' style={{ width: '100%' }}>
      {items.map((_, index) => (
        <div key={`${repeated ? 'list' : 'single'}-${index}`}>
          {children(repeated ? [...name, index] : name)}
          {repeated && (!keepFirst || index > 0) && (
            <Button
              onClick={() =>
                update((current) => current.filter((__, position) => position !== index))
              }
            >
              <FormattedMessage id='pages.button.delete' defaultMessage='Delete' />
            </Button>
          )}
        </div>
      ))}
      <Button
        onClick={() => update((current) => [...current.filter((item) => item !== undefined), {}])}
      >
        + <FormattedMessage id='pages.button.item.add' defaultMessage='Add' />
      </Button>
    </Space>
  );
}
