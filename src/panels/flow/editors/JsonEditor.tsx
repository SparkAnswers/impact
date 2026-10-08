import React, { useState } from 'react';
import { css } from '@emotion/css';
import type { GrafanaTheme2, StandardEditorProps } from '@grafana/data';
import { Alert, Button, Stack, TextArea, useStyles2 } from '@grafana/ui';
import { createExampleDiagram } from '../lib/example';
import { normalizeDiagram, parseDiagramJson } from '../lib/validate';
import { EMPTY_DIAGRAM, type FlowDiagram, type FlowOptions } from '../types';

type Props = StandardEditorProps<FlowDiagram, {}, FlowOptions>;

const getStyles = (theme: GrafanaTheme2) => ({
  area: css({
    fontFamily: theme.typography.fontFamilyMonospace,
    fontSize: 11,
    minHeight: 180,
    resize: 'vertical',
  }),
  errors: css({ margin: 0, paddingLeft: theme.spacing(2), fontSize: 11 }),
});

/** Import / export the whole diagram as JSON, with validation, plus "Load example" and "Clear". */
export const JsonEditor: React.FC<Props> = ({ value, onChange }) => {
  const s = useStyles2(getStyles);
  const current = JSON.stringify(normalizeDiagram(value), null, 2);
  const [text, setText] = useState(current);
  const [errors, setErrors] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);

  // Follow external changes (dragging in the panel, inspector edits) unless the user is mid-edit.
  const [prevCurrent, setPrevCurrent] = useState(current);
  if (prevCurrent !== current) {
    setPrevCurrent(current);
    if (!dirty) {
      setText(current);
    }
  }

  const apply = () => {
    const res = parseDiagramJson(text);
    if (res.ok) {
      setErrors([]);
      setDirty(false);
      onChange(res.diagram);
    } else {
      setErrors(res.errors);
    }
  };

  return (
    <Stack direction="column" gap={1}>
      <TextArea
        className={s.area}
        value={text}
        spellCheck={false}
        aria-label="Diagram JSON"
        onChange={(e) => {
          setText(e.currentTarget.value);
          setDirty(true);
        }}
      />
      {errors.length > 0 && (
        <Alert severity="error" title="Diagram JSON is not valid">
          <ul className={s.errors}>
            {errors.slice(0, 8).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {errors.length > 8 && <li>…and {errors.length - 8} more</li>}
          </ul>
        </Alert>
      )}
      <Stack direction="row" gap={0.5} wrap="wrap">
        <Button size="sm" icon="check" onClick={apply} disabled={!dirty}>
          Apply JSON
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon="times"
          disabled={!dirty}
          onClick={() => {
            setText(current);
            setErrors([]);
            setDirty(false);
          }}
        >
          Revert
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon="sitemap"
          tooltip="Replace the diagram with the site power flow example"
          onClick={() => {
            setDirty(false);
            setErrors([]);
            onChange(createExampleDiagram());
          }}
        >
          Load example
        </Button>
        <Button
          size="sm"
          variant="destructive"
          fill="outline"
          icon="trash-alt"
          onClick={() => {
            setDirty(false);
            setErrors([]);
            onChange({ ...EMPTY_DIAGRAM });
          }}
        >
          Clear
        </Button>
      </Stack>
    </Stack>
  );
};
