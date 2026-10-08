import React, { useMemo } from 'react';
import type { PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { useTheme2 } from '@grafana/ui';
import { BarsTable } from './components/BarsTable';
import { useMotionEnabled } from './components/useMotion';
import { buildModel } from './lib/rows';
import type { BarsOptions } from './types';

export const BarsPanel: React.FC<PanelProps<BarsOptions>> = ({
  data,
  options,
  width,
  height,
  timeZone,
  fieldConfig,
  id,
}) => {
  const theme = useTheme2();
  const animate = useMotionEnabled(options.animate);
  const model = useMemo(() => buildModel(data.series, options, theme), [data.series, options, theme]);

  if (model.rows.length === 0) {
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} needsStringField={false} />;
  }

  return (
    <BarsTable
      model={model}
      options={options}
      width={width}
      height={height}
      animate={animate}
      timeZone={timeZone}
      refreshedAt={data.request?.endTime}
    />
  );
};
