'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const Chart = require(require.resolve('chartjs-to-image', { paths: [require('node:path').resolve(__dirname, '../.homeybuild')] }));
const { limitChartPoints } = require('../.homeybuild/src/Utils');
const LogNormaliser = require('../.homeybuild/src/LogNormaliser').default;

test('large series stays within QuickChart limit and retains endpoints and bucket peaks', () => {
    const points = Array.from({ length: 360 }, (_, i) => ({ t: String(i), v: i === 101 ? 999 : i }));
    const reduced = limitChartPoints(points);
    assert.equal(reduced.length, 250);
    assert.equal(reduced[0], points[0]);
    assert.equal(reduced.at(-1), points.at(-1));
    assert.ok(reduced.includes(points[101]));
    assert.equal(limitChartPoints(points.slice(0, 250)).length, 250);
});

test('normalisation respects local date boundaries, nulls, negative values and DST', () => {
    const logs = { values: [
        { t: '2026-03-01T23:30:00Z', v: null },
        { t: '2026-03-02T00:30:00Z', v: -1000000 },
        { t: '2026-03-02T01:30:00Z', v: -2000000 },
    ] };
    assert.deepEqual(new LogNormaliser(logs, 'last31Days', 'Europe/Prague').getNormalisedLogs(), [
        { t: '02 Mar', v: -1000000 },
    ]);
    const dst = { values: [
        { t: '2026-10-25T00:30:00Z', v: 1 },
        { t: '2026-10-25T01:30:00Z', v: 2 },
    ] };
    assert.deepEqual(new LogNormaliser(dst, 'last6Hours', 'Europe/Prague').getNormalisedLogs(), [
        { t: '02:30', v: 1 }, { t: '02:30', v: 2 },
    ]);
    assert.deepEqual(new LogNormaliser({ values: [{ t: '2026-01-01T00:00:00Z', v: null }] }, 'lastHour', 'UTC').getNormalisedLogs(), [
        { t: '00:00', v: null },
    ]);
});

test('graph action limits the request and reuses an image saved with the old filename', async () => {
    const load = Module._load;
    Module._load = function (id, ...args) {
        return id === 'homey' ? { App: class {} } : load.call(this, id, ...args);
    };
    let App;
    try { App = require('../.homeybuild/app'); } finally { Module._load = load; }
    const app = new App();
    app.log = () => {};
    app.error = () => {};
    app.insightsManager = { getLogEntries: async ({ resolution }) => {
        assert.equal(resolution, 'last6Hours');
        return { values: Array.from({ length: 360 }, (_, i) => ({ t: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), v: i })) };
    } };
    const settings = new Map([['graph.png.png', 'old-id']]);
    const image = { setPath(path) { this.path = path; }, async update() { this.updated = true; } };
    app.homey = { clock: { getTimezone: () => 'UTC' }, settings: { get: key => settings.get(key), set: (key, value) => settings.set(key, value) }, images: { getImage: async () => image } };
    const toFile = Chart.prototype.toFile;
    const setConfig = Chart.prototype.setConfig;
    Chart.prototype.setConfig = function (config) { this.testConfig = config; return setConfig.call(this, config); };
    Chart.prototype.toFile = async function (path) {
        assert.equal(path, '/userdata/graph.png');
        const config = this.testConfig;
        assert.equal(config.data.datasets[0].data.length, 250);
        assert.equal(config.data.labels.length, 250);
        assert.ok(config.options.scales.x && config.options.scales.y);
    };
    try {
        const result = await app.runListenerCreateGraph({ filename: 'graph.png', resolution: 'last6Hours', device: { id: 'id', name: 'Example' }, insight2: { id: '__insight_graphs_none__', name: 'None' }, type: 'line', lineColor: '#123456', darkModeType: 'lightmode' });
        assert.equal(result.graph, image);
        assert.equal(settings.get('graph.png'), 'old-id');
        assert.equal(image.path, '/userdata/graph.png');
        assert.equal(image.updated, true);
    } finally { Chart.prototype.toFile = toFile; Chart.prototype.setConfig = setConfig; }
});
