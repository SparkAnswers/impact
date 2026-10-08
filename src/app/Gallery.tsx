import React from 'react';
import { PluginPage } from '@grafana/runtime';
import { Card, Stack, Text } from '@grafana/ui';

const PANELS = [
  { id: 'flow', name: 'Flow Designer', blurb: 'Node and edge diagrams with animated particles and editable curves.' },
  { id: 'gauge', name: 'Power Gauge', blurb: 'Ring gauge with signed arc fill and an in-ring history chart.' },
  { id: 'river', name: 'Flow River', blurb: 'Particle streamlines along a channel coloured by value.' },
  { id: 'bars', name: 'Status Bars', blurb: 'Rows of animated progress bars, sparklines and status pills.' },
];

export default function Gallery() {
  return (
    <PluginPage>
      <Stack direction="column" gap={2}>
        <Text element="p">
          Impact ships four visualisations. Add any of them from the panel picker; they are listed under the
          &quot;Impact&quot; prefix. Demo dashboards are provisioned when running the bundled Docker stack.
        </Text>
        <Stack wrap="wrap" gap={2}>
          {PANELS.map((p) => (
            <Card key={p.id} noMargin>
              <Card.Heading>{`Impact ${p.name}`}</Card.Heading>
              <Card.Description>{p.blurb}</Card.Description>
            </Card>
          ))}
        </Stack>
      </Stack>
    </PluginPage>
  );
}
