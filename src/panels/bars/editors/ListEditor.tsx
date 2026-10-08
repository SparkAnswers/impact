import React from 'react';
import type { StandardEditorProps } from '@grafana/data';
import { Input } from '@grafana/ui';

/** Edits a string[] option as a comma-separated text input. */
export const ListEditor: React.FC<StandardEditorProps<string[] | undefined>> = ({ value, onChange }) => {
  const [text, setText] = React.useState(() => (value ?? []).join(', '));
  return (
    <Input
      value={text}
      placeholder="Auto"
      onChange={(e) => setText(e.currentTarget.value)}
      onBlur={() => {
        const list = text
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== '');
        onChange(list.length > 0 ? list : undefined);
      }}
    />
  );
};
