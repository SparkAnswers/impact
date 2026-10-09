import { css, keyframes } from '@emotion/css';
import { colorManipulator, type GrafanaTheme2 } from '@grafana/data';

const sweep = keyframes`
  0% { left: -40%; }
  100% { left: 105%; }
`;
const stripes = keyframes`
  0% { background-position: 0 0; }
  100% { background-position: 17px 0; }
`;
const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
`;

/**
 * Static styles. Per-option sizes come through CSS custom properties set on the panel root:
 * --pb-h (track height), --pb-r (radius), --pb-w (track width), --pb-speed (animation seconds),
 * --pb-bg (header/table fill colour in the Panel and Solid colour background modes).
 */
export const getStyles = (theme: GrafanaTheme2) => {
  const track = theme.isDark ? theme.colors.background.secondary : theme.colors.border.weak;
  const tint = colorManipulator.alpha(theme.colors.text.primary, theme.isDark ? 0.06 : 0.04);
  const tintSelected = colorManipulator.alpha(theme.colors.text.primary, theme.isDark ? 0.1 : 0.08);
  return {
    // The root never paints its own fill unless the Solid colour mode is on, so the panel's
    // "Transparent background" option shows the dashboard through the table.
    root: css({
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      fontSize: theme.typography.bodySmall.fontSize,
      lineHeight: 1.3,
      color: theme.colors.text.primary,
      overflow: 'hidden',
      // The panel renders the "Demo data" pill (18 px tall, 6 px from the top) as the next sibling of this
      // root; reserve a band for it so it does not cover the right-most column header.
      '&:has(+ [data-testid="impact-demo-badge"])': { paddingTop: 24 },
    }),
    rootSolid: css({ background: 'var(--pb-bg)' }),
    /** With the footer on, the pill sits in the footer's right half (where "Refreshed ..." would be) instead. */
    rootFooter: css({
      '&:has(+ [data-testid="impact-demo-badge"])': { paddingTop: 0 },
      '& + [data-testid="impact-demo-badge"]': { top: 'auto', bottom: 3, right: theme.spacing(1) },
    }),
    /** Sticky header fill: opaque (Panel / Solid colour) or frosted (Transparent). */
    headerSolid: css({
      '& th': { background: 'var(--pb-bg)' },
    }),
    headerGlass: css({
      '& th': {
        background: colorManipulator.alpha(theme.colors.background.primary, theme.isDark ? 0.55 : 0.6),
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      },
      '& tbody tr:hover td': { background: tint },
    }),
    selectedGlass: css({
      '& td, &:hover td': { background: `${tintSelected} !important` },
    }),
    scroller: css({
      flex: 1,
      minHeight: 0,
      overflow: 'auto',
    }),
    table: css({
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
      '& th, & td': {
        padding: theme.spacing(0, 1),
        textAlign: 'left',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        verticalAlign: 'middle',
      },
      '& th': {
        position: 'sticky',
        top: 0,
        zIndex: 1,
        height: 30,
        fontSize: theme.typography.bodySmall.fontSize,
        fontWeight: theme.typography.fontWeightMedium,
        color: theme.colors.text.secondary,
        boxShadow: `inset 0 -1px 0 ${theme.colors.border.medium}`,
        userSelect: 'none',
      },
      '& td': {
        borderBottom: `1px solid ${theme.colors.border.weak}`,
      },
      '& tbody tr:last-child td': { borderBottom: 0 },
      '& tbody tr:hover td': { background: theme.colors.action.hover },
    }),
    sortable: css({
      cursor: 'pointer',
      '&:hover': { color: theme.colors.text.primary },
    }),
    sorted: css({
      color: `${theme.colors.text.primary} !important`,
    }),
    caret: css({
      display: 'inline-block',
      marginLeft: 5,
      width: 0,
      height: 0,
      borderLeft: '4px solid transparent',
      borderRight: '4px solid transparent',
      borderBottom: `5px solid ${theme.colors.primary.main}`,
      verticalAlign: 2,
    }),
    caretDown: css({
      transform: 'rotate(180deg)',
      verticalAlign: 1,
    }),
    selected: css({
      '& td': { background: theme.colors.action.selected },
    }),
    num: css({ fontVariantNumeric: 'tabular-nums', textAlign: 'right !important' as 'right' }),
    dim: css({ color: theme.colors.text.secondary }),
    name: css({
      fontWeight: theme.typography.fontWeightMedium,
      '& small': {
        display: 'block',
        fontWeight: theme.typography.fontWeightRegular,
        fontSize: 10.5,
        color: theme.colors.text.disabled,
        marginTop: 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      '& a': { color: theme.colors.text.link, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
    }),
    statusCell: css({ display: 'flex', alignItems: 'center', gap: 6, height: '100%' }),
    /** Anchor around a cell's content when its field has data links; inherits the cell colour (the name cell sets its own). */
    cellLink: css({
      color: 'inherit',
      textDecoration: 'none',
      '&:hover': { textDecoration: 'underline' },
    }),
    cellLinkBlock: css({ display: 'block', flex: '1 1 auto', minWidth: 0 }),
    linkRow: css({ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }),
    /** Chevron that opens the menu of a cell with several data links. */
    more: css({
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '0 0 auto',
      width: 18,
      height: 18,
      marginLeft: 2,
      padding: 0,
      border: 0,
      borderRadius: theme.shape.radius.default,
      background: 'transparent',
      color: theme.colors.text.secondary,
      cursor: 'pointer',
      verticalAlign: 'middle',
      '&:hover': { background: theme.colors.action.hover, color: theme.colors.text.primary },
    }),
    menuHeader: css({
      display: 'block',
      padding: theme.spacing(0.5, 1),
      fontSize: theme.typography.bodySmall.fontSize,
      fontWeight: theme.typography.fontWeightMedium,
      color: theme.colors.text.secondary,
    }),
    /** Rows in the "Name link" row-click mode. */
    rowLink: css({ cursor: 'pointer' }),
    dot: css({
      width: 7,
      height: 7,
      borderRadius: '50%',
      display: 'inline-block',
      flex: '0 0 auto',
    }),
    checkbox: css({ display: 'flex', alignItems: 'center' }),

    cell: css({ display: 'flex', alignItems: 'center', gap: theme.spacing(1.25), minWidth: 0 }),
    track: css({
      position: 'relative',
      height: 'var(--pb-h)',
      width: 'var(--pb-w)',
      maxWidth: '100%',
      borderRadius: 'var(--pb-r)',
      background: track,
      overflow: 'hidden',
      flex: '0 1 auto',
    }),
    trackHalf: css({ width: 'calc(var(--pb-w) / 2)' }),
    trackInside: css({ minHeight: 14 }),
    sweepTrack: css({}),
    fill: css({
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      borderRadius: 'var(--pb-r)',
      transition: 'width 300ms ease',
    }),
    inside: css({
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      fontVariantNumeric: 'tabular-nums',
      color: theme.colors.text.maxContrast,
      mixBlendMode: theme.isDark ? 'normal' : 'difference',
    }),
    val: css({
      minWidth: 34,
      textAlign: 'right',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
    }),
    sweepSeg: css({
      position: 'absolute',
      top: 0,
      bottom: 0,
      borderRadius: 'var(--pb-r)',
      animation: `${sweep} var(--pb-speed) cubic-bezier(.4,.1,.6,.9) infinite`,
      animationDelay: '-0.8s',
    }),
    segs: css({
      display: 'flex',
      gap: 3,
      width: 'var(--pb-w)',
      maxWidth: '100%',
      '& i': {
        display: 'block',
        flex: 1,
        height: 'max(var(--pb-h), 8px)',
        borderRadius: 2,
        background: track,
      },
    }),
    stripes: css({
      backgroundSize: '17px 17px',
      animation: `${stripes} calc(var(--pb-speed) / 2) linear infinite`,
    }),
    bidi: css({ overflow: 'visible' }),
    bidiZero: css({
      position: 'absolute',
      left: '50%',
      top: -3,
      bottom: -3,
      width: 1,
      background: theme.colors.text.disabled,
    }),
    bidiNeg: css({
      position: 'absolute',
      right: '50%',
      top: 0,
      bottom: 0,
      borderRadius: 'var(--pb-r) 0 0 var(--pb-r)',
    }),
    bidiPos: css({
      position: 'absolute',
      left: '50%',
      top: 0,
      bottom: 0,
      borderRadius: '0 var(--pb-r) var(--pb-r) 0',
    }),
    stack: css({
      display: 'flex',
      gap: 2,
      '& i': { display: 'block', height: '100%' },
    }),
    legend: css({
      display: 'flex',
      gap: 9,
      fontSize: 11,
      color: theme.colors.text.secondary,
      whiteSpace: 'nowrap',
      '& b': {
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: 2,
        marginRight: 4,
        verticalAlign: -0.5,
      },
    }),
    spark: css({ display: 'block', flex: '0 0 auto' }),
    sparkCell: css({ display: 'inline-flex', alignItems: 'center', gap: theme.spacing(0.75), verticalAlign: 'middle' }),
    pill: css({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 20,
      padding: '0 9px 0 7px',
      borderRadius: 10,
      fontSize: 11.5,
      fontWeight: theme.typography.fontWeightMedium,
      border: '1px solid',
      whiteSpace: 'nowrap',
    }),
    pillDot: css({ width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }),
    blink: css({ animation: `${blink} calc(var(--pb-speed) * 0.75) ease-in-out infinite` }),

    footer: css({
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      height: 24,
      padding: theme.spacing(0, 1),
      fontSize: 11,
      color: theme.colors.text.disabled,
      borderTop: `1px solid ${theme.colors.border.weak}`,
      flex: '0 0 auto',
    }),
  };
};

export type BarsStyles = ReturnType<typeof getStyles>;
