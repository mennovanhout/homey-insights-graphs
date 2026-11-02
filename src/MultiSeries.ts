const COLORS = ['#4c78a8', '#54a24b', '#b279a2', '#f2a541', '#e45756'];

export interface Point {
    x: number;
    y: number|null;
}

export interface Series {
    index: number;
    label: string;
    unit: string;
    points: Point[];
}

export function makeMultiSeries(results: (Series|null)[], firstColor: string, timezone: string, resolution: string) {
    const available = results.filter((result): result is Series => result !== null && result.points.length > 0);
    if (!available.some(result => result.points.some(point => point.y !== null))) {
        throw new Error('No selected Insights have available values for this time range');
    }
    let earliest = Infinity;
    let latest = -Infinity;
    for (const series of available) {
        for (const point of series.points) {
            if (point.y !== null && Number.isFinite(point.x)) {
                earliest = Math.min(earliest, point.x);
                latest = Math.max(latest, point.x);
            }
        }
    }
    // A single timestamp needs a small time window to avoid an enormous numeric scale.
    if (earliest === latest) {
        earliest -= 30 * 60 * 1000;
        latest += 30 * 60 * 1000;
    }
    const knownUnits = [...new Set(available.map(result => result.unit).filter(Boolean))];
    const unitFor = (result: Series) => result.unit || (knownUnits.length === 1 ? knownUnits[0] : '');
    const units = [...new Set(available.map(unitFor))];
    const axes: Record<string, object> = {};
    units.forEach((unit, index) => {
        axes[`y${index}`] = {
            type: 'linear', position: index % 2 ? 'right' : 'left', beginAtZero: false,
            title: { display: Boolean(unit), text: unit || '' },
            grid: { display: index === 0, color: 'rgba(127,127,127,0.2)' },
        };
    });
    const usedColors = new Set([firstColor.toLowerCase()]);
    const datasets = available.map(result => {
        let color = firstColor;
        if (result.index !== 0) {
            color = COLORS.find(candidate => !usedColors.has(candidate.toLowerCase()))!;
            usedColors.add(color.toLowerCase());
        }
        return {
            label: result.label, data: result.points, yAxisID: `y${units.indexOf(unitFor(result))}`,
            borderColor: color, backgroundColor: color,
            fill: false, tension: 0.4, pointRadius: 0, spanGaps: false,
        };
    });
    const isHourView = ['lastHour', 'last6Hours', 'last24Hours', 'today', 'yesterday'].includes(resolution);
    const tickCount = Math.min(13, Math.max(2, Math.floor((latest - earliest) / 60000) + 1));
    let tickOptions: Intl.DateTimeFormatOptions;
    if (isHourView) {
        tickOptions = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone };
    } else if (['last7Days', 'thisWeek', 'lastWeek'].includes(resolution)) {
        tickOptions = { weekday: 'short', timeZone: timezone };
    } else if (['thisYear', 'lastYear', 'last2Years'].includes(resolution)) {
        tickOptions = { month: 'short', year: 'numeric', timeZone: timezone };
    } else {
        tickOptions = { day: '2-digit', month: 'short', timeZone: timezone };
    }
    // QuickChart serializes callbacks, so embed only JSON-encoded formatting options.
    const formatTick = new Function('value', `return new Intl.DateTimeFormat('en-GB', ${JSON.stringify(tickOptions)}).format(new Date(Number(value)));`);
    return {
        datasets,
        scales: {
            x: {
                type: 'linear', min: earliest, max: latest, grid: { display: false },
                ticks: {
                    maxTicksLimit: isHourView ? tickCount : 7,
                    ...(isHourView ? {count: tickCount} : {}),
                    includeBounds: !isHourView,
                    align: isHourView ? 'center' : 'inner',
                    callback: formatTick,
                },
            },
            ...axes,
        },
    };
}

export function insightPoints(log: {values?: {t: string|number, v: unknown}[]}): Point[] {
    if (!log || !Array.isArray(log.values)) return [];
    return log.values.map(entry => ({
        x: typeof entry.t === 'number' ? entry.t : Date.parse(entry.t),
        y: typeof entry.v === 'number' && Number.isFinite(entry.v) ? entry.v : entry.v === true ? 1 : entry.v === false ? 0 : null,
    })).filter(point => Number.isFinite(point.x)).sort((a, b) => a.x - b.x);
}
