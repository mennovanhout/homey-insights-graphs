'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('both Flow actions register all selectors and the advanced listener uses advanced options', async () => {
    const load = Module._load;
    Module._load = function (id, ...args) {
        if (id === 'homey') return {App: class {}};
        if (id === 'homey-api') return {HomeyAPI: {createAppAPI: async () => ({insights: {}, devices: {}, images: {}})}};
        return load.call(this, id, ...args);
    };
    let App;
    try { App = require('../.homeybuild/app'); } finally { Module._load = load; }
    const cards = {};
    const app = new App();
    app.homey = {flow: {getActionCard(id) {
        const card = {selectors: [], registerArgumentAutocompleteListener(name) { this.selectors.push(name); }, registerRunListener(listener) { this.run = listener; }};
        cards[id] = card;
        return card;
    }}};
    await app.onInit();
    for (const id of ['create-graph-image', 'create-advanced-graph-image']) {
        assert.deepEqual(cards[id].selectors, ['device', 'insight2', 'insight3', 'insight4']);
        assert.equal(typeof cards[id].run, 'function');
    }
    app.runListenerCreateGraph = async args => args;
    assert.deepEqual(await cards['create-advanced-graph-image'].run({type: 'line'}, {}), {type: 'line', advancedGraph: true});
});
