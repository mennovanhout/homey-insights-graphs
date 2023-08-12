import Homey, {FlowCard, Image} from 'homey';
import { HomeyAPI, HomeyAPIV3Local } from 'homey-api';
import ChartJSImage from "chart.js-image";
import LogNormaliser, {Log} from './src/LogNormaliser';

class InsightGraphs extends Homey.App {
  resolutionSelection: string[] = ['lastHour', 'last6Hours', 'last24Hours', 'last7Days', 'last14Days', 'last31Days',
    'last2Years', 'today', 'thisWeek', 'thisMonth', 'thisYear', 'yesterday', 'lastWeek', 'lastMonth', 'lastYear'];
  homeyApi: HomeyAPIV3Local|undefined = undefined;
  createGraphActionCard: Homey.FlowCardAction|undefined;
  insightsManager: HomeyAPIV3Local.ManagerInsights|undefined;
  deviceManager: HomeyAPIV3Local.ManagerDevices|undefined;

  async onInit() {
    this.homeyApi = await HomeyAPI.createAppAPI({
      homey: this.homey,
    });

    // @ts-ignore
    this.insightsManager = this.homeyApi!.insights;
    // @ts-ignore
    this.deviceManager = this.homeyApi!.devices;

    this.createGraphActionCard = this.homey.flow.getActionCard('create-graph-image');
    this.createGraphActionCard.registerArgumentAutocompleteListener('device', this.autocompleteListener.bind(this));
    this.createGraphActionCard.registerRunListener(this.runListener.bind(this));
  }

  private async runListener(args: any, stats: any): Promise<{graph: Image}> {
    // Get logs
    const logs: Log = await this.insightsManager!.getLogEntries({id: args.device.id, uri: args.device.uri, resolution: args.resolution});

    const logNormaliser = new LogNormaliser(logs, args.resolution);
    const values = logNormaliser.getNormalisedLogs();

    // Generate images
    // @ts-ignore
    const chart = new ChartJSImage().chart({
      type: args.type,
      data: {
        labels: values.map((log) => log.t),
        datasets: [
          {
            label: `${args.device.name} - ${args.resolution}`,
            data: values.map((log) => log.v),
            borderColor: args.lineColor,
            backgroundColor: `#${this.addAlpha(args.lineColor.replace('#', ''), 0.2)}`,
          }
        ]
      },
      options: {
        scales: {
          yAxes: [{
            ticks: {
              beginAtZero: false
            }
          }]
        },
        chartArea: {
          backgroundColor: args.backgroundColor
        }
      }
    });

    const image = await this.homey.images.createImage();
    image.setUrl(chart.toURL());

    return {
      graph: image,
    };
  }

  private addAlpha(color: string, opacity: number) {
    // coerce values so ti is between 0 and 1.
    const  _opacity = Math.round(Math.min(Math.max(opacity || 1, 0), 1) * 255);
    return color + _opacity.toString(16).toUpperCase();
  }

  private async autocompleteListener(query: string, args: any): Promise<FlowCard.ArgumentAutocompleteResults> {
    const devices = await this.deviceManager!.getDevices();
    const logs = await this.insightsManager!.getLogs();

    const results = Object.keys(logs).map((key) => {
      let description = logs[key].id.replace('homey:device:', '').replace('homey:manager:apps:', '');

      Object.keys(devices).forEach((id) => {
        if (description.includes(id)) {
          description = description.replace(id, devices[id]?.name ?? 'unknown');
        }
      });

      // @ts-ignore
      const title = logs[key].title;

      return {
        name: title,
        description: description.replaceAll(':', ' - '),
        id: logs[key].id,
        uri: logs[key].uri,
      };
    });

    return results.filter((result) => result.name.toLowerCase().includes(query.toLowerCase()));
  }
}

module.exports = InsightGraphs;
