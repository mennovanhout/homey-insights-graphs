import Homey, {FlowCard, Image} from 'homey';
import { HomeyAPI, HomeyAPIV3Local } from 'homey-api';
import ChartJSImage from "chart.js-image";

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
    this.createGraphActionCard.registerArgumentAutocompleteListener('type', this.autocompleteListener.bind(this));
    this.createGraphActionCard.registerRunListener(this.runListener.bind(this));
  }

  private async runListener(args: any, stats: any): Promise<{graph: Image}> {
    // Get logs
    const logs = await this.insightsManager!.getLogEntries({id: args.type.id, uri: args.type.uri, resolution: args.resolution});

    this.log(logs);

    // Generate images
    // @ts-ignore
    const chart = new ChartJSImage().chart({
      type: "line",
      data: {
        labels: logs.values.map((log: any) => this.formatLabel(log.t, args.resolution)),
        datasets: [
          {
            label: `${args.type.name} - ${args.resolution}`,
            data: logs.values.map((log: any) => log.v),
            backgroundColor: args.backgroundColor,
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
        }
      }
    });

    const image = await this.homey.images.createImage();
    image.setUrl(chart.toURL());

    return {
      graph: image,
    };
  }

  private formatLabel(label: string, resolution: string): string {
    const date = new Date( Date.parse(label));
    let formattedDate = '';

    switch (resolution) {
      default:
      case 'lastHour':
      case 'last6Hours':
      case 'last24Hours':
      case 'yesterday':
      case 'today':
        formattedDate = `${('0'+date.getHours()).slice(-2)}:${('0'+date.getMinutes()).slice(-2)}`;
        break;
      case 'last7Days':
      case 'last14Days':
      case 'last31Days':
      case 'lastMonth':
      case 'thisMonth':
        formattedDate = `${('0'+date.getDate()).slice(-2)}/${('0'+(date.getMonth()+1)).slice(-2)}`;
        break;
      case 'thisWeek':
      case 'lastWeek':
        formattedDate = `${this.dayToWeekday(date.getDay())}`;
        break;
      case 'thisYear':
      case 'lastYear':
      case 'last2Years':
        formattedDate = `${('0'+date.getDate()).slice(-2)}/${('0'+(date.getMonth()+1)).slice(-2)}/${date.getFullYear()}`;
    }

    return formattedDate;
  }

  private dayToWeekday(day: number): string {
    switch (day) {
      case 0:
        return 'Sunday';
      case 1:
        return 'Monday';
      case 2:
        return 'Tuesday';
      case 3:
        return 'Wednesday';
      case 4:
        return 'Thursday';
      case 5:
        return 'Friday';
      case 6:
        return 'Saturday';
      default:
        return '';
    }
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
