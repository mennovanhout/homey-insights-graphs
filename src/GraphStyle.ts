/** Apply the additional line styles without changing the existing line and bar options. */
export function applyGraphStyle(config: any, style: string): void {
    if (!['stepped', 'area', 'points', 'straight'].includes(style)) return;

    config.type = 'line';
    for (const dataset of config.data.datasets) {
        dataset.fill = style === 'area';
        dataset.tension = style === 'straight' || style === 'stepped' ? 0 : 0.4;
        dataset.pointRadius = style === 'points' ? 2.5 : 0;
        dataset.showLine = style !== 'points';
        dataset.stepped = style === 'stepped' ? 'after' : false;
        if (style === 'area') {
            const color = dataset.borderColor;
            if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
                dataset.backgroundColor = `${color}80`;
            }
        } else if (style === 'points') {
            dataset.backgroundColor = dataset.borderColor;
        }
    }
}
