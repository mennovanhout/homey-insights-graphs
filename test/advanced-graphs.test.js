'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const Chart = require(require.resolve('chartjs-to-image', { paths: [path.resolve(__dirname, '../.homeybuild')] }));
const { reducePoints } = require('../.homeybuild/src/Reduction');
const { fixedTimeTicks, applyTimeInterval } = require('../.homeybuild/src/TimeAxis');

test('reduction retains endpoints and supports maximum, minimum, average and empty buckets', () => {
    const points = Array.from({length: 498}, (_, i) => ({x: i * 1000, y: i}));
    points[1].y = null;
    points[2].y = null;
    const max = reducePoints(points, 'maximum');
    const min = reducePoints(points, 'minimum');
    const avg = reducePoints(points, 'average');
    assert.equal(max.length, 250);
    assert.deepEqual(max[0], points[0]);
    assert.deepEqual(max.at(-1), points.at(-1));
    assert.equal(max[1].y, null);
    assert.equal(max[2].y, 4);
    assert.equal(min[2].y, 3);
    assert.equal(avg[2].y, 3.5);
    assert.equal(reducePoints(points.slice(0, 3), 'average').length, 3);
});

test('fixed labels use Homey local hours, including non-whole-hour offsets and DST', () => {
    const nepal = fixedTimeTicks(Date.parse('2026-01-01T00:00:00Z'), Date.parse('2026-01-01T03:00:00Z'), 'Asia/Kathmandu', 'hour');
    assert.deepEqual(nepal.map(t => new Date(t).toISOString().slice(11, 16)), ['00:15', '01:15', '02:15']);
    const dst = fixedTimeTicks(Date.parse('2026-10-24T23:00:00Z'), Date.parse('2026-10-25T03:00:00Z'), 'Europe/Prague', 'hour');
    assert.equal(dst.length, 5);
    assert.throws(() => fixedTimeTicks(0, 8 * 86400000, 'UTC', 'hour'), /too many labels/);
    const min = Date.parse('2026-11-01T20:35:00Z');
    const max = min + 287 * 300000;
    const config = {options: {scales: {x: {min, max, ticks: {callback: value => String(value)}}}}};
    applyTimeInterval(config, 'two_hours', 'Asia/Kathmandu');
    const axis = config.options.scales.x;
    const selected = fixedTimeTicks(min, max, 'Asia/Kathmandu', 'two_hours');
    assert.equal(axis.ticks.count, 501);
    const nearestGridPoint = min + Math.round((selected[0] - min) * 500 / (max - min)) * (max - min) / 500;
    assert.equal(axis.ticks.callback(nearestGridPoint), String(selected[0]));
    assert.equal(axis.ticks.callback(min), '');
});

test('advanced Flow applies colors, axis limits, title and dimensions to one image', async () => {
    const load = Module._load;
    Module._load = function (id, ...args) { return id === 'homey' ? { App: class {} } : load.call(this, id, ...args); };
    let App;
    try { App = require('../.homeybuild/app'); } finally { Module._load = load; }
    const app = new App();
    app.log = () => {};
    app.error = () => {};
    app.insightsManager = {
        getLogs: async () => ({ a: {id: 'a', units: 'V'}, b: {id: 'b', units: 'V'} }),
        getLogEntries: async ({id}) => ({ values: [{t: '2026-01-01T00:00:00Z', v: id === 'a' ? 230 : 231}, {t: '2026-01-01T06:00:00Z', v: 232}] }),
    };
    const image = {id: 'image', setPath() {}};
    app.homey = {__: () => 'No data', clock: {getTimezone: () => 'UTC'}, settings: {get: () => null, set: () => {}}, images: {createImage: async () => image}};
    const setConfig = Chart.prototype.setConfig;
    const toFile = Chart.prototype.toFile;
    let chart;
    Chart.prototype.setConfig = function (config) { this.testConfig = config; return setConfig.call(this, config); };
    Chart.prototype.toFile = async function () { chart = this; };
    const args = {advancedGraph: true, device: {id: 'a', name: 'L1'}, insight2: {id: 'b', name: 'L2'}, type: 'line', resolution: 'last6Hours', lineColor: '#112233', color2: '#aabbcc', darkModeType: 'lightmode', filename: 'advanced', y_min: 210, y_max: 250, graph_title: 'Voltage', image_width: 800, image_height: 400, tick_interval: 'hour'};
    try {
        const result = await app.runListenerCreateGraph(args);
        assert.equal(result.graph, image);
        assert.equal(chart.width, 800);
        assert.equal(chart.height, 400);
        assert.equal(chart.testConfig.options.plugins.title.text, 'Voltage');
        assert.equal(chart.testConfig.data.datasets[1].borderColor, '#aabbcc');
        assert.equal(chart.testConfig.options.scales.y0.min, 210);
        assert.equal(chart.testConfig.options.scales.y0.max, 250);
        const ticks = chart.testConfig.options.scales.x.ticks;
        assert.equal(ticks.count, 501);
        assert.equal(ticks.callback(Date.parse('2026-01-01T00:00:00Z')), '00:00');
        assert.equal(ticks.callback(Date.parse('2026-01-01T00:30:00Z')), '');
        await app.runListenerCreateGraph({...args, axis2: 'right', y2_min: 0, y2_max: 10});
        assert.deepEqual(chart.testConfig.data.datasets.map(dataset => dataset.yAxisID), ['y0', 'y1']);
        assert.equal(chart.testConfig.options.scales.y0.min, 210);
        assert.equal(chart.testConfig.options.scales.y1.min, 0);
        assert.equal(chart.testConfig.options.scales.y1.max, 10);
        await app.runListenerCreateGraph({...args, insight2: undefined, axis1: 'right', y_min: undefined, y_max: undefined, y2_min: 220, y2_max: 240});
        assert.equal(chart.testConfig.data.datasets[0].yAxisID, 'y1');
        assert.equal(chart.testConfig.options.scales.y1.min, 220);
        assert.equal(chart.testConfig.options.scales.y1.max, 240);
        await assert.rejects(app.runListenerCreateGraph({...args, y_min: 250}), /minimum must be less/);
        await assert.rejects(app.runListenerCreateGraph({...args, axis2: 'other'}), /Invalid Y-axis selection/);
    } finally { Chart.prototype.setConfig = setConfig; Chart.prototype.toFile = toFile; }
});

test('single-Insight reduction is opt-in and mixed-unit custom limits are rejected', async () => {
    const load = Module._load;
    Module._load = function (id, ...args) { return id === 'homey' ? { App: class {} } : load.call(this, id, ...args); };
    let App;
    try { App = require('../.homeybuild/app'); } finally { Module._load = load; }
    const app = new App();
    app.log = () => {};
    app.error = () => {};
    app.homey = {clock: {getTimezone: () => 'UTC'}};
    app.insightsManager = {
        getLogs: async () => ({ a: {id: 'a', units: 'V'}, b: {id: 'b', units: 'W'} }),
        getLogEntries: async () => ({values: Array.from({length: 498}, (_, i) => ({t: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), v: i}))}),
    };
    const selected = [{insight: {id: 'a', name: 'L1'}, index: 0}];
    const args = {resolution: 'last6Hours', lineColor: '#123456', aggregation: 'average'};
    const graph = await app.getMultiSeries(selected, args);
    assert.equal(graph.datasets[0].data.length, 250);
    assert.equal(graph.datasets[0].data[1].y, 1.5);
    const two = await app.getMultiSeries([...selected, {insight: {id: 'b', name: 'Power'}, index: 1}], {...args, aggregation: 'legacy'});
    const config = {options: {scales: two.scales, plugins: {title: {text: 'Graph'}}}};
    assert.throws(() => app.applyAdvancedOptions(config, {y_min: 0}), /same unit/);
    assert.doesNotThrow(() => app.applyAdvancedOptions(config, {}));
    const withRightLimit = await app.getMultiSeries([...selected, {insight: {id: 'b', name: 'Power'}, index: 1}], {...args, aggregation: 'legacy', advancedGraph: true, y_min: 210, y2_max: 5000});
    const configured = {options: {scales: withRightLimit.scales, plugins: {title: {text: 'Graph'}}}};
    app.applyAdvancedOptions(configured, {y_min: 210, y2_max: 5000});
    assert.equal(configured.options.scales.y0.min, 210);
    assert.equal(configured.options.scales.y1.max, 5000);
});

test('advanced per-axis limits target the correct side and validate both ranges', () => {
    const load = Module._load;
    Module._load = function (id, ...args) { return id === 'homey' ? { App: class {} } : load.call(this, id, ...args); };
    let App;
    try { App = require('../.homeybuild/app'); } finally { Module._load = load; }
    const app = new App();
    const config = {options: {scales: {x: {}, y0: {position: 'left'}, y1: {position: 'right'}}, plugins: {title: {text: 'Graph'}}}};
    app.applyAdvancedOptions(config, {axis2: 'right', y_min: 210, y_max: 250, y2_min: 0, y2_max: 10});
    assert.equal(config.options.scales.y0.min, 210);
    assert.equal(config.options.scales.y0.max, 250);
    assert.equal(config.options.scales.y1.min, 0);
    assert.equal(config.options.scales.y1.max, 10);
    assert.throws(() => app.applyAdvancedOptions(config, {y2_min: 4, y2_max: 4}), /Right Y-axis minimum/);
    const leftOnly = {options: {scales: {x: {}, y: {}}, plugins: {title: {text: 'Graph'}}}};
    assert.throws(() => app.applyAdvancedOptions(leftOnly, {y2_max: 10}), /without an Insight/);
});
