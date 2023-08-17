import Homey from 'homey';
import {generateId} from "../../src/Utils";
import PairSession from "homey/lib/PairSession";

class ChartDriver extends Homey.Driver {

  async onInit() {
    this.log('MyDriver has been initialized');
  }

  async onPair(session: PairSession) {
    await session.showView("start");

    // Received when a view has changed
    session.setHandler("showView", async function (viewId) {
      console.log("View: " + viewId);
    });
  }

}

module.exports = ChartDriver;
