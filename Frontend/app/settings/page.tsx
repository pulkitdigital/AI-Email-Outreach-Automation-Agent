'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSchedulerCron, useUpdateSchedulerCron } from '@/lib/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

/** Only recognizes a simple daily "M H * * *" pattern — anything else (weekday-restricted, multiple runs/day) falls back to showing the raw cron string without a pre-filled time. */
function parseDailyCron(cron: string): { hour: number; minute: number } | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (dayOfMonth !== '*' || month !== '*' || dayOfWeek !== '*') return null;
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) return null;
  const h = Number(hour);
  const m = Number(minute);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { hour: h, minute: m };
}

function formatTimeLabel(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

export default function SettingsPage() {
  const { data, isLoading, isError, error } = useSchedulerCron();
  const updateCron = useUpdateSchedulerCron();
  const [timeValue, setTimeValue] = useState('');

  useEffect(() => {
    if (!data) return;
    const parsed = parseDailyCron(data.cron);
    setTimeValue(
      parsed
        ? `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`
        : '',
    );
  }, [data]);

  const parsed = data ? parseDailyCron(data.cron) : null;

  const handleSave = () => {
    if (!timeValue) return;
    const [hourStr, minuteStr] = timeValue.split(':');
    const cron = `${Number(minuteStr)} ${Number(hourStr)} * * *`;
    updateCron.mutate(cron, {
      onSuccess: () => toast.success('Scheduler time updated'),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : 'Failed to update scheduler time'),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure automated behavior.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduler</CardTitle>
          <CardDescription>When the Daily Scheduler automatically sends outreach.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError && (
            <p className="text-sm text-destructive">
              Failed to load scheduler settings:{' '}
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          )}
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {data && (
            <>
              <p className="text-sm text-muted-foreground">
                {parsed
                  ? `Runs daily at ${formatTimeLabel(parsed.hour, parsed.minute)}`
                  : 'Current schedule is not a simple daily time — saving below will replace it with one.'}{' '}
                <span className="font-mono text-xs">({data.cron})</span>
              </p>
              <div className="flex items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="scheduler-time">Run time</Label>
                  <Input
                    id="scheduler-time"
                    type="time"
                    value={timeValue}
                    onChange={(e) => setTimeValue(e.target.value)}
                    className="w-36"
                  />
                </div>
                <Button onClick={handleSave} disabled={!timeValue || updateCron.isPending}>
                  {updateCron.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
