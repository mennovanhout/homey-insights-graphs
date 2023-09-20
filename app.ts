import Homey, {FlowCard, Image} from 'homey';
import { HomeyAPI, HomeyAPIV3Local } from 'homey-api';
import LogNormaliser, {Log} from './src/LogNormaliser';
import ChartJsImage from "chartjs-to-image";
import {backgroundColor} from "./src/Utils";

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
    this.createGraphActionCard.registerRunListener(this.runListenerCreateGraph.bind(this));
  }

  private async runListenerCreateGraph(args: any, stats: any): Promise<{graph: Image}> {
    let filename: string = args.filename ?? 'temp.png';

    if (filename.endsWith('.png')) {
      filename = filename + '.png';
    }

    // Get logs
    const logs: Log = await this.insightsManager!.getLogEntries({id: args.device.id, uri: args.device.uri, resolution: args.resolution});
    const logNormaliser = new LogNormaliser(logs, args.resolution, this.homey.clock.getTimezone());
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
          // cubicInterpolationMode: 'monotone',
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
               // autoSkip: true,
               // maxTicksLimit: 6,
               // maxRotation: 0
             },
             gridLines: {
               display: false
             }
           }],
           yAxes: [{
             ticks: {
                // autoSkip: true,
                // maxTicksLimit: 6,
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
    })
        .setWidth(500)
        .setHeight(300)
        .setBackgroundColor(backgroundColor(args.darkModeType))
        .setDevicePixelRatio('3.0');



    await chart.toFile(`/userdata/${filename}`);

    // try to update image
    const imageId = this.homey.settings.get(filename);
    const realImage = await this.getImage(imageId);

    if (realImage) {
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
