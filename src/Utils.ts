export const generateId  = (): string => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;

    let result = '';
    let counter = 0;

    while (counter < 30) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }

    return result;
}

export const backgroundColor = (arg: string): string => {
    switch (arg) {
        case 'darkmode':
            return '#1E1E1EFF';
        case 'lightmode':
            return '#ffffff';
        default:
            return 'transparent';
    }
}

export function limitChartPoints<T extends {v: number|null}>(points: T[], limit = 250): T[] {
    if (points.length <= limit) return points;
    const result = [points[0]];
    const middle = points.slice(1, -1);
    const buckets = limit - 2;
    for (let i = 0; i < buckets; i++) {
        const start = Math.floor(i * middle.length / buckets);
        const end = Math.floor((i + 1) * middle.length / buckets);
        const bucket = middle.slice(start, end);
        const peak = bucket.reduce<T|null>((best, point) => {
            if (point.v != null && (best === null || point.v > best.v!)) return point;
            return best;
        }, null);
        result.push(peak || bucket[0]);
    }
    result.push(points[points.length - 1]);
    return result;
}
