'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { useDailySummaries, useRunSchedulerNow } from '@/lib/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatDateTime } from '@/lib/format';

const SENT_CHART_CONFIG = {
  newSent: { label: 'New', color: 'var(--chart-1)' },
  followupSent: { label: 'Follow-up', color: 'var(--chart-2)' },
  finalSent: { label: 'Final', color: 'var(--chart-3)' },
} satisfies ChartConfig;

const OUTCOME_CHART_CONFIG = {
  skippedReply: { label: 'Replies', color: 'var(--chart-2)' },
  skippedBounce: { label: 'Bounces', color: 'var(--chart-5)' },
  skippedOptout: { label: 'Opt-outs', color: 'var(--chart-1)' },
} satisfies ChartConfig;

export default function DailySummaryPage() {
  const [days, setDays] = useState('30');
  const { data, isLoading, isError, error } = useDailySummaries(Number(days));
  const runNow = useRunSchedulerNow();

  const chartData = data?.map((d) => ({
    date: formatDate(d.runDate),
    newSent: d.newSent,
    followupSent: d.followupSent,
    finalSent: d.finalSent,
    skippedReply: d.skippedReply,
    skippedBounce: d.skippedBounce,
    skippedOptout: d.skippedOptout,
  }));

  const latest = data?.[data.length - 1];

  function handleRunNow() {
    runNow.mutate(undefined, {
      onSuccess: () => toast.success('Scheduler run queued'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to queue run'),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Daily Summary</h1>
          <p className="text-sm text-muted-foreground">Outreach volume and outcomes over time.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleRunNow} disabled={runNow.isPending}>
            {runNow.isPending ? 'Queuing…' : 'Run scheduler now'}
          </Button>
        </div>
      </div>

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-sm text-destructive">
            Failed to load daily summary: {error instanceof Error ? error.message : 'Unknown error'}
          </CardContent>
        </Card>
      )}

      {latest && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Most recent run</CardDescription>
              <CardTitle className="text-lg">{formatDate(latest.runDate)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Completed {formatDateTime(latest.completedAt)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Sent (new/follow-up/final)</CardDescription>
              <CardTitle className="text-lg">
                {latest.newSent}/{latest.followupSent}/{latest.finalSent}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Failed / Cancelled</CardDescription>
              <CardTitle className="text-lg">
                {latest.failedCount}/{latest.cancelledCount}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Daily cap</CardDescription>
              <CardTitle className="flex items-center gap-2 text-lg">
                {latest.dailyCap}
                {latest.priorityExceededCap && <Badge variant="destructive">exceeded</Badge>}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {chartData && chartData.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Emails sent by type</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={SENT_CHART_CONFIG} className="h-64 w-full">
                <BarChart data={chartData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="newSent" fill="var(--color-newSent)" radius={2} />
                  <Bar dataKey="followupSent" fill="var(--color-followupSent)" radius={2} />
                  <Bar dataKey="finalSent" fill="var(--color-finalSent)" radius={2} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Replies, bounces & opt-outs</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={OUTCOME_CHART_CONFIG} className="h-64 w-full">
                <LineChart data={chartData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line
                    dataKey="skippedReply"
                    stroke="var(--color-skippedReply)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    dataKey="skippedBounce"
                    stroke="var(--color-skippedBounce)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    dataKey="skippedOptout"
                    stroke="var(--color-skippedOptout)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No scheduler runs recorded in this range yet.
        </p>
      )}

      {data && data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily detail</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Follow-up</TableHead>
                  <TableHead className="text-right">Final</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Cancelled</TableHead>
                  <TableHead className="text-right">Replies</TableHead>
                  <TableHead className="text-right">Bounces</TableHead>
                  <TableHead className="text-right">Opt-outs</TableHead>
                  <TableHead>Cap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...data].reverse().map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{formatDate(d.runDate)}</TableCell>
                    <TableCell className="text-right">{d.newSent}</TableCell>
                    <TableCell className="text-right">{d.followupSent}</TableCell>
                    <TableCell className="text-right">{d.finalSent}</TableCell>
                    <TableCell className="text-right">{d.failedCount}</TableCell>
                    <TableCell className="text-right">{d.cancelledCount}</TableCell>
                    <TableCell className="text-right">{d.skippedReply}</TableCell>
                    <TableCell className="text-right">{d.skippedBounce}</TableCell>
                    <TableCell className="text-right">{d.skippedOptout}</TableCell>
                    <TableCell>
                      {d.priorityExceededCap ? (
                        <Badge variant="destructive">exceeded</Badge>
                      ) : (
                        <span className="text-muted-foreground">ok</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
