import Homey, {FlowCard, Image} from 'homey';
import { HomeyAPI, HomeyAPIV3Local } from 'homey-api';
import LogNormaliser, {Log} from './src/LogNormaliser';
import ChartJsImage from "chartjs-to-image";

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
    const chart = new ChartJsImage();

    chart.setConfig({
      type: args.type,
      data: {
        labels: values.map((log) => log.t),
        datasets: [{
          label: `${args.device.name} - ${args.resolution}`,
          data: values.map((log) => log.v),
          borderColor: args.lineColor,
          backgroundColor: `#${this.addAlpha(args.lineColor.replace('#', ''), 0.5)}`,
          fill: true,
          cubicInterpolationMode: 'monotone',
          borderWidth: 2,
          lineTension: 0.4,
          pointRadius: 0
        }]
      },
       options: {
         layout: {
           padding: {
             left: 10,
             right: 30,
             top: 20,
             bottom: 10
           }
         },
         legend: {
           display: false,
         },
         scales: {
           xAxes: [{
             ticks: {
               autoSkip: true,
               maxTicksLimit: 6,
               maxRotation: 0
             },
             gridLines: {
               display: false
             }
           }],
           yAxes: [{
             ticks: {
                autoSkip: true,
                maxTicksLimit: 6,
                beginAtZero: false,
              },
             scaleLabel: {
                display: true,
                labelString: `${args.device.name}`,
              },
              gridLines: {
                display: true,
                borderDash: [4,4],
                color: 'rgba(127,127,127,0.2)'
              }
            }]
         }
       }
    });
    chart.setWidth(500).setHeight(300).setBackgroundColor(args.darkMode ? '#222329' : '#ffffff').setDevicePixelRatio('3.0');

    await chart.toFile('/userdata/temp.png');

    const image = await this.homey.images.createImage();
    image.setPath('/userdata/temp.png');

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
