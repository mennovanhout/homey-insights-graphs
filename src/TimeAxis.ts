export function fixedTimeTicks(min: number, max: number, timezone: string, interval: 'hour'|'two_hours'): number[] {
    const hours = interval === 'hour' ? 1 : 2;
    if (max - min > (hours * 15 + 2) * 3600000) {
        throw new Error('The chosen time-label interval produces too many labels; choose a longer interval or automatic labels');
    }
    const formatter = new Intl.DateTimeFormat('en-GB', {timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
    const ticks: number[] = [];
    for (let time = Math.ceil(min / 60000) * 60000; time <= max; time += 60000) {
        const parts = formatter.formatToParts(new Date(time));
        const hour = Number(parts.find(part => part.type === 'hour')!.value);
        const minute = Number(parts.find(part => part.type === 'minute')!.value);
        if (minute === 0 && hour % hours === 0) ticks.push(time);
    }
    if (ticks.length > 13) throw new Error('The chosen time-label interval produces too many labels; choose a longer interval or automatic labels');
    if (!ticks.length) throw new Error('No time labels fall in this range; choose automatic labels');
    return ticks;
}

export function applyTimeInterval(config: any, interval: string|undefined, timezone: string): void {
    if (!interval || interval === 'auto') return;
    if (interval !== 'hour' && interval !== 'two_hours') throw new Error('Invalid time-label interval');
    const scale = config.options.scales.x;
    const ticks = fixedTimeTicks(scale.min, scale.max, timezone, interval);
    // Place labels at the closest point on a fine grid; the data and axis bounds stay unchanged.
    const count = 501;
    const span = scale.max - scale.min;
    const formatter = scale.ticks.callback.toString();
    scale.ticks.callback = new Function('value', `const index = Math.round((Number(value) - ${scale.min}) * ${count - 1} / ${span}); const tick = ${JSON.stringify(ticks)}.find(t => Math.round((t - ${scale.min}) * ${count - 1} / ${span}) === index); return tick === undefined ? '' : (${formatter})(tick);`);
    scale.ticks.count = count;
    scale.ticks.maxTicksLimit = count;
    scale.ticks.includeBounds = true;
    scale.ticks.autoSkip = false;
    scale.ticks.maxRotation = 0;
    scale.ticks.minRotation = 0;
}
