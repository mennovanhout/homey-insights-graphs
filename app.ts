import Homey, {FlowCard, Image} from 'homey';
import { HomeyAPI, HomeyAPIV3Local } from 'homey-api';
import LogNormaliser, {Log} from './src/LogNormaliser';
import ChartJsImage from "chartjs-to-image";
import {backgroundColor, limitChartPoints} from "./src/Utils";
import dayjs from "dayjs";
import {makeMultiSeries, insightPoints} from './src/MultiSeries';
import {applyGraphStyle} from './src/GraphStyle';

const NO_INSIGHT_ID = '__insight_graphs_none__';

class InsightGraphs extends Homey.App {
  resolutionSelection: string[] = ['lastHour', 'last6Hours', 'last24Hours', 'last7Days', 'last14Days', 'last31Days',
    'last2Years', 'today', 'thisWeek', 'thisMonth', 'thisYear', 'yesterday', 'lastWeek', 'lastMonth', 'lastYear'];
  homeyApi: HomeyAPIV3Local|undefined = undefined;
  createGraphActionCard: Homey.FlowCardAction|undefined;
  insightsManager: HomeyAPIV3Local.ManagerInsights|undefined;
  deviceManager: HomeyAPIV3Local.ManagerDevices|undefined;
  imageManager: HomeyAPIV3Local.ManagerImages|undefined;

  async onInit() {
    this.homeyApi = await HomeyAPI.createAppAPI({
      homey: this.homey,
    });

    // @ts-ignore
    this.insightsManager = this.homeyApi!.insights;
    // @ts-ignore
    this.deviceManager = this.homeyApi!.devices;
    // @ts-ignore
    this.imageManager = this.homeyApi!.images;

    this.createGraphActionCard = this.homey.flow.getActionCard('create-graph-image');
    this.createGraphActionCard.registerArgumentAutocompleteListener('device', this.autocompleteListener.bind(this));
    for (const name of ['insight2', 'insight3', 'insight4']) {
      this.createGraphActionCard.registerArgumentAutocompleteListener(name, this.optionalAutocompleteListener.bind(this));
    }
    this.createGraphActionCard.registerRunListener(this.runListenerCreateGraph.bind(this));
  }

  private async runListenerCreateGraph(args: any, stats: any): Promise<{graph: Image}> {
    const requestedFilename: string = args.filename || 'temp.png';
    const filename = /\.png$/i.test(requestedFilename) ? requestedFilename : `${requestedFilename}.png`;
    const legacyFilename = requestedFilename.endsWith('.png') ? `${requestedFilename}.png` : requestedFilename;

    const selected = [args.device, args.insight2, args.insight3, args.insight4].map((insight, index) => ({insight, index})).filter(item => item.insight && item.insight.id && item.insight.id !== NO_INSIGHT_ID);
    const multi = selected.length > 1;
    let values: {t: string, v: number|null}[] = [];
    let multiChart;
    if (multi) {
      multiChart = await this.getMultiSeries(selected, args);
    } else {
      // Get logs
      let logs: Log;
      try {
        logs = await this.insightsManager!.getLogEntries({id: args.device.id, uri: args.device.uri, resolution: args.resolution});
      } catch (error: any) {
        this.error(`Homey Insights request failed for ${args.resolution}: ${error.message}`);
        throw new Error(`Homey Insights request failed for ${args.resolution}: ${error.message}`);
      }
      const logNormaliser = new LogNormaliser(logs, args.resolution, this.homey.clock.getTimezone());
      const normalisedValues = logNormaliser.getNormalisedLogs();
      values = limitChartPoints(normalisedValues);
      if (values.length !== normalisedValues.length) {
        this.log(`Reduced graph from ${normalisedValues.length} to ${values.length} points for QuickChart`);
      }
    }

    // Generate images
    const chart = new ChartJsImage();

    const chartConfig: any = {
      type: args.type,
      data: {
        labels: values.map((log) => log.t),
        datasets: [{
          label: `${args.device.name} - ${args.resolution}`,
          data: values.map((log) => log.v),
          borderColor: args.lineColor,
          backgroundColor: `#${this.addAlpha(args.lineColor.replace('#', ''), 0.5)}`,
          fill: true,
          // cubicInterpolationMode: 'monotone',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0
        }]
      },
       options: {
         plugins: {
           title: {
             display: true,
             padding: 0,
             font: {
               size: 14
             },
             text: `${args.device.name} - ${args.resolution}`
           },
           subtitle: {
             display: true,
             position: 'bottom',
             padding: 0,
             font: {
               size: 10
             },
             text: 'Created at ' + dayjs().tz(this.homey.clock.getTimezone()).format('YYYY-MM-DD HH:mm:ss')
           },
           legend: {
             display: false,
           },
         },
         layout: {
           padding: {
             left: 10,
             right: 30,
             top: 10,
             bottom: 10
           }
         },
         scales: {
           x: { grid: { display: false } },
           y: {
             beginAtZero: false,
             title: { display: true, text: `${args.device.name}` },
             border: { dash: [4, 4] },
             grid: { display: true, color: 'rgba(127,127,127,0.2)' },
           },
         }
       }
    };
    if (multi && multiChart) {
      chartConfig.data = {datasets: multiChart.datasets};
      chartConfig.options.scales = multiChart.scales;
      chartConfig.options.plugins.legend.display = true;
      chartConfig.options.plugins.title.text = `Insights - ${args.resolution}`;
    }
    applyGraphStyle(chartConfig, args.type);
    chart.setConfig(chartConfig)
        .setChartJsVersion('4.4.0')
        .setWidth(500)
        .setHeight(300)
        .setBackgroundColor(backgroundColor(args.darkModeType))
        .setDevicePixelRatio('3.0');



    try {
      await chart.toFile(`/userdata/${filename}`);
    } catch (error: any) {
      const status = error.response && error.response.status;
      this.error(`QuickChart request failed${status ? ` (HTTP ${status})` : ''}: ${error.message}`);
      throw new Error(`QuickChart could not generate the graph${status ? ` (HTTP ${status})` : ''}: ${error.message}`);
    }

    // try to update image
    const imageId = this.homey.settings.get(filename) || (legacyFilename !== filename && this.homey.settings.get(legacyFilename));
    const realImage = await this.getImage(imageId);

    if (realImage) {
      realImage.setPath(`/userdata/${filename}`);
      this.homey.settings.set(filename, imageId);
      await realImage.update();

      return {
        graph: realImage,
      };
    }

    // Create image
    const image = await this.homey.images.createImage();
    image.setPath(`/userdata/${filename}`);

    this.homey.settings.set(filename, image.id);

    return {
      graph: image,
    };
  }

  private async getMultiSeries(selected: {insight: any, index: number}[], args: any) {
    const metadataPromise = this.insightsManager!.getLogs().catch((error: any) => {
      this.error(`Unable to retrieve Insight units: ${error.message}`);
      return {};
    });
    const entriesPromise = Promise.allSettled(selected.map(({insight}) => this.insightsManager!.getLogEntries({id: insight.id, uri: insight.uri, resolution: args.resolution})));
    const [metadata, entries] = await Promise.all([metadataPromise, entriesPromise]);
    const metadataById = new Map(Object.values(metadata).map(log => [log.id, log]));
    const series = selected.map(({insight, index}, i) => {
      const result = entries[i];
      if (result.status === 'rejected') {
        this.error(`Insight ${index + 1} retrieval failed for ${args.resolution}: ${result.reason && result.reason.message || String(result.reason)}`);
        return null;
      }
      const points = insightPoints(result.value);
      if (!points.some(point => point.y !== null)) {
        this.log(`Insight ${index + 1} has no values for ${args.resolution}`);
        return null;
      }
      this.log(`Retrieved ${points.length} points for Insight ${index + 1} (${args.resolution})`);
      const details = metadataById.get(insight.id);
      return {
        index, points,
        label: insight.name,
        unit: details && details.units || insight.units || '',
      };
    });
    return makeMultiSeries(series, args.lineColor, this.homey.clock.getTimezone(), args.resolution);
  }

  private async getImage(imageId: string) {
    let realImage: Image|undefined;

    if (!imageId) {
      return undefined;
    }

    try {
      realImage = await this.homey.images.getImage(imageId);
    } catch (error) {
      realImage = undefined;
    }

    return realImage;
  }

  private addAlpha(color: string, opacity: number) {
    // coerce values so ti is between 0 and 1.
    const  _opacity = Math.round(Math.min(Math.max(opacity ?? 1, 0), 1) * 255);
    return color + _opacity.toString(16).padStart(2, '0').toUpperCase();
  }

  private async optionalAutocompleteListener(query: string, args: any): Promise<FlowCard.ArgumentAutocompleteResults[]> {
    const results = await this.autocompleteListener(query, args);
    const none = {name: this.homey.__('insight_none'), id: NO_INSIGHT_ID};
    if (none.name.toLowerCase().includes((query ?? '').toLowerCase())) {
      return [none, ...results];
    }
    return results;
  }

  private async autocompleteListener(query: string, args: any): Promise<FlowCard.ArgumentAutocompleteResults[]> {
    const devices = await this.deviceManager!.getDevices();
    const logs = await this.insightsManager!.getLogs();

    const results = Object.keys(logs).reduce((result: any, key) => {
      let description = logs[key].id.replace('homey:device:', '').replace('homey:manager:apps:', '');

      Object.keys(devices).forEach((id) => {
        if (description.includes(id)) {
          description = description.replace(id, devices[id]?.name ?? 'unknown');
        }
      });

      // @ts-ignore
      const title = logs[key].title;

      if (!title) {
        return result;
      }

      result.push({
        name: title,
        description: description.replaceAll(':', ' - '),
        id: logs[key].id,
        uri: logs[key].uri,
        units: logs[key].units,
      });
      return result;
    }, []);

    return results.filter((result: any) => result.name.toLowerCase().includes((query ?? '').toLowerCase()));
  }
}

module.exports = InsightGraphs;
