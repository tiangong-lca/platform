import { Form } from 'antd';
import { forwardRef, type ReactNode } from 'react';

// Form owns the actual collection. Never forward its injected value/onChange to the
// container: nested input events must update only their own fields, not the collection.
const CollectionAnchor = forwardRef<HTMLDivElement, { id?: string; children?: ReactNode }>(
  ({ id, children }, ref) => (
    <div id={id} ref={ref} tabIndex={-1}>
      {children}
    </div>
  ),
);
CollectionAnchor.displayName = 'ClassificationCollectionAnchor';

export function ClassificationCollectionField({
  name,
  required,
  enabled,
  message,
  children,
}: {
  name: (string | number)[];
  required: boolean;
  enabled: boolean;
  message: string;
  children?: ReactNode;
}) {
  return (
    <Form.Item
      name={name}
      style={{ marginBottom: 0 }}
      rules={
        enabled && required
          ? [
              {
                validator: async (_, value) => {
                  const entries = Array.isArray(value)
                    ? value
                    : value === null || value === undefined
                      ? []
                      : [value];
                  if (
                    !entries.length ||
                    entries.some((entry) => entry === null || entry === undefined)
                  )
                    throw new Error(message);
                },
              },
            ]
          : []
      }
    >
      <CollectionAnchor>{children}</CollectionAnchor>
    </Form.Item>
  );
}
