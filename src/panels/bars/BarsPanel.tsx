import React, { useMemo } from 'react';
import type { PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { useTheme2 } from '@grafana/ui';
import { DemoBadge, deviceTableWithStyles, useDemoFrames, type DemoGenerator } from '../../shared/demo';
import { ReducedMotionHint } from '../../shared/ReducedMotionHint';
import { BarsTable } from './components/BarsTable';
import { useMotionEnabled } from './components/useMotion';
import { buildModel } from './lib/rows';
import type { BarsOptions } from './types';

/** Demo data: a 12-row device table whose style column cycles through every bar style. */
const demoGenerator: DemoGenerator = (w) => [deviceTableWithStyles(12, { now: w.now })];

export const BARS_NO_DATA_MESSAGE = 'Needs a table or several series';

export const BarsPanel: React.FC<PanelProps<BarsOptions>> = ({
  data,
  options,
  width,
  height,
  timeZone,
  timeRange,
  fieldConfig,
  replaceVariables,
  id,
}) => {
  const theme = useTheme2();
  const animate = useMotionEnabled(options.animate, options.reducedMotion);
  // Generated data when the query has nothing usable (or always), through the same field-config pipeline.
  const { frames, isDemo } = useDemoFrames(data, options.demoData, demoGenerator, {
    fieldConfig,
    replaceVariables,
    theme,
    timeZone,
    timeRange,
  });
  const model = useMemo(() => buildModel(frames, options, theme), [frames, options, theme]);

  if (model.rows.length === 0) {
    return (
      <PanelDataErrorView
        fieldConfig={fieldConfig}
        panelId={id}
        data={data}
        needsStringField={false}
        message={BARS_NO_DATA_MESSAGE}
      />
    );
  }

  return (
    <div style={{ position: 'relative', width, height }}>
      <BarsTable
        model={model}
        options={options}
        width={width}
        height={height}
        animate={animate}
        timeZone={timeZone}
        refreshedAt={isDemo ? undefined : data.request?.endTime}
      />
      <DemoBadge visible={isDemo} width={width} />
      <ReducedMotionHint animationEnabled={options.animate} preference={options.reducedMotion} width={width} />
    </div>
  );
};
