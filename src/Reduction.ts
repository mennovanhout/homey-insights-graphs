import {Point} from './MultiSeries';

export type Reduction = 'maximum'|'minimum'|'average';

/** Reduce only oversized single-series data; retain endpoints and empty buckets. */
export function reducePoints(points: Point[], mode: Reduction, limit = 250): Point[] {
    if (points.length <= limit) return points;
    const middle = points.slice(1, -1);
    const count = limit - 2;
    const result = [points[0]];
    for (let index = 0; index < count; index++) {
        const bucket = middle.slice(Math.floor(index * middle.length / count), Math.floor((index + 1) * middle.length / count));
        const valid = bucket.filter(point => point.y !== null && Number.isFinite(point.y));
        if (valid.length === 0) {
            result.push(bucket[0]);
        } else if (mode === 'average') {
            const mean = valid.reduce((sum, point) => sum + point.y!, 0) / valid.length;
            result.push({x: valid[Math.floor(valid.length / 2)].x, y: mean});
        } else {
            result.push(valid.reduce((best, point) => mode === 'minimum' ? (point.y! < best.y! ? point : best) : (point.y! > best.y! ? point : best)));
        }
    }
    result.push(points[points.length - 1]);
    return result;
}
