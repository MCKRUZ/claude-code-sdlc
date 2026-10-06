// Node environment on purpose: proves every primitive renders through renderToStaticMarkup with
// no `window` or `document` at module load (the kit is imported into node-env tests elsewhere).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Check } from 'lucide-react'
import {
  Badge, Button, Card, Chip, DefinitionList, Dialog, EmptyState, Eyebrow, Field, HoverCard, Icon, Input, Kbd, NoData,
  Notice, ProgressBar, ProgressRing, Segmented, Select, Skeleton, SkipLink, Spinner, StatTile, StatusDot, Tab, TabList,
  TabPanel, TabsProvider, ThemeToggle, ToastRegion, Tooltip, Surface3DToggle, DataTable,
} from '../../src/ui'

describe('kit is SSR-safe', () => {
  it('renders every primitive to static markup in node', () => {
    const html = renderToStaticMarkup(
      <>
        <SkipLink />
        <Button variant="primary" icon={Check}>Go</Button>
        <Card header="h">c</Card>
        <Notice tone="warn">w</Notice>
        <NoData what="Run a sprint." />
        <Eyebrow>e</Eyebrow>
        <Field label="L"><Input /></Field>
        <Select value="a" onChange={() => {}} options={[{ value: 'a', label: 'A' }]} />
        <Segmented label="s" options={[{ value: 'a', label: 'A' }]} value="a" onChange={() => {}} tone="inverse" />
        <TabsProvider value="x" onChange={() => {}}>
          <TabList value="x" onChange={() => {}} label="t"><Tab value="x">X</Tab></TabList>
          <TabPanel value="x">p</TabPanel>
        </TabsProvider>
        <Chip dot>c</Chip>
        <Badge kind="now">Now</Badge>
        <StatusDot status="ok" />
        <Skeleton.Tile />
        <EmptyState title="Nothing yet" />
        <StatTile id="t" label="l" value={null} hint="h" />
        <ProgressBar value={null} max={9} label="stages" />
        <DataTable columns={[{ id: 'a', header: 'A', cell: () => 'x' }]} rows={[1]} rowKey={() => 'k'} />
        <DefinitionList items={[{ term: 't', detail: 'd' }]} />
        <Dialog open onClose={() => {}} title="never mounts in node">x</Dialog>
        <HoverCard trigger={<span>t</span>} content="c" />
        <Tooltip label="l"><span>t</span></Tooltip>
        <Kbd keys={['Mod', 'K']} />
        <Icon icon={Check} />
        <ToastRegion />
        <Spinner label="Opening…" />
        <ProgressRing label="r" value={null} />
        <Surface3DToggle value="graph" onChange={() => {}} />
        <ThemeToggle />
      </>,
    )
    expect(html).toContain('<button type="button"')
    expect(html).toContain('bg-slate-900 text-white')
    expect(html).toContain('no data')
    expect(html).toContain('role="region"')
    expect(html).not.toContain('role="dialog"')
  })
})
