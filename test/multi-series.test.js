'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const Chart = require(require.resolve('chartjs-to-image', { paths: [require('node:path').resolve(__dirname, '../.homeybuild')] }));
const { makeMultiSeries, insightPoints } = require('../.homeybuild/src/MultiSeries');

test('preserves timestamps, gaps, independent values and distinct series', () => {
    const points = insightPoints({ values: [
        { t: '2026-01-01T00:05:00Z', v: null },
        { t: '2026-01-01T00:00:00Z', v: 231 },
    ] });
    const second = insightPoints({ values: [
        { t: '2026-01-01T00:02:00Z', v: 234 },
        { t: '2026-01-01T00:06:00Z', v: 236 },
    ] });
    const output = makeMultiSeries([
        { index: 0, label: 'L1', unit: 'V', points },
        { index: 1, label: 'L2', unit: 'V', points: second },
        { index: 2, label: 'L3', unit: 'V', points },
        { index: 3, label: 'L4', unit: 'V', points },
    ], '#123456', 'Europe/Prague', 'last6Hours');
    assert.equal(output.datasets.length, 4);
    assert.equal(new Set(output.datasets.map(dataset => dataset.borderColor)).size, 4);
    assert.equal(output.datasets[0].yAxisID, output.datasets[3].yAxisID);
    assert.deepEqual(output.datasets[0].data, [
        { x: Date.parse('2026-01-01T00:00:00Z'), y: 231 },
        { x: Date.parse('2026-01-01T00:05:00Z'), y: null },
    ]);
    assert.equal(output.datasets[1].data[0].x, Date.parse('2026-01-01T00:02:00Z'));
    assert.equal(output.scales.x.type, 'linear');
    assert.equal(output.datasets[0].spanGaps, false);
});

test('different units use separate axes and no readings produces an error', () => {
    const points = [{ x: 1, y: 42 }];
    const chart = makeMultiSeries([{ index: 0, label: 'voltage', unit: 'V', points }, { index: 1, label: 'power', unit: 'W', points }], '#123456', 'UTC', 'today');
    assert.notEqual(chart.datasets[0].yAxisID, chart.datasets[1].yAxisID);
    assert.equal(chart.datasets.length, 2);
    const collision = makeMultiSeries([{ index: 0, label: 'L1', unit: 'V', points }, { index: 1, label: 'L2', unit: 'V', points }], '#4c78a8', 'UTC', 'today');
    assert.notEqual(collision.datasets[0].borderColor, collision.datasets[1].borderColor);
    assert.match(collision.scales.x.ticks.callback(Date.parse('2026-01-01T00:00:00Z')), /00:00/);
    assert.throws(() => makeMultiSeries([], '#123456', 'UTC', 'today'), /No selected Insights/);
});

test('time labels match the selected range and use the Homey time zone', () => {
    const points = [{ x: Date.parse('2026-11-02T20:10:00Z'), y: 1 }];
    const tick = resolution => makeMultiSeries([{ index: 0, label: 'L1', unit: 'V', points }], '#ff0000', 'Europe/Prague', resolution).scales.x.ticks.callback(points[0].x);
    for (const resolution of ['lastHour', 'last6Hours', 'last24Hours', 'today', 'yesterday']) assert.equal(tick(resolution), '21:10');
    for (const resolution of ['last7Days', 'thisWeek', 'lastWeek']) assert.equal(tick(resolution), 'Mon');
    for (const resolution of ['last14Days', 'last31Days', 'thisMonth', 'lastMonth']) assert.equal(tick(resolution), '02 Nov');
    for (const resolution of ['thisYear', 'lastYear', 'last2Years']) assert.equal(tick(resolution), 'Nov 2026');
});

test('time-axis bounds follow real readings across series and hour views have denser ticks', () => {
    const series = [
        { index: 0, label: 'L1', unit: 'V', points: [{ x: 1000, y: null }, { x: 2000, y: 1 }, { x: 5000000, y: 2 }] },
        { index: 1, label: 'L2', unit: 'V', points: [{ x: 3000, y: 3 }, { x: 7000000, y: 4 }, { x: 8000000, y: null }] },
    ];
    for (const range of ['lastHour', 'last6Hours', 'last24Hours', 'today', 'yesterday']) {
        const axis = makeMultiSeries(series, '#ff0000', 'UTC', range).scales.x;
        assert.equal(axis.min, 2000);
        assert.equal(axis.max, 7000000);
        assert.equal(axis.ticks.maxTicksLimit, 13);
        assert.equal(axis.ticks.count, 13);
        assert.equal(axis.ticks.includeBounds, false);
    }
    const short = makeMultiSeries([{ index: 0, label: 'L1', unit: 'V', points: [{ x: 1000000, y: 1 }, { x: 1180000, y: 2 }] }], '#ff0000', 'UTC', 'lastHour').scales.x;
    assert.equal(short.ticks.count, 4);
    const single = makeMultiSeries([{ index: 0, label: 'L1', unit: 'V', points: [{ x: 5000000, y: 1 }] }], '#ff0000', 'UTC', 'last6Hours').scales.x;
    assert.equal(single.min, 3200000);
    assert.equal(single.max, 6800000);
});

test('optional autocomplete exposes a selectable None value and filters by query', async () => {
    const load = Module._load;
    Module._load = function (id, ...args) { return id === 'homey' ? { App: class {} } : load.call(this, id, ...args); };
    let App;
    try { App = require('../.homeybuild/app'); } finally { Module._load = load; }
    const app = new App();
    app.homey = { __: () => 'None' };
    app.autocompleteListener = async () => [{ name: 'Voltage', id: 'voltage' }];
    const choices = await app.optionalAutocompleteListener('', {});
    assert.equal(choices[0].name, 'None');
    assert.equal(choices[0].id, '__insight_graphs_none__');
    assert.equal((await app.optionalAutocompleteListener('volt', {})).length, 1);
});

test('empty and unavailable datasets do not prevent a remaining series', async () => {
    const load = Module._load;
    Module._load = function (id, ...args) { return id === 'homey' ? { App: class {} } : load.call(this, id, ...args); };
    let App;
    try { App = require('../.homeybuild/app'); } finally { Module._load = load; }
    const app = new App();
    app.log = () => {};
    app.error = () => {};
    app.homey = { clock: { getTimezone: () => 'UTC' } };
    app.insightsManager = {
        getLogs: async () => ({}),
        getLogEntries: async ({ id }) => {
            if (id === 'bad') throw new Error('unavailable');
            return { values: id === 'empty' ? [] : [{ t: '2026-01-01T00:00:00Z', v: 230 }] };
        },
    };
    const args = { resolution: 'last6Hours', lineColor: '#ff0000' };
    const selected = ['bad', 'empty', 'good'].map((id, index) => ({ index, insight: { id, name: id } }));
    const result = await app.getMultiSeries(selected, args);
    assert.deepEqual(result.datasets.map(dataset => dataset.label), ['good']);
    await assert.rejects(app.getMultiSeries(selected.slice(0, 2), args), /No selected Insights/);
});

test('action returns one image with three independent series despite another unavailable Insight', async () => {
    const load = Module._load;
    Module._load = function (id, ...args) { return id === 'homey' ? { App: class {} } : load.call(this, id, ...args); };
    let App;
    try { App = require('../.homeybuild/app'); } finally { Module._load = load; }
    const app = new App();
    const messages = [];
    app.log = message => messages.push(message);
    app.error = message => messages.push(message);
    const calls = [];
    app.insightsManager = {
        getLogs: async () => Object.fromEntries(['a', 'b', 'c', 'd'].map(id => [id, { id, units: 'V' }])),
        getLogEntries: async ({ id, resolution }) => {
            calls.push({ id, resolution });
            if (id === 'd') throw new Error('unavailable');
            return { values: [{ t: `2026-01-01T00:0${{ a: 0, b: 2, c: 4 }[id]}:00Z`, v: 230 }] };
        },
    };
    const image = { id: 'image', setPath(path) { this.path = path; } };
    app.homey = { clock: { getTimezone: () => 'UTC' }, settings: { get: () => null, set: () => {} }, images: { createImage: async () => image } };
    const setConfig = Chart.prototype.setConfig;
    const toFile = Chart.prototype.toFile;
    Chart.prototype.setConfig = function (config) { this.testConfig = config; return setConfig.call(this, config); };
    Chart.prototype.toFile = async function () {
        assert.equal(this.testConfig.data.datasets.length, 3);
        assert.deepEqual(this.testConfig.data.datasets.map(dataset => dataset.label), ['L1', 'L2', 'L3']);
        assert.equal(this.testConfig.options.plugins.legend.display, true);
        assert.equal(this.testConfig.data.datasets[1].data[0].x, Date.parse('2026-01-01T00:02:00Z'));
        assert.equal(new Set(this.testConfig.data.datasets.map(d => d.yAxisID)).size, 1);
    };
    try {
        const result = await app.runListenerCreateGraph({
            device: { id: 'a', name: 'L1', description: 'Device - measure_voltage' }, insight2: { id: 'b', name: 'L2' }, insight3: { id: 'c', name: 'L3' }, insight4: { id: 'd', name: 'L4' },
            filename: 'phases', resolution: 'last6Hours', type: 'line', lineColor: '#ff0000', darkModeType: 'lightmode',
        });
        assert.equal(result.graph, image);
        assert.equal(image.path, '/userdata/phases.png');
        assert.equal(calls.length, 4);
        assert.ok(calls.every(call => call.resolution === 'last6Hours'));
        assert.ok(messages.some(message => message.includes('Insight 4 retrieval failed')));
    } finally { Chart.prototype.setConfig = setConfig; Chart.prototype.toFile = toFile; }
});
