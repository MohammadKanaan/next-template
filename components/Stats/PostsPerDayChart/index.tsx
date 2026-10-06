'use client'

import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/SCN/chart'
import type { DailyPostCount } from '@/lib/dto/stats'
import styles from './styles.module.scss'

const CHART_CONFIG = {
  count: { label: 'Posts', color: 'var(--chart-2)' },
} satisfies ChartConfig

// Fixed locale and zone, like `formatDateTime`: the server and the browser draw the same labels.
const dayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

const formatDay = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`))

// The tooltip hands over whatever the axis key held, typed as a node.
const formatTooltipLabel = (label: ReactNode) =>
  typeof label === 'string' ? formatDay(label) : label

type PostsPerDayChartProps = {
  data: DailyPostCount[]
}

/** Published posts per day as a bar chart, on shadcn's chart primitive (Recharts). */
export const PostsPerDayChart = ({ data }: PostsPerDayChartProps) => {
  return (
    <div className={styles.chart}>
      <ChartContainer config={CHART_CONFIG}>
        <BarChart accessibilityLayer data={data}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={formatDay}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={formatTooltipLabel} />} />
          <Bar dataKey="count" fill="var(--color-count)" radius={4} />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
