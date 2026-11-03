'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const Chart = require(require.resolve('chartjs-to-image', { paths: [path.resolve(__dirname, '../.homeybuild')] }));

test('Flow action configures every graph style for one and multiple Insights', async () => {
    const load = Module._load;
    Module._load = function (id, ...args) { return id === 'homey' ? { App: class {} } : load.call(this, id, ...args); };
    let App;
    try { App = require('../.homeybuild/app'); } finally { Module._load = load; }
    const app = new App();
    app.log = () => {};
    app.error = () => {};
    app.insightsManager = {
        getLogs: async () => ({ a: { id: 'a', units: 'V' }, b: { id: 'b', units: 'V' } }),
        getLogEntries: async () => ({ values: [
            { t: '2026-01-01T00:00:00Z', v: 1 },
            { t: '2026-01-01T00:10:00Z', v: 2 },
        ] }),
    };
    const image = { id: 'image', setPath() {} };
    app.homey = { clock: { getTimezone: () => 'UTC' }, settings: { get: () => null, set: () => {} }, images: { createImage: async () => image } };
    const setConfig = Chart.prototype.setConfig;
    const toFile = Chart.prototype.toFile;
    let config;
    Chart.prototype.setConfig = function (value) { config = value; return setConfig.call(this, value); };
    Chart.prototype.toFile = async () => {};
    try {
        for (const multi of [false, true]) {
            for (const style of ['line', 'bar', 'stepped', 'area', 'points', 'straight']) {
                const result = await app.runListenerCreateGraph({
                    device: { id: 'a', name: 'L1' }, insight2: multi ? { id: 'b', name: 'L2' } : undefined,
                    filename: 'graph.png', resolution: 'last6Hours', type: style, lineColor: '#123456', darkModeType: 'lightmode',
                });
                assert.equal(result.graph, image);
                assert.equal(config.type, style === 'bar' ? 'bar' : 'line');
                assert.equal(config.data.datasets.length, multi ? 2 : 1);
                for (const dataset of config.data.datasets) {
                    if (style === 'line' || style === 'bar') {
                        assert.equal(dataset.tension, 0.4);
                        assert.equal(dataset.fill, !multi);
                    } else if (style === 'stepped') {
                        assert.equal(dataset.stepped, 'after');
                        assert.equal(dataset.fill, false);
                    } else if (style === 'area') {
                        assert.equal(dataset.fill, true);
                        assert.equal(dataset.backgroundColor, `${dataset.borderColor}80`);
                    } else if (style === 'points') {
                        assert.equal(dataset.showLine, false);
                        assert.ok(dataset.pointRadius > 0);
                    } else {
                        assert.equal(dataset.tension, 0);
                        assert.equal(dataset.fill, false);
                    }
                }
            }
        }
    } finally { Chart.prototype.setConfig = setConfig; Chart.prototype.toFile = toFile; }
});
