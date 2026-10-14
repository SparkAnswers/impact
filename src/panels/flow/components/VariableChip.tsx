import React from 'react';
import { Chip } from './Chip';

interface Props {
  name: string;
  value: string;
  onClear: () => void;
}

/** Chip showing the dashboard variable this panel last set, with a clear button. Render inside a `ChipRow`. */
export const VariableChip: React.FC<Props> = ({ name, value, onClear }) => (
  <Chip
    testId="flow-variable-chip"
    tooltip={`Dashboard variable set from this panel: $${name}. Every query using it follows. Clear to reset.`}
    action={{ label: `Clear ${name}`, icon: 'times', onClick: onClear }}
  >
    {name} = <b>{value}</b>
  </Chip>
);
